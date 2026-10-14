import test from 'node:test';
import assert from 'node:assert/strict';
import { previewEntryForSource, previewSourceTime } from '../src/lib/preview-sources.js';

test('a track view shows its active clip and a clip view keeps its chosen clip', () => {
  const clips = [[{ id: 'first' }, { id: 'second' }], [{ id: 'top' }]];
  const items = [
    { clipRef: clips[0][0], track: 0, start: 0, end: 5, duration: 5 },
    { clipRef: clips[0][1], track: 0, start: 2, end: 4, duration: 2 },
    { clipRef: clips[1][0], track: 1, start: 0, end: 5, duration: 5 }
  ];
  assert.equal(previewEntryForSource('track:0', clips, items, 3), items[1]);
  assert.equal(previewEntryForSource('track:1', clips, items, 3), items[2]);
  assert.equal(previewEntryForSource('clip:0:0', clips, items, 3), items[0]);
  assert.equal(previewEntryForSource('selected', clips, items, 3, new Set([clips[0][0]])), items[0]);
  assert.equal(previewEntryForSource('track:0', clips, items, 6), null);
});

test('an unlocked clip view loops independently of the cursor', () => {
  const entry = { start: 2, end: 6, duration: 4 };
  assert.equal(previewSourceTime('clip:0:0', entry, 10, false, 5), 3);
  assert.equal(previewSourceTime('selected', entry, 10, false, 5), 3);
  assert.equal(previewSourceTime('clip:0:0', entry, 3, true, 5), 3);
  assert.equal(previewSourceTime('clip:0:0', entry, 10, true, 5), null);
});
