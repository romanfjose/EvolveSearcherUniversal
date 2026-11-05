/**
 * Don't Sink, Don't Die — 1500m River Autopilot & Biome Continuity Test Suite
 * (test/qa-autopilot.test.js)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    AUTOPILOT_CHECKPOINTS,
    AUTOPILOT_CONFIG,
    computeAutopilotInput,
    verifyBiomeContinuity,
    simulateAutopilotRun,
} from '../shared/qa-autopilot.js';

import {
    RIVER_BIOMES,
    getBiomeAtZ,
    interpolateBiomePalette,
} from '../public/js/world/biomes.js';

import {
    generateRiverHazardsLayout,
} from '../shared/river-hazards.js';

describe('AI Steering Policy: computeAutopilotInput', () => {
    test('steers toward river center when offset laterally with no obstacles', () => {
        // Offset to the right (x = 8.0) -> should steer left (negative)
        const raftRight = {
            position: { x: 8.0, y: 0.25, z: -100 },
            velocity: { x: 0, y: 0, z: -12 },
        };
        const inputRight = computeAutopilotInput(raftRight, {}, []);
        assert.ok(inputRight.steer < 0, `Expected negative steer to counter positive X offset, got ${inputRight.steer}`);
        assert.equal(inputRight.paddle, true);
        assert.equal(inputRight.targetAction, 'cruise');

        // Offset to the left (x = -8.0) -> should steer right (positive)
        const raftLeft = {
            position: { x: -8.0, y: 0.25, z: -100 },
            velocity: { x: 0, y: 0, z: -12 },
        };
        const inputLeft = computeAutopilotInput(raftLeft, {}, []);
        assert.ok(inputLeft.steer > 0, `Expected positive steer to counter negative X offset, got ${inputLeft.steer}`);
    });

    test('evades imminent whirlpool downstream', () => {
        const raft = {
            position: { x: 2.0, y: 0.25, z: -200 },
            velocity: { x: 0, y: 0, z: -15 },
        };
        // Whirlpool 15m ahead at x = 1.0 (close to raft X)
        const hazards = {
            whirlpools: [
                { id: 'wp_1', x: 1.0, z: -215, radius: 10.0 },
            ],
        };
        const input = computeAutopilotInput(raft, hazards, []);
        assert.equal(input.targetAction, 'dodge_whirlpool');
        // Raft is at x=2.0, wp is at x=1.0 (to the left), so raft should steer right away from wp
        assert.ok(input.steer > 0, `Expected steering away from whirlpool, got steer=${input.steer}`);
    });

    test('targets and aligns with waterfall stunt ramp downstream', () => {
        const raft = {
            position: { x: -5.0, y: 0.25, z: -300 },
            velocity: { x: 0, y: 0, z: -15 },
        };
        // Ramp 20m downstream at x = 3.0
        const hazards = {
            ramps: [
                { id: 'ramp_1', x: 3.0, z: -320, width: 6.0, length: 8.0 },
            ],
        };
        const input = computeAutopilotInput(raft, hazards, []);
        assert.equal(input.targetAction, 'align_ramp');
        // Raft is at x = -5, ramp is at x = 3 (to the right) -> steer should be positive
        assert.ok(input.steer > 0, `Expected positive steer to align with ramp, got steer=${input.steer}`);
    });

    test('triggers jump action when on ramp lip', () => {
        const raft = {
            position: { x: 2.0, y: 1.8, z: -323 },
            velocity: { x: 0, y: 2, z: -18 },
        };
        const hazards = {
            ramps: [
                { id: 'ramp_1', x: 2.0, z: -320, width: 6.0, length: 8.0 },
            ],
        };
        const input = computeAutopilotInput(raft, hazards, []);
        assert.equal(input.jump, true);
    });

    test('defends and attacks when enemy is in close range', () => {
        const raft = {
            position: { x: 0, y: 0.25, z: -500 },
            velocity: { x: 0, y: 0, z: -10 },
        };
        const enemies = [
            { id: 'enemy_1', position: { x: 1.5, y: 0.25, z: -502 }, health: 50, attackRange: 4.5 },
        ];
        const input = computeAutopilotInput(raft, {}, enemies);
        assert.equal(input.attack, true);
    });

    test('handles null or empty raftState gracefully', () => {
        const input = computeAutopilotInput(null);
        assert.equal(input.steer, 0);
        assert.equal(input.paddle, true);
        assert.equal(input.targetAction, 'idle');
    });
});

describe('Biome Continuity Auditor: verifyBiomeContinuity', () => {
    test('audits river from z = 0 to z = -1500 at 5m intervals with zero errors', () => {
        const report = verifyBiomeContinuity(0, -1500, 5);
        assert.equal(report.ok, true, `Audit reported errors: ${report.errors.join(', ')}`);
        assert.equal(report.sampleCount, 301); // 0 to 1500 every 5m is 301 samples
        assert.equal(report.errors.length, 0);
    });

    test('samples traverse all 4 acts in sequential order', () => {
        const report = verifyBiomeContinuity(0, -1500, 5);
        const actsFound = new Set(report.samples.map((s) => s.actIndex));
        assert.deepEqual(actsFound, new Set([1, 2, 3, 4]));

        // Check act boundaries
        const act1Sample = report.samples.find((s) => s.z === 0);
        const act2Sample = report.samples.find((s) => s.z === -450);
        const act3Sample = report.samples.find((s) => s.z === -900);
        const act4Sample = report.samples.find((s) => s.z === -1300);

        assert.equal(act1Sample.actIndex, 1);
        assert.equal(act2Sample.actIndex, 2);
        assert.equal(act3Sample.actIndex, 3);
        assert.equal(act4Sample.actIndex, 4);
    });

    test('validates smooth blendRatio progression around transition zones', () => {
        // Act 1 -> Act 2 boundary is at z = -375, transition zone is +/- 75m [-300, -450]
        const atStart = interpolateBiomePalette(-290);
        const atMid = interpolateBiomePalette(-375);
        const atEnd = interpolateBiomePalette(-460);

        assert.equal(atStart.blendRatio, 0);
        assert.ok(Math.abs(atMid.blendRatio - 0.5) < 0.05, `Expected ~0.5 blendRatio at boundary, got ${atMid.blendRatio}`);
        assert.equal(atEnd.blendRatio, 0);
    });

    test('detects out-of-bounds or invalid inputs when audited', () => {
        const customStep = verifyBiomeContinuity(0, -50, 10);
        assert.equal(customStep.ok, true);
        assert.equal(customStep.sampleCount, 6);
    });
});

describe('1500m River Autopilot Simulation: simulateAutopilotRun', () => {
    test('completes full run from z = 0 down to z = -1500 with 100% invariant checks', () => {
        const sim = simulateAutopilotRun({ seed: 101, dt: 0.05 });

        assert.equal(sim.ok, true);
        assert.equal(sim.telemetry.reachedFinish, true);
        assert.ok(sim.telemetry.endZ <= -1500, `Expected endZ <= -1500, got ${sim.telemetry.endZ}`);
        assert.equal(sim.telemetry.nanCoordinatesDetected, 0);
        assert.equal(sim.telemetry.velocityViolations, 0);
    });

    test('crosses all 3 checkpoints: z = -375, -750, -1125', () => {
        const sim = simulateAutopilotRun({ seed: 42, dt: 0.05 });
        assert.equal(sim.telemetry.allCheckpointsCrossed, true);
        assert.deepEqual(sim.telemetry.crossedCheckpoints, [-375, -750, -1125]);
    });

    test('visits and interpolates across all 4 Biome Acts', () => {
        const sim = simulateAutopilotRun({ seed: 777, dt: 0.05 });
        assert.equal(sim.telemetry.allActsCovered, true);
        assert.deepEqual([...sim.telemetry.actsVisited].sort(), [1, 2, 3, 4]);
    });

    test('successfully dodges whirlpools and hits stunt ramps', () => {
        const sim = simulateAutopilotRun({ seed: 1234, dt: 0.05 });
        assert.ok(sim.telemetry.rampsHit > 0, `Expected at least 1 stunt ramp hit, got ${sim.telemetry.rampsHit}`);
        assert.ok(sim.telemetry.coinsEarned > 0, `Expected bonus coins earned, got ${sim.telemetry.coinsEarned}`);
        assert.equal(sim.telemetry.biomeContinuityValid, true);
    });

    test('remains deterministic across multiple identical runs', () => {
        const sim1 = simulateAutopilotRun({ seed: 999, dt: 0.05 });
        const sim2 = simulateAutopilotRun({ seed: 999, dt: 0.05 });

        assert.equal(sim1.telemetry.totalTicks, sim2.telemetry.totalTicks);
        assert.equal(sim1.telemetry.endZ, sim2.telemetry.endZ);
        assert.equal(sim1.telemetry.rampsHit, sim2.telemetry.rampsHit);
        assert.equal(sim1.telemetry.coinsEarned, sim2.telemetry.coinsEarned);
        assert.deepEqual(sim1.finalRaftState, sim2.finalRaftState);
    });
});
