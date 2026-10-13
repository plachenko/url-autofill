import test from 'node:test';
import assert from 'node:assert/strict';
import { websocketImageDataUrl } from '../src/lib/websocket-image.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';

test('renders raw base64 image replies', () => {
  assert.equal(websocketImageDataUrl(png), `data:image/png;base64,${png}`);
});

test('renders image data URIs and JSON image replies', () => {
  assert.equal(websocketImageDataUrl(`data:image/png;base64,${png}`), `data:image/png;base64,${png}`);
  assert.equal(websocketImageDataUrl(JSON.stringify({ image: png, mimeType: 'image/png' })),
    `data:image/png;base64,${png}`);
});

test('rejects replies that are not base64 images', () => {
  assert.throws(() => websocketImageDataUrl('hello'), /invalid base64 data/);
  assert.throws(() => websocketImageDataUrl('aGVsbG8='), /Image format not recognized/);
});
