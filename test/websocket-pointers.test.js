import test from 'node:test';
import assert from 'node:assert/strict';
import { pointerPosition, pointerPositionsMessage } from '../src/lib/websocket-pointers.js';

test('pointer positions are normalized to the touch surface', () => {
  const bounds = { left: 10, top: 20, width: 200, height: 100 };
  assert.deepEqual(pointerPosition({ pointerId: 7, pointerType: 'touch',
    clientX: 110, clientY: 45, pressure: .5 }, bounds),
  { id: 7, x: .5, y: .25, kind: 'touch', pressure: .5 });
  assert.deepEqual(pointerPosition({ pointerId: 8, pointerType: 'pen',
    clientX: -5, clientY: 200, pressure: 2 }, bounds),
  { id: 8, x: 0, y: 1, kind: 'pen', pressure: 1 });
});

test('multi-touch messages include every active contact and identify the changed one', () => {
  const first = { id: 5, x: .2, y: .3, kind: 'touch', pressure: .5 };
  const second = { id: 9, x: .8, y: .7, kind: 'touch', pressure: .5 };
  assert.deepEqual(pointerPositionsMessage('move', second, [second, first]), {
    type: 'pointer_positions', phase: 'move', plane: 'z', changed: second, pointers: [first, second]
  });
  assert.deepEqual(pointerPositionsMessage('up', first, [second]).pointers, [second]);
  assert.equal(pointerPositionsMessage('down', first, [first], 'x').plane, 'x');
});
