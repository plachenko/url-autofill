import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneObjectMessage, validSceneCommand } from '../src/lib/websocket-scene-objects.js';
const catalog = { type: 'scene_objects', version: 1, revision: 2, scene: { id: 'scene-1', name: 'Scene' },
  objects: [{ id: 'object-1', name: 'Ball', object_type: 'MESH', can_follow: true }] };
test('scene advertisements and follow replies are separate from render/files', () => {
  assert.deepEqual(sceneObjectMessage(JSON.stringify(catalog)), catalog);
  assert.equal(sceneObjectMessage('{"type":"file_start"}'), null);
  assert.equal(sceneObjectMessage('{"type":"render_progress"}'), null);
  assert.deepEqual(sceneObjectMessage('{"type":"pointer_follow_result","request_id":"pick-1","ok":false}'),
    { type: 'pointer_follow_result', request_id: 'pick-1', ok: false });
  assert.equal(sceneObjectMessage('{"type":"scene_objects_pending","version":1}').type, 'scene_objects_pending');
});
test('rejects malformed lists, duplicate IDs and unversioned payloads', () => {
  for (const value of [{ ...catalog, revision: 0 }, { ...catalog, version: 2 }, { ...catalog, objects: [catalog.objects[0], catalog.objects[0]] },
    { ...catalog, objects: [{ ...catalog.objects[0], can_follow: 'true' }] }])
    assert.equal(sceneObjectMessage(JSON.stringify(value)), null);
});
test('follow commands bind selections to a specific scene and revision', () => {
  const command = { type: 'pointer_follow', request_id: 'pick-1', scene_id: 'scene-1', revision: 2, object_id: 'object-1', enable: true };
  assert.equal(validSceneCommand(command), true);
  assert.equal(validSceneCommand({ type: 'scene_objects_request' }), true);
  assert.equal(validSceneCommand({ ...command, revision: 0 }), false);
  assert.equal(validSceneCommand({ ...command, enable: 'true' }), false);
  assert.equal(validSceneCommand({ ...command, object_id: '' }), false);
});

test('plane dimensions accept bounded finite sizes and recognize acknowledgements', () => {
  const command = { type: 'pointer_plane_set', request_id: 'size', scene_id: 'scene-1', revision: 2, width: 8, height: 6 };
  assert.equal(validSceneCommand(command), true);
  for (const width of [0, -1, true, '8', NaN, Infinity, 1000001])
    assert.equal(validSceneCommand({ ...command, width }), false);
  assert.equal(sceneObjectMessage('{"type":"pointer_plane_set_result","request_id":"size","ok":true}').ok, true);
});

test('auto keyframe modes and timeline frames are validated', () => {
  const start = { type: 'pointer_record_start', request_id: 'record', scene_id: 'scene-1',
    revision: 2, frame_step: 5, mode: 'down' };
  assert.equal(validSceneCommand(start), true);
  assert.equal(validSceneCommand({ ...start, mode: 'up' }), true);
  assert.equal(validSceneCommand({ ...start, mode: 'hover' }), false);
  assert.equal(validSceneCommand({ ...start, frame_step: 0 }), false);
  assert.equal(validSceneCommand({ type: 'pointer_frame_set', request_id: 'frame',
    scene_id: 'scene-1', revision: 2, frame: 20 }), true);
  const timeline = { start: 1, end: 50, current: 20, keyframes: [1, 10, 20] };
  assert.deepEqual(sceneObjectMessage(JSON.stringify({ ...catalog, timeline })).timeline, timeline);
  assert.equal(sceneObjectMessage(JSON.stringify({ ...catalog,
    timeline: { ...timeline, keyframes: [NaN] } })), null);
});

test('render commands require a scene revision and recognize the result', () => {
  const command = { type: 'pointer_render', request_id: 'render-1', scene_id: 'scene-1', revision: 2 };
  assert.equal(validSceneCommand(command), true);
  assert.equal(validSceneCommand({ ...command, revision: 0 }), false);
  assert.deepEqual(sceneObjectMessage('{"type":"pointer_render_result","request_id":"render-1","ok":true}'),
    { type: 'pointer_render_result', request_id: 'render-1', ok: true });
});
