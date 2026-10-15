"""Advertise active-scene objects and make a selected object follow a pointer Empty."""
import threading
import uuid
import bpy
from mathutils import Vector
from .pointer_control import new_empty, valid_object, ancestors

FOLLOW_ROOT = 'rtws_pointer_follow_root'
MAX_OBJECTS = 4096


def _main_thread():
    if threading.current_thread() is not threading.main_thread():
        raise RuntimeError('Scene object discovery and attachment require Blender main thread')


def _object_id(obj):
    uid = getattr(obj, 'session_uid', None)
    return f'object-{uid}' if uid is not None else f'object-{obj.as_pointer():x}'


def _pivot(obj):
    if obj.type in {'MESH', 'CURVE', 'SURFACE', 'FONT', 'META', 'VOLUME'}:
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        points = [evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box]
        if points:
            return Vector(((min(p.x for p in points) + max(p.x for p in points)) / 2,
                           (min(p.y for p in points) + max(p.y for p in points)) / 2,
                           min(p.z for p in points)))
    return obj.matrix_world.translation.copy()


class SceneObjectCatalog:
    def __init__(self):
        self.reset()

    def reset(self):
        self.scene = None
        self.scene_id = None
        self.revision = 0
        self._data = None
        self._objects = {}
        self.message = None

    def refresh(self, scene, recording=False, rendering=False):
        _main_thread()
        if scene != self.scene:
            self.reset()
            self.scene, self.scene_id = scene, uuid.uuid4().hex
        objects = sorted(scene.objects, key=lambda obj: (obj.name.casefold(), _object_id(obj)))[:MAX_OBJECTS]
        self._objects = {_object_id(obj): obj for obj in objects}
        settings = scene.rtws_pointer
        data = dict(scene=dict(id=self.scene_id, name=scene.name),
            objects=[dict(id=_object_id(obj), name=obj.name, object_type=obj.type,
                          parent_id=_object_id(obj.parent) if obj.parent else None,
                          is_control_root=bool(obj.get(FOLLOW_ROOT)),
                          can_follow=bool(obj.is_editable and not recording and not rendering),
                          reason='Recording in progress' if recording else 'Rendering in progress' if rendering else '' if obj.is_editable else 'Object is read-only') for obj in objects],
            total=len(scene.objects), truncated=len(scene.objects) > MAX_OBJECTS,
            pointer=dict(origin_id=_object_id(settings.origin) if valid_object(settings.origin, scene) else None,
                         target_id=_object_id(settings.target) if valid_object(settings.target, scene) else None,
                         followed_object_id=_object_id(settings.followed) if valid_object(settings.followed, scene) and valid_object(settings.target, scene) and settings.target in tuple(ancestors(settings.followed)) else None,
                         enabled=settings.enabled, use_browser_plane=settings.remote_plane,
                         plane=settings.plane, width=settings.width, height=settings.height,
                         recording=recording, rendering=rendering),
            planes={'x': 'YZ', 'y': 'XZ', 'z': 'XY'},
            capabilities=['pointer_follow', 'pointer_plane_set', 'scene_objects_request'])
        if data != self._data:
            self.revision += 1
            self._data = data
            self.message = dict(type='scene_objects', version=1, revision=self.revision, **data)
        return self.message

    def follow(self, scene, request, recording=False):
        _main_thread()
        self.refresh(scene, recording)
        if request['scene_id'] != self.scene_id or request['revision'] != self.revision:
            raise ValueError('Object list changed; refresh it and choose the object again')
        if recording:
            raise ValueError('Stop recording before changing the followed object')
        obj = self._objects.get(request['object_id'])
        if not valid_object(obj, scene):
            raise ValueError('Selected object is no longer in the active scene')
        if not obj.is_editable:
            raise ValueError('Selected object is read-only')
        settings = scene.rtws_pointer
        target = settings.target
        # Preserve an existing rig hierarchy if it already follows the target.
        already = valid_object(target, scene) and target.type == 'EMPTY' and target in tuple(ancestors(obj))
        if already:
            root = target
        elif obj.type == 'EMPTY':
            root = obj
        else:
            position = _pivot(obj)
            root = new_empty(scene, 'WebSocket Control - ' + obj.name)
            root.matrix_world.translation = position
            world = obj.matrix_world.copy()
            obj.parent = root
            obj.matrix_parent_inverse = root.matrix_world.inverted()
            obj.matrix_world = world
        if not root.is_editable:
            raise ValueError('Existing control Empty is read-only')
        root[FOLLOW_ROOT] = True
        # A new selection gets an independent plane anchor at its root. Never
        # anchor the plane to an object that the same pointer is moving.
        origin = settings.origin
        dependent = not valid_object(origin, scene) or root in tuple(ancestors(origin))
        if dependent or (not already and (origin.matrix_world.translation - root.matrix_world.translation).length > 1e-5):
            origin = bpy.data.objects.new('WebSocket Origin', None)
            origin.empty_display_type = 'PLAIN_AXES'; origin.empty_display_size = .35
            origin['rtws_pointer_origin_helper'] = True
            scene.collection.objects.link(origin)
            origin.matrix_world.translation = root.matrix_world.translation
        settings.origin = origin
        settings.target = root
        settings.followed = obj
        settings.enabled = request.get('enable', settings.enabled)
        bpy.context.view_layer.update()
        self.refresh(scene, recording)
        return dict(type='pointer_follow_result', request_id=request['request_id'], ok=True,
                    scene_id=self.scene_id, revision=self.revision, object_id=_object_id(obj),
                    target_id=_object_id(root), origin_id=_object_id(origin), already_following=already,
                    enabled=settings.enabled, message=f'{obj.name} follows {root.name}')

    def set_plane(self, scene, request, recording=False):
        _main_thread()
        self.refresh(scene, recording)
        if request['scene_id'] != self.scene_id or request['revision'] != self.revision:
            raise ValueError('Plane settings changed; refresh scene_objects and try again')
        if recording:
            raise ValueError('Stop recording before changing plane dimensions')
        scene.rtws_pointer.width = request['width']
        scene.rtws_pointer.height = request['height']
        self.refresh(scene, recording)
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == 'VIEW_3D':
                    area.tag_redraw()
        return dict(type='pointer_plane_set_result', request_id=request['request_id'], ok=True,
                    scene_id=self.scene_id, revision=self.revision,
                    width=scene.rtws_pointer.width, height=scene.rtws_pointer.height)
