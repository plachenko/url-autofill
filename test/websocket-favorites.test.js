import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteServerUrl, loadWebsocketFavorites, saveWebsocketFavorites,
  websocketFavoritesKey, websocketServerUrl } from '../src/lib/websocket-favorites.js';

test('favorite server URLs accept only WebSocket endpoints and normalize duplicates', () => {
  assert.equal(websocketServerUrl(' wss://example.com '), 'wss://example.com/');
  assert.throws(() => websocketServerUrl('https://example.com'), /ws:\/\/ or wss:\/\//);
  assert.equal(favoriteServerUrl('not a URL'), '');
  const values = new Map([[websocketFavoritesKey,
    JSON.stringify(['wss://example.com', 'wss://example.com/', 'https://example.com', 4])]]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  assert.deepEqual(loadWebsocketFavorites(storage), ['wss://example.com/']);
  saveWebsocketFavorites(storage, ['ws://localhost:8080/']);
  assert.deepEqual(loadWebsocketFavorites(storage), ['ws://localhost:8080/']);
});

test('invalid saved favorites do not prevent loading the panel', () => {
  assert.deepEqual(loadWebsocketFavorites({ getItem: () => '{' }), []);
});
