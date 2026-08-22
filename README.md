# Mama in Seoul

A mobile web app for a 3-day Seoul itinerary. She opens it, sees the route on a
map, checks in at each stop, and each check-in unlocks a scavenger hunt and a
piece of trivia. Photos she takes along the way collect into a scrapbook.

Built from `docs/seoul-3-day-itinerary-english.html`.

- **16 stops** across 3 days
- **No backend, no login, no accounts.** Everything lives on her phone.
- **Bilingual** — English / 中文 toggle, with Korean place names always shown
  (useful for pointing at a taxi driver's screen)
- **Installable** — "Add to Home Screen" and it behaves like an app

## Running it locally

The app fetches `content/stops.json`, so opening `index.html` from the file
system will not work. Serve the folder:

```bash
npx -y serve -l 5173 .
```

Then open <http://localhost:5173>.

## Deploying

It is a static site — any host works. Drag the folder onto
[Netlify Drop](https://app.netlify.com/drop), or:

```bash
npx -y vercel deploy --prod
```

**Do not set `cleanUrls: true` in `vercel.json`.** It makes Vercel rename
`index.html` to `index` in the output and then redirect `/index` → `/`, which
nothing serves — the whole site 404s at the root while CSS and JS still load
fine, which is a confusing way to fail. `vercel.json` here pins it to `false`.

If a deploy misbehaves, delete the cached build first — `vercel` will happily
reuse a stale `.vercel/output` and ignore your config edits:

```bash
rm -rf .vercel
```

**HTTPS is required.** Browsers only expose geolocation on secure origins, so
check-in will silently fail over plain `http://`. Every host above gives you
HTTPS by default.

Send her the URL and tell her to tap Share → Add to Home Screen.

## How check-in works

On tapping *Check in*, the app reads GPS and compares it to the stop's
coordinates. She's counted as present if she's within that stop's `radius`,
plus an allowance for however inaccurate her GPS reports itself to be (capped
at 150 m).

Radii are per-stop and sized to each place's real footprint, not a uniform
default — Seoul Forest is a 700 m circle, Leeum is 250 m. All 16 were checked
against OpenStreetMap; each stop's OSM anchor point falls inside its own
circle.

If GPS still refuses to cooperate — indoors at COEX, say, or underground — she
gets an **"I'm here anyway"** button. A slightly cheatable game beats a mother
locked out of her own trip.

## Admin mode

For reviewing and correcting the content before she leaves, or on the ground.

**Turn it on:** tap the app title five times. From the second tap a small
counter appears so you can see it registering. Or add `?admin=1` to the URL.

Admin mode sticks across reloads until you tap **Exit** in the black bar, so
it survives the page refreshes that editing involves — and works inside the
installed app, where there is no address bar to put `?admin=1` into.

Open any stop and you get an editor beneath the normal card:

| What | Notes |
|---|---|
| Names (EN / 中文 / 한국어) | |
| **Coordinates** | Type them, or **📍 Use my location** while standing there, or **🎯 Use map centre** after dragging the map |
| **Check-in radius** | Widen it if a stop turns out to be bigger than expected |
| Hunt task + hint, both languages | |
| **Thumbnail** | Replaces the emoji tile — shows in the stop's header and as its scrapbook card until she takes her own photo |
| **Reference photo** | Attach a picture of the thing she's meant to find — it appears above the hunt text, after check-in |
| Trivia question, 3 options, correct answer, explanation | |

Edits save to the browser immediately (`localStorage`) so you can keep working.
They are **local to that browser** until you commit them:

1. Tap **⬇️ Export stops.json**
2. Replace `content/stops.json` in this repo with the downloaded file
3. Redeploy
4. Tap **🧹 Clear local edits** so the app reads the committed version again

Both image slots are embedded in `stops.json` as data URIs — thumbnails at
600 px, reference photos at 900 px. That keeps deployment to a single file with
no asset pipeline, but `localStorage` caps out around 5 MB. Filling both slots
on all 16 stops will get close to that, so export and commit as you go rather
than doing every stop in one sitting; if saving ever fails you'll get a warning
telling you to export before you lose anything.

The two images are different jobs. The **thumbnail** identifies the place and
is always visible. The **reference photo** is a hint for the hunt and stays
hidden until she checks in.

## Timeline

A fourth tab: a vertical, top-down timeline she builds as she goes.

Entries alternate either side of a curving spine that runs down the middle.
The spine is an SVG drawn in script from measured node positions, because the
curve has to follow real layout — tiles differ in height depending on whether
they carry a photo. Each segment bows towards the tile it is travelling to,
and since sides alternate, the result serpentines. It redraws on resize and
after photos decode.

**Vertical distance is proportional to elapsed time**, at 0.5 px per year
between entries' start dates. 250 years draws as 183 px, 146 years as 129 px,
51 years as 88 px.

Two limits keep that honest rather than absurd, since this timeline holds both
2333 BCE and a cup of tea two days ago:

- **A floor.** Tiles have physical size, so entries closer than about a
  century sit at a minimum step. This is the one place the scale can't be
  honoured, and it errs towards legibility.
- **A ceiling.** Past 500 px a gap is compressed and labelled on the line
  itself — *"2,276 years · not to scale"* — so a shortened stretch is never
  mistaken for a short one.

An earlier attempt measured each gap from the furthest point reached so far,
to stop small events inside a long dynasty reading as a jump backwards. It
collapsed the whole scale: the history pack is a chain of overlapping
dynasties, so nearly every gap came out as zero and no proportion showed at
all. Gaps are now measured start-to-start, which is never negative because
entries are sorted by start.

**Period ribbons use the same scale**, so a ribbon and a stretch of spine of
equal length mean an equal span of time — Joseon's 505 years draw as 253 px
against Unified Silla's 267 years at 134 px. A ribbon too long to draw at
scale is dashed.

Ribbons are drawn in the SVG, not as boxes, so they follow the spine's curve:
the spine is sampled densely, the samples between the era's start and end are
offset sideways at a damped amplitude, and both endpoints are anchored exactly
so a short era isn't drawn short. Being in the SVG they take no space in the
flow, so an era runs down alongside the events that happened during it instead
of pushing them apart. Before that, a 2-year gap rendered larger than a
250-year one because a long capsule inflated its own row.

The spine and ribbons are redrawn by a `ResizeObserver` on the container.
Because its callbacks ride the browser's rendering steps and never arrive in
a throttled or non-compositing tab, `resize`, `orientationchange` and
`visibilitychange` are wired as plain-event fallbacks.

Tiles carry only a date, a title and a photo. Tapping one opens a card with
the full description, the photo at size, and a **Find on map** button that
switches to the map and drops a pin where the entry was recorded. Entries
with no location simply don't get the button — there is nothing to offer, so
there is nothing to grey out.

Entries carry a date, a title, an optional description, an optional photo and
an optional location. Tapping **Use where I am** resolves her GPS to a place
name — "near Bukchon Hanok Village" rather than a pair of coordinates — by
matching against the 16 itinerary stops.

Dates are stored as partial ISO strings, so `1395`, `1867-11`, `2026-08-22`
and `-2333` (2333 BCE) all sort correctly against each other. That is the point of the feature: a
plaque she photographs at Gyeongbokgung lands in 1395, her lunch lands today,
and the whole thing reads as one history ending with her own trip. Entries she
adds by hand get a navy dot; ones read from a sign get a green one.

### Periods, not just moments

An entry can carry an **end date**, which makes it a span rather than a point.
Periods are drawn as a capsule running the height of their card instead of a
dot on the line, and the date reads `1392 – 1897 · 505 years`. The year count
is omitted for anything under a year, and BCE→CE spans account for there being
no year zero.

Marker colours: navy for her own entries, green for ones read off a plaque,
orange for the history pack.

### The Korean history pack

**📜 Add Korean history** drops 18 curated events into the timeline, in both
languages — Gojoseon through Gangnam Style, weighted towards what she will
actually stand in front of. Ten of them are periods.

It is idempotent: entries carry a `seedId`, so tapping it twice adds nothing
the second time, and anything she deletes stays deleted. The content lives in
`content/history.json` and is edited like any other content file.

The point of mixing it with her own entries is that the timeline becomes one
continuous history — Gyeongbokgung burning in 1592, her lunch in Ikseon-dong,
her flight home — rather than two separate lists.

### Reading a plaque

**📷 Read a plaque** photographs a sign and turns it into timeline entries,
written in both English and Traditional Chinese. A palace board describing a
founding, a fire and a reconstruction becomes three entries, not one. Nothing
is saved until she has reviewed the results and ticked the ones she wants.

**✨ Fill in the other language** does the same for an entry she typed herself.

This is the one part of the app with a server component, and it is not
optional: the Anthropic API key must never reach the browser, because anyone
loading the page could read it out of the source and spend against it. So it
runs as a Vercel serverless function in `api/read-plaque.js`.

**To switch it on**, add an `ANTHROPIC_API_KEY` environment variable in the
Vercel project settings (see `.env.example`), then redeploy. Without it the
function returns 503 and the app says the feature is not switched on — the
timeline still works fully by hand. It is also unavailable when running
locally with a plain static server, which does not execute functions; use
`npx vercel dev` if you want to exercise it locally.

Model: `claude-opus-5`, with server-side refusal fallbacks enabled and the
response constrained by **structured outputs** (`output_config.format` with a
JSON schema), so it comes back as a validated object rather than free text.

This was originally built on a strict tool call, which failed in a way worth
recording: the model read a plaque correctly, then serialised the tool call
badly — the events ended up as literal text inside another field, and a good
reading was thrown away. Structured outputs constrain the response format
directly, which is the right mechanism for extraction; tool use is for calling
tools. A `salvage()` fallback also scrapes JSON out of the response text if
parsing ever fails again, because the one thing this must not do is discard an
answer that is visibly present.

Plaque events can carry an `endDate`, so a sign describing a construction that
ran from 1930 to 1931 becomes a period on the timeline rather than a point.

## Layout

```
index.html              app shell
css/app.css
content/stops.json      ALL content — stops, coords, hunts, trivia. Edit this.
js/
  app.js                wiring, view switching
  content.js            loads stops.json, applies admin overrides
  map.js                MapLibre: markers, route lines, day filter
  ui.js                 itinerary list, stop sheet, scrapbook
  store.js              progress (localStorage) + photos (IndexedDB)
  geo.js                distance maths, check-in rule, Naver/Kakao deep links
  photo.js              image downscaling
  i18n.js               EN/ZH strings
  admin.js              the editor described above
  timeline.js           the timeline tab, plaque reading, entry form
api/
  read-plaque.js        serverless function — the only server-side code
sw.js                   service worker (makes it installable)
docs/                   the original ChatGPT itinerary, for reference
```

## Choices worth knowing about

**MapLibre GL JS, not Mapbox.** Identical API, BSD-licensed, and no access
token to embed in client code. Tiles come from
[OpenFreeMap](https://openfreemap.org) — no key, no quota. To switch providers,
change the one `STYLE` constant at the top of `js/map.js`.

**Navigation hands off to Korean apps.** South Korea restricts export of
detailed map data, so Google and Mapbox both have degraded routing inside the
country. The map is fine for showing pins and the route shape, but each stop
links out to **Naver Map** and **Kakao Map**, which is what actually works
there. There's a web fallback link too.

**Trivia records only her first answer.** Retrying is free and doesn't change
the score, so the scrapbook count means something.

**No offline map tiles.** Built on the assumption she'll have data. If that
changes, the fix is bundling Seoul as a [PMTiles](https://protomaps.com) file
and pointing the style at it — a contained change to `js/map.js` plus caching
the file in `sw.js`.

## Resetting

Bottom of the Itinerary tab: **Reset all progress**. Clears every check-in,
answer and photo. Worth doing once after you finish testing, so she starts on
a clean board.
