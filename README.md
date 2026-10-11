# URL Autofill

Car-browser helper page (v0.7.0). Open with query params, for example:

`https://plachenko.github.io/url-autofill/?t=hi&r=hello&a=speak`

## Saved media timeline

The full interface is the default. Open the hamburger menu for text fields, saved clips, Minimal view, About, and Help. The fullscreen button stays at the top right. Its choice is saved in this browser; if the browser blocks automatic fullscreen on return, use **Restore fullscreen**. Use the Minimal view button in the menu or the `u` key to switch views; the choice is saved in this browser and never added to the URL. Older `minimal=` links set the saved choice once and are then cleaned up. Short URL parameters are preferred. Older long names still work and are rewritten to short names; if both forms are present, the short form wins. Minimal view puts the current text in `t=` and updates it when the text changes. Full view removes `t=` from the address bar after reading it. In the full interface, the clip library is in the menu below the text field. Enter a clip ID, choose an image or video file, and select **Save clip**. To save a base64 image or video data URI, put it in the Assistant reply field (or the You said field) and choose **Save data URI**. The assistant reply takes priority when both fields contain a data URI. The button creates a clip ID when none is entered and shows the result beside the controls. Saved clips can be added to compositor tracks in the timeline fixed to the bottom of the screen; newly saved clips are added to the active track automatically. Drag tiles horizontally to change their start second or vertically to move them between tracks; gaps and overlaps are allowed. Their widths and labels show duration; image clips use Image seconds, and video clips use their metadata duration. The full-width preview fills the space above the timeline and shows the bottommost active track. Images fit the preview container while preserving their proportions. The track area spans the width of the screen and scrolls for long timelines or multiple tracks; click its ruler or drag the yellow playhead to scrub by seconds. The slider above it stays synchronized. Choose **Put position in URL** to put the track layout and current second in the address bar. The layout is also saved in localStorage.

| Old name | Short name | Old name | Short name |
| --- | --- | --- | --- |
| `text` | `t` | `reply` | `r` |
| `usage` | `u` | `store` | `s` |
| `part` | `p` | `total` | `n` |
| `mime` | `f` | `data` | `d` |
| `seconds` | `h` | `timeline` | `l` |
| `delete` | `x` | `tracks` | `tr` |
| `pos` | `at` | `action` | `a` |
| `speak` | `sp` | `memory` | `m` |
| `clip` | `c` | `delay` | `w` |

Send each base64 chunk in a separate URL to the same browser and origin:

```text
?s=clip1&p=1&n=2&f=image/png&d=FIRST_BASE64_CHUNK
?s=clip1&p=2&n=2&d=SECOND_BASE64_CHUNK
```

Parts are numbered from 1 and can arrive in any order. `d` can be a raw base64 chunk or start with `data:image/png;base64,`. URL-encode the chunk, especially `+`, `/`, and `=`. For an image, add `h=3` to set its display time (default: 3 seconds). A clip can be an `image/*` or `video/*` MIME type. Replacing an existing clip with a different MIME type or part count requires deleting it first.

Play completed clips in order with `?l=clip1,clip2`, or enter `timeline:clip1,clip2` in the text field. The player uses an image or video element, advances when an image's time expires or a video ends, and includes play/pause, item seeking, and fullscreen controls. The compositor URL uses `?tr=clip1@0,clip2@3|clip3@1&at=2.50`: commas separate clips within a track, `|` starts another track, `@` sets a clip's start second, and `at` is the playhead in seconds. Videos start muted to allow autoplay. Use `?x=clip1` to remove a clip and its chunks. Shared URLs require the same clips to exist in the receiving browser's localStorage.

Chunks are stored in browser `localStorage` for this site's origin. Browser quotas are small, usually only a few megabytes, so this is suited to short clips and images rather than large videos. Private browsing or cleared site data removes the timeline.
