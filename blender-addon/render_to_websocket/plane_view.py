"""Selected pointer plane overlay; shares the movement controller's mapping."""
import bpy
from mathutils import Vector
from .pointers import plane_offset
from .pointer_control import valid_object

_handle = None
_controller = None


def plane_corners(scene, plane, depsgraph=None):
    settings = scene.rtws_pointer
    if not valid_object(settings.origin, scene):
        return []
    origin = settings.origin.evaluated_get(depsgraph).matrix_world if depsgraph else settings.origin.matrix_world
    result = []
    for x, y in ((0, 0), (1, 0), (1, 1), (0, 1)):
        offset = Vector(plane_offset(x, y, plane, settings.width, settings.height))
        if settings.local_axes:
            offset = origin.to_quaternion() @ offset
        result.append(origin.translation + offset)
    return result


def _draw():
    context = bpy.context
    if not context.scene or not hasattr(context.scene, 'rtws_pointer'):
        return
    if context.space_data.type != 'VIEW_3D' or not context.space_data.overlay.show_overlays:
        return
    settings = context.scene.rtws_pointer
    if not any(valid_object(obj, context.scene) and obj.select_get() for obj in
               (settings.origin, settings.target, settings.followed)):
        return
    import gpu
    from gpu_extras.batch import batch_for_shader
    planes = set(_controller.client_planes.values()) if settings.remote_plane and _controller else set()
    planes = planes or {settings.plane}
    shader = gpu.shader.from_builtin('POLYLINE_UNIFORM_COLOR')
    blend, depth = gpu.state.blend_get(), gpu.state.depth_test_get()
    try:
        gpu.state.blend_set('ALPHA')
        gpu.state.depth_test_set('NONE')
        for plane in sorted(planes):
            corners = plane_corners(context.scene, plane, context.evaluated_depsgraph_get())
            if not corners:
                continue
            edges = [point for i in range(4) for point in (corners[i], corners[(i + 1) % 4])]
            edges += [(corners[0] + corners[1]) / 2, (corners[2] + corners[3]) / 2,
                      (corners[1] + corners[2]) / 2, (corners[3] + corners[0]) / 2]
            batch = batch_for_shader(shader, 'LINES', {'pos': edges})
            shader.bind()
            shader.uniform_float('viewportSize', gpu.state.viewport_get()[2:])
            shader.uniform_float('lineWidth', 2.0)
            shader.uniform_float('color', {'XY': (.25, .55, 1, .8), 'XZ': (.25, 1, .45, .8), 'YZ': (1, .35, .25, .8)}[plane])
            batch.draw(shader)
    finally:
        gpu.state.depth_test_set(depth)
        gpu.state.blend_set(blend)


def register(controller):
    global _handle, _controller
    _controller = controller
    if _handle is None and not bpy.app.background:
        _handle = bpy.types.SpaceView3D.draw_handler_add(_draw, (), 'WINDOW', 'POST_VIEW')


def unregister():
    global _handle, _controller
    if _handle is not None:
        bpy.types.SpaceView3D.draw_handler_remove(_handle, 'WINDOW')
    _handle = _controller = None
