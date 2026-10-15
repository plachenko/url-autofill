import asyncio,base64,hashlib,importlib.util,json,os,tempfile,unittest
spec=importlib.util.spec_from_file_location('transfer','render_to_websocket/transfer.py');t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
class Receiver:
 def __init__(self):self.messages=[]
 async def send(self,wire):self.messages.append(json.loads(wire))
class Tests(unittest.IsolatedAsyncioTestCase):
 async def test_exact_bytes(self):
  for size in [0,1,t.CHUNK_SIZE,t.CHUNK_SIZE*2+17]:
   with self.subTest(size=size),tempfile.TemporaryDirectory() as folder:
    path=os.path.join(folder,'arbitrary.bin');original=os.urandom(size)
    with open(path,'wb') as f:f.write(original)
    receivers=[Receiver(),Receiver()];progress=[]
    identity=await t.transfer(path,receivers,lambda *x:progress.append(x))
    for r in receivers:
     self.assertEqual(r.messages[0]['bytes'],size)
     self.assertEqual(r.messages[-1]['id'],identity)
     chunks=[m for m in r.messages if m['type']=='file_chunk']
     self.assertEqual([m['index'] for m in chunks],list(range(len(chunks))))
     self.assertEqual(b''.join(base64.b64decode(m['data']) for m in chunks),original)
     self.assertEqual(r.messages[-1]['sha256'],hashlib.sha256(original).hexdigest())
 async def test_disconnect(self):
  class Broken:
   async def send(self,wire):raise ConnectionError('disconnected')
  with tempfile.NamedTemporaryFile(delete=False) as f:
   with self.assertRaises(ConnectionError):await t.transfer(f.name,[Broken()])
 async def test_source_change(self):
  with tempfile.TemporaryDirectory() as folder:
   path=os.path.join(folder,'file')
   with open(path,'wb') as f:f.write(b'x')
   class Mutating(Receiver):
    async def send(self,wire):
     await super().send(wire)
     if self.messages[-1]['type']=='file_chunk':
      with open(path,'ab') as f:f.write(b'y')
   r=Mutating()
   with self.assertRaises(RuntimeError):await t.transfer(path,[r])
   self.assertNotEqual(r.messages[-1]['type'],'file_end')
if __name__=='__main__':unittest.main()
