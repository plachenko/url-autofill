# URL Autofill

Car-browser helper page (v0.4.0). Open with query params, for example:

`https://plachenko.github.io/url-autofill/?text=hi&reply=hello&action=speak`

## Saved media timeline

Send each base64 chunk in a separate URL to the same browser and origin:

```text
?store=clip1&part=1&total=2&mime=image/png&data=FIRST_BASE64_CHUNK
?store=clip1&part=2&total=2&data=SECOND_BASE64_CHUNK
```

Parts are numbered from 1 and can arrive in any order. `data` can be a raw base64 chunk or start with `data:image/png;base64,`. URL-encode the chunk, especially `+`, `/`, and `=`. For an image, add `seconds=3` to set its display time (default: 3 seconds). A clip can be an `image/*` or `video/*` MIME type. Replacing an existing clip with a different MIME type or part count requires deleting it first.

Play completed clips in order with `?timeline=clip1,clip2`, or enter `timeline:clip1,clip2` in the text field. The player uses an image or video element, advances when an image's time expires or a video ends, and includes play/pause, item seeking, and fullscreen controls. Videos start muted to allow autoplay; use their native controls to unmute. Playback stops after the final item. Use `?delete=clip1` to remove a clip and its chunks.

Chunks are stored in browser `localStorage` for this site's origin. Browser quotas are small, usually only a few megabytes, so this is suited to short clips and images rather than large videos. Private browsing or cleared site data removes the timeline.
