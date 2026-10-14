export function isTeslaCarBrowser(userAgent) {
  return /\b(?:Tesla\b(?!Browser)|QtCarBrowser\b)/i.test(userAgent || '');
}

export const teslaTheaterPreferenceKey = 'urlAutofill.teslaTheater.v1';
export const teslaTheaterPreferenceEvent = 'tesla-theater-preference-change';
export const teslaTheaterTransferParam = 'teslaTheater';

export function hasTeslaTheaterPreference(storage) {
  try { return storage?.getItem(teslaTheaterPreferenceKey) === '1'; }
  catch { return false; }
}

export function canShowTeslaTheater(userAgent, storage) {
  return isTeslaCarBrowser(userAgent) || hasTeslaTheaterPreference(storage);
}

export function adoptTeslaTheaterLink(href, storage) {
  const url = new URL(href);
  if (url.searchParams.get(teslaTheaterTransferParam) !== '1') return null;
  try { storage.setItem(teslaTheaterPreferenceKey, '1'); }
  catch { return null; }
  url.searchParams.delete(teslaTheaterTransferParam);
  return url;
}
