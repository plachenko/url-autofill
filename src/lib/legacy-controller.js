import { compactParams } from "./url-parameters.js";
import { mediaStorageKey, validMediaId, validMime, storeMediaPart, storeWholeMedia, deleteMedia, loadMedia } from "./media-store.js";
import { clearAllAppStorage, createSessionBackup, restoreSessionBackup } from './app-storage.js';
import { createProject, deleteProject, listProjects, renameProject, switchProject } from './project-store.js';
import { createScene, deleteScene, listScenes, renameScene, switchScene } from './scene-store.js';

  'use strict';
  export function initialize() {
    let clearingSavedData = false;
    const fullscreenButton = document.getElementById('page-fullscreen');
    const drawerFullscreenButton = document.getElementById('drawer-fullscreen');
    const fullscreenRestoreButton = document.getElementById('fullscreen-restore');
    const fullscreenStorageKey = 'urlAutofill.fullscreen.v1';
    let fullscreenWanted = false;
    let fullscreenRestorePending = false;
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
      fullscreenButton.hidden = !supported;
      drawerFullscreenButton.hidden = !supported;
      fullscreenRestoreButton.hidden = !supported || !fullscreenWanted || active;
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
      if (!fullscreenWanted || fullscreenElement() || fullscreenRestorePending) return;
      fullscreenRestorePending = true;
      try { await enterPageFullscreen(); }
      finally { fullscreenRestorePending = false; }
    }
    fullscreenButton.addEventListener('click', togglePageFullscreen);
    drawerFullscreenButton.addEventListener('click', togglePageFullscreen);
    const teslaFullscreenButton = document.getElementById('tesla-fullscreen');
    const teslaTheaterButton = document.getElementById('tesla-theater-button');
    const teslaSupported = /^https?:$/.test(window.location.protocol);
    teslaFullscreenButton.disabled = !teslaSupported;
    teslaTheaterButton.disabled = !teslaSupported;
    function openTeslaTheater() {
      const target = new URL(window.location.href);
      const mode = target.searchParams.get('m')?.toLowerCase();
      target.search = '';
      target.hash = '';
      if (mode === 'e' || mode === 'editor' || mode === 'sp' || mode === 'screenplay') {
        target.searchParams.set('m', mode);
      }
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
      const fullscreen = document.createElement('button');
      fullscreen.type = 'button';
      fullscreen.textContent = 'Toggle fullscreen';
      fullscreen.disabled = typeof requestFullscreen(viewer) !== 'function';
      controls.append(previous, play, next, slider, position, fullscreen);
      viewer.append(image, video, controls);
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
        function fallbackImage() {
          if (disposed) return;
          dispose();
          target.replaceChildren(fallbackViewer);
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
            catch (error) { fallbackImage(); }
          }, duration);
        }
        async function toggle() {
          playing = !playing;
          update();
          if (playing && ended) {
            ended = false;
            repetitions = 0;
            try { if (await draw(0)) schedule(); }
            catch (error) { fallbackImage(); }
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
          catch (error) { fallbackImage(); }
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
      media.src = value.trim();
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
        viewer.append(media, controls);
        target.append(viewer);
        void enhanceImage(target, media, viewer, value.trim());
      } else {
        target.append(media);
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
    document.getElementById('clear-saved-data').addEventListener('click', () => {
      if (!window.confirm('Delete all URL Autofill projects, clips, tracks, text, memory, and preferences saved in this browser? This cannot be undone.')) return;
      try {
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
        const backup = createSessionBackup(window.localStorage);
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
        restoreSessionBackup(window.localStorage, backup);
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
    const compositionEmpty = document.getElementById('composition-empty');
    const compositionScrubber = document.getElementById('composition-scrubber');
    const seekWrap = document.getElementById('seek-wrap');
    const compactRenderFrame = document.getElementById('compact-render-frame');
    const compositionTimeLabel = document.getElementById('composition-time');
    const compositionPlay = document.getElementById('composition-play');
    const timelineToggle = document.getElementById('timeline-toggle');
    const pinPreviewButton = document.getElementById('pin-preview');
    const snapToggle = document.getElementById('snap-toggle');
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
    const stage = document.getElementById('stage');
    const renderSurface = document.getElementById('render-surface');
    const pinStorageKey = 'urlAutofill.previewResolution.v1';
    let pinnedResolution = null;
    try {
      const saved = JSON.parse(window.localStorage.getItem(pinStorageKey));
      if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height) &&
          saved.width > 0 && saved.height > 0) pinnedResolution = saved;
    } catch (error) { /* Start with a responsive preview. */ }
    function updatePinnedScale() {
      if (!pinnedResolution) return;
      const scale = Math.min(stage.clientWidth / pinnedResolution.width,
        stage.clientHeight / pinnedResolution.height);
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
      width: Math.max(1, stage.clientWidth), height: Math.max(1, stage.clientHeight)
    }));
    setRenderFocus(renderFocus);
    setPinnedResolution(pinnedResolution);
    if (typeof ResizeObserver === 'function') new ResizeObserver(updatePinnedScale).observe(stage);
    else window.addEventListener('resize', updatePinnedScale);
    let tracks = [[]];
    let activeTrack = 0;
    let compositionItems = [];
    const selectedClips = new Set();
    let compositionDuration = 0;
    let compositionPlaying = false;
    let compositionFrame = 0;
    let compositionStarted = 0;
    let compositionRevision = 0;
    let rulerResizeObserver = null;
    let timelineGestureController = null;
    let visibleItem = null;
    const renderFrameMarker = document.createElement('div');
    renderFrameMarker.id = 'render-frame';
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
        const item = loadMedia(id);
        const promise = item.type === 'image' ? Promise.resolve({ ...item, duration: item.seconds }) :
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
            probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 3);
            probe.onerror = () => finish(3);
            probe.src = item.src;
          });
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
        syncCompositionPreview(true);
      } catch (error) {
        if (!state.cancelled) {
          state.decoder?.close();
          state.decoder = null;
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
      }).catch(() => { /* Keep the last decoded frame. */ });
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
      const active = compositionItems.filter(entry =>
        session.playheadSeconds >= entry.start && session.playheadSeconds < entry.end)
        .sort((a, b) => b.track - a.track || b.start - a.start)[0] || null;
      if (active !== visibleItem) {
        visibleItem?.tile?.classList.remove('under-playhead');
        visibleItem?.tile?.removeAttribute('aria-current');
        disposeImagePreview();
        compositionVideo.pause();
        compositionVideo.removeAttribute('src');
        compositionImage.removeAttribute('src');
        visibleItem = active;
        active?.tile?.classList.add('under-playhead');
        active?.tile?.setAttribute('aria-current', 'true');
        compositionImage.hidden = !active || active.item.type !== 'image';
        compositionVideo.hidden = !active || active.item.type !== 'video';
        compositionEmpty.hidden = Boolean(active);
        if (active?.item.type === 'image') {
          imageLoopStarted = performance.now();
          compositionImage.src = active.item.src;
          void prepareImagePreview(active);
        }
        if (active?.item.type === 'video') {
          compositionVideo.src = active.item.src;
          compositionVideo.onloadedmetadata = () => {
            if (visibleItem !== active) return;
            compositionVideo.currentTime = Math.min(active.item.duration,
              active.sourceStart + Math.max(0, session.playheadSeconds - active.start));
            session.renderFrameSeconds = session.lockRenderFrame ?
              session.playheadSeconds : active.start + compositionVideo.currentTime - active.sourceStart;
            syncCompositionPreview();
            if (compositionPlaying && !session.lockRenderFrame)
              void compositionVideo.play().catch(() => stopComposition());
          };
          seek = true;
        }
      }
      if (active?.item.type === 'video' && compositionVideo.readyState >= 1) {
        const offset = active.sourceStart + session.playheadSeconds - active.start;
        if (seek || (session.lockRenderFrame && Math.abs(compositionVideo.currentTime - offset) > .015)) {
          compositionVideo.currentTime = Math.min(active.item.duration, Math.max(0, offset));
        }
        if (compositionPlaying && !session.lockRenderFrame && compositionVideo.paused)
          void compositionVideo.play().catch(() => stopComposition());
        if ((!compositionPlaying || session.lockRenderFrame) && !compositionVideo.paused)
          compositionVideo.pause();
        session.renderFrameSeconds = session.lockRenderFrame ?
          session.playheadSeconds : active.start + compositionVideo.currentTime - active.sourceStart;
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
      if (active?.tile) {
        active.tile.append(renderFrameMarker);
        const frameOffset = Math.max(0, Math.min(active.duration,
          session.renderFrameSeconds - active.start));
        renderFrameMarker.style.left = `${Math.max(0, Math.min(active.tile.clientWidth - 2,
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
      saveTracks();
      void refreshCompositor();
    });
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
      const source = tracks.map(track => track.map(clip => ({ ...clip })));
      const details = await Promise.all(source.flat().map(clip =>
        Promise.resolve().then(() => clipDetail(clip.id)).catch(() => null)));
      if (revision !== compositionRevision) return;
      if (details.some(item => !item)) {
        compositorMessage('Some clips in this layout are missing or incomplete in this browser.', true);
      }
      compositionItems = [];
      compositionDuration = 0;
      trackContent.replaceChildren();
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
      const hadComposition = document.body.classList.contains('has-composition');
      document.body.classList.toggle('has-composition', compositionItems.length > 0);
      if (compositionItems.length) {
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
      let pendingTouchSeek = null;
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
        pendingTouchSeek = null;
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
            event.target.closest('button, input')) return;
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
      trackList.addEventListener('gesturestart', event => {
        if (!browserZoomEnabled) event.preventDefault();
      }, gestureOptions);
      trackList.addEventListener('gesturechange', event => {
        if (!browserZoomEnabled) event.preventDefault();
      }, gestureOptions);
      rulerLane.addEventListener('pointerdown', event => {
        if (timelineLocked()) return;
        if (event.pointerType === 'touch') {
          pendingTouchSeek = event.pointerId;
          suppressTouchSeek = false;
          return;
        }
        setCompositionTime((event.clientX - rulerLane.getBoundingClientRect().left) / timelineScale);
      });
      rulerLane.addEventListener('pointerup', event => {
        if (timelineLocked()) return;
        if (event.pointerId !== pendingTouchSeek) return;
        pendingTouchSeek = null;
        if (!suppressTouchSeek) setCompositionTime(
          (event.clientX - rulerLane.getBoundingClientRect().left) / timelineScale);
      });
      rulerLane.addEventListener('pointercancel', () => { pendingTouchSeek = null; });
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
        const heading = document.createElement('button');
        heading.type = 'button';
        heading.className = 'track-heading';
        heading.textContent = `Track ${trackIndex + 1}${trackIndex === activeTrack ? ' ✓' : ''}`;
        heading.setAttribute('aria-label', `Add new clips to track ${trackIndex + 1}`);
        heading.addEventListener('click', () => { activeTrack = trackIndex; void refreshCompositor(); refreshClipList(); });
        const lane = document.createElement('div');
        lane.className = 'track-lane';
        lane.dataset.track = String(trackIndex);
        lane.style.width = `${laneWidth}px`;
        track.forEach((clip, clipIndex) => {
          const item = trackDetails[trackIndex][clipIndex];
          if (!item) return;
          const id = clip.id;
          const tile = document.createElement('div');
          tile.className = 'clip-tile';
          const entry = compositionItems.find(value =>
            value.clipRef === tracks[trackIndex][clipIndex]);
          if (entry) entry.tile = tile;
          const clipRef = tracks[trackIndex][clipIndex];
          tile.classList.toggle('selected', selectedClips.has(clipRef));
          tile.dataset.index = String(clipIndex);
          tile.style.left = `${Math.round(clip.start * timelineScale)}px`;
          tile.style.width = `${Math.max(32, Math.round(entry.duration * timelineScale))}px`;
          const thumbnail = document.createElement(item.type === 'video' ? 'video' : 'canvas');
          if (item.type === 'video') {
            thumbnail.src = item.src;
            thumbnail.muted = true;
            thumbnail.playsInline = true;
            thumbnail.preload = 'metadata';
            thumbnail.addEventListener('loadedmetadata', () => {
              thumbnail.currentTime = Math.min(.1, thumbnail.duration / 2);
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
          function syncSelection() {
            compositionItems.forEach(value => {
              if (!value.tile) return;
              const chosen = selectedClips.has(value.clipRef);
              value.tile.classList.toggle('selected', chosen);
              value.tile.querySelector('.clip-select')?.setAttribute('aria-pressed', String(chosen));
            });
          }
          select.setAttribute('aria-pressed', String(selectedClips.has(clipRef)));
          select.addEventListener('click', () => {
            if (selectedClips.has(clipRef)) selectedClips.delete(clipRef);
            else selectedClips.add(clipRef);
            syncSelection();
            compositorMessage(`${selectedClips.size} clip${selectedClips.size === 1 ? '' : 's'} selected. Drag a selected clip to move the group.`);
          });
          function updateLiveClip(start, duration, sourceStart, destinationTrack = trackIndex) {
            entry.start = roundTime(start);
            entry.duration = roundTime(duration);
            entry.sourceStart = roundTime(sourceStart);
            entry.end = entry.start + entry.duration;
            entry.track = destinationTrack;
            tile.style.left = `${Math.round(entry.start * timelineScale)}px`;
            tile.style.width = `${Math.max(32, Math.round(entry.duration * timelineScale))}px`;
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
          lane.append(tile);
        });
        row.append(heading, lane);
        trackContent.append(row);
      });
      visibleItem = null;
      compositionScrubber.max = String(compositionDuration);
      setCompositionTime(session.playheadSeconds);
      if (focusGrip) { focusGrip.focus(); pendingClipFocus = null; }
      refreshClipList();
    }
    function refreshClipList() {
      clipList.replaceChildren();
      timelineImageList.replaceChildren();
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
          clips.push({ id: match[1], mime: meta.mime, parts, total: meta.total, length });
        }
        clips.sort((a, b) => a.id.localeCompare(b.id));
        if (!clips.length) {
          clipList.textContent = 'No clips saved yet.';
          timelineImageList.textContent = 'No image clips saved.';
          return;
        }
        for (const clip of clips) {
          if (clip.mime.startsWith('image/')) {
            const imageAdd = document.createElement('button');
            imageAdd.type = 'button';
            imageAdd.textContent = `+ ${clip.id}`;
            imageAdd.title = `Add ${clip.id} to track ${activeTrack + 1}`;
            imageAdd.setAttribute('aria-label', imageAdd.title);
            imageAdd.disabled = clip.parts !== clip.total;
            imageAdd.addEventListener('click', () => addClipToTrack(clip.id));
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
      } catch (error) {
        clipList.textContent = 'Clip storage is unavailable in this browser.';
        timelineImageList.textContent = 'Clip storage is unavailable.';
      }
    }
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
