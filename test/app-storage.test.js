import assert from 'node:assert/strict';
import test from 'node:test';
import { clearAppStorage, createSessionBackup, restoreSessionBackup } from '../src/lib/app-storage.js';

function mockStorage(initial, rejectKey) {
  const values = new Map(initial);
  return {
    values,
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (key === rejectKey) throw new Error('Storage full');
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); }
  };
}

test('clears app data and pane sizes without touching other origin storage', () => {
  const storage = mockStorage([
    ['urlAutofill.v1', 'text'],
    ['unrelated-app.data', 'keep'],
    ['urlAutofill.media.v1.clip.part.1', 'image'],
    ['paneforge:urlAutofill.panes.v1', 'sizes'],
    ['paneforge:another-app', 'keep']
  ]);

  assert.equal(clearAppStorage(storage), 3);
  assert.deepEqual([...storage.values.keys()], ['unrelated-app.data', 'paneforge:another-app']);
});

test('backs up and restores clips, layout, and preferences without other storage', () => {
  const source = mockStorage([
    ['urlAutofill.media.v1.clip.part.1', 'encoded-image'],
    ['urlAutofill.compositor.v1', '[[{"id":"clip","start":0}]]'],
    ['paneforge:urlAutofill.panes.v1', '[72,28]'],
    ['another-app', 'private']
  ]);
  const backup = createSessionBackup(source);
  assert.equal(backup.format, 'url-autofill-session');
  assert.equal(backup.version, 1);
  assert.equal(backup.entries['another-app'], undefined);

  const target = mockStorage([
    ['urlAutofill.v1', 'old'],
    ['another-app', 'keep']
  ]);
  assert.equal(restoreSessionBackup(target, backup), 3);
  assert.equal(target.getItem('urlAutofill.v1'), null);
  assert.equal(target.getItem('urlAutofill.media.v1.clip.part.1'), 'encoded-image');
  assert.equal(target.getItem('paneforge:urlAutofill.panes.v1'), '[72,28]');
  assert.equal(target.getItem('another-app'), 'keep');
});

test('rejects invalid files before changing storage and rolls back write failures', () => {
  const target = mockStorage([
    ['urlAutofill.v1', 'old'], ['another-app', 'keep']
  ], 'urlAutofill.media.v1.clip.part.1');
  assert.throws(() => restoreSessionBackup(target, {
    format: 'url-autofill-session', version: 1, entries: { 'another-app': 'overwrite' }
  }), /invalid saved data/);
  assert.equal(target.getItem('urlAutofill.v1'), 'old');
  assert.equal(target.getItem('another-app'), 'keep');

  assert.throws(() => restoreSessionBackup(target, {
    format: 'url-autofill-session', version: 1,
    entries: { 'urlAutofill.media.v1.clip.part.1': 'new' }
  }), /Storage full/);
  assert.equal(target.getItem('urlAutofill.v1'), 'old');
  assert.equal(target.getItem('another-app'), 'keep');
});
