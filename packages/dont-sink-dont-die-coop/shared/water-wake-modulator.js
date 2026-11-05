/**
 * Don't Sink, Don't Die — Calm-Water Mooring Ripple & Speed-Proportional Wake Modulator
 * (`shared/water-wake-modulator.js`)
 *
 * Sovereign Core & Helmet 04 pure math module:
 * Orchestrates raft hydrodynamics and wake visual profiles across river navigation:
 *   1. High-speed turbulent river sprinting produces wide, bright, opaque V-shaped bow foam ribbons.
 *   2. Approaching calm waters or dropping anchor smoothly attenuates turbulence.
 *   3. When moored on solid sanctuary platforms (`onSolid`) or anchored within Harbor City calm basins
 *      (`inCalmHarbor`), high-speed foam trails completely fade out, transitioning into gentle,
 *      concentric calm-water mooring rings with subtle breathing pulses.
 *
 * Pure deterministic ES module with zero external dependencies and zero global DOM leaks.
 */

// ─── CONFIGURATION CONSTANTS ────────────────────────────────────────────────
export const WAKE_MODULATOR_CONFIG = Object.freeze({
    // Velocity thresholds
    MIN_WAKE_SPEED: 0.6,          // Minimum m/s required to shed physical bow foam
    CRUISING_SPEED: 6.0,          // Standard downstream cruising velocity
    RAPIDS_SPEED: 14.0,           // High-speed whitewater threshold
    MAX_SPEED_CAP: 25.0,          // Top reference speed for maximum foam saturation

    // Wake ribbon profile bounds
    MIN_RIBBON_WIDTH: 0.35,       // Narrowest bow ribbon width (m)
    MAX_RIBBON_WIDTH: 1.85,       // Widest bow ribbon width (m)
    MIN_RIBBON_BRIGHTNESS: 0.25,  // Base turquoise brightness
    MAX_RIBBON_BRIGHTNESS: 1.0,   // Pure white foam crest
    MIN_RIBBON_OPACITY: 0.45,     // Baseline ribbon opacity when moving
    MAX_RIBBON_OPACITY: 1.0,      // Opaque churning whitewater

    // Calm water & mooring ripple parameters
    MOORING_RIPPLE_INTERVAL: 1.2, // Seconds between calm mooring concentric ring pulses
    MOORING_RIPPLE_MIN_RADIUS: 0.6,
    MOORING_RIPPLE_MAX_RADIUS: 3.8,
    MOORING_RIPPLE_EXPANSION_SPEED: 2.2, // Radial expansion rate (m/s)
    MOORING_RIPPLE_OPACITY: 0.55, // Gentle translucent calm-water ripple
    MOORING_RIPPLE_DURATION: 1.8, // Lifespan of each gentle ripple ring

    // Harbor basin geographical defaults (aligned with Harbor City layout)
    DEFAULT_HARBOR_BOUNDS: Object.freeze({
        minX: -40.0,
        maxX: 40.0,
        minZ: -270.0,
        maxZ: -140.0,
    }),
});

/**
 * Wake visual mode enumeration.
 */
export const WAKE_MODES = Object.freeze({
    MOORED_CALM: 'moored_calm',     // On solid dock/platform or anchored in calm harbor
    DRIFTING_IDLE: 'drifting_idle', // Floating on water below foam threshold (< 0.6 m/s)
    CRUISING: 'cruising',           // Standard river transit (0.6 - 14 m/s)
    RAPIDS_SURGE: 'rapids_surge',   // High-velocity torrent (> 14 m/s)
});

// ─── PURE MATH UTILITIES ────────────────────────────────────────────────────

export function clamp(v, min, max) {
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

export function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * Checks whether a given position or (x, z) coordinate lies inside the calm Harbor City basin.
 *
 * @param {object|number} posOrX - Coordinate object { x, z } or x coordinate
 * @param {number} [maybeZ] - z coordinate if posOrX is a number
 * @param {object} [bounds=WAKE_MODULATOR_CONFIG.DEFAULT_HARBOR_BOUNDS] - Harbor boundary limits
 * @returns {boolean} True if inside the calm harbor basin
 */
export function isInHarborBasin(posOrX, maybeZ, bounds = WAKE_MODULATOR_CONFIG.DEFAULT_HARBOR_BOUNDS) {
    let x = 0;
    let z = 0;

    if (posOrX && typeof posOrX === 'object') {
        x = Number.isFinite(posOrX.x) ? posOrX.x : 0;
        z = Number.isFinite(posOrX.z) ? posOrX.z : 0;
    } else if (Number.isFinite(posOrX) && Number.isFinite(maybeZ)) {
        x = posOrX;
        z = maybeZ;
    } else {
        return false;
    }

    return (
        x >= bounds.minX &&
        x <= bounds.maxX &&
        z >= bounds.minZ &&
        z <= bounds.maxZ
    );
}

/**
 * Computes the complete raft wake & calm-water ripple modulation profile.
 *
 * @param {object} params
 * @param {number} [params.speed=0] - Raft velocity magnitude in m/s
 * @param {boolean} [params.onSolid=false] - True if moored on solid sanctuary/dock platform
 * @param {boolean} [params.inCalmHarbor=false] - True if inside calm harbor waters or anchored
 * @param {object} [params.position] - Optional { x, y, z } coordinates (to auto-detect harbor)
 * @param {number} [params.time=0] - Optional game elapsed time (seconds) for ripple phase calculation
 * @param {object} [params.config=WAKE_MODULATOR_CONFIG] - Optional configuration overrides
 * @returns {object} Wake & Ripple modulation profile
 */
export function computeRaftWakeProfile({
    speed = 0,
    onSolid = false,
    inCalmHarbor = false,
    position = null,
    time = 0,
    config = WAKE_MODULATOR_CONFIG,
} = {}) {
    const cfg = config || WAKE_MODULATOR_CONFIG;

    // Sanitize scalar speed
    const rawSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;

    // Detect calm harbor state from explicit flag or position coordinates
    const inHarbor = Boolean(
        inCalmHarbor ||
        (position && isInHarborBasin(position, undefined, cfg.DEFAULT_HARBOR_BOUNDS))
    );

    const isMoored = Boolean(onSolid);
    const isCalmWater = isMoored || inHarbor;

    // Effective wake speed: mooring on solid platforms or resting in calm harbor quells turbulence
    // In calm harbor without being completely onSolid, residual paddling produces dampened wake
    let effectiveWakeSpeed = rawSpeed;
    if (isMoored) {
        effectiveWakeSpeed = 0.0;
    } else if (inHarbor) {
        // Current is dead calm in harbor; wake is strictly dampened to 25% of open river turbulence
        effectiveWakeSpeed = rawSpeed * 0.25;
    }

    // Normalized speed ratio [0..1]
    const speedRatio = clamp(effectiveWakeSpeed / cfg.MAX_SPEED_CAP, 0, 1);
    const hasBowFoam = effectiveWakeSpeed >= cfg.MIN_WAKE_SPEED && !isMoored;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. BOW FOAM WAKE RIBBON PARAMETERS
    // ─────────────────────────────────────────────────────────────────────────
    let ribbonWidth = 0.0;
    let ribbonBrightness = 0.0;
    let ribbonOpacity = 0.0;
    let foamGenerationRate = 0.0;

    if (hasBowFoam) {
        const speedFactor = smoothstep(cfg.MIN_WAKE_SPEED, cfg.MAX_SPEED_CAP, effectiveWakeSpeed);
        ribbonWidth = lerp(cfg.MIN_RIBBON_WIDTH, cfg.MAX_RIBBON_WIDTH, speedRatio);
        ribbonBrightness = lerp(cfg.MIN_RIBBON_BRIGHTNESS, cfg.MAX_RIBBON_BRIGHTNESS, speedRatio);
        ribbonOpacity = lerp(cfg.MIN_RIBBON_OPACITY, cfg.MAX_RIBBON_OPACITY, speedRatio);
        foamGenerationRate = clamp(speedFactor, 0.1, 1.0);

        // Extra dampening when moving slowly inside calm harbor
        if (inHarbor) {
            ribbonOpacity *= 0.45;
            ribbonWidth *= 0.7;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CALM WATER & MOORING RIPPLE PARAMETERS
    // ─────────────────────────────────────────────────────────────────────────
    // Ripples emerge when raft is stationary, moored on solid platform, or anchored in calm harbor.
    // As forward speed increases into a sprint, calm ripples fade out while turbulent foam takes over.
    const speedSuppression = smoothstep(cfg.MIN_WAKE_SPEED, cfg.CRUISING_SPEED, rawSpeed);
    const calmRippleFactor = isMoored ? 1.0 : inHarbor ? Math.max(0.7, 1.0 - speedSuppression) : (1.0 - speedSuppression);

    const emitsCalmRipples = calmRippleFactor > 0.05;
    const rippleOpacity = cfg.MOORING_RIPPLE_OPACITY * calmRippleFactor;

    // Gentle sinusoidal breathing / pulsation phase for idle mooring rings
    const safeTime = Number.isFinite(time) ? time : 0;
    const ripplePulsePhase = (safeTime % cfg.MOORING_RIPPLE_INTERVAL) / cfg.MOORING_RIPPLE_INTERVAL;
    const breathingFactor = 0.85 + 0.15 * Math.sin(safeTime * Math.PI * 2 / cfg.MOORING_RIPPLE_INTERVAL);

    const activeRippleRadius = lerp(
        cfg.MOORING_RIPPLE_MIN_RADIUS,
        cfg.MOORING_RIPPLE_MAX_RADIUS,
        ripplePulsePhase
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 3. WAKE REGIME / MODE CLASSIFICATION
    // ─────────────────────────────────────────────────────────────────────────
    let wakeMode = WAKE_MODES.DRIFTING_IDLE;
    if (isMoored || (inHarbor && rawSpeed < cfg.MIN_WAKE_SPEED)) {
        wakeMode = WAKE_MODES.MOORED_CALM;
    } else if (rawSpeed >= cfg.RAPIDS_SPEED && !inHarbor) {
        wakeMode = WAKE_MODES.RAPIDS_SURGE;
    } else if (rawSpeed >= cfg.MIN_WAKE_SPEED) {
        wakeMode = WAKE_MODES.CRUISING;
    }

    return {
        // High-level operational state
        wakeMode,
        isMoored,
        inCalmHarbor: inHarbor,
        isCalmWater,
        rawSpeed,
        effectiveWakeSpeed,
        speedRatio,

        // High-speed V-shaped bow foam ribbon profile
        foam: {
            active: hasBowFoam,
            width: ribbonWidth,
            brightness: ribbonBrightness,
            opacity: ribbonOpacity,
            generationRate: foamGenerationRate,
            spreadAngleRad: hasBowFoam ? lerp(0.35, 0.85, speedRatio) : 0,
        },

        // Calm water concentric mooring rings profile
        ripples: {
            active: emitsCalmRipples,
            intensity: calmRippleFactor,
            opacity: rippleOpacity,
            currentRadius: activeRippleRadius,
            expansionRate: cfg.MOORING_RIPPLE_EXPANSION_SPEED * calmRippleFactor,
            duration: cfg.MOORING_RIPPLE_DURATION,
            breathingFactor,
            pulsePhase: ripplePulsePhase,
            ringCount: isMoored ? 4 : (inHarbor ? 3 : 2),
            primaryColorHex: inHarbor ? 0x48cae4 : 0x00f5d4, // Deep cyan in harbor, turquoise in wild river
        },
    };
}
