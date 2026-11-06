/**
 * Don't Sink, Don't Die — Wave 5C QA Breaker: Frame-Time Spike & Tab-Backgrounding Stability
 * (`test/qa-wave5c-lag-spike-stability.test.js`)
 *
 * Sovereign Helmet 03 (The "Where's the Bathroom?" Breaker):
 * - Verifies that extreme delta-time spikes (0.5s, 2.0s, 10.0s, and malicious 100s/Infinity/NaN)
 *   caused by browser tab backgrounding, OS freezes, or garbage collection stalls
 *   NEVER:
 *     1. Launch resting rafts off Sanctuary Platforms / elevated solid planks into deep space.
 *     2. Tunnel resting rafts through solid platforms into the abyss.
 *     3. Teleport AI companion bots lightyears away from the crew or leader.
 *     4. Cause spiral-of-death accumulator runaway or infinite simulation loops.
 *     5. Inject NaNs or non-finite values into position, velocity, or yaw transforms.
 *
 * Pure node:test test suite with zero external dependencies.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    PhysicsSubstepper,
    createPhysicsSubstepper,
    SUBSTEPPER_DEFAULTS,
    sanitizeFrameDelta,
    lerpScalar,
    lerpVector3,
    lerpAngle,
    interpolateKinematicState,
} from '../shared/physics-substepper.js';

import {
    SAFE_CORRIDOR,
    clampRaftToSafeCorridor,
    stepPhysicsWithTunnelingGuard,
    executeExtremeVelocityStressTest,
} from '../shared/physics-breaker.js';

import {
    createGameState,
    addPlayer,
    tick,
    stepBot,
    botDecide,
    driveWatercraft,
    stepWatercraftKinematics,
    resolveWorldBoundsAndObstacles,
    settleOnWater,
    PHYSICS,
    PLAYER,
    BOT,
    WATER_SURFACE_Y,
    distXZ,
    dist3,
} from '../shared/game-core.js';

describe('Wave 5C QA Breaker: Frame-Time Spike & Tab-Backgrounding Stability', () => {

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. Physics Substepper & Spiral-of-Death Clamping under Extreme Spikes
    // ─────────────────────────────────────────────────────────────────────────────
    describe('1. Substepper Spiral-of-Death Protection against Tab Pauses', () => {
        test('clamps dt = 0.5s (500ms GC freeze) to maxFrameDelta without runaway substeps', () => {
            const stepper = createPhysicsSubstepper();
            let steps = 0;
            const res = stepper.step(0.5, () => {
                steps++;
            });

            assert.equal(res.clampedDelta, 0.1, '0.5s raw delta must clamp to 0.1s (100ms)');
            assert.ok(steps <= 4, `Must not exceed 4 substeps per frame, executed: ${steps}`);
            assert.equal(res.substeps, steps);
            assert.equal(res.spiralGuardTripped, true, 'Spiral guard must trip to discard excess time');
            assert.ok(res.discardedTime > 0, 'Excess time must be dropped');
            assert.ok(res.alpha >= 0 && res.alpha <= 1, 'Alpha must remain bounded in [0, 1]');
        });

        test('handles dt = 2.0s (browser tab backgrounded for 2 seconds)', () => {
            const stepper = createPhysicsSubstepper();
            let stepCount = 0;
            const res = stepper.step(2.0, () => {
                stepCount++;
            });

            assert.equal(res.clampedDelta, 0.1);
            assert.ok(stepCount <= 4);
            assert.equal(res.spiralGuardTripped, true);
            assert.ok(Number.isFinite(stepper.accumulator));
            assert.ok(stepper.accumulator < stepper.fixedDt);
        });

        test('handles dt = 10.0s (long tab switch or OS sleep resume)', () => {
            const stepper = createPhysicsSubstepper();
            let stepCount = 0;
            const res = stepper.step(10.0, (dt, current, total) => {
                stepCount++;
                assert.ok(Math.abs(dt - 1 / 60) < 1e-6);
            });

            assert.equal(res.clampedDelta, 0.1);
            assert.ok(stepCount <= 4);
            assert.equal(res.spiralGuardTripped, true);
            assert.equal(stepper.clampedDeltaCount, 1);
            assert.ok(stepper.discardedTime > 0);
        });

        test('handles adversarial input (100.0s, Infinity, -5.0s, NaN) without NaN accumulation', () => {
            const stepper = createPhysicsSubstepper();

            // 100 seconds
            stepper.step(100.0);
            assert.ok(Number.isFinite(stepper.accumulator));

            // Infinity
            stepper.step(Infinity);
            assert.ok(Number.isFinite(stepper.accumulator));

            // Negative delta
            stepper.step(-5.0);
            assert.ok(Number.isFinite(stepper.accumulator));

            // NaN
            stepper.step(NaN);
            assert.ok(Number.isFinite(stepper.accumulator));
            assert.ok(Number.isFinite(stepper.getAlpha()));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. Solid Platform / Sanctuary Stability under Extreme dt Spikes
    // ─────────────────────────────────────────────────────────────────────────────
    describe('2. Sanctuary Platform Stability (Never Launch, Never Tunnel)', () => {
        const sanctuaryPlatform = {
            type: 'plank',
            id: 'sanctuary_dock_01',
            x: 0,
            z: -120,
            halfW: 6.0,
            halfD: 8.0,
            topY: 1.8,
        };

        function createRestingRaftOnPlatform() {
            return {
                id: 'player_on_dock',
                position: { x: 0, y: 1.8, z: -120 },
                velocity: { x: 0, y: 0, z: 0 },
                angularVelocity: { x: 0, y: 0, z: 0 },
                yaw: 0,
            };
        }

        test('raft resting on platform remains docked across sudden dt = 0.5s spike', () => {
            const raft = createRestingRaftOnPlatform();
            const stepper = createPhysicsSubstepper();

            // Simulate the 0.5s spike via substepper
            stepper.step(0.5, (fixedDt) => {
                const { onSolid } = resolveWorldBoundsAndObstacles(raft, [sanctuaryPlatform]);
                stepWatercraftKinematics(raft, { onSolid }, fixedDt);
                resolveWorldBoundsAndObstacles(raft, [sanctuaryPlatform]);
                clampRaftToSafeCorridor(raft);
            });

            // Assert raft did NOT launch off into sky or sink below platform
            assert.equal(raft.position.y, 1.8, 'Raft must maintain exact platform elevation');
            assert.equal(raft.velocity.y, 0, 'Vertical velocity must remain zeroed on deck');
            assert.ok(Math.abs(raft.position.z - (-120)) < 0.1, 'Raft must not drift away while docked');
            assert.ok(Math.abs(raft.position.x) < 0.1, 'Raft must not drift laterally while docked');
        });

        test('raft resting on platform remains docked across sudden dt = 2.0s spike', () => {
            const raft = createRestingRaftOnPlatform();
            const stepper = createPhysicsSubstepper();

            stepper.step(2.0, (fixedDt) => {
                const { onSolid } = resolveWorldBoundsAndObstacles(raft, [sanctuaryPlatform]);
                stepWatercraftKinematics(raft, { onSolid }, fixedDt);
                resolveWorldBoundsAndObstacles(raft, [sanctuaryPlatform]);
                clampRaftToSafeCorridor(raft);
            });

            assert.equal(raft.position.y, 1.8);
            assert.equal(raft.velocity.y, 0);
            assert.ok(Number.isFinite(raft.position.x));
            assert.ok(Number.isFinite(raft.position.y));
            assert.ok(Number.isFinite(raft.position.z));
            assert.ok(raft.position.y >= SAFE_CORRIDOR.MIN_Y && raft.position.y <= SAFE_CORRIDOR.MAX_Y);
        });

        test('raft resting on platform remains docked across sudden dt = 10.0s spike', () => {
            const raft = createRestingRaftOnPlatform();
            const stepper = createPhysicsSubstepper();

            stepper.step(10.0, (fixedDt) => {
                const { onSolid } = resolveWorldBoundsAndObstacles(raft, [sanctuaryPlatform]);
                stepWatercraftKinematics(raft, { onSolid }, fixedDt);
                resolveWorldBoundsAndObstacles(raft, [sanctuaryPlatform]);
                clampRaftToSafeCorridor(raft);
            });

            assert.equal(raft.position.y, 1.8);
            assert.equal(raft.velocity.y, 0);
            assert.ok(Math.abs(raft.position.z - (-120)) < 0.1);
        });

        test('continuous un-substepped large dt is safely rejected / clamped by tunneling guard', () => {
            const raft = createRestingRaftOnPlatform();

            // Step with tunneling guard over 2.0s
            const report = stepPhysicsWithTunnelingGuard(
                raft,
                { onSolid: true },
                {},
                2.0,
                { obstacles: [sanctuaryPlatform], maxSubsteps: 20 }
            );

            assert.ok(report.substepsTaken <= 20);
            assert.equal(raft.position.y, 1.8, 'Raft remains resting on platform');
            assert.equal(raft.velocity.y, 0);
            assert.ok(Number.isFinite(raft.position.x));
            assert.ok(Number.isFinite(raft.position.y));
            assert.ok(Number.isFinite(raft.position.z));
        });

        test('jumping off platform during lag spike does not produce NaN or infinite velocity', () => {
            const raft = createRestingRaftOnPlatform();
            const stepper = createPhysicsSubstepper();

            // Player pressed jump right as 2.0s hitch hit
            stepper.step(2.0, (fixedDt) => {
                const { onSolid } = resolveWorldBoundsAndObstacles(raft, [sanctuaryPlatform]);
                stepWatercraftKinematics(raft, { space: true, onSolid }, fixedDt);
                resolveWorldBoundsAndObstacles(raft, [sanctuaryPlatform]);
                clampRaftToSafeCorridor(raft);
            });

            assert.ok(Number.isFinite(raft.position.y));
            assert.ok(Number.isFinite(raft.velocity.y));
            assert.ok(raft.position.y <= SAFE_CORRIDOR.MAX_Y, 'Must never exceed corridor ceiling');
            assert.ok(raft.position.y >= SAFE_CORRIDOR.MIN_Y, 'Must never tunnel beneath floor');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. AI Companion Bot Crew Cohesion under Extreme dt Spikes
    // ─────────────────────────────────────────────────────────────────────────────
    describe('3. AI Companion Bot Cohesion (Never Teleport Away from Crew)', () => {
        function setupCrewState() {
            const state = createGameState({ seed: 42 });
            addPlayer(state, 'human_leader', { name: 'Captain' });
            const human = state.players.human_leader;
            human.position.x = 0;
            human.position.y = WATER_SURFACE_Y;
            human.position.z = -50;
            human.velocity = { x: 0, y: 0, z: 0 };
            human.angularVelocity = { x: 0, y: 0, z: 0 };
            human.yaw = 0;

            addPlayer(state, 'bot_1', { name: 'Rusty', isBot: true, botIndex: 0 });
            const bot1 = state.players.bot_1;
            bot1.position.x = -5;
            bot1.position.y = WATER_SURFACE_Y;
            bot1.position.z = -45;
            bot1.velocity = { x: 0, y: 0, z: 0 };
            bot1.angularVelocity = { x: 0, y: 0, z: 0 };
            bot1.yaw = 0;

            addPlayer(state, 'bot_2', { name: 'Bolt', isBot: true, botIndex: 1 });
            const bot2 = state.players.bot_2;
            bot2.position.x = 5;
            bot2.position.y = WATER_SURFACE_Y;
            bot2.position.z = -45;
            bot2.velocity = { x: 0, y: 0, z: 0 };
            bot2.angularVelocity = { x: 0, y: 0, z: 0 };
            bot2.yaw = 0;

            return { state, human, bot1, bot2 };
        }

        test('companion bots maintain tether formation across dt = 0.5s spike', () => {
            const { state, human, bot1, bot2 } = setupCrewState();
            const stepper = createPhysicsSubstepper();

            // Step with 0.5s spike
            stepper.step(0.5, (fixedDt) => {
                stepBot(state, bot1, fixedDt);
                stepBot(state, bot2, fixedDt);
                clampRaftToSafeCorridor(bot1);
                clampRaftToSafeCorridor(bot2);
            });

            // Calculate separation from leader
            const d1 = distXZ(human.position, bot1.position);
            const d2 = distXZ(human.position, bot2.position);

            assert.ok(d1 < 25.0, `Bot 1 must stay in formation (<= 25m), actual: ${d1.toFixed(2)}m`);
            assert.ok(d2 < 25.0, `Bot 2 must stay in formation (<= 25m), actual: ${d2.toFixed(2)}m`);
            assert.ok(Number.isFinite(bot1.position.x));
            assert.ok(Number.isFinite(bot1.position.z));
            assert.ok(Number.isFinite(bot2.position.x));
            assert.ok(Number.isFinite(bot2.position.z));
        });

        test('companion bots never teleport away across dt = 2.0s spike', () => {
            const { state, human, bot1, bot2 } = setupCrewState();
            const stepper = createPhysicsSubstepper();

            stepper.step(2.0, (fixedDt) => {
                stepBot(state, bot1, fixedDt);
                stepBot(state, bot2, fixedDt);
                clampRaftToSafeCorridor(bot1);
                clampRaftToSafeCorridor(bot2);
            });

            const d1 = distXZ(human.position, bot1.position);
            const d2 = distXZ(human.position, bot2.position);

            assert.ok(d1 < 30.0, `Bot 1 separation exceeded bound: ${d1.toFixed(2)}m`);
            assert.ok(d2 < 30.0, `Bot 2 separation exceeded bound: ${d2.toFixed(2)}m`);
        });

        test('companion bots never teleport away across dt = 10.0s spike', () => {
            const { state, human, bot1, bot2 } = setupCrewState();
            const stepper = createPhysicsSubstepper();

            stepper.step(10.0, (fixedDt) => {
                stepBot(state, bot1, fixedDt);
                stepBot(state, bot2, fixedDt);
                clampRaftToSafeCorridor(bot1);
                clampRaftToSafeCorridor(bot2);
            });

            const d1 = distXZ(human.position, bot1.position);
            const d2 = distXZ(human.position, bot2.position);

            assert.ok(d1 < 35.0, `Bot 1 separation exceeded bound: ${d1.toFixed(2)}m`);
            assert.ok(d2 < 35.0, `Bot 2 separation exceeded bound: ${d2.toFixed(2)}m`);
            assert.ok(bot1.position.x >= -BOT.xLimit && bot1.position.x <= BOT.xLimit);
            assert.ok(bot2.position.x >= -BOT.xLimit && bot2.position.x <= BOT.xLimit);
        });

        test('raw un-clamped dt in stepBot is bounded by safe channel limits', () => {
            const { state, human, bot1 } = setupCrewState();

            // Directly invoking stepBot with raw 5.0s (e.g. if caller forgot substepper)
            stepBot(state, bot1, 5.0);

            // Channel clamp must still hold!
            assert.ok(bot1.position.x >= -BOT.xLimit && bot1.position.x <= BOT.xLimit,
                `Bot X (${bot1.position.x}) escaped channel limits`);
            assert.ok(Number.isFinite(bot1.position.x));
            assert.ok(Number.isFinite(bot1.position.z));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. Repeated Multi-Hitch Torture Campaign (Tab Switch Thrashing)
    // ─────────────────────────────────────────────────────────────────────────────
    describe('4. Multi-Hitch Thrashing Campaign (Repeated 0.5s - 10.0s Spikes)', () => {
        test('survives 30 consecutive irregular lag spikes without state corruption or desync', () => {
            const state = createGameState({ seed: 777 });
            addPlayer(state, 'p1', { name: 'Player' });
            const human = state.players.p1;
            human.position.x = 2;
            human.position.y = WATER_SURFACE_Y;
            human.position.z = -100;
            human.velocity = { x: 0, y: 0, z: -10 };
            human.angularVelocity = { x: 0, y: 0, z: 0 };
            human.yaw = 0;

            addPlayer(state, 'b1', { name: 'Rusty', isBot: true, botIndex: 0 });
            const bot = state.players.b1;
            bot.position.x = -3;
            bot.position.y = WATER_SURFACE_Y;
            bot.position.z = -95;
            bot.velocity = { x: 0, y: 0, z: -10 };
            bot.angularVelocity = { x: 0, y: 0, z: 0 };
            bot.yaw = 0;

            const stepper = createPhysicsSubstepper();
            const spikeSeries = [
                0.5, 0.016, 2.0, 0.016, 0.016, 10.0, 0.5, 0.033, 2.0, 5.0,
                0.016, 0.5, 2.0, 0.016, 10.0, 0.5, 0.016, 0.016, 2.0, 0.5,
                10.0, 0.016, 0.5, 2.0, 0.016, 0.016, 0.5, 2.0, 5.0, 10.0
            ];

            for (let i = 0; i < spikeSeries.length; i++) {
                const dt = spikeSeries[i];
                stepper.step(dt, (fixedDt) => {
                    // Step human kinematics
                    stepWatercraftKinematics(human, { w: true }, fixedDt);
                    clampRaftToSafeCorridor(human);

                    // Step bot
                    stepBot(state, bot, fixedDt);
                    clampRaftToSafeCorridor(bot);
                });

                // Invariant checks after every frame
                assert.ok(Number.isFinite(human.position.x));
                assert.ok(Number.isFinite(human.position.y));
                assert.ok(Number.isFinite(human.position.z));
                assert.ok(Number.isFinite(bot.position.x));
                assert.ok(Number.isFinite(bot.position.y));
                assert.ok(Number.isFinite(bot.position.z));

                assert.ok(human.position.y >= SAFE_CORRIDOR.MIN_Y && human.position.y <= SAFE_CORRIDOR.MAX_Y);
                assert.ok(bot.position.y >= SAFE_CORRIDOR.MIN_Y && bot.position.y <= SAFE_CORRIDOR.MAX_Y);

                // Bot must never drift more than 40m away from the human
                const sep = distXZ(human.position, bot.position);
                assert.ok(sep <= 40.0, `Iteration ${i}: Crew separation (${sep.toFixed(2)}m) exceeded tolerance`);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. Kinematic State Interpolation Stability across Lag Spikes
    // ─────────────────────────────────────────────────────────────────────────────
    describe('5. Kinematic State Interpolation Stability', () => {
        test('interpolateKinematicState produces strictly finite values when alpha is saturated', () => {
            const prev = {
                position: { x: 0, y: 1.8, z: -100 },
                velocity: { x: 0, y: 0, z: -10 },
                yaw: 0,
            };
            const curr = {
                position: { x: 2, y: 1.8, z: -110 },
                velocity: { x: 1, y: 0, z: -12 },
                yaw: 0.2,
            };

            const out1 = interpolateKinematicState(prev, curr, 0.0);
            assert.equal(out1.position.x, 0);
            assert.equal(out1.position.z, -100);

            const out2 = interpolateKinematicState(prev, curr, 1.0);
            assert.equal(out2.position.x, 2);
            assert.equal(out2.position.z, -110);

            // Saturated / clamping alpha (> 1.0 or < 0.0)
            const outOver = interpolateKinematicState(prev, curr, 99.0);
            assert.equal(outOver.position.x, 2, 'Alpha > 1 must clamp to curr position');

            const outUnder = interpolateKinematicState(prev, curr, -5.0);
            assert.equal(outUnder.position.x, 0, 'Alpha < 0 must clamp to prev position');

            // NaN alpha defaults safely to prev
            const outNaN = interpolateKinematicState(prev, curr, NaN);
            assert.equal(outNaN.position.x, 0);
        });
    });
});
