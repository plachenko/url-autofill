/** Live integration of the browser controller with the disposable Blender fixture.
 * Start test_browser_fixture_blender.py first, then run node blender-addon/test_browser_session.mjs.
 * Uses the same controller, validation and pointer message builder as the browser UI.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createPointerSceneSession } from '../src/lib/pointer-scene-session.js';
import { sceneObjectMessage } from '../src/lib/websocket-scene-objects.js';
import { pointerPositionsMessage } from '../src/lib/websocket-pointers.js';
const folder=new URL('./.browser-e2e/',import.meta.url);
const stateFile=new URL('state.json',folder),commandFile=new URL('command.json',folder);
const readState=async()=>JSON.parse(await readFile(stateFile,'utf8'));
async function until(predicate,label,timeout=6000){const end=Date.now()+timeout;while(Date.now()<end){const result=await predicate();if(result)return result;await delay(30);}throw new Error(`Timed out: ${label}`);}
async function action(action,extra={}){const id=crypto.randomUUID();const tmp=new URL('command.tmp',folder);await writeFile(tmp,JSON.stringify({id,action,...extra}));await until(async()=>{try{await rename(tmp,commandFile);return true;}catch(error){if(!['EPERM','EBUSY'].includes(error.code))throw error;return false;}},'command file rename');const result=await until(async()=>{const s=await readState();if(s.action_id!==id)return false;assert.equal(s.action_error,null);return s;},action);if(action==='settings' && session?.snapshot().connected) await until(()=>Object.entries(extra.values).filter(([key])=>['width','height','plane','enabled','remote_plane'].includes(key)).every(([key,value])=>session.snapshot().catalog?.pointer[key==='remote_plane'?'use_browser_plane':key]===value),'settings catalog');return result;}
const fixture=await readState();const endpoint=`ws://127.0.0.1:${fixture.port}`;
let socket,plane='z',session;let packets=[];
const send=message=>{packets.push(message);socket.send(JSON.stringify(message));};
const reset=()=>send(pointerPositionsMessage('reset',null,[],plane));
session=createPointerSceneSession({sendCommand:send,resetGesture:reset,onChange:()=>{},timeoutMs:1500});
async function connect(){socket=new WebSocket(endpoint);socket.addEventListener('message',event=>{const m=sceneObjectMessage(String(event.data));if(m)session.receive(m);});await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});session.connect();await until(()=>session.snapshot().catalog,'catalog');}
async function close(){const old=socket;await new Promise(resolve=>{old.addEventListener('close',resolve,{once:true});old.close();});session.disconnect();}
const row=name=>session.snapshot().catalog.objects.find(o=>o.name===name);
async function settled(){await until(()=>{const s=session.snapshot();return !s.pending&&s.catalog.revision>=s.acceptedRevision;},'command/catalog');assert.equal(session.snapshot().error,'');await until(async()=>(await readState()).catalog?.revision>=session.snapshot().acceptedRevision,'fixture snapshot');}
async function attach(name){session.choose(row(name).id);assert.equal(session.attach(),true);await settled();}
async function point(axis,x=.75,y=.25,multi=false){reset();plane=axis;const p={id:1,x,y,kind:'touch',pressure:.5};const q={id:2,x:.25,y:.75,kind:'touch',pressure:.5};send(pointerPositionsMessage('down',p,multi?[p,q]:[p],plane));}
const near=(a,b)=>a.every((n,i)=>Math.abs(n-b[i])<.005);
async function position(expected,contacts=1){return until(async()=>{const s=await readState();return near(s.objects[s.target].position,expected)&&s.bindings===contacts?s:false;},`position ${expected}`);}
const checks=[];
try{
 await action('record_stop');
 await action('settings',{values:{width:6,height:2,enabled:false,remote_plane:true,local_axes:false}});
 await action('rotate_origin',{value:[0,0,0]});
 await connect();
 await until(()=>!session.snapshot().catalog.pointer.recording && session.snapshot().catalog.pointer.width===6 && !session.snapshot().catalog.pointer.enabled,'initial configuration');
 const initial=await readState();const ballId=row('Ball').id;
 assert.equal(row('Linked Read Only').can_follow,false);session.choose(row('Linked Read Only').id);assert.equal(session.attach(),false);
 await attach('Ball');let s=await readState();
 assert.equal(s.objects.Ball.parent,'Ball_Deform');assert.equal(s.objects.Ball_Deform.parent,'Ball_Control');
 assert.deepEqual(s.objects.Ball.matrix,initial.objects.Ball.matrix);checks.push('saved Ball rig hierarchy and pose; linked read-only disabled');
 session.setDraft('width','8');session.setDraft('height','6');assert.equal(session.applySize(),true);await settled();
 const origin=(await readState()).origin_position;
 for(const [axis,offset] of [['x',[0,2,1.5]],['y',[2,0,1.5]],['z',[2,1.5,0]]]){await point(axis);await position(origin.map((n,i)=>n+offset[i]));}
 checks.push('browser controller -> real Blender socket: X/Y/Z dimensions and movement');
 // Multi-touch contacts reset before changing planes; recording stores only the new mapped positions.
 await point('z',.75,.25,true);await position(origin.map((n,i)=>n+[2,1.5,0][i]),2);
 await action('record_start');await until(()=>session.snapshot().catalog.pointer.recording,'recording state');
 assert.equal(session.canEdit('pointer_follow'),false);assert.equal(session.canEdit('pointer_plane_set'),false);
 await point('x',.75,.25,true);await position(origin.map((n,i)=>n+[0,2,1.5][i]),2);await delay(150);
 await point('y',.75,.25,true);await position(origin.map((n,i)=>n+[2,0,1.5][i]),2);await delay(150);
 reset();s=await action('record_stop');assert.ok(Object.keys(s.keys.Ball_Control||{}).length===3);
 const keys=s.keys.Ball_Control;assert.ok(Object.values(keys).some(values=>values.length>=2));
 for(let axis=0;axis<3;axis++)assert.ok(Math.abs(keys[String(axis)].at(-1)[1]-(origin[axis]+[2,0,1.5][axis]))<.005,'recording ends at the new plane position, without stale previous-plane motion');
 checks.push('multi-touch plane switches, reset, recording keys, recording configuration locks');
 await action('settings',{values:{enabled:true,remote_plane:false,plane:'YZ'}});
 for(const axis of ['x','y','z']){await point(axis);await position(origin.map((n,i)=>n+[0,2,1.5][i]));}
 checks.push('Use browser plane disabled: all three browser choices obey Blender YZ');
 reset();await action('settings',{values:{remote_plane:true,local_axes:true}});await action('rotate_origin',{value:[0,0,Math.PI/2]});
 await point('z');s=await position(origin.map((n,i)=>n+[-1.5,2,0][i]));
 assert.ok(near(s.corners.XY[1].map((n,i)=>n-s.corners.XY[0][i]),[0,8,0]));
 checks.push('rotated local origin: viewport bounds match movement');
 reset();await action('settings',{values:{local_axes:false}});await action('rotate_origin',{value:[0,0,0]});
 await until(()=>session.snapshot().catalog.pointer.recording===false,'stop catalog');
 session.setDraft('width','9');await action('settings',{values:{width:7}});
 await until(()=>session.snapshot().conflict,'remote draft conflict');assert.equal(session.snapshot().draftWidth,'9');assert.equal(session.applySize(),false);session.reloadDraft();
 const before=packets.length;session.setDraft('width','');assert.equal(session.applySize(),false);assert.equal(packets.length,before);session.reloadDraft();
 checks.push('Blender edits preserve drafts; invalid sizes never sent');
 // A second actual connection updates dimensions and the first client sees the new catalog.
 const peer=new WebSocket(endpoint);await new Promise(resolve=>peer.addEventListener('open',resolve,{once:true}));
 let catalog=session.snapshot().catalog;peer.send(JSON.stringify({type:'pointer_plane_set',request_id:'peer-size',scene_id:catalog.scene.id,revision:catalog.revision,width:10,height:4}));
 await until(()=>session.snapshot().confirmedWidth===10,'other client size');peer.close();
 checks.push('second WebSocket client edits synchronize');
 await action('pause_commands');catalog=session.snapshot().catalog;
 await action('rename',{name:'Ordinary Mesh',new_name:'Ordinary Renamed'});
 session.choose(ballId);assert.equal(session.attach(),true);await action('resume_commands');
 await until(()=>!session.snapshot().pending,'stale reply');assert.match(session.snapshot().error,/changed/i);
 await until(()=>row('Ordinary Renamed'),'rename catalog');assert.equal(row('Ball').id,ballId);
 checks.push('stale revisions rejected, object rename keeps advertised identities');
 const ordinaryMatrix=(await readState()).objects['Ordinary Renamed'].matrix;
 await attach('Ordinary Renamed');s=await readState();assert.deepEqual(s.objects['Ordinary Renamed'].matrix,ordinaryMatrix,'ordinary mesh world pose is preserved at attachment');assert.equal(s.objects['Ordinary Renamed'].parent,s.target);
 const ordinaryBefore=s.objects['Ordinary Renamed'].position;const rootBefore=s.objects[s.target].position;
 await point('z');s=await until(async()=>{const n=await readState();return !near(n.objects[n.target].position,rootBefore)&&n.bindings===1?n:false;},'ordinary mesh motion');
 assert.ok(near(s.objects['Ordinary Renamed'].position.map((n,i)=>n-ordinaryBefore[i]),s.objects[s.target].position.map((n,i)=>n-rootBefore[i])));
 reset();await close();await connect();assert.equal(session.snapshot().attachedId,row('Ordinary Renamed').id);
 checks.push('ordinary mesh follows new Empty, reconnect restores selection');
 await action('pause_commands');session.setDraft('width','11');assert.equal(session.applySize(),true);
 await until(()=>!session.snapshot().pending,'timeout');assert.match(session.snapshot().error,/did not respond/);const count=packets.filter(p=>p.type==='pointer_plane_set').length;
 await action('resume_commands');await until(()=>session.snapshot().confirmedWidth===11,'late catalog');assert.equal(packets.filter(p=>p.type==='pointer_plane_set').length,count);
 checks.push('command timeout recovers via authoritative catalog without retry');
 await action('delete',{name:'Ordinary Renamed'});await until(()=>!row('Ordinary Renamed'),'deletion catalog');assert.equal(session.snapshot().selectedId,'');
 await action('new_scene');await until(()=>session.snapshot().catalog.scene.name==='Browser Test Scene','scene switch');assert.equal(session.snapshot().selectedId,'');assert.equal(session.snapshot().attachedId,'');
 checks.push('deletion and scene switch clear stale object selection');
 await writeFile(new URL('session_verification.json',folder),JSON.stringify({ok:true,checks},null,2));
 console.log(JSON.stringify({ok:true,checks},null,2));
}finally{if(socket?.readyState===WebSocket.OPEN)await close();session.close();}
