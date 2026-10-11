# URL Autofill

Car-browser helper page (v0.6.3). Open with query params, for example:

`https://plachenko.github.io/url-autofill/?text=hi&r=hello&action=speak`

## Saved media timeline

The full interface is the default. Use the Minimal view button or `u` key to switch views; the choice is saved in this browser and no longer added to the URL. Older `minimal=` links set the saved choice once and are then cleaned up. Use `r=` for the Assistant reply; older `reply=` links still work and are shortened in the address bar. A `text=` URL value still fills the text field. Minimal view puts the current text in `text=`, including when switching from Full view, and updates it when the text changes. Full view removes `text=` from the address bar after reading it. In the full interface, the clip library sits below the text field. Enter a clip ID, choose an image or video file, and select **Save clip**. To save a base64 image or video data URI, put it in the Assistant reply field (or the You said field) and choose **Save data URI**. The assistant reply takes priority when both fields contain a data URI. The button creates a clip ID when none is entered and shows the result beside the controls. Saved clips can be added to compositor tracks below the rendered output; newly saved clips are added to the active track automatically. Drag tiles horizontally to change their start second or vertically to move them between tracks; gaps and overlaps are allowed. Their widths and labels show duration; image clips use Image seconds, and video clips use their metadata duration. The preview shows the bottommost active track. The track area stays within the compositor and scrolls horizontally for long timelines; click its ruler or drag the yellow playhead to scrub by seconds. The slider above it stays synchronized. Choose **Put position in URL** to put the track layout and current second in the address bar. The layout is also saved in localStorage.

Send each base64 chunk in a separate URL to the same browser and origin:

```text
?store=clip1&part=1&total=2&mime=image/png&data=FIRST_BASE64_CHUNK
?store=clip1&part=2&total=2&data=SECOND_BASE64_CHUNK
```

Parts are numbered from 1 and can arrive in any order. `data` can be a raw base64 chunk or start with `data:image/png;base64,`. URL-encode the chunk, especially `+`, `/`, and `=`. For an image, add `seconds=3` to set its display time (default: 3 seconds). A clip can be an `image/*` or `video/*` MIME type. Replacing an existing clip with a different MIME type or part count requires deleting it first.

Play completed clips in order with the existing `?timeline=clip1,clip2` URL or enter `timeline:clip1,clip2` in the text field. The player uses an image or video element, advances when an image's time expires or a video ends, and includes play/pause, item seeking, and fullscreen controls. The compositor URL uses `?tracks=clip1@0,clip2@3|clip3@1&pos=2.50`: commas separate clips within a track, `|` starts another track, `@` sets a clip's start second, and `pos` is the playhead in seconds. Videos start muted to allow autoplay. Use `?delete=clip1` to remove a clip and its chunks. Shared URLs require the same clips to exist in the receiving browser's localStorage.

Chunks are stored in browser `localStorage` for this site's origin. Browser quotas are small, usually only a few megabytes, so this is suited to short clips and images rather than large videos. Private browsing or cleared site data removes the timeline.
