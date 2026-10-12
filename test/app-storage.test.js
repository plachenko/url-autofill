import assert from 'node:assert/strict';
import test from 'node:test';
import { clearAppStorage } from '../src/lib/app-storage.js';

test('clears app data and pane sizes without touching other origin storage', () => {
  const values = new Map([
    ['urlAutofill.v1', 'text'],
    ['unrelated-app.data', 'keep'],
    ['urlAutofill.media.v1.clip.part.1', 'image'],
    ['paneforge:urlAutofill.panes.v1', 'sizes'],
    ['paneforge:another-app', 'keep']
  ]);
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); }
  };

  assert.equal(clearAppStorage(storage), 3);
  assert.deepEqual([...values.keys()], ['unrelated-app.data', 'paneforge:another-app']);
});
