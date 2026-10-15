<script>
  import { onMount } from 'svelte';
  import { pointerPosition, pointerPositionsMessage, websocketPointerMessageEvent,
    websocketPointerOverlayEvent, websocketPointerOverlayStateEvent } from '../websocket-pointers.js';
  import { websocketConnectionEvent, websocketConnectionRequestEvent } from '../websocket-favorites.js';
  import { websocketSceneMessageEvent, websocketSceneCommandEvent } from '../websocket-scene-objects.js';
  import { createPointerSceneSession } from '../pointer-scene-session.js';

  let open = false;
  let connected = false;
  let plane = 'z';
  let pointerSurface;
  const activePointers = new Map();
  let pointerMarkers = [];
  let pointerFrame = 0;
  let pendingMove = null;
  let scene = null;
  const sceneSession = createPointerSceneSession({
    sendCommand: command => window.dispatchEvent(new CustomEvent(websocketSceneCommandEvent, { detail: command })),
    resetGesture: () => reset(true),
    onChange: next => { scene = next; }
  });
  scene = sceneSession.snapshot();
  $: pointerSettings = scene.catalog?.pointer || {};
  $: sceneLocked = Boolean(pointerSettings.recording || pointerSettings.rendering);
  $: selectedObject = scene.catalog?.objects.find(object => object.id === scene.selectedId);
  $: sceneSyncing = Boolean(scene.catalog && scene.catalog.revision < scene.acceptedRevision);
  $: pointerReady = !sceneSyncing && !scene.pending && (!scene.catalog ||
    (pointerSettings.enabled && (!scene.selectedId || scene.selectedId === scene.attachedId)));
  $: effectivePlane = scene.catalog && pointerSettings.use_browser_plane === false
    ? pointerSettings.plane : ({ x: 'YZ', y: 'XZ', z: 'XY' })[plane];

  function send(phase, changed = null) {
    if (!connected || (scene.pending && phase !== 'reset')) return;
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
    const wasConnected = connected;
    connected = event.detail.connected;
    if (connected && !wasConnected) sceneSession.connect();
    if (!connected) {
      setOpen(false);
      reset(false);
      if (wasConnected) sceneSession.disconnect();
    }
  }

  function onSceneMessage(event) {
    sceneSession.receive(event.detail);
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
    window.addEventListener(websocketSceneMessageEvent, onSceneMessage);
    window.addEventListener('keydown', onKeydown);
    window.dispatchEvent(new Event(websocketConnectionRequestEvent));
    return () => {
      reset(true);
      window.removeEventListener(websocketConnectionEvent, onConnection);
      window.removeEventListener(websocketPointerOverlayEvent, onToggle);
      window.removeEventListener(websocketSceneMessageEvent, onSceneMessage);
      window.removeEventListener('keydown', onKeydown);
      sceneSession.close();
    };
  });

  function pointerDown(event) {
    if (!open || !connected || !pointerReady || !pointerSurface) return;
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
    if (!open || !connected || !pointerReady || !pointerSurface) return;
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
      <span class="pointer-overlay-hint">Blender pointers · {pointerMarkers.length} active · {effectivePlane} plane
        {#if !pointerReady} · {scene.pending || sceneSyncing ? 'waiting for Blender' : 'enable pointer control in Blender'}{/if}
      </span>
    </div>
    <div class="pointer-overlay-settings">
      {#if scene.catalog}
        <div class="pointer-scene-heading">
          <strong>{scene.catalog.scene.name}</strong>
          <span>{scene.catalog.total ?? scene.catalog.objects.length} objects{scene.catalog.truncated ? ` · showing first ${scene.catalog.objects.length}` : ''}</span>
        </div>
        <div class="pointer-scene-row">
          <label for="pointer-object-select">Object to animate</label>
          <select id="pointer-object-select" value={scene.selectedId}
            onchange={event => sceneSession.choose(event.currentTarget.value)}
            disabled={Boolean(scene.pending) || sceneSyncing || sceneLocked || !scene.catalog.capabilities?.includes('pointer_follow')}>
            <option value="">Choose a scene object</option>
            {#each scene.catalog.objects as object (object.id)}
              <option value={object.id} disabled={!object.can_follow}
                title={object.can_follow ? '' : object.reason || 'This object cannot follow pointers'}>
                {object.name} ({object.object_type}){object.can_follow ? '' : ` — ${object.reason || 'unavailable'}`}
              </option>
            {/each}
          </select>
          <button type="button" onclick={() => sceneSession.attach()}
            disabled={!scene.selectedId || !selectedObject?.can_follow || Boolean(scene.pending) || sceneSyncing || sceneLocked ||
              !scene.catalog.capabilities?.includes('pointer_follow')}>Attach &amp; enable</button>
        </div>
        <p class="pointer-scene-summary">
          {pointerSettings.enabled ? 'Pointer control enabled' : 'Pointer control disabled'} ·
          {pointerSettings.recording ? 'Recording' : pointerSettings.rendering ? 'Rendering' : 'Ready'} ·
          {pointerSettings.use_browser_plane === false ? `Blender plane ${pointerSettings.plane}` : 'Browser X/Y/Z plane'}
          {#if scene.attachedId} · Following {scene.catalog.objects.find(object => object.id === scene.attachedId)?.name || scene.attachedId}{/if}
          {#if pointerSettings.target_id} · Target {scene.catalog.objects.find(object => object.id === pointerSettings.target_id)?.name || pointerSettings.target_id}{/if}
          {#if pointerSettings.origin_id} · Origin {scene.catalog.objects.find(object => object.id === pointerSettings.origin_id)?.name || pointerSettings.origin_id}{/if}
        </p>
        {#if scene.catalog.capabilities?.includes('pointer_plane_set')}
          <div class="pointer-scene-size">
            <label for="pointer-plane-width">Plane width <small>Blender units</small></label>
            <input id="pointer-plane-width" type="text" inputmode="decimal" value={scene.draftWidth}
              oninput={event => sceneSession.setDraft('width', event.currentTarget.value)}
              disabled={Boolean(scene.pending) || sceneSyncing || sceneLocked}>
            <label for="pointer-plane-height">Plane height <small>Blender units</small></label>
            <input id="pointer-plane-height" type="text" inputmode="decimal" value={scene.draftHeight}
              oninput={event => sceneSession.setDraft('height', event.currentTarget.value)}
              disabled={Boolean(scene.pending) || sceneSyncing || sceneLocked}>
            <button type="button" onclick={() => sceneSession.applySize()}
              disabled={!scene.dirty || scene.conflict || Boolean(scene.pending) || sceneSyncing || sceneLocked}>Apply size</button>
          </div>
          {#if scene.conflict}
            <p role="alert">Blender changed the plane while you were editing. Review its new values before applying.</p>
            <button type="button" onclick={() => sceneSession.reloadDraft()} disabled={Boolean(scene.pending)}>Use Blender values</button>
          {/if}
          <p>Width runs left/right; height runs down/up, centered on the origin. Select the origin, target, or followed object in Blender and enable viewport Overlays to see the bounds. Browser sizing does not select objects.</p>
        {:else}
          <p>Remote plane sizing needs the updated Blender add-on. Pointer capture still works with older servers.</p>
        {/if}
      {:else if scene.discovery === 'waiting'}
        <p role="status">Waiting for Blender scene objects. Pointer capture remains available.</p>
      {:else if scene.discovery === 'unavailable'}
        <p>Blender did not advertise scene objects. Pointer capture remains available; object selection and remote sizing need the updated add-on.</p>
      {/if}
      {#if scene.pending}<p role="status">Waiting for Blender to {scene.pending.kind === 'follow' ? 'attach the object' : 'apply the plane size'}…</p>{/if}
      {#if scene.error}<p class="websocket-image-error" role="alert">{scene.error}</p>{/if}
      {#if scene.notice}<p role="status">{scene.notice}</p>{/if}
    </div>
    <div class="pointer-overlay-planes" role="group" aria-label="Blender pointer plane">
      {#each ['x', 'y', 'z'] as axis}
        <button type="button" aria-pressed={plane === axis} onclick={() => changePlane(axis)}
          title={`${axis.toUpperCase()} maps to ${{ x: 'YZ', y: 'XZ', z: 'XY' }[axis]} in Blender`}>{axis.toUpperCase()}</button>
      {/each}
    </div>
</div>
