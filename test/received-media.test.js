import test from 'node:test';
import assert from 'node:assert/strict';
import { exportReceivedMedia, importReceivedMedia } from '../src/lib/received-media.js';

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
