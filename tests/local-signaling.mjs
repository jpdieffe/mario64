// Optional in-process PeerServer fixture. Only signaling is simulated; PeerJS,
// WebRTC data channels and media streams still run in the real browsers.
import {randomUUID} from 'node:crypto';
export function localSignaling() {
 const peers=new Map();
 return async page=>{
  await page.addInitScript(()=>{
   const NativePeerConnection=window.RTCPeerConnection;
   window.RTCPeerConnection=class extends NativePeerConnection{constructor(config){super({...config,iceServers:[]});}};
  });
  await page.route(/https:\/\/0\.peerjs\.com\/peerjs\/id\?/,route=>route.fulfill({status:200,contentType:'text/plain',body:randomUUID()}));
  await page.routeWebSocket(/wss:\/\/0\.peerjs\.com\/peerjs\?/,socket=>{
   const id=new URL(socket.url()).searchParams.get('id');
   if(peers.has(id)){socket.send(JSON.stringify({type:'ID-TAKEN'}));return;}
   peers.set(id,socket);
   socket.onMessage(raw=>{const message=JSON.parse(String(raw));if(message.type==='HEARTBEAT')return;const target=peers.get(message.dst);if(target)target.send(JSON.stringify({...message,src:id}));else socket.send(JSON.stringify({type:'EXPIRE',src:message.dst}));});
   socket.onClose(()=>{if(peers.get(id)===socket)peers.delete(id);});
   socket.send(JSON.stringify({type:'OPEN'}));
  });
 };
}
