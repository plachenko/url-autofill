import asyncio
import importlib
import json
from pathlib import Path
import sys
import types
import unittest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'render_to_websocket' / 'vendor'))
package = types.ModuleType('rtws_pointer_test')
package.__path__ = [str(ROOT / 'render_to_websocket')]
sys.modules[package.__name__] = package
p = importlib.import_module(package.__name__ + '.pointers')
s = importlib.import_module(package.__name__ + '.server')
from websockets.asyncio.client import connect


def point(identity=1, x=.5, y=.5, kind='touch', pressure=.5):
    return dict(id=identity, x=x, y=y, kind=kind, pressure=pressure)


def message(phase, changed=None, points=()):
    return dict(type='pointer_positions', phase=phase, changed=changed, pointers=list(points))


class ProtocolTests(unittest.TestCase):
    def test_full_contacts_are_authoritative_and_clients_have_independent_ids(self):
        inbox = p.PointerInbox()
        first, second = point(), point(2, .8, .7)
        inbox.submit('a', message('down', first, [first]))
        inbox.submit('a', message('move', second, [first, second]))
        inbox.submit('b', message('down', first, [first]))
        states, _ = inbox.snapshot()
        self.assertEqual([contact.id for contact in states['a'].pointers], [1, 2])
        self.assertEqual([contact.id for contact in states['b'].pointers], [1])
        inbox.submit('a', message('cancel', second, [first]))
        self.assertEqual(len(inbox.snapshot()[0]['a'].pointers), 1)
        inbox.submit('a', message('reset'))
        self.assertEqual(inbox.snapshot()[0]['a'].pointers, ())
        inbox.disconnect('a')
        self.assertEqual(list(inbox.snapshot()[0]), ['b'])
        inbox.disconnect('b')
        inbox.submit('fresh', message('hover', point(kind='mouse')))
        state = inbox.snapshot()[0]['fresh']
        self.assertEqual(state.pointers, ())
        self.assertEqual(state.changed.kind, 'mouse')

    def test_invalid_input_does_not_replace_previous_valid_state(self):
        inbox = p.PointerInbox()
        first = point()
        inbox.submit('client', message('down', first, [first]))
        bad = [message('move', point(x=float('nan')), [first]), message('down', first, [first, first]),
               message('up', first, [first]), message('reset', first), message('hover', first),
               message('move', first, []), message(['move'], first, [first]), message('move', point(kind=[]), [first]),
               message('down', point(identity=True), [first]), message('down', point(pressure=True), [first]),
               message('down', point(x=-.01), [first]), message('down', point(y=1.01), [first]),
               message('down', first, [point(i) for i in range(p.MAX_CONTACTS + 1)])]
        for value in bad:
            with self.subTest(value=value), self.assertRaises(ValueError):
                inbox.submit('client', value)
        self.assertEqual(inbox.snapshot()[0]['client'].pointers[0].x, .5)

    def test_fast_release_keeps_final_coordinate_once_and_bounds_clients(self):
        inbox = p.PointerInbox()
        start, end = point(x=0), point(x=1)
        inbox.submit('a', message('down', start, [start]))
        inbox.submit('a', message('up', end))
        states, ends = inbox.snapshot()
        self.assertEqual(states['a'].pointers, ())
        self.assertEqual(ends['a'][0].x, 1)
        self.assertEqual(inbox.snapshot()[1], {})
        for i in range(p.MAX_CLIENTS - 1):
            inbox.submit(str(i), message('reset'))
        with self.assertRaisesRegex(ValueError, 'simultaneous clients'):
            inbox.submit('overflow', message('reset'))
        inbox.clear()
        self.assertEqual(inbox.snapshot(), ({}, {}))

    def test_remote_plane_mapping_validation_and_reset(self):
        self.assertEqual([p.resolve_plane(axis, 'XY') for axis in ['x', 'y', 'z', None]], ['YZ', 'XZ', 'XY', 'XY'])
        inbox = p.PointerInbox()
        first = point()
        value = message('down', first, [first]); value['plane'] = 'x'
        inbox.submit('client', value)
        self.assertEqual(inbox.snapshot()[0]['client'].plane, 'x')
        value = message('up', first); value['plane'] = 'x'
        inbox.submit('client', value)
        reset = message('reset'); reset['plane'] = 'y'
        inbox.submit('client', reset)
        self.assertEqual(inbox.snapshot()[1], {})
        bad = message('down', first, [first]); bad['plane'] = 'xyz'
        with self.assertRaisesRegex(ValueError, 'plane'):
            inbox.submit('client', bad)

    def test_center_axes_orientation_and_dimensions(self):
        for plane in ['XY', 'XZ', 'YZ']:
            self.assertEqual(p.plane_offset(.5, .5, plane, 8, 6), (0, 0, 0))
        self.assertEqual(p.plane_offset(1, 0, 'XY', 8, 6), (4, 3, 0))
        self.assertEqual(p.plane_offset(0, 1, 'XZ', 8, 6), (-4, 0, -3))
        self.assertEqual(p.plane_offset(1, 0, 'YZ', 8, 6), (0, 4, 3))
        with self.assertRaises(ValueError):
            p.plane_offset(.5, .5, 'XYZ', 8, 6)


class SocketTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.server = s.RenderServer()
        self.server.start('127.0.0.1', 0)
        self.assertTrue(self.server.running, self.server.status)
        self.url = f'ws://127.0.0.1:{self.server.port}'

    async def asyncTearDown(self):
        await asyncio.to_thread(self.server.stop)
        self.assertEqual(self.server.pointers.snapshot(), ({}, {}))

    async def sync(self, ws, value):
        await ws.send(json.dumps(value))
        await ws.send('pointer barrier')
        self.assertEqual(await asyncio.wait_for(ws.recv(), 3), 'pointer barrier')

    async def test_multitouch_cancel_disconnect_reconnect_and_no_pointer_echo(self):
        async with connect(self.url) as a, connect(self.url) as b:
            await a.recv(); await b.recv()
            first, second = point(), point(2, .8, .7)
            await self.sync(a, message('down', first, [first]))
            await self.sync(a, message('move', second, [first, second]))
            await self.sync(b, message('down', first, [first]))
            states = self.server.pointers.snapshot()[0]
            self.assertEqual(sorted(len(frame.pointers) for frame in states.values()), [1, 2])
            await self.sync(a, message('cancel', second, [first]))
            self.assertEqual(sorted(len(frame.pointers) for frame in self.server.pointers.snapshot()[0].values()), [1, 1])
            await a.close()
            for _ in range(100):
                if len(self.server.pointers.snapshot()[0]) == 1:
                    break
                await asyncio.sleep(.01)
            self.assertEqual(len(self.server.pointers.snapshot()[0]), 1)
            await self.sync(b, message('reset'))
            self.assertEqual(next(iter(self.server.pointers.snapshot()[0].values())).pointers, ())
        for _ in range(100):
            if not self.server.pointers.snapshot()[0]:
                break
            await asyncio.sleep(.01)
        self.assertEqual(self.server.pointers.snapshot()[0], {})
        async with connect(self.url) as ws:
            await ws.recv()
            await self.sync(ws, message('hover', point(kind='mouse')))
            frame = next(iter(self.server.pointers.snapshot()[0].values()))
            self.assertEqual(frame.phase, 'hover')
            self.assertEqual(frame.pointers, ())

    async def test_invalid_pointer_has_separate_error_and_socket_remains_usable(self):
        async with connect(self.url) as ws:
            await ws.recv()
            await ws.send(json.dumps(message('down', point(x=5), [point(x=5)])))
            error = json.loads(await ws.recv())
            self.assertEqual(error['type'], 'pointer_error')
            self.assertEqual(self.server.pointers.snapshot()[0], {})
            await self.sync(ws, message('down', point(), [point()]))


if __name__ == '__main__':
    unittest.main()
