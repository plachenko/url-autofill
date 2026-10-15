"""Bounded scene commands shared between socket handlers and Blender's main thread."""
import threading
import math


class SceneRequestInbox:
    def __init__(self):
        self._lock = threading.Lock()
        self._pending = {}

    def submit(self, client, value):
        if not isinstance(value, dict) or value.get('type') not in {'pointer_follow', 'pointer_plane_set'}:
            raise ValueError('Expected pointer_follow')
        kind = value['type']
        for name in (('request_id', 'scene_id', 'object_id') if kind == 'pointer_follow' else ('request_id', 'scene_id')):
            if not isinstance(value.get(name), str) or not 1 <= len(value[name]) <= 128:
                raise ValueError(f'Invalid {name}')
        if type(value.get('revision')) is not int or not 1 <= value['revision'] <= 2**53 - 1:
            raise ValueError('Invalid object-list revision')
        if 'enable' in value and type(value['enable']) is not bool:
            raise ValueError('enable must be a boolean')
        keys = ('request_id', 'scene_id', 'object_id', 'revision') if kind == 'pointer_follow' else ('request_id', 'scene_id', 'revision')
        request = {key: value[key] for key in keys}
        if kind == 'pointer_plane_set':
            request['type'] = kind
            for name in ('width', 'height'):
                number = value.get(name)
                if type(number) not in (int, float) or not math.isfinite(number) or not .001 <= number <= 1000000:
                    raise ValueError(f'{name} must be finite and between 0.001 and 1000000')
                request[name] = number
        if 'enable' in value:
            request['enable'] = value['enable']
        with self._lock:
            if client in self._pending:
                raise ValueError('An object selection is already pending for this client')
            if len(self._pending) >= 32:
                raise ValueError('Too many pending object selections')
            self._pending[client] = request

    def drain(self):
        with self._lock:
            result = list(self._pending.items())
            self._pending.clear()
            return result

    def disconnect(self, client):
        with self._lock:
            self._pending.pop(client, None)

    def clear(self):
        with self._lock:
            self._pending.clear()
