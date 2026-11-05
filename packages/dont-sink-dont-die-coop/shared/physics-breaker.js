// Extreme Velocity Physics Tunneling & Boundary Breaker for "Don't Sink, Don't Die".
// Pure and deterministic ES module: protects raft simulation against tunneling,
// runaway velocities, extreme frame hitches (500ms dt), nitro hydro-jets, waterfall launches,
// and whirlpool vortex suction.
// Zero timers, zero I/O, zero external dependencies.

import { WATER_SURFACE_Y, resolveWorldBoundsAndObstacles, stepWatercraftKinematics } from './raft-physics.js';
import { stepCraftWithRiverHazards } from './river-hazards.js';

/**
 * Hard boundary constants for the safe corridor.
 */
export const SAFE_CORRIDOR = {
    MIN_Y: -2.0,      // Never tunnel below riverbed / abyss floor
    MAX_Y: 35.0,      // Never fly above canyon ceiling
    DEFAULT_RIVER_WIDTH: 30.0,
    MAX_SPEED: 120.0, // Maximum velocity magnitude allowed (m/s)
    MAX_ANGULAR_SPEED: 25.0, // rad/s
    REST_Y: WATER_SURFACE_Y ?? 0.25,
};

/**
 * Sanitizes numeric input to guarantee finite values (replaces NaN/Infinity with default fallback).
 */
export function sanitizeFinite(val, fallback = 0) {
    return Number.isFinite(val) ? val : fallback;
}

/**
 * Clamps a craft to the strict safe spatial corridor:
 * - y in [SAFE_CORRIDOR.MIN_Y, SAFE_CORRIDOR.MAX_Y] ([-2, 35])
 * - x in [-riverWidth / 2, +riverWidth / 2]
 * - Sanitizes NaNs and Infinities across position and velocity
 * - Absorbs/reflects velocity when hitting the corridor boundaries
 *
 * @param {object} craft - Kinematic craft with { position, velocity, angularVelocity?, yaw? }
 * @param {number} [riverWidth=30] - Total width of the river channel
 * @returns {object} Status report detailing boundary clamp events and corrections
 */
export function clampRaftToSafeCorridor(craft, riverWidth = SAFE_CORRIDOR.DEFAULT_RIVER_WIDTH) {
    if (!craft) return { clamped: false, reasons: ['no-craft'] };

    const rw = Number.isFinite(riverWidth) && riverWidth > 0 ? riverWidth : SAFE_CORRIDOR.DEFAULT_RIVER_WIDTH;
    const halfWidth = rw * 0.5;
    const minX = -halfWidth;
    const maxX = halfWidth;
    const minY = SAFE_CORRIDOR.MIN_Y;
    const maxY = SAFE_CORRIDOR.MAX_Y;

    if (!craft.position) craft.position = { x: 0, y: SAFE_CORRIDOR.REST_Y, z: 0 };
    if (!craft.velocity) craft.velocity = { x: 0, y: 0, z: 0 };

    const pos = craft.position;
    const vel = craft.velocity;

    // 1. Sanitize any NaN or Infinite coordinates
    let nanSanitized = false;
    if (!Number.isFinite(pos.x)) { pos.x = 0; nanSanitized = true; }
    if (!Number.isFinite(pos.y)) { pos.y = SAFE_CORRIDOR.REST_Y; nanSanitized = true; }
    if (!Number.isFinite(pos.z)) { pos.z = 0; nanSanitized = true; }

    if (!Number.isFinite(vel.x)) { vel.x = 0; nanSanitized = true; }
    if (!Number.isFinite(vel.y)) { vel.y = 0; nanSanitized = true; }
    if (!Number.isFinite(vel.z)) { vel.z = 0; nanSanitized = true; }

    if (craft.angularVelocity) {
        if (!Number.isFinite(craft.angularVelocity.x)) craft.angularVelocity.x = 0;
        if (!Number.isFinite(craft.angularVelocity.y)) craft.angularVelocity.y = 0;
        if (!Number.isFinite(craft.angularVelocity.z)) craft.angularVelocity.z = 0;
    }
    if (craft.yaw !== undefined && !Number.isFinite(craft.yaw)) {
        craft.yaw = 0;
    }

    const events = [];

    // 2. Clamp Lateral Bounds (X axis)
    if (pos.x < minX) {
        pos.x = minX;
        if (vel.x < 0) vel.x = 0;
        events.push('clamped_min_x');
    } else if (pos.x > maxX) {
        pos.x = maxX;
        if (vel.x > 0) vel.x = 0;
        events.push('clamped_max_x');
    }

    // 3. Clamp Vertical Bounds (Y axis)
    if (pos.y < minY) {
        pos.y = minY;
        if (vel.y < 0) vel.y = 0; // Prevent further tunneling
        events.push('clamped_min_y');
    } else if (pos.y > maxY) {
        pos.y = maxY;
        if (vel.y > 0) vel.y = 0; // Prevent ascending into outer space
        events.push('clamped_max_y');
    }

    // 4. Cap extreme velocities to prevent runaway physics
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    if (speed > SAFE_CORRIDOR.MAX_SPEED) {
        const factor = SAFE_CORRIDOR.MAX_SPEED / speed;
        vel.x *= factor;
        vel.y *= factor;
        vel.z *= factor;
        events.push('capped_max_speed');
    }

    return {
        clamped: events.length > 0 || nanSanitized,
        events,
        nanSanitized,
        position: { x: pos.x, y: pos.y, z: pos.z },
        velocity: { x: vel.x, y: vel.y, z: vel.z },
    };
}

/**
 * Continuous collision detection (CCD) / Sub-stepping runner.
 * Takes a large dt (e.g. 500ms frame hitch) and splits it into discrete safe sub-steps
 * (maxSubstepDt = 1/60s = ~0.01667s), advancing kinematics, hazard interactions,
 * and boundary enforcement so objects do not tunnel through obstacles or riverbanks.
 *
 * @param {object} craft - Raft craft state
 * @param {object} input - Input vector { w, a, s, d, space, ... }
 * @param {object} hazards - River hazards (rapids, whirlpools, ramps, mines)
 * @param {number} totalDt - Total elapsed delta time (e.g. 0.5s)
 * @param {object} [options] - Configuration { maxSubstepDt, riverWidth, obstacles, now }
 * @returns {object} Summary of sub-stepped simulation
 */
export function stepPhysicsWithTunnelingGuard(
    craft,
    input = {},
    hazards = {},
    totalDt = 0.016,
    options = {}
) {
    const maxSubstepDt = options.maxSubstepDt || (1.0 / 60.0);
    const riverWidth = options.riverWidth || SAFE_CORRIDOR.DEFAULT_RIVER_WIDTH;
    const obstacles = options.obstacles || [];
    let currentTime = options.now || 0;

    let remainingDt = Math.max(0, totalDt);
    let substepsTaken = 0;
    const maxSubsteps = options.maxSubsteps || 50;

    const aggregateClampEvents = [];
    const aggregateHazardResults = [];

    while (remainingDt > 1e-6 && substepsTaken < maxSubsteps) {
        const dt = Math.min(remainingDt, maxSubstepDt);

        // 1. Step hazard influences (rapids, whirlpools, ramps, mines)
        if (hazards && (hazards.rapids || hazards.whirlpools || hazards.ramps || hazards.mines)) {
            const hRes = stepCraftWithRiverHazards(craft, hazards, dt, currentTime);
            aggregateHazardResults.push(hRes);
        }

        // 2. Step watercraft kinematics
        stepWatercraftKinematics(craft, input, dt);

        // 3. Resolve obstacles and bank collision
        resolveWorldBoundsAndObstacles(craft, obstacles);

        // 4. Strict Safe Corridor Clamping
        const clampRes = clampRaftToSafeCorridor(craft, riverWidth);
        if (clampRes.clamped) {
            aggregateClampEvents.push(...clampRes.events);
        }

        currentTime += dt * 1000;
        remainingDt -= dt;
        substepsTaken++;
    }

    // Final safety clamp pass
    const finalClamp = clampRaftToSafeCorridor(craft, riverWidth);
    if (finalClamp.clamped) {
        aggregateClampEvents.push(...finalClamp.events);
    }

    return {
        substepsTaken,
        remainingDt,
        clampEvents: aggregateClampEvents,
        hazardResults: aggregateHazardResults,
        finalPosition: { ...craft.position },
        finalVelocity: { ...craft.velocity },
    };
}

/**
 * Stress tests a raft craft under extreme velocity and environmental forces:
 * 1. 100 m/s Nitro Keg velocity surge
 * 2. Waterfall stunt jump ramp ballistic impulse
 * 3. Whirlpool vortex swirl + radial suction pull
 * 4. 500ms massive frame hitch lag spike
 *
 * Validates that after all stresses, the raft remains strictly inside safe corridor:
 * y in [-2, 35]
 * x in [-riverWidth/2, +riverWidth/2]
 * zero NaN / Infinity coordinates.
 *
 * @param {object} [customConfig] - Optional override parameters
 * @returns {object} Stress test telemetry report
 */
export function executeExtremeVelocityStressTest(customConfig = {}) {
    const riverWidth = customConfig.riverWidth || SAFE_CORRIDOR.DEFAULT_RIVER_WIDTH;
    const frameHitchDt = customConfig.frameHitchDt || 0.5; // 500ms frame hitch

    // Craft starting at center
    const craft = {
        id: 'stress_tester_raft',
        mass: 5,
        position: { x: 0, y: 0.25, z: -100 },
        velocity: { x: 0, y: 0, z: -10 },
        angularVelocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
    };

    // Stunt ramp
    const ramp = {
        id: 'ramp_extreme',
        x: 0,
        z: -100,
        width: 10,
        length: 12,
        height: 4.0,
        launchVelocityY: 28.0,
        launchBoostZ: 35.0,
    };

    // Whirlpool positioned nearby
    const whirlpool = {
        id: 'whirlpool_extreme',
        x: 5,
        z: -105,
        radius: 14.0,
        coreRadius: 2.0,
        clockwise: true,
        maxPull: 35.0,
        maxSwirl: 45.0,
        depth: 2.5,
    };

    const hazards = {
        rapids: [],
        whirlpools: [whirlpool],
        ramps: [ramp],
        mines: [],
        coinRings: [],
    };

    // Apply extreme 100 m/s Nitro Keg impulse downriver + lateral whip
    craft.velocity.x += 60.0;
    craft.velocity.y += 40.0;
    craft.velocity.z -= 100.0;

    // Step with 500ms frame hitch using tunneling guard
    const stepReport = stepPhysicsWithTunnelingGuard(
        craft,
        { w: true, space: true },
        hazards,
        frameHitchDt,
        { riverWidth, maxSubsteps: 100 }
    );

    const halfW = riverWidth * 0.5;
    const passedBounds =
        craft.position.x >= -halfW &&
        craft.position.x <= halfW &&
        craft.position.y >= SAFE_CORRIDOR.MIN_Y &&
        craft.position.y <= SAFE_CORRIDOR.MAX_Y;

    const noNaN =
        Number.isFinite(craft.position.x) &&
        Number.isFinite(craft.position.y) &&
        Number.isFinite(craft.position.z) &&
        Number.isFinite(craft.velocity.x) &&
        Number.isFinite(craft.velocity.y) &&
        Number.isFinite(craft.velocity.z);

    return {
        passed: passedBounds && noNaN,
        craft,
        stepReport,
        bounds: {
            minX: -halfW,
            maxX: halfW,
            minY: SAFE_CORRIDOR.MIN_Y,
            maxY: SAFE_CORRIDOR.MAX_Y,
        },
        noNaN,
        passedBounds,
    };
}
