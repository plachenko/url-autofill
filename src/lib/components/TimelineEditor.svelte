<script>
  import TimelineControls from "./TimelineControls.svelte";
  import WebSocketPanel from "./WebSocketPanel.svelte";
  let clipsOpen = false;
  let clipSection = 'saved';
  function switchClipSection(event) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const sections = ['saved', 'import'];
    const offset = event.key === 'ArrowRight' ? 1 : sections.length - 1;
    clipSection = sections[(sections.indexOf(clipSection) + offset) % sections.length];
    document.getElementById(`timeline-${clipSection}-tab`)?.focus();
  }
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
    <div id="timeline-gutter-rail">
      <aside id="timeline-clips-panel" class:is-importing={clipSection !== 'saved'} aria-label="Clips" hidden={!clipsOpen}>
        <div class="clip-panel-tabs" role="tablist" aria-label="Clip panel" tabindex="-1" onkeydown={switchClipSection}>
          <button id="timeline-saved-tab" type="button" role="tab" aria-controls="timeline-saved-content"
            aria-selected={clipSection === 'saved'} onclick={() => clipSection = 'saved'}>Saved</button>
          <button id="timeline-import-tab" type="button" role="tab" aria-controls="timeline-import-content"
            aria-selected={clipSection === 'import'} onclick={() => { clipsOpen = true; clipSection = 'import'; }}>Import</button>
        </div>
        <div id="timeline-saved-content" role="tabpanel" aria-labelledby="timeline-saved-tab" hidden={clipSection !== 'saved'}>
          <div id="timeline-clips-list"></div>
          <p id="timeline-clips-status" role="status" aria-live="polite"></p>
        </div>
        <WebSocketPanel importOpen={clipsOpen && clipSection === 'import'} />
      </aside>
      <div class="timeline-side-tabs" aria-label="Timeline side tabs">
        <button id="timeline-clips-tab" type="button" aria-controls="timeline-clips-panel"
          aria-expanded={clipsOpen} aria-pressed={clipsOpen} onclick={() => clipsOpen = !clipsOpen}>Clips</button>
      </div>
    </div>
    <div id="track-list" aria-label="Composition tracks">
      <div id="track-content"></div>
    </div>
  </div>
</section>
