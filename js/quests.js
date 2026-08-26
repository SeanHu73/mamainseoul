// Themed scavenger hunts.
//
// Each item is a clue and a reveal, and the reveal stays sealed until she
// says she found the thing. That ordering is the whole point: reading the
// story first turns a hunt into a paragraph.
//
// Items are grouped into four themes that run across the whole trip, and some
// carry a callback to an item at an earlier stop — the second time she counts
// roof figures, the app says so.

import { t, ui } from './i18n.js';
import * as store from './store.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let data = { themes: [], stops: {} };
let themeById = new Map();
let huntById = new Map();
let stopOfHunt = new Map();

const K_OVERRIDE = 'mis.quests.content.v1';

export async function loadQuests() {
  const base = await fetch('content/quests.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (!base) return;

  // Admin edits — answer photos especially — live here until exported and
  // committed, exactly like the stops.json override.
  let q = base;
  try {
    const raw = localStorage.getItem(K_OVERRIDE);
    const over = raw ? JSON.parse(raw) : null;
    if (over && over.version === base.version) q = over;
  } catch { /* fall back to the committed file */ }

  data = q;
  themeById = new Map(q.themes.map(th => [th.id, th]));
  huntById = new Map();
  stopOfHunt = new Map();
  for (const [stopId, s] of Object.entries(q.stops)) {
    for (const h of s.hunts) {
      huntById.set(h.id, h);
      stopOfHunt.set(h.id, stopId);
    }
  }
}

export const questsForStop = id => data.stops[id]?.hunts || [];
export const getQuestData = () => data;

export function saveQuestOverride() {
  try {
    localStorage.setItem(K_OVERRIDE, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function clearQuestOverride() {
  localStorage.removeItem(K_OVERRIDE);
}
export const triviaForStop = id => data.stops[id]?.trivia || null;
export const allThemes = () => data.themes;

export function totalHunts() {
  return Object.values(data.stops).reduce((n, s) => n + s.hunts.length, 0);
}

/** How many of a theme's items she has found, out of how many exist. */
export function themeProgress(themeId) {
  let found = 0, total = 0;
  for (const h of huntById.values()) {
    if (h.theme !== themeId) continue;
    total++;
    if (store.huntFound(h.id)) found++;
  }
  return { found, total };
}

/* ---------------- rendering ---------------- */

export function renderQuests(host, stop, stopName, onChange) {
  const hunts = questsForStop(stop.id);
  if (!hunts.length) { host.innerHTML = ''; return; }

  const cards = hunts.map(h => {
    const found = store.huntFound(h.id);
    const theme = themeById.get(h.theme);

    // A callback only earns its place once she has actually done the earlier
    // one — otherwise it is a reference to something that never happened.
    const back = h.callback && store.huntFound(h.callback)
      ? `<div class="qback">↩ ${esc(ui('qCallback', stopName(stopOfHunt.get(h.callback))))}</div>`
      : '';

    return `
      <div class="quest ${found ? 'found' : ''}" data-hunt="${h.id}">
        <div class="qhead">
          <span class="qtheme">${theme ? theme.emoji : '🔎'} ${esc(theme ? t(theme.name) : '')}</span>
          <span class="qtick">${found ? '✓' : ''}</span>
        </div>
        <div class="qtitle">${esc(t(h.title))}</div>
        <p class="qclue">${esc(t(h.clue))}</p>
        <p class="qwhere">📍 ${esc(t(h.where))}</p>
        ${back}
        ${found ? `
          ${h.photo ? `<img class="qphoto" src="${h.photo}" alt="">` : ''}
          <div class="qreveal">${esc(t(h.reveal))}</div>` : ''}
        <button class="btn ${found ? 'ghost' : ''} qfind">
          ${found ? `✓ ${esc(ui('qFound'))}` : esc(ui('qFind'))}
        </button>
      </div>`;
  }).join('');

  host.innerHTML = `
    <div class="card">
      <h3>🔎 ${esc(ui('hunt'))}</h3>
      ${cards}
    </div>`;

  for (const el of host.querySelectorAll('[data-hunt]')) {
    el.querySelector('.qfind').addEventListener('click', e => {
      e.stopPropagation();
      store.toggleHunt(el.dataset.hunt);
      renderQuests(host, stop, stopName, onChange);
      onChange();
    });
  }
}

/** The four theme bars, for the scrapbook. */
export function renderThemeProgress() {
  return data.themes.map(th => {
    const { found, total } = themeProgress(th.id);
    const pct = total ? Math.round((found / total) * 100) : 0;
    return `
      <div class="themerow">
        <span class="tem">${th.emoji}</span>
        <span class="tname">${esc(t(th.name))}</span>
        <span class="tbar"><i style="width:${pct}%"></i></span>
        <span class="tcount">${found}/${total}</span>
      </div>`;
  }).join('');
}
