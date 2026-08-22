// Bilingual EN / ZH. Korean names are shown alongside, never translated —
// they are there so she can point at them.

const UI = {
  en: {
    title: 'Mama in Seoul',
    subtitle: '3 days · 16 stops · a scavenger hunt',
    tabMap: 'Map', tabList: 'Itinerary', tabBook: 'Scrapbook',
    checkIn: 'Check in here',
    checking: 'Finding you…',
    checkedIn: 'Checked in',
    imHere: "I'm here anyway",
    away: (m) => `You look about ${m} away.`,
    close: (m) => `${m} away — close enough!`,
    geoDenied: 'Location is off. Turn it on in your phone settings, or use the button below.',
    geoFail: "Couldn't get your location.",
    hunt: 'Scavenger hunt',
    trivia: 'Trivia',
    lockedHunt: 'Check in to unlock the hunt',
    lockedTrivia: 'Check in to unlock the trivia',
    showHint: 'Need a hint?',
    found: 'I found it!',
    foundDone: 'Found it',
    photos: 'Your photos',
    addPhoto: 'Photo',
    correct: 'Correct!',
    notQuite: 'Not quite.',
    openIn: 'Open in maps',
    naver: 'Naver Map', kakao: 'Kakao Map',
    stopsVisited: 'Stops', huntsDone: 'Hunts', triviaRight: 'Trivia',
    bookEmpty: 'Nothing here yet. Check in at your first stop and take a photo.',
    day: 'Day',
    undo: 'Undo check-in',
    undoConfirm: 'Undo the check-in for this stop? Your photos are kept.',
    reset: 'Reset all progress',
    resetConfirm: 'Erase every check-in, answer and photo? This cannot be undone.',
    all: 'All'
  },
  zh: {
    title: '媽媽在首爾',
    subtitle: '三天 · 16 站 · 尋寶之旅',
    tabMap: '地圖', tabList: '行程', tabBook: '相簿',
    checkIn: '在此打卡',
    checking: '正在定位…',
    checkedIn: '已打卡',
    imHere: '我就在這裡',
    away: (m) => `你大約還差 ${m}。`,
    close: (m) => `距離 ${m} —— 夠近了！`,
    geoDenied: '定位已關閉。請到手機設定中開啟，或使用下方按鈕。',
    geoFail: '無法取得你的位置。',
    hunt: '尋寶任務',
    trivia: '冷知識',
    lockedHunt: '打卡後解鎖任務',
    lockedTrivia: '打卡後解鎖問答',
    showHint: '需要提示嗎？',
    found: '我找到了！',
    foundDone: '已找到',
    photos: '你的照片',
    addPhoto: '拍照',
    correct: '答對了！',
    notQuite: '不太對。',
    openIn: '用地圖打開',
    naver: 'Naver 地圖', kakao: 'Kakao 地圖',
    stopsVisited: '打卡', huntsDone: '任務', triviaRight: '答對',
    bookEmpty: '還沒有內容。到第一站打卡並拍張照吧。',
    day: '第',
    undo: '取消打卡',
    undoConfirm: '要取消這一站的打卡嗎？照片會保留。',
    reset: '清除全部進度',
    resetConfirm: '確定要清除所有打卡、答案與照片嗎？此操作無法撤銷。',
    all: '全部'
  }
};

let lang = localStorage.getItem('mis.lang') || 'en';

export function getLang() { return lang; }

export function setLang(next) {
  lang = next;
  localStorage.setItem('mis.lang', lang);
}

export function toggleLang() {
  setLang(lang === 'en' ? 'zh' : 'en');
  return lang;
}

/** Pick the current language out of a {en, zh} content object. */
export function t(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] ?? obj.en ?? '';
}

/** UI string by key. Values may be functions taking args. */
export function ui(key, ...args) {
  const v = UI[lang][key] ?? UI.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

/** Day heading, e.g. "Day 2" / "第 2 天". */
export function dayLabel(n) {
  return lang === 'zh' ? `第 ${n} 天` : `Day ${n}`;
}
