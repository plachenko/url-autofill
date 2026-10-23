export const dockEdges = ['top', 'right', 'bottom', 'left'];
export const pipTimelineThreshold = 90;

export function dockEdgeAt(point, bounds, threshold = 32) {
  const distances = [
    ['top', point.y - bounds.top],
    ['right', bounds.right - point.x],
    ['bottom', bounds.bottom - point.y],
    ['left', point.x - bounds.left]
  ];
  const nearest = distances.reduce((best, candidate) =>
    Math.abs(candidate[1]) < Math.abs(best[1]) ? candidate : best);
  return Math.abs(nearest[1]) <= threshold ? nearest[0] : null;
}

export function dockEdgeForPip(point, rect, bounds) {
  const pointerEdge = dockEdgeAt(point, bounds);
  if (pointerEdge) return pointerEdge;
  const distances = [
    ['top', rect.top - bounds.top],
    ['right', bounds.right - rect.left - rect.width],
    ['bottom', bounds.bottom - rect.top - rect.height],
    ['left', rect.left - bounds.left]
  ];
  const nearest = distances.reduce((best, candidate) =>
    candidate[1] < best[1] ? candidate : best);
  return nearest[1] <= 12 ? nearest[0] : null;
}

export function timelineSizeAt(point, bounds, edge) {
  const horizontal = edge === 'left' || edge === 'right';
  const length = horizontal ? bounds.width : bounds.height;
  if (length <= 0) return null;
  const distance = edge === 'top' ? bounds.bottom - point.y
    : edge === 'bottom' ? point.y - bounds.top
    : edge === 'left' ? bounds.right - point.x
    : point.x - bounds.left;
  const size = Math.max(0, Math.min(100, distance / length * 100));
  return size >= pipTimelineThreshold ? 100 : size;
}
