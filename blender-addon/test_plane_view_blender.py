import sys,os,traceback
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from render_to_websocket import plane_view
from render_to_websocket.pointer_control import RTWS_PointerSettings
from types import SimpleNamespace
bpy.utils.register_class(RTWS_PointerSettings)
bpy.types.Scene.rtws_pointer=bpy.props.PointerProperty(type=RTWS_PointerSettings)
s=bpy.context.scene;s.rtws_pointer.origin=bpy.data.objects['Cube'];s.rtws_pointer.width=8;s.rtws_pointer.height=6
bpy.data.objects['Cube'].select_set(True)
count=[0];errors=[];original=plane_view._draw

def draw():
 try:original();count[0]+=1
 except Exception:errors.append(traceback.format_exc())
plane_view._draw=draw
plane_view.register(SimpleNamespace(client_planes={'test':'XZ'}))
def done():
 plane_view.unregister()
 (ROOT/'plane_view_verification.log').write_text(str(dict(draws=count[0],errors=errors)),encoding='utf-8')
 os._exit(0 if count[0]>0 and not errors else 1)
bpy.app.timers.register(done,first_interval=4)
for screen in bpy.data.screens:
 for area in screen.areas:area.tag_redraw()
