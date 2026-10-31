/* Integration around the pinned SM64CoopDX web engine. */
(() => {
  const params = new URLSearchParams(location.search);
  const role = params.get('role') === 'join' ? 'join' : 'host';
  const code = (params.get('room') || '').toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4}$/.test(code)) { location.replace('./'); return; }
  const debug = params.has('debug');
  const $ = s => document.querySelector(s);
  const ui = document.createElement('div');
  ui.id = 'together-ui';
  ui.innerHTML = `<div class="session-bar"><a href="./" class="home-link">← Leave</a><strong>ROOM <span id="code"></span></strong><span id="session-status">Loading the castle…</span><button id="invite">Invite ↗</button><button id="sound">Enable sound</button><button id="expand">Expand</button><button id="controls-help">?</button></div><div id="party-health"></div><div id="yoshi-power" hidden></div><div id="party-reset" hidden><strong>One team. One more try.</strong><span>The whole team is restarting at the course entrance.</span></div><div id="play-notice" role="status"></div><dialog id="play-help"><h2>Better together.</h2><p>Walk into the same level to explore together. Jump onto your teammate’s head for a bounce. Have them crouch with Z for a bigger boost. Friendly attacks do no damage.</p><p>Each player has eight health wedges. If any player dies or falls into a pit, everyone restarts at the failed course’s entrance. Collected stars are kept.</p><p><b>Keyboard:</b> WASD moves · Z jumps · X punches/dives · Shift crouches/ground-pounds · Enter pauses · arrows move the camera · Q centers it · T opens chat.</p><p><b>Yoshi (third player):</b> B / X uses your tongue. Eat a Goomba to charge one fireball, then press again to spit it. Hold Z / Shift while spitting for a spinning burst. Bosses and other enemies cannot be swallowed. Normal jumping, crouching and head bouncing still work.</p><p><b>Phone:</b> rotate sideways, use the left stick and A/B/Z buttons. Camera arrows are on the right. Tap Enable sound after loading. Keep all game tabs visible.</p><p>Save progress stays in the host’s browser. Send the room code only to your friend. If a direct connection fails, configure TURN from the lobby’s connection options.</p><button id="close-help">Back to game</button></dialog>`;
  document.body.append(ui);
  $('#code').textContent = code;
  $('#overlay h1').textContent = 'Mario 64 Together';
  $('#overlay .subtitle')?.replaceChildren(document.createTextNode('Three players. One adventure.'));
  $('#rom-picker').style.display = 'none';
  $('#room-config').style.display = 'none';
  window.together = { state: null, role, code, errors: [], debug };
  function notice(text) { $('#play-notice').textContent = text; }
  window.togetherNotice = notice;
  const originalPrint = Module.print;
  Module.print = text => {
    const marker = text.indexOf('TOGETHER_STATE:');
    if (marker >= 0) {
      try {
        const state = JSON.parse(text.slice(marker + 15));
        together.state = state;
        $('#party-reset').hidden = !state.resetting;
        $('#session-status').textContent = `${state.players.length}/3 players together`;
        const yoshi = state.localId === 2;
        const attackLabel = yoshi ? (state.ammo ? 'B · Fireball' : 'B · Tongue') : 'B · Punch';
        $('#tb-b').textContent = attackLabel; $('#tb-b').setAttribute('aria-label',attackLabel);
        $('#yoshi-power').hidden = !yoshi;
        $('#yoshi-power').textContent = state.ammo ? 'Fireball ready · B / X to spit · hold Z / Shift for a spinning burst' : 'B / X · Tongue — eat a Goomba to charge a fireball';
        const hud = $('#party-health'); hud.replaceChildren();
        for (const player of state.players.sort((a,b)=>a.id-b.id)) {
          const wedges = Math.max(0,Math.min(8,Math.floor(player.health/256)));
          const row = document.createElement('div'); row.className = `health player-${player.id}`;
          const name = document.createElement('b'); name.textContent = `${['Mario','Luigi','Yoshi'][player.id]||'Friend'}${player.id===state.localId?' · you':''}`;row.append(name);
          const meter = document.createElement('span');meter.className='wedges';meter.setAttribute('aria-label',`${wedges} of 8 health`);
          for(let i=0;i<8;i++){const wedge=document.createElement('i');wedge.className=i<wedges?'full':'';meter.append(wedge);}row.append(meter);hud.append(row);
        }
        hideOverlay();
      } catch(e) { together.errors.push(e.message); }
      return;
    }
    originalPrint(text);
  };
  const originalError = Module.printErr;
  Module.printErr = text => { together.errors.push(text); originalError(text); };
  Module.locateFile = path => './engine/' + path;
  // The supplied ROM is the asset source. This package starts with a normal,
  // empty save, and loads only the required co-op rules before creating a room.
  Module.preRun = [() => {
    for(const dir of ['/sm64coopdx','/sm64coopdx/mods','/sm64coopdx/mods/together','/sm64coopdx/mods/together/actors','/sm64coopdx/.tmp'])try{FS.mkdir(dir);}catch{}
    Module.addRunDependency('together-assets');
    Promise.all([
      fetch('./roms/super-mario-64.z64').then(r=>{if(!r.ok)throw Error('ROM download failed');return r.arrayBuffer();}),
      fetch('./mods/together.lua').then(r=>{if(!r.ok)throw Error('Co-op rules download failed');return r.text();}),
      fetch('./mods/yoshi.lua').then(r=>{if(!r.ok)throw Error('Yoshi rules download failed');return r.text();}),
      ...['yoshi_player_geo','tongue_geo'].map(name=>fetch(`./mods/assets/${name}.bin`).then(r=>{if(!r.ok)throw Error('Yoshi model download failed');return r.arrayBuffer();}))
    ]).then(([rom,lua,yoshi,...models])=>{
      if(rom.byteLength!==8388608||new DataView(rom).getUint32(0)!==0x80371240)throw Error('The supplied US ROM could not be loaded.');
      FS.writeFile('/sm64coopdx/baserom.us.z64',new Uint8Array(rom));
      FS.writeFile('/sm64coopdx/mods/together/main.lua',lua.replace('local DEBUG = false',`local DEBUG = ${debug}`)+'\n'+yoshi);
      ['yoshi_player_geo','tongue_geo'].forEach((name,i)=>FS.writeFile(`/sm64coopdx/mods/together/actors/${name}.bin`,new Uint8Array(models[i])));
      let saved = '';
      try{saved=localStorage.getItem('mario64together_config')||'';}catch{}
      const forced = {
        coop_player_name:role==='host'?'Mario':'Luigi',coop_player_model:role==='host'?0:1,
        coop_player_palette_cap:role==='host'?'ff 00 00':'00 a8 20',
        coop_player_palette_shirt:role==='host'?'ff 00 00':'00 a8 20',
        coop_player_palette_emblem:role==='host'?'ff 00 00':'00 a8 20',
        amount_of_players:3,bubble_death:'false',coop_player_interaction:1,coop_player_knockback_strength:0,
        skip_intro:'true',language:'English',coop_nametags:'true',coop_host_save_slot:1,
        key_a:'002c 1000 ffff',key_b:'002d 1001 ffff',key_z:'002a 1007 ffff',key_start:'001c 1006 ffff',
        key_r:'0010 100a ffff',key_l:'0012 1009 ffff',key_chat:'0014 ffff ffff',
        key_cup:'0148 ffff ffff',key_cdown:'0150 ffff ffff',key_cleft:'014b ffff ffff',key_cright:'014d ffff ffff'
      };
      const config=saved.split('\n').filter(line=>line&&!Object.keys(forced).includes(line.split(' ')[0])&&!line.startsWith('enable-mod:')).join('\n')+'\n'+Object.entries(forced).map(([k,v])=>`${k} ${v}`).join('\n')+'\nenable-mod: together\n';
      FS.writeFile('/sm64coopdx/sm64config.txt',config);
      try{const save=localStorage.getItem('mario64together_save');if(save)FS.writeFile('/sm64coopdx/sm64_save_file.bin',Uint8Array.from(atob(save),c=>c.charCodeAt(0)));}catch{}
      romReady=true;
      Module.removeRunDependency('together-assets');
    }).catch(error=>{notice(`${error.message}. Reload to retry.`);showError(error.message);});
  }];
  Module.onRuntimeInitialized = () => {setStatus('Opening your co-op adventure…');watchForGameStart();};
  // Never auto-promote a guest into a new empty room when their host is absent.
  PeerNetwork.MAX_SLOTS=2;
  PeerNetwork.hostPeerIdFromRoom = room => 'mario64-together-v2-' + room;
  installTogetherNetwork(PeerNetwork,()=>together.state);
  let settings={};try{settings=JSON.parse(sessionStorage.getItem('mario64-network')||'{}');}catch{}
  const NativePeer=window.Peer;
  window.Peer=class extends NativePeer {
    constructor(id,options={}){
      const iceServers=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}];
      if(settings.turn)iceServers.push({urls:settings.turn,username:settings.username,credential:settings.credential});
      super(id,{...options,config:{iceServers}});
      this.on('error',e=>notice(e.type==='peer-unavailable'?'Room not found. Ask your friend to keep the host tab open, then reload.':e.type==='unavailable-id'?'This code is occupied. Leave and create a new room.':`Connection: ${e.message||e.type}. Try another network or TURN in connection options.`));
    }
  };
  PeerNetwork.init=function(room){
    this.roomId=room;this.hostPeerId=this.hostPeerIdFromRoom(room);
    if(role==='join'){this._joinAsClient();return;}
    this.peer=new Peer(this.hostPeerId);
    this.peer.on('open',()=>{this.isHost=true;this._setupHost();BackgroundGuard.start();notice('Room ready. Tap Invite to bring your friends.');});
    this.peer.on('disconnected',()=>{if(!this._shuttingDown)this.peer.reconnect();});
  };
  const connectToHost=PeerNetwork._connectToHost;
  PeerNetwork._connectToHost=function(){
    connectToHost.call(this);
    const connection=this.connections[this.hostPeerId];
    if(!connection)return;
    connection.on('open',()=>notice('Connected. Your teammate is here.'));
    connection.on('close',()=>{if(!this._shuttingDown)notice('Host disconnected. Reconnecting… Keep the host game open.');});
  };
  window.togetherRoomFull=()=>{notice('This adventure already has three players. Leave and create another room.');PeerNetwork.shutdown();};
  // Keep built-in touch buttons consistent with the keyboard bindings above.
  Object.assign(TouchGamepad.KEYS,{'tb-a':0x2c,'tb-b':0x2d,'tb-z':0x2a,'tb-start':0x1c,'tb-r':0x10,'tb-l':0x12});
  const labels={'tb-a':'A · Jump','tb-b':'B · Punch','tb-z':'Z · Crouch','tb-start':'Start','tb-cu':'▲','tb-cd':'▼','tb-cl':'◀','tb-cr':'▶'};
  for(const [id,label] of Object.entries(labels))document.getElementById(id).textContent=label;
  for(const id of Object.keys(TouchGamepad.KEYS)){const el=document.getElementById(id);el?.setAttribute('role','button');el?.setAttribute('aria-label',labels[id]||el.textContent);}
  const touchReleases=new Map();
  TouchGamepad._setupButtons=function(){
    for(const [id,key] of Object.entries(this.KEYS)){
      const el=document.getElementById(id);if(!el)continue;let pressedAt=0;
      el.addEventListener('touchstart',e=>{e.preventDefault();clearTimeout(touchReleases.get(key));pressedAt=performance.now();el.classList.add('pressed');this._keyDown(key);},{passive:false});
      const end=()=>{this._keyUp(key);el.classList.remove('pressed');touchReleases.delete(key);};
      // A quick tap can begin and end between native frames. Keep it visible
      // for two game ticks so a short mobile jump press is never swallowed.
      el.addEventListener('touchend',e=>{e.preventDefault();touchReleases.set(key,setTimeout(end,Math.max(0,80-(performance.now()-pressedAt))));},{passive:false});
      el.addEventListener('touchcancel',()=>{clearTimeout(touchReleases.get(key));end();});
    }
  };
  function release(){
    if(!Module._web_touch_key_up)return;
    for(const timer of touchReleases.values())clearTimeout(timer);touchReleases.clear();
    for(const key of new Set([...Object.values(TouchGamepad.KEYS),0x11,0x1e,0x1f,0x20]))Module._web_touch_key_up(key);
    Module._web_touch_clear_stick();TouchGamepad._stickTouchId=null;
    $('#touch-stick-knob').style.transform='translate(0px,0px)';
    document.querySelectorAll('.pressed').forEach(el=>el.classList.remove('pressed'));
  }
  window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{release();if(document.hidden)notice('Return to the game to keep your teammate connected.');});
  $('#invite').onclick=async()=>{
    const url=new URL('./',location.href);url.hash='room='+code;
    try{if(navigator.share&&matchMedia('(pointer:coarse)').matches){await navigator.share({title:'Mario 64 Together',url:url.href});return;}await navigator.clipboard.writeText(url.href);notice('Invite copied. Send it to your friend.');}catch(e){if(e.name!=='AbortError')notice(`Your friend can join room ${code}.`);}
  };
  function sound(){
    const ctx=Module.SDL2?.audioContext||window.SDL2?.audioContext;
    if(ctx){ctx.resume().then(()=>{$('#sound').textContent='Sound on';}).catch(()=>notice('Tap Enable sound again.'));}else notice('Sound will be available when loading finishes.');
  }
  $('#sound').onclick=sound;
  document.addEventListener('touchstart',()=>{const ctx=Module.SDL2?.audioContext||window.SDL2?.audioContext;if(ctx?.state==='suspended')ctx.resume().catch(()=>{});},{passive:true});
  $('#expand').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notice('Rotate sideways. On iPhone, Add to Home Screen for more space.');}catch{notice('Rotate sideways for more space.');}};
  $('#controls-help').onclick=()=>{release();$('#play-help').showModal();};$('#close-help').onclick=()=>$('#play-help').close();
  window.addEventListener('pagehide',()=>{persistSave();release();PeerNetwork.shutdown();});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  // Persist the native save separately from any other SM64 project on this origin.
  function persistSave(){
    if(!together.state)return;
    try{
      if(role==='host'){let text='';for(const v of FS.readFile('/sm64coopdx/sm64_save_file.bin'))text+=String.fromCharCode(v);localStorage.setItem('mario64together_save',btoa(text));}
      localStorage.setItem('mario64together_config',FS.readFile('/sm64coopdx/sm64config.txt',{encoding:'utf8'}));
    }catch{}
  }
  setInterval(persistSave,5000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persistSave();});
})();
