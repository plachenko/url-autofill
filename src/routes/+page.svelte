<script>
  import { onMount } from 'svelte';
  import { PaneGroup, Pane, PaneResizer } from 'paneforge';
  import HeaderControls from '../lib/components/HeaderControls.svelte';
  import ControlsDrawer from '../lib/components/ControlsDrawer.svelte';
  import Stage from '../lib/components/Stage.svelte';
  import TimelineEditor from '../lib/components/TimelineEditor.svelte';
  import { initialize } from '../lib/legacy-controller.js';
  import '../app.css';

  let timelinePane = $state(null);

  onMount(() => {
    const syncFocus = (event) => {
      if (event.detail.focused) timelinePane?.collapse();
      else timelinePane?.expand();
    };
    window.addEventListener('urlAutofill:focus', syncFocus);
    initialize();
    return () => window.removeEventListener('urlAutofill:focus', syncFocus);
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
