import { compactParams } from "./url-parameters.js";
import { mediaStorageKey, validMediaId, validMime, storeMediaPart, storeWholeMedia, deleteMedia, loadMedia, loadMediaAsync, storeReceivedMedia } from "./media-store.js";
import { clearAllAppStorage, createSessionBackup, restoreSessionBackup } from './app-storage.js';
import { createProject, deleteProject, listProjects, renameProject, switchProject } from './project-store.js';
import { createScene, deleteScene, listScenes, renameScene, switchScene } from './scene-store.js';
import { clearReceivedMedia, exportReceivedMedia, importReceivedMedia } from './received-media.js';
import { websocketImageDropEvent } from './websocket-image-drag.js';
import { visibleCompositionItem } from './composition-visibility.js';
import { canShowTeslaTheater, teslaTheaterPreferenceEvent,
  teslaTheaterTransferParam } from './tesla-browser.js';
import { removeSelectedTracks } from './track-selection.js';
import { createPreviewSplits } from './preview-splits.js';

  'use strict';
  export function initialize() {
    let clearingSavedData = false;
    const fullscreenButton = document.getElementById('page-fullscreen');
    const drawerFullscreenButton = document.getElementById('drawer-fullscreen');
    const fullscreenRestoreButton = document.getElementById('fullscreen-restore');
    const fullscreenStorageKey = 'urlAutofill.fullscreen.v1';
    let fullscreenWanted = false;
    let fullscreenRestorePending = false;
    const teslaMode = () => canShowTeslaTheater(navigator.userAgent, window.localStorage);
    try { fullscreenWanted = window.localStorage.getItem(fullscreenStorageKey) === '1'; }
    catch (error) { /* Fullscreen still works without browser storage. */ }
    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
    const requestFullscreen = element => element.requestFullscreen || element.webkitRequestFullscreen;
    const exitFullscreen = () => document.exitFullscreen || document.webkitExitFullscreen;
    async function changeFullscreen(element) {
      try {
        if (element) {
          const request = requestFullscreen(element);
          if (typeof request === 'function') await request.call(element);
        } else {
          const exit = exitFullscreen();
          if (typeof exit === 'function') await exit.call(document);
        }
      } catch (error) { /* Fullscreen may be denied by the browser. */ }
    }
    function syncFullscreen() {
      const active = Boolean(fullscreenElement());
      const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
      const supported = typeof requestFullscreen(document.documentElement) === 'function' &&
        typeof exitFullscreen() === 'function';
      const showPageFullscreen = supported && !teslaMode();
      fullscreenButton.hidden = !showPageFullscreen;
      drawerFullscreenButton.hidden = !showPageFullscreen;
      fullscreenRestoreButton.hidden = !showPageFullscreen || !fullscreenWanted || active;
      fullscreenButton.setAttribute('aria-label', label);
      fullscreenButton.setAttribute('aria-pressed', String(active));
      fullscreenButton.title = label;
      drawerFullscreenButton.textContent = label;
      drawerFullscreenButton.setAttribute('aria-pressed', String(active));
    }
    function saveFullscreenWanted(wanted) {
      fullscreenWanted = wanted;
      try { window.localStorage.setItem(fullscreenStorageKey, wanted ? '1' : '0'); }
      catch (error) { /* The fullscreen control still works without browser storage. */ }
      syncFullscreen();
    }
    async function enterPageFullscreen() {
      await changeFullscreen(document.documentElement);
      syncFullscreen();
    }
    function togglePageFullscreen() {
      const active = Boolean(fullscreenElement());
      saveFullscreenWanted(!active);
      void (active ? changeFullscreen(null) : enterPageFullscreen());
    }
    async function restoreFullscreen() {
      if (teslaMode() || !fullscreenWanted || fullscreenElement() || fullscreenRestorePending) return;
      fullscreenRestorePending = true;
      try { await enterPageFullscreen(); }
      finally { fullscreenRestorePending = false; }
    }
    fullscreenButton.addEventListener('click', togglePageFullscreen);
    drawerFullscreenButton.addEventListener('click', togglePageFullscreen);
    const teslaFullscreenButton = document.getElementById('tesla-fullscreen');
    const teslaTheaterButton = document.getElementById('tesla-theater-button');
    function syncTeslaTheater() {
      const teslaSupported = teslaMode() &&
        /^https?:$/.test(window.location.protocol);
      teslaFullscreenButton.disabled = !teslaSupported;
      teslaTheaterButton.disabled = !teslaSupported;
      syncFullscreen();
    }
    syncTeslaTheater();
    window.addEventListener(teslaTheaterPreferenceEvent, syncTeslaTheater);
    function openTeslaTheater() {
      const target = new URL(window.location.href);
      const mode = target.searchParams.get('m')?.toLowerCase();
      target.search = '';
      target.hash = '';
      if (mode === 'e' || mode === 'editor' || mode === 'sp' || mode === 'screenplay') {
        target.searchParams.set('m', mode);
      }
      target.searchParams.set(teslaTheaterTransferParam, '1');
      const theater = new URL('https://www.youtube.com/redirect');
      theater.searchParams.set('q', target.href);
      window.location.assign(theater.href);
    }
    teslaFullscreenButton.addEventListener('click', openTeslaTheater);
    teslaTheaterButton.addEventListener('click', openTeslaTheater);
    fullscreenRestoreButton.addEventListener('click', () => { void restoreFullscreen(); });
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    syncFullscreen();
    void restoreFullscreen();
    const menuToggle = document.getElementById('menu-toggle');
    const menuClose = document.getElementById('menu-close');
    const drawer = document.getElementById('drawer');
    const drawerBackdrop = document.getElementById('drawer-backdrop');
    function setDrawerOpen(open) {
      drawer.hidden = !open;
      drawerBackdrop.hidden = !open;
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (open) menuClose.focus();
      else if (drawer.contains(document.activeElement)) menuToggle.focus();
    }
    menuToggle.addEventListener('click', () => setDrawerOpen(drawer.hidden));
    menuClose.addEventListener('click', () => setDrawerOpen(false));
    drawerBackdrop.addEventListener('click', () => setDrawerOpen(false));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !drawer.hidden) setDrawerOpen(false);
    });
    window.addEventListener('pageshow', () => { void restoreFullscreen(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void restoreFullscreen();
    });
    const field = document.getElementById('text');
    const screenplayText = document.getElementById('screenplay-text');
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('m', button.dataset.mode);
        window.location.assign(url.href);
      });
    });
    const replyField = document.getElementById('reply');
    const displayText = document.getElementById('display-text');
    const displayReply = document.getElementById('display-reply');
    let speechSession = 0;
    let speechTimers = [];
    function stopSpeech() {
      speechSession++;
      speechTimers.forEach(window.clearTimeout);
      speechTimers = [];
      document.querySelectorAll('.speech-word.active').forEach(span => span.classList.remove('active'));
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    function words(target, text, source) {
      target.textContent = '';
      for (const match of text.matchAll(/\S+|\s+/g)) {
        const span = document.createElement('span');
        span.textContent = match[0];
        if (/\S/.test(match[0])) {
          span.className = 'speech-word';
          span.dataset.source = source;
          span.dataset.start = match.index;
          span.dataset.end = match.index + match[0].length;
        }
        target.append(span);
      }
    }
    function mediaType(value) {
      const trimmed = value.trim();
      if (/^data:video\/[a-z0-9.+-]+(;[^,]*)?,/i.test(trimmed)) return 'video';
      if (/^data:image\/[a-z0-9.+-]+(;[^,]*)?,/i.test(trimmed)) return 'image';
      return null;
    }
    function imageFailure(src, error) {
      const mime = src.match(/^data:([^;,]+)/i)?.[1];
      const detail = error?.message?.trim();
      return detail
        ? `Could not display ${mime || 'image'}: ${detail.slice(0, 240)}`
        : `Could not display ${mime || 'image'}. The browser reported a load or decode failure without a specific cause; the image may be incomplete, damaged, or unsupported.`;
    }
    const mediaSessions = new Map();
    function disposeMedia(target) {
      for (const [element, dispose] of mediaSessions) {
        if (element === target || target.contains(element)) dispose();
      }
    }
    function renderTimeline(target, names) {
      let items;
      try {
        const ids = names.split(',').map(id => id.trim()).filter(Boolean);
        if (!ids.length || ids.length > 100) throw new Error('Timeline needs 1–100 media IDs.');
        items = ids.map(loadMedia);
      } catch (error) { target.textContent = error.message; return; }
      target.textContent = '';
      const viewer = document.createElement('div');
      viewer.className = 'timeline-player';
      const image = document.createElement('img');
      image.alt = 'Timeline image';
      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.controls = true;
      video.preload = 'auto';
      const controls = document.createElement('div');
      controls.className = 'timeline-controls';
      const previous = document.createElement('button');
      previous.type = 'button';
      previous.textContent = 'Previous';
      const play = document.createElement('button');
      play.type = 'button';
      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = 'Next';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(items.length - 1);
      slider.step = '1';
      slider.setAttribute('aria-label', 'Timeline item');
      const position = document.createElement('span');
      const imageError = document.createElement('p');
      imageError.className = 'image-render-error';
      imageError.setAttribute('role', 'alert');
      imageError.hidden = true;
      const fullscreen = document.createElement('button');
      fullscreen.type = 'button';
      fullscreen.textContent = 'Toggle fullscreen';
      fullscreen.disabled = typeof requestFullscreen(viewer) !== 'function';
      controls.append(previous, play, next, slider, position, fullscreen);
      viewer.append(image, video, imageError, controls);
      target.append(viewer);
      let index = 0;
      let playing = true;
      let finished = false;
      let imageLoaded = false;
      let imageTimer;
      let disposed = false;
      let revision = 0;
      function dispose() {
        disposed = true;
        window.clearTimeout(imageTimer);
        video.pause();
        video.removeAttribute('src');
        image.removeAttribute('src');
        mediaSessions.delete(target);
      }
      mediaSessions.set(target, dispose);
      function update() {
        play.textContent = playing ? 'Pause' : 'Play';
        slider.value = String(index);
        position.textContent = `${index + 1}/${items.length} · ${items[index].id}`;
      }
      function advance() {
        if (disposed || !playing) return;
        if (index + 1 < items.length) show(index + 1);
        else { playing = false; finished = true; update(); }
      }
      function scheduleImage() {
        window.clearTimeout(imageTimer);
        if (playing && imageLoaded && items[index].type === 'image') {
          imageTimer = window.setTimeout(advance, items[index].seconds * 1000);
        }
      }
      function startVideo() {
        const request = revision;
        void video.play().catch(() => {
          if (disposed || request !== revision) return;
          playing = false;
          update();
        });
      }
      function show(nextIndex) {
        revision++;
        window.clearTimeout(imageTimer);
        video.pause();
        video.removeAttribute('src');
        image.removeAttribute('src');
        index = nextIndex;
        finished = false;
        imageLoaded = false;
        imageError.hidden = true;
        const item = items[index];
        image.hidden = item.type !== 'image';
        video.hidden = item.type !== 'video';
        update();
        if (item.type === 'image') image.src = item.src;
        else {
          video.src = item.src;
          if (playing) startVideo();
        }
      }
      image.addEventListener('load', () => {
        if (disposed || items[index].type !== 'image') return;
        imageLoaded = true;
        scheduleImage();
      });
      image.addEventListener('error', () => {
        if (disposed || items[index].type !== 'image') return;
        playing = false;
        image.hidden = true;
        imageError.textContent = `Clip ${items[index].id}: ${imageFailure(items[index].src)}`;
        imageError.hidden = false;
        update();
      });
      video.addEventListener('play', () => {
        if (!disposed && items[index].type === 'video') { playing = true; update(); }
      });
      video.addEventListener('ended', () => {
        if (items[index].type === 'video' && video.ended) advance();
      });
      video.addEventListener('error', () => {
        if (disposed || items[index].type !== 'video') return;
        playing = false;
        update();
      });
      previous.addEventListener('click', () => show(Math.max(0, index - 1)));
      next.addEventListener('click', () => show(Math.min(items.length - 1, index + 1)));
      slider.addEventListener('input', () => show(Number(slider.value)));
      play.addEventListener('click', () => {
        playing = !playing;
        if (!playing) {
          window.clearTimeout(imageTimer);
          video.pause();
        } else if (finished) show(0);
        else if (items[index].type === 'image') scheduleImage();
        else startVideo();
        update();
      });
      fullscreen.addEventListener('click', () => {
        void changeFullscreen(fullscreenElement() === viewer ? null : viewer);
      });
      show(0);
    }
    async function enhanceImage(target, fallback, fallbackViewer, uri) {
      if (!('ImageDecoder' in window)) return;
      let decoder;
      let timer;
      let disposed = false;
      let revision = 0;
      let playing = true;
      let ended = false;
      let frameIndex = 0;
      let repetitions = 0;
      let duration = 100;
      const controller = new AbortController();
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        revision++;
        window.clearTimeout(timer);
        controller.abort();
        if (decoder) decoder.close();
        mediaSessions.delete(target);
      };
      mediaSessions.set(target, dispose);
      try {
        const mime = uri.slice(5, uri.search(/[;,]/)).toLowerCase();
        if (!await window.ImageDecoder.isTypeSupported(mime) || disposed) {
          dispose();
          return;
        }
        const response = await fetch(uri, { signal: controller.signal });
        const data = await response.arrayBuffer();
        if (disposed) return;
        decoder = new window.ImageDecoder({ data, type: mime });
        await decoder.tracks.ready;
        await decoder.completed;
        if (disposed) return;
        const track = decoder.tracks.selectedTrack;
        if (!track || !(track.animated || track.frameCount > 1)) {
          dispose();
          return;
        }
        const total = track.frameCount;
        const wrapper = document.createElement('div');
        wrapper.className = 'animated-image';
        wrapper.tabIndex = 0;
        wrapper.setAttribute('aria-label', fallback.alt + ' playback');
        const canvas = document.createElement('canvas');
        canvas.className = 'rendered-media';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', fallback.alt);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        const controls = document.createElement('div');
        controls.className = 'image-controls';
        const play = document.createElement('button');
        play.type = 'button';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = String(total - 1);
        slider.step = '1';
        slider.value = '0';
        slider.setAttribute('aria-label', 'Animation frame');
        const position = document.createElement('span');
        const fullscreen = document.createElement('button');
        fullscreen.type = 'button';
        fullscreen.disabled = typeof requestFullscreen(wrapper) !== 'function';
        function syncPlayerFullscreen() {
          const active = fullscreenElement() === wrapper;
          fullscreen.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
          fullscreen.setAttribute('aria-pressed', String(active));
        }
        document.addEventListener('fullscreenchange', syncPlayerFullscreen, { signal: controller.signal });
        document.addEventListener('webkitfullscreenchange', syncPlayerFullscreen, { signal: controller.signal });
        syncPlayerFullscreen();
        controls.append(play, slider, position, fullscreen);
        wrapper.append(canvas, controls);
        function update() {
          play.textContent = playing ? 'Pause' : 'Play';
          slider.value = String(frameIndex);
          position.textContent = `${frameIndex + 1} / ${total}`;
        }
        function fallbackImage(error) {
          if (disposed) return;
          dispose();
          target.replaceChildren(fallbackViewer);
          const notice = fallbackViewer.querySelector('.image-render-error');
          if (notice) {
            notice.textContent = `Animation playback stopped: ${error?.message || error?.name || 'frame decode failed'}. Showing the original image.`;
            notice.hidden = false;
          }
        }
        async function draw(index) {
          const request = ++revision;
          const result = await decoder.decode({ frameIndex: index });
          const frame = result.image;
          try {
            if (disposed || request !== revision) return false;
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
            context.drawImage(frame, 0, 0, canvas.width, canvas.height);
            duration = frame.duration > 0 ? frame.duration / 1000 : 100;
            frameIndex = index;
            update();
            return true;
          } finally { frame.close(); }
        }
        function schedule() {
          window.clearTimeout(timer);
          if (!playing || disposed) return;
          timer = window.setTimeout(async () => {
            let next = frameIndex + 1;
            if (next === total) {
              if (track.repetitionCount !== Infinity && repetitions >= track.repetitionCount) {
                playing = false;
                ended = true;
                update();
                return;
              }
              repetitions++;
              next = 0;
            }
            try { if (await draw(next)) schedule(); }
            catch (error) { fallbackImage(error); }
          }, duration);
        }
        async function toggle() {
          playing = !playing;
          update();
          if (playing && ended) {
            ended = false;
            repetitions = 0;
            try { if (await draw(0)) schedule(); }
            catch (error) { fallbackImage(error); }
          } else {
            schedule();
          }
        }
        play.addEventListener('click', toggle);
        slider.addEventListener('input', async () => {
          window.clearTimeout(timer);
          repetitions = 0;
          ended = false;
          try { if (await draw(Number(slider.value))) schedule(); }
          catch (error) { fallbackImage(error); }
        });
        fullscreen.addEventListener('click', () => {
          void changeFullscreen(fullscreenElement() === wrapper ? null : wrapper);
        });
        wrapper.addEventListener('click', event => event.stopPropagation());
        wrapper.addEventListener('keydown', event => {
          if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey ||
              event.target.closest('button, input')) return;
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) toggle();
        });
        if (await draw(0)) {
          target.replaceChildren(wrapper);
          schedule();
        }
      } catch (error) {
        if (!disposed) dispose();
        // Keep the native image for unsupported formats and decoding failures.
      }
    }
    function renderValue(target, value, source) {
      disposeMedia(target);
      if (value.trim().startsWith('timeline:')) {
        renderTimeline(target, value.trim().slice('timeline:'.length));
        return;
      }
      const type = mediaType(value);
      if (!type) { words(target, value, source); return; }
      target.textContent = '';
      const media = document.createElement(type === 'video' ? 'video' : 'img');
      media.className = 'rendered-media';
      if (type === 'video') {
        media.controls = true;
        media.playsInline = true;
        media.preload = 'metadata';
      } else {
        media.alt = source === 'reply' ? 'Assistant reply image' : 'User text image';
      }
      if (type === 'image') {
        const viewer = document.createElement('div');
        viewer.className = 'static-image';
        const imageError = document.createElement('p');
        imageError.className = 'image-render-error';
        imageError.setAttribute('role', 'alert');
        imageError.hidden = true;
        media.addEventListener('error', () => {
          if (!viewer.isConnected) return;
          media.hidden = true;
          imageError.textContent = imageFailure(value.trim());
          imageError.hidden = false;
        });
        const controls = document.createElement('div');
        controls.className = 'image-controls';
        const fullscreen = document.createElement('button');
        fullscreen.type = 'button';
        fullscreen.textContent = 'Toggle fullscreen';
        fullscreen.disabled = typeof requestFullscreen(viewer) !== 'function';
        fullscreen.addEventListener('click', () => {
          void changeFullscreen(fullscreenElement() === viewer ? null : viewer);
        });
        controls.append(fullscreen);
        viewer.append(media, imageError, controls);
        target.append(viewer);
        media.src = value.trim();
        void enhanceImage(target, media, viewer, value.trim());
      } else {
        target.append(media);
        media.src = value.trim();
      }
    }
    let displayedText;
    let displayedReply;
    let displayedMinimal;
    function syncDisplay() {
      const minimal = document.body.classList.contains('minimal');
      if (displayedText === field.value && displayedReply === replyField.value &&
          displayedMinimal === minimal) return;
      stopSpeech();
      if (minimal) {
        renderValue(displayText, field.value, 'text');
        renderValue(displayReply, replyField.value, 'reply');
      } else {
        disposeMedia(displayText);
        disposeMedia(displayReply);
        displayText.textContent = '';
        displayReply.textContent = '';
      }
      displayedText = field.value;
      displayedReply = replyField.value;
      displayedMinimal = minimal;
    }
    const minimalToggle = document.getElementById('minimal-toggle');
    const minimalStorageKey = 'urlAutofill.minimal.v1';
    function syncTextParameter(minimal) {
      const url = new URL(window.location.href);
      let changed = false;
      if (url.searchParams.has('minimal')) {
        url.searchParams.delete('minimal');
        changed = true;
      }
      if (minimal && field.value) {
        if (url.searchParams.get('t') !== field.value) {
          url.searchParams.set('t', field.value);
          changed = true;
        }
      } else {
        if (url.searchParams.has('t')) {
          url.searchParams.delete('t');
          changed = true;
        }
      }
      if (!changed) return;
      try { window.history.replaceState(null, '', url); }
      catch (error) { /* The text remains in the page when history changes are unavailable. */ }
    }
    function setMinimal(minimal, persist = true) {
      document.body.classList.toggle('minimal', minimal);
      minimalToggle.textContent = minimal ? 'Full view' : 'Minimal view';
      minimalToggle.setAttribute('aria-pressed', String(minimal));
      syncTextParameter(minimal);
      if (minimal) {
        disposeMedia(output);
        output.textContent = '';
      }
      if (persist) {
        try { window.localStorage.setItem(minimalStorageKey, minimal ? '1' : '0'); }
        catch (error) { /* The view still changes when storage is unavailable. */ }
      }
      syncDisplay();
      if (!minimal && (field.value || replyField.value)) render();
    }
    minimalToggle.addEventListener('click', () => setMinimal(!document.body.classList.contains('minimal')));
    document.addEventListener('keydown', event => {
      if (event.key !== 'u' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
          document.body.classList.contains('screenplay-mode') ||
          event.target.closest('input, textarea, select, [contenteditable]')) return;
      setMinimal(!document.body.classList.contains('minimal'));
    });
    const output = document.getElementById('output');
    const status = document.getElementById('status');
    const waiting = document.getElementById('waiting');
    const countdown = document.getElementById('countdown');
    let timer = null;
    let ticker = null;
    const storageKey = 'urlAutofill.v1';
    const memoryState = { memory: '', clip: '', text: '', reply: '', lastAction: '', lastUpdated: '' };
    function loadMemory() {
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey));
        for (const key of Object.keys(memoryState)) {
          memoryState[key] = saved && typeof saved[key] === 'string' ? saved[key] : '';
        }
      } catch (error) { /* Keep in-page state when storage is unavailable. */ }
    }
    function showMemory() {
      document.getElementById('memory-value').textContent = memoryState.memory || '—';
      document.getElementById('clip-value').textContent = memoryState.clip || '—';
      document.getElementById('last-action').textContent = memoryState.lastAction || '—';
      const time = document.getElementById('last-updated');
      const date = new Date(memoryState.lastUpdated);
      const valid = !Number.isNaN(date.getTime());
      time.textContent = valid ? date.toLocaleString() : '—';
      time.dateTime = valid ? date.toISOString() : '';
    }
    function saveMemory() {
      try {
        const persisted = { ...memoryState };
        for (const key of Object.keys(persisted)) {
          // localStorage strings use roughly two bytes per character.
          if (persisted[key].length * 2 > 2 * 1024 * 1024 && mediaType(persisted[key])) {
            persisted[key] = '';
          }
        }
        window.localStorage.setItem(storageKey, JSON.stringify(persisted));
      }
      catch (error) { /* The page also works without persistent storage. */ }
      showMemory();
    }
    function saveText() {
      memoryState.text = field.value;
      if (screenplayText.value !== field.value) screenplayText.value = field.value;
      saveMemory();
      syncTextParameter(document.body.classList.contains('minimal'));
      syncDisplay();
    }
    field.addEventListener('input', saveText);
    screenplayText.addEventListener('input', () => {
      field.value = screenplayText.value;
      saveText();
    });
    replyField.addEventListener('input', () => {
      memoryState.reply = replyField.value;
      saveMemory();
      syncDisplay();
    });
    function message(text, error = false) {
      status.textContent = text;
      status.classList.toggle('error', error);
    }
    document.getElementById('clear-saved-data').addEventListener('click', async () => {
      if (!window.confirm('Delete all URL Autofill projects, clips, tracks, text, memory, and preferences saved in this browser? This cannot be undone.')) return;
      try {
        await clearReceivedMedia();
        clearAllAppStorage(window.localStorage);
        clearingSavedData = true;
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        window.location.replace(url.href);
      } catch (error) {
        message(clearingSavedData ? 'Saved data was cleared. Reload this page to reset the view.' :
          'Could not clear saved data in this browser.', true);
      }
    });
    const projectSelect = document.getElementById('project-select');
    const projectNameField = document.getElementById('project-name');
    function showProjects() {
      const { activeId, projects } = listProjects(window.localStorage);
      projectSelect.replaceChildren(...projects.map(project => new Option(project.name, project.id)));
      projectSelect.value = activeId;
      projectNameField.value = projects.find(project => project.id === activeId).name;
      document.getElementById('delete-project').disabled = projects.length === 1;
      return { activeId, projects };
    }
    function loadActiveProject() {
      clearingSavedData = true;
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      window.location.replace(url.href);
    }
    window.addEventListener('urlAutofill:flush-archive', () => { saveMemory(); saveSession(true); saveTracks(); });
    async function saveCurrentProject() {
      saveMemory();
      saveSession(true);
      await new Promise(resolve => window.setTimeout(resolve, 150));
    }
    try { showProjects(); }
    catch (error) { message(`Could not load projects: ${error.message}`, true); }
    projectSelect.addEventListener('change', async () => {
      try {
        await saveCurrentProject();
        switchProject(window.localStorage, projectSelect.value);
        loadActiveProject();
      } catch (error) {
        try { showProjects(); } catch { /* Keep the error visible. */ }
        message(`Could not switch projects: ${error.message}`, true);
      }
    });
    document.getElementById('new-project').addEventListener('click', async () => {
      try {
        const count = listProjects(window.localStorage).projects.length;
        const name = window.prompt('Name for new project', `Project ${count + 1}`);
        if (name === null) return;
        await saveCurrentProject();
        createProject(window.localStorage, name);
        loadActiveProject();
      } catch (error) { message(`Could not create project: ${error.message}`, true); }
    });
    document.getElementById('rename-project').addEventListener('click', () => {
      try {
        renameProject(window.localStorage, listProjects(window.localStorage).activeId,
          projectNameField.value);
        showProjects();
        message('Project renamed.');
      } catch (error) { message(`Could not rename project: ${error.message}`, true); }
    });
    document.getElementById('delete-project').addEventListener('click', () => {
      try {
        const { activeId, projects } = listProjects(window.localStorage);
        const name = projects.find(project => project.id === activeId).name;
        if (!window.confirm(`Delete project "${name}" and its saved data? This cannot be undone.`)) return;
        deleteProject(window.localStorage, activeId);
        loadActiveProject();
      } catch (error) { message(`Could not delete project: ${error.message}`, true); }
    });
    const sceneSelect = document.getElementById('scene-select');
    const sceneNameField = document.getElementById('scene-name');
    function showScenes() {
      const { activeId, scenes } = listScenes(window.localStorage);
      sceneSelect.replaceChildren(...scenes.map(scene => new Option(scene.name, scene.id)));
      sceneSelect.value = activeId;
      sceneNameField.value = scenes.find(scene => scene.id === activeId).name;
      document.getElementById('delete-scene').disabled = scenes.length === 1;
      return { activeId, scenes };
    }
    try { showScenes(); }
    catch (error) { message(`Could not load scenes: ${error.message}`, true); }
    sceneSelect.addEventListener('change', async () => {
      try {
        await saveCurrentProject();
        switchScene(window.localStorage, sceneSelect.value);
        loadActiveProject();
      } catch (error) {
        try { showScenes(); } catch { /* Keep the error visible. */ }
        message(`Could not switch scenes: ${error.message}`, true);
      }
    });
    document.getElementById('new-scene').addEventListener('click', async () => {
      try {
        const count = listScenes(window.localStorage).scenes.length;
        const name = window.prompt('Name for new scene', `Scene ${count + 1}`);
        if (name === null) return;
        await saveCurrentProject();
        createScene(window.localStorage, name);
        loadActiveProject();
      } catch (error) { message(`Could not create scene: ${error.message}`, true); }
    });
    document.getElementById('rename-scene').addEventListener('click', () => {
      try {
        renameScene(window.localStorage, listScenes(window.localStorage).activeId,
          sceneNameField.value);
        showScenes();
        message('Scene renamed.');
      } catch (error) { message(`Could not rename scene: ${error.message}`, true); }
    });
    document.getElementById('delete-scene').addEventListener('click', () => {
      try {
        const { activeId, scenes } = listScenes(window.localStorage);
        const name = scenes.find(scene => scene.id === activeId).name;
        if (!window.confirm(`Delete scene "${name}" and its timeline and text? This cannot be undone.`)) return;
        deleteScene(window.localStorage, activeId);
        loadActiveProject();
      } catch (error) { message(`Could not delete scene: ${error.message}`, true); }
    });
    document.getElementById('download-session').addEventListener('click', async () => {
      try {
        saveMemory();
        saveSession(true);
        await new Promise(resolve => window.setTimeout(resolve, 150));
        const backup = await exportReceivedMedia(createSessionBackup(window.localStorage));
        const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        const defaultName = `url-autofill-session-${new Date().toISOString().slice(0, 10)}`;
        const enteredName = document.getElementById('session-filename').value.trim()
          .replace(/[\\/:*?"<>|\x00-\x1f]/g, '-');
        const baseName = enteredName || defaultName;
        link.download = /\.json$/i.test(baseName) ? baseName : `${baseName}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        message('Session download started.');
      } catch (error) { message('Could not download this session.', true); }
    });
    const restoreSessionFile = document.getElementById('restore-session-file');
    document.getElementById('restore-session').addEventListener('click', () => restoreSessionFile.click());
    restoreSessionFile.addEventListener('change', async () => {
      const file = restoreSessionFile.files?.[0];
      if (!file) return;
      let restored = false;
      try {
        if (file.size > 32 * 1024 * 1024)
          throw new Error('This session file is too large to restore.');
        const backup = JSON.parse(await file.text());
        if (!window.confirm('Replace the current project with this session file?')) return;
        restoreSessionBackup(window.localStorage, await importReceivedMedia(backup));
        restored = true;
        clearingSavedData = true;
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        window.location.replace(url.href);
      } catch (error) {
        message(restored ? 'Session restored. Reload this page to see it.' :
          `Could not restore session: ${error.message}`, true);
      } finally { restoreSessionFile.value = ''; }
    });
    const clipForm = document.getElementById('clip-form');
    const clipIdField = document.getElementById('clip-id');
    const clipFileField = document.getElementById('clip-file');
    const clipSecondsField = document.getElementById('clip-seconds');
    const clipList = document.getElementById('clip-list');
    const clipStatus = document.getElementById('clip-status');
    const timelineClipsList = document.getElementById('timeline-clips-list');
    const timelineClipsStatus = document.getElementById('timeline-clips-status');
    const timelineImageForm = document.getElementById('timeline-image-form');
    const timelineImageId = document.getElementById('timeline-image-id');
    const timelineImageSource = document.getElementById('timeline-image-source');
    const timelineImageList = document.getElementById('timeline-image-list');
    const timelineImageStatus = document.getElementById('timeline-image-status');
    function clipMessage(text, error = false) {
      message(text, error);
      clipStatus.textContent = text;
      clipStatus.classList.toggle('error', error);
    }
    function clipId() {
      const entered = clipIdField.value.trim();
      if (entered) return entered;
      let candidate = `clip-${Date.now()}`;
      let suffix = 1;
      while (window.localStorage.getItem(`${mediaStorageKey(candidate)}.meta`) !== null) {
        candidate = `clip-${Date.now()}-${suffix++}`;
      }
      return candidate;
    }
    function clipSeconds() { return Number(clipSecondsField.value); }
    const trackList = document.getElementById('track-list');
    const trackContent = document.getElementById('track-content');
    trackList.addEventListener('library-clip-drop', async event => {
      const { id, clientX, target } = event.detail;
      try {
        if (tracks.flat().length >= 100)
          throw new Error('The compositor supports up to 100 clips.');
        const row = target.closest('.track-row[data-track]');
        const lane = row?.querySelector('.track-lane');
        if (!lane) throw new Error('Drop the clip on a timeline track.');
        const track = tracks[Number(lane.dataset.track)];
        if (!track) throw new Error('That track is no longer available.');
        const item = await clipDetail(id);
        const trackIndex = tracks.indexOf(track);
        if (trackIndex < 0) throw new Error('That track is no longer available.');
        const start = Math.min(86400, roundTime(Math.max(0, snappedClipStart(
          (clientX - lane.getBoundingClientRect().left) / timelineScale, item.duration))));
        track.push({ id, start });
        activeTrack = trackIndex;
        saveTracks();
        void refreshCompositor();
        timelineClipsStatus.textContent = `Added ${id} to track ${trackIndex + 1} at ${start.toFixed(2)}s.`;
        timelineClipsStatus.classList.remove('error');
      } catch (error) {
        timelineClipsStatus.textContent = error.message || 'Could not add the clip.';
        timelineClipsStatus.classList.add('error');
      }
    });
    trackList.addEventListener(websocketImageDropEvent, event => {
      event.detail.done = (async () => {
      try {
        const { src, blob, clientX, target } = event.detail;
        if (tracks.flat().length >= 100)
          throw new Error('The compositor supports up to 100 clips.');
        const row = target.closest('.track-row');
        const trackIndex = row ? Number(row.querySelector('.track-lane')?.dataset.track) : activeTrack;
        const lane = row?.querySelector('.track-lane') ||
          trackContent.querySelector(`.track-lane[data-track="${activeTrack}"]`);
        if (!lane || !Number.isInteger(trackIndex) || !tracks[trackIndex])
          throw new Error('Choose a track to drop the media on.');
        const base = `media-${Date.now()}`;
        let id = base;
        for (let suffix = 1;
          window.localStorage.getItem(`${mediaStorageKey(id)}.meta`) !== null; suffix++)
          id = `${base}-${suffix}`;
        const result = blob ? await storeReceivedMedia(id, blob, 3) : storeWholeMedia(id, src, 3);
        const details = await clipDetail(id);
        const start = Math.min(86400, roundTime(Math.max(0, snappedClipStart(
          (clientX - lane.getBoundingClientRect().left) / timelineScale, details.duration))));
        tracks[trackIndex].push({ id, start });
        activeTrack = trackIndex;
        saveTracks();
        refreshClipList();
        await refreshCompositor();
        event.detail.message = `${result} Added to track ${trackIndex + 1} at ${start.toFixed(2)}s.`;
        clipMessage(event.detail.message);
      } catch (error) {
        event.detail.message = error.message || 'Could not add the media.';
        event.detail.error = true;
        clipMessage(event.detail.message, true);
      }
      })();
    });
    const timelineZoomKey = 'urlAutofill.timelineZoom.v1';
    let timelineScale = 40;
    try {
      const storedZoom = Number(window.localStorage.getItem(timelineZoomKey));
      if (storedZoom >= 10 && storedZoom <= 160) timelineScale = storedZoom;
    } catch (error) { /* Keep the default zoom without browser storage. */ }
    const browserZoomKey = 'urlAutofill.browserZoom.v1';
    const browserZoomToggle = document.getElementById('browser-zoom-toggle');
    let browserZoomEnabled = false;
    try { browserZoomEnabled = window.localStorage.getItem(browserZoomKey) === '1'; }
    catch (error) { /* Use timeline pinch zoom without browser storage. */ }
    function setBrowserZoom(enabled) {
      browserZoomEnabled = enabled;
      document.body.classList.toggle('browser-timeline-zoom', enabled);
      browserZoomToggle.textContent = `Browser zoom: ${enabled ? 'On' : 'Off'}`;
      browserZoomToggle.setAttribute('aria-pressed', String(enabled));
      try { window.localStorage.setItem(browserZoomKey, enabled ? '1' : '0'); }
      catch (error) { /* The zoom mode still toggles without browser storage. */ }
    }
    browserZoomToggle.addEventListener('click', () => setBrowserZoom(!browserZoomEnabled));
    setBrowserZoom(browserZoomEnabled);
    const trackLabelWidth = 96;
    let trackPlayhead = null;
    let playheadSelected = false;
    document.addEventListener('pointerdown', event => {
      if (event.target.closest('#track-playhead button')) return;
      playheadSelected = false;
      trackPlayhead?.classList.remove('selected');
    });
    const compositionImage = document.getElementById('composition-image');
    const compositionImageFrame = document.getElementById('composition-image-frame');
    const compositionVideo = document.getElementById('composition-video');
    const compositionVideoFrame = document.getElementById('composition-video-frame');
    function drawCompositionVideoFrame() {
      if (compositionVideoFrame.hidden || compositionVideo.readyState < 2 ||
          !compositionVideo.videoWidth || !compositionVideo.videoHeight) return;
      const scale = Math.min(1, 1920 / compositionVideo.videoWidth, 1080 / compositionVideo.videoHeight);
      const width = Math.max(1, Math.round(compositionVideo.videoWidth * scale));
      const height = Math.max(1, Math.round(compositionVideo.videoHeight * scale));
      if (compositionVideoFrame.width !== width) compositionVideoFrame.width = width;
      if (compositionVideoFrame.height !== height) compositionVideoFrame.height = height;
      compositionVideoFrame.getContext('2d')?.drawImage(compositionVideo, 0, 0, width, height);
    }
    compositionVideo.addEventListener('loadeddata', drawCompositionVideoFrame);
    compositionVideo.addEventListener('seeked', drawCompositionVideoFrame);
    compositionVideo.addEventListener('timeupdate', drawCompositionVideoFrame);
    const compositionEmpty = document.getElementById('composition-empty');
    const compositionError = document.getElementById('composition-error');
    const compositionScrubber = document.getElementById('composition-scrubber');
    const seekWrap = document.getElementById('seek-wrap');
    const compactRenderFrame = document.getElementById('compact-render-frame');
    const compositionTimeLabel = document.getElementById('composition-time');
    const compositionPlay = document.getElementById('composition-play');
    const timelineToggle = document.getElementById('timeline-toggle');
    const pinPreviewButton = document.getElementById('pin-preview');
    const snapToggle = document.getElementById('snap-toggle');
    const autoExpandTrackButton = document.getElementById('auto-expand-track');
    const autoExpandTrackKey = 'urlAutofill.autoExpandTrack.v1';
    let autoExpandTrack = false;
    try { autoExpandTrack = window.localStorage.getItem(autoExpandTrackKey) === '1'; }
    catch (error) { /* Keep automatic expansion off without browser storage. */ }
    autoExpandTrackButton.setAttribute('aria-pressed', String(autoExpandTrack));
    autoExpandTrackButton.addEventListener('click', () => {
      autoExpandTrack = !autoExpandTrack;
      autoExpandTrackButton.setAttribute('aria-pressed', String(autoExpandTrack));
      try { window.localStorage.setItem(autoExpandTrackKey, autoExpandTrack ? '1' : '0'); }
      catch (error) { /* Automatic expansion still works without browser storage. */ }
      syncCompositionPreview();
    });
    const timelineLockButton = document.getElementById('timeline-lock');
    const timelineLockKey = 'urlAutofill.timelineLock.v1';
    let manualTimelineLock = false;
    let touchTimelineLock = false;
    try { manualTimelineLock = window.localStorage.getItem(timelineLockKey) === '1'; }
    catch (error) { /* Keep the timeline unlocked without browser storage. */ }
    function timelineLocked() { return manualTimelineLock || touchTimelineLock; }
    function syncTimelineLock() {
      const locked = timelineLocked();
      trackList.classList.toggle('timeline-locked', locked);
      timelineLockButton.setAttribute('aria-pressed', String(locked));
      timelineLockButton.setAttribute('aria-label', locked ? 'Unlock clip dragging' : 'Lock clip dragging');
      timelineLockButton.textContent = locked ? 'Locked' : 'Lock';
    }
    timelineLockButton.addEventListener('click', () => {
      manualTimelineLock = !manualTimelineLock;
      try { window.localStorage.setItem(timelineLockKey, manualTimelineLock ? '1' : '0'); }
      catch (error) { /* The lock still toggles without browser storage. */ }
      syncTimelineLock();
    });
    syncTimelineLock();
    const compositorKey = 'urlAutofill.compositor.v1';
    const snapStorageKey = 'urlAutofill.snap.v1';
    let snapEnabled = true;
    try { snapEnabled = window.localStorage.getItem(snapStorageKey) !== '0'; }
    catch (error) { /* Keep snapping on when storage is unavailable. */ }
    function setSnapEnabled(enabled) {
      snapEnabled = enabled;
      snapToggle.setAttribute('aria-pressed', String(enabled));
      snapToggle.textContent = 'Snap';
      snapToggle.setAttribute('aria-label', enabled ? 'Turn snapping off' : 'Turn snapping on');
      try { window.localStorage.setItem(snapStorageKey, enabled ? '1' : '0'); }
      catch (error) { /* Snapping still toggles without browser storage. */ }
    }
    snapToggle.addEventListener('click', () => setSnapEnabled(!snapEnabled));
    setSnapEnabled(snapEnabled);
    const sessionKey = 'urlAutofill.session.v1';
    const session = { playheadSeconds: 0, renderFrameSeconds: 0, lockRenderFrame: true };
    try {
      const saved = JSON.parse(window.localStorage.getItem(sessionKey));
      if (saved && Number.isFinite(saved.playheadSeconds) && saved.playheadSeconds >= 0)
        session.playheadSeconds = saved.playheadSeconds;
      if (saved && Number.isFinite(saved.renderFrameSeconds) && saved.renderFrameSeconds >= 0)
        session.renderFrameSeconds = saved.renderFrameSeconds;
      if (saved && typeof saved.lockRenderFrame === 'boolean')
        session.lockRenderFrame = saved.lockRenderFrame;
    } catch (error) { /* Start a fresh timeline session. */ }
    let lastSessionSave = 0;
    function saveSession(force = false) {
      if (clearingSavedData) return;
      const now = Date.now();
      if (!force && now - lastSessionSave < 500) return;
      lastSessionSave = now;
      try { window.localStorage.setItem(sessionKey, JSON.stringify(session)); }
      catch (error) { /* Playback still works without browser storage. */ }
    }
    window.addEventListener('pagehide', () => saveSession(true));
    const focusStorageKey = 'urlAutofill.renderFocus.v1';
    let renderFocus = false;
    try { renderFocus = window.localStorage.getItem(focusStorageKey) === '1'; }
    catch (error) { /* Keep the expanded timeline when storage is unavailable. */ }
    function setRenderFocus(focused) {
      renderFocus = focused;
      document.body.classList.toggle('render-focus', focused);
      timelineToggle.textContent = focused ? 'Tracks' : 'Focus';
      timelineToggle.setAttribute('aria-label', focused ? 'Expand tracks' : 'Collapse tracks for render focus');
      timelineToggle.setAttribute('aria-expanded', String(!focused));
      try { window.localStorage.setItem(focusStorageKey, focused ? '1' : '0'); }
      catch (error) { /* The timeline still expands without browser storage. */ }
      window.dispatchEvent(new CustomEvent('urlAutofill:focus', { detail: { focused } }));
    }
    timelineToggle.addEventListener('click', () => setRenderFocus(!renderFocus));
    const renderSurface = document.getElementById('render-surface');
    const previewHost = renderSurface.parentElement;
    const pinStorageKey = 'urlAutofill.previewResolution.v1';
    let pinnedResolution = null;
    try {
      const saved = JSON.parse(window.localStorage.getItem(pinStorageKey));
      if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height) &&
          saved.width > 0 && saved.height > 0) pinnedResolution = saved;
    } catch (error) { /* Start with a responsive preview. */ }
    function updatePinnedScale() {
      if (!pinnedResolution) return;
      const scale = Math.min(previewHost.clientWidth / pinnedResolution.width,
        previewHost.clientHeight / pinnedResolution.height);
      renderSurface.style.setProperty('--pinned-width', `${pinnedResolution.width}px`);
      renderSurface.style.setProperty('--pinned-height', `${pinnedResolution.height}px`);
      renderSurface.style.setProperty('--pinned-scale', String(scale || 1));
    }
    function setPinnedResolution(resolution) {
      pinnedResolution = resolution;
      document.body.classList.toggle('preview-pinned', Boolean(resolution));
      pinPreviewButton.textContent = resolution ? 'Unpin' : 'Pin';
      pinPreviewButton.setAttribute('aria-pressed', String(Boolean(resolution)));
      pinPreviewButton.title = resolution ?
        `Pinned at ${resolution.width} × ${resolution.height} pixels` : 'Pin preview resolution';
      if (resolution) updatePinnedScale();
      else {
        renderSurface.style.removeProperty('--pinned-width');
        renderSurface.style.removeProperty('--pinned-height');
        renderSurface.style.removeProperty('--pinned-scale');
      }
      try {
        if (resolution) window.localStorage.setItem(pinStorageKey, JSON.stringify(resolution));
        else window.localStorage.removeItem(pinStorageKey);
      } catch (error) { /* Pinning still works without browser storage. */ }
    }
    pinPreviewButton.addEventListener('click', () => setPinnedResolution(pinnedResolution ? null : {
      width: Math.max(1, previewHost.clientWidth), height: Math.max(1, previewHost.clientHeight)
    }));
    setRenderFocus(renderFocus);
    setPinnedResolution(pinnedResolution);
    if (typeof ResizeObserver === 'function') new ResizeObserver(updatePinnedScale).observe(previewHost);
    else window.addEventListener('resize', updatePinnedScale);
    let tracks = [[]];
    let activeTrack = 0;
    let compositionItems = [];
    const selectedClips = new Set();
    const selectedTracks = new Set();
    let trackSelectionAnchor = null;
    let pendingTrackFocus = null;
    let compositionDuration = 0;
    let compositionPlaying = false;
    let compositionFrame = 0;
    let compositionStarted = 0;
    let compositionRevision = 0;
    let rulerResizeObserver = null;
    let timelineGestureController = null;
    let visibleItem = null;
    let autoExpandedTrackRow = null;
    const previewSplits = createPreviewSplits({
      layout: document.getElementById('preview-layout'),
      verticalButton: document.getElementById('preview-split-vertical'),
      horizontalButton: document.getElementById('preview-split-horizontal'),
      getSnapshot: () => ({ tracks, items: compositionItems,
        seconds: session.playheadSeconds, locked: session.lockRenderFrame,
        playing: compositionPlaying, activeTrack, selectedClips }),
      resolveImage: id => loadMedia(id),
      onLayoutChange: updatePinnedScale
    });
    let missingClipError = '';
    let imageRenderError = '';
    let imageLoadFailed = false;
    let imageDecodeFailure = null;
    function updateCompositionError() {
      compositionError.textContent = imageRenderError || missingClipError;
      compositionError.hidden = !compositionError.textContent;
    }
    compositionImage.addEventListener('load', () => {
      if (!visibleItem || visibleItem.item.type !== 'image') return;
      imageLoadFailed = false;
      if (imageRenderError && !imagePreview?.ready) {
        imageRenderError = '';
        updateCompositionError();
      }
    });
    compositionImage.addEventListener('error', () => {
      if (!visibleItem || visibleItem.item.type !== 'image' || compositionImage.hidden) return;
      imageLoadFailed = true;
      compositionImage.hidden = true;
      imageRenderError = `Clip ${visibleItem.item.id}: ${imageFailure(visibleItem.item.src, imageDecodeFailure)}`;
      updateCompositionError();
    });
    const renderFrameMarker = document.createElement('div');
    renderFrameMarker.id = 'render-frame';
    function positionCompactTile(compactTile, tile) {
      compactTile.style.left = tile.style.left;
      compactTile.style.width = tile.style.width;
    }
    let pendingClipFocus = null;
    const clipDetails = new Map();
    compositionVideo.addEventListener('ended', () => {
      if (compositionPlaying && !session.lockRenderFrame) stopComposition();
    });
    function compositorMessage(text, error = false) {
      message(text, error);
    }
    function validTracks(value) {
      return Array.isArray(value) && value.length > 0 && value.length <= 8 &&
        value.every(track => Array.isArray(track) && track.length <= 100 &&
          track.every(clip => clip && validMediaId(clip.id) &&
            Number.isFinite(clip.start) && clip.start >= 0 && clip.start <= 86400 &&
            (clip.sourceStart === undefined || Number.isFinite(clip.sourceStart) &&
              clip.sourceStart >= 0 && clip.sourceStart <= 86400) &&
            (clip.duration === undefined || Number.isFinite(clip.duration) &&
              clip.duration >= .1 && clip.duration <= 86400))) &&
        value.flat().length <= 100;
    }
    function clipWindow(clip, item) {
      const sourceStart = item.type === 'video' ?
        Math.min(Math.max(0, item.duration - .1), clip.sourceStart || 0) : 0;
      const maxDuration = item.type === 'video' ? Math.max(.1, item.duration - sourceStart) : 3600;
      const duration = clip.duration === undefined ?
        (item.type === 'video' ? maxDuration : item.duration) :
        Math.max(.1, Math.min(maxDuration, clip.duration));
      return { sourceStart, duration };
    }
    function snappedTime(value, excluded) {
      if (!snapEnabled) return value;
      const tolerance = 8 / timelineScale;
      let nearest = Math.round(value);
      let distance = Math.abs(value - nearest);
      for (const entry of compositionItems) {
        if (entry === excluded) continue;
        for (const edge of [entry.start, entry.end]) {
          const gap = Math.abs(value - edge);
          if (gap < distance) { distance = gap; nearest = edge; }
        }
      }
      return distance <= tolerance ? nearest : value;
    }
    function snappedClipStart(start, duration, excluded) {
      if (!snapEnabled) return start;
      const startSnap = snappedTime(start, excluded);
      const endSnap = snappedTime(start + duration, excluded) - duration;
      return Math.abs(endSnap - start) < Math.abs(startSnap - start) ? endSnap : startSnap;
    }
    const roundTime = seconds => Math.round(seconds * 100) / 100;
    function saveTracks() {
      try { window.localStorage.setItem(compositorKey, JSON.stringify(tracks)); }
      catch (error) { compositorMessage('Tracks changed, but browser storage could not save the layout.', true); }
    }
    function clipDetail(id) {
      if (!clipDetails.has(id)) {
        const promise = loadMediaAsync(id).then(item => item.type === 'image' || Number.isFinite(item.duration) ? Promise.resolve({ ...item, duration: item.duration || item.seconds }) :
          new Promise(resolve => {
            const probe = document.createElement('video');
            let done = false;
            const finish = duration => {
              if (done) return;
              done = true;
              window.clearTimeout(timeout);
              probe.removeAttribute('src');
              resolve({ ...item, duration });
            };
            const timeout = window.setTimeout(() => finish(3), 10000);
            probe.preload = 'metadata';
            const knownDuration = () => {
              if (Number.isFinite(probe.duration) && probe.duration > 0) return probe.duration;
              if (probe.seekable.length) {
                const end = probe.seekable.end(probe.seekable.length - 1);
                if (Number.isFinite(end) && end > 0) return end;
              }
              return null;
            };
            probe.onloadedmetadata = () => {
              const duration = knownDuration();
              if (duration) finish(duration);
              else {
                // Some WebM files reveal their duration only after seeking to the end.
                try { probe.currentTime = 1e9; } catch { finish(3); }
              }
            };
            probe.onseeked = () => finish(knownDuration() ||
              (Number.isFinite(probe.currentTime) && probe.currentTime > 0 && probe.currentTime < 86400
                ? probe.currentTime : 3));
            probe.onerror = () => finish(3);
            probe.src = item.src;
          }));
        clipDetails.set(id, promise);
      }
      return clipDetails.get(id);
    }
    function stopComposition() {
      compositionPlaying = false;
      window.cancelAnimationFrame(compositionFrame);
      compositionVideo.pause();
      compositionPlay.textContent = 'Play';
      saveSession(true);
    }
    let imagePreview = null;
    let imagePreviewFrame = 0;
    let imageLoopStarted = 0;
    function disposeImagePreview() {
      window.cancelAnimationFrame(imagePreviewFrame);
      imagePreviewFrame = 0;
      if (imagePreview) {
        imagePreview.cancelled = true;
        imagePreview.decoder?.close();
        imagePreview = null;
      }
      compositionImageFrame.hidden = true;
    }
    async function prepareImagePreview(entry) {
      if (!('ImageDecoder' in window)) return;
      const mime = entry.item.src.match(/^data:([^;,]+)/i)?.[1];
      if (!mime) return;
      const state = { entry, decoder: null, cancelled: false, ready: false,
        frameIndex: -1, request: 0 };
      imagePreview = state;
      try {
        if (!await window.ImageDecoder.isTypeSupported(mime) || state.cancelled) return;
        const data = await (await fetch(entry.item.src)).arrayBuffer();
        if (state.cancelled) return;
        const decoder = new window.ImageDecoder({ data, type: mime });
        state.decoder = decoder;
        await decoder.tracks.ready;
        await decoder.completed;
        if (state.cancelled) return;
        const count = decoder.tracks.selectedTrack?.frameCount || 0;
        if (count < 2) {
          decoder.close();
          state.decoder = null;
          return;
        }
        const starts = [0];
        for (let index = 0; index < count; index++) {
          const result = await decoder.decode({ frameIndex: index });
          try {
            if (state.cancelled) return;
            starts.push(starts[index] + (result.image.duration > 0 ?
              result.image.duration / 1000 : 100));
          } finally { result.image.close(); }
        }
        if (state.cancelled || starts[count] <= 0) return;
        state.starts = starts;
        state.ready = true;
        state.frameIndex = -1;
        imageLoopStarted = performance.now();
        compositionImage.hidden = true;
        compositionImageFrame.hidden = false;
        imageRenderError = '';
        updateCompositionError();
        syncCompositionPreview(true);
      } catch (error) {
        if (!state.cancelled) {
          state.decoder?.close();
          state.decoder = null;
          imageDecodeFailure = error;
          if (imageLoadFailed) {
            imageRenderError = `Clip ${entry.item.id}: ${imageFailure(entry.item.src, error)}`;
            updateCompositionError();
          }
        }
      }
    }
    function showImagePreviewFrame(state, index) {
      if (state.frameIndex === index) return;
      state.frameIndex = index;
      const request = ++state.request;
      void state.decoder.decode({ frameIndex: index }).then(result => {
        try {
          if (state.cancelled || request !== state.request) return;
          const frame = result.image;
          compositionImageFrame.width = frame.displayWidth;
          compositionImageFrame.height = frame.displayHeight;
          compositionImageFrame.getContext('2d')?.drawImage(frame, 0, 0);
        } finally { result.image.close(); }
      }).catch(error => {
        if (state.cancelled || visibleItem !== state.entry) return;
        state.ready = false;
        compositionImageFrame.hidden = true;
        compositionImage.hidden = imageLoadFailed;
        imageRenderError = `Clip ${state.entry.item.id}: animation frame failed: ${error.message || error.name || 'decode error'}.`;
        updateCompositionError();
      });
    }
    function syncFrameLockButton() {
      if (!trackPlayhead) return;
      trackPlayhead.classList.toggle('locked', session.lockRenderFrame);
      const handle = trackPlayhead.firstElementChild;
      handle.textContent = session.lockRenderFrame ? '◆' : '▼';
      handle.setAttribute('aria-label', `Track playhead in seconds; preview frame ${session.lockRenderFrame ? 'locked to playhead' : 'looping'}. Press Enter to toggle lock`);
      handle.title = session.lockRenderFrame ? 'Let preview frame and red line loop' : 'Lock preview frame and red line to playhead';
    }
    function toggleFrameLock() {
      session.lockRenderFrame = !session.lockRenderFrame;
      if (session.lockRenderFrame) session.renderFrameSeconds = session.playheadSeconds;
      syncFrameLockButton();
      syncCompositionPreview(true);
      saveSession(true);
    }
    function syncCompositionPreview(seek = false) {
      const active = visibleCompositionItem(compositionItems, session.playheadSeconds);
      const expandedRow = autoExpandTrack && active
        ? trackContent.querySelector(`.track-row[data-track="${active.track}"]`) : null;
      if (autoExpandedTrackRow !== expandedRow) {
        autoExpandedTrackRow?.classList.remove('auto-expanded-track');
        expandedRow?.classList.add('auto-expanded-track');
        autoExpandedTrackRow = expandedRow;
      }
      compositionEmpty.hidden = Boolean(active) || Boolean(missingClipError);
      if (active !== visibleItem) {
        visibleItem?.tile?.classList.remove('under-playhead');
        visibleItem?.compactTile?.classList.remove('under-playhead');
        visibleItem?.tile?.removeAttribute('aria-current');
        disposeImagePreview();
        compositionVideo.pause();
        compositionVideo.removeAttribute('src');
        compositionImage.removeAttribute('src');
        visibleItem = active;
        imageRenderError = '';
        imageLoadFailed = false;
        imageDecodeFailure = null;
        updateCompositionError();
        active?.tile?.classList.add('under-playhead');
        active?.compactTile?.classList.add('under-playhead');
        active?.tile?.setAttribute('aria-current', 'true');
        compositionImage.hidden = !active || active.item.type !== 'image';
        compositionVideo.hidden = !active || active.item.type !== 'video';
        compositionVideoFrame.hidden = compositionVideo.hidden;
        if (!compositionVideoFrame.hidden)
          compositionVideoFrame.getContext('2d')?.clearRect(0, 0, compositionVideoFrame.width, compositionVideoFrame.height);
        if (active?.item.type === 'image') {
          imageLoopStarted = performance.now();
          compositionImage.src = active.item.src;
          void prepareImagePreview(active);
        }
        if (active?.item.type === 'video') {
          compositionVideo.src = active.item.src;
          compositionVideo.onloadedmetadata = () => {
            if (visibleItem !== active) return;
            compositionVideo.currentTime = Math.min((active.item.sourceOffset || 0) + active.item.duration,
              (active.item.sourceOffset || 0) + active.sourceStart + Math.max(0, session.playheadSeconds - active.start));
            session.renderFrameSeconds = session.lockRenderFrame ?
              session.playheadSeconds : active.start + compositionVideo.currentTime - (active.item.sourceOffset || 0) - active.sourceStart;
            syncCompositionPreview();
            if (compositionPlaying && !session.lockRenderFrame)
              void compositionVideo.play().catch(() => stopComposition());
          };
          seek = true;
        }
      }
      if (active?.item.type === 'video' && compositionVideo.readyState >= 1) {
        const offset = (active.item.sourceOffset || 0) + active.sourceStart + session.playheadSeconds - active.start;
        if (seek || (session.lockRenderFrame && Math.abs(compositionVideo.currentTime - offset) > .015)) {
          compositionVideo.currentTime = Math.min((active.item.sourceOffset || 0) + active.item.duration, Math.max(0, offset));
        }
        if (compositionPlaying && !session.lockRenderFrame && compositionVideo.paused)
          void compositionVideo.play().catch(() => stopComposition());
        if ((!compositionPlaying || session.lockRenderFrame) && !compositionVideo.paused)
          compositionVideo.pause();
        session.renderFrameSeconds = session.lockRenderFrame ?
          session.playheadSeconds : active.start + compositionVideo.currentTime - (active.item.sourceOffset || 0) - active.sourceStart;
        if (compositionPlaying) drawCompositionVideoFrame();
      }
      if (active?.item.type === 'image') {
        const state = imagePreview?.entry === active && imagePreview.ready ? imagePreview : null;
        const cycleMs = state ? state.starts[state.starts.length - 1] : active.duration * 1000;
        const phase = session.lockRenderFrame ?
          Math.max(0, Math.min(1, (session.playheadSeconds - active.start) / active.duration)) :
          ((performance.now() - imageLoopStarted) % cycleMs) / cycleMs;
        session.renderFrameSeconds = session.lockRenderFrame ? session.playheadSeconds :
          active.start + phase * active.duration;
        if (state) {
          const offsetMs = Math.min(cycleMs - .001, phase * cycleMs);
          let low = 0;
          let high = state.starts.length - 2;
          while (low < high) {
            const middle = Math.floor((low + high + 1) / 2);
            if (state.starts[middle] <= offsetMs) low = middle;
            else high = middle - 1;
          }
          showImagePreviewFrame(state, low);
        }
        if (!session.lockRenderFrame && !compositionPlaying && !imagePreviewFrame)
          imagePreviewFrame = window.requestAnimationFrame(() => {
            imagePreviewFrame = 0;
            syncCompositionPreview();
          });
      }
      const markerTile = active && (selectedTracks.has(tracks[active.track]) || autoExpandTrack
        ? active.tile : active.compactTile);
      if (markerTile) {
        markerTile.append(renderFrameMarker);
        const frameOffset = Math.max(0, Math.min(active.duration,
          session.renderFrameSeconds - active.start));
        renderFrameMarker.style.left = `${Math.max(0, Math.min(markerTile.clientWidth - 2,
          frameOffset * timelineScale))}px`;
      } else renderFrameMarker.remove();
      compositionScrubber.value = String(session.playheadSeconds);
      compositionScrubber.style.setProperty('--progress', `${compositionDuration ?
        session.playheadSeconds / compositionDuration * 100 : 0}%`);
      seekWrap.style.setProperty('--frame-progress', `${compositionDuration ?
        session.renderFrameSeconds / compositionDuration * 100 : 0}%`);
      compactRenderFrame.hidden = !active;
      compositionTimeLabel.textContent = `${session.playheadSeconds.toFixed(2)}/${compositionDuration.toFixed(2)}s`;
      compositionScrubber.setAttribute('aria-valuetext', `${session.playheadSeconds.toFixed(2)} of ${compositionDuration.toFixed(2)} seconds`);
      if (trackPlayhead) {
        const x = trackLabelWidth + session.playheadSeconds * timelineScale;
        trackPlayhead.style.left = `${x}px`;
        const nearestTick = Math.round(session.playheadSeconds);
        const tickHeight = nearestTick % 10 === 0 ? 15 : nearestTick % 5 === 0 ? 10 : 5;
        trackPlayhead.style.setProperty('--playhead-tick-height', `${tickHeight}px`);
        const handle = trackPlayhead.firstElementChild;
        handle.setAttribute('aria-valuemax', String(compositionDuration));
        handle.setAttribute('aria-valuenow', session.playheadSeconds.toFixed(2));
        handle.setAttribute('aria-valuetext', `${session.playheadSeconds.toFixed(2)} seconds`);
        if (trackList.clientWidth && (x < trackList.scrollLeft + trackLabelWidth ||
            x > trackList.scrollLeft + trackList.clientWidth - 16)) {
          trackList.scrollLeft = Math.max(0, x - trackList.clientWidth / 2);
        }
      }
      previewSplits.sync(seek);
      saveSession();
    }
    function setCompositionTime(seconds, seek = true) {
      session.playheadSeconds = Math.max(0, Math.min(compositionDuration, seconds));
      if (compositionPlaying) compositionStarted = performance.now() - session.playheadSeconds * 1000;
      syncCompositionPreview(seek);
      saveSession(true);
    }
    function compositionTick(now) {
      if (!compositionPlaying) return;
      session.playheadSeconds = Math.min(compositionDuration, (now - compositionStarted) / 1000);
      if (session.playheadSeconds >= compositionDuration) stopComposition();
      syncCompositionPreview();
      if (compositionPlaying) compositionFrame = window.requestAnimationFrame(compositionTick);
    }
    compositionPlay.addEventListener('click', () => {
      if (compositionPlaying) { stopComposition(); syncCompositionPreview(); return; }
      if (!compositionDuration) { compositorMessage('Add a complete clip to a track first.', true); return; }
      if (session.playheadSeconds >= compositionDuration) setCompositionTime(0);
      compositionPlaying = true;
      compositionStarted = performance.now() - session.playheadSeconds * 1000;
      compositionPlay.textContent = 'Pause';
      syncCompositionPreview(true);
      compositionFrame = window.requestAnimationFrame(compositionTick);
    });
    compositionScrubber.addEventListener('input', () => setCompositionTime(Number(compositionScrubber.value)));
    document.getElementById('split-clip').addEventListener('click', () => {
      const at = roundTime(session.playheadSeconds);
      const candidates = selectedClips.size ?
        compositionItems.filter(entry => selectedClips.has(entry.clipRef)) :
        (visibleItem ? [visibleItem] : []);
      const splittable = candidates.filter(entry =>
        at - entry.start >= .1 - 1e-9 && entry.end - at >= .1 - 1e-9);
      if (!splittable.length) {
        compositorMessage(selectedClips.size ?
          'Move the playhead inside a selected clip, at least 0.1 seconds from each edge.' :
          'Move the playhead inside a clip, at least 0.1 seconds from each edge.', true);
        return;
      }
      if (tracks.flat().length + splittable.length > 100) {
        compositorMessage('The compositor supports up to 100 clips.', true);
        return;
      }
      stopComposition();
      for (const entry of splittable) {
        const original = entry.clipRef;
        const leftDuration = roundTime(at - entry.start);
        const right = { ...original, start: at,
          sourceStart: entry.item.type === 'video' ?
            roundTime(entry.sourceStart + leftDuration) : 0,
          duration: roundTime(entry.end - at) };
        original.sourceStart = entry.sourceStart;
        original.duration = leftDuration;
        tracks[entry.track].push(right);
        if (selectedClips.has(original)) selectedClips.add(right);
      }
      tracks.forEach(track => track.sort((a, b) => a.start - b.start));
      saveTracks();
      compositorMessage(`Split ${splittable.length} clip${splittable.length === 1 ? '' : 's'} at ${at.toFixed(2)} seconds.`);
      void refreshCompositor();
    });
    document.getElementById('add-track').addEventListener('click', () => {
      if (tracks.length >= 8) { compositorMessage('The compositor supports up to 8 tracks.', true); return; }
      tracks.push([]);
      activeTrack = tracks.length - 1;
      selectedTracks.clear();
      selectedTracks.add(tracks[activeTrack]);
      trackSelectionAnchor = tracks[activeTrack];
      saveTracks();
      void refreshCompositor();
    });
    const deleteTracksButton = document.getElementById('delete-tracks');
    function syncTrackSelection() {
      trackContent.querySelectorAll('.track-row[data-track]').forEach(row => {
        const trackIndex = Number(row.dataset.track);
        const selected = selectedTracks.has(tracks[trackIndex]);
        row.classList.toggle('selected-track', selected);
        const heading = row.querySelector('.track-heading');
        heading?.setAttribute('aria-pressed', String(selected));
        if (heading) heading.textContent = `Track ${trackIndex + 1}${trackIndex === activeTrack ? ' ✓' : ''}`;
      });
      deleteTracksButton.disabled = selectedTracks.size === 0;
      deleteTracksButton.textContent = selectedTracks.size
        ? `Delete ${selectedTracks.size} track${selectedTracks.size === 1 ? '' : 's'}` : 'Delete tracks';
    }
    function deleteSelectedTracks() {
      if (!selectedTracks.size) return;
      const count = selectedTracks.size;
      const result = removeSelectedTracks(tracks, selectedTracks, activeTrack);
      tracks = result.tracks;
      activeTrack = result.activeIndex;
      selectedTracks.clear();
      trackSelectionAnchor = null;
      selectedClips.clear();
      saveTracks();
      syncTrackSelection();
      void refreshCompositor();
      compositorMessage(`Deleted ${count} track${count === 1 ? '' : 's'}.`);
    }
    deleteTracksButton.addEventListener('click', deleteSelectedTracks);
    document.getElementById('position-url').addEventListener('click', () => {
      if (!compositionItems.length) { compositorMessage('Add a complete clip before sharing a position.', true); return; }
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('tr', tracks.map(track =>
        track.map(clip => `${clip.id}@${clip.start.toFixed(2)}` +
          (clip.duration === undefined ? '' :
            `~${(clip.sourceStart || 0).toFixed(2)}~${clip.duration.toFixed(2)}`)).join(',')).join('|'));
      url.searchParams.set('at', session.playheadSeconds.toFixed(2));
      try {
        window.history.replaceState(null, '', url);
        compositorMessage(`Position ${session.playheadSeconds.toFixed(2)} seconds is in the URL.`);
      } catch (error) { compositorMessage('This browser could not update the URL.', true); }
    });
    async function addClipToTrack(id) {
      if (tracks.flat().length >= 100) { compositorMessage('The compositor supports up to 100 clips.', true); return; }
      const trackIndex = activeTrack;
      const existing = tracks[trackIndex];
      const items = await Promise.all(existing.map(clip =>
        Promise.resolve().then(() => clipDetail(clip.id)).catch(() => null)));
      const start = existing.reduce((end, clip, index) =>
        Math.max(end, clip.start + (items[index] ? clipWindow(clip, items[index]).duration : 0)), 0);
      tracks[trackIndex].push({ id, start: Math.round(start * 100) / 100 });
      saveTracks();
      void refreshCompositor();
    }
    async function refreshCompositor() {
      const revision = ++compositionRevision;
      stopComposition();
      disposeImagePreview();
      rulerResizeObserver?.disconnect();
      timelineGestureController?.abort();
      const existingClips = new Set(tracks.flat());
      for (const clip of selectedClips) if (!existingClips.has(clip)) selectedClips.delete(clip);
      for (const track of selectedTracks) if (!tracks.includes(track)) selectedTracks.delete(track);
      if (trackSelectionAnchor && !tracks.includes(trackSelectionAnchor)) trackSelectionAnchor = null;
      const source = tracks.map(track => track.map(clip => ({ ...clip })));
      const sourceClips = source.flat();
      const results = await Promise.all(sourceClips.map(clip =>
        Promise.resolve().then(() => clipDetail(clip.id))
          .then(item => ({ item }), error => ({ error }))));
      if (revision !== compositionRevision) return;
      const details = results.map(result => result.item || null);
      const failures = results.flatMap((result, index) => result.error
        ? [`${sourceClips[index].id}: ${result.error.message || 'could not load clip'}`] : []);
      missingClipError = failures.length
        ? `Cannot render ${failures.length === 1 ? 'clip' : `${failures.length} clips`}: ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? `; and ${failures.length - 3} more` : ''}` : '';
      updateCompositionError();
      if (missingClipError) compositorMessage(missingClipError, true);
      const previousTrackAppearance = new Map();
      trackContent.querySelectorAll('.track-row[data-track]').forEach(row => {
        if (!row.trackRef) return;
        const heading = row.querySelector('.track-heading');
        const lane = row.querySelector('.track-lane');
        const fullClip = row.querySelector('.clip-tile');
        const compactClip = row.querySelector('.collapsed-clip');
        const headingStyle = window.getComputedStyle(heading);
        const expanded = row.classList.contains('selected-track') ||
          row.classList.contains('auto-expanded-track');
        previousTrackAppearance.set(row.trackRef, {
          height: lane.getBoundingClientRect().height,
          paddingTop: headingStyle.paddingTop,
          paddingBottom: headingStyle.paddingBottom,
          fullOpacity: fullClip ? window.getComputedStyle(fullClip).opacity : expanded ? '1' : '0',
          compactOpacity: compactClip ? window.getComputedStyle(compactClip).opacity : expanded ? '0' : '1'
        });
      });
      compositionItems = [];
      compositionDuration = 0;
      trackContent.replaceChildren();
      function syncSelection() {
        compositionItems.forEach(value => {
          if (!value.tile) return;
          const chosen = selectedClips.has(value.clipRef);
          value.tile.classList.toggle('selected', chosen);
          value.compactTile?.classList.toggle('selected', chosen);
          value.compactTile?.setAttribute('aria-pressed', String(chosen));
          value.tile.querySelector('.clip-select')?.setAttribute('aria-pressed', String(chosen));
        });
        previewSplits.sync(true);
      }
      function announceSelection() {
        compositorMessage(`${selectedClips.size} clip${selectedClips.size === 1 ? '' : 's'} selected. Drag a selected clip to move the group.`);
      }
      function moveTrack(from, to) {
        if (from === to || to < 0 || to >= tracks.length) return false;
        const [track] = tracks.splice(from, 1);
        tracks.splice(to, 0, track);
        if (activeTrack === from) activeTrack = to;
        else if (from < activeTrack && to >= activeTrack) activeTrack--;
        else if (from > activeTrack && to <= activeTrack) activeTrack++;
        pendingTrackFocus = to;
        saveTracks();
        void refreshCompositor();
        compositorMessage(`Moved track ${from + 1} to position ${to + 1}.`);
        return true;
      }
      let detailIndex = 0;
      const trackDetails = source.map(track => track.map(() => details[detailIndex++]));
      let focusGrip = null;
      source.forEach((track, trackIndex) => track.forEach((clip, clipIndex) => {
        const item = trackDetails[trackIndex][clipIndex];
        if (!item) return;
        const { sourceStart, duration } = clipWindow(clip, item);
        const entry = { id: clip.id, item, clipRef: tracks[trackIndex][clipIndex],
          start: clip.start, sourceStart, duration,
          end: clip.start + duration, track: trackIndex };
        compositionItems.push(entry);
        compositionDuration = Math.max(compositionDuration, entry.end);
      }));
      const openingTrack = autoExpandTrack
        ? visibleCompositionItem(compositionItems, session.playheadSeconds)?.track : null;
      const animatedRows = [];
      const hadComposition = document.body.classList.contains('has-composition');
      document.body.classList.toggle('has-composition', compositionItems.length > 0 || Boolean(missingClipError));
      if (compositionItems.length || missingClipError) {
        disposeMedia(output);
        output.replaceChildren();
      }
      else if (hadComposition && !document.body.classList.contains('minimal')) render();
      let laneWidth = Math.max(200, Math.ceil(compositionDuration * timelineScale) + 80);
      const ruler = document.createElement('div');
      ruler.className = 'track-row';
      const rulerLabel = document.createElement('div');
      rulerLabel.className = 'track-heading timeline-zoom';
      rulerLabel.setAttribute('aria-label', 'Timeline zoom');
      const zoomOut = document.createElement('button');
      zoomOut.type = 'button';
      zoomOut.textContent = '−';
      zoomOut.setAttribute('aria-label', 'Zoom timeline out');
      const zoomValue = document.createElement('span');
      const zoomIn = document.createElement('button');
      zoomIn.type = 'button';
      zoomIn.textContent = '+';
      zoomIn.setAttribute('aria-label', 'Zoom timeline in');
      function updateZoomLabel() {
        zoomValue.textContent = String(timelineScale);
        zoomValue.title = `${timelineScale} pixels per second`;
        zoomOut.disabled = timelineScale <= 10;
        zoomIn.disabled = timelineScale >= 160;
      }
      updateZoomLabel();
      rulerLabel.append(zoomOut, zoomValue, zoomIn);
      const rulerLane = document.createElement('div');
      rulerLane.className = 'track-ruler-lane';
      rulerLane.style.width = `${laneWidth}px`;
      function renderRulerTicks() {
        const minimumStep = Math.max(1, Math.ceil(40 / timelineScale));
        const labelStep = [1, 2, 5, 10, 20].find(step => step >= minimumStep) ?? 20;
        const first = Math.max(0, Math.floor((trackList.scrollLeft - trackLabelWidth) /
          timelineScale) - 1);
        const last = Math.min(Math.floor((rulerLane.clientWidth - 1) / timelineScale),
          Math.ceil((trackList.scrollLeft + trackList.clientWidth - trackLabelWidth) /
            timelineScale) + 1);
        const ticks = document.createDocumentFragment();
        for (let second = first; second <= last; second++) {
          const tick = document.createElement('span');
          tick.className = 'track-ruler-tick';
          if (second % 10 === 0) tick.classList.add('is-ten');
          else if (second % 5 === 0) tick.classList.add('is-five');
          tick.style.left = `${second * timelineScale}px`;
          if (second % labelStep === 0) tick.textContent = `${second}s`;
          ticks.append(tick);
        }
        rulerLane.replaceChildren(ticks);
      }
      function setTimelineZoom(nextScale, anchorTime, anchorX) {
        nextScale = Math.max(10, Math.min(160, Math.round(nextScale)));
        if (nextScale !== timelineScale) {
          timelineScale = nextScale;
          try { window.localStorage.setItem(timelineZoomKey, String(timelineScale)); }
          catch (error) { /* Zoom still works without browser storage. */ }
          updateZoomLabel();
          laneWidth = Math.max(200, Math.ceil(compositionDuration * timelineScale) + 80);
          trackContent.querySelectorAll('.track-lane, .track-ruler-lane').forEach(lane => {
            lane.style.width = `${laneWidth}px`;
          });
          for (const entry of compositionItems) {
            if (!entry.tile) continue;
            entry.tile.style.left = `${Math.round(entry.start * timelineScale)}px`;
            entry.tile.style.width = `${Math.max(32, Math.round(entry.duration * timelineScale))}px`;
            if (entry.compactTile) positionCompactTile(entry.compactTile, entry.tile);
          }
          syncCompositionPreview();
        }
        trackList.scrollLeft = Math.max(0, trackLabelWidth + anchorTime * timelineScale - anchorX);
        renderRulerTicks();
      }
      function changeTimelineZoom(delta) {
        const anchorX = trackList.clientWidth / 2;
        const anchorTime = Math.max(0, (trackList.scrollLeft + anchorX -
          trackLabelWidth) / timelineScale);
        setTimelineZoom(timelineScale + delta, anchorTime, anchorX);
      }
      zoomOut.addEventListener('click', () => changeTimelineZoom(-10));
      zoomIn.addEventListener('click', () => changeTimelineZoom(10));
      let pinch = null;
      let rulerSeekPointer = null;
      let suppressTouchSeek = false;
      let suppressDragForPinch = false;
      let activePan = null;
      function releaseTouchLock(event) {
        if (event.touches.length < 2) pinch = null;
        if (event.touches.length === 0 && touchTimelineLock) {
          touchTimelineLock = false;
          syncTimelineLock();
        }
      }
      function pinchGeometry(touches) {
        const first = touches[0];
        const second = touches[1];
        return { distance: Math.hypot(second.clientX - first.clientX,
          second.clientY - first.clientY),
          x: (first.clientX + second.clientX) / 2 - trackList.getBoundingClientRect().left };
      }
      function beginPinch(event) {
        const bounds = trackList.getBoundingClientRect();
        const timelineTouches = Array.from(event.touches).filter(touch =>
          touch.clientX >= bounds.left && touch.clientX <= bounds.right &&
          touch.clientY >= bounds.top && touch.clientY <= bounds.bottom);
        if (timelineTouches.length < 2) return;
        touchTimelineLock = true;
        syncTimelineLock();
        activePan = null;
        suppressTouchSeek = true;
        suppressDragForPinch = true;
        rulerSeekPointer = null;
        if (browserZoomEnabled || timelineTouches.length !== 2) return;
        event.preventDefault();
        const { distance, x } = pinchGeometry(timelineTouches);
        if (!distance) return;
        pinch = { distance, scale: timelineScale,
          time: Math.max(0, (trackList.scrollLeft + x - trackLabelWidth) / timelineScale) };
      }
      function movePinch(event) {
        if (browserZoomEnabled || event.touches.length !== 2) return;
        if (!pinch) beginPinch(event);
        if (!pinch) return;
        event.preventDefault();
        const { distance, x } = pinchGeometry(event.touches);
        setTimelineZoom(pinch.scale * distance / pinch.distance, pinch.time, x);
      }
      timelineGestureController = new AbortController();
      const gestureOptions = { passive: false, signal: timelineGestureController.signal };
      trackList.addEventListener('touchstart', beginPinch, gestureOptions);
      trackList.addEventListener('touchmove', movePinch, gestureOptions);
      document.addEventListener('touchend', releaseTouchLock,
        { signal: timelineGestureController.signal });
      document.addEventListener('touchcancel', releaseTouchLock,
        { signal: timelineGestureController.signal });
      trackList.addEventListener('pointerdown', event => {
        if (!timelineLocked() || event.button !== 0 || touchTimelineLock ||
            event.target.closest('button, input, .collapsed-clip, .track-ruler-lane, .timeline-zoom')) return;
        event.preventDefault();
        trackList.setPointerCapture(event.pointerId);
        activePan = { id: event.pointerId, x: event.clientX, y: event.clientY,
          left: trackList.scrollLeft, top: trackList.scrollTop };
      }, { signal: timelineGestureController.signal });
      trackList.addEventListener('pointermove', event => {
        if (!activePan || activePan.id !== event.pointerId || touchTimelineLock) return;
        trackList.scrollLeft = activePan.left - (event.clientX - activePan.x);
        trackList.scrollTop = activePan.top - (event.clientY - activePan.y);
      }, { signal: timelineGestureController.signal });
      const endPan = event => {
        if (activePan?.id === event.pointerId) activePan = null;
      };
      trackList.addEventListener('pointerup', endPan, { signal: timelineGestureController.signal });
      trackList.addEventListener('pointercancel', endPan, { signal: timelineGestureController.signal });
      let boxSelection = null;
      const contentPoint = event => {
        const bounds = trackContent.getBoundingClientRect();
        return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      };
      trackList.addEventListener('pointerdown', event => {
        if (timelineLocked() || event.button !== 0 || event.pointerType === 'touch' ||
            event.target.closest('.clip-tile, .collapsed-clip, .track-heading') ||
            !event.target.closest('.track-lane')) return;
        event.preventDefault();
        trackList.setPointerCapture(event.pointerId);
        boxSelection = { id: event.pointerId, start: contentPoint(event),
          previous: new Set(selectedClips), additive: event.shiftKey || event.ctrlKey || event.metaKey,
          overlay: null };
      }, { signal: timelineGestureController.signal });
      trackList.addEventListener('pointermove', event => {
        if (!boxSelection || event.pointerId !== boxSelection.id) return;
        const { start, previous, additive } = boxSelection;
        const end = contentPoint(event);
        if (!boxSelection.overlay && Math.hypot(end.x - start.x, end.y - start.y) < 4) return;
        if (!boxSelection.overlay) {
          boxSelection.overlay = document.createElement('div');
          boxSelection.overlay.className = 'timeline-selection-box';
          trackContent.append(boxSelection.overlay);
        }
        const left = Math.min(start.x, end.x);
        const top = Math.min(start.y, end.y);
        const right = Math.max(start.x, end.x);
        const bottom = Math.max(start.y, end.y);
        Object.assign(boxSelection.overlay.style, {
          left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`
        });
        selectedClips.clear();
        if (additive) previous.forEach(clip => selectedClips.add(clip));
        const contentBounds = trackContent.getBoundingClientRect();
        for (const entry of compositionItems) {
          if (!entry.tile) continue;
          const visibleTile = selectedTracks.has(tracks[entry.track]) ||
            (autoExpandTrack && visibleItem?.track === entry.track)
            ? entry.tile : entry.compactTile;
          const bounds = visibleTile.getBoundingClientRect();
          if (bounds.left - contentBounds.left < right && bounds.right - contentBounds.left > left &&
              bounds.top - contentBounds.top < bottom && bounds.bottom - contentBounds.top > top) {
            selectedClips.add(entry.clipRef);
          }
        }
        syncSelection();
      }, { signal: timelineGestureController.signal });
      const finishBoxSelection = event => {
        if (!boxSelection || event.pointerId !== boxSelection.id) return;
        const { overlay, previous, additive } = boxSelection;
        overlay?.remove();
        if (event.type === 'pointercancel') {
          selectedClips.clear();
          previous.forEach(clip => selectedClips.add(clip));
          syncSelection();
        } else {
          if (!overlay && !additive) {
            selectedClips.clear();
            syncSelection();
          }
          announceSelection();
        }
        boxSelection = null;
      };
      trackList.addEventListener('pointerup', finishBoxSelection,
        { signal: timelineGestureController.signal });
      trackList.addEventListener('pointercancel', finishBoxSelection,
        { signal: timelineGestureController.signal });
      trackList.addEventListener('gesturestart', event => {
        if (!browserZoomEnabled) event.preventDefault();
      }, gestureOptions);
      trackList.addEventListener('gesturechange', event => {
        if (!browserZoomEnabled) event.preventDefault();
      }, gestureOptions);
      rulerLane.addEventListener('pointerdown', event => {
        if (timelineLocked() || event.button !== 0 ||
            (event.pointerType === 'touch' && !event.isPrimary)) return;
        rulerSeekPointer = { id: event.pointerId, startX: event.clientX,
          startY: event.clientY, touch: event.pointerType === 'touch' };
        suppressTouchSeek = false;
        rulerLane.setPointerCapture(event.pointerId);
        if (!rulerSeekPointer.touch) setCompositionTime(
          (event.clientX - rulerLane.getBoundingClientRect().left) / timelineScale);
      });
      rulerLane.addEventListener('pointermove', event => {
        if (!rulerSeekPointer || event.pointerId !== rulerSeekPointer.id ||
            suppressTouchSeek || timelineLocked()) return;
        if (rulerSeekPointer.touch &&
            Math.hypot(event.clientX - rulerSeekPointer.startX,
              event.clientY - rulerSeekPointer.startY) < 4) return;
        setCompositionTime((event.clientX - rulerLane.getBoundingClientRect().left) / timelineScale);
      });
      rulerLane.addEventListener('pointerup', event => {
        if (event.pointerId !== rulerSeekPointer?.id) return;
        rulerSeekPointer = null;
        if (!suppressTouchSeek && !timelineLocked()) setCompositionTime(
          (event.clientX - rulerLane.getBoundingClientRect().left) / timelineScale);
      });
      rulerLane.addEventListener('pointercancel', () => { rulerSeekPointer = null; });
      ruler.append(rulerLabel, rulerLane);
      trackContent.append(ruler);
      trackList.onscroll = renderRulerTicks;
      if (typeof ResizeObserver === 'function') {
        rulerResizeObserver = new ResizeObserver(renderRulerTicks);
        rulerResizeObserver.observe(trackList);
      }
      renderRulerTicks();
      const playhead = document.createElement('div');
      playhead.id = 'track-playhead';
      const playheadHandle = document.createElement('button');
      playheadHandle.type = 'button';
      playheadHandle.textContent = '▼';
      playheadHandle.setAttribute('role', 'slider');
      playheadHandle.setAttribute('aria-valuemin', '0');
      let draggingPlayhead = false;
      let movedPlayhead = false;
      let pointerStartX = 0;
      let pointerStartY = 0;
      const seekFromPointer = event => setCompositionTime(
        (event.clientX - rulerLane.getBoundingClientRect().left) / timelineScale);
      playheadHandle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || timelineLocked() ||
            (event.pointerType === 'touch' && !event.isPrimary)) return;
        if (event.isPrimary) suppressDragForPinch = false;
        event.preventDefault();
        playheadSelected = true;
        playhead.classList.add('selected');
        draggingPlayhead = true;
        movedPlayhead = false;
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        playheadHandle.setPointerCapture(event.pointerId);
      });
      playheadHandle.addEventListener('pointermove', event => {
        if (!draggingPlayhead || suppressDragForPinch) return;
        if (Math.abs(event.clientX - pointerStartX) > 4 ||
            Math.abs(event.clientY - pointerStartY) > 4) movedPlayhead = true;
        if (movedPlayhead) seekFromPointer(event);
      });
      playheadHandle.addEventListener('pointerup', event => {
        if (!draggingPlayhead) return;
        draggingPlayhead = false;
        if (suppressDragForPinch) return;
        if (movedPlayhead) seekFromPointer(event);
        else toggleFrameLock();
      });
      playheadHandle.addEventListener('pointercancel', () => { draggingPlayhead = false; });
      playheadHandle.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          playheadSelected = true;
          playhead.classList.add('selected');
          toggleFrameLock();
          return;
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        setCompositionTime(session.playheadSeconds + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : .1));
      });
      playhead.append(playheadHandle);
      playhead.classList.toggle('selected', playheadSelected);
      trackPlayhead = playhead;
      trackContent.append(playhead);
      syncFrameLockButton();
      source.forEach((track, trackIndex) => {
        const row = document.createElement('div');
        row.className = 'track-row';
        row.dataset.track = String(trackIndex);
        row.trackRef = tracks[trackIndex];
        const startsExpanded = selectedTracks.has(row.trackRef) || trackIndex === openingTrack;
        const appearance = previousTrackAppearance.get(row.trackRef) ||
          (startsExpanded ? { height: 32, paddingTop: '4px', paddingBottom: '4px',
            fullOpacity: '0', compactOpacity: '1' } : null);
        const heading = document.createElement('button');
        heading.type = 'button';
        heading.className = 'track-heading';
        heading.textContent = `Track ${trackIndex + 1}${trackIndex === activeTrack ? ' ✓' : ''}`;
        heading.setAttribute('aria-label', `Track ${trackIndex + 1}; tap to select, Shift to select a range, drag to reorder`);
        heading.setAttribute('aria-pressed', String(selectedTracks.has(tracks[trackIndex])));
        heading.title = 'Tap to select this track; drag to reorder';
        let suppressHeadingClick = false;
        let trackDrag = null;
        heading.addEventListener('click', event => {
          if (suppressHeadingClick) { suppressHeadingClick = false; return; }
          const trackRef = tracks[trackIndex];
          if (event.shiftKey && trackSelectionAnchor && tracks.includes(trackSelectionAnchor)) {
            const anchor = tracks.indexOf(trackSelectionAnchor);
            for (let index = Math.min(anchor, trackIndex);
                index <= Math.max(anchor, trackIndex); index++) selectedTracks.add(tracks[index]);
          } else {
            if (selectedTracks.has(trackRef)) selectedTracks.delete(trackRef);
            else selectedTracks.add(trackRef);
            trackSelectionAnchor = trackRef;
          }
          activeTrack = trackIndex;
          syncTrackSelection();
          syncCompositionPreview();
        });
        heading.addEventListener('keydown', event => {
          if ((event.key === 'Delete' || event.key === 'Backspace') &&
              selectedTracks.has(tracks[trackIndex])) {
            event.preventDefault();
            deleteSelectedTracks();
            return;
          }
          if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
          event.preventDefault();
          moveTrack(trackIndex, trackIndex + (event.key === 'ArrowUp' ? -1 : 1));
        });
        heading.addEventListener('pointerdown', event => {
          if (timelineLocked() || event.button !== 0 ||
              (event.pointerType === 'touch' && !event.isPrimary)) return;
          suppressHeadingClick = false;
          heading.setPointerCapture(event.pointerId);
          trackDrag = { id: event.pointerId, startY: event.clientY,
            target: trackIndex, moved: false };
        });
        heading.addEventListener('pointermove', event => {
          if (!trackDrag || event.pointerId !== trackDrag.id || suppressDragForPinch) return;
          if (!trackDrag.moved && Math.abs(event.clientY - trackDrag.startY) < 5) return;
          trackDrag.moved = true;
          row.classList.add('track-dragging');
          heading.style.transform = `translateY(${event.clientY - trackDrag.startY}px)`;
          const rows = Array.from(trackContent.querySelectorAll('.track-row[data-track]'));
          trackDrag.target = rows.reduce((nearest, candidate) => {
            const center = candidate.getBoundingClientRect();
            const distance = Math.abs(event.clientY - (center.top + center.bottom) / 2);
            return distance < nearest.distance
              ? { index: Number(candidate.dataset.track), distance } : nearest;
          }, { index: trackIndex, distance: Infinity }).index;
          rows.forEach(candidate => candidate.classList.toggle('track-drop-target',
            Number(candidate.dataset.track) === trackDrag.target && trackDrag.target !== trackIndex));
        });
        const finishTrackDrag = event => {
          if (!trackDrag || event.pointerId !== trackDrag.id) return;
          const { moved, target } = trackDrag;
          trackDrag = null;
          heading.style.removeProperty('transform');
          row.classList.remove('track-dragging');
          trackContent.querySelectorAll('.track-drop-target').forEach(candidate =>
            candidate.classList.remove('track-drop-target'));
          if (moved) suppressHeadingClick = true;
          if (event.type === 'pointerup' && moved && !suppressDragForPinch)
            moveTrack(trackIndex, target);
        };
        heading.addEventListener('pointerup', finishTrackDrag);
        heading.addEventListener('pointercancel', finishTrackDrag);
        const lane = document.createElement('div');
        lane.className = 'track-lane';
        lane.dataset.track = String(trackIndex);
        lane.style.width = `${laneWidth}px`;
        if (appearance) {
          lane.style.minHeight = `${appearance.height}px`;
          heading.style.paddingTop = appearance.paddingTop;
          heading.style.paddingBottom = appearance.paddingBottom;
          animatedRows.push({ row, heading, lane });
        }
        track.forEach((clip, clipIndex) => {
          const item = trackDetails[trackIndex][clipIndex];
          if (!item) return;
          const id = clip.id;
          const tile = document.createElement('div');
          tile.className = 'clip-tile';
          if (appearance) tile.style.opacity = appearance.fullOpacity;
          const entry = compositionItems.find(value =>
            value.clipRef === tracks[trackIndex][clipIndex]);
          if (entry) entry.tile = tile;
          const clipRef = tracks[trackIndex][clipIndex];
          tile.classList.toggle('selected', selectedClips.has(clipRef));
          tile.dataset.index = String(clipIndex);
          tile.style.left = `${Math.round(clip.start * timelineScale)}px`;
          tile.style.width = `${Math.max(32, Math.round(entry.duration * timelineScale))}px`;
          const compactTile = document.createElement('div');
          compactTile.className = 'collapsed-clip';
          if (appearance) compactTile.style.opacity = appearance.compactOpacity;
          const compactContent = document.createElement('span');
          compactContent.className = 'collapsed-clip-content';
          compactContent.textContent = id;
          compactTile.append(compactContent);
          compactTile.title = `${id}: ${clip.start.toFixed(2)}s, ${entry.duration.toFixed(2)}s long`;
          compactTile.classList.toggle('selected', selectedClips.has(clipRef));
          compactTile.tabIndex = 0;
          compactTile.setAttribute('role', 'button');
          compactTile.setAttribute('aria-label', `Select ${id} on track ${trackIndex + 1}`);
          compactTile.setAttribute('aria-pressed', String(selectedClips.has(clipRef)));
          const selectCompactClip = () => {
            if (selectedClips.has(clipRef)) selectedClips.delete(clipRef);
            else selectedClips.add(clipRef);
            syncSelection();
            announceSelection();
          };
          compactTile.addEventListener('click', selectCompactClip);
          compactTile.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            selectCompactClip();
          });
          positionCompactTile(compactTile, tile);
          entry.compactTile = compactTile;
          const thumbnail = document.createElement(item.type === 'video' ? 'video' : 'canvas');
          if (item.type === 'video') {
            thumbnail.src = item.src;
            thumbnail.muted = true;
            thumbnail.playsInline = true;
            thumbnail.preload = 'metadata';
            thumbnail.addEventListener('loadedmetadata', () => {
              thumbnail.currentTime = (item.sourceOffset || 0) + Math.min(.1, item.duration / 2);
            }, { once: true });
          } else {
            thumbnail.width = 160;
            thumbnail.height = 62;
            const image = document.createElement('img');
            image.onload = () => {
              try {
                const context = thumbnail.getContext('2d');
                if (!context || !image.naturalWidth || !image.naturalHeight) return;
                const scale = Math.max(thumbnail.width / image.naturalWidth,
                  thumbnail.height / image.naturalHeight);
                const width = image.naturalWidth * scale;
                const height = image.naturalHeight * scale;
                context.drawImage(image, (thumbnail.width - width) / 2,
                  (thumbnail.height - height) / 2, width, height);
              } finally { image.removeAttribute('src'); }
            };
            image.onerror = () => image.removeAttribute('src');
            image.src = item.src;
          }
          const name = document.createElement('strong');
          name.textContent = id;
          const length = document.createElement('small');
          length.textContent = `${entry.duration.toFixed(2)}s`;
          const select = document.createElement('button');
          select.type = 'button';
          select.className = 'clip-select';
          select.textContent = '✓';
          select.title = 'Select clip for group moving';
          select.setAttribute('aria-label', `Select ${id} on track ${trackIndex + 1}`);
          select.setAttribute('aria-pressed', String(selectedClips.has(clipRef)));
          select.addEventListener('click', () => {
            if (selectedClips.has(clipRef)) selectedClips.delete(clipRef);
            else selectedClips.add(clipRef);
            syncSelection();
            announceSelection();
          });
          function updateLiveClip(start, duration, sourceStart, destinationTrack = trackIndex) {
            entry.start = roundTime(start);
            entry.duration = roundTime(duration);
            entry.sourceStart = roundTime(sourceStart);
            entry.end = entry.start + entry.duration;
            entry.track = destinationTrack;
            tile.style.left = `${Math.round(entry.start * timelineScale)}px`;
            tile.style.width = `${Math.max(32, Math.round(entry.duration * timelineScale))}px`;
            positionCompactTile(compactTile, tile);
            compactTile.title = `${id}: ${entry.start.toFixed(2)}s, ${entry.duration.toFixed(2)}s long`;
            length.textContent = `${entry.duration.toFixed(2)}s · ${entry.start.toFixed(2)}s`;
            compositionDuration = Math.max(0, ...compositionItems.map(value => value.end));
            compositionScrubber.max = String(compositionDuration);
            const liveLaneWidth = Math.max(200, Math.ceil(compositionDuration * timelineScale) + 80);
            laneWidth = liveLaneWidth;
            trackContent.querySelectorAll('.track-lane, .track-ruler-lane').forEach(lane => {
              lane.style.width = `${liveLaneWidth}px`;
            });
            renderRulerTicks();
            syncCompositionPreview(true);
          }
          const grip = document.createElement('div');
          grip.className = 'clip-grip';
          grip.tabIndex = 0;
          grip.setAttribute('role', 'button');
          grip.setAttribute('aria-label', `Move ${id}; arrow keys change time or track`);
          grip.addEventListener('keydown', event => {
            const moving = selectedClips.has(clipRef) ?
              compositionItems.filter(value => selectedClips.has(value.clipRef)) : [entry];
            let deltaStart = 0;
            let deltaTrack = 0;
            if (event.key === 'ArrowLeft') deltaStart = -.1;
            else if (event.key === 'ArrowRight') deltaStart = .1;
            else if (event.key === 'ArrowUp') deltaTrack = -1;
            else if (event.key === 'ArrowDown') deltaTrack = 1;
            else return;
            event.preventDefault();
            if (moving.some(value => value.start + deltaStart < 0 ||
                value.start + deltaStart > 86400 || value.track + deltaTrack < 0 ||
                value.track + deltaTrack >= tracks.length)) return;
            for (const value of moving) {
              const sourceTrack = tracks[value.track];
              sourceTrack.splice(sourceTrack.indexOf(value.clipRef), 1);
            }
            for (const value of moving) {
              value.clipRef.start = roundTime(value.start + deltaStart);
              tracks[value.track + deltaTrack].push(value.clipRef);
            }
            tracks.forEach(value => value.sort((a, b) => a.start - b.start));
            activeTrack = trackIndex + deltaTrack;
            pendingClipFocus = { id, start: roundTime(entry.start + deltaStart), track: activeTrack };
            saveTracks();
            void refreshCompositor();
          });
          if (pendingClipFocus?.id === id && pendingClipFocus.start === clip.start &&
              pendingClipFocus.track === trackIndex) focusGrip = grip;
          grip.addEventListener('pointerdown', event => {
            if (event.button !== 0 || timelineLocked() ||
                (event.pointerType === 'touch' && !event.isPrimary)) return;
            if (event.isPrimary) suppressDragForPinch = false;
            event.preventDefault();
            if (event.ctrlKey || event.metaKey || event.shiftKey) {
              if (selectedClips.has(clipRef)) selectedClips.delete(clipRef);
              else selectedClips.add(clipRef);
              syncSelection();
              return;
            }
            stopComposition();
            grip.setPointerCapture(event.pointerId);
            const moving = (selectedClips.has(clipRef) ?
              compositionItems.filter(value => selectedClips.has(value.clipRef)) : [entry])
              .map(value => ({ entry: value, clipRef: value.clipRef,
                start: value.start, track: value.track, duration: value.duration }));
            const minStart = Math.min(...moving.map(value => value.start));
            const maxStart = Math.max(...moving.map(value => value.start));
            const minTrack = Math.min(...moving.map(value => value.track));
            const maxTrack = Math.max(...moving.map(value => value.track));
            const x = event.clientX;
            const y = event.clientY;
            const bounds = tile.getBoundingClientRect();
            const grabOffset = x - bounds.left;
            const ghost = tile.cloneNode(true);
            ghost.querySelector('#render-frame')?.remove();
            if (item.type === 'image') {
              const ghostCanvas = ghost.querySelector('canvas');
              ghostCanvas?.getContext('2d')?.drawImage(thumbnail, 0, 0);
            }
            ghost.classList.add('clip-drag-preview');
            ghost.style.left = `${bounds.left}px`;
            ghost.style.top = `${bounds.top}px`;
            ghost.style.width = `${bounds.width}px`;
            document.body.append(ghost);
            tile.classList.add('dragging');
            let liveStart = clip.start;
            let liveTrack = trackIndex;
            let moved = false;
            const laneAt = clientY => Array.from(trackContent.querySelectorAll('.track-lane'))
              .find(candidate => {
                const rect = candidate.getBoundingClientRect();
                return clientY >= rect.top && clientY <= rect.bottom;
              });
            const move = moveEvent => {
              if (suppressDragForPinch) return;
              moved = moved || Math.abs(moveEvent.clientX - x) > 3 ||
                Math.abs(moveEvent.clientY - y) > 3;
              if (!moved) return;
              ghost.style.transform = `translate(${moveEvent.clientX - x}px, ${moveEvent.clientY - y}px)`;
              const targetLane = laneAt(moveEvent.clientY);
              if (!targetLane) return;
              liveTrack = Math.max(trackIndex - minTrack,
                Math.min(tracks.length - 1 - maxTrack + trackIndex, Number(targetLane.dataset.track)));
              const rawStart = (moveEvent.clientX - grabOffset -
                targetLane.getBoundingClientRect().left) / timelineScale;
              liveStart = roundTime(Math.max(clip.start - minStart, Math.min(86400 - maxStart + clip.start,
                snappedClipStart(rawStart, entry.duration, entry))));
              const deltaStart = liveStart - clip.start;
              const deltaTrack = liveTrack - trackIndex;
              const lanes = Array.from(trackContent.querySelectorAll('.track-lane'));
              moving.forEach(value => {
                const destination = lanes[value.track + deltaTrack];
                const original = lanes[value.track];
                value.entry.start = roundTime(value.start + deltaStart);
                value.entry.end = value.entry.start + value.duration;
                value.entry.track = value.track + deltaTrack;
                value.entry.tile.style.left = `${Math.round(value.entry.start * timelineScale)}px`;
                positionCompactTile(value.entry.compactTile, value.entry.tile);
                value.entry.tile.style.transform = `translateY(${destination.getBoundingClientRect().top -
                  original.getBoundingClientRect().top}px)`;
              });
              compositionDuration = Math.max(0, ...compositionItems.map(value => value.end));
              compositionScrubber.max = String(compositionDuration);
              const liveLaneWidth = Math.max(200, Math.ceil(compositionDuration * timelineScale) + 80);
              laneWidth = liveLaneWidth;
              trackContent.querySelectorAll('.track-lane, .track-ruler-lane').forEach(value => {
                value.style.width = `${liveLaneWidth}px`;
              });
              renderRulerTicks();
              syncCompositionPreview(true);
              compositorMessage(`${moving.length} clip${moving.length === 1 ? '' : 's'}: ${liveStart.toFixed(2)}s on track ${liveTrack + 1}`);
            };
            const finish = endEvent => {
              if (suppressDragForPinch) { cancel(); return; }
              grip.removeEventListener('pointermove', move);
              grip.removeEventListener('pointerup', finish);
              grip.removeEventListener('pointercancel', cancel);
              ghost.remove();
              tile.classList.remove('dragging');
              if (!moved) return;
              const targetLane = laneAt(endEvent.clientY);
              if (!targetLane) { void refreshCompositor(); return; }
              move(endEvent);
              for (const value of moving) {
                const sourceTrack = tracks[value.track];
                sourceTrack.splice(sourceTrack.indexOf(value.clipRef), 1);
              }
              for (const value of moving) {
                value.clipRef.start = value.entry.start;
                tracks[value.entry.track].push(value.clipRef);
              }
              tracks.forEach(track => track.sort((a, b) => a.start - b.start));
              activeTrack = liveTrack;
              saveTracks();
              void refreshCompositor();
            };
            const cancel = () => {
              grip.removeEventListener('pointermove', move);
              grip.removeEventListener('pointerup', finish);
              grip.removeEventListener('pointercancel', cancel);
              ghost.remove();
              tile.classList.remove('dragging');
              void refreshCompositor();
            };
            grip.addEventListener('pointermove', move);
            grip.addEventListener('pointerup', finish);
            grip.addEventListener('pointercancel', cancel);
          });
          function makeTrimHandle(edge) {
            const handle = document.createElement('div');
            handle.className = `clip-trim ${edge}`;
            handle.tabIndex = 0;
            handle.setAttribute('role', 'slider');
            handle.setAttribute('aria-label', `${edge === 'left' ? 'Trim start' : 'Trim end'} of ${id}`);
            handle.title = edge === 'left' ? 'Trim clip start' : 'Trim clip end';
            const original = { start: clip.start, sourceStart: entry.sourceStart,
              duration: entry.duration, end: clip.start + entry.duration };
            handle.setAttribute('aria-valuemin', String(edge === 'left' ?
              (item.type === 'video' ? Math.max(0, original.start - original.sourceStart) :
                Math.max(0, original.end - 3600)) : original.start + .1));
            handle.setAttribute('aria-valuemax', String(edge === 'left' ? original.end - .1 :
              original.start + (item.type === 'video' ? item.duration - original.sourceStart : 3600)));
            function applyDelta(delta) {
              let start = original.start;
              let sourceStart = original.sourceStart;
              let duration = original.duration;
              if (edge === 'left') {
                const minimum = item.type === 'video' ?
                  Math.max(0, original.start - original.sourceStart) :
                  Math.max(0, original.end - 3600);
                start = Math.max(minimum, Math.min(original.end - .1,
                  snappedTime(original.start + delta, entry)));
                duration = original.end - start;
                if (item.type === 'video') sourceStart += start - original.start;
              } else {
                const maximum = original.start + (item.type === 'video' ?
                  item.duration - original.sourceStart : 3600);
                const end = Math.max(original.start + .1, Math.min(maximum,
                  snappedTime(original.end + delta, entry)));
                duration = end - original.start;
              }
              updateLiveClip(start, duration, sourceStart);
              handle.setAttribute('aria-valuenow', (edge === 'left' ? entry.start : entry.end).toFixed(2));
              compositorMessage(`${id}: ${entry.start.toFixed(2)}s, ${entry.duration.toFixed(2)}s long`);
            }
            function commit() {
              Object.assign(clipRef, { start: entry.start,
                sourceStart: entry.sourceStart, duration: entry.duration });
              saveTracks();
              void refreshCompositor();
            }
            handle.addEventListener('pointerdown', event => {
              if (event.button !== 0 || timelineLocked() ||
                  (event.pointerType === 'touch' && !event.isPrimary)) return;
              if (event.isPrimary) suppressDragForPinch = false;
              event.preventDefault();
              event.stopPropagation();
              stopComposition();
              handle.setPointerCapture(event.pointerId);
              const originX = event.clientX;
              let moved = false;
              const move = moveEvent => {
                if (suppressDragForPinch) return;
                moved = moved || Math.abs(moveEvent.clientX - originX) > 1;
                if (moved) applyDelta((moveEvent.clientX - originX) / timelineScale);
              };
              const cleanup = () => {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', finish);
                handle.removeEventListener('pointercancel', cancel);
              };
              const finish = endEvent => {
                cleanup();
                if (suppressDragForPinch) { void refreshCompositor(); return; }
                if (!moved) return;
                applyDelta((endEvent.clientX - originX) / timelineScale);
                commit();
              };
              const cancel = () => { cleanup(); void refreshCompositor(); };
              handle.addEventListener('pointermove', move);
              handle.addEventListener('pointerup', finish);
              handle.addEventListener('pointercancel', cancel);
            });
            handle.addEventListener('keydown', event => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              applyDelta((event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : .1));
              commit();
            });
            handle.setAttribute('aria-valuenow', (edge === 'left' ? original.start : original.end).toFixed(2));
            return handle;
          }
          const leftTrim = makeTrimHandle('left');
          const rightTrim = makeTrimHandle('right');
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = '×';
          remove.setAttribute('aria-label', `Remove ${id} from track ${trackIndex + 1}`);
          remove.addEventListener('click', () => {
            tracks[trackIndex].splice(clipIndex, 1);
            saveTracks();
            void refreshCompositor();
          });
          tile.append(thumbnail, name, length, grip, leftTrim, rightTrim, select, remove);
          lane.append(tile, compactTile);
        });
        row.append(heading, lane);
        trackContent.append(row);
      });
      syncTrackSelection();
      visibleItem = null;
      compositionScrubber.max = String(compositionDuration);
      setCompositionTime(session.playheadSeconds);
      previewSplits.refreshSources();
      if (animatedRows.length) {
        void trackContent.offsetHeight;
        window.requestAnimationFrame(() => {
          if (revision !== compositionRevision) return;
          animatedRows.forEach(({ row, heading, lane }) => {
            if (!row.isConnected) return;
            lane.style.removeProperty('min-height');
            heading.style.removeProperty('padding-top');
            heading.style.removeProperty('padding-bottom');
            row.querySelectorAll('.clip-tile, .collapsed-clip').forEach(tile =>
              tile.style.removeProperty('opacity'));
          });
        });
      }
      if (focusGrip) { focusGrip.focus(); pendingClipFocus = null; }
      if (pendingTrackFocus !== null) {
        trackContent.querySelector(`.track-row[data-track="${pendingTrackFocus}"] .track-heading`)?.focus();
        pendingTrackFocus = null;
      }
      refreshClipList();
    }
    function makeTimelineClipCard(clip) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'timeline-clip-card';
      card.setAttribute('aria-label', `Drag ${clip.id} to a track or preview; tap to add to the active track`);
      const item = loadMedia(clip.id);
      const frame = document.createElement(item.type === 'video' ? 'video' : 'img');
      frame.src = item.src;
      frame.draggable = false;
      if (item.type === 'video') {
        frame.muted = true;
        frame.playsInline = true;
        frame.preload = 'metadata';
        frame.addEventListener('loadedmetadata', () => {
          frame.currentTime = Number.isFinite(frame.duration)
            ? Math.min(.1, frame.duration / 2) : .1;
        }, { once: true });
      } else frame.alt = '';
      const label = document.createElement('span');
      label.textContent = `${clip.id} · ${item.type}`;
      card.append(frame, label);
      let suppressClick = false;
      card.addEventListener('click', event => {
        if (suppressClick) { event.preventDefault(); return; }
        void addClipToTrack(clip.id);
      });
      function createGhost() {
        suppressClick = true;
        const ghost = document.createElement('div');
        ghost.className = 'clip-library-ghost';
        ghost.textContent = clip.id;
        document.body.append(ghost);
        return ghost;
      }
      function moveGhost(ghost, x, y) {
        ghost.style.left = `${x + 12}px`;
        ghost.style.top = `${y + 12}px`;
        const target = document.elementFromPoint(x, y);
        trackContent.querySelectorAll('.clip-library-drop-target').forEach(row =>
          row.classList.remove('clip-library-drop-target'));
        target?.closest('#track-list .track-row[data-track]')?.classList.add('clip-library-drop-target');
        document.getElementById('preview-layout')?.dispatchEvent(new CustomEvent('preview-clip-pointer-drag',
          { detail: { phase: 'move', clientX: x, clientY: y } }));
      }
      function clearDragHighlight() {
        trackContent.querySelectorAll('.clip-library-drop-target').forEach(row =>
          row.classList.remove('clip-library-drop-target'));
        document.getElementById('preview-layout')?.dispatchEvent(new CustomEvent('preview-clip-pointer-drag',
          { detail: { phase: 'end' } }));
      }
      function dropAt(x, y) {
        const previewLayout = document.getElementById('preview-layout');
        const detail = { phase: 'drop', clientX: x, clientY: y, id: clip.id, handled: false };
        previewLayout?.dispatchEvent(new CustomEvent('preview-clip-pointer-drag', { detail }));
        if (detail.handled) {
          timelineClipsStatus.textContent = `Opened ${clip.id} in a preview view.`;
          timelineClipsStatus.classList.remove('error');
          return;
        }
        const target = document.elementFromPoint(x, y);
        if (target && trackList.contains(target) && target.closest('.track-row[data-track]'))
          trackList.dispatchEvent(new CustomEvent('library-clip-drop',
            { detail: { id: clip.id, clientX: x, target } }));
        else {
          timelineClipsStatus.textContent = 'Drop the clip on a timeline track or preview view.';
          timelineClipsStatus.classList.add('error');
        }
      }
      card.addEventListener('pointerdown', event => {
        if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary) return;
        card.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        let ghost = null;
        function move(moveEvent) {
          if (moveEvent.pointerId !== event.pointerId) return;
          if (!ghost && Math.hypot(moveEvent.clientX - startX,
              moveEvent.clientY - startY) < 6) return;
          if (!ghost) ghost = createGhost();
          moveEvent.preventDefault();
          moveGhost(ghost, moveEvent.clientX, moveEvent.clientY);
        }
        function end(endEvent) {
          if (endEvent.pointerId !== event.pointerId) return;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', end);
          window.removeEventListener('pointercancel', end);
          ghost?.remove();
          if (ghost && endEvent.type === 'pointerup') dropAt(endEvent.clientX, endEvent.clientY);
          clearDragHighlight();
          window.setTimeout(() => { suppressClick = false; }, 0);
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
      });
      card.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        const startX = touch.clientX;
        const startY = touch.clientY;
        const touchId = touch.identifier;
        let ghost = null;
        let holdTimer = window.setTimeout(() => {
          holdTimer = 0;
          ghost = createGhost();
          moveGhost(ghost, startX, startY);
        }, 300);
        const matchingTouch = changed => Array.from(changed).find(value => value.identifier === touchId);
        function cleanup() {
          window.clearTimeout(holdTimer);
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchend', end);
          window.removeEventListener('touchcancel', end);
        }
        function move(moveEvent) {
          const current = matchingTouch(moveEvent.changedTouches);
          if (!current) return;
          if (!ghost) {
            if (Math.hypot(current.clientX - startX, current.clientY - startY) > 8)
              cleanup();
            return;
          }
          moveEvent.preventDefault();
          moveGhost(ghost, current.clientX, current.clientY);
        }
        function end(endEvent) {
          const current = matchingTouch(endEvent.changedTouches);
          if (!current) return;
          cleanup();
          if (ghost) {
            endEvent.preventDefault();
            ghost.remove();
            if (endEvent.type === 'touchend') dropAt(current.clientX, current.clientY);
            clearDragHighlight();
            window.setTimeout(() => { suppressClick = false; }, 500);
          }
        }
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', end, { passive: false });
        window.addEventListener('touchcancel', end);
      }, { passive: true });
      return card;
    }
    function refreshClipList() {
      clipList.replaceChildren();
      timelineImageList.replaceChildren();
      timelineClipsList.replaceChildren();
      try {
        const clips = [];
        for (let index = 0; index < window.localStorage.length; index++) {
          const key = window.localStorage.key(index);
          const match = key?.match(/^urlAutofill\.media\.v1\.([a-zA-Z0-9_-]+)\.meta$/);
          if (!match) continue;
          let meta;
          try { meta = JSON.parse(window.localStorage.getItem(key)); }
          catch (error) { continue; }
          if (!meta || !validMime(meta.mime) || !Number.isInteger(meta.total) ||
              meta.total < 1 || meta.total > 1000) continue;
          let parts = 0;
          let length = 0;
          const base = mediaStorageKey(match[1]);
          for (let part = 1; part <= meta.total; part++) {
            const data = window.localStorage.getItem(`${base}.part.${part}`);
            if (data !== null) { parts++; length += data.length; }
          }
          if (meta.storage === 'blob') { parts = 1; length = meta.bytes / .75; }
          clips.push({ id: match[1], mime: meta.mime, parts, total: meta.total, length });
        }
        clips.sort((a, b) => a.id.localeCompare(b.id));
        if (!clips.length) {
          clipList.textContent = 'No clips saved yet.';
          timelineImageList.textContent = 'No image clips saved.';
          timelineClipsList.textContent = 'No saved clips yet.';
          return;
        }
        for (const clip of clips) {
          if (clip.parts === clip.total) {
            try { timelineClipsList.append(makeTimelineClipCard(clip)); }
            catch (error) { /* Leave unreadable clips out of the drag panel. */ }
          }
          if (clip.mime.startsWith('image/')) {
            const imageAdd = document.createElement('button');
            imageAdd.type = 'button';
            imageAdd.textContent = `+ ${clip.id}`;
            imageAdd.title = `Add ${clip.id} to track ${activeTrack + 1}`;
            imageAdd.setAttribute('aria-label', imageAdd.title);
            imageAdd.disabled = clip.parts !== clip.total;
            imageAdd.addEventListener('click', () => addClipToTrack(clip.id));
            imageAdd.draggable = !imageAdd.disabled;
            imageAdd.addEventListener('dragstart', event => {
              event.dataTransfer.setData('application/x-url-autofill-image-id', clip.id);
              event.dataTransfer.effectAllowed = 'copy';
            });
            timelineImageList.append(imageAdd);
          }
          const row = document.createElement('div');
          row.className = 'clip-row';
          const description = document.createElement('span');
          description.textContent = `${clip.id} · ${clip.mime} · ${clip.parts}/${clip.total} parts · ${Math.round(clip.length * 0.75 / 1024)} KB`;
          description.style.flex = '1';
          const add = document.createElement('button');
          add.type = 'button';
          add.textContent = `Add to track ${activeTrack + 1}`;
          add.disabled = clip.parts !== clip.total;
          add.addEventListener('click', () => addClipToTrack(clip.id));
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = 'Delete';
          remove.setAttribute('aria-label', `Delete ${clip.id}`);
          remove.addEventListener('click', () => {
            if (!window.confirm(`Delete stored clip ${clip.id}?`)) return;
            try {
              clipMessage(deleteMedia(clip.id));
              clipDetails.delete(clip.id);
              tracks = tracks.map(track => track.filter(item => item.id !== clip.id));
              saveTracks();
              void refreshCompositor();
              refreshClipList();
              if (field.value.startsWith('timeline:') &&
                  field.value.slice('timeline:'.length).split(',').includes(clip.id)) {
                displayedText = undefined;
                syncDisplay();
                disposeMedia(output);
                output.textContent = '';
              }
            } catch (error) { clipMessage(error.message, true); }
          });
          row.append(description, add, remove);
          clipList.append(row);
        }
        if (!timelineImageList.childElementCount)
          timelineImageList.textContent = 'No image clips saved.';
        if (!timelineClipsList.childElementCount)
          timelineClipsList.textContent = 'No complete clips available.';
      } catch (error) {
        clipList.textContent = 'Clip storage is unavailable in this browser.';
        timelineImageList.textContent = 'Clip storage is unavailable.';
        timelineClipsList.textContent = 'Clip storage is unavailable.';
      }
    }
    document.addEventListener('urlAutofill:clip-saved', event => {
      refreshClipList();
      clipMessage(`Saved ${event.detail.id} as a clip.`);
    });
    let pastedTimelineImage = null;
    timelineImageSource.addEventListener('paste', event => {
      const image = Array.from(event.clipboardData?.files || [])
        .find(file => file.type.startsWith('image/')) ||
        Array.from(event.clipboardData?.items || [])
          .find(item => item.type.startsWith('image/'))?.getAsFile();
      if (!image) return;
      event.preventDefault();
      pastedTimelineImage = image;
      timelineImageSource.value = `Pasted image (${image.type})`;
    });
    timelineImageSource.addEventListener('input', () => { pastedTimelineImage = null; });
    function readImageFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Could not read the image.'));
        reader.readAsDataURL(file);
      });
    }
    timelineImageForm.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = timelineImageForm.querySelector('button[type=submit]');
      submit.disabled = true;
      timelineImageStatus.hidden = false;
      timelineImageStatus.classList.remove('error');
      timelineImageStatus.textContent = 'Saving image…';
      try {
        let dataUri;
        if (pastedTimelineImage) dataUri = await readImageFile(pastedTimelineImage);
        else {
          const source = timelineImageSource.value.trim();
          if (/^data:image\//i.test(source)) dataUri = source;
          else {
            const url = new URL(source);
            if (!['http:', 'https:'].includes(url.protocol))
              throw new Error('Paste an image, image URL, or image data URI.');
            let response;
            try { response = await fetch(url.href); }
            catch (error) {
              throw new Error('Could not import this URL. Try copying the image and pasting it instead.');
            }
            if (!response.ok) throw new Error(`Image URL returned HTTP ${response.status}.`);
            const image = await response.blob();
            if (!image.type.startsWith('image/'))
              throw new Error('The URL did not return an image.');
            dataUri = await readImageFile(image);
          }
        }
        const entered = timelineImageId.value.trim();
        const base = `image-${Date.now()}`;
        let id = entered || base;
        for (let suffix = 1; !entered &&
            window.localStorage.getItem(`${mediaStorageKey(id)}.meta`) !== null; suffix++)
          id = `${base}-${suffix}`;
        const result = storeWholeMedia(id, dataUri, 3);
        timelineImageStatus.textContent = result;
        clipMessage(result);
        timelineImageForm.reset();
        pastedTimelineImage = null;
        refreshClipList();
      } catch (error) {
        timelineImageStatus.textContent = error instanceof TypeError ?
          'Paste an image, image URL, or image data URI.' : error.message;
        timelineImageStatus.classList.add('error');
      } finally { submit.disabled = false; }
    });
    function clipError(error) {
      clipMessage(error.name === 'QuotaExceededError' ? 'Browser storage is full. Delete a clip and try again.' :
        error.message, true);
    }
    clipForm.addEventListener('submit', async event => {
      event.preventDefault();
      const file = clipFileField.files?.[0];
      if (!file) { clipMessage('Choose an image or video file.', true); return; }
      if (!validMime(file.type)) { clipMessage('Choose an image or video file.', true); return; }
      const submit = clipForm.querySelector('button[type=submit]');
      submit.disabled = true;
      try {
        const dataUri = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
          reader.readAsDataURL(file);
        });
        clipMessage(storeWholeMedia(clipIdField.value.trim(), dataUri, clipSeconds()));
        clipFileField.value = '';
        refreshClipList();
        addClipToTrack(clipIdField.value.trim());
      } catch (error) { clipError(error); }
      finally { submit.disabled = false; }
    });
    document.getElementById('save-text-clip').addEventListener('click', () => {
      try {
        const dataUri = /^data:/i.test(replyField.value.trim()) ? replyField.value : field.value;
        const id = clipId();
        clipMessage(storeWholeMedia(id, dataUri, clipSeconds()));
        refreshClipList();
        addClipToTrack(id);
      } catch (error) { clipError(error); }
    });
    function render() {
      syncDisplay();
      disposeMedia(output);
      output.textContent = '';
      if (!document.body.classList.contains('minimal') &&
          !document.body.classList.contains('has-composition')) {
        const replyIsMedia = Boolean(mediaType(replyField.value)) ||
          replyField.value.trim().startsWith('timeline:');
        const primary = document.createElement('div');
        renderValue(primary, replyIsMedia ? replyField.value : field.value || 'No text to render.',
          replyIsMedia ? 'reply' : 'text');
        output.append(primary);
        const secondaryValue = replyIsMedia ? field.value : replyField.value;
        if (secondaryValue) {
          const secondary = document.createElement('div');
          secondary.className = 'rendered-reply';
          renderValue(secondary, secondaryValue, replyIsMedia ? 'text' : 'reply');
          output.append(secondary);
        }
      }
      message('Text rendered.');
    }
    function clear() {
      field.value = '';
      saveText();
      disposeMedia(output);
      output.textContent = '';
      stopSpeech();
      message('Text cleared.');
    }
    function speak() {
      syncDisplay();
      stopSpeech();
      const source = replyField.value ? 'reply' : 'text';
      const text = source === 'reply' ? replyField.value : field.value;
      if (mediaType(text) || text.trim().startsWith('timeline:')) {
        message('Media is skipped by speech.');
        return;
      }
      const tokens = Array.from(text.matchAll(/\S+/g));
      if (!tokens.length) { message('Add some text to speak first.', true); return; }
      const session = speechSession;
      const rate = 1;
      let started = false;
      let boundarySeen = false;
      let sweeping = false;
      let audioAbandoned = false;
      let sweepTimer;
      const later = (callback, delay) => {
        const id = window.setTimeout(() => { if (session === speechSession) callback(); }, delay);
        speechTimers.push(id);
        return id;
      };
      const highlight = index => {
        document.querySelectorAll('.speech-word').forEach(span => {
          span.classList.toggle('active', span.dataset.source === source &&
            index >= Number(span.dataset.start) && index < Number(span.dataset.end));
        });
      };
      const finish = () => {
        if (session !== speechSession) return;
        stopSpeech();
        message('Speech finished.');
      };
      const sweep = (silent = false) => {
        if (sweeping) return;
        sweeping = true;
        if (silent) {
          audioAbandoned = true;
          if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        }
        message(silent ? 'Highlighting without audio…' : 'Speaking…');
        let index = 0;
        const step = () => {
          if (index === tokens.length) {
            highlight(-1);
            if (silent) finish();
            return;
          }
          const token = tokens[index++];
          highlight(token.index);
          sweepTimer = later(step, Math.max(180, token[0].length * 55 + 100) / rate);
        };
        step();
      };
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        sweep(true);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.onstart = () => {
        if (session !== speechSession || sweeping || audioAbandoned) return;
        started = true;
        message('Speaking…');
        highlight(tokens[0].index);
        later(() => { if (!boundarySeen) sweep(); }, 800);
      };
      utterance.onboundary = event => {
        if (session !== speechSession || audioAbandoned || !started || (event.name && event.name !== 'word')) return;
        boundarySeen = true;
        window.clearTimeout(sweepTimer);
        const token = tokens.find(token => event.charIndex < token.index + token[0].length);
        highlight(token ? token.index : -1);
      };
      utterance.onend = () => { if (started && !audioAbandoned) finish(); };
      utterance.onerror = () => {
        if (session !== speechSession || audioAbandoned) return;
        window.clearTimeout(sweepTimer);
        sweeping = false;
        sweep(true);
      };
      message('Speech requested.');
      later(() => { if (!started) sweep(true); }, 1500);
      try { window.speechSynthesis.speak(utterance); }
      catch (error) { sweep(true); }
    }
    function upper() { field.value = field.value.toUpperCase(); saveText(); message('Text uppercased.'); }
    const actions = Object.freeze({ render, clear, speak, upper });
    function stopWaiting() {
      window.clearTimeout(timer);
      window.clearInterval(ticker);
      timer = ticker = null;
      waiting.hidden = true;
    }
    function run(name) {
      stopWaiting();
      name = name.trim().toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(actions, name)) {
        message(`Unknown action "${name}". Choose render, clear, speak, or upper.`, true);
        return;
      }
      memoryState.lastAction = name;
      memoryState.lastUpdated = new Date().toISOString();
      saveMemory();
      try { actions[name](); }
      catch (error) { message('The action could not run. Please try a manual Run button.', true); }
    }
    document.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => run(button.dataset.action));
    });
    document.getElementById('cancel').addEventListener('click', () => {
      stopWaiting();
      message('Scheduled action canceled.');
    });
    document.getElementById('clear-memory').addEventListener('click', () => {
      memoryState.memory = '';
      memoryState.text = '';
      memoryState.reply = '';
      saveMemory();
    });
    document.addEventListener('click', event => {
      if (event.target.closest('#menu-toggle, #drawer, #drawer-backdrop, #page-fullscreen, #tesla-theater-button, #fullscreen-restore, #compositor, .image-controls, .timeline-player, video, audio')) return;
      if (document.body.classList.contains('minimal')) run('speak');
    });
    function startup() {
      stopWaiting();
      stopSpeech();
      loadMemory();
      const params = compactParams();
      if (params.has('ws') || params.has('wsText')) {
        if (document.body.classList.contains('render-focus')) timelineToggle.click();
        document.getElementById('timeline-import-tab')?.click();
        window.requestAnimationFrame(() => {
          const panel = document.getElementById('websocket-panel');
          if (!panel) return;
          panel.classList.remove('url-highlight');
          void panel.offsetWidth;
          panel.classList.add('url-highlight');
          panel.focus({ preventScroll: true });
        });
      }
      const requestedMode = (params.get('m') || '').toLowerCase();
      const mode = requestedMode === 'e' || requestedMode === 'editor' ? 'editor' :
        requestedMode === 'sp' || requestedMode === 'screenplay' ? 'screenplay' : '';
      document.body.classList.toggle('screenplay-mode', mode === 'screenplay');
      let mediaMessage = '';
      let mediaError = false;
      try {
        if (params.has('x')) mediaMessage = deleteMedia(params.get('x'));
        if (params.has('s')) mediaMessage = storeMediaPart(params);
      } catch (error) {
        mediaMessage = error.name === 'QuotaExceededError' ? 'Browser storage is full.' : error.message;
        mediaError = true;
      }
      let changed = false;
      for (const [parameter, key] of [['memory', 'memory'], ['c', 'clip']]) {
        if (params.has(parameter)) { memoryState[key] = params.get(parameter); changed = true; }
      }
      if (!params.has('memory') && params.has('m') && !mode) {
        memoryState.memory = params.get('m');
        changed = true;
      }
      if (params.has('l') || params.has('t')) {
        field.value = params.has('l') ? `timeline:${params.get('l')}` : params.get('t');
        memoryState.text = field.value;
        changed = true;
      } else {
        field.value = memoryState.text;
      }
      screenplayText.value = field.value;
      if (params.has('r')) {
        replyField.value = params.get('r');
        memoryState.reply = replyField.value;
        changed = true;
      } else {
        replyField.value = memoryState.reply;
      }
      if (changed) saveMemory();
      else showMemory();
      let savedMinimal = false;
      try { savedMinimal = window.localStorage.getItem(minimalStorageKey) === '1'; }
      catch (error) { /* Use the full interface when storage is unavailable. */ }
      setMinimal(mode ? false : params.has('minimal') ? params.get('minimal') === '1' : savedMinimal,
        !mode && params.has('minimal'));
      try {
        const savedTracks = JSON.parse(window.localStorage.getItem(compositorKey));
        tracks = validTracks(savedTracks) ? savedTracks : [[]];
      } catch (error) { tracks = [[]]; }
      if (params.has('tr')) {
        const fromUrl = params.get('tr').split('|').map(track => track ? track.split(',').map(value => {
          const match = value.match(/^([a-zA-Z0-9_-]{1,64})@(\d+(?:\.\d+)?)(?:~(\d+(?:\.\d+)?)~(\d+(?:\.\d+)?))?$/);
          return match ? { id: match[1], start: Number(match[2]),
            ...(match[3] === undefined ? {} : { sourceStart: Number(match[3]), duration: Number(match[4]) }) } : null;
        }) : []);
        if (validTracks(fromUrl)) { tracks = fromUrl; saveTracks(); }
        else {
          compositorMessage('The URL contains an invalid track layout.', true);
          message('The URL contains an invalid track layout.', true);
        }
      }
      if (params.has('x') && validMediaId(params.get('x'))) {
        tracks = tracks.map(track => track.filter(item => item.id !== params.get('x')));
        saveTracks();
      }
      activeTrack = Math.min(activeTrack, tracks.length - 1);
      const requestedPosition = Number(params.get('at'));
      if (params.has('at') && Number.isFinite(requestedPosition) && requestedPosition >= 0)
        session.playheadSeconds = requestedPosition;
      void refreshCompositor();
      refreshClipList();
      if (mediaMessage) message(mediaMessage, mediaError);
      if (params.has('a') || params.get('sp') === '1') {
        const name = params.has('a') ? params.get('a').trim().toLowerCase() : 'speak';
        const execute = () => {
          run(name);
          if (params.get('sp') === '1' && name !== 'speak') run('speak');
        };
        const number = Number(params.get('w'));
        const seconds = Number.isFinite(number) && number >= 0 ? Math.min(number, 3600) : 0;
        const milliseconds = seconds * 1000;
        if (!Object.prototype.hasOwnProperty.call(actions, name) || milliseconds === 0) {
          execute();
        } else {
          const deadline = Date.now() + milliseconds;
          const update = () => {
            const remaining = Math.max(0, (deadline - Date.now()) / 1000);
            countdown.textContent = `Running ${name} in ${remaining.toFixed(1)} seconds…`;
          };
          waiting.hidden = false;
          message(`Scheduled ${name}.`);
          update();
          ticker = window.setInterval(update, 100);
          timer = window.setTimeout(execute, milliseconds);
        }
      }
    }
    startup();
    window.addEventListener('pageshow', event => {
      if (event.persisted) startup();
    });
  }
