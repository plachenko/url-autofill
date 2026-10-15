"""Run in factory-startup Blender: actual sockets -> main-thread Empty transforms."""
import asyncio
import json
import math
from pathlib import Path
import sys
import tempfile
import threading
import types
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import render_to_websocket as addon
from websockets.asyncio.client import connect


def point(identity=1, x=.5, y=.5, kind='touch', pressure=.5):
    return dict(id=identity, x=x, y=y, kind=kind, pressure=pressure)


def message(phase, changed=None, points=()):
    return dict(type='pointer_positions', phase=phase, changed=changed, pointers=list(points))


def near(obj, xyz):
    actual = tuple(obj.matrix_world.translation)
    assert (Vector(actual) - Vector(xyz)).length < .0001, (actual, xyz, addon.POINTER.status)


def tick():
    addon._pointer_tick()
    assert not addon.POINTER.status.startswith('Pointer control:'), addon.POINTER.status
    bpy.context.view_layer.update()


async def send(ws, value):
    await ws.send(json.dumps(value))
    await ws.send('pointer barrier')
    assert await asyncio.wait_for(ws.recv(), 3) == 'pointer barrier'


prefs = types.SimpleNamespace(mode='SERVER', server_on=True, host='127.0.0.1', port=0,
    enabled=False, url='', replay_cache_mb=16)
addon.get_prefs = lambda: prefs
addon.register()
scene = bpy.context.scene
settings = scene.rtws_pointer
origin = bpy.data.objects['Cube']
origin.location = (10, 20, 30)
settings.origin = origin
settings.width, settings.height = 8, 6
bpy.context.view_layer.update()
assert bpy.ops.render_to_websocket.pointer_empty() == {'FINISHED'}
target = settings.target
near(target, (10, 20, 30))
settings.enabled = True
url = f'ws://127.0.0.1:{addon.SERVER.port}'


async def main():
    async with connect(url) as a, connect(url) as b:
        await a.recv(); await b.recv()
        first = point(x=.1, y=.25)
        second = point(2, .9, .75)
        await send(a, message('down', first, [first]))
        near(target, (10, 20, 30))  # Socket thread cannot move Blender objects.
        tick(); near(target, (6.8, 21.5, 30))
        await send(a, message('move', second, [first, second]))
        tick()
        assert len(addon.POINTER.bindings) == 2
        extra = next(obj for obj in addon.POINTER.bindings.values() if obj != target)
        near(extra, (13.2, 18.5, 30))
        other = point(x=.25)
        await send(b, message('down', other, [other]))
        tick()
        assert len(addon.POINTER.bindings) == 3
        third = next(obj for obj in addon.POINTER.bindings.values() if obj not in (target, extra))
        near(third, (8, 20, 30)); near(target, (6.8, 21.5, 30))
        await send(a, message('up', point(2, 1, 0), [first]))
        tick(); near(extra, (14, 23, 30))
        assert len(addon.POINTER.bindings) == 2
        await send(b, message('cancel', other))
        tick(); near(third, (8, 20, 30))
        assert len(addon.POINTER.bindings) == 1
        await a.close()
        for _ in range(100):
            tick()
            if not addon.POINTER.bindings:
                break
            await asyncio.sleep(.01)
        assert not addon.POINTER.bindings
    async with connect(url) as c:
        await c.recv()
        await send(c, message('down', point(x=0, y=1), [point(x=0, y=1)]))
        tick(); near(target, (6, 17, 30))
        await send(c, message('reset'))
        tick(); assert not addon.POINTER.bindings
        near(target, (6, 17, 30))
        await send(c, message('hover', point(kind='mouse')))
        tick(); near(target, (10, 20, 30))
        assert not addon.POINTER.bindings
        for plane, expected in [('XY', (14, 23, 30)), ('XZ', (14, 20, 33)), ('YZ', (10, 24, 33))]:
            settings.plane = plane
            await send(c, message('down', point(x=1, y=0), [point(x=1, y=0)]))
            tick(); near(target, expected)
        settings.plane = 'XY'; settings.local_axes = True
        origin.rotation_euler = (0, 0, math.pi / 2)
        origin.scale = (2, 3, 4)
        bpy.context.view_layer.update()
        await send(c, message('move', point(x=1), [point(x=1)]))
        tick(); near(target, (10, 24, 30))
        origin.location = (15, 25, 35)
        bpy.context.view_layer.update()
        tick(); near(target, (15, 29, 35))
        parent = bpy.data.objects.new('Target Parent', None)
        scene.collection.objects.link(parent)
        parent.location = (2, 3, 4)
        target.parent = parent
        bpy.context.view_layer.update()
        tick(); near(target, (15, 29, 35))
        settings.enabled = False
        await send(c, message('move', point(x=0), [point(x=0)]))
        tick(); near(target, (15, 29, 35))
        settings.enabled = True
        tick(); near(target, (15, 21, 35))
        await send(c, message('reset'))
        tick()
        await send(c, message('down', point(x=0), [point(x=0)]))
        await send(c, message('up', point(x=1)))
        tick(); near(target, (15, 29, 35))
        assert not addon.POINTER.bindings
    failures = []
    def bad_thread():
        try:
            addon.POINTER.tick(addon.SERVER.pointers, scene)
        except RuntimeError as exc:
            failures.append(str(exc))
    worker = threading.Thread(target=bad_thread)
    worker.start(); worker.join()
    assert failures and 'main thread' in failures[0]

try:
    asyncio.run(main())
    addon.SERVER.pointers.clear(); addon.POINTER.reset()
    settings.enabled = True; settings.local_axes = False
    origin.location = (10, 20, 30); origin.rotation_euler = (0, 0, 0); origin.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    for axis, expected in [('x', (10, 24, 33)), ('y', (14, 20, 33)), ('z', (14, 23, 30))]:
        value = message('down', point(x=1, y=0), [point(x=1, y=0)]); value['plane'] = axis
        addon.SERVER.pointers.submit('remote-plane', value)
        tick(); near(target, expected)
        reset = message('reset'); reset['plane'] = axis
        addon.SERVER.pointers.submit('remote-plane', reset)
        tick(); assert not addon.POINTER.bindings
    settings.remote_plane = False; settings.plane = 'XY'
    value = message('down', point(x=1, y=0), [point(x=1, y=0)]); value['plane'] = 'x'
    addon.SERVER.pointers.submit('remote-plane', value)
    tick(); near(target, (14, 23, 30))
    addon.SERVER.pointers.clear(); addon.POINTER.reset()
    settings.local_axes = True
    with tempfile.TemporaryDirectory(prefix='rtws_pointer_settings_') as folder:
        path = str(Path(folder) / 'pointer-settings.blend')
        bpy.ops.wm.save_as_mainfile(filepath=path)
        bpy.ops.wm.open_mainfile(filepath=path)
        loaded = bpy.context.scene.rtws_pointer
        assert loaded.origin.name == 'Cube' and loaded.target.name.startswith('WebSocket Target')
        assert loaded.width == 8 and loaded.height == 6 and loaded.local_axes
        assert addon.SERVER.pointers.snapshot()[0] == {}
        assert not addon.POINTER.bindings
        target_name = loaded.target.name
        assert bpy.ops.render_to_websocket.clear_pointer_empties() == {'FINISHED'}
        assert bpy.context.scene.objects.get(target_name)
        assert bpy.context.scene.objects.get('Cube')
    print('BLENDER_POINTER_TESTS_OK: real sockets, simultaneous contacts, client isolation, release, cancel, disconnect/reconnect, hover, all planes, rotated/moving origin, parented target, opt-in, fast tap, main-thread guard, save/reload, safe cleanup')
finally:
    addon.unregister()
    assert not hasattr(bpy.types.Scene, 'rtws_pointer')
