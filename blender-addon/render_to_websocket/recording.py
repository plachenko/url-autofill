"""Real-time pointer takes stored as ordinary Blender location keyframes."""
import math
import time
import bpy


def location_curves(obj):
    animation = obj.animation_data
    action = animation.action if animation else None
    if not action:
        return []
    if getattr(action, 'is_action_layered', False):
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                if hasattr(strip, 'channelbag') and animation.action_slot:
                    bag = strip.channelbag(animation.action_slot)
                    if bag:
                        curves.extend(curve for curve in bag.fcurves if curve.data_path == 'location')
        return curves
    return [curve for curve in action.fcurves if curve.data_path == 'location']


def key_location(obj, frame):
    if not obj.keyframe_insert(data_path='location', frame=frame, group='Pointer Recording'):
        raise RuntimeError(f'Could not keyframe {obj.name}')
    for curve in location_curves(obj):
        points = curve.keyframe_points
        low, high = 0, len(points)
        while low < high:
            middle = (low + high) // 2
            if points[middle].co.x < frame - .0001:
                low = middle + 1
            else:
                high = middle
        if low < len(points) and abs(points[low].co.x - frame) < .0001:
            points[low].interpolation = 'LINEAR'


class PointerRecorder:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.running = False
        self.scene = None
        self.objects = {}
        self.status = 'Ready to record from the current frame'
        self.frame = None

    def _track(self, obj, baseline):
        if obj.as_pointer() in self.objects:
            return
        animation = obj.animation_data_create()
        if any(driver.data_path == 'location' for driver in animation.drivers):
            raise RuntimeError(f'{obj.name} has a location driver; choose an undriven Empty')
        if animation.use_tweak_mode:
            raise RuntimeError(f'Exit NLA tweak mode for {obj.name} before recording')
        previous = animation.action
        action = previous.copy() if previous else bpy.data.actions.new('Pointer Take ' + obj.name)
        action.name = 'Pointer Take ' + obj.name
        action.use_fake_user = True
        if previous:
            previous.use_fake_user = True
            obj['rtws_previous_action'] = previous.name
        animation.action = action
        obj.location = baseline
        key_location(obj, self.start_frame)
        if self.frame > self.start_frame:
            key_location(obj, self.frame - 1)
        obj['rtws_pointer_recorded'] = True
        self.objects[obj.as_pointer()] = dict(obj=obj, location=tuple(baseline), last_frame=self.start_frame)

    def start(self, scene):
        if self.running:
            raise RuntimeError('A pointer recording is already running')
        settings = scene.rtws_pointer
        if not settings.enabled or settings.origin is None:
            raise RuntimeError('Enable pointer control and select an origin object first')
        from .pointer_control import valid_object, ancestors
        if not valid_object(settings.origin, scene):
            raise RuntimeError('Choose an origin object in this scene')
        if settings.target and (not valid_object(settings.target, scene) or settings.target.type != 'EMPTY'):
            raise RuntimeError('Choose a target Empty in this scene')
        if settings.target and settings.target in tuple(ancestors(settings.origin)):
            raise RuntimeError('Origin must be independent of the target Empty')
        if settings.target and not settings.target.is_editable:
            raise RuntimeError('Target Empty must be editable')
        self.scene = scene
        self.objects = {}
        self.fps = scene.render.fps / scene.render.fps_base
        self.start_frame = self.frame = scene.frame_current
        self.started = self.clock()
        self.running = True
        self.set_range = settings.record_set_range
        try:
            if settings.target:
                self._track(settings.target, tuple(settings.target.location))
        except Exception:
            self.running = False
            raise
        self.status = f'Recording from frame {self.start_frame} at {self.fps:g} fps'

    def advance(self, scene):
        if not self.running:
            return
        if scene != self.scene:
            self.stop(reason='Stopped: active scene changed')
            return
        if not scene.rtws_pointer.enabled:
            self.stop(reason='Stopped: pointer control disabled')
            return
        if abs(scene.render.fps / scene.render.fps_base - self.fps) > .00001:
            self.stop(reason='Stopped: scene frame rate changed')
            return
        frame = min(1048574, self.start_frame + max(0, math.floor((self.clock() - self.started) * self.fps + 1e-6)))
        if frame > scene.frame_end:
            scene.frame_end = frame
        if frame < scene.frame_start:
            scene.frame_start = frame
        self.frame = frame
        if scene.frame_current != frame or scene.frame_subframe:
            scene.frame_set(frame)
        # Hold the most recent live pose rather than evaluating copied future keys
        # while a contact is released or a connection is temporarily absent.
        for item in self.objects.values():
            item['obj'].location = item['location']

    def capture(self, driven):
        if not self.running:
            return
        for obj, baseline in driven.values():
            current = tuple(obj.location)
            self._track(obj, baseline)
            obj.location = current
        for item in self.objects.values():
            obj = item['obj']
            current = tuple(obj.location)
            if item['last_frame'] != self.frame or current != item['location']:
                key_location(obj, self.frame)
            item.update(location=current, last_frame=self.frame)
        self.status = f'Recording frame {self.frame} | {len(self.objects)} Empty(s) | {(self.frame - self.start_frame) / self.fps:.1f}s'
        if self.frame == 1048574:
            self.stop(reason='Stopped at Blender maximum frame')

    def stop(self, reason=None):
        if not self.running:
            return
        self.running = False
        try:
            scene = self.scene
            if scene and self.set_range and self.objects:
                scene.frame_start = self.start_frame
                scene.frame_end = max(self.start_frame, self.frame)
            if scene and hasattr(scene, 'rtws_pointer'):
                scene.rtws_pointer.enabled = False
            self.status = reason or f'Recorded frames {self.start_frame}-{self.frame} on {len(self.objects)} Empty(s); ready to play or render'
        except ReferenceError:
            self.status = reason or 'Recording stopped'
        self.objects.clear()
        self.scene = None


class RTWS_OT_record_start(bpy.types.Operator):
    bl_idname = 'render_to_websocket.record_start'
    bl_label = 'Start Recording'
    bl_description = 'Record pointer Empty locations in real time from the current frame using the scene frame rate'

    def execute(self, context):
        from . import RECORDER, SERVER
        if not SERVER.running or bpy.app.is_job_running('RENDER'):
            self.report({'ERROR'}, 'Start the WebSocket server and finish rendering first')
            return {'CANCELLED'}
        if context.screen and context.screen.is_animation_playing:
            self.report({'ERROR'}, 'Stop timeline playback before recording')
            return {'CANCELLED'}
        try:
            RECORDER.start(context.scene)
        except Exception as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        return {'FINISHED'}


class RTWS_OT_record_stop(bpy.types.Operator):
    bl_idname = 'render_to_websocket.record_stop'
    bl_label = 'Stop Recording'
    bl_description = 'Finish the take and turn off live pointer control so the animation can play or render'

    def execute(self, context):
        from . import RECORDER, SERVER, POINTER, _pointer_tick
        _pointer_tick()
        RECORDER.stop()
        SERVER.pointers.clear()
        POINTER.reset()
        self.report({'INFO'}, RECORDER.status)
        return {'FINISHED'}
