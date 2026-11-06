/**
 * Don't Sink, Don't Die — Pre-Motor Rhythmic Dual-Oar Rowing Physics & Dynamic Camera Feel
 * (`shared/oar-stroke-physics.js`)
 *
 * Sovereign Core & Videogame Helmet 01 (Synthetic José Camera & Game-Feel Pilot):
 * Pure deterministic hydrodynamics and rhythmic dual-oar stroke physics:
 *   1. Rhythmic Oar Stroke Timing: Natural Catch, Power Pull, and Recovery cycle (0.84s total).
 *   2. Fast-Press Choke Penalty: Premature strokes before cancelThreshold (0.48s) yank oars out early,
 *      braking horizontal velocity by 0.68x, locking out thrust for 0.26s, and resetting the stroke cycle.
 *   3. Power Curve: Pull thrust follows Math.sin(u * Math.PI) ** 1.15 in [pullStart, pullEnd].
 *   4. Low-Angle Chase Camera Feel: Subtle visceral camera impulses (forward pitch nod on catch,
 *      +0.8..1.8 deg FOV swell during power pull, camera jolt on choked stroke) with zero NaN/Infinity.
 *   5. Side-Aware Targeting: Dynamic oar swing side selection ('left' / 'right') based on starboard
 *      dot product projection `(cos(yaw), -sin(yaw))` relative to nearby living enemies.
 *
 * Pure deterministic ES module with zero external dependencies and 100% numerical safety.
 */

// ─── CONFIGURATION CONSTANTS ────────────────────────────────────────────────
export const OAR_STROKE_CONFIG = Object.freeze({
    duration: 0.84,             // Full stroke cycle duration in seconds
    pullStart: 0.05,            // Catch phase end / power pull start in seconds
    pullEnd: 0.62,              // Power pull finish / recovery phase start in seconds
    cancelThreshold: 0.48,      // Minimum elapsed stroke time before re-triggering without choke
    chokeBrakeFactor: 0.68,     // Horizontal velocity damping factor upon early cancel / choke
    chokeDuration: 0.26,        // Lockout timer in seconds applied to choked stroke
    waterGlideDrag: 1.35,       // Realistic fluid hydrodynamic glide drag (replacing arcade stop drag)
    idleRiverDrift: -0.95,      // Standard downstream cruising velocity bias (m/s along -Z)
    baseForwardThrust: 22.0,    // Normal peak forward acceleration during power pull (m/s²)
    attackForwardThrust: 12.5,  // Forward acceleration during combat attack swing (m/s²)
    maxReachDistance: 12.0,     // Default maximum reach distance for lateral target detection
    starboardDeadzone: 0.05,    // Deadzone margin for lateral target dot product
});

/**
 * Creates a clean oar stroke state object.
 *
 * @returns {object} Fresh oar stroke state
 */
export function createOarStrokeState() {
    return {
        active: false,
        elapsed: 0,
        chokedTimer: 0,
        strokeCount: 0,
        chokedCount: 0,
        lastPowerRatio: 0,
    };
}

/**
 * Triggers or cancels a rhythmic oar stroke.
 *
 * @param {object} state - Mutable oar stroke state created with `createOarStrokeState()`
 * @param {object} craftVelocity - Mutable craft velocity vector { x, y, z }
 * @param {object} [options]
 * @param {boolean} [options.hasMotor=false] - True if outboard motor upgrade is equipped
 * @param {boolean} [options.onSolid=false] - True if docked or grounded on solid platform
 * @returns {object} Result `{ triggered, choked, reason? }`
 */
export function triggerRhythmicOarStroke(state, craftVelocity, { hasMotor = false, onSolid = false } = {}) {
    if (!state || typeof state !== 'object') {
        return { triggered: false, choked: false, reason: 'invalid_state' };
    }

    if (hasMotor || onSolid) {
        return { triggered: false, choked: false, reason: 'motor_or_solid' };
    }

    // Fast-Press Cancel Penalty: pressing before cancelThreshold yanks oars out of the water early
    if (state.active && state.elapsed < OAR_STROKE_CONFIG.cancelThreshold) {
        state.chokedCount = (Number.isFinite(state.chokedCount) ? state.chokedCount : 0) + 1;
        state.chokedTimer = OAR_STROKE_CONFIG.chokeDuration;
        const pullEnd = OAR_STROKE_CONFIG.pullEnd > 0 ? OAR_STROKE_CONFIG.pullEnd : 1;
        state.lastPowerRatio = Math.max(0, Math.min(1, state.elapsed / pullEnd));
        state.elapsed = 0;

        if (craftVelocity && typeof craftVelocity === 'object') {
            if (Number.isFinite(craftVelocity.x)) {
                craftVelocity.x *= OAR_STROKE_CONFIG.chokeBrakeFactor;
            }
            if (Number.isFinite(craftVelocity.z)) {
                craftVelocity.z *= OAR_STROKE_CONFIG.chokeBrakeFactor;
            }
        }

        return { triggered: false, choked: true, reason: 'fast_press_cancelled' };
    }

    // Clean stroke start
    state.active = true;
    state.elapsed = 0;
    state.chokedTimer = 0;
    state.strokeCount = (Number.isFinite(state.strokeCount) ? state.strokeCount : 0) + 1;
    state.lastPowerRatio = 1.0;

    return { triggered: true, choked: false };
}

/**
 * Advances the rhythmic oar stroke state by time delta `dt`.
 * Computes the instantaneous pull curve and stroke phase indicators.
 *
 * @param {object} state - Mutable oar stroke state
 * @param {number} dt - Timestep in seconds
 * @returns {object} Pull curve and phase `{ pullCurve, phase, isCatch, isPowerPull, isRecovery, isChoked }`
 */
export function stepRhythmicOarStroke(state, dt) {
    if (!state || typeof state !== 'object') {
        return {
            pullCurve: 0,
            phase: 'idle',
            isCatch: false,
            isPowerPull: false,
            isRecovery: false,
            isChoked: false,
        };
    }

    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;

    // Decay choked lockout timer
    if (state.chokedTimer > 0) {
        state.chokedTimer = Math.max(0, state.chokedTimer - safeDt);
    }

    const isChoked = state.chokedTimer > 0;

    if (!state.active) {
        return {
            pullCurve: 0,
            phase: isChoked ? 'choked' : 'idle',
            isCatch: false,
            isPowerPull: false,
            isRecovery: false,
            isChoked,
        };
    }

    state.elapsed += safeDt;

    const pullStart = OAR_STROKE_CONFIG.pullStart;
    const pullEnd = OAR_STROKE_CONFIG.pullEnd;
    const duration = OAR_STROKE_CONFIG.duration;

    let pullCurve = 0;
    let phase = 'idle';
    let isCatch = false;
    let isPowerPull = false;
    let isRecovery = false;

    if (state.elapsed < pullStart) {
        phase = 'catch';
        isCatch = true;
    } else if (state.elapsed <= pullEnd) {
        phase = 'power_pull';
        isPowerPull = true;
        if (!isChoked && pullEnd > pullStart) {
            const u = (state.elapsed - pullStart) / (pullEnd - pullStart);
            const clampedU = Math.max(0, Math.min(1, u));
            pullCurve = Math.sin(clampedU * Math.PI) ** 1.15;
        }
    } else if (state.elapsed < duration) {
        phase = 'recovery';
        isRecovery = true;
    } else {
        state.active = false;
        state.elapsed = 0;
        phase = 'idle';
    }

    if (isChoked) {
        pullCurve = 0;
    }

    return {
        pullCurve: Number.isFinite(pullCurve) ? pullCurve : 0,
        phase,
        isCatch,
        isPowerPull,
        isRecovery,
        isChoked,
    };
}

/**
 * Computes subtle over-the-shoulder chase camera feel offsets based on oar stroke rhythm and raft speed.
 * Follows Sovereign Core & Helmet 01 directives:
 *   - Over-the-shoulder chase camera (~13°-18° pitch, 9-13m distance)
 *   - Forward pitch nod on catch phase
 *   - +0.8..1.8 deg FOV swell during peak power pull
 *   - Subtle camera jolt and micro-shake on choked stroke
 *   - Zero NaN/Infinity guaranteed under any speed or delta
 *
 * @param {object} state - Oar stroke state
 * @param {number|object} speedOrVelocity - Raft speed (scalar m/s) or velocity vector { x, y, z }
 * @returns {object} `{ pitchOffset, fovBoost, distanceOffset }`
 */
export function computeRowingCameraImpulse(state, speedOrVelocity) {
    let speed = 0;
    if (typeof speedOrVelocity === 'number') {
        speed = Number.isFinite(speedOrVelocity) ? Math.max(0, speedOrVelocity) : 0;
    } else if (speedOrVelocity && typeof speedOrVelocity === 'object') {
        const vx = Number.isFinite(speedOrVelocity.x) ? speedOrVelocity.x : 0;
        const vz = Number.isFinite(speedOrVelocity.z) ? speedOrVelocity.z : 0;
        speed = Math.sqrt(vx * vx + vz * vz);
    }

    // Default neutral impulse
    if (!state || typeof state !== 'object') {
        return { pitchOffset: 0, fovBoost: 0, distanceOffset: 0 };
    }

    let pitchOffset = 0;
    let fovBoost = 0;
    let distanceOffset = 0;

    const speedScale = Math.min(1.5, Math.max(0.5, 0.8 + speed * 0.04));

    // Choked stroke creates a sudden forward jolt & FOV dip (negative micro-punch)
    if (state.chokedTimer > 0) {
        const chokeFactor = Math.min(1.0, state.chokedTimer / OAR_STROKE_CONFIG.chokeDuration);
        pitchOffset = -0.025 * chokeFactor;    // Sudden down-pitch nod
        fovBoost = -1.2 * chokeFactor;        // Slight FOV contract
        distanceOffset = -0.22 * chokeFactor; // Camera pushes slightly closer
    } else if (state.active) {
        const pullStart = OAR_STROKE_CONFIG.pullStart;
        const pullEnd = OAR_STROKE_CONFIG.pullEnd;
        const duration = OAR_STROKE_CONFIG.duration;

        if (state.elapsed < pullStart) {
            // Catch phase: pilot leans forward preparing to pull
            const tCatch = pullStart > 0 ? state.elapsed / pullStart : 0;
            const catchSine = Math.sin(tCatch * Math.PI);
            pitchOffset = 0.012 * catchSine * speedScale; // Forward nod
            fovBoost = 0.3 * catchSine;
            distanceOffset = -0.08 * catchSine;
        } else if (state.elapsed <= pullEnd) {
            // Power pull: oars bite water, thrust swells FOV (+0.8..1.8 deg) and compresses distance
            const u = (pullEnd > pullStart) ? (state.elapsed - pullStart) / (pullEnd - pullStart) : 0;
            const clampedU = Math.max(0, Math.min(1, u));
            const pullCurve = Math.sin(clampedU * Math.PI) ** 1.15;

            // FOV swell between 0.8 and 1.8 deg based on speed and pull power
            const baseFovSwell = 0.8 + 1.0 * Math.min(1, speed / 12.0);
            fovBoost = baseFovSwell * pullCurve;
            pitchOffset = -0.018 * pullCurve; // Subtle chest lift / camera tilt back
            distanceOffset = 0.18 * pullCurve * speedScale; // Raft surges forward relative to camera
        } else if (state.elapsed < duration) {
            // Recovery phase: smooth return to neutral
            const recTotal = duration - pullEnd;
            const recT = recTotal > 0 ? (state.elapsed - pullEnd) / recTotal : 1;
            const recEase = (1 - recT) * (1 - recT);
            pitchOffset = -0.005 * recEase;
            fovBoost = 0.2 * recEase;
            distanceOffset = 0.05 * recEase;
        }
    }

    // Defensive NaN/Infinity sanitize
    return {
        pitchOffset: Number.isFinite(pitchOffset) ? pitchOffset : 0,
        fovBoost: Number.isFinite(fovBoost) ? fovBoost : 0,
        distanceOffset: Number.isFinite(distanceOffset) ? distanceOffset : 0,
    };
}

/**
 * Evaluates whether to swing the left or right oar during combat attack.
 * Inspects living enemies within reach and returns 'left' or 'right' based on the
 * lateral dot product relative to the raft's starboard vector `(cos(craftYaw), -sin(craftYaw))`.
 *
 * @param {object} craftPos - Raft world position { x, y, z }
 * @param {number} craftYaw - Raft yaw heading angle in radians
 * @param {object|Map|Array} enemiesMap - Map, Object dictionary, or Array of enemies { position, health }
 * @param {string} [fallbackSide='right'] - Fallback side if no enemies in reach ('left' or 'right')
 * @returns {'left'|'right'}
 */
export function evaluateSideAwareOarTarget(craftPos, craftYaw, enemiesMap, fallbackSide = 'right') {
    const defaultSide = fallbackSide === 'left' ? 'left' : 'right';

    if (!craftPos || typeof craftPos !== 'object') {
        return defaultSide;
    }

    const posX = Number.isFinite(craftPos.x) ? craftPos.x : 0;
    const posZ = Number.isFinite(craftPos.z) ? craftPos.z : 0;
    const yaw = Number.isFinite(craftYaw) ? craftYaw : 0;

    // Starboard unit vector in world space: (cos(yaw), -sin(yaw))
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const maxReach = OAR_STROKE_CONFIG.maxReachDistance;
    const deadzone = OAR_STROKE_CONFIG.starboardDeadzone;

    let nearestDistSq = maxReach * maxReach;
    let nearestDot = 0;
    let foundTarget = false;

    // Helper to evaluate an individual enemy entity
    function evaluateEnemy(e) {
        if (!e || typeof e !== 'object') return;
        const health = Number.isFinite(e.health) ? e.health : 0;
        if (health <= 0) return;

        // Position can be on e.position, e.mesh.position, or e itself
        const ePos = e.position || (e.mesh && e.mesh.position) || e;
        if (!ePos || typeof ePos !== 'object') return;

        const ex = Number.isFinite(ePos.x) ? ePos.x : (e.x ?? 0);
        const ez = Number.isFinite(ePos.z) ? ePos.z : (e.z ?? 0);

        const dx = ex - posX;
        const dz = ez - posZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestDot = dx * rightX + dz * rightZ;
            foundTarget = true;
        }
    }

    if (Array.isArray(enemiesMap)) {
        for (let i = 0; i < enemiesMap.length; i++) {
            evaluateEnemy(enemiesMap[i]);
        }
    } else if (enemiesMap instanceof Map) {
        for (const enemy of enemiesMap.values()) {
            evaluateEnemy(enemy);
        }
    } else if (enemiesMap && typeof enemiesMap === 'object') {
        const keys = Object.keys(enemiesMap);
        for (let i = 0; i < keys.length; i++) {
            evaluateEnemy(enemiesMap[keys[i]]);
        }
    }

    if (!foundTarget) {
        return defaultSide;
    }

    // Negative lateral dot product means the target is to port (-X relative to raft heading), i.e. 'left'
    // Positive lateral dot product means the target is to starboard (+X relative to raft heading), i.e. 'right'
    if (nearestDot < -deadzone) {
        return 'left';
    }
    if (nearestDot > deadzone) {
        return 'right';
    }

    return defaultSide;
}
