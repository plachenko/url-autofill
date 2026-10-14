export function removeSelectedTracks(tracks, selectedTracks, activeIndex) {
  const activeTrack = tracks[activeIndex];
  const remaining = tracks.filter(track => !selectedTracks.has(track));
  const nextTracks = remaining.length ? remaining : [[]];
  return {
    tracks: nextTracks,
    activeIndex: remaining.includes(activeTrack)
      ? remaining.indexOf(activeTrack) : Math.min(activeIndex, nextTracks.length - 1)
  };
}
