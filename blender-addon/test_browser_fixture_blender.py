"""Disposable live Blender fixture for browser E2E checks. Never saves the opened rig.
Run factory-startup with --python this file -- --port 18781 [--rig path].
Commands and observations live under .browser-e2e (ignored); exits after 20 minutes.
"""
import argparse,json,os,sys,time,traceback,types
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=18781);parser.add_argument('--rig')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
if args.rig:bpy.ops.wm.open_mainfile(filepath=str(Path(args.rig).resolve()))
import render_to_websocket as a
from render_to_websocket.plane_view import plane_corners
from render_to_websocket.recording import location_curves
prefs=types.SimpleNamespace(mode='SERVER',server_on=True,host='127.0.0.1',port=args.port,enabled=False,url='',replay_cache_mb=16)
a.get_prefs=lambda:prefs;a.register()
folder=ROOT/'.browser-e2e';folder.mkdir(exist_ok=True)
command_path=folder/'command.json';state_path=folder/'state.json'
command_path.unlink(missing_ok=True)
scene=bpy.context.scene;cfg=scene.rtws_pointer
# A real rig can be supplied; otherwise build a small comparable hierarchy.
if not args.rig:
 ball=bpy.data.objects.get('Cube');ball.name='Ball'
 root=bpy.data.objects.new('Ball_Control',None);scene.collection.objects.link(root)
 deform=bpy.data.objects.new('Ball_Deform',None);scene.collection.objects.link(deform)
 ball.parent=deform;deform.parent=root;cfg.target=root
 origin=bpy.data.objects.new('PointerOrigin',None);scene.collection.objects.link(origin);cfg.origin=origin
bpy.ops.mesh.primitive_cube_add(location=(4,0,1));bpy.context.view_layer.objects.active.name='Ordinary Mesh'
cfg.remote_plane=True;cfg.width=6;cfg.height=2;cfg.hover=False;cfg.enabled=False
# Advertise a genuinely linked/read-only object, created only in the ignored fixture folder.
linked=bpy.data.objects.new('Linked Read Only',bpy.data.meshes.new('Linked Mesh'))
library_path=folder/'readonly.blend';bpy.data.libraries.write(str(library_path),{linked})
bpy.data.objects.remove(linked,do_unlink=True)
with bpy.data.libraries.load(str(library_path),link=True) as (source,destination):
 destination.objects=['Linked Read Only']
for linked in destination.objects:scene.collection.objects.link(linked)
last_id=None;action_error=None;started=time.monotonic();history=[];last_pose=None

def tick():
 global last_id,action_error,last_pose
 try:
  scene=bpy.context.scene;cfg=scene.rtws_pointer
  if command_path.exists():
   try:command=json.loads(command_path.read_text(encoding='utf-8'))
   except (OSError,ValueError):command={}
   if command.get('id') and command['id']!=last_id:
    last_id=command['id'];action_error=None
    try:
     kind=command['action']
     if kind=='stop':a.unregister();os._exit(0)
     elif kind=='settings':
      for key,value in command['values'].items():
       if key not in {'width','height','remote_plane','plane','local_axes','enabled','hover'}:raise ValueError(key)
       setattr(cfg,key,value)
     elif kind=='rotate_origin':cfg.origin.rotation_euler=command['value']
     elif kind=='rename':bpy.data.objects[command['name']].name=command['new_name']
     elif kind=='delete':bpy.data.objects.remove(scene.objects[command['name']],do_unlink=True)
     elif kind=='record_start':a.RECORDER.start(scene)
     elif kind=='record_stop':a.RECORDER.stop()
     elif kind=='new_scene':
      a.RECORDER.stop();a.SERVER.pointers.clear();a.POINTER.reset()
      bpy.context.window.scene=bpy.data.scenes.new('Browser Test Scene')
     elif kind=='send_fixture_file':
      image=bpy.data.images.new('Browser Transfer Fixture',width=4,height=4)
      image.generated_color=(.2,.5,.8,1)
      image.filepath_raw=str(folder/'browser-preview.png');image.file_format='PNG';image.save()
      a.SERVER.send_file(image.filepath_raw,'image/png')
      bpy.data.images.remove(image)
     elif kind=='pause_commands':
      if bpy.app.timers.is_registered(a._scene_objects_tick):bpy.app.timers.unregister(a._scene_objects_tick)
     elif kind=='resume_commands':
      if not bpy.app.timers.is_registered(a._scene_objects_tick):bpy.app.timers.register(a._scene_objects_tick,first_interval=.01,persistent=True)
     else:raise ValueError(kind)
    except Exception:action_error=traceback.format_exc()
  bpy.context.view_layer.update()
  scene=bpy.context.scene;cfg=scene.rtws_pointer
  target=cfg.target;origin=cfg.origin
  pose=(tuple(target.matrix_world.translation) if target else None,tuple(sorted(a.POINTER.client_planes.values())),len(a.POINTER.bindings),a.RECORDER.frame if a.RECORDER.running else None)
  if pose!=last_pose:
   last_pose=pose;history.append(dict(t=time.monotonic()-started,position=pose[0],planes=pose[1],contacts=pose[2],frame=pose[3]))
   history[:]=history[-200:]
  state=dict(port=a.SERVER.port,action_id=last_id,action_error=action_error,catalog=a.SCENE_OBJECTS.message,
   objects={obj.name:dict(position=list(obj.matrix_world.translation),parent=obj.parent.name if obj.parent else None,
    matrix=[list(row) for row in obj.matrix_world],editable=obj.is_editable) for obj in scene.objects},
   target=target.name if target else None,origin=origin.name if origin else None,
   origin_position=list(origin.matrix_world.translation) if origin else None,
   origin_rotation=list(origin.rotation_euler) if origin else None,
   corners={plane:[list(v) for v in plane_corners(scene,plane)] for plane in ('XY','XZ','YZ')},
   bindings=len(a.POINTER.bindings),history=history,
   keys={obj.name:{str(curve.array_index):[list(key.co) for key in curve.keyframe_points][-20:] for curve in location_curves(obj)} for obj in scene.objects if obj.animation_data})
  temporary=folder/'state.tmp';temporary.write_text(json.dumps(state),encoding='utf-8');temporary.replace(state_path)
 except Exception:
  (folder/'error.log').write_text(traceback.format_exc(),encoding='utf-8')
 if time.monotonic()-started>1200:a.unregister();os._exit(0)
 return .1
bpy.app.timers.register(tick,first_interval=.1)


if bpy.app.background:
 next_scene_tick=0
 while True:
  a._pointer_tick()
  if time.monotonic()>=next_scene_tick and bpy.app.timers.is_registered(a._scene_objects_tick):
   a._scene_objects_tick();next_scene_tick=time.monotonic()+.5
  tick()
  time.sleep(.02)
