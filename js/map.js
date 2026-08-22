import { getDays, routeGeoJSON } from './content.js';
import { stopState } from './store.js';

// No API key, no account, no usage cap. Swap this one line for a MapTiler or
// Mapbox style URL if you ever want a different look (or a paid SLA).
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const SEOUL = { center: [126.995, 37.556], zoom: 11.2 };

let map = null;
let markers = [];        // { el, marker, stop, day }
let meMarker = null;
let dayFilter = 0;       // 0 = all
let onStopClick = () => {};

export function initMap(container, handlers) {
  onStopClick = handlers.onStopClick;

  map = new maplibregl.Map({
    container,
    style: STYLE,
    center: SEOUL.center,
    zoom: SEOUL.zoom,
    attributionControl: { compact: true }
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  // Pins are plain DOM and don't need the style, so they go up immediately —
  // on a slow connection she sees her stops before the basemap arrives.
  buildMarkers();
  fitToDay(0);

  map.on('load', () => {
    map.addSource('routes', { type: 'geojson', data: routeGeoJSON() });

    // MapLibre can't drive line-dasharray from feature data, so each travel
    // mode gets its own filtered layer — same idea as the legend on the
    // original paper map.
    const dashes = { metro: null, walk: [1, 1.8], car: [3, 2] };
    for (const [mode, dash] of Object.entries(dashes)) {
      map.addLayer({
        id: `route-${mode}`,
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'mode'], mode],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': 0.75,
          ...(dash ? { 'line-dasharray': dash } : {})
        }
      });
    }
  });

  return map;
}

function buildMarkers() {
  for (const day of getDays()) {
    for (const stop of day.stops) {
      const el = document.createElement('div');
      el.className = 'mk';
      el.style.background = day.color;
      el.style.color = day.color;
      el.addEventListener('click', e => { e.stopPropagation(); onStopClick(stop.id); });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);

      markers.push({ el, marker, stop, day });
    }
  }
  refreshMarkers();
}

/** Re-reads progress and repaints every pin. Cheap — there are only 16. */
export function refreshMarkers() {
  for (const m of markers) {
    const done = !!stopState(m.stop.id).checkedInAt;
    m.el.classList.toggle('done', done);
    m.el.textContent = done ? '✓' : String(m.stop.n);
    m.el.style.background = done ? '#fff' : m.day.color;
    m.el.classList.toggle('dim', dayFilter !== 0 && m.day.day !== dayFilter);
  }
}

export function setDayFilter(day) {
  dayFilter = day;
  for (const layer of ['route-walk', 'route-metro', 'route-car']) {
    if (!map.getLayer(layer)) continue;
    const mode = layer.replace('route-', '');
    map.setFilter(layer, day === 0
      ? ['==', ['get', 'mode'], mode]
      : ['all', ['==', ['get', 'mode'], mode], ['==', ['get', 'day'], day]]);
  }
  refreshMarkers();
  fitToDay(day);
}

function fitToDay(day) {
  const pts = markers
    .filter(m => day === 0 || m.day.day === day)
    .map(m => [m.stop.lng, m.stop.lat]);
  if (!pts.length) return;
  const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
  map.fitBounds(b, { padding: { top: 70, bottom: 90, left: 50, right: 50 }, duration: 600, maxZoom: 15 });
}

export function flyToStop(stop) {
  map.flyTo({ center: [stop.lng, stop.lat], zoom: 15.5, duration: 700 });
}

/** Drops a blue dot where she is, and pans to it. */
export function showMe(pos) {
  if (!meMarker) {
    const el = document.createElement('div');
    el.style.cssText =
      'width:16px;height:16px;border-radius:50%;background:#2563EB;' +
      'border:3px solid #fff;box-shadow:0 0 0 5px rgba(37,99,235,.22);';
    meMarker = new maplibregl.Marker({ element: el });
  }
  meMarker.setLngLat([pos.lng, pos.lat]).addTo(map);
  map.easeTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 14.5), duration: 600 });
}

export function resizeMap() { if (map) map.resize(); }

export function getMapCenter() {
  const c = map.getCenter();
  return { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) };
}

/** Admin: move a pin without a page reload. */
export function moveMarker(stopId, lat, lng) {
  const m = markers.find(x => x.stop.id === stopId);
  if (m) m.marker.setLngLat([lng, lat]);
}
