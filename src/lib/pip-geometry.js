const margin = 8;
const topInset = 56;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function clampPipRect(rect, viewport) {
  const maxWidth = Math.max(1, viewport.width - margin * 2);
  const maxHeight = Math.max(1, viewport.height - topInset - margin);
  const width = clamp(rect.width, Math.min(160, maxWidth), maxWidth);
  const height = clamp(rect.height, Math.min(100, maxHeight), maxHeight);
  return {
    left: clamp(rect.left, margin, viewport.width - margin - width),
    top: clamp(rect.top, topInset, viewport.height - margin - height),
    width,
    height
  };
}

export function initialPipRect(viewport) {
  const width = Math.min(360, Math.max(220, viewport.width * .5));
  const height = width * 9 / 16 + 28;
  return clampPipRect({ left: viewport.width - width - 16,
    top: viewport.height - height - 16, width, height }, viewport);
}

export function movePipRect(rect, dx, dy, viewport) {
  return clampPipRect({ ...rect, left: rect.left + dx, top: rect.top + dy }, viewport);
}

export function pinchPipRect(rect, startMidpoint, midpoint, scale, viewport) {
  const maxWidth = Math.max(1, viewport.width - margin * 2);
  const maxHeight = Math.max(1, viewport.height - topInset - margin);
  const minimum = Math.max(Math.min(160, maxWidth) / rect.width,
    Math.min(100, maxHeight) / rect.height);
  const maximum = Math.min(maxWidth / rect.width, maxHeight / rect.height);
  const nextScale = clamp(scale, Math.min(minimum, maximum), maximum);
  const width = rect.width * nextScale;
  const height = rect.height * nextScale;
  const anchorX = (startMidpoint.x - rect.left) / rect.width;
  const anchorY = (startMidpoint.y - rect.top) / rect.height;
  return clampPipRect({
    left: midpoint.x - anchorX * width,
    top: midpoint.y - anchorY * height,
    width, height
  }, viewport);
}
