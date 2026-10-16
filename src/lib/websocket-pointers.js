const clamp = value => Math.max(0, Math.min(1, value));
export const websocketPointerMessageEvent = 'urlAutofill:websocket-pointer-message';
export const websocketPointerOverlayEvent = 'urlAutofill:websocket-pointer-overlay';
export const websocketPointerOverlayStateEvent = 'urlAutofill:websocket-pointer-overlay-state';

export function pointerPosition(event, bounds) {
  const x = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
  const y = bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0;
  return {
    id: event.pointerId,
    x: Math.round(clamp(x) * 10000) / 10000,
    y: Math.round(clamp(y) * 10000) / 10000,
    kind: event.pointerType || 'mouse',
    pressure: Math.round(clamp(event.pressure || 0) * 1000) / 1000
  };
}

export function touchPosition(touch, bounds, id) {
  return pointerPosition({ pointerId: id, pointerType: 'touch',
    clientX: touch.clientX, clientY: touch.clientY, pressure: touch.force || 0 }, bounds);
}

export function pointerPositionsMessage(phase, changed, activePointers, plane = 'z', axisLock = null) {
  return { type: 'pointer_positions', phase, plane, axis_lock: axisLock, changed,
    pointers: [...activePointers].sort((a, b) => a.id - b.id) };
}
