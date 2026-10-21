<script>
  import { onMount } from "svelte";
  import { PaneGroup, Pane, PaneResizer } from "paneforge";
  import HeaderControls from "../lib/components/HeaderControls.svelte";
  import ControlsDrawer from "../lib/components/ControlsDrawer.svelte";
  import Stage from "../lib/components/Stage.svelte";
  import TimelineEditor from "../lib/components/TimelineEditor.svelte";
  import PointerOverlay from "../lib/components/PointerOverlay.svelte";
  import { clampPipRect, initialPipRect, movePipRect, pinchPipRect } from "../lib/pip-geometry.js";
  import { initialize } from "../lib/legacy-controller.js";
  import "../app.css";

  let timelinePane = $state(null);
  let showPreviewSplits = $state(true);
  const focusThreshold = 16;
  const trackFocusThreshold = 80;
  let previousPaneSize = null;
  let syncingFromResize = false;
  let switchingByDivider = false;
  let draggingDivider = false;
  let syncPictureInPicture = null;

  function showTimelineForSize(size) {
    if (!Number.isFinite(size)) return;
    document.body.classList.toggle("timeline-tracks-expanded", size >= trackFocusThreshold);
    const pictureInPicture = size >= 99;
    syncPictureInPicture?.(pictureInPicture);
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
    let pipExitTimer = null;
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
    syncPictureInPicture = (active) => {
      if (!active) {
        pointers.clear();
        gesture = null;
        document.body.classList.remove("timeline-pip-dragging", "timeline-pip-dock-ready");
        if (document.body.classList.contains("timeline-pip")) {
          document.body.classList.replace("timeline-pip", "timeline-pip-exiting");
          clearTimeout(pipExitTimer);
          pipExitTimer = setTimeout(() => {
            document.body.classList.remove("timeline-pip-exiting");
            pipExitTimer = null;
          }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240);
        }
        return;
      }
      clearTimeout(pipExitTimer);
      pipExitTimer = null;
      if (!document.body.classList.contains("timeline-pip"))
        pipRect = lastPlacedRect ? clampPipRect(lastPlacedRect, viewport()) : initialPipRect(viewport());
      else pipRect = clampPipRect(pipRect, viewport());
      applyPipRect();
      document.body.classList.remove("timeline-pip-exiting");
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
    };
    const updateDockTarget = () => {
      const bounds = timelineElement.getBoundingClientRect();
      document.body.style.setProperty("--pip-dock-top", `${bounds.top}px`);
      const overDock = pipRect.left < bounds.right &&
        pipRect.left + pipRect.width > bounds.left &&
        pipRect.top <= bounds.top + 8 &&
        pipRect.top + pipRect.height >= bounds.top;
      document.body.classList.toggle("timeline-pip-dock-ready", overDock);
      return overDock;
    };
    pipCapture.addEventListener("pointerdown", (event) => {
      if (!document.body.classList.contains("timeline-pip") ||
        (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      event.stopPropagation();
      pipCapture.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      resetGesture();
      if (gesture?.type === "move") updateDockTarget();
    }, { signal: pipListeners.signal });
    pipCapture.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture.type === "move") {
        const point = pointers.get(event.pointerId);
        pipRect = movePipRect(gesture.rect,
          point.x - gesture.start.x, point.y - gesture.start.y, viewport());
        updateDockTarget();
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
        updateDockTarget();
      pointers.delete(event.pointerId);
      if (dock) {
        document.body.classList.remove("timeline-pip-dragging", "timeline-pip-dock-ready");
        timelinePane?.resize(50);
        return;
      }
      if (pointers.size === 0) savePipRect();
      resetGesture();
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      pipCapture.addEventListener(type, endPipPointer, { signal: pipListeners.signal });
    pipCapture.addEventListener("keydown", (event) => {
      if (!document.body.classList.contains("timeline-pip")) return;
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
        if (!event.detail.previousFocused && size > focusThreshold && size < 99)
          previousPaneSize = size;
        if (action === "timeline") {
          timelinePane.expand();
          timelinePane.resize(100);
          return;
        }
      } else if (action === "restore") {
        const size = previousPaneSize > focusThreshold && previousPaneSize < 99
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
    // pointer drags here so the divider is placed at the pointer's Y position.
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
      if (group.height > 0)
        timelinePane?.resize(100 - (event.clientY - group.top) / group.height * 100);
    };
    const finishResize = (event) => {
      if (event.pointerId !== resizePointer?.id) return;
      const directClick = event.type === "pointerup" &&
        Math.hypot(event.clientX - resizePointer.x,
          event.clientY - resizePointer.y) < 5;
      const wasFocused = resizePointer.focused;
      if (event.type === "pointerup" && !directClick) moveResize(event);
      resizePointer = null;
      draggingDivider = false;
      if (event.type !== "pointerup") return;
      requestAnimationFrame(() => {
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
        showTimelineForSize(size);
        if (size <= focusThreshold && !timelinePane?.isCollapsed())
          timelinePane?.collapse();
      });
    };
    resizer?.addEventListener("mousedown", blockNativeDrag, true);
    resizer?.addEventListener("touchstart", blockNativeDrag, true);
    resizer?.addEventListener("pointerdown", startResize);
    window.addEventListener("pointermove", moveResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    resizer?.addEventListener("lostpointercapture", finishResize);
    window.addEventListener("urlAutofill:focus", syncFocus);
    initialize();
    const pipInitFrame = requestAnimationFrame(() => {
      const active = timelinePane?.getSize() >= 99;
      syncPictureInPicture(active);
    });
    if (!document.body.classList.contains("render-focus") &&
        previousPaneSize === null)
      document.getElementById("timeline-toggle")?.click();
    return () => {
      cancelAnimationFrame(pipInitFrame);
      clearTimeout(pipExitTimer);
      pipListeners.abort();
      syncPictureInPicture = null;
      document.body.classList.remove("timeline-pip", "timeline-pip-exiting",
        "timeline-pip-dragging", "timeline-pip-dock-ready");
      document.body.style.removeProperty("--pip-dock-top");
      resizer?.removeEventListener("mousedown", blockNativeDrag, true);
      resizer?.removeEventListener("touchstart", blockNativeDrag, true);
      resizer?.removeEventListener("pointerdown", startResize);
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
<div class="page-layout-preview flex flex-col w-full h-full">
  <div class="border-b-2 border-white/30">
    <HeaderControls />
  </div>
  <PaneGroup
    direction="vertical"
    autoSaveId="urlAutofill.panes.v1"
    class="page-layout-split"
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
        aria-label="Move preview with arrow keys or drag; pinch or press plus and minus to resize">
        <span>Preview · drag to move · pinch to resize</span>
      </button>
      <button class="timeline-pip-splits" type="button"
        aria-label="Show preview splits" aria-pressed={showPreviewSplits}
        title={showPreviewSplits ? "Show only render result" : "Show preview splits"}
        onclick={togglePreviewSplits}>Splits</button>
      <button class="timeline-pip-expand" type="button"
        aria-label="Return preview to pane layout" title="Return preview to pane layout"
        onclick={() => timelinePane?.resize(50)}>↗</button>
    </Pane>
    <PaneResizer class="pane-resizer" />
    <Pane
      defaultSize={28}
      minSize={10}
      collapsedSize={7}
      collapsible={true}
      bind:this={timelinePane}
      onResize={showTimelineForSize}
      class="timeline-pane focus-timeline"
    >
      <TimelineEditor />
    </Pane>
  </PaneGroup>
  <div class="timeline-pip-dock-line" aria-hidden="true"></div>
</div>
<PointerOverlay />
