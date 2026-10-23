<div id="timeline-controls">
  <div class="compositor-actions">
    <button id="composition-play" type="button">Play</button>
    <button id="loop-playback-toggle" type="button" hidden>Stop loop</button>
    <select id="loop-playback-mode" aria-label="Loop playback mode" title="Loop playback mode" hidden>
      <option value="repeat">Repeat</option>
      <option value="one-shot">One shot</option>
      <option value="ping-pong">Ping pong</option>
    </select>
    <button id="loop-follow-clip" type="button" hidden
      title="Reset the loop to the selected clip and follow it">Follow clip</button>
  </div>
  <div id="seek-wrap">
    <input
      id="composition-scrubber"
      type="range"
      min="0"
      max="0"
      step="0.01"
      value="0"
      aria-label="Composition position in seconds"
    /><div id="compact-loop-range" aria-hidden="true" hidden
      ><div class="compact-loop-center"></div></div
    ><span id="compact-render-frame" aria-hidden="true" hidden></span>
  </div>
  <div id="composition-time">
    <span id="playhead-time">Playhead 0.00 / 0.00s</span>
    <span id="loop-time" hidden></span>
  </div>
  <button
    id="split-clip"
    type="button"
    title="Split selected clips at the playhead, or the visible clip if none are selected"
    >Split</button
  >
  <label id="selected-clip-speed-control" hidden>
    Speed <input id="selected-clip-speed" type="number" min="0.25" max="4"
      step="0.01" value="1" aria-label="Selected clip playback speed" /> ×
  </label>
  <button
    id="snap-toggle"
    type="button"
    aria-pressed="true"
    title="Snap within 0.2 seconds to seconds and clip edges">Snap</button
  >
  <button
    id="auto-expand-track"
    type="button"
    aria-pressed="false"
    title="Expand the track under the playhead">Auto expand</button
  >
  <button
    id="timeline-lock"
    type="button"
    aria-pressed="false"
    title="Lock clips and drag to pan the timeline">Lock</button
  >
  <button id="pin-preview" type="button" aria-pressed="false">Pin</button>
  <button
    id="timeline-toggle"
    type="button"
    aria-controls="track-list"
    aria-expanded="false">Expand tracks</button
  >
</div>
