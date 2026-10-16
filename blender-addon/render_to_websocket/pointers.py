"""Validated pointer protocol and a bounded mailbox; no Blender API on socket threads."""
from dataclasses import dataclass
import math
import threading

MAX_CONTACTS = 16
MAX_CLIENTS = 32
PHASES = {'down', 'move', 'up', 'cancel', 'hover', 'reset'}


@dataclass(frozen=True)
class Point:
    id: int
    x: float
    y: float
    kind: str
    pressure: float


@dataclass(frozen=True)
class PointerFrame:
    phase: str
    changed: Point | None
    pointers: tuple
    plane: str | None = None
    axis_lock: str | None = None


def _unit(value):
    return type(value) in (int, float) and 0 <= value <= 1 and math.isfinite(value)


def _point(value):
    if not isinstance(value, dict) or type(value.get('id')) is not int or not 0 <= value['id'] <= 2**53 - 1:
        raise ValueError('Invalid pointer id')
    if value.get('kind') not in ('mouse', 'touch', 'pen') or not all(_unit(value.get(key)) for key in ('x', 'y', 'pressure')):
        raise ValueError('Pointer coordinates and pressure must be finite numbers in [0, 1] with a valid kind')
    return Point(value['id'], value['x'], value['y'], value['kind'], value['pressure'])


def parse_pointer_message(message):
    if not isinstance(message, dict) or message.get('type') != 'pointer_positions' or not isinstance(message.get('phase'), str) or message.get('phase') not in PHASES:
        raise ValueError('Invalid pointer message type or phase')
    values = message.get('pointers')
    if not isinstance(values, list) or len(values) > MAX_CONTACTS:
        raise ValueError(f'Pointer message must contain at most {MAX_CONTACTS} contacts')
    points = tuple(_point(value) for value in values)
    ids = {point.id for point in points}
    if len(ids) != len(points):
        raise ValueError('Duplicate pointer id')
    plane = message.get('plane')
    if plane is not None and plane not in ('x', 'y', 'z'):
        raise ValueError('Pointer plane must be x, y, or z')
    axis_lock = message.get('axis_lock')
    if axis_lock is not None and axis_lock not in ('x', 'y', 'z'):
        raise ValueError('Pointer axis lock must be x, y, or z')
    phase = message['phase']
    if phase == 'reset':
        if message.get('changed') is not None or points:
            raise ValueError('Reset must have no changed pointer or contacts')
        changed = None
    else:
        changed = _point(message.get('changed'))
        if phase in {'down', 'move'} and changed not in points:
            raise ValueError('Down/move changed pointer must appear in the full contacts array')
        if phase in {'up', 'cancel', 'hover'} and changed.id in ids:
            raise ValueError('Ended or hovering pointer cannot remain an active contact')
        if phase == 'hover' and changed.kind != 'mouse':
            raise ValueError('Hover is a mouse position without an active contact')
    return PointerFrame(phase, changed, points, plane, axis_lock)


def resolve_plane(plane, fallback):
    return {'x': 'YZ', 'y': 'XZ', 'z': 'XY'}.get(plane, fallback)


def plane_offset(x, y, plane, width, height):
    """Pad center is the origin; upward on the pad is the second positive axis."""
    if plane not in {'XY', 'XZ', 'YZ'} or not _unit(x) or not _unit(y):
        raise ValueError('Invalid plane or coordinates')
    if not all(type(value) in (int, float) and math.isfinite(value) and value > 0 for value in (width, height)):
        raise ValueError('Plane width and height must be positive and finite')
    u, v = (x - .5) * width, (.5 - y) * height
    return {'XY': (u, v, 0), 'XZ': (u, 0, v), 'YZ': (0, u, v)}[plane]


def constrain_to_axis(current, desired, direction):
    """Keep the current position except for movement along a unit axis."""
    distance = sum((desired[i] - current[i]) * direction[i] for i in range(3))
    return tuple(current[i] + direction[i] * distance for i in range(3))


class PointerInbox:
    def __init__(self):
        self._lock = threading.Lock()
        self._states = {}
        self._ends = {}
        self._downs = {}
        self._ups = {}

    def submit(self, client, message):
        frame = parse_pointer_message(message)
        with self._lock:
            if client not in self._states and len(self._states) >= MAX_CLIENTS:
                raise ValueError(f'Pointer control supports at most {MAX_CLIENTS} simultaneous clients')
            previous = self._states.pop(client, None)
            self._states[client] = frame
            if previous and previous.plane != frame.plane:
                self._ends.pop(client, None)
                self._downs.pop(client, None)
                self._ups.pop(client, None)
            ends = self._ends.setdefault(client, {})
            if frame.phase == 'down':
                downs = self._downs.setdefault(client, {})
                downs[frame.changed.id] = frame.changed
                while len(downs) > MAX_CONTACTS:
                    del downs[next(iter(downs))]
            for point in frame.pointers:
                ends.pop(point.id, None)
            if frame.phase == 'up':
                ends[frame.changed.id] = frame.changed
                ups = self._ups.setdefault(client, [])
                ups.append(frame.changed)
                del ups[:-64]
                while len(ends) > MAX_CONTACTS:
                    del ends[next(iter(ends))]
            elif frame.phase == 'reset':
                ends.clear()
                self._downs.pop(client, None)
                self._ups.pop(client, None)

    def snapshot(self):
        with self._lock:
            states, ends = dict(self._states), {client: tuple(points.values()) for client, points in self._ends.items() if points}
            self._ends.clear()
            self._downs.clear()
            self._ups.clear()
            return states, ends

    def snapshot_with_downs(self):
        with self._lock:
            states = dict(self._states)
            ends = {client: tuple(points.values()) for client, points in self._ends.items() if points}
            downs = {client: tuple(points.values()) for client, points in self._downs.items() if points}
            ups = {client: tuple(points) for client, points in self._ups.items() if points}
            self._ends.clear()
            self._downs.clear()
            self._ups.clear()
            return states, ends, downs, ups

    def disconnect(self, client):
        with self._lock:
            self._states.pop(client, None)
            self._ends.pop(client, None)
            self._downs.pop(client, None)
            self._ups.pop(client, None)

    def clear(self):
        with self._lock:
            self._states.clear()
            self._ends.clear()
            self._downs.clear()
            self._ups.clear()
