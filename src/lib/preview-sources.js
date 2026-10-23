import { visibleCompositionItem } from './composition-visibility.js';
import { loopPositionAtElapsed } from './loop-range.js';

export function previewEntryForSource(source, tracks, items, seconds,
  selectedClips = new Set(), trackModes = [], loopSeconds = null) {
  if (source === 'selected') {
    if (Number.isFinite(loopSeconds))
      return visibleCompositionItem(items, loopSeconds, trackModes);
    const selected = Array.from(selectedClips).at(-1);
    return selected ? items.find(item => item.clipRef === selected) || null
      : visibleCompositionItem(items, seconds, trackModes);
  }
  const parts = source?.split(':') || [];
  if (parts[0] === 'clip' && parts.length === 3) {
    const trackIndex = Number(parts[1]);
    const clipIndex = Number(parts[2]);
    const clip = tracks[trackIndex]?.[clipIndex];
    return items.find(item => item.clipRef === clip) || null;
  }
  if (parts[0] === 'track' && parts.length === 2) {
    const trackIndex = Number(parts[1]);
    return items.filter(item => item.track === trackIndex &&
      seconds >= item.start && seconds < item.end)
      .sort((a, b) => b.start - a.start)[0] || null;
  }
  return null;
}

export function previewSourceTime(source, entry, playheadSeconds, locked, elapsedSeconds,
  loopSeconds = null, loopMode = 'repeat') {
  if (!entry) return null;
  if (source === 'selected' && !locked && Number.isFinite(loopSeconds))
    return loopSeconds >= entry.start && loopSeconds < entry.end ? loopSeconds : null;
  if ((source.startsWith('clip:') || source === 'selected') && !locked) {
    return loopPositionAtElapsed(elapsedSeconds, entry.start, entry.end, loopMode).seconds;
  }
  return playheadSeconds >= entry.start && playheadSeconds < entry.end
    ? playheadSeconds : null;
}
