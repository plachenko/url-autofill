import test from 'node:test';
import assert from 'node:assert/strict';
import { storagePercent, storageSize, textStorageBytes } from '../src/lib/storage-usage.js';

test('estimates UTF-16 storage without changing any entries', () => {
  const data = new Map([['a', 'hello'], ['emoji', '😀']]);
  const storage = { length: data.size, key: i => [...data.keys()][i], getItem: k => data.get(k) };
  assert.equal(textStorageBytes(storage), 26);
  assert.equal(data.size, 2);
});
test('unknown quotas remain unknown; percentages stay in range', () => {
  assert.equal(storagePercent(0, 100), 0);
  assert.equal(storagePercent(90, 100), 90);
  assert.equal(storagePercent(110, 100), 100);
  assert.equal(storagePercent(null, 100), null);
  assert.equal(storagePercent(10, 0), null);
});
test('storage sizes use explicit binary units', () => {
  assert.equal(storageSize(0), '0 B');
  assert.equal(storageSize(1024), '1.0 KiB');
  assert.equal(storageSize(5 * 1024 ** 2), '5.0 MiB');
  assert.equal(storageSize(null), 'Unavailable');
});
