import assert from 'node:assert/strict';
import test from 'node:test';
import { audibleCompositionItems, compositionAudioTime,
  visibleCompositionItem } from '../src/lib/composition-visibility.js';

test('the top active track takes visibility after tracks are reordered', () => {
  const bottom = { id: 'bottom', track: 1, start: 0, end: 5 };
  const top = { id: 'top', track: 0, start: 1, end: 3 };
  const items = [bottom, top];

  assert.equal(visibleCompositionItem(items, 2), top);
  assert.equal(visibleCompositionItem(items, 4), bottom);
  assert.equal(visibleCompositionItem(items, 5), null);

  top.track = 1;
  bottom.track = 0;
  assert.equal(visibleCompositionItem(items, 2), bottom);
});

test('the later starting clip wins when clips overlap on one track', () => {
  const earlier = { id: 'earlier', track: 0, start: 0, end: 5 };
  const later = { id: 'later', track: 0, start: 2, end: 4 };
  assert.equal(visibleCompositionItem([earlier, later], 3), later);
});

test('mute hides a track and solo restricts the composition to soloed tracks', () => {
  const top = { track: 0, start: 0, end: 5 };
  const middle = { track: 1, start: 0, end: 5 };
  const bottom = { track: 2, start: 0, end: 5 };
  const items = [top, middle, bottom];

  assert.equal(visibleCompositionItem(items, 2, [{ muted: true }, {}, {}]), middle);
  assert.equal(visibleCompositionItem(items, 2, [{}, {}, { solo: true }]), bottom);
  assert.equal(visibleCompositionItem(items, 2, [{ solo: true }, {}, { solo: true }]), top);
  assert.equal(visibleCompositionItem(items, 2, [{ muted: true, solo: true }, {}, {}]), null);
});

test('audio includes overlapping video clips and obeys mute and solo', () => {
  const first = { item: { type: 'video' }, track: 0, start: 0, end: 5 };
  const second = { item: { type: 'video' }, track: 1, start: 1, end: 4 };
  const still = { item: { type: 'image' }, track: 1, start: 0, end: 5 };
  const items = [first, second, still];

  assert.deepEqual(audibleCompositionItems(items, 2), [first, second]);
  assert.deepEqual(audibleCompositionItems(items, 2, [{ muted: true }, {}]), [second]);
  assert.deepEqual(audibleCompositionItems(items, 2, [{}, { solo: true }]), [second]);
  assert.deepEqual(audibleCompositionItems(items, 4), [first]);
});

test('track audio follows trimmed clips and archive source offsets', () => {
  const entry = { item: { duration: 12, sourceOffset: 4 },
    start: 3, sourceStart: 2, end: 8 };
  assert.equal(compositionAudioTime(entry, 3), 6);
  assert.equal(compositionAudioTime(entry, 5), 8);
  assert.equal(compositionAudioTime(entry, 20), 16);
  entry.speed = 2;
  assert.equal(compositionAudioTime(entry, 5), 10);
  entry.speed = .5;
  assert.equal(compositionAudioTime(entry, 5), 7);
});
