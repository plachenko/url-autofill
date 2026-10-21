import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaletteClip, paletteDataUri } from '../src/lib/palette-objects.js';
import { loadMedia, mediaStorageKey, updatePaletteClip } from '../src/lib/media-store.js';

function storage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}

test('a placed Palette object can be edited without changing its clip ID', () => {
  const saved = storage();
  globalThis.window = { localStorage: saved };
  try {
    const id = createPaletteClip({ kind: 'empty', label: 'Placeholder', seconds: 3 });
    const original = loadMedia(id);
    assert.match(atob(original.src.split(',')[1]), /Empty clip/);
    const text = { kind: 'text', label: 'Title', color: '#ffcc00', text: 'Hello & goodbye', seconds: 5 };
    updatePaletteClip(id, paletteDataUri(text), text, text.seconds);
    assert.equal(JSON.parse(saved.getItem(`${mediaStorageKey(id)}.meta`)).palette.label, 'Title');
    assert.equal(loadMedia(id).seconds, 5);
    assert.match(atob(loadMedia(id).src.split(',')[1]), /Hello &amp; goodbye/);
    assert.throws(() => updatePaletteClip('missing', paletteDataUri(text), text, 5), /editable Palette/);
  } finally {
    delete globalThis.window;
  }
});
