// Authoritative game logic shared by server.js, the in-browser loopback socket and the test suite.
// Pure and deterministic: no timers, no I/O, no Math.random. Time advances only through tick(),
// randomness only through the seeded state.rng. Every mutating entry point returns a list of
// network events: { event, data, to?: socketId, except?: socketId } (no route = broadcast).

export const TICK_MS = 50;

export const RIVER = { width: 30, length: 2000, channelHalfWidth: 15, waterLevel: 0 };
export const CHECKPOINT_SPACING = 150;
export const FINISH_Z = -1500;
export const CHECKPOINTS = Array.from({ length: 8 }, (_, i) => -(i + 1) * CHECKPOINT_SPACING);
export const MAX_WAVE = -FINISH_Z / CHECKPOINT_SPACING;
export const SHOP_ZONE = { minX: 10, minZ: -250, maxZ: -150 };
export const PLAYER_COLORS = [0xff4444, 0x4444ff, 0x44ff44, 0xffff44];
export const SCOREBOARD_EVERY_TICKS = 10;
export const TEAM_WIPE_RESPAWN_MS = 3000;

export const PLAYER = {
    startHealth: 100,
    startCoins: 50,
    mass: 5,
    restY: 0.25,
    attackRange: 4,
    baseDamage: 10,
    blockFactor: 0.2,
    hitCooldownMs: 1000,
    safeHeight: 1, // whiteGuy cannot reach a player standing above this (planks, trees)
    startSpacingZ: 8,
};

export const PHYSICS = {
    baseCurrent: 100,
    currentRampZ: 500,
    basePaddle: 200,
    motorBoost: 100,
    attackBoost: 50,
    buoyancyGain: 60,
    submergeDepth: -1,
    waterDragPerFrame: 0.9,
    motorAngularDrag: 0.95,
    fps: 60,
    jumpVelocity: 15,
};

export const UPGRADES = {
    motor: { type: 'motor', cost: 10, name: 'Motor', speedBonus: 40, turnPenalty: 0.5 },
    weapon: { type: 'weapon', cost: 15, name: 'Squeaky Hammer', damageBonus: 20 },
    armor: { type: 'armor', cost: 20, name: 'Raft Armor', maxHealthBonus: 50 },
};

// spawnOffset is relative to the lead raft (negative z = downriver, ahead of the players).
export const ENEMY_TYPES = {
    whiteGuy: { baseHealth: 50, speed: 15, damage: 15, respawnDelay: 10000, hitRadius: 3, reward: 10, spawnOffset: 15, unlockZ: -100, homeX: 0 },
    mudAlien: { baseHealth: 150, speed: 10, damage: 30, respawnDelay: 20000, hitRadius: 3, reward: 20, spawnOffset: -50, unlockZ: -150, homeX: 15, chaseMin: 3, chaseMax: 100, aoeRadius: 5, aoeDamage: 1 },
    longWorm: { baseHealth: 200, speed: 40, damage: 40, respawnDelay: 30000, hitRadius: 5, reward: 30, spawnOffset: -60, unlockZ: -300, homeX: -10, aggroRange: 200, strikeStop: 2, cooldownMs: 2000 },
};

export const WAVE_SCALING = { health: 0.25, damage: 0.1, reward: 2, perExtraPlayerHealth: 0.2 };
export const POLICE_DPS_PER_TICK = 5;

export const BOT = {
    names: ['Rusty', 'Bolt', 'Pip'],
    formation: [{ x: -5, z: 5 }, { x: 5, z: 5 }, { x: 0, z: 10 }],
    engageRange: 30,
    leashRange: 45,
    engageStop: 2.5,
    attackCooldownMs: 700,
    blockChance: 0.35,
    soloAdvance: 30,
    evadeRadius: 8,
    xLimit: 13,
    gravity: 30,
    throwDamping: 0.85,
    shopPriority: ['weapon', 'armor', 'motor'],
};

// ---------- deterministic randomness ----------

export function createRng(seed = 1) {
    let a = seed >>> 0;
    return function mulberry32() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------- raft physics math (used by the Cannon client and the kinematic bots) ----------

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function riverCurrentMultiplier(z) {
    return 1 + Math.max(0, -z / PHYSICS.currentRampZ);
}

/** Downriver force (negative z) on a raft at (x, z); zero outside the channel. */
export function riverCurrentForce(x, z) {
    if (!(x > -RIVER.channelHalfWidth && x < RIVER.channelHalfWidth)) return 0;
    return -PHYSICS.baseCurrent * riverCurrentMultiplier(z);
}

export function isSubmerged(y) {
    return RIVER.waterLevel - y > PHYSICS.submergeDepth;
}

/** Vertical spring toward y = 0.5 (positive below, negative above), active while y < 1. */
export function buoyancyForce(y) {
    const depth = RIVER.waterLevel - y;
    return depth > PHYSICS.submergeDepth ? (depth + 0.5) * PHYSICS.buoyancyGain : 0;
}

/** Steady-state speed under constant force with per-frame velocity damping v' = drag·(v + F/m·dt). */
export function steadyStateSpeed(force, mass = PLAYER.mass, drag = PHYSICS.waterDragPerFrame, fps = PHYSICS.fps) {
    return (drag * force) / (mass * fps * (1 - drag));
}

/** Left/right paddle thrust from WASD; A drives the right paddle (turn left), D the left one. */
export function paddleForces(keys, upgrades = [], isAttacking = false) {
    const f = PHYSICS.basePaddle;
    let left = 0;
    let right = 0;
    if (keys.w) { left += f; right += f; }
    if (keys.s) { left -= f; right -= f; }
    if (keys.a) right += f;
    if (keys.d) left += f;
    if (keys.w && upgrades.includes('motor')) { left += PHYSICS.motorBoost; right += PHYSICS.motorBoost; }
    if (isAttacking) { left += PHYSICS.attackBoost; right += PHYSICS.attackBoost; }
    return { left, right };
}

/** 0 at the muddy start, 1 at the clear finish. */
export function waterClarity(z) {
    const muddyZ = -100;
    return clamp((z - muddyZ) / (FINISH_Z - muddyZ), 0, 1);
}

export function isInShopZone(pos) {
    return pos.x > SHOP_ZONE.minX && pos.z > SHOP_ZONE.minZ && pos.z < SHOP_ZONE.maxZ;
}

// ---------- upgrades ----------

export function upgradeStats(upgrades = []) {
    const has = (t) => upgrades.includes(t);
    return {
        attackDamage: PLAYER.baseDamage + (has('weapon') ? UPGRADES.weapon.damageBonus : 0),
        maxHealthBonus: has('armor') ? UPGRADES.armor.maxHealthBonus : 0,
        motorBoost: has('motor') ? PHYSICS.motorBoost : 0,
        angularDrag: has('motor') ? PHYSICS.motorAngularDrag : 1,
    };
}

export function canPurchase(player, type) {
    const upg = Object.hasOwn(UPGRADES, type) ? UPGRADES[type] : null;
    if (!player || !upg) return { ok: false, reason: 'unknown-upgrade' };
    if (player.upgrades.includes(type)) return { ok: false, reason: 'owned' };
    if (player.coins < upg.cost) return { ok: false, reason: 'insufficient-coins' };
    return { ok: true, reason: null };
}

export function blockedDamage(damage, isBlocking) {
    return isBlocking ? Math.floor(damage * PLAYER.blockFactor) : damage;
}

// ---------- waves & enemy scaling ----------

export function waveForZ(z) {
    return clamp(1 + Math.floor(Math.max(0, -z) / CHECKPOINT_SPACING), 1, MAX_WAVE);
}

export function waveMultipliers(wave) {
    const w = clamp(wave, 1, MAX_WAVE) - 1;
    return { health: 1 + WAVE_SCALING.health * w, damage: 1 + WAVE_SCALING.damage * w };
}

export function playerCountScale(playerCount) {
    return 1 + WAVE_SCALING.perExtraPlayerHealth * Math.max(0, playerCount - 1);
}

export function enemyMaxHealth(type, wave, playerCount = 1) {
    return Math.round(ENEMY_TYPES[type].baseHealth * waveMultipliers(wave).health * playerCountScale(playerCount));
}

export function enemyDamage(type, wave) {
    return Math.round(ENEMY_TYPES[type].damage * waveMultipliers(wave).damage);
}

export function killReward(type, wave) {
    return ENEMY_TYPES[type].reward + WAVE_SCALING.reward * (clamp(wave, 1, MAX_WAVE) - 1);
}

/** Opening enemy picked by crew size: bigger crews face the nastier opener. */
export function initialEnemyFor(playerCount) {
    if (playerCount >= 4) return 'longWorm';
    if (playerCount >= 3) return 'mudAlien';
    return 'whiteGuy';
}

export function scoreOf(p) {
    return p.kills * 100 + p.damageDealt + Math.floor(Math.max(0, -p.bestZ) / 10);
}

// ---------- geometry & enemy state machines ----------

export function distXZ(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

export function dist3(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Move pos toward target on the XZ plane by at most `step`, never overshooting. Returns true if it moved. */
export function moveToward(pos, target, step, stopDist = 0) {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopDist || d === 0) return false;
    const s = Math.min(step, d);
    pos.x += (dx / d) * s;
    pos.z += (dz / d) * s;
    return true;
}

/** Wizard raft: chases the rear raft, but only while it is down at water level. */
export function stepWhiteGuy(e, target, dt) {
    e.position.y = 0.5;
    if (target.position.y > PLAYER.safeHeight) return 'waiting';
    return moveToward(e.position, target.position, e.speed * dt, 2) ? 'chasing' : 'adjacent';
}

/** Mud alien: slow chaser with a leash; ignores rafts further than chaseMax. */
export function stepMudAlien(e, target, dt) {
    e.position.y = 0.5;
    const { chaseMin, chaseMax } = ENEMY_TYPES.mudAlien;
    const d = distXZ(e.position, target.position);
    if (d <= chaseMin || d >= chaseMax) return 'idle';
    moveToward(e.position, target.position, e.speed * dt);
    return 'chasing';
}

/** Long worm: idle → lock a vector on the rear raft → charge in a straight line → cooldown → idle. */
export function stepLongWorm(e, target, dt, now) {
    e.position.y = 0.5;
    const T = ENEMY_TYPES.longWorm;
    if (e.state === 'cooldown') {
        if (now >= e.cooldownUntil) e.state = 'idle';
        return e.state;
    }
    if (Math.abs(target.position.z - e.position.z) >= T.aggroRange) return e.state;
    if (e.state === 'idle') {
        e.targetPos = { x: target.position.x, z: target.position.z };
        e.state = 'charging';
    } else if (e.state === 'charging') {
        if (!moveToward(e.position, e.targetPos, e.speed * dt, T.strikeStop)) {
            e.state = 'cooldown';
            e.cooldownUntil = now + T.cooldownMs;
        }
    }
    return e.state;
}

// ---------- state construction ----------

const ev = (event, data, route) => ({ event, data, ...route });

function makeEnemy(type) {
    const T = ENEMY_TYPES[type];
    const e = {
        id: type, type,
        position: { x: T.homeX, y: 5, z: 100 },
        health: 0, maxHealth: 0,
        speed: T.speed, damage: T.damage, respawnDelay: T.respawnDelay,
        hasSpawned: false, respawnAt: null,
    };
    if (type === 'longWorm') Object.assign(e, { state: 'idle', targetPos: null, cooldownUntil: 0 });
    return e;
}

export function createGameState({ seed = 1, rng = createRng(seed) } = {}) {
    const npcs = [];
    for (let i = 0; i < 5; i++) {
        npcs.push({ id: `pedestrian_${i}`, type: 'pedestrian', position: { x: 20 + rng() * 10, y: 5, z: -190 - rng() * 20 }, health: 20, isDead: false });
    }
    for (let i = 0; i < 2; i++) {
        npcs.push({ id: `police_${i}`, type: 'police', position: { x: 25 + rng() * 5, y: 5, z: -190 - rng() * 20 }, health: 50, isDead: false, aggroTarget: null });
    }
    return {
        rng, now: 0, tickCount: 0,
        players: {},
        enemies: Object.fromEntries(Object.keys(ENEMY_TYPES).map((t) => [t, makeEnemy(t)])),
        npcs,
        gameStarted: false, gameWon: false,
        wave: 1, lastCheckpointZ: 0, wipeAt: null, joinCount: 0,
    };
}

export const alivePlayers = (state) => Object.values(state.players).filter((p) => !p.isDead);

/** Lead raft = furthest downriver (smallest z). */
export function leadPlayer(players) {
    return players.reduce((a, p) => (a && a.position.z <= p.position.z ? a : p), null);
}

/** Rear raft = furthest upriver (largest z); enemies hunt the straggler. */
export function rearPlayer(players) {
    return players.reduce((a, p) => (a && a.position.z >= p.position.z ? a : p), null);
}

export function addPlayer(state, id, { isBot = false, name } = {}) {
    const n = state.joinCount++;
    const slot = Object.keys(state.players).length;
    const botIndex = Object.values(state.players).filter((q) => q.isBot).length;
    const p = {
        id, isBot,
        name: name ?? (isBot ? BOT.names[botIndex % BOT.names.length] : `Player ${n + 1}`),
        color: PLAYER_COLORS[n % PLAYER_COLORS.length],
        position: { x: (state.rng() - 0.5) * 2, y: isBot ? PLAYER.restY : 5, z: (isBot ? slot : -slot) * PLAYER.startSpacingZ + (state.rng() * 2 - 1) }, // humans stagger ahead, bots fall in behind
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        health: PLAYER.startHealth, maxHealth: PLAYER.startHealth,
        isDead: false, coins: PLAYER.startCoins, upgrades: [],
        kills: 0, damageDealt: 0, damageTaken: 0, bestZ: 0,
    };
    if (isBot) {
        Object.assign(p, { botIndex, velocity: { x: 0, y: 0, z: 0 }, nextAttackAt: 0, lastHitAt: -Infinity, nextCheckpoint: 0, mode: 'follow' });
    }
    state.players[id] = p;
    if (isBot) return [ev('newPlayer', p)];
    return [
        ev('currentPlayers', state.players, { to: id }),
        ev('enemiesUpdate', state.enemies, { to: id }),
        ev('npcsUpdate', state.npcs, { to: id }),
        ev('newPlayer', p, { except: id }),
        ev('scoreboard', scoreboard(state), { to: id }),
    ];
}

export function removePlayer(state, id) {
    if (!state.players[id]) return [];
    delete state.players[id];
    return [ev('playerDisconnected', id)];
}

// ---------- combat & economy commands ----------

export function spawnEnemy(state, type, z) {
    const e = state.enemies[type];
    const crew = Math.max(1, Object.keys(state.players).length);
    e.maxHealth = e.health = enemyMaxHealth(type, state.wave, crew);
    e.damage = enemyDamage(type, state.wave);
    e.position.x = (state.rng() - 0.5) * 20;
    e.position.y = 0.5;
    e.position.z = z;
    e.hasSpawned = true;
    e.respawnAt = null;
    if (type === 'longWorm') Object.assign(e, { state: 'idle', targetPos: null, cooldownUntil: 0 });
    return [ev('enemyRespawn', e)];
}

function killEnemy(state, e, killer) {
    e.health = 0;
    e.respawnAt = state.now + e.respawnDelay;
    const events = [ev('enemyKilled', { id: e.id, by: killer?.id ?? null })];
    if (killer) {
        killer.kills += 1;
        killer.coins += killReward(e.type, state.wave);
        events.push(ev('playerStatsUpdate', killer, { to: killer.id }));
    }
    return events;
}

export function playerHitEnemy(state, playerId, enemyId) {
    const p = state.players[playerId];
    const e = Object.hasOwn(state.enemies, enemyId) ? state.enemies[enemyId] : null;
    if (!p || p.isDead || !e || e.health <= 0) return [];
    const dmg = upgradeStats(p.upgrades).attackDamage;
    p.damageDealt += Math.min(dmg, e.health);
    e.health -= dmg;
    const events = [ev('enemyHit', { id: e.id, health: Math.max(0, e.health), maxHealth: e.maxHealth, damage: dmg, by: p.id })];
    if (e.health <= 0) events.push(...killEnemy(state, e, p));
    return events;
}

export function resolveEnemyHit(state, playerId, enemyType, isBlocking = false) {
    const p = state.players[playerId];
    const e = Object.hasOwn(state.enemies, enemyType) ? state.enemies[enemyType] : null;
    if (!p || p.isDead || !e || e.health <= 0) return [];
    if (enemyType === 'whiteGuy' && p.position.y > PLAYER.safeHeight) return [];
    const dmg = blockedDamage(e.damage, !!isBlocking);
    p.health -= dmg;
    p.damageTaken += dmg;
    const events = [ev('playerHealthUpdate', { id: p.id, health: p.health, maxHealth: p.maxHealth, damage: dmg, by: enemyType, blocked: !!isBlocking })];
    if (enemyType === 'whiteGuy' && !isBlocking) {
        const force = { x: (state.rng() - 0.5) * 500, y: 500 + state.rng() * 500, z: (state.rng() - 0.5) * 500 };
        if (p.isBot) p.velocity = { x: force.x / 50, y: force.y / 50, z: force.z / 50 };
        events.push(ev('playerThrown', { id: p.id, force }));
    }
    if (p.health <= 0) {
        p.isDead = true;
        events.push(ev('playerDied', p.id));
    }
    return events;
}

export function enemyHitNpc(state, npcId, enemyId, damage) {
    const npc = state.npcs.find((n) => n.id === npcId);
    if (!npc || npc.isDead || !Number.isFinite(damage)) return [];
    npc.health -= damage;
    if (npc.health <= 0) npc.isDead = true;
    for (const n of state.npcs) if (n.type === 'police' && !n.isDead) n.aggroTarget = enemyId;
    return [ev('npcsUpdate', state.npcs)];
}

export function buyUpgrade(state, playerId, type) {
    const p = state.players[playerId];
    if (!canPurchase(p, type).ok) return [];
    const upg = UPGRADES[type];
    p.coins -= upg.cost;
    p.upgrades.push(type);
    const events = [];
    if (type === 'armor') {
        p.maxHealth += upg.maxHealthBonus;
        p.health += upg.maxHealthBonus;
        events.push(ev('playerHealthUpdate', { id: p.id, health: p.health, maxHealth: p.maxHealth }));
    }
    events.push(
        ev('playerStatsUpdate', p, { to: p.id }),
        ev('upgradePurchased', type, { to: p.id }),
        ev('playerUpgraded', { id: p.id, upgrades: p.upgrades, color: p.color }, { except: p.id }),
    );
    return events;
}

function revive(state, p, z) {
    p.isDead = false;
    p.health = p.maxHealth;
    p.position = { x: (state.rng() - 0.5) * 5, y: p.isBot ? PLAYER.restY : 5, z };
    if (p.isBot) p.velocity = { x: 0, y: 0, z: 0 };
    return ev('playerRevived', p);
}

/** Any raft crossing a checkpoint revives every fallen crewmate just past it. */
export function checkpointCrossed(state, checkpointZ) {
    if (!CHECKPOINTS.includes(checkpointZ)) return [];
    state.lastCheckpointZ = Math.min(state.lastCheckpointZ, checkpointZ);
    return Object.values(state.players).filter((p) => p.isDead).map((p) => revive(state, p, checkpointZ - 10));
}

export function crossedFinishLine(state, playerId) {
    if (state.gameWon || !state.players[playerId]) return [];
    state.gameWon = true;
    return [ev('gameWon', playerId), ev('scoreboard', scoreboard(state))];
}

const isVec = (v, keys) => v && keys.every((k) => Number.isFinite(v[k]));

export function setPlayerMovement(state, playerId, data) {
    const p = state.players[playerId];
    if (!p || p.isDead || !isVec(data?.position, ['x', 'y', 'z']) || !isVec(data?.quaternion, ['x', 'y', 'z', 'w'])) return [];
    p.position = { x: data.position.x, y: data.position.y, z: data.position.z };
    p.quaternion = { x: data.quaternion.x, y: data.quaternion.y, z: data.quaternion.z, w: data.quaternion.w };
    p.bestZ = Math.min(p.bestZ, p.position.z);
    return [ev('playerMoved', p, { except: p.id })];
}

/** Routes one client→server socket message. Unknown events are ignored. */
export function handleClientEvent(state, senderId, event, data) {
    switch (event) {
        case 'playerMovement': return setPlayerMovement(state, senderId, data);
        case 'playerHitEnemy': return playerHitEnemy(state, senderId, data?.enemyId);
        case 'enemyHitPlayer': return resolveEnemyHit(state, senderId, data?.enemyType, data?.isBlocking);
        case 'enemyHitNPC': return enemyHitNpc(state, data?.npcId, data?.enemyId, data?.damage);
        case 'buyUpgrade': return buyUpgrade(state, senderId, data);
        case 'checkpointCrossed': return checkpointCrossed(state, data?.checkpointZ);
        case 'crossedFinishLine': return crossedFinishLine(state, senderId);
        default: return [];
    }
}

// ---------- AI companion bots ----------

export function botMaxSpeed(upgrades = []) {
    const thrust = 2 * PHYSICS.basePaddle + PHYSICS.baseCurrent + 2 * upgradeStats(upgrades).motorBoost;
    return steadyStateSpeed(thrust);
}

/** Pure decision: what a bot wants to do this tick and where it wants to be. */
export function botDecide(state, bot) {
    if (bot.isDead) return { mode: 'dead' };
    if (state.gameWon) return { mode: 'hold', target: bot.position };
    const leader = leadPlayer(alivePlayers(state).filter((p) => !p.isBot));
    const worm = state.enemies.longWorm;
    const wormCharging = worm.health > 0 && worm.state === 'charging' && worm.targetPos;
    if (wormCharging && distXZ(bot.position, worm.targetPos) < BOT.evadeRadius) {
        // sidestep the strike vector toward the roomier bank, then punish during cooldown
        const side = bot.position.x >= worm.targetPos.x ? 1 : -1;
        const dir = Math.abs(worm.targetPos.x + side * BOT.evadeRadius) > BOT.xLimit ? -side : side;
        return { mode: 'evade', target: { x: worm.targetPos.x + dir * BOT.evadeRadius, z: bot.position.z } };
    }
    let best = null;
    for (const e of Object.values(state.enemies)) {
        if (e.health <= 0 || (e === worm && wormCharging)) continue;
        const d = distXZ(bot.position, e.position);
        if (d > BOT.engageRange) continue;
        if (leader && distXZ(leader.position, e.position) > BOT.leashRange) continue;
        if (!best || d < best.d) best = { e, d };
    }
    if (best) return { mode: 'engage', target: best.e.position, enemyId: best.e.id, distance: best.d };
    const slot = BOT.formation[bot.botIndex % BOT.formation.length];
    if (leader) return { mode: 'follow', target: { x: leader.position.x + slot.x, z: leader.position.z + slot.z } };
    return { mode: 'advance', target: { x: slot.x, z: bot.position.z - BOT.soloAdvance } };
}

export function yawQuaternion(dx, dz) {
    const theta = Math.atan2(-dx, -dz); // raft forward is local -z
    return { x: 0, y: Math.sin(theta / 2), z: 0, w: Math.cos(theta / 2) };
}

export function stepBot(state, bot, dt) {
    const events = [];
    const decision = botDecide(state, bot);
    bot.mode = decision.mode;
    if (decision.mode === 'dead') return events;
    const pos = bot.position;
    const before = { x: pos.x, z: pos.z };

    if (decision.mode !== 'hold') {
        moveToward(pos, decision.target, botMaxSpeed(bot.upgrades) * dt, decision.mode === 'engage' ? BOT.engageStop : 0);
    }
    // ballistic recovery after being thrown
    const v = bot.velocity;
    if (v.x || v.y || v.z || pos.y > PLAYER.restY) {
        pos.x += v.x * dt; pos.z += v.z * dt; pos.y += v.y * dt;
        v.y -= BOT.gravity * dt;
        v.x *= BOT.throwDamping; v.z *= BOT.throwDamping;
        if (pos.y <= PLAYER.restY) { pos.y = PLAYER.restY; bot.velocity = { x: 0, y: 0, z: 0 }; }
    }
    pos.x = clamp(pos.x, -BOT.xLimit, BOT.xLimit);
    bot.bestZ = Math.min(bot.bestZ, pos.z);

    const dx = pos.x - before.x;
    const dz = pos.z - before.z;
    if (Math.hypot(dx, dz) > 1e-3) bot.quaternion = yawQuaternion(dx, dz);

    if (decision.mode === 'engage' && state.now >= bot.nextAttackAt) {
        const e = state.enemies[decision.enemyId];
        if (dist3(pos, e.position) < PLAYER.attackRange) {
            bot.nextAttackAt = state.now + BOT.attackCooldownMs;
            events.push(...playerHitEnemy(state, bot.id, e.id));
        }
    }
    if (pos.z > SHOP_ZONE.minZ && pos.z < SHOP_ZONE.maxZ) {
        const pick = BOT.shopPriority.find((t) => canPurchase(bot, t).ok);
        if (pick) events.push(...buyUpgrade(state, bot.id, pick));
    }
    while (bot.nextCheckpoint < CHECKPOINTS.length && pos.z < CHECKPOINTS[bot.nextCheckpoint]) {
        events.push(...checkpointCrossed(state, CHECKPOINTS[bot.nextCheckpoint++]));
    }
    if (pos.z < FINISH_Z) events.push(...crossedFinishLine(state, bot.id));
    events.push(ev('playerMoved', { id: bot.id, position: pos, quaternion: bot.quaternion }));
    return events;
}

/** Server-side contact damage for bots (human clients detect their own contacts, as before). */
function botContacts(state) {
    const events = [];
    for (const bot of Object.values(state.players)) {
        if (!bot.isBot || bot.isDead || state.now - bot.lastHitAt < PLAYER.hitCooldownMs) continue;
        for (const e of Object.values(state.enemies)) {
            if (e.health <= 0 || bot.isDead) continue;
            if (dist3(bot.position, e.position) < ENEMY_TYPES[e.type].hitRadius) {
                bot.lastHitAt = state.now;
                events.push(...resolveEnemyHit(state, bot.id, e.type, state.rng() < BOT.blockChance));
            }
        }
    }
    return events;
}

// ---------- the authoritative tick ----------

function handleSpawns(state, alive) {
    if (alive.length === 0) return [];
    const leadZ = leadPlayer(alive).position.z;
    const events = [];
    if (!state.gameStarted && leadZ < -10) {
        state.gameStarted = true;
        const first = initialEnemyFor(alive.length);
        events.push(...spawnEnemy(state, first, leadZ + ENEMY_TYPES[first].spawnOffset));
    }
    if (!state.gameStarted) return events;
    for (const [type, T] of Object.entries(ENEMY_TYPES)) {
        if (!state.enemies[type].hasSpawned && leadZ < T.unlockZ) events.push(...spawnEnemy(state, type, leadZ + T.spawnOffset));
    }
    return events;
}

function handleWave(state, alive) {
    if (alive.length === 0) return [];
    const wave = waveForZ(leadPlayer(alive).position.z);
    if (wave <= state.wave) return [];
    state.wave = wave;
    return [ev('waveChanged', { wave, maxWave: MAX_WAVE })];
}

function handleRespawns(state, alive) {
    const anchor = leadPlayer(alive.length ? alive : Object.values(state.players));
    if (!anchor) return [];
    const events = [];
    for (const e of Object.values(state.enemies)) {
        if (e.respawnAt !== null && state.now >= e.respawnAt) events.push(...spawnEnemy(state, e.type, anchor.position.z + ENEMY_TYPES[e.type].spawnOffset));
    }
    return events;
}

function handleTeamWipe(state) {
    const players = Object.values(state.players);
    if (!state.gameStarted || state.gameWon || players.length === 0 || players.some((p) => !p.isDead)) {
        state.wipeAt = null;
        return [];
    }
    if (state.wipeAt === null) {
        state.wipeAt = state.now + TEAM_WIPE_RESPAWN_MS;
        return [ev('teamWiped', { respawnInMs: TEAM_WIPE_RESPAWN_MS, checkpointZ: state.lastCheckpointZ })];
    }
    if (state.now < state.wipeAt) return [];
    state.wipeAt = null;
    const z = state.lastCheckpointZ - 10;
    const events = players.map((p) => revive(state, p, z));
    for (const e of Object.values(state.enemies)) {
        if (e.health > 0) events.push(...spawnEnemy(state, e.type, z + ENEMY_TYPES[e.type].spawnOffset));
    }
    return events;
}

export function tick(state, dtMs = TICK_MS) {
    state.now += dtMs;
    state.tickCount += 1;
    const dt = dtMs / 1000;
    const events = [];

    for (const p of Object.values(state.players)) if (p.isBot) events.push(...stepBot(state, p, dt));

    const alive = alivePlayers(state);
    events.push(...handleSpawns(state, alive), ...handleWave(state, alive), ...handleRespawns(state, alive));

    const { whiteGuy, mudAlien, longWorm } = state.enemies;
    if (alive.length > 0) {
        const target = rearPlayer(alive);
        if (whiteGuy.health > 0) stepWhiteGuy(whiteGuy, target, dt);
        if (mudAlien.health > 0) stepMudAlien(mudAlien, target, dt);
        if (longWorm.health > 0) stepLongWorm(longWorm, target, dt, state.now);
    }

    if (mudAlien.health > 0) {
        const { aoeRadius, aoeDamage } = ENEMY_TYPES.mudAlien;
        let npcsChanged = false;
        for (const npc of state.npcs) {
            if (npc.isDead || distXZ(npc.position, mudAlien.position) >= aoeRadius) continue;
            npc.health -= aoeDamage;
            if (npc.health <= 0) npc.isDead = true;
            npcsChanged = true;
            for (const n of state.npcs) if (n.type === 'police' && !n.isDead) n.aggroTarget = 'mudAlien';
        }
        if (npcsChanged) events.push(ev('npcsUpdate', state.npcs));
    }

    for (const npc of state.npcs) {
        if (npc.type !== 'police' || npc.isDead || !npc.aggroTarget) continue;
        const e = state.enemies[npc.aggroTarget];
        if (!e || e.health <= 0) { npc.aggroTarget = null; continue; }
        e.health -= POLICE_DPS_PER_TICK;
        events.push(ev('enemyHit', { id: e.id, health: Math.max(0, e.health), maxHealth: e.maxHealth, damage: POLICE_DPS_PER_TICK, by: npc.id }));
        if (e.health <= 0) {
            npc.aggroTarget = null;
            events.push(...killEnemy(state, e, null));
        }
    }

    events.push(...botContacts(state), ...handleTeamWipe(state));
    events.push(ev('enemiesUpdate', state.enemies));
    if (state.tickCount % SCOREBOARD_EVERY_TICKS === 0) events.push(ev('scoreboard', scoreboard(state)));
    return events;
}

export function scoreboard(state) {
    const players = Object.values(state.players).map((p) => ({
        id: p.id, name: p.name, color: p.color, isBot: p.isBot,
        kills: p.kills, damageDealt: p.damageDealt, coins: p.coins,
        health: Math.max(0, p.health), maxHealth: p.maxHealth, isDead: p.isDead,
        upgrades: [...p.upgrades], score: scoreOf(p),
    })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const lead = leadPlayer(Object.values(state.players));
    return {
        wave: state.wave, maxWave: MAX_WAVE, finishZ: FINISH_Z,
        leadZ: lead ? lead.position.z : 0, gameWon: state.gameWon, players,
        enemies: Object.values(state.enemies).filter((e) => e.health > 0).map((e) => ({ id: e.id, health: e.health, maxHealth: e.maxHealth })),
    };
}
