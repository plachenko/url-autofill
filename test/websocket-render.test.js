import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProgressMessage, renderTimeLeft, updateRenderTimeEstimate } from '../src/lib/websocket-render.js';

const message = overrides => JSON.stringify({ type: 'render_progress', id: 'render-1',
  scene: 'Scene', state: 'Rendering', frame: 1, completed: 0, total: null, ...overrides });
test('rendering is indeterminate until Blender knows the frame count', () => {
  assert.equal(renderProgressMessage(message()).total, null);
  assert.deepEqual(renderProgressMessage(message({ frame: 3, completed: 2, total: 10 })),
    { id: 'render-1', scene: 'Scene', state: 'Rendering', frame: 3, completed: 2, total: 10 });
});
test('accepts completion and cancellation without mixing in file transfers', () => {
  assert.equal(renderProgressMessage(message({ state: 'Complete', completed: 1, total: 1 })).state, 'Complete');
  assert.equal(renderProgressMessage(message({ state: 'Cancelled' })).state, 'Cancelled');
  assert.equal(renderProgressMessage('{"type":"file_chunk"}'), null);
});
test('invalid render counters cannot create misleading progress', () => {
  for (const overrides of [{ completed: -1 }, { total: 0 }, { total: 1, completed: 2 },
    { frame: '2' }, { state: 'anything' }, { id: '' }])
    assert.equal(renderProgressMessage(message(overrides)), null);
});

test('time left uses observed frame pace and counts down between updates', () => {
  const progress = (completed, overrides = {}) => ({ id: 'render-1', state: 'Rendering',
    completed, total: 10, ...overrides });
  const first = updateRenderTimeEstimate(null, progress(2), 1000);
  assert.equal(renderTimeLeft(first, 1000), null);
  const estimate = updateRenderTimeEstimate(first, progress(4), 5000);
  assert.equal(renderTimeLeft(estimate, 5000), '12s');
  assert.equal(renderTimeLeft(estimate, 6000), '11s');
  assert.equal(renderTimeLeft(estimate, 17000), null);
  assert.equal(updateRenderTimeEstimate(estimate, progress(4), 6000), estimate);
});

test('time estimate resets for a changed render, frame count, or completed state', () => {
  const progress = { id: 'render-1', state: 'Rendering', completed: 2, total: 10 };
  const first = updateRenderTimeEstimate(null, progress, 1000);
  const changed = updateRenderTimeEstimate(first, { ...progress, id: 'render-2' }, 2000);
  assert.equal(changed.finishAt, null);
  assert.equal(changed.firstCompleted, 2);
  assert.equal(updateRenderTimeEstimate(first, { ...progress, total: 12 }, 2000).finishAt, null);
  assert.equal(updateRenderTimeEstimate(first, { ...progress, completed: 1 }, 2000).finishAt, null);
  assert.equal(updateRenderTimeEstimate(first, { ...progress, state: 'Complete' }, 2000), null);
  assert.equal(updateRenderTimeEstimate(first, { ...progress, total: null }, 2000), null);
});
