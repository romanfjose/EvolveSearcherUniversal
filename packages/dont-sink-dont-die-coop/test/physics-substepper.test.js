import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    SUBSTEPPER_DEFAULTS,
    sanitizeFrameDelta,
    lerpScalar,
    lerpVector3,
    lerpAngle,
    interpolateKinematicState,
    PhysicsSubstepper,
    createPhysicsSubstepper,
} from '../shared/physics-substepper.js';

describe('physics-substepper: Constants and defaults', () => {
    test('exposes immutable and valid defaults', () => {
        assert.equal(SUBSTEPPER_DEFAULTS.FIXED_HZ, 60);
        assert.ok(Math.abs(SUBSTEPPER_DEFAULTS.FIXED_DT - 1 / 60) < 1e-6);
        assert.equal(SUBSTEPPER_DEFAULTS.MAX_FRAME_DELTA, 0.1); // 100ms
        assert.equal(SUBSTEPPER_DEFAULTS.MAX_SUBSTEPS, 4);     // at most 4 substeps
    });

    test('creates substepper instance with default config and zeroed counters', () => {
        const stepper = createPhysicsSubstepper();
        assert.equal(stepper.fixedDt, 1 / 60);
        assert.equal(stepper.maxFrameDelta, 0.1);
        assert.equal(stepper.maxSubsteps, 4);
        assert.equal(stepper.accumulator, 0);
        assert.equal(stepper.simulatedTime, 0);
        assert.equal(stepper.totalStepsExecuted, 0);
        assert.equal(stepper.totalFramesProcessed, 0);
    });

    test('allows customizing fixedDt, maxFrameDelta and maxSubsteps', () => {
        const custom = new PhysicsSubstepper({
            fixedDt: 0.02,
            maxFrameDelta: 0.08,
            maxSubsteps: 3,
            drainExcess: false,
        });
        assert.equal(custom.fixedDt, 0.02);
        assert.equal(custom.maxFrameDelta, 0.08);
        assert.equal(custom.maxSubsteps, 3);
        assert.equal(custom.drainExcess, false);
    });
});

describe('physics-substepper: sanitizeFrameDelta', () => {
    test('passes through normal delta times unchanged', () => {
        assert.equal(sanitizeFrameDelta(0.016), 0.016);
        assert.equal(sanitizeFrameDelta(0.033), 0.033);
        assert.equal(sanitizeFrameDelta(0.08), 0.08);
    });

    test('clamps delta time exceeding maxFrameDelta (100ms) down to 100ms', () => {
        assert.equal(sanitizeFrameDelta(0.15), 0.1);
        assert.equal(sanitizeFrameDelta(0.5), 0.1);
        assert.equal(sanitizeFrameDelta(2.0), 0.1);
        assert.equal(sanitizeFrameDelta(10.0), 0.1);
    });

    test('sanitizes non-numeric, negative, 0, NaN, and Infinity deltas to 0', () => {
        assert.equal(sanitizeFrameDelta(0), 0);
        assert.equal(sanitizeFrameDelta(-0.016), 0);
        assert.equal(sanitizeFrameDelta(-100), 0);
        assert.equal(sanitizeFrameDelta(NaN), 0);
        assert.equal(sanitizeFrameDelta(Infinity), 0);
        assert.equal(sanitizeFrameDelta(-Infinity), 0);
        assert.equal(sanitizeFrameDelta(null), 0);
        assert.equal(sanitizeFrameDelta(undefined), 0);
        assert.equal(sanitizeFrameDelta('0.05'), 0);
    });
});

describe('physics-substepper: Standard 60Hz loop simulation', () => {
    test('executes 1 substep per frame at exact 60Hz (16.666ms delta)', () => {
        const stepper = new PhysicsSubstepper();
        const dt = 1 / 60;
        let stepCount = 0;

        for (let i = 0; i < 60; i++) {
            const report = stepper.step(dt, () => {
                stepCount++;
            });
            assert.equal(report.substeps, 1);
            assert.equal(report.clampedDelta, dt);
            assert.equal(report.spiralGuardTripped, false);
        }

        assert.equal(stepCount, 60);
        assert.equal(stepper.totalStepsExecuted, 60);
        assert.equal(stepper.totalFramesProcessed, 60);
        assert.ok(Math.abs(stepper.simulatedTime - 1.0) < 1e-5);
    });

    test('computes exact alpha interpolation weight at 60Hz', () => {
        const stepper = new PhysicsSubstepper();
        const dt = 1 / 60;

        // Exactly one step consumed -> accumulator resets to ~0 -> alpha ~ 0
        const report = stepper.step(dt);
        assert.equal(report.substeps, 1);
        assert.ok(report.alpha < 1e-4);
        assert.equal(stepper.getAlpha(), report.alpha);
    });
});

describe('physics-substepper: High-refresh monitors (144Hz & 240Hz)', () => {
    test('accumulates time across multiple frames at 144Hz (~6.94ms per frame)', () => {
        const stepper = new PhysicsSubstepper();
        const dt144 = 1 / 144; // ~0.006944s
        let totalSteps = 0;
        const alphas = [];

        // 144 frames should produce approximately 60 physics steps
        for (let f = 0; f < 144; f++) {
            const res = stepper.step(dt144, () => {
                totalSteps++;
            });
            alphas.push(res.alpha);
            assert.ok(res.alpha >= 0.0 && res.alpha <= 1.0, `alpha ${res.alpha} out of range [0, 1]`);
            assert.ok(res.substeps <= 1, '144Hz frame should trigger at most 1 substep');
        }

        assert.equal(totalSteps, 60, '144Hz for 1 second must produce exactly 60 fixed physics steps');
        assert.equal(stepper.totalStepsExecuted, 60);
        assert.equal(stepper.totalFramesProcessed, 144);
    });

    test('accumulates time cleanly at 240Hz (~4.16ms per frame)', () => {
        const stepper = new PhysicsSubstepper();
        const dt240 = 1 / 240; // ~0.004166s
        let totalSteps = 0;

        for (let f = 0; f < 240; f++) {
            stepper.step(dt240, () => {
                totalSteps++;
            });
            const alpha = stepper.getAlpha();
            assert.ok(alpha >= 0.0 && alpha <= 1.0);
        }

        assert.equal(totalSteps, 60, '240Hz for 1 second must produce exactly 60 fixed physics steps');
        assert.equal(stepper.totalStepsExecuted, 60);
        assert.equal(stepper.totalFramesProcessed, 240);
    });
});

describe('physics-substepper: Spiral-of-Death Guard (Tab Switches & GC Pauses)', () => {
    test('clamps tab switch or massive lag hitch (e.g. 5000ms) to 100ms maxFrameDelta', () => {
        const stepper = new PhysicsSubstepper();
        let executedSteps = 0;

        // User switched tabs for 5 seconds
        const report = stepper.step(5.0, () => {
            executedSteps++;
        });

        assert.equal(report.rawDelta, 5.0);
        assert.equal(report.clampedDelta, 0.1); // Clamped strictly to 100ms
        assert.equal(report.substeps, 4, 'Runs at most 4 substeps per frame');
        assert.equal(executedSteps, 4);

        const diag = stepper.getDiagnostics();
        assert.equal(diag.clampedDeltaCount, 1);
        assert.ok(diag.spiralGuardTrips >= 1, 'Spiral guard should trip and discard excess time');
        assert.ok(diag.totalDiscardedTime > 0, 'Excess time over 4 substeps should be discarded');
    });

    test('strictly enforces at most 4 substeps even under continuous 100ms frames', () => {
        const stepper = new PhysicsSubstepper();
        const dtHitch = 0.1; // 100ms hitch on each frame
        let totalSteps = 0;

        for (let frame = 0; frame < 5; frame++) {
            const report = stepper.step(dtHitch, () => {
                totalSteps++;
            });
            assert.ok(report.substeps <= 4, `Frame ${frame} ran ${report.substeps} substeps, max is 4`);
            assert.ok(report.alpha >= 0.0 && report.alpha <= 1.0);
        }

        assert.equal(totalSteps, 20); // 5 frames * 4 substeps
    });

    test('drainExcess=false option retains unsimulated time in accumulator up to capacity', () => {
        const stepper = new PhysicsSubstepper({ drainExcess: false });
        // Step with 0.08s (4.8 substeps worth)
        const report = stepper.step(0.08);
        assert.equal(report.substeps, 4);
        assert.equal(report.spiralGuardTripped, false);
        assert.ok(stepper.accumulator > 0, 'Remainder kept in accumulator');
        assert.ok(stepper.accumulator < stepper.fixedDt);
    });

    test('drain() zeroes out accumulated time and resets alpha', () => {
        const stepper = new PhysicsSubstepper();
        stepper.step(0.01); // 10ms (< 16.6ms) -> no step, accumulator = 0.01
        assert.ok(stepper.accumulator > 0);
        assert.ok(stepper.getAlpha() > 0);

        const drained = stepper.drain();
        assert.ok(Math.abs(drained - 0.01) < 1e-6);
        assert.equal(stepper.accumulator, 0);
        assert.equal(stepper.getAlpha(), 0);
    });

    test('reset() clears all metrics and state to pristine', () => {
        const stepper = new PhysicsSubstepper();
        stepper.step(1.0); // Spike
        assert.ok(stepper.totalStepsExecuted > 0);
        assert.ok(stepper.spiralGuardTrips > 0);

        stepper.reset();
        const diag = stepper.getDiagnostics();
        assert.equal(diag.accumulator, 0);
        assert.equal(diag.simulatedTime, 0);
        assert.equal(diag.totalStepsExecuted, 0);
        assert.equal(diag.totalFramesProcessed, 0);
        assert.equal(diag.clampedDeltaCount, 0);
        assert.equal(diag.spiralGuardTrips, 0);
        assert.equal(diag.totalDiscardedTime, 0);
        assert.equal(diag.lastStepCount, 0);
        assert.equal(diag.lastAlpha, 0);
    });
});

describe('physics-substepper: Interpolation Helpers (lerpScalar, lerpVector3, lerpAngle, interpolateKinematicState)', () => {
    test('lerpScalar blends values with clamped alpha', () => {
        assert.equal(lerpScalar(10, 20, 0.0), 10);
        assert.equal(lerpScalar(10, 20, 0.5), 15);
        assert.equal(lerpScalar(10, 20, 1.0), 20);
        // Clamping check
        assert.equal(lerpScalar(10, 20, -0.5), 10);
        assert.equal(lerpScalar(10, 20, 1.5), 20);
        // Non-finite handling
        assert.equal(lerpScalar(NaN, 20, 0.5), 10);
        assert.equal(lerpScalar(10, NaN, 0.5), 5);
        assert.equal(lerpScalar(10, 20, NaN), 10);
    });

    test('lerpVector3 smoothly blends 3D vectors and handles target mutation', () => {
        const v1 = { x: 0, y: 10, z: -100 };
        const v2 = { x: 10, y: 30, z: -50 };

        const mid = lerpVector3(v1, v2, 0.5);
        assert.deepEqual(mid, { x: 5, y: 20, z: -75 });

        const target = { x: 0, y: 0, z: 0 };
        const returned = lerpVector3(v1, v2, 0.25, target);
        assert.equal(returned, target);
        assert.equal(target.x, 2.5);
        assert.equal(target.y, 15);
        assert.equal(target.z, -87.5);

        // Defensive checks for corrupt / missing vector components
        const corrupted = lerpVector3(null, { x: NaN, y: 5, z: 10 }, 0.5);
        assert.equal(corrupted.x, 0);
        assert.equal(corrupted.y, 2.5);
        assert.equal(corrupted.z, 5);
    });

    test('lerpAngle interpolates along shortest arc and wraps across -PI / +PI boundary', () => {
        // Direct interpolation
        const a1 = 0;
        const a2 = Math.PI / 2;
        assert.ok(Math.abs(lerpAngle(a1, a2, 0.5) - Math.PI / 4) < 1e-5);

        // Shortest arc wrapping across boundary (350 deg to 10 deg)
        const rad350 = (350 * Math.PI) / 180; // ~ 6.108
        const rad10 = (10 * Math.PI) / 180;   // ~ 0.174
        const midAngle = lerpAngle(rad350, rad10, 0.5);

        // Difference is +20 degrees across zero -> mid point should be 360/0 deg
        const normalizedMid = (midAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        assert.ok(normalizedMid < 1e-4 || Math.abs(normalizedMid - 2 * Math.PI) < 1e-4);

        // Non-finite protection
        assert.equal(lerpAngle(NaN, Math.PI, 0.5), Math.PI / 2);
    });

    test('interpolateKinematicState interpolates position, velocity, and yaw coherently', () => {
        const prev = {
            position: { x: 0, y: 0, z: -10 },
            velocity: { x: 0, y: 0, z: -20 },
            yaw: 0,
        };
        const curr = {
            position: { x: 10, y: 4, z: -30 },
            velocity: { x: 5, y: 2, z: -25 },
            yaw: 0.4,
        };

        const result = interpolateKinematicState(prev, curr, 0.5);
        assert.deepEqual(result.position, { x: 5, y: 2, z: -20 });
        assert.deepEqual(result.velocity, { x: 2.5, y: 1, z: -22.5 });
        assert.ok(Math.abs(result.yaw - 0.2) < 1e-5);

        // Target mutation
        const target = {};
        interpolateKinematicState(prev, curr, 1.0, target);
        assert.deepEqual(target.position, curr.position);
        assert.deepEqual(target.velocity, curr.velocity);
        assert.ok(Math.abs(target.yaw - curr.yaw) < 1e-5);
    });
});

describe('physics-substepper: Edge cases & callback robustness', () => {
    test('handles zero delta gracefully without advancing steps', () => {
        const stepper = new PhysicsSubstepper();
        let stepped = false;
        const res = stepper.step(0, () => {
            stepped = true;
        });

        assert.equal(stepped, false);
        assert.equal(res.substeps, 0);
        assert.equal(res.alpha, 0);
        assert.equal(stepper.totalStepsExecuted, 0);
    });

    test('provides substep index and total substeps in callback arguments', () => {
        const stepper = new PhysicsSubstepper();
        const callArgs = [];

        // 3 fixed steps worth of delta: 3 * (1/60) = 0.05s
        stepper.step(3 / 60, (dt, currentSubstep, maxSubsteps) => {
            callArgs.push({ dt, currentSubstep, maxSubsteps });
        });

        assert.equal(callArgs.length, 3);
        assert.deepEqual(callArgs[0], { dt: 1 / 60, currentSubstep: 1, maxSubsteps: 4 });
        assert.deepEqual(callArgs[1], { dt: 1 / 60, currentSubstep: 2, maxSubsteps: 4 });
        assert.deepEqual(callArgs[2], { dt: 1 / 60, currentSubstep: 3, maxSubsteps: 4 });
    });

    test('works smoothly with null or undefined callback', () => {
        const stepper = new PhysicsSubstepper();
        const res = stepper.step(1 / 60);
        assert.equal(res.substeps, 1);
        assert.equal(stepper.totalStepsExecuted, 1);
    });
});
