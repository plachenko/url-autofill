# TODO

## Replay completed renders after reconnect

The issue addressed: the Blender add-on previously sent the latest `render_progress` status to a new WebSocket client but did not resend the rendered file. A reloaded browser can therefore show a complete render bar with no clip if it was disconnected during the file transfer or connected only after the render finished. The page can restore a file it previously verified and saved in that browser, but it cannot recover bytes it never received.

- [x] Locate the Render to WebSocket add-on source and add a bounded cache of the latest completed output file in server mode.
- [x] On a new client connection, send the cached file using the existing `file_start`, `file_chunk`, and `file_end` protocol after the latest render status. Give each replay a fresh transfer ID and retain the original filename and MIME type.
- [x] Keep the cache until a newer completed output replaces it or the add-on stops. Limit its size so a large render cannot exhaust memory; report clearly when replay is unavailable.
- [x] Test reconnects before, during, and after file transfer, including failed checksums and a second render replacing the first.

Implemented locally in the `blender-addon/render_to_websocket` Blender add-on, version 1.7.0. It uses a temporary disk snapshot (256 MiB by default, configurable up to 512 MiB), including active replay readers in the budget. Each receiver transfers/verifies independently. Oversize/cache failures invalidate stale output and report replay unavailable. Build the installer with `python blender-addon/build.py`.

Validated with `python -m unittest -v test_replay.py test_transfer.py test_tunnel.py` from `blender-addon/`, factory-startup Blender render/reconnect tests, and an interactive automatic-completion test. No public tunnel startup was performed.

## Handle pointer positions in the Blender add-on

The header Pointers button opens a capture overlay across the preview and timeline while connected. The add-on needs a handler for its `pointer_positions` messages. Each message contains `plane` (`x`, `y`, or `z`), `phase` (`down`, `move`, `up`, `cancel`, `hover`, or `reset`), `changed` (the pointer that caused the event, or null for `reset`), and `pointers` (all contacts still down after the event). Example:

```json
{"type":"pointer_positions","phase":"move","plane":"z","changed":{"id":9,"x":0.8,"y":0.7,"kind":"touch","pressure":0.5},"pointers":[{"id":5,"x":0.2,"y":0.3,"kind":"touch","pressure":0.5},{"id":9,"x":0.8,"y":0.7,"kind":"touch","pressure":0.5}]}
```

- [x] Treat pointer `x` and `y` as normalized coordinates from the overlay's top-left corner, both in `[0, 1]`. `kind` is `touch`, `mouse`, or `pen`; `pressure` is in `[0, 1]`.
- [x] Map `plane: "x"` to Blender's YZ plane, `"y"` to XZ, and `"z"` to XY. Z is selected by default. Clear contacts for the previous plane on `reset` when the user changes planes or closes the overlay.
- [x] Keep contacts separate by WebSocket client and pointer `id`. Use the full `pointers` array to update simultaneous touches; `up` and `cancel` omit the ended contact from that array.
- [x] Clear a client's contacts on `reset` and whenever its socket closes. `hover` sends a mouse position without an active contact.
- [x] Decide how these coordinates should control a Blender view or tool, and apply Blender API changes on its main thread. Keep this message type separate from render progress and file transfer messages.
- [x] Test two or more simultaneous touches, a cancelled gesture, disconnect during a gesture, and reconnect.

Implemented in Blender add-on 1.8.0. In Output Properties > Render to WebSocket > WebSocket Pointer Control, select the origin object, select or create the target Empty, choose plane dimensions, then enable control. Browser X/Y/Z plane selection is honored by default (x -> YZ, y -> XZ, z -> XY); disable Use browser plane to lock the Blender XY/XZ/YZ selection. The pad center maps to the origin; pad up maps to the second positive axis. Optional origin rotation rotates that plane without scaling its dimensions. The first active contact uses the target Empty and each additional contact/client uses a separate generated Empty. Contacts release on up/cancel/reset/disconnect; last positions remain and generated extras are reused. Mouse hover can move the target when no contact is down. Scene settings persist in the blend file. Socket threads only validate/store bounded snapshots; a main-thread timer applies transforms and pauses movement during rendering.

Validated with `test_pointers.py` (protocol and actual sockets) and `test_pointers_blender.py` (actual Empty transforms, all three planes, rotated/moving origin, parented target, opt-in, fast taps, save/reload, cancellation, disconnect/reconnect, and thread guard). Installer: `blender-addon/build.py`.

### Browser X/Y/Z plane follow-up

- [ ] With the built add-on installed, connect the browser and select X, Y, then Z in the Pointers overlay. Confirm the target Empty moves on YZ, XZ, then XY, using the configured plane width and height.
- [ ] Switch planes during an active multi-touch gesture and during a recording. Confirm the old plane's contacts reset, the next contacts use the newly selected plane, and the recorded keyframes contain no stale movement from the previous plane.
- [ ] Repeat with **Use browser plane** disabled and confirm the Blender plane selection remains in control for all three browser buttons.

## Record pointer movement as animation

- [x] Start/Stop Recording controls in Blender capture all pointer-driven Empties as normal location keyframes, starting at the current frame and using scene fps/fps_base.
- [x] Each take uses a new action; any previous action remains preserved. Linear samples include release/idle holds. Stopping disables live control and optionally sets the scene render range to the take.
- [x] Keep recorded extra Empties when clearing unused generated Empties.
- [x] Verify ordinary playback, saved/reloaded animation, and actual rendering with the add-on disabled, plus real-time socket/timer recording.

Implemented in add-on 1.9.0. Source, vendored WebSocket runtime/license, regression tests and installer builder are now tracked under `blender-addon/`. See its README for usage and test commands.
