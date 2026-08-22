// Reads a photo of a plaque, sign or information board and turns it into one
// or more timeline entries, written in both English and Traditional Chinese.
//
// This runs on Vercel as a serverless function for one reason: the Anthropic
// API key must never reach the browser. Anyone with the site URL could read a
// client-side key out of the page source and spend against it.
//
// Requires ANTHROPIC_API_KEY as a Vercel environment variable.

import Anthropic from '@anthropic-ai/sdk';
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';

const MODEL = 'claude-opus-5';

// Roughly 3 MB of base64, i.e. a ~2 MB image. The client downscales well
// below this; the cap is here so a malformed request can't tie up the function.
const MAX_IMAGE_CHARS = 3_000_000;

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const SYSTEM = `You are helping a traveller build a personal history timeline.

She photographs plaques, signs, information boards and museum labels at the
places she visits. Your job is to read what the sign says and turn it into
timeline entries.

Rules:
- Extract every distinct dated event the sign describes. A palace plaque might
  mention a founding, a fire and a reconstruction — that is three entries, not
  one. A sign about a single event is one entry.
- Read signage in any language, including Korean, Chinese, Japanese and English.
- Write each entry in BOTH English and Traditional Chinese (Taiwan wording,
  not Simplified). Both must say the same thing; neither is a placeholder.
- Titles are short — a headline, ideally under 60 characters.
- Descriptions are one to three sentences of plain, warm prose. No bullet
  points, no markdown.
- date uses the most precise form the sign supports: YYYY-MM-DD, YYYY-MM, or
  just YYYY. Use a leading minus for BCE, e.g. -2333. Never invent precision
  the sign does not give.
- If the event covers a span of time rather than a moment — a dynasty, a war,
  a construction that ran for years — also set endDate in the same format.
  Leave endDate as an empty string for a single moment.
- Stay faithful to the sign. You may add a short, well-established piece of
  context about a place the sign names, but never invent dates, names or
  numbers. If you are unsure, leave it out.
- If the photo is not a sign, is too blurry to read, or contains no dated
  event, return an empty events array and put a short plain-English reason in
  note. Otherwise leave note as an empty string.`;

const EVENTS_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      description: 'One entry per distinct dated event. Empty if nothing could be read.',
      items: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'YYYY-MM-DD, YYYY-MM, YYYY, or -YYYY for BCE.'
          },
          endDate: {
            type: 'string',
            description: 'Same format. Set only for a span of time; empty string for a moment.'
          },
          title_en: { type: 'string', description: 'Short English headline.' },
          title_zh: { type: 'string', description: 'Short Traditional Chinese headline.' },
          description_en: { type: 'string', description: 'One to three sentences of English prose.' },
          description_zh: { type: 'string', description: 'The same, in Traditional Chinese.' }
        },
        required: ['date', 'endDate', 'title_en', 'title_zh', 'description_en', 'description_zh'],
        additionalProperties: false
      }
    },
    note: {
      type: 'string',
      description: 'Short plain-English reason when events is empty. Otherwise an empty string.'
    }
  },
  required: ['events', 'note'],
  additionalProperties: false
};

const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    title_en: { type: 'string' },
    title_zh: { type: 'string' },
    description_en: { type: 'string' },
    description_zh: { type: 'string' }
  },
  required: ['title_en', 'title_zh', 'description_en', 'description_zh'],
  additionalProperties: false
};

/**
 * Last-ditch recovery.
 *
 * A previous version of this asked for the data through a tool call, and the
 * model occasionally serialised it badly — the events ended up as literal
 * text inside another field, so a perfectly good reading of the sign was
 * thrown away. Structured outputs make that far less likely, but when the
 * answer is visibly present in the response it should never be discarded.
 */
function salvage(response) {
  const text = (response.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');
  if (!text) return null;

  // Prefer a complete JSON object, then a bare array of events.
  for (const re of [/\{[\s\S]*\}/, /\[[\s\S]*\]/]) {
    const m = re.exec(text);
    if (!m) continue;
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) return { events: parsed, note: '' };
      if (Array.isArray(parsed?.events)) return { events: parsed.events, note: parsed.note || '' };
    } catch { /* not JSON after all */ }
  }
  return null;
}

/** Drop anything that didn't survive as a usable entry. */
function cleanEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter(e => e && typeof e.date === 'string' && /^-?\d{1,4}(-\d{2}(-\d{2})?)?$/.test(e.date.trim()))
    .map(e => ({
      date: e.date.trim(),
      endDate: typeof e.endDate === 'string' && e.endDate.trim() ? e.endDate.trim() : null,
      title_en: String(e.title_en || '').trim(),
      title_zh: String(e.title_zh || '').trim(),
      description_en: String(e.description_en || '').trim(),
      description_zh: String(e.description_zh || '').trim()
    }))
    .filter(e => e.title_en || e.title_zh);
}

/** Never let internal markup reach a dialog on her phone. */
function tidyNote(note) {
  return String(note || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
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

      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: 'low',
          format: betaJSONSchemaOutputFormat(TRANSLATION_SCHEMA)
        },
        system:
          'You translate short travel-diary entries between English and Traditional Chinese ' +
          "(Taiwan wording, never Simplified). Keep the writer's voice and keep it brief. " +
          'Whichever language the input is in, fill in the other; return the original ' +
          'side unchanged. If the description is empty, return it empty in both languages.',
        messages: [{
          role: 'user',
          content: `Title: ${title}\n\nDescription: ${description || '(none)'}`
        }]
      });

      const out = response.parsed_output || salvage(response);
      if (!out) {
        res.status(502).json({
          error: 'no_result',
          stop_reason: response.stop_reason,
          raw: responseText(response).slice(0, 400)
        });
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
    // says "this hall" without naming the building.
    const place = typeof body.place === 'string' && body.place
      ? `She photographed this at or near: ${body.place}.`
      : 'Her exact location is unknown.';

    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: betaJSONSchemaOutputFormat(EVENTS_SCHEMA)
      },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: `${place}\n\nRead this sign and record the event or events it describes.` }
        ]
      }]
    });

    if (response.stop_reason === 'refusal') {
      res.status(200).json({ events: [], note: 'Could not process this image.' });
      return;
    }

    const out = response.parsed_output || salvage(response);
    if (!out) {
      res.status(502).json({
        error: 'no_result',
        stop_reason: response.stop_reason,
        raw: responseText(response).slice(0, 400)
      });
      return;
    }

    const events = cleanEvents(out.events);
    res.status(200).json({
      events,
      note: events.length ? '' : tidyNote(out.note) || 'No dated event on that sign.'
    });
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
