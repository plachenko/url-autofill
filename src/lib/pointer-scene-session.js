import { validSceneCommand } from './websocket-scene-objects.js';

const validSize = value => typeof value === 'string' && value.trim() !== '' &&
  Number.isFinite(Number(value)) && Number(value) >= .001 && Number(value) <= 1000000;

export function createPointerSceneSession({ sendCommand, resetGesture, onChange,
  setTimer = setTimeout, clearTimer = clearTimeout, makeRequestId = () => crypto.randomUUID(), timeoutMs = 8000 }) {
  let discoveryTimer = null;
  let commandTimer = null;
  let state = {
    connected: false, catalog: null, discovery: 'idle', selectedId: '', attachedId: '',
    draftWidth: '', draftHeight: '', confirmedWidth: null, confirmedHeight: null,
    dirty: false, conflict: false, draftFrameStep: '1', draftRecordMode: 'down', pending: null,
    acceptedRevision: 0, error: '', notice: ''
  };
  const snapshot = () => ({ ...state });
  const publish = () => onChange(snapshot());
  const requestCatalog = () => { if (state.connected) sendCommand({ type: 'scene_objects_request' }); };
  const clearDiscovery = () => {
    if (discoveryTimer !== null) clearTimer(discoveryTimer);
    discoveryTimer = null;
  };
  const clearPending = () => {
    if (commandTimer !== null) clearTimer(commandTimer);
    commandTimer = null;
    state.pending = null;
  };
  const startDiscovery = () => {
    clearDiscovery();
    state.discovery = 'waiting';
    discoveryTimer = setTimer(() => {
      discoveryTimer = null;
      if (!state.catalog && state.connected) {
        state.discovery = 'unavailable';
        publish();
      }
    }, timeoutMs);
    requestCatalog();
  };

  function connect() {
    clearPending();
    state = { ...state, connected: true, catalog: null, selectedId: '', attachedId: '',
      draftWidth: '', draftHeight: '', confirmedWidth: null, confirmedHeight: null,
      dirty: false, conflict: false, pending: null, acceptedRevision: 0, error: '', notice: '' };
    startDiscovery();
    publish();
  }

  function disconnect() {
    clearPending();
    clearDiscovery();
    state = { ...state, connected: false, catalog: null, discovery: 'idle',
      selectedId: '', attachedId: '', draftWidth: '', draftHeight: '',
      confirmedWidth: null, confirmedHeight: null, dirty: false, conflict: false,
      pending: null, acceptedRevision: 0, error: '', notice: '' };
    publish();
  }

  function receive(message) {
    if (message === null) { disconnect(); return; }
    if (!state.connected) return;
    if (message.type === 'scene_objects_pending') {
      if (!state.catalog) state.discovery = 'waiting';
      publish();
      return;
    }
    if (message.type === 'scene_objects') {
      const old = state.catalog;
      const sceneChanged = old && old.scene.id !== message.scene.id;
      if (!sceneChanged && message.revision < Math.max(state.acceptedRevision, old?.revision || 0)) return;
      if (old && !sceneChanged && (
        old.pointer?.width !== message.pointer?.width || old.pointer?.height !== message.pointer?.height ||
        old.pointer?.followed_object_id !== message.pointer?.followed_object_id ||
        old.pointer?.target_id !== message.pointer?.target_id ||
        old.pointer?.enabled !== message.pointer?.enabled ||
        old.pointer?.plane !== message.pointer?.plane ||
        old.pointer?.use_browser_plane !== message.pointer?.use_browser_plane
      )) resetGesture();
      if (sceneChanged) {
        clearPending();
        resetGesture();
        state.selectedId = '';
        state.attachedId = '';
        state.dirty = false;
        state.conflict = false;
        state.notice = 'Blender scene changed. Select an object again.';
        state.acceptedRevision = 0;
      }
      state.catalog = message;
      if (!message.capabilities?.includes('pointer_record_down') && state.draftRecordMode === 'down')
        state.draftRecordMode = 'move';
      if (!message.capabilities?.includes('pointer_record_up') && state.draftRecordMode === 'up')
        state.draftRecordMode = 'move';
      state.discovery = 'ready';
      clearDiscovery();
      const objects = new Set(message.objects.map(object => object.id));
      if (state.selectedId && !objects.has(state.selectedId)) {
        state.selectedId = '';
        state.error = 'The selected object is no longer in this scene.';
      }
      const pointer = message.pointer || {};
      state.attachedId = pointer.followed_object_id || '';
      if (!old || sceneChanged) state.selectedId = objects.has(state.attachedId) ? state.attachedId : '';
      const width = pointer.width;
      const height = pointer.height;
      if (Number.isFinite(width) && Number.isFinite(height)) {
        const changed = state.confirmedWidth !== null &&
          (state.confirmedWidth !== width || state.confirmedHeight !== height);
        const expected = state.pending?.kind === 'size' &&
          state.pending.width === width && state.pending.height === height;
        if (changed && state.dirty && !expected) state.conflict = true;
        state.confirmedWidth = width;
        state.confirmedHeight = height;
        if (!state.dirty || sceneChanged) {
          state.draftWidth = String(width);
          state.draftHeight = String(height);
          state.dirty = false;
        }
      }
      publish();
      return;
    }
    if (!['pointer_follow_result', 'pointer_plane_set_result',
          'pointer_record_start_result', 'pointer_record_stop_result', 'pointer_frame_set_result'].includes(message.type) ||
        !state.pending || message.request_id !== state.pending.requestId) return;
    const pending = state.pending;
    const expectedType = ({ follow: 'pointer_follow_result', size: 'pointer_plane_set_result',
      recordStart: 'pointer_record_start_result', recordStop: 'pointer_record_stop_result',
      frame: 'pointer_frame_set_result' })[pending.kind];
    if (message.type !== expectedType) return;
    if (message.scene_id && message.scene_id !== pending.sceneId) return;
    clearPending();
    if (!message.ok) {
      state.error = message.message || 'Blender rejected the command.';
      if (/stale|changed|revision|scene/i.test(state.error)) {
        if (pending.kind === 'follow') state.selectedId = '';
        else if (pending.kind === 'size') state.conflict = true;
        requestCatalog();
      }
      publish();
      return;
    }
    state.error = '';
    state.notice = message.message || ({ follow: 'Object attached.', size: 'Plane size applied.',
      recordStart: 'Auto Keyframe enabled.', recordStop: 'Recording stopped.',
      frame: 'Timeline moved.' })[pending.kind];
    if (Number.isSafeInteger(message.revision))
      state.acceptedRevision = Math.max(state.acceptedRevision, message.revision);
    if (pending.kind === 'follow') state.attachedId = message.object_id || pending.objectId;
    else if (pending.kind === 'size') {
      state.confirmedWidth = Number.isFinite(message.width) ? message.width : pending.width;
      state.confirmedHeight = Number.isFinite(message.height) ? message.height : pending.height;
      state.draftWidth = String(state.confirmedWidth);
      state.draftHeight = String(state.confirmedHeight);
      state.dirty = false;
      state.conflict = false;
    }
    requestCatalog();
    publish();
  }

  function choose(objectId) {
    if (!state.catalog || state.pending) return;
    const object = state.catalog.objects.find(item => item.id === objectId);
    state.selectedId = object?.can_follow ? objectId : '';
    state.error = '';
    publish();
  }

  function setDraft(field, value) {
    if (!['width', 'height'].includes(field) || state.pending) return;
    state[field === 'width' ? 'draftWidth' : 'draftHeight'] = value;
    state.dirty = state.draftWidth !== String(state.confirmedWidth) ||
      state.draftHeight !== String(state.confirmedHeight);
    state.error = '';
    publish();
  }

  function reloadDraft() {
    if (state.pending || state.confirmedWidth === null) return;
    state.draftWidth = String(state.confirmedWidth);
    state.draftHeight = String(state.confirmedHeight);
    state.dirty = false;
    state.conflict = false;
    state.error = '';
    publish();
  }

  function startCommand(command, pending) {
    if (!validSceneCommand(command)) return false;
    state.pending = pending;
    state.error = '';
    state.notice = '';
    commandTimer = setTimer(() => {
      if (state.pending !== pending) return;
      clearPending();
      state.error = 'Blender did not respond. Refreshing scene state; review it before trying again.';
      requestCatalog();
      publish();
    }, timeoutMs);
    sendCommand(command);
    publish();
    return true;
  }

  function canEdit(capability) {
    const pointer = state.catalog?.pointer || {};
    return state.connected && state.catalog?.capabilities?.includes(capability) &&
      !state.pending && state.catalog.revision >= state.acceptedRevision &&
      !pointer.recording && !pointer.rendering;
  }

  function attach() {
    if (!canEdit('pointer_follow') || !state.selectedId) return false;
    const object = state.catalog.objects.find(item => item.id === state.selectedId);
    if (!object?.can_follow) return false;
    resetGesture();
    const requestId = `pick-${makeRequestId()}`;
    const command = { type: 'pointer_follow', request_id: requestId,
      scene_id: state.catalog.scene.id, revision: state.catalog.revision,
      object_id: state.selectedId, enable: true };
    return startCommand(command, { kind: 'follow', requestId, sceneId: command.scene_id,
      objectId: state.selectedId });
  }

  function applySize() {
    if (!canEdit('pointer_plane_set') || state.conflict) return false;
    if (!validSize(state.draftWidth) || !validSize(state.draftHeight)) {
      state.error = 'Enter a plane width and height between 0.001 and 1,000,000 Blender units.';
      publish();
      return false;
    }
    const width = Number(state.draftWidth);
    const height = Number(state.draftHeight);
    if (width === state.confirmedWidth && height === state.confirmedHeight) return false;
    resetGesture();
    const requestId = `size-${makeRequestId()}`;
    const command = { type: 'pointer_plane_set', request_id: requestId,
      scene_id: state.catalog.scene.id, revision: state.catalog.revision, width, height };
    return startCommand(command, { kind: 'size', requestId, sceneId: command.scene_id, width, height });
  }

  function setFrameStep(value) {
    if (state.pending) return;
    state.draftFrameStep = value;
    state.error = '';
    publish();
  }

  function setRecordMode(value) {
    if (state.pending || !['move', 'down', 'up'].includes(value)) return;
    state.draftRecordMode = value;
    publish();
  }

  function recordCommand(kind) {
    const catalog = state.catalog;
    const pointer = catalog?.pointer || {};
    if (!state.connected || !catalog?.capabilities?.includes('pointer_record_move') ||
        state.pending || catalog.revision < state.acceptedRevision || pointer.rendering) return false;
    if (kind === 'start' && (!pointer.enabled || pointer.recording)) return false;
    if (kind === 'start' && state.draftRecordMode === 'down' &&
        !catalog.capabilities.includes('pointer_record_down')) return false;
    if (kind === 'start' && state.draftRecordMode === 'up' &&
        !catalog.capabilities.includes('pointer_record_up')) return false;
    if (kind === 'stop' && (!pointer.recording || !['move', 'down', 'up'].includes(pointer.record_mode))) return false;
    const step = Number(state.draftFrameStep);
    if (kind === 'start' && (!/^[0-9]+$/.test(state.draftFrameStep) ||
        !Number.isSafeInteger(step) || step < 1 || step > 1000)) {
      state.error = 'Enter a frame spacing from 1 to 1000.';
      publish();
      return false;
    }
    const requestId = `record-${makeRequestId()}`;
    const command = { type: `pointer_record_${kind}`, request_id: requestId,
      scene_id: catalog.scene.id, revision: catalog.revision };
    if (kind === 'start') {
      command.frame_step = step;
      command.mode = state.draftRecordMode;
    }
    return startCommand(command, { kind: kind === 'start' ? 'recordStart' : 'recordStop',
      requestId, sceneId: command.scene_id });
  }

  function startAutoKeyframe() { return recordCommand('start'); }
  function stopAutoKeyframe() { return recordCommand('stop'); }

  function seekFrame(value) {
    if (!canEdit('pointer_timeline')) return false;
    const frame = Number(value);
    if (!Number.isSafeInteger(frame) || Math.abs(frame) > 1048574) return false;
    resetGesture();
    const requestId = `frame-${makeRequestId()}`;
    const command = { type: 'pointer_frame_set', request_id: requestId,
      scene_id: state.catalog.scene.id, revision: state.catalog.revision, frame };
    return startCommand(command, { kind: 'frame', requestId, sceneId: command.scene_id });
  }

  function close() { clearPending(); clearDiscovery(); }
  return { snapshot, connect, disconnect, receive, choose, setDraft, reloadDraft,
    setFrameStep, setRecordMode, startAutoKeyframe, stopAutoKeyframe, seekFrame,
    attach, applySize, canEdit, close, requestCatalog };
}
