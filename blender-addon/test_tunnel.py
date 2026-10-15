import importlib.util
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('tunnel', 'render_to_websocket/tunnel.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class FakeProcess:
    def __init__(self, failure=False):
        self.code = 2 if failure else None
        self.finished = threading.Event()
        self.stdout = self
        self.failure = failure
        if failure: self.finished.set()
    def __iter__(self):
        yield 'connection failed' if self.failure else 'Registered tunnel connection'
        self.finished.wait(5)
    def close(self): pass
    def poll(self): return self.code
    def wait(self, timeout=None):
        if not self.finished.wait(timeout): raise m.subprocess.TimeoutExpired('fake', timeout)
        return self.code
    def terminate(self): self.code = 0; self.finished.set()
    def kill(self): self.terminate()

class Tests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=os.getcwd())
        assert os.path.commonpath([os.getcwd(), os.path.abspath(self.folder.name)]) == os.getcwd()
        self.config = Path(self.folder.name, 'config with spaces.yml')
        self.config.write_text('tunnel: configured-id\n', encoding='utf-8')
    def tearDown(self): self.folder.cleanup()
    def wait_for(self, predicate):
        end = time.monotonic() + 2
        while not predicate():
            if time.monotonic() > end: self.fail('Timed out waiting for state')
            time.sleep(.01)
    def test_named_tunnel_arguments_and_stop(self):
        calls = []
        process = FakeProcess()
        def spawn(args, **kwargs): calls.append((args, kwargs)); return process
        tunnel = m.ConfiguredTunnel(popen=spawn)
        original = self.config.read_bytes()
        try:
            tunnel.start(__file__, 'shadow-ws', str(self.config), 'wss://ws.socdis.net')
            self.wait_for(lambda: tunnel.status == 'Running')
            self.assertEqual(tunnel.url, 'wss://ws.socdis.net')
            self.assertEqual(calls[0][0][1:], ['tunnel', '--no-autoupdate', '--config', str(self.config), 'run', 'shadow-ws'])
            self.assertNotIn('--url', calls[0][0])
            tunnel.start(__file__, 'shadow-ws', str(self.config), 'wss://ws.socdis.net')
            self.assertEqual(len(calls), 1)
            self.assertEqual(self.config.read_bytes(), original)
        finally: tunnel.stop()
        self.assertFalse(tunnel.running)
        self.assertEqual(tunnel.url, '')
        self.assertEqual(tunnel.status, 'Stopped')
    def test_missing_or_invalid_settings_do_not_spawn(self):
        def forbidden(*args, **kwargs): self.fail('Should not spawn')
        tunnel = m.ConfiguredTunnel(popen=forbidden)
        with self.assertRaises(RuntimeError): tunnel.start(None, 'shadow-ws', str(self.config), 'wss://ws.socdis.net')
        for name, config, url in [('', str(self.config), 'wss://ws.socdis.net'),
          ('--token', str(self.config), 'wss://ws.socdis.net'),
          ('shadow-ws', str(self.config) + '.missing', 'wss://ws.socdis.net'),
          ('shadow-ws', str(self.config), 'https://ws.socdis.net'),
          ('shadow-ws', str(self.config), 'wss://ws.socdis.net?token=secret')]:
            with self.subTest(name=name, url=url), self.assertRaises(ValueError):
                tunnel.start(__file__, name, config, url)
    def test_failed_process_reports_error(self):
        tunnel = m.ConfiguredTunnel(popen=lambda *args, **kwargs: FakeProcess(failure=True))
        try:
            tunnel.start(__file__, 'configured-id', str(self.config), 'wss://ws.socdis.net')
            self.wait_for(lambda: tunnel.status == 'Error')
            self.assertIn('connection failed', tunnel.error)
            self.assertEqual(tunnel.url, '')
        finally: tunnel.stop()

if __name__ == '__main__': unittest.main()
