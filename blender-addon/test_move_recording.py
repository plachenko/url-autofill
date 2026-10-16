import importlib.util
from pathlib import Path
import sys
import types
import unittest


class FakeObject:
    def __init__(self, identity, location):
        self.identity = identity
        self.location = tuple(location)

    def as_pointer(self):
        return self.identity


class FakeScene:
    def __init__(self, objects):
        self.objects = objects
        self.frame_start = 1
        self.frame_end = 10
        self.frames = []

    def frame_set(self, frame):
        self.frames.append(frame)
        for obj in self.objects:
            obj.location = (-99, -99, -99)  # Blender evaluates animation on frame changes.


class MoveRecordingTests(unittest.TestCase):
    def test_only_movement_advances_by_configured_frames_and_preserves_pose(self):
        fake_bpy = types.ModuleType('bpy')
        fake_bpy.types = types.SimpleNamespace(Operator=object)
        original = sys.modules.get('bpy')
        sys.modules['bpy'] = fake_bpy
        spec = importlib.util.spec_from_file_location('test_recording_module',
            Path(__file__).parent / 'render_to_websocket' / 'recording.py')
        recording = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(recording)
        finally:
            if original is None:
                del sys.modules['bpy']
            else:
                sys.modules['bpy'] = original
        first = FakeObject(1, (0, 0, 0))
        second = FakeObject(2, (5, 0, 0))
        scene = FakeScene([first, second])
        recorder = recording.PointerRecorder()
        recorder.running = True
        recorder.mode = 'move'
        recorder.frame_step = 4
        recorder.start_frame = recorder.frame = 10
        recorder.scene = scene
        recorder.objects = {1: dict(obj=first, location=first.location, last_frame=10)}
        keyed = []
        recording.key_location = lambda obj, frame: keyed.append((obj.identity, frame, obj.location))

        recorder.capture({1: (first, first.location)})
        self.assertEqual(scene.frames, [])
        first.location = (1, 0, 0)
        recorder.capture({1: (first, (0, 0, 0))})
        self.assertEqual(scene.frames, [14])
        self.assertEqual(keyed[-1], (1, 14, (1, 0, 0)))
        self.assertEqual(first.location, (1, 0, 0))

        def track(obj, baseline):
            recorder.objects[obj.identity] = dict(obj=obj, location=baseline, last_frame=10)
            keyed.append((obj.identity, 10, baseline))
        recorder._track = track
        second.location = (6, 0, 0)
        recorder.capture({1: (first, first.location), 2: (second, (5, 0, 0))})
        self.assertEqual(scene.frames, [14, 18])
        self.assertEqual(first.location, (1, 0, 0))
        self.assertEqual(second.location, (6, 0, 0))
        self.assertIn((2, 18, (6, 0, 0)), keyed)

        recorder.mode = 'down'
        recorder.capture({1: (first, first.location)})
        self.assertEqual(scene.frames, [14, 18])
        first.location = (2, 0, 0)  # Latest move differs from the press position.
        recorder.capture({1: (first, (1, 0, 0))}, down_poses=[(first, (1, 0, 0), (1.5, 0, 0))])
        self.assertEqual(scene.frames, [14, 18, 22])
        self.assertIn((1, 22, (1.5, 0, 0)), keyed)
        self.assertEqual(first.location, (2, 0, 0), 'live pointer keeps its latest position')
        recorder.capture({1: (first, first.location)}, down_poses=[
            (first, (2, 0, 0), (2, 0, 0)), (first, (2, 0, 0), (3, 0, 0))])
        self.assertEqual(scene.frames[-2:], [26, 30])
        self.assertEqual(first.location, (2, 0, 0))

        recorder.mode = 'up'
        recorder.capture({1: (first, first.location)})
        self.assertEqual(scene.frames[-1], 30, 'presses and drags do not advance the timeline')
        first.location = (4, 0, 0)
        recorder.capture({1: (first, (2, 0, 0))}, up_poses=[(first, (2, 0, 0), (4, 0, 0))])
        self.assertEqual(scene.frames[-1], 34)
        self.assertIn((1, 34, (4, 0, 0)), keyed)
        self.assertEqual(first.location, (4, 0, 0))


if __name__ == '__main__':
    unittest.main()
