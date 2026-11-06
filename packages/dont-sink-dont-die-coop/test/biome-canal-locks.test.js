import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    CANAL_LOCKS,
    CANAL_LOCK_CONFIG,
    createCanalLockInstance,
    isEntityOnPlatform,
    isInCanalForebay,
    computeCanalLockCurrent,
    evaluateCanalLockState,
    isRaftBlockedByLock,
    resolveCanalGateCollision,
} from '../shared/biome-canal-locks.js';

describe('Co-Op Canal Lock & Drawbridge Gate Controller (w5b-03)', () => {
    describe('CANAL_LOCKS data definitions and schema integrity', () => {
        test('defines canal locks at all 3 major biome transitions', () => {
            assert.ok(Array.isArray(CANAL_LOCKS));
            assert.strictEqual(CANAL_LOCKS.length, 3);

            const zPositions = CANAL_LOCKS.map((l) => l.z);
            assert.deepStrictEqual(zPositions, [-375, -750, -1125]);
        });

        test('each lock has valid structural identifiers and dimensions', () => {
            for (const lock of CANAL_LOCKS) {
                assert.ok(typeof lock.id === 'string' && lock.id.length > 0);
                assert.ok(typeof lock.name === 'string');
                assert.ok(lock.gateType === 'drawbridge' || lock.gateType === 'floodgate');
                assert.ok(lock.barrierWidth >= 40 && lock.barrierWidth <= 80);
                assert.ok(lock.forebayZStart > lock.forebayZEnd);
                assert.ok(lock.leftPlatform && lock.rightPlatform);
                assert.strictEqual(lock.leftPlatform.side, 'left');
                assert.strictEqual(lock.rightPlatform.side, 'right');
                assert.ok(lock.leftPlatform.center.x < 0);
                assert.ok(lock.rightPlatform.center.x > 0);
            }
        });

        test('createCanalLockInstance produces isolated deep copies with clean state', () => {
            const instance1 = createCanalLockInstance(CANAL_LOCKS[0]);
            const instance2 = createCanalLockInstance(CANAL_LOCKS[0]);

            assert.notStrictEqual(instance1, instance2);
            assert.notStrictEqual(instance1.state, instance2.state);
            assert.notStrictEqual(instance1.leftPlatform, instance2.leftPlatform);

            instance1.state.openProgress = 0.5;
            assert.strictEqual(instance2.state.openProgress, 0.0);
            assert.strictEqual(CANAL_LOCKS[0].state.openProgress, 0.0);
        });

        test('createCanalLockInstance handles null or empty template safely', () => {
            assert.strictEqual(createCanalLockInstance(null), null);
            assert.strictEqual(createCanalLockInstance(undefined), null);
        });
    });

    describe('Platform & Pressure Pad spatial detection (isEntityOnPlatform)', () => {
        const lock = createCanalLockInstance(CANAL_LOCKS[0]);
        const leftPlat = lock.leftPlatform; // center: x: -28, z: -350

        test('detects entity directly on center of pressure pad', () => {
            assert.strictEqual(isEntityOnPlatform({ x: -28, z: -350 }, leftPlat), true);
        });

        test('detects entity within radial pressure pad radius', () => {
            // within PRESSURE_PAD_RADIUS (4.5m)
            assert.strictEqual(isEntityOnPlatform({ x: -25.5, z: -350 }, leftPlat), true);
            assert.strictEqual(isEntityOnPlatform({ x: -28, z: -353.5 }, leftPlat), true);
        });

        test('detects entity within rectangular platform bounds even if outside radial circle', () => {
            // Platform width: 14 (halfW: 7 -> x: -35 to -21), length: 20 (halfL: 10 -> z: -360 to -340)
            assert.strictEqual(isEntityOnPlatform({ x: -33, z: -345 }, leftPlat), true);
            assert.strictEqual(isEntityOnPlatform({ x: -22, z: -358 }, leftPlat), true);
        });

        test('returns false for entities outside platform bounds', () => {
            assert.strictEqual(isEntityOnPlatform({ x: 0, z: -350 }, leftPlat), false); // center river
            assert.strictEqual(isEntityOnPlatform({ x: 28, z: -350 }, leftPlat), false); // right pad
            assert.strictEqual(isEntityOnPlatform({ x: -28, z: -320 }, leftPlat), false); // too far upstream
        });

        test('defensively handles null or malformed inputs', () => {
            assert.strictEqual(isEntityOnPlatform(null, leftPlat), false);
            assert.strictEqual(isEntityOnPlatform({ x: 0, z: 0 }, null), false);
            assert.strictEqual(isEntityOnPlatform({}, {}), false);
        });
    });

    describe('Calm Forebay Basin detection & Current Dampening', () => {
        const lock = CANAL_LOCKS[0]; // z=-375, forebayZStart=-320, forebayZEnd=-375

        test('isInCanalForebay identifies positions upstream in the forebay', () => {
            // River flows towards -z. -320 to -375 is forebay
            assert.strictEqual(isInCanalForebay({ x: 0, z: -340 }, lock), true);
            assert.strictEqual(isInCanalForebay({ x: -20, z: -360 }, lock), true);
            assert.strictEqual(isInCanalForebay({ x: 35, z: -325 }, lock), true);
        });

        test('isInCanalForebay rejects positions past the barrier or too far upstream', () => {
            assert.strictEqual(isInCanalForebay({ x: 0, z: -380 }, lock), false); // past barrier
            assert.strictEqual(isInCanalForebay({ x: 0, z: -300 }, lock), false); // upstream before forebay
            assert.strictEqual(isInCanalForebay({ x: 50, z: -340 }, lock), false); // beyond river width
        });

        test('computeCanalLockCurrent dampens river current by 85% in forebays', () => {
            const baseCurrent = 30.0;
            const calmed = computeCanalLockCurrent(-350, 0, baseCurrent, CANAL_LOCKS);
            assert.strictEqual(calmed, baseCurrent * CANAL_LOCK_CONFIG.DEFAULT_FOREBAY_CURRENT_DAMP);
            assert.strictEqual(calmed, 4.5);
        });

        test('computeCanalLockCurrent leaves current unchanged outside forebays', () => {
            const baseCurrent = 30.0;
            const normal = computeCanalLockCurrent(-200, 0, baseCurrent, CANAL_LOCKS);
            assert.strictEqual(normal, baseCurrent);
        });

        test('computeCanalLockCurrent returns baseCurrent safely when locks is empty/invalid', () => {
            assert.strictEqual(computeCanalLockCurrent(-350, 0, 25.0, null), 25.0);
            assert.strictEqual(computeCanalLockCurrent(-350, 0, 25.0, []), 25.0);
        });
    });

    describe('evaluateCanalLockState: Co-op Dual Pad Activation', () => {
        test('gate remains closed and locked if neither platform is occupied', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const players = [
                { x: 0, z: -340 }, // cruising down middle
                { x: 5, z: -342 },
            ];

            const summary = evaluateCanalLockState(lock, players, 0.1);
            assert.strictEqual(summary.isOpen, false);
            assert.strictEqual(summary.openProgress, 0.0);
            assert.strictEqual(summary.leftActive, false);
            assert.strictEqual(summary.rightActive, false);
            assert.strictEqual(summary.coopActivated, false);
        });

        test('gate does not open if only one co-op player occupies a platform', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const players = [
                { x: -28, z: -350 }, // Left pad
                { x: 0, z: -340 },   // Middle channel
            ];

            // In 2-player game, single pad is not enough
            const summary = evaluateCanalLockState(lock, players, 0.5);
            assert.strictEqual(summary.leftActive, true);
            assert.strictEqual(summary.rightActive, false);
            assert.strictEqual(summary.isOpen, false);
            assert.strictEqual(summary.openProgress, 0.0);
            assert.strictEqual(summary.coopActivated, false);
        });

        test('gate begins opening when both co-op platforms are occupied simultaneously', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const players = [
                { x: -28, z: -350 }, // Left pad
                { x: 28, z: -350 },  // Right pad
            ];

            const dt = 1.0;
            const summary = evaluateCanalLockState(lock, players, dt);
            assert.strictEqual(summary.leftActive, true);
            assert.strictEqual(summary.rightActive, true);
            assert.strictEqual(summary.coopActivated, true);
            assert.strictEqual(summary.isLocked, false);
            assert.ok(summary.openProgress > 0.0);
            assert.ok(summary.openProgress >= CANAL_LOCK_CONFIG.OPENING_SPEED * 0.99);
        });

        test('sustained dual occupancy opens gate to 100% and sets isOpen true', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const players = [
                { x: -28, z: -350 },
                { x: 28, z: -350 },
            ];

            // Advance 4 seconds (at 0.35/s, full open in ~2.85s)
            let summary;
            for (let i = 0; i < 40; i++) {
                summary = evaluateCanalLockState(lock, players, 0.1);
            }

            assert.strictEqual(summary.isOpen, true);
            assert.strictEqual(summary.openProgress, 1.0);
            assert.strictEqual(summary.isLocked, false);
            assert.strictEqual(lock.state.waterLevelDelta, 0.0);
        });

        test('once gate reaches full open, it remains unlocked and passable', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const players = [
                { x: -28, z: -350 },
                { x: 28, z: -350 },
            ];

            for (let i = 0; i < 30; i++) {
                evaluateCanalLockState(lock, players, 0.1);
            }
            assert.strictEqual(lock.state.isOpen, true);

            // Players leave the pads to sail through the gate
            const sailingPlayers = [
                { x: 0, z: -370 },
                { x: 2, z: -372 },
            ];
            const summary = evaluateCanalLockState(lock, sailingPlayers, 0.1);
            assert.strictEqual(summary.isOpen, true);
            assert.strictEqual(summary.openProgress, 1.0);
        });

        test('partially opened gate smoothly closes if players step off prematurely', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const players = [
                { x: -28, z: -350 },
                { x: 28, z: -350 },
            ];

            // Open halfway (1 second at 0.35/s = 0.35)
            evaluateCanalLockState(lock, players, 1.0);
            assert.ok(lock.state.openProgress >= 0.34);

            // Players both step off
            const playersAway = [
                { x: 0, z: -340 },
                { x: 5, z: -340 },
            ];

            evaluateCanalLockState(lock, playersAway, 1.0);
            // Should decrease by CLOSING_SPEED (0.20/s)
            assert.ok(lock.state.openProgress < 0.20);
            assert.strictEqual(lock.state.isOpen, false);
        });

        test('dead players are excluded from platform triggers', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const players = [
                { x: -28, z: -350, isAlive: true },
                { x: 28, z: -350, isAlive: false }, // Dead teammate
            ];

            const summary = evaluateCanalLockState(lock, players, 0.5);
            assert.strictEqual(summary.leftActive, true);
            assert.strictEqual(summary.rightActive, false);
            assert.strictEqual(summary.coopActivated, false);
        });
    });

    describe('evaluateCanalLockState: Solo Mode Sequential Latch Adaptation', () => {
        test('in solo mode, visiting one pad activates latch timer', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const soloPlayer = [{ x: -28, z: -350 }]; // Visited left pad

            const summary = evaluateCanalLockState(lock, soloPlayer, 0.1);
            assert.strictEqual(summary.leftActive, true);
            assert.strictEqual(summary.soloAssistActive, true);
            assert.strictEqual(summary.latchRemaining, CANAL_LOCK_CONFIG.SOLO_COOLDOWN_LATCH_SEC);
        });

        test('solo player can transit to second pad while latch is active to open gate', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);

            // 1. Visit left pad
            evaluateCanalLockState(lock, [{ x: -28, z: -350 }], 0.1);

            // 2. Sail across river (3 seconds transit time)
            for (let t = 0; t < 30; t++) {
                evaluateCanalLockState(lock, [{ x: -28 + t * 1.8, z: -350 }], 0.1);
            }
            assert.strictEqual(lock.state.soloAssistActive, true);
            assert.ok(lock.state.latchRemaining > 0);

            // 3. Arrive at right pad
            const summary = evaluateCanalLockState(lock, [{ x: 28, z: -350 }], 1.0);
            assert.strictEqual(summary.rightActive, true);
            assert.ok(summary.openProgress > 0.0);
        });

        test('latch timer expires if solo player takes too long', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);

            // Visit left pad
            evaluateCanalLockState(lock, [{ x: -28, z: -350 }], 0.1);

            // Wait 20 seconds away from both pads
            evaluateCanalLockState(lock, [{ x: 0, z: -340 }], 20.0);
            assert.strictEqual(lock.state.soloAssistActive, false);
            assert.strictEqual(lock.state.latchRemaining, 0);
        });
    });

    describe('Physical Barrier Collision & Blocking (isRaftBlockedByLock, resolveCanalGateCollision)', () => {
        test('blocks raft trying to pass through closed gate barrier', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]); // z = -375, closed
            const raft = { x: 0, z: -374, radius: 3.0 }; // Right at the barrier

            assert.strictEqual(isRaftBlockedByLock(raft, lock), true);
        });

        test('does not block raft when gate is fully open', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            lock.state.isOpen = true;
            lock.state.openProgress = 1.0;

            const raft = { x: 0, z: -375, radius: 3.0 };
            assert.strictEqual(isRaftBlockedByLock(raft, lock), false);
        });

        test('does not block raft when raft is far upstream or outside gate width', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const upstreamRaft = { x: 0, z: -320, radius: 3.0 };
            assert.strictEqual(isRaftBlockedByLock(upstreamRaft, lock), false);

            const shorelineRaft = { x: 60, z: -375, radius: 3.0 }; // past barrierWidth (50)
            assert.strictEqual(isRaftBlockedByLock(shorelineRaft, lock), false);
        });

        test('resolveCanalGateCollision pushes raft upstream and zeroes forward velocity', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]); // z = -375
            const raft = {
                position: { x: 0, z: -374 },
                velocity: { x: 0, z: -15.0 }, // Moving downriver
                radius: 3.0,
            };

            const resolved = resolveCanalGateCollision(raft, lock);
            assert.strictEqual(resolved, true);
            // Raft is pushed back upstream of the barrier (z > -375 + halfDepth + radius)
            assert.ok(raft.position.z >= -375 + 4 + 3);
            assert.strictEqual(raft.velocity.z, 0);
        });

        test('resolveCanalGateCollision returns false if raft is not colliding', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const raft = {
                position: { x: 0, z: -340 },
                velocity: { x: 0, z: -10.0 },
            };

            const resolved = resolveCanalGateCollision(raft, lock);
            assert.strictEqual(resolved, false);
            assert.strictEqual(raft.position.z, -340);
        });
    });

    describe('Robustness and Edge Cases', () => {
        test('evaluateCanalLockState handles zero or negative dt cleanly', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const resZero = evaluateCanalLockState(lock, [], 0);
            assert.strictEqual(resZero.isOpen, false);

            const resNeg = evaluateCanalLockState(lock, [], -1.0);
            assert.strictEqual(resNeg.isOpen, false);
        });

        test('handles positions with Vector3 object shape {position: {x, z}}', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            const players = [
                { position: { x: -28, y: 0, z: -350 } },
                { position: { x: 28, y: 0, z: -350 } },
            ];

            const summary = evaluateCanalLockState(lock, players, 0.5);
            assert.strictEqual(summary.leftActive, true);
            assert.strictEqual(summary.rightActive, true);
        });

        test('handles empty or malformed player objects without crashing', () => {
            const lock = createCanalLockInstance(CANAL_LOCKS[0]);
            assert.doesNotThrow(() => {
                evaluateCanalLockState(lock, [null, undefined, {}, { x: NaN, z: Infinity }], 0.016);
            });
        });
    });
});
