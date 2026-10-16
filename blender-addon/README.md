# Render to WebSocket — Blender add-on 1.14.0

Transfers completed Blender outputs in verified base64 chunks, replays the latest file after reconnect, and accepts pointer positions from URL Autofill to drive and record Empties.

## Install

Run `python blender-addon/build.py` from the repository root. Install the resulting `blender-addon/render_to_websocket-1.14.0.zip` through Blender Preferences > Add-ons > Install from Disk. Restart Blender after replacing an already loaded version. Blender 4.2+ is targeted; integration tests use Blender 5.2.2.

The vendored pure-Python websockets runtime needs no pip installation. Its BSD license is included in `render_to_websocket/vendor/websockets-17.2.dist-info/licenses/LICENSE`. Original add-on author: Denis Perchenko.

## Connect and guide an Empty

1. Open Output Properties > Render to WebSocket. Keep Server mode and Run server enabled; default endpoint is `ws://127.0.0.1:8765`.
2. Under WebSocket Pointer Control, choose an Origin object in the scene, then select a Target Empty or click Create Target Empty at Origin.
3. Select XY, XZ or YZ and a plane width/height. Pad center maps to the origin's evaluated world position; right is the first positive axis and up is the second. Optional origin rotation turns the plane without scaling its dimensions.
4. Enable pointer control. In URL Autofill, connect through the header favorite controls or Clips > Import, then open the header Pointers overlay. Browser X/Y/Z maps to YZ/XZ/XY respectively. Use browser plane is enabled by default; disable it in Blender to lock the local plane selection. Mouse hover is optional.

Each contact is separate by connection and pointer ID. The first uses the target; additional contacts use pooled extra Empties. Up/cancel/reset/disconnect release ownership and retain the last pose. Scene settings persist in the blend file. All scene changes run on Blender's main thread; movement pauses while rendering. Input is limited to 16 contacts per message, 32 pointer clients and 64 generated extras per scene. Origin and target must be independent. Object constraints or drivers can override transforms.

## Record an animation

1. Set the scene frame rate and choose the current frame where the take should start. Stop timeline playback.
2. Enable pointer control and click Start Recording.
3. Move one or multiple pointers. The timeline advances in real time at `fps / fps_base`; ordinary location keys are sampled on integer frames with linear interpolation. Release, cancelled and temporarily disconnected contacts hold their last recorded pose. Extra Empties are recorded too.
4. Click Stop Recording. Live control turns off, allowing playback and rendering without a stale pointer overriding the take. Set scene range to recording is enabled by default; disable it before starting if you want to retain the larger existing scene range. Recording extends the end frame as needed.
5. Save the blend file. These are normal Blender action/keyframes and work without the add-on or a socket connection. Render Animation uses them normally.

A new take action is assigned to each driven object; the previous action is copied and retained as a separate action with a fake user, preserving its keys. Only location channels are recorded. Existing keys outside the take remain in the copied action. The record buttons do not delete earlier takes. Location-driven objects and NLA tweak mode are rejected. Changing the active scene or scene frame rate, disabling pointer control, loading a blend, starting playback/rendering, or disabling the server/add-on stops recording. Recording itself does not resume automatically after reload.

The browser pointer overlay has an **Auto Keyframe** button. Choose **Pointer down** to insert a location key at each press, **Pointer up** to hold the object during a press and drag then place and key it at release, or **Pointer move** to key each changed pose sampled by Blender. Set **Frames between keyframes** to an integer from 1 to 1000. Each trigger advances Blender's timeline by that many frames; idle time adds no frames or keys. Press the button again to finish the take and disable live pointer control. The compact browser timeline shows Blender's frame range, current frame, and the target Empty's latest 512 location keyframes. Drag its slider to set Blender's current frame while recording is stopped. Pointer up requires add-on 1.13.0 or newer; the other controls require 1.12.0 or newer.

**Axis lock** in the browser offers Free, X, Y, and Z. Choosing an axis moves the controlled Empty only along that axis within the active movement plane and preserves its other coordinates. An axis perpendicular to the plane is disabled. With **Use origin object rotation** enabled, X/Y/Z follow the origin's rotated local axes. Changing the lock ends the current pointer gesture. Axis lock requires add-on 1.14.0 or newer.

Empties do not render themselves. Parent or constrain a visible object to the Empty to use its movement in a rendered animation. Clear Extra Pointer Empties preserves recorded extras, the selected target and origin.

## Render file replay and tunnels

The latest completed output is copied to a temporary disk cache even with no receiver connected. A reconnect receives render status followed by a fresh `file_start/file_chunk/file_end` transfer with original name/MIME and SHA-256 verification. Each receiver verifies independently. Default cache budget is 256 MiB (configurable 1–512 MiB), including snapshots pinned by active replays. Oversized/cache-failed newer outputs invalidate stale replay; live sends still work. Stopping the server clears its cache. For image sequences, enable the existing video conversion or only the last individual frame will be replayed.

Cloudflare controls start/stop only the configured named tunnel process launched by the add-on. Configure your existing tunnel name, config path, public URL and ingress separately; nothing starts automatically. No credentials are bundled.

## Validate

From `blender-addon/`:

```text
python -m unittest -v test_pointers.py test_replay.py test_transfer.py test_tunnel.py
blender --background --factory-startup --python-exit-code 1 --python test_pointers_blender.py
blender --background --factory-startup --python-exit-code 1 --python test_replay_blender.py
blender --background --factory-startup --python-exit-code 1 --python test_recording_blender.py
```

`test_recording_blender.py` verifies fractional fps, multi-touch takes, held poses, preserved actions, linear keys, frame range, save/reload and two actual rendered frames with the add-on disabled. `test_auto_recording_blender.py` is an optional isolated **interactive** timer integration test: run with `blender --factory-startup --python-exit-code 1 --python test_auto_recording_blender.py`. It writes a verification JSON and closes its own test instance when done. Use factory-startup, never an existing working scene. `python -m unittest blender-addon/test_move_recording.py` checks frame spacing and idle behavior without Blender.


## Scene-object discovery (1.10.0)

Blender advertises the active scene's object list as `scene_objects` version 1, including session object IDs, names/types, parent IDs, editability, and the current pointer target/origin/followed object. Lists refresh after changes and on reconnect; `scene_objects_request` returns the current snapshot. Main-thread snapshots are bounded to 4096 objects and broadcast only when changed.

A browser can send `pointer_follow` with a unique request ID and the displayed scene ID/revision/object ID. The selected visible object follows the Empty: an existing compatible rig is preserved, otherwise an Empty is created at the object's bottom-center and the object is parented to it without changing its current world pose. Existing Empties may be used directly. An independent origin helper is created when needed. The optional boolean `enable` controls whether to enable pointer movement; omission preserves the current state. Stale selections, read-only objects, rendering and recording are rejected. Follow roots are not reused as extra-pointer controls or deleted by extra-pointer cleanup.

The browser Pointers overlay shows the scene object hierarchy. Expand a parent, select an editable object, then choose **Attach & enable**. Read-only objects remain visible with their disabled reason. Run `python -m unittest -v test_scene_objects.py` and `blender --background --factory-startup --python-exit-code 1 --python test_scene_objects_blender.py` to validate discovery, socket requests, pose preservation and real object movement.

### WebSocket plane dimensions and viewport bounds

Send `{"type":"pointer_plane_set","request_id":"resize-1","scene_id":"<scene_objects.scene.id>","revision":1,"width":8,"height":6}` using the latest advertised revision. Both dimensions are required, finite numbers from 0.001 to 1,000,000 in Blender world units. Blender replies with `pointer_plane_set_result` (`request_id`, `ok`, and either dimensions/revision or an error message), then advertises updated `scene_objects.pointer.width/height`. Refresh on stale revisions. Changes are rejected while recording or rendering. This uses the existing browser scene-command event bridge.

Select the configured origin, target Empty, or followed object to see the plane outline and center guides in the 3D viewport. Enable viewport Overlays. Bounds follow the origin position, optional local rotation, dimensions, and active browser planes (otherwise the configured Blender plane). The overlay does not appear in renders.


### Run browser-controller integration against Blender

From the repository root (Node.js 22+ and Blender required):

```powershell
python blender-addon/run_browser_tests.py --blender "C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe" --rig "C:\path\to\ball_rig.blend"
```

`--rig` is optional; omit it to generate a simple Ball -> Ball_Deform -> Ball_Control hierarchy. The runner opens only disposable Blender processes and never saves the supplied rig. It checks the actual browser controller, message validation and pointer builder over real sockets, including recording, stale revisions, remote edits and reconnects. It then launches a separate hidden graphical Blender process for an actual CPU render and verifies both browser and server render locks. Generated reports, the small linked-object fixture and transfer image stay in ignored `.browser-e2e/`; the runner stops the processes it starts even when tests fail. Use a graphical desktop for the render-lock phase.

For manual browser UI checks, launch `test_browser_fixture_blender.py` separately with `--port 18781` and connect the development client using `?ws=ws%3A%2F%2F127.0.0.1%3A18781`. That fixture defaults to a 20-minute lifetime; sending its local test command `{"id":"finish","action":"stop"}` to `.browser-e2e/command.json` stops it early. This local file command channel exists only in the test fixture, not in the add-on's WebSocket protocol. Start a fresh fixture before each full controller suite, which intentionally renames/deletes test objects and switches scenes.
