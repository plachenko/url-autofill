"""Run with Blender --background --factory-startup --python test_replay_blender.py."""
import asyncio
import base64
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import types
import bpy

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import render_to_websocket as addon
prefs = types.SimpleNamespace(mode='SERVER', server_on=True, host='127.0.0.1', port=0,
    enabled=True, url='', make_mp4=False, replay_cache_mb=16)
addon.get_prefs = lambda: prefs
addon.register()
from websockets.asyncio.client import connect

async def receive(expected):
    async with connect(f'ws://127.0.0.1:{addon.SERVER.port}', max_size=None) as ws:
        status = json.loads(await asyncio.wait_for(ws.recv(), 5))
        assert status['type'] == 'render_progress' and status['state'] == 'Complete', status
        start = json.loads(await ws.recv())
        assert start['type'] == 'file_start' and start['mime'] == 'video/mp4', start
        parts = []
        while True:
            message = json.loads(await asyncio.wait_for(ws.recv(), 5))
            if message['type'] == 'file_chunk':
                parts.append(base64.b64decode(message['data']))
            elif message['type'] == 'file_end':
                data = b''.join(parts)
                assert data == expected
                assert message['sha256'] == hashlib.sha256(data).hexdigest()
                await ws.send(json.dumps(dict(type='file_ack', id=start['id'], ok=True)))
                return start['id']

try:
    properties = addon.RTWS_Prefs.bl_rna.properties
    assert properties['replay_cache_mb'].default == 256
    assert properties['replay_cache_mb'].hard_max == 512
    assert addon.bl_info['version'] == (1, 9, 0)
    with tempfile.TemporaryDirectory(prefix='rtws_blender_replay_') as folder:
        scene = bpy.context.scene
        scene.render.engine = 'BLENDER_EEVEE'
        scene.render.resolution_x = scene.render.resolution_y = 32
        scene.render.resolution_percentage = 100
        scene.frame_start, scene.frame_end = 1, 2
        scene.render.filepath = str(Path(folder) / 'movie')
        scene.render.image_settings.media_type = 'VIDEO'
        scene.render.image_settings.file_format = 'FFMPEG'
        scene.render.ffmpeg.format = 'MPEG4'
        scene.render.ffmpeg.codec = 'H264'
        outputs = []
        for rotation in (0, 1):
            bpy.data.objects['Cube'].rotation_euler.z = rotation
            bpy.ops.render.render(animation=True)
            path = Path(scene.render.frame_path(frame=1))
            data = path.read_bytes()
            outputs.append(hashlib.sha256(data).hexdigest())
            # Background Blender has no timer event loop; use its documented
            # explicit dispatch after the actual movie writer has finalized.
            addon.send_file(str(path), wait=True)
            first = asyncio.run(receive(data))
            second = asyncio.run(receive(data))
            assert first != second
            print('BLENDER_MOVIE_REPLAY_OK', path.name, len(data), first, second)
        assert outputs[0] != outputs[1], 'Second render did not change'
    print('BLENDER_REPLAY_TESTS_OK: actual movie renders, late clients, reconnect, replacement, registered cache preference')
finally:
    addon.unregister()
    assert not addon.SERVER.running
    assert addon.SERVER.cache.disk_bytes == 0
