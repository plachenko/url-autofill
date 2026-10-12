<script>
  import ScreenplayWorkspace from "./ScreenplayWorkspace.svelte";
  import MinimalDisplay from "./MinimalDisplay.svelte";
  import RenderSurface from "./RenderSurface.svelte";
</script>
<main id="stage">
  <ScreenplayWorkspace />
  <MinimalDisplay />
  <RenderSurface />
  <div id="compositor-status"><span id="compositor-status-text" role="status" aria-live="polite">Add a saved clip to start. Drag a tile to set its start second or move it to another track.</span><button id="compositor-status-close" type="button" aria-label="Close timeline hint">×</button></div>
</main>
