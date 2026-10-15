"""Scene-local pointer settings and Empty movement; call tick only on Blender's main thread."""
import threading
import bpy
from mathutils import Vector
from .pointers import plane_offset, resolve_plane

OWNED = 'rtws_pointer_generated'
MAX_EMPTIES = 64


def empty_only(self, obj):
    return obj.type == 'EMPTY'


class RTWS_PointerSettings(bpy.types.PropertyGroup):
    remote_plane: bpy.props.BoolProperty(name='Use browser plane', default=True,
        description='Use X/Y/Z from the browser overlay; disable to lock movement to the Blender plane setting')
    record_set_range: bpy.props.BoolProperty(name='Set scene range to recording', default=True,
        description='On Stop, use the recorded start/end frames as the scene render range')
    enabled: bpy.props.BoolProperty(name='Enable pointer control', default=False)
    origin: bpy.props.PointerProperty(name='Origin object', type=bpy.types.Object,
        description='Pad center is the evaluated world position of this scene object')
    followed: bpy.props.PointerProperty(name='Followed object', type=bpy.types.Object,
        description='Object selected through the browser to follow the pointer control Empty')
    target: bpy.props.PointerProperty(name='Target Empty', type=bpy.types.Object, poll=empty_only,
        description='The first active contact controls this Empty; other contacts use separate generated Empties')
    plane: bpy.props.EnumProperty(name='Movement plane', default='XY', items=[
        ('XY', 'XY (normal Z)', 'Pad X/Y move along world X/Y'),
        ('XZ', 'XZ (normal Y)', 'Pad X/Y move along world X/Z'),
        ('YZ', 'YZ (normal X)', 'Pad X/Y move along world Y/Z')])
    width: bpy.props.FloatProperty(name='Width', default=10, min=.001, max=1000000, unit='LENGTH')
    height: bpy.props.FloatProperty(name='Height', default=10, min=.001, max=1000000, unit='LENGTH')
    local_axes: bpy.props.BoolProperty(name='Use origin object rotation', default=False,
        description='Rotate the selected plane with the origin object; dimensions remain in world units')
    hover: bpy.props.BoolProperty(name='Mouse hover moves Empty', default=True,
        description='Use mouse hover when no contacts are down')


def valid_object(obj, scene):
    try:
        return obj is not None and scene.objects.get(obj.name) == obj
    except ReferenceError:
        return False


def ancestors(obj):
    while obj:
        yield obj
        obj = obj.parent


def new_empty(scene, name):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = .35
    obj[OWNED] = True
    scene.collection.objects.link(obj)
    return obj


class PointerController:
    def __init__(self):
        self.bindings = {}
        self.signature = None
        self.client_planes = {}
        self.status = 'Pointer control disabled'
        self.last_hover = None
        self.moved = False
        self.driven = {}

    def reset(self):
        self.bindings.clear()
        self.signature = None
        self.client_planes = {}
        self.last_hover = None
        self.moved = False
        self.driven = {}

    def _object(self, key, scene, settings):
        existing = self.bindings.get(key)
        if valid_object(existing, scene) and existing != settings.origin:
            return existing
        used = {obj.as_pointer() for obj in self.bindings.values() if valid_object(obj, scene)}
        if valid_object(settings.target, scene) and settings.target.type == 'EMPTY' and settings.target.as_pointer() not in used:
            obj = settings.target
        else:
            pool = [obj for obj in scene.objects if obj.type == 'EMPTY' and obj.get(OWNED) and not obj.get('rtws_pointer_follow_root') and not obj.children and
                    obj not in tuple(ancestors(settings.origin)) and obj != settings.target]
            obj = next((obj for obj in pool if obj.as_pointer() not in used), None)
            if obj is None:
                if len(pool) >= MAX_EMPTIES:
                    return None
                obj = new_empty(scene, 'WebSocket Pointer')
                obj.matrix_world.translation = settings.origin.matrix_world.translation
                self.moved = True
        self.bindings[key] = obj
        return obj

    def tick(self, inbox, scene, depsgraph=None):
        if threading.current_thread() is not threading.main_thread():
            raise RuntimeError('Pointer scene updates must run on Blender main thread')
        self.moved = False
        self.driven = {}
        states, ended = inbox.snapshot()
        settings = scene.rtws_pointer
        signature = (scene.as_pointer(), settings.enabled,
            settings.origin.as_pointer() if settings.origin else 0,
            settings.target.as_pointer() if settings.target else 0,
            settings.plane, settings.width, settings.height, settings.local_axes, settings.hover, settings.remote_plane)
        if signature != self.signature:
            self.reset()
            self.signature = signature
        if not settings.enabled:
            self.status = 'Pointer control disabled'
            return
        if not valid_object(settings.origin, scene):
            self.bindings.clear()
            self.status = 'Choose an origin object in this scene'
            return
        if settings.target and (not valid_object(settings.target, scene) or settings.target.type != 'EMPTY'):
            self.bindings.clear()
            self.status = 'Target must be an Empty in this scene'
            return
        for ancestor in ancestors(settings.origin):
            if ancestor == settings.target or any(ancestor == obj for obj in self.bindings.values()):
                self.bindings.clear()
                self.status = 'Origin must be independent of the controlled Empties'
                return
        origin = settings.origin.evaluated_get(depsgraph).matrix_world if depsgraph else settings.origin.matrix_world.copy()
        planes = {client: resolve_plane(frame.plane, settings.plane) if settings.remote_plane else settings.plane
                  for client, frame in states.items()}
        for client, plane in planes.items():
            if client in self.client_planes and self.client_planes[client] != plane:
                self.bindings = {key: obj for key, obj in self.bindings.items() if key[0] != client}
                self.last_hover = None
        self.client_planes = planes
        contacts = {(client, point.id): point for client, frame in states.items() for point in frame.pointers}
        limited = False
        def move(key, point):
            nonlocal limited
            obj = self._object(key, scene, settings)
            if obj is None:
                limited = True
                return
            self.driven.setdefault(obj.as_pointer(), (obj, tuple(obj.location)))
            offset = Vector(plane_offset(point.x, point.y, planes.get(key[0], settings.plane), settings.width, settings.height))
            if settings.local_axes:
                offset = origin.to_quaternion() @ offset
            position = origin.translation + offset
            if (obj.matrix_world.translation - position).length > 1e-8:
                matrix = obj.matrix_world.copy()
                matrix.translation = position
                obj.matrix_world = matrix
                self.moved = True
            for name, value in [('id', point.id), ('kind', point.kind), ('pressure', point.pressure)]:
                key = 'rtws_pointer_' + name
                if obj.get(key) != value:
                    obj[key] = value
        # Apply a release's final coordinates before releasing its ownership.
        # Fast down/up pairs coalesced between timer ticks still place an Empty.
        for client, points in ended.items():
            for point in points:
                key = (client, point.id)
                if key not in contacts:
                    move(key, point)
        self.bindings = {key: obj for key, obj in self.bindings.items() if key in contacts and valid_object(obj, scene)}
        for key, point in contacts.items():
            move(key, point)
        hovering = next(((client, frame) for client, frame in reversed(list(states.items())) if frame.phase == 'hover'), None)
        if contacts:
            self.last_hover = hovering
        elif settings.hover and hovering and hovering != self.last_hover:
            self.last_hover = hovering
            client, frame = hovering
            move((client, frame.changed.id), frame.changed)
            self.bindings.clear()  # Hover never becomes an active contact.
        self.status = (f'{len(contacts)} active contact(s) from {sum(bool(frame.pointers) for frame in states.values())} client(s)' +
                       ('; generated Empty limit reached' if limited else ''))


class RTWS_OT_pointer_empty(bpy.types.Operator):
    bl_idname = 'render_to_websocket.pointer_empty'
    bl_label = 'Create Target Empty at Origin'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        settings = context.scene.rtws_pointer
        if not valid_object(settings.origin, context.scene):
            self.report({'ERROR'}, 'Choose an origin object in this scene first')
            return {'CANCELLED'}
        obj = new_empty(context.scene, 'WebSocket Target')
        obj.matrix_world.translation = settings.origin.evaluated_get(context.evaluated_depsgraph_get()).matrix_world.translation
        settings.target = obj
        return {'FINISHED'}


class RTWS_OT_clear_pointer_empties(bpy.types.Operator):
    bl_idname = 'render_to_websocket.clear_pointer_empties'
    bl_label = 'Clear Extra Pointer Empties'
    bl_options = {'REGISTER', 'UNDO'}
    bl_description = 'Remove generated extra Empties in this scene; preserve recorded Empties, the selected target and origin'

    def execute(self, context):
        settings = context.scene.rtws_pointer
        settings.enabled = False
        for obj in list(context.scene.objects):
            if obj.type == 'EMPTY' and obj.get(OWNED) and obj not in (settings.origin, settings.target) and not obj.get('rtws_pointer_recorded') and not obj.get('rtws_pointer_follow_root') and not obj.children:
                bpy.data.objects.remove(obj, do_unlink=True)
        return {'FINISHED'}


def draw_pointer_settings(layout, scene, status, recorder):
    box = layout.box()
    box.label(text='WebSocket Pointer Control', icon='EMPTY_AXIS')
    settings = scene.rtws_pointer
    box.prop(settings, 'enabled')
    box.prop(settings, 'origin')
    box.prop(settings, 'target')
    box.operator(RTWS_OT_pointer_empty.bl_idname, icon='ADD')
    box.prop(settings, 'remote_plane')
    box.prop(settings, 'plane')
    row = box.row(align=True)
    row.prop(settings, 'width'); row.prop(settings, 'height')
    box.prop(settings, 'local_axes')
    box.prop(settings, 'hover')
    box.label(text='Pad center = origin; up = positive second axis')
    recording = box.box()
    recording.label(text='Record pointer animation', icon='REC')
    recording.prop(settings, 'record_set_range')
    row = recording.row(align=True)
    start = row.row(align=True); start.enabled = not recorder.running
    start.operator('render_to_websocket.record_start', icon='REC')
    stop = row.row(align=True); stop.enabled = recorder.running
    stop.operator('render_to_websocket.record_stop', icon='PAUSE')
    recording.label(text=recorder.status[:150])
    recording.label(text='Starts at current frame; uses scene fps')
    recording.label(text='New take action; previous action preserved')
    box.label(text=status[:140])
    box.operator(RTWS_OT_clear_pointer_empties.bl_idname, icon='TRASH')
