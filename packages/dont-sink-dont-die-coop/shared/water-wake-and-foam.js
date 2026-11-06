/**
 * Don't Sink, Don't Die — Physical Twin Oar Blade Wake, Vortex Rings & Combat Water Slap
 * (`shared/water-wake-and-foam.js`)
 *
 * Videogame Helmet 06 — Synthetic José World-Believability & Immersion Director:
 * Fulfills the sensory promise that water is never a dead, painted floor.
 * When the crew digs their oars into the river, the water violently pushes back:
 *   1. `computeTwinOarBladeWake`:
 *      - Computes exact world-space coordinates of port (left, -1.35m) and starboard (right, +1.35m) oar blades.
 *      - During the Power Pull phase (pullStart..pullEnd), generates paired left & right churning foam bursts
 *        and counter-rotating vortex ring spawn coordinates.
 *      - When `choked = true` (pilot pressed [W] prematurely and yanked blades out), generates an upward
 *        turbulent back-splash burst descriptor that visually explains momentum loss and craft jerk.
 *   2. `computeOarAttackWaterSlap`:
 *      - Computes directional lateral water-spray arcs, outward splash fans, and impulse vectors
 *        when swinging the left or right oar as a weapon over the river.
 *
 * Deterministic pure ES module with zero external dependencies and zero global side-effects.
 */

// ─── CONFIGURATION & PHYSICAL CONSTANTS ─────────────────────────────────────

export const OAR_WAKE_CONFIG = Object.freeze({
    // Physical lateral mounting offsets of the twin oar blades from raft centerline
    PORT_LATERAL_OFFSET: -1.35,      // Port (left) blade distance from centerline (m)
    STARBOARD_LATERAL_OFFSET: 1.35,  // Starboard (right) blade distance from centerline (m)
    DEFAULT_BLADE_BASE_Y: 0.25,      // Water surface baseline height (m)
    DEFAULT_RAFT_RADIUS: 1.25,       // Raft collision & boundary radius

    // Default rhythmic stroke timing (matches public/js/main.js oarStroke parameters)
    DEFAULT_PULL_START: 0.05,        // Start of immersion / power sweep (normalized 0..1 or sec)
    DEFAULT_PULL_END: 0.62,          // End of power sweep before blade feathering & recovery
    DEFAULT_STROKE_DURATION: 0.84,   // Full stroke duration in seconds

    // Longitudinal (Z) blade travel during stroke relative to raft center
    CATCH_LONGITUDINAL_Z: -0.65,     // Blade reaches forward towards bow (-Z) at catch
    RELEASE_LONGITUDINAL_Z: 0.85,    // Blade finishes sweep aft towards stern (+Z) at release
    BLADE_MAX_DIP_DEPTH: 0.38,       // Max vertical depth blade penetrates under water surface (m)

    // Vortex ring hydrodynamics
    VORTEX_RING_INITIAL_RADIUS: 0.28,
    VORTEX_RING_EXPANSION_RATE: 1.45,
    VORTEX_RING_LIFETIME: 0.75,

    // Choked stroke penalty splash
    CHOKED_SPLASH_PARTICLES: 14,
    CHOKED_BACK_SPLASH_VELOCITY_Y: 3.8,
    CHOKED_BACK_SPLASH_SPREAD: 1.25,

    // Oar attack water slap geometry
    SWING_ARC_RADIUS: 2.15,
    SWING_SPRAY_SECTORS: 7,
    SWING_SPRAY_ARC_RAD: Math.PI * 0.45,
});

// ─── PURE VECTOR & MATH UTILITIES ───────────────────────────────────────────

export function clamp(v, min, max) {
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Normalizes vector { x, z } in the horizontal river plane.
 */
export function normalize2D(x, z) {
    const len = Math.hypot(x, z);
    if (len < 1e-6) return { x: 0, z: 0 };
    return { x: x / len, z: z / len };
}

/**
 * Computes forward and right unit vectors given raft yaw angle.
 * In this engine:
 *   - Raft forward is local -Z (heading = { x: -sin(yaw), z: -cos(yaw) })
 *   - Raft right (+X) is { x: cos(yaw), z: -sin(yaw) }
 */
export function getRaftOrientationVectors(yaw = 0) {
    const safeYaw = Number.isFinite(yaw) ? yaw : 0;
    const sinY = Math.sin(safeYaw);
    const cosY = Math.cos(safeYaw);

    const fX = -sinY;
    const fZ = -cosY;
    const rX = cosY;
    const rZ = -sinY;

    // Forward vector (-Z in local raft space), sanitize -0 to +0
    const forward = {
        x: Object.is(fX, -0) ? 0 : fX,
        z: Object.is(fZ, -0) ? 0 : fZ,
    };

    // Right normal vector (+X in local raft space)
    const right = {
        x: Object.is(rX, -0) ? 0 : rX,
        z: Object.is(rZ, -0) ? 0 : rZ,
    };

    return { forward, right, yaw: safeYaw };
}

/**
 * Transforms a local raft coordinate { x, y, z } into world-space coordinates.
 */
export function transformLocalToWorld(localPoint, raftPos, yaw) {
    const { forward, right } = getRaftOrientationVectors(yaw);
    const rx = Number.isFinite(raftPos?.x) ? raftPos.x : 0;
    const ry = Number.isFinite(raftPos?.y) ? raftPos.y : 0.25;
    const rz = Number.isFinite(raftPos?.z) ? raftPos.z : 0;

    const lx = Number.isFinite(localPoint?.x) ? localPoint.x : 0;
    const ly = Number.isFinite(localPoint?.y) ? localPoint.y : 0;
    const lz = Number.isFinite(localPoint?.z) ? localPoint.z : 0;

    // Local -Z is forward, local +Z is aft (-forward)
    // Local +X is right, local -X is left (-right)
    const worldX = rx + right.x * lx - forward.x * lz;
    const worldY = ry + ly;
    const worldZ = rz + right.z * lx - forward.z * lz;

    return {
        x: Math.round(worldX * 1000) / 1000,
        y: Math.round(worldY * 1000) / 1000,
        z: Math.round(worldZ * 1000) / 1000,
    };
}

// ─── 1. TWIN OAR BLADE WAKE & CHOKED PENALTY GENERATOR ──────────────────────

/**
 * Computes the exact world-space positions of the port (left) and starboard (right)
 * oar blades in the water during rhythmic stroke arcs, generating paired foam bursts,
 * vortex rings, and choked-stroke back-splashes.
 *
 * @param {object} [params={}]
 * @param {object} [params.raftPos] - Raft position { x, y, z }
 * @param {number} [params.raftYaw=0] - Raft yaw heading angle (radians)
 * @param {number} [params.strokeElapsed=0] - Seconds or phase elapsed in stroke
 * @param {number} [params.pullStart=0.05] - Stroke normalized phase where power pull starts
 * @param {number} [params.pullEnd=0.62] - Stroke normalized phase where power pull ends
 * @param {boolean} [params.choked=false] - True if stroke was cancelled prematurely by fast [W] tap
 * @param {number} [params.duration=0.84] - Total stroke cycle duration in seconds
 * @param {number} [params.raftSpeed=0] - Forward velocity of raft (m/s)
 * @returns {object} Twin oar blade hydrodynamics and wake/foam payload
 */
export function computeTwinOarBladeWake(params = {}) {
    const p = (params && typeof params === 'object') ? params : {};
    const raftPos = p.raftPos || { x: 0, y: 0.25, z: 0 };
    const raftYaw = p.raftYaw ?? 0;
    const strokeElapsed = p.strokeElapsed ?? 0;
    const pullStart = p.pullStart ?? OAR_WAKE_CONFIG.DEFAULT_PULL_START;
    const pullEnd = p.pullEnd ?? OAR_WAKE_CONFIG.DEFAULT_PULL_END;
    const choked = p.choked ?? false;
    const duration = p.duration ?? OAR_WAKE_CONFIG.DEFAULT_STROKE_DURATION;
    const raftSpeed = p.raftSpeed ?? 0;

    const rx = Number.isFinite(raftPos?.x) ? raftPos.x : 0;
    const ry = Number.isFinite(raftPos?.y) ? raftPos.y : OAR_WAKE_CONFIG.DEFAULT_BLADE_BASE_Y;
    const rz = Number.isFinite(raftPos?.z) ? raftPos.z : 0;
    const yaw = Number.isFinite(raftYaw) ? raftYaw : 0;
    const rawElapsed = Number.isFinite(strokeElapsed) ? Math.max(0, strokeElapsed) : 0;
    const strokeDur = Number.isFinite(duration) && duration > 0 ? duration : OAR_WAKE_CONFIG.DEFAULT_STROKE_DURATION;

    // Normalized stroke progress [0..1]
    const strokeProgress = clamp(rawElapsed / strokeDur, 0, 1);
    const pStart = clamp(Number.isFinite(pullStart) ? pullStart : OAR_WAKE_CONFIG.DEFAULT_PULL_START, 0, 0.9);
    const pEnd = clamp(Number.isFinite(pullEnd) ? pullEnd : OAR_WAKE_CONFIG.DEFAULT_PULL_END, pStart + 0.05, 1.0);

    const isChoked = Boolean(choked);
    const inPowerPull = !isChoked && strokeProgress >= pStart && strokeProgress <= pEnd;

    // Calculate longitudinal sweep position Z along raft axis
    // 0 -> Catch (reaching forward -Z), 1 -> Finish (swept aft +Z)
    let localLongitudinalZ = 0;
    let localDipY = 0;
    let bladeImmersion = 0; // 0 = out of water, 1 = fully immersed

    if (strokeProgress < pStart) {
        // Catch phase: blade enters water
        const t = strokeProgress / Math.max(1e-4, pStart);
        localLongitudinalZ = lerp(OAR_WAKE_CONFIG.CATCH_LONGITUDINAL_Z * 0.7, OAR_WAKE_CONFIG.CATCH_LONGITUDINAL_Z, t);
        localDipY = -OAR_WAKE_CONFIG.BLADE_MAX_DIP_DEPTH * Math.sin(t * Math.PI * 0.5);
        bladeImmersion = t * 0.6;
    } else if (strokeProgress <= pEnd) {
        // Power Pull phase: full immersion, sweeping back vigorously
        const t = (strokeProgress - pStart) / Math.max(1e-4, pEnd - pStart);
        localLongitudinalZ = lerp(OAR_WAKE_CONFIG.CATCH_LONGITUDINAL_Z, OAR_WAKE_CONFIG.RELEASE_LONGITUDINAL_Z, t);
        localDipY = -OAR_WAKE_CONFIG.BLADE_MAX_DIP_DEPTH * (0.85 + 0.15 * Math.sin(t * Math.PI));
        bladeImmersion = 1.0;
    } else {
        // Recovery phase: blade feathered above water returning to catch
        const t = (strokeProgress - pEnd) / Math.max(1e-4, 1.0 - pEnd);
        localLongitudinalZ = lerp(OAR_WAKE_CONFIG.RELEASE_LONGITUDINAL_Z, OAR_WAKE_CONFIG.CATCH_LONGITUDINAL_Z * 0.7, t);
        localDipY = 0.15 * Math.sin(t * Math.PI); // Lifts above water surface
        bladeImmersion = 0.0;
    }

    if (isChoked) {
        // Choked stroke: premature yank yanks blades violently upward with erratic slap
        localDipY = 0.22;
        bladeImmersion = 0.0;
    }

    // Local blade coordinates (lateral offset: port -1.35m, starboard +1.35m)
    const leftLocal = {
        x: OAR_WAKE_CONFIG.PORT_LATERAL_OFFSET,
        y: localDipY,
        z: localLongitudinalZ,
    };

    const rightLocal = {
        x: OAR_WAKE_CONFIG.STARBOARD_LATERAL_OFFSET,
        y: localDipY,
        z: localLongitudinalZ,
    };

    // Transform blade coordinates to world space
    const leftPaddlePos = transformLocalToWorld(leftLocal, { x: rx, y: ry, z: rz }, yaw);
    const rightPaddlePos = transformLocalToWorld(rightLocal, { x: rx, y: ry, z: rz }, yaw);

    const { forward, right } = getRaftOrientationVectors(yaw);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. POWER PULL FOAM BURSTS & VORTEX RINGS
    // ─────────────────────────────────────────────────────────────────────────
    let pairedFoamBursts = null;
    let vortexRings = null;

    if (inPowerPull) {
        const pullProgress = (strokeProgress - pStart) / (pEnd - pStart);
        // Power peaks in the middle of the stroke sweep
        const sweepIntensity = Math.sin(pullProgress * Math.PI);
        const speedBonus = clamp(raftSpeed / 10, 0, 1);
        const burstVolume = 0.7 + 0.3 * sweepIntensity + 0.4 * speedBonus;

        // Foam burst positions follow the trailing edge of the blade
        const trailOffset = 0.18;
        const leftFoamPos = {
            x: Math.round((leftPaddlePos.x + forward.x * trailOffset) * 1000) / 1000,
            y: Math.max(0.24, leftPaddlePos.y),
            z: Math.round((leftPaddlePos.z + forward.z * trailOffset) * 1000) / 1000,
        };
        const rightFoamPos = {
            x: Math.round((rightPaddlePos.x + forward.x * trailOffset) * 1000) / 1000,
            y: Math.max(0.24, rightPaddlePos.y),
            z: Math.round((rightPaddlePos.z + forward.z * trailOffset) * 1000) / 1000,
        };

        pairedFoamBursts = {
            active: true,
            intensity: Math.round(burstVolume * 100) / 100,
            pullProgress: Math.round(pullProgress * 100) / 100,
            particleCount: Math.round(8 + 8 * burstVolume),
            left: {
                position: leftFoamPos,
                lateralSide: 'port',
                churnNormal: { x: -right.x, z: -right.z }, // Pushes water laterally outward
                foamRadius: Math.round((0.45 + 0.35 * sweepIntensity) * 100) / 100,
                opacity: 0.95,
            },
            right: {
                position: rightFoamPos,
                lateralSide: 'starboard',
                churnNormal: { x: right.x, z: right.z }, // Pushes water laterally outward
                foamRadius: Math.round((0.45 + 0.35 * sweepIntensity) * 100) / 100,
                opacity: 0.95,
            },
        };

        // Vortex ring coordinates shed backward from blade tip into the river column
        vortexRings = [
            {
                side: 'port',
                position: { ...leftFoamPos, y: OAR_WAKE_CONFIG.DEFAULT_BLADE_BASE_Y },
                normal: { x: forward.x, y: 0, z: forward.z }, // Propulsive reaction thrust axis
                swirlDirection: 1, // Counter-clockwise vortex
                radius: OAR_WAKE_CONFIG.VORTEX_RING_INITIAL_RADIUS,
                lifetime: OAR_WAKE_CONFIG.VORTEX_RING_LIFETIME,
                strength: Math.round(burstVolume * 100) / 100,
            },
            {
                side: 'starboard',
                position: { ...rightFoamPos, y: OAR_WAKE_CONFIG.DEFAULT_BLADE_BASE_Y },
                normal: { x: forward.x, y: 0, z: forward.z },
                swirlDirection: -1, // Clockwise vortex
                radius: OAR_WAKE_CONFIG.VORTEX_RING_INITIAL_RADIUS,
                lifetime: OAR_WAKE_CONFIG.VORTEX_RING_LIFETIME,
                strength: Math.round(burstVolume * 100) / 100,
            },
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CHOKED / CANCELLED STROKE BACK-SPLASH BURST
    // ─────────────────────────────────────────────────────────────────────────
    let backSplash = null;
    if (isChoked) {
        // When cancelled early, blades break water surface creating an upward turbulent plume
        backSplash = {
            active: true,
            reason: 'fast_press_cancel',
            message: 'Stroke cancelled early — upward turbulent back-splash generated',
            particleCount: OAR_WAKE_CONFIG.CHOKED_SPLASH_PARTICLES,
            velocity: {
                x: 0,
                y: OAR_WAKE_CONFIG.CHOKED_BACK_SPLASH_VELOCITY_Y,
                z: 0.8, // Spray ejects slightly forward as momentum halts
            },
            leftOrigin: leftPaddlePos,
            rightOrigin: rightPaddlePos,
            spraySpreadRadius: OAR_WAKE_CONFIG.CHOKED_BACK_SPLASH_SPREAD,
            viscosityChurn: 0.85,
        };
    }

    return {
        // High-level stroke state
        strokeElapsed: rawElapsed,
        strokeProgress: Math.round(strokeProgress * 1000) / 1000,
        inPowerPull,
        choked: isChoked,
        bladeImmersion: Math.round(bladeImmersion * 100) / 100,

        // Blade world-space coordinates
        leftPaddle: leftPaddlePos,
        rightPaddle: rightPaddlePos,

        // Lateral and longitudinal offsets
        portOffset: OAR_WAKE_CONFIG.PORT_LATERAL_OFFSET,
        starboardOffset: OAR_WAKE_CONFIG.STARBOARD_LATERAL_OFFSET,
        localZ: Math.round(localLongitudinalZ * 1000) / 1000,
        localDipY: Math.round(localDipY * 1000) / 1000,

        // Visual answers to physical actions
        pairedFoamBursts,
        vortexRings,
        backSplash,
    };
}

// ─── 2. OAR ATTACK DIRECTIONAL WATER SLAP ───────────────────────────────────

/**
 * Computes a directional lateral water-spray arc when swinging the left or right oar
 * over the river surface as a melee weapon.
 *
 * @param {object} [params={}]
 * @param {object} [params.raftPos] - Raft position { x, y, z }
 * @param {number} [params.raftYaw=0] - Raft yaw heading angle (radians)
 * @param {string} [params.swingSide='right'] - 'left' or 'right' oar swing
 * @param {number} [params.swingProgress=0.5] - Normalized progress through weapon swing [0..1]
 * @param {number} [params.waterLevel=0.25] - Water surface level (m)
 * @returns {object} Water slap and lateral spray arc profile
 */
export function computeOarAttackWaterSlap(params = {}) {
    const p = (params && typeof params === 'object') ? params : {};
    const raftPos = p.raftPos || { x: 0, y: 0.25, z: 0 };
    const raftYaw = p.raftYaw ?? 0;
    const swingSide = p.swingSide ?? 'right';
    const swingProgress = p.swingProgress ?? 0.5;
    const waterLevel = p.waterLevel ?? OAR_WAKE_CONFIG.DEFAULT_BLADE_BASE_Y;

    const rx = Number.isFinite(raftPos?.x) ? raftPos.x : 0;
    const ry = Number.isFinite(raftPos?.y) ? raftPos.y : waterLevel;
    const rz = Number.isFinite(raftPos?.z) ? raftPos.z : 0;
    const yaw = Number.isFinite(raftYaw) ? raftYaw : 0;
    const progress = clamp(Number.isFinite(swingProgress) ? swingProgress : 0.5, 0, 1);
    const side = swingSide === 'left' ? 'left' : 'right';
    const sideMultiplier = side === 'left' ? -1 : 1;

    const { forward, right } = getRaftOrientationVectors(yaw);

    // Strike arc sweeps from forward-lateral to aft-lateral
    // swingProgress = 0: wound up, 0.5: apex impact with water/air, 1.0: follow-through
    const arcAngleRad = lerp(-Math.PI * 0.25, Math.PI * 0.55, progress) * sideMultiplier;

    // Strike apex creates maximum water slap at middle of arc (0.35..0.75)
    const slapIntensity = Math.sin(progress * Math.PI);
    const touchesWater = slapIntensity > 0.4;

    // Compute weapon tip position along swing arc
    const arcRadius = OAR_WAKE_CONFIG.SWING_ARC_RADIUS;
    const localX = sideMultiplier * (0.8 + 0.9 * Math.cos(arcAngleRad));
    const localZ = -0.4 + 1.2 * Math.sin(arcAngleRad);
    // Tip dips towards water at impact apex
    const localY = touchesWater ? -0.15 * slapIntensity : 0.25 * (1.0 - slapIntensity);

    const tipWorldPos = transformLocalToWorld(
        { x: localX, y: localY, z: localZ },
        { x: rx, y: ry, z: rz },
        yaw
    );

    // Lateral spray impulse direction: pushes outward and in direction of swing
    const impulseDirX = right.x * sideMultiplier * 0.8 + forward.x * 0.6;
    const impulseDirZ = right.z * sideMultiplier * 0.8 + forward.z * 0.6;
    const normImpulse = normalize2D(impulseDirX, impulseDirZ);

    // Compute fan of spray particles along arc
    const sprayParticles = [];
    if (touchesWater) {
        const sectorCount = OAR_WAKE_CONFIG.SWING_SPRAY_SECTORS;
        for (let i = 0; i < sectorCount; i++) {
            const frac = (i / (sectorCount - 1)) - 0.5; // -0.5 to 0.5
            const sprayAngle = arcAngleRad + frac * OAR_WAKE_CONFIG.SWING_SPRAY_ARC_RAD;

            const speed = lerp(4.5, 9.2, slapIntensity) * (0.8 + 0.4 * Math.random());
            sprayParticles.push({
                index: i,
                position: { ...tipWorldPos, y: waterLevel },
                velocity: {
                    x: Math.round((normImpulse.x * speed + right.x * frac * 2.5) * 100) / 100,
                    y: Math.round((2.2 * slapIntensity + 1.2 * (1.0 - Math.abs(frac))) * 100) / 100,
                    z: Math.round((normImpulse.z * speed + right.z * frac * 2.5) * 100) / 100,
                },
                size: Math.round((0.15 + 0.12 * slapIntensity) * 100) / 100,
                opacity: 0.9,
            });
        }
    }

    return {
        side,
        swingProgress: progress,
        slapIntensity: Math.round(slapIntensity * 100) / 100,
        touchesWater,
        impactPoint: tipWorldPos,
        arcAngleRad: Math.round(arcAngleRad * 1000) / 1000,
        sprayImpulseVector: {
            x: Math.round(normImpulse.x * 1000) / 1000,
            y: touchesWater ? 0.35 : 0,
            z: Math.round(normImpulse.z * 1000) / 1000,
        },
        sprayParticles,
        sprayParticleCount: sprayParticles.length,
    };
}
