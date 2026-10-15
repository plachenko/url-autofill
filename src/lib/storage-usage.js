export const textStorageBudget = 5 * 1024 * 1024;

// UTF-16 key/value lengths are an approximation, not a quota probe. Never
// fill storage to discover a limit: that could interfere with saved clips.
export function textStorageBytes(storage) {
  let bytes = 0;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key !== null) bytes += 2 * (key.length + (storage.getItem(key)?.length || 0));
  }
  return bytes;
}

export function storagePercent(used, limit) {
  return Number.isFinite(used) && used >= 0 && Number.isFinite(limit) && limit > 0
    ? Math.max(0, Math.min(100, used / limit * 100)) : null;
}

export function storageSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const unit = bytes < 1024 ** 2 ? 1 : bytes < 1024 ** 3 ? 2 : 3;
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`;
}
