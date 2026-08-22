import { t, ui, getLang } from './i18n.js';
import * as store from './store.js';
import { allStops } from './content.js';
import { locate, distance } from './geo.js';
import { shrinkToBlob, shrinkToDataUrl, blobUrl } from './photo.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let onChange = () => {};

export function initTimeline(handlers) {
  onChange = handlers.onChange || (() => {});
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
        en: `${ui('tlNear')} ${best.stop.name.en}`,
        zh: `${best.stop.name.zh}${ui('tlNear')}`
      }
    };
  }
  const coords = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
  return { lat: +pos.lat.toFixed(5), lng: +pos.lng.toFixed(5), stopId: null,
           label: { en: coords, zh: coords } };
}

/** Human date: bare years stay bare, full dates get localised. */
function displayDate(date) {
  const s = String(date || '').trim();
  if (/^\d{1,4}$/.test(s)) return s;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) return s;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1)));
  return new Intl.DateTimeFormat(getLang() === 'zh' ? 'zh-TW' : 'en-GB', {
    year: 'numeric', month: 'short', ...(m[3] ? { day: 'numeric' } : {}), timeZone: 'UTC'
  }).format(d);
}

/* ---------------- list view ---------------- */

export async function renderTimeline() {
  const view = $('#view-timeline');
  const entries = store.getTimeline();

  const actions = `
    <div class="tlactions">
      <button class="btn" id="tlAddBtn">＋ ${esc(ui('tlAdd'))}</button>
      <button class="btn" id="tlReadBtn">📷 ${esc(ui('tlRead'))}</button>
    </div>`;

  if (!entries.length) {
    view.innerHTML = actions +
      `<div class="empty"><span class="big">🕰️</span>${esc(ui('tlEmpty'))}</div>`;
    wireActions();
    return;
  }

  const rows = await Promise.all(entries.map(async e => {
    let photo = '';
    if (e.photoKey) {
      const blob = await store.getPhoto(e.photoKey);
      if (blob) photo = `<img class="tlphoto" src="${blobUrl(e.photoKey, blob)}" alt="">`;
    }
    const desc = t(e.description);
    const place = e.place
      ? `<div class="tlplace">📍 ${esc(t(e.place.label))}</div>` : '';
    return `
      <li class="tlrow">
        <div class="tlspine"><span class="tldot ${e.source === 'ai' ? 'ai' : ''}"></span></div>
        <div class="tlcard" data-entry="${e.id}">
          <div class="tldate">${esc(displayDate(e.date))}</div>
          <div class="tltitle">${esc(t(e.title))}</div>
          ${photo}
          ${desc ? `<p class="tldesc">${esc(desc)}</p>` : ''}
          ${place}
        </div>
      </li>`;
  }));

  view.innerHTML = actions +
    `<ul class="tl">${rows.join('')}</ul>
     <button class="btn ghost" id="tlClearBtn" style="margin-top:6px">${esc(ui('tlClear'))}</button>`;

  wireActions();
  for (const card of view.querySelectorAll('[data-entry]')) {
    card.addEventListener('click', () => openForm(card.dataset.entry));
  }
  view.querySelector('#tlClearBtn').addEventListener('click', async () => {
    if (!confirm(ui('tlClearConfirm'))) return;
    await store.clearTimeline();
    renderTimeline();
    onChange();
  });
}

function wireActions() {
  $('#tlAddBtn').addEventListener('click', () => openForm(null));
  $('#tlReadBtn').addEventListener('click', readPlaque);
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
    const title = $('#fTitle').value.trim();
    const desc = $('#fDesc').value.trim();

    if (!title) { alert(ui('tlTitleRequired')); return; }
    if (store.dateSortKey(date) === Number.MAX_SAFE_INTEGER) { alert(ui('tlDateRequired')); return; }

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

    const patch = { date, title: titleObj, description: descObj, place: formPlace, photoKey };
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
      if (!out.readable || !out.events?.length) {
        alert(`${ui('tlUnreadable')}${out.note ? `\n\n${out.note}` : ''}`);
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
            <div class="tldate">${esc(displayDate(e.date))}</div>
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
