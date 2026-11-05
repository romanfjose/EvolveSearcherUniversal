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
const raftAt = (yaw = 0, y = G.WATER_SURFACE_Y) => ({ position: { x: 0, y, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 }, yaw });
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

    test('thrust: W paddles both sides, motor only adds while paddling, S backs water at half power', () => {
        assert.equal(G.watercraftThrust({ w: true }), 400);
        assert.equal(G.watercraftThrust({ w: true }, ['motor']), 600);
        assert.equal(G.watercraftThrust({ a: true }, ['motor']), 0);
        assert.equal(G.watercraftThrust({ s: true }), -200);
        assert.equal(G.watercraftThrust({}, [], true), 100);
    });

    test('steady-state speed is F/(m·k) and the controller converges to it', () => {
        assert.ok(Math.abs(G.steadyStateSpeed(100) - 3) < 1e-9); // drifting
        assert.ok(Math.abs(G.steadyStateSpeed(500) - 15) < 1e-9); // paddling + current
        const craft = raftAt(Math.PI * 0); // heading downriver, so the current adds to the paddle
        for (let i = 0; i < 600; i++) G.stepWatercraftKinematics(craft, { w: true }, 1 / 60);
        assert.ok(Math.abs(-craft.velocity.z - G.steadyStateSpeed(400 - G.riverCurrentForce(0, craft.position.z))) < 0.05);
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

describe('arcade watercraft controller', () => {
    const H = 1 / 60;
    const fwd = (c) => { const h = G.headingOf(c.yaw); return c.velocity.x * h.x + c.velocity.z * h.z; };
    const lat = (c) => { const h = G.headingOf(c.yaw); return c.velocity.x * -h.z + c.velocity.z * h.x; };

    test('full W + motor + attack thrust while carving A/D never goes underwater, at any yaw', () => {
        const rng = G.createRng(7);
        for (let k = 0; k < 24; k++) {
            const craft = raftAt((k / 24) * 2 * Math.PI - Math.PI);
            for (let i = 0; i < 1000; i++) {
                const left = Math.floor(i / 90) % 2 === 0;
                const input = { w: true, a: left, d: !left, s: rng() < 0.05, attacking: true, upgrades: ['motor'] };
                G.stepWatercraftKinematics(craft, input, H * (0.5 + rng())); // jittery frame times too
                assert.ok(craft.position.y >= G.WATER_SURFACE_Y, `y=${craft.position.y} at yaw ${craft.yaw}, step ${i}`);
                assert.ok(Number.isFinite(craft.position.x + craft.position.z + craft.yaw));
            }
        }
    });

    test('keel grip: lateral slip decays at least 5x faster than forward speed', () => {
        for (const yaw of [0, 0.7, -2.4, Math.PI]) {
            const craft = raftAt(yaw);
            craft.position.x = 40; // outside the channel: no current, pure drag
            const h = G.headingOf(yaw);
            craft.velocity.x = 10 * h.x + 10 * -h.z;
            craft.velocity.z = 10 * h.z + 10 * h.x;
            const f0 = fwd(craft), l0 = lat(craft);
            G.stepWatercraftKinematics(craft, {}, 0.1);
            const fwdRate = -Math.log(fwd(craft) / f0);
            const latRate = -Math.log(lat(craft) / l0);
            assert.ok(latRate >= 5 * fwdRate, `forward rate ${fwdRate}, lateral rate ${latRate}`);
        }
    });

    test('handling is frame-rate independent', () => {
        const run = (hz) => {
            const craft = raftAt(0.3);
            craft.position.x = 40;
            for (let i = 0; i < hz; i++) G.stepWatercraftKinematics(craft, { w: true, a: true }, 1 / hz);
            return craft;
        };
        const a = run(30), b = run(240);
        assert.ok(Math.abs(fwd(a) - fwd(b)) < 0.01 * fwd(b)); // within 1 % after a full second of carving
        assert.ok(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) < 0.15);
        assert.ok(Math.abs(a.angularVelocity.y - b.angularVelocity.y) < 1e-9);
    });

    test('A turns left, D turns right, at the full rate within a fraction of a second', () => {
        const left = raftAt();
        const right = raftAt();
        for (let i = 0; i < 18; i++) { G.stepWatercraftKinematics(left, { a: true }, H); G.stepWatercraftKinematics(right, { d: true }, H); }
        assert.ok(left.angularVelocity.y > 0.99 * PHYSICS.turnRate);
        assert.ok(right.angularVelocity.y < -0.99 * PHYSICS.turnRate);
        assert.ok(left.yaw > 0 && right.yaw < 0);
    });

    test('releasing A/D stops the rotation dead within 0.4 s', () => {
        for (const upgrades of [[], ['motor']]) {
            const craft = raftAt();
            for (let i = 0; i < 60; i++) G.stepWatercraftKinematics(craft, { w: true, d: true, upgrades }, H);
            let t = 0;
            while (craft.angularVelocity.y !== 0 && t < 1) { G.stepWatercraftKinematics(craft, { w: true, upgrades }, H); t += H; }
            assert.ok(t <= 0.4, `still turning after ${t.toFixed(3)} s`);
            const yaw = craft.yaw;
            for (let i = 0; i < 120; i++) G.stepWatercraftKinematics(craft, { w: true, upgrades }, H);
            assert.equal(craft.yaw, yaw);
        }
    });

    test('SPACE jumps above safeHeight in a parabola and lands back exactly on the surface', () => {
        const craft = raftAt();
        const { jumped } = G.stepWatercraftKinematics(craft, { space: true, w: true }, H);
        assert.equal(jumped, true);
        let peak = 0;
        let landed = null;
        for (let i = 0; i < 300 && landed === null; i++) {
            const r = G.stepWatercraftKinematics(craft, { w: true }, H);
            assert.ok(craft.position.y >= G.WATER_SURFACE_Y);
            peak = Math.max(peak, craft.position.y);
            if (r.impact !== null) landed = r.impact;
        }
        const apex = G.WATER_SURFACE_Y + PHYSICS.jumpVelocity ** 2 / (2 * PHYSICS.gravity);
        assert.ok(peak > PLAYER.safeHeight && Math.abs(peak - apex) < 0.4);
        assert.ok(landed > PHYSICS.jumpVelocity * 0.9); // comes down about as fast as it went up
        assert.equal(craft.position.y, G.WATER_SURFACE_Y);
        assert.equal(craft.velocity.y, 0);
        assert.equal(G.stepWatercraftKinematics(craft, {}, H).jumped, false); // no jump without SPACE
    });

    test('mid-air SPACE does not double-jump; a solid footing (plank) allows the jump', () => {
        const craft = raftAt(0, 3);
        assert.equal(G.driveWatercraft(craft, { space: true }, H).jumped, false);
        assert.equal(G.driveWatercraft(craft, { space: true, onSolid: true }, H).jumped, true);
    });

    test('the water floor lifts anything that ended up below the surface', () => {
        const craft = raftAt(0, -3);
        craft.velocity.y = -20;
        assert.equal(G.settleOnWater(craft), 20);
        assert.deepEqual([craft.position.y, craft.velocity.y], [G.WATER_SURFACE_Y, 0]);
        assert.equal(G.settleOnWater(raftAt(0, 2)), null);
    });

    test('heading and yaw conventions agree with yawQuaternion', () => {
        for (const [dx, dz] of [[0, -1], [-1, 0], [1, 1], [0.3, -2]]) {
            const yaw = G.yawOfQuaternion(G.yawQuaternion(dx, dz));
            const h = G.headingOf(yaw);
            const n = Math.hypot(dx, dz);
            assert.ok(Math.abs(h.x - dx / n) < 1e-9 && Math.abs(h.z - dz / n) < 1e-9);
        }
    });

    test('resolveWorldBoundsAndObstacles slides off trees, lands on planks, and clamps river bounds', () => {
        const obstacles = [
            { type: 'tree', x: 5, z: -20, radius: 0.85 },
            { type: 'plank', x: -5, z: -40, halfW: 2.5, halfD: 1.5, topY: 1.4 },
        ];
        // Tree radial push-out & velocity slide
        const c1 = raftAt();
        c1.position.x = 4.2; c1.position.z = -20; c1.velocity.x = 10;
        G.resolveWorldBoundsAndObstacles(c1, obstacles);
        assert.ok(Math.hypot(c1.position.x - 5, c1.position.z + 20) >= 1.89);
        assert.ok(c1.velocity.x <= 0);

        // Plank landing above safeHeight
        const c2 = raftAt(0, 1.3);
        c2.position.x = -5; c2.position.z = -40; c2.velocity.y = -3;
        const r2 = G.resolveWorldBoundsAndObstacles(c2, obstacles);
        assert.equal(r2.onSolid, true);
        assert.equal(c2.position.y, 1.4);
        assert.equal(c2.velocity.y, 0);

        // Channel wall clamp outside shop zone vs widened inside shop zone
        const c3 = raftAt();
        c3.position.x = 25; c3.position.z = -50;
        G.resolveWorldBoundsAndObstacles(c3, obstacles);
        assert.ok(c3.position.x <= G.RIVER.channelHalfWidth - 1.1);

        const c4 = raftAt();
        c4.position.x = 25; c4.position.z = -200;
        const r4 = G.resolveWorldBoundsAndObstacles(c4, obstacles);
        assert.equal(c4.position.x, 25);
        assert.equal(r4.onSolid, true);
    });
});

describe('upgrades', () => {
    test('costs and starting purse: a fresh raft can afford the full kit exactly once', () => {
        const total = Object.values(G.UPGRADES).reduce((s, u) => s + u.cost, 0);
        assert.deepEqual(Object.values(G.UPGRADES).map((u) => u.cost), [10, 15, 20]);
        assert.ok(total <= PLAYER.startCoins && total + 10 > PLAYER.startCoins);
    });

    test('upgradeStats derives combat and handling numbers', () => {
        assert.deepEqual(G.upgradeStats([]), { attackDamage: 10, maxHealthBonus: 0, motorBoost: 0, turnRate: PHYSICS.turnRate });
        assert.deepEqual(G.upgradeStats(['motor', 'weapon', 'armor']), { attackDamage: 30, maxHealthBonus: 50, motorBoost: 100, turnRate: PHYSICS.turnRate * 0.7 });
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

    test('long worm locks a strike vector, coils for windupMs, then charges without tracking', () => {
        const worm = { position: { x: 0, y: 0, z: -40 }, speed: 40, state: 'idle', targetPos: null, cooldownUntil: 0 };
        const target = { position: { x: 5, y: 0, z: 0 } };
        assert.equal(G.stepLongWorm(worm, target, DT, 0), 'coiling');
        assert.deepEqual(worm.targetPos, { x: 5, z: 0 });
        target.position.x = -10;
        assert.equal(G.stepLongWorm(worm, target, DT, ENEMY_TYPES.longWorm.windupMs - 1), 'coiling');
        assert.equal(worm.position.z, -40);
        assert.equal(G.stepLongWorm(worm, target, DT, ENEMY_TYPES.longWorm.windupMs), 'charging');
        G.stepLongWorm(worm, target, DT, 1000);
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

describe('seeded river layout', () => {
    const L = G.generateRiverObstacles(G.RIVER_LAYOUT_SEED);
    const of = (t) => L.filter((o) => o.type === t);
    const O = G.OBSTACLES;

    test('same seed → identical layout; different seed → different layout', () => {
        assert.deepEqual(G.generateRiverObstacles(G.RIVER_LAYOUT_SEED), L);
        assert.notDeepEqual(G.generateRiverObstacles(G.RIVER_LAYOUT_SEED + 1), L);
    });

    test('default argument is the shared layout seed', () => {
        assert.deepEqual(G.generateRiverObstacles(), L);
    });

    test('exactly 300 river trees', () => {
        assert.equal(of('tree').length, 300);
    });

    test('trees hug the banks within bankX and the tree z span', () => {
        for (const t of of('tree')) {
            assert.ok(Math.abs(t.x) >= O.bankX[0] && Math.abs(t.x) <= O.bankX[1]);
            assert.ok(t.z <= O.treeZ[0] && t.z >= O.treeZ[1]);
            assert.equal(t.radius, O.treeRadius);
            assert.ok(t.height >= O.treeHeight[0] && t.height <= O.treeHeight[1]);
        }
    });

    test('both banks get trees', () => {
        assert.ok(of('tree').some((t) => t.x < 0) && of('tree').some((t) => t.x > 0));
    });

    test('the City Shop dock approach (right bank, shop band) is kept clear of trees', () => {
        const blocked = of('tree').filter((t) => t.x > 0 && t.z > G.SHOP_ZONE.minZ - 5 && t.z < G.SHOP_ZONE.maxZ + 5);
        assert.deepEqual(blocked, []);
    });

    test('slalom gates alternate sides mid-channel, every third one a buoy', () => {
        const gates = L.filter((o) => o.type === 'rock' || o.type === 'buoy');
        assert.equal(gates.length, Math.ceil((O.slalomStartZ - (G.FINISH_Z + 20)) / O.slalomSpacing));
        gates.forEach((g, i) => {
            assert.equal(Math.sign(g.x), i % 2 ? 1 : -1);
            assert.ok(Math.abs(g.x) >= O.slalomX[0] && Math.abs(g.x) <= O.slalomX[1]);
            assert.equal(g.type, i % 3 === 2 ? 'buoy' : 'rock');
            assert.ok(Math.abs(g.z - (O.slalomStartZ - i * O.slalomSpacing)) <= O.slalomJitterZ);
        });
    });

    test('rock radii are in range; buoys use the buoy radius', () => {
        for (const r of of('rock')) assert.ok(r.radius >= O.rockRadius[0] && r.radius <= O.rockRadius[1]);
        for (const b of of('buoy')) assert.equal(b.radius, O.buoyRadius);
    });

    test('dozens of refuge planks are placed (at most OBSTACLES.planks)', () => {
        const n = of('plank').length;
        assert.ok(n >= 40 && n <= O.planks, `got ${n}`);
    });

    test('every plank deck is above the wizard safe height and sits inside the channel', () => {
        for (const p of of('plank')) {
            assert.ok(p.topY > PLAYER.safeHeight);
            assert.ok(Math.abs(p.topY - (p.y + p.height / 2 + PLAYER.restY)) < 1e-12);
            assert.ok(Math.abs(p.x) + p.halfW < G.RIVER.channelHalfWidth - 1);
            assert.ok(p.z <= O.plankZ[0] && p.z >= O.plankZ[1]);
        }
    });

    test('plank bottoms clear a floating raft, so rafts pass under unless they jump', () => {
        for (const p of of('plank')) assert.ok(p.y - p.height / 2 > G.WATER_SURFACE_Y + 0.25);
    });

    test('a jump clears the highest plank deck', () => {
        const apex = G.WATER_SURFACE_Y + PHYSICS.jumpVelocity ** 2 / (2 * PHYSICS.gravity);
        assert.ok(apex > Math.max(...of('plank').map((p) => p.topY)) + 1);
    });

    test('planks never overlap each other or a round obstacle footprint', () => {
        const planks = of('plank');
        planks.forEach((a, i) => planks.slice(i + 1).forEach((b) => {
            assert.ok(Math.abs(a.z - b.z) > a.halfD + b.halfD || Math.abs(a.x - b.x) > a.halfW + b.halfW);
        }));
        for (const p of planks) for (const o of L.filter((q) => G.ROUND_OBSTACLES.has(q.type))) {
            assert.ok(Math.abs(o.x - p.x) > p.halfW + o.radius || Math.abs(o.z - p.z) > p.halfD + o.radius);
        }
    });

    test('every obstacle has finite coordinates', () => {
        assert.ok(L.every((o) => Number.isFinite(o.x) && Number.isFinite(o.z)));
    });

    test('game state carries the shared layout by default and accepts an override', () => {
        assert.deepEqual(G.createGameState({ seed: 3 }).obstacles, L);
        assert.deepEqual(G.createGameState({ seed: 3, obstacles: [] }).obstacles, []);
    });

    test('the game seed does not change the river layout (client and server agree)', () => {
        assert.deepEqual(G.createGameState({ seed: 1 }).obstacles, G.createGameState({ seed: 999 }).obstacles);
    });
});

describe('kinematic world resolver', () => {
    const tree = { type: 'tree', x: 0, z: -20, radius: 0.85 };
    const plank = { type: 'plank', x: -5, z: -40, halfW: 2.5, halfD: 1.5, y: 1.1, height: 0.5, topY: 1.6 };
    const at = (x, y, z, v = {}) => ({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0, ...v } });

    test('rocks and buoys collide like trunks', () => {
        for (const type of ['rock', 'buoy']) {
            const c = at(0.3, G.WATER_SURFACE_Y, -20);
            G.resolveWorldBoundsAndObstacles(c, [{ type, x: 0, z: -20, radius: 1.2 }]);
            assert.ok(Math.abs(Math.hypot(c.position.x, c.position.z + 20) - (1.2 + G.RAFT_CLEARANCE)) < 1e-9);
        }
    });

    test('tree contact removes only the inward velocity (tangential slide survives)', () => {
        const c = at(-1.5, G.WATER_SURFACE_Y, -20, { x: 5, z: -7 });
        G.resolveWorldBoundsAndObstacles(c, [tree]);
        assert.ok(Math.abs(c.velocity.x) < 1e-9);
        assert.equal(c.velocity.z, -7);
    });

    test('a raft moving away from a trunk keeps its velocity', () => {
        const c = at(-1.5, G.WATER_SURFACE_Y, -20, { x: -4 });
        G.resolveWorldBoundsAndObstacles(c, [tree]);
        assert.equal(c.velocity.x, -4);
    });

    test('trunks out of range are ignored and the raft is untouched', () => {
        const c = at(3, G.WATER_SURFACE_Y, -20, { x: 1 });
        const r = G.resolveWorldBoundsAndObstacles(c, [tree]);
        assert.deepEqual(c.position, { x: 3, y: G.WATER_SURFACE_Y, z: -20 });
        assert.equal(r.onSolid, false);
    });

    test('a raft dead-centre on a trunk (degenerate normal) is left alone, not NaN', () => {
        const c = at(0, G.WATER_SURFACE_Y, -20);
        G.resolveWorldBoundsAndObstacles(c, [tree]);
        assert.ok(Number.isFinite(c.position.x) && Number.isFinite(c.position.z));
    });

    test('a rising raft passes up through a plank deck', () => {
        const c = at(-5, 1.5, -40, { y: 5 });
        assert.equal(G.resolveWorldBoundsAndObstacles(c, [plank]).onSolid, false);
        assert.equal(c.position.y, 1.5);
    });

    test('a floating raft passes under a plank', () => {
        const c = at(-5, G.WATER_SURFACE_Y, -40);
        assert.equal(G.resolveWorldBoundsAndObstacles(c, [plank]).onSolid, false);
        assert.equal(c.position.y, G.WATER_SURFACE_Y);
    });

    test('a falling raft beside the plank footprint misses it', () => {
        const c = at(-5 + 2.5 + 0.8, 1.6, -40, { y: -2 });
        assert.equal(G.resolveWorldBoundsAndObstacles(c, [plank]).onSolid, false);
    });

    test('landing on a plank holds the raft above PLAYER.safeHeight', () => {
        const c = at(-5, 1.4, -40, { y: -4 });
        assert.equal(G.resolveWorldBoundsAndObstacles(c, [plank]).onSolid, true);
        assert.ok(c.position.y > PLAYER.safeHeight);
    });

    test('left bank clamp zeroes outward velocity', () => {
        const c = at(-20, G.WATER_SURFACE_Y, -60, { x: -3 });
        G.resolveWorldBoundsAndObstacles(c, []);
        assert.equal(c.position.x, -G.RIVER.channelHalfWidth + 1.1);
        assert.equal(c.velocity.x, 0);
    });

    test('the shop band widens the river up to x = 32', () => {
        const c = at(40, 0.75, -200);
        G.resolveWorldBoundsAndObstacles(c, []);
        assert.equal(c.position.x, 32);
    });

    test('a raft resting on the shop dock is solid footing at y 0.75', () => {
        const c = at(20, 0.6, -180, { y: -1 });
        assert.equal(G.resolveWorldBoundsAndObstacles(c, []).onSolid, true);
        assert.equal(c.position.y, 0.75);
        assert.ok(G.isInShopZone(c.position));
    });

    test('stepWatercraftKinematics + resolver: a jump lands and stays on a plank', () => {
        const c = { ...at(-5, G.WATER_SURFACE_Y, -40), angularVelocity: { x: 0, y: 0, z: 0 }, yaw: 0 };
        let onSolid = false;
        for (let i = 0; i < 120; i++) {
            G.stepWatercraftKinematics(c, { space: i === 0, onSolid }, 1 / 60);
            c.position.x = -5; c.position.z = -40; // hold station over the deck
            onSolid = G.resolveWorldBoundsAndObstacles(c, [plank]).onSolid;
        }
        assert.equal(onSolid, true);
        assert.equal(c.position.y, plank.topY);
    });
});

describe('Don\'t Sink: plank safe height vs the wizard', () => {
    const plankOf = (s) => s.obstacles.find((o) => o.type === 'plank');

    test('a raft on any generated plank is immune to the wizard', () => {
        const s = setup();
        enemyAt(s, 'whiteGuy', { x: 0, z: 1 });
        for (const p of s.obstacles.filter((o) => o.type === 'plank')) {
            s.players.p1.position.y = p.topY;
            assert.deepEqual(G.resolveEnemyHit(s, 'p1', 'whiteGuy', false), []);
        }
        assert.equal(s.players.p1.health, 100);
    });

    test('the same raft at water level is hit and thrown', () => {
        const s = setup();
        enemyAt(s, 'whiteGuy', { x: 0, z: 1 });
        const ev = G.resolveEnemyHit(s, 'p1', 'whiteGuy', false);
        assert.equal(named(ev, 'playerThrown').length, 1);
        assert.ok(s.players.p1.health < 100);
    });

    test('safe height only protects against the wizard, not the other enemies', () => {
        const s = setup();
        s.players.p1.position.y = plankOf(s).topY;
        enemyAt(s, 'mudAlien', { x: 0, z: 1 });
        assert.equal(named(G.resolveEnemyHit(s, 'p1', 'mudAlien', false), 'playerHealthUpdate').length, 1);
    });

    test('the wizard waits instead of chasing a raft on a plank', () => {
        const s = setup();
        const p = plankOf(s);
        s.players.p1.position = { x: p.x, y: p.topY, z: p.z };
        const w = enemyAt(s, 'whiteGuy', { x: p.x, z: p.z + 6 });
        s.gameStarted = true;
        G.tick(s);
        assert.equal(w.state, 'waiting');
        assert.equal(w.position.z, p.z + 6);
    });

    test('tick publishes wizard and mud alien states for the client rigs', () => {
        const s = setup();
        enemyAt(s, 'whiteGuy', { x: 0, z: 20 });
        enemyAt(s, 'mudAlien', { x: 0, z: 50 });
        G.tick(s);
        assert.equal(s.enemies.whiteGuy.state, 'chasing');
        assert.equal(s.enemies.mudAlien.state, 'chasing');
    });
});

describe('long worm coil telegraph', () => {
    test('coiling is held in place for exactly windupMs even if the target leaves aggro range', () => {
        const T = ENEMY_TYPES.longWorm;
        const worm = { position: { x: 0, y: 0, z: -40 }, speed: 40, state: 'idle', targetPos: null, cooldownUntil: 0 };
        G.stepLongWorm(worm, { position: { x: 0, y: 0, z: 0 } }, DT, 100);
        assert.equal(worm.chargeAt, 100 + T.windupMs);
        assert.equal(G.stepLongWorm(worm, { position: { x: 0, y: 0, z: 1000 } }, DT, 100 + T.windupMs), 'charging');
    });

    test('a respawned worm starts idle with no pending charge', () => {
        const s = setup();
        G.spawnEnemy(s, 'longWorm', -60);
        assert.equal(s.enemies.longWorm.state, 'idle');
        assert.equal(s.enemies.longWorm.chargeAt, 0);
    });
});

describe('bot obstacle avoidance and refuge', () => {
    const rock = { type: 'rock', x: 0, z: -10, radius: 1.2 };

    test('a clear path returns the target itself', () => {
        const target = { x: 0, z: -20 };
        assert.equal(G.steerAroundObstacles({ x: 6, z: 0 }, { x: 6, z: -20 }, [rock]).x, 6);
        assert.equal(G.steerAroundObstacles({ x: 0, z: 0 }, target, []), target);
    });

    test('a blocked path yields a waypoint beside the obstacle, off its far side', () => {
        const w = G.steerAroundObstacles({ x: 0.5, z: 0 }, { x: 0.5, z: -20 }, [rock]);
        const clear = rock.radius + G.RAFT_CLEARANCE + G.BOT.avoidMargin;
        assert.ok(w.x > 0);
        assert.ok(Math.abs(Math.hypot(w.x - rock.x, w.z - rock.z) - clear) < 1e-9);
    });

    test('obstacles behind the bot or beyond the lookahead are ignored', () => {
        const target = { x: 0, z: -40 };
        assert.equal(G.steerAroundObstacles({ x: 0, z: -15 }, target, [rock]), target);
        assert.equal(G.steerAroundObstacles({ x: 0, z: 20 }, { x: 0, z: -40 }, [rock], 5).x, 0);
    });

    test('planks are not steering hazards (they are overhead)', () => {
        const target = { x: 0, z: -20 };
        assert.equal(G.steerAroundObstacles({ x: 0, z: 0 }, target, [{ type: 'plank', x: 0, z: -10, halfW: 3, halfD: 2, topY: 1.6 }]), target);
    });

    test('the nearest obstacle on the path wins', () => {
        const near = { type: 'buoy', x: 0, z: -4, radius: 0.5 };
        const w = G.steerAroundObstacles({ x: 0.2, z: 0 }, { x: 0.2, z: -20 }, [rock, near]);
        assert.ok(Math.abs(w.z - near.z) < 2);
    });

    test('a waypoint that would leave the bot lane flips to the other side', () => {
        const bankTree = { type: 'tree', x: 11.5, z: -10, radius: 0.85 };
        const w = G.steerAroundObstacles({ x: 11.3, z: 0 }, { x: 11.3, z: -20 }, [bankTree]);
        assert.ok(w.x < bankTree.x && Math.abs(w.x) <= G.BOT.xLimit);
    });

    test('a bot cruising at a rock steers round it without ever touching it', () => {
        const s = G.createGameState({ seed: 1, obstacles: [rock] });
        G.addPlayer(s, 'b', { isBot: true });
        const b = s.players.b;
        b.position = { x: 0.3, y: PLAYER.restY, z: 5 };
        let minGap = Infinity;
        for (let i = 0; i < 40; i++) {
            G.stepBot(s, b, DT);
            minGap = Math.min(minGap, G.distXZ(b.position, rock));
        }
        assert.ok(b.position.z < rock.z - 5, 'got past it');
        assert.ok(minGap >= rock.radius + G.RAFT_CLEARANCE - 1e-9, `gap ${minGap}`);
    });

    test('nearestRefugePlank picks the closest plank in range, else null', () => {
        const a = { type: 'plank', x: 5, z: -10, halfW: 2, halfD: 1 };
        const b = { type: 'plank', x: -5, z: -4, halfW: 2, halfD: 1 };
        assert.equal(G.nearestRefugePlank({ x: -4, z: -3 }, [a, b, rock]), b);
        assert.equal(G.nearestRefugePlank({ x: 0, z: 100 }, [a, b]), null);
    });

    test('a wizard within 10 m sends the bot to a nearby plank (refuge mode)', () => {
        const plank = { type: 'plank', x: 5, z: -6, halfW: 2.5, halfD: 1.5, y: 1.1, height: 0.5, topY: 1.6 };
        const s = G.createGameState({ seed: 1, obstacles: [plank] });
        G.addPlayer(s, 'b', { isBot: true });
        s.players.b.position = { x: 2, y: PLAYER.restY, z: 0 };
        enemyAt(s, 'whiteGuy', { x: 2, z: 8 });
        const d = G.botDecide(s, s.players.b);
        assert.equal(d.mode, 'refuge');
        assert.equal(d.plank, plank);
        assert.equal(d.enemyId, 'whiteGuy');
    });

    test('no refuge when the wizard is beyond 10 m or no plank is near', () => {
        const plank = { type: 'plank', x: 5, z: -6, halfW: 2.5, halfD: 1.5, topY: 1.6 };
        const s = G.createGameState({ seed: 1, obstacles: [plank] });
        G.addPlayer(s, 'b', { isBot: true });
        s.players.b.position = { x: 2, y: PLAYER.restY, z: 0 };
        enemyAt(s, 'whiteGuy', { x: 2, z: 11 });
        assert.notEqual(G.botDecide(s, s.players.b).mode, 'refuge');
        s.obstacles = [];
        s.enemies.whiteGuy.position.z = 5;
        assert.notEqual(G.botDecide(s, s.players.b).mode, 'refuge');
    });

    test('a bot jumps onto the plank and the wizard can no longer hurt it', () => {
        const plank = { type: 'plank', x: 5, z: -6, halfW: 2.5, halfD: 1.5, y: 1.1, height: 0.5, topY: 1.6 };
        const s = G.createGameState({ seed: 1, obstacles: [plank] });
        G.addPlayer(s, 'b', { isBot: true });
        const b = s.players.b;
        b.position = { x: 2, y: PLAYER.restY, z: 0 };
        enemyAt(s, 'whiteGuy', { x: 5, z: 0 });
        for (let i = 0; i < 60; i++) G.stepBot(s, b, DT);
        assert.equal(b.mode, 'refuge');
        assert.equal(b.position.y, plank.topY);
        assert.ok(G.overPlank(b.position, plank));
        assert.equal(G.stepWhiteGuy(s.enemies.whiteGuy, b, DT), 'waiting');
        assert.deepEqual(G.resolveEnemyHit(s, 'b', 'whiteGuy', false), []);
    });

    test('bots in refuge still bonk an adjacent wizard from the plank', () => {
        const plank = { type: 'plank', x: 0, z: 0, halfW: 2.5, halfD: 1.5, y: 1.1, height: 0.5, topY: 1.6 };
        const s = G.createGameState({ seed: 1, obstacles: [plank] });
        G.addPlayer(s, 'b', { isBot: true });
        s.players.b.position = { x: 0, y: plank.topY, z: 0 };
        enemyAt(s, 'whiteGuy', { x: 0, z: 2 });
        const ev = G.stepBot(s, s.players.b, DT);
        assert.equal(named(ev, 'enemyHit').length, 1);
    });

    test('bots do not abandon the crew for a plank: refuge respects the leash', () => {
        const plank = { type: 'plank', x: 5, z: -6, halfW: 2.5, halfD: 1.5, topY: 1.6 };
        const s = G.createGameState({ seed: 1, obstacles: [plank] });
        G.addPlayer(s, 'h');
        s.players.h.position = { x: 0, y: PLAYER.restY, z: -200 };
        G.addPlayer(s, 'b', { isBot: true });
        s.players.b.position = { x: 2, y: PLAYER.restY, z: 0 };
        enemyAt(s, 'whiteGuy', { x: 2, z: 5 });
        assert.notEqual(G.botDecide(s, s.players.b).mode, 'refuge');
    });

    test('bots also sidestep a coiling worm (the telegraph)', () => {
        const s = G.createGameState({ seed: 1, obstacles: [] });
        G.addPlayer(s, 'b', { isBot: true });
        s.players.b.position = { x: 0, y: PLAYER.restY, z: -10 };
        G.spawnEnemy(s, 'longWorm', -40);
        Object.assign(s.enemies.longWorm, { state: 'coiling', targetPos: { x: 0, z: -10 } });
        assert.equal(G.botDecide(s, s.players.b).mode, 'evade');
    });

    test('a full seeded bot run never leaves a bot inside a trunk, rock or buoy', () => {
        const s = G.createGameState({ seed: 3 });
        G.addPlayer(s, 'h');
        for (let i = 0; i < 3; i++) G.addPlayer(s, `b${i}`, { isBot: true });
        const round = s.obstacles.filter((o) => G.ROUND_OBSTACLES.has(o.type));
        for (let t = 0; t < 1500; t++) {
            G.setPlayerMovement(s, 'h', { position: { x: 0, y: 0.25, z: -t * 0.6 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } });
            G.tick(s);
            for (const b of Object.values(s.players).filter((p) => p.isBot && !p.isDead)) {
                for (const o of round) assert.ok(G.distXZ(b.position, o) >= o.radius + G.RAFT_CLEARANCE - 1e-6);
            }
        }
    });
});

describe('Auto-Pilot', () => {
    const craft = (x = 0, z = 0, yaw = 0, y = G.WATER_SURFACE_Y) => ({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 }, yaw });
    const alive = (type, pos, extra = {}) => ({ id: type, type, health: 50, position: { y: 0.5, ...pos }, ...extra });

    test('open water: full paddle straight downriver, no helm', () => {
        const k = G.autopilotInput(craft());
        assert.equal(k.mode, 'cruise');
        assert.deepEqual([k.w, k.a, k.d, k.s, k.space], [true, false, false, false, false]);
    });

    test('off the centreline it steers back toward x = 0', () => {
        assert.equal(G.autopilotInput(craft(8)).a, true); // heading −z, so −x is to port (A)
        assert.equal(G.autopilotInput(craft(-8)).d, true);
    });

    test('facing upriver it turns without throttling', () => {
        const k = G.autopilotInput(craft(0, 0, Math.PI));
        assert.equal(k.w, false);
        assert.ok(k.a || k.d);
    });

    test('a rock dead ahead makes it steer', () => {
        const k = G.autopilotInput(craft(0.1), { obstacles: [{ type: 'rock', x: 0, z: -8, radius: 1.5 }] });
        assert.ok(k.a || k.d);
        assert.notEqual(k.target.x, 0);
    });

    test('heads for the shop lane while it can still afford an upgrade', () => {
        const k = G.autopilotInput(craft(0, -140), { wantsShop: true });
        assert.equal(k.target.x, G.AUTOPILOT.shopLaneX);
        assert.equal(G.autopilotInput(craft(0, -140)).target.x, 0);
    });

    test('attacks any enemy within attack range', () => {
        assert.equal(G.autopilotInput(craft(), { enemies: { mudAlien: alive('mudAlien', { x: 0, z: -2 }) } }).attack, true);
        assert.equal(G.autopilotInput(craft(), { enemies: { mudAlien: alive('mudAlien', { x: 0, z: -20 }) } }).attack, false);
        assert.equal(G.autopilotInput(craft(), { enemies: { mudAlien: alive('mudAlien', { x: 0, z: -2 }, { health: 0 }) } }).attack, false);
    });

    test('wizard close + plank near → refuge; over the deck → jump', () => {
        const plank = { type: 'plank', x: 3, z: -5, halfW: 2.5, halfD: 1.5, topY: 1.6 };
        const enemies = { whiteGuy: alive('whiteGuy', { x: 0, z: 2 }) };
        assert.equal(G.autopilotInput(craft(), { enemies, obstacles: [plank] }).mode, 'refuge');
        const over = G.autopilotInput(craft(3, -5), { enemies, obstacles: [plank] });
        assert.equal(over.space, true);
        assert.equal(over.w, false);
        const perched = G.autopilotInput(craft(3, -5, 0, plank.topY), { enemies, obstacles: [plank], onSolid: true });
        assert.deepEqual([perched.space, perched.w], [false, false]);
    });

    test('sidesteps a coiling or charging worm', () => {
        for (const state of ['coiling', 'charging']) {
            const k = G.autopilotInput(craft(1), { enemies: { longWorm: alive('longWorm', { x: 0, z: -40 }, { state, targetPos: { x: 0, z: 0 } }) } });
            assert.equal(k.mode, 'evade');
            assert.equal(k.target.x, G.BOT.evadeRadius);
        }
    });

    test('closed loop: hands-free it runs 1 km of the seeded river without a single collision', () => {
        const obstacles = G.generateRiverObstacles();
        const c = craft();
        let onSolid = false;
        let hits = 0;
        for (let i = 0; i < 60 * 75 && c.position.z > -1000; i++) {
            G.stepWatercraftKinematics(c, { ...G.autopilotInput(c, { obstacles, onSolid }), onSolid }, 1 / 60);
            const before = { x: c.position.x, z: c.position.z };
            onSolid = G.resolveWorldBoundsAndObstacles(c, obstacles).onSolid;
            if (Math.hypot(c.position.x - before.x, c.position.z - before.z) > 1e-9) hits++;
        }
        assert.ok(c.position.z <= -1000, `reached ${c.position.z}`);
        assert.equal(hits, 0);
    });
});

describe('angles', () => {
    test('wrapAngle maps into (-π, π]', () => {
        assert.ok(Math.abs(G.wrapAngle(3 * Math.PI) - Math.PI) < 1e-9);
        assert.ok(Math.abs(G.wrapAngle(-Math.PI / 2 - 2 * Math.PI) + Math.PI / 2) < 1e-9);
        assert.equal(G.wrapAngle(0), 0);
    });
});
