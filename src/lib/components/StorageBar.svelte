<script>
  import { onMount } from 'svelte';
  import { textStorageBudget, textStorageBytes, storagePercent, storageSize } from '../storage-usage.js';

  let textBytes = null;
  let used = null;
  let quota = null;
  let refreshing = false;
  $: textPercent = storagePercent(textBytes, textStorageBudget);
  $: totalPercent = storagePercent(used, quota);

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try { textBytes = textStorageBytes(window.localStorage); }
    catch { textBytes = null; }
    try {
      const estimate = await navigator.storage?.estimate?.();
      used = Number.isFinite(estimate?.usage) ? estimate.usage : null;
      quota = Number.isFinite(estimate?.quota) && estimate.quota > 0 ? estimate.quota : null;
    } catch { used = null; quota = null; }
    finally { refreshing = false; }
  }

  onMount(() => {
    void refresh();
    const drawer = document.getElementById('drawer');
    const refreshVisible = () => { if (!drawer?.hidden) void refresh(); };
    const observer = new MutationObserver(refreshVisible);
    if (drawer) observer.observe(drawer, { attributes: true, attributeFilter: ['hidden'] });
    const timer = window.setInterval(refreshVisible, 5000);
    window.addEventListener('storage', refreshVisible);
    window.addEventListener('focus', refreshVisible);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener('storage', refreshVisible);
      window.removeEventListener('focus', refreshVisible);
    };
  });
</script>

<section class="storage-usage" aria-label="Browser storage usage">
  <h2>Storage</h2>
  <label for="text-storage-usage">Text, settings &amp; legacy clips</label>
  {#if textPercent !== null}
    <progress id="text-storage-usage" max="100" value={textPercent} aria-label="Text storage usage" class:near-limit={textPercent >= 80}></progress>
    <p>{storageSize(textBytes)} / ~{storageSize(textStorageBudget)} · {textPercent.toFixed(1)}%</p>
  {:else}<p>Text storage unavailable.</p>{/if}
  <label for="browser-storage-usage">Browser storage, including received clips</label>
  {#if totalPercent !== null}
    <progress id="browser-storage-usage" max="100" value={totalPercent} aria-label="Overall browser storage usage" class:near-limit={totalPercent >= 80}></progress>
    <p>{storageSize(used)} / {storageSize(quota)} · {totalPercent.toFixed(1)}%</p>
  {:else}<p>Browser quota unavailable.</p>{/if}
  <p class="storage-note">Estimates for this site. The text limit varies by browser; received clips use a separate storage pool.</p>
  <button type="button" onclick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh storage'}</button>
</section>

<style>
  .storage-usage { margin: 16px 0; padding: 12px; border: 1px solid #7085a1; border-radius: 10px; }
  h2 { margin: 0 0 12px; font-size: 18px; }
  label { display: block; margin-top: 8px; }
  progress { display: block; width: 100%; height: 20px; accent-color: #7fb5ff; }
  progress.near-limit { accent-color: #ffd976; }
  p { margin: 6px 0 12px; overflow-wrap: anywhere; }
  .storage-note { color: #c3dbff; font-size: .85em; }
</style>
