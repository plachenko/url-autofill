import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointerSceneSession } from '../src/lib/pointer-scene-session.js';

function harness() {
  const commands = [];
  const events = [];
  const timers = new Map();
  let nextTimer = 0;
  let nextRequest = 0;
  let resets = 0;
  const session = createPointerSceneSession({
    sendCommand: command => { commands.push(command); events.push(command.type); },
    resetGesture: () => { resets++; events.push('reset'); },
    onChange: () => {},
    setTimer: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimer: id => timers.delete(id),
    makeRequestId: () => String(++nextRequest)
  });
  return { session, commands, events, timers, get resets() { return resets; } };
}

const catalog = (revision = 2, overrides = {}) => ({
  type: 'scene_objects', version: 1, revision, scene: { id: 'scene-1', name: 'Scene' },
  objects: [
    { id: 'ball', name: 'Ball', object_type: 'MESH', can_follow: true },
    { id: 'locked', name: 'Locked', object_type: 'MESH', can_follow: false, reason: 'Linked library' }
  ], total: 2, truncated: false, capabilities: ['pointer_follow', 'pointer_plane_set', 'scene_objects_request'],
  pointer: { enabled: true, followed_object_id: null, target_id: null, origin_id: null,
    width: 6, height: 2, plane: 'XY', use_browser_plane: true, recording: false, rendering: false },
  ...overrides
});

test('connect requests discovery, attaches by scene revision, and waits for the matching result', () => {
  const h = harness();
  h.session.connect();
  assert.deepEqual(h.commands, [{ type: 'scene_objects_request' }]);
  h.session.receive(catalog());
  h.session.choose('locked');
  assert.equal(h.session.snapshot().selectedId, '');
  h.session.choose('ball');
  assert.equal(h.session.attach(), true);
  assert.equal(h.resets, 1);
  assert.deepEqual(h.commands[1], { type: 'pointer_follow', request_id: 'pick-1',
    scene_id: 'scene-1', revision: 2, object_id: 'ball', enable: true });
  assert.equal(h.session.snapshot().pending.kind, 'follow');
  assert.equal(h.session.applySize(), false);
  h.session.receive({ type: 'pointer_follow_result', request_id: 'wrong', ok: true, object_id: 'ball' });
  assert.equal(h.session.snapshot().pending.kind, 'follow');
  h.session.receive({ type: 'pointer_follow_result', request_id: 'pick-1', ok: true,
    object_id: 'ball', revision: 3 });
  assert.equal(h.session.snapshot().attachedId, 'ball');
  assert.equal(h.session.snapshot().pending, null);
  h.session.receive(catalog(2));
  assert.equal(h.session.snapshot().attachedId, 'ball', 'an older catalog cannot undo the acknowledgement');
});

test('size Apply validates drafts, resets gestures, and reconciles catalog before result', () => {
  const h = harness();
  h.session.connect();
  h.session.receive(catalog());
  h.session.setDraft('width', '');
  assert.equal(h.session.applySize(), false);
  assert.match(h.session.snapshot().error, /width and height/);
  h.session.setDraft('width', '8');
  h.session.setDraft('height', '6');
  assert.equal(h.session.applySize(), true);
  assert.deepEqual(h.events.slice(-2), ['reset', 'pointer_plane_set']);
  assert.deepEqual(h.commands.at(-1), { type: 'pointer_plane_set', request_id: 'size-1',
    scene_id: 'scene-1', revision: 2, width: 8, height: 6 });
  h.session.receive(catalog(3, { pointer: { ...catalog().pointer, width: 8, height: 6 } }));
  assert.equal(h.session.snapshot().conflict, false);
  assert.equal(h.session.snapshot().pending.kind, 'size');
  h.session.receive({ type: 'pointer_plane_set_result', request_id: 'size-1', ok: true,
    revision: 3, width: 8, height: 6 });
  assert.equal(h.session.snapshot().pending, null);
  assert.equal(h.session.snapshot().dirty, false);
  assert.equal(h.session.snapshot().confirmedWidth, 8);
});

test('remote edits preserve a draft and require explicit reload before Apply', () => {
  const h = harness();
  h.session.connect();
  h.session.receive(catalog());
  h.session.setDraft('width', '9');
  h.session.receive(catalog(3, { pointer: { ...catalog().pointer, width: 7 } }));
  assert.equal(h.resets, 1, 'a remote size change ends the current gesture');
  assert.equal(h.session.snapshot().draftWidth, '9');
  assert.equal(h.session.snapshot().confirmedWidth, 7);
  assert.equal(h.session.snapshot().conflict, true);
  assert.equal(h.session.applySize(), false);
  h.session.reloadDraft();
  assert.equal(h.session.snapshot().draftWidth, '7');
  h.session.setDraft('width', '9');
  assert.equal(h.session.applySize(), true);
  assert.equal(h.commands.at(-1).revision, 3);
});

test('recording and rendering lock commands, and a response for another scene is ignored', () => {
  const h = harness();
  h.session.connect();
  h.session.receive(catalog(2, { pointer: { ...catalog().pointer, recording: true } }));
  h.session.choose('ball');
  assert.equal(h.session.attach(), false);
  h.session.setDraft('width', '8');
  assert.equal(h.session.applySize(), false);
  h.session.receive(catalog(3, { pointer: { ...catalog().pointer, rendering: true } }));
  assert.equal(h.session.attach(), false);
  assert.equal(h.session.applySize(), false);
  h.session.receive(catalog(4));
  assert.equal(h.session.attach(), true);
  h.session.receive({ type: 'pointer_follow_result', request_id: 'pick-1', scene_id: 'other-scene', ok: true });
  assert.equal(h.session.snapshot().pending.kind, 'follow');
  h.session.receive({ type: 'pointer_follow_result', request_id: 'pick-1', scene_id: 'scene-1', ok: true,
    object_id: 'ball', revision: 5 });
  assert.equal(h.session.snapshot().attachedId, 'ball');
});

test('stale failures, scene switches, timeout and reconnect never replay an old command', () => {
  const h = harness();
  h.session.connect();
  h.session.receive(catalog());
  h.session.choose('ball');
  h.session.attach();
  h.session.receive({ type: 'pointer_follow_result', request_id: 'pick-1', ok: false,
    message: 'Scene revision changed' });
  assert.equal(h.session.snapshot().selectedId, '');
  assert.equal(h.commands.at(-1).type, 'scene_objects_request');
  h.session.receive(catalog(3));
  h.session.choose('ball');
  h.session.attach();
  h.session.receive(catalog(1, { scene: { id: 'scene-2', name: 'New scene' } }));
  assert.equal(h.session.snapshot().pending, null);
  assert.equal(h.session.snapshot().selectedId, '');
  h.session.receive({ type: 'pointer_follow_result', request_id: 'pick-2', ok: true, object_id: 'ball' });
  assert.equal(h.session.snapshot().attachedId, '');
  h.session.choose('ball');
  h.session.attach();
  for (const callback of [...h.timers.values()]) callback();
  assert.equal(h.session.snapshot().pending, null);
  assert.match(h.session.snapshot().error, /did not respond/);
  const before = h.commands.length;
  h.session.disconnect();
  h.session.connect();
  assert.equal(h.commands.length, before + 1, 'only discovery is sent on reconnect');
  assert.equal(h.commands.at(-1).type, 'scene_objects_request');
});
