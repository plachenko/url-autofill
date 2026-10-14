export function isTeslaCarBrowser(userAgent) {
  return /\b(?:Tesla\/|QtCarBrowser\b)/i.test(userAgent || '');
}
