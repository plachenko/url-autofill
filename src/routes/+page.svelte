<script>
  import { onMount } from 'svelte';
  import { PaneGroup, Pane, PaneResizer } from 'paneforge';
  import HeaderControls from '../lib/components/HeaderControls.svelte';
  import ControlsDrawer from '../lib/components/ControlsDrawer.svelte';
  import Stage from '../lib/components/Stage.svelte';
  import TimelineEditor from '../lib/components/TimelineEditor.svelte';
  import PointerOverlay from '../lib/components/PointerOverlay.svelte';
  import { initialize } from '../lib/legacy-controller.js';
  import '../app.css';

  let timelinePane = $state(null);

  onMount(() => {
    const focusThreshold = 16;
    const swipeDistance = 48;
    const resizer = document.querySelector('.pane-resizer');
    const compositor = document.getElementById('compositor');
    const toggleTracks = (focused) => {
      if (document.body.classList.contains('render-focus') !== focused) {
        document.getElementById('timeline-toggle')?.click();
      }
    };
    let resizePointer = null;
    let swipeStart = null;
    const startResize = (event) => { resizePointer = event.pointerId; };
    const finishResize = (event) => {
      if (event.pointerId !== resizePointer) return;
      resizePointer = null;
      if (event.type === 'pointercancel') return;
      requestAnimationFrame(() => {
        if (timelinePane?.getSize() <= focusThreshold) toggleTracks(true);
      });
    };
    const startSwipe = (event) => {
      swipeStart = document.body.classList.contains('render-focus') && event.touches.length === 1
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    };
    const finishSwipe = (event) => {
      if (!swipeStart || event.changedTouches.length !== 1 || event.touches.length) {
        swipeStart = null;
        return;
      }
      const deltaX = event.changedTouches[0].clientX - swipeStart.x;
      const deltaY = event.changedTouches[0].clientY - swipeStart.y;
      swipeStart = null;
      if (deltaY <= -swipeDistance && Math.abs(deltaY) > Math.abs(deltaX)) {
        event.preventDefault();
        toggleTracks(false);
      }
    };
    const cancelSwipe = () => { swipeStart = null; };
    const syncFocus = (event) => {
      if (event.detail.focused) timelinePane?.collapse();
      else {
        timelinePane?.expand();
        requestAnimationFrame(() => {
          if (timelinePane?.getSize() < 20) timelinePane.resize(28);
        });
      }
    };
    resizer?.addEventListener('pointerdown', startResize);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
    compositor?.addEventListener('touchstart', startSwipe, { passive: true });
    compositor?.addEventListener('touchend', finishSwipe, { passive: false });
    compositor?.addEventListener('touchcancel', cancelSwipe);
    window.addEventListener('urlAutofill:focus', syncFocus);
    initialize();
    return () => {
      resizer?.removeEventListener('pointerdown', startResize);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      compositor?.removeEventListener('touchstart', startSwipe);
      compositor?.removeEventListener('touchend', finishSwipe);
      compositor?.removeEventListener('touchcancel', cancelSwipe);
      window.removeEventListener('urlAutofill:focus', syncFocus);
    };
  });
</script>

<svelte:head>
  <title>URL Autofill · v0.7.0</title>
</svelte:head>

<HeaderControls />
<ControlsDrawer />
<PaneGroup direction="vertical" autoSaveId="urlAutofill.panes.v1" class="pane-root">
  <Pane defaultSize={72} minSize={20} class="stage-pane">
    <Stage />
  </Pane>
  <PaneResizer class="pane-resizer" />
  <Pane defaultSize={28} minSize={10} collapsedSize={7} collapsible={true} bind:this={timelinePane} class="timeline-pane">
    <TimelineEditor />
  </Pane>
</PaneGroup>
<PointerOverlay />
