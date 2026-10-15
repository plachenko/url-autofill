"""Cache and real local WebSocket replay regressions; no Blender/user data needed."""
import asyncio
import base64
import hashlib
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'render_to_websocket' / 'vendor'))
package = types.ModuleType('rtws_replay_test')
package.__path__ = [str(ROOT / 'render_to_websocket')]
sys.modules[package.__name__] = package
replay = importlib.import_module(package.__name__ + '.replay')
server_module = importlib.import_module(package.__name__ + '.server')
from websockets.asyncio.client import connect


class CacheTests(unittest.TestCase):
    def test_snapshot_survives_source_overwrite_and_preserves_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'animation.avif'
            path.write_bytes(b'first')
            cache = replay.ReplayCache(20)
            self.assertTrue(cache.replace(path, 'image/avif'))
            with cache.latest() as entry:
                path.write_bytes(b'second')
                self.assertEqual(Path(entry.path).read_bytes(), b'first')
                self.assertEqual((entry.name, entry.mime), ('animation.avif', 'image/avif'))
                self.assertTrue(cache.replace(path, 'image/avif'))
                self.assertTrue(Path(entry.path).exists())
                self.assertEqual(cache.disk_bytes, 11)
            self.assertEqual(cache.disk_bytes, 6)
            with cache.latest() as entry:
                cached_path = Path(entry.path)
                self.assertEqual(cached_path.read_bytes(), b'second')
            cache.close()
            self.assertFalse(cached_path.exists())
            self.assertEqual(cache.disk_bytes, 0)

    def test_limit_counts_inflight_and_new_oversize_does_not_replay_stale_output(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'movie.mp4'
            path.write_bytes(b'123456')
            cache = replay.ReplayCache(10)
            self.assertTrue(cache.replace(path))
            with cache.latest():
                self.assertFalse(cache.replace(path))
                self.assertLessEqual(cache.disk_bytes, 10)
                self.assertIn('available', cache.status)
                with cache.latest() as entry:
                    self.assertIsNone(entry)
            self.assertEqual(cache.disk_bytes, 0)
            path.write_bytes(b'x' * 11)
            self.assertFalse(cache.replace(path))
            self.assertIn('exceeds', cache.status)
            cache.close()

    def test_missing_source_invalidates_cache_and_empty_unknown_file_is_supported(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'unknown.extension'
            path.touch()
            cache = replay.ReplayCache(10)
            self.assertTrue(cache.replace(path))
            with cache.latest() as entry:
                self.assertEqual(entry.size, 0)
                self.assertEqual(entry.mime, 'application/octet-stream')
            path.unlink()
            self.assertFalse(cache.replace(path))
            with cache.latest() as entry:
                self.assertIsNone(entry)
            self.assertEqual(cache.disk_bytes, 0)
            cache.close()


class ServerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / 'movie.mp4'
        self.data = os.urandom(192 * 1024 * 5 + 17)
        self.path.write_bytes(self.data)
        self.log, self.progress = [], []
        self.server = server_module.RenderServer(record=lambda *args: self.log.append(args),
            progress=lambda *args: self.progress.append(args), cache_bytes=3 * 1024 * 1024, ack_timeout=.5)
        self.server.start('127.0.0.1', 0)
        self.assertTrue(self.server.running, self.server.status)
        self.url = f'ws://127.0.0.1:{self.server.port}'
        self.status = dict(type='render_progress', id='render-1', state='Complete', scene='Test', frame=2, completed=2, total=2)
        self.server.publish_render(self.status)

    async def asyncTearDown(self):
        await asyncio.to_thread(self.server.stop)
        self.assertFalse(self.server.running)
        self.assertEqual(self.server.cache.disk_bytes, 0)
        self.assertEqual(len(self.server.acks), 0)
        self.folder.cleanup()

    async def collect(self, ws, expected=None, reject=False, already=None):
        messages = list(already or [])
        while not messages or messages[-1].get('type') != 'file_end':
            messages.append(json.loads(await asyncio.wait_for(ws.recv(), 4)))
        start = next(message for message in messages if message['type'] == 'file_start')
        data = b''.join(base64.b64decode(message['data']) for message in messages if message['type'] == 'file_chunk')
        self.assertEqual(data, self.data if expected is None else expected)
        self.assertEqual(messages[-1]['sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(messages[-1]['id'], start['id'])
        await ws.send(json.dumps(dict(type='file_ack', id=start['id'], ok=not reject,
                                     error='SHA-256 checksum mismatch.' if reject else '')))
        return start

    async def published(self):
        return await asyncio.wrap_future(self.server.send_file(str(self.path), mime='video/custom-movie'))

    async def test_connect_after_completion_replays_immutable_file_with_new_ids(self):
        self.assertEqual(await self.published(), [])
        self.path.write_bytes(b'overwritten original')
        identities = []
        for _ in range(2):
            async with connect(self.url, max_size=None) as ws:
                self.assertEqual(json.loads(await ws.recv()), self.status)
                meta = await self.collect(ws)
                self.assertEqual((meta['name'], meta['mime']), ('movie.mp4', 'video/custom-movie'))
                identities.append(meta['id'])
        self.assertNotEqual(*identities)

    async def test_connected_before_render_receives_file_then_reconnects(self):
        async with connect(self.url, max_size=None) as ws:
            self.assertEqual(json.loads(await ws.recv()), self.status)
            self.assertIn('Replay unavailable', await ws.recv())
            future = self.server.send_file(str(self.path))
            first = await self.collect(ws)
            self.assertEqual(await asyncio.wrap_future(future), [True])
        async with connect(self.url, max_size=None) as ws:
            await ws.recv()
            second = await self.collect(ws)
            self.assertNotEqual(first['id'], second['id'])

    async def test_disconnect_mid_transfer_and_reconnect_recovers_full_file(self):
        await self.published()
        async with connect(self.url, max_size=None) as ws:
            await ws.recv()
            first = json.loads(await ws.recv())
            self.assertEqual(first['type'], 'file_start')
            self.assertEqual(json.loads(await ws.recv())['type'], 'file_chunk')
            await ws.close()
        async with connect(self.url, max_size=None) as ws:
            await ws.recv()
            recovered = await self.collect(ws)
            self.assertNotEqual(first['id'], recovered['id'])

    async def test_join_during_live_transfer_and_second_render_replaces_first(self):
        async with connect(self.url, max_size=None) as a:
            await a.recv(); await a.recv()
            future = self.server.send_file(str(self.path))
            start = json.loads(await a.recv())
            chunk = json.loads(await a.recv())
            async with connect(self.url, max_size=None) as b:
                await b.recv()
                first, second = await asyncio.gather(self.collect(a, already=[start, chunk]), self.collect(b))
                self.assertNotEqual(first['id'], second['id'])
                self.assertEqual(await asyncio.wrap_future(future), [True])
        self.data = b'new render'
        self.path.write_bytes(self.data)
        await self.published()
        async with connect(self.url, max_size=None) as ws:
            await ws.recv()
            await self.collect(ws)

    async def test_rejected_checksum_does_not_evict_cache_or_block_healthy_receiver(self):
        await self.published()
        async with connect(self.url, max_size=None) as bad, connect(self.url, max_size=None) as good:
            await bad.recv(); await good.recv()
            await asyncio.gather(self.collect(bad, reject=True), self.collect(good))
            for _ in range(30):
                if any('checksum' in str(row) for row in self.log):
                    break
                await asyncio.sleep(.01)
            self.assertTrue(any('checksum' in str(row) for row in self.log), self.log)
        async with connect(self.url, max_size=None) as ws:
            await ws.recv()
            await self.collect(ws)

    async def test_second_output_replaces_cache_while_first_waits_for_ack(self):
        await self.published()
        async with connect(self.url, max_size=None) as old:
            await old.recv()
            old_messages = []
            while not old_messages or old_messages[-1]['type'] != 'file_end':
                old_messages.append(json.loads(await old.recv()))
            # Keep the first immutable snapshot pinned while replacing its source.
            self.data = b'second render replacing the same output pathname'
            self.path.write_bytes(self.data)
            future = self.server.send_file(str(self.path))
            for _ in range(100):
                with self.server.cache.latest() as entry:
                    if entry and entry.size == len(self.data):
                        break
                await asyncio.sleep(.01)
            else:
                self.fail('Second render was not cached while first receiver waited')
            async with connect(self.url, max_size=None) as new:
                await new.recv()
                await self.collect(new)
            await old.send(json.dumps(dict(type='file_ack', id=old_messages[0]['id'], ok=True)))
            await self.collect(old)
            self.assertEqual(await asyncio.wrap_future(future), [True])
        self.assertEqual(self.server.cache.disk_bytes, len(self.data))

    async def test_connection_during_cache_publication_receives_only_one_transfer(self):
        cached, release = threading.Event(), threading.Event()
        original = self.server.cache.replace
        def paused_replace(*args):
            result = original(*args)
            cached.set()
            release.wait(3)
            return result
        self.server.cache.replace = paused_replace
        future = self.server.send_file(str(self.path))
        self.assertTrue(await asyncio.to_thread(cached.wait, 3))
        try:
            async with connect(self.url, max_size=None) as ws:
                await ws.recv()
                await self.collect(ws)
                release.set()
                await asyncio.wrap_future(future)
                with self.assertRaises(asyncio.TimeoutError):
                    await asyncio.wait_for(ws.recv(), .05)
        finally:
            release.set()

    async def test_oversized_new_output_reports_unavailable_and_discards_old_replay(self):
        await self.published()
        self.path.write_bytes(b'x' * (self.server.cache_bytes + 1))
        await self.published()
        async with connect(self.url, max_size=None) as ws:
            await ws.recv()
            self.assertIn('Replay unavailable', await ws.recv())
            with self.assertRaises(asyncio.TimeoutError):
                await asyncio.wait_for(ws.recv(), .05)

    async def test_ack_timeout_keeps_cache_and_stop_releases_pending_replay(self):
        await self.published()
        async with connect(self.url, max_size=None) as ws:
            await ws.recv()
            while json.loads(await ws.recv())['type'] != 'file_end':
                pass
            self.assertEqual(json.loads(await asyncio.wait_for(ws.recv(), 2))['type'], 'file_cancel')
        async with connect(self.url, max_size=None) as ws:
            await ws.recv()
            await self.collect(ws)
        async with connect(self.url, max_size=None) as ws:
            await ws.recv()
            await asyncio.to_thread(self.server.stop)
            self.assertEqual(self.server.cache.disk_bytes, 0)
            self.assertIsNone(self.server.render_status)


if __name__ == '__main__':
    unittest.main()
