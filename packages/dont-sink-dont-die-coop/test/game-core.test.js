import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../shared/game-core.js';

const { ENEMY_TYPES, PLAYER, PHYSICS, TICK_MS } = G;
const DT = TICK_MS / 1000;

/** Fresh seeded state with `humans` players (ids p1..pn) placed at the given z positions. */
function setup({ humans = 1, zs = [], seed = 42 } = {}) {
    const state = G.createGameState({ seed });
    for (let i = 0; i < humans; i++) {
        G.addPlayer(state, `p${i + 1}`);
        state.players[`p${i + 1}`].position = { x: 0, y: PLAYER.restY, z: zs[i] ?? 0 };
    }
    return state;
}
const named = (events, name) => events.filter((e) => e.event === name);
const enemyAt = (state, type, pos, extra = {}) => {
    G.spawnEnemy(state, type, pos.z);
    Object.assign(state.enemies[type].position, pos);
    return Object.assign(state.enemies[type], extra);
};
const runTicks = (state, n) => { const out = []; for (let i = 0; i < n; i++) out.push(...G.tick(state)); return out; };

describe('raft physics math', () => {
    test('river current ramps linearly downriver', () => {
        assert.equal(G.riverCurrentMultiplier(50), 1);
        assert.equal(G.riverCurrentMultiplier(0), 1);
        assert.equal(G.riverCurrentMultiplier(-500), 2);
        assert.equal(G.riverCurrentMultiplier(-1500), 4);
    });

    test('current only acts inside the channel (open interval)', () => {
        assert.equal(G.riverCurrentForce(0, -500), -200);
        assert.equal(G.riverCurrentForce(14.9, 0), -100);
        assert.equal(G.riverCurrentForce(15, 0), 0);
        assert.equal(G.riverCurrentForce(-15, 0), 0);
        assert.equal(G.riverCurrentForce(30, -1000), 0);
    });

    test('buoyancy is a spring centred 0.5 above the surface, off beyond the band', () => {
        assert.equal(G.buoyancyForce(0), 30);
        assert.equal(G.buoyancyForce(-0.5), 60);
        assert.equal(G.buoyancyForce(0.5), 0);
        assert.ok(G.buoyancyForce(0.9) < 0); // skimming rafts are pulled back down
        assert.equal(G.buoyancyForce(1), 0);
        assert.equal(G.isSubmerged(0.999), true);
        assert.equal(G.isSubmerged(1), false);
    });

    test('paddle forces: W both, A right only, D left only, S reverses', () => {
        assert.deepEqual(G.paddleForces({ w: true }), { left: 200, right: 200 });
        assert.deepEqual(G.paddleForces({ a: true }), { left: 0, right: 200 });
        assert.deepEqual(G.paddleForces({ d: true }), { left: 200, right: 0 });
        assert.deepEqual(G.paddleForces({ s: true }), { left: -200, right: -200 });
        assert.deepEqual(G.paddleForces({ w: true, a: true }), { left: 200, right: 400 });
        assert.deepEqual(G.paddleForces({}), { left: 0, right: 0 });
    });

    test('motor boosts only while paddling forward; attacking lunges', () => {
        assert.deepEqual(G.paddleForces({ w: true }, ['motor']), { left: 300, right: 300 });
        assert.deepEqual(G.paddleForces({ a: true }, ['motor']), { left: 0, right: 200 });
        assert.deepEqual(G.paddleForces({}, [], true), { left: 50, right: 50 });
    });

    test('steady-state speed matches the per-frame drag recurrence', () => {
        for (const force of [100, 500, 700]) {
            let v = 0;
            for (let i = 0; i < 600; i++) v = PHYSICS.waterDragPerFrame * (v + force / PLAYER.mass / PHYSICS.fps);
            assert.ok(Math.abs(v - G.steadyStateSpeed(force)) < 1e-9);
        }
        assert.ok(Math.abs(G.steadyStateSpeed(100) - 3) < 1e-9); // drifting
        assert.ok(Math.abs(G.steadyStateSpeed(500) - 15) < 1e-9); // paddling + current
    });

    test('water clears from muddy start to the finish line', () => {
        assert.equal(G.waterClarity(0), 0);
        assert.equal(G.waterClarity(-100), 0);
        assert.equal(G.waterClarity(-800), 0.5);
        assert.equal(G.waterClarity(-1500), 1);
        assert.equal(G.waterClarity(-3000), 1);
    });

    test('shop zone is the city bank band', () => {
        assert.equal(G.isInShopZone({ x: 12, z: -200 }), true);
        assert.equal(G.isInShopZone({ x: 9, z: -200 }), false);
        assert.equal(G.isInShopZone({ x: 12, z: -150 }), false);
        assert.equal(G.isInShopZone({ x: 12, z: -260 }), false);
    });
});

describe('upgrades', () => {
    test('costs and starting purse: a fresh raft can afford the full kit exactly once', () => {
        const total = Object.values(G.UPGRADES).reduce((s, u) => s + u.cost, 0);
        assert.deepEqual(Object.values(G.UPGRADES).map((u) => u.cost), [10, 15, 20]);
        assert.ok(total <= PLAYER.startCoins && total + 10 > PLAYER.startCoins);
    });

    test('upgradeStats derives combat and handling numbers', () => {
        assert.deepEqual(G.upgradeStats([]), { attackDamage: 10, maxHealthBonus: 0, motorBoost: 0, angularDrag: 1 });
        assert.deepEqual(G.upgradeStats(['motor', 'weapon', 'armor']), { attackDamage: 30, maxHealthBonus: 50, motorBoost: 100, angularDrag: 0.95 });
    });

    test('canPurchase explains every refusal', () => {
        const p = { coins: 12, upgrades: ['motor'] };
        assert.deepEqual(G.canPurchase(p, 'motor'), { ok: false, reason: 'owned' });
        assert.deepEqual(G.canPurchase(p, 'weapon'), { ok: false, reason: 'insufficient-coins' });
        assert.deepEqual(G.canPurchase(p, 'jetpack'), { ok: false, reason: 'unknown-upgrade' });
        assert.deepEqual(G.canPurchase(p, '__proto__'), { ok: false, reason: 'unknown-upgrade' });
        assert.deepEqual(G.canPurchase(null, 'motor'), { ok: false, reason: 'unknown-upgrade' });
        assert.deepEqual(G.canPurchase({ coins: 15, upgrades: [] }, 'weapon'), { ok: true, reason: null });
    });

    test('buying deducts coins and routes private vs broadcast events', () => {
        const s = setup({ humans: 2 });
        const events = G.buyUpgrade(s, 'p1', 'motor');
        assert.equal(s.players.p1.coins, 40);
        assert.deepEqual(s.players.p1.upgrades, ['motor']);
        assert.equal(named(events, 'playerStatsUpdate')[0].to, 'p1');
        assert.equal(named(events, 'upgradePurchased')[0].to, 'p1');
        assert.equal(named(events, 'playerUpgraded')[0].except, 'p1');
        assert.deepEqual(G.buyUpgrade(s, 'p1', 'motor'), []);
        assert.equal(s.players.p1.coins, 40);
    });

    test('armor raises max and current health by 50', () => {
        const s = setup();
        s.players.p1.health = 70;
        const [hp] = named(G.buyUpgrade(s, 'p1', 'armor'), 'playerHealthUpdate');
        assert.deepEqual(hp.data, { id: 'p1', health: 120, maxHealth: 150 });
    });

    test('squeaky hammer triples hit damage', () => {
        const s = setup();
        enemyAt(s, 'mudAlien', { x: 0, z: -5 });
        G.playerHitEnemy(s, 'p1', 'mudAlien');
        G.buyUpgrade(s, 'p1', 'weapon');
        const [hit] = named(G.playerHitEnemy(s, 'p1', 'mudAlien'), 'enemyHit');
        assert.equal(hit.data.damage, 30);
        assert.equal(s.enemies.mudAlien.health, 150 - 10 - 30);
    });
});

describe('waves and scaling', () => {
    test('wave index follows checkpoint spacing and clamps', () => {
        assert.equal(G.waveForZ(100), 1);
        assert.equal(G.waveForZ(0), 1);
        assert.equal(G.waveForZ(-149.9), 1);
        assert.equal(G.waveForZ(-150), 2);
        assert.equal(G.waveForZ(-1499), 10);
        assert.equal(G.waveForZ(-5000), G.MAX_WAVE);
        assert.equal(G.MAX_WAVE, 10);
    });

    test('wave multipliers grow linearly and clamp to valid waves', () => {
        assert.deepEqual(G.waveMultipliers(1), { health: 1, damage: 1 });
        assert.deepEqual(G.waveMultipliers(10), { health: 3.25, damage: 1.9 });
        assert.deepEqual(G.waveMultipliers(0), G.waveMultipliers(1));
        assert.deepEqual(G.waveMultipliers(99), G.waveMultipliers(10));
    });

    test('enemy health scales with wave and crew size', () => {
        assert.equal(G.enemyMaxHealth('whiteGuy', 1, 1), 50);
        assert.equal(G.enemyMaxHealth('mudAlien', 1, 3), 210);
        assert.equal(G.enemyMaxHealth('longWorm', 5, 4), 640);
        assert.equal(G.playerCountScale(0), 1);
    });

    test('enemy damage and rewards scale with wave', () => {
        assert.equal(G.enemyDamage('whiteGuy', 1), 15);
        assert.equal(G.enemyDamage('whiteGuy', 6), 23); // 15 × 1.5 = 22.5 → 23
        assert.equal(G.enemyDamage('longWorm', 10), 76);
        assert.equal(G.killReward('whiteGuy', 1), 10);
        assert.equal(G.killReward('longWorm', 10), 48);
    });

    test('opening enemy depends on crew size', () => {
        assert.deepEqual([1, 2, 3, 4, 5].map(G.initialEnemyFor), ['whiteGuy', 'whiteGuy', 'mudAlien', 'longWorm', 'longWorm']);
    });

    test('wave advances once per threshold and never regresses', () => {
        const s = setup();
        s.players.p1.position.z = -160;
        const first = named(G.tick(s), 'waveChanged');
        assert.deepEqual(first.map((e) => e.data), [{ wave: 2, maxWave: 10 }]);
        assert.deepEqual(named(G.tick(s), 'waveChanged'), []);
        s.players.p1.position.z = -5;
        G.tick(s);
        assert.equal(s.wave, 2);
    });

    test('spawns snapshot the current wave stats', () => {
        const s = setup({ humans: 2 });
        s.wave = 4;
        G.spawnEnemy(s, 'mudAlien', -50);
        const e = s.enemies.mudAlien;
        assert.equal(e.maxHealth, G.enemyMaxHealth('mudAlien', 4, 2));
        assert.equal(e.health, e.maxHealth);
        assert.equal(e.damage, G.enemyDamage('mudAlien', 4));
    });
});

describe('spawning', () => {
    test('nothing spawns until the lead raft passes z = -10', () => {
        const s = setup({ zs: [-9] });
        assert.deepEqual(named(G.tick(s), 'enemyRespawn'), []);
        s.players.p1.position.z = -11;
        const [spawn] = named(G.tick(s), 'enemyRespawn');
        assert.equal(spawn.data.id, 'whiteGuy');
        assert.equal(s.gameStarted, true);
    });

    test('crew of four opens with the long worm ahead of the lead', () => {
        const s = setup({ humans: 4, zs: [-20, -12, -5, 0] });
        const [spawn] = named(G.tick(s), 'enemyRespawn');
        assert.equal(spawn.data.id, 'longWorm');
        assert.equal(s.enemies.longWorm.position.z, -20 + ENEMY_TYPES.longWorm.spawnOffset);
    });

    test('progress unlocks each remaining enemy exactly once', () => {
        const s = setup({ zs: [-20] });
        G.tick(s);
        s.players.p1.position.z = -310;
        const ids = named(G.tick(s), 'enemyRespawn').map((e) => e.data.id).sort();
        assert.deepEqual(ids, ['longWorm', 'mudAlien']);
        assert.deepEqual(named(G.tick(s), 'enemyRespawn'), []);
    });
});

describe('enemy state machines', () => {
    test('moveToward never overshoots and honours the stop radius', () => {
        const pos = { x: 0, z: 0 };
        assert.equal(G.moveToward(pos, { x: 3, z: 4 }, 100), true);
        assert.deepEqual(pos, { x: 3, z: 4 });
        assert.equal(G.moveToward(pos, { x: 3, z: 4 }, 1), false);
        const p2 = { x: 0, z: 0 };
        assert.equal(G.moveToward(p2, { x: 0, z: 1 }, 5, 2), false);
    });

    test('wizard ignores rafts perched above the safe height', () => {
        const e = { position: { x: 0, y: 5, z: 20 }, speed: 15 };
        assert.equal(G.stepWhiteGuy(e, { position: { x: 0, y: 2.5, z: 0 } }, DT), 'waiting');
        assert.deepEqual(e.position, { x: 0, y: 0.5, z: 20 });
    });

    test('wizard chases at speed × dt and halts within 2 units', () => {
        const e = { position: { x: 0, y: 0.5, z: 20 }, speed: 15 };
        const target = { position: { x: 0, y: 0.25, z: 0 } };
        assert.equal(G.stepWhiteGuy(e, target, DT), 'chasing');
        assert.ok(Math.abs(e.position.z - 19.25) < 1e-9);
        e.position.z = 1.5;
        assert.equal(G.stepWhiteGuy(e, target, DT), 'adjacent');
    });

    test('mud alien only chases inside its leash band', () => {
        const target = { position: { x: 0, y: 0, z: 0 } };
        const far = { position: { x: 0, y: 0, z: 150 }, speed: 10 };
        const near = { position: { x: 0, y: 0, z: 2 }, speed: 10 };
        const mid = { position: { x: 0, y: 0, z: 50 }, speed: 10 };
        assert.equal(G.stepMudAlien(far, target, DT), 'idle');
        assert.equal(G.stepMudAlien(near, target, DT), 'idle');
        assert.equal(G.stepMudAlien(mid, target, DT), 'chasing');
        assert.ok(Math.abs(mid.position.z - 49.5) < 1e-9);
    });

    test('long worm locks a strike vector and does not track afterwards', () => {
        const worm = { position: { x: 0, y: 0, z: -40 }, speed: 40, state: 'idle', targetPos: null, cooldownUntil: 0 };
        const target = { position: { x: 5, y: 0, z: 0 } };
        assert.equal(G.stepLongWorm(worm, target, DT, 0), 'charging');
        assert.deepEqual(worm.targetPos, { x: 5, z: 0 });
        target.position.x = -10;
        G.stepLongWorm(worm, target, DT, 50);
        assert.deepEqual(worm.targetPos, { x: 5, z: 0 });
    });

    test('long worm: charge → cooldown at strike distance → idle after exactly 2 s', () => {
        const worm = { position: { x: 0, y: 0, z: -1.5 }, speed: 40, state: 'charging', targetPos: { x: 0, z: 0 }, cooldownUntil: 0 };
        const target = { position: { x: 0, y: 0, z: 0 } };
        assert.equal(G.stepLongWorm(worm, target, DT, 1000), 'cooldown');
        assert.equal(worm.cooldownUntil, 3000);
        assert.equal(G.stepLongWorm(worm, target, DT, 2999), 'cooldown');
        assert.equal(G.stepLongWorm(worm, target, DT, 3000), 'idle');
    });

    test('long worm stays dormant when the rear raft is ≥ 200 away', () => {
        const worm = { position: { x: 0, y: 0, z: -400 }, speed: 40, state: 'idle', targetPos: null };
        assert.equal(G.stepLongWorm(worm, { position: { x: 0, y: 0, z: -200 } }, DT, 0), 'idle');
        assert.equal(worm.targetPos, null);
    });

    test('enemies hunt the rear raft, spawns key off the lead raft', () => {
        const players = [{ position: { z: -50 } }, { position: { z: 10 } }, { position: { z: -5 } }];
        assert.equal(G.rearPlayer(players).position.z, 10);
        assert.equal(G.leadPlayer(players).position.z, -50);
        assert.equal(G.leadPlayer([]), null);
    });
});

describe('combat and raft damage', () => {
    test('blocking absorbs 80% (floored)', () => {
        assert.equal(G.blockedDamage(40, false), 40);
        assert.equal(G.blockedDamage(40, true), 8);
        assert.equal(G.blockedDamage(15, true), 3);
        assert.equal(G.blockedDamage(4, true), 0);
    });

    test('wizard cannot hurt a raft standing on an obstacle', () => {
        const s = setup();
        enemyAt(s, 'whiteGuy', { x: 0, z: 1 });
        s.players.p1.position.y = 2.5;
        assert.deepEqual(G.resolveEnemyHit(s, 'p1', 'whiteGuy', false), []);
        assert.equal(s.players.p1.health, 100);
    });

    test('unblocked wizard hit throws the raft; a block prevents the throw', () => {
        const s = setup();
        enemyAt(s, 'whiteGuy', { x: 0, z: 1 });
        const [thrown] = named(G.resolveEnemyHit(s, 'p1', 'whiteGuy', false), 'playerThrown');
        assert.ok(thrown.data.force.y >= 500 && thrown.data.force.y < 1000);
        assert.ok(Math.abs(thrown.data.force.x) <= 250 && Math.abs(thrown.data.force.z) <= 250);
        assert.deepEqual(named(G.resolveEnemyHit(s, 'p1', 'whiteGuy', true), 'playerThrown'), []);
        assert.equal(s.players.p1.health, 100 - 15 - 3);
    });

    test('server uses its own enemy damage, not the client-reported number', () => {
        const s = setup();
        enemyAt(s, 'mudAlien', { x: 0, z: 1 });
        G.handleClientEvent(s, 'p1', 'enemyHitPlayer', { playerId: 'p2', damage: 9999, enemyType: 'mudAlien', isBlocking: false });
        assert.equal(s.players.p1.health, 70);
    });

    test('lethal damage kills once; corpses take no further hits', () => {
        const s = setup();
        enemyAt(s, 'longWorm', { x: 0, z: 1 });
        s.players.p1.health = 30;
        const events = G.resolveEnemyHit(s, 'p1', 'longWorm', false);
        assert.deepEqual(named(events, 'playerDied').map((e) => e.data), ['p1']);
        assert.equal(s.players.p1.isDead, true);
        assert.deepEqual(G.resolveEnemyHit(s, 'p1', 'longWorm', false), []);
    });

    test('dead or unknown enemies deal no damage', () => {
        const s = setup();
        assert.deepEqual(G.resolveEnemyHit(s, 'p1', 'whiteGuy', false), []);
        assert.deepEqual(G.resolveEnemyHit(s, 'p1', 'toString', false), []);
        assert.deepEqual(G.playerHitEnemy(s, 'p1', 'constructor'), []);
    });

    test('kills credit the killer, overkill is not counted as damage', () => {
        const s = setup();
        G.buyUpgrade(s, 'p1', 'weapon');
        enemyAt(s, 'whiteGuy', { x: 0, z: -2 });
        G.playerHitEnemy(s, 'p1', 'whiteGuy');
        const events = G.playerHitEnemy(s, 'p1', 'whiteGuy');
        const p = s.players.p1;
        assert.equal(p.damageDealt, 50);
        assert.equal(p.kills, 1);
        assert.equal(p.coins, 50 - 15 + G.killReward('whiteGuy', 1));
        assert.deepEqual(named(events, 'enemyKilled')[0].data, { id: 'whiteGuy', by: 'p1' });
        assert.equal(named(events, 'playerStatsUpdate')[0].to, 'p1');
        assert.equal(s.enemies.whiteGuy.respawnAt, s.now + ENEMY_TYPES.whiteGuy.respawnDelay);
    });

    test('killed enemies respawn after their delay relative to the lead raft', () => {
        const s = setup({ zs: [-50] });
        s.gameStarted = true;
        for (const t of Object.keys(ENEMY_TYPES)) s.enemies[t].hasSpawned = true;
        enemyAt(s, 'whiteGuy', { x: 0, z: -48 });
        for (let i = 0; i < 5; i++) G.playerHitEnemy(s, 'p1', 'whiteGuy');
        const delayTicks = ENEMY_TYPES.whiteGuy.respawnDelay / TICK_MS;
        assert.deepEqual(named(runTicks(s, delayTicks - 1), 'enemyRespawn'), []);
        const [spawn] = named(G.tick(s), 'enemyRespawn');
        assert.equal(spawn.data.health, 50);
        assert.ok(Math.abs(s.enemies.whiteGuy.position.z - (-50 + 15)) <= 0.75 + 1e-9);
    });

    test('mud alien aura hurts nearby civilians and aggros police, who kill it without coin credit', () => {
        const s = G.createGameState({ seed: 3 });
        const ped = s.npcs[0];
        enemyAt(s, 'mudAlien', { x: ped.position.x, z: ped.position.z });
        const first = G.tick(s);
        assert.equal(ped.health, 19);
        assert.ok(s.npcs.filter((n) => n.type === 'police').every((n) => n.aggroTarget === 'mudAlien'));
        assert.equal(named(first, 'npcsUpdate').length, 1);
        const rest = runTicks(s, 20);
        assert.equal(s.enemies.mudAlien.health, 0);
        assert.deepEqual(named(rest, 'enemyKilled')[0].data, { id: 'mudAlien', by: null });
        const hpAfterDeath = ped.health;
        G.tick(s);
        assert.equal(ped.health, hpAfterDeath);
    });

    test('client-reported NPC damage requires a real NPC and a finite amount', () => {
        const s = G.createGameState({ seed: 3 });
        assert.deepEqual(G.enemyHitNpc(s, 'nobody', 'mudAlien', 5), []);
        assert.deepEqual(G.enemyHitNpc(s, 'pedestrian_0', 'mudAlien', NaN), []);
        assert.equal(named(G.enemyHitNpc(s, 'pedestrian_0', 'whiteGuy', 25), 'npcsUpdate').length, 1);
        assert.equal(s.npcs[0].isDead, true);
    });
});

describe('checkpoints, finish and team wipe', () => {
    test('checkpoints revive every fallen crewmate just past the gate', () => {
        const s = setup({ humans: 2 });
        s.players.p2.isDead = true;
        s.players.p2.health = -5;
        const events = G.checkpointCrossed(s, -300);
        assert.equal(events.length, 1);
        assert.equal(events[0].event, 'playerRevived');
        assert.equal(s.players.p2.health, 100);
        assert.equal(s.players.p2.position.z, -310);
        assert.equal(s.lastCheckpointZ, -300);
        assert.deepEqual(G.checkpointCrossed(s, -123), []);
    });

    test('the finish line wins the game for the whole crew exactly once', () => {
        const s = setup();
        assert.deepEqual(named(G.crossedFinishLine(s, 'p1'), 'gameWon').map((e) => e.data), ['p1']);
        assert.deepEqual(G.crossedFinishLine(s, 'p1'), []);
    });

    test('total party kill regroups everyone at the last checkpoint after 3 s', () => {
        const s = setup({ humans: 2, zs: [-320, -310] });
        s.gameStarted = true;
        s.lastCheckpointZ = -300;
        for (const p of Object.values(s.players)) p.isDead = true;
        const [wiped] = named(G.tick(s), 'teamWiped');
        assert.deepEqual(wiped.data, { respawnInMs: 3000, checkpointZ: -300 });
        const revived = named(runTicks(s, 3000 / TICK_MS), 'playerRevived');
        assert.equal(revived.length, 2);
        assert.ok(Object.values(s.players).every((p) => !p.isDead && p.position.z === -310));
    });
});

describe('networking contract', () => {
    test('joining sends the snapshot privately and announces the newcomer to others', () => {
        const s = G.createGameState({ seed: 1 });
        const events = G.addPlayer(s, 'a');
        assert.deepEqual(events.map((e) => [e.event, e.to ?? null, e.except ?? null]), [
            ['currentPlayers', 'a', null], ['enemiesUpdate', 'a', null], ['npcsUpdate', 'a', null],
            ['newPlayer', null, 'a'], ['scoreboard', 'a', null],
        ]);
        assert.deepEqual(G.removePlayer(s, 'a'), [{ event: 'playerDisconnected', data: 'a' }]);
        assert.deepEqual(G.removePlayer(s, 'a'), []);
    });

    test('movement updates are validated, tracked and not echoed to the sender', () => {
        const s = setup();
        const q = { x: 0, y: 0, z: 0, w: 1 };
        assert.deepEqual(G.setPlayerMovement(s, 'p1', { position: { x: NaN, y: 0, z: 0 }, quaternion: q }), []);
        assert.deepEqual(G.setPlayerMovement(s, 'p1', null), []);
        const [moved] = G.setPlayerMovement(s, 'p1', { position: { x: 1, y: 0.2, z: -42 }, quaternion: q });
        assert.equal(moved.except, 'p1');
        assert.equal(s.players.p1.bestZ, -42);
        s.players.p1.isDead = true;
        assert.deepEqual(G.setPlayerMovement(s, 'p1', { position: { x: 0, y: 0, z: -99 }, quaternion: q }), []);
    });

    test('unknown client events are ignored', () => {
        const s = setup();
        assert.deepEqual(G.handleClientEvent(s, 'p1', 'grantCoins', 9999), []);
        assert.equal(s.players.p1.coins, 50);
    });

    test('scoreboard ranks by kills, damage and distance', () => {
        assert.equal(G.scoreOf({ kills: 2, damageDealt: 75, bestZ: -333 }), 200 + 75 + 33);
        const s = setup({ humans: 2 });
        s.players.p2.kills = 1;
        const sb = G.scoreboard(s);
        assert.deepEqual(sb.players.map((p) => p.id), ['p2', 'p1']);
        assert.equal(sb.maxWave, 10);
        assert.deepEqual(sb.enemies, []);
    });

    test('scoreboard is broadcast every 10 ticks', () => {
        const s = setup();
        const counts = Array.from({ length: 30 }, () => named(G.tick(s), 'scoreboard').length);
        assert.deepEqual(counts.flatMap((c, i) => (c ? [i + 1] : [])), [10, 20, 30]);
    });
});

describe('determinism', () => {
    test('seeded RNG is reproducible and in [0, 1)', () => {
        const a = G.createRng(7);
        const b = G.createRng(7);
        const xs = Array.from({ length: 1000 }, a);
        assert.deepEqual(xs, Array.from({ length: 1000 }, b));
        assert.ok(xs.every((x) => x >= 0 && x < 1));
        assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, G.createRng(8)));
    });

    test('identical seeds and inputs produce identical simulations', () => {
        const run = () => {
            const s = G.createGameState({ seed: 99 });
            G.addPlayer(s, 'p1');
            for (let i = 0; i < 3; i++) G.addPlayer(s, `bot-${i + 1}`, { isBot: true });
            const log = [];
            for (let t = 0; t < 1200; t++) {
                G.setPlayerMovement(s, 'p1', { position: { x: 0, y: 0.25, z: -t * 0.5 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } });
                for (const e of G.tick(s)) if (e.event !== 'enemiesUpdate' && e.event !== 'playerMoved') log.push(e.event);
            }
            const { rng, ...rest } = s;
            return JSON.stringify({ rest, log });
        };
        assert.equal(run(), run());
    });
});
