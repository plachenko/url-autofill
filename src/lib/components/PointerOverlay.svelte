<script>
  import { onMount } from 'svelte';
  import { pointerPosition, pointerPositionsMessage, websocketPointerMessageEvent,
    websocketPointerOverlayEvent, websocketPointerOverlayStateEvent } from '../websocket-pointers.js';
  import { websocketConnectionEvent, websocketConnectionRequestEvent } from '../websocket-favorites.js';

  let open = false;
  let connected = false;
  let plane = 'z';
  let pointerSurface;
  const activePointers = new Map();
  let pointerMarkers = [];
  let pointerFrame = 0;
  let pendingMove = null;

  function send(phase, changed = null) {
    if (!connected) return;
    window.dispatchEvent(new CustomEvent(websocketPointerMessageEvent, {
      detail: pointerPositionsMessage(phase, changed, activePointers.values(), plane)
    }));
  }

  function cancelMove() {
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pendingMove = null;
  }

  function reset(notifyServer) {
    cancelMove();
    activePointers.clear();
    pointerMarkers = [];
    if (notifyServer) send('reset');
  }

  function setOpen(value) {
    if (open === value) return;
    if (!value) reset(true);
    open = value;
    window.dispatchEvent(new CustomEvent(websocketPointerOverlayStateEvent, { detail: { open } }));
  }

  function changePlane(next) {
    if (plane === next) return;
    reset(true);
    plane = next;
  }

  function onConnection(event) {
    connected = event.detail.connected;
    if (!connected) {
      setOpen(false);
      reset(false);
    }
  }

  function onToggle(event) {
    if (connected) setOpen(event.detail.open);
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && open) setOpen(false);
  }

  onMount(() => {
    window.addEventListener(websocketConnectionEvent, onConnection);
    window.addEventListener(websocketPointerOverlayEvent, onToggle);
    window.addEventListener('keydown', onKeydown);
    window.dispatchEvent(new Event(websocketConnectionRequestEvent));
    return () => {
      reset(true);
      window.removeEventListener(websocketConnectionEvent, onConnection);
      window.removeEventListener(websocketPointerOverlayEvent, onToggle);
      window.removeEventListener('keydown', onKeydown);
    };
  });

  function pointerDown(event) {
    if (!open || !connected || !pointerSurface) return;
    event.preventDefault();
    try { pointerSurface.setPointerCapture(event.pointerId); }
    catch { /* Continue if pointer capture is unavailable. */ }
    const position = pointerPosition(event, pointerSurface.getBoundingClientRect());
    activePointers.set(event.pointerId, position);
    pointerMarkers = [...activePointers.values()];
    cancelMove();
    send('down', position);
  }

  function pointerMove(event) {
    if (!open || !connected || !pointerSurface) return;
    if (!activePointers.has(event.pointerId) && event.pointerType !== 'mouse') return;
    if (activePointers.has(event.pointerId)) event.preventDefault();
    const position = pointerPosition(event, pointerSurface.getBoundingClientRect());
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, position);
      pointerMarkers = [...activePointers.values()];
      queueMove('move', position);
    } else if (event.buttons === 0) queueMove('hover', position);
  }

  function queueMove(phase, changed) {
    pendingMove = { phase, changed };
    if (pointerFrame) return;
    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = 0;
      if (pendingMove) send(pendingMove.phase, pendingMove.changed);
      pendingMove = null;
    });
  }

  function pointerEnd(event, phase) {
    if (!activePointers.has(event.pointerId) || !pointerSurface) return;
    event.preventDefault();
    const position = pointerPosition(event, pointerSurface.getBoundingClientRect());
    activePointers.delete(event.pointerId);
    pointerMarkers = [...activePointers.values()];
    cancelMove();
    send(phase, position);
  }

  function pointerLostCapture(event) {
    const position = activePointers.get(event.pointerId);
    if (!position) return;
    activePointers.delete(event.pointerId);
    pointerMarkers = [...activePointers.values()];
    cancelMove();
    send('cancel', position);
  }
</script>

<div id="pointer-overlay" aria-label="Blender pointer capture" hidden={!open || !connected}>
    <div class="pointer-overlay-surface" role="group" aria-label="Pointer capture area"
      bind:this={pointerSurface} onpointerdown={pointerDown} onpointermove={pointerMove}
      onpointerup={event => pointerEnd(event, 'up')}
      onpointercancel={event => pointerEnd(event, 'cancel')}
      onlostpointercapture={pointerLostCapture}>
      {#each pointerMarkers as pointer (pointer.id)}
        <span class="websocket-pointer-marker" style={`left:${pointer.x * 100}%;top:${pointer.y * 100}%`}>{pointer.id}</span>
      {/each}
      <span class="pointer-overlay-hint">Blender pointers · {pointerMarkers.length} active · {plane.toUpperCase()} plane</span>
    </div>
    <div class="pointer-overlay-planes" role="group" aria-label="Blender pointer plane">
      {#each ['x', 'y', 'z'] as axis}
        <button type="button" aria-pressed={plane === axis} onclick={() => changePlane(axis)}>{axis.toUpperCase()}</button>
      {/each}
    </div>
</div>
