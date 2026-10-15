<script>
  import { onMount } from 'svelte';
  import { websocketImageDataUrl } from '../websocket-image.js';
  import { websocketImageDropEvent } from '../websocket-image-drag.js';
  import { createFileReceiver } from '../websocket-files.js';
  import { loadLatestWebSocketFile, saveLatestWebSocketFile } from '../received-media.js';
  import { mediaStorageKey, storeReceivedMedia, storeWholeMedia, validMediaId, validMime } from '../media-store.js';
  import { renderProgressMessage, renderTimeLeft, updateRenderTimeEstimate } from '../websocket-render.js';
  import { sceneObjectMessage, validSceneCommand, websocketSceneMessageEvent, websocketSceneCommandEvent } from '../websocket-scene-objects.js';
  import { websocketPointerMessageEvent } from '../websocket-pointers.js';
  import { favoriteServerUrl, loadWebsocketFavorites, saveWebsocketFavorites, websocketServerUrl,
    websocketFavoritesChangedEvent, websocketConnectRequestEvent, websocketConnectionEvent,
    websocketConnectionRequestEvent } from '../websocket-favorites.js';

  export let importOpen = false;

  let serverUrl = '';
  let outgoingText = '';
  let returnText = '';
  let returnIsFile = false;
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
  let fileReceiver = null;
  let fileProgress = null;
  let receivedFile = null;
  let filePreviewError = '';
  let fileRetentionError = '';
  let fileGeneration = 0;
  let saveClipId = '';
  let imageSeconds = 3;
  let savingClip = false;
  let saveClipStatus = '';
  let saveClipError = false;
  let renderProgress = null;
  let renderTiming = null;
  let renderClock = Date.now();
  $: renderPercent = renderProgress?.total ? renderProgress.completed / renderProgress.total * 100 : undefined;
  $: timeLeft = renderTimeLeft(renderTiming, renderClock);
  $: filePercent = fileProgress?.total ? Math.min(100, fileProgress.received / fileProgress.total * 100) :
    fileProgress?.state === 'Complete' ? 100 : 0;
  $: normalizedServer = favoriteServerUrl(serverUrl);
  $: isFavorite = favorites.includes(normalizedServer);
  function setConnected(value) {
    connected = value;
  }

  function publishConnection() {
    window.dispatchEvent(new CustomEvent(websocketConnectionEvent, {
      detail: { endpoint: favoriteServerUrl(serverUrl), connected, connecting, status }
    }));
  }

  function connectFromHeader(event) {
    serverUrl = event.detail.endpoint;
    connect();
  }

  function sendPointerMessage(event) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify(event.detail)); }
    catch {
      status = 'Could not send pointer positions.';
      publishConnection();
    }
  }

  function sendSceneCommand(event) {
    if (!socket || socket.readyState !== WebSocket.OPEN || !validSceneCommand(event.detail)) return;
    try { socket.send(JSON.stringify(event.detail)); }
    catch {
      status = 'Could not send scene object command.';
      publishConnection();
    }
  }

  onMount(() => {
    const renderClockTimer = window.setInterval(() => { renderClock = Date.now(); }, 1000);
    favorites = loadWebsocketFavorites(window.localStorage);
    const params = new URL(window.location.href).searchParams;
    serverUrl = params.get('ws') ?? '';
    outgoingText = params.get('wsText') ?? '';
    window.addEventListener(websocketConnectRequestEvent, connectFromHeader);
    window.addEventListener(websocketConnectionRequestEvent, publishConnection);
    window.addEventListener(websocketPointerMessageEvent, sendPointerMessage);
    window.addEventListener(websocketSceneCommandEvent, sendSceneCommand);
    publishConnection();
    if (serverUrl.trim()) connect();
    return () => {
      window.removeEventListener(websocketConnectRequestEvent, connectFromHeader);
      window.removeEventListener(websocketConnectionRequestEvent, publishConnection);
      window.removeEventListener(websocketPointerMessageEvent, sendPointerMessage);
      window.removeEventListener(websocketSceneCommandEvent, sendSceneCommand);
      window.clearInterval(renderClockTimer);
      endImageDrag();
      fileReceiver?.dispose();
      if (receivedFile) URL.revokeObjectURL(receivedFile.url);
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
    fileReceiver?.dispose();
    fileReceiver = null;
    interruptRender();
    socket = null;
    setConnected(false);
    window.dispatchEvent(new CustomEvent(websocketSceneMessageEvent, { detail: null }));
    connecting = false;
    status = 'Disconnected.';
    publishConnection();
    current?.close();
  }

  function connect() {
    if (socket) disconnect();
    renderProgress = null;
    renderTiming = null;
    fileProgress = null;
    fileRetentionError = '';
    let endpoint;
    try {
      endpoint = websocketServerUrl(serverUrl);
      socket = new WebSocket(endpoint);
    } catch (error) {
      status = error.message || 'Could not connect to the server.';
      publishConnection();
      return;
    }

    if (receivedFile?.endpoint !== endpoint && receivedFile) {
      URL.revokeObjectURL(receivedFile.url);
      receivedFile = null;
    }
    const restoreGeneration = ++fileGeneration;

    const current = socket;
    const files = createFileReceiver({
      send: message => { if (socket === current && current.readyState === WebSocket.OPEN) current.send(message); },
      onProgress: progress => { if (socket === current) fileProgress = progress; },
      onComplete: file => {
        if (socket !== current) return;
        ++fileGeneration;
        showReceivedFile(file, endpoint);
        void saveLatestWebSocketFile(file, endpoint).then(() => { fileRetentionError = ''; })
          .catch(() => { fileRetentionError = 'This browser could not keep the file for a reload. Download it now.'; });
      }
    });
    fileReceiver = files;
    let messages = Promise.resolve();
    connecting = true;
    status = 'Connecting…';
    publishConnection();
    current.onopen = () => {
      if (socket !== current) return;
      connecting = false;
      setConnected(true);
      status = 'Connected.';
      publishConnection();
      if (!receivedFile) void loadLatestWebSocketFile(endpoint).then(file => {
        if (file && socket === current && fileGeneration === restoreGeneration && !receivedFile && !fileProgress)
          showReceivedFile(file, endpoint, true);
      }).catch(() => { /* A live transfer still works when stored files are unavailable. */ });
    };
    current.onmessage = (event) => {
      // Serialize decoding and asynchronous checksum verification in wire order.
      messages = messages.then(async () => {
        if (socket !== current) return;
        const value = event.data instanceof Blob ? await event.data.text() :
          event.data instanceof ArrayBuffer ? new TextDecoder().decode(event.data) : String(event.data);
        if (socket !== current) return;
        const sceneMessage = sceneObjectMessage(value);
        if (sceneMessage) {
          window.dispatchEvent(new CustomEvent(websocketSceneMessageEvent, { detail: sceneMessage }));
          return;
        }
        const rendering = renderProgressMessage(value);
        if (rendering) {
          renderClock = Date.now();
          renderTiming = updateRenderTimeEstimate(renderTiming, rendering, renderClock);
          renderProgress = rendering;
          return;
        }
        if (await files.receive(value)) return;
        returnText = value;
        returnIsFile = false;
        imageSrc = '';
        imageError = '';
        imageDropStatus = '';
      }).catch(error => {
        if (socket === current) status = error.message || 'Could not read the server message.';
      });
    };
    current.onerror = () => {
      if (socket === current) {
        status = 'WebSocket error. Check the server URL and browser console.';
        publishConnection();
      }
    };
    current.onclose = () => {
      if (socket !== current) return;
      files.dispose();
      interruptRender();
      fileReceiver = null;
      socket = null;
      setConnected(false);
      window.dispatchEvent(new CustomEvent(websocketSceneMessageEvent, { detail: null }));
      connecting = false;
      if (status !== 'WebSocket error. Check the server URL and browser console.') status = 'Disconnected.';
      publishConnection();
    };
  }

  function showReceivedFile(file, endpoint, restored = false) {
    if (receivedFile) URL.revokeObjectURL(receivedFile.url);
    endImageDrag();
    imageSrc = '';
    imageError = '';
    receivedFile = { ...file, endpoint, restored, url: URL.createObjectURL(file.blob) };
    filePreviewError = '';
    saveClipStatus = '';
    returnText = `${restored ? 'Previously received' : 'Received'} ${file.name} (${file.bytes.toLocaleString()} bytes). ${restored ? 'Saved in this browser.' : 'SHA-256 verified.'}`;
    returnIsFile = true;
  }

  function interruptRender() {
    if (renderProgress?.state === 'Rendering') renderProgress = { ...renderProgress, state: 'Disconnected' };
    renderTiming = null;
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
    saveClipStatus = '';
    try { imageSrc = websocketImageDataUrl(returnText); }
    catch (error) { imageError = error.message || 'Could not render the image.'; }
  }

  async function saveAsClip(event) {
    event.preventDefault();
    if (savingClip) return;
    savingClip = true;
    saveClipError = false;
    saveClipStatus = '';
    try {
      const seconds = Number(imageSeconds);
      if (!Number.isFinite(seconds) || seconds < .1 || seconds > 3600)
        throw new Error('Image seconds must be between 0.1 and 3600.');
      const entered = saveClipId.trim();
      const base = `clip-${Date.now()}`;
      let id = entered || base;
      if (!validMediaId(id)) throw new Error('Clip ID must use 1–64 letters, numbers, _ or -.');
      for (let suffix = 1; !entered &&
          window.localStorage.getItem(`${mediaStorageKey(id)}.meta`) !== null; suffix++)
        id = `${base}-${suffix}`;
      if (imageSrc) storeWholeMedia(id, imageSrc, seconds);
      else if (receivedFile && validMime(receivedFile.mime))
        await storeReceivedMedia(id, receivedFile.blob, seconds);
      else throw new Error('Receive an image or video before saving a clip.');
      saveClipStatus = `Saved ${id} as a clip. Open Saved to use it.`;
      saveClipId = '';
      document.dispatchEvent(new CustomEvent('urlAutofill:clip-saved', { detail: { id } }));
    } catch (error) {
      saveClipError = true;
      saveClipStatus = error.message || 'Could not save the clip.';
    } finally { savingClip = false; }
  }

  function toggleFavorite() {
    try {
      const url = websocketServerUrl(serverUrl);
      const next = favorites.includes(url) ? favorites.filter(item => item !== url) : [...favorites, url];
      saveWebsocketFavorites(window.localStorage, next);
      favorites = next;
      window.dispatchEvent(new Event(websocketFavoritesChangedEvent));
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

  async function dropImage(event) {
    if (!imageDrag || event.pointerId !== imageDrag.pointerId) return;
    const previewDrag = { phase: 'drop', clientX: event.clientX,
      clientY: event.clientY, src: imageDrag.src, blob: imageDrag.blob,
      type: imageDrag.type, name: imageDrag.name, handled: false };
    document.getElementById('preview-layout')?.dispatchEvent(new CustomEvent('preview-image-pointer-drag',
      { detail: previewDrag }));
    if (previewDrag.handled) {
      imageDropStatus = 'Media opened in a preview view.';
      imageDropError = false;
      endImageDrag();
      return;
    }
    const trackList = document.getElementById('track-list');
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && trackList?.contains(target)) {
      const detail = { src: imageDrag.src, blob: imageDrag.blob, clientX: event.clientX, target, message: '', error: false };
      trackList.dispatchEvent(new CustomEvent(websocketImageDropEvent, { detail }));
      endImageDrag();
      imageDropStatus = 'Adding media to the timeline…';
      await detail.done;
      imageDropStatus = detail.message;
      imageDropError = detail.error;
    } else {
      imageDropStatus = 'Drop the media on a timeline track or preview pane.';
      imageDropError = true;
    }
    endImageDrag();
  }

  function startImageDrag(event, media = null) {
    const src = media?.url || imageSrc;
    if (!src || imageDrag || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    imageDropStatus = '';
    if (document.body.classList.contains('render-focus'))
      document.getElementById('timeline-toggle')?.click();
    const type = media?.mime.startsWith('video/') ? 'video' : 'image';
    const ghost = document.createElement(type === 'video' ? 'div' : 'img');
    ghost.className = 'websocket-image-ghost';
    if (type === 'image') { ghost.src = src; ghost.alt = ''; }
    else ghost.textContent = media.name;
    ghost.draggable = false;
    document.body.append(ghost);
    imageDrag = { pointerId: event.pointerId, src, ghost, type, blob: media?.blob, name: media?.name };
    document.body.classList.add('websocket-image-dragging');
    window.addEventListener('pointermove', moveImageDrag);
    window.addEventListener('pointerup', dropImage);
    window.addEventListener('pointercancel', endImageDrag);
    moveImageDrag(event);
  }

  function videoPoster(canvas, src) {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const draw = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const scale = Math.min(1, 960 / video.videoWidth, 540 / video.videoHeight);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    };
    video.addEventListener('loadeddata', draw);
    video.addEventListener('seeked', draw);
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(0.1, Math.max(0, video.duration || 0));
    });
    video.addEventListener('error', () => { filePreviewError = 'Preview unavailable. You can still download this file.'; });
    video.src = src;
    return {
      update(next) { video.src = next; },
      destroy() { video.pause(); video.removeAttribute('src'); video.load(); }
    };
  }
</script>

<div id="timeline-import-content" role="tabpanel" aria-labelledby="timeline-import-tab" hidden={!importOpen}>
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
  {#if renderProgress}
    <div class="websocket-file-transfer">
      <label for="websocket-render-progress">Blender render · {renderProgress.scene}</label>
      <progress id="websocket-render-progress" max="100" value={renderPercent} aria-label="Blender rendering progress"></progress>
      <p role="status">{renderProgress.state}{renderPercent !== undefined ? ` · ${Math.floor(renderPercent)}% · ${renderProgress.completed} / ${renderProgress.total} frames` : ` · frame ${renderProgress.frame}`}</p>
      {#if renderProgress.state === 'Complete' && !receivedFile && !fileProgress}
        <p role="status">Render finished, but no file was received. A reconnect restores the render status; Blender must also send the file to this connection.</p>
      {/if}
      {#if renderProgress.state === 'Rendering' && renderProgress.total && renderProgress.completed < renderProgress.total}
        <p aria-live="off">{timeLeft ? `Estimated time left: ${timeLeft}` : renderTiming?.finishAt ? 'Updating time estimate…' : 'Estimating time left…'}</p>
      {/if}
    </div>
  {/if}
  {#if fileProgress}
    <div class="websocket-file-transfer">
      <label for="websocket-file-progress">{fileProgress.name || 'File transfer'}</label>
      <progress id="websocket-file-progress" max="100" value={filePercent} aria-label="File transfer progress"></progress>
      <p role="status">{fileProgress.state} · {Math.floor(filePercent)}% · {fileProgress.received.toLocaleString()} / {fileProgress.total.toLocaleString()} bytes</p>
      {#if fileProgress.error}<p class="websocket-image-error" role="alert">{fileProgress.error}</p>{/if}
      {#if fileProgress.state === 'Receiving' || fileProgress.state === 'Verifying'}
        <button type="button" onclick={() => fileReceiver?.cancel(fileProgress.id)}>Cancel transfer</button>
      {/if}
    </div>
  {/if}
  {#if receivedFile}
    <div class="websocket-received-file">
      {#if receivedFile.restored}<p>Last file received from this server, restored from this browser.</p>{/if}
      <a href={receivedFile.url} download={receivedFile.name}>Download {receivedFile.name}</a>
      {#if fileRetentionError}<p class="websocket-image-error" role="alert">{fileRetentionError}</p>{/if}
      {#if receivedFile.mime.startsWith('image/') || receivedFile.mime.startsWith('video/')}
        <button class="websocket-media-drag" type="button" onpointerdown={event => startImageDrag(event, receivedFile)}>Drag {receivedFile.name} to timeline or preview</button>
      {/if}
      {#if receivedFile.mime.startsWith('image/')}
        <img class="websocket-image" src={receivedFile.url} alt={receivedFile.name} draggable="false" onpointerdown={event => startImageDrag(event, receivedFile)} onerror={() => { filePreviewError = 'Preview unavailable. You can still download this file.'; }}>
      {:else if receivedFile.mime.startsWith('video/')}
        <canvas class="websocket-file-media" aria-label={`Movie frame: ${receivedFile.name}`}
          use:videoPoster={receivedFile.url}></canvas>
      {:else if receivedFile.mime.startsWith('audio/')}
        <audio class="websocket-file-media" src={receivedFile.url} controls aria-label={receivedFile.name} onerror={() => { filePreviewError = 'Preview unavailable. You can still download this file.'; }}></audio>
      {/if}
      {#if filePreviewError}<p role="status">{filePreviewError}</p>{/if}
      {#if imageDropStatus}<p class:websocket-image-error={imageDropError} role="status">{imageDropStatus}</p>{/if}
    </div>
  {/if}
  <form onsubmit={send}>
    <label for="websocket-text">Text to send</label>
    <textarea id="websocket-text" bind:value={outgoingText} placeholder="Enter text to send"></textarea>
    <button type="submit" disabled={!connected}>Send text</button>
  </form>
  <label for="websocket-return">Return text</label>
  <textarea id="websocket-return" value={returnText} placeholder="Server replies appear here" readonly></textarea>
  <button type="button" onclick={renderImage} disabled={returnIsFile || !returnText.trim()}>Render image</button>
  {#if imageError}<p class="websocket-image-error" role="alert">{imageError}</p>{/if}
  {#if imageSrc}
    <img class="websocket-image" src={imageSrc} alt="WebSocket server reply" draggable="false" onpointerdown={startImageDrag} onerror={() => { imageSrc = ''; imageError = 'The browser could not display this image.'; }}>
    <p class="websocket-image-hint">Drag this image onto a timeline track.</p>
    {#if imageDropStatus}<p class:websocket-image-error={imageDropError} role="status">{imageDropStatus}</p>{/if}
  {/if}
  {#if imageSrc || (receivedFile && validMime(receivedFile.mime))}
    <form class="websocket-save-clip" onsubmit={saveAsClip}>
      <label for="websocket-clip-id">Clip ID</label>
      <input id="websocket-clip-id" type="text" maxlength="64" pattern="[A-Za-z0-9_-]+"
        bind:value={saveClipId} placeholder="Clip ID (optional)">
      {#if imageSrc || receivedFile?.mime.startsWith('image/')}
        <label for="websocket-image-seconds">Image seconds</label>
        <input id="websocket-image-seconds" type="number" min="0.1" max="3600" step="0.1" bind:value={imageSeconds}>
      {/if}
      <button type="submit" disabled={savingClip}>{savingClip ? 'Saving…' : 'Save as clip'}</button>
      {#if saveClipStatus}<p class:websocket-image-error={saveClipError} role="status">{saveClipStatus}</p>{/if}
    </form>
  {/if}
</section>
</div>
