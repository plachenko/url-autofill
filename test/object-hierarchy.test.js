import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleObjectRows } from '../src/lib/object-hierarchy.js';

test('Blender parents appear before children and collapsed branches stay hidden', () => {
  const objects = [
    { id: 'child', parent_id: 'root' },
    { id: 'root', parent_id: null },
    { id: 'grandchild', parent_id: 'child' },
    { id: 'other', parent_id: null }
  ];
  assert.deepEqual(visibleObjectRows(objects).map(row => [row.object.id, row.depth, row.hasChildren]), [
    ['root', 0, true], ['child', 1, true], ['grandchild', 2, false], ['other', 0, false]
  ]);
  assert.deepEqual(visibleObjectRows(objects, new Set(['root'])).map(row => row.object.id),
    ['root', 'other']);
});

test('missing parents and malformed cycles remain visible once', () => {
  const objects = [
    { id: 'orphan', parent_id: 'missing' },
    { id: 'a', parent_id: 'b' },
    { id: 'b', parent_id: 'a' }
  ];
  assert.deepEqual(visibleObjectRows(objects).map(row => row.object.id), ['orphan', 'a', 'b']);
});
