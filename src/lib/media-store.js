import { cachedReceivedBlobUrl, receivedBlobUrl, saveReceivedBlob, removeReceivedBlob } from './received-media.js';

export const mediaStorageKey = id => `urlAutofill.media.v1.${id}`;
export const validMediaId = id => /^[a-zA-Z0-9_-]{1,64}$/.test(id);
export const validMime = mime => /^(image|video)\/[a-z0-9.+-]+$/i.test(mime);
export function storeMediaPart(params) {
  const id = params.get('s');
  if (!validMediaId(id)) throw new Error('Store ID must use 1–64 letters, numbers, _ or -.');
  const part = Number(params.get('p'));
  const total = Number(params.get('n'));
  if (!Number.isInteger(part) || !Number.isInteger(total) || part < 1 || total < 1 ||
      part > total || total > 1000) throw new Error('Use a part number from 1 to total (maximum 1000).');
  let data = params.get('d');
  if (!data) throw new Error('Missing base64 data chunk.');
  data = data.replaceAll(' ', '+'); // URLSearchParams decodes an unescaped + as a space.
  const prefix = data.match(/^data:((?:image|video)\/[a-z0-9.+-]+);base64,/i);
  if (prefix) data = data.slice(prefix[0].length);
  if (!data) throw new Error('Missing base64 data chunk.');
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(data)) throw new Error('Chunk must contain base64 data.');
  const base = mediaStorageKey(id);
  const previous = JSON.parse(window.localStorage.getItem(`${base}.meta`) || 'null');
  const mime = (params.get('f') || prefix?.[1] || previous?.mime || '').toLowerCase();
  if (!validMime(mime)) throw new Error('Supply an image or video MIME type, such as image/png.');
  if (previous && (previous.mime !== mime || previous.total !== total)) {
    throw new Error('Stored type or part count differs. Delete this ID before replacing it.');
  }
  const seconds = params.has('h') ? Number(params.get('h')) : previous?.seconds ?? 3;
  if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 3600) {
    throw new Error('Image seconds must be between 0.1 and 3600.');
  }
  window.localStorage.setItem(`${base}.meta`, JSON.stringify({ mime, total, seconds }));
  window.localStorage.setItem(`${base}.part.${part}`, data);
  let saved = 0;
  for (let index = 1; index <= total; index++) {
    if (window.localStorage.getItem(`${base}.part.${index}`) !== null) saved++;
  }
  return `Saved ${id} part ${part}/${total} (${saved}/${total} present).`;
}
export function storeWholeMedia(id, dataUri, seconds) {
  if (!validMediaId(id)) throw new Error('Clip ID must use 1–64 letters, numbers, _ or -.');
  const match = dataUri.trim().match(/^data:((?:image|video)\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match) throw new Error('Choose an image or video file, or use a base64 data URI.');
  const mime = match[1].toLowerCase();
  const encoded = match[2].replaceAll(' ', '+').replace(/[\r\n\t]/g, '');
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1 ||
      (encoded.includes('=') && encoded.length % 4 !== 0)) {
    throw new Error('The data URI contains invalid base64.');
  }
  if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 3600) {
    throw new Error('Image seconds must be between 0.1 and 3600.');
  }
  const base = mediaStorageKey(id);
  if (window.localStorage.getItem(`${base}.meta`) !== null) {
    throw new Error('That clip ID is already stored. Delete it before replacing it.');
  }
  window.localStorage.setItem(`${base}.part.1`, encoded);
  try {
    window.localStorage.setItem(`${base}.meta`, JSON.stringify({ mime, total: 1, seconds }));
  } catch (error) {
    window.localStorage.removeItem(`${base}.part.1`);
    throw error;
  }
  return `Saved ${id} (${mime}).`;
}
export function deleteMedia(id) {
  if (!validMediaId(id)) throw new Error('Invalid media ID to delete.');
  const base = mediaStorageKey(id);
  const meta = JSON.parse(window.localStorage.getItem(`${base}.meta`) || 'null');
  if (meta && Number.isInteger(meta.total) && meta.total <= 1000) {
    for (let index = 1; index <= meta.total; index++) {
      window.localStorage.removeItem(`${base}.part.${index}`);
    }
  }
  window.localStorage.removeItem(`${base}.meta`);
  return `Deleted stored media ${id}.`;
}
export function loadMedia(id) {
  if (!validMediaId(id)) throw new Error(`Invalid timeline ID: ${id}.`);
  const base = mediaStorageKey(id);
  const meta = JSON.parse(window.localStorage.getItem(`${base}.meta`) || 'null');
  if (!meta || !validMime(meta.mime) || !Number.isInteger(meta.total) ||
      meta.total < 1 || meta.total > 1000) throw new Error(`No stored media named ${id}.`);
  if (meta.storage === 'blob') {
    const src = cachedReceivedBlobUrl(meta.blobId);
    if (!src) throw new Error('Received clip is still loading.');
    return { id, type: meta.mime.startsWith('video/') ? 'video' : 'image', src, seconds: meta.seconds };
  }
  const parts = [];
  for (let index = 1; index <= meta.total; index++) {
    const part = window.localStorage.getItem(`${base}.part.${index}`);
    if (part === null) throw new Error(`${id} is missing part ${index}/${meta.total}.`);
    parts.push(part);
  }
  const encoded = parts.join('');
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1 ||
      (encoded.includes('=') && encoded.length % 4 !== 0)) {
    throw new Error(`${id} does not form valid base64 data.`);
  }
  return { id, type: meta.mime.startsWith('video/') ? 'video' : 'image',
    src: `data:${meta.mime};base64,${encoded}`,
    seconds: Number.isFinite(meta.seconds) ? meta.seconds : 3 };
}

export async function loadMediaAsync(id) {
  if (!validMediaId(id)) throw new Error('Invalid media ID.');
  const meta = JSON.parse(window.localStorage.getItem(`${mediaStorageKey(id)}.meta`) || 'null');
  if (meta?.storage === 'blob') await receivedBlobUrl(meta.blobId);
  return loadMedia(id);
}

export async function storeReceivedMedia(id, blob, seconds = 3) {
  if (!validMediaId(id) || !validMime(blob.type)) throw new Error('Choose a received image or video.');
  const key = `${mediaStorageKey(id)}.meta`;
  if (window.localStorage.getItem(key) !== null) throw new Error('That clip ID is already stored.');
  const blobId = await saveReceivedBlob(blob);
  try {
    await receivedBlobUrl(blobId);
    window.localStorage.setItem(key, JSON.stringify({ mime: blob.type, total: 1, seconds,
      storage: 'blob', blobId, bytes: blob.size }));
  } catch (error) {
    await removeReceivedBlob(blobId);
    throw error;
  }
  return `Saved ${id} (${blob.type}).`;
}
