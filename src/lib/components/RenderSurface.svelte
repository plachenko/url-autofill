<div id="preview-layout">
  <div class="preview-view is-active" data-preview-primary="true" role="group" aria-label="Preview view 1">
    <div id="render-surface">
      <div id="output" aria-label="Rendered text" aria-live="polite"></div>
      <div id="composition-preview" aria-label="Composition preview">
        <img id="composition-image" alt="Current composition frame" hidden>
        <canvas id="composition-image-frame" aria-label="Current animation frame" hidden>Current animation frame</canvas>
        <canvas id="composition-video-frame" aria-label="Current movie frame" hidden>Current movie frame</canvas>
        <video id="composition-video" playsinline muted aria-hidden="true" hidden></video>
        <span id="composition-empty">Add clips to a track to preview them.</span>
        <p id="composition-error" role="alert" hidden></p>
      </div>
    </div>
  </div>
</div>
<div id="preview-view-controls" aria-label="Create preview splits">
  <button id="preview-split-vertical" type="button" title="Drag into a preview to split left and right; tap to split the selected preview" aria-label="Create a vertical preview split" aria-keyshortcuts="Enter Space">
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2"></rect><path d="M12 3v18"></path></svg>
  </button>
  <button id="preview-split-horizontal" type="button" title="Drag into a preview to split top and bottom; tap to split the selected preview" aria-label="Create a horizontal preview split" aria-keyshortcuts="Enter Space">
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2"></rect><path d="M2 12h20"></path></svg>
  </button>
</div>
