import asyncio, importlib, json, sys, types, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'render_to_websocket'/'vendor'))
pkg=types.ModuleType('scene_test');pkg.__path__=[str(ROOT/'render_to_websocket')];sys.modules[pkg.__name__]=pkg
requests=importlib.import_module(pkg.__name__+'.scene_requests')
server=importlib.import_module(pkg.__name__+'.server')
from websockets.asyncio.client import connect

def command(**extra):
    return dict(type='pointer_follow',request_id='pick',scene_id='scene',revision=1,object_id='object',**extra)

class Tests(unittest.IsolatedAsyncioTestCase):
    def test_queue_validation_limit_disconnect(self):
        inbox=requests.SceneRequestInbox()
        for bad in [{**command(),'revision':True},{**command(),'object_id':''},{**command(),'enable':'yes'}]:
            with self.assertRaises(ValueError):inbox.submit('client',bad)
        inbox.submit('client',command())
        with self.assertRaises(ValueError):inbox.submit('client',command())
        inbox.disconnect('client');self.assertEqual(inbox.drain(),[])
        for index in range(32):inbox.submit(str(index),command())
        with self.assertRaises(ValueError):inbox.submit('extra',command())
        self.assertEqual(len(inbox.drain()),32)

    def test_plane_dimensions(self):
        inbox=requests.SceneRequestInbox()
        base=dict(type='pointer_plane_set',request_id='size',scene_id='scene',revision=1,width=4,height=3)
        for bad in (0, -.1, True, '4', float('nan'), float('inf'), 1000001):
            for field in ('width','height'):
                with self.assertRaises(ValueError):inbox.submit('client',{**base,field:bad})
        inbox.submit('client',base)
        self.assertEqual(inbox.drain()[0][1],base)

    def test_move_recording_frame_spacing(self):
        inbox=requests.SceneRequestInbox()
        base=dict(type='pointer_record_start',request_id='record',scene_id='scene',revision=1,frame_step=4)
        for bad in (0, -1, True, '4', 1001, 1.5):
            with self.assertRaises(ValueError):inbox.submit('client',{**base,'frame_step':bad})
        inbox.submit('client',base)
        self.assertEqual(inbox.drain()[0][1],{**base,'mode':'move'})
        inbox.submit('client',{**base,'mode':'down'})
        self.assertEqual(inbox.drain()[0][1]['mode'],'down')
        inbox.submit('client',{**base,'mode':'up'})
        self.assertEqual(inbox.drain()[0][1]['mode'],'up')
        with self.assertRaises(ValueError):inbox.submit('client',{**base,'mode':'hover'})
        stop=dict(type='pointer_record_stop',request_id='stop',scene_id='scene',revision=2)
        inbox.submit('client',stop)
        self.assertEqual(inbox.drain()[0][1],stop)
        seek=dict(type='pointer_frame_set',request_id='frame',scene_id='scene',revision=2,frame=42)
        inbox.submit('client',seek)
        self.assertEqual(inbox.drain()[0][1],seek)

    async def test_connect_refresh_follow_reply_disconnect_reconnect(self):
        srv=server.RenderServer();srv.start('127.0.0.1',0)
        catalog=dict(type='scene_objects',version=1,revision=1,scene=dict(id='scene',name='Scene'),objects=[])
        srv.publish_scene_objects(catalog)
        url=f'ws://127.0.0.1:{srv.port}'
        try:
            async with connect(url) as a,connect(url) as b:
                for ws in [a,b]:
                    self.assertEqual(json.loads(await ws.recv()),catalog)
                    self.assertIn('Replay unavailable',await ws.recv())
                await a.send(json.dumps(dict(type='pointer_plane_set',request_id='size',scene_id='scene',revision=1,width=4,height=3)))
                await a.send('size barrier');self.assertEqual(await a.recv(),'size barrier')
                self.assertEqual(srv.object_requests.drain()[0][1]['width'],4)
                await a.send(json.dumps(dict(type='pointer_plane_set',request_id='bad',scene_id='scene',revision=1,width=0,height=3)))
                failure=json.loads(await a.recv());self.assertEqual(failure['type'],'pointer_plane_set_result');self.assertFalse(failure['ok'])
                await a.send(json.dumps(dict(type='scene_objects_request')))
                self.assertEqual(json.loads(await a.recv()),catalog)
                srv.publish_scene_objects(catalog)
                with self.assertRaises(asyncio.TimeoutError):await asyncio.wait_for(a.recv(),.03)
                await a.send(json.dumps(command(enable=True)));await a.send('barrier')
                self.assertEqual(await a.recv(),'barrier')
                client,request=srv.object_requests.drain()[0]
                self.assertTrue(request['enable'])
                srv.reply_scene_object(client,dict(type='pointer_follow_result',request_id='pick',ok=True))
                self.assertTrue(json.loads(await a.recv())['ok'])
                with self.assertRaises(asyncio.TimeoutError):await asyncio.wait_for(b.recv(),.03)
                catalog={**catalog,'revision':2};srv.publish_scene_objects(catalog)
                self.assertEqual(json.loads(await a.recv()),catalog);await b.recv()
                await a.send(json.dumps({**command(),'revision':0}))
                self.assertFalse(json.loads(await a.recv())['ok'])
                await a.send(json.dumps(dict(type='pointer_record_start',request_id='record',scene_id='scene',revision=2,frame_step=0)))
                failure=json.loads(await a.recv());self.assertEqual(failure['type'],'pointer_record_start_result');self.assertFalse(failure['ok'])
                await a.send(json.dumps(dict(type='pointer_record_start',request_id='record',scene_id='scene',revision=2,frame_step=4)))
                await a.send('record barrier');self.assertEqual(await a.recv(),'record barrier')
                self.assertEqual(srv.object_requests.drain()[0][1]['frame_step'],4)
                await a.send(json.dumps(dict(type='pointer_frame_set',request_id='frame',scene_id='scene',revision=2,frame=20)))
                await a.send('frame barrier');self.assertEqual(await a.recv(),'frame barrier')
                self.assertEqual(srv.object_requests.drain()[0][1]['frame'],20)
                await a.send(json.dumps(command()));await a.send('barrier');await a.recv()
            for _ in range(100):
                if not srv._scene_clients:break
                await asyncio.sleep(.01)
            self.assertEqual(srv.object_requests.drain(),[])
            async with connect(url) as ws:self.assertEqual(json.loads(await ws.recv()),catalog)
        finally:
            await asyncio.to_thread(srv.stop)
            self.assertIsNone(srv.scene_objects)

if __name__=='__main__':unittest.main()
