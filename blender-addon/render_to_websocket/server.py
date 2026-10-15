"""Threaded WebSocket server with independent, acknowledged reconnect replays."""
import asyncio
import json
import threading
import uuid
from .replay import ReplayCache
from .transfer import transfer
from .pointers import PointerInbox


class RenderServer:
    def __init__(self, progress=lambda *args: None, record=lambda *args: None,
                 redraw=lambda: None, stop_tunnel=lambda: None, cache_bytes=256 * 1024 * 1024,
                 ack_timeout=60):
        self._progress, self._record, self._redraw = progress, record, redraw
        self._stop_tunnel = stop_tunnel
        self.cache_bytes, self.ack_timeout = cache_bytes, ack_timeout
        self.cache = ReplayCache(cache_bytes)
        self.pointers = PointerInbox()
        self.loop = self.thread = self.server = self.stop_evt = None
        self.host = self.port = None
        self.status = 'stopped'
        self.render_status = None
        self.clients = set()
        self.acks = {}
        self._tasks = set()
        self._client_locks = {}
        self._client_versions = {}
        self._publish_lock = None

    @property
    def running(self):
        return bool(self.thread and self.thread.is_alive() and self.server and self.stop_evt and not self.stop_evt.is_set())

    def start(self, host, port):
        self.stop()
        if self.thread and self.thread.is_alive():
            raise RuntimeError('Previous WebSocket server is still stopping')
        self.cache = ReplayCache(self.cache_bytes)
        self.host, self.port = host, port
        self.status = f'starting on {host}:{port}'
        ready = threading.Event()
        self.thread = threading.Thread(target=self._run, args=(host, port, ready), daemon=True,
                                       name='render_to_websocket_server')
        self.thread.start()
        ready.wait(5)
        self._redraw()

    def _task(self, coroutine):
        task = asyncio.create_task(coroutine)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    async def _send_to(self, ws, path, name=None, mime=None, replay=False):
        # A slow/disconnected receiver cannot break another receiver's transfer.
        lock = self._client_locks.get(ws)
        if lock is None:
            return False
        async with lock:
            identity = uuid.uuid4().hex
            reply = asyncio.get_running_loop().create_future()
            self.acks[(ws, identity)] = reply
            sent, total = 0, 0
            def progress(done, size, state):
                nonlocal sent, total
                sent, total = done, size
                self._progress(done, size, ('Replay: ' if replay else '') + state)
            try:
                await transfer(path, [ws], progress, name=name, mime=mime, identity=identity)
                try:
                    response = await asyncio.wait_for(reply, self.ack_timeout)
                except asyncio.TimeoutError:
                    raise TimeoutError(f'Receiver did not acknowledge within {self.ack_timeout:g} seconds') from None
                if response['ok'] is not True:
                    raise RuntimeError(response.get('error') or 'Receiver rejected file')
                self._progress(sent, total, 'Complete: receiver verified' + (' replay' if replay else ''))
                self._record('server', True, f'{"Replayed" if replay else "Sent"} {name or path}; receiver verified')
                return True
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._progress(sent, total, ('Replay failed: ' if replay else 'Failed: ') + str(exc))
                self._record('server', False, str(exc))
                try:
                    await asyncio.wait_for(ws.send(json.dumps(dict(type='file_cancel', id=identity))), 2)
                except Exception:
                    pass
                return False
            finally:
                self.acks.pop((ws, identity), None)
                if not reply.done():
                    reply.cancel()

    async def _handler(self, ws):
        replay = None
        pointer_client = uuid.uuid4().hex
        try:
            if self.stop_evt.is_set():
                return
            if self.render_status:
                await ws.send(json.dumps(self.render_status))
            self._client_locks[ws] = asyncio.Lock()
            self.clients.add(ws)
            # Run replay separately: this handler must keep reading file_ack.
            # Enter now so a newer completion cannot remove this snapshot before
            # the task gets its first turn on the event loop.
            lease = self.cache.latest()
            entry = lease.__enter__()
            if entry:
                self._client_versions[ws] = entry.path
            async def replay_pinned():
                try:
                    if entry:
                        await self._send_to(ws, entry.path, entry.name, entry.mime, replay=True)
                    else:
                        await ws.send(self.cache.status)
                except Exception as exc:
                    self._record('server', False, 'Replay unavailable: ' + str(exc))
            replay = self._task(replay_pinned())
            replay.add_done_callback(lambda task: lease.__exit__(None, None, None))
            async for message in ws:
                if not isinstance(message, str) or message.startswith('data:'):
                    continue
                try:
                    response = json.loads(message)
                except (ValueError, TypeError):
                    response = None
                if isinstance(response, dict) and response.get('type') == 'pointer_positions':
                    try:
                        self.pointers.submit(pointer_client, response)
                    except ValueError as exc:
                        await ws.send(json.dumps(dict(type='pointer_error', message=str(exc))))
                elif isinstance(response, dict) and response.get('type') == 'file_ack':
                    identity = response.get('id')
                    if not isinstance(identity, str) or not isinstance(response.get('ok'), bool):
                        continue
                    pending = self.acks.get((ws, identity))
                    if pending is not None and not pending.done():
                        pending.set_result(response)
                else:
                    await ws.send(message)  # Preserve legacy text echo.
        except Exception as exc:
            self._record('server', False, 'Connection ended: ' + str(exc))
        finally:
            self.clients.discard(ws)
            self.pointers.disconnect(pointer_client)
            # Signal pending live transfers immediately, rather than waiting 60s.
            for (client, _), pending in list(self.acks.items()):
                if client is ws and not pending.done():
                    pending.set_result({'ok': False, 'error': 'Receiver disconnected'})
            if replay:
                replay.cancel()
                await asyncio.gather(replay, return_exceptions=True)
            self._client_locks.pop(ws, None)
            self._client_versions.pop(ws, None)
            self._redraw()

    async def _publish_file(self, path, mime):
        # Publish order is completion order; copies never run concurrently.
        async with self._publish_lock:
            await asyncio.to_thread(self.cache.replace, path, mime)
            self._record('cache', self.cache.status.startswith('Replay ready'), self.cache.status)
            lease = self.cache.latest()
            entry = lease.__enter__()
            targets = [ws for ws in self.clients if not entry or self._client_versions.get(ws) != entry.path]
            if entry:
                for ws in targets:
                    self._client_versions[ws] = entry.path
            tasks = [self._task(self._send_to(ws, entry.path if entry else path,
                         entry.name if entry else None, entry.mime if entry else mime)) for ws in targets]
        try:
            if not targets:
                self._progress(0, entry.size if entry else 0, self.cache.status + '; no receivers connected')
                return []
            return await asyncio.gather(*tasks)
        finally:
            # On shutdown, release files only after every user of that snapshot stops.
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            lease.__exit__(None, None, None)

    def send_file(self, path, mime=None):
        if not self.running or self.loop is None:
            raise RuntimeError('WebSocket server is not running; replay unavailable')
        async def publish():
            return await self._task(self._publish_file(path, mime))
        return asyncio.run_coroutine_threadsafe(publish(), self.loop)

    def publish_render(self, message):
        self.render_status = message
        if not self.running or self.loop is None:
            return
        async def publish():
            await asyncio.gather(*(ws.send(json.dumps(message)) for ws in list(self.clients)), return_exceptions=True)
        asyncio.run_coroutine_threadsafe(publish(), self.loop)

    def broadcast(self, payload, label, wait=False):
        # Retained for legacy text senders; file replay always uses the chunk protocol.
        if not self.running:
            return None
        async def publish():
            return await asyncio.gather(*(ws.send(payload) for ws in list(self.clients)), return_exceptions=True)
        future = asyncio.run_coroutine_threadsafe(publish(), self.loop)
        if wait:
            future.result(60)
        return future

    def _run(self, host, port, ready):
        async def main():
            from websockets.asyncio.server import serve
            self.stop_evt = asyncio.Event()
            self._publish_lock = asyncio.Lock()
            try:
                async with serve(self._handler, host, port, max_size=None, origins=None,
                                 ping_interval=20, ping_timeout=60, compression=None) as server:
                    self.server = server
                    # Port zero is useful for isolated integration tests.
                    self.port = server.sockets[0].getsockname()[1]
                    self.status = f'listening on {host}:{self.port}'
                    ready.set()
                    await self.stop_evt.wait()
                    server.close()
                    for task in list(self._tasks):
                        task.cancel()
                    await asyncio.gather(*list(self._tasks), return_exceptions=True)
            finally:
                self.server = None
                self.clients.clear()
                self.pointers.clear()
                self.acks.clear()
                self._client_locks.clear()
                self._client_versions.clear()
                self.cache.close()
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        try:
            self.loop.run_until_complete(main())
        except Exception as exc:
            self.status = 'error: ' + str(exc)
            self._record('server', False, self.status)
        finally:
            ready.set()
            # Complete canceled publishers and any cache copy before closing.
            pending = asyncio.all_tasks(self.loop)
            for task in pending:
                task.cancel()
            self.loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            self.loop.run_until_complete(self.loop.shutdown_asyncgens())
            self.loop.run_until_complete(self.loop.shutdown_default_executor())
            self.loop.close()
            self.loop = None
            if not self.status.startswith('error'):
                self.status = 'stopped'
            self._redraw()

    def stop(self):
        self._stop_tunnel()
        if self.loop and self.stop_evt and not self.loop.is_closed():
            self.loop.call_soon_threadsafe(self.stop_evt.set)
        thread = self.thread
        if thread and thread.is_alive() and thread is not threading.current_thread():
            thread.join(8)
        if not thread or not thread.is_alive():
            self.thread = None
            self.render_status = None
            self.pointers.clear()
            self.cache.close()
            self.status = 'stopped'
