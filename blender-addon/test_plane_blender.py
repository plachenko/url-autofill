import asyncio,json,sys,types,math
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import render_to_websocket as a
from render_to_websocket.plane_view import plane_corners
from websockets.asyncio.client import connect
p=types.SimpleNamespace(mode='SERVER',server_on=True,host='127.0.0.1',port=0,enabled=False,url='',replay_cache_mb=16)
a.get_prefs=lambda:p;a.register()
s=bpy.context.scene;cfg=s.rtws_pointer
cfg.origin=bpy.data.objects['Cube'];cfg.origin.location=(2,3,4)
cfg.target=bpy.data.objects.new('Control',None);s.collection.objects.link(cfg.target)
cfg.enabled=True;cfg.remote_plane=False;cfg.plane='XZ'
bpy.context.view_layer.update();a._scene_objects_tick()
async def read(ws,kind):
 while True:
  try:msg=json.loads(await asyncio.wait_for(ws.recv(),4))
  except ValueError:continue
  if msg.get('type')==kind:return msg
async def main():
 async with connect(f'ws://127.0.0.1:{a.SERVER.port}') as ws:
  catalog=await read(ws,'scene_objects')
  command=dict(type='pointer_plane_set',request_id='resize',scene_id=catalog['scene']['id'],revision=catalog['revision'],width=8,height=6)
  await ws.send(json.dumps(command));await ws.send('barrier')
  while await ws.recv()!='barrier':pass
  a._scene_objects_tick()
  result=await read(ws,'pointer_plane_set_result');assert result['ok'],result
  assert cfg.width==8 and cfg.height==6
  for plane in ('XY','XZ','YZ'):
   points=plane_corners(s,plane);assert len(points)==4
   assert abs((points[1]-points[0]).length-8)<1e-5
   assert abs((points[2]-points[1]).length-6)<1e-5
   assert (sum(points,Vector())/4-cfg.origin.matrix_world.translation).length<1e-5
  cfg.local_axes=True;cfg.origin.rotation_euler.z=math.pi/2;bpy.context.view_layer.update()
  points=plane_corners(s,'XZ');assert abs((points[1]-points[0]).y-8)<1e-5
  cfg.local_axes=False
  point=dict(id=1,x=1,y=0,kind='touch',pressure=.5)
  a.SERVER.pointers.submit('test',dict(type='pointer_positions',phase='down',changed=point,pointers=[point]))
  a._pointer_tick();bpy.context.view_layer.update()
  assert (cfg.target.matrix_world.translation-Vector((6,3,7))).length<1e-5
  await ws.send(json.dumps(command));await ws.send('barrier')
  while await ws.recv()!='barrier':pass
  a._scene_objects_tick();result=await read(ws,'pointer_plane_set_result');assert not result['ok']
 print('BLENDER_PLANE_OK: websocket resize, acknowledgement, stale revision, all plane bounds, local rotation, movement scaling')
try:asyncio.run(main())
finally:a.unregister()
