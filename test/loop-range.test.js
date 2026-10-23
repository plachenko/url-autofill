import test from 'node:test';
import assert from 'node:assert/strict';
import { clampLoopBounds, loopElapsedAtFrame, loopPositionAtElapsed, wrapLoopTime } from '../src/lib/loop-range.js';
import { visibleCompositionItem } from '../src/lib/composition-visibility.js';

test('a loop can span several clips and wraps across their shared timeline', () => {
  const bounds = clampLoopBounds(1, 12, 15);
  assert.deepEqual(bounds, { start: 1, end: 12 });
  assert.equal(wrapLoopTime(11.5, bounds.start, bounds.end), 11.5);
  assert.equal(wrapLoopTime(12, bounds.start, bounds.end), 1);
  assert.equal(wrapLoopTime(14, bounds.start, bounds.end), 3);
  assert.deepEqual(loopPositionAtElapsed(13, bounds.start, bounds.end),
    { seconds: 3, direction: 1, finished: false });
  const clips = [
    { id: 'first', track: 0, start: 1, end: 4 },
    { id: 'second', track: 1, start: 5, end: 9 },
    { id: 'third', track: 0, start: 10, end: 12 }
  ];
  assert.equal(visibleCompositionItem(clips, wrapLoopTime(6, 1, 12)), clips[1]);
  assert.equal(visibleCompositionItem(clips, wrapLoopTime(11, 1, 12)), clips[2]);
  assert.equal(visibleCompositionItem(clips, wrapLoopTime(4.5, 1, 12)), null);
});

test('saved loop bounds stay within the current composition after clips change', () => {
  assert.deepEqual(clampLoopBounds(8, 20, 10), { start: 8, end: 10 });
  assert.deepEqual(clampLoopBounds(20, 30, 10), { start: 9.9, end: 10 });
});

test('one shot holds the last frame and ping pong reverses at the bounds', () => {
  assert.deepEqual(loopPositionAtElapsed(4, 2, 6, 'one-shot'),
    { seconds: 5.999, direction: 1, finished: true });
  assert.deepEqual(loopPositionAtElapsed(5, 2, 6, 'ping-pong'),
    { seconds: 5, direction: -1, finished: false });
  assert.deepEqual(loopPositionAtElapsed(9, 2, 6, 'ping-pong'),
    { seconds: 3, direction: 1, finished: false });
  assert.equal(loopElapsedAtFrame(5, 2, 6, 'ping-pong', -1), 5);
  assert.equal(loopPositionAtElapsed(5, 2, 6, 'ping-pong').seconds, 5);
});
