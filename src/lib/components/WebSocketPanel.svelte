<script>
  import { onMount } from 'svelte';
  import { websocketImageDataUrl } from '../websocket-image.js';
  import { websocketImageDropEvent } from '../websocket-image-drag.js';
  import { favoriteServerUrl, loadWebsocketFavorites, saveWebsocketFavorites, websocketServerUrl } from '../websocket-favorites.js';

  let serverUrl = '';
  let outgoingText = '';
  let returnText = '';
  let status = 'Disconnected.';
  let connected = false;
  let connecting = false;
  let socket = null;
  let imageSrc = '';
  let imageError = '';
  let favorites = [];
  let favoriteStatus = '';
  let imageDrag = null;
  let imageDropStatus = '';
  let imageDropError = false;
  $: normalizedServer = favoriteServerUrl(serverUrl);
  $: isFavorite = favorites.includes(normalizedServer);

  onMount(() => {
    favorites = loadWebsocketFavorites(window.localStorage);
    const params = new URL(window.location.href).searchParams;
    serverUrl = params.get('ws') ?? '';
    outgoingText = params.get('wsText') ?? '';
    if (serverUrl.trim()) connect();
    return () => {
      endImageDrag();
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  });

  function disconnect() {
    const current = socket;
    socket = null;
    connected = false;
    connecting = false;
    status = 'Disconnected.';
    current?.close();
  }

  function connect() {
    if (socket) disconnect();
    let endpoint;
    try {
      endpoint = websocketServerUrl(serverUrl);
      socket = new WebSocket(endpoint);
    } catch (error) {
      status = error.message || 'Could not connect to the server.';
      return;
    }

    const current = socket;
    connecting = true;
    status = 'Connecting…';
    current.onopen = () => {
      if (socket !== current) return;
      connecting = false;
      connected = true;
      status = 'Connected.';
    };
    current.onmessage = async (event) => {
      const value = event.data instanceof Blob ? await event.data.text() :
        event.data instanceof ArrayBuffer ? new TextDecoder().decode(event.data) : String(event.data);
      if (socket === current) {
        returnText = value;
        imageSrc = '';
        imageError = '';
        imageDropStatus = '';
      }
    };
    current.onerror = () => {
      if (socket === current) status = 'WebSocket error. Check the server URL and browser console.';
    };
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      connected = false;
      connecting = false;
      if (status !== 'WebSocket error. Check the server URL and browser console.') status = 'Disconnected.';
    };
  }

  function send(event) {
    event.preventDefault();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(outgoingText);
      status = 'Text sent.';
    } catch (error) {
      status = error.message || 'Could not send text.';
    }
  }

  function renderImage() {
    imageSrc = '';
    imageError = '';
    imageDropStatus = '';
    try { imageSrc = websocketImageDataUrl(returnText); }
    catch (error) { imageError = error.message || 'Could not render the image.'; }
  }

  function toggleFavorite() {
    try {
      const url = websocketServerUrl(serverUrl);
      const next = favorites.includes(url) ? favorites.filter(item => item !== url) : [...favorites, url];
      saveWebsocketFavorites(window.localStorage, next);
      favorites = next;
      favoriteStatus = next.includes(url) ? 'Server saved to favorites.' : 'Server removed from favorites.';
    } catch (error) {
      favoriteStatus = error.message || 'Could not save favorites in this browser.';
    }
  }

  function selectFavorite(event) {
    const url = event.currentTarget.value;
    if (!favorites.includes(url)) return;
    serverUrl = url;
    favoriteStatus = '';
    connect();
  }

  function endImageDrag(event) {
    if (!imageDrag) return;
    if (event?.pointerId !== undefined && event.pointerId !== imageDrag.pointerId) return;
    window.removeEventListener('pointermove', moveImageDrag);
    window.removeEventListener('pointerup', dropImage);
    window.removeEventListener('pointercancel', endImageDrag);
    imageDrag.ghost.remove();
    imageDrag = null;
    document.getElementById('preview-layout')?.dispatchEvent(new CustomEvent('preview-image-pointer-drag',
      { detail: { phase: 'end' } }));
    document.body.classList.remove('websocket-image-dragging');
    document.getElementById('track-list')?.classList.remove('websocket-image-drop-target');
  }

  function moveImageDrag(event) {
    if (!imageDrag || event.pointerId !== imageDrag.pointerId) return;
    event.preventDefault();
    imageDrag.ghost.style.left = `${event.clientX + 12}px`;
    imageDrag.ghost.style.top = `${event.clientY + 12}px`;
    const trackList = document.getElementById('track-list');
    const target = document.elementFromPoint(event.clientX, event.clientY);
    trackList?.classList.toggle('websocket-image-drop-target', Boolean(target && trackList.contains(target)));
    document.getElementById('preview-layout')?.dispatchEvent(new CustomEvent('preview-image-pointer-drag',
      { detail: { phase: 'move', clientX: event.clientX, clientY: event.clientY } }));
  }

  function dropImage(event) {
    if (!imageDrag || event.pointerId !== imageDrag.pointerId) return;
    const previewDrag = { phase: 'drop', clientX: event.clientX,
      clientY: event.clientY, src: imageDrag.src, handled: false };
    document.getElementById('preview-layout')?.dispatchEvent(new CustomEvent('preview-image-pointer-drag',
      { detail: previewDrag }));
    if (previewDrag.handled) {
      imageDropStatus = 'Image opened in a preview view.';
      imageDropError = false;
      endImageDrag();
      return;
    }
    const trackList = document.getElementById('track-list');
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && trackList?.contains(target)) {
      const detail = { src: imageDrag.src, clientX: event.clientX, target, message: '', error: false };
      trackList.dispatchEvent(new CustomEvent(websocketImageDropEvent, { detail }));
      imageDropStatus = detail.message;
      imageDropError = detail.error;
    } else {
      imageDropStatus = 'Drop the image on a timeline track.';
      imageDropError = true;
    }
    endImageDrag();
  }

  function startImageDrag(event) {
    if (!imageSrc || imageDrag || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    imageDropStatus = '';
    if (document.body.classList.contains('render-focus'))
      document.getElementById('timeline-toggle')?.click();
    const ghost = document.createElement('img');
    ghost.className = 'websocket-image-ghost';
    ghost.src = imageSrc;
    ghost.alt = '';
    ghost.draggable = false;
    document.body.append(ghost);
    imageDrag = { pointerId: event.pointerId, src: imageSrc, ghost };
    document.body.classList.add('websocket-image-dragging');
    window.addEventListener('pointermove', moveImageDrag);
    window.addEventListener('pointerup', dropImage);
    window.addEventListener('pointercancel', endImageDrag);
    moveImageDrag(event);
  }
</script>

<section id="websocket-panel" aria-label="WebSocket" tabindex="-1">
  <h2>WebSocket</h2>
  <label for="websocket-url">Server URL</label>
  <input id="websocket-url" type="url" bind:value={serverUrl} placeholder="wss://example.com/socket" spellcheck="false" autocomplete="url">
  <div class="websocket-favorites">
    <button type="button" onclick={toggleFavorite} aria-pressed={isFavorite} aria-label={isFavorite ? 'Remove server from favorites' : 'Save server as favorite'} title={isFavorite ? 'Remove server from favorites' : 'Save server as favorite'}>{isFavorite ? '★' : '☆'}</button>
    <select aria-label="Favorite WebSocket servers" value={isFavorite ? normalizedServer : ''} onchange={selectFavorite} disabled={!favorites.length}>
      <option value="">{favorites.length ? 'Choose a favorite server' : 'No favorite servers yet'}</option>
      {#each favorites as favorite}
        <option value={favorite}>{favorite}</option>
      {/each}
    </select>
  </div>
  {#if favoriteStatus}<p class="websocket-favorite-status" role="status">{favoriteStatus}</p>{/if}
  <div class="websocket-actions">
    <button type="button" onclick={connect} disabled={connecting}>{connecting ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}</button>
    <button type="button" onclick={disconnect} disabled={!socket}>Disconnect</button>
  </div>
  <p role="status" aria-live="polite">{status}</p>
  <form onsubmit={send}>
    <label for="websocket-text">Text to send</label>
    <textarea id="websocket-text" bind:value={outgoingText} placeholder="Enter text to send"></textarea>
    <button type="submit" disabled={!connected}>Send text</button>
  </form>
  <label for="websocket-return">Return text</label>
  <textarea id="websocket-return" value={returnText} placeholder="Server replies appear here" readonly></textarea>
  <button type="button" onclick={renderImage} disabled={!returnText.trim()}>Render image</button>
  {#if imageError}<p class="websocket-image-error" role="alert">{imageError}</p>{/if}
  {#if imageSrc}
    <img class="websocket-image" src={imageSrc} alt="WebSocket server reply" draggable="false" onpointerdown={startImageDrag} onerror={() => { imageSrc = ''; imageError = 'The browser could not display this image.'; }}>
    <p class="websocket-image-hint">Drag this image onto a timeline track.</p>
    {#if imageDropStatus}<p class:websocket-image-error={imageDropError} role="status">{imageDropStatus}</p>{/if}
  {/if}
</section>
