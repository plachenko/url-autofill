<script>
  import TimelineControls from "./TimelineControls.svelte";
</script>
<section id="compositor" aria-labelledby="compositor-title">
    <h2 id="compositor-title">Video compositor</h2>
    <TimelineControls />
    <details id="timeline-image-shelf" aria-label="Image clips">
      <summary>Image clips · paste or add</summary>
      <form id="timeline-image-form">
        <input id="timeline-image-id" type="text" maxlength="64" pattern="[A-Za-z0-9_-]+" placeholder="Clip name" aria-label="Image clip name (optional)">
        <input id="timeline-image-source" type="text" placeholder="Paste image or image URL" aria-label="Paste an image, image URL, or data URI">
        <button type="submit">Save image</button>
      </form>
      <div id="timeline-image-list" aria-label="Saved image clips"></div>
      <p id="timeline-image-status" role="status" aria-live="polite" hidden></p>
    </details>
    <div id="track-list" aria-label="Composition tracks"><div id="track-content"></div></div>
  </section>
