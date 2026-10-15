# TODO

## Replay completed renders after reconnect

The Blender add-on currently sends the latest `render_progress` status to a new WebSocket client but does not resend the rendered file. A reloaded browser can therefore show a complete render bar with no clip if it was disconnected during the file transfer or connected only after the render finished. The page can restore a file it previously verified and saved in that browser, but it cannot recover bytes it never received.

- Locate the Render to WebSocket add-on source and add a bounded cache of the latest completed output file in server mode.
- On a new client connection, send the cached file using the existing `file_start`, `file_chunk`, and `file_end` protocol after the latest render status. Give each replay a fresh transfer ID and retain the original filename and MIME type.
- Keep the cache until a newer completed output replaces it or the add-on stops. Limit its size so a large render cannot exhaust memory; report clearly when replay is unavailable.
- Test reconnects before, during, and after file transfer, including failed checksums and a second render replacing the first.

## Handle pointer positions in the Blender add-on

The Clips → Import touch surface sends JSON over its existing WebSocket connection. The add-on needs a handler for `pointer_positions` messages. Each message contains `phase` (`down`, `move`, `up`, `cancel`, `hover`, or `reset`), `changed` (the pointer that caused the event, or null for `reset`), and `pointers` (all contacts still down after the event). Example:

```json
{"type":"pointer_positions","phase":"move","changed":{"id":9,"x":0.8,"y":0.7,"kind":"touch","pressure":0.5},"pointers":[{"id":5,"x":0.2,"y":0.3,"kind":"touch","pressure":0.5},{"id":9,"x":0.8,"y":0.7,"kind":"touch","pressure":0.5}]}
```

- Treat `x` and `y` as normalized coordinates from the pad's top-left corner, both in `[0, 1]`. `kind` is `touch`, `mouse`, or `pen`; `pressure` is in `[0, 1]`.
- Keep contacts separate by WebSocket client and pointer `id`. Use the full `pointers` array to update simultaneous touches; `up` and `cancel` omit the ended contact from that array.
- Clear a client's contacts on `reset` and whenever its socket closes. `hover` sends a mouse position without an active contact.
- Decide how these coordinates should control a Blender view or tool, and apply Blender API changes on its main thread. Keep this message type separate from render progress and file transfer messages.
- Test two or more simultaneous touches, a cancelled gesture, disconnect during a gesture, and reconnect.
