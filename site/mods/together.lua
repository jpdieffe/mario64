-- name: Mario 64 Together
-- description: Three visible teammates, separate health, native head bouncing, shared death and restart.
-- incompatible: gamemode

local DEBUG = false
local pending = false
local serial = 0
local lastEpoch = nil
local resetTimer = 0
local grace = 0
local ticks = 0
local bounceCount = 0
local lastVel = 0
local lastReset = 0

local function request_death(m)
    if m.playerIndex ~= 0 then return false end
    if not pending and resetTimer == 0 and grace == 0 then
        pending = true
        serial = serial + 1
        -- One synchronized value prevents a request from being paired with
        -- an old epoch when packets arrive separately or out of order.
        gPlayerSyncTable[0].deathRequest = tostring(gGlobalSyncTable.resetEpoch or 0) .. ':' .. serial
    end
    return false -- One host-authoritative reset replaces individual death warps.
end

local function host_update()
    if not network_is_server() then return end
    if gGlobalSyncTable.resetEpoch == nil then gGlobalSyncTable.resetEpoch = 0 end
    local victim = nil
    for i = 0, MAX_PLAYERS - 1 do
        local np = gNetworkPlayers[i]
        if np.connected then
            local request = gPlayerSyncTable[i].deathRequest or ''
            local epoch = tonumber(string.match(request, '^(%d+):%d+$'))
            if epoch == gGlobalSyncTable.resetEpoch and victim == nil then victim = i end
        end
    end
    if victim ~= nil then
        local np = gNetworkPlayers[victim]
        gGlobalSyncTable.resetLevel = np.currLevelNum
        gGlobalSyncTable.resetAct = np.currActNum
        gGlobalSyncTable.resetVictim = np.globalIndex
        gGlobalSyncTable.resetEpoch = gGlobalSyncTable.resetEpoch + 1
    end
end

local function before_update(m)
    if m.playerIndex ~= 0 then return end
    gServerSettings.playerInteractions = PLAYER_INTERACTIONS_SOLID
    gServerSettings.bubbleDeath = false
    if grace > 0 then grace = grace - 1 end
    local epoch = gGlobalSyncTable.resetEpoch or 0
    if lastEpoch == nil then lastEpoch = epoch end
    if epoch ~= lastEpoch then
        lastEpoch = epoch
        resetTimer = 36
        pending = true
        lastReset = epoch
    end
    if resetTimer > 0 then
        resetTimer = resetTimer - 1
        m.freeze = 1
        m.health = 0xFF
        m.hurtCounter = 0
        m.healCounter = 0
        m.vel.x, m.vel.y, m.vel.z = 0, 0, 0
        m.forwardVel = 0
        m.controller.buttonDown, m.controller.buttonPressed = 0, 0
        m.controller.stickX, m.controller.stickY = 0, 0
        if resetTimer == 0 then
            m.freeze = 0
            m.health = 0x880
            m.invincTimer = 90
            -- All teammates restart at the failed course's entrance, even
            -- when they were in different rooms or levels when death occurred.
            local ok = warp_to_level(gGlobalSyncTable.resetLevel or LEVEL_CASTLE_GROUNDS, 1, gGlobalSyncTable.resetAct or 1)
            if not ok then warp_to_level(LEVEL_CASTLE_GROUNDS, 1, 1) end
            pending = false
            grace = 90
        end
    elseif grace > 0 then
        m.health = 0x880
        m.hurtCounter = 0
        m.freeze = 0
    elseif m.health < 0x100 then
        request_death(m)
    end
end

local function update()
    ticks = ticks + 1
    host_update()
    local m = gMarioStates[0]
    -- Observe the engine's collision bounce; the original collision code
    -- applies the impulse and squish. We do not replace Mario's movement.
    if lastVel < 0 and m.vel.y > 20 then
        for i = 1, MAX_PLAYERS - 1 do
            local other = gMarioStates[i]
            if gNetworkPlayers[i].connected and other.bounceSquishTimer > 0 then bounceCount = bounceCount + 1; break end
        end
    end
    lastVel = m.vel.y
    if ticks % 6 ~= 0 then return end
    local rows = {}
    for i = 0, MAX_PLAYERS - 1 do
        local np = gNetworkPlayers[i]
        if np.connected then
            local p = gMarioStates[i]
            rows[#rows + 1] = string.format('{"id":%d,"health":%d,"x":%.1f,"y":%.1f,"z":%.1f,"vy":%.1f,"action":%d,"level":%d,"squish":%d,"model":%d}', np.globalIndex, p.health, p.pos.x, p.pos.y, p.pos.z, p.vel.y, p.action, np.currLevelNum, p.bounceSquishTimer, obj_get_model_id_extended and obj_get_model_id_extended(p.marioObj) or 0)
        end
    end
    print('TOGETHER_STATE:{"epoch":' .. (gGlobalSyncTable.resetEpoch or 0) .. ',"resetting":' .. tostring(resetTimer > 0 or pending) .. ',"localId":' .. gNetworkPlayers[0].globalIndex .. ',"bounces":' .. bounceCount .. ',"lastReset":' .. lastReset .. ',"ammo":' .. (gPlayerSyncTable[0].yoshiAmmo or 0) .. ',"eaten":' .. (gPlayerSyncTable[0].yoshiEaten or 0) .. ',"shots":' .. (gPlayerSyncTable[0].yoshiShots or 0) .. ',"hits":' .. (gPlayerSyncTable[0].yoshiHits or 0) .. ',"tongues":' .. (gPlayerSyncTable[0].yoshiTongues or 0) .. ',"model":' .. (gPlayerSyncTable[0].yoshiModel or 0) .. (together_debug_state and together_debug_state() or '') .. ',"players":[' .. table.concat(rows, ',') .. ']}')
end

hook_event(HOOK_BEFORE_MARIO_UPDATE, before_update)
hook_event(HOOK_UPDATE, update)
hook_event(HOOK_ON_DEATH, request_death)
hook_event(HOOK_ALLOW_PVP_ATTACK, function() return false end)

-- Enabled only by the explicit debug URL; exercises the real native game.
if DEBUG then
    hook_chat_command('cooptest', 'Developer gameplay verification', function(msg)
        local m = gMarioStates[0]
        if msg == 'hurt' then m.health = 0x480; m.hurtCounter = 0; m.invincTimer = 0
        elseif msg == 'die' then grace = 0; m.health = 0xFF; request_death(m)
        elseif msg == 'course' then warp_to_level(LEVEL_WF, 1, 1)
        elseif msg == 'pit' then
            -- Whomp's Fortress: fall off the island into its native death plane.
            grace = 0
            m.pos.x, m.pos.y, m.pos.z = -6000, -2000, -6000
            m.vel.x, m.vel.y, m.vel.z = 0, -50, 0
            set_mario_action(m, ACT_FREEFALL, 0)
        elseif msg == 'meet' then
            warp_to_level(LEVEL_CASTLE_GROUNDS, 1, 1)
        elseif msg == 'base' then
            m.pos.x, m.pos.y, m.pos.z = -1328, 260, 4664
            m.vel.x, m.vel.y, m.vel.z = 0, 0, 0
            m.forwardVel = 0; m.invincTimer = 0; set_mario_action(m, ACT_IDLE, 0)
        elseif msg == 'above' or msg == 'beside' then
            for i = 1, MAX_PLAYERS - 1 do
                if gNetworkPlayers[i].connected then
                    local p = gMarioStates[i]
                    m.pos.x, m.pos.y, m.pos.z = p.pos.x + (msg == 'beside' and 180 or 0), p.pos.y + (msg == 'above' and 260 or 0), p.pos.z
                    m.vel.x, m.vel.y, m.vel.z = 0, -10, 0
                    m.forwardVel = 0; m.invincTimer = 0
                    set_mario_action(m, ACT_FREEFALL, 0)
                    break
                end
            end
        end
        return true
    end)
end
