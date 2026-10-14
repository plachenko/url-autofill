<script>
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { isTeslaCarBrowser } from "../tesla-browser.js";

  let teslaBrowser = $state(false);
  onMount(() => {
    teslaBrowser = isTeslaCarBrowser(navigator.userAgent);
  });
</script>

<div class="h-[50px] flex flex-1 place-items-center">
  <div class="flex-1 p-2">
    <button
      id="menu-toggle"
      type="button"
      aria-label="Open menu"
      aria-controls="drawer"
      aria-expanded="false"
      ><svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M4 6h16M4 12h16M4 18h16" /></svg
      ></button
    >
  </div>
  <div class="p-2">
    <button
      id="page-fullscreen"
      type="button"
      aria-label="Enter fullscreen"
      title="Enter fullscreen"
      aria-pressed="false"
      hidden
      ><svg class="icon-enter" viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" /></svg
      ><svg class="icon-exit" viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5" /></svg
      ></button
    >
    <button
      id="tesla-theater-button"
      type="button"
      aria-label="Tesla Theater fullscreen"
      title="Tesla Theater fullscreen"
      hidden={!teslaBrowser}
      ><img src="{base}/tesla-theater.svg" alt="" aria-hidden="true" /></button
    >
    <button id="fullscreen-restore" type="button" hidden
      >Restore fullscreen</button
    >
  </div>
</div>
