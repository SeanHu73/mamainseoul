import { t, ui, dayLabel, getLang } from './i18n.js';
import { getDays, getStop, getDayOf, allStops, stopCount } from './content.js';
import * as store from './store.js';
import { locate, withinRadius, formatDistance, naverUrl, kakaoUrl, webMapUrl } from './geo.js';
import { shrinkToBlob, blobUrl } from './photo.js';
import { renderAdminPanel, isAdmin } from './admin.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let openStopId = null;
let onProgressChange = () => {};

export function initUI(handlers) {
  onProgressChange = handlers.onProgressChange || (() => {});

  $('#scrim').addEventListener('click', closeSheet);
  $('#sheet .grip').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
}

/* ---------------- static labels ---------------- */

export function applyStaticText() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = ui(el.dataset.i18n);
  }
  $('#langBtn').textContent = getLang() === 'en' ? '中文' : 'EN';
  document.documentElement.lang = getLang() === 'zh' ? 'zh' : 'en';
}

export function updateProgressPill() {
  const done = allStops().filter(s => store.stopState(s.id).checkedInAt).length;
  $('#progressPill').textContent = `${done} / ${stopCount()}`;
}

/* ---------------- day filter chips ---------------- */

export function renderDayFilter(current, onPick) {
  const box = $('#dayFilter');
  const days = getDays();
  const chips = [{ day: 0, color: '#1F2937', label: ui('all') }]
    .concat(days.map(d => ({ day: d.day, color: d.color, label: dayLabel(d.day) })));

  box.innerHTML = chips.map(c =>
    `<button data-day="${c.day}" aria-pressed="${c.day === current}"
       style="${c.day === current ? `background:${c.color}` : ''}">${esc(c.label)}</button>`
  ).join('');

  for (const b of box.querySelectorAll('button')) {
    b.addEventListener('click', () => onPick(Number(b.dataset.day)));
  }
}

/* ---------------- itinerary list ---------------- */

export function renderList(onStopClick) {
  const view = $('#view-list');
  view.innerHTML = getDays().map(day => {
    const rows = day.stops.map((stop, i) => {
      const s = store.stopState(stop.id);
      const done = !!s.checkedInAt;
      const badge = done
        ? `<span class="badge done" style="color:${day.color}">✓</span>`
        : `<span class="badge" style="background:${day.color}">${stop.n}</span>`;
      const leg = stop.travelToNext && i < day.stops.length - 1
        ? `<div class="leg">${esc(t(stop.travelToNext.label))}</div>` : '';
      return `
        <button class="row" data-stop="${stop.id}">
          ${badge}
          <span class="t" style="color:${day.color}">${esc(stop.time)}</span>
          <span class="nm">${esc(t(stop.name))}<small>${esc(stop.name.ko || '')}</small></span>
          <span class="tick">${done ? '📸' : '›'}</span>
        </button>${leg}`;
    }).join('');

    return `
      <div class="dayblock">
        <div class="dayhead" style="background:${day.color}">
          <span class="dnum">${esc(dayLabel(day.day))}</span>
          <span class="dt">${esc(t(day.title))}</span>
        </div>
        <div class="daybody">${rows}</div>
      </div>`;
  }).join('') + `
    <button class="btn ghost" id="resetBtn" style="margin-top:6px">${esc(ui('reset'))}</button>`;

  for (const b of view.querySelectorAll('[data-stop]')) {
    b.addEventListener('click', () => onStopClick(b.dataset.stop));
  }
  view.querySelector('#resetBtn').addEventListener('click', async () => {
    if (!confirm(ui('resetConfirm'))) return;
    await store.resetProgress();
    onProgressChange();
  });
}

/* ---------------- scrapbook ---------------- */

export async function renderBook() {
  const view = $('#view-book');
  const stops = allStops();
  const visited = stops.filter(s => store.stopState(s.id).checkedInAt);
  const hunts = stops.filter(s => store.stopState(s.id).huntDone).length;
  const right = stops.filter(s => {
    const p = store.stopState(s.id).triviaPick;
    return p !== null && p === s.trivia.answer;
  }).length;

  const stats = `
    <div class="stats">
      <div class="stat"><b>${visited.length}</b><span>${esc(ui('stopsVisited'))}</span></div>
      <div class="stat"><b>${hunts}</b><span>${esc(ui('huntsDone'))}</span></div>
      <div class="stat"><b>${right}</b><span>${esc(ui('triviaRight'))}</span></div>
    </div>`;

  if (!visited.length) {
    view.innerHTML = stats +
      `<div class="empty"><span class="big">📷</span>${esc(ui('bookEmpty'))}</div>`;
    return;
  }

  const cards = await Promise.all(visited.map(async stop => {
    const s = store.stopState(stop.id);
    const day = getDayOf(stop.id);
    let inner = `<div class="ph">${stop.emoji}</div>`;
    if (s.photos.length) {
      const blob = await store.getPhoto(s.photos[0]);
      if (blob) inner = `<div class="ph"><img src="${blobUrl(s.photos[0], blob)}" alt=""></div>`;
    }
    const when = new Date(s.checkedInAt).toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en-GB',
      { day: 'numeric', month: 'short', timeZone: 'Asia/Seoul' });
    return `
      <button class="bookcard" data-stop="${stop.id}">
        ${inner}
        <div class="cap">
          <b>${esc(t(stop.name))}</b>
          <span style="color:${day.color}">${esc(dayLabel(day.day))} · ${esc(when)}</span>
        </div>
      </button>`;
  }));

  view.innerHTML = stats + `<div class="book">${cards.join('')}</div>`;
  for (const b of view.querySelectorAll('[data-stop]')) {
    b.addEventListener('click', () => openSheet(b.dataset.stop));
  }
}

/* ---------------- stop sheet ---------------- */

export function openSheet(stopId) {
  openStopId = stopId;
  renderSheet();
  $('#sheet').classList.add('on');
  $('#scrim').classList.add('on');
}

export function closeSheet() {
  openStopId = null;
  $('#sheet').classList.remove('on');
  $('#scrim').classList.remove('on');
}

export function currentStopId() { return openStopId; }

export async function renderSheet() {
  if (!openStopId) return;
  const stop = getStop(openStopId);
  const day = getDayOf(openStopId);
  const s = store.stopState(stop.id);
  const done = !!s.checkedInAt;
  const body = $('#sheetBody');

  body.innerHTML = `
    <div class="stophead">
      <div class="em">${stop.emoji}</div>
      <div>
        <h2>${esc(t(stop.name))}</h2>
        <div class="alt">${esc(stop.name.ko || '')}</div>
        <div class="meta" style="color:${day.color}">
          ${esc(dayLabel(day.day))} · ${esc(stop.time)}
        </div>
      </div>
    </div>
    <p class="blurb">${esc(t(stop.blurb))}</p>

    <div id="checkinZone"></div>

    <div class="card ${done ? '' : 'locked'}" id="huntCard"></div>
    <div class="card ${done ? '' : 'locked'}" id="triviaCard"></div>

    <div style="display:flex;gap:8px;margin-top:4px">
      <a class="btn ghost" href="${naverUrl(stop, t(stop.name))}">${esc(ui('naver'))}</a>
      <a class="btn ghost" href="${kakaoUrl(stop)}">${esc(ui('kakao'))}</a>
      <a class="btn ghost" href="${webMapUrl(stop)}" target="_blank" rel="noopener">🌐</a>
    </div>

    <div id="adminZone"></div>`;

  renderCheckin(stop);
  renderHunt(stop);
  renderTrivia(stop);
  if (isAdmin()) renderAdminPanel($('#adminZone'), stop, () => { renderSheet(); onProgressChange(); });
}

function renderCheckin(stop) {
  const zone = $('#checkinZone');
  const s = store.stopState(stop.id);

  if (s.checkedInAt) {
    const when = new Date(s.checkedInAt).toLocaleString(getLang() === 'zh' ? 'zh-CN' : 'en-GB',
      { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
    zone.innerHTML = `<div class="checkedin">✓ ${esc(ui('checkedIn'))} · ${esc(when)}</div>`;
    return;
  }

  zone.innerHTML = `
    <button class="btn" id="ciBtn">📍 ${esc(ui('checkIn'))}</button>
    <div class="distnote" id="ciNote"></div>
    <div id="ciFallback"></div>`;

  const btn = $('#ciBtn');
  const note = $('#ciNote');

  const offerManual = () => {
    $('#ciFallback').innerHTML =
      `<button class="btn ghost" id="manualBtn" style="margin-top:8px">${esc(ui('imHere'))}</button>`;
    $('#manualBtn').addEventListener('click', () => {
      store.checkIn(stop.id, 'manual');
      renderSheet();
      onProgressChange();
    });
  };

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = ui('checking');
    note.textContent = '';
    note.className = 'distnote';
    try {
      const here = await locate();
      const { ok, distance } = withinRadius(here, stop);
      if (ok) {
        store.checkIn(stop.id, 'gps');
        renderSheet();
        onProgressChange();
        return;
      }
      note.textContent = ui('away', formatDistance(distance));
      note.className = 'distnote warn';
      offerManual();
    } catch (err) {
      note.textContent = err.code === 1 ? ui('geoDenied') : ui('geoFail');
      note.className = 'distnote warn';
      offerManual();
    } finally {
      btn.disabled = false;
      btn.textContent = `📍 ${ui('checkIn')}`;
    }
  });
}

function renderHunt(stop) {
  const card = $('#huntCard');
  const s = store.stopState(stop.id);
  const locked = !s.checkedInAt;

  if (locked) {
    card.innerHTML = `<h3>🔍 ${esc(ui('hunt'))}</h3><p>🔒 ${esc(ui('lockedHunt'))}</p>`;
    return;
  }

  const ref = stop.hunt.photo
    ? `<img class="refphoto" src="${stop.hunt.photo}" alt="">` : '';

  card.innerHTML = `
    <h3>🔍 ${esc(ui('hunt'))}</h3>
    ${ref}
    <p>${esc(t(stop.hunt.task))}</p>
    ${t(stop.hunt.hint) ? `
      <button class="btn ghost small" id="hintBtn" style="margin-top:9px">💡 ${esc(ui('showHint'))}</button>
      <div class="hint" id="hintBox" hidden>${esc(t(stop.hunt.hint))}</div>` : ''}
    <button class="btn ${s.huntDone ? 'ghost' : ''}" id="foundBtn" style="margin-top:11px">
      ${s.huntDone ? `✓ ${esc(ui('foundDone'))}` : esc(ui('found'))}
    </button>
    <h3 style="margin-top:15px">📷 ${esc(ui('photos'))}</h3>
    <div class="shots" id="shots"></div>`;

  card.querySelector('#hintBtn')?.addEventListener('click', e => {
    const box = card.querySelector('#hintBox');
    box.hidden = !box.hidden;
    e.currentTarget.hidden = !box.hidden;
  });

  card.querySelector('#foundBtn').addEventListener('click', () => {
    store.setHuntDone(stop.id, !s.huntDone);
    renderSheet();
    onProgressChange();
  });

  renderShots(stop);
}

async function renderShots(stop) {
  const box = $('#shots');
  if (!box) return;
  const s = store.stopState(stop.id);

  const thumbs = await Promise.all(s.photos.map(async key => {
    const blob = await store.getPhoto(key);
    if (!blob) return '';
    return `<div class="shot">
      <img src="${blobUrl(key, blob)}" alt="">
      <button data-del="${key}" aria-label="delete">✕</button>
    </div>`;
  }));

  box.innerHTML = thumbs.join('') +
    `<button class="addshot" id="addShot">＋<span>${esc(ui('addPhoto'))}</span></button>`;

  box.querySelector('#addShot').addEventListener('click', () => {
    const input = $('#photoInput');
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const blob = await shrinkToBlob(file);
      const key = await store.putPhoto(blob);
      store.addPhotoKey(stop.id, key);
      renderShots(stop);
      onProgressChange();
    };
    input.click();
  });

  for (const b of box.querySelectorAll('[data-del]')) {
    b.addEventListener('click', async () => {
      await store.removePhotoKey(stop.id, b.dataset.del);
      renderShots(stop);
      onProgressChange();
    });
  }
}

function renderTrivia(stop) {
  const card = $('#triviaCard');
  const s = store.stopState(stop.id);

  if (!s.checkedInAt) {
    card.innerHTML = `<h3>💡 ${esc(ui('trivia'))}</h3><p>🔒 ${esc(ui('lockedTrivia'))}</p>`;
    return;
  }

  const answered = s.triviaPick !== null;
  const opts = stop.trivia.options.map((o, i) => {
    let cls = 'opt';
    if (answered) {
      if (i === stop.trivia.answer) cls += ' right';
      else if (i === s.triviaPick) cls += ' wrong';
    }
    return `<button class="${cls}" data-opt="${i}" ${answered ? 'disabled' : ''}>
      <span class="k">${String.fromCharCode(65 + i)}</span><span>${esc(t(o))}</span>
    </button>`;
  }).join('');

  const verdict = answered
    ? `<div class="explain"><b>${s.triviaPick === stop.trivia.answer
        ? '✓ ' + esc(ui('correct')) : '✗ ' + esc(ui('notQuite'))}</b><br>${esc(t(stop.trivia.explain))}</div>`
    : '';

  card.innerHTML = `
    <h3>💡 ${esc(ui('trivia'))}</h3>
    <p>${esc(t(stop.trivia.q))}</p>
    <div class="opts">${opts}</div>
    ${verdict}`;

  for (const b of card.querySelectorAll('[data-opt]')) {
    b.addEventListener('click', () => {
      store.setTriviaPick(stop.id, Number(b.dataset.opt));
      renderSheet();
      onProgressChange();
    });
  }
}
