import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createFileReceiver } from '../src/lib/websocket-files.js';

const chunkSize = 192 * 1024;
function fixture(options = {}) {
  const replies = [], progress = [], files = [];
  const receiver = createFileReceiver({ send: wire => replies.push(JSON.parse(wire)),
    onProgress: p => progress.push(p), onComplete: f => files.push(f),
    digest: bytes => webcrypto.subtle.digest('SHA-256', bytes), ...options });
  return { receiver, replies, progress, files, receive: m => receiver.receive(JSON.stringify(m)) };
}
const start = (data, overrides = {}) => ({ type: 'file_start', id: 'test', name: 'render.mp4',
  mime: 'video/mp4', bytes: data.length, chunks: Math.ceil(data.length / chunkSize), encoding: 'base64', ...overrides });
const chunk = (data, index = 0, id = 'test') => ({ type: 'file_chunk', id, index,
  data: data.subarray(index * chunkSize, (index + 1) * chunkSize).toString('base64') });
const end = (data, overrides = {}) => ({ type: 'file_end', id: 'test',
  sha256: createHash('sha256').update(data).digest('hex'), ...overrides });

test('reassembles arbitrary binary bytes in index order and acknowledges only after SHA-256 verification', async () => {
  const f = fixture(), data = Buffer.alloc(chunkSize * 2 + 7, 255);
  await f.receive(start(data));
  for (const index of [2, 0, 1]) await f.receive(chunk(data, index));
  assert.deepEqual(f.replies, []);
  assert.equal(f.progress.at(-1).received, data.length);
  await f.receive(end(data));
  assert.deepEqual(Buffer.from(await f.files[0].blob.arrayBuffer()), data);
  assert.equal(f.files[0].mime, 'video/mp4');
  assert.deepEqual(f.replies, [{ type: 'file_ack', id: 'test', ok: true }]);
  assert.deepEqual(f.progress.slice(-2).map(p => p.state), ['Verifying', 'Complete']);
});

test('empty and unknown files remain downloadable', async () => {
  const f = fixture(), data = Buffer.alloc(0);
  await f.receive(start(data, { name: 'empty.custom', mime: 'application/x-custom' }));
  await f.receive(end(data));
  assert.equal(f.files[0].blob.size, 0);
  assert.equal(f.files[0].name, 'empty.custom');
  assert.equal(f.replies[0].ok, true);
});

test('legacy messages are left to the existing text/image handler', async () => {
  const f = fixture();
  for (const value of ['hello', 'data:image/png;base64,AAAA', '{"image":"AAAA"}', 'null'])
    assert.equal(await f.receiver.receive(value), false);
  assert.deepEqual(f.progress, []);
});

test('identical duplicates do not advance progress twice; conflicting duplicates fail', async () => {
  const f = fixture(), data = Buffer.from('abc');
  await f.receive(start(data));
  await f.receive(chunk(data)); await f.receive(chunk(data));
  assert.equal(f.progress.at(-1).received, 3);
  await f.receive(chunk(Buffer.from('xyz')));
  assert.equal(f.progress.at(-1).state, 'Failed');
  assert.match(f.replies[0].error, /Conflicting/);
});

test('rejects missing chunks, corrupt checksums, invalid indexes, malformed base64, and wrong lengths', async t => {
  const data = Buffer.from('abc');
  const cases = [
    [[], end(data), /missing/],
    [[chunk(data)], end(data, { sha256: '0'.repeat(64) }), /mismatch/],
    [[], { ...chunk(data), index: -1 }, /Invalid file chunk/],
    [[], { ...chunk(data), data: '!!!!' }, /Invalid file chunk/],
    [[], { ...chunk(data), data: 'YQ==' }, /Invalid chunk length/]
  ];
  for (const [initial, invalid, message] of cases) await t.test(message.source, async () => {
    const f = fixture();
    await f.receive(start(data));
    for (const m of initial) await f.receive(m);
    await f.receive(invalid);
    assert.equal(f.files.length, 0);
    assert.equal(f.replies[0].ok, false);
    assert.match(f.replies[0].error, message);
  });
});

test('metadata limits prevent oversized allocations', async () => {
  for (const overrides of [{ bytes: -1 }, { chunks: 1000 }, { bytes: 513 * 1024 * 1024 }, { encoding: 'raw' }]) {
    const f = fixture();
    await f.receive(start(Buffer.from('abc'), overrides));
    assert.equal(f.replies[0].ok, false);
    assert.equal(f.files.length, 0);
  }
});

test('timeouts, disconnects, and cancellations release buffers without later completing', async () => {
  const data = Buffer.from('abc');
  const f = fixture({ timeoutMs: 5 });
  await f.receive(start(data));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(f.replies[0].error, /timed out/);
  const g = fixture();
  await g.receive(start(data)); g.receiver.cancel('test');
  await g.receive(chunk(data)); await g.receive(end(data));
  assert.equal(g.progress.at(-1).state, 'Cancelled');
  assert.equal(g.files.length, 0);
  const h = fixture();
  await h.receive(start(data)); h.receiver.dispose();
  assert.equal(h.progress.at(-1).state, 'Failed');
  assert.equal(await h.receive(end(data)), false);
});

test('disconnect or cancellation during asynchronous verification cannot acknowledge success', async () => {
  let resolveDigest;
  const f = fixture({ digest: () => new Promise(resolve => { resolveDigest = resolve; }) });
  const data = Buffer.from('abc');
  await f.receive(start(data)); await f.receive(chunk(data));
  const pending = f.receive(end(data));
  await new Promise(resolve => setImmediate(resolve));
  f.receiver.dispose();
  resolveDigest(await webcrypto.subtle.digest('SHA-256', data));
  await pending;
  assert.equal(f.files.length, 0);
  assert.equal(f.replies.length, 0);
});
