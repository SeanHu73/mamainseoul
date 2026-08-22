import { t, ui, uiIn, getLang } from './i18n.js';
import * as store from './store.js';
import { allStops } from './content.js';
import { locate, distance } from './geo.js';
import { shrinkToBlob, shrinkToDataUrl, blobUrl } from './photo.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let onChange = () => {};
let onFindOnMap = () => {};

export function initTimeline(handlers) {
  onChange = handlers.onChange || (() => {});
  onFindOnMap = handlers.onFindOnMap || (() => {});
  $('#tlScrim').addEventListener('click', closeForm);
  $('#tlSheet .grip').addEventListener('click', closeForm);
}

/* ---------------- helpers ---------------- */

/** Today in Seoul, as YYYY-MM-DD — not the phone's timezone. */
function todayInSeoul() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

/**
 * Turn a raw fix into something readable. "near Gyeongbokgung" beats
 * 37.5796, 126.9770 on a diary entry.
 */
function describePlace(pos) {
  let best = null;
  for (const stop of allStops()) {
    const d = distance(pos, stop);
    if (d <= stop.radius + 250 && (!best || d < best.d)) best = { stop, d };
  }
  if (best) {
    return {
      lat: +pos.lat.toFixed(5),
      lng: +pos.lng.toFixed(5),
      stopId: best.stop.id,
      label: {
        en: `${uiIn('en', 'tlNear')} ${best.stop.name.en}`,
        zh: `${uiIn('zh', 'tlNear')}${best.stop.name.zh}`
      }
    };
  }
  const coords = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
  return { lat: +pos.lat.toFixed(5), lng: +pos.lng.toFixed(5), stopId: null,
           label: { en: coords, zh: coords } };
}

/** Human date: bare years stay bare, BCE gets marked, full dates get localised. */
function displayDate(date) {
  const p = store.parseDate(date);
  if (!p) return String(date || '');

  if (p.year < 0) return ui('tlBce', Math.abs(p.year));
  if (p.month === null) return String(p.year);

  // Intl can't be trusted with years under 1000, and none of the app's dates
  // need month formatting that far back anyway.
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day || 1));
  return new Intl.DateTimeFormat(getLang() === 'zh' ? 'zh-TW' : 'en-GB', {
    year: 'numeric', month: 'short', ...(p.day ? { day: 'numeric' } : {}), timeZone: 'UTC'
  }).format(d);
}

/** How long a period ran, in whole years — only shown when it's meaningful. */
function spanYears(entry) {
  if (!entry.endDate) return null;
  const a = store.parseDate(entry.date);
  const b = store.parseDate(entry.endDate);
  if (!a || !b) return null;
  // No year zero in the historical calendar, so a BCE→CE span is one short.
  let years = b.year - a.year;
  if (a.year < 0 && b.year > 0) years -= 1;
  return years >= 1 ? years : null;
}

/** "1392 – 1897 · 505 years", or just the date for a single moment. */
function dateLine(entry) {
  const start = displayDate(entry.date);
  if (!entry.endDate) return start;
  const years = spanYears(entry);
  const range = `${start} – ${displayDate(entry.endDate)}`;
  return years ? `${range} · ${ui('tlYearsFmt', years)}` : range;
}

/* ---------------- list view ---------------- */

// Vertical distance is a real measure of elapsed time.
//
// The awkward part is dynamic range: this timeline holds both 2333 BCE and a
// cup of tea two days ago — about 4,400 years against 0.005. A single honest
// linear scale either makes the trip invisible or makes the page kilometres
// tall. So distance is exactly proportional up to a ceiling, and past that it
// is compressed and openly labelled as not to scale. Every comparison the eye
// is likely to make stays truthful; the ones that can't be are called out.
const PX_PER_YEAR = 0.5;
const MIN_STEP = 58;     // floor, so tiles never collide when times nearly match
const MAX_STEP = 500;    // beyond this a gap is compressed and marked
const MIN_MARGIN = 14;
const MIN_BAR = 20;      // shortest a period capsule can be and still read
const MAX_BAR = 380;     // longest before the capsule itself is compressed
const BOW = 26;          // how far the spine bulges towards each tile

const DAYS = { 1: 0, 2: 31, 3: 59, 4: 90, 5: 120, 6: 151, 7: 181, 8: 212, 9: 243, 10: 273, 11: 304, 12: 334 };

/** A date as a fractional year, so day-level gaps are measurable too. */
function yearValue(date) {
  const p = store.parseDate(date);
  if (!p) return null;
  const dayOfYear = (DAYS[p.month || 1] || 0) + ((p.day || 1) - 1);
  return p.year + dayOfYear / 365;
}

function startValue(e) { return yearValue(e.date); }
function endValue(e) { return yearValue(e.endDate || e.date); }

/** Whole years between two fractional-year values, allowing for no year zero. */
function yearsBetween(a, b) {
  let years = b - a;
  if (a < 0 && b > 0) years -= 1;
  return years;
}

/**
 * Works out how far apart to draw each pair, and how tall each period capsule
 * should be.
 *
 * The gap is measured between the two entries' start dates. Measuring from
 * the furthest point reached so far was tried first and collapsed the whole
 * scale: the history pack is a chain of overlapping dynasties, so nearly
 * every gap came out as zero and no proportion showed at all. Entries are
 * sorted by start, so start-to-start is never negative.
 */
function layout(entries) {
  let prevStart = null;

  return entries.map(e => {
    const s = startValue(e);
    let gapYears = 0;

    if (prevStart !== null && s !== null) gapYears = Math.max(0, yearsBetween(prevStart, s));
    if (s !== null) prevStart = s;

    const raw = MIN_STEP + gapYears * PX_PER_YEAR;
    const step = Math.min(raw, MAX_STEP);
    const compressed = raw > MAX_STEP;

    const en = endValue(e);

    // Period capsules are drawn on the same scale as the gaps, so a bar and a
    // stretch of spine of equal length mean an equal span of time.
    let bar = null;
    if (e.endDate && s !== null && en !== null) {
      const span = Math.max(0, yearsBetween(s, en));
      const rawBar = span * PX_PER_YEAR;
      bar = {
        height: Math.max(MIN_BAR, Math.min(rawBar, MAX_BAR)),
        compressed: rawBar > MAX_BAR
      };
    }

    return { entry: e, step, gapYears, compressed, bar };
  });
}

export async function renderTimeline() {
  const view = $('#view-timeline');
  const entries = store.getTimeline();

  const actions = `
    <div class="tlactions">
      <button class="btn" id="tlAddBtn">＋ ${esc(ui('tlAdd'))}</button>
      <button class="btn" id="tlReadBtn">📷 ${esc(ui('tlRead'))}</button>
    </div>`;

  const seedBtn = `<button class="btn ghost" id="tlSeedBtn">📜 ${esc(ui('tlSeed'))}</button>`;

  if (!entries.length) {
    view.innerHTML = actions +
      `<div class="empty"><span class="big">🕰️</span>${esc(ui('tlEmpty'))}</div>` + seedBtn;
    wireActions();
    return;
  }

  let side = 'left';
  const rows = await Promise.all(layout(entries).map(async (item, i) => {
    const e = item.entry;
    side = side === 'left' ? 'right' : 'left';

    let photo = '';
    if (e.photoKey) {
      const blob = await store.getPhoto(e.photoKey);
      if (blob) photo = `<img class="tiles" src="${blobUrl(e.photoKey, blob)}" alt="">`;
    }

    const kind = e.source === 'ai' ? 'ai' : e.source === 'history' ? 'history' : '';
    const node = item.bar
      ? `<span class="tlnode tlbar ${kind}${item.bar.compressed ? ' squeezed' : ''}"
               style="height:${Math.round(item.bar.height)}px"></span>`
      : `<span class="tlnode tldot ${kind}"></span>`;

    // A period's capsule is absolutely positioned and deliberately does NOT
    // inflate its row. It runs down beside the spine, overlapping the entries
    // that happened during it — which is exactly what an era should look
    // like, and keeps a long period from distorting the gaps around it.

    // The tile is deliberately spare — date, title, picture. Everything else
    // lives in the card that opens when she taps it.
    return `
      <li class="tlrow ${side}" data-side="${side}"
          data-step="${Math.round(item.step)}"
          data-gap="${Math.round(item.gapYears)}"
          ${item.compressed && i > 0 ? 'data-compressed="1"' : ''}>
        ${node}
        <button class="tltile" data-entry="${e.id}">
          ${photo}
          <span class="tldate">${esc(dateLine(e))}</span>
          <span class="tltitle">${esc(t(e.title))}</span>
        </button>
      </li>`;
  }));

  view.innerHTML = actions + `
    <div class="tlwrap">
      <svg class="tlspine" aria-hidden="true"></svg>
      <div class="tlmarks"></div>
      <ul class="tl">${rows.join('')}</ul>
    </div>
    ${seedBtn}
    <button class="btn ghost" id="tlClearBtn" style="margin-top:8px">${esc(ui('tlClear'))}</button>`;

  wireActions();
  for (const tile of view.querySelectorAll('[data-entry]')) {
    tile.addEventListener('click', () => openDetail(tile.dataset.entry));
  }
  view.querySelector('#tlClearBtn').addEventListener('click', async () => {
    if (!confirm(ui('tlClearConfirm'))) return;
    await store.clearTimeline();
    renderTimeline();
    onChange();
  });

  relayout();
  // Photos change row heights as they decode, which would leave the spine
  // drawn against stale positions and the spacing measured from the wrong
  // heights.
  for (const img of view.querySelectorAll('.tiles')) {
    if (!img.complete) img.addEventListener('load', relayout, { once: true });
  }
}

/**
 * Second pass. Rows are laid out first so their real heights are known, then
 * each margin is set so that node-to-node distance matches the time scale.
 * A tile has physical size, so when two entries are minutes apart the floor
 * wins — that is the one place the scale can't be honoured, and it errs
 * towards legibility.
 */
function applySpacing() {
  const list = document.querySelector('.tl');
  if (!list) return;
  const rows = [...list.children];

  for (let i = 1; i < rows.length; i++) {
    const step = Number(rows[i].dataset.step) || MIN_STEP;
    const prevH = rows[i - 1].getBoundingClientRect().height;
    rows[i - 1].style.marginBottom = `${Math.max(MIN_MARGIN, step - prevH)}px`;
  }
  if (rows.length) rows[rows.length - 1].style.marginBottom = '0px';
}

function relayout() {
  applySpacing();
  drawSpine();
}

/**
 * Draws the spine as a run of bezier segments between the nodes, bowing
 * towards whichever side the next tile sits on. Done in script rather than
 * CSS because the curve has to follow real measured positions — tiles vary
 * in height depending on whether they carry a photo.
 */
function drawSpine() {
  const wrap = document.querySelector('.tlwrap');
  const svg = document.querySelector('.tlspine');
  const list = document.querySelector('.tl');
  if (!wrap || !svg || !list) return;

  const base = list.getBoundingClientRect();
  svg.setAttribute('width', base.width);
  svg.setAttribute('height', base.height);
  svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);

  const items = [...list.children].map(li => {
    const node = li.querySelector('.tlnode');
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return {
      x: r.left - base.left + r.width / 2,
      y: r.top - base.top + r.height / 2,
      side: li.dataset.side === 'right' ? 1 : li.dataset.side === 'left' ? -1 : 0,
      compressed: li.dataset.compressed === '1',
      gap: Number(li.dataset.gap) || 0
    };
  }).filter(Boolean);

  const parts = [];
  const marks = [];
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i];
    const b = items[i + 1];
    const dy = (b.y - a.y) * 0.42;
    // Bow towards the tile we're travelling to, so the line leans into it.
    const bow = (b.side || a.side || 1) * BOW;
    const d = `M ${a.x} ${a.y} C ${a.x + bow} ${a.y + dy}, ${b.x + bow} ${b.y - dy}, ${b.x} ${b.y}`;
    parts.push(`<path d="${d}" class="${b.compressed ? 'skip' : ''}"/>`);

    // Where the scale had to give up, say so on the line itself.
    if (b.compressed) {
      marks.push(`<span class="tlmark" style="top:${(a.y + b.y) / 2}px">
                    ${esc(ui('tlGap', b.gap))}
                  </span>`);
    }
  }
  svg.innerHTML = parts.join('');
  const marksEl = document.querySelector('.tlmarks');
  if (marksEl) marksEl.innerHTML = marks.join('');
}

let spineRedrawTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(spineRedrawTimer);
  spineRedrawTimer = setTimeout(relayout, 120);
});

/* ---------------- detail card ---------------- */

async function openDetail(entryId) {
  const e = store.getTimelineEntry(entryId);
  if (!e) return;

  let photo = '';
  if (e.photoKey) {
    const blob = await store.getPhoto(e.photoKey);
    if (blob) photo = `<img class="tlphoto" src="${blobUrl(e.photoKey, blob)}" alt="">`;
  }

  const desc = t(e.description);
  const body = $('#tlSheetBody');
  body.innerHTML = `
    <div class="tldetail">
      <div class="tldate">${esc(dateLine(e))}</div>
      <h2 class="tlformtitle">${esc(t(e.title))}</h2>
      ${photo}
      ${desc ? `<p class="tldetaildesc">${esc(desc)}</p>` : ''}
      ${e.place ? `<div class="tlplace">📍 ${esc(t(e.place.label))}</div>` : ''}
    </div>

    ${e.place ? `<button class="btn" id="dMap">🗺️ ${esc(ui('tlFindOnMap'))}</button>` : ''}

    <div class="tlformbtns">
      <button class="btn ghost" id="dEdit">${esc(ui('tlEdit'))}</button>
      <button class="btn ghost" id="dClose">${esc(ui('tlClose'))}</button>
    </div>`;

  $('#dClose').addEventListener('click', closeForm);
  $('#dEdit').addEventListener('click', () => openForm(entryId));
  // Nothing to offer when the entry was never pinned, so the button isn't
  // there at all rather than sitting greyed out.
  $('#dMap')?.addEventListener('click', () => {
    closeForm();
    onFindOnMap(e.place.lat, e.place.lng, t(e.title));
  });

  openSheetEl();
}

function wireActions() {
  $('#tlAddBtn').addEventListener('click', () => openForm(null));
  $('#tlReadBtn').addEventListener('click', readPlaque);
  $('#tlSeedBtn')?.addEventListener('click', seedHistory);
}

/* ---------------- the Korean history pack ---------------- */

/**
 * Drops the curated history into her timeline. Idempotent — entries carry a
 * seedId, so tapping it twice adds nothing the second time, and anything she
 * has since deleted stays deleted.
 */
async function seedHistory() {
  const btn = $('#tlSeedBtn');
  btn.disabled = true;
  try {
    const res = await fetch('content/history.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const pack = await res.json();

    const already = new Set(store.getTimeline().map(e => e.seedId).filter(Boolean));
    const fresh = pack.events.filter(e => !already.has(e.seedId));

    for (const e of fresh) {
      store.addTimelineEntry({
        seedId: e.seedId,
        date: e.date,
        endDate: e.endDate || null,
        title: e.title,
        description: e.description,
        source: 'history'
      });
    }

    // Re-render first — it replaces the button, so setting the text before
    // would throw the confirmation away.
    await renderTimeline();
    const after = $('#tlSeedBtn');
    if (after) {
      after.textContent = fresh.length ? ui('tlSeedDone', fresh.length) : ui('tlSeedNone');
      setTimeout(() => { after.textContent = `📜 ${ui('tlSeed')}`; }, 2200);
    }
    onChange();
  } catch {
    btn.textContent = '⚠️';
    setTimeout(() => { btn.textContent = `📜 ${ui('tlSeed')}`; }, 1600);
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- add / edit form ---------------- */

let formPhotoBlob = null;   // pending, not yet written to IndexedDB
let formPlace = null;

function openSheetEl() {
  $('#tlSheet').classList.add('on');
  $('#tlScrim').classList.add('on');
}

export function closeForm() {
  $('#tlSheet').classList.remove('on');
  $('#tlScrim').classList.remove('on');
  formPhotoBlob = null;
  formPlace = null;
}

async function openForm(entryId, prefill = null) {
  const existing = entryId ? store.getTimelineEntry(entryId) : null;
  const lang = getLang();
  const seed = existing || prefill || {};
  formPlace = seed.place || null;
  formPhotoBlob = null;

  const body = $('#tlSheetBody');
  body.innerHTML = `
    <h2 class="tlformtitle">${esc(existing ? ui('tlEdit') : ui('tlAdd'))}</h2>

    <label class="tllabel">${esc(ui('tlDate'))}</label>
    <input class="tlinput" id="fDate" type="text" inputmode="numeric"
           placeholder="2026-08-22" value="${esc(seed.date || todayInSeoul())}">

    <label class="tllabel">${esc(ui('tlEndDate'))}</label>
    <input class="tlinput" id="fEndDate" type="text" inputmode="numeric"
           placeholder="1897" value="${esc(seed.endDate || '')}">

    <label class="tllabel">${esc(ui('tlTitle'))}</label>
    <input class="tlinput" id="fTitle" type="text" value="${esc(t(seed.title) || '')}">

    <label class="tllabel">${esc(ui('tlDescOpt'))}</label>
    <textarea class="tlinput" id="fDesc" rows="4">${esc(t(seed.description) || '')}</textarea>

    <button class="btn ghost small" id="fTranslate" style="margin-top:8px">✨ ${esc(ui('tlTranslate'))}</button>

    <label class="tllabel">${esc(ui('tlPhoto'))}</label>
    <div id="fPhotoZone"></div>

    <label class="tllabel">${esc(ui('tlPlace'))}</label>
    <div class="tlplacerow">
      <span id="fPlaceLabel">${esc(formPlace ? t(formPlace.label) : ui('tlNoPlace'))}</span>
      <button class="btn ghost small" id="fHere">📍 ${esc(ui('tlUseHere'))}</button>
    </div>

    <div class="tlformbtns">
      <button class="btn" id="fSave">${esc(ui('tlSave'))}</button>
      <button class="btn ghost" id="fCancel">${esc(ui('tlCancel'))}</button>
    </div>
    ${existing ? `<button class="btn ghost" id="fDelete" style="margin-top:8px;color:var(--red)">${esc(ui('tlDelete'))}</button>` : ''}`;

  renderFormPhoto(existing);

  $('#fHere').addEventListener('click', async () => {
    const btn = $('#fHere');
    btn.textContent = ui('tlLocating');
    try {
      formPlace = describePlace(await locate());
      $('#fPlaceLabel').textContent = t(formPlace.label);
      btn.textContent = `📍 ${ui('tlUseHere')}`;
    } catch {
      btn.textContent = '⚠️';
      setTimeout(() => { btn.textContent = `📍 ${ui('tlUseHere')}`; }, 1600);
    }
  });

  $('#fTranslate').addEventListener('click', translateForm);
  $('#fCancel').addEventListener('click', closeForm);

  $('#fSave').addEventListener('click', async () => {
    const date = $('#fDate').value.trim();
    const endDate = $('#fEndDate').value.trim();
    const title = $('#fTitle').value.trim();
    const desc = $('#fDesc').value.trim();

    if (!title) { alert(ui('tlTitleRequired')); return; }
    if (!store.isValidDate(date)) { alert(ui('tlDateRequired')); return; }
    if (endDate && !store.isValidDate(endDate)) { alert(ui('tlDateRequired')); return; }
    if (endDate && store.dateSortKey(endDate) < store.dateSortKey(date)) {
      alert(ui('tlEndBeforeStart'));
      return;
    }

    // Typed text lands in the current language; the other side keeps whatever
    // it already had, so an edit in English doesn't wipe the Chinese.
    const other = lang === 'zh' ? 'en' : 'zh';
    const titleObj = { ...(seed.title || {}), [lang]: title };
    const descObj = { ...(seed.description || {}), [lang]: desc };
    // A translation run stashes the other language on the field itself; without
    // this the translated side would be thrown away on save.
    titleObj[other] = $('#fTitle').dataset.other || seed.title?.[other] || '';
    descObj[other] = $('#fDesc').dataset.other || seed.description?.[other] || '';

    let photoKey = existing?.photoKey || seed.photoKey || null;
    if (formPhotoBlob) {
      if (photoKey) await store.deletePhoto(photoKey);
      photoKey = await store.putPhoto(formPhotoBlob);
    }

    const patch = { date, endDate: endDate || null, title: titleObj, description: descObj, place: formPlace, photoKey };
    if (existing) store.updateTimelineEntry(existing.id, patch);
    else store.addTimelineEntry({ ...patch, source: seed.source || 'manual' });

    closeForm();
    renderTimeline();
    onChange();
  });

  $('#fDelete')?.addEventListener('click', async () => {
    if (!confirm(ui('tlDeleteConfirm'))) return;
    await store.removeTimelineEntry(existing.id);
    closeForm();
    renderTimeline();
    onChange();
  });

  openSheetEl();
}

async function renderFormPhoto(existing) {
  const zone = $('#fPhotoZone');
  if (!zone) return;

  let src = null;
  if (formPhotoBlob) src = URL.createObjectURL(formPhotoBlob);
  else if (existing?.photoKey) {
    const blob = await store.getPhoto(existing.photoKey);
    if (blob) src = blobUrl(existing.photoKey, blob);
  }

  zone.innerHTML = src
    ? `<img class="tlphoto" src="${src}" alt=""><button class="btn ghost small" id="fPhotoBtn">🖼️ ${esc(ui('tlPhoto'))}</button>`
    : `<button class="addshot" id="fPhotoBtn">＋<span>${esc(ui('addPhoto'))}</span></button>`;

  $('#fPhotoBtn').addEventListener('click', () => {
    const input = $('#photoInput');
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      formPhotoBlob = await shrinkToBlob(file);
      renderFormPhoto(existing);
    };
    input.click();
  });
}

/* ---------------- AI: fill in the other language ---------------- */

async function translateForm() {
  const btn = $('#fTranslate');
  const title = $('#fTitle').value.trim();
  const desc = $('#fDesc').value.trim();
  if (!title && !desc) return;

  btn.disabled = true;
  btn.textContent = ui('tlTranslating');
  try {
    const res = await fetch('/api/read-plaque', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'translate', title, description: desc })
    });
    if (res.status === 503 || res.status === 404) { alert(ui('tlAiOff')); return; }
    if (!res.ok) { alert(ui('tlAiFail')); return; }

    const out = await res.json();
    const lang = getLang();
    // Show the current language's side; the other is stored on save.
    $('#fTitle').value = lang === 'zh' ? out.title_zh : out.title_en;
    $('#fDesc').value = lang === 'zh' ? out.description_zh : out.description_en;
    $('#fTitle').dataset.other = lang === 'zh' ? out.title_en : out.title_zh;
    $('#fDesc').dataset.other = lang === 'zh' ? out.description_en : out.description_zh;
    btn.textContent = '✓';
  } catch {
    alert(ui('tlAiFail'));
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = `✨ ${ui('tlTranslate')}`; }, 1400);
  }
}

/* ---------------- AI: read a plaque ---------------- */

async function readPlaque() {
  const input = $('#photoInput');
  input.value = '';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    const btn = $('#tlReadBtn');
    btn.disabled = true;
    btn.textContent = `⏳ ${ui('tlReading')}`;

    try {
      // Sent at 1200px — enough to read engraved text, small enough to keep
      // the upload quick on hotel wifi.
      const dataUrl = await shrinkToDataUrl(file, 1200, 0.78);
      const image = dataUrl.split(',')[1];

      let place = '';
      try {
        const p = describePlace(await locate());
        place = p.label.en;
        formPlace = p;
      } catch { /* location is a nicety here, not a requirement */ }

      const res = await fetch('/api/read-plaque', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image, mediaType: 'image/jpeg', place })
      });

      if (res.status === 503 || res.status === 404) { alert(ui('tlAiOff')); return; }
      if (!res.ok) { alert(ui('tlAiFail')); return; }

      const out = await res.json();
      if (!out.events?.length) {
        // Keep this short and human. An earlier version pasted the server's
        // note straight in and filled her screen with raw markup.
        const why = String(out.note || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 140);
        alert(`${ui('tlUnreadable')}${why ? `\n\n${why}` : ''}`);
        return;
      }

      const blob = await shrinkToBlob(file);
      reviewEvents(out.events, blob, formPlace);
    } catch {
      alert(ui('tlAiFail'));
    } finally {
      btn.disabled = false;
      btn.textContent = `📷 ${ui('tlRead')}`;
    }
  };
  input.click();
}

/** Nothing is saved until she has seen it and agreed. */
function reviewEvents(events, photoBlob, place) {
  const body = $('#tlSheetBody');
  const lang = getLang();

  body.innerHTML = `
    <h2 class="tlformtitle">${esc(ui('tlFound', events.length))}</h2>
    <div id="reviewList">
      ${events.map((e, i) => `
        <label class="tlreview">
          <input type="checkbox" data-i="${i}" checked>
          <div>
            <div class="tldate">${esc(dateLine({ date: e.date, endDate: e.endDate }))}</div>
            <div class="tltitle">${esc(lang === 'zh' ? e.title_zh : e.title_en)}</div>
            <p class="tldesc">${esc(lang === 'zh' ? e.description_zh : e.description_en)}</p>
          </div>
        </label>`).join('')}
    </div>
    <div class="tlformbtns">
      <button class="btn" id="rSave">${esc(ui('tlSaveAll'))}</button>
      <button class="btn ghost" id="rCancel">${esc(ui('tlCancel'))}</button>
    </div>`;

  $('#rCancel').addEventListener('click', closeForm);
  $('#rSave').addEventListener('click', async () => {
    const picked = [...body.querySelectorAll('input[type=checkbox]')]
      .filter(c => c.checked).map(c => events[Number(c.dataset.i)]);

    // The photo belongs to the plaque, so it hangs off the first entry it
    // produced rather than being copied onto every one.
    let photoKey = picked.length ? await store.putPhoto(photoBlob) : null;

    for (const e of picked) {
      store.addTimelineEntry({
        date: e.date,
        endDate: e.endDate || null,
        title: { en: e.title_en, zh: e.title_zh },
        description: { en: e.description_en, zh: e.description_zh },
        place: place || null,
        photoKey,
        source: 'ai'
      });
      photoKey = null;
    }

    closeForm();
    renderTimeline();
    onChange();
  });

  openSheetEl();
}
