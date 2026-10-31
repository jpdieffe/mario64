import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
const mod=readFileSync('site/mods/yoshi.lua','utf8');
const fixture=`
DEBUG=false; pending=false; resetTimer=0
PANTS=0;SHIRT=1;GLOVES=2;SHOES=3;HAIR=4;SKIN=5;CAP=6;EMBLEM=7
HOOK_ON_WARP=1;HOOK_OBJECT_SET_MODEL=2;HOOK_BEFORE_MARIO_UPDATE=3;HOOK_MARIO_UPDATE=4;HOOK_ON_NAMETAGS_RENDER=5
OBJ_LIST_GENACTOR=1;OBJ_FLAG_UPDATE_GFX_POS_AND_ANGLE=1;ACTIVE_FLAG_DEACTIVATED=0
id_bhvMario=1;id_bhvGoomba=2;id_bhvBobomb=3;id_bhvPiranhaPlant=4
GOOMBA_SIZE_HUGE=1;GOOMBA_BP_TRIPLET_FLAG_MASK=0xFC;HELD_FREE=0
ACT_FLAG_SWIMMING=0x2000;ACT_GROUP_MASK=0x1C0;ACT_GROUP_CUTSCENE=0x100
B_BUTTON=0x4000;Z_TRIG=0x2000;INTERACT_TEXT=0x800000;INTERACT_GRABBABLE=2
CT_LUIGI=1;CT_MARIO=0;gCharacters={[0]={},[1]={}}
E_MODEL_RED_FLAME=14;SOUND_GENERAL_YOSHI_TALK=1;SOUND_OBJ_FLAME_BLOWN=2
hooks={};behaviors={};gPlayerSyncTable={[0]={}};gGlobalSyncTable={resetEpoch=0}
gNetworkPlayers={[0]={globalIndex=2,connected=true,currLevelNum=16,currAreaIndex=1}}
function hook_event(id,f) hooks[id]=f end
function hook_behavior(_,_,_,init,loop) behaviors[#behaviors+1]={init,loop};return #behaviors end
function define_custom_obj_fields() end
function smlua_model_util_get_id(name) return name=='yoshi_player_geo' and 381 or 380 end
function obj_has_behavior_id(o,id) return o.behavior==id and 1 or 0 end
modelCalls=0;function obj_set_model_extended(o,id) modelCalls=modelCalls+1;assert(modelCalls<10,'recursive model hook');o.model=id;hooks[2](o,0,id) end
function network_player_set_override_palette_color() end
function sins(a) return math.sin(a*math.pi/32768) end
function coss(a) return math.cos(a*math.pi/32768) end
function collision_find_surface_on_ray(x,y,z,dx,dy,dz) return {surface=blocked and {} or nil,hitPos={x=x+dx/2,y=y+dy/2,z=z+dz/2}} end
enemy=nil;function obj_get_first_with_behavior_id(id) return id==id_bhvGoomba and enemy or nil end
function obj_get_next_with_same_behavior_id() return nil end
function obj_mark_for_deletion(o) o.activeFlags=0 end
sent={};function network_send_object(o,reliable) table.insert(sent,{o,reliable}) end
function set_object_respawn_info_bits(o,bits) o.respawn=bits end
function play_sound() end
spawned={};function spawn_sync_object(b,model,x,y,z,setup) local o={};setup(o);table.insert(spawned,o);return o end
function spawn_non_sync_object() return {} end
function dist_between_objects() return 100 end
m={playerIndex=0,health=0x880,freeze=0,action=0,pos={x=0,y=0,z=0},faceAngle={y=0},
controller={buttonPressed=0,buttonDown=0},marioObj={globalPlayerIndex=2,behavior=1,header={gfx={cameraToObject={},angle={}}}}}
gMarioStates={[0]=m}
function prey(z,size) enemy={activeFlags=1,oSyncID=42,oAction=0,oGoombaSize=size or 0,oHeldState=0,oPosX=0,oPosY=0,oPosZ=z or 200,oBehParams2ndByte=4};return enemy end
function frame() hooks[3](m);m.controller.buttonPressed=0 end
function press(spin) m.controller.buttonPressed=B_BUTTON;m.controller.buttonDown=B_BUTTON | (spin and Z_TRIG or 0);frame() end
function advance(n) for i=1,n do frame() end end
`;
function run(code){const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const status=lauxlib.luaL_dostring(L,to_luastring(fixture+'\n'+mod+'\n'+code));const error=status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1));lua.lua_close(L);assert.equal(status,lua.LUA_OK,error);}
test('swallow is reliable, preserves spawner death flags and grants only one shot',()=>run(`
local o=prey();o.parentObj={oBehParams=0,oSyncID=9};press();advance(8)
assert(o.activeFlags==0 and #sent==2 and sent[2][2]==true)
assert(o.parentObj.respawn==1 and o.parentObj.oBehParams==256)
assert(gPlayerSyncTable[0].yoshiAmmo==1 and gPlayerSyncTable[0].yoshiEaten==1)
advance(30);press();assert(#spawned==1 and gPlayerSyncTable[0].yoshiAmmo==0)
press();assert(#spawned==1);advance(30);press();assert(#spawned==1)
`));
for(const scenario of ['blocked=true','enemy.oPosZ=500','enemy.oPosZ=-150','enemy.oPosX=200','enemy.oGoombaSize=1','enemy.oSyncID=0','enemy.oHeldState=1'])test(`tongue rejects invalid target: ${scenario}`,()=>run(`prey();${scenario};press();advance(12);assert(enemy.activeFlags==1 and #sent==0 and (gPlayerSyncTable[0].yoshiAmmo or 0)==0)`));
test('spin consumes one charge for three projectiles; warp and team death clear ammo',()=>run(`
gPlayerSyncTable[0].yoshiAmmo=1;press(true);assert(#spawned==3 and gPlayerSyncTable[0].yoshiAmmo==0)
gPlayerSyncTable[0].yoshiAmmo=1;hooks[1]();assert(gPlayerSyncTable[0].yoshiAmmo==0)
gPlayerSyncTable[0].yoshiAmmo=1;pending=true;press();assert(gPlayerSyncTable[0].yoshiAmmo==0 and #spawned==3)
`));
test('Mario and Luigi retain B; Yoshi preserves carrying, swimming and NPC interaction',()=>run(`
for _,id in ipairs({0,1}) do gNetworkPlayers[0].globalIndex=id;press();assert(m.controller.buttonDown==B_BUTTON) end
gNetworkPlayers[0].globalIndex=2
for _,state in ipairs({'held','swim','npc'}) do
 m.heldObj=state=='held' and {} or nil;m.action=state=='swim' and ACT_FLAG_SWIMMING or 0
 m.interactObj=state=='npc' and {activeFlags=1,oInteractType=INTERACT_TEXT} or nil
 press();assert(m.controller.buttonDown==B_BUTTON)
end
assert(#spawned==0 and gPlayerSyncTable[0].yoshiTongues==nil)
`));
test('Yoshi model override terminates and native Mario and Luigi models stay unchanged',()=>run(`
hooks[2](m.marioObj,0,1);assert(m.marioObj.model==381 and modelCalls==1)
m.marioObj.globalPlayerIndex=1;hooks[2](m.marioObj,0,362);assert(modelCalls==1)
`));
