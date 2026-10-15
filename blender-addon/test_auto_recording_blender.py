"""Isolated interactive test: network gestures drive Blender's registered timer."""
import asyncio
import json
import os
from pathlib import Path
import sys
import threading
import time
import traceback
import types
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import render_to_websocket as addon
from websockets.asyncio.client import connect
prefs = types.SimpleNamespace(mode='SERVER', server_on=True, host='127.0.0.1', port=0,
    enabled=False, url='', replay_cache_mb=16)
addon.get_prefs = lambda: prefs
addon.register()
scene = bpy.context.scene
origin = bpy.data.objects['Cube']; origin.location = (10, 20, 30)
settings = scene.rtws_pointer
settings.origin = origin; settings.plane = 'XZ'; settings.width = 8; settings.height = 6
bpy.context.view_layer.update()
bpy.ops.render_to_websocket.pointer_empty()
target = settings.target; settings.enabled = True
scene.frame_set(20)
bpy.ops.render_to_websocket.record_start()
stage = {'name': 'starting'}
result = {}
observed = []
events = {name: threading.Event() for name in ('multi', 'cancel', 'disconnect', 'reconnect', 'reset')}


def point(identity, x, y):
    return dict(id=identity, x=x, y=y, kind='touch', pressure=.5)


async def send(ws, phase, changed=None, points=()):
    await ws.send(json.dumps(dict(type='pointer_positions', phase=phase, changed=changed, pointers=list(points))))
    await ws.send('pointer timer barrier')
    assert await asyncio.wait_for(ws.recv(), 3) == 'pointer timer barrier'


async def gestures():
    first, second = point(1, .25, .25), point(2, .75, .75)
    async with connect(f'ws://127.0.0.1:{addon.SERVER.port}') as ws:
        await ws.recv()
        stage['name'] = 'multi'
        await send(ws, 'down', first, [first])
        await send(ws, 'down', second, [first, second])
        assert await asyncio.to_thread(events['multi'].wait, 5), 'Timer did not place both Empties'
        stage['name'] = 'cancel'
        await send(ws, 'cancel', second, [first])
        assert await asyncio.to_thread(events['cancel'].wait, 5), 'Cancelled contact was not released'
        stage['name'] = 'disconnect'
    assert await asyncio.to_thread(events['disconnect'].wait, 5), 'Disconnected contacts were not released'
    async with connect(f'ws://127.0.0.1:{addon.SERVER.port}') as ws:
        await ws.recv()
        stage['name'] = 'reconnect'
        changed = point(1, 0, 1)
        await send(ws, 'down', changed, [changed])
        assert await asyncio.to_thread(events['reconnect'].wait, 5), 'Reconnected pointer did not move target'
        stage['name'] = 'reset'
        await send(ws, 'reset')
        assert await asyncio.to_thread(events['reset'].wait, 5), 'Reset did not release contact'


def worker():
    try:
        asyncio.run(gestures())
        result.update(ok=True, observed=observed)
    except Exception:
        result.update(ok=False, error=traceback.format_exc(), observed=observed)


started = time.monotonic()
def check():
    name = stage['name']
    count = len(addon.POINTER.bindings)
    near = lambda obj, xyz: (obj.matrix_world.translation - Vector(xyz)).length < .0001
    if name == 'multi' and count == 2:
        extra = next(obj for obj in addon.POINTER.bindings.values() if obj != target)
        if near(target, (8, 20, 31.5)) and near(extra, (12, 20, 28.5)):
            if not events[name].is_set():
                observed.append(dict(stage=name, positions=[list(target.matrix_world.translation), list(extra.matrix_world.translation)]))
            events[name].set()
    elif name == 'cancel' and count == 1:
        events[name].set()
    elif name in ('disconnect', 'reset') and count == 0:
        events[name].set()
    elif name == 'reconnect' and count == 1 and near(target, (6, 20, 27)):
        if not events[name].is_set():
            observed.append(dict(stage=name, position=list(target.matrix_world.translation)))
        events[name].set()
    if time.monotonic() - started > 35:
        result.update(ok=False, error='Test timed out', status=addon.POINTER.status)
    if result:
        bpy.ops.render_to_websocket.record_stop()
        from render_to_websocket.recording import location_curves
        curves = location_curves(target)
        frames = sorted({int(key.co.x) for curve in curves for key in curve.keyframe_points})
        result.update(recordedFrames=frames, renderRange=[scene.frame_start, scene.frame_end])
        if len(frames) < 2 or settings.enabled:
            result.update(ok=False, error='Automatic recording did not produce multiple frames or stop live control')
        addon.unregister()
        (ROOT / 'recording_timer_verification.json').write_text(json.dumps(result, indent=2))
        print('RECORDING_TIMER_RESULT', json.dumps(result), flush=True)
        os._exit(0 if result.get("ok") else 1)  # Isolated fixture: avoid overwriting user quit.blend recovery.
        return None
    return .02

bpy.app.timers.register(check, first_interval=.1)
threading.Thread(target=worker, daemon=True).start()
