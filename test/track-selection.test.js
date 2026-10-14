import assert from 'node:assert/strict';
import test from 'node:test';
import { removeSelectedTracks } from '../src/lib/track-selection.js';

test('deleting selected tracks preserves surviving tracks and the active track', () => {
  const first = [{ id: 'a' }];
  const second = [{ id: 'b' }];
  const third = [{ id: 'c' }];
  const result = removeSelectedTracks([first, second, third], new Set([first, third]), 1);
  assert.deepEqual(result.tracks, [second]);
  assert.equal(result.tracks[0], second);
  assert.equal(result.activeIndex, 0);
});

test('deleting the active track chooses a survivor and keeps one empty track if all are removed', () => {
  const first = [{ id: 'a' }];
  const second = [{ id: 'b' }];
  const remaining = removeSelectedTracks([first, second], new Set([second]), 1);
  assert.deepEqual(remaining.tracks, [first]);
  assert.equal(remaining.activeIndex, 0);

  const empty = removeSelectedTracks([first, second], new Set([first, second]), 1);
  assert.deepEqual(empty.tracks, [[]]);
  assert.equal(empty.activeIndex, 0);
});
