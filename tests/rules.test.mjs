import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
const mod=readFileSync('site/mods/together.lua','utf8');
const fixture=`
MAX_PLAYERS=2; PLAYER_INTERACTIONS_SOLID=1; LEVEL_CASTLE_GROUNDS=16
HOOK_BEFORE_MARIO_UPDATE=1; HOOK_UPDATE=2; HOOK_ON_DEATH=3; HOOK_ALLOW_PVP_ATTACK=4
hooks={}; function hook_event(id,fn) hooks[id]=fn end
server=true; function network_is_server() return server end
gGlobalSyncTable={resetEpoch=0}; gPlayerSyncTable={[0]={},[1]={}}; gServerSettings={}
gNetworkPlayers={[0]={connected=true,globalIndex=0,currLevelNum=16,currActNum=1},[1]={connected=true,globalIndex=1,currLevelNum=24,currActNum=3}}
function mario() return {playerIndex=0,health=0x880,pos={x=0,y=0,z=0},vel={x=0,y=0,z=0},controller={},bounceSquishTimer=0,action=0} end
gMarioStates={[0]=mario(),[1]=mario()}; m=gMarioStates[0]; warps={}
function warp_to_level(level,area,act) table.insert(warps,{level,area,act});return true end
function print() end
function frame() hooks[1](m); hooks[2]() end
`;
function run(code){const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const status=lauxlib.luaL_dostring(L,to_luastring(fixture+'\n'+mod+'\n'+code));const error=status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1));lua.lua_close(L);assert.equal(status,lua.LUA_OK,error);}
test('guest death restarts the host at the failed course without reducing healthy health beforehand',()=>run(`
frame(); m.health=0x680; frame(); assert(m.health==0x680)
gPlayerSyncTable[1].deathRequest='0:1'; frame(); assert(gGlobalSyncTable.resetEpoch==1)
for i=1,36 do frame() end
assert(#warps==1 and warps[1][1]==24 and warps[1][3]==3); assert(m.health==0x880 and m.freeze==0)
`));
test('simultaneous deaths and duplicate/delayed requests cause only one reset',()=>run(`
frame(); hooks[3](m); gPlayerSyncTable[1].deathRequest='0:1'; frame()
for i=1,160 do frame() end
assert(gGlobalSyncTable.resetEpoch==1 and #warps==1)
gPlayerSyncTable[1].deathRequest='0:2'; frame(); assert(gGlobalSyncTable.resetEpoch==1)
hooks[3](m); frame(); assert(gGlobalSyncTable.resetEpoch==2)
`));
test('client death requests wait for the host and then reset on the shared epoch',()=>run(`
server=false; frame(); assert(hooks[3](m)==false); frame()
assert(gPlayerSyncTable[0].deathRequest=='0:1' and #warps==0 and gGlobalSyncTable.resetEpoch==0)
gGlobalSyncTable.resetEpoch=1; gGlobalSyncTable.resetLevel=24; gGlobalSyncTable.resetAct=1
for i=1,36 do frame() end; assert(#warps==1 and m.health==0x880)
`));
test('a fresh death after spawn protection is not lost to a host cooldown',()=>run(`
frame(); hooks[3](m); frame(); for i=1,126 do frame() end
hooks[3](m); frame(); assert(gGlobalSyncTable.resetEpoch==2)
`));
test('friendly attacks cause no damage; disconnected requests cannot reset the team',()=>run(`
assert(hooks[4]()==false); gNetworkPlayers[1].connected=false
gPlayerSyncTable[1].deathRequest='0:1'; frame(); assert(gGlobalSyncTable.resetEpoch==0)
gNetworkPlayers[1].connected=true; gPlayerSyncTable[1]={}; frame(); assert(gGlobalSyncTable.resetEpoch==0)
`));
