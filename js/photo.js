/**
 * Phone cameras produce 4-8 MB files. Nothing here needs that, and IndexedDB
 * on iOS is not generous, so everything gets downscaled on the way in.
 */
async function draw(file, maxEdge) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas;
}

/** Her trip photos -> Blob for IndexedDB. */
export async function shrinkToBlob(file, maxEdge = 1400, quality = 0.82) {
  const canvas = await draw(file, maxEdge);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Admin reference photos -> data URL, because these get embedded in
 * stops.json and committed. Squeezed harder for that reason.
 */
export async function shrinkToDataUrl(file, maxEdge = 900, quality = 0.7) {
  const canvas = await draw(file, maxEdge);
  return canvas.toDataURL('image/jpeg', quality);
}

const urls = new Map();

/** Cached object URLs, so re-rendering the scrapbook doesn't leak. */
export function blobUrl(key, blob) {
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(blob));
  return urls.get(key);
}

export function releaseBlobUrl(key) {
  const u = urls.get(key);
  if (u) { URL.revokeObjectURL(u); urls.delete(key); }
}
