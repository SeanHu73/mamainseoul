// The two things she picks up as she goes, rather than at each stop
// separately: the Korean alphabet, a few letters at a time, and a handful of
// architectural details that repeat across the places she visits.
//
// Both live inside the stop card, under the hunt and the trivia, so there is
// nothing new to find.

import { t, ui } from './i18n.js';
import * as store from './store.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let hangul = { lessons: [] };
let motifs = { motifs: [] };

export async function loadLearn() {
  const [h, m] = await Promise.all([
    fetch('content/hangul.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('content/motifs.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null)
  ]);
  // A missing file just means that half of the feature is absent; the stop
  // card still renders everything else.
  if (h) hangul = h;
  if (m) motifs = m;
}

export const lessonForStop = stopId => hangul.lessons.find(l => l.stopId === stopId) || null;
export const motifsForStop = stopId => motifs.motifs.filter(m => m.stops.includes(stopId));

export const allLessons = () => hangul.lessons;
export const allMotifs = () => motifs.motifs;

/** Letters taught up to and including a lesson she has actually opened. */
export function lettersLearned() {
  let n = 0;
  for (const l of hangul.lessons) {
    if (store.lessonState(l.id).seen) n += l.letters.length;
  }
  return n;
}

export function lettersTotal() {
  return hangul.lessons.reduce((n, l) => n + l.letters.length, 0);
}

export function motifsSpotted() {
  return motifs.motifs.filter(m => store.motifCount(m.id) > 0).length;
}

/* ---------------- the Hangul lesson ---------------- */

export function renderLesson(host, stop, onChange) {
  const lesson = lessonForStop(stop.id);
  if (!lesson) { host.innerHTML = ''; return; }

  const s = store.lessonState(lesson.id);
  const n = hangul.lessons.indexOf(lesson) + 1;

  if (!s.seen) {
    // Kept behind a tap so it never gets in the way of the stop itself.
    host.innerHTML = `
      <div class="card learn">
        <h3>🇰🇷 ${esc(ui('lnHangul'))} ${n}/${hangul.lessons.length}</h3>
        <p>${esc(t(hangul.intro))}</p>
        <button class="btn" id="lnStart" style="margin-top:11px">${esc(ui('lnStart', lesson.letters.length))}</button>
      </div>`;
    host.querySelector('#lnStart').addEventListener('click', () => {
      store.markLessonSeen(lesson.id);
      renderLesson(host, stop, onChange);
      onChange();
    });
    return;
  }

  const answered = s.quizPick !== null;
  const right = answered && s.quizPick === lesson.quiz.answer;

  const letters = lesson.letters.map(l => `
    <div class="glyph">
      <b>${esc(l.glyph)}</b>
      <span class="sound">${esc(l.sound)}</span>
      <span class="tip">${esc(t(l.hint))}</span>
    </div>`).join('');

  const opts = lesson.quiz.options.map((o, i) => {
    let cls = 'opt';
    if (answered) {
      if (i === lesson.quiz.answer) cls += ' right';
      else if (i === s.quizPick) cls += ' wrong';
    }
    return `<button class="${cls}" data-q="${i}" ${answered ? 'disabled' : ''}>
      <span class="k">${String.fromCharCode(65 + i)}</span><span>${esc(t(o))}</span>
    </button>`;
  }).join('');

  host.innerHTML = `
    <div class="card learn">
      <h3>🇰🇷 ${esc(ui('lnHangul'))} ${n}/${hangul.lessons.length}</h3>

      <div class="glyphs">${letters}</div>

      <div class="wordbox ${answered && right ? 'solved' : ''}">
        <b>${esc(lesson.word.hangul)}</b>
        <span class="rom">${esc(lesson.word.roman)}</span>
        ${answered ? `<span class="mean">${esc(t(lesson.word.meaning))}</span>` : ''}
      </div>

      <p style="margin-top:12px">${esc(t(lesson.quiz.q))}</p>
      <div class="opts">${opts}</div>

      ${answered ? `
        <div class="hint lntask" style="margin-top:11px">${esc(t(lesson.task))}</div>
        <button class="btn ${s.taskDone ? 'ghost' : ''}" id="lnTask" style="margin-top:9px">
          ${s.taskDone ? `✓ ${esc(ui('lnTaskDone'))}` : esc(ui('lnTaskDo'))}
        </button>` : ''}
    </div>`;

  for (const b of host.querySelectorAll('[data-q]')) {
    b.addEventListener('click', () => {
      store.setLessonQuizPick(lesson.id, Number(b.dataset.q));
      renderLesson(host, stop, onChange);
      onChange();
    });
  }
  host.querySelector('#lnTask')?.addEventListener('click', () => {
    store.setLessonTaskDone(lesson.id, !s.taskDone);
    renderLesson(host, stop, onChange);
    onChange();
  });
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
