<script>
  import { onMount } from "svelte";
  import { PaneGroup, Pane, PaneResizer } from "paneforge";
  import HeaderControls from "../lib/components/HeaderControls.svelte";
  import ControlsDrawer from "../lib/components/ControlsDrawer.svelte";
  import Stage from "../lib/components/Stage.svelte";
  import TimelineEditor from "../lib/components/TimelineEditor.svelte";
  import PointerOverlay from "../lib/components/PointerOverlay.svelte";
  import { initialize } from "../lib/legacy-controller.js";
  import "../app.css";

  let timelinePane = $state(null);
  let compactPaneSize = $state(10);
  let minimumPaneSize = $state(10.5);
  const maximizeThreshold = 80;
  let syncingFromResize = false;

  function focusThreshold() {
    return Math.max(16, minimumPaneSize + 2);
  }

  function leaveMaximized() {
    if (!document.body.classList.contains("timeline-maximized")) return;
    document.body.classList.remove("timeline-maximized");
    document.querySelectorAll("#track-content .track-row[data-track]:not(.selected-track):not(.auto-expanded-track)")
      .forEach((row) => {
        row.querySelector(".track-heading")?.style.removeProperty("padding-top");
        row.querySelector(".track-heading")?.style.removeProperty("padding-bottom");
        row.querySelector(".track-lane")?.style.removeProperty("min-height");
      });
  }

  function showTimelineForSize(size) {
    if (!Number.isFinite(size)) return;
    if (size >= 99) document.body.classList.add("timeline-maximized");
    else leaveMaximized();
    const focused = size <= focusThreshold();
    document.body.classList.toggle("timeline-tracks-expanded", size >= maximizeThreshold);
    if (document.body.classList.contains("render-focus") === focused) return;
    syncingFromResize = true;
    try {
      document.getElementById("timeline-toggle")?.click();
    } finally {
      syncingFromResize = false;
    }
  }

  onMount(() => {
    const resizer = document.querySelector(".pane-resizer");
    const paneGroup = document.querySelector(".page-layout-split");
    let resizePointer = null;
    let restoringLayout = true;
    const measureCompactPane = () => {
      if (!paneGroup?.clientHeight) return;
      const controlsHeight = window.innerWidth <= 600 ? 80 : 56;
      const size = Math.max(7, Math.min(50, controlsHeight / paneGroup.clientHeight * 100));
      compactPaneSize = size;
      minimumPaneSize = size + 0.5;
      requestAnimationFrame(() => {
        if (!restoringLayout && resizePointer === null && document.body.classList.contains("render-focus"))
          timelinePane?.collapse();
      });
    };
    const paneObserver = new ResizeObserver(measureCompactPane);
    if (paneGroup) paneObserver.observe(paneGroup);
    window.addEventListener("resize", measureCompactPane);
    const syncFocus = (event) => {
      if (syncingFromResize || restoringLayout) return;
      document.body.classList.toggle("timeline-tracks-expanded",
        !event.detail.focused && timelinePane?.getSize() >= maximizeThreshold);
      if (event.detail.focused) {
        leaveMaximized();
        timelinePane?.collapse();
      }
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
    const startResize = (event) => {
      resizePointer = event.pointerId;
    };
    const finishResize = (event) => {
      if (event.pointerId !== resizePointer) return;
      resizePointer = null;
      if (event.type === "pointercancel") return;
      requestAnimationFrame(() => {
        const size = timelinePane?.getSize();
        showTimelineForSize(size);
        if (size >= maximizeThreshold) {
          timelinePane?.resize(100);
          document.body.classList.add("timeline-maximized");
          return;
        }
        if (size <= focusThreshold() && !timelinePane?.isCollapsed())
          timelinePane?.collapse();
      });
    };
    resizer?.addEventListener("pointerdown", startResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    window.addEventListener("urlAutofill:focus", syncFocus);
    initialize();
    const restoreFrame = requestAnimationFrame(() => {
      restoringLayout = false;
      measureCompactPane();
      const size = timelinePane?.getSize();
      if (size <= focusThreshold() && !document.body.classList.contains("render-focus")) {
        timelinePane?.resize(28);
        showTimelineForSize(28);
        return;
      }
      showTimelineForSize(size);
      if (size >= maximizeThreshold) {
        timelinePane?.resize(100);
        document.body.classList.add("timeline-maximized");
      } else if (size <= focusThreshold() && !timelinePane?.isCollapsed()) {
        timelinePane?.collapse();
      }
    });
    return () => {
      document.body.classList.remove("timeline-maximized");
      document.body.classList.remove("timeline-tracks-expanded");
      cancelAnimationFrame(restoreFrame);
      paneObserver.disconnect();
      window.removeEventListener("resize", measureCompactPane);
      resizer?.removeEventListener("pointerdown", startResize);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      window.removeEventListener("urlAutofill:focus", syncFocus);
    };
  });
</script>

<svelte:head>
  <title>URL Autofill · v0.7.0</title>
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
      class="stage-pane preview-stage bg-green-400"
    >
      <Stage />
    </Pane>
    <PaneResizer class="pane-resizer" />
    <Pane
      defaultSize={28}
      minSize={minimumPaneSize}
      collapsedSize={compactPaneSize}
      collapsible={true}
      bind:this={timelinePane}
      onResize={showTimelineForSize}
      class="timeline-pane focus-timeline"
    >
      <TimelineEditor />
    </Pane>
  </PaneGroup>
</div>
<PointerOverlay />
