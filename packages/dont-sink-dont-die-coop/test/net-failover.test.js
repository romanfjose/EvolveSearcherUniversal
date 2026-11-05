import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    FAILOVER_CONSTANTS,
    isValidVector3,
    isValidQuaternion,
    sanitizeServerPacket,
    SnapshotSequencer,
    LatencyWatchdog,
    createOfflineFailoverState,
    NetworkFailoverCoordinator,
} from '../shared/net-failover.js';
import { PLAYER } from '../shared/game-core.js';

describe('Network Disconnect & Offline Mid-Run Failover Breaker', () => {
    describe('1. Packet Validation & Adversarial Fuzzing', () => {
        it('validates 3D vectors and quaternions against NaN, Infinity, and missing keys', () => {
            assert.equal(isValidVector3({ x: 0, y: 1.5, z: -50 }), true);
            assert.equal(isValidVector3({ x: NaN, y: 1.5, z: -50 }), false);
            assert.equal(isValidVector3({ x: 0, y: Infinity, z: -50 }), false);
            assert.equal(isValidVector3({ x: 0, y: 1.5 }), false);
            assert.equal(isValidVector3(null), false);
            assert.equal(isValidVector3('not_a_vector'), false);

            assert.equal(isValidQuaternion({ x: 0, y: 0, z: 0, w: 1 }), true);
            assert.equal(isValidQuaternion({ x: 0, y: NaN, z: 0, w: 1 }), false);
            assert.equal(isValidQuaternion({ x: 0, y: 0, z: 0 }), false);
            assert.equal(isValidQuaternion(undefined), false);
        });

        it('sanitizes malformed playerMoved packets and rejects corrupt coords', () => {
            const valid = sanitizeServerPacket('playerMoved', {
                id: 'player_1',
                position: { x: 5, y: 12, z: -250 },
                quaternion: { x: 0, y: 0, z: 0, w: 1 },
                seq: 10,
            });
            assert.equal(valid.valid, true);
            assert.equal(valid.sanitizedData.position.z, -250);
            assert.equal(valid.sanitizedData.seq, 10);

            // Rejects NaN position
            const nanPacket = sanitizeServerPacket('playerMoved', {
                id: 'player_1',
                position: { x: NaN, y: 0, z: -250 },
            });
            assert.equal(nanPacket.valid, false);
            assert.equal(nanPacket.reason, 'nan_or_invalid_position');

            // Rejects missing id
            const noId = sanitizeServerPacket('playerMoved', {
                position: { x: 0, y: 0, z: -250 },
            });
            assert.equal(noId.valid, false);
            assert.equal(noId.reason, 'missing_or_invalid_player_id');
        });

        it('rejects prototype pollution attempts', () => {
            const polluted = sanitizeServerPacket('playerMoved', JSON.parse('{"__proto__": {"isAdmin": true}}'));
            assert.equal(polluted.valid, false);
            assert.equal(polluted.reason, 'prototype_pollution_attempt');
        });

        it('sanitizes enemiesUpdate and scoreboard payloads', () => {
            const enemies = sanitizeServerPacket('enemiesUpdate', {
                whiteGuy: { id: 'whiteGuy', position: { x: 0, y: 0.5, z: -100 }, health: 80, maxHealth: 100 },
                corruptEnemy: { id: 'corrupt', position: { x: NaN, y: 0, z: 0 } },
            });
            assert.equal(enemies.valid, true);
            assert.ok(enemies.sanitizedData.whiteGuy);
            assert.equal(enemies.sanitizedData.corruptEnemy, undefined);

            const scoreboard = sanitizeServerPacket('scoreboard', {
                wave: 3,
                leadZ: -450,
                gameWon: false,
                players: [{ id: 'p1', coins: 150 }],
            });
            assert.equal(scoreboard.valid, true);
            assert.equal(scoreboard.sanitizedData.wave, 3);
            assert.equal(scoreboard.sanitizedData.leadZ, -450);
        });
    });

    describe('2. Snapshot Sequencer & Out-of-Order Packet Ordering', () => {
        it('accepts monotonically increasing sequence numbers and drops stale/out-of-order packets', () => {
            const sequencer = new SnapshotSequencer({ staleToleranceMs: 200 });

            // Packet seq 1 -> accepted
            assert.equal(sequencer.processSnapshot({ seq: 1, time: 1000 }).accepted, true);
            // Packet seq 2 -> accepted
            assert.equal(sequencer.processSnapshot({ seq: 2, time: 1050 }).accepted, true);
            // Out of order Packet seq 1 again -> dropped
            const stale = sequencer.processSnapshot({ seq: 1, time: 1060 });
            assert.equal(stale.accepted, false);
            assert.equal(stale.reason, 'out_of_order_seq');
            assert.equal(sequencer.droppedStaleCount, 1);

            // Packet seq 5 -> accepted
            assert.equal(sequencer.processSnapshot({ seq: 5, time: 1200 }).accepted, true);
            // Packet seq 3 (arrived late) -> dropped
            assert.equal(sequencer.processSnapshot({ seq: 3, time: 1250 }).accepted, false);
        });

        it('drops snapshots with timestamps lagging further than stale tolerance', () => {
            const sequencer = new SnapshotSequencer({ staleToleranceMs: 300 });
            assert.equal(sequencer.processSnapshot({ time: 5000 }).accepted, true);
            // 100ms in the past is within 300ms tolerance
            assert.equal(sequencer.processSnapshot({ time: 4950 }).accepted, true);
            // 500ms in the past is beyond tolerance -> dropped
            const laggy = sequencer.processSnapshot({ time: 4400 });
            assert.equal(laggy.accepted, false);
            assert.equal(laggy.reason, 'stale_timestamp');
        });
    });

    describe('3. Latency Watchdog & Heartbeat Monitor', () => {
        it('detects 2000ms latency spikes and triggers spike callback', () => {
            let spikeDetected = false;
            let observedRtt = 0;
            const watchdog = new LatencyWatchdog({
                spikeThresholdMs: 2000,
                onSpike: (rtt) => {
                    spikeDetected = true;
                    observedRtt = rtt;
                },
            });

            // Normal 50ms ping
            const normal = watchdog.recordPing(1000, 1050);
            assert.equal(normal.spike, false);
            assert.equal(normal.rtt, 50);
            assert.equal(spikeDetected, false);

            // 2100ms latency spike!
            const spike = watchdog.recordPing(1000, 3100);
            assert.equal(spike.spike, true);
            assert.equal(spike.rtt, 2100);
            assert.equal(spikeDetected, true);
            assert.equal(observedRtt, 2100);
        });

        it('detects server heartbeat timeouts after 2000ms silence', () => {
            let timedOut = false;
            const watchdog = new LatencyWatchdog({
                spikeThresholdMs: 2000,
                onTimeout: () => { timedOut = true; },
            });

            watchdog.recordHeartbeat(10000);
            assert.equal(watchdog.checkLiveness(11000).timedOut, false);
            // 2100ms later without heartbeat -> triggers timeout
            const res = watchdog.checkLiveness(12100);
            assert.equal(res.timedOut, true);
            assert.equal(timedOut, true);
        });
    });

    describe('4. Mid-Run Offline State Creation & Continuity Invariants', () => {
        it('preserves coins, upgrades, and mid-air river coordinates when creating offline state', () => {
            const activeRaftState = {
                position: { x: 3.5, y: 14.2, z: -875.5 }, // Mid-air over a waterfall / stunt ramp
                velocity: { x: 0.5, y: -8.0, z: -22.0 },
                quaternion: { x: 0.1, y: 0.2, z: 0, w: 0.97 },
                yaw: 0.35,
                airborne: true,
            };

            const playerStats = {
                coins: 340,
                upgrades: ['motor', 'weapon', 'armor'],
                health: 120,
                maxHealth: 150,
                kills: 8,
                damageDealt: 420,
            };

            const enemies = {
                whiteGuy: { position: { x: 0, y: 0.5, z: -890 }, health: 40, maxHealth: 50 },
            };

            const state = createOfflineFailoverState({
                activeRaftState,
                playerStats,
                enemies,
                wave: 6,
                lastCheckpointZ: -750,
                seed: 12345,
                botCount: 2,
            });

            const p = state.players[FAILOVER_CONSTANTS.LOCAL_PLAYER_ID];
            assert.ok(p, 'local offline player should exist in state');

            // CRITICAL INVARIANTS: Coins, upgrades, and river Z coordinate must be preserved
            assert.equal(p.coins, 340, 'coins must NOT be reset');
            assert.deepEqual(p.upgrades, ['motor', 'weapon', 'armor'], 'upgrades must NOT be reset');
            assert.equal(p.position.z, -875.5, 'river Z position must be preserved');
            assert.equal(p.position.y, 14.2, 'mid-air height over waterfall must be preserved');
            assert.equal(p.velocity.z, -22.0, 'forward momentum must be preserved');
            assert.equal(p.health, 120, 'health must be preserved');
            assert.equal(p.maxHealth, 150, 'maxHealth must be preserved');

            // Verify bots were populated in state
            assert.ok(state.players['bot-1']);
            assert.ok(state.players['bot-2']);

            // Verify enemies restored
            assert.equal(state.enemies.whiteGuy.health, 40);
            assert.equal(state.enemies.whiteGuy.position.z, -890);
        });
    });

    describe('5. NetworkFailoverCoordinator Integration Breaker', () => {
        it('simulates sudden Socket.io disconnect while airborne and seamlessly hands over authority', () => {
            let modeChangeLog = [];
            let toastLog = [];
            let handoverReceived = null;

            const coordinator = new NetworkFailoverCoordinator({
                onModeChange: (mode, detail) => modeChangeLog.push({ mode, detail }),
                onToast: (msg) => toastLog.push(msg),
            });

            coordinator.on('authorityHandover', (data) => {
                handoverReceived = data;
            });

            // Player is flying mid-air over a waterfall
            coordinator.updateClientCache(
                {
                    position: { x: -2.0, y: 16.5, z: -620.0 },
                    velocity: { x: 0, y: 5.0, z: -18.0 },
                    quaternion: { x: 0, y: 0, z: 0, w: 1 },
                    airborne: true,
                },
                {
                    coins: 215,
                    upgrades: ['motor', 'weapon'],
                    health: 90,
                    maxHealth: 100,
                }
            );

            // Abrupt disconnect occurs!
            assert.equal(coordinator.mode, 'online');
            coordinator.simulateDisconnect('transport_close');

            assert.equal(coordinator.mode, 'offline_failover');
            assert.ok(handoverReceived, 'authorityHandover event must be emitted');
            assert.equal(handoverReceived.player.coins, 215, 'player coins preserved in handover');
            assert.deepEqual(handoverReceived.player.upgrades, ['motor', 'weapon'], 'upgrades preserved in handover');
            assert.equal(handoverReceived.player.position.z, -620.0, 'river position preserved');
            assert.equal(handoverReceived.player.position.y, 16.5, 'mid-air altitude preserved');

            // Step offline simulation and verify physics continue smoothly without resetting
            const stepResult = coordinator.stepOfflineSimulation(1 / 60, { w: true });
            assert.ok(stepResult, 'offline simulation stepped');
            assert.ok(stepResult.player.position.z < -620.0, 'raft moved further downriver');
            assert.equal(stepResult.player.coins, 215, 'coins remained intact after physics step');
            assert.deepEqual(stepResult.player.upgrades, ['motor', 'weapon'], 'upgrades remained intact');
        });

        it('automatically fails over upon receiving a storm of corrupt packets', () => {
            const coordinator = new NetworkFailoverCoordinator({
                maxCorruptPackets: 3,
            });

            coordinator.updateClientCache(
                { position: { x: 0, y: 0.5, z: -150 } },
                { coins: 80, upgrades: ['armor'] }
            );

            assert.equal(coordinator.mode, 'online');

            // Send 3 consecutive malformed/corrupt packets
            coordinator.receivePacket('playerMoved', { id: 'p', position: { x: NaN, y: 0, z: 0 } });
            coordinator.receivePacket('enemiesUpdate', null);
            coordinator.receivePacket('playerMoved', { position: { x: 0, y: 0, z: 0 } }); // Missing ID

            // Breaker trips and transitions authority to offline mode
            assert.equal(coordinator.mode, 'offline_failover');
            assert.equal(coordinator.cachedStats.coins, 80);
            assert.deepEqual(coordinator.cachedStats.upgrades, ['armor']);
            assert.equal(coordinator.cachedRaft.position.z, -150);
        });

        it('fails over when encountering a 3000ms latency stall', () => {
            const coordinator = new NetworkFailoverCoordinator({
                latencySpikeThresholdMs: 2000,
            });

            coordinator.updateClientCache(
                { position: { x: 1, y: 0.5, z: -350 } },
                { coins: 140, upgrades: [] }
            );

            // Record a 3100ms latency spike (exceeds 1.5 * threshold)
            coordinator.watchdog.recordPing(1000, 4100);

            // Heartbeat watchdog check triggers timeout
            coordinator.watchdog.checkLiveness(15000);

            assert.equal(coordinator.mode, 'offline_failover');
            assert.equal(coordinator.cachedRaft.position.z, -350);
            assert.equal(coordinator.cachedStats.coins, 140);
        });
    });
});
