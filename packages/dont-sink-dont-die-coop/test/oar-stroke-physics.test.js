import test from 'node:test';
import assert from 'node:assert/strict';
import {
    OAR_STROKE_CONFIG,
    createOarStrokeState,
    triggerRhythmicOarStroke,
    stepRhythmicOarStroke,
    computeRowingCameraImpulse,
    evaluateSideAwareOarTarget,
} from '../shared/oar-stroke-physics.js';

test('OAR_STROKE_CONFIG deterministic values and immutability', () => {
    assert.equal(OAR_STROKE_CONFIG.duration, 0.84);
    assert.equal(OAR_STROKE_CONFIG.pullStart, 0.05);
    assert.equal(OAR_STROKE_CONFIG.pullEnd, 0.62);
    assert.equal(OAR_STROKE_CONFIG.cancelThreshold, 0.48);
    assert.equal(OAR_STROKE_CONFIG.chokeBrakeFactor, 0.68);
    assert.equal(OAR_STROKE_CONFIG.waterGlideDrag, 1.35);
    assert.equal(OAR_STROKE_CONFIG.idleRiverDrift, -0.95);

    // Verify Object.isFrozen
    assert.ok(Object.isFrozen(OAR_STROKE_CONFIG));
    assert.throws(() => {
        OAR_STROKE_CONFIG.duration = 1.0;
    });
});

test('createOarStrokeState initializes neutral state', () => {
    const state = createOarStrokeState();
    assert.deepEqual(state, {
        active: false,
        elapsed: 0,
        chokedTimer: 0,
        strokeCount: 0,
        chokedCount: 0,
        lastPowerRatio: 0,
    });
});

test('triggerRhythmicOarStroke handles motor or solid surfaces', () => {
    const state = createOarStrokeState();
    const vel = { x: 5, y: 0, z: -10 };

    // With motor upgrade
    const resMotor = triggerRhythmicOarStroke(state, vel, { hasMotor: true });
    assert.equal(resMotor.triggered, false);
    assert.equal(resMotor.choked, false);
    assert.equal(resMotor.reason, 'motor_or_solid');
    assert.equal(state.active, false);

    // On solid dock/platform
    const resSolid = triggerRhythmicOarStroke(state, vel, { onSolid: true });
    assert.equal(resSolid.triggered, false);
    assert.equal(resSolid.choked, false);
    assert.equal(resSolid.reason, 'motor_or_solid');
    assert.equal(state.active, false);
});

test('triggerRhythmicOarStroke cleanly triggers when idle', () => {
    const state = createOarStrokeState();
    const vel = { x: 0, y: 0, z: -2 };

    const res = triggerRhythmicOarStroke(state, vel);
    assert.equal(res.triggered, true);
    assert.equal(res.choked, false);
    assert.equal(state.active, true);
    assert.equal(state.elapsed, 0);
    assert.equal(state.chokedTimer, 0);
    assert.equal(state.strokeCount, 1);
    assert.equal(state.lastPowerRatio, 1.0);
});

test('triggerRhythmicOarStroke fast-press choke penalty applies braking and timer lockout', () => {
    const state = createOarStrokeState();
    const vel = { x: 10.0, y: 0, z: -20.0 };

    // Trigger stroke cleanly
    triggerRhythmicOarStroke(state, vel);
    assert.equal(state.active, true);

    // Advance stroke slightly into power pull (elapsed = 0.20 < cancelThreshold 0.48)
    stepRhythmicOarStroke(state, 0.20);
    assert.ok(state.elapsed < OAR_STROKE_CONFIG.cancelThreshold);

    // Re-trigger before cancelThreshold -> fast press choke!
    const resChoke = triggerRhythmicOarStroke(state, vel);
    assert.equal(resChoke.triggered, false);
    assert.equal(resChoke.choked, true);
    assert.equal(resChoke.reason, 'fast_press_cancelled');

    // Choke metrics updated
    assert.equal(state.chokedCount, 1);
    assert.equal(state.chokedTimer, 0.26);
    assert.equal(state.elapsed, 0);
    assert.ok(Math.abs(state.lastPowerRatio - (0.20 / OAR_STROKE_CONFIG.pullEnd)) < 1e-4);

    // Craft horizontal velocity dampened by chokeBrakeFactor (0.68)
    assert.ok(Math.abs(vel.x - (10.0 * 0.68)) < 1e-5);
    assert.ok(Math.abs(vel.z - (-20.0 * 0.68)) < 1e-5);
});

test('triggerRhythmicOarStroke allows re-stroke after cancelThreshold without choke', () => {
    const state = createOarStrokeState();
    const vel = { x: 5, y: 0, z: -10 };

    triggerRhythmicOarStroke(state, vel);

    // Step beyond cancelThreshold (0.48s)
    stepRhythmicOarStroke(state, 0.52);
    assert.ok(state.elapsed >= OAR_STROKE_CONFIG.cancelThreshold);

    // Re-triggering now starts a clean next stroke without choking
    const res = triggerRhythmicOarStroke(state, vel);
    assert.equal(res.triggered, true);
    assert.equal(res.choked, false);
    assert.equal(state.strokeCount, 2);
    assert.equal(state.chokedCount, 0);
    assert.equal(state.elapsed, 0);
});

test('stepRhythmicOarStroke lifecycle through catch, power pull, recovery, and idle completion', () => {
    const state = createOarStrokeState();
    triggerRhythmicOarStroke(state, { x: 0, z: 0 });

    // 1. Catch phase (0 < elapsed < pullStart = 0.05)
    const step1 = stepRhythmicOarStroke(state, 0.03);
    assert.equal(step1.phase, 'catch');
    assert.equal(step1.isCatch, true);
    assert.equal(step1.isPowerPull, false);
    assert.equal(step1.isRecovery, false);
    assert.equal(step1.pullCurve, 0);

    // 2. Power pull phase (pullStart <= elapsed <= pullEnd)
    // Step forward into peak power pull (u ~ 0.5)
    // pullStart = 0.05, pullEnd = 0.62. Midpoint = 0.05 + 0.57/2 = 0.335
    const dtToMid = 0.335 - 0.03;
    const step2 = stepRhythmicOarStroke(state, dtToMid);
    assert.equal(step2.phase, 'power_pull');
    assert.equal(step2.isCatch, false);
    assert.equal(step2.isPowerPull, true);
    assert.equal(step2.isRecovery, false);
    assert.ok(step2.pullCurve > 0.95); // Peak of sin curve ~ 1.0

    // 3. Recovery phase (pullEnd < elapsed < duration = 0.84)
    // Step to elapsed = 0.70
    const step3 = stepRhythmicOarStroke(state, 0.70 - state.elapsed);
    assert.equal(step3.phase, 'recovery');
    assert.equal(step3.isCatch, false);
    assert.equal(step3.isPowerPull, false);
    assert.equal(step3.isRecovery, true);
    assert.equal(step3.pullCurve, 0);

    // 4. Complete stroke (elapsed >= duration = 0.84)
    const step4 = stepRhythmicOarStroke(state, 0.20);
    assert.equal(step4.phase, 'idle');
    assert.equal(step4.isCatch, false);
    assert.equal(step4.isPowerPull, false);
    assert.equal(step4.isRecovery, false);
    assert.equal(state.active, false);
    assert.equal(state.elapsed, 0);
});

test('stepRhythmicOarStroke suppresses pullCurve when choked', () => {
    const state = createOarStrokeState();
    state.active = true;
    state.elapsed = 0.20;
    state.chokedTimer = 0.26; // Choked lockout active

    const step = stepRhythmicOarStroke(state, 0.05);
    assert.equal(step.isChoked, true);
    assert.equal(step.pullCurve, 0);
    assert.ok(state.chokedTimer < 0.26);
});

test('computeRowingCameraImpulse produces subtle over-the-shoulder chase feel without NaNs', () => {
    const state = createOarStrokeState();

    // Neutral / Idle
    const idleImpulse = computeRowingCameraImpulse(state, 6.0);
    assert.equal(idleImpulse.pitchOffset, 0);
    assert.equal(idleImpulse.fovBoost, 0);
    assert.equal(idleImpulse.distanceOffset, 0);

    // Catch phase forward nod
    state.active = true;
    state.elapsed = 0.025; // Mid-catch
    const catchImpulse = computeRowingCameraImpulse(state, 8.0);
    assert.ok(catchImpulse.pitchOffset > 0, 'Catch produces forward pitch nod');
    assert.ok(Number.isFinite(catchImpulse.fovBoost));

    // Power pull FOV swell (+0.8..1.8 deg)
    state.elapsed = 0.335; // Peak pull
    const powerImpulse = computeRowingCameraImpulse(state, 10.0);
    assert.ok(powerImpulse.fovBoost >= 0.8 && powerImpulse.fovBoost <= 1.8, `FOV swell in +0.8..1.8 deg range, got ${powerImpulse.fovBoost}`);
    assert.ok(powerImpulse.pitchOffset < 0, 'Thrust pulls camera pitch slightly back');
    assert.ok(powerImpulse.distanceOffset > 0, 'Raft surges ahead relative to camera');

    // Choked stroke camera jolt
    state.chokedTimer = 0.26;
    const chokedImpulse = computeRowingCameraImpulse(state, 6.0);
    assert.ok(chokedImpulse.pitchOffset < 0, 'Choked stroke causes sudden pitch jolt');
    assert.ok(chokedImpulse.fovBoost < 0, 'Choked stroke causes FOV contraction');
});

test('computeRowingCameraImpulse defends against invalid or NaN/Infinity inputs', () => {
    assert.deepEqual(computeRowingCameraImpulse(null, NaN), { pitchOffset: 0, fovBoost: 0, distanceOffset: 0 });
    assert.deepEqual(computeRowingCameraImpulse({}, Infinity), { pitchOffset: 0, fovBoost: 0, distanceOffset: 0 });

    const state = { active: true, elapsed: NaN, chokedTimer: NaN };
    const res = computeRowingCameraImpulse(state, { x: NaN, z: NaN });
    assert.ok(Number.isFinite(res.pitchOffset));
    assert.ok(Number.isFinite(res.fovBoost));
    assert.ok(Number.isFinite(res.distanceOffset));
});

test('evaluateSideAwareOarTarget correctly identifies port vs starboard enemy positions', () => {
    // Raft at origin (0, 0, 0), facing downriver along -Z (yaw = 0)
    // Starboard (+X): (cos(0), -sin(0)) = (1, 0)
    const craftPos = { x: 0, y: 0.25, z: 0 };
    const craftYaw = 0;

    // 1. Enemy to the starboard (right / +X)
    const enemiesRight = [
        { id: 'alien1', position: { x: 3.5, y: 0.25, z: -1.0 }, health: 40 },
    ];
    assert.equal(evaluateSideAwareOarTarget(craftPos, craftYaw, enemiesRight), 'right');

    // 2. Enemy to the port (left / -X)
    const enemiesLeft = [
        { id: 'alien2', position: { x: -3.5, y: 0.25, z: -1.0 }, health: 40 },
    ];
    assert.equal(evaluateSideAwareOarTarget(craftPos, craftYaw, enemiesLeft), 'left');

    // 3. Dead enemy is ignored
    const enemiesDead = [
        { id: 'dead1', position: { x: -3.5, y: 0.25, z: -1.0 }, health: 0 },
    ];
    assert.equal(evaluateSideAwareOarTarget(craftPos, craftYaw, enemiesDead, 'right'), 'right');

    // 4. Enemy beyond reach distance is ignored
    const enemiesFar = [
        { id: 'far1', position: { x: -25.0, y: 0.25, z: 0 }, health: 50 },
    ];
    assert.equal(evaluateSideAwareOarTarget(craftPos, craftYaw, enemiesFar, 'right'), 'right');

    // 5. Works with Map input
    const enemyMap = new Map();
    enemyMap.set('wiz', { position: { x: -4.0, z: -2.0 }, health: 25 });
    assert.equal(evaluateSideAwareOarTarget(craftPos, craftYaw, enemyMap), 'left');

    // 6. Works with Object dictionary
    const enemyDict = {
        worm: { position: { x: 4.0, z: -2.0 }, health: 100 },
    };
    assert.equal(evaluateSideAwareOarTarget(craftPos, craftYaw, enemyDict), 'right');

    // 7. Rotated raft yaw: heading towards +X (yaw = -PI/2)
    // starboard vector: (cos(-PI/2), -sin(-PI/2)) = (0, 1) -> +Z is starboard
    const rotatedYaw = -Math.PI / 2;
    const enemiesRotated = [
        { position: { x: 0, z: 3.0 }, health: 50 }, // in +Z -> starboard -> 'right'
    ];
    assert.equal(evaluateSideAwareOarTarget(craftPos, rotatedYaw, enemiesRotated), 'right');
});
