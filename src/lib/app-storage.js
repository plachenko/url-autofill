const sessionFormat = 'url-autofill-session';
const sessionVersion = 1;
const isAppKey = key => key?.startsWith('urlAutofill.') ||
  key?.startsWith('paneforge:urlAutofill.');

function appStorageKeys(storage) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter(isAppKey);
}

function snapshotAppStorage(storage) {
  return Object.fromEntries(appStorageKeys(storage).flatMap(key => {
    const value = storage.getItem(key);
    return value === null ? [] : [[key, value]];
  }));
}

export function clearAppStorage(storage) {
  const keys = appStorageKeys(storage);
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

export function createSessionBackup(storage) {
  return { format: sessionFormat, version: sessionVersion,
    savedAt: new Date().toISOString(), entries: snapshotAppStorage(storage) };
}

export function restoreSessionBackup(storage, backup) {
  if (!backup || backup.format !== sessionFormat || backup.version !== sessionVersion ||
      !backup.entries || typeof backup.entries !== 'object' || Array.isArray(backup.entries))
    throw new Error('This is not a supported URL Autofill session file.');
  const entries = Object.entries(backup.entries);
  if (entries.some(([key, value]) => !isAppKey(key) || typeof value !== 'string'))
    throw new Error('The session file contains invalid saved data.');
  const previous = snapshotAppStorage(storage);
  try {
    clearAppStorage(storage);
    for (const [key, value] of entries) storage.setItem(key, value);
  } catch (error) {
    clearAppStorage(storage);
    for (const [key, value] of Object.entries(previous)) storage.setItem(key, value);
    throw error;
  }
  return entries.length;
}
