import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    SAFE_CORRIDOR,
    clampRaftToSafeCorridor,
    sanitizeFinite,
    stepPhysicsWithTunnelingGuard,
    executeExtremeVelocityStressTest,
} from '../shared/physics-breaker.js';
import * as RaftPhysics from '../shared/raft-physics.js';
import * as RiverHazards from '../shared/river-hazards.js';

describe('physics-breaker: corridor boundary enforcement (clampRaftToSafeCorridor)', () => {
    test('keeps craft inside safe bounds unchanged', () => {
        const craft = {
            position: { x: 5, y: 10, z: -100 },
            velocity: { x: 2, y: -1, z: -15 },
        };
        const report = clampRaftToSafeCorridor(craft, 30);
        assert.equal(report.clamped, false);
        assert.equal(craft.position.x, 5);
        assert.equal(craft.position.y, 10);
        assert.equal(craft.position.z, -100);
        assert.equal(craft.velocity.x, 2);
    });

    test('clamps craft tunneling below y = -2 to exactly y = -2 and zeroes negative vy', () => {
        const craft = {
            position: { x: 0, y: -99.5, z: -50 },
            velocity: { x: 0, y: -45.0, z: 0 },
        };
        const report = clampRaftToSafeCorridor(craft, 30);
        assert.equal(report.clamped, true);
        assert.ok(report.events.includes('clamped_min_y'));
        assert.equal(craft.position.y, SAFE_CORRIDOR.MIN_Y);
        assert.equal(craft.position.y, -2.0);
        assert.equal(craft.velocity.y, 0, 'negative vertical velocity zeroed to prevent tunneling');
    });

    test('clamps craft soaring above y = 35 to exactly y = 35 and zeroes positive vy', () => {
        const craft = {
            position: { x: 0, y: 150.0, z: -50 },
            velocity: { x: 0, y: 80.0, z: 0 },
        };
        const report = clampRaftToSafeCorridor(craft, 30);
        assert.equal(report.clamped, true);
        assert.ok(report.events.includes('clamped_max_y'));
        assert.equal(craft.position.y, SAFE_CORRIDOR.MAX_Y);
        assert.equal(craft.position.y, 35.0);
        assert.equal(craft.velocity.y, 0, 'positive upward velocity zeroed to prevent runaway ascent');
    });

    test('clamps craft escaping lateral river banks [-riverWidth/2, +riverWidth/2]', () => {
        const riverWidth = 30;
        const halfW = 15;

        // Escape left (-x)
        const craftLeft = {
            position: { x: -50, y: 5, z: -100 },
            velocity: { x: -30, y: 0, z: -10 },
        };
        const reportLeft = clampRaftToSafeCorridor(craftLeft, riverWidth);
        assert.equal(reportLeft.clamped, true);
        assert.ok(reportLeft.events.includes('clamped_min_x'));
        assert.equal(craftLeft.position.x, -halfW);
        assert.equal(craftLeft.velocity.x, 0);

        // Escape right (+x)
        const craftRight = {
            position: { x: 42, y: 5, z: -100 },
            velocity: { x: 25, y: 0, z: -10 },
        };
        const reportRight = clampRaftToSafeCorridor(craftRight, riverWidth);
        assert.equal(reportRight.clamped, true);
        assert.ok(reportRight.events.includes('clamped_max_x'));
        assert.equal(craftRight.position.x, halfW);
        assert.equal(craftRight.velocity.x, 0);
    });

    test('sanitizes NaN and Infinity in position and velocity', () => {
        const craft = {
            position: { x: NaN, y: Infinity, z: -Infinity },
            velocity: { x: undefined, y: NaN, z: 50 },
            angularVelocity: { x: NaN, y: Infinity, z: -0 },
            yaw: NaN,
        };
        const report = clampRaftToSafeCorridor(craft, 30);
        assert.equal(report.nanSanitized, true);
        assert.equal(Number.isFinite(craft.position.x), true);
        assert.equal(Number.isFinite(craft.position.y), true);
        assert.equal(Number.isFinite(craft.position.z), true);
        assert.equal(Number.isFinite(craft.velocity.x), true);
        assert.equal(Number.isFinite(craft.velocity.y), true);
        assert.equal(Number.isFinite(craft.velocity.z), true);
        assert.equal(craft.yaw, 0);
    });

    test('handles missing craft position and velocity gracefully', () => {
        const craft = {};
        const report = clampRaftToSafeCorridor(craft, 30);
        assert.ok(craft.position);
        assert.ok(craft.velocity);
        assert.equal(craft.position.y, SAFE_CORRIDOR.REST_Y);
    });

    test('handles null or invalid riverWidth by defaulting to safe width', () => {
        const craft = { position: { x: 40, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
        clampRaftToSafeCorridor(craft, -5);
        assert.equal(craft.position.x, SAFE_CORRIDOR.DEFAULT_RIVER_WIDTH * 0.5);
    });
});

describe('physics-breaker: extreme velocity, frame hitch & hazard stress', () => {
    test('sub-steps large 500ms frame hitch preventing tunneling through boundaries', () => {
        // High speed airborne craft: 100 m/s moving laterally toward river boundary
        const craft = {
            id: 'speed_demon',
            position: { x: 0, y: 15.0, z: -100 },
            velocity: { x: 100.0, y: 0, z: -50.0 },
            angularVelocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
        };

        const riverWidth = 30;
        const totalDt = 0.5; // 500ms hitch

        const result = stepPhysicsWithTunnelingGuard(
            craft,
            { w: true },
            {},
            totalDt,
            { riverWidth, maxSubstepDt: 1 / 60 }
        );

        assert.ok(result.substepsTaken >= 30, 'should perform >= 30 sub-steps for 500ms dt');
        assert.ok(craft.position.x <= riverWidth * 0.5, 'x must stay within channel');
        assert.ok(craft.position.x >= -riverWidth * 0.5, 'x must stay within channel');
        assert.ok(craft.position.y >= -2.0 && craft.position.y <= 35.0, 'y must stay in safe corridor');
        assert.ok(Number.isFinite(craft.position.z));
    });

    test('subjects raft to concurrent 100 m/s Nitro Keg + Stunt Ramp + Whirlpool suction + 500ms dt', () => {
        const report = executeExtremeVelocityStressTest({
            riverWidth: 30,
            frameHitchDt: 0.5,
        });

        assert.equal(report.passed, true, 'Craft must survive extreme stress without tunneling');
        assert.equal(report.noNaN, true, 'Zero NaN coordinates after extreme impulses');
        assert.equal(report.passedBounds, true, 'Must strictly respect [-15, +15] x and [-2, 35] y');

        const { craft } = report;
        assert.ok(craft.position.y >= -2.0);
        assert.ok(craft.position.y <= 35.0);
        assert.ok(Math.abs(craft.position.x) <= 15.0);
    });

    test('multi-step stress over 50 consecutive frame hitches guarantees invariant stability', () => {
        const riverWidth = 30;
        const craft = {
            id: 'long_stress_test',
            position: { x: 0, y: 0.25, z: 0 },
            velocity: { x: 0, y: 0, z: -20 },
            angularVelocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
        };

        const layout = RiverHazards.generateRiverHazardsLayout(999, -1500, riverWidth);

        // Run 50 frames with 0.1s to 0.5s random jitter
        const rng = RaftPhysics.createRng ? RaftPhysics.createRng(42) : () => 0.5;

        for (let frame = 0; frame < 50; frame++) {
            // Inject periodic 100 m/s bursts
            if (frame % 5 === 0) {
                craft.velocity.x += (rng() - 0.5) * 150.0;
                craft.velocity.y += (rng() - 0.5) * 80.0;
                craft.velocity.z -= 100.0;
            }

            const dt = 0.05 + rng() * 0.45; // 50ms to 500ms hitches
            stepPhysicsWithTunnelingGuard(
                craft,
                { w: true, space: frame % 3 === 0 },
                layout,
                dt,
                { riverWidth }
            );

            // Invariant check on every frame
            assert.ok(craft.position.x >= -riverWidth * 0.5 && craft.position.x <= riverWidth * 0.5,
                `Frame ${frame}: x (${craft.position.x}) exceeded corridor bounds`);
            assert.ok(craft.position.y >= SAFE_CORRIDOR.MIN_Y && craft.position.y <= SAFE_CORRIDOR.MAX_Y,
                `Frame ${frame}: y (${craft.position.y}) exceeded vertical bounds`);
            assert.ok(Number.isFinite(craft.position.x));
            assert.ok(Number.isFinite(craft.position.y));
            assert.ok(Number.isFinite(craft.position.z));
            assert.ok(Number.isFinite(craft.velocity.x));
            assert.ok(Number.isFinite(craft.velocity.y));
            assert.ok(Number.isFinite(craft.velocity.z));
        }
    });

    test('raft-physics re-exports required physics functions cleanly', () => {
        assert.ok(typeof RaftPhysics.stepWatercraftKinematics === 'function');
        assert.ok(typeof RaftPhysics.resolveWorldBoundsAndObstacles === 'function');
        assert.ok(typeof RaftPhysics.driveWatercraft === 'function');
        assert.ok(typeof RaftPhysics.settleOnWater === 'function');
        assert.ok(typeof RaftPhysics.watercraftThrust === 'function');
        assert.ok(RaftPhysics.RIVER.width === 30);
    });

    test('sanitizeFinite utility helper handles all edge cases', () => {
        assert.equal(sanitizeFinite(42, 0), 42);
        assert.equal(sanitizeFinite(0, 5), 0);
        assert.equal(sanitizeFinite(NaN, 10), 10);
        assert.equal(sanitizeFinite(Infinity, -1), -1);
        assert.equal(sanitizeFinite(-Infinity, 99), 99);
        assert.equal(sanitizeFinite(undefined, 7), 7);
    });
});
