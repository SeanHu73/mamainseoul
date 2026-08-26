// Minimal service worker: makes the app installable and keeps the shell fast.
// Map tiles are deliberately NOT cached here — she has data, and a stale tile
// cache is worse than a fresh fetch.
const CACHE = 'mis-v1';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/map.js',
  './js/store.js',
  './js/geo.js',
  './js/i18n.js',
  './js/photo.js',
  './js/admin.js',
  './js/content.js',
  './js/timeline.js',
  './js/quests.js',
  './content/stops.json',
  './content/history.json',
  './content/quests.json',
  './manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Network-first for everything, cache only as the offline fallback.
  //
  // The obvious alternative — cache-first for the app shell — would mean that
  // once she installs this, a redeploy never reaches her: the phone keeps
  // serving the old JS forever. She has data, so freshness is worth more than
  // the few milliseconds cache-first would save.
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
