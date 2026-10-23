<script>
  import { trackRows } from "../track-rows.js";

  function thumbnail(node, item) {
    if (item.type === "video") {
      const seek = () => {
        node.currentTime =
          (item.sourceOffset || 0) + Math.min(0.1, item.duration / 2);
      };
      if (node.readyState >= 1) seek();
      else node.addEventListener("loadedmetadata", seek, { once: true });
      return {
        destroy: () => node.removeEventListener("loadedmetadata", seek),
      };
    }
    const image = new Image();
    image.onload = () => {
      const context = node.getContext("2d");
      if (!context || !image.naturalWidth || !image.naturalHeight) return;
      const scale = Math.max(
        node.width / image.naturalWidth,
        node.height / image.naturalHeight,
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(
        image,
        (node.width - width) / 2,
        (node.height - height) / 2,
        width,
        height,
      );
    };
    image.src = item.src;
    return {
      destroy: () => {
        image.onload = null;
        image.removeAttribute("src");
      },
    };
  }
</script>

<div id="track-content">
  {#if $trackRows.length}
    <div class="track-row" id="track-ruler">
      <div class="track-heading timeline-zoom" aria-label="Timeline zoom">
        <button type="button" class="timeline-zoom-out" aria-label="Zoom timeline out">−</button>
        <span class="timeline-zoom-value"></span>
        <button type="button" class="timeline-zoom-in" aria-label="Zoom timeline in">+</button>
      </div>
      <div class="track-ruler-lane" style:width={`${$trackRows[0].laneWidth}px`}></div>
    </div>
  {/if}
  {#each $trackRows as row (row.ref)}
    <div
      class="track-row"
      class:selected-track={row.selected}
      data-track={row.index}
    >
      <div class="track-heading-wrap">
        <button
          type="button"
          class="track-heading"
          aria-label={`Track ${row.index + 1}; tap to select, Shift to select a range, drag to reorder`}
          aria-pressed={row.selected}
          title="Tap to select this track; drag to reorder"
          >Track {row.index + 1}</button
        >
        <button type="button" class="track-mode track-mute">M</button>
        <button type="button" class="track-mode track-solo">S</button>
        <button
          type="button"
          class="track-remove"
          aria-label={`Remove track ${row.index + 1}`}
          title={`Remove track ${row.index + 1}`}>×</button
        >
      </div>
      <div
        class="track-lane"
        data-track={row.index}
        style:width={`${row.laneWidth}px`}
        style:min-height={row.appearance
          ? `${row.appearance.height}px`
          : undefined}
      >
        {#each row.clips as clip (clip.ref)}
          <div
            class="clip-tile"
            class:selected={clip.selected}
            data-index={clip.index}
            style:left={`${Math.round(clip.start * row.scale)}px`}
            style:width={`${Math.max(32, Math.round(clip.entry.duration * row.scale))}px`}
            style:opacity={row.appearance?.fullOpacity}
          >
            {#if clip.item.type === "video"}
              <video
                src={clip.item.src}
                muted
                playsinline
                preload="metadata"
                use:thumbnail={clip.item}
              ></video>
            {:else}
              <canvas width="160" height="62" use:thumbnail={clip.item}
              ></canvas>
            {/if}
            <strong>{clip.displayName}</strong>
            <small>{clip.entry.duration.toFixed(2)}s</small>
            <label class="clip-speed-control" title={`Playback speed for ${clip.id}`}>
              <span>Speed</span>
              <input class="clip-speed" type="number" min="0.25" max="4" step="0.01"
                value={clip.speed} aria-label={`Playback speed for ${clip.id}`} />
              <span>×</span>
            </label>
            <div
              class="clip-grip"
              tabindex="0"
              role="button"
              aria-label={`Move ${clip.id}; arrow keys change time or track`}
            ></div>
            <div
              class="clip-trim left"
              tabindex="0"
              role="slider"
              aria-label={`Trim start of ${clip.id}`}
              aria-valuenow={clip.start}
              title="Trim clip start"
            ></div>
            <div
              class="clip-trim right"
              tabindex="0"
              role="slider"
              aria-label={`Trim end of ${clip.id}`}
              aria-valuenow={clip.entry.end}
              title="Trim clip end"
            ></div>
            <button
              type="button"
              class="clip-select"
              title="Select clip for group moving"
              aria-label={`Select ${clip.id} on track ${row.index + 1}`}
              aria-pressed={clip.selected}>✓</button
            >
            <button
              type="button"
              class="clip-remove"
              aria-label={`Remove ${clip.id} from track ${row.index + 1}`}
              >×</button
            >
          </div>
          <div
            class="collapsed-clip"
            class:selected={clip.selected}
            data-index={clip.index}
            tabindex="0"
            role="button"
            aria-label={`Select or move ${clip.id} on track ${row.index + 1}; arrow keys move`}
            aria-pressed={clip.selected}
            title={`${clip.id}: ${clip.start.toFixed(2)}s, ${clip.entry.duration.toFixed(2)}s long`}
            style:left={`${Math.round(clip.start * row.scale)}px`}
            style:width={`${Math.max(32, Math.round(clip.entry.duration * row.scale))}px`}
            style:opacity={row.appearance?.compactOpacity}
          >
            <span class="collapsed-clip-content">{clip.displayName}</span>
          </div>
        {/each}
      </div>
    </div>
  {/each}
  {#if $trackRows.length}
    <div id="track-playhead">
      <button type="button" role="slider" aria-label="Track playhead in seconds"
        aria-valuemin="0" aria-valuenow="0">▼</button>
    </div>
  {/if}
  <button id="add-track-bottom" type="button">+ Add track</button>
</div>
