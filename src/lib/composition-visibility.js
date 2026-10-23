export function trackIsVisible(modes, index) {
  return !modes[index]?.muted &&
    (!modes.some(mode => mode?.solo) || Boolean(modes[index]?.solo));
}

export function visibleCompositionItem(items, seconds, modes = []) {
  let visible = null;
  for (const item of items) {
    if (!trackIsVisible(modes, item.track)) continue;
    if (seconds < item.start || seconds >= item.end) continue;
    if (!visible || item.track < visible.track ||
        (item.track === visible.track && item.start > visible.start)) visible = item;
  }
  return visible;
}

export function audibleCompositionItems(items, seconds, modes = []) {
  return items.filter(item => item.item?.type === 'video' &&
    seconds >= item.start && seconds < item.end && trackIsVisible(modes, item.track));
}

export function compositionAudioTime(entry, seconds) {
  const sourceOffset = entry.item.sourceOffset || 0;
  return Math.max(sourceOffset, Math.min(sourceOffset + entry.item.duration,
    sourceOffset + entry.sourceStart + (seconds - entry.start) * (entry.speed || 1)));
}
