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

**Turn it on:** add `?admin=1` to the URL, or tap the app title five times.

Open any stop and you get an editor beneath the normal card:

| What | Notes |
|---|---|
| Names (EN / 中文 / 한국어) | |
| **Coordinates** | Type them, or **📍 Use my location** while standing there, or **🎯 Use map centre** after dragging the map |
| **Check-in radius** | Widen it if a stop turns out to be bigger than expected |
| Hunt task + hint, both languages | |
| **Reference photo** | Attach a picture of the thing she's meant to find — it appears above the hunt text |
| Trivia question, 3 options, correct answer, explanation | |

Edits save to the browser immediately (`localStorage`) so you can keep working.
They are **local to that browser** until you commit them:

1. Tap **⬇️ Export stops.json**
2. Replace `content/stops.json` in this repo with the downloaded file
3. Redeploy
4. Tap **🧹 Clear local edits** so the app reads the committed version again

Reference photos are downscaled to 900 px JPEG and embedded in `stops.json` as
data URIs. That keeps deployment to a single file with no asset pipeline, but
`localStorage` caps out around 5 MB — if you attach a photo to all 16 stops and
saving starts failing, export and commit, then clear local edits.

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
