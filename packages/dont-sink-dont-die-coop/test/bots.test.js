import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../shared/game-core.js';
import { createLoopbackSocket, LOCAL_PLAYER_ID } from '../shared/loopback.js';

const { BOT, PLAYER, TICK_MS, FINISH_Z, CHECKPOINTS, ENEMY_TYPES } = G;
const DT = TICK_MS / 1000;
const Q = { x: 0, y: 0, z: 0, w: 1 };

function crew({ bots = 1, humanZ = 0, seed = 5 } = {}) {
    const s = G.createGameState({ seed });
    G.addPlayer(s, 'h');
    s.players.h.position = { x: 0, y: PLAYER.restY, z: humanZ };
    for (let i = 0; i < bots; i++) G.addPlayer(s, `b${i}`, { isBot: true });
    return s;
}
const named = (events, name) => events.filter((e) => e.event === name);

describe('AI companion bots', () => {
    test('bots get names, colors and start behind the human in formation order', () => {
        const s = crew({ bots: 3 });
        assert.deepEqual(['b0', 'b1', 'b2'].map((id) => s.players[id].name), BOT.names);
        assert.deepEqual(['b0', 'b1', 'b2'].map((id) => s.players[id].botIndex), [0, 1, 2]);
        assert.ok(['b0', 'b1', 'b2'].every((id) => s.players[id].position.z > 0));
        assert.equal(new Set(Object.values(s.players).map((p) => p.color)).size, 4);
    });

    test('top speed is derived from the same drag model as the human raft', () => {
        assert.ok(Math.abs(G.botMaxSpeed([]) - 15) < 1e-9);
        assert.ok(Math.abs(G.botMaxSpeed(['motor']) - 21) < 1e-9);
    });

    test('with nothing to fight, bots hold their formation slot on the human', () => {
        const s = crew({ bots: 2, humanZ: -40 });
        const d = G.botDecide(s, s.players.b1);
        assert.equal(d.mode, 'follow');
        assert.deepEqual(d.target, { x: BOT.formation[1].x, z: -40 + BOT.formation[1].z });
    });

    test('bots engage the nearest enemy in range, but not one far from the human', () => {
        const s = crew({ humanZ: 0 });
        s.players.b0.position = { x: 0, y: PLAYER.restY, z: 0 };
        G.spawnEnemy(s, 'mudAlien', -20); s.enemies.mudAlien.position.x = 0;
        G.spawnEnemy(s, 'whiteGuy', 10); s.enemies.whiteGuy.position.x = 0;
        assert.deepEqual([G.botDecide(s, s.players.b0).mode, G.botDecide(s, s.players.b0).enemyId], ['engage', 'whiteGuy']);
        s.players.h.position.z = 100; // enemies now outside the leash around the human
        assert.equal(G.botDecide(s, s.players.b0).mode, 'follow');
    });

    test('bots sidestep a charging worm toward the open water, then punish its cooldown', () => {
        const s = crew();
        const bot = s.players.b0;
        bot.position = { x: 2, y: PLAYER.restY, z: -10 };
        G.spawnEnemy(s, 'longWorm', -20);
        Object.assign(s.enemies.longWorm, { state: 'charging', targetPos: { x: 0, z: -10 } });
        const evade = G.botDecide(s, bot);
        assert.equal(evade.mode, 'evade');
        assert.equal(evade.target.x, BOT.evadeRadius);
        bot.position.x = 6; // +8 from x=6 would leave the channel → dodge the other way
        s.enemies.longWorm.targetPos = { x: 6, z: -10 };
        assert.equal(G.botDecide(s, bot).target.x, 6 - BOT.evadeRadius);
        s.enemies.longWorm.state = 'cooldown';
        assert.equal(G.botDecide(s, bot).mode, 'engage');
    });

    test('without a living human, bots push downriver on their own', () => {
        const s = crew({ bots: 1 });
        s.players.h.isDead = true;
        const bot = s.players.b0;
        const d = G.botDecide(s, bot);
        assert.equal(d.mode, 'advance');
        assert.equal(d.target.z, bot.position.z - BOT.soloAdvance);
    });

    test('bots attack in range on a fixed cooldown', () => {
        const s = crew();
        const bot = s.players.b0;
        bot.position = { x: 0, y: PLAYER.restY, z: -5 };
        s.players.h.position.z = -5;
        G.spawnEnemy(s, 'mudAlien', -8);
        Object.assign(s.enemies.mudAlien.position, { x: 0, y: 0.5 });
        const hits = [];
        for (let t = 0; t < 30; t++) {
            s.now += TICK_MS;
            hits.push(named(G.stepBot(s, bot, DT), 'enemyHit').length);
        }
        const at = hits.flatMap((h, i) => (h ? [i] : []));
        assert.ok(at.length >= 2);
        assert.ok(at.slice(1).every((t, i) => (t - at[i]) * TICK_MS >= BOT.attackCooldownMs));
        assert.equal(s.players.b0.damageDealt, at.length * 10);
    });

    test('bots shop in the city band, hammer first', () => {
        const s = crew();
        const bot = s.players.b0;
        bot.position = { x: 0, y: PLAYER.restY, z: -200 };
        s.players.h.position.z = -205;
        G.stepBot(s, bot, DT);
        G.stepBot(s, bot, DT);
        G.stepBot(s, bot, DT);
        assert.deepEqual(bot.upgrades, BOT.shopPriority);
        assert.equal(bot.maxHealth, 150);
    });

    test('a bot thrown by the wizard arcs through the air and lands on the water', () => {
        const s = crew();
        const bot = s.players.b0;
        bot.position = { x: 0, y: PLAYER.restY, z: 0 };
        G.spawnEnemy(s, 'whiteGuy', 0);
        G.resolveEnemyHit(s, 'b0', 'whiteGuy', false);
        assert.ok(bot.velocity.y >= 10);
        s.enemies.whiteGuy.health = 0;
        let peak = 0;
        for (let t = 0; t < 60; t++) { G.stepBot(s, bot, DT); peak = Math.max(peak, bot.position.y); }
        assert.ok(peak > PLAYER.safeHeight);
        assert.equal(bot.position.y, PLAYER.restY);
        assert.ok(Math.abs(bot.position.x) <= BOT.xLimit);
    });

    test('enemy contact hurts bots on the server, at most once per second', () => {
        const s = crew();
        s.gameStarted = true;
        for (const t of Object.keys(ENEMY_TYPES)) s.enemies[t].hasSpawned = true;
        const bot = s.players.b0;
        G.spawnEnemy(s, 'mudAlien', bot.position.z);
        Object.assign(s.enemies.mudAlien.position, { x: bot.position.x, y: 0.5 });
        s.enemies.mudAlien.speed = 0;
        const hits = [];
        for (let t = 0; t < 40; t++) hits.push(...named(G.tick(s), 'playerHealthUpdate').filter((e) => e.data.id === 'b0'));
        assert.equal(hits.length, 2);
    });

    test('a bot crossing a checkpoint revives the fallen human', () => {
        const s = crew();
        s.players.h.isDead = true;
        const bot = s.players.b0;
        bot.position.z = CHECKPOINTS[0] + 0.1;
        const events = [];
        for (let t = 0; t < 5; t++) events.push(...G.stepBot(s, bot, DT));
        assert.deepEqual(named(events, 'playerRevived').map((e) => e.data.id), ['h']);
        assert.equal(bot.nextCheckpoint, 1);
    });

    test('bots stand still once the river is escaped', () => {
        const s = crew();
        s.gameWon = true;
        const before = { ...s.players.b0.position };
        G.stepBot(s, s.players.b0, DT);
        assert.deepEqual(s.players.b0.position, before);
    });

    test('bot facing follows its movement (raft forward is -z)', () => {
        const fwd = G.yawQuaternion(0, -1);
        assert.ok(Math.abs(fwd.y) < 1e-12 && Math.abs(fwd.w - 1) < 1e-12);
        const back = G.yawQuaternion(0, 1);
        assert.ok(Math.abs(Math.abs(back.y) - 1) < 1e-12);
    });
});

describe('loopback socket', () => {
    test('connect delivers the snapshot with the human and every bot', () => {
        const sock = createLoopbackSocket({ bots: 3, realtime: false });
        const got = {};
        sock.on('currentPlayers', (p) => { got.players = Object.keys(p); });
        sock.on('newPlayer', (p) => { (got.joined ??= []).push(p.id); });
        sock.on('connect', () => { got.connected = true; });
        sock.connect();
        assert.deepEqual(got, { players: [LOCAL_PLAYER_ID], joined: ['bot-1', 'bot-2', 'bot-3'], connected: true });
    });

    test('routing: private events for bots and self-echoes never reach the local client', () => {
        const sock = createLoopbackSocket({ bots: 1, realtime: false });
        const moved = [];
        sock.on('playerMoved', (p) => moved.push(p.id));
        sock.connect();
        sock.emit('playerMovement', { position: { x: 0, y: 0.25, z: -1 }, quaternion: Q });
        sock.step();
        assert.deepEqual(moved, ['bot-1']);
        const stats = [];
        sock.on('playerStatsUpdate', (p) => stats.push(p.id));
        sock.state.players['bot-1'].position.z = -200; // in the shop band
        sock.step();
        sock.emit('buyUpgrade', 'motor');
        assert.deepEqual(stats, [LOCAL_PLAYER_ID]);
    });

    test('payloads are copies, like data off the wire', () => {
        const sock = createLoopbackSocket({ bots: 1, realtime: false });
        let snapshot;
        sock.on('currentPlayers', (p) => { snapshot = p; });
        sock.connect();
        snapshot[LOCAL_PLAYER_ID].coins = 1e9;
        assert.equal(sock.state.players[LOCAL_PLAYER_ID].coins, PLAYER.startCoins);
    });

    test('ignores input before connect and stops its timer on disconnect', () => {
        const timers = { live: 0, setInterval() { this.live++; return 1; }, clearInterval() { this.live--; } };
        const sock = createLoopbackSocket({ bots: 1, timers });
        sock.emit('buyUpgrade', 'motor');
        assert.deepEqual(sock.state.players, {});
        sock.connect();
        sock.connect();
        assert.equal(timers.live, 1);
        sock.disconnect();
        assert.equal(timers.live, 0);
    });

    test('a scripted human with an AI crew escapes the full river', () => {
        const sock = createLoopbackSocket({ bots: 2, seed: 2026, realtime: false });
        const seen = { waves: [], kills: 0, won: null };
        let enemies = {};
        let me = { x: 0, y: 0.25, z: 0 };
        let dead = false;
        let lastHit = -Infinity;
        sock.on('enemiesUpdate', (e) => { enemies = e; });
        sock.on('waveChanged', (w) => seen.waves.push(w.wave));
        sock.on('enemyKilled', () => seen.kills++);
        sock.on('gameWon', (id) => { seen.won = id; });
        sock.on('playerDied', (id) => { if (id === LOCAL_PLAYER_ID) dead = true; });
        sock.on('playerRevived', (p) => { if (p.id === LOCAL_PLAYER_ID) { dead = false; me = { ...p.position, y: 0.25 }; } });
        sock.connect();
        const crossed = new Set();
        for (let t = 0; t < 4000 && !seen.won; t++) {
            const now = t * TICK_MS;
            if (!dead) {
                me.z -= 0.6; // ~12 m/s, like a paddling raft
                sock.emit('playerMovement', { position: me, quaternion: Q });
                for (const e of Object.values(enemies)) {
                    if (e.health <= 0 || now - lastHit < PLAYER.hitCooldownMs) continue;
                    if (G.dist3(me, e.position) < ENEMY_TYPES[e.type].hitRadius) { lastHit = now; sock.emit('enemyHitPlayer', { enemyType: e.type, isBlocking: true }); }
                    if (G.dist3(me, e.position) < PLAYER.attackRange) sock.emit('playerHitEnemy', { enemyId: e.id });
                }
                for (const cp of CHECKPOINTS) if (me.z < cp && !crossed.has(cp)) { crossed.add(cp); sock.emit('checkpointCrossed', { checkpointZ: cp }); }
                if (me.z < FINISH_Z) sock.emit('crossedFinishLine');
            }
            sock.step();
        }
        assert.ok(seen.won, 'crew reached the finish line');
        assert.deepEqual(seen.waves, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
        assert.ok(seen.kills > 0, 'enemies were killed along the way');
    });
});
