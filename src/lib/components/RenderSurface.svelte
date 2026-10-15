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
<div id="preview-view-controls" aria-label="Preview views">
  <button id="preview-split-vertical" type="button" title="Split selected view side by side" aria-label="Split preview vertically">Vertical</button>
  <button id="preview-split-horizontal" type="button" title="Split selected view top and bottom" aria-label="Split preview horizontally">Horizontal</button>
  <button id="preview-close-view" type="button" title="Close selected extra view" aria-label="Close selected preview view" disabled>Close</button>
</div>
