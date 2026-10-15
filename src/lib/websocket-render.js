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
