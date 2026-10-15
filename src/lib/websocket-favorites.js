export const websocketFavoritesKey = 'urlAutofill.websocketFavorites.v1';
export const websocketFavoritesChangedEvent = 'urlAutofill:websocket-favorites-changed';
export const websocketConnectRequestEvent = 'urlAutofill:websocket-connect-request';
export const websocketConnectionEvent = 'urlAutofill:websocket-connection';
export const websocketConnectionRequestEvent = 'urlAutofill:websocket-connection-request';

export function websocketServerUrl(value) {
  const url = new URL(value.trim());
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:')
    throw new Error('Use a ws:// or wss:// server URL.');
  return url.href;
}

export function favoriteServerUrl(value) {
  try { return websocketServerUrl(value); }
  catch { return ''; }
}

export function loadWebsocketFavorites(storage) {
  try {
    const saved = JSON.parse(storage.getItem(websocketFavoritesKey) || '[]');
    if (!Array.isArray(saved)) return [];
    return [...new Set(saved.filter(value => typeof value === 'string')
      .map(favoriteServerUrl).filter(Boolean))];
  } catch { return []; }
}

export function saveWebsocketFavorites(storage, favorites) {
  storage.setItem(websocketFavoritesKey, JSON.stringify(favorites));
}
