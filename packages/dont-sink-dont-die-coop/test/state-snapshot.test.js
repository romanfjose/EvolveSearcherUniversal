import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    SNAPSHOT_VERSION,
    SNAPSHOT_PREFIX,
    MAJOR_CHECKPOINTS,
    CHECKPOINT_TOLERANCE_METERS,
    computeSnapshotChecksum,
    stringToBase64,
    base64ToString,
    findMatchingCheckpoint,
    isCheckpointZ,
    captureStateSnapshot,
    serializeSnapshot,
    deserializeSnapshot,
    restoreStateFromSnapshot,
    diffSnapshots,
} from '../shared/state-snapshot.js';

import {
    createGameState,
    addPlayer,
    tick,
    PLAYER,
} from '../shared/game-core.js';

describe('Engineer 04: Atomic Checkpoint State Snapshot & Replay Serializer', () => {
    describe('1. Checkpoint Recognition & Pure Math Utilities', () => {
        it('exports required major checkpoint constants at z = -375, -750, -1125', () => {
            assert.deepEqual(MAJOR_CHECKPOINTS, [-375, -750, -1125]);
            assert.equal(SNAPSHOT_VERSION, 1);
            assert.equal(SNAPSHOT_PREFIX, 'SNAPSHOT_');
        });

        it('identifies valid checkpoints within tolerance and rejects points in between', () => {
            assert.equal(findMatchingCheckpoint(-375.0), -375);
            assert.equal(findMatchingCheckpoint(-374.0), -375);
            assert.equal(findMatchingCheckpoint(-376.5), -375);
            assert.equal(findMatchingCheckpoint(-750.0), -750);
            assert.equal(findMatchingCheckpoint(-1125.0), -1125);

            assert.equal(isCheckpointZ(-375), true);
            assert.equal(isCheckpointZ(-750), true);
            assert.equal(isCheckpointZ(-1125), true);

            // Outside tolerance or mid-river points
            assert.equal(findMatchingCheckpoint(0), null);
            assert.equal(findMatchingCheckpoint(-100), null);
            assert.equal(findMatchingCheckpoint(-500), null);
            assert.equal(isCheckpointZ(-200), false);
            assert.equal(isCheckpointZ(NaN), false);
        });

        it('computes deterministic FNV-1a checksums with zero collisions across variations', () => {
            const h1 = computeSnapshotChecksum('{"wave":1,"checkpointZ":-375}');
            const h2 = computeSnapshotChecksum('{"wave":1,"checkpointZ":-375}');
            const h3 = computeSnapshotChecksum('{"wave":2,"checkpointZ":-750}');

            assert.equal(h1, h2, 'identical strings must yield identical hashes');
            assert.notEqual(h1, h3, 'different payloads must yield distinct hashes');
            assert.equal(h1.length, 8, 'hash must be 8-char hex string');
            assert.equal(computeSnapshotChecksum(null), '00000000');
        });

        it('encodes and decodes base64 strings losslessly', () => {
            const testPayload = JSON.stringify({ river: 'Canyon', z: -375, flags: [true, false] });
            const b64 = stringToBase64(testPayload);
            const decoded = base64ToString(b64);
            assert.equal(decoded, testPayload);
        });
    });

    describe('2. State Snapshot Capture across Checkpoints', () => {
        function setupSampleGameState() {
            const state = createGameState({ seed: 42 });
            addPlayer(state, 'p1', { isBot: false, name: 'Viking Chief' });
            addPlayer(state, 'bot-1', { isBot: true });

            const p1 = state.players['p1'];
            p1.position = { x: 2.5, y: 0.5, z: -375.0 };
            p1.velocity = { x: 0.1, y: 0.0, z: -14.2 };
            p1.yaw = 0.05;
            p1.coins = 240;
            p1.upgrades = ['motor', 'weapon'];
            p1.health = 85;
            p1.maxHealth = 120;
            p1.kills = 4;
            p1.damageDealt = 180;

            const bot = state.players['bot-1'];
            bot.position = { x: -3.0, y: 0.5, z: -370.0 };
            bot.coins = 70;
            bot.health = 90;

            state.enemies.whiteGuy.hasSpawned = true;
            state.enemies.whiteGuy.health = 35;
            state.enemies.whiteGuy.position = { x: 0, y: 0.5, z: -385 };

            state.wave = 3;
            state.lastCheckpointZ = -375;
            state.gameStarted = true;

            return state;
        }

        it('captures full simulation state at Act I checkpoint (z = -375)', () => {
            const state = setupSampleGameState();
            const snap = captureStateSnapshot(state, {
                checkpointZ: -375,
                checkpointIndex: 1,
                tag: 'act1_sunset_canyon_gate',
                seed: 42,
            });

            assert.equal(snap.version, 1);
            assert.equal(snap.tag, 'act1_sunset_canyon_gate');
            assert.equal(snap.checkpointZ, -375);
            assert.equal(snap.checkpointIndex, 1);
            assert.equal(snap.wave, 3);
            assert.equal(snap.seed, 42);

            // Assert players captured
            assert.ok(snap.players['p1']);
            assert.equal(snap.players['p1'].name, 'Viking Chief');
            assert.equal(snap.players['p1'].coins, 240);
            assert.deepEqual(snap.players['p1'].upgrades, ['motor', 'weapon']);
            assert.equal(snap.players['p1'].health, 85);

            // Assert bots captured
            assert.ok(snap.players['bot-1']);
            assert.equal(snap.players['bot-1'].isBot, true);
            assert.equal(snap.players['bot-1'].coins, 70);

            // Assert enemies captured
            assert.equal(snap.enemies.whiteGuy.health, 35);
            assert.equal(snap.enemies.whiteGuy.hasSpawned, true);
        });

        it('captures boss Kraken and tarot blessing states when present', () => {
            const state = setupSampleGameState();
            const krakenState = {
                isSpawned: true,
                isDefeated: false,
                phase: 2,
                health: 950,
                maxHealth: 1500,
                position: { x: 0, y: -2, z: -1350 },
                enraged: true,
            };
            const tarotState = {
                blessings: ['caffeinated-oars', 'heavy-pocket-anvil'],
                activeDraft: null,
            };

            const snap = captureStateSnapshot(state, {
                checkpointZ: -1125,
                checkpointIndex: 3,
                krakenState,
                tarotState,
            });

            assert.equal(snap.checkpointZ, -1125);
            assert.ok(snap.kraken);
            assert.equal(snap.kraken.isSpawned, true);
            assert.equal(snap.kraken.phase, 2);
            assert.equal(snap.kraken.health, 950);
            assert.equal(snap.kraken.enraged, true);

            assert.ok(snap.tarot);
            assert.deepEqual(snap.tarot.blessings, ['caffeinated-oars', 'heavy-pocket-anvil']);
        });

        it('throws error when capturing with null or invalid gameState', () => {
            assert.throws(() => {
                captureStateSnapshot(null);
            }, /invalid or missing gameState/);
        });
    });

    describe('3. Serialization & Wire Formats (JSON + Base64)', () => {
        it('serializes to valid JSON with tamper-evident checksum', () => {
            const state = createGameState({ seed: 101 });
            addPlayer(state, 'p1', { isBot: false });
            state.players['p1'].position.z = -750;
            state.players['p1'].coins = 500;

            const snap = captureStateSnapshot(state, { checkpointZ: -750 });
            const jsonStr = serializeSnapshot(snap, 'json');

            assert.equal(typeof jsonStr, 'string');
            const parsed = JSON.parse(jsonStr);
            assert.ok(parsed.checksum);
            assert.equal(parsed.checkpointZ, -750);
            assert.equal(parsed.players['p1'].coins, 500);
        });

        it('serializes to Base64 format with SNAPSHOT_ prefix', () => {
            const state = createGameState({ seed: 202 });
            addPlayer(state, 'p1', { isBot: false });
            state.players['p1'].position.z = -1125;

            const snap = captureStateSnapshot(state, { checkpointZ: -1125 });
            const b64Str = serializeSnapshot(snap, 'base64');

            assert.ok(b64Str.startsWith('SNAPSHOT_'));
            const deserialized = deserializeSnapshot(b64Str);
            assert.equal(deserialized.checkpointZ, -1125);
            assert.ok(deserialized.checksum);
        });

        it('deserializes round-trip JSON perfectly matching original snapshot', () => {
            const state = createGameState({ seed: 777 });
            addPlayer(state, 'p1', { isBot: false, name: 'Sovereign Navigator' });
            state.players['p1'].position = { x: 1.2, y: 0.25, z: -375.0 };
            state.players['p1'].coins = 320;
            state.players['p1'].upgrades = ['armor', 'weapon'];

            const originalSnap = captureStateSnapshot(state, { checkpointZ: -375 });
            const serialized = serializeSnapshot(originalSnap, 'json');
            const restoredSnap = deserializeSnapshot(serialized);

            assert.equal(restoredSnap.checkpointZ, originalSnap.checkpointZ);
            assert.ok(restoredSnap.checksum);
            assert.deepEqual(restoredSnap.players['p1'], originalSnap.players['p1']);
        });
    });

    describe('4. Tamper Detection & Checksum Validation', () => {
        it('rejects tampered JSON payloads where values were altered after serialization', () => {
            const state = createGameState({ seed: 99 });
            addPlayer(state, 'p1');
            state.players['p1'].coins = 50;

            const snap = captureStateSnapshot(state, { checkpointZ: -375 });
            const jsonStr = serializeSnapshot(snap, 'json');
            const tampered = jsonStr.replace('"coins":50', '"coins":999999');

            assert.throws(() => {
                deserializeSnapshot(tampered);
            }, /checksum verification failed/);
        });

        it('rejects tampered Base64 payloads with flipped bits', () => {
            const state = createGameState({ seed: 99 });
            addPlayer(state, 'p1');
            const snap = captureStateSnapshot(state, { checkpointZ: -750 });
            const b64Str = serializeSnapshot(snap, 'base64');

            // Corrupt a character inside the base64 body
            const tamperedB64 = b64Str.slice(0, 15) + 'X' + b64Str.slice(16);
            assert.throws(() => {
                deserializeSnapshot(tamperedB64);
            });
        });

        it('rejects payloads missing checksum or corrupted structural fields', () => {
            assert.throws(() => {
                deserializeSnapshot(JSON.stringify({ version: 1, checkpointZ: -375 }));
            }, /missing required checksum/);

            assert.throws(() => {
                deserializeSnapshot('');
            }, /empty or invalid/);

            assert.throws(() => {
                deserializeSnapshot('{ invalid json');
            }, /failed to parse JSON/);
        });

        it('rejects malicious prototype pollution payloads', () => {
            // First construct payload without checksum, compute valid checksum so checksum passes first
            const unverified = {
                version: 1,
                checkpointZ: -375,
                players: {},
            };
            const validChecksum = computeSnapshotChecksum(JSON.stringify(unverified));
            const maliciousJson = `{"version":1,"checkpointZ":-375,"players":{},"__proto__":{"isAdmin":true},"checksum":"${validChecksum}"}`;

            assert.throws(() => {
                deserializeSnapshot(maliciousJson);
            }, /prototype pollution/);
        });
    });

    describe('5. Clean Run Resumption & Bug State Reproduction', () => {
        it('restores game state from snapshot allowing runs to resume cleanly', () => {
            const originalState = createGameState({ seed: 42 });
            addPlayer(originalState, 'p1', { name: 'Player One' });
            addPlayer(originalState, 'bot-1', { isBot: true });

            originalState.players['p1'].coins = 450;
            originalState.players['p1'].health = 60;
            originalState.players['p1'].upgrades = ['motor', 'weapon'];
            originalState.players['p1'].position = { x: -2.0, y: 0.5, z: -750.0 };
            originalState.wave = 5;

            const snap = captureStateSnapshot(originalState, {
                checkpointZ: -750,
                seed: 42,
            });
            const serialized = serializeSnapshot(snap, 'json');
            const deserialized = deserializeSnapshot(serialized);

            // Instantiate a clean resumed game state
            const resumedState = restoreStateFromSnapshot(deserialized);

            assert.equal(resumedState.lastCheckpointZ, -750);
            assert.equal(resumedState.wave, 5);
            assert.equal(resumedState.players['p1'].name, 'Player One');
            assert.equal(resumedState.players['p1'].coins, 450);
            assert.equal(resumedState.players['p1'].health, 60);
            assert.deepEqual(resumedState.players['p1'].upgrades, ['motor', 'weapon']);
            assert.equal(resumedState.players['bot-1'].isBot, true);

            // Resume simulation stepping without crashing
            const events = tick(resumedState, 50);
            assert.ok(Array.isArray(events));
            assert.equal(resumedState.tickCount, 1);
        });

        it('reproduces exact bug state down to coordinates and enemy HP', () => {
            const bugState = createGameState({ seed: 1337 });
            addPlayer(bugState, 'p1');
            bugState.players['p1'].position = { x: 12.345, y: 0.25, z: -1124.99 };
            bugState.players['p1'].health = 1; // 1-HP clutch moment
            bugState.enemies.longWorm.health = 5;
            bugState.enemies.longWorm.state = 'charging';
            bugState.enemies.longWorm.targetPos = { x: 12.0, y: 0.5, z: -1125.0 };

            const snap = captureStateSnapshot(bugState, {
                checkpointZ: -1125,
                tag: 'bug-worm-1hp-strike',
                seed: 1337,
            });

            const serialized = serializeSnapshot(snap);
            const loaded = deserializeSnapshot(serialized);
            const hydrated = restoreStateFromSnapshot(loaded);

            assert.equal(hydrated.players['p1'].health, 1);
            assert.equal(hydrated.players['p1'].position.x, 12.345);
            assert.equal(hydrated.enemies.longWorm.health, 5);
            assert.equal(hydrated.enemies.longWorm.state, 'charging');
            assert.deepEqual(hydrated.enemies.longWorm.targetPos, { x: 12.0, y: 0.5, z: -1125.0 });
        });
    });

    describe('6. Differential Comparison (diffSnapshots)', () => {
        it('detects identical snapshots with zero discrepancies', () => {
            const state = createGameState({ seed: 123 });
            addPlayer(state, 'p1');
            const snapA = captureStateSnapshot(state, { checkpointZ: -375 });
            const snapB = captureStateSnapshot(state, { checkpointZ: -375 });

            const diff = diffSnapshots(snapA, snapB);
            assert.equal(diff.identical, true);
            assert.equal(diff.differences.length, 0);
        });

        it('detects discrepancies in coins, health, upgrades, and checkpointZ', () => {
            const state1 = createGameState({ seed: 123 });
            addPlayer(state1, 'p1');
            state1.players['p1'].coins = 100;
            state1.players['p1'].health = 100;
            state1.players['p1'].upgrades = ['motor'];
            const snapA = captureStateSnapshot(state1, { checkpointZ: -375 });

            const state2 = createGameState({ seed: 123 });
            addPlayer(state2, 'p1');
            state2.players['p1'].coins = 150; // Divergence
            state2.players['p1'].health = 75;  // Divergence
            state2.players['p1'].upgrades = ['weapon']; // Divergence
            const snapB = captureStateSnapshot(state2, { checkpointZ: -750 }); // Divergence

            const diff = diffSnapshots(snapA, snapB);
            assert.equal(diff.identical, false);
            assert.ok(diff.differences.some((d) => d.includes('checkpointZ mismatch')));
            assert.ok(diff.differences.some((d) => d.includes('coins mismatch')));
            assert.ok(diff.differences.some((d) => d.includes('health mismatch')));
            assert.ok(diff.differences.some((d) => d.includes('upgrades mismatch')));
        });
    });
});
