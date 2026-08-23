import { loadContent } from './content.js';
import { toggleLang } from './i18n.js';
import * as UI from './ui.js';
import { initMap, setDayFilter, refreshMarkers, flyToStop, showMe, resizeMap, showPoint } from './map.js';
import { getStop } from './content.js';
import { locate } from './geo.js';
import { initAdmin } from './admin.js';
import { initTimeline, renderTimeline, closeForm as closeTimelineForm } from './timeline.js';
import { loadLearn } from './learn.js';

const $ = sel => document.querySelector(sel);

let currentView = 'map';
let currentDay = 0;

function redrawAll() {
  UI.applyStaticText();
  UI.updateProgressPill();
  UI.renderDayFilter(currentDay, pickDay);
  UI.renderList(openStop);
  UI.renderBook();
  renderTimeline();
  refreshMarkers();
  if (UI.currentStopId()) UI.renderSheet();
}

function pickDay(day) {
  currentDay = day;
  setDayFilter(day);
  UI.renderDayFilter(currentDay, pickDay);
}

function openStop(id) {
  const stop = getStop(id);
  if (currentView !== 'map') showView('map');
  flyToStop(stop);
  UI.openSheet(id);
}

function showView(name) {
  currentView = name;
  for (const v of ['map', 'list', 'timeline', 'book']) {
    $(`#view-${v}`).hidden = v !== name;
  }
  for (const b of $('#tabs').querySelectorAll('button')) {
    b.setAttribute('aria-selected', String(b.dataset.view === name));
  }
  if (name === 'map') resizeMap();
  if (name === 'book') UI.renderBook();
  if (name === 'timeline') renderTimeline();
}

async function main() {
  await loadContent();
  await loadLearn();

  UI.initUI({ onProgressChange: () => {
    UI.updateProgressPill();
    UI.renderList(openStop);
    UI.renderBook();
    refreshMarkers();
  }});

  initMap('map', { onStopClick: openStop });
  initAdmin({ onChange: redrawAll });
  initTimeline({
    onChange: () => {},
    onFindOnMap: (lat, lng, label) => {
      // showView unhides the map synchronously, so resize and fly right away.
      // This used to sit inside requestAnimationFrame, which never fires in a
      // backgrounded or throttled tab — the button did nothing at all.
      showView('map');
      resizeMap();
      showPoint(lat, lng, label);
    }
  });

  for (const b of $('#tabs').querySelectorAll('button')) {
    b.addEventListener('click', () => showView(b.dataset.view));
  }

  $('#langBtn').addEventListener('click', () => {
    toggleLang();
    closeTimelineForm();   // its fields are language-specific; reopen fresh
    redrawAll();
  });

  $('#locBtn').addEventListener('click', async () => {
    const btn = $('#locBtn');
    btn.textContent = '…';
    try {
      showMe(await locate());
      btn.textContent = '📍';
    } catch {
      btn.textContent = '⚠️';
      setTimeout(() => { btn.textContent = '📍'; }, 1800);
    }
  });

  redrawAll();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

main().catch(err => {
  document.querySelector('main').innerHTML =
    `<div class="empty"><span class="big">😕</span>Could not start.<br><br>
     <code style="font-size:12px">${err.message}</code><br><br>
     If you opened this file directly, run a local server instead —
     the app needs to fetch content/stops.json.</div>`;
});
