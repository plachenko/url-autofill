bl_info = {
    "name": "Render to WebSocket",
    "author": "Denis Perchenko",
    "version": (1, 10, 0),
    "blender": (4, 2, 0),
    "location": "Edit > Preferences > Add-ons; Render menu > Send Last Render to WebSocket",
    "description": "Transfers completed render files as verified base64 chunks over WebSocket",
    "category": "Render",
}

import bpy, os, sys, base64, tempfile, threading, time
import asyncio, json, atexit
import concurrent.futures
from .transfer import transfer
from .tunnel import ConfiguredTunnel, find_cloudflared

TUNNEL = ConfiguredTunnel()

PROGRESS = {"sent": 0, "total": 0, "status": "Idle"}
TRANSFER_LOCK = threading.Lock()

def _progress(sent, total, status):
    PROGRESS.update(sent=sent, total=total, status=status)

def _refresh_progress():
    _tag_redraw()
    return 0.25
import re, glob, shutil, subprocess

VERSION_STR = "Render to WebSocket v1.10.0"

_HERE = os.path.dirname(os.path.abspath(__file__))
_VENDOR = os.path.join(_HERE, "vendor")
if os.path.isdir(_VENDOR) and _VENDOR not in sys.path:
    sys.path.insert(0, _VENDOR)

FORMATS = {  # file_format -> (extension, MIME)
    'PNG': ('.png', 'image/png'), 'JPEG': ('.jpg', 'image/jpeg'), 'JPEG2000': ('.jp2', 'image/jp2'),
    'OPEN_EXR': ('.exr', 'image/x-exr'), 'OPEN_EXR_MULTILAYER': ('.exr', 'image/x-exr'),
    'TIFF': ('.tif', 'image/tiff'), 'BMP': ('.bmp', 'image/bmp'), 'TARGA': ('.tga', 'image/x-tga'),
    'TARGA_RAW': ('.tga', 'image/x-tga'), 'HDR': ('.hdr', 'image/vnd.radiance'), 'WEBP': ('.webp', 'image/webp'),
    'AVIF': ('.avif', 'image/avif'), 'DPX': ('.dpx', 'image/x-dpx'), 'CINEON': ('.cin', 'image/x-cineon'),
    'IRIS': ('.rgb', 'image/x-rgb'),
}
MOVIE = {'FFMPEG', 'AVI_JPEG', 'AVI_RAW'}


def fmt_info(fmt, path=None):
    if fmt in FORMATS:
        return FORMATS[fmt]
    ext = os.path.splitext(path)[1] if path else '.bin'
    return (ext, 'application/octet-stream')


LOG = []  # (time, target, ok, info) of recent sends, for tests / debugging


def _log(*a):
    print("[render_to_websocket]", *a)


def _record(target, ok, info):
    LOG.append((time.time(), target, ok, info))
    del LOG[:-50]
    _log(target, ("OK" if ok else "FAIL"), info)
    _tag_redraw()


def _tag_redraw():
    if threading.current_thread() is not threading.main_thread():
        return
    try:
        for w in bpy.context.window_manager.windows:
            for a in w.screen.areas:
                if a.type in {'PREFERENCES', 'PROPERTIES'}:
                    a.tag_redraw()
    except Exception:
        pass


# ---------------------------------------------------------------- server mode
from .pointer_control import (PointerController, RTWS_PointerSettings, RTWS_OT_pointer_empty,
                              RTWS_OT_clear_pointer_empties, draw_pointer_settings)
POINTER = PointerController()
from .recording import PointerRecorder, RTWS_OT_record_start, RTWS_OT_record_stop
RECORDER = PointerRecorder()
from .scene_objects import SceneObjectCatalog
SCENE_OBJECTS = SceneObjectCatalog()
from .server import RenderServer
SERVER = RenderServer(progress=_progress, record=_record, redraw=_tag_redraw,
                      stop_tunnel=TUNNEL.stop)


def _scene_objects_tick():
    try:
        scene = bpy.context.scene
        if scene is None or not SERVER.running:
            return .5
        rendering = bpy.app.is_job_running('RENDER')
        SCENE_OBJECTS.refresh(scene, RECORDER.running, rendering)
        for client, request in SERVER.object_requests.drain():
            try:
                if bpy.app.is_job_running('RENDER'):
                    raise ValueError('Finish rendering before changing the followed object')
                operation = SCENE_OBJECTS.set_plane if request.get('type') == 'pointer_plane_set' else SCENE_OBJECTS.follow
                result = operation(scene, request, RECORDER.running)
                SERVER.pointers.clear()
                POINTER.reset()
            except Exception as exc:
                result = dict(type=request.get('type', 'pointer_follow') + '_result', request_id=request['request_id'], ok=False,
                              message=str(exc), scene_id=SCENE_OBJECTS.scene_id, revision=SCENE_OBJECTS.revision)
            SERVER.publish_scene_objects(SCENE_OBJECTS.refresh(scene, RECORDER.running, rendering))
            SERVER.reply_scene_object(client, result)
        SERVER.publish_scene_objects(SCENE_OBJECTS.refresh(scene, RECORDER.running, rendering))
    except Exception as exc:
        _log('Scene object advertisement failed:', str(exc))
    return .5


def _pointer_tick():
    try:
        scene = bpy.context.scene
        if scene is None:
            return .1
        if not SERVER.running:
            RECORDER.stop(reason='Recording stopped: server stopped')
            POINTER.reset()
            POINTER.status = 'Start the WebSocket server for pointer control'
        elif bpy.app.is_job_running('RENDER'):
            RECORDER.stop(reason='Recording stopped: render started')
            POINTER.status = 'Pointer movement paused while rendering'
        else:
            if RECORDER.running and bpy.context.screen and bpy.context.screen.is_animation_playing:
                RECORDER.stop(reason='Recording stopped: timeline playback started')
            RECORDER.advance(scene)
            depsgraph = bpy.context.evaluated_depsgraph_get() if scene.rtws_pointer.enabled else None
            POINTER.tick(SERVER.pointers, scene, depsgraph)
            RECORDER.capture(POINTER.driven)
            if POINTER.moved:
                for window in bpy.context.window_manager.windows:
                    for area in window.screen.areas:
                        if area.type == 'VIEW_3D':
                            area.tag_redraw()
    except Exception as exc:
        RECORDER.stop(reason='Recording stopped: ' + str(exc))
        POINTER.reset()
        POINTER.status = 'Pointer control: ' + str(exc)
    return 1 / 60


@bpy.app.handlers.persistent
def _pointer_load_reset(*args):
    RECORDER.stop(reason='Recording stopped: loading a blend file')
    SCENE_OBJECTS.reset()
    SERVER.clear_scene_objects()
    SERVER.pointers.clear()
    POINTER.reset()


def apply_mode(prefs=None):
    p = prefs or get_prefs()
    if p is None:
        return
    if p.mode == 'SERVER' and p.server_on:
        limit = getattr(p, 'replay_cache_mb', 256) * 1024 * 1024
        if not (SERVER.running and SERVER.host == p.host and SERVER.port == p.port and SERVER.cache_bytes == limit):
            SERVER.cache_bytes = limit
            SERVER.start(p.host, p.port)
    else:
        SERVER.stop()


def _upd(self, context):
    apply_mode(self)


# ---------------------------------------------------------------- client mode
def _send_worker(url, payload, label):
    import asyncio
    try:
        from websockets.asyncio.client import connect
    except ImportError:
        try:
            from websockets import connect
        except ImportError as e:
            _record(url, False, f"websockets not available: {e}"); return

    async def go():
        async with connect(url, open_timeout=15, max_size=None, close_timeout=5) as ws:
            await ws.send(payload)
            echo_len = None
            end = time.time() + 15
            while time.time() < end:
                try:
                    m = await asyncio.wait_for(ws.recv(), timeout=max(0.1, end - time.time()))
                except Exception:
                    break
                if isinstance(m, str) and m.startswith("ok: "):
                    echo_len = m
                    break
            return echo_len

    try:
        echo_len = asyncio.run(go())
        _record(url, True, f"sent {len(payload)} chars ({label}); ack={echo_len!r}")
    except Exception as e:
        _record(url, False, "send failed: " + repr(e))


def send_file(path, label=None, wait=False, mime=None, _config=None):
    if _config is None:
        p = get_prefs()
        _config = (p.mode if p else 'SERVER', p.url if p else '')
    mode, url = _config
    # Server publication snapshots the output even with no connected clients.
    # Replays use per-connection locks and never block publication of a newer file.
    if mode == 'SERVER':
        try:
            future = SERVER.send_file(path, mime=mime)
        except Exception as exc:
            _progress(0, 0, 'Failed: ' + str(exc))
            return None
        def server_worker():
            try:
                future.result()
            except concurrent.futures.CancelledError:
                pass  # Server stop deliberately cancels in-flight transfers.
            except Exception as exc:
                _progress(0, 0, 'Failed: ' + str(exc))
                _log(PROGRESS['status'])
        thread = threading.Thread(target=server_worker, daemon=True)
        thread.start()
        if wait:
            thread.join()
        return thread
    if not TRANSFER_LOCK.acquire(blocking=False):
        _log('Transfer busy; skipped', path)
        return None
    _progress(0, os.path.getsize(path), 'Starting')
    def worker():
        try:
            async def go():
                from websockets.asyncio.client import connect
                async with connect(url, max_size=None, open_timeout=15) as ws:
                    identity = await transfer(path, [ws], _progress, mime=mime)
                    deadline = time.monotonic() + 60
                    while True:
                        reply = json.loads(await asyncio.wait_for(ws.recv(), max(.1, deadline - time.monotonic())))
                        if reply.get('type') == 'file_ack' and reply.get('id') == identity:
                            if not reply.get('ok'):
                                raise RuntimeError(reply.get('error', 'Receiver rejected file'))
                            _progress(PROGRESS['sent'], PROGRESS['total'], 'Complete: receiver verified')
                            break
                        if time.monotonic() >= deadline:
                            raise TimeoutError('Receiver did not acknowledge file')
            asyncio.run(go())
            _log('File sent:', path)
        except Exception as exc:
            _progress(PROGRESS['sent'], PROGRESS['total'], 'Failed: ' + str(exc))
            _log(PROGRESS['status'])
        finally:
            TRANSFER_LOCK.release()
    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    if wait:
        thread.join()
    return thread


def save_render_result(scene=None):
    img = bpy.data.images.get("Render Result")
    if img is None:
        return (None, None)
    scene = scene or bpy.context.scene
    s = scene.render.image_settings
    fmt = s.file_format
    is_img = getattr(s, "media_type", 'IMAGE') == 'IMAGE' and fmt not in MOVIE
    if not is_img:
        fmt = 'PNG'  # movie output configured: send the still as PNG
    ext, mime = fmt_info(fmt)
    path = os.path.join(tempfile.gettempdir(), "render_to_websocket_last" + ext)
    try:
        os.remove(path)  # never send a stale file from a previous render
    except OSError:
        pass
    old = (getattr(s, "media_type", None), s.file_format)
    try:
        if not is_img:
            if old[0] is not None:
                s.media_type = 'IMAGE'
            s.file_format = 'PNG'
        img.save_render(path, scene=scene)
    finally:
        if not is_img:
            if old[0] is not None:
                s.media_type = old[0]
            try:
                s.file_format = old[1]
            except Exception:
                pass
    return (path, mime) if os.path.exists(path) else (None, None)


def get_prefs():
    try:
        return bpy.context.preferences.addons[__package__ or __name__].preferences
    except Exception:
        return None


MP4 = {"status": "", "last": None}
_state = {"frames": 0, "anim": False, "seq": [], "seq_scene": None}
MP4 = {"status": "", "last": None}  # last: dict describing the last finished sequence


def _is_anim_still_output(scene):
    s = scene.render.image_settings
    return getattr(s, "media_type", 'IMAGE') == 'IMAGE'


@bpy.app.handlers.persistent
def on_render_write(scene, *args):
    p = get_prefs()
    if not (p and p.enabled):
        return
    path = bpy.path.abspath(scene.render.frame_path(frame=scene.frame_current))
    if path not in _state['paths']:
        _state['paths'].append(path)


_render = {}


def _render_message(scene, state='Rendering'):
    if not _render:
        return
    count = len(_render['done'])
    total = _render['total']
    if state == 'Complete':
        total = count or 1
        count = total
    SERVER.publish_render(dict(type='render_progress', id=_render['id'], state=state,
        scene=scene.name, frame=scene.frame_current, completed=count, total=total,
        elapsed=max(0, time.monotonic() - _render['started'])))


@bpy.app.handlers.persistent
def on_render_pre(scene, *args):
    _render_message(scene)


@bpy.app.handlers.persistent
def on_render_post(scene, *args):
    if not _render:
        return
    _render['done'].add(scene.frame_current)
    # Blender handlers do not reliably expose the render operator's animation
    # flag. Only claim an animation percentage after multiple frames finish.
    if len(_render['done']) > 1:
        _render['total'] = max(len(_render['done']), len(range(scene.frame_start,
            scene.frame_end + 1, max(1, scene.frame_step))))
    _render_message(scene)


@bpy.app.handlers.persistent
def on_render_init(scene, *args):
    _state['paths'] = []
    _state['seq'] = []
    import uuid
    _render.clear()
    _render.update(id=uuid.uuid4().hex, started=time.monotonic(), done=set(), total=None)
    _render_message(scene)


@bpy.app.handlers.persistent
def on_render_complete(scene, *args):
    _render_message(scene, 'Complete')
    p = get_prefs()
    if not (p and p.enabled):
        return
    movie = scene.render.image_settings.file_format in MOVIE or getattr(scene.render.image_settings, 'media_type', 'IMAGE') == 'VIDEO'
    paths = list(_state['paths'])
    if movie:
        paths = [bpy.path.abspath(scene.render.frame_path(frame=scene.frame_start))]
    MP4['last_frames'] = paths
    MP4['last_scene'] = scene.name
    config = (p.mode, p.url)
    # Movie writers finish closing their output after the completion handler.
    # Defer file access until Blender returns to its event loop.
    def dispatch():
        existing = [path for path in paths if os.path.isfile(path)]
        # F12 still renders don't write an output file or fire render_write.
        # Materialize the completed Render Result on the main thread before
        # passing the file to the background chunk sender.
        if not movie and not paths:
            try:
                saved = save_render_result(scene)
                if saved and saved[0]:
                    existing = [saved[0]]
            except Exception as exc:
                _progress(0, 0, 'Failed to save completed render: ' + str(exc))
                return None
        if not movie and len(existing) > 1 and p.make_mp4:
            start_mp4_for(scene, existing, p)
            return None
        if not existing:
            _progress(0, 0, 'No completed output file. Save the render, then use Send File.')
            return None
        def batch():
            for path in existing:
                send_file(path, wait=True, _config=config)
        threading.Thread(target=batch, daemon=True).start()
        return None
    if bpy.app.background:
        _log('Background mode: call send_file(output_path, wait=True) after bpy.ops.render.render returns; automatic sending requires the interactive event loop')
    else:
        bpy.app.timers.register(dispatch, first_interval=1.0)


def _set_status(msg):
    MP4["status"] = msg
    _record("mp4", not msg.startswith(("FAIL", "error")), msg)


VIDEO = {  # container -> (extension, MIME)
    'MP4': ('.mp4', 'video/mp4'), 'M4V': ('.m4v', 'video/mp4'), 'MKV': ('.mkv', 'video/x-matroska'),
    'WEBM': ('.webm', 'video/webm'), 'MOV': ('.mov', 'video/quicktime'), 'AVI': ('.avi', 'video/x-msvideo'),
    'GIF': ('.gif', 'image/gif'),
}
VIDEO_BY_EXT = {v[0]: k for k, v in VIDEO.items()}


def _is_real_exe(p):
    """True for a regular, non-empty, non-reparse-point Windows PE (or any executable file elsewhere)."""
    try:
        if not p or not os.path.isfile(p):
            return False
        st = os.lstat(p)
        if st.st_size == 0 or os.path.islink(p):
            return False
        if getattr(st, "st_file_attributes", 0) & 0x400:  # FILE_ATTRIBUTE_REPARSE_POINT (app-exec alias)
            return False
        if os.name == "nt":
            with open(p, "rb") as f:
                return f.read(2) == b"MZ"
        return os.access(p, os.X_OK)
    except OSError:
        return False


FF_NOTE = {"msg": ""}


def find_ffmpeg(pref=""):
    FF_NOTE["msg"] = ""
    if pref:
        p = os.path.normpath(bpy.path.abspath(pref))
        if _is_real_exe(p):
            return p
        FF_NOTE["msg"] = f"FFmpeg path pref ignored (not an executable): {p}"
    la = os.environ.get("LOCALAPPDATA", "")
    cands = sorted(glob.glob(os.path.join(la, "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg*", "**", "bin", "ffmpeg.exe"),
                             recursive=True), reverse=True)
    w = shutil.which("ffmpeg")
    if w:
        cands.append(w)
        cands.append(os.path.realpath(w))
    cands += [os.path.join(la, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
              r"C:\ffmpeg\bin\ffmpeg.exe", r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"]
    for c in cands:
        for x in (c, os.path.realpath(c)):
            if _is_real_exe(x):
                return os.path.normpath(x)
    return None


def _container(scene, p=None):
    """(container key, extension, MIME): a video extension in render.filepath wins, else the pref."""
    fp = scene.render.filepath.lower()
    for ext, key in VIDEO_BY_EXT.items():
        if fp.endswith(ext):
            return key, ext, VIDEO[key][1]
    key = getattr(p, "video_container", 'MP4') if p else 'MP4'
    key = key if key in VIDEO else 'MP4'
    return key, VIDEO[key][0], VIDEO[key][1]


def sequence_job(scene, frames, p=None):
    """Collect everything ffmpeg needs (main thread only: touches bpy).
    The input pattern is derived from the frame files actually written, so it works even if the
    scene was changed/deleted or render.filepath carries a video extension (Blender then writes e.g. shot_0001.mkv.png)."""
    r = scene.render
    key, vext, mime = _container(scene, p)
    if frames:
        f0 = os.path.normpath(bpy.path.abspath(frames[0]))
        d, b = os.path.split(f0)
        mnum = list(re.finditer(r"\d+", b))
        if not mnum:
            raise ValueError(f"cannot find a frame number in {b}")
        mm = mnum[-1]
        start = int(mm.group()); n = len(mm.group())
        pattern = b[:mm.start()] + "%0" + str(n) + "d" + b[mm.end():]
        stem_src = b[:mm.start()] + b[mm.end():]
        count = len(frames)
    else:
        fp = os.path.normpath(bpy.path.abspath(r.frame_path(frame=scene.frame_start)))
        d, b = os.path.split(fp)
        mm = list(re.finditer(r"\d+", b))[-1]
        start = scene.frame_start; n = len(mm.group())
        pattern = b[:mm.start()] + "%0" + str(n) + "d" + b[mm.end():]
        stem_src = b[:mm.start()] + b[mm.end():]
        count = scene.frame_end - scene.frame_start + 1
    # strip image extension and any video extension from the output stem
    stem = stem_src
    for _ in range(2):
        root, e = os.path.splitext(stem)
        if e and (e.lower() in VIDEO_BY_EXT or e.lower() in {v[0] for v in FORMATS.values()} or e.lower() in (".jpeg", ".tiff")):
            stem = root
    stem = stem.strip("_-. ") or "render"
    return dict(dir=d, pattern=os.path.join(d, pattern), start=start, count=count,
                fps=r.fps / (r.fps_base or 1.0), mp4=os.path.join(d, stem + vext), container=key, mime=mime)


def _codec_args(key, crf):
    even = "scale=trunc(iw/2)*2:trunc(ih/2)*2"
    if key == 'WEBM':
        return ["-c:v", "libvpx-vp9", "-crf", str(crf), "-b:v", "0", "-pix_fmt", "yuv420p", "-vf", even]
    if key == 'AVI':
        return ["-c:v", "mpeg4", "-q:v", "3", "-pix_fmt", "yuv420p", "-vf", even]
    if key == 'GIF':
        return ["-vf", "split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0"]
    out = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(crf), "-vf", even]
    if key in ('MP4', 'M4V', 'MOV'):
        out += ["-movflags", "+faststart"]
    return out


def make_mp4(job, ffmpeg, crf, send, label=None):
    prefs = get_prefs()
    config = (prefs.mode, prefs.url) if prefs else ('SERVER', '')
    """Run ffmpeg in a background thread; never touches bpy from the thread. Args are a list (no shell)."""
    os.makedirs(job["dir"], exist_ok=True)
    cmd = [ffmpeg, "-y", "-framerate", "%g" % job["fps"], "-start_number", str(job["start"]),
           "-i", job["pattern"], "-frames:v", str(job["count"])] + _codec_args(job.get("container", 'MP4'), crf) + [job["mp4"]]
    out_name = os.path.basename(job["mp4"])
    MP4["status"] = f"encoding {out_name} ({job['count']} frames)..."
    MP4["cmd"] = cmd
    _tag_redraw()

    def work():
        logp = job["mp4"] + ".ffmpeg.log"
        cmdline = subprocess.list2cmdline(cmd)
        try:
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            cp = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, creationflags=flags, shell=False)
        except OSError as e:
            msg = (f"FAIL cannot launch ffmpeg '{ffmpeg}': [errno {e.errno}, winerror {getattr(e, 'winerror', None)}] "
                   f"{e.strerror}. Set a valid ffmpeg.exe in add-on prefs")
            try:
                with open(logp, "w", encoding="utf-8") as f:
                    f.write(cmdline + "\n\n" + msg + "\n")
            except OSError:
                pass
            _set_status(msg)
            return
        except Exception as e:
            _set_status(f"FAIL ffmpeg: {e!r}")
            return
        try:
            out = cp.stdout.decode("utf-8", "replace")
            with open(logp, "w", encoding="utf-8") as f:
                f.write(cmdline + "\n\n" + out)
            ok = cp.returncode == 0 and os.path.exists(job["mp4"]) and os.path.getsize(job["mp4"]) > 0
            if not ok:
                _set_status(f"FAIL ffmpeg rc={cp.returncode}, see {logp}")
                return
            sz = os.path.getsize(job["mp4"])
            msg = f"{job.get('container', 'MP4')} ok: {job['mp4']} ({job['count']} frames, {sz} bytes)"
            if send:
                send_file(job["mp4"], label or out_name, mime=job.get("mime", "video/mp4"), _config=config)
                msg += ", sent"
            _set_status(msg)
        except Exception as e:
            _set_status(f"FAIL ffmpeg post: {e!r}")

    threading.Thread(target=work, daemon=True, name="render_to_websocket_ffmpeg").start()


def start_mp4_for(scene, frames, p):
    ff = find_ffmpeg(p.ffmpeg_path if p else "")
    if not ff:
        _set_status("FAIL ffmpeg not found (set FFmpeg path in add-on prefs)" + (f"; {FF_NOTE['msg']}" if FF_NOTE["msg"] else ""))
        return False
    if FF_NOTE["msg"]:
        _log(FF_NOTE["msg"])
    job = sequence_job(scene, frames, p)
    MP4["last"] = dict(job, ffmpeg=ff)
    make_mp4(job, ff, p.mp4_crf if p else 18, p.send_mp4 if p else True)
    return True




def on_render_write_track(scene, *args):
    pass

def on_render_cancel(scene, *args):
    _render_message(scene, 'Cancelled')
    _state['paths'] = []


class RTWS_OT_send_file(bpy.types.Operator):
    bl_idname = "render_to_websocket.send_file"
    bl_label = "Send Completed File"
    filepath: bpy.props.StringProperty(subtype='FILE_PATH')

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        if not os.path.isfile(self.filepath):
            self.report({'ERROR'}, 'Select an existing file')
            return {'CANCELLED'}
        send_file(self.filepath)
        return {'FINISHED'}


class RTWS_OT_send_last(bpy.types.Operator):
    bl_idname = "render_to_websocket.send_last"
    bl_label = "Send Last Render to WebSocket"
    bl_description = "Encode the current Render Result as a base64 data: URI and broadcast it (server mode) or send it to the URL (client mode)"

    def execute(self, context):
        path, mime = save_render_result(context.scene)
        if not path:
            self.report({'WARNING'}, "No Render Result yet")
            return {'CANCELLED'}
        send_file(path, "manual", wait=bpy.app.background, mime=mime)
        p = get_prefs()
        self.report({'INFO'}, f"Broadcast to {len(SERVER.clients)} client(s)" if (p is None or p.mode == 'SERVER') else f"Sending to {p.url}")
        return {'FINISHED'}


class RTWS_OT_make_mp4(bpy.types.Operator):
    bl_idname = "render_to_websocket.make_mp4"
    bl_label = "Make video from last sequence"
    bl_description = "Encode the last rendered image sequence (or the current scene's output frame range) to a video (MP4/MKV/WebM/MOV/AVI/GIF) with ffmpeg"

    def execute(self, context):
        p = get_prefs()
        sc = bpy.data.scenes.get(MP4.get("last_scene") or "") or context.scene
        frames = [f for f in MP4.get("last_frames", []) if os.path.exists(f)]
        if not frames:
            frames = [bpy.path.abspath(sc.render.frame_path(frame=f)) for f in range(sc.frame_start, sc.frame_end + 1)]
            frames = [f for f in frames if os.path.exists(f)]
        if not frames:
            self.report({'WARNING'}, "No rendered frames found")
            return {'CANCELLED'}
        try:
            ok = start_mp4_for(sc, frames, p)
        except Exception as e:
            _set_status(f"FAIL video setup: {e!r}"); ok = False
        if not ok:
            self.report({'ERROR'}, MP4["status"]); return {'CANCELLED'}
        self.report({'INFO'}, MP4["status"])
        return {'FINISHED'}


class RTWS_OT_tunnel_start(bpy.types.Operator):
    bl_idname = "render_to_websocket.tunnel_start"
    bl_label = "Start Tunnel"
    bl_description = "Start your existing named Cloudflare tunnel using its configuration file"

    @classmethod
    def poll(cls, context):
        return SERVER.running and not TUNNEL.running

    def execute(self, context):
        p = get_prefs()
        try:
            executable = find_cloudflared(bpy.path.abspath(p.cloudflared_path) if p and p.cloudflared_path else '')
            if p is None:
                raise RuntimeError('Add-on preferences are unavailable.')
            TUNNEL.start(executable, p.tunnel_name,
                         bpy.path.abspath(p.tunnel_config), p.tunnel_public_url)
        except Exception as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        return {'FINISHED'}


class RTWS_OT_tunnel_stop(bpy.types.Operator):
    bl_idname = "render_to_websocket.tunnel_stop"
    bl_label = "Stop Tunnel"
    bl_description = "Stop only the Cloudflare process started by this add-on"

    def execute(self, context):
        TUNNEL.stop()
        return {'FINISHED'}


class RTWS_OT_tunnel_copy(bpy.types.Operator):
    bl_idname = "render_to_websocket.tunnel_copy"
    bl_label = "Copy WebSocket URL"

    @classmethod
    def poll(cls, context):
        return bool(TUNNEL.url and TUNNEL.running)

    def execute(self, context):
        context.window_manager.clipboard = TUNNEL.url
        self.report({'INFO'}, 'Public WebSocket URL copied')
        return {'FINISHED'}


def draw_tunnel(layout):
    box = layout.box()
    box.label(text='Cloudflare Tunnel: ' + TUNNEL.status, icon='WORLD')
    p = get_prefs()
    if p:
        settings = box.column()
        settings.enabled = not TUNNEL.running
        settings.prop(p, 'tunnel_name')
        settings.prop(p, 'tunnel_config')
        settings.prop(p, 'tunnel_public_url')
    row = box.row(align=True)
    row.operator(RTWS_OT_tunnel_start.bl_idname, icon='PLAY')
    row.operator(RTWS_OT_tunnel_stop.bl_idname, icon='PAUSE')
    if TUNNEL.url:
        box.label(text=TUNNEL.url)
        box.operator(RTWS_OT_tunnel_copy.bl_idname, icon='COPYDOWN')
    box.label(text='Routing and access rules come from your configured tunnel.')
    if TUNNEL.error:
        box.label(text=TUNNEL.error[:110], icon='ERROR')


class RTWS_PT_panel(bpy.types.Panel):
    bl_label = VERSION_STR
    bl_idname = "RTWS_PT_panel"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "output"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        c = self.layout.column()
        c.label(text=VERSION_STR, icon='WORLD')
        p = get_prefs()
        c.label(text="Server: " + SERVER.status + (f" | {len(SERVER.clients)} client(s)" if SERVER.running else ""))
        if p and p.mode == 'SERVER':
            c.label(text=SERVER.cache.status[:150], icon='FILE_REFRESH')
        draw_tunnel(c)
        draw_pointer_settings(c, context.scene, POINTER.status, RECORDER)
        if p:
            c.prop(p, "make_mp4"); c.prop(p, "send_mp4"); c.prop(p, "video_container")
        c.operator(RTWS_OT_send_file.bl_idname, icon='EXPORT')
        c.progress(factor=min(1.0, PROGRESS['sent'] / PROGRESS['total']) if PROGRESS['total'] else 0.0, type='BAR', text=PROGRESS['status'])
        c.operator(RTWS_OT_make_mp4.bl_idname, icon='FILE_MOVIE')
        if MP4["status"]:
            c.label(text="Video: " + MP4["status"][:110], icon='ERROR' if MP4["status"].startswith("FAIL") else 'NONE')
        if LOG:
            c.label(text="Last action: " + ("OK " if LOG[-1][2] else "FAIL ") + LOG[-1][3][:90])


URLS = [("ws://localhost:8765", "ws://localhost:8765", "Local server"),
        ("wss://ws.socdis.net", "wss://ws.socdis.net", "Public tunnel")]


class RTWS_Prefs(bpy.types.AddonPreferences):
    bl_idname = __package__ or __name__
    mode: bpy.props.EnumProperty(name="Mode", default='SERVER', update=_upd, items=[
        ('SERVER', "Server", "Run a WebSocket server in Blender and broadcast renders to connected clients"),
        ('CLIENT', "Client", "Connect to the URL and send each render")])
    server_on: bpy.props.BoolProperty(name="Run server", default=True, update=_upd)
    host: bpy.props.StringProperty(name="Host", default="127.0.0.1", update=_upd)
    replay_cache_mb: bpy.props.IntProperty(name="Replay cache limit (MiB)", default=256, min=1, max=512, update=_upd,
        description="Temporary disk budget for the latest completed file and active replays; changing this restarts the server")
    port: bpy.props.IntProperty(name="Port", default=8765, min=1, max=65535, update=_upd)
    cloudflared_path: bpy.props.StringProperty(name="cloudflared executable", default="", subtype='FILE_PATH',
        description="Leave empty to find cloudflared automatically")
    tunnel_name: bpy.props.StringProperty(name="Tunnel name or UUID", default="shadow-ws",
        description="An existing Cloudflare tunnel, not a ws:// URL")
    tunnel_config: bpy.props.StringProperty(name="Tunnel configuration", subtype='FILE_PATH',
        default=os.path.expanduser('~/.cloudflared/config.yml'),
        description="Existing cloudflared configuration; its ingress must point to Blender's WebSocket port")
    tunnel_public_url: bpy.props.StringProperty(name="Public WebSocket URL", default="wss://ws.socdis.net",
        description="The configured hostname to copy into the web client; this does not change DNS or ingress")
    enabled: bpy.props.BoolProperty(name="Enable auto-send", default=True)
    send_anim_frames: bpy.props.BoolProperty(name="Send each animation frame (image-sequence output)", default=False)
    url: bpy.props.StringProperty(name="URL", default="ws://localhost:8765")
    make_mp4: bpy.props.BoolProperty(name="Make video after image-sequence render", default=True)
    video_container: bpy.props.EnumProperty(name="Video container", default='MP4',
        description="Used unless render.filepath ends in a video extension (.mp4 .mkv .webm .mov .avi .m4v .gif)", items=[
        ('MP4', "MP4", "H.264 in .mp4"), ('MKV', "MKV", "H.264 in .mkv"), ('WEBM', "WebM", "VP9 in .webm"),
        ('MOV', "MOV", "H.264 in .mov"), ('AVI', "AVI", "MPEG-4 Part 2 in .avi"), ('GIF', "GIF", "Animated GIF (palette)")])
    ffmpeg_path: bpy.props.StringProperty(name="FFmpeg path", default="", subtype='FILE_PATH',
                                          description="Path to ffmpeg.exe. Empty = auto-detect (WinGet Gyan.FFmpeg package, PATH, C:\\ffmpeg)")
    mp4_crf: bpy.props.IntProperty(name="MP4 CRF", default=18, min=0, max=51)
    send_mp4: bpy.props.BoolProperty(name="Send video over WebSocket", default=True)
    preset: bpy.props.EnumProperty(name="Preset", items=URLS,
                                   update=lambda self, ctx: setattr(self, "url", self.preset))

    def draw(self, context):
        c = self.layout.column()
        c.label(text=VERSION_STR, icon='INFO')
        c.row().prop(self, "mode", expand=True)
        if self.mode == 'SERVER':
            r = c.row(); r.prop(self, "server_on"); r.prop(self, "host"); r.prop(self, "port")
            ok = SERVER.running
            st = SERVER.status + (f"  |  {len(SERVER.clients)} client(s)" if ok else "")
            c.label(text="Server: " + st, icon='CHECKMARK' if ok else ('ERROR' if SERVER.status.startswith("error") else 'PAUSE'))
            c.prop(self, 'replay_cache_mb')
            c.label(text=SERVER.cache.status[:150], icon='FILE_REFRESH')
            if not ok:
                c.operator(RTWS_OT_restart.bl_idname, icon='FILE_REFRESH')
        else:
            r = c.row(); r.prop(self, "url"); r.prop(self, "preset", text="")
        draw_tunnel(c)
        draw_pointer_settings(c, context.scene, POINTER.status, RECORDER)
        c.prop(self, "cloudflared_path")
        c.prop(self, "enabled")
        c.operator(RTWS_OT_send_file.bl_idname, icon='FILE_FOLDER')
        total = PROGRESS['total']
        fraction = min(1.0, PROGRESS['sent'] / total) if total else 0.0
        c.progress(factor=fraction, type='BAR', text=f"{fraction:.0%} - {PROGRESS['status']}")
        c.label(text=f"{PROGRESS['sent']:,} / {total:,} bytes")
        b = c.box()
        b.prop(self, "make_mp4"); b.prop(self, "send_mp4"); b.prop(self, "video_container")
        r = b.row(); r.prop(self, "ffmpeg_path"); r.prop(self, "mp4_crf")
        b.label(text="ffmpeg: " + (find_ffmpeg(self.ffmpeg_path) or "NOT FOUND"))
        if FF_NOTE["msg"]:
            b.label(text=FF_NOTE["msg"][:110], icon='ERROR')
        if MP4["status"]:
            b.label(text="Video: " + MP4["status"][:110], icon='ERROR' if MP4["status"].startswith("FAIL") else 'NONE')
        r = c.row()
        r.operator(RTWS_OT_send_last.bl_idname, icon='EXPORT')
        r.operator(RTWS_OT_make_mp4.bl_idname, icon='FILE_MOVIE')
        if LOG:
            c.label(text="Last send: " + ("OK " if LOG[-1][2] else "FAIL ") + LOG[-1][3][:90])


class RTWS_OT_restart(bpy.types.Operator):
    bl_idname = "render_to_websocket.restart_server"
    bl_label = "Restart WebSocket Server"

    def execute(self, context):
        p = get_prefs()
        SERVER.stop()
        apply_mode(p)
        self.report({'INFO'}, SERVER.status)
        return {'FINISHED'}


def menu(self, context):
    self.layout.operator(RTWS_OT_send_file.bl_idname, icon='EXPORT')


H = bpy.app.handlers


def register():
    from . import plane_view
    plane_view.register(POINTER)
    atexit.register(SERVER.stop)
    bpy.utils.register_class(RTWS_OT_record_start)
    bpy.utils.register_class(RTWS_OT_record_stop)
    bpy.utils.register_class(RTWS_PointerSettings)
    bpy.types.Scene.rtws_pointer = bpy.props.PointerProperty(type=RTWS_PointerSettings)
    bpy.utils.register_class(RTWS_OT_pointer_empty)
    bpy.utils.register_class(RTWS_OT_clear_pointer_empties)
    bpy.app.timers.register(_pointer_tick, persistent=True)
    bpy.app.timers.register(_scene_objects_tick, first_interval=.1, persistent=True)
    if _pointer_load_reset not in bpy.app.handlers.load_pre:
        bpy.app.handlers.load_pre.append(_pointer_load_reset)
    bpy.utils.register_class(RTWS_OT_tunnel_start)
    bpy.utils.register_class(RTWS_OT_tunnel_stop)
    bpy.utils.register_class(RTWS_OT_tunnel_copy)
    bpy.utils.register_class(RTWS_OT_send_file)
    bpy.app.timers.register(_refresh_progress, persistent=True)
    bpy.utils.register_class(RTWS_OT_send_last)
    bpy.utils.register_class(RTWS_OT_restart)
    bpy.utils.register_class(RTWS_OT_make_mp4)
    bpy.utils.register_class(RTWS_Prefs)
    bpy.utils.register_class(RTWS_PT_panel)
    bpy.types.TOPBAR_MT_render.append(menu)
    try:
        apply_mode()
    except Exception as e:
        _log("server start failed:", repr(e))
    for lst, fn in ((H.render_init, on_render_init), (H.render_pre, on_render_pre), (H.render_post, on_render_post), (H.render_write, on_render_write), (H.render_write, on_render_write_track), (H.render_complete, on_render_complete), (H.render_cancel, on_render_cancel)):
        if fn not in lst:
            lst.append(fn)


def unregister():
    from . import plane_view
    plane_view.unregister()
    atexit.unregister(SERVER.stop)
    SERVER.stop()
    RECORDER.stop(reason='Recording stopped: add-on disabled')
    POINTER.reset()
    SCENE_OBJECTS.reset()
    if bpy.app.timers.is_registered(_scene_objects_tick):
        bpy.app.timers.unregister(_scene_objects_tick)
    if bpy.app.timers.is_registered(_pointer_tick):
        bpy.app.timers.unregister(_pointer_tick)
    if _pointer_load_reset in bpy.app.handlers.load_pre:
        bpy.app.handlers.load_pre.remove(_pointer_load_reset)
    bpy.utils.unregister_class(RTWS_OT_record_stop)
    bpy.utils.unregister_class(RTWS_OT_record_start)
    bpy.utils.unregister_class(RTWS_OT_clear_pointer_empties)
    bpy.utils.unregister_class(RTWS_OT_pointer_empty)
    del bpy.types.Scene.rtws_pointer
    bpy.utils.unregister_class(RTWS_PointerSettings)
    bpy.utils.unregister_class(RTWS_OT_tunnel_copy)
    bpy.utils.unregister_class(RTWS_OT_tunnel_stop)
    bpy.utils.unregister_class(RTWS_OT_tunnel_start)
    if bpy.app.timers.is_registered(_refresh_progress):
        bpy.app.timers.unregister(_refresh_progress)
    bpy.utils.unregister_class(RTWS_OT_send_file)
    for lst, fn in ((H.render_init, on_render_init), (H.render_pre, on_render_pre), (H.render_post, on_render_post), (H.render_write, on_render_write), (H.render_write, on_render_write_track), (H.render_complete, on_render_complete), (H.render_cancel, on_render_cancel)):
        if fn in lst:
            lst.remove(fn)
    bpy.types.TOPBAR_MT_render.remove(menu)
    bpy.utils.unregister_class(RTWS_PT_panel)
    bpy.utils.unregister_class(RTWS_Prefs)
    bpy.utils.unregister_class(RTWS_OT_make_mp4)
    bpy.utils.unregister_class(RTWS_OT_restart)
    bpy.utils.unregister_class(RTWS_OT_send_last)
