<script>
  import { onMount } from "svelte";
  import { PaneGroup, Pane, PaneResizer } from "paneforge";
  import HeaderControls from "../lib/components/HeaderControls.svelte";
  import ControlsDrawer from "../lib/components/ControlsDrawer.svelte";
  import Stage from "../lib/components/Stage.svelte";
  import TimelineEditor from "../lib/components/TimelineEditor.svelte";
  import PointerOverlay from "../lib/components/PointerOverlay.svelte";
  import { clampPipRect, initialPipRect, movePipRect, pinchPipRect, pipRectAtPoint } from "../lib/pip-geometry.js";
  import { dockEdgeForPip, dockEdges, pipTimelineThreshold, timelineSizeAt } from "../lib/pip-docking.js";
  import { initialize } from "../lib/legacy-controller.js";
  import "../app.css";

  let timelinePane = $state(null);
  let showPreviewSplits = $state(true);
  let dockEdge = $state("top");
  const focusThreshold = 16;
  const trackFocusThreshold = 80;
  let previousPaneSize = null;
  let syncingFromResize = false;
  let switchingByDivider = false;
  let draggingDivider = false;
  let syncPictureInPicture = null;

  function dockPreview(edge) {
    dockEdge = edge;
    try { localStorage.setItem("urlAutofill.previewDockEdge.v1", edge); }
    catch { /* Docking still works without storage. */ }
    document.body.removeAttribute("data-pip-dock-target");
    timelinePane?.resize(50);
  }

  function showTimelineForSize(size, pipSpawnPoint = null) {
    if (!Number.isFinite(size)) return;
    document.body.classList.toggle("timeline-tracks-expanded", size >= trackFocusThreshold);
    const pictureInPicture = size >= pipTimelineThreshold;
    if (pictureInPicture && size < 100 && !draggingDivider &&
        !document.body.classList.contains("timeline-pip")) timelinePane?.resize(100);
    if (!draggingDivider) syncPictureInPicture?.(pictureInPicture, pipSpawnPoint);
    if (switchingByDivider) return;
    const focused = size <= focusThreshold;
    if (document.body.classList.contains("render-focus") === focused) return;
    syncingFromResize = true;
    try {
      document.getElementById("timeline-toggle")?.click();
    } finally {
      syncingFromResize = false;
    }
  }

  onMount(() => {
    try { showPreviewSplits = localStorage.getItem("urlAutofill.pipSplits.v1") !== "false"; }
    catch { /* Keep the default when storage is unavailable. */ }
    try {
      const savedEdge = localStorage.getItem("urlAutofill.previewDockEdge.v1");
      if (dockEdges.includes(savedEdge)) dockEdge = savedEdge;
    } catch { /* Use the top edge when storage is unavailable. */ }
    const resizer = document.querySelector(".pane-resizer");
    const timelineElement = document.querySelector(".timeline-pane");
    const pipPane = document.querySelector(".stage-pane");
    const pipCapture = document.querySelector(".timeline-pip-gesture");
    const pipListeners = new AbortController();
    const pointers = new Map();
    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
    const pipStorageKey = "urlAutofill.previewPipRect.v1";
    let pipRect = null;
    try {
      const saved = JSON.parse(localStorage.getItem(pipStorageKey));
      if (saved && [saved.left, saved.top, saved.width, saved.height]
        .every((value) => Number.isFinite(value)) && saved.width > 0 && saved.height > 0)
        pipRect = clampPipRect(saved, viewport());
    } catch { /* Storage may be unavailable or contain an older value. */ }
    let lastPlacedRect = pipRect ? { ...pipRect } : null;
    let gesture = null;
    let pipExitFrame = 0;
    let pipExitAnimation = null;
    const savePipRect = () => {
      lastPlacedRect = { ...pipRect };
      try { localStorage.setItem(pipStorageKey, JSON.stringify(pipRect)); }
      catch { /* Keep the preview usable when storage is unavailable. */ }
    };
    const applyPipRect = () => {
      pipPane.style.setProperty("--pip-left", `${pipRect.left}px`);
      pipPane.style.setProperty("--pip-top", `${pipRect.top}px`);
      pipPane.style.setProperty("--pip-width", `${pipRect.width}px`);
      pipPane.style.setProperty("--pip-height", `${pipRect.height}px`);
    };
    syncPictureInPicture = (active, spawnPoint = null) => {
      if (!active) {
        pointers.clear();
        gesture = null;
        document.body.classList.remove("timeline-pip-dragging", "timeline-pip-dock-ready");
        document.body.removeAttribute("data-pip-dock-target");
        if (document.body.classList.contains("timeline-pip") && !pipExitFrame) {
          pipExitFrame = requestAnimationFrame(() => {
            pipExitFrame = 0;
            const from = pipPane.getBoundingClientRect();
            document.body.classList.remove("timeline-pip");
            const to = pipPane.getBoundingClientRect();
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
                !from.width || !from.height || !to.width || !to.height) return;
            const animation = pipPane.animate([
              { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
                transformOrigin: "top left", borderRadius: "10px" },
              { transform: "none", transformOrigin: "top left", borderRadius: "0px" }
            ], { duration: 240, easing: "cubic-bezier(.2, .8, .2, 1)" });
            pipExitAnimation = animation;
            animation.onfinish = () => {
              if (pipExitAnimation === animation) pipExitAnimation = null;
            };
          });
        }
        return;
      }
      cancelAnimationFrame(pipExitFrame);
      pipExitFrame = 0;
      pipExitAnimation?.cancel();
      pipExitAnimation = null;
      const baseRect = document.body.classList.contains("timeline-pip") ? pipRect
        : lastPlacedRect ? lastPlacedRect : initialPipRect(viewport());
      pipRect = spawnPoint ? pipRectAtPoint(baseRect, spawnPoint, viewport())
        : clampPipRect(baseRect, viewport());
      if (spawnPoint && !draggingDivider) savePipRect();
      applyPipRect();
      document.body.classList.add("timeline-pip");
    };
    const midpoint = (first, second) => ({
      x: (first.x + second.x) / 2, y: (first.y + second.y) / 2
    });
    const resetGesture = () => {
      const contacts = [...pointers.values()];
      if (contacts.length >= 2) {
        const [first, second] = contacts;
        gesture = { type: "pinch", rect: { ...pipRect },
          midpoint: midpoint(first, second),
          distance: Math.hypot(second.x - first.x, second.y - first.y) };
      } else if (contacts.length === 1) {
        gesture = { type: "move", rect: { ...pipRect }, start: { ...contacts[0] } };
      } else gesture = null;
      document.body.classList.toggle("timeline-pip-dragging", gesture?.type === "move");
      document.body.classList.remove("timeline-pip-dock-ready");
      document.body.removeAttribute("data-pip-dock-target");
    };
    const updateDockTarget = (point) => {
      const bounds = timelineElement.getBoundingClientRect();
      document.body.style.setProperty("--pip-dock-top", `${bounds.top}px`);
      document.body.style.setProperty("--pip-dock-left", `${bounds.left}px`);
      document.body.style.setProperty("--pip-dock-width", `${bounds.width}px`);
      document.body.style.setProperty("--pip-dock-height", `${bounds.height}px`);
      const target = dockEdgeForPip(point, pipRect, bounds);
      if (target) document.body.dataset.pipDockTarget = target;
      else document.body.removeAttribute("data-pip-dock-target");
      document.body.classList.toggle("timeline-pip-dock-ready", Boolean(target));
      return target;
    };
    pipCapture.addEventListener("pointerdown", (event) => {
      if (!document.body.classList.contains("timeline-pip") ||
        (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      event.stopPropagation();
      pipCapture.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      resetGesture();
      if (gesture?.type === "move") updateDockTarget({ x: event.clientX, y: event.clientY });
    }, { signal: pipListeners.signal });
    pipCapture.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture.type === "move") {
        const point = pointers.get(event.pointerId);
        pipRect = movePipRect(gesture.rect,
          point.x - gesture.start.x, point.y - gesture.start.y, viewport());
        updateDockTarget(point);
      } else {
        const [first, second] = [...pointers.values()];
        if (!second || !gesture.distance) return;
        pipRect = pinchPipRect(gesture.rect, gesture.midpoint,
          midpoint(first, second),
          Math.hypot(second.x - first.x, second.y - first.y) / gesture.distance,
          viewport());
      }
      applyPipRect();
    }, { signal: pipListeners.signal });
    const endPipPointer = (event) => {
      if (!pointers.has(event.pointerId)) return;
      if (event.type === "pointerup" && pointers.size === 1 && gesture?.type === "move") {
        pipRect = movePipRect(gesture.rect,
          event.clientX - gesture.start.x, event.clientY - gesture.start.y, viewport());
        applyPipRect();
      }
      const dock = event.type === "pointerup" && pointers.size === 1 &&
        gesture?.type === "move" &&
        Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y) >= 8 &&
        updateDockTarget({ x: event.clientX, y: event.clientY });
      pointers.delete(event.pointerId);
      if (dock) {
        document.body.classList.remove("timeline-pip-dragging", "timeline-pip-dock-ready");
        dockPreview(dock);
        return;
      }
      if (pointers.size === 0) savePipRect();
      resetGesture();
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      pipCapture.addEventListener(type, endPipPointer, { signal: pipListeners.signal });
    pipCapture.addEventListener("keydown", (event) => {
      if (!document.body.classList.contains("timeline-pip")) return;
      const keyboardDock = event.altKey && {
        ArrowUp: "top", ArrowRight: "right", ArrowDown: "bottom", ArrowLeft: "left"
      }[event.key];
      if (keyboardDock) {
        event.preventDefault();
        dockPreview(keyboardDock);
        return;
      }
      const movement = { ArrowLeft: [-16, 0], ArrowRight: [16, 0],
        ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
      if (movement) pipRect = movePipRect(pipRect, ...movement, viewport());
      else if (["+", "=", "-", "_"].includes(event.key)) {
        const center = { x: pipRect.left + pipRect.width / 2,
          y: pipRect.top + pipRect.height / 2 };
        pipRect = pinchPipRect(pipRect, center, center,
          event.key === "-" || event.key === "_" ? .9 : 1.1, viewport());
      } else return;
      event.preventDefault();
      applyPipRect();
      savePipRect();
    }, { signal: pipListeners.signal });
    window.addEventListener("resize", () => {
      if (document.body.classList.contains("timeline-pip"))
        syncPictureInPicture(true);
    }, { signal: pipListeners.signal });
    const syncFocus = (event) => {
      // URL actions use the same PaneForge split as the toggle and divider.
      const action = event.detail.paneAction;
      if (action === "render" || action === "timeline") {
        const size = timelinePane.getSize();
        if (!event.detail.previousFocused && size > focusThreshold && size < pipTimelineThreshold)
          previousPaneSize = size;
        if (action === "timeline") {
          timelinePane.expand();
          timelinePane.resize(100);
          return;
        }
      } else if (action === "restore") {
        const size = previousPaneSize > focusThreshold && previousPaneSize < pipTimelineThreshold
          ? previousPaneSize : 28;
        previousPaneSize = null;
        if (timelinePane.isCollapsed()) timelinePane.expand();
        timelinePane.resize(size);
        return;
      }
      document.body.classList.toggle("timeline-tracks-expanded",
        !event.detail.focused && timelinePane?.getSize() >= trackFocusThreshold);
      if (syncingFromResize || switchingByDivider || draggingDivider) return;
      if (event.detail.focused) timelinePane?.collapse();
      else if (timelinePane?.isCollapsed()) {
        timelinePane?.expand();
        requestAnimationFrame(() => {
          if (
            !document.body.classList.contains("render-focus") &&
            timelinePane?.getSize() < 20
          )
            timelinePane.resize(28);
        });
      }
    };
    let resizePointer = null;
    // PaneForge's mouse/touch drag uses a delta from the press point. Handle
    // pointer drags here so the divider is placed at the pointer's position.
    const blockNativeDrag = (event) => {
      event.stopImmediatePropagation();
    };
    const startResize = (event) => {
      if (resizePointer || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      resizePointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        focused: document.body.classList.contains("render-focus"),
      };
      draggingDivider = true;
      resizer.setPointerCapture(event.pointerId);
    };
    const moveResize = (event) => {
      if (event.pointerId !== resizePointer?.id) return;
      const group = resizer.parentElement.getBoundingClientRect();
      const size = timelineSizeAt({ x: event.clientX, y: event.clientY }, group, dockEdge);
      if (size !== null) {
        timelinePane?.resize(size);
        syncPictureInPicture?.(size >= pipTimelineThreshold,
          { x: event.clientX, y: event.clientY });
      }
    };
    const finishResize = (event) => {
      if (event.pointerId !== resizePointer?.id) return;
      const directClick = event.type === "pointerup" &&
        Math.hypot(event.clientX - resizePointer.x,
          event.clientY - resizePointer.y) < 5;
      const wasFocused = resizePointer.focused;
      const releasePoint = { x: event.clientX, y: event.clientY };
      if (event.type === "pointerup" && !directClick) moveResize(event);
      resizePointer = null;
      if (event.type !== "pointerup") { draggingDivider = false; return; }
      requestAnimationFrame(() => {
        draggingDivider = false;
        if (directClick) {
          switchingByDivider = true;
          try {
            if (document.body.classList.contains("render-focus") === wasFocused)
              document.getElementById("timeline-toggle")?.click();
            if (wasFocused) {
              timelinePane?.expand();
              timelinePane?.resize(50);
            } else timelinePane?.collapse();
          } finally {
            switchingByDivider = false;
          }
          return;
        }
        const size = timelinePane?.getSize();
        showTimelineForSize(size, releasePoint);
        if (size <= focusThreshold && !timelinePane?.isCollapsed())
          timelinePane?.collapse();
      });
    };
    resizer?.addEventListener("mousedown", blockNativeDrag, true);
    resizer?.addEventListener("touchstart", blockNativeDrag, true);
    resizer?.addEventListener("pointerdown", startResize);
    const resizeWithKeyboard = (event) => {
      const axis = dockEdge === "left" || dockEdge === "right"
        ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
      if (!axis.includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const towardTimeline = dockEdge === "top" || dockEdge === "left" ? axis[0] : axis[1];
      timelinePane?.resize(Math.max(7, Math.min(100,
        timelinePane.getSize() + (event.key === towardTimeline ? 2 : -2))));
    };
    resizer?.addEventListener("keydown", resizeWithKeyboard, true);
    window.addEventListener("pointermove", moveResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    resizer?.addEventListener("lostpointercapture", finishResize);
    window.addEventListener("urlAutofill:focus", syncFocus);
    initialize();
    const pipInitFrame = requestAnimationFrame(() => {
      const size = timelinePane?.getSize();
      const active = size >= pipTimelineThreshold;
      if (active && size < 100) timelinePane?.resize(100);
      syncPictureInPicture(active);
    });
    if (!document.body.classList.contains("render-focus") &&
        previousPaneSize === null)
      document.getElementById("timeline-toggle")?.click();
    return () => {
      cancelAnimationFrame(pipInitFrame);
      cancelAnimationFrame(pipExitFrame);
      pipExitAnimation?.cancel();
      pipListeners.abort();
      syncPictureInPicture = null;
      document.body.classList.remove("timeline-pip",
        "timeline-pip-dragging", "timeline-pip-dock-ready");
      document.body.style.removeProperty("--pip-dock-top");
      document.body.style.removeProperty("--pip-dock-left");
      document.body.style.removeProperty("--pip-dock-width");
      document.body.style.removeProperty("--pip-dock-height");
      document.body.removeAttribute("data-pip-dock-target");
      resizer?.removeEventListener("mousedown", blockNativeDrag, true);
      resizer?.removeEventListener("touchstart", blockNativeDrag, true);
      resizer?.removeEventListener("pointerdown", startResize);
      resizer?.removeEventListener("keydown", resizeWithKeyboard, true);
      window.removeEventListener("pointermove", moveResize);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      resizer?.removeEventListener("lostpointercapture", finishResize);
      window.removeEventListener("urlAutofill:focus", syncFocus);
    };
  });

  function togglePreviewSplits() {
    showPreviewSplits = !showPreviewSplits;
    try { localStorage.setItem("urlAutofill.pipSplits.v1", String(showPreviewSplits)); }
    catch { /* The toggle still works without storage. */ }
  }
</script>

<svelte:head>
  <title>URL Autofill · v0.8.4</title>
</svelte:head>

<ControlsDrawer />
<div class="page-layout-preview flex flex-col w-full h-full" data-dock-edge={dockEdge}>
  <div class="border-b-2 border-white/30">
    <HeaderControls />
  </div>
  <PaneGroup
    direction={dockEdge === "left" || dockEdge === "right" ? "horizontal" : "vertical"}
    autoSaveId="urlAutofill.panes.v1"
    class="page-layout-split"
    data-dock-edge={dockEdge}
  >
    <Pane
      defaultSize={72}
      minSize={0}
      class={showPreviewSplits
        ? "stage-pane preview-stage bg-green-400"
        : "stage-pane preview-stage bg-green-400 preview-result-only"}
    >
      <Stage />
      <button class="timeline-pip-gesture" type="button"
        aria-label="Drag preview to any edge to dock; use arrow keys to move, pinch or plus and minus to resize">
        <span>Preview · drag to an edge to dock · pinch to resize</span>
      </button>
      <button class="timeline-pip-splits" type="button"
        aria-label="Show preview splits" aria-pressed={showPreviewSplits}
        title={showPreviewSplits ? "Show only render result" : "Show preview splits"}
        onclick={togglePreviewSplits}>Splits</button>
      <button class="timeline-pip-expand" type="button"
        aria-label="Return preview to pane layout" title="Return preview to pane layout"
        onclick={() => dockPreview(dockEdge)}>↗</button>
    </Pane>
    <PaneResizer class="pane-resizer" />
    <Pane
      defaultSize={28}
      minSize={10}
      collapsedSize={dockEdge === "left" || dockEdge === "right" ? 0 : 7}
      collapsible={true}
      bind:this={timelinePane}
      onResize={showTimelineForSize}
      class="timeline-pane focus-timeline"
    >
      <TimelineEditor />
    </Pane>
  </PaneGroup>
  <div id="focus-seeker" aria-label="Render position">
    <button id="focus-loop-follow" type="button" hidden
      title="Reset the loop to the selected clip and follow it">Follow clip</button>
    <select id="focus-loop-mode" aria-label="Loop playback mode" title="Loop playback mode" hidden>
      <option value="repeat">Repeat</option>
      <option value="one-shot">One shot</option>
      <option value="ping-pong">Ping pong</option>
    </select>
    <input id="focus-seeker-scrubber" type="range" min="0" max="0" step="0.01" value="0"
      aria-label="Render position in seconds" />
    <span id="focus-seeker-time">0.00 / 0.00s</span>
  </div>
  {#each dockEdges as edge}
    <div class="timeline-pip-dock-line dock-{edge}" aria-hidden="true"></div>
  {/each}
</div>
<PointerOverlay />
