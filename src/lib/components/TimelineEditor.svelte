<script>
  import TimelineControls from "./TimelineControls.svelte";
  import WebSocketPanel from "./WebSocketPanel.svelte";
  let clipsOpen = false;
  let sideTab = "clips";
  function openPaletteEditor() { sideTab = "palette"; clipsOpen = true; }
  let clipSection = "saved";
  function switchClipSection(event) {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const sections = ["saved", "import"];
    const offset = event.key === "ArrowRight" ? 1 : sections.length - 1;
    clipSection =
      sections[(sections.indexOf(clipSection) + offset) % sections.length];
    document.getElementById(`timeline-${clipSection}-tab`)?.focus();
  }
</script>

<svelte:window onopenpaletteeditor={openPaletteEditor} />
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
    <div
      id="timeline-gutter-rail"
      class:is-open={clipsOpen}
      class:is-importing={sideTab === "clips" && clipSection !== "saved"}
      class:is-palette={sideTab === "palette"}
    >
      <aside id="timeline-clips-panel" aria-label="Clips" hidden={!clipsOpen || sideTab !== "clips"}>
        <div
          class="clip-panel-tabs"
          role="tablist"
          aria-label="Clip panel"
          tabindex="-1"
          onkeydown={switchClipSection}
        >
          <button
            id="timeline-saved-tab"
            type="button"
            role="tab"
            aria-controls="timeline-saved-content"
            aria-selected={clipSection === "saved"}
            onclick={() => (clipSection = "saved")}>Saved</button
          >
          <button
            id="timeline-import-tab"
            type="button"
            role="tab"
            aria-controls="timeline-import-content"
            aria-selected={clipSection === "import"}
            onclick={() => {
              clipsOpen = true;
              clipSection = "import";
            }}>Import</button
          >
        </div>
        <div
          id="timeline-saved-content"
          role="tabpanel"
          aria-labelledby="timeline-saved-tab"
          hidden={clipSection !== "saved"}
        >
          <div id="timeline-clips-list"></div>
          <p id="timeline-clips-status" role="status" aria-live="polite"></p>
        </div>
        <WebSocketPanel importOpen={clipsOpen && clipSection === "import"} />
      </aside>
      <aside id="timeline-palette-panel" aria-label="Palette" hidden={!clipsOpen || sideTab !== "palette"}>
        <h3>Palette</h3>
        <p>Drag an object onto a track. Click it on the timeline to edit it.</p>
        <div id="timeline-palette-list"></div>
        <form id="palette-add-form">
          <strong>Add an object</strong>
          <label for="palette-new-kind">Type</label>
          <select id="palette-new-kind"><option value="color">Color</option><option value="text">Text</option><option value="empty">Empty clip</option></select>
          <label for="palette-new-label">Name</label>
          <input id="palette-new-label" maxlength="48" placeholder="Object name" required>
          <button type="submit">Add to Palette</button>
        </form>
        <form id="palette-edit-form" hidden>
          <strong>Edit timeline object</strong>
          <p id="palette-edit-name"></p>
          <label for="palette-edit-kind">Type</label>
          <select id="palette-edit-kind"><option value="color">Color</option><option value="text">Text</option><option value="empty">Empty clip</option><option value="file">Image or video file</option></select>
          <label for="palette-edit-label">Name</label>
          <input id="palette-edit-label" maxlength="48" required>
          <label for="palette-edit-color">Color</label>
          <input id="palette-edit-color" type="color" value="#4472c4">
          <label for="palette-edit-text">Text</label>
          <input id="palette-edit-text" maxlength="200" placeholder="Text to show">
          <label for="palette-edit-file">File</label>
          <input id="palette-edit-file" type="file" accept="image/*,video/*">
          <label for="palette-edit-seconds">Duration in seconds</label>
          <input id="palette-edit-seconds" type="number" min="0.1" max="3600" step="0.1" required>
          <button type="submit">Save object</button>
        </form>
        <p id="timeline-palette-status" role="status" aria-live="polite"></p>
      </aside>
      <div class="timeline-side-tabs" aria-label="Timeline side tabs">
        <button
          id="timeline-clips-tab"
          type="button"
          aria-controls="timeline-clips-panel"
          aria-expanded={clipsOpen && sideTab === "clips"}
          aria-pressed={clipsOpen && sideTab === "clips"}
          onclick={() => { if (sideTab === "clips") clipsOpen = !clipsOpen; else { sideTab = "clips"; clipsOpen = true; } }}>Clips</button
        >
        <button id="timeline-palette-tab" type="button" aria-controls="timeline-palette-panel"
          aria-expanded={clipsOpen && sideTab === "palette"} aria-pressed={clipsOpen && sideTab === "palette"}
          onclick={() => { if (sideTab === "palette") clipsOpen = !clipsOpen; else { sideTab = "palette"; clipsOpen = true; } }}>Palette</button>
      </div>
    </div>
    <div id="track-list" aria-label="Composition tracks">
      <div id="track-content">
        <button id="add-track-bottom" type="button">+ Add track</button>
      </div>
    </div>
  </div>
</section>
