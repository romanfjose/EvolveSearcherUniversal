import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    HITSTOP_RAGDOLL_CONSTANTS,
    clamp,
    lerp,
    vec3,
    vec3Copy,
    vec3Add,
    vec3Sub,
    vec3Scale,
    vec3Length,
    vec3Normalize,
    createHitStopState,
    triggerHitStop,
    stepHitStop,
    createFovPunchState,
    triggerFovPunch,
    evaluateFovPunchDelta,
    stepFovPunch,
    calculateRagdollSplashTime,
    calculateRagdollSplashdown,
    sampleRagdollTrajectory,
    createRagdollInstance,
    stepRagdollInstance,
    createArcadeHitstopRagdollManager,
} from '../shared/hitstop-ragdoll.js';

describe('Arcade Hit-Stop Freeze Controller', () => {
    it('initializes with default inactive state and timescale 1.0', () => {
        const state = createHitStopState();
        assert.equal(state.active, false);
        assert.equal(state.timescale, 1.0);
        assert.equal(state.elapsed, 0);
        assert.equal(state.duration, 0.045);
        assert.equal(state.totalFreezesTriggered, 0);
    });

    it('triggers a 45ms freeze on War Mallet crit', () => {
        const state = createHitStopState();
        triggerHitStop(state, HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TRIGGERS.WAR_MALLET_CRIT);

        assert.equal(state.active, true);
        assert.equal(state.triggerReason, 'war_mallet_crit');
        assert.equal(state.timescale, 0.0);
        assert.equal(state.duration, 0.045);
        assert.equal(state.totalFreezesTriggered, 1);
    });

    it('triggers a 45ms freeze on Perfect Parry', () => {
        const state = createHitStopState();
        triggerHitStop(state, HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TRIGGERS.PERFECT_PARRY);

        assert.equal(state.active, true);
        assert.equal(state.triggerReason, 'perfect_parry');
        assert.equal(state.timescale, 0.0);
        assert.equal(state.duration, 0.045);
    });

    it('holds timescale at 0.0 and freezes effectiveDt during freeze duration', () => {
        const state = createHitStopState();
        triggerHitStop(state, 'war_mallet_crit');

        // Step 20ms in (less than 45ms)
        const step1 = stepHitStop(state, 0.020);
        assert.equal(step1.active, true);
        assert.equal(step1.timescale, 0.0);
        assert.equal(step1.effectiveDt, 0.0);
        assert.equal(step1.justCompleted, false);

        // Step another 20ms in (40ms total, still < 45ms)
        const step2 = stepHitStop(state, 0.020);
        assert.equal(step2.active, true);
        assert.equal(step2.timescale, 0.0);
        assert.equal(step2.effectiveDt, 0.0);

        // Step another 10ms (50ms total >= 45ms) -> recovers to normal timescale with leftover dt
        const step3 = stepHitStop(state, 0.010);
        assert.equal(step3.active, false);
        assert.equal(step3.timescale, 1.0);
        assert.equal(step3.justCompleted, true);
        assert.ok(Math.abs(step3.effectiveDt - 0.005) < 1e-6, 'overflow dt should be returned');
    });

    it('returns full realDt when not active', () => {
        const state = createHitStopState();
        const res = stepHitStop(state, 0.016);
        assert.equal(res.active, false);
        assert.equal(res.timescale, 1.0);
        assert.equal(res.effectiveDt, 0.016);
    });
});

describe('120ms Camera FOV Micro-Punch', () => {
    it('initializes with base FOV (default 65.0)', () => {
        const state = createFovPunchState(65.0);
        assert.equal(state.active, false);
        assert.equal(state.baseFov, 65.0);
        assert.equal(state.currentFov, 65.0);
        assert.equal(state.fovDelta, 0);
        assert.equal(state.duration, 0.12); // 120ms
    });

    it('triggers punch and resets elapsed time', () => {
        const state = createFovPunchState(65.0);
        triggerFovPunch(state, 1.0);
        assert.equal(state.active, true);
        assert.equal(state.elapsed, 0);
        assert.equal(state.intensity, 1.0);
    });

    it('evaluates punch delta curve smoothly peaking around 25ms and decaying to 0 by 120ms', () => {
        const duration = 0.12;
        const maxDelta = -4.5;

        const atStart = evaluateFovPunchDelta(0.0, duration, maxDelta);
        assert.equal(atStart, 0);

        const atPeak = evaluateFovPunchDelta(0.025, duration, maxDelta);
        assert.ok(Math.abs(atPeak - maxDelta) < 0.01, `at 25ms peak, delta (${atPeak}) should be approx ${maxDelta}`);

        const midDecay = evaluateFovPunchDelta(0.07, duration, maxDelta);
        assert.ok(midDecay < 0 && midDecay > maxDelta, 'mid decay should be recovering towards 0');

        const atEnd = evaluateFovPunchDelta(0.12, duration, maxDelta);
        assert.equal(atEnd, 0);

        const pastEnd = evaluateFovPunchDelta(0.15, duration, maxDelta);
        assert.equal(pastEnd, 0);
    });

    it('steps through 120ms lifecycle and restores base FOV', () => {
        const state = createFovPunchState(70.0);
        triggerFovPunch(state, 1.0);

        // Step 25ms -> near peak punch
        const stepPeak = stepFovPunch(state, 0.025);
        assert.equal(stepPeak.active, true);
        assert.ok(stepPeak.fovDelta < -4.0, `FOV delta at peak should be punchy: ${stepPeak.fovDelta}`);
        assert.ok(stepPeak.currentFov < 66.0, `Current FOV should zoom in: ${stepPeak.currentFov}`);

        // Step past 120ms
        const stepEnd = stepFovPunch(state, 0.10);
        assert.equal(stepEnd.active, false);
        assert.equal(stepEnd.currentFov, 70.0);
        assert.equal(stepEnd.fovDelta, 0);
    });
});

describe('3D Ragdoll Parabolic Arc Trajectory & 1080° Tumble Math', () => {
    it('calculates analytical water splashdown flight time correctly', () => {
        const y0 = 1.0;
        const vy0 = 14.0;
        const g = 24.0;
        const waterY = 0.25;

        const t = calculateRagdollSplashTime(y0, vy0, g, waterY);
        // y(t) = 1.0 + 14 * t - 12 * t^2 = 0.25 -> 12 t^2 - 14 t - 0.75 = 0
        // (14 + sqrt(196 - 4 * 12 * (-0.75))) / 24 = (14 + sqrt(196 + 36)) / 24 = (14 + sqrt(232)) / 24
        // sqrt(232) approx 15.2315 -> (14 + 15.2315)/24 = 1.21798
        assert.ok(t > 1.2 && t < 1.25, `Expected flight time around 1.22s, got ${t}`);

        const ySplash = y0 + vy0 * t - 0.5 * g * t * t;
        assert.ok(Math.abs(ySplash - waterY) < 1e-4, `Altitude at splash time must match waterY: ${ySplash}`);
    });

    it('computes exact water splashdown coordinate and velocity vector', () => {
        const origin = vec3(0, 1.0, -100);
        const velocity = vec3(10, 14, -15);
        const splashData = calculateRagdollSplashdown(origin, velocity);

        assert.equal(splashData.splashPosition.y, HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.WATER_SURFACE_Y);
        assert.ok(splashData.splashPosition.z < -100, 'Ragdoll should have traveled downriver');
        assert.ok(splashData.splashPosition.x > 0, 'Ragdoll should have traveled in +X direction');
        assert.ok(splashData.impactVelocity.y < 0, 'Impact vertical velocity must be downward');
        assert.ok(splashData.flightDuration > 0.5, 'Flight duration must be positive');
    });

    it('samples trajectory position, velocity, and 1080° tumble across flight', () => {
        const origin = vec3(0, 1.0, -50);
        const velocity = vec3(0, 14, -20);
        const totalDuration = calculateRagdollSplashTime(origin.y, velocity.y);

        // At t = 0
        const sampleStart = sampleRagdollTrajectory(origin, velocity, 0, totalDuration);
        assert.equal(sampleStart.position.x, 0);
        assert.equal(sampleStart.position.y, 1.0);
        assert.equal(sampleStart.tumbleDegrees, 0);
        assert.equal(sampleStart.tumbleRadians, 0);

        // At t = apex (vy = 0 -> t = 14 / 24 = 0.5833s)
        const tApex = 14 / 24;
        const sampleApex = sampleRagdollTrajectory(origin, velocity, tApex, totalDuration);
        assert.ok(sampleApex.position.y > 4.5, `Apex altitude should be high: ${sampleApex.position.y}`);
        assert.ok(Math.abs(sampleApex.velocity.y) < 0.1, `Vertical velocity at apex should be near 0: ${sampleApex.velocity.y}`);

        // At t = totalDuration (water splash)
        const sampleSplash = sampleRagdollTrajectory(origin, velocity, totalDuration, totalDuration);
        assert.ok(Math.abs(sampleSplash.position.y - 0.25) < 0.05, `At splash, Y should be at waterline: ${sampleSplash.position.y}`);
        assert.equal(sampleSplash.tumbleDegrees, 1080, 'Must complete full 1080-degree tumble on splashdown');
        assert.ok(Math.abs(sampleSplash.tumbleRadians - 6 * Math.PI) < 1e-4, 'Must complete 6*PI radians tumble');
    });
});

describe('Active Ragdoll Instance Lifecycle', () => {
    it('creates ragdoll instance with calculated landing and tumble parameters', () => {
        const ragdoll = createRagdollInstance({
            enemyId: 'whiteGuy_01',
            enemyType: 'whiteGuy',
            origin: vec3(5, 1.5, -30),
            knockbackDir: vec3(0.7071, 0, -0.7071),
            verticalSpeed: 16.0,
            horizontalSpeed: 20.0,
        });

        assert.equal(ragdoll.enemyId, 'whiteGuy_01');
        assert.equal(ragdoll.enemyType, 'whiteGuy');
        assert.equal(ragdoll.airborne, true);
        assert.equal(ragdoll.splashed, false);
        assert.equal(ragdoll.despawned, false);
        assert.ok(ragdoll.flightDuration > 1.0);
        assert.equal(ragdoll.splashPosition.y, 0.25);
    });

    it('steps ragdoll from airborne arc to water splashdown and eventual despawn', () => {
        const ragdoll = createRagdollInstance({
            origin: vec3(0, 1.0, 0),
            verticalSpeed: 12.0,
            horizontalSpeed: 10.0,
        });

        const flightTime = ragdoll.flightDuration;

        // Step halfway
        const midStep = stepRagdollInstance(ragdoll, flightTime * 0.5);
        assert.equal(midStep.splashedThisStep, false);
        assert.equal(ragdoll.airborne, true);
        assert.ok(ragdoll.currentPosition.y > 1.0, 'Ragdoll should be airborne');
        assert.ok(ragdoll.tumbleDegrees > 300 && ragdoll.tumbleDegrees < 800, 'Ragdoll should have tumbled partially');

        // Step to splashdown
        const splashStep = stepRagdollInstance(ragdoll, flightTime * 0.6);
        assert.equal(splashStep.splashedThisStep, true);
        assert.equal(ragdoll.airborne, false);
        assert.equal(ragdoll.splashed, true);
        assert.equal(ragdoll.currentPosition.y, 0.25);
        assert.equal(ragdoll.tumbleDegrees, 1080);

        // Step post-splash sink time until despawn (1.5s post-splash)
        const sinkStep = stepRagdollInstance(ragdoll, 2.0);
        assert.equal(sinkStep.despawned, true);
        assert.equal(ragdoll.despawned, true);
    });
});

describe('Arcade Hitstop & Ragdoll Launch Manager', () => {
    it('triggers juice and freezes world physics while keeping FOV punch responsive', () => {
        const manager = createArcadeHitstopRagdollManager();

        // Trigger War Mallet crit
        manager.triggerJuice('war_mallet_crit', 1.2);
        assert.equal(manager.hitStop.active, true);
        assert.equal(manager.fovPunch.active, true);

        // Launch an enemy ragdoll
        const ragdoll = manager.launchEnemy({
            enemyId: 'mudAlien_02',
            origin: vec3(0, 1.0, -10),
            verticalSpeed: 15.0,
            horizontalSpeed: 15.0,
        });

        const initialY = ragdoll.currentPosition.y;

        // Step by 20ms during hit-stop (total freeze is 45ms)
        const step1 = manager.step(0.020);
        assert.equal(step1.timescale, 0.0);
        assert.equal(step1.effectiveDt, 0.0);
        // Because effectiveDt was 0, ragdoll was frozen mid-air!
        assert.equal(ragdoll.currentPosition.y, initialY, 'Ragdoll must be frozen in mid-air during hit-stop freeze');
        // But camera FOV punch stepped with realDt!
        assert.ok(step1.fovDelta < 0, 'Camera FOV punch must proceed even during hit-stop');

        // Step another 30ms (exceeding 45ms freeze duration)
        const step2 = manager.step(0.030);
        assert.equal(step2.timescale, 1.0);
        assert.ok(step2.effectiveDt > 0, 'Effective dt should now resume');
        // Ragdoll now moves
        assert.ok(ragdoll.currentPosition.y > initialY, 'Ragdoll should rise after hit-stop unfreezes');
    });

    it('processes combat impact: War Mallet crit knocks enemy off raft into spinning ragdoll arc', () => {
        const manager = createArcadeHitstopRagdollManager();

        const result = manager.processCombatImpact({
            type: HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TRIGGERS.WAR_MALLET_CRIT,
            attackerPos: vec3(0, 1.0, 0),
            targetPos: vec3(0, 1.0, -2.5),
            knockOffRaft: true,
            enemyId: 'whiteGuy_crit_victim',
            enemyType: 'whiteGuy',
        });

        assert.equal(result.juiceTriggered, true);
        assert.ok(result.ragdoll !== null, 'Ragdoll should have been created');
        assert.equal(result.ragdoll.enemyId, 'whiteGuy_crit_victim');
        assert.equal(manager.activeRagdolls.size, 1);

        // Step manager in 50ms increments until splashdown occurs
        let splashDetected = false;
        for (let i = 0; i < 40; i++) {
            const stepInfo = manager.step(0.05);
            if (stepInfo.newSplashEvents.length > 0) {
                splashDetected = true;
                const splash = stepInfo.newSplashEvents[0];
                assert.equal(splash.enemyId, 'whiteGuy_crit_victim');
                assert.equal(splash.position.y, 0.25);
                assert.equal(splash.tumbleDegrees, 1080);
                break;
            }
        }

        assert.equal(splashDetected, true, 'Manager must emit splash event on river impact');
    });

    it('resets manager state cleanly', () => {
        const manager = createArcadeHitstopRagdollManager();
        manager.triggerJuice('perfect_parry');
        manager.launchEnemy({ origin: vec3(0, 1, 0) });

        assert.equal(manager.activeRagdolls.size, 1);
        manager.reset();
        assert.equal(manager.hitStop.active, false);
        assert.equal(manager.fovPunch.active, false);
        assert.equal(manager.activeRagdolls.size, 0);
        assert.equal(manager.splashEventQueue.length, 0);
    });
});
