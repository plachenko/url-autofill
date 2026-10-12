export function clearAppStorage(storage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter(key => key?.startsWith('urlAutofill.') ||
      key?.startsWith('paneforge:urlAutofill.'));
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}
