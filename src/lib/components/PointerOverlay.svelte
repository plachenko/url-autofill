<script>
  import { onMount } from 'svelte';
  import { pointerPosition, touchPosition, pointerPositionsMessage, websocketPointerMessageEvent,
    websocketPointerOverlayEvent, websocketPointerOverlayStateEvent } from '../websocket-pointers.js';
  import { websocketConnectionEvent, websocketConnectionRequestEvent } from '../websocket-favorites.js';
  import { websocketSceneMessageEvent, websocketSceneCommandEvent } from '../websocket-scene-objects.js';
  import { createPointerSceneSession } from '../pointer-scene-session.js';
  import { visibleObjectRows } from '../object-hierarchy.js';

  let open = false;
  let connected = false;
  let plane = 'z';
  let axisLock = null;
  let pointerSurface;
  const activePointers = new Map();
  const touchIds = new Map();
  const pointerTouchIds = new Set();
  let touchSource = null;
  let nextTouchId = 1000000000;
  let lastTouchTime = 0;
  let pointerMarkers = [];
  let pointerFrame = 0;
  let pendingMove = null;
  let scene = null;
  let collapsedObjects = new Set();
  const sceneSession = createPointerSceneSession({
    sendCommand: command => window.dispatchEvent(new CustomEvent(websocketSceneCommandEvent, { detail: command })),
    resetGesture: () => reset(true),
    onChange: next => { scene = next; }
  });
  scene = sceneSession.snapshot();
  $: pointerSettings = scene.catalog?.pointer || {};
  $: sceneLocked = Boolean(pointerSettings.recording || pointerSettings.rendering);
  $: selectedObject = scene.catalog?.objects.find(object => object.id === scene.selectedId);
  $: objectRows = visibleObjectRows(scene.catalog?.objects || [], collapsedObjects);
  $: sceneSyncing = Boolean(scene.catalog && scene.catalog.revision < scene.acceptedRevision);
  $: pointerReady = !sceneSyncing && !scene.pending && (!scene.catalog ||
    (pointerSettings.enabled && (!scene.selectedId || scene.selectedId === scene.attachedId)));
  $: effectivePlane = scene.catalog && pointerSettings.use_browser_plane === false
    ? pointerSettings.plane : ({ x: 'YZ', y: 'XZ', z: 'XY' })[plane];
  $: if (axisLock && effectivePlane && !effectivePlane.includes(axisLock.toUpperCase())) axisLock = null;
  $: timeline = scene.catalog?.timeline;
  $: timelineStart = Math.min(timeline?.start ?? 1, timeline?.current ?? 1);
  $: timelineEnd = Math.max(timeline?.end ?? 2, timeline?.current ?? 1, timelineStart + 1);
  function framePercent(frame) {
    return Math.max(0, Math.min(100, (frame - timelineStart) / (timelineEnd - timelineStart) * 100));
  }

  function send(phase, changed = null) {
    if (!connected || (scene.pending && phase !== 'reset')) return;
    window.dispatchEvent(new CustomEvent(websocketPointerMessageEvent, {
      detail: pointerPositionsMessage(phase, changed, activePointers.values(), plane,
        scene.catalog?.capabilities?.includes('pointer_axis_lock') ? axisLock : null)
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
    touchIds.clear();
    pointerTouchIds.clear();
    touchSource = null;
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

  function changeAxisLock(next) {
    if (axisLock === next || (next && !effectivePlane?.includes(next.toUpperCase()))) return;
    reset(true);
    axisLock = next;
  }

  function onConnection(event) {
    const wasConnected = connected;
    connected = event.detail.connected;
    if (connected && !wasConnected) sceneSession.connect();
    if (!connected) {
      setOpen(false);
      reset(false);
      axisLock = null;
      if (wasConnected) sceneSession.disconnect();
    }
  }

  function onSceneMessage(event) {
    if (event.detail?.type === 'scene_objects' &&
        scene.catalog?.scene.id !== event.detail.scene?.id) collapsedObjects = new Set();
    sceneSession.receive(event.detail);
  }

  function toggleObject(id) {
    const next = new Set(collapsedObjects);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsedObjects = next;
  }

  function onToggle(event) {
    if (connected) setOpen(event.detail.open);
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && open) setOpen(false);
  }

  onMount(() => {
    // Some in-car browsers dispatch Touch Events without touch Pointer Events.
    const touchOptions = { passive: false };
    pointerSurface.addEventListener('touchstart', touchStart, touchOptions);
    pointerSurface.addEventListener('touchmove', touchMove, touchOptions);
    pointerSurface.addEventListener('touchend', touchEnd, touchOptions);
    pointerSurface.addEventListener('touchcancel', touchCancel, touchOptions);
    window.addEventListener(websocketConnectionEvent, onConnection);
    window.addEventListener(websocketPointerOverlayEvent, onToggle);
    window.addEventListener(websocketSceneMessageEvent, onSceneMessage);
    window.addEventListener('keydown', onKeydown);
    window.dispatchEvent(new Event(websocketConnectionRequestEvent));
    return () => {
      reset(true);
      pointerSurface.removeEventListener('touchstart', touchStart);
      pointerSurface.removeEventListener('touchmove', touchMove);
      pointerSurface.removeEventListener('touchend', touchEnd);
      pointerSurface.removeEventListener('touchcancel', touchCancel);
      window.removeEventListener(websocketConnectionEvent, onConnection);
      window.removeEventListener(websocketPointerOverlayEvent, onToggle);
      window.removeEventListener(websocketSceneMessageEvent, onSceneMessage);
      window.removeEventListener('keydown', onKeydown);
      sceneSession.close();
    };
  });

  function pointerDown(event) {
    if (!open || !connected || !pointerReady || !pointerSurface) return;
    if (event.pointerType === 'touch') {
      if (touchSource === 'touch') return;
      touchSource = 'pointer';
      pointerTouchIds.add(event.pointerId);
      lastTouchTime = Date.now();
    } else if (event.pointerType === 'mouse' &&
        (touchSource === 'touch' || Date.now() - lastTouchTime < 700)) return;
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
    if (event.pointerType === 'touch' && touchSource === 'touch') return;
    if (event.pointerType === 'touch') lastTouchTime = Date.now();
    if (event.pointerType === 'mouse' &&
        (touchSource === 'touch' || Date.now() - lastTouchTime < 700)) return;
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
    if (event.pointerType === 'touch' && touchSource === 'touch') return;
    if (event.pointerType === 'mouse' && touchSource === 'touch') return;
    if (!activePointers.has(event.pointerId) || !pointerSurface) return;
    if (event.pointerType === 'touch') lastTouchTime = Date.now();
    event.preventDefault();
    const position = pointerPosition(event, pointerSurface.getBoundingClientRect());
    activePointers.delete(event.pointerId);
    if (pointerTouchIds.delete(event.pointerId) && !pointerTouchIds.size) touchSource = null;
    pointerMarkers = [...activePointers.values()];
    cancelMove();
    send(phase, position);
  }

  function pointerLostCapture(event) {
    const position = activePointers.get(event.pointerId);
    if (!position) return;
    activePointers.delete(event.pointerId);
    if (pointerTouchIds.delete(event.pointerId) && !pointerTouchIds.size) touchSource = null;
    pointerMarkers = [...activePointers.values()];
    cancelMove();
    send('cancel', position);
  }

  function touchStart(event) {
    if (!open || !connected || !pointerReady || !pointerSurface) return;
    lastTouchTime = Date.now();
    if (touchSource === 'pointer') {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    touchSource = 'touch';
    for (const [id, position] of activePointers) {
      if (position.kind !== 'mouse') continue;
      activePointers.delete(id);
      pointerMarkers = [...activePointers.values()];
      cancelMove();
      send('cancel', position);
    }
    const bounds = pointerSurface.getBoundingClientRect();
    for (const touch of Array.from(event.changedTouches)) {
      if (touchIds.has(touch.identifier)) continue;
      const id = nextTouchId++;
      touchIds.set(touch.identifier, id);
      const position = touchPosition(touch, bounds, id);
      activePointers.set(id, position);
      pointerMarkers = [...activePointers.values()];
      cancelMove();
      send('down', position);
    }
  }

  function touchMove(event) {
    if (touchSource !== 'touch' || !pointerSurface) return;
    event.preventDefault();
    lastTouchTime = Date.now();
    const bounds = pointerSurface.getBoundingClientRect();
    for (const touch of Array.from(event.changedTouches)) {
      const id = touchIds.get(touch.identifier);
      if (id === undefined) continue;
      const position = touchPosition(touch, bounds, id);
      activePointers.set(id, position);
      pointerMarkers = [...activePointers.values()];
      queueMove('move', position);
    }
  }

  function finishTouches(event, phase) {
    if (touchSource !== 'touch' || !pointerSurface) return;
    event.preventDefault();
    lastTouchTime = Date.now();
    const bounds = pointerSurface.getBoundingClientRect();
    for (const touch of Array.from(event.changedTouches)) {
      const id = touchIds.get(touch.identifier);
      if (id === undefined) continue;
      const position = touchPosition(touch, bounds, id);
      touchIds.delete(touch.identifier);
      activePointers.delete(id);
      pointerMarkers = [...activePointers.values()];
      cancelMove();
      send(phase, position);
    }
    if (!touchIds.size) touchSource = null;
  }

  function touchEnd(event) { finishTouches(event, 'up'); }
  function touchCancel(event) { finishTouches(event, 'cancel'); }
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
      <span class="pointer-overlay-hint">Blender pointers · {pointerMarkers.length} active · {effectivePlane} plane{axisLock ? ` · ${axisLock.toUpperCase()} axis` : ''}
        {#if !pointerReady} · {scene.pending || sceneSyncing ? 'waiting for Blender' : 'enable pointer control in Blender'}{/if}
      </span>
    </div>
    <div class="pointer-overlay-settings">
      {#if scene.catalog}
        <div class="pointer-scene-heading">
          <strong>{scene.catalog.scene.name}</strong>
          <span>{scene.catalog.total ?? scene.catalog.objects.length} objects{scene.catalog.truncated ? ` · showing first ${scene.catalog.objects.length}` : ''}</span>
        </div>
        <div class="pointer-object-heading">Object hierarchy <small>Select an object to animate</small></div>
        <ul class="pointer-object-tree" aria-label="Blender object hierarchy">
          {#each objectRows as row (row.object.id)}
            <li class="pointer-object-row" style={`--object-depth:${Math.min(row.depth, 16)}`}>
              {#if row.hasChildren}
                <button type="button" class="pointer-object-expand"
                  aria-label={`${row.expanded ? 'Collapse' : 'Expand'} ${row.object.name}`}
                  aria-expanded={row.expanded} onclick={() => toggleObject(row.object.id)}>{row.expanded ? '▾' : '▸'}</button>
              {:else}<span class="pointer-object-expand-spacer" aria-hidden="true"></span>{/if}
              <button type="button" class="pointer-object-choice"
                class:selected={scene.selectedId === row.object.id}
                aria-pressed={scene.selectedId === row.object.id}
                disabled={!row.object.can_follow || Boolean(scene.pending) || sceneSyncing || sceneLocked ||
                  !scene.catalog.capabilities?.includes('pointer_follow')}
                title={row.object.can_follow ? row.object.name : row.object.reason || 'This object cannot follow pointers'}
                onclick={() => sceneSession.choose(row.object.id)}>
                <span class="pointer-object-name">{row.object.name}</span>
                <small>{row.object.object_type}</small>
                {#if !row.object.can_follow}<small class="pointer-object-reason">{row.object.reason || 'Unavailable'}</small>{/if}
                {#if scene.attachedId === row.object.id}<span class="pointer-object-attached">Attached</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
        <div class="pointer-scene-row pointer-object-action">
          <span>{selectedObject ? `Selected: ${selectedObject.name}` : 'Select an object above'}</span>
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
        {#if scene.catalog.capabilities?.includes('pointer_render')}
          <div class="pointer-render-action">
            <button type="button" onclick={() => sceneSession.renderFrame()}
              disabled={Boolean(scene.pending) || sceneSyncing || sceneLocked}>Render current frame</button>
          </div>
        {/if}
        {#if scene.catalog.capabilities?.includes('pointer_record_move')}
          <div class="pointer-auto-keyframe">
            <button type="button" class:recording={pointerSettings.recording && ['move', 'down', 'up'].includes(pointerSettings.record_mode)}
              aria-pressed={pointerSettings.recording && ['move', 'down', 'up'].includes(pointerSettings.record_mode)}
              onclick={() => pointerSettings.recording ? sceneSession.stopAutoKeyframe() : sceneSession.startAutoKeyframe()}
              disabled={Boolean(scene.pending) || sceneSyncing || pointerSettings.rendering ||
                (pointerSettings.recording ? !['move', 'down', 'up'].includes(pointerSettings.record_mode) : !pointerSettings.enabled)}>
              {pointerSettings.recording && ['move', 'down', 'up'].includes(pointerSettings.record_mode) ? 'Stop Auto Keyframe' : 'Auto Keyframe'}
            </button>
            <label for="pointer-record-mode">Trigger</label>
            <select id="pointer-record-mode" value={scene.draftRecordMode}
              onchange={event => sceneSession.setRecordMode(event.currentTarget.value)}
              disabled={sceneLocked || Boolean(scene.pending)}>
              {#if scene.catalog.capabilities?.includes('pointer_record_down')}<option value="down">Pointer down</option>{/if}
              {#if scene.catalog.capabilities?.includes('pointer_record_up')}<option value="up">Pointer up</option>{/if}
              <option value="move">Pointer move</option>
            </select>
            <label for="pointer-record-step">Frames between keyframes</label>
            <input id="pointer-record-step" type="number" min="1" max="1000" step="1"
              value={scene.draftFrameStep}
              oninput={event => sceneSession.setFrameStep(event.currentTarget.value)}
              disabled={sceneLocked || Boolean(scene.pending)}>
          </div>
          <p>{(pointerSettings.recording ? pointerSettings.record_mode : scene.draftRecordMode) === 'down' ? 'Each pointer press adds a keyframe.' : (pointerSettings.recording ? pointerSettings.record_mode : scene.draftRecordMode) === 'up' ? 'The object moves and gets a keyframe when you release the pointer.' : 'Each pointer movement adds a keyframe.'} The timeline advances by the chosen number of frames.</p>
        {/if}
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
      {#if scene.pending}<p role="status">Waiting for Blender…</p>{/if}
      {#if scene.error}<p class="websocket-image-error" role="alert">{scene.error}</p>{/if}
      {#if scene.notice}<p role="status">{scene.notice}</p>{/if}
    </div>
    {#if timeline && scene.catalog?.capabilities?.includes('pointer_timeline')}
      <div class="pointer-mini-timeline" aria-label="Blender timeline">
        <div class="pointer-timeline-heading">
          <strong>Blender timeline</strong>
          <span>Frame {timeline.current} · {timeline.start}–{timeline.end}</span>
        </div>
        <div class="pointer-timeline-track">
          {#each (timeline.keyframes || []).filter(frame => frame >= timelineStart && frame <= timelineEnd) as keyframe (keyframe)}
            <span class="pointer-timeline-key" style={`left:${framePercent(keyframe)}%`}
              title={`Keyframe ${keyframe}`}></span>
          {/each}
          <span class="pointer-timeline-playhead" style={`left:${framePercent(timeline.current)}%`}></span>
        </div>
        <input type="range" aria-label="Set Blender frame" min={timelineStart} max={timelineEnd}
          value={timeline.current} step="1" onchange={event => sceneSession.seekFrame(event.currentTarget.value)}
          disabled={sceneLocked || Boolean(scene.pending) || sceneSyncing}>
        <small>Target Empty keyframes{timeline.keys_truncated ? ' · latest 512 shown' : ''}</small>
      </div>
    {/if}
    {#if scene.catalog?.capabilities?.includes('pointer_axis_lock')}
      <div class="pointer-overlay-axis-lock" role="group" aria-label="Pointer movement axis lock">
        <span>Axis lock</span>
        <button type="button" aria-pressed={axisLock === null} onclick={() => changeAxisLock(null)}>Free</button>
        {#each ['x', 'y', 'z'] as axis}
          <button type="button" aria-pressed={axisLock === axis}
            disabled={!effectivePlane?.includes(axis.toUpperCase())}
            onclick={() => changeAxisLock(axis)}
            title={`Move only along ${axis.toUpperCase()} on the ${effectivePlane} plane`}>{axis.toUpperCase()}</button>
        {/each}
      </div>
    {/if}
    <div class="pointer-overlay-planes" role="group" aria-label="Blender pointer plane">
      {#each ['x', 'y', 'z'] as axis}
        <button type="button" aria-pressed={plane === axis} onclick={() => changePlane(axis)}
          title={`${axis.toUpperCase()} maps to ${{ x: 'YZ', y: 'XZ', z: 'XY' }[axis]} in Blender`}>{axis.toUpperCase()}</button>
      {/each}
    </div>
</div>
