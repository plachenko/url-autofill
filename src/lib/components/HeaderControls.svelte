<script>
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { canShowTeslaTheater, teslaTheaterPreferenceEvent } from "../tesla-browser.js";
  import { loadWebsocketFavorites, websocketFavoritesKey, websocketFavoritesChangedEvent,
    websocketConnectRequestEvent, websocketConnectionEvent, websocketConnectionRequestEvent } from "../websocket-favorites.js";
  import { websocketPointerOverlayEvent, websocketPointerOverlayStateEvent } from "../websocket-pointers.js";

  let teslaBrowser = $state(false);
  let favorites = $state([]);
  let selectedServer = $state('');
  let activeServer = $state('');
  let connecting = $state(false);
  let connected = $state(false);
  let connectionStatus = $state('');
  let pointersOpen = $state(false);

  function refreshFavorites() {
    favorites = loadWebsocketFavorites(window.localStorage);
    if (!favorites.includes(selectedServer)) selectedServer = favorites[0] || '';
  }

  function onStorage(event) {
    if (event.key === websocketFavoritesKey || event.key === null) refreshFavorites();
  }

  function onConnection(event) {
    activeServer = event.detail.endpoint;
    connecting = event.detail.connecting;
    connected = event.detail.connected;
    connectionStatus = event.detail.status;
    if (connecting && favorites.includes(activeServer)) selectedServer = activeServer;
    if (!connected) pointersOpen = false;
  }

  function onPointerOverlayState(event) {
    pointersOpen = event.detail.open;
  }

  function togglePointers() {
    pointersOpen = !pointersOpen;
    window.dispatchEvent(new CustomEvent(websocketPointerOverlayEvent, { detail: { open: pointersOpen } }));
  }

  function connectFavorite() {
    if (!selectedServer) return;
    window.dispatchEvent(new CustomEvent(websocketConnectRequestEvent, { detail: { endpoint: selectedServer } }));
  }

  onMount(() => {
    const refresh = () => { teslaBrowser = canShowTeslaTheater(navigator.userAgent, window.localStorage); };
    refresh();
    refreshFavorites();
    window.addEventListener(teslaTheaterPreferenceEvent, refresh);
    window.addEventListener(websocketFavoritesChangedEvent, refreshFavorites);
    window.addEventListener('storage', onStorage);
    window.addEventListener(websocketConnectionEvent, onConnection);
    window.addEventListener(websocketPointerOverlayStateEvent, onPointerOverlayState);
    window.dispatchEvent(new Event(websocketConnectionRequestEvent));
    return () => {
      window.removeEventListener(teslaTheaterPreferenceEvent, refresh);
      window.removeEventListener(websocketFavoritesChangedEvent, refreshFavorites);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(websocketConnectionEvent, onConnection);
      window.removeEventListener(websocketPointerOverlayStateEvent, onPointerOverlayState);
    };
  });
</script>

<div class="h-[50px] flex flex-1 place-items-center">
  <div class="flex-1 p-2">
    <button
      id="menu-toggle"
      type="button"
      aria-label="Open menu"
      aria-controls="drawer"
      aria-expanded="false"
      ><svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M4 6h16M4 12h16M4 18h16" /></svg
      ></button
    >
  </div>
  {#if favorites.length}
    <div class="header-websocket">
      <select aria-label="Favorite WebSocket server" bind:value={selectedServer}>
        {#each favorites as favorite}
          <option value={favorite}>{favorite}</option>
        {/each}
      </select>
      <button id="header-websocket-connect" type="button" onclick={connectFavorite}
        disabled={connecting && activeServer === selectedServer}
        aria-label={`Connect to favorite WebSocket server ${selectedServer}`}
        title={activeServer === selectedServer ? connectionStatus : `Connect to ${selectedServer}`}>
        {connecting && activeServer === selectedServer ? 'Connecting…' : connected && activeServer === selectedServer ? 'Reconnect' : 'Connect'}
      </button>
      <span class="header-websocket-status" role="status" aria-live="polite">
        {activeServer === selectedServer && connected ? 'Connected' : activeServer === selectedServer && connecting ? 'Connecting' : ''}
      </span>
    </div>
  {/if}
  {#if connected}
    <button id="header-pointers-toggle" type="button" aria-controls="pointer-overlay"
      aria-expanded={pointersOpen} aria-pressed={pointersOpen} onclick={togglePointers}>Pointers</button>
  {/if}
  <div class="p-2">
    <button
      id="page-fullscreen"
      type="button"
      aria-label="Enter fullscreen"
      title="Enter fullscreen"
      aria-pressed="false"
      hidden
      ><svg class="icon-enter" viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" /></svg
      ><svg class="icon-exit" viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5" /></svg
      ></button
    >
    <button
      id="tesla-theater-button"
      type="button"
      aria-label="Tesla Theater fullscreen"
      title="Tesla Theater fullscreen"
      hidden={!teslaBrowser}
      ><img src="{base}/tesla-theater.svg" alt="" aria-hidden="true" /></button
    >
    <button id="fullscreen-restore" type="button" hidden
      >Restore fullscreen</button
    >
  </div>
</div>
