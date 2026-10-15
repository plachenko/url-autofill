import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveLayout, imageArchiveDuration, verifyArchive, digest } from '../src/lib/clip-archive.js';
const layout = { format: 'url-autofill-session', version: 1, entries: { 'urlAutofill.compositor.v1': '[[{"id":"a","start":12,"sourceStart":2,"duration":4}]]', 'urlAutofill.previewSplits.v1': '{"type":"primary"}' } };
test('archive removes media bytes while retaining exact layout and split state', () => {
  const source = structuredClone(layout);
  source.entries['urlAutofill.media.v1.a.meta'] = '{}';
  source.entries['urlAutofill.media.v1.a.part.1'] = 'large bytes';
  assert.deepEqual(archiveLayout(source), layout);
  assert.equal(source.entries['urlAutofill.media.v1.a.part.1'], 'large bytes');
});
test('still image reel covers extended clips in inactive scene snapshots', () => {
  assert.equal(imageArchiveDuration({ scenes: JSON.stringify({ backup: { tracks: JSON.stringify([[{ id: 'a', duration: 25 }]]) } }) }, 'a', 3), 25);
  assert.equal(imageArchiveDuration({}, 'a', 3), 3);
});
test('verification binds JSON to video bytes and rejects malformed ranges', async () => {
  const video = new Blob(['fixture'], { type: 'video/webm' });
  const manifest = { format: 'url-autofill-reel', version: 1, videoBytes: video.size, sha256: await digest(video), segments: [{ id: 'a', start: 0, duration: 4 }], layout };
  await verifyArchive(video, manifest);
  await assert.rejects(verifyArchive(new Blob(['changed']), manifest), /matching archive/);
  await assert.rejects(verifyArchive(video, { ...manifest, segments: [{ id: 'a', start: -1, duration: 4 }] }), /Invalid archive/);
  await assert.rejects(verifyArchive(video, { ...manifest, layout: { ...layout, entries: { forbidden: 'x' } } }), /invalid saved data/);
});

test('clear refuses changed projects and preserves layouts and other projects', async () => {
  const { clearArchivedProject } = await import('../src/lib/clip-archive.js');
  const data = new Map(Object.entries(layout.entries));
  data.set('urlAutofill.media.v1.a.meta', JSON.stringify({ mime: 'image/png', total: 1 }));
  data.set('urlAutofill.media.v1.a.part.1', 'bytes');
  data.set('urlAutofill.projects.v1', 'other projects');
  globalThis.localStorage = { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const { createSessionBackup } = await import('../src/lib/app-storage.js');
  try {
    const snapshot = createSessionBackup(localStorage);
    data.set('urlAutofill.compositor.v1', 'changed');
    await assert.rejects(clearArchivedProject(snapshot), /project changed/);
    assert.equal(data.get('urlAutofill.media.v1.a.part.1'), 'bytes');
    data.set('urlAutofill.compositor.v1', layout.entries['urlAutofill.compositor.v1']);
    await clearArchivedProject(snapshot);
    assert.equal(data.has('urlAutofill.media.v1.a.part.1'), false);
    assert.equal(data.has('urlAutofill.media.v1.a.meta'), false);
    assert.equal(data.get('urlAutofill.projects.v1'), 'other projects');
    assert.equal(data.get('urlAutofill.compositor.v1'), layout.entries['urlAutofill.compositor.v1']);
  } finally { delete globalThis.localStorage; }
});
