export function visibleCompositionItem(items, seconds) {
  let visible = null;
  for (const item of items) {
    if (seconds < item.start || seconds >= item.end) continue;
    if (!visible || item.track < visible.track ||
        (item.track === visible.track && item.start > visible.start)) visible = item;
  }
  return visible;
}
