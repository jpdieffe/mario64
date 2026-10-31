import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {inflateSync} from 'node:zlib';
import '../site/room-network.js';
class Connection extends EventEmitter{
 constructor(peer){super();this.peer=peer;this.open=true;this.sent=[];}
 send(data){this.sent.push(data);}
 close(){this.open=false;this.emit('close');}
}
function setup(){
 let roster={players:[{id:0}]};
 const net={isHost:true,peer:new EventEmitter(),MAX_SLOTS:2,slotToPeer:{},peerToSlot:{},connections:{},recvBuffer:[],kicks:[],
 _allocSlot(){for(let i=1;i<=2;i++)if(!this.slotToPeer[i])return i;return -1;},
 send(slot,data){this.connections[this.slotToPeer[slot]]?.send(data);},
 kickSlot(slot){this.kicks.push(slot);this.connections[this.slotToPeer[slot]]?.close();},shutdown(){}};
 installTogetherNetwork(net,()=>roster);net._setupHost();
 return {net,setRoster:ids=>{roster={players:ids.map(id=>({id}))};},connect:id=>{const c=new Connection(id);net.peer.emit('connection',c);return c;}};
}
test('disconnect invokes native cleanup with the correct slot, checksum and no stale input',()=>{
 const f=setup(),a=f.connect('luigi'),b=f.connect('yoshi');
 a.emit('data',new Uint8Array([1,2]));b.emit('data',new Uint8Array([3,4]));b.close();
 assert.equal(f.net.recvBuffer.length,2);assert.equal(f.net.recvBuffer[0].slotId,1);
 const native=inflateSync(f.net.recvBuffer[1].data);
 assert.deepEqual([...native.subarray(0,6)],[16,0,0,0,0,2]);
 let hash=0;for(let i=0;i<6;i++)hash^=native[i]<<((i%4)*8);
 assert.equal(native.readUInt32LE(6),hash>>>0);
 assert.equal(f.net.slotToPeer[2],undefined);f.net.shutdown();
});
test('replacement waits for native cleanup and is not kicked by the old connection',async()=>{
 const f=setup(),a=f.connect('luigi');f.setRoster([0,1]);a.close();
 const replacement=f.connect('new-luigi');replacement.emit('data',new Uint8Array([7,8]));
 assert.equal(f.net.recvBuffer.length,1,'only native leave is queued before cleanup');
 f.net.send(1,new Uint8Array([99]));f.net.send(0,new Uint8Array([98]));
 assert.equal(replacement.sent.length,0,'stale rosters cannot reach an unjoined client');
 f.net.kickSlot(1);assert.equal(replacement.open,true);
 f.setRoster([0]);await new Promise(resolve=>setTimeout(resolve,70));
 assert.deepEqual([...f.net.recvBuffer[1].data],[7,8]);
 f.net.send(1,new Uint8Array([9]));assert.equal(replacement.sent.length,1);
 f.net.shutdown();
});
test('native kicks and normal broadcast still reach active players',()=>{
 const f=setup(),a=f.connect('luigi'),b=f.connect('yoshi');
 f.net.send(0,new Uint8Array([12]));assert.equal(a.sent.length,1);assert.equal(b.sent.length,1);
 f.net.kickSlot(2);assert.equal(b.open,false);assert.equal(a.open,true);f.net.shutdown();
});
