/**
 * Deliberate River Pacing, Calm Eddies & Drop-Anchor Hydrodynamics
 * (`shared/river-pacing-and-eddies.js`)
 *
 * Enforces Helmet 01 (The Cockpit Pilot) & Sovereign Core Architecture:
 * Replaces the relentless high-speed conveyor belt with tactical hydrodynamics:
 * 1. Gentle Main-Channel Drift:
 *    - Replaces the frantic baseCurrent (~100 force) with a deliberate, tactical ~26-34 force drift,
 *      allowing pilots to maneuver, line up shots, and engage hazards intentionally.
 * 2. Harbor City Basin Zero-Current Sanctuary:
 *    - Full zero-current calm water inside the Harbor City Basin (z = -135 to -275).
 *    - Allows crews to safely dock, browse the armory shop, trigger banter, and repair without drifting.
 * 3. Mid-River Island Eddy Shelters:
 *    - Downstream wake shadow behind mid-river islands (e.g. sandbars, crab islands, rock outcroppings)
 *      creates zero-current calm eddies for tactical resting and ambush setups.
 * 4. Shoreline Near-Bank Velocity Damping:
 *    - Reduced current along left/right bank margins (default 15m shores or configurable bank width)
 *      to ensure effortless platform landing, secret docking, and bank combat.
 * 5. Player-Controlled Drop Anchor:
 *    - Player-toggled drop anchor state (`anchorDropped`) instantly halts downriver drift
 *      with smooth drag stabilization so crews can pause, shop, plan, and catch their breath.
 *
 * Zero DOM / window / Three.js global leaks. Pure deterministic ES module.
 */

import { RIVER, clamp } from './game-core.js';

/**
 * Tactical pacing zones and hydrodynamics configuration.
 */
export const PACING_ZONES = Object.freeze({
    // Gentle main channel drift force range (N)
    MAIN_CHANNEL: Object.freeze({
        MIN_FORCE: 26.0,
        MAX_FORCE: 34.0,
        DEFAULT_BASE_FORCE: 30.0,
        // Wave scaling factor: slight increase per wave progression while staying controlled
        WAVE_FORCE_SCALE: 0.8, // +0.8 force per wave (e.g., Wave 1 = 26.8, Wave 10 = 34.0)
    }),

    // Harbor City Basin calm water sanctuary
    HARBOR_BASIN: Object.freeze({
        Z_START: -135,
        Z_END: -275, // downstream (more negative)
        MIN_Z: -275,
        MAX_Z: -135,
        CURRENT_FORCE: 0.0, // Dead calm water
    }),

    // Near-bank shore damping zones
    BANK_DAMPING: Object.freeze({
        SHORE_WIDTH: 15.0, // 15m shores along left/right banks
        MIN_CURRENT_RATIO: 0.25, // Current drops to 25% at extreme river edge
        DEFAULT_CHANNEL_WIDTH: RIVER.width || 30.0,
    }),

    // Mid-river island eddy slipstream configuration
    ISLAND_EDDY: Object.freeze({
        DEFAULT_SHADOW_LENGTH: 22.0, // Downriver calm slipstream length behind island (-z)
        DEFAULT_WIDTH_FACTOR: 1.3,   // Lateral buffer around island radius
        DEFAULT_ISLAND_RADIUS: 6.0,  // Standard sandbar/island radius
    }),

    // Drop anchor drag and stabilization
    ANCHOR: Object.freeze({
        HOLD_FORCE: 0.0,             // Zero river current force when anchor is dropped
        DRAG_MULTIPLIER: 4.5,        // Rapid velocity settling when anchored
        MIN_SETTLE_SPEED: 0.05,      // Speed below which velocity snaps to 0
    }),

    // Helmet 03 (Pacing, Narrative & Essence): Pre-motor tension curve and costado eddy margins
    ESSENCE_PACING: Object.freeze({
        PRE_MOTOR_CURRENT_SCALE: 0.14,      // Deliberate ~0.95 m/s drift for oar-powered rafts
        POST_MOTOR_CURRENT_SCALE: 0.28,     // Outboard motor cruising current scale
        EARLY_PURSUIT_SPEED_CAP: 3.3,       // Grounded White Guy early pursuit cap (~3.3 m/s)
        MOTOR_PURSUIT_SPEED_CAP: 15.0,      // Full pursuit speed once outboard motor is equipped
        COSTADO_THRESHOLD_RATIO: 0.72,      // |x| > channelHalfWidth * 0.72 defines costado shelter
        COSTADO_MIN_RELIEF_FACTOR: 0.20,    // Residual current factor at extreme vegetation edge
        TIMED_OAR_SPEED_MIN: 4.8,           // Velocity lower bound of clean, timed oar strokes (m/s)
        TIMED_OAR_SPEED_MAX: 6.0,           // Velocity upper bound of clean, timed oar strokes (m/s)
        CYCLE_LENGTH_Z: 140.0,              // Z interval of full tension cycle (quiet -> threat -> scramble -> breather)
    }),
});

/**
 * Tension curve phases for pre-motor river navigation.
 */
export const TENSION_PHASES = Object.freeze({
    QUIET: 'quiet',
    THREAT: 'threat',
    SCRAMBLE: 'scramble',
    BREATHER: 'breather',
    MOTOR_CRUISING: 'motor_cruising',
});

/**
 * Checks if a given coordinate lies inside the Harbor City Basin calm water zone.
 *
 * @param {number} z - River Z coordinate
 * @returns {boolean} True if inside harbor basin
 */
export function isInHarborBasin(z) {
    if (typeof z !== 'number' || !Number.isFinite(z)) return false;
    const minZ = Math.min(PACING_ZONES.HARBOR_BASIN.MIN_Z, PACING_ZONES.HARBOR_BASIN.MAX_Z);
    const maxZ = Math.max(PACING_ZONES.HARBOR_BASIN.MIN_Z, PACING_ZONES.HARBOR_BASIN.MAX_Z);
    return z >= minZ && z <= maxZ;
}

/**
 * Checks if a given position falls in the downriver calm eddy shadow of an island.
 *
 * @param {number} x - Craft X coordinate
 * @param {number} z - Craft Z coordinate
 * @param {Array<object>} islands - Array of island entities [{ x, z, radius?, shadowLength? }]
 * @returns {boolean} True if craft is shielded by an island eddy
 */
export function isInIslandEddy(x, z, islands = []) {
    if (!Array.isArray(islands) || islands.length === 0) return false;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

    for (const island of islands) {
        if (!island || typeof island.x !== 'number' || typeof island.z !== 'number') continue;
        const radius = island.radius ?? PACING_ZONES.ISLAND_EDDY.DEFAULT_ISLAND_RADIUS;
        const shadowLength = island.shadowLength ?? PACING_ZONES.ISLAND_EDDY.DEFAULT_SHADOW_LENGTH;
        const widthFactor = island.widthFactor ?? PACING_ZONES.ISLAND_EDDY.DEFAULT_WIDTH_FACTOR;

        const effectiveWidth = radius * widthFactor;
        const dx = Math.abs(x - island.x);

        // Island shadow extends downriver in negative Z (z is more negative than island.z)
        // Check if inside the island's circular core or behind in its wake shadow
        if (dx <= effectiveWidth) {
            // Directly on/near island body:
            const inCircle = (dx * dx + (z - island.z) * (z - island.z)) <= (radius * radius);
            // Downriver wake shadow: island.z >= z >= island.z - shadowLength
            const inWake = (z <= island.z && z >= (island.z - shadowLength));

            if (inCircle || inWake) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Computes the near-bank damping factor (0.25 to 1.0) based on distance to the shores.
 *
 * @param {number} x - Craft X position
 * @param {number} halfWidth - River half width
 * @param {number} shoreWidth - Bank margin width (default 15m)
 * @returns {number} Multiplier in [0.25, 1.0]
 */
export function computeBankCurrentFactor(x, halfWidth, shoreWidth = PACING_ZONES.BANK_DAMPING.SHORE_WIDTH) {
    if (!Number.isFinite(x) || halfWidth <= 0) return 1.0;
    const absX = Math.abs(x);
    if (absX >= halfWidth) return 0.0; // Outside channel

    const distanceToBank = halfWidth - absX;
    if (distanceToBank >= shoreWidth) {
        return 1.0; // In deep central channel
    }

    // Linearly interpolate between MIN_CURRENT_RATIO (at bank edge) and 1.0 (at shore boundary)
    const t = clamp(distanceToBank / shoreWidth, 0.0, 1.0);
    const minRatio = PACING_ZONES.BANK_DAMPING.MIN_CURRENT_RATIO;
    return minRatio + (1.0 - minRatio) * t;
}

/**
 * Computes the local river current force vector at a specified craft position.
 *
 * Replaces high-speed conveyor belt physics with deliberate tactical pacing:
 * - Gentle base drift (~26-34 force downriver).
 * - Zero current inside the Harbor City Basin (z = -135 to -275).
 * - Zero current in island eddy shadows.
 * - Dampened current near shoreline banks (15m shores).
 * - Zero current when dropped anchor is deployed or craft is on solid ground.
 *
 * @param {object} options
 * @param {number} options.x - Craft X position
 * @param {number} options.z - Craft Z position
 * @param {number} [options.wave=1] - Current wave number (1..10)
 * @param {number} [options.riverWidth=30] - Total channel width
 * @param {boolean} [options.onSolid=false] - Whether craft is resting on solid pier/obstacle
 * @param {boolean} [options.anchorDropped=false] - Whether raft anchor is deployed
 * @param {Array<object>} [options.islands=[]] - Mid-river island obstacles creating calm eddies
 * @param {number} [options.customBaseForce] - Optional manual override for base channel drift force
 * @returns {{ forceX: number, forceZ: number, magnitude: number, zone: string, isCalm: boolean, anchorActive: boolean }}
 */
export function computeLocalRiverCurrent({
    x = 0,
    z = 0,
    wave = 1,
    riverWidth = PACING_ZONES.BANK_DAMPING.DEFAULT_CHANNEL_WIDTH,
    onSolid = false,
    anchorDropped = false,
    islands = [],
    customBaseForce = null,
} = {}) {
    // 1. Solid surface docking or anchor dropped halts all downriver drift immediately
    if (onSolid || anchorDropped) {
        return {
            forceX: 0,
            forceZ: 0,
            magnitude: 0,
            zone: anchorDropped ? 'anchored' : 'solid',
            isCalm: true,
            anchorActive: Boolean(anchorDropped),
        };
    }

    const halfWidth = riverWidth * 0.5;

    // 2. Channel bounds check: if outside river width, current is zero
    if (Math.abs(x) >= halfWidth) {
        return {
            forceX: 0,
            forceZ: 0,
            magnitude: 0,
            zone: 'out-of-bounds',
            isCalm: true,
            anchorActive: false,
        };
    }

    // 3. Harbor City Basin sanctuary: dead calm water (z = -135 to -275)
    if (isInHarborBasin(z)) {
        return {
            forceX: 0,
            forceZ: 0,
            magnitude: 0,
            zone: 'harbor-basin',
            isCalm: true,
            anchorActive: false,
        };
    }

    // 4. Mid-river island wake shadow: calm eddy zone
    if (isInIslandEddy(x, z, islands)) {
        return {
            forceX: 0,
            forceZ: 0,
            magnitude: 0,
            zone: 'island-eddy',
            isCalm: true,
            anchorActive: false,
        };
    }

    // 5. Calculate base gentle main-channel drift force (~26-34 force)
    let baseForce;
    if (typeof customBaseForce === 'number' && Number.isFinite(customBaseForce)) {
        baseForce = customBaseForce;
    } else {
        const clampedWave = clamp(Number.isFinite(wave) ? wave : 1, 1, 10);
        // Base force scales gently from 26.0 (wave 1) to 34.0 (wave 10)
        baseForce = PACING_ZONES.MAIN_CHANNEL.MIN_FORCE + (clampedWave - 1) * PACING_ZONES.MAIN_CHANNEL.WAVE_FORCE_SCALE;
        baseForce = clamp(baseForce, PACING_ZONES.MAIN_CHANNEL.MIN_FORCE, PACING_ZONES.MAIN_CHANNEL.MAX_FORCE);
    }

    // 6. Near-bank damping factor along shores
    const bankFactor = computeBankCurrentFactor(x, halfWidth, PACING_ZONES.BANK_DAMPING.SHORE_WIDTH);
    const finalMagnitude = baseForce * bankFactor;

    // Downriver direction is -z in canonical world space
    const forceZ = -finalMagnitude;
    const forceX = 0; // Pure downriver stream (tangential eddy swirls handled by hazards if present)

    const isNearBank = bankFactor < 0.999;
    const zone = isNearBank ? 'near-bank' : 'main-channel';

    return {
        forceX,
        forceZ,
        magnitude: finalMagnitude,
        zone,
        isCalm: finalMagnitude < 0.001,
        anchorActive: false,
    };
}

/**
 * Toggles or updates the player's raft drop-anchor state.
 *
 * When dropped:
 * - Sets playerState.anchorDropped = true
 * - Records anchorDropTime
 * - Stabilizes forward/lateral drift
 *
 * When raised:
 * - Sets playerState.anchorDropped = false
 *
 * @param {object} playerState - Authoritative player state object
 * @param {object} [options]
 * @param {boolean} [options.forceState] - Explicitly set anchor state instead of toggling
 * @param {number} [options.timestamp=Date.now()] - Timestamp of toggle event
 * @returns {{ anchorDropped: boolean, toggled: boolean, timestamp: number }} Result report
 */
export function toggleRaftAnchor(playerState, options = {}) {
    if (!playerState || typeof playerState !== 'object') {
        return { anchorDropped: false, toggled: false, timestamp: options.timestamp ?? Date.now() };
    }

    const currentAnchor = Boolean(playerState.anchorDropped);
    const nextAnchor = typeof options.forceState === 'boolean' ? options.forceState : !currentAnchor;
    const timestamp = options.timestamp ?? Date.now();

    playerState.anchorDropped = nextAnchor;
    playerState.anchorTimestamp = timestamp;

    // If anchor is dropped and player has a velocity vector, apply anchor braking stabilization
    if (nextAnchor && playerState.velocity && typeof playerState.velocity === 'object') {
        playerState.velocity.x = (playerState.velocity.x || 0) * 0.2;
        playerState.velocity.z = (playerState.velocity.z || 0) * 0.2;
    }

    return {
        anchorDropped: nextAnchor,
        toggled: currentAnchor !== nextAnchor,
        timestamp,
    };
}

/**
 * Computes pre-motor rowing pacing, tension phase, and enemy pursuit speed caps.
 *
 * Enforces Helmet 03 (Synthetic José Pacing, Narrative & Essence Director):
 * Models the Quiet -> Threat -> Scramble -> Breather survival tension curve:
 * 1. Pre-motor open water uses a deliberate `currentScale = 0.14` (~0.95 m/s drift)
 *    and caps early-game White Guy pursuit speed at ~3.3 m/s so timed oar pulls
 *    (~4.8-6.0 m/s) beat him while choked/spammed strokes lose ground.
 * 2. Post-motor (`hasMotor = true`) transitions cleanly to `currentScale = 0.28`
 *    and full pursuit speed.
 *
 * @param {object} [options]
 * @param {number} [options.z=0] - World Z coordinate of craft (progressing into negative Z)
 * @param {boolean} [options.hasMotor=false] - Whether outboard motor upgrade is active
 * @param {number} [options.strokeCadence=0] - Oar strokes per second (ideal 1.0 - 1.4 Hz)
 * @param {number} [options.chokedRatio=0] - Ratio of short/spammed strokes (0.0 to 1.0)
 * @returns {{ currentScale: number, enemyPursuitSpeedCap: number, breatherActive: boolean, tensionPhase: string }}
 */
export function computePreMotorRowingPacing({
    z = 0,
    hasMotor = false,
    strokeCadence = 0,
    chokedRatio = 0,
} = {}) {
    const safeZ = Number.isFinite(z) ? z : 0;
    const safeCadence = Number.isFinite(strokeCadence) ? Math.max(0, strokeCadence) : 0;
    const safeChoked = Number.isFinite(chokedRatio) ? clamp(chokedRatio, 0.0, 1.0) : 0.0;

    // Post-motor: engine powers through, leaving oar-rhythm curve behind
    if (hasMotor) {
        return {
            currentScale: PACING_ZONES.ESSENCE_PACING.POST_MOTOR_CURRENT_SCALE,
            enemyPursuitSpeedCap: PACING_ZONES.ESSENCE_PACING.MOTOR_PURSUIT_SPEED_CAP,
            breatherActive: false,
            tensionPhase: TENSION_PHASES.MOTOR_CRUISING,
        };
    }

    // Pre-motor: Deliberate river drift scale (0.14 = ~0.95 m/s)
    const currentScale = PACING_ZONES.ESSENCE_PACING.PRE_MOTOR_CURRENT_SCALE;

    // Harbor basin is an absolute calm sanctuary / breather
    if (isInHarborBasin(safeZ)) {
        return {
            currentScale: 0.0,
            enemyPursuitSpeedCap: 0.0,
            breatherActive: true,
            tensionPhase: TENSION_PHASES.BREATHER,
        };
    }

    // Determine tension phase along the river course:
    // River distance progresses in negative Z from 0 to -1500+
    // Repeatable survival rhythm: Quiet (40%) -> Threat (25%) -> Scramble (20%) -> Breather (15%)
    const cycleZ = PACING_ZONES.ESSENCE_PACING.CYCLE_LENGTH_Z;
    const rawDist = Math.max(0, -safeZ);
    const cyclePos = (rawDist % cycleZ) / cycleZ;

    let tensionPhase;
    let breatherActive = false;

    // Stroke choking/spamming can force a player into Scramble mode if in Threat
    if (cyclePos < 0.40) {
        // Quiet stretch: fog, calm river sounds, player plans ahead
        tensionPhase = TENSION_PHASES.QUIET;
    } else if (cyclePos < 0.65) {
        // Threat stretch: White Guy appears in distance, shadows creep
        if (safeChoked > 0.45) {
            // Choking strokes turns Threat into a panic Scramble
            tensionPhase = TENSION_PHASES.SCRAMBLE;
        } else {
            tensionPhase = TENSION_PHASES.THREAT;
        }
    } else if (cyclePos < 0.85) {
        // Scramble stretch: active escape / maneuvering, oar timing tested
        tensionPhase = TENSION_PHASES.SCRAMBLE;
    } else {
        // Breather stretch: clearing in fog, platform approaching, momentary relief
        tensionPhase = TENSION_PHASES.BREATHER;
        breatherActive = true;
    }

    // Enemy pursuit speed cap:
    // Capped at ~3.3 m/s during early game / pre-motor navigation.
    // If the player spams/chokes strokes (high chokedRatio), enemy closes distance naturally
    // because the player's forward speed drops below 3.3 m/s.
    // During a breather phase, enemy pressure drops.
    let enemyPursuitSpeedCap = PACING_ZONES.ESSENCE_PACING.EARLY_PURSUIT_SPEED_CAP;
    if (breatherActive) {
        enemyPursuitSpeedCap = Math.max(1.5, enemyPursuitSpeedCap * 0.5);
    } else if (tensionPhase === TENSION_PHASES.QUIET) {
        enemyPursuitSpeedCap = Math.max(2.0, enemyPursuitSpeedCap * 0.75);
    }

    return {
        currentScale,
        enemyPursuitSpeedCap: Number(enemyPursuitSpeedCap.toFixed(2)),
        breatherActive,
        tensionPhase,
    };
}

/**
 * Computes calm shoreline eddy relief near the `costado` vegetation borders.
 *
 * Enforces Helmet 03 (Pacing, Narrative & Essence) & Videogame Shore Design:
 * Near the riverbanks (|x| > channelHalfWidth * 0.72), flat-topped mossy grass ledges
 * and wood planks (`costado`) line the waterway.
 * Hugging the banks provides genuine hydrodynamic shelter from the rushing current,
 * dampening downstream drift so players can easily line up plank jumps.
 *
 * @param {number} x - Craft X coordinate
 * @param {number} [z=0] - Craft Z coordinate
 * @param {number} [channelHalfWidth=40] - River channel half-width (e.g. 40m for 80m river)
 * @returns {{ inCostadoZone: boolean, reliefFactor: number, currentMultiplier: number, distanceIntoCostado: number }}
 */
export function computeCostadoEddyRelief(x, z = 0, channelHalfWidth = 40) {
    if (!Number.isFinite(x) || !Number.isFinite(channelHalfWidth) || channelHalfWidth <= 0) {
        return {
            inCostadoZone: false,
            reliefFactor: 0.0,
            currentMultiplier: 1.0,
            distanceIntoCostado: 0.0,
        };
    }

    const absX = Math.abs(x);
    const thresholdX = channelHalfWidth * PACING_ZONES.ESSENCE_PACING.COSTADO_THRESHOLD_RATIO;

    // Center channel (|x| <= thresholdX): full current, zero costado relief
    if (absX <= thresholdX) {
        return {
            inCostadoZone: false,
            reliefFactor: 0.0,
            currentMultiplier: 1.0,
            distanceIntoCostado: 0.0,
        };
    }

    // Outside river channel bounds (|x| >= channelHalfWidth): landlocked
    if (absX >= channelHalfWidth) {
        return {
            inCostadoZone: true,
            reliefFactor: 1.0,
            currentMultiplier: 0.0,
            distanceIntoCostado: channelHalfWidth - thresholdX,
        };
    }

    // Inside costado margin: thresholdX < |x| < channelHalfWidth
    const costadoWidth = channelHalfWidth - thresholdX;
    const distanceIntoCostado = absX - thresholdX;
    const t = clamp(distanceIntoCostado / costadoWidth, 0.0, 1.0);

    // Relief factor ramps from 0.0 at threshold to 1.0 at outer edge
    const reliefFactor = t;

    // Current multiplier drops smoothly from 1.0 down to COSTADO_MIN_RELIEF_FACTOR (0.20)
    const minFactor = PACING_ZONES.ESSENCE_PACING.COSTADO_MIN_RELIEF_FACTOR;
    const currentMultiplier = 1.0 - (1.0 - minFactor) * t;

    return {
        inCostadoZone: true,
        reliefFactor: Number(reliefFactor.toFixed(3)),
        currentMultiplier: Number(currentMultiplier.toFixed(3)),
        distanceIntoCostado: Number(distanceIntoCostado.toFixed(2)),
    };
}
