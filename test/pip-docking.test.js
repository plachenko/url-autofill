import assert from 'node:assert/strict';
import test from 'node:test';
import { dockEdgeAt, dockEdgeForPip, pipTimelineThreshold, timelineSizeAt } from '../src/lib/pip-docking.js';

const bounds = { left: 0, top: 50, right: 800, bottom: 600, width: 800, height: 550 };

test('a floating preview docks at each edge, but stays floating in the center', () => {
  assert.equal(dockEdgeAt({ x: 400, y: 55 }, bounds), 'top');
  assert.equal(dockEdgeAt({ x: 795, y: 300 }, bounds), 'right');
  assert.equal(dockEdgeAt({ x: 400, y: 595 }, bounds), 'bottom');
  assert.equal(dockEdgeAt({ x: 5, y: 300 }, bounds), 'left');
  assert.equal(dockEdgeAt({ x: 400, y: 300 }, bounds), null);
});

test('placing the preview box against an edge docks even when the pointer is inside it', () => {
  const pointer = { x: 400, y: 300 };
  assert.equal(dockEdgeForPip(pointer,
    { left: 8, top: 150, width: 200, height: 150 }, bounds), 'left');
  assert.equal(dockEdgeForPip(pointer,
    { left: 592, top: 150, width: 200, height: 150 }, bounds), 'right');
  assert.equal(dockEdgeForPip(pointer,
    { left: 200, top: 58, width: 200, height: 150 }, bounds), 'top');
  assert.equal(dockEdgeForPip(pointer,
    { left: 200, top: 442, width: 200, height: 150 }, bounds), 'bottom');
});

test('dragging the divider sizes the timeline on the opposite side of the preview', () => {
  assert.equal(timelineSizeAt({ x: 200, y: 160 }, bounds, 'top'), 80);
  assert.equal(timelineSizeAt({ x: 200, y: 490 }, bounds, 'bottom'), 80);
  assert.equal(timelineSizeAt({ x: 160, y: 300 }, bounds, 'left'), 80);
  assert.equal(timelineSizeAt({ x: 640, y: 300 }, bounds, 'right'), 80);
  assert.equal(pipTimelineThreshold, 90);
  assert.equal(timelineSizeAt({ x: 80, y: 300 }, bounds, 'left'), 100);
  assert.equal(timelineSizeAt({ x: 720, y: 300 }, bounds, 'right'), 100);
  assert.ok(timelineSizeAt({ x: 81, y: 300 }, bounds, 'left') < 100);
  assert.equal(timelineSizeAt({ x: 39, y: 300 }, bounds, 'left'), 100);
  assert.equal(timelineSizeAt({ x: 761, y: 300 }, bounds, 'right'), 100);
});
