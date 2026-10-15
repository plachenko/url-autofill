<script>
  import { makeArchive, verifyArchive, restoreArchive, clearArchivedProject } from '../clip-archive.js';
  import { createSessionBackup } from '../app-storage.js';
  let busy = $state(false), status = $state(''), progress = $state(0);
  let result = $state(null), snapshot, verified = $state(false), controller;
  let videoFile, jsonFile;
  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function create() {
    busy = true; verified = false; result = null; controller = new AbortController();
    try {
      window.dispatchEvent(new Event('urlAutofill:flush-archive'));
      await new Promise(resolve => setTimeout(resolve, 200));
      snapshot = createSessionBackup(localStorage);
      result = await makeArchive(snapshot, (fraction, id) => { progress = fraction; status = `Recording ${id} (${Math.round(fraction * 100)}%)`; }, controller.signal);
      progress = 1; status = 'Ready. Save both files, then select the saved pair to verify before clearing.';
    } catch (error) { status = error.message; } finally { busy = false; }
  }
  async function check(restore = false) {
    if (!videoFile || !jsonFile) { status = 'Select the saved video and JSON first.'; return; }
    busy = true;
    try {
      const manifest = JSON.parse(await jsonFile.text());
      await verifyArchive(videoFile, manifest);
      if (restore) {
        if (!confirm('Replace the current project layout and clips with this archive?')) return;
        await restoreArchive(videoFile, manifest); location.replace(location.pathname);
      } else {
        if (!result || manifest.sha256 !== result.manifest.sha256 || JSON.stringify(manifest) !== JSON.stringify(result.manifest)) throw new Error('Select the pair from this export before clearing.');
        verified = true; status = 'Saved pair verified. You can now clear this project’s archived media.';
      }
    } catch (error) { verified = false; status = error.message; } finally { busy = false; }
  }
  async function clear() {
    if (!verified || !confirm('Remove this project’s archived media from this browser? Keep both saved files to restore it. Other projects and the layout remain.')) return;
    busy = true;
    try { await clearArchivedProject(snapshot); location.replace(location.pathname); }
    catch (error) { status = error.message; busy = false; verified = false; }
  }
</script>
<section aria-label="Editable video archive">
  <strong>Editable video archive</strong>
  <p>Save this project’s clips once in a video reel, with a JSON file preserving timeline splits, positions, scenes and preview layout.</p>
  <p>Re-encodes to 1080p WebM at 30 fps with audio and letterboxing. Images become video segments; original file formats and quality are not retained. Export takes real time. Keep this tab visible.</p>
  <button disabled={busy} onclick={create}>Create video archive</button>
  {#if busy}<button onclick={() => controller?.abort()}>Cancel recording</button>{/if}
  <progress max="1" value={progress} aria-label="Video archive progress"></progress>
  {#if result}
    <button disabled={busy} onclick={() => download(result.video, 'clips.webm')}>Save video</button>
    <button disabled={busy} onclick={() => download(new Blob([JSON.stringify(result.manifest, null, 2)], { type: 'application/json' }), 'clips.json')}>Save layout JSON</button>
  {/if}
  <label>Saved video <input disabled={busy} type="file" accept="video/webm,.webm" onchange={event => { videoFile = event.currentTarget.files[0]; verified = false; }}></label>
  <label>Saved JSON <input disabled={busy} type="file" accept="application/json,.json" onchange={event => { jsonFile = event.currentTarget.files[0]; verified = false; }}></label>
  <button disabled={busy || !result} onclick={() => check()}>Verify saved pair</button>
  <button disabled={busy || !verified} onclick={clear}>Clear archived media</button>
  <button disabled={busy} onclick={() => check(true)}>Restore video + JSON</button>
  <p role="status">{status}</p>
</section>
<style>
  section { margin: 12px 0; padding: 10px; border: 1px solid #7085a1; border-radius: 6px; }
  p { font-size: 12px; } progress { width: 100%; margin: 8px 0; } input { max-width: 100%; } button { margin: 3px; }
</style>
