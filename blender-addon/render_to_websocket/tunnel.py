"""Manage only the configured Cloudflare tunnel started by this add-on."""
import os
import re
import shutil
import subprocess
import threading
from urllib.parse import urlsplit


def find_cloudflared(explicit=''):
    candidates = [explicit] if explicit else [shutil.which('cloudflared')]
    if not explicit:
        for variable in ('ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA'):
            root = os.environ.get(variable, '')
            if root:
                candidates.append(os.path.join(root, 'cloudflared', 'cloudflared.exe'))
    return next((os.path.abspath(p) for p in candidates if p and os.path.isfile(p)), None)


class ConfiguredTunnel:
    def __init__(self, popen=subprocess.Popen):
        self._popen = popen
        self.process = None
        self.thread = None
        self.status = 'Stopped'
        self.url = ''
        self.error = ''
        self.origin = ''

    @property
    def running(self):
        return self.process is not None and self.process.poll() is None

    def start(self, executable, name, config_path, public_url):
        if self.running:
            return
        if not executable or not os.path.isfile(executable):
            raise RuntimeError('cloudflared not found. Set its executable path in add-on preferences.')
        name = name.strip()
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', name):
            raise ValueError('Enter the configured tunnel name or UUID, not its WebSocket URL.')
        config_path = os.path.abspath(os.path.expanduser(config_path))
        if not os.path.isfile(config_path):
            raise ValueError('Tunnel configuration file not found.')
        public_url = public_url.strip()
        parsed = urlsplit(public_url)
        if parsed.scheme not in ('ws', 'wss') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Enter a public ws:// or wss:// URL without credentials or query parameters.')
        self.origin = ''  # Ingress routing comes from the user's existing configuration.
        self.url = public_url
        self.error = ''
        self.status = 'Starting'
        try:
            process = self._popen([executable, 'tunnel', '--no-autoupdate', '--config', config_path, 'run', name],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                encoding='utf-8', errors='replace', bufsize=1,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except Exception as exc:
            self.status = 'Error'
            self.error = str(exc)
            self.url = ''
            raise
        self.process = process
        self.thread = threading.Thread(target=self._monitor, args=(process,), daemon=True,
                                       name='render_to_websocket_tunnel')
        self.thread.start()

    def _monitor(self, process):
        last_line = ''
        try:
            for line in process.stdout:
                if self.process is not process:
                    return
                last_line = line.strip()[-300:]
                if 'Registered tunnel connection' in line:
                    self.status = 'Running'
                elif 'Unregistered tunnel connection' in line or 'Retrying connection' in line:
                    self.status = 'Reconnecting'
            code = process.wait()
            if self.process is process:
                self.status = 'Error' if code else 'Stopped'
                self.error = f'cloudflared exited ({code}): {last_line}' if code else ''
                self.url = ''
        except Exception as exc:
            if self.process is process:
                self.status = 'Error'
                self.error = str(exc)
                self.url = ''
        finally:
            process.stdout.close()

    def stop(self):
        process, self.process = self.process, None
        try:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)
        finally:
            self.url = ''
            self.status = 'Stopped'
            self.error = ''
            if self.thread and self.thread is not threading.current_thread():
                self.thread.join(timeout=1)
            self.thread = None
