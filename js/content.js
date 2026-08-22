import { readOverride } from './store.js';

let content = null;
let index = new Map();   // stop id -> { stop, day }

/**
 * Loads content/stops.json, then lets any admin edits held in localStorage
 * win over it. Exporting from admin mode writes those edits back into the
 * file so they become the real content on the next deploy.
 */
export async function loadContent() {
  const res = await fetch('content/stops.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`stops.json: ${res.status}`);
  const base = await res.json();
  const override = readOverride();
  content = override && override.version === base.version ? override : base;
  reindex();
  return content;
}

export function setContent(next) {
  content = next;
  reindex();
}

function reindex() {
  index = new Map();
  for (const day of content.days) {
    for (const stop of day.stops) index.set(stop.id, { stop, day });
  }
}

export function getContent() { return content; }
export function getDays() { return content.days; }
export function getStop(id) { return index.get(id)?.stop || null; }
export function getDayOf(id) { return index.get(id)?.day || null; }
export function allStops() { return [...index.values()].map(v => v.stop); }
export function stopCount() { return index.size; }

/** Route segments as GeoJSON, one feature per leg, tagged with its travel mode. */
export function routeGeoJSON() {
  const features = [];
  for (const day of content.days) {
    for (let i = 0; i < day.stops.length - 1; i++) {
      const a = day.stops[i];
      const b = day.stops[i + 1];
      if (!a.travelToNext) continue;
      features.push({
        type: 'Feature',
        properties: { day: day.day, color: day.color, mode: a.travelToNext.mode },
        geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
