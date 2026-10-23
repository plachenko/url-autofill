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
  assert.equal(previewEntryForSource('selected', clips, items, 3, new Set(),
    [{ muted: true }, {}]), items[2]);
  assert.equal(previewEntryForSource('track:0', clips, items, 3, new Set(),
    [{ muted: true }, {}]), items[1]);
  assert.equal(previewEntryForSource('track:0', clips, items, 6), null);
});

test('an unlocked clip view loops independently of the cursor', () => {
  const entry = { start: 2, end: 6, duration: 4 };
  assert.equal(previewSourceTime('clip:0:0', entry, 10, false, 5), 3);
  assert.equal(previewSourceTime('selected', entry, 10, false, 5), 3);
  assert.equal(previewSourceTime('clip:0:0', entry, 3, true, 5), 3);
  assert.equal(previewSourceTime('clip:0:0', entry, 10, true, 5), null);
  assert.equal(previewSourceTime('clip:0:0', entry, 10, false, 5, null, 'one-shot'), 5.999);
  assert.equal(previewSourceTime('clip:0:0', entry, 10, false, 5, null, 'ping-pong'), 5);
});

test('the unlocked selected split follows the loop across tracks while the yellow cursor stays put', () => {
  const clips = [[{ id: 'first' }], [{ id: 'second' }]];
  const items = [
    { clipRef: clips[0][0], track: 0, start: 0, end: 3, duration: 3 },
    { clipRef: clips[1][0], track: 1, start: 4, end: 8, duration: 4 }
  ];
  const entry = previewEntryForSource('selected', clips, items, 1,
    new Set([clips[0][0]]), [], 5);
  assert.equal(entry, items[1]);
  assert.equal(previewSourceTime('selected', entry, 1, false, 0, 5), 5);
  assert.equal(previewEntryForSource('selected', clips, items, 1,
    new Set([clips[0][0]]), [], 3.5), null);
  assert.equal(previewSourceTime('selected', items[0], 1, true, 0, 5), 1);
});
