export const shortParameters = {
  text: 't', reply: 'r', usage: 'u', store: 's', part: 'p', total: 'n',
  mime: 'f', data: 'd', seconds: 'h', timeline: 'l', delete: 'x',
  tracks: 'tr', pos: 'at', action: 'a', speak: 'sp', mode: 'm',
  clip: 'c', delay: 'w'
};
export function compactParams() {
  const url = new URL(window.location.href);
  let changed = false;
  for (const [longName, shortName] of Object.entries(shortParameters)) {
    if (!url.searchParams.has(longName)) continue;
    if (!url.searchParams.has(shortName)) {
      url.searchParams.set(shortName, url.searchParams.get(longName));
    }
    url.searchParams.delete(longName);
    changed = true;
  }
  if (changed) {
    try { window.history.replaceState(null, '', url); }
    catch (error) { /* Keep using the short names even when history is unavailable. */ }
  }
  return url.searchParams;
}
