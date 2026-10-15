# URL Autofill

Car-browser helper page (v0.7.0), built with SvelteKit and `adapter-static`. Open with query params, for example:

`https://plachenko.github.io/url-autofill/?t=hi&r=hello&a=speak`

## Develop and build

Run `npm install`, then `npm run dev`. Use `npm run check` to check the Svelte components and `npm run build` for a root-path static build in `build/`. For this repository's GitHub Pages path, run `npm run build:pages`. The included workflow builds and publishes `build/` on pushes to `main`; set the repository's Pages source to **GitHub Actions**. The build includes `.nojekyll` so GitHub Pages serves SvelteKit's `_app` assets. The previous single-file version is preserved in `legacy/index.html` for reference.

Tailwind CSS utilities are available in Svelte components through the Vite plugin and `src/app.css`. Tailwind Preflight is omitted so the existing element styles remain in place.

The UI is divided into controls, clip library, preview, screenplay, minimal display, and timeline components under `src/lib/components/`. URL parsing and clip storage live in separate modules. The existing playback and editing controller remains in `src/lib/legacy-controller.js` while the browser interactions are moved over incrementally. Drag the bar between the preview and timeline to resize them; PaneForge saves the layout in this browser.

The Clips side panel has an **Import** tab with the WebSocket client. Enter a `ws://` or `wss://` server URL, connect, type text, and choose **Send text**. Use the star beside the URL to save or remove it as a favorite in this browser; choose a saved server from the dropdown to connect to it. **Return text** shows the latest server message. If the reply contains a base64 image, choose **Render image** to preview it. Save a received image or video as a named clip, or drag it onto a timeline track to save it at the drop position. The Render image button accepts an image data URI, raw base64 for PNG, JPEG, GIF, WebP, or BMP, or a JSON object with an `image`, `imageData`, `base64`, or `data` string. A link such as `?ws=wss%3A%2F%2Fexample.com%2Fsocket&wsText=hello` connects automatically and prefills the outgoing text; sending still requires choosing **Send text**. Either URL parameter opens Clips → Import and briefly highlights the WebSocket section. Browsers may require `wss://` when this page is served over HTTPS.

When you have saved WebSocket favorites, the header shows a server selector and **Connect** button; the first favorite is selected by default. While connected, the header also shows **Pointers**. It toggles a pointer capture overlay across the preview and timeline. The updated Blender add-on advertises scene objects: choose one under **Object to animate**, then use **Attach & enable**. Set **Plane width** and **Plane height** in Blender units and choose **Apply size**. Choose the X, Y, or Z plane at the bottom; Z is the default and maps to Blender's XY plane. X maps to YZ and Y maps to XZ when **Use browser plane** is enabled in Blender. Mouse, pen, and simultaneous touch positions are normalized within the overlay and sent as `pointer_positions` JSON.

Completed files from Blender's Render to WebSocket add-on are received automatically. Connect before rendering. The WebSocket section shows received bytes, percentage, and Receiving / Verifying / Complete status, followed by a download link with the original filename. Images (including animated images), video, and audio get a browser-supported preview; other file types can still be downloaded. Drag the received image itself, or use the **Drag … to timeline or preview** handle for images and movies. Drop on a track to save the clip at that time, or on a preview pane edge to open it in a new split. Movie clips use their actual duration. Timeline drops persist their bytes in IndexedDB, avoiding localStorage’s small string quota; session downloads include these bytes too. Standalone dropped preview panes are temporary. Existing **Render image** and timeline image dragging continue to handle legacy image replies.

The file protocol uses JSON messages on one connection:

```json
{"type":"file_start","id":"transfer-id","name":"render.mp4","mime":"video/mp4","bytes":3,"chunks":1,"encoding":"base64"}
{"type":"file_chunk","id":"transfer-id","index":0,"data":"YWJj"}
{"type":"file_end","id":"transfer-id","sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}
```

Split raw bytes into 192 KiB chunks (the last may be shorter), base64-encode each independently, and use zero-based indexes. The receiver verifies all chunks, the byte count, and SHA-256 before replying with `{"type":"file_ack","id":"transfer-id","ok":true}`. Failures return `ok:false` and an `error`. Identical duplicate chunks are ignored; conflicting duplicates fail. Empty files use zero chunks. Chunk messages do not fill the Return text box.

Transfers are buffered in memory, limited to 512 MiB combined and four in-progress files. Verification requires HTTPS or localhost. Inactive transfers time out after 60 seconds; disconnecting or cancelling frees their buffers. Cancel stops local assembly and rejects the transfer; Blender 1.4 may finish sending before reading that rejection. Resume is not supported: reconnect and resend after failure. A `file_cancel` message from the sender also cancels assembly. After verification, the latest file is saved in this browser and restored on reload when reconnecting to the same server, if browser storage is available. Replacing the last completed file or leaving the page releases its Blob URL.

Use `?m=e` for the timeline editor or `?m=sp` for a screenplay writing view. The full values `m=editor` and `m=screenplay` work too. Both modes edit the same saved text. `m` previously meant memory; older `m=` memory links still work unless their value is one of these mode names. Use `memory=` to set or clear memory alongside a mode, for example `?m=sp&memory=Draft` or `?memory=`.

In a parked Tesla, open the menu and choose **Tesla Theater fullscreen** to return to this page through YouTube's Theater redirect. YouTube may ask you to choose **Go to site**. The redirect keeps the current mode and Theater button preference but removes other URL query values so text and media data are not sent to YouTube. Tesla Theater may have separate browser storage, so clips and projects saved in the regular car browser may not appear there. This is separate from the standard page fullscreen button and depends on Tesla and YouTube continuing to allow the redirect.

## Saved media timeline

The full interface is the default. Open the hamburger menu for text fields, saved clips, Minimal view, About, and Help. The fullscreen button stays at the top right. Its choice is saved in this browser; if the browser blocks automatic fullscreen on return, use **Restore fullscreen**. Use the Minimal view button in the menu or the `u` key to switch views; the choice is saved in this browser and never added to the URL. Older `minimal=` links set the saved choice once and are then cleaned up. Short URL parameters are preferred. Older long names still work and are rewritten to short names; if both forms are present, the short form wins. Minimal view puts the current text in `t=` and updates it when the text changes. Full view removes `t=` from the address bar after reading it. In the full interface, the clip library is in the menu below the text field. Enter a clip ID, choose an image or video file, and select **Save clip**. To save a base64 image or video data URI, put it in the Assistant reply field (or the You said field) and choose **Save data URI**. The assistant reply takes priority when both fields contain a data URI. The button creates a clip ID when none is entered and shows the result beside the controls. Saved clips can be added to compositor tracks in the timeline fixed to the bottom of the screen; newly saved clips are added to the active track automatically. Drag tiles horizontally to change their start second or vertically to move them between tracks; gaps and overlaps are allowed. Their widths and labels show duration; image clips use Image seconds, and video clips use their metadata duration. The full-width preview fills the space above the timeline and shows the topmost active track. Images fit the preview container while preserving their proportions. The track area spans the width of the screen and scrolls for long timelines or multiple tracks; click its ruler or drag the yellow playhead to scrub by seconds. The slider above it stays synchronized. Choose **Put position in URL** to put the track layout and current second in the address bar. The layout is also saved in localStorage.

| Old name | Short name | Old name | Short name |
| --- | --- | --- | --- |
| `text` | `t` | `reply` | `r` |
| `store` | `s` | `part` | `p` |
| `total` | `n` | `mime` | `f` |
| `data` | `d` | `seconds` | `h` |
| `timeline` | `l` | `delete` | `x` |
| `tracks` | `tr` | `pos` | `at` |
| `action` | `a` | `speak` | `sp` |
| `mode` | `m` | `clip` | `c` |
| `delay` | `w` |  |  |

Send each base64 chunk in a separate URL to the same browser and origin:

```text
?s=clip1&p=1&n=2&f=image/png&d=FIRST_BASE64_CHUNK
?s=clip1&p=2&n=2&d=SECOND_BASE64_CHUNK
```

Parts are numbered from 1 and can arrive in any order. `d` can be a raw base64 chunk or start with `data:image/png;base64,`. URL-encode the chunk, especially `+`, `/`, and `=`. For an image, add `h=3` to set its display time (default: 3 seconds). A clip can be an `image/*` or `video/*` MIME type. Replacing an existing clip with a different MIME type or part count requires deleting it first.

Play completed clips in order with `?l=clip1,clip2`, or enter `timeline:clip1,clip2` in the text field. The player uses an image or video element, advances when an image's time expires or a video ends, and includes play/pause, item seeking, and fullscreen controls. The compositor URL uses `?tr=clip1@0,clip2@3|clip3@1&at=2.50`: commas separate clips within a track, `|` starts another track, `@` sets a clip's start second, and `at` is the playhead in seconds. Videos start muted to allow autoplay. Use `?x=clip1` to remove a clip and its chunks. Shared URLs require the same clips to exist in the receiving browser's localStorage.

Chunks are stored in browser `localStorage` for this site's origin. Browser quotas are small, usually only a few megabytes, so this is suited to short clips and images rather than large videos. Private browsing or cleared site data removes the timeline.

Use **Download session** in the menu to save a JSON backup of this app's text, clips, tracks, pane sizes, and preferences. Enter a **Session filename** first to name the download; leave it blank for a dated filename. The `.json` extension is added if needed. **Restore session** imports that file and replaces the app's current saved data after confirmation. Other data stored on the same origin is left alone. Large clips make the backup file large too.

Use **Projects** in the menu to create, switch, rename, or delete browser-local workspaces. Your existing session becomes Project 1. Each project keeps its own clips, tracks, text, layout, and preferences. Switching saves the current project before loading the next one. A session file backs up the active project; **Clear saved data** removes all projects.

Blender rendering progress is separate from file transfer progress. The add-on sends `render_progress` JSON messages with `id`, `state` (Rendering/Complete/Cancelled), `scene`, `frame`, `completed`, and `total` (null when unknown). The browser shows an indeterminate bar for a still render or until an animation is confirmed, then a completed-frame percentage. Once it observes completed frames on the current connection, it estimates time left from their average pace and updates the countdown each second. Completion means rendering finished; the file still needs to transfer and pass checksum verification. New server connections receive the latest render status, including during rendering. The companion Blender add-on (1.7.0+) also replays its latest cached completed file on reconnect; if no output fits its replay cache, Blender reports that replay is unavailable. Disconnecting marks an unfinished render status as disconnected. Render status currently uses the add-on’s server mode.

Received-media storage is shared by this browser’s saved projects and scenes. Removing a clip reference does not immediately delete its underlying bytes because another saved project may still reference them; **Clear saved data** removes the received-media store too. Portable session restore retains the existing 32 MiB session-file limit. A large movie’s base64 representation may exceed that limit; its ordinary file download remains available.

The menu's Storage panel shows approximate localStorage usage against a typical 5 MiB budget, plus the browser-reported usage/quota for site storage (including received clips in IndexedDB). These are separate storage pools and browser estimates, not guaranteed writable space. The meter refreshes when opened, every five seconds while the menu is visible, on window focus, and through Refresh storage. Usage above 80% is highlighted. It measures existing data without filling storage or changing permissions. Reference: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

### Editable video archive

The controls drawer can create a `clips.webm` source reel and a `clips.json` sidecar for the current project. JSON preserves the timeline, trims/splits, scene snapshots, and preview layout; each stored clip maps to a time range in the reel. Export is a real-time, 1920×1080/30fps re-encode with audio and letterboxing, not a lossless backup of original formats. Images become video segments (extended image clips are covered). Keep the tab visible. Use the existing session backup when original media bytes must be retained.

Save both files, then select them in the archive panel and choose **Verify saved pair**. A SHA-256 check binds the video to its JSON. Only a verified pair from the current export enables **Clear archived media**, and any project changes block clearing. Clearing removes current-project media while retaining layout; blobs shared with other project backups remain. **Restore video + JSON** imports the reel once and reconnects the original clip IDs to its segment ranges. The full export/save/import playback workflow still needs browser verification before relying on it for irreplaceable media.


### Blender add-on and pointer recording

The companion [Render to WebSocket add-on](blender-addon/README.md) is tracked in `blender-addon/`. Build its installer with `python blender-addon/build.py`.

In Blender's Output Properties > Render to WebSocket > WebSocket Pointer Control, configure an independent origin and optionally a target Empty. Connect from the header favorite-server controls or Clips > Import, then open **Pointers**. Select an advertised scene object and choose **Attach & enable** to make it follow the control Empty, or configure the target in Blender. Set the plane size in the overlay or in Blender. Browser X/Y/Z buttons choose the movement plane when **Use browser plane** is on; Blender's configured plane wins when it is off. Select the origin, target, or followed object in Blender and enable viewport Overlays to see the plane bounds. Choose a starting frame in Blender, click **Start Recording**, move the pointers, then click **Stop Recording**. Each take captures location keyframes at scene fps in a new action; the previous action is retained. Stopping turns off live control so you can play or render the recorded animation. Save the .blend to keep it.
