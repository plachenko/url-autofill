/** Invoked by test_browser_render_blender.py against a real Blender render job. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createPointerSceneSession } from '../src/lib/pointer-scene-session.js';
import { sceneObjectMessage } from '../src/lib/websocket-scene-objects.js';
const socket=new WebSocket(process.argv[2]);let response,seen=false;
const session=createPointerSceneSession({sendCommand:message=>socket.send(JSON.stringify(message)),resetGesture:()=>{},onChange:()=>{}});
socket.addEventListener('message',event=>{const m=sceneObjectMessage(String(event.data));if(!m)return;session.receive(m);if(m.type==='pointer_plane_set_result')response=m;});
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});session.connect();
const until=async predicate=>{const end=Date.now()+45000;while(Date.now()<end){if(predicate())return;await delay(20);}throw Error('Real render lock test timed out');};
try{
 await until(()=>session.snapshot().catalog);
 await writeFile(new URL('./.browser-e2e/render-ready',import.meta.url),'ready');
 await until(()=>session.snapshot().catalog.pointer.rendering);
 const catalog=session.snapshot().catalog;seen=true;
 assert.ok(catalog.objects.every(o=>!o.can_follow));
 session.choose(catalog.objects.find(o=>o.name==='Cube').id);
 session.setDraft('width','9');
 assert.equal(session.canEdit('pointer_follow'),false);assert.equal(session.canEdit('pointer_plane_set'),false);
 assert.equal(session.attach(),false);assert.equal(session.applySize(),false);
 socket.send(JSON.stringify({type:'pointer_plane_set',request_id:'render-lock',scene_id:catalog.scene.id,revision:catalog.revision,width:9,height:4}));
 await until(()=>response);
 assert.equal(response.ok,false);assert.match(response.message,/render/i);
 await until(()=>!session.snapshot().catalog.pointer.rendering);
 console.log('BROWSER_RENDER_LOCK_OK: actual render flags lock browser commands and server rejects resize during render');
}finally{session.close();socket.close();}
