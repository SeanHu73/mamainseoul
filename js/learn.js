// Architectural details that repeat across the places she visits, tracked so
// the count carries from stop to stop.

import { t, ui } from './i18n.js';
import * as store from './store.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let motifs = { motifs: [] };

export async function loadLearn() {
  const m = await fetch('content/motifs.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (m) motifs = m;
}

export const motifsForStop = stopId => motifs.motifs.filter(m => m.stops.includes(stopId));
export const allMotifs = () => motifs.motifs;

export function motifsSpotted() {
  return motifs.motifs.filter(m => store.motifCount(m.id) > 0).length;
}

/* ---------------- recurring motifs ---------------- */

export function renderMotifs(host, stop, onChange) {
  const here = motifsForStop(stop.id);
  if (!here.length) { host.innerHTML = ''; return; }

  const rows = here.map(m => {
    const found = !!store.motifState(m.id).stops[stop.id];
    const count = store.motifCount(m.id);
    const total = m.stops.length;
    // The count is the point: the third sighting is when it stops being a
    // hunt and starts being recognition.
    return `
      <div class="motif ${found ? 'found' : ''}" data-motif="${m.id}">
        <div class="mhead">
          <span class="mem">${m.emoji}</span>
          <span class="mname">${esc(t(m.name))}<small>${esc(m.name.ko)}</small></span>
          <span class="mcount">${count}/${total}</span>
          <span class="mtick">${found ? '✓' : '＋'}</span>
        </div>
        <p class="mwhat">${esc(t(m.what))}</p>
        <p class="mlook">👁 ${esc(t(m.look))}</p>
      </div>`;
  }).join('');

  host.innerHTML = `
    <div class="card learn">
      <h3>🔎 ${esc(ui('lnMotifs'))}</h3>
      ${rows}
    </div>`;

  for (const el of host.querySelectorAll('[data-motif]')) {
    el.addEventListener('click', () => {
      store.toggleMotif(el.dataset.motif, stop.id);
      renderMotifs(host, stop, onChange);
      onChange();
    });
  }
}
