/**
 * Sanctuary Platform, Safe Dock & Mooring Physics Module
 * (`shared/sanctuary-platforms.js`)
 *
 * Why this exists:
 * Tactical havens, safe harbors, and mooring platforms along the hazardous 1500m river.
 * When a player lands on or docks at a sanctuary platform or harbor pier:
 *   1. Horizontal drift is automatically damped to 0 m/s unless actively paddling forward.
 *   2. Grants 100% enemy attack immunity (no whiteGuy, mudAlien, or longWorm can target or damage them).
 *   3. Provides slow hull repair (+2 HP/s) while stationary so players can catch their breath,
 *      think, strategize, and wait for co-op teammates to catch up.
 *
 * Architecture & Purity:
 * - Pure, deterministic ES module.
 * - Zero external dependencies. Zero DOM, zero Three.js, zero window/document global leaks.
 * - Zero timers, zero I/O, no unseeded Math.random.
 */

import { RIVER, FINISH_Z, WATER_SURFACE_Y } from './game-core.js';

export const SANCTUARY_PLATFORMS_CONFIG = Object.freeze({
    // Tactical Haven Dimensions
    DIMENSIONS: {
        MIN_WIDTH: 10.0,
        MAX_WIDTH: 16.0,
        DEFAULT_WIDTH: 12.0,
        MIN_LENGTH: 12.0,
        MAX_LENGTH: 20.0,
        DEFAULT_LENGTH: 16.0,
        DECK_HEIGHT_Y: 0.85,     // Platform deck elevation above waterline
        DECK_THICKNESS: 0.4,     // Solid timber deck thickness
        RAMP_LENGTH: 4.5,        // Incline entry ramps on river approach side (+Z)
        RAMP_SLOPE_WIDTH: 3.5,   // Lateral side transition ramps
        BOLLARD_RADIUS: 0.35,    // Mooring bollard posts
        BOLLARD_HEIGHT: 0.75,
        MOORING_ZONE_MARGIN: 2.2 // Water docking zone radius around platform bollards/piers
    },

    // Mooring & Drift Damping Physics
    PHYSICS: {
        MOORING_DAMPING_RATE: 8.5,     // Exponential velocity damping factor (1/s) to halt drift
        MAX_STATIONARY_SPEED: 0.35,     // Speed threshold (m/s) below which craft is considered stationary
        AUTO_HALT_CUTOFF_SPEED: 0.05,  // Snap to 0 m/s when speed drops below this
        ALLOW_PADDLE_OVERRIDE: true,   // Paddling forward (input.w) bypasses drift damping
        DOCK_SNAP_FORCE: 12.0,         // Gentle alignment force toward mooring berth
    },

    // Sanctuary Protection & Regeneration
    PROTECTION: {
        ENEMY_IMMUNITY: true,          // 100% damage & targeting immunity
        PROTECTED_ENEMY_TYPES: Object.freeze(['whiteGuy', 'mudAlien', 'longWorm']),
        REPAIR_RATE_HP_PER_SEC: 2.0,   // Slow hull repair: +2 HP per second
        REPAIR_REQUIRES_STATIONARY: true,
        MAX_SAFE_HEIGHT_OFFSET: 3.0,   // Vertical tolerance above deck
    },

    // River Generation Defaults
    GENERATION: {
        INTERVAL_Z: 250,               // Standard interval spacing along river course
        INTERVAL_VARIATION_Z: 40,
        RIVER_WIDTH_DEFAULT: 30.0,
        DEFAULT_FINISH_Z: -1500,
        MIN_SAFE_DISTANCE_FROM_START: 60, // Keep start line open
    }
});

/**
 * Deterministic Mulberry32 Pseudo-Random Number Generator.
 * @param {number} seed
 * @returns {() => number} Returns float in [0, 1)
 */
function createMulberry32(seed = 1) {
    let a = (seed >>> 0) || 1;
    return function mulberry32() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Generates procedural sanctuary platforms, safe docks, and harbor piers.
 *
 * @param {object} [options={}]
 * @param {number} [options.seed=42] - Deterministic PRNG seed
 * @param {number} [options.riverWidth=30] - Total river channel width
 * @param {number} [options.finishZ=-1500] - River finish Z coordinate
 * @returns {Array<object>} Array of sanctuary platform structures
 */
export function generateSanctuaryPlatforms(options = {}) {
    const seed = options.seed ?? 42;
    const rng = createMulberry32(seed);
    const riverWidth = options.riverWidth ?? RIVER?.width ?? SANCTUARY_PLATFORMS_CONFIG.GENERATION.RIVER_WIDTH_DEFAULT;
    const finishZ = options.finishZ ?? FINISH_Z ?? SANCTUARY_PLATFORMS_CONFIG.GENERATION.DEFAULT_FINISH_Z;
    const channelHalfWidth = riverWidth * 0.5;

    const platforms = [];
    let idCounter = 1;

    // Anchor points along river acts:
    // Act I: Sunset Canyon Haven (~ -175m to -250m, includes city harbor connection)
    // Act II: Drowned Harbor Bastion (~ -500m to -600m)
    // Act III: Bioluminescent Cavern Refuge (~ -900m to -1000m)
    // Act IV: Maelstrom Approach Safe Anchorage (~ -1300m to -1400m)
    const baseTargetZs = [
        -200,  // Pre-city harbor outpost
        -375,  // Checkpoint 1 gateway sanctuary
        -550,  // Mid-way harbor pier
        -750,  // Checkpoint 2 bioluminescent grotto sanctuary
        -950,  // Cavern safe anchorage
        -1125, // Checkpoint 3 maelstrom overlook dock
        -1380  // Final pre-boss bastion sanctuary
    ];

    for (const targetZ of baseTargetZs) {
        if (targetZ < finishZ + 50) continue;

        // Slight deterministic jitter
        const jitterZ = (rng() - 0.5) * SANCTUARY_PLATFORMS_CONFIG.GENERATION.INTERVAL_VARIATION_Z;
        const z = Math.round((targetZ + jitterZ) * 10) / 10;

        // Width clamped between 10m and 16m
        const width = Math.round(
            (SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.MIN_WIDTH +
            rng() * (SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.MAX_WIDTH - SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.MIN_WIDTH)) * 10
        ) / 10;

        // Length clamped between 12m and 20m
        const length = Math.round(
            (SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.MIN_LENGTH +
            rng() * (SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.MAX_LENGTH - SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.MIN_LENGTH)) * 10
        ) / 10;

        // Dock side placement: alternate or deterministic edge hugging
        const sideChoice = rng() > 0.5 ? 1 : -1;
        // Position platform along river bank or mid-stream sandbar
        const isMidstream = rng() < 0.25;
        let x = 0;
        if (isMidstream) {
            x = (rng() - 0.5) * 4.0; // near river center
        } else {
            const margin = width * 0.5 + 0.5;
            x = sideChoice * (channelHalfWidth - margin);
        }
        x = Math.round(x * 10) / 10;

        const deckY = SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.DECK_HEIGHT_Y;
        const rampLength = SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.RAMP_LENGTH;
        const rampSlopeWidth = SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.RAMP_SLOPE_WIDTH;
        const mooringMargin = SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.MOORING_ZONE_MARGIN;

        // Mooring bollard posts at corners and docking face
        const halfW = width * 0.5;
        const halfL = length * 0.5;
        const bollards = [
            { x: x - halfW + 0.8, y: deckY, z: z - halfL + 0.8, id: `b_${idCounter}_1` },
            { x: x + halfW - 0.8, y: deckY, z: z - halfL + 0.8, id: `b_${idCounter}_2` },
            { x: x - halfW + 0.8, y: deckY, z: z + halfL - 0.8, id: `b_${idCounter}_3` },
            { x: x + halfW - 0.8, y: deckY, z: z + halfL - 0.8, id: `b_${idCounter}_4` },
        ];

        // Ramps: Upriver entry ramp (+Z facing downstream current), plus lateral transition ramps
        const ramps = [
            {
                id: `ramp_up_${idCounter}`,
                type: 'approach_ramp',
                startX: x - halfW * 0.7,
                endX: x + halfW * 0.7,
                startZ: z + halfL + rampLength,
                endZ: z + halfL,
                startY: WATER_SURFACE_Y,
                endY: deckY,
            },
            {
                id: `ramp_side_left_${idCounter}`,
                type: 'side_ramp',
                startX: x - halfW - rampSlopeWidth,
                endX: x - halfW,
                startZ: z - halfL * 0.6,
                endZ: z + halfL * 0.6,
                startY: WATER_SURFACE_Y,
                endY: deckY,
            },
            {
                id: `ramp_side_right_${idCounter}`,
                type: 'side_ramp',
                startX: x + halfW,
                endX: x + halfW + rampSlopeWidth,
                startZ: z - halfL * 0.6,
                endZ: z + halfL * 0.6,
                startY: deckY,
                endY: WATER_SURFACE_Y,
            }
        ];

        const platform = {
            id: `sanctuary_${idCounter++}`,
            type: 'sanctuary_platform',
            name: `Sanctuary Haven ${targetZ}m`,
            x,
            y: deckY,
            z,
            width,
            length,
            deckHeight: deckY,
            deckThickness: SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.DECK_THICKNESS,
            halfWidth: halfW,
            halfLength: halfL,
            bollards,
            ramps,
            mooringZone: {
                minX: x - halfW - mooringMargin,
                maxX: x + halfW + mooringMargin,
                minZ: z - halfL - mooringMargin,
                maxZ: z + halfL + rampLength + mooringMargin,
                waterLevel: WATER_SURFACE_Y,
            },
            bounds: {
                minX: x - halfW,
                maxX: x + halfW,
                minZ: z - halfL,
                maxZ: z + halfL,
                deckY,
            }
        };

        platforms.push(platform);
    }

    return platforms;
}

/**
 * Checks if a 3D point is on an inclined approach ramp.
 *
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {object} ramp
 * @returns {boolean}
 */
function isPointOnRamp(px, py, pz, ramp) {
    if (ramp.type === 'approach_ramp') {
        const minX = Math.min(ramp.startX, ramp.endX) - 0.5;
        const maxX = Math.max(ramp.startX, ramp.endX) + 0.5;
        const minZ = Math.min(ramp.startZ, ramp.endZ) - 0.5;
        const maxZ = Math.max(ramp.startZ, ramp.endZ) + 0.5;

        if (px >= minX && px <= maxX && pz >= minZ && pz <= maxZ) {
            // Check elevation on slope
            const totalZ = ramp.endZ - ramp.startZ;
            const t = totalZ !== 0 ? (pz - ramp.startZ) / totalZ : 0;
            const expectedY = ramp.startY + t * (ramp.endY - ramp.startY);
            if (py >= expectedY - 0.4 && py <= expectedY + 1.8) {
                return true;
            }
        }
    } else if (ramp.type === 'side_ramp') {
        const minX = Math.min(ramp.startX, ramp.endX) - 0.5;
        const maxX = Math.max(ramp.startX, ramp.endX) + 0.5;
        const minZ = Math.min(ramp.startZ, ramp.endZ) - 0.5;
        const maxZ = Math.max(ramp.startZ, ramp.endZ) + 0.5;

        if (px >= minX && px <= maxX && pz >= minZ && pz <= maxZ) {
            const totalX = ramp.endX - ramp.startX;
            const t = totalX !== 0 ? (px - ramp.startX) / totalX : 0;
            const expectedY = ramp.startY + t * (ramp.endY - ramp.startY);
            if (py >= expectedY - 0.4 && py <= expectedY + 1.8) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Determines whether a player craft is safely within or docked at a sanctuary platform.
 *
 * Checks:
 *   1. Craft landed directly on top of the platform deck (x/z bounds and y >= deckHeight).
 *   2. Craft navigating/resting on an entry ramp or side slope ramp.
 *   3. Craft floating within the designated mooring harbor boundary adjacent to bollards.
 *
 * @param {object} player - Player object with position: { x, y, z }
 * @param {Array<object>} platforms - List of sanctuary platforms
 * @returns {boolean} True if player is 100% protected by a sanctuary
 */
export function isPlayerProtectedBySanctuary(player, platforms) {
    if (!player || !player.position || !Array.isArray(platforms) || platforms.length === 0) {
        return false;
    }

    const { x, y, z } = player.position;

    for (let i = 0; i < platforms.length; i++) {
        const plat = platforms[i];
        if (!plat) continue;

        // Fast Z-axis pruning
        const maxReachZ = plat.halfLength + (plat.ramps?.[0]?.endZ ? SANCTUARY_PLATFORMS_CONFIG.DIMENSIONS.RAMP_LENGTH : 0) + 5;
        if (Math.abs(z - plat.z) > maxReachZ) {
            continue;
        }

        // 1. Direct deck landing: inside platform deck bounds
        const onDeckX = x >= plat.bounds.minX - 0.6 && x <= plat.bounds.maxX + 0.6;
        const onDeckZ = z >= plat.bounds.minZ - 0.6 && z <= plat.bounds.maxZ + 0.6;
        const onDeckY = y >= plat.deckHeight - 0.45 && y <= plat.deckHeight + SANCTUARY_PLATFORMS_CONFIG.PROTECTION.MAX_SAFE_HEIGHT_OFFSET;

        if (onDeckX && onDeckZ && onDeckY) {
            return true;
        }

        // 2. On ramp
        if (plat.ramps && plat.ramps.length > 0) {
            for (let r = 0; r < plat.ramps.length; r++) {
                if (isPointOnRamp(x, y, z, plat.ramps[r])) {
                    return true;
                }
            }
        }

        // 3. Within water mooring basin / safe dock berth
        if (plat.mooringZone) {
            const inMoorX = x >= plat.mooringZone.minX && x <= plat.mooringZone.maxX;
            const inMoorZ = z >= plat.mooringZone.minZ && z <= plat.mooringZone.maxZ;
            const inMoorY = y >= WATER_SURFACE_Y - 0.35 && y <= plat.deckHeight + 1.2;

            if (inMoorX && inMoorZ && inMoorY) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Evaluates sanctuary mechanics for a player in a frame step:
 *   1. Damps horizontal drift (velocity.x and velocity.z) to 0 m/s unless player is actively paddling forward.
 *   2. Provides stationary slow hull repair (+2 HP/s) up to maxHealth.
 *   3. Returns sanctuary evaluation summary with immunity, docked status, and repair deltas.
 *
 * @param {object} player - Player entity with position, velocity, health, maxHealth, input
 * @param {Array<object>} platforms - Active sanctuary platforms
 * @param {number} dt - Frame delta time in seconds
 * @returns {object} Evaluation result: { isProtected, isDocked, damped, repairedHp, currentHp }
 */
export function evaluateSanctuaryState(player, platforms, dt = 0.05) {
    if (!player || !player.position) {
        return {
            isProtected: false,
            isDocked: false,
            damped: false,
            repairedHp: 0,
            currentHp: player?.health ?? 0,
            enemyImmunity: false,
        };
    }

    const isProtected = isPlayerProtectedBySanctuary(player, platforms);

    if (!isProtected) {
        // Reset sanctuary status flags on player if present
        if (player.sanctuaryState) {
            player.sanctuaryState.isProtected = false;
            player.sanctuaryState.isDocked = false;
        }
        return {
            isProtected: false,
            isDocked: false,
            damped: false,
            repairedHp: 0,
            currentHp: player.health ?? 0,
            enemyImmunity: false,
        };
    }

    // Ensure velocity object exists
    if (!player.velocity) {
        player.velocity = { x: 0, y: 0, z: 0 };
    }

    const v = player.velocity;
    const input = player.input || {};
    const isPaddlingForward = Boolean(input.w || input.forward);

    let damped = false;
    let isDocked = true;

    // 1. Horizontal drift damping:
    // If not actively paddling forward, automatically damp horizontal drift to 0 m/s
    if (!isPaddlingForward) {
        const dampingRate = SANCTUARY_PLATFORMS_CONFIG.PHYSICS.MOORING_DAMPING_RATE;
        const decay = Math.exp(-dampingRate * dt);

        v.x *= decay;
        v.z *= decay;

        const cutoff = SANCTUARY_PLATFORMS_CONFIG.PHYSICS.AUTO_HALT_CUTOFF_SPEED;
        if (Math.abs(v.x) < cutoff) v.x = 0;
        if (Math.abs(v.z) < cutoff) v.z = 0;

        damped = true;
    }

    // Calculate planar horizontal speed
    const horizSpeed = Math.sqrt(v.x * v.x + v.z * v.z);
    const isStationary = horizSpeed <= SANCTUARY_PLATFORMS_CONFIG.PHYSICS.MAX_STATIONARY_SPEED;

    // 2. Slow Hull Repair: +2 HP/s while stationary on platform
    let repairedHp = 0;
    const maxHp = player.maxHealth || 100;
    const currentHp = player.health ?? maxHp;

    if (isStationary && currentHp < maxHp && player.health > 0) {
        const repairRate = SANCTUARY_PLATFORMS_CONFIG.PROTECTION.REPAIR_RATE_HP_PER_SEC;
        const healStep = repairRate * dt;

        // Support fractional accumulator or direct addition
        if (player.repairAccumulator === undefined) {
            player.repairAccumulator = 0;
        }
        // Round slightly to combat floating point precision issues (e.g. 0.9999999999999998)
        player.repairAccumulator = Math.round((player.repairAccumulator + healStep) * 10000) / 10000;

        if (player.repairAccumulator >= 1.0) {
            const wholeHp = Math.floor(player.repairAccumulator);
            const applied = Math.min(wholeHp, maxHp - player.health);
            player.health += applied;
            player.repairAccumulator = Math.round((player.repairAccumulator - applied) * 10000) / 10000;
            repairedHp = applied;
        } else {
            repairedHp = healStep;
        }

        // Clamp to maxHealth
        if (player.health >= maxHp) {
            player.health = maxHp;
            player.repairAccumulator = 0;
        }
    }

    // Update player sanctuary state cache
    player.sanctuaryState = {
        isProtected: true,
        isDocked: true,
        isStationary,
        enemyImmunity: true,
        lastRepairedHp: repairedHp,
    };

    return {
        isProtected: true,
        isDocked: true,
        isStationary,
        damped,
        repairedHp,
        currentHp: player.health,
        enemyImmunity: true,
    };
}
