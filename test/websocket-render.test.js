import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProgressMessage } from '../src/lib/websocket-render.js';

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
