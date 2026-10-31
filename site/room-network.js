/* Adapt WebRTC disconnects to the pinned native engine's connection lifecycle. */
globalThis.installTogetherNetwork = function(net, state) {
  // Native PACKET_LEAVING: type 16, seq=0, flags=0, destination=host,
  // payload=global player slot, XOR32 checksum, zlib. packet_{read_write,leaving}.c
  // This is injected locally by the host on transport close, never accepted
  // from an arbitrary client. Native cleanup clears reliable/ordered packets.
  const leaving = {
    1: new Uint8Array([120,218,19,96,0,2,70,1,70,6,6,0,0,242,0,35]),
    2: new Uint8Array([120,218,19,96,0,2,38,1,38,6,6,0,0,250,0,37])
  };
  const sessions = new Map();
  const active = slot => state()?.players.some(p=>p.id===slot);
  const nativeKick = net.kickSlot;
  net.kickSlot = function(slot) {
    // A replacement transport may already be waiting while C removes the
    // previous occupant. That cleanup must not close the replacement.
    if (sessions.get(slot)?.waiting) return;
    nativeKick.call(this,slot);
  };
  net._setupHost = function() {
    this.peer.on('connection', conn => {
      const slot = this._allocSlot();
      if(slot < 0){conn.on('open',()=>{conn.send({together:'full'});setTimeout(()=>conn.close(),300);});return;}
      const session = {conn,waiting:!!active(slot),queue:[],timer:null};
      sessions.set(slot,session);
      this.slotToPeer[slot]=conn.peer;
      const flush=()=>{
        if(!session.waiting || active(slot))return;
        session.waiting=false;clearInterval(session.timer);
        this.recvBuffer.push(...session.queue.map(data=>({slotId:slot,data})));session.queue=[];
      };
      if(session.waiting)session.timer=setInterval(flush,50);
      conn.on('data',data=>{
        const bytes=new Uint8Array(data);
        if(bytes.length===1&&bytes[0]===255)return;
        if(session.waiting){if(session.queue.length<64)session.queue.push(bytes);return;}
        this.recvBuffer.push({slotId:slot,data:bytes});
      });
      const opened=()=>{this.connections[conn.peer]=conn;this.peerToSlot[conn.peer]=slot;};
      conn.on('open',opened);if(conn.open)opened();
      conn.on('close',()=>{
        clearInterval(session.timer);
        if(sessions.get(slot)!==session)return;
        sessions.delete(slot);
        delete this.connections[conn.peer];delete this.peerToSlot[conn.peer];delete this.slotToPeer[slot];
        this.recvBuffer=this.recvBuffer.filter(packet=>packet.slotId!==slot);
        this.recvBuffer.push({slotId:slot,data:leaving[slot]});
      });
      conn.on('error',()=>conn.close());
    });
  };
  const nativeSend=net.send;
  net.send=function(slot,data){
    if(!this.isHost)return nativeSend.call(this,slot,data);
    // Never deliver previous-session gameplay/rosters before a new JOIN.
    // The native disconnect is processed first, then its queued handshake.
    if(slot===0){
      for(const session of sessions.values())if(!session.waiting&&session.conn.open)session.conn.send(data);
    }else if(!sessions.get(slot)?.waiting)nativeSend.call(this,slot,data);
  };
  const nativeShutdown=net.shutdown;
  net.shutdown=function(){for(const s of sessions.values())clearInterval(s.timer);sessions.clear();return nativeShutdown.call(this);};
};
