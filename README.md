# URL Autofill

Car-browser helper page (v0.5.0). Open with query params, for example:

`https://plachenko.github.io/url-autofill/?text=hi&reply=hello&action=speak`

## Saved media timeline

The full interface is the default. Use the Minimal view button or `u` key to switch views; the choice is saved in this browser. `?minimal=0` and `?minimal=1` override the saved choice for that URL. In the full interface, the clip library sits below the text field. Enter a clip ID, choose an image or video file, and select **Save clip**. To save a base64 image or video data URI, put it in the Assistant reply field (or the You said field) and choose **Save data URI**. The assistant reply takes priority when both fields contain a data URI. The button creates a clip ID when none is entered and shows the result beside the controls. Select clips in the list and choose **Play selected clips** to render them in order. The library also shows clips assembled through the URL interface and lets you delete them.

Send each base64 chunk in a separate URL to the same browser and origin:

```text
?store=clip1&part=1&total=2&mime=image/png&data=FIRST_BASE64_CHUNK
?store=clip1&part=2&total=2&data=SECOND_BASE64_CHUNK
```

Parts are numbered from 1 and can arrive in any order. `data` can be a raw base64 chunk or start with `data:image/png;base64,`. URL-encode the chunk, especially `+`, `/`, and `=`. For an image, add `seconds=3` to set its display time (default: 3 seconds). A clip can be an `image/*` or `video/*` MIME type. Replacing an existing clip with a different MIME type or part count requires deleting it first.

Play completed clips in order with `?timeline=clip1,clip2`, or enter `timeline:clip1,clip2` in the text field. The player uses an image or video element, advances when an image's time expires or a video ends, and includes play/pause, item seeking, and fullscreen controls. Videos start muted to allow autoplay; use their native controls to unmute. Playback stops after the final item. Use `?delete=clip1` to remove a clip and its chunks.

Chunks are stored in browser `localStorage` for this site's origin. Browser quotas are small, usually only a few megabytes, so this is suited to short clips and images rather than large videos. Private browsing or cleared site data removes the timeline.
