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
    tabTimeline: 'Timeline',
    tlEmpty: 'Nothing recorded yet. Add a moment, or photograph a plaque and let it read itself.',
    tlAdd: 'Add to timeline',
    tlRead: 'Read a plaque',
    tlReading: 'Reading the sign…',
    tlDate: 'Date',
    tlEndDate: 'End date (optional — makes it a period)',
    tlYearsFmt: (n) => n === 1 ? '1 year' : `${n} years`,
    tlBce: (y) => `${y} BCE`,
    tlSeed: 'Add Korean history',
    tlSeedDone: (n) => `Added ${n} events`,
    tlSeedNone: 'Already added',
    tlEndBeforeStart: 'The end date comes before the start date.',
    tlTitle: 'Title',
    tlDesc: 'Description',
    tlDescOpt: 'Description (optional)',
    tlPhoto: 'Photo (optional)',
    tlPlace: 'Location',
    tlUseHere: 'Use where I am',
    tlLocating: 'Locating…',
    tlNoPlace: 'No location',
    tlSave: 'Save',
    tlCancel: 'Cancel',
    tlDelete: 'Delete',
    tlDeleteConfirm: 'Delete this timeline entry?',
    tlEdit: 'Edit',
    tlTitleRequired: 'Give it a title first.',
    tlDateRequired: 'Add a date, like 2026-08-22 or just 1395.',
    tlTranslate: 'Fill in the other language',
    tlTranslating: 'Translating…',
    tlFound: (n) => n === 1 ? 'Found 1 event. Review and save.' : `Found ${n} events. Review and save.`,
    tlUnreadable: "Couldn't read an event from that photo.",
    tlAiOff: 'Plaque reading is not switched on for this site.',
    tlAiFail: 'That did not work. Try again, or type it in by hand.',
    tlSaveAll: 'Save all',
    tlNear: 'near',
    tlClear: 'Clear the timeline',
    tlClearConfirm: 'Delete every timeline entry and its photos? This cannot be undone.',
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
    tabTimeline: '時光軸',
    tlEmpty: '還沒有紀錄。新增一個瞬間，或拍下一塊解說牌，讓它自己讀。',
    tlAdd: '新增紀錄',
    tlRead: '拍解說牌',
    tlReading: '正在閱讀…',
    tlDate: '日期',
    tlEndDate: '結束日期（選填 —— 填了就成為一段時期）',
    tlYearsFmt: (n) => `${n} 年`,
    tlBce: (y) => `西元前 ${y} 年`,
    tlSeed: '加入韓國歷史',
    tlSeedDone: (n) => `已加入 ${n} 個事件`,
    tlSeedNone: '已經加過了',
    tlEndBeforeStart: '結束日期早於開始日期。',
    tlTitle: '標題',
    tlDesc: '描述',
    tlDescOpt: '描述（選填）',
    tlPhoto: '照片（選填）',
    tlPlace: '地點',
    tlUseHere: '用我現在的位置',
    tlLocating: '定位中…',
    tlNoPlace: '未記錄地點',
    tlSave: '儲存',
    tlCancel: '取消',
    tlDelete: '刪除',
    tlDeleteConfirm: '要刪除這筆紀錄嗎？',
    tlEdit: '編輯',
    tlTitleRequired: '請先輸入標題。',
    tlDateRequired: '請輸入日期，例如 2026-08-22，或只寫 1395。',
    tlTranslate: '補上另一種語言',
    tlTranslating: '翻譯中…',
    tlFound: (n) => `找到 ${n} 個事件，請確認後儲存。`,
    tlUnreadable: '這張照片讀不出事件。',
    tlAiOff: '本站尚未啟用解說牌辨識功能。',
    tlAiFail: '這次沒成功。請再試一次，或手動輸入。',
    tlSaveAll: '全部儲存',
    tlNear: '靠近',
    tlClear: '清空時光軸',
    tlClearConfirm: '要刪除所有紀錄與照片嗎？此操作無法撤銷。',
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

/**
 * Pick the current language out of a {en, zh} content object.
 *
 * Falls back with || rather than ?? on purpose: timeline entries she types
 * herself have one side filled and the other set to an empty string, and ??
 * would happily return that empty string and render a blank card.
 */
export function t(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj.en || obj.zh || '';
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
