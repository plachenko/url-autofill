# URL Autofill

Car-browser helper page (v0.7.0), built with SvelteKit and `adapter-static`. Open with query params, for example:

`https://plachenko.github.io/url-autofill/?t=hi&r=hello&a=speak`

## Develop and build

Run `npm install`, then `npm run dev`. Use `npm run check` to check the Svelte components and `npm run build` for a root-path static build in `build/`. For this repository's GitHub Pages path, run `npm run build:pages`. The included workflow builds and publishes `build/` on pushes to `main`; set the repository's Pages source to **GitHub Actions**. The build includes `.nojekyll` so GitHub Pages serves SvelteKit's `_app` assets. The previous single-file version is preserved in `legacy/index.html` for reference.

The UI is divided into controls, clip library, preview, screenplay, minimal display, and timeline components under `src/lib/components/`. URL parsing and clip storage live in separate modules. The existing playback and editing controller remains in `src/lib/legacy-controller.js` while the browser interactions are moved over incrementally. Drag the bar between the preview and timeline to resize them; PaneForge saves the layout in this browser.

The menu has a WebSocket client. Enter a `ws://` or `wss://` server URL, connect, type text, and choose **Send text**. **Return text** shows the latest server message. A link such as `?ws=wss%3A%2F%2Fexample.com%2Fsocket&wsText=hello` connects automatically and prefills the outgoing text; sending still requires the menu button. Browsers may require `wss://` when this page is served over HTTPS.

Use `?m=e` for the timeline editor or `?m=sp` for a screenplay writing view. The full values `m=editor` and `m=screenplay` work too. Both modes edit the same saved text. `m` previously meant memory; older `m=` memory links still work unless their value is one of these mode names. Use `memory=` to set or clear memory alongside a mode, for example `?m=sp&memory=Draft` or `?memory=`.

In a parked Tesla, open the menu and choose **Tesla Theater fullscreen** to return to this page through YouTube's Theater redirect. YouTube may ask you to choose **Go to site**. The redirect keeps the current mode but removes other URL query values so text and media data are not sent to YouTube; content already saved in this browser is restored when the page returns. This is separate from the standard page fullscreen button and depends on Tesla and YouTube continuing to allow the redirect.

## Saved media timeline

The full interface is the default. Open the hamburger menu for text fields, saved clips, Minimal view, About, and Help. The fullscreen button stays at the top right. Its choice is saved in this browser; if the browser blocks automatic fullscreen on return, use **Restore fullscreen**. Use the Minimal view button in the menu or the `u` key to switch views; the choice is saved in this browser and never added to the URL. Older `minimal=` links set the saved choice once and are then cleaned up. Short URL parameters are preferred. Older long names still work and are rewritten to short names; if both forms are present, the short form wins. Minimal view puts the current text in `t=` and updates it when the text changes. Full view removes `t=` from the address bar after reading it. In the full interface, the clip library is in the menu below the text field. Enter a clip ID, choose an image or video file, and select **Save clip**. To save a base64 image or video data URI, put it in the Assistant reply field (or the You said field) and choose **Save data URI**. The assistant reply takes priority when both fields contain a data URI. The button creates a clip ID when none is entered and shows the result beside the controls. Saved clips can be added to compositor tracks in the timeline fixed to the bottom of the screen; newly saved clips are added to the active track automatically. Drag tiles horizontally to change their start second or vertically to move them between tracks; gaps and overlaps are allowed. Their widths and labels show duration; image clips use Image seconds, and video clips use their metadata duration. The full-width preview fills the space above the timeline and shows the bottommost active track. Images fit the preview container while preserving their proportions. The track area spans the width of the screen and scrolls for long timelines or multiple tracks; click its ruler or drag the yellow playhead to scrub by seconds. The slider above it stays synchronized. Choose **Put position in URL** to put the track layout and current second in the address bar. The layout is also saved in localStorage.

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
