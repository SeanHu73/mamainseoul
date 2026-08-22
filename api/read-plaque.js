// Reads a photo of a plaque, sign or information board and turns it into one
// or more timeline entries, written in both English and Traditional Chinese.
//
// This runs on Vercel as a serverless function for one reason: the Anthropic
// API key must never reach the browser. Anyone with the site URL could read a
// client-side key out of the page source and spend against it.
//
// Requires ANTHROPIC_API_KEY as a Vercel environment variable.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5';

// Roughly 3 MB of base64, i.e. a ~2 MB image. The client downscales well
// below this; the cap is here so a malformed request can't tie up the function.
const MAX_IMAGE_CHARS = 3_000_000;

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const SYSTEM = `You are helping a traveller in Seoul build a personal history timeline.

She photographs plaques, signs, information boards and museum labels at the
places she visits. Your job is to read what the sign says and turn it into
timeline entries.

Rules:
- Extract every distinct dated event the sign describes. A palace plaque might
  mention a founding, a fire and a reconstruction — that is three entries, not
  one. A sign about a single event is one entry.
- Read Korean, Chinese, Japanese and English signage.
- Write each entry in BOTH English and Traditional Chinese (Taiwan wording,
  not Simplified). Both must say the same thing; neither is a placeholder.
- Titles are short — a headline, ideally under 60 characters.
- Descriptions are one to three sentences of plain, warm prose. No bullet
  points, no markdown.
- Dates use the most precise form the sign supports: YYYY-MM-DD, YYYY-MM, or
  just YYYY. Never invent precision the sign does not give.
- Stay faithful to the sign. You may add a short, well-established piece of
  context about a place the sign names, but never invent dates, names or
  numbers. If you are unsure, leave it out.
- If the photo is not a sign, is too blurry to read, or contains no dated
  event, set readable to false, explain briefly in note, and return an empty
  events array.`;

const TOOL = {
  name: 'record_timeline_events',
  description: 'Record the dated historical event(s) described on the photographed sign.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      readable: {
        type: 'boolean',
        description: 'True if the image is a legible sign describing at least one dated event.'
      },
      note: {
        type: 'string',
        description: 'If readable is false, a short plain-English reason. Otherwise an empty string.'
      },
      events: {
        type: 'array',
        description: 'One entry per distinct dated event. Empty when readable is false.',
        items: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'YYYY-MM-DD, YYYY-MM or YYYY. The most precise form the sign supports.'
            },
            title_en: { type: 'string', description: 'Short English headline.' },
            title_zh: { type: 'string', description: 'Short Traditional Chinese headline.' },
            description_en: { type: 'string', description: 'One to three sentences of English prose.' },
            description_zh: { type: 'string', description: 'The same, in Traditional Chinese.' }
          },
          required: ['date', 'title_en', 'title_zh', 'description_en', 'description_zh'],
          additionalProperties: false
        }
      }
    },
    required: ['readable', 'note', 'events'],
    additionalProperties: false
  }
};

const TRANSLATE_TOOL = {
  name: 'record_translation',
  description: 'Return the supplied title and description in both English and Traditional Chinese.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      title_en: { type: 'string' },
      title_zh: { type: 'string' },
      description_en: { type: 'string' },
      description_zh: { type: 'string' }
    },
    required: ['title_en', 'title_zh', 'description_en', 'description_zh'],
    additionalProperties: false
  }
};

function firstToolInput(response, name) {
  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === name) return block.input;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // The app treats this as "feature switched off" rather than an outage, so
    // the timeline still works fully by hand.
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'bad_json' });
    return;
  }
  if (!body) {
    res.status(400).json({ error: 'empty_body' });
    return;
  }

  const client = new Anthropic();

  try {
    /* ---- translate an entry she typed herself ---- */
    if (body.action === 'translate') {
      const title = String(body.title || '').slice(0, 400);
      const description = String(body.description || '').slice(0, 4000);
      if (!title && !description) {
        res.status(400).json({ error: 'nothing_to_translate' });
        return;
      }

      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system:
          'You translate short travel-diary entries between English and Traditional Chinese ' +
          '(Taiwan wording, never Simplified). Keep the writer\'s voice and keep it brief. ' +
          'Whichever language the input is in, fill in the other; return the original ' +
          'side unchanged. If the description is empty, return it empty in both languages.',
        messages: [{
          role: 'user',
          content: `Title: ${title}\n\nDescription: ${description || '(none)'}`
        }],
        tools: [TRANSLATE_TOOL],
        tool_choice: { type: 'tool', name: 'record_translation' }
      });

      const out = firstToolInput(response, 'record_translation');
      if (!out) {
        res.status(502).json({ error: 'no_result', stop_reason: response.stop_reason });
        return;
      }
      res.status(200).json(out);
      return;
    }

    /* ---- read a plaque ---- */
    const image = body.image;
    const mediaType = body.mediaType || 'image/jpeg';

    if (typeof image !== 'string' || !image) {
      res.status(400).json({ error: 'missing_image' });
      return;
    }
    if (image.length > MAX_IMAGE_CHARS) {
      res.status(413).json({ error: 'image_too_large' });
      return;
    }
    if (!ALLOWED_MEDIA.has(mediaType)) {
      res.status(400).json({ error: 'unsupported_media_type' });
      return;
    }

    // Where she was standing, if known — helps disambiguate a plaque that
    // says "this hall" without naming the palace.
    const place = typeof body.place === 'string' && body.place
      ? `She photographed this at or near: ${body.place}.`
      : 'Her exact location is unknown.';

    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: `${place}\n\nRead this sign and record the event or events it describes.` }
        ]
      }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'record_timeline_events' }
    });

    if (response.stop_reason === 'refusal') {
      res.status(200).json({ readable: false, note: 'Could not process this image.', events: [] });
      return;
    }

    const out = firstToolInput(response, 'record_timeline_events');
    if (!out) {
      res.status(502).json({ error: 'no_result', stop_reason: response.stop_reason });
      return;
    }

    res.status(200).json(out);
  } catch (err) {
    // Distinguish "try again" from "this will never work" so the UI can say
    // something useful instead of a generic failure.
    const status = err?.status ?? 500;
    const retryable = status === 429 || status >= 500;
    console.error('read-plaque failed', status, err?.message);
    res.status(status === 401 ? 503 : 502).json({
      error: status === 401 ? 'not_configured' : 'upstream_error',
      retryable,
      detail: err?.message?.slice(0, 200)
    });
  }
}
