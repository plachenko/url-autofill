import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleCompositionItem } from '../src/lib/composition-visibility.js';

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
