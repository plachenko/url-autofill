import assert from 'node:assert/strict';
import test from 'node:test';
import { initialPipRect, movePipRect, pinchPipRect, pipRectAtPoint } from '../src/lib/pip-geometry.js';

const viewport = { width: 800, height: 600 };

test('a moved preview stays inside the visible viewport', () => {
  const initial = initialPipRect(viewport);
  assert.ok(initial.left >= 8 && initial.top >= 56);
  const moved = movePipRect(initial, -1000, -1000, viewport);
  assert.equal(moved.left, 8);
  assert.equal(moved.top, 56);
});

test('a divider release places the preview around the pointer and keeps its size', () => {
  const rect = { left: 20, top: 80, width: 200, height: 150 };
  assert.deepEqual(pipRectAtPoint(rect, { x: 450, y: 300 }, viewport),
    { left: 350, top: 225, width: 200, height: 150 });
  assert.deepEqual(pipRectAtPoint(rect, { x: 0, y: 300 }, viewport),
    { left: 8, top: 225, width: 200, height: 150 });
});

test('pinch resize keeps the touched point beneath the moving midpoint', () => {
  const rect = { left: 100, top: 100, width: 200, height: 150 };
  const resized = pinchPipRect(rect, { x: 200, y: 175 },
    { x: 250, y: 200 }, 1.5, viewport);
  assert.deepEqual(resized, { left: 100, top: 87.5, width: 300, height: 225 });
});

test('pinch size is limited by the viewport and keeps its aspect ratio', () => {
  const rect = { left: 100, top: 100, width: 200, height: 150 };
  const resized = pinchPipRect(rect, { x: 200, y: 175 },
    { x: 200, y: 175 }, 20, viewport);
  assert.equal(resized.width / resized.height, rect.width / rect.height);
  assert.ok(resized.left >= 8 && resized.left + resized.width <= viewport.width - 8);
  assert.ok(resized.top >= 56 && resized.top + resized.height <= viewport.height - 8);
});
