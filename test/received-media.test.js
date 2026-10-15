import test from 'node:test';
import assert from 'node:assert/strict';
import { clearReceivedMedia, exportReceivedMedia, importReceivedMedia,
  loadLatestWebSocketFile, saveLatestWebSocketFile } from '../src/lib/received-media.js';

test('legacy session files work without IndexedDB assets', async () => {
  const backup = { format: 'url-autofill-session', version: 1,
    entries: { 'urlAutofill.text': 'hello', 'urlAutofill.media.v1.image.meta': '{"mime":"image/png","total":1}' } };
  assert.deepEqual(await importReceivedMedia(backup), backup);
  assert.deepEqual(await exportReceivedMedia(backup), { ...backup, receivedMedia: {} });
});
test('rejects invalid sessions and missing or malformed received assets before writing bytes', async () => {
  await assert.rejects(() => importReceivedMedia({ entries: {} }), /supported session/);
  const backup = { format: 'url-autofill-session', version: 1, entries: {
    'urlAutofill.media.v1.clip.meta': JSON.stringify({ storage: 'blob', blobId: 'id', mime: 'video/mp4' })
  } };
  await assert.rejects(() => importReceivedMedia(backup), /missing received media bytes/);
  await assert.rejects(() => importReceivedMedia({ ...backup, receivedMedia: { id: 'data:text/html;base64,YWJj' } }), /missing received media bytes/);
  assert.equal(JSON.parse(backup.entries['urlAutofill.media.v1.clip.meta']).blobId, 'id');
});

test('the latest verified WebSocket file survives a reconnect to the same server', async () => {
  const values = new Map();
  const original = globalThis.indexedDB;
  globalThis.indexedDB = { open() {
    const request = { result: { transaction() {
      const tx = { objectStore() { return {
        put(value, key) { const result = { result: key }; queueMicrotask(() => {
          values.set(key, value); tx.oncomplete();
        }); return result; },
        get(key) { const result = { result: values.get(key) }; queueMicrotask(() => tx.oncomplete());
          return result; },
        clear() { const result = { result: undefined }; queueMicrotask(() => {
          values.clear(); tx.oncomplete();
        }); return result; }
      }; } };
      return tx;
    } } };
    queueMicrotask(() => request.onsuccess());
    return request;
  } };
  try {
    const blob = new Blob(['video'], { type: 'video/mp4' });
    const file = { name: 'render.mp4', mime: 'video/mp4', bytes: blob.size, blob };
    await saveLatestWebSocketFile(file, 'wss://blender.example');
    assert.equal((await loadLatestWebSocketFile('wss://blender.example')).blob, blob);
    assert.equal(await loadLatestWebSocketFile('wss://other.example'), null);
    await clearReceivedMedia();
    assert.equal(await loadLatestWebSocketFile('wss://blender.example'), null);
  } finally { globalThis.indexedDB = original; }
});
