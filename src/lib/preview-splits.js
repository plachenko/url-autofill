import { previewEntryForSource, previewSourceTime } from './preview-sources.js';

const storageKey = 'urlAutofill.previewSplits.v1';
const maxViews = 8;

export function createPreviewSplits({ layout, verticalButton, horizontalButton,
  closeButton, getSnapshot, resolveImage, onLayoutChange = () => {} }) {
  const primary = layout.querySelector('[data-preview-primary]');
  const views = new Set([primary]);
  const viewState = new WeakMap();
  let active = primary;
  let nextViewNumber = 2;
  let clipLoopFrame = 0;
  let restored = false;
  let dropTarget = null;
  let primaryOverride = null;
  const dropHighlight = document.createElement('div');
  dropHighlight.className = 'preview-drop-highlight';
  dropHighlight.setAttribute('aria-hidden', 'true');

  function persist() {
    function describe(node) {
      if (node.classList.contains('preview-view')) return node === primary
        ? { type: 'primary' }
        : { type: 'view', source: viewState.get(node).select.value === 'dropped-image'
          ? 'selected' : viewState.get(node).select.value };
      return {
        type: node.dataset.direction,
        ratio: Number(node.dataset.ratio),
        first: describe(node.children[0].firstElementChild),
        second: describe(node.children[2].firstElementChild)
      };
    }
    try { window.localStorage.setItem(storageKey, JSON.stringify(describe(layout.firstElementChild))); }
    catch (error) { /* The split layout still works without browser storage. */ }
  }

  function selectView(view) {
    active.classList.remove('is-active');
    active = view;
    active.classList.add('is-active');
    closeButton.disabled = active === primary;
    const full = views.size >= maxViews;
    verticalButton.disabled = full;
    horizontalButton.disabled = full;
  }

  function sourceOptions(select, requestedSource, droppedImage = null) {
    const { tracks, activeTrack } = getSnapshot();
    const options = [new Option('Selected clip', 'selected')];
    if (droppedImage) options.push(new Option(droppedImage.label, 'dropped-image'));
    tracks.forEach((track, trackIndex) => {
      options.push(new Option(`Track ${trackIndex + 1}`, `track:${trackIndex}`));
      track.forEach((clip, clipIndex) => {
        options.push(new Option(`Clip ${clip.id} · track ${trackIndex + 1}`, `clip:${trackIndex}:${clipIndex}`));
      });
    });
    select.replaceChildren(...options);
    select.value = requestedSource;
    if (!select.value) select.value = `track:${Math.min(activeTrack, tracks.length - 1)}`;
    if (!select.value && options.length) select.value = options[0].value;
  }

  function sourceReference(source, tracks) {
    if (source === 'selected') return null;
    const parts = source.split(':');
    const track = tracks[Number(parts[1])];
    return parts[0] === 'clip' ? track?.[Number(parts[2])] : track;
  }

  function sourceForReference(source, reference, tracks) {
    if (source === 'selected') return source;
    if (!reference) return source;
    if (source.startsWith('track:')) {
      const trackIndex = tracks.indexOf(reference);
      return trackIndex < 0 ? source : `track:${trackIndex}`;
    }
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      const clipIndex = tracks[trackIndex].indexOf(reference);
      if (clipIndex >= 0) return `clip:${trackIndex}:${clipIndex}`;
    }
    return source;
  }

  function makeView(source, droppedImage = null) {
    const view = document.createElement('div');
    view.className = 'preview-view';
    view.setAttribute('role', 'group');
    view.setAttribute('aria-label', `Preview view ${nextViewNumber++}`);
    const select = document.createElement('select');
    select.className = 'preview-source-select';
    select.setAttribute('aria-label', 'Source for this preview view');
    const surface = document.createElement('div');
    surface.className = 'preview-source-surface';
    const image = document.createElement('img');
    image.alt = 'Selected clip frame';
    image.hidden = true;
    image.addEventListener('load', () => {
      viewState.get(view).droppedImageFailed = false;
      sync(true);
    });
    image.addEventListener('error', () => {
      viewState.get(view).droppedImageFailed = true;
      sync(true);
    });
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.hidden = true;
    video.addEventListener('error', () => {
      viewState.get(view).droppedImageFailed = true;
      sync(true);
    });
    const empty = document.createElement('span');
    empty.className = 'preview-source-empty';
    surface.append(image, video, empty);
    view.append(surface, select);
    view.addEventListener('pointerdown', () => selectView(view));
    select.addEventListener('change', () => {
      const state = viewState.get(view);
      state.clipStartedAt = performance.now();
      state.clipRef = null;
      state.droppedImageFailed = false;
      state.sourceRef = sourceReference(select.value, getSnapshot().tracks);
      persist();
      sync(true);
    });
    video.addEventListener('loadedmetadata', () => {
      viewState.get(view).droppedImageFailed = false;
      sync(true);
    });
    viewState.set(view, { select, image, video, empty, droppedImage, droppedImageFailed: false,
      clipRef: null,
      clipStartedAt: performance.now() });
    views.add(view);
    sourceOptions(select, source, droppedImage);
    viewState.get(view).sourceRef = sourceReference(select.value, getSnapshot().tracks);
    return view;
  }

  function makeSplit(direction, first, second, ratio = 50) {
    const split = document.createElement('div');
    split.className = `preview-split preview-split-${direction}`;
    split.dataset.direction = direction;
    split.dataset.ratio = String(ratio);
    split.style.setProperty('--split-ratio', `${ratio}%`);
    const firstBranch = document.createElement('div');
    const secondBranch = document.createElement('div');
    firstBranch.className = secondBranch.className = 'preview-branch';
    const divider = document.createElement('div');
    divider.className = 'preview-divider';
    divider.setAttribute('role', 'separator');
    divider.setAttribute('tabindex', '0');
    divider.setAttribute('aria-orientation', direction);
    divider.setAttribute('aria-label', direction === 'vertical'
      ? 'Resize preview views horizontally; drag a view to the edge to close it'
      : 'Resize preview views vertically; drag a view to the edge to close it');
    divider.setAttribute('aria-valuemin', '0');
    divider.setAttribute('aria-valuemax', '100');
    divider.setAttribute('aria-valuenow', String(ratio));
    function closableView(branch) {
      const child = branch.firstElementChild;
      return child?.classList.contains('preview-view') && child !== primary ? child : null;
    }
    function setRatio(value, dragging = false) {
      const firstClosable = dragging && closableView(firstBranch);
      const secondClosable = dragging && closableView(secondBranch);
      const next = Math.max(firstClosable ? 0 : 15,
        Math.min(secondClosable ? 100 : 85, value));
      split.dataset.ratio = String(next);
      split.style.setProperty('--split-ratio', `${next}%`);
      divider.setAttribute('aria-valuenow', String(Math.round(next)));
      split.classList.toggle('is-closing-first', Boolean(firstClosable && next <= 12));
      split.classList.toggle('is-closing-second', Boolean(secondClosable && next >= 88));
      onLayoutChange();
    }
    divider.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      divider.setPointerCapture(event.pointerId);
      const startingRatio = Number(split.dataset.ratio);
      const move = moveEvent => {
        if (moveEvent.pointerId !== event.pointerId) return;
        const bounds = split.getBoundingClientRect();
        const position = direction === 'vertical' ? moveEvent.clientX - bounds.left
          : moveEvent.clientY - bounds.top;
        const size = direction === 'vertical' ? bounds.width : bounds.height;
        if (size) setRatio(position / size * 100, true);
      };
      const end = endEvent => {
        if (endEvent.pointerId !== event.pointerId) return;
        divider.removeEventListener('pointermove', move);
        divider.removeEventListener('pointerup', end);
        divider.removeEventListener('pointercancel', end);
        if (endEvent.type === 'pointercancel') {
          setRatio(startingRatio);
          return;
        }
        const closing = split.classList.contains('is-closing-first')
          ? closableView(firstBranch) : split.classList.contains('is-closing-second')
            ? closableView(secondBranch) : null;
        if (closing) { closeView(closing); return; }
        setRatio(Number(split.dataset.ratio));
        persist();
      };
      divider.addEventListener('pointermove', move);
      divider.addEventListener('pointerup', end);
      divider.addEventListener('pointercancel', end);
    });
    divider.addEventListener('keydown', event => {
      const key = direction === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      if (!key.includes(event.key)) return;
      event.preventDefault();
      setRatio(Number(split.dataset.ratio) + (event.key === key[0] ? -1 : 1) *
        (event.shiftKey ? 1 : 5));
      persist();
    });
    firstBranch.append(first);
    secondBranch.append(second);
    split.append(firstBranch, divider, secondBranch);
    return split;
  }

  function splitView(target, direction, source = 'selected', side = 'right', droppedImage = null) {
    if (views.size >= maxViews) return;
    restored = true;
    const placeholder = document.createComment('preview split');
    target.replaceWith(placeholder);
    const extra = makeView(source, droppedImage);
    const before = side === 'left' || side === 'top';
    const split = makeSplit(direction, before ? extra : target, before ? target : extra);
    placeholder.replaceWith(split);
    onLayoutChange();
    selectView(extra);
    persist();
    sync(true);
  }

  function splitActive(direction) {
    splitView(active, direction);
  }

  function closeView(closing) {
    if (!closing || closing === primary || !views.has(closing)) return;
    const branch = closing.parentElement;
    const split = branch.parentElement;
    const sibling = split.children[branch === split.children[0] ? 2 : 0].firstElementChild;
    const closingState = viewState.get(closing);
    closingState.video.pause();
    if (closingState.droppedImage?.objectUrl) URL.revokeObjectURL(closingState.droppedImage.src);
    views.delete(closing);
    split.replaceWith(sibling);
    onLayoutChange();
    const nextActive = active === closing
      ? sibling.classList.contains('preview-view') ? sibling : sibling.querySelector('.preview-view')
      : active;
    selectView(nextActive);
    persist();
    sync(true);
  }

  function closeActive() {
    closeView(active);
  }

  function sync(seek = false) {
    const { tracks, items, seconds, locked, playing, selectedClips } = getSnapshot();
    let needsLoop = false;
    for (const view of views) {
      if (view === primary) continue;
      const state = viewState.get(view);
      const source = state.select.value;
      if (source === 'dropped-image' && state.droppedImage) {
        if (state.droppedImage.type === 'video') {
          if (state.video.src !== state.droppedImage.src) state.video.src = state.droppedImage.src;
          state.video.loop = true;
          state.video.controls = true;
          state.video.hidden = state.droppedImageFailed;
          state.image.hidden = true;
          if (!state.droppedImageFailed && state.video.paused)
            void state.video.play().catch(() => {});
        } else {
          if (state.image.src !== state.droppedImage.src) state.image.src = state.droppedImage.src;
          state.image.hidden = state.droppedImageFailed;
          state.video.hidden = true;
          state.video.pause();
        }
        state.empty.textContent = 'Could not display the dropped media.';
        state.empty.hidden = !state.droppedImageFailed;
        continue;
      }
      const entry = previewEntryForSource(source, tracks, items, seconds, selectedClips);
      const clipRef = entry?.clipRef || null;
      if (clipRef !== state.clipRef) {
        state.clipRef = clipRef;
        state.clipStartedAt = performance.now();
        state.image.removeAttribute('src');
        state.video.pause();
        state.video.removeAttribute('src');
        if (entry) {
          if (entry.item.type === 'image') state.image.src = entry.item.src;
          else state.video.src = entry.item.src;
        }
      }
      const independentClip = (source.startsWith('clip:') || source === 'selected') && !locked;
      if (independentClip && entry) needsLoop = true;
      const elapsed = (performance.now() - state.clipStartedAt) / 1000;
      const previewTime = previewSourceTime(source, entry, seconds, locked, elapsed);
      const visible = previewTime !== null;
      if (state.empty.hidden !== visible) state.empty.hidden = visible;
      const emptyMessage = entry ? 'Move the cursor onto this clip to preview it.'
        : source === 'selected' ? 'Select a clip on the timeline to preview it.'
          : 'No clip at the cursor on this track.';
      if (state.empty.textContent !== emptyMessage) state.empty.textContent = emptyMessage;
      const imageHidden = !visible || entry.item.type !== 'image';
      const videoHidden = !visible || entry.item.type !== 'video';
      if (state.image.hidden !== imageHidden) state.image.hidden = imageHidden;
      if (state.video.hidden !== videoHidden) state.video.hidden = videoHidden;
      if (!visible || entry.item.type !== 'video') {
        state.video.pause();
        continue;
      }
      const video = state.video;
      video.loop = false;
      video.controls = false;
      if (video.readyState < 1) continue;
      const target = entry.sourceStart + previewTime - entry.start;
      if (seek || Math.abs(video.currentTime - target) > (independentClip ? .2 : .08))
        video.currentTime = Math.max(0, Math.min(entry.item.duration, target));
      if (independentClip || (playing && !locked)) {
        if (video.paused) void video.play().catch(() => {});
      } else video.pause();
    }
    if (needsLoop && !clipLoopFrame) clipLoopFrame = window.requestAnimationFrame(() => {
      clipLoopFrame = 0;
      sync();
    });
    if (!needsLoop && clipLoopFrame) {
      window.cancelAnimationFrame(clipLoopFrame);
      clipLoopFrame = 0;
    }
  }

  function refreshSources() {
    if (!restored) {
      restored = true;
      restoreSavedLayout();
    }
    for (const view of views) {
      if (view === primary) continue;
      const state = viewState.get(view);
      const tracks = getSnapshot().tracks;
      const source = sourceForReference(state.select.value, state.sourceRef, tracks);
      sourceOptions(state.select, source, state.droppedImage);
      state.sourceRef = sourceReference(state.select.value, tracks);
    }
    persist();
    sync(true);
  }

  function targetAt(clientX, clientY) {
    const view = document.elementFromPoint(clientX, clientY)?.closest('.preview-view');
    if (!view || !views.has(view)) return null;
    const bounds = view.getBoundingClientRect();
    const x = (clientX - bounds.left) / bounds.width;
    const y = (clientY - bounds.top) / bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    const distances = { left: x, right: 1 - x, top: y, bottom: 1 - y };
    const side = x >= .3 && x <= .7 && y >= .3 && y <= .7 ? 'center' :
      Object.keys(distances).reduce((nearest, candidate) =>
        distances[candidate] < distances[nearest] ? candidate : nearest);
    if (side !== 'center' && views.size >= maxViews) return null;
    return { view, side };
  }

  function clearDropTarget() {
    dropHighlight.remove();
    dropTarget = null;
  }

  function highlightAt(clientX, clientY) {
    const target = targetAt(clientX, clientY);
    if (!target) { clearDropTarget(); return false; }
    if (dropTarget?.view === target.view && dropTarget.side === target.side) return true;
    dropTarget = target;
    dropHighlight.className = `preview-drop-highlight preview-drop-${target.side}`;
    dropHighlight.textContent = target.side === 'center' ? 'Replace view' : `Split ${target.side}`;
    target.view.append(dropHighlight);
    return true;
  }

  function clearPrimaryOverride() {
    if (!primaryOverride) return;
    primaryOverride.video?.pause();
    primaryOverride.root.remove();
    if (primaryOverride.media.objectUrl) URL.revokeObjectURL(primaryOverride.media.src);
    primaryOverride = null;
  }

  function replacePrimary(media) {
    clearPrimaryOverride();
    const root = document.createElement('div');
    root.className = 'preview-primary-override';
    const visible = document.createElement(media.type === 'video' ? 'video' : 'img');
    visible.src = media.src;
    if (media.type === 'video') {
      visible.muted = true;
      visible.playsInline = true;
      visible.loop = true;
      visible.controls = true;
    } else visible.alt = media.label || 'Dropped clip';
    const error = document.createElement('span');
    error.className = 'preview-source-empty';
    error.textContent = 'Could not display the dropped clip.';
    error.hidden = true;
    visible.addEventListener('error', () => {
      visible.hidden = true;
      error.hidden = false;
    });
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'preview-return-button';
    restore.textContent = 'Timeline';
    restore.setAttribute('aria-label', 'Return to timeline preview');
    restore.addEventListener('click', clearPrimaryOverride);
    root.append(visible, error, restore);
    primary.append(root);
    primaryOverride = { root, media, video: media.type === 'video' ? visible : null };
    if (media.type === 'video') void visible.play().catch(() => {});
    selectView(primary);
  }

  function replaceView(view, media) {
    if (view === primary) { replacePrimary(media); return; }
    const state = viewState.get(view);
    state.video.pause();
    state.video.removeAttribute('src');
    state.image.removeAttribute('src');
    if (state.droppedImage?.objectUrl) URL.revokeObjectURL(state.droppedImage.src);
    state.droppedImage = media;
    state.droppedImageFailed = false;
    state.clipRef = null;
    state.clipStartedAt = performance.now();
    state.sourceRef = null;
    sourceOptions(state.select, 'dropped-image', media);
    selectView(view);
    persist();
    sync(true);
  }

  function dropMediaAt(clientX, clientY, media) {
    const target = targetAt(clientX, clientY);
    clearDropTarget();
    if (!target || !media?.src) return false;
    if (target.side === 'center') {
      replaceView(target.view, media);
      return true;
    }
    splitView(target.view, target.side === 'left' || target.side === 'right'
      ? 'vertical' : 'horizontal', 'dropped-image', target.side, media);
    return true;
  }

  function dragHasImage(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.some(type => ['Files', 'text/uri-list', 'text/html',
      'application/x-url-autofill-image-id'].includes(type));
  }

  function imageFromDrop(transfer) {
    const file = Array.from(transfer.files || []).find(value => value.type.startsWith('image/'));
    if (file) return { src: URL.createObjectURL(file), label: file.name || 'Dropped image', objectUrl: true };
    const id = transfer.getData('application/x-url-autofill-image-id');
    if (id) {
      try {
        const item = resolveImage?.(id);
        if (item?.type === 'image') return { src: item.src, label: `Image ${id}` };
      } catch (error) { return null; }
    }
    const html = transfer.getData('text/html');
    const htmlSrc = html ? new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.src : '';
    const uri = transfer.getData('text/uri-list').split('\n').find(line => line && !line.startsWith('#'));
    const src = htmlSrc || uri;
    if (!src || !/^(https?:|data:image\/|blob:)/i.test(src)) return null;
    return { src, label: 'Dropped image' };
  }

  layout.addEventListener('dragover', event => {
    if (!dragHasImage(event) || !highlightAt(event.clientX, event.clientY)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  layout.addEventListener('dragleave', event => {
    const bounds = layout.getBoundingClientRect();
    if (event.clientX <= bounds.left || event.clientX >= bounds.right ||
        event.clientY <= bounds.top || event.clientY >= bounds.bottom) clearDropTarget();
  });
  layout.addEventListener('drop', event => {
    if (!dragHasImage(event)) return;
    event.preventDefault();
    const image = imageFromDrop(event.dataTransfer);
    if (!dropMediaAt(event.clientX, event.clientY, image) && image?.objectUrl)
      URL.revokeObjectURL(image.src);
  });
  document.addEventListener('dragend', clearDropTarget);
  layout.addEventListener('preview-image-pointer-drag', event => {
    const { phase, clientX, clientY, src, blob, type, name } = event.detail;
    if (phase === 'move') highlightAt(clientX, clientY);
    else if (phase === 'drop') {
      const ownUrl = blob ? URL.createObjectURL(blob) : src;
      event.detail.handled = dropMediaAt(clientX, clientY,
        { src: ownUrl, type: type || 'image', label: name || 'WebSocket image', objectUrl: Boolean(blob) });
      if (!event.detail.handled && blob) URL.revokeObjectURL(ownUrl);
    }
    else clearDropTarget();
  });
  layout.addEventListener('preview-clip-pointer-drag', event => {
    const { phase, clientX, clientY, id } = event.detail;
    if (phase === 'move') highlightAt(clientX, clientY);
    else if (phase === 'drop') {
      try {
        const item = resolveImage(id);
        event.detail.handled = dropMediaAt(clientX, clientY,
          { src: item.src, type: item.type, label: `Clip ${id}` });
      } catch (error) { clearDropTarget(); }
    } else clearDropTarget();
  });

  primary.addEventListener('pointerdown', () => selectView(primary));
  verticalButton.addEventListener('click', () => splitActive('vertical'));
  horizontalButton.addEventListener('click', () => splitActive('horizontal'));
  closeButton.addEventListener('click', closeActive);
  function restoreSavedLayout() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey));
      function valid(node, depth = 0) {
        if (!node || depth > 7) return null;
        if (node.type === 'primary') return { count: 1, primaryCount: 1 };
        if (node.type === 'view' && typeof node.source === 'string')
          return { count: 1, primaryCount: 0 };
        if (!['vertical', 'horizontal'].includes(node.type) ||
            !Number.isFinite(node.ratio) || node.ratio < 15 || node.ratio > 85) return null;
        const first = valid(node.first, depth + 1);
        const second = valid(node.second, depth + 1);
        if (!first || !second) return null;
        return { count: first.count + second.count,
          primaryCount: first.primaryCount + second.primaryCount };
      }
      function restore(node) {
        if (node.type === 'primary') return primary;
        if (node.type === 'view') return makeView(node.source);
        return makeSplit(node.type, restore(node.first), restore(node.second), node.ratio);
      }
      const details = valid(saved);
      if (details && details.count <= maxViews && details.primaryCount === 1)
        layout.replaceChildren(restore(saved));
      onLayoutChange();
    } catch (error) { /* Start with one view if the saved layout cannot be restored. */ }
    selectView(primary);
  }
  selectView(primary);
  sync(true);
  return { sync, refreshSources };
}
