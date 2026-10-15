// Keep large WebSocket clips out of localStorage's small string quota.
const urls = new Map();
let database;
function db() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('urlAutofill.receivedMedia.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
  });
}
async function transaction(mode, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('files', mode);
    const request = action(tx.objectStore('files'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || request.error);
    tx.onabort = () => reject(tx.error || new Error('Could not save received media.'));
  });
}
export async function saveReceivedBlob(blob) {
  const id = crypto.randomUUID();
  await transaction('readwrite', store => store.put(blob, id));
  return id;
}
export async function receivedBlob(id) {
  const blob = await transaction('readonly', store => store.get(id));
  if (!(blob instanceof Blob)) throw new Error('Received clip data is missing from this browser.');
  return blob;
}

const latestWebSocketFileKey = 'latestWebSocketFile';

export async function saveLatestWebSocketFile(file, endpoint) {
  await transaction('readwrite', store => store.put({
    endpoint, name: file.name, mime: file.mime, bytes: file.bytes, blob: file.blob
  }, latestWebSocketFileKey));
}

export async function loadLatestWebSocketFile(endpoint) {
  const file = await transaction('readonly', store => store.get(latestWebSocketFileKey));
  return file?.endpoint === endpoint && file.blob instanceof Blob &&
    typeof file.name === 'string' && typeof file.mime === 'string' &&
    Number.isSafeInteger(file.bytes) && file.bytes === file.blob.size ? file : null;
}
export async function receivedBlobUrl(id) {
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(await receivedBlob(id)));
  return urls.get(id);
}
export const cachedReceivedBlobUrl = id => urls.get(id);
export async function removeReceivedBlob(id) {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  await transaction('readwrite', store => store.delete(id));
}

export async function clearReceivedMedia() {
  await transaction('readwrite', store => store.clear());
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

// Project/scene snapshots share blob IDs in this browser. Portable session
// downloads include the bytes so restoring on another browser still works.
function rewriteBlobReferences(value, visit) {
  if (!value || typeof value !== 'object') return;
  if (value.storage === 'blob' && typeof value.blobId === 'string') visit(value);
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') {
      try {
        const parsed = JSON.parse(child);
        if (parsed && typeof parsed === 'object') {
          rewriteBlobReferences(parsed, visit);
          value[key] = JSON.stringify(parsed);
        }
      } catch { /* Most stored strings are not serialized JSON. */ }
    } else rewriteBlobReferences(child, visit);
  }
}

export async function exportReceivedMedia(backup) {
  const ids = new Set();
  rewriteBlobReferences(backup.entries, meta => ids.add(meta.blobId));
  const assets = {};
  for (const id of ids) {
    const blob = await receivedBlob(id);
    assets[id] = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  return { ...backup, receivedMedia: assets };
}

export async function importReceivedMedia(backup) {
  if (backup?.format !== 'url-autofill-session' || backup.version !== 1 ||
      !backup.entries || typeof backup.entries !== 'object' || Array.isArray(backup.entries))
    throw new Error('This is not a supported session file.');
  const restored = JSON.parse(JSON.stringify(backup));
  const ids = new Set();
  rewriteBlobReferences(restored.entries, meta => ids.add(meta.blobId));
  const replacements = new Map();
  try {
    for (const id of ids) {
      const value = backup.receivedMedia?.[id];
      const match = typeof value === 'string' && value.match(/^data:((?:image|video)\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i);
      if (!match) throw new Error('Session is missing received media bytes.');
      const raw = atob(match[2]);
      const blob = new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))], { type: match[1] });
      replacements.set(id, await saveReceivedBlob(blob));
    }
    rewriteBlobReferences(restored.entries, meta => { meta.blobId = replacements.get(meta.blobId); });
    return restored;
  } catch (error) {
    await Promise.all([...replacements.values()].map(removeReceivedBlob));
    throw error;
  }
}
