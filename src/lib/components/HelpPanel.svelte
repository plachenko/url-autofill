<details>
    <summary>Help / About · v0.7.0</summary>
    <ul>
      <li>The full interface is the default. The Minimal view button or <code>u</code> key toggles the view and saves the choice in this browser. Older <code>minimal=</code> links set that saved choice once, then the parameter is removed.</li>
      <li>Clear saved data in the menu removes this app's clips, tracks, text, memory, pane sizes, and preferences from this browser after confirmation.</li>
      <li><code>m=e</code> opens the timeline editor; <code>m=sp</code> opens a screenplay writing page. <code>m=editor</code> and <code>m=screenplay</code> also work. Use the mode buttons above to switch.</li>
      <li>The top right button enters or exits page fullscreen. The choice is saved in this browser. If a browser blocks automatic restoration, use Restore fullscreen. Esc also exits fullscreen.</li>
      <li>Tesla Theater fullscreen opens this page through YouTube's redirect while the car is parked. If YouTube shows a confirmation page, choose Go to site. Text and clips saved in this browser remain available; URL query values are removed before redirecting, except the current mode.</li>
      <li><code>t</code>: fills the text field. URL-encode special characters. Minimal view puts the current text in <code>t=</code>; Full view removes it from the address bar after reading it.</li>
      <li><code>r</code>: fills the Assistant reply field. URL-encode special characters. Older long parameter names still work and are shortened in the address bar.</li>
      <li><code>data:video/</code> and <code>data:image/</code> values in text or reply display playable video or images; media is skipped by speech.</li>
      <li>Images can expand to fill fullscreen while keeping their proportions, even when the source image is small. Animated images also have Play/Pause and frame seeking in a WebCodecs browser such as Chrome/Edge.</li>
      <li>Store a base64 image or video in pieces with <code>?s=clip1&amp;p=1&amp;n=2&amp;f=image/png&amp;d=BASE64_CHUNK</code>, then send part 2. Parts are numbered from 1. Include <code>h=3</code> to set how long an image plays; the default is 3 seconds. URL-encode the base64 chunk.</li>
      <li>Play saved items in order with <code>?l=clip1,clip2</code>. The player advances after each video or image. Use <code>?x=clip1</code> to remove a stored item. Browser local storage has a small quota, so large videos may not fit.</li>
      <li>Share compositor tracks with <code>?tr=clip1@0,clip2@3|clip3@1&amp;at=2.50</code>. Each <code>@</code> value is a start second; trimmed clips add <code>~sourceStart~duration</code>. <code>at</code> is the scrubber position. The receiving browser needs the saved clips.</li>
      <li>Use the menu to save clips. Drag the bar between preview and timeline to resize the panes; the sizes are saved in this browser. The large preview shows the whole clip frame under the yellow playhead. The red line on its tile marks the current rendered frame. Tap the top of the yellow playhead to lock or unlock the red line; drag the yellow handle or click the ruler to scrub. The bottom strip can expand into tracks or collapse for render focus. Pin locks the preview's internal dimensions while fitting it inside the available area. Drag a clip to move it; the tile follows in real time. Drag its left or right yellow edge to trim it. Snap on aligns nearby seconds and clip edges within 0.2 seconds. The track area scrolls horizontally. Use Put position in URL to share the layout and current position.</li>
      <li>Above the tracks, paste an image, image URL, or image data URI into the image field and save it to the image clip list. Use its + button to add the saved image to the active track. Some image sites block importing by URL; copying the image and pasting it works instead.</li>
      <li>Select clips with their check buttons to move them together. Split cuts selected clips at the playhead; with no selection, it cuts the visible clip. Each side must be at least 0.1 seconds long.</li>
      <li>Lock stops clip dragging and trimming so dragging the track area pans the timeline. The lock turns on during a two-finger timeline gesture and returns to your chosen setting when both fingers lift.</li>
      <li>Expand Tracks and use −, +, or a two-finger pinch to zoom the timeline. The ruler marks the full bar in seconds, and the scale is saved in this browser. The menu's Browser zoom setting restores normal browser pinch zoom in the track area.</li>
      <li><code>a</code>: runs <code>render</code>, <code>clear</code>, <code>speak</code>, or <code>upper</code>.</li>
      <li><code>a=speak</code>: speaks the reply, or the user text when the reply is empty, with word highlighting.</li>
      <li><code>sp=1</code>: automatically speaks after load and any delay. In minimal mode, tap anywhere to restart speech.</li>
      <li><code>memory</code>: saves memory across page loads; an empty value clears memory. Older <code>m=</code> memory links still work except the mode values above.</li>
      <li><code>c</code>: saves the Clip ID across page loads.</li>
      <li><code>w</code>: seconds before the action, including decimals; maximum 3600.
        Invalid or negative values become 0. Cancel stops a pending action.</li>
    </ul>
    <p><a data-sveltekit-reload href="?t=hello&amp;a=render&amp;w=5"><code>index.html?t=hello&amp;a=render&amp;w=5</code></a></p>
    <p><a data-sveltekit-reload href="?t=hello&amp;r=Hi%20there%21&amp;a=render"><code>index.html?t=hello&amp;r=Hi%20there%21&amp;a=render</code></a></p>
    <p><a data-sveltekit-reload href="?t=hello%20there&amp;a=upper&amp;w=0.5"><code>index.html?t=hello%20there&amp;a=upper&amp;w=0.5</code></a></p>
    <p><a data-sveltekit-reload href="?memory=Remember%20this&amp;c=clip-123&amp;a=render"><code>index.html?memory=Remember%20this&amp;c=clip-123&amp;a=render</code></a></p>
    <p><a data-sveltekit-reload href="?memory="><code>index.html?memory=</code></a> clears saved memory.</p>
    <p>Manual Run buttons cancel any pending action. Speech availability depends on the browser;
      some browsers require tapping the page (or Run Speak in the full interface) before audio can play.
      When audio is unavailable, highlighting continues silently.</p>
  </details>
