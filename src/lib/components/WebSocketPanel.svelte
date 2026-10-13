<script>
  import { onMount } from 'svelte';

  let serverUrl = '';
  let outgoingText = '';
  let returnText = '';
  let status = 'Disconnected.';
  let connected = false;
  let connecting = false;
  let socket = null;

  onMount(() => {
    const params = new URL(window.location.href).searchParams;
    serverUrl = params.get('ws') ?? '';
    outgoingText = params.get('wsText') ?? '';
    if (serverUrl.trim()) connect();
    return () => {
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
      endpoint = new URL(serverUrl.trim());
      if (endpoint.protocol !== 'ws:' && endpoint.protocol !== 'wss:') {
        throw new Error('Use a ws:// or wss:// server URL.');
      }
      socket = new WebSocket(endpoint.href);
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
      if (socket === current) returnText = value;
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
</script>

<section id="websocket-panel" aria-label="WebSocket">
  <h2>WebSocket</h2>
  <label for="websocket-url">Server URL</label>
  <input id="websocket-url" type="url" bind:value={serverUrl} placeholder="wss://example.com/socket" spellcheck="false" autocomplete="url">
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
</section>
