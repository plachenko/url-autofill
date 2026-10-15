"""Actual Blender object discovery, socket selection, and visible-object following."""
import asyncio,json,sys,threading,types
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parent;sys.path.insert(0,str(ROOT))
import render_to_websocket as a
from websockets.asyncio.client import connect
p=types.SimpleNamespace(mode='SERVER',server_on=True,host='127.0.0.1',port=0,enabled=False,url='',replay_cache_mb=16)
a.get_prefs=lambda:p;a.register()
s=bpy.context.scene;cfg=s.rtws_pointer;cfg.width=cfg.height=2;cfg.remote_plane=False;cfg.plane='XZ'
obj=bpy.data.objects['Cube'];parent=bpy.data.objects.new('Previous Parent',None);s.collection.objects.link(parent)
parent.location=(2,3,4);parent.rotation_euler.z=.3;parent.scale=(1.2,1.2,1.2);obj.parent=parent
bpy.context.view_layer.update();before=obj.matrix_world.copy();a._scene_objects_tick()
async def read(ws,kind):
 while True:
  wire=await asyncio.wait_for(ws.recv(),4)
  try:m=json.loads(wire)
  except ValueError:continue
  if m.get('type')==kind:return m
async def select(ws,catalog,identity,tag):
 await ws.send(json.dumps(dict(type='pointer_follow',request_id=tag,scene_id=catalog['scene']['id'],revision=catalog['revision'],object_id=identity,enable=True)))
 await ws.send('barrier')
 while await ws.recv()!='barrier':pass
 a._scene_objects_tick()
 return await read(ws,'pointer_follow_result')
async def main():
 async with connect(f'ws://127.0.0.1:{a.SERVER.port}') as ws:
  catalog=await read(ws,'scene_objects');assert catalog['planes']=={'x':'YZ','y':'XZ','z':'XY'}
  row=next(row for row in catalog['objects'] if row['name']=='Cube');identity=row['id'];assert row['can_follow']
  result=await select(ws,catalog,identity,'first');assert result['ok'],result
  root=cfg.target;assert obj.parent==root and root.type=='EMPTY' and cfg.origin!=obj
  assert max(abs(obj.matrix_world[i][j]-before[i][j]) for i in range(4) for j in range(4))<.0001
  count=len(s.objects);result=await select(ws,a.SCENE_OBJECTS.refresh(s),identity,'again')
  assert result['ok'] and result['already_following'] and len(s.objects)==count
  point=dict(id=1,x=1,y=.5,kind='touch',pressure=.5)
  await ws.send(json.dumps(dict(type='pointer_positions',plane='y',phase='down',changed=point,pointers=[point])))
  await ws.send('barrier')
  while await ws.recv()!='barrier':pass
  a._pointer_tick();bpy.context.view_layer.update()
  assert (obj.matrix_world.translation-before.translation-Vector((1,0,0))).length<.0001
  stale=a.SCENE_OBJECTS.refresh(s);obj.name='Renamed Ball';a._scene_objects_tick()
  fresh=await read(ws,'scene_objects');assert next(row for row in fresh['objects'] if row['name']=='Renamed Ball')['id']==identity
  result=await select(ws,stale,identity,'stale');assert not result['ok'] and 'changed' in result['message']
  a.RECORDER.start(s);a._scene_objects_tick();busy=await read(ws,'scene_objects')
  assert busy['pointer']['recording'] and not any(row['can_follow'] for row in busy['objects'])
  result=await select(ws,busy,identity,'busy');assert not result['ok'] and 'recording' in result['message'].lower()
  a.RECORDER.stop();a._scene_objects_tick();fresh=await read(ws,'scene_objects')
  parent_id=next(row['id'] for row in fresh['objects'] if row['name']=='Previous Parent')
  result=await select(ws,fresh,parent_id,'switch');assert result['ok'],result
  assert cfg.target==parent and obj.parent==root
  previous=obj.matrix_world.translation.copy()
  first=dict(id=1,x=.5,y=.5,kind='touch',pressure=.5);second=dict(id=2,x=1,y=0,kind='touch',pressure=.5)
  a.SERVER.pointers.submit('pool',dict(type='pointer_positions',phase='down',changed=second,pointers=[first,second]))
  a._pointer_tick();bpy.context.view_layer.update();assert root not in a.POINTER.bindings.values()
  assert (obj.matrix_world.translation-previous).length<.0001
  bpy.ops.render_to_websocket.clear_pointer_empties();assert s.objects.get(root.name) and obj.parent==root
  errors=[]
  def wrong_thread():
   try:a.SCENE_OBJECTS.refresh(s)
   except RuntimeError as exc:errors.append(str(exc))
  worker=threading.Thread(target=wrong_thread);worker.start();worker.join();assert errors
 print('BLENDER_SCENE_OBJECTS_OK: advertised IDs, socket follow, world pose, real object movement, existing rig, rename, stale list, recording guard, protected roots, thread guard')
try:asyncio.run(main())
finally:a.unregister()
