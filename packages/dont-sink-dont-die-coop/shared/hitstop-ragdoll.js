/**
 * Don't Sink, Don't Die — Arcade Hit-Stop Freeze, Impact Punch & Ragdoll Launch Physics Engine
 *
 * Deterministic, pure-math gameplay logic with zero external dependencies.
 * Shared pure-math engine for:
 * 1. Arcade Hit-Stop Freeze (45ms timescale freeze on heavy War Mallet crits and Perfect Parries).
 * 2. Camera FOV Micro-Punch (120ms snappy impact punch curve with subtle zoom-in and elastic rebound).
 * 3. Hilarious spinning 3D Ragdoll Launch Trajectories (parabolic arc + 1080° tumble + exact water splash impact coordinates).
 * 4. Multi-entity Ragdoll Launch Manager for tracking active launched enemies, airborne state, and water splashdowns.
 */

// ─── Constants & Tuning Configuration ──────────────────────────────────────

export const HITSTOP_RAGDOLL_CONSTANTS = {
    // 1. Hit-Stop Timescale Freeze
    HITSTOP: {
        DURATION_MS: 45, // 45ms freeze duration
        DURATION_SEC: 0.045,
        TIMESCALE_FROZEN: 0.0, // Complete freeze during hit-stop
        TIMESCALE_NORMAL: 1.0,
        TRIGGERS: {
            WAR_MALLET_CRIT: 'war_mallet_crit',
            PERFECT_PARRY: 'perfect_parry',
        },
    },

    // 2. Camera FOV Micro-Punch
    FOV_PUNCH: {
        DURATION_MS: 120, // 120ms total micro-punch duration
        DURATION_SEC: 0.12,
        PEAK_TIME_SEC: 0.025, // Quick 25ms snappy punch inward
        MAX_FOV_DELTA: -4.5, // Degrees delta (zoom in)
        BASE_FOV: 65.0, // Standard default camera FOV
    },

    // 3. Ragdoll Launch Trajectory & Physics
    RAGDOLL: {
        GRAVITY: 24.0, // m/s² downward acceleration
        WATER_SURFACE_Y: 0.25, // River waterline
        TOTAL_TUMBLE_DEG: 1080, // 1080 degrees = 3 full revolutions
        TOTAL_TUMBLE_RAD: 6 * Math.PI,
        HORIZONTAL_DRAG: 0.25, // Air resistance damping on horizontal speed
        DEFAULT_MASS: 70.0, // kg
        DEFAULT_LAUNCH_SPEED_Y: 14.0, // m/s vertical lift
        DEFAULT_LAUNCH_SPEED_XZ: 18.0, // m/s horizontal knockback
        MIN_FLIGHT_TIME: 0.3,
        MAX_FLIGHT_TIME: 4.0,
    },
};

// ─── Pure Math Helpers ─────────────────────────────────────────────────────

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

export function vec3(x = 0, y = 0, z = 0) {
    return { x, y, z };
}

export function vec3Copy(src, out = vec3()) {
    out.x = src.x;
    out.y = src.y;
    out.z = src.z;
    return out;
}

export function vec3Add(a, b, out = vec3()) {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
    return out;
}

export function vec3Sub(a, b, out = vec3()) {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    out.z = a.z - b.z;
    return out;
}

export function vec3Scale(v, s, out = vec3()) {
    out.x = v.x * s;
    out.y = v.y * s;
    out.z = v.z * s;
    return out;
}

export function vec3Length(v) {
    return Math.hypot(v.x, v.y, v.z);
}

export function vec3Normalize(v, out = vec3()) {
    const len = vec3Length(v);
    if (len < 1e-6) {
        out.x = 0;
        out.y = 0;
        out.z = 0;
        return out;
    }
    const inv = 1 / len;
    out.x = v.x * inv;
    out.y = v.y * inv;
    out.z = v.z * inv;
    return out;
}

// ─── 1. Hit-Stop Timescale Freeze Controller ───────────────────────────────

/**
 * Creates an arcade hit-stop timescale freeze controller state.
 */
export function createHitStopState() {
    return {
        active: false,
        duration: HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.DURATION_SEC,
        elapsed: 0,
        triggerReason: null,
        timescale: HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TIMESCALE_NORMAL,
        totalFreezesTriggered: 0,
    };
}

/**
 * Triggers a hit-stop freeze (e.g. 45ms freeze for heavy War Mallet crits or Perfect Parries).
 *
 * @param {object} state - HitStop state created by createHitStopState.
 * @param {string} triggerReason - One of HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TRIGGERS or custom reason.
 * @param {number} [customDurationSec] - Optional duration override in seconds.
 * @returns {object} Updated state.
 */
export function triggerHitStop(state, triggerReason, customDurationSec = null) {
    const dur = (typeof customDurationSec === 'number' && customDurationSec > 0)
        ? customDurationSec
        : HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.DURATION_SEC;

    state.active = true;
    state.duration = dur;
    state.elapsed = 0;
    state.triggerReason = triggerReason;
    state.timescale = HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TIMESCALE_FROZEN;
    state.totalFreezesTriggered += 1;
    return state;
}

/**
 * Steps the hit-stop freeze controller by dt seconds (unscaled real-time dt).
 *
 * @param {object} state - HitStop state.
 * @param {number} realDt - Real wall-clock delta time in seconds.
 * @returns {{ active: boolean, timescale: number, justCompleted: boolean, effectiveDt: number }}
 */
export function stepHitStop(state, realDt) {
    if (!state.active) {
        state.timescale = HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TIMESCALE_NORMAL;
        return {
            active: false,
            timescale: 1.0,
            justCompleted: false,
            effectiveDt: realDt,
        };
    }

    state.elapsed += realDt;
    if (state.elapsed >= state.duration) {
        state.active = false;
        state.timescale = HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TIMESCALE_NORMAL;
        // Remaining unscaled dt after freeze ends
        const overflow = Math.max(0, state.elapsed - state.duration);
        state.elapsed = 0;
        return {
            active: false,
            timescale: 1.0,
            justCompleted: true,
            effectiveDt: overflow,
        };
    }

    state.timescale = HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TIMESCALE_FROZEN;
    return {
        active: true,
        timescale: 0.0,
        justCompleted: false,
        effectiveDt: 0.0,
    };
}

// ─── 2. Camera FOV Micro-Punch ─────────────────────────────────────────────

/**
 * Creates an impact camera FOV micro-punch state.
 */
export function createFovPunchState(baseFov = HITSTOP_RAGDOLL_CONSTANTS.FOV_PUNCH.BASE_FOV) {
    return {
        active: false,
        baseFov,
        currentFov: baseFov,
        fovDelta: 0,
        elapsed: 0,
        duration: HITSTOP_RAGDOLL_CONSTANTS.FOV_PUNCH.DURATION_SEC,
        intensity: 1.0,
    };
}

/**
 * Triggers a 120ms camera FOV micro-punch.
 *
 * @param {object} state - FOV punch state.
 * @param {number} [intensity=1.0] - Strength multiplier (1.0 = standard -4.5 deg punch).
 * @param {number} [durationSec] - Optional duration override.
 * @returns {object} Updated state.
 */
export function triggerFovPunch(state, intensity = 1.0, durationSec = null) {
    state.active = true;
    state.elapsed = 0;
    state.intensity = Math.max(0.1, intensity);
    state.duration = (typeof durationSec === 'number' && durationSec > 0)
        ? durationSec
        : HITSTOP_RAGDOLL_CONSTANTS.FOV_PUNCH.DURATION_SEC;
    state.fovDelta = 0;
    state.currentFov = state.baseFov;
    return state;
}

/**
 * Evaluates the FOV delta at a given elapsed time.
 * Punch curve:
 * - 0 to peakTime (25ms): Rapid snappy punch in (ease-in-out quadratic to max delta).
 * - peakTime to duration (95ms): Elastic/smooth recovery back to 0.
 *
 * @param {number} elapsedSec - Elapsed time since punch triggered.
 * @param {number} durationSec - Total duration of punch.
 * @param {number} maxDelta - Maximum FOV change in degrees.
 * @returns {number} FOV delta in degrees.
 */
export function evaluateFovPunchDelta(
    elapsedSec,
    durationSec = HITSTOP_RAGDOLL_CONSTANTS.FOV_PUNCH.DURATION_SEC,
    maxDelta = HITSTOP_RAGDOLL_CONSTANTS.FOV_PUNCH.MAX_FOV_DELTA
) {
    if (elapsedSec <= 0 || elapsedSec >= durationSec) {
        return 0;
    }

    const peakTime = HITSTOP_RAGDOLL_CONSTANTS.FOV_PUNCH.PEAK_TIME_SEC;
    if (elapsedSec < peakTime) {
        // Fast attack phase: ease-out quad into peak
        const t = elapsedSec / peakTime;
        const ease = 1 - (1 - t) * (1 - t);
        return maxDelta * ease;
    } else {
        // Recovery phase: exponential smooth decay with slight bounce feel
        const t = (elapsedSec - peakTime) / (durationSec - peakTime);
        // Smoothstep decay from 1 to 0
        const decay = (1 - t) * (1 - t) * (1 + 0.5 * Math.sin(t * Math.PI * 1.5));
        return maxDelta * Math.max(0, decay);
    }
}

/**
 * Steps the camera FOV micro-punch state.
 *
 * @param {object} state - FOV punch state.
 * @param {number} dt - Delta time in seconds.
 * @returns {{ active: boolean, currentFov: number, fovDelta: number }}
 */
export function stepFovPunch(state, dt) {
    if (!state.active) {
        state.currentFov = state.baseFov;
        state.fovDelta = 0;
        return { active: false, currentFov: state.baseFov, fovDelta: 0 };
    }

    state.elapsed += dt;
    if (state.elapsed >= state.duration) {
        state.active = false;
        state.elapsed = 0;
        state.fovDelta = 0;
        state.currentFov = state.baseFov;
        return { active: false, currentFov: state.baseFov, fovDelta: 0 };
    }

    const delta = evaluateFovPunchDelta(
        state.elapsed,
        state.duration,
        HITSTOP_RAGDOLL_CONSTANTS.FOV_PUNCH.MAX_FOV_DELTA * state.intensity
    );

    state.fovDelta = delta;
    state.currentFov = state.baseFov + delta;

    return {
        active: true,
        currentFov: state.currentFov,
        fovDelta: state.fovDelta,
    };
}

// ─── 3. Ragdoll Launch Physics Trajectory Math ──────────────────────────────

/**
 * Solves analytical flight time until ragdoll hits the river water surface.
 * y(t) = y0 + vy0 * t - 0.5 * g * t² = waterY
 * 0.5 * g * t² - vy0 * t + (waterY - y0) = 0
 *
 * @param {number} y0 - Initial Y position.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} [gravity] - Downward gravity acceleration.
 * @param {number} [waterY] - Waterline altitude.
 * @returns {number} Flight duration in seconds until splashdown.
 */
export function calculateRagdollSplashTime(
    y0,
    vy0,
    gravity = HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.GRAVITY,
    waterY = HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.WATER_SURFACE_Y
) {
    const a = 0.5 * gravity;
    const b = -vy0;
    const c = waterY - y0;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        // Does not reach waterline with normal downward parabolic root
        return 0.5;
    }

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    // Pick positive forward time
    if (t2 > 1e-4) return t2;
    if (t1 > 1e-4) return t1;
    return 0.1;
}

/**
 * Computes exact 3D water splash impact coordinate and velocity analytically.
 *
 * @param {object} origin - Initial position { x, y, z }.
 * @param {object} initialVelocity - Initial 3D velocity { x, y, z }.
 * @param {number} [flightTime] - Precalculated flight time, or computed if null.
 * @param {number} [drag] - Horizontal drag factor.
 * @param {number} [gravity] - Gravity acceleration.
 * @param {number} [waterY] - Water surface Y.
 * @returns {{ splashPosition: { x: number, y: number, z: number }, impactVelocity: { x: number, y: number, z: number }, flightDuration: number }}
 */
export function calculateRagdollSplashdown(
    origin,
    initialVelocity,
    flightTime = null,
    drag = HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.HORIZONTAL_DRAG,
    gravity = HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.GRAVITY,
    waterY = HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.WATER_SURFACE_Y
) {
    const t = (flightTime !== null && flightTime > 0)
        ? flightTime
        : calculateRagdollSplashTime(origin.y, initialVelocity.y, gravity, waterY);

    // Horizontal decay factor: v(t) = v0 * exp(-drag * t) or linear approx
    // Integrating dx = vx0 * (1 - exp(-drag * t)) / drag
    let splashX, splashZ, impactVx, impactVz;
    if (drag > 1e-4) {
        const decay = Math.exp(-drag * t);
        splashX = origin.x + (initialVelocity.x / drag) * (1 - decay);
        splashZ = origin.z + (initialVelocity.z / drag) * (1 - decay);
        impactVx = initialVelocity.x * decay;
        impactVz = initialVelocity.z * decay;
    } else {
        splashX = origin.x + initialVelocity.x * t;
        splashZ = origin.z + initialVelocity.z * t;
        impactVx = initialVelocity.x;
        impactVz = initialVelocity.z;
    }

    const impactVy = initialVelocity.y - gravity * t;

    return {
        splashPosition: vec3(splashX, waterY, splashZ),
        impactVelocity: vec3(impactVx, impactVy, impactVz),
        flightDuration: t,
    };
}

/**
 * Computes instantaneous position, velocity, and 1080-degree tumble rotation for an airborne ragdoll.
 *
 * @param {object} origin - Initial launch position { x, y, z }.
 * @param {object} initialVelocity - Initial launch velocity { x, y, z }.
 * @param {number} t - Current flight time in seconds.
 * @param {number} totalFlightDuration - Duration until splashdown.
 * @param {object} spinAxis - Normalized rotational tumble axis { x, y, z }.
 * @param {number} [gravity] - Gravity acceleration.
 * @param {number} [drag] - Horizontal drag factor.
 * @returns {object} Instantaneous state { position, velocity, tumbleDegrees, tumbleRadians, rotationEuler }
 */
export function sampleRagdollTrajectory(
    origin,
    initialVelocity,
    t,
    totalFlightDuration,
    spinAxis = vec3(1, 0.4, 0.2),
    gravity = HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.GRAVITY,
    drag = HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.HORIZONTAL_DRAG
) {
    const clampedT = Math.max(0, t);
    let px, pz, vx, vz;

    if (drag > 1e-4) {
        const decay = Math.exp(-drag * clampedT);
        px = origin.x + (initialVelocity.x / drag) * (1 - decay);
        pz = origin.z + (initialVelocity.z / drag) * (1 - decay);
        vx = initialVelocity.x * decay;
        vz = initialVelocity.z * decay;
    } else {
        px = origin.x + initialVelocity.x * clampedT;
        pz = origin.z + initialVelocity.z * clampedT;
        vx = initialVelocity.x;
        vz = initialVelocity.z;
    }

    const py = origin.y + initialVelocity.y * clampedT - 0.5 * gravity * clampedT * clampedT;
    const vy = initialVelocity.y - gravity * clampedT;

    // 1080-degree tumble progress over the arc (from 0 to 1080 deg / 6*PI radians)
    const normProgress = totalFlightDuration > 0 ? clamp(clampedT / totalFlightDuration, 0, 1) : 1;
    // Cubic tumble speed curve: fast spin off the bat, maintaining high spin until water hit
    const tumbleRad = normProgress * HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.TOTAL_TUMBLE_RAD;
    const tumbleDeg = normProgress * HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.TOTAL_TUMBLE_DEG;

    // Rotations across axes based on spinAxis
    const normAxis = vec3Normalize(spinAxis);
    const rotX = tumbleRad * normAxis.x;
    const rotY = tumbleRad * normAxis.y;
    const rotZ = tumbleRad * normAxis.z;

    return {
        position: vec3(px, py, pz),
        velocity: vec3(vx, vy, vz),
        tumbleDegrees: tumbleDeg,
        tumbleRadians: tumbleRad,
        rotationEuler: vec3(rotX, rotY, rotZ),
        normalizedProgress: normProgress,
    };
}

// ─── 4. Active Ragdoll Launch Instance & Manager ───────────────────────────

let nextRagdollId = 1;

/**
 * Creates an active ragdoll launch instance.
 *
 * @param {object} options
 * @param {string} [options.enemyId] - ID of the launched enemy.
 * @param {string} [options.enemyType] - 'whiteGuy' | 'mudAlien' | 'longWorm' | 'bossKraken' etc.
 * @param {object} options.origin - Launch origin { x, y, z }.
 * @param {object} [options.knockbackDir] - Launch horizontal direction vector { x, y, z }.
 * @param {number} [options.verticalSpeed] - Upward launch speed.
 * @param {number} [options.horizontalSpeed] - Forward launch speed.
 * @param {object} [options.customVelocity] - Direct initial velocity vector { x, y, z }.
 * @param {object} [options.spinAxis] - 3D spin axis { x, y, z }.
 * @returns {object} Ragdoll instance.
 */
export function createRagdollInstance(options = {}) {
    const id = options.id || `ragdoll_${nextRagdollId++}`;
    const enemyId = options.enemyId || id;
    const enemyType = options.enemyType || 'enemy';
    const origin = vec3Copy(options.origin || vec3(0, 1.0, 0));

    let initialVelocity;
    if (options.customVelocity) {
        initialVelocity = vec3Copy(options.customVelocity);
    } else {
        const dir = options.knockbackDir ? vec3Normalize(options.knockbackDir) : vec3(0, 0, -1);
        const horizSpeed = options.horizontalSpeed ?? HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.DEFAULT_LAUNCH_SPEED_XZ;
        const vertSpeed = options.verticalSpeed ?? HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.DEFAULT_LAUNCH_SPEED_Y;
        initialVelocity = vec3(dir.x * horizSpeed, vertSpeed, dir.z * horizSpeed);
    }

    const gravity = options.gravity ?? HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.GRAVITY;
    const waterY = options.waterY ?? HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.WATER_SURFACE_Y;
    const drag = options.drag ?? HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.HORIZONTAL_DRAG;
    const spinAxis = options.spinAxis ? vec3Normalize(options.spinAxis) : vec3(1.0, 0.4, 0.2);

    const splashData = calculateRagdollSplashdown(origin, initialVelocity, null, drag, gravity, waterY);

    return {
        id,
        enemyId,
        enemyType,
        origin,
        initialVelocity,
        currentPosition: vec3Copy(origin),
        currentVelocity: vec3Copy(initialVelocity),
        currentRotation: vec3(0, 0, 0),
        tumbleDegrees: 0,
        tumbleRadians: 0,
        spinAxis,
        gravity,
        waterY,
        drag,
        flightDuration: splashData.flightDuration,
        splashPosition: splashData.splashPosition,
        impactVelocity: splashData.impactVelocity,
        elapsedTime: 0,
        airborne: true,
        splashed: false,
        splashReported: false,
        despawned: false,
    };
}

/**
 * Steps a single ragdoll instance by dt.
 *
 * @param {object} ragdoll - Ragdoll instance.
 * @param {number} dt - Delta time in seconds.
 * @returns {{ splashedThisStep: boolean, despawned: boolean, ragdoll: object }}
 */
export function stepRagdollInstance(ragdoll, dt) {
    if (ragdoll.despawned) {
        return { splashedThisStep: false, despawned: true, ragdoll };
    }

    let splashedThisStep = false;
    ragdoll.elapsedTime += dt;

    if (ragdoll.airborne) {
        if (ragdoll.elapsedTime >= ragdoll.flightDuration) {
            ragdoll.airborne = false;
            ragdoll.splashed = true;
            splashedThisStep = true;
            ragdoll.splashReported = true;
            vec3Copy(ragdoll.splashPosition, ragdoll.currentPosition);
            vec3Copy(ragdoll.impactVelocity, ragdoll.currentVelocity);
            ragdoll.tumbleDegrees = HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.TOTAL_TUMBLE_DEG;
            ragdoll.tumbleRadians = HITSTOP_RAGDOLL_CONSTANTS.RAGDOLL.TOTAL_TUMBLE_RAD;
        } else {
            const sample = sampleRagdollTrajectory(
                ragdoll.origin,
                ragdoll.initialVelocity,
                ragdoll.elapsedTime,
                ragdoll.flightDuration,
                ragdoll.spinAxis,
                ragdoll.gravity,
                ragdoll.drag
            );
            vec3Copy(sample.position, ragdoll.currentPosition);
            vec3Copy(sample.velocity, ragdoll.currentVelocity);
            vec3Copy(sample.rotationEuler, ragdoll.currentRotation);
            ragdoll.tumbleDegrees = sample.tumbleDegrees;
            ragdoll.tumbleRadians = sample.tumbleRadians;

            // Direct waterline check fallback
            if (ragdoll.currentPosition.y <= ragdoll.waterY) {
                ragdoll.airborne = false;
                ragdoll.splashed = true;
                splashedThisStep = true;
                ragdoll.splashReported = true;
                ragdoll.currentPosition.y = ragdoll.waterY;
            }
        }
    } else if (ragdoll.splashed) {
        // Post-splash settle / sink into river
        const sinkSpeed = 1.2;
        ragdoll.currentPosition.y -= sinkSpeed * dt;
        ragdoll.currentPosition.z -= 4.0 * dt; // Drift downriver
        if (ragdoll.elapsedTime >= ragdoll.flightDuration + 1.5) {
            ragdoll.despawned = true;
        }
    }

    return {
        splashedThisStep,
        despawned: ragdoll.despawned,
        ragdoll,
    };
}

/**
 * Creates the high-level Arcade Combat & Ragdoll Launch Manager.
 * Orchestrates hit-stops, FOV punches, and multiple active ragdolls.
 */
export function createArcadeHitstopRagdollManager() {
    const hitStop = createHitStopState();
    const fovPunch = createFovPunchState();
    const activeRagdolls = new Map();
    const splashEventQueue = [];

    return {
        hitStop,
        fovPunch,
        activeRagdolls,
        splashEventQueue,

        /**
         * Triggers high-impact arcade juice: hit-stop freeze + camera micro-punch.
         *
         * @param {string} trigger - 'war_mallet_crit' | 'perfect_parry' | etc.
         * @param {number} [punchIntensity=1.0] - Camera FOV punch intensity.
         */
        triggerJuice(trigger, punchIntensity = 1.0) {
            triggerHitStop(hitStop, trigger, HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.DURATION_SEC);
            triggerFovPunch(fovPunch, punchIntensity, HITSTOP_RAGDOLL_CONSTANTS.FOV_PUNCH.DURATION_SEC);
        },

        /**
         * Launches an enemy into a spinning 3D ragdoll trajectory.
         *
         * @param {object} options - Launch options passed to createRagdollInstance.
         * @returns {object} The created ragdoll instance.
         */
        launchEnemy(options) {
            const ragdoll = createRagdollInstance(options);
            activeRagdolls.set(ragdoll.id, ragdoll);
            return ragdoll;
        },

        /**
         * Evaluates a full combat impact event: checks if it is a heavy mallet crit or parry,
         * triggers appropriate juice, and launches enemy if requested or lethal/knockback.
         *
         * @param {object} event
         * @param {string} event.type - 'war_mallet_crit' | 'perfect_parry' | 'normal_hit'
         * @param {object} [event.targetPos] - Position of victim { x, y, z }
         * @param {object} [event.attackerPos] - Position of attacker { x, y, z }
         * @param {boolean} [event.knockOffRaft] - Whether victim was knocked off raft into river
         * @param {string} [event.enemyId] - Target enemy ID
         * @param {string} [event.enemyType] - Target enemy type
         * @returns {{ juiceTriggered: boolean, ragdoll: object|null }}
         */
        processCombatImpact(event) {
            let juiceTriggered = false;
            let ragdoll = null;

            if (
                event.type === HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TRIGGERS.WAR_MALLET_CRIT ||
                event.type === HITSTOP_RAGDOLL_CONSTANTS.HITSTOP.TRIGGERS.PERFECT_PARRY
            ) {
                this.triggerJuice(event.type, event.type === 'war_mallet_crit' ? 1.2 : 1.0);
                juiceTriggered = true;
            }

            if (event.knockOffRaft && event.targetPos) {
                let knockDir = vec3(0, 0, -1);
                if (event.attackerPos) {
                    knockDir = vec3Normalize(vec3Sub(event.targetPos, event.attackerPos));
                }
                ragdoll = this.launchEnemy({
                    enemyId: event.enemyId,
                    enemyType: event.enemyType,
                    origin: event.targetPos,
                    knockbackDir: knockDir,
                    verticalSpeed: event.verticalSpeed ?? 15.0,
                    horizontalSpeed: event.horizontalSpeed ?? 18.0,
                });
            }

            return { juiceTriggered, ragdoll };
        },

        /**
         * Steps all subsystems by real delta time dt.
         * Hit-stop determines timescale for world elements, while camera punch uses unscaled time.
         *
         * @param {number} realDt - Real delta time in seconds.
         * @returns {{ timescale: number, effectiveDt: number, currentFov: number, splashEvents: Array }}
         */
        step(realDt) {
            // 1. Step hit-stop freeze
            const hitStopRes = stepHitStop(hitStop, realDt);

            // 2. Step FOV micro-punch (always stepped with realDt for snappy screen feel)
            const fovRes = stepFovPunch(fovPunch, realDt);

            // 3. Step active ragdolls using effectiveDt (if hit-stop frozen, ragdolls freeze in mid-air!)
            const newSplashEvents = [];
            const toRemove = [];

            for (const [id, ragdoll] of activeRagdolls.entries()) {
                const res = stepRagdollInstance(ragdoll, hitStopRes.effectiveDt);
                if (res.splashedThisStep) {
                    const splashInfo = {
                        id: ragdoll.id,
                        enemyId: ragdoll.enemyId,
                        enemyType: ragdoll.enemyType,
                        position: vec3Copy(ragdoll.splashPosition),
                        velocity: vec3Copy(ragdoll.impactVelocity),
                        tumbleDegrees: ragdoll.tumbleDegrees,
                        flightDuration: ragdoll.flightDuration,
                    };
                    splashEventQueue.push(splashInfo);
                    newSplashEvents.push(splashInfo);
                }
                if (res.despawned) {
                    toRemove.push(id);
                }
            }

            for (const id of toRemove) {
                activeRagdolls.delete(id);
            }

            return {
                timescale: hitStopRes.timescale,
                effectiveDt: hitStopRes.effectiveDt,
                currentFov: fovRes.currentFov,
                fovDelta: fovRes.fovDelta,
                activeRagdollCount: activeRagdolls.size,
                newSplashEvents,
            };
        },

        /**
         * Clears all active ragdolls and resets controllers.
         */
        reset() {
            hitStop.active = false;
            hitStop.timescale = 1.0;
            hitStop.elapsed = 0;
            fovPunch.active = false;
            fovPunch.currentFov = fovPunch.baseFov;
            fovPunch.fovDelta = 0;
            fovPunch.elapsed = 0;
            activeRagdolls.clear();
            splashEventQueue.length = 0;
        },
    };
}
