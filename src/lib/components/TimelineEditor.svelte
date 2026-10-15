<script>
  import TimelineControls from "./TimelineControls.svelte";
  let clipsOpen = false;
</script>

<section id="compositor" aria-labelledby="compositor-title">
  <h2 id="compositor-title">Video compositor</h2>
  <TimelineControls />
  <details id="timeline-image-shelf" aria-label="Image clips">
    <summary>Image clips · paste or add</summary>
    <form id="timeline-image-form">
      <input
        id="timeline-image-id"
        type="text"
        maxlength="64"
        pattern="[A-Za-z0-9_-]+"
        placeholder="Clip name"
        aria-label="Image clip name (optional)"
      />
      <input
        id="timeline-image-source"
        type="text"
        placeholder="Paste image or image URL"
        aria-label="Paste an image, image URL, or data URI"
      />
      <button type="submit">Save image</button>
    </form>
    <div id="timeline-image-list" aria-label="Saved image clips"></div>
    <p id="timeline-image-status" role="status" aria-live="polite" hidden></p>
  </details>
  <div id="timeline-workspace">
    <div class="timeline-side-tabs" aria-label="Timeline side tabs">
      <button id="timeline-clips-tab" type="button" aria-controls="timeline-clips-panel"
        aria-expanded={clipsOpen} aria-pressed={clipsOpen} onclick={() => clipsOpen = !clipsOpen}>Clips</button>
    </div>
    <aside id="timeline-clips-panel" aria-label="Saved clips" hidden={!clipsOpen}>
      <div id="timeline-clips-list"></div>
      <p id="timeline-clips-status" role="status" aria-live="polite"></p>
    </aside>
    <div id="track-list" aria-label="Composition tracks">
      <div id="track-content"></div>
    </div>
  </div>
</section>
