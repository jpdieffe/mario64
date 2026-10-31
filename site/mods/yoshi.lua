-- Appended to together/main.lua so models, rules and sync tables are one mod.
-- Native multiplayer still owns movement, collision, enemies and health.
local yoshiModel = smlua_model_util_get_id('yoshi_player_geo')
local tongueModel = smlua_model_util_get_id('tongue_geo')
local cooldown, tongueTime, spinTime = 0, 0, 0
local seenTongue, seenSpin = {}, {}
local palette = {
    [PANTS]={r=255,g=0,b=0}, [SHIRT]={r=0,g=255,b=0},
    [GLOVES]={r=255,g=255,b=255}, [SHOES]={r=255,g=0,b=0},
    [HAIR]={r=255,g=0,b=0}, [SKIN]={r=255,g=222,b=57},
    [CAP]={r=0,g=255,b=0}, [EMBLEM]={r=255,g=0,b=0},
}
local function is_yoshi(m) return gNetworkPlayers[m.playerIndex].globalIndex == 2 end
local function clear_power()
    gPlayerSyncTable[0].yoshiAmmo = 0
    cooldown, tongueTime, spinTime = 0, 0, 0
end
hook_event(HOOK_ON_WARP, clear_power)

-- Use the actual allocated native player ID, not the generic browser join role.
hook_event(HOOK_OBJECT_SET_MODEL, function(o, model, extended)
    if extended ~= yoshiModel and o.globalPlayerIndex == 2 and obj_has_behavior_id(o, id_bhvMario) ~= 0 then
        obj_set_model_extended(o, yoshiModel)
    end
end)

local function visible_segment(x,y,z,tx,ty,tz)
    local ray = collision_find_surface_on_ray(x,y,z,tx-x,ty-y,tz-z)
    if ray.surface == nil then return true end
    local hit = ray.hitPos
    return (hit.x-x)^2 + (hit.y-y)^2 + (hit.z-z)^2 >= (tx-x)^2 + (ty-y)^2 + (tz-z)^2 - 25
end

local function edible(o)
    return o.activeFlags ~= ACTIVE_FLAG_DEACTIVATED and o.oSyncID ~= 0
        and o.oAction < 100 and o.oGoombaSize ~= GOOMBA_SIZE_HUGE
        and o.oHeldState == HELD_FREE
end

local function swallow(m)
    local best, distance = nil, 300
    local o = obj_get_first_with_behavior_id(id_bhvGoomba)
    while o do
        local dx, dy, dz = o.oPosX-m.pos.x, o.oPosY+30-(m.pos.y+80), o.oPosZ-m.pos.z
        local forward = dx*sins(m.faceAngle.y)+dz*coss(m.faceAngle.y)
        local side = math.abs(dx*coss(m.faceAngle.y)-dz*sins(m.faceAngle.y))
        if edible(o) and forward > 30 and forward < distance and side < 70 and math.abs(dy) < 95
            and visible_segment(m.pos.x,m.pos.y+80,m.pos.z,o.oPosX,o.oPosY+30,o.oPosZ) then
            best, distance = o, forward
        end
        o = obj_get_next_with_same_behavior_id(o)
    end
    if not best then return end
    -- Preserve the native triplet-spawner respawn flags when swallowing.
    if best.parentObj ~= nil and best.parentObj ~= best then
        local bits = best.oBehParams2ndByte & GOOMBA_BP_TRIPLET_FLAG_MASK
        set_object_respawn_info_bits(best.parentObj, bits >> 2)
        best.parentObj.oBehParams = best.parentObj.oBehParams | (bits << 6)
        if best.parentObj.oSyncID ~= 0 then network_send_object(best.parentObj, true) end
    end
    obj_mark_for_deletion(best)
    network_send_object(best, true)
    local s = gPlayerSyncTable[0]
    s.yoshiAmmo, s.yoshiEaten = 1, (s.yoshiEaten or 0)+1
    play_sound(SOUND_GENERAL_YOSHI_TALK, m.marioObj.header.gfx.cameraToObject)
end

local tongueBehavior = hook_behavior(nil, OBJ_LIST_GENACTOR, true, function(o)
    o.oFlags = OBJ_FLAG_UPDATE_GFX_POS_AND_ANGLE
    o.oInteractType = 0
end, function(o)
    local np = network_player_from_global_index(2)
    if np == nil or not np.connected or o.oTimer >= 16 then obj_mark_for_deletion(o); return end
    local m = gMarioStates[np.localIndex]
    if np.currLevelNum ~= gNetworkPlayers[0].currLevelNum or np.currAreaIndex ~= gNetworkPlayers[0].currAreaIndex
        or m.health < 0x100 then obj_mark_for_deletion(o); return end
    local length = math.max(1, math.sin((o.oTimer+1)*math.pi/17)*260)
    o.oPosX = m.pos.x + sins(m.faceAngle.y)*45
    o.oPosY = m.pos.y + 100
    o.oPosZ = m.pos.z + coss(m.faceAngle.y)*45
    o.oFaceAngleYaw = m.faceAngle.y
    obj_scale_xyz(o, 1.6, 1.6, length/100)
end)

define_custom_obj_fields({oTogetherEpoch='u32'})
local fireBehavior = hook_behavior(nil, OBJ_LIST_GENACTOR, true, function(o)
    o.oFlags = OBJ_FLAG_UPDATE_GFX_POS_AND_ANGLE
    o.oInteractType = 0 -- Projectiles can never burn teammates.
    obj_set_billboard(o)
    obj_scale(o, 2)
    network_init_object(o, false, {'oTogetherEpoch'})
end, function(o)
    if o.oTimer >= 42 or o.oTogetherEpoch ~= (gGlobalSyncTable.resetEpoch or 0) then obj_mark_for_deletion(o); return end
    local x, z = o.oPosX+sins(o.oMoveAngleYaw)*38, o.oPosZ+coss(o.oMoveAngleYaw)*38
    if not visible_segment(o.oPosX,o.oPosY,o.oPosZ,x,o.oPosY,z) then obj_mark_for_deletion(o); return end
    o.oPosX, o.oPosZ = x, z
    o.oAnimState = o.oAnimState+1
    if not is_yoshi(gMarioStates[0]) then return end
    -- Only the firing player applies hits, once, through native enemy reactions.
    for _, behavior in ipairs({id_bhvGoomba,id_bhvBobomb,id_bhvPiranhaPlant}) do
        local target = obj_get_first_with_behavior_id(behavior)
        while target do
            if target.activeFlags ~= ACTIVE_FLAG_DEACTIVATED and target.oSyncID ~= 0 and target.oAction < 100
                and math.abs(target.oPosY+35-o.oPosY) < 100
                and (target.oPosX-x)^2+(target.oPosZ-z)^2 < 110^2
                and visible_segment(x,o.oPosY,z,target.oPosX,target.oPosY+35,target.oPosZ) then
                target.oInteractStatus = target.oInteractStatus | ATTACK_FAST_ATTACK | INT_STATUS_WAS_ATTACKED | INT_STATUS_INTERACTED
                network_send_object(target, true)
                gPlayerSyncTable[0].yoshiHits = (gPlayerSyncTable[0].yoshiHits or 0)+1
                obj_mark_for_deletion(o); network_send_object(o, true)
                return
            end
            target = obj_get_next_with_same_behavior_id(target)
        end
    end
end)

hook_event(HOOK_BEFORE_MARIO_UPDATE, function(m)
    if m.playerIndex ~= 0 or not is_yoshi(m) then return end
    local s = gPlayerSyncTable[0]
    if pending or resetTimer > 0 or m.health < 0x100 then clear_power(); return end
    if cooldown > 0 then cooldown = cooldown-1 end
    if tongueTime > 0 then
        tongueTime = tongueTime-1
        if tongueTime == 9 and (s.yoshiAmmo or 0) == 0 then swallow(m) end
    end
    -- Preserve B for swimming, carrying, reading, cannons and Bowser grabs.
    if m.heldObj ~= nil or (m.action & ACT_FLAG_SWIMMING) ~= 0
        or (m.action & ACT_GROUP_MASK) == ACT_GROUP_CUTSCENE or m.freeze ~= 0 then return end
    local interaction = m.interactObj
    if interaction ~= nil and interaction.activeFlags ~= ACTIVE_FLAG_DEACTIVATED
        and (interaction.oInteractType & (INTERACT_TEXT | INTERACT_GRABBABLE)) ~= 0
        and dist_between_objects(m.marioObj,interaction) < 200 then return end
    local press = (m.controller.buttonPressed & B_BUTTON) ~= 0
    m.controller.buttonPressed = m.controller.buttonPressed & ~B_BUTTON
    m.controller.buttonDown = m.controller.buttonDown & ~B_BUTTON
    if not press or cooldown > 0 then return end
    cooldown = 24
    if (s.yoshiAmmo or 0) > 0 then
        local spin = (m.controller.buttonDown & Z_TRIG) ~= 0
        s.yoshiAmmo, s.yoshiShots = 0, (s.yoshiShots or 0)+1
        if spin then s.yoshiSpin = (s.yoshiSpin or 0)+1 end
        local angles = spin and {-0x3000,0,0x3000} or {0}
        for _, offset in ipairs(angles) do
            local yaw = m.faceAngle.y+offset
            spawn_sync_object(fireBehavior, E_MODEL_RED_FLAME, m.pos.x+sins(yaw)*65,m.pos.y+80,m.pos.z+coss(yaw)*65,function(o)
                o.oMoveAngleYaw = yaw
                o.oTogetherEpoch = gGlobalSyncTable.resetEpoch or 0
            end)
        end
        play_sound(SOUND_OBJ_FLAME_BLOWN,m.marioObj.header.gfx.cameraToObject)
    else
        tongueTime = 16
        s.yoshiTongues = (s.yoshiTongues or 0)+1
    end
end)

hook_event(HOOK_MARIO_UPDATE, function(m)
    local np = gNetworkPlayers[m.playerIndex]
    if not np.connected then return end
    local id = np.globalIndex
    m.character = gCharacters[id == 1 and CT_LUIGI or CT_MARIO]
    if not is_yoshi(m) then return end
    for part, color in pairs(palette) do network_player_set_override_palette_color(np,part,color) end
    obj_set_model_extended(m.marioObj,yoshiModel)
    if m.playerIndex == 0 then gPlayerSyncTable[0].yoshiModel = yoshiModel end
    local s = gPlayerSyncTable[m.playerIndex]
    local count, spin = s.yoshiTongues or 0, s.yoshiSpin or 0
    if count ~= (seenTongue[id] or 0) then
        seenTongue[id] = count
        spawn_non_sync_object(tongueBehavior,tongueModel,m.pos.x,m.pos.y+100,m.pos.z,nil)
    end
    if spin ~= (seenSpin[id] or 0) then seenSpin[id] = spin; spinTime = 16 end
    if spinTime > 0 then
        m.marioObj.header.gfx.angle.y = m.faceAngle.y+(16-spinTime)*0x1000
        spinTime = spinTime-1
    end
end)

hook_event(HOOK_ON_NAMETAGS_RENDER, function(index)
    local names = {[0]='Mario',[1]='Luigi',[2]='Yoshi'}
    return {name=names[gNetworkPlayers[index].globalIndex] or 'Friend'}
end)

if DEBUG then
    function together_debug_state()
        local count = 0
        local o = obj_get_first_with_behavior_id(id_bhvGoomba)
        while o do
            if o.activeFlags ~= ACTIVE_FLAG_DEACTIVATED then count = count+1 end
            o = obj_get_next_with_same_behavior_id(o)
        end
        return ',"goombas":' .. count
    end
    -- Real synced Goombas in a safe test area, never available in normal rooms.
    hook_chat_command('yoshitest','Developer Yoshi gameplay verification',function(msg)
        local m = gMarioStates[0]
        if msg == 'prey' or msg == 'target' then
            local distance = msg == 'prey' and 230 or 350
            spawn_sync_object(id_bhvGoomba,E_MODEL_GOOMBA,m.pos.x+sins(m.faceAngle.y)*distance,m.pos.y,m.pos.z+coss(m.faceAngle.y)*distance,function(o)
                o.oBehParams = 0; o.oBehParams2ndByte = 0
            end)
        elseif msg == 'face' then m.faceAngle.y=0; m.forwardVel=0
        end
        return true
    end)
end
