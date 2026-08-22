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
    reset: 'Reset all progress',
    resetConfirm: 'Erase every check-in, answer and photo? This cannot be undone.',
    all: 'All'
  },
  zh: {
    title: '妈妈在首尔',
    subtitle: '三天 · 16 站 · 寻宝之旅',
    tabMap: '地图', tabList: '行程', tabBook: '相册',
    checkIn: '在此打卡',
    checking: '正在定位…',
    checkedIn: '已打卡',
    imHere: '我就在这里',
    away: (m) => `你大约还差 ${m}。`,
    close: (m) => `距离 ${m} —— 够近了！`,
    geoDenied: '定位已关闭。请到手机设置中开启，或使用下方按钮。',
    geoFail: '无法获取你的位置。',
    hunt: '寻宝任务',
    trivia: '冷知识',
    lockedHunt: '打卡后解锁任务',
    lockedTrivia: '打卡后解锁问答',
    showHint: '需要提示吗？',
    found: '我找到了！',
    foundDone: '已找到',
    photos: '你的照片',
    addPhoto: '拍照',
    correct: '答对了！',
    notQuite: '不太对。',
    openIn: '用地图打开',
    naver: 'Naver 地图', kakao: 'Kakao 地图',
    stopsVisited: '打卡', huntsDone: '任务', triviaRight: '答对',
    bookEmpty: '还没有内容。到第一站打卡并拍张照吧。',
    day: '第',
    reset: '清除全部进度',
    resetConfirm: '确定要清除所有打卡、答案与照片吗？此操作无法撤销。',
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
