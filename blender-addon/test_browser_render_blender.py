"""Launch separately with Blender --factory-startup --python this file (no --background).
A real asynchronous CPU render verifies the browser controller's render locks.
"""
import bpy,json,os,subprocess,sys,threading,time,traceback,types
from pathlib import Path
ROOT=Path(__file__).resolve().parent;sys.path.insert(0,str(ROOT))
import render_to_websocket as a
prefs=types.SimpleNamespace(mode='SERVER',server_on=True,host='127.0.0.1',port=0,enabled=False,url='',replay_cache_mb=16)
a.get_prefs=lambda:prefs;a.register()
scene=bpy.context.scene;scene.rtws_pointer.origin=bpy.data.objects['Cube']
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=128
scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
folder=ROOT/'.browser-e2e';folder.mkdir(exist_ok=True)
ready=folder/'render-ready';ready.unlink(missing_ok=True)
result={};started=time.monotonic();render_started=False

def worker():
 try:
  process=subprocess.run(['node',str(ROOT/'test_browser_render.mjs'),f'ws://127.0.0.1:{a.SERVER.port}'],capture_output=True,text=True,timeout=60,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
  result.update(ok=process.returncode==0,output=process.stdout,error=process.stderr)
 except Exception:result.update(ok=False,error=traceback.format_exc())
threading.Thread(target=worker,daemon=True).start()
def tick():
 global render_started
 if ready.exists() and not render_started:
  render_started=True;bpy.ops.render.render('INVOKE_DEFAULT')
 a._scene_objects_tick()
 if result or time.monotonic()-started>65:
  if not result:result.update(ok=False,error='Fixture timed out')
  (folder/'render_verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
  print(json.dumps(result),flush=True);a.unregister();os._exit(0 if result['ok'] else 1)
 return .05
bpy.app.timers.register(tick,first_interval=.2)
