"""Factory-startup Blender: deterministic pointer takes, saved actions, actual renders."""
import hashlib
from pathlib import Path
import sys
import tempfile
import types
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import render_to_websocket as addon
from render_to_websocket.recording import location_curves

prefs = types.SimpleNamespace(mode='SERVER', server_on=True, host='127.0.0.1', port=0,
    enabled=False, url='', replay_cache_mb=16)
addon.get_prefs = lambda: prefs
addon.register()
registered = True
scene = bpy.context.scene
settings = scene.rtws_pointer
origin = bpy.data.objects.new('Recording Origin', None)
scene.collection.objects.link(origin)
settings.origin = origin
settings.width = settings.height = 2
bpy.ops.render_to_websocket.pointer_empty()
target = settings.target
parent = bpy.data.objects.new('Recording Target Parent', None)
scene.collection.objects.link(parent); parent.location = (3, 4, 5)
target.parent = parent
bpy.context.view_layer.update()
cube = bpy.data.objects['Cube']; cube.parent = target
# An existing action must remain available and unchanged after the new take.
target.location.x = -4; target.keyframe_insert(data_path='location', frame=1)
target.location.x = 4; target.keyframe_insert(data_path='location', frame=100)
previous = target.animation_data.action
old_keys = [[(tuple(point.co), point.interpolation) for point in curve.keyframe_points] for curve in location_curves(target)]
scene.render.fps = 30; scene.render.fps_base = 1.001
scene.frame_set(10)
settings.enabled = True
now = [0.0]; addon.RECORDER.clock = lambda: now[0]
assert bpy.ops.render_to_websocket.record_start() == {'FINISHED'}
assert target.animation_data.action != previous and previous.use_fake_user


def pt(identity, x):
    return dict(id=identity, x=x, y=.5, pressure=.5, kind='touch')


def sample(frame, phase=None, changed=None, points=()):
    now[0] = frame / addon.RECORDER.fps
    if phase:
        addon.SERVER.pointers.submit('recording-client', dict(type='pointer_positions', plane='z', phase=phase, changed=changed, pointers=list(points)))
    addon._pointer_tick()
    assert addon.RECORDER.running, (addon.RECORDER.status, addon.POINTER.status)
    assert scene.frame_current == 10 + frame, (scene.frame_current, frame)
    bpy.context.view_layer.update()


try:
    sample(0, 'down', pt(1, .25), [pt(1, .25)])
    sample(1, 'down', pt(2, .75), [pt(1, .5), pt(2, .75)])
    extra = next(obj for obj in addon.POINTER.bindings.values() if obj != target)
    sample(2, 'move', pt(1, .75), [pt(1, .75), pt(2, .25)])
    sample(3, 'cancel', pt(2, .25), [pt(1, .75)])
    sample(4, 'up', pt(1, 1))
    addon.SERVER.pointers.disconnect('recording-client')
    sample(5)
    assert bpy.ops.render_to_websocket.record_stop() == {'FINISHED'}
    assert not addon.RECORDER.running and not settings.enabled
    assert (scene.frame_start, scene.frame_end) == (10, 15)
    assert all(point.interpolation == 'LINEAR' for curve in location_curves(target) for point in curve.keyframe_points if 10 <= point.co.x <= 15)
    take = target.animation_data.action
    target.animation_data.action = previous
    assert old_keys == [[(tuple(point.co), point.interpolation) for point in curve.keyframe_points] for curve in location_curves(target)]
    target.animation_data.action = take
    # The record cleanup action must not delete animated extra Empties.
    extra_name = extra.name
    bpy.ops.render_to_websocket.clear_pointer_empties()
    assert scene.objects.get(extra_name) == extra
    for frame, expected in [(10, -.5), (11, 0), (12, .5), (13, .5), (14, 1), (15, 1)]:
        scene.frame_set(frame)
        assert abs(target.matrix_world.translation.x - expected) < .0001, (frame, tuple(target.location))
    target_name = target.name
    with tempfile.TemporaryDirectory(prefix='rtws_recording_') as folder:
        saved = str(Path(folder) / 'recorded.blend')
        bpy.ops.wm.save_as_mainfile(filepath=saved)
        addon.unregister(); registered = False
        bpy.ops.wm.open_mainfile(filepath=saved)
        # These are plain Blender keyframes: no add-on or connection required.
        target = bpy.data.objects[target_name]
        scene = bpy.context.scene
        for frame, expected in [(10, -.5), (12, .5), (15, 1)]:
            scene.frame_set(frame)
            assert abs(target.matrix_world.translation.x - expected) < .0001
        scene.render.engine = 'BLENDER_EEVEE'
        scene.render.resolution_x = scene.render.resolution_y = 64
        scene.render.resolution_percentage = 100
        if hasattr(scene.render.image_settings, 'media_type'):
            scene.render.image_settings.media_type = 'IMAGE'
        scene.render.image_settings.file_format = 'PNG'
        hashes = []
        for frame in [10, 15]:
            scene.frame_set(frame)
            path = Path(folder) / f'frame-{frame}.png'
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            hashes.append(hashlib.sha256(path.read_bytes()).hexdigest())
        assert hashes[0] != hashes[1], hashes
        print('RECORDING_RENDER_HASHES', hashes)
    print('BLENDER_RECORDING_TESTS_OK: fractional fps, real-time frames, two contacts, release/idle holds, new action preservation, linear keys, render range, protected extras, save/reload, rendering without add-on')
finally:
    if registered:
        addon.unregister()
