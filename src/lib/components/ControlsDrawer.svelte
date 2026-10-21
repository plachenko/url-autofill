<script>
  import { onMount } from 'svelte';
  import { adoptTeslaTheaterLink, canShowTeslaTheater, hasTeslaTheaterPreference,
    isTeslaCarBrowser, teslaTheaterPreferenceEvent, teslaTheaterPreferenceKey } from '../tesla-browser.js';
  import MemoryBar from "./MemoryBar.svelte";
  import ClipArchive from "./ClipArchive.svelte";
  import StorageBar from "./StorageBar.svelte";
  import ClipLibrary from "./ClipLibrary.svelte";
  import HelpPanel from "./HelpPanel.svelte";

  let teslaBrowser = $state(false);
  let teslaTheaterEnabled = $state(false);
  let teslaTheaterPreference = $state(false);
  let browserUserAgent = $state('Loading…');
  onMount(() => {
    const cleanUrl = adoptTeslaTheaterLink(window.location.href, window.localStorage);
    if (cleanUrl) {
      try { window.history.replaceState(null, '', cleanUrl); }
      catch { /* The preference is already stored for this browser. */ }
      window.dispatchEvent(new Event(teslaTheaterPreferenceEvent));
    }
    browserUserAgent = navigator.userAgent || '(empty)';
    teslaBrowser = isTeslaCarBrowser(browserUserAgent);
    teslaTheaterPreference = hasTeslaTheaterPreference(window.localStorage);
    teslaTheaterEnabled = canShowTeslaTheater(browserUserAgent, window.localStorage);
  });
  function changeTeslaTheaterPreference(event) {
    try {
      if (event.currentTarget.checked) window.localStorage.setItem(teslaTheaterPreferenceKey, '1');
      else window.localStorage.removeItem(teslaTheaterPreferenceKey);
    } catch {
      event.currentTarget.checked = teslaTheaterPreference;
      return;
    }
    teslaTheaterPreference = event.currentTarget.checked;
    teslaTheaterEnabled = teslaBrowser || teslaTheaterPreference;
    window.dispatchEvent(new Event(teslaTheaterPreferenceEvent));
  }
  function openWebSocketImport() {
    if (document.body.classList.contains('render-focus'))
      document.getElementById('timeline-toggle')?.click();
    document.getElementById('timeline-import-tab')?.click();
    document.getElementById('menu-close')?.click();
  }
</script>
<div id="drawer-backdrop" hidden></div>
<aside id="drawer" aria-label="Controls and help" hidden>
  <div class="drawer-heading"><strong>URL Autofill</strong><button id="menu-close" type="button" aria-label="Close menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
  <div class="drawer-view-actions">
    <button id="drawer-fullscreen" type="button" hidden>Enter fullscreen</button>
    <button id="minimal-toggle" type="button" aria-pressed="false">Minimal view</button>
  </div>
  <div class="drawer-view-actions" hidden={!teslaTheaterEnabled}>
    <button id="tesla-fullscreen" type="button">Tesla Theater fullscreen</button>
  </div>
  <div class="drawer-view-actions" aria-label="Modes">
    <button type="button" data-mode="e">Editor mode</button>
    <button type="button" data-mode="sp">Screenplay mode</button>
  </div>
  <header><h1>URL Autofill</h1><span class="version">v0.8.0</span></header>
  <details class="browser-debug">
    <summary>Browser debug</summary>
    <p>Tesla browser detected: {teslaBrowser ? 'Yes' : 'No'}</p>
    <p>User agent: <span class="browser-user-agent">{browserUserAgent}</span></p>
    {#if !teslaBrowser}
      <label class="tesla-theater-preference">
        <input type="checkbox" checked={teslaTheaterPreference} onchange={changeTeslaTheaterPreference}>
        This is my Tesla browser; show Theater button
      </label>
    {/if}
  </details>
  <MemoryBar />
  <StorageBar />
  <ClipArchive />
  <label for="text">You said</label>
  <textarea id="text" placeholder="Your URL can fill this for you"></textarea>
  <ClipLibrary />
  <button type="button" onclick={openWebSocketImport}>Open WebSocket import</button>
  <div class="drawer-timeline-actions" aria-label="Timeline actions">
    <button id="add-track" type="button">Add track</button>
    <button id="delete-tracks" type="button" disabled>Delete tracks</button>
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
  <section class="project-controls" aria-label="Projects">
    <label for="project-select">Project</label>
    <select id="project-select"></select>
    <label for="project-name">Rename current project</label>
    <input id="project-name" type="text" maxlength="80" autocomplete="off" placeholder="Project name">
    <div class="project-actions">
      <button id="new-project" type="button">New</button>
      <button id="rename-project" type="button">Rename</button>
      <button id="delete-project" type="button">Delete</button>
    </div>
    <div class="scene-controls" aria-label="Scenes">
      <label for="scene-select">Scene</label>
      <select id="scene-select"></select>
      <label for="scene-name">Rename current scene</label>
      <input id="scene-name" type="text" maxlength="80" autocomplete="off" placeholder="Scene name">
      <div class="project-actions">
        <button id="new-scene" type="button">New</button>
        <button id="rename-scene" type="button">Rename</button>
        <button id="delete-scene" type="button">Delete</button>
      </div>
    </div>
  </section>
  <label class="session-filename-label" for="session-filename">Session filename</label>
  <input id="session-filename" type="text" maxlength="150" autocomplete="off" spellcheck="false" placeholder="Default: url-autofill-session-YYYY-MM-DD.json">
  <div class="session-file-actions" aria-label="Session backup">
    <button id="download-session" type="button">Download session</button>
    <button id="restore-session" type="button">Restore session</button>
    <input id="restore-session-file" type="file" accept=".json,application/json" hidden>
  </div>
  <button id="clear-saved-data" type="button">Clear saved data</button>
  <HelpPanel />
</aside>

<style>
  .browser-debug { margin: 10px 0; padding: 8px; border: 1px solid #7085a1;
    border-radius: 6px; overflow-wrap: anywhere; }
  .browser-debug summary { cursor: pointer; }
  .browser-debug p { margin: 8px 0 0; font-size: 13px; }
  .browser-user-agent { user-select: text; }
  .tesla-theater-preference { display: flex; align-items: center; gap: 8px;
    margin: 12px 0 0; font-size: 13px; }
  .tesla-theater-preference input { width: 18px; height: 18px; flex: 0 0 auto; }
</style>
