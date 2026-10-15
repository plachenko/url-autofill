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


## Build the browser object selector from Blender advertisements

The selected **scene object follows the control Empty**. It does not become the plane origin or the parent of the Empty. Blender add-on 1.10.0 implements discovery and attachment, and the browser Pointers overlay provides the selector.

### Implemented transport and Blender behavior

- [x] Publish `scene_objects` on connection (when a main-thread snapshot is ready), on metadata/configuration changes, and in reply to `scene_objects_request`. Only the active scene is advertised. The latest render status, when available, precedes the list; normal render/file transfers remain separate.
- [x] Advertise object IDs, names, `object_type`, `parent_id`, `is_control_root`, `can_follow`, and a disabled `reason`, plus current pointer configuration and the X/Y/Z mapping. IDs are session-scoped and survive renames. Scene identity and `revision` prevent stale selections from attaching the wrong object. A scene reload/switch requires a fresh list.
- [x] Handle `pointer_follow` on Blender's main thread. Reuse an existing compatible control hierarchy; otherwise parent the selected object under a new control Empty at its world bottom-center (non-geometric objects use their origin), preserving its current world pose. An existing Empty can be used as the target. Keep an independent plane origin so the control cannot feed back through its own moving object.
- [x] Prevent selection while recording or rendering and reject read-only, stale, missing or invalid targets. Drop pending commands on disconnect. Protect follow roots from extra-pointer reuse and cleanup.
- [x] Route catalog/reply messages through `src/lib/websocket-scene-objects.js` and the existing WebSocket connection rather than showing metadata as a text/file reply.

### Browser UI work

- [x] Add an **Object to animate** selector to the Pointers overlay, populated exclusively from `scene_objects.objects`. Use `id` as the option value and show `name` plus `object_type`; disable entries where `can_follow` is false and expose their `reason`. Do not hard-code Ball, Cube or Empty names.
- [x] Listen for `websocketSceneMessageEvent` (`urlAutofill:websocket-scene-message`). A null detail means disconnected: clear the catalog and disable the selector. On connect/open, dispatch `websocketSceneCommandEvent` (`urlAutofill:websocket-scene-command`) with `{type:"scene_objects_request"}`. `scene_objects_pending` means wait for the first snapshot.
- [x] Build a selection command from the currently displayed scene ID, revision and selected object ID. Use a fresh request ID; optionally send `enable:true` only for an explicit user action that should enable movement. Wait for the matching successful `pointer_follow_result` before treating the selection as attached or starting a new gesture.
- [x] Reflect `pointer.followed_object_id`, `target_id`, `origin_id`, `enabled`, `recording`, `rendering`, and `use_browser_plane` from the advertised state. Keep the header plane buttons consistent: x -> YZ, y -> XZ, z -> XY. When Use browser plane is false, Blender's `pointer.plane` wins.
- [x] Replace options when the scene/revision changes, retain selection by ID through renames, remove deleted options, and display failures. On stale-list failure, request the list again and let the user reselect rather than silently resending an old attachment. Show `total`/`truncated` when only the first 4096 objects are advertised.
- [x] Keep the existing rendered-file preview intact when receiving metadata. Object advertisements contain names/control metadata, not mesh geometry; rendered images/movies still arrive through the existing file protocol.
- [ ] Validate end to end: select Ball from the saved rig without breaking Ball -> Ball_Deform -> Ball_Control, select an ordinary mesh without a rig, confirm the pose is unchanged at attachment and pointer movement moves the visible object, then test reconnect, rename/deletion, scene switch, recording lock and read-only entries.

### Wire examples

Server advertisement (additional metadata fields are allowed):

```json
{"type":"scene_objects","version":1,"revision":4,"scene":{"id":"scene-session-id","name":"Scene"},"objects":[{"id":"object-123","name":"Ball","object_type":"MESH","parent_id":null,"is_control_root":false,"can_follow":true,"reason":""}],"total":1,"truncated":false,"pointer":{"origin_id":null,"target_id":null,"followed_object_id":null,"enabled":false,"use_browser_plane":true,"plane":"XY","width":6,"height":2,"recording":false,"rendering":false},"planes":{"x":"YZ","y":"XZ","z":"XY"},"capabilities":["pointer_follow","pointer_plane_set","scene_objects_request"]}
```

Browser selection:

```json
{"type":"pointer_follow","request_id":"pick-unique-id","scene_id":"scene-session-id","revision":4,"object_id":"object-123","enable":true}
```

Server response (a refreshed catalog is also broadcast after a change):

```json
{"type":"pointer_follow_result","request_id":"pick-unique-id","ok":true,"scene_id":"scene-session-id","revision":5,"object_id":"object-123","target_id":"object-456","origin_id":"object-789","already_following":false,"enabled":true,"message":"Ball follows WebSocket Control - Ball"}
```

Failures use the same response type/request ID with `ok:false` and `message`. Discovery is capped at 4096 objects; pending scene commands (follow and plane sizing combined) at one per connection and 32 total. Metadata refreshes on the main thread at up to 2 Hz and only changed snapshots are broadcast. Tests: `test_scene_objects.py`, `test_scene_objects_blender.py`, and `test/websocket-scene-objects.test.js`.

### Browser plane size controls

The Blender backend is implemented in add-on 1.10.0. The browser Pointers overlay provides width/height controls through the existing WebSocket transport.

- [x] Add width/height inputs populated from `scene_objects.pointer.width/height`; send `pointer_plane_set` with both dimensions, fresh request ID, scene ID and latest revision through `urlAutofill:websocket-scene-command`.
- [x] Handle `pointer_plane_set_result` through `urlAutofill:websocket-scene-message`; display errors and refresh stale metadata. Disable editing while recording/rendering. Dimensions are finite Blender world units in [0.001, 1000000].
- [x] Blender accepts validated dimension changes on its main thread, acknowledges them, and advertises updated sizes.
- [x] Show plane bounds when the origin, target Empty, or followed object is selected in Blender, respecting local rotation and browser plane mapping.

- [x] Show size controls only when `scene_objects.capabilities` includes `pointer_plane_set`. For older servers without discovery/capabilities, keep the existing pointer overlay usable and explain that remote sizing needs the updated add-on.
- [x] Label the fields **Plane width** and **Plane height** in Blender world units. Width spans pad left/right; height spans pad down/up. The plane is centered on the origin, so its bounds are +/- width/2 and +/- height/2. Do not interpret these values as screen pixels or apply the origin object's scale.
- [x] Keep draft input separate from confirmed server values. Validate both finite numeric values in [0.001, 1000000]; an empty field, NaN, Infinity or out-of-range number must not send a command. Prefer an explicit Apply action; do not send on every keystroke.
- [x] Serialize attachment and resizing together: the server permits only one pending scene command per connection (32 total). Disable Apply/selection while waiting; correlate responses by request ID and ignore late replies from a previous connection/scene. Set a bounded timeout, then refresh state and show an actionable error rather than leaving controls stuck or silently retrying.
- [x] Before applying a size, end/reset the local gesture and send `pointer_positions` with `phase:"reset"`, `changed:null`, and `pointers:[]` through the existing pointer sender. Pause new pointer sends until the command settles. Blender clears pointer snapshots/bindings after a successful configuration change; require a fresh gesture so existing contacts cannot jump unexpectedly under the new scale.
- [x] Read confirmed dimensions and the latest revision from every catalog, including edits made in Blender or by another client. Do not overwrite an unsent draft silently; identify a conflicting remote update and let the user reload/reapply explicitly. A resize can invalidate the revision held by the object selector, and an attachment can invalidate a pending size draft's revision.
- [x] Treat the matching successful result as acknowledgement; reconcile with the catalog regardless of which arrives first. On failure preserve confirmed values and show `message`. On a stale revision fetch `scene_objects_request` and require a fresh Apply. Never send a stored command automatically after reconnect or scene change.
- [x] Explain viewport visibility near the controls/help: select the configured origin, target Empty, or followed object in Blender and enable viewport Overlays to see the plane bounds. Browser sizing does not select Blender objects. With Use browser plane enabled, active browser planes determine the outline; otherwise Blender's configured plane wins.
- [ ] Test browser-to-Blender resizing for X/Y/Z, local origin rotation, edits from Blender/another client, pending attachment versus Apply, invalid input, recording/rendering locks, stale revisions, disconnect/reconnect, scene switch, and timeout. Verify width/height acknowledgements and catalogs never replace the rendered-file preview, active gestures reset safely, and viewport bounds match the resulting movement range.

Resize request (use the **latest** advertised scene ID/revision):

```json
{"type":"pointer_plane_set","request_id":"size-unique-id","scene_id":"scene-session-id","revision":5,"width":8,"height":6}
```

Successful response (updated `scene_objects` is also broadcast):

```json
{"type":"pointer_plane_set_result","request_id":"size-unique-id","ok":true,"scene_id":"scene-session-id","revision":6,"width":8,"height":6}
```

Failure response (scene ID/revision may also be present):

```json
{"type":"pointer_plane_set_result","request_id":"size-unique-id","ok":false,"message":"Plane settings changed; refresh scene_objects and try again"}
```

The browser controls use `src/lib/pointer-scene-session.js` for discovery, revision and request tracking, remote edit conflicts, and command timeouts. Browser protocol and controller tests: `test/websocket-scene-objects.test.js` and `test/pointer-scene-session.test.js`. Backend tests: `blender-addon/test_scene_objects.py`, `blender-addon/test_plane_blender.py`, and `blender-addon/test_plane_view_blender.py`. The unchecked end-to-end items require a browser connected to Blender; Blender is not installed in this development environment.
