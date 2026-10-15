const clamp = value => Math.max(0, Math.min(1, value));

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

export function pointerPositionsMessage(phase, changed, activePointers) {
  return { type: 'pointer_positions', phase, changed,
    pointers: [...activePointers].sort((a, b) => a.id - b.id) };
}
