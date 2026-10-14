<div id="timeline-controls">
      <div class="compositor-actions"><button id="composition-play" type="button">Play</button></div>
      <div id="seek-wrap"><input id="composition-scrubber" type="range" min="0" max="0" step="0.01" value="0" aria-label="Composition position in seconds"><span id="compact-render-frame" aria-hidden="true" hidden></span></div>
      <div id="composition-time">0.00 / 0.00 seconds</div>
      <button id="split-clip" type="button" title="Split selected clips at the playhead, or the visible clip if none are selected">Split</button>
      <button id="snap-toggle" type="button" aria-pressed="true" title="Snap within 0.2 seconds to seconds and clip edges">Snap</button>
      <button id="auto-expand-track" type="button" aria-pressed="false" title="Expand the track under the playhead">Auto expand</button>
      <button id="timeline-lock" type="button" aria-pressed="false" title="Lock clips and drag to pan the timeline">Lock</button>
      <button id="pin-preview" type="button" aria-pressed="false">Pin</button>
      <button id="timeline-toggle" type="button" aria-controls="track-list" aria-expanded="false">Expand tracks</button>
    </div>
