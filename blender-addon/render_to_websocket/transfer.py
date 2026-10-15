import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import uuid

CHUNK_SIZE = 192 * 1024

async def transfer(path, targets, progress=lambda *args: None, *, name=None, mime=None, identity=None):
    """Stream a finalized file to a snapshot of connected recipients."""
    identity = identity or uuid.uuid4().hex
    with open(path, 'rb') as source:
        initial = os.fstat(source.fileno())
        size = initial.st_size
        count = (size + CHUNK_SIZE - 1) // CHUNK_SIZE
        async def emit(message):
            wire = json.dumps(message, separators=(',', ':'))
            await asyncio.wait_for(asyncio.gather(*(ws.send(wire) for ws in targets)), 60)
        await emit(dict(type='file_start', id=identity, name=name or os.path.basename(path),
                        mime=mime or mimetypes.guess_type(path)[0] or 'application/octet-stream',
                        bytes=size, chunks=count, encoding='base64'))
        digest = hashlib.sha256()
        sent = 0
        for index in range(count):
            data = source.read(min(CHUNK_SIZE, size - sent))
            if not data:
                raise RuntimeError('Source file became shorter during transfer')
            digest.update(data)
            await emit(dict(type='file_chunk', id=identity, index=index,
                            data=base64.b64encode(data).decode('ascii')))
            sent += len(data)
            progress(sent, size, 'Sending')
        final = os.fstat(source.fileno())
        if source.read(1) or (initial.st_size, initial.st_mtime_ns) != (final.st_size, final.st_mtime_ns):
            raise RuntimeError('Source file changed during transfer')
        await emit(dict(type='file_end', id=identity, sha256=digest.hexdigest()))
        progress(sent, size, 'Sent; receiver verification pending')
        return identity
