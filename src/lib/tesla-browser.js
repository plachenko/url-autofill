export function isTeslaCarBrowser(userAgent) {
  return /\b(?:Tesla\b(?!Browser)|QtCarBrowser\b)/i.test(userAgent || '');
}
