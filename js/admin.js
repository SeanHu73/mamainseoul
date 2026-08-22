// Admin mode: edit the content in place on a phone, standing at the actual
// stop, then export a corrected stops.json to commit back into the repo.
//
// Turn on with ?admin=1 in the URL, or by tapping the app title five times.

import { getContent, setContent } from './content.js';
import { writeOverride, clearOverride } from './store.js';
import { locate } from './geo.js';
import { shrinkToDataUrl } from './photo.js';
import { moveMarker, getMapCenter } from './map.js';

let admin = false;
let onExitAdmin = () => {};

const K_ADMIN = 'mis.admin';

export function isAdmin() { return admin; }

export function initAdmin(handlers) {
  onExitAdmin = handlers.onChange;

  // Sticky across reloads. Without this, ?admin=1 evaporates the moment the
  // page reloads — and inside an installed PWA the query string is gone
  // entirely, so the URL route alone was never enough on a phone.
  if (new URLSearchParams(location.search).get('admin') === '1' ||
      localStorage.getItem(K_ADMIN) === '1') {
    enter();
  }

  // Five taps on the title. On a phone, repeated taps on text select the
  // word instead of counting, so the target is user-select:none and we
  // listen on pointerdown — click can be swallowed or delayed on touch.
  let taps = 0, timer = null;
  const brand = document.querySelector('#brand');
  const onTap = e => {
    if (admin) return;
    e.preventDefault();
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; hideToast(); }, 2500);
    const left = 5 - taps;
    if (left <= 0) {
      taps = 0;
      hideToast();
      enter();
    } else if (taps >= 2) {
      // Silent counting feels broken on a phone. Show progress once it is
      // clear this is deliberate rather than a stray tap.
      toast(left === 1 ? '1 more tap' : `${left} more taps`);
    }
  };
  brand.addEventListener('pointerdown', onTap);

  document.querySelector('#admOff').addEventListener('click', () => {
    admin = false;
    localStorage.removeItem(K_ADMIN);
    document.querySelector('#adminbar').hidden = true;
    onExitAdmin();
  });

  document.querySelector('#admExport').addEventListener('click', exportJSON);
}

function enter() {
  admin = true;
  localStorage.setItem(K_ADMIN, '1');
  document.querySelector('#adminbar').hidden = false;
  onExitAdmin();
}

/* ---------------- tap feedback ---------------- */

let toastEl = null;

function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.append(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('on');
}

function hideToast() {
  toastEl?.classList.remove('on');
}

/* ---------------- export ---------------- */

function exportJSON() {
  const json = JSON.stringify(getContent(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stops.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);

  const kb = Math.round(json.length / 1024);
  alert(`Exported stops.json (${kb} KB).\n\nReplace content/stops.json in the repo with this file and redeploy. Then use "Clear local edits" so the app reads the committed version.`);
}

function persist() {
  const res = writeOverride(getContent());
  if (!res.ok) {
    alert('Could not save locally — browser storage is full.\n\n' +
      'This is almost always too many reference photos. Export stops.json now ' +
      'so you do not lose the edits, then commit it and clear local edits.');
  }
  return res.ok;
}

/* ---------------- per-stop editor ---------------- */

function field(label, value, oninput, { multiline = false, type = 'text' } = {}) {
  const wrap = document.createElement('div');
  const l = document.createElement('label');
  l.textContent = label;
  const input = multiline ? document.createElement('textarea') : document.createElement('input');
  if (!multiline) input.type = type;
  input.value = value ?? '';
  input.addEventListener('input', () => oninput(input.value));
  wrap.append(l, input);
  return wrap;
}

export function renderAdminPanel(host, stop, refresh) {
  host.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'adm';
  box.innerHTML = `<h3>🔧 Edit this stop</h3>`;

  const status = document.createElement('div');
  status.className = 'ok';

  const save = () => {
    if (persist()) {
      status.textContent = 'Saved locally ✓';
      setTimeout(() => { status.textContent = ''; }, 1600);
    }
  };

  /* names */
  box.append(
    field('Name (EN)', stop.name.en, v => { stop.name.en = v; save(); }),
    field('Name (中文)', stop.name.zh, v => { stop.name.zh = v; save(); }),
    field('Name (한국어)', stop.name.ko, v => { stop.name.ko = v; save(); })
  );

  /* location — the part worth checking on the ground */
  const geoRow = document.createElement('div');
  geoRow.className = 'two';
  const latF = field('Latitude', stop.lat, v => { stop.lat = parseFloat(v) || stop.lat; }, { type: 'number' });
  const lngF = field('Longitude', stop.lng, v => { stop.lng = parseFloat(v) || stop.lng; }, { type: 'number' });
  geoRow.append(latF, lngF);
  box.append(geoRow);

  box.append(field('Check-in radius (metres)', stop.radius,
    v => { stop.radius = parseInt(v, 10) || stop.radius; save(); }, { type: 'number' }));

  const setCoords = (lat, lng) => {
    stop.lat = +lat.toFixed(6);
    stop.lng = +lng.toFixed(6);
    latF.querySelector('input').value = stop.lat;
    lngF.querySelector('input').value = stop.lng;
    moveMarker(stop.id, stop.lat, stop.lng);
    save();
  };

  const geoBtns = document.createElement('div');
  geoBtns.className = 'btnrow';

  const hereBtn = document.createElement('button');
  hereBtn.className = 'btn small ghost';
  hereBtn.textContent = '📍 Use my location';
  hereBtn.addEventListener('click', async () => {
    hereBtn.textContent = 'Locating…';
    try {
      const p = await locate();
      setCoords(p.lat, p.lng);
      hereBtn.textContent = `📍 Set (±${Math.round(p.accuracy)}m)`;
    } catch {
      hereBtn.textContent = '📍 Failed — retry';
    }
  });

  const centerBtn = document.createElement('button');
  centerBtn.className = 'btn small ghost';
  centerBtn.textContent = '🎯 Use map centre';
  centerBtn.addEventListener('click', () => {
    const c = getMapCenter();
    setCoords(c.lat, c.lng);
    centerBtn.textContent = '🎯 Set';
    setTimeout(() => { centerBtn.textContent = '🎯 Use map centre'; }, 1400);
  });

  geoBtns.append(hereBtn, centerBtn);
  box.append(geoBtns);

  /* hunt */
  box.append(
    field('Hunt task (EN)', stop.hunt.task.en, v => { stop.hunt.task.en = v; save(); }, { multiline: true }),
    field('Hunt task (中文)', stop.hunt.task.zh, v => { stop.hunt.task.zh = v; save(); }, { multiline: true }),
    field('Hint (EN)', stop.hunt.hint?.en, v => { (stop.hunt.hint ||= {}).en = v; save(); }),
    field('Hint (中文)', stop.hunt.hint?.zh, v => { (stop.hunt.hint ||= {}).zh = v; save(); })
  );

  /* reference photo */
  const photoLabel = document.createElement('label');
  photoLabel.textContent = 'Reference photo (shown with the hunt)';
  box.append(photoLabel);

  if (stop.hunt.photo) {
    const img = document.createElement('img');
    img.className = 'refphoto';
    img.src = stop.hunt.photo;
    box.append(img);
  }

  const photoBtns = document.createElement('div');
  photoBtns.className = 'btnrow';

  const addPhoto = document.createElement('button');
  addPhoto.className = 'btn small ghost';
  addPhoto.textContent = stop.hunt.photo ? '🖼️ Replace photo' : '🖼️ Add photo';
  addPhoto.addEventListener('click', () => {
    const input = document.querySelector('#adminPhotoInput');
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      stop.hunt.photo = await shrinkToDataUrl(file);
      save();
      refresh();
    };
    input.click();
  });
  photoBtns.append(addPhoto);

  if (stop.hunt.photo) {
    const rm = document.createElement('button');
    rm.className = 'btn small ghost';
    rm.textContent = '🗑️ Remove';
    rm.addEventListener('click', () => { stop.hunt.photo = null; save(); refresh(); });
    photoBtns.append(rm);
  }
  box.append(photoBtns);

  /* trivia */
  box.append(
    field('Trivia question (EN)', stop.trivia.q.en, v => { stop.trivia.q.en = v; save(); }, { multiline: true }),
    field('Trivia question (中文)', stop.trivia.q.zh, v => { stop.trivia.q.zh = v; save(); }, { multiline: true })
  );

  stop.trivia.options.forEach((opt, i) => {
    const letter = String.fromCharCode(65 + i);
    box.append(
      field(`Option ${letter} (EN)`, opt.en, v => { opt.en = v; save(); }),
      field(`Option ${letter} (中文)`, opt.zh, v => { opt.zh = v; save(); })
    );
  });

  const ansLabel = document.createElement('label');
  ansLabel.textContent = 'Correct answer';
  const ansSel = document.createElement('select');
  ansSel.style.cssText = 'width:100%;border:1.5px solid #E2DCC8;border-radius:9px;padding:8px 10px;background:#fff';
  stop.trivia.options.forEach((opt, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = `${String.fromCharCode(65 + i)} — ${opt.en}`;
    o.selected = i === stop.trivia.answer;
    ansSel.append(o);
  });
  ansSel.addEventListener('change', () => { stop.trivia.answer = Number(ansSel.value); save(); });
  box.append(ansLabel, ansSel);

  box.append(
    field('Explanation (EN)', stop.trivia.explain.en, v => { stop.trivia.explain.en = v; save(); }, { multiline: true }),
    field('Explanation (中文)', stop.trivia.explain.zh, v => { stop.trivia.explain.zh = v; save(); }, { multiline: true })
  );

  /* housekeeping */
  const tools = document.createElement('div');
  tools.className = 'btnrow';

  const expBtn = document.createElement('button');
  expBtn.className = 'btn small ghost';
  expBtn.textContent = '⬇️ Export stops.json';
  expBtn.addEventListener('click', exportJSON);

  const impBtn = document.createElement('button');
  impBtn.className = 'btn small ghost';
  impBtn.textContent = '⬆️ Import';
  impBtn.addEventListener('click', () => {
    const input = document.querySelector('#importInput');
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const next = JSON.parse(await file.text());
        setContent(next);
        persist();
        refresh();
      } catch (e) {
        alert('That file is not valid JSON.\n\n' + e.message);
      }
    };
    input.click();
  });

  const clrBtn = document.createElement('button');
  clrBtn.className = 'btn small ghost';
  clrBtn.textContent = '🧹 Clear local edits';
  clrBtn.addEventListener('click', () => {
    if (!confirm('Discard local edits and reload the committed stops.json?')) return;
    clearOverride();
    location.reload();
  });

  tools.append(expBtn, impBtn, clrBtn);
  box.append(tools, status);

  host.append(box);
}
