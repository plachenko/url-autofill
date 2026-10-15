import { loadMediaAsync } from './media-store.js';
import { createSessionBackup, restoreSessionBackup, projectsStorageKey } from './app-storage.js';
import { saveReceivedBlob, removeReceivedBlob } from './received-media.js';

export const mediaKey = /^urlAutofill\.media\.v1\.([\w-]+)\.(meta|part\.\d+)$/;
export function archiveLayout(backup) {
  return { ...backup, entries: Object.fromEntries(Object.entries(backup.entries).filter(([key]) => !mediaKey.test(key))) };
}
export function imageArchiveDuration(entries, id, fallback) {
  let duration = fallback;
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.id === id && Number.isFinite(value.duration)) duration = Math.max(duration, value.duration);
    for (const child of Object.values(value)) {
      if (typeof child === 'string') { try { visit(JSON.parse(child)); } catch {} }
      else visit(child);
    }
  }
  visit(entries); return duration;
}
export async function digest(blob) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
}
function ready(element, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Media did not load in time.')), 20000);
    const finish = error => { clearTimeout(timer); element.removeEventListener(event, ok); element.removeEventListener('error', fail); error ? reject(error) : resolve(); };
    const ok = () => finish();
    const fail = () => finish(new Error('Could not decode a clip.'));
    element.addEventListener(event, ok, { once: true }); element.addEventListener('error', fail, { once: true });
  });
}
export async function makeArchive(snapshot, progress, signal) {
  if (!globalThis.MediaRecorder || !globalThis.AudioContext) throw new Error('This browser does not support video archive recording.');
  const ids = Object.keys(snapshot.entries).flatMap(key => key.match(mediaKey)?.[2] === 'meta' ? [key.match(mediaKey)[1]] : []);
  if (!ids.length) throw new Error('There are no saved clips to archive.');
  const audio = new AudioContext();
  await audio.resume();
  const destination = audio.createMediaStreamDestination();
  const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d'); const stream = canvas.captureStream(30);
  stream.addTrack(destination.stream.getAudioTracks()[0]);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(value => MediaRecorder.isTypeSupported(value));
  if (!mime) { await audio.close(); throw new Error('WebM recording is unavailable.'); }
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 });
  const chunks = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  const completed = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = event => reject(event.error || new Error('Recording failed.')); });
  // Handle asynchronous recorder errors immediately, including while decoding a source.
  completed.catch(() => {});
  const segments = []; let element; let clock;
  try {
    for (const [index, id] of ids.entries()) {
      signal.throwIfAborted();
      const item = await loadMediaAsync(id);
      element = document.createElement(item.type === 'video' ? 'video' : 'img');
      if (item.type === 'video') { element.playsInline = true; element.preload = 'auto'; }
      const loaded = ready(element, item.type === 'video' ? 'loadeddata' : 'load'); element.src = item.src; await loaded;
      const duration = item.type === 'video' ? (item.duration || element.duration) : imageArchiveDuration(snapshot.entries, id, item.seconds);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${id}: duration is unavailable.`);
      const offset = item.sourceOffset || 0;
      if (item.type === 'video') {
        if (offset) { const sought = ready(element, 'seeked'); element.currentTime = offset; await sought; }
        audio.createMediaElementSource(element).connect(destination);
      }
      const draw = () => {
        const width = element.videoWidth || element.naturalWidth, height = element.videoHeight || element.naturalHeight;
        const scale = Math.min(canvas.width / width, canvas.height / height);
        ctx.fillStyle = 'black'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(element, (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale);
      };
      draw();
      if (!clock) { recorder.start(1000); clock = performance.now(); }
      const start = (performance.now() - clock) / 1000;
      if (item.type === 'video') await element.play();
      const began = performance.now();
      while ((performance.now() - began) / 1000 < duration) {
        signal.throwIfAborted();
        if (document.hidden) throw new Error('Export stopped because the tab was hidden. Keep this tab visible.');
        draw(); progress((index + Math.min(1, (performance.now() - began) / 1000 / duration)) / ids.length, id);
        await new Promise(resolve => setTimeout(resolve, 1000 / 30));
      }
      segments.push({ id, start, duration, seconds: item.seconds });
      if (item.type === 'video') element.pause();
      element.removeAttribute('src'); element = null;
    }
    recorder.stop(); await completed;
    const video = new Blob(chunks, { type: 'video/webm' });
    if (!video.size) throw new Error('The recorded video is empty.');
    return { video, manifest: { format: 'url-autofill-reel', version: 1, videoBytes: video.size, sha256: await digest(video), segments, layout: archiveLayout(snapshot), encoding: '1920x1080, 30 fps, WebM; re-encoded with letterboxing' } };
  } finally {
    element?.pause?.(); element?.removeAttribute('src');
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach(track => track.stop()); await audio.close();
  }
}
export async function verifyArchive(video, manifest) {
  if (manifest?.format !== 'url-autofill-reel' || manifest.version !== 1 || !Array.isArray(manifest.segments) || !manifest.segments.length ||
      manifest.videoBytes !== video.size || await digest(video) !== manifest.sha256) throw new Error('The video and JSON do not form a matching archive.');
  const ids = new Set();
  for (const segment of manifest.segments) {
    if (!/^[\w-]{1,64}$/.test(segment.id) || ids.has(segment.id) || !Number.isFinite(segment.start) || segment.start < 0 || !Number.isFinite(segment.duration) || segment.duration < .1) throw new Error('Invalid archive segment.');
    ids.add(segment.id);
  }
  // Validate the session without touching browser storage.
  const entries = new Map();
  restoreSessionBackup({ get length() { return entries.size; }, key: i => [...entries.keys()][i], getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }, manifest.layout);
}
export async function restoreArchive(video, manifest) {
  await verifyArchive(video, manifest);
  const blobId = await saveReceivedBlob(new Blob([video], { type: 'video/webm' }));
  const backup = structuredClone(manifest.layout);
  for (const segment of manifest.segments) backup.entries[`urlAutofill.media.v1.${segment.id}.meta`] = JSON.stringify({ mime: 'video/webm', total: 1, seconds: segment.seconds || 3, storage: 'blob', blobId, bytes: video.size, archiveStart: segment.start, archiveDuration: segment.duration });
  try { restoreSessionBackup(localStorage, backup); } catch (error) { await removeReceivedBlob(blobId); throw error; }
}
export async function clearArchivedProject(snapshot) {
  if (JSON.stringify(createSessionBackup(localStorage).entries) !== JSON.stringify(snapshot.entries)) throw new Error('The project changed. Create a new archive before clearing.');
  const registry = localStorage.getItem(projectsStorageKey) || '';
  const blobs = new Set();
  for (const [key, value] of Object.entries(snapshot.entries)) {
    if (!mediaKey.test(key)) continue;
    if (key.endsWith('.meta')) { const meta = JSON.parse(value); if (meta.blobId && !registry.includes(meta.blobId)) blobs.add(meta.blobId); }
  }
  // Keep layout in place for later relinking; remove only the archived media.
  for (const key of Object.keys(snapshot.entries)) if (mediaKey.test(key)) localStorage.removeItem(key);
  for (const id of blobs) await removeReceivedBlob(id);
}
