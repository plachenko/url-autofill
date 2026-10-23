export function clampLoopBounds(start, end, duration) {
  const limit = Math.max(0, duration);
  const minimum = Math.min(.1, limit);
  const from = Math.max(0, Math.min(start, limit - minimum));
  const to = Math.max(from + minimum, Math.min(end, limit));
  return { start: from, end: to };
}

export function wrapLoopTime(seconds, start, end) {
  const length = end - start;
  if (length <= 0) return start;
  return start + (((seconds - start) % length) + length) % length;
}

export const loopModes = ['repeat', 'one-shot', 'ping-pong'];

export function loopPositionAtElapsed(elapsed, start, end, mode = 'repeat') {
  const length = end - start;
  if (length <= 0) return { seconds: start, direction: 1, finished: true };
  const endFrame = Math.max(start, end - .001);
  const time = Math.max(0, elapsed);
  if (mode === 'one-shot') return time >= length
    ? { seconds: endFrame, direction: 1, finished: true }
    : { seconds: start + time, direction: 1, finished: false };
  if (mode === 'ping-pong') {
    const phase = time % (2 * length);
    return phase >= length
      ? { seconds: Math.max(start, Math.min(endFrame, end - (phase - length))),
        direction: -1, finished: false }
      : { seconds: Math.min(endFrame, start + phase), direction: 1, finished: false };
  }
  return { seconds: start + time % length, direction: 1, finished: false };
}

export function loopElapsedAtFrame(seconds, start, end, mode = 'repeat', direction = 1) {
  const length = Math.max(0, end - start);
  const offset = Math.max(0, Math.min(length, seconds - start));
  return mode === 'ping-pong' && direction < 0 ? 2 * length - offset : offset;
}
