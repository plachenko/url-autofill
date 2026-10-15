"""One immutable output snapshot, with a byte budget including active replays."""
from contextlib import contextmanager
from dataclasses import dataclass
import mimetypes
import os
import tempfile
import threading


@dataclass(eq=False)
class CachedFile:
    path: str
    name: str
    mime: str
    size: int
    refs: int = 0


class ReplayCache:
    def __init__(self, max_bytes=256 * 1024 * 1024):
        self.max_bytes = max_bytes
        self.status = 'Replay unavailable: no completed file cached'
        self._lock = threading.RLock()
        self._copy_lock = threading.Lock()
        self._reserved = 0
        self._entries = set()
        self._latest = None
        self._folder = None
        self._closed = False

    @property
    def disk_bytes(self):
        with self._lock:
            return self._reserved + sum(entry.size for entry in self._entries)

    def _collect(self):
        for entry in list(self._entries):
            if entry is not self._latest and not entry.refs:
                os.remove(entry.path)
                self._entries.remove(entry)

    def replace(self, path, mime=None):
        # Copies run on a worker; short metadata locks let connections continue
        # receiving status while a large snapshot is being written.
        with self._copy_lock:
            with self._lock:
                if self._closed:
                    return False
                self._latest = None
                self._collect()
                self.status = 'Replay unavailable: caching the latest completed output'
            target = None
            try:
                with open(path, 'rb') as source:
                    initial = os.fstat(source.fileno())
                    with self._lock:
                        if initial.st_size > self.max_bytes - self.disk_bytes:
                            self.status = (f'Replay unavailable: {initial.st_size:,}-byte output exceeds '
                                           f'the available {self.max_bytes:,}-byte cache budget (including active replays)')
                            return False
                        self._reserved = initial.st_size
                    if self._folder is None:
                        self._folder = tempfile.TemporaryDirectory(prefix='render_to_websocket_replay_')
                    fd, target = tempfile.mkstemp(dir=self._folder.name)
                    with os.fdopen(fd, 'wb') as output:
                        remaining = initial.st_size
                        while remaining:
                            chunk = source.read(min(192 * 1024, remaining))
                            if not chunk:
                                raise RuntimeError('Output became shorter while caching')
                            output.write(chunk)
                            remaining -= len(chunk)
                        final = os.fstat(source.fileno())
                        if source.read(1) or (initial.st_size, initial.st_mtime_ns) != (final.st_size, final.st_mtime_ns):
                            raise RuntimeError('Output changed while caching')
                entry = CachedFile(target, os.path.basename(path), mime or mimetypes.guess_type(path)[0] or 'application/octet-stream', initial.st_size)
                with self._lock:
                    self._reserved = 0
                    self._entries.add(entry)
                    self._latest = entry
                    self.status = f'Replay ready: {entry.name} ({entry.size:,} bytes)'
                return True
            except (OSError, RuntimeError) as exc:
                if target and os.path.exists(target):
                    os.remove(target)
                with self._lock:
                    self.status = 'Replay unavailable: could not snapshot completed output: ' + str(exc)
                return False
            finally:
                with self._lock:
                    self._reserved = 0

    @contextmanager
    def latest(self):
        with self._lock:
            entry = self._latest
            if entry:
                entry.refs += 1
        try:
            yield entry
        finally:
            if entry:
                with self._lock:
                    entry.refs -= 1
                    self._collect()

    def close(self):
        with self._copy_lock, self._lock:
            self._closed = True
            self._latest = None
            self._collect()
            if self._entries:
                raise RuntimeError('Replay transfers must stop before closing the cache')
            if self._folder:
                self._folder.cleanup()
                self._folder = None
            self.status = 'Replay unavailable: server stopped'
