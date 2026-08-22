// Storage. Three separate things, deliberately:
//   progress  — her check-ins, answers, hunt ticks   (localStorage, small)
//   photos    — her actual photos                    (IndexedDB, can be MBs)
//   override  — admin edits to the content           (localStorage, exportable)

const K_PROGRESS = 'mis.progress.v1';
const K_OVERRIDE = 'mis.content.v1';
const DB_NAME = 'mis-photos';
const DB_STORE = 'photos';

/* ---------------- progress ---------------- */

const blank = () => ({ stops: {} });

function readProgress() {
  try {
    const raw = localStorage.getItem(K_PROGRESS);
    return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
  } catch {
    return blank();
  }
}

let progress = readProgress();

function saveProgress() {
  localStorage.setItem(K_PROGRESS, JSON.stringify(progress));
}

/** Per-stop record, created on demand. */
export function stopState(id) {
  return progress.stops[id] || (progress.stops[id] = {
    checkedInAt: null,   // ISO string
    checkedInBy: null,   // 'gps' | 'manual'
    huntDone: false,
    triviaPick: null,    // index of her first answer
    photos: []           // photo keys into IndexedDB
  });
}

export function checkIn(id, how) {
  const s = stopState(id);
  if (!s.checkedInAt) {
    s.checkedInAt = new Date().toISOString();
    s.checkedInBy = how;
    saveProgress();
  }
  return s;
}

/**
 * Undo a single stop — for a mis-tap, or for testing. Photos are deliberately
 * kept: they're the one thing here that can't be recreated. They reappear if
 * she checks in again, and can still be deleted individually.
 */
export function undoCheckIn(id) {
  const s = stopState(id);
  s.checkedInAt = null;
  s.checkedInBy = null;
  s.huntDone = false;
  s.triviaPick = null;
  saveProgress();
}

export function setHuntDone(id, done) {
  stopState(id).huntDone = !!done;
  saveProgress();
}

/** Records only the FIRST answer, so the score means something. Retries are free. */
export function setTriviaPick(id, index) {
  const s = stopState(id);
  if (s.triviaPick === null) {
    s.triviaPick = index;
    saveProgress();
  }
}

export function addPhotoKey(id, key) {
  stopState(id).photos.push(key);
  saveProgress();
}

export function removePhotoKey(id, key) {
  const s = stopState(id);
  s.photos = s.photos.filter(k => k !== key);
  saveProgress();
  return deletePhoto(key);
}

export async function resetProgress() {
  progress = blank();
  localStorage.removeItem(K_PROGRESS);
  const db = await openDB();
  await promisify(db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).clear());
}

/* ---------------- photos (IndexedDB) ---------------- */

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
          req.result.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function promisify(reqOrTx) {
  return new Promise((resolve, reject) => {
    reqOrTx.onsuccess = () => resolve(reqOrTx.result);
    reqOrTx.oncomplete = () => resolve(reqOrTx.result);
    reqOrTx.onerror = () => reject(reqOrTx.error);
  });
}

export async function putPhoto(blob) {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const db = await openDB();
  await promisify(db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(blob, key));
  return key;
}

export async function getPhoto(key) {
  const db = await openDB();
  return promisify(db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key));
}

export async function deletePhoto(key) {
  const db = await openDB();
  return promisify(db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(key));
}

/* ---------------- content override (admin) ---------------- */

export function readOverride() {
  try {
    const raw = localStorage.getItem(K_OVERRIDE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeOverride(content) {
  try {
    localStorage.setItem(K_OVERRIDE, JSON.stringify(content));
    return { ok: true };
  } catch (e) {
    // Almost always the ~5MB localStorage quota, blown by reference photos.
    return { ok: false, error: e.message };
  }
}

export function clearOverride() {
  localStorage.removeItem(K_OVERRIDE);
}
