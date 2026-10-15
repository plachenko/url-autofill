export function renderProgressMessage(value) {
  let m;
  try { m = JSON.parse(value); } catch { return null; }
  if (m?.type !== 'render_progress' || typeof m.id !== 'string' || !m.id ||
      !['Rendering', 'Complete', 'Cancelled'].includes(m.state) ||
      !Number.isSafeInteger(m.completed) || m.completed < 0 ||
      (m.total !== null && (!Number.isSafeInteger(m.total) || m.total < 1 || m.completed > m.total)) ||
      !Number.isSafeInteger(m.frame) || typeof m.scene !== 'string') return null;
  return { id: m.id, state: m.state, scene: m.scene, frame: m.frame,
    completed: m.completed, total: m.total };
}

export function updateRenderTimeEstimate(previous, progress, now) {
  if (progress.state !== 'Rendering' || !progress.total || progress.completed >= progress.total)
    return null;
  if (!previous || previous.id !== progress.id || previous.total !== progress.total ||
      progress.completed < previous.lastCompleted) {
    return { id: progress.id, total: progress.total, firstCompleted: progress.completed,
      firstAt: now, lastCompleted: progress.completed, finishAt: null };
  }
  if (progress.completed === previous.lastCompleted) return previous;
  const elapsed = now - previous.firstAt;
  const frames = progress.completed - previous.firstCompleted;
  return { ...previous, lastCompleted: progress.completed,
    finishAt: elapsed > 0 && frames > 0
      ? now + elapsed / frames * (progress.total - progress.completed) : null };
}

export function renderTimeLeft(estimate, now) {
  if (!estimate?.finishAt || estimate.finishAt <= now) return null;
  const seconds = Math.ceil((estimate.finishAt - now) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
