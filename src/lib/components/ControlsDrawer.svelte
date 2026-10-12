<script>
  import MemoryBar from "./MemoryBar.svelte";
  import ClipLibrary from "./ClipLibrary.svelte";
  import HelpPanel from "./HelpPanel.svelte";
</script>
<div id="drawer-backdrop" hidden></div>
<aside id="drawer" aria-label="Controls and help" hidden>
  <div class="drawer-heading"><strong>URL Autofill</strong><button id="menu-close" type="button" aria-label="Close menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
  <div class="drawer-view-actions">
    <button id="drawer-fullscreen" type="button" hidden>Enter fullscreen</button>
    <button id="minimal-toggle" type="button" aria-pressed="false">Minimal view</button>
    <button id="hint-toggle" type="button">Hide hint</button>
  </div>
  <div class="drawer-view-actions">
    <button id="tesla-fullscreen" type="button">Tesla Theater fullscreen</button>
  </div>
  <div class="drawer-view-actions" aria-label="Modes">
    <button type="button" data-mode="e">Editor mode</button>
    <button type="button" data-mode="sp">Screenplay mode</button>
  </div>
  <header><h1>URL Autofill</h1><span class="version">v0.7.0</span></header>
  <MemoryBar />
  <label for="text">You said</label>
  <textarea id="text" placeholder="Your URL can fill this for you"></textarea>
  <ClipLibrary />
  <div class="drawer-timeline-actions" aria-label="Timeline actions">
    <button id="add-track" type="button">Add track</button>
    <button id="position-url" type="button">Put position in URL</button>
    <button id="browser-zoom-toggle" type="button" aria-pressed="false">Browser zoom: Off</button>
  </div>
  <label for="reply">Assistant reply</label>
  <textarea id="reply" placeholder="Your URL can fill the assistant reply"></textarea>
  <div class="buttons" aria-label="Manual actions">
    <button type="button" data-action="render">Run Render</button>
    <button type="button" data-action="clear">Run Clear</button>
    <button type="button" data-action="speak">Run Speak</button>
    <button type="button" data-action="upper">Run Upper</button>
  </div>
  <div id="waiting" hidden>
    <div id="countdown" role="timer" aria-label="Time until action runs"></div>
    <button id="cancel" type="button">Cancel</button>
  </div>
  <p id="status" role="status" aria-live="polite">Ready.</p>
  <HelpPanel />
</aside>
