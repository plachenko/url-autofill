"""Run the live browser-controller/Blender suites in disposable processes.
Requires Blender and Node.js on this machine. No open Blender project is touched.
"""
import argparse,json,os,shutil,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--blender',default=shutil.which('blender'))
parser.add_argument('--rig',help='Optional saved ball_rig.blend (read only, never saved)')
args=parser.parse_args()
if not args.blender:parser.error('Pass --blender with the Blender executable path')
folder=ROOT/'.browser-e2e';folder.mkdir(exist_ok=True)
state=folder/'state.json';state.unlink(missing_ok=True)
flags={}
if os.name=='nt':
 startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
 flags=dict(startupinfo=startup,creationflags=subprocess.CREATE_NO_WINDOW)
node=shutil.which('node')
if not node:parser.error('Node.js is required')

def launch(script,background=True,extra=()):
 command=[args.blender]+(['--background'] if background else [])+['--factory-startup','--python-exit-code','1','--python',str(ROOT/script)]+list(extra)
 return subprocess.Popen(command,cwd=ROOT,**flags)

fixture=launch('test_browser_fixture_blender.py',extra=['--','--port','0']+(['--rig',str(Path(args.rig).resolve())] if args.rig else []))
try:
 deadline=time.monotonic()+25
 while not state.exists():
  if fixture.poll() is not None:raise RuntimeError('Blender fixture exited during setup')
  if time.monotonic()>deadline:raise TimeoutError('Blender fixture startup timed out')
  time.sleep(.1)
 subprocess.run([node,str(ROOT/'test_browser_session.mjs')],cwd=ROOT,check=True,timeout=90,**flags)
finally:
 if fixture.poll() is None:
  try:(folder/'command.json').write_text(json.dumps(dict(id='runner-stop-'+str(time.time_ns()),action='stop')),encoding='utf-8')
  except OSError:fixture.terminate()
  try:fixture.wait(timeout=5)
  except subprocess.TimeoutExpired:fixture.terminate();fixture.wait(timeout=5)
render=launch('test_browser_render_blender.py',background=False)
try:
 if render.wait(timeout=75)!=0:raise RuntimeError('Real render-lock test failed')
finally:
 if render.poll() is None:render.terminate();render.wait(timeout=5)
print('BROWSER_BLENDER_E2E_OK: controller integration and real render locks')
