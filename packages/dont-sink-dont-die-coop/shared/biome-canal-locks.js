/**
 * Architectural Intent Header: Co-Op Canal Lock & Drawbridge Gate Controller
 * (`shared/biome-canal-locks.js`)
 *
 * Why this exists:
 * In Don't Sink Don't Die, major biome transitions (Act 1->2 at z=-375, Act 2->3 at z=-750,
 * Act 3->4 at z=-1125) were previously vulnerable to mindless downstream river rushing.
 * This module creates deliberate, tactical pacing gates at biome thresholds featuring:
 *   1. Calm Forebay Basins: Damps river current to near-zero before the barrier,
 *      allowing safe docking, regrouping, and tactical navigation without getting swept away.
 *   2. Dual Sanctuary Platforms & Co-Op Pressure Pads: Left and Right platforms with
 *      clearly designated activation zones. In co-op, both pads must be occupied simultaneously;
 *      in solo/bot mode, an automated AI crew assist or solo override timer permits passage.
 *   3. Articulated Drawbridge and Floodgate Mechanics: Continuous opening progress (0.0 to 1.0)
 *      with smooth mechanical actuation (lowering drawbridges, opening floodgates),
 *      accompanied by physical gate collision barriers that drop/retract when open.
 *   4. Sanctuary Safe Haven Buffs: Resting in the forebay or on platforms shields against
 *      hostile spawns and provides crew repair/regroup stability.
 *
 * Zero external dependencies. Pure, deterministic, headless-safe ES module.
 */

/**
 * Standard configuration constants for canal locks and drawbridge puzzles.
 */
export const CANAL_LOCK_CONFIG = Object.freeze({
    DEFAULT_RIVER_WIDTH: 80,
    FOREBAY_DEPTH: 55,               // Distance upstream of gate that counts as calm forebay
    BARRIER_DEPTH: 8,                // Physical thickness of the closed gate barrier
    PLATFORM_WIDTH: 14,              // Width (X span) of sanctuary platform
    PLATFORM_LENGTH: 20,             // Length (Z span) of sanctuary platform
    PRESSURE_PAD_RADIUS: 4.5,        // Activation radius around platform pad center
    OPENING_SPEED: 0.35,             // Units per second (full open in ~2.85s)
    CLOSING_SPEED: 0.20,             // Auto-close speed if unlatched (units/s)
    SOLO_COOLDOWN_LATCH_SEC: 15.0,   // Grace period for solo player after triggering both pads sequentially
    DEFAULT_FOREBAY_CURRENT_DAMP: 0.15, // River current multiplied by this factor inside forebay (85% calm)
});

/**
 * Canal Lock Gate Definitions placed at major river biome transitions.
 */
export const CANAL_LOCKS = Object.freeze([
    {
        id: 'lock-act1-act2',
        name: 'Ironwood Canal Lock & Drawbridge',
        biomeTransition: 'amber-canyon -> neon-harbor',
        z: -375,
        gateType: 'drawbridge',
        barrierWidth: 50,
        forebayZStart: -320,
        forebayZEnd: -375,
        leftPlatform: {
            id: 'pad-act1-2-left',
            side: 'left',
            center: { x: -28, y: 0.5, z: -350 },
            width: 14,
            length: 20,
            active: false,
            activationTimer: 0,
        },
        rightPlatform: {
            id: 'pad-act1-2-right',
            side: 'right',
            center: { x: 28, y: 0.5, z: -350 },
            width: 14,
            length: 20,
            active: false,
            activationTimer: 0,
        },
        state: {
            openProgress: 0.0,
            isOpen: false,
            isLocked: true,
            coopActivated: false,
            soloAssistActive: false,
            latchRemaining: 0,
            waterLevelDelta: 0.0,
        },
    },
    {
        id: 'lock-act2-act3',
        name: 'Smuggler Aqueduct Sluice & Floodgates',
        biomeTransition: 'neon-harbor -> bioluminescent-gorge',
        z: -750,
        gateType: 'floodgate',
        barrierWidth: 52,
        forebayZStart: -695,
        forebayZEnd: -750,
        leftPlatform: {
            id: 'pad-act2-3-left',
            side: 'left',
            center: { x: -28, y: 0.5, z: -725 },
            width: 14,
            length: 20,
            active: false,
            activationTimer: 0,
        },
        rightPlatform: {
            id: 'pad-act2-3-right',
            side: 'right',
            center: { x: 28, y: 0.5, z: -725 },
            width: 14,
            length: 20,
            active: false,
            activationTimer: 0,
        },
        state: {
            openProgress: 0.0,
            isOpen: false,
            isLocked: true,
            coopActivated: false,
            soloAssistActive: false,
            latchRemaining: 0,
            waterLevelDelta: 0.0,
        },
    },
    {
        id: 'lock-act3-act4',
        name: 'Citadel Citadel Great Waterway Barrier',
        biomeTransition: 'bioluminescent-gorge -> tempest-maelstrom',
        z: -1125,
        gateType: 'drawbridge',
        barrierWidth: 54,
        forebayZStart: -1070,
        forebayZEnd: -1125,
        leftPlatform: {
            id: 'pad-act3-4-left',
            side: 'left',
            center: { x: -30, y: 0.5, z: -1100 },
            width: 16,
            length: 22,
            active: false,
            activationTimer: 0,
        },
        rightPlatform: {
            id: 'pad-act3-4-right',
            side: 'right',
            center: { x: 30, y: 0.5, z: -1100 },
            width: 16,
            length: 22,
            active: false,
            activationTimer: 0,
        },
        state: {
            openProgress: 0.0,
            isOpen: false,
            isLocked: true,
            coopActivated: false,
            soloAssistActive: false,
            latchRemaining: 0,
            waterLevelDelta: 0.0,
        },
    },
]);

/**
 * Creates a clean, deep copy of a canal lock definition to maintain isolated mutable runtime state.
 *
 * @param {Object} template - A lock definition from CANAL_LOCKS or custom template
 * @returns {Object} Fresh canal lock instance
 */
export function createCanalLockInstance(template) {
    if (!template) return null;
    return {
        id: template.id,
        name: template.name,
        biomeTransition: template.biomeTransition,
        z: template.z,
        gateType: template.gateType || 'drawbridge',
        barrierWidth: template.barrierWidth || 50,
        forebayZStart: template.forebayZStart ?? (template.z + CANAL_LOCK_CONFIG.FOREBAY_DEPTH),
        forebayZEnd: template.forebayZEnd ?? template.z,
        leftPlatform: {
            id: template.leftPlatform?.id || 'pad-left',
            side: 'left',
            center: {
                x: template.leftPlatform?.center?.x ?? -28,
                y: template.leftPlatform?.center?.y ?? 0.5,
                z: template.leftPlatform?.center?.z ?? (template.z + 25),
            },
            width: template.leftPlatform?.width || CANAL_LOCK_CONFIG.PLATFORM_WIDTH,
            length: template.leftPlatform?.length || CANAL_LOCK_CONFIG.PLATFORM_LENGTH,
            active: false,
            activationTimer: 0,
        },
        rightPlatform: {
            id: template.rightPlatform?.id || 'pad-right',
            side: 'right',
            center: {
                x: template.rightPlatform?.center?.x ?? 28,
                y: template.rightPlatform?.center?.y ?? 0.5,
                z: template.rightPlatform?.center?.z ?? (template.z + 25),
            },
            width: template.rightPlatform?.width || CANAL_LOCK_CONFIG.PLATFORM_WIDTH,
            length: template.rightPlatform?.length || CANAL_LOCK_CONFIG.PLATFORM_LENGTH,
            active: false,
            activationTimer: 0,
        },
        state: {
            openProgress: template.state?.openProgress ?? 0.0,
            isOpen: template.state?.isOpen ?? false,
            isLocked: template.state?.isLocked ?? true,
            coopActivated: template.state?.coopActivated ?? false,
            soloAssistActive: template.state?.soloAssistActive ?? false,
            latchRemaining: template.state?.latchRemaining ?? 0,
            waterLevelDelta: template.state?.waterLevelDelta ?? 0.0,
        },
    };
}

/**
 * Checks whether an entity or coordinate is inside a rectangular platform boundary or pad radius.
 *
 * @param {{x: number, z: number}} pos - World position
 * @param {Object} platform - Platform specification {center, width, length}
 * @param {number} [padRadius=CANAL_LOCK_CONFIG.PRESSURE_PAD_RADIUS]
 * @returns {boolean} True if the entity is resting on the platform or pressure pad
 */
export function isEntityOnPlatform(pos, platform, padRadius = CANAL_LOCK_CONFIG.PRESSURE_PAD_RADIUS) {
    if (!pos || !platform || !platform.center) return false;

    const px = pos.x ?? 0;
    const pz = pos.z ?? 0;
    const cx = platform.center.x ?? 0;
    const cz = platform.center.z ?? 0;

    // 1. Radial pressure pad check
    const dx = px - cx;
    const dz = pz - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq <= padRadius * padRadius) {
        return true;
    }

    // 2. Rectangular platform boundary check
    const halfW = (platform.width || CANAL_LOCK_CONFIG.PLATFORM_WIDTH) * 0.5;
    const halfL = (platform.length || CANAL_LOCK_CONFIG.PLATFORM_LENGTH) * 0.5;
    return Math.abs(px - cx) <= halfW && Math.abs(pz - cz) <= halfL;
}

/**
 * Checks whether an entity is inside the calm forebay basin upstream of the lock barrier.
 *
 * @param {{x: number, z: number}} pos - World position
 * @param {Object} lock - Canal lock definition
 * @param {number} [riverWidth=CANAL_LOCK_CONFIG.DEFAULT_RIVER_WIDTH]
 * @returns {boolean} True if position is within calm forebay basin
 */
export function isInCanalForebay(pos, lock, riverWidth = CANAL_LOCK_CONFIG.DEFAULT_RIVER_WIDTH) {
    if (!pos || !lock) return false;
    const pz = pos.z ?? 0;
    const px = pos.x ?? 0;

    // Note river flows in negative Z (upstream has larger Z values than lock.z)
    const zMax = Math.max(lock.forebayZStart ?? lock.z, lock.forebayZEnd ?? lock.z);
    const zMin = Math.min(lock.forebayZStart ?? lock.z, lock.forebayZEnd ?? lock.z);

    const halfW = riverWidth * 0.5;
    return pz >= zMin && pz <= zMax && Math.abs(px) <= halfW;
}

/**
 * Computes dampened current speed in the canal lock forebay to reward deliberate positioning.
 *
 * @param {number} z - River Z position
 * @param {number} x - River X position
 * @param {number} baseCurrent - Normal river current speed
 * @param {Object[]} [locks=CANAL_LOCKS] - Available canal locks
 * @returns {number} Resulting river current speed
 */
export function computeCanalLockCurrent(z, x, baseCurrent, locks = CANAL_LOCKS) {
    if (!locks || !Array.isArray(locks)) return baseCurrent;
    for (const lock of locks) {
        if (isInCanalForebay({ x, z }, lock)) {
            // Calm forebay water: slows current down to 15% of standard speed
            return baseCurrent * CANAL_LOCK_CONFIG.DEFAULT_FOREBAY_CURRENT_DAMP;
        }
    }
    return baseCurrent;
}

/**
 * Evaluates canal lock state each frame based on player/crewmate positions and time step dt.
 *
 * Mechanics:
 *   - Checks players on leftPlatform and rightPlatform.
 *   - In co-op (or with friendly bot): if both pads are occupied simultaneously, co-op unlock triggers.
 *   - In solo mode (1 player total): occupying one pad latches it for SOLO_COOLDOWN_LATCH_SEC,
 *     giving the solo player time to sail to the second pad and open the gate.
 *   - If unlocked, openProgress increases at OPENING_SPEED until 1.0 (isOpen = true).
 *   - If neither pad is active and lock is not latched, openProgress slowly reverts unless locked open.
 *
 * @param {Object} lock - Mutable canal lock instance
 * @param {Array<Object>} players - List of active player or companion bot states {x, z, isBot?, isAlive?}
 * @param {number} [dt=0.016] - Frame delta time in seconds
 * @returns {Object} Evaluation summary with {isOpen, openProgress, leftActive, rightActive, co-opSuccess}
 */
export function evaluateCanalLockState(lock, players = [], dt = 0.016) {
    if (!lock || !lock.state) {
        return {
            isOpen: false,
            openProgress: 0,
            leftActive: false,
            rightActive: false,
            coopActivated: false,
            isLocked: true,
        };
    }

    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0.016);
    const activePlayers = Array.isArray(players)
        ? players.filter((p) => p && (p.isAlive === undefined || p.isAlive === true))
        : [];

    let leftOccupied = false;
    let rightOccupied = false;

    for (const p of activePlayers) {
        const pos = {
            x: p.position ? p.position.x : (p.x ?? 0),
            z: p.position ? p.position.z : (p.z ?? 0),
        };

        if (isEntityOnPlatform(pos, lock.leftPlatform)) {
            leftOccupied = true;
        }
        if (isEntityOnPlatform(pos, lock.rightPlatform)) {
            rightOccupied = true;
        }
    }

    // Update individual platform timers and active flags
    if (leftOccupied) {
        lock.leftPlatform.active = true;
        lock.leftPlatform.activationTimer = (lock.leftPlatform.activationTimer || 0) + safeDt;
    } else {
        lock.leftPlatform.active = false;
        lock.leftPlatform.activationTimer = Math.max(0, (lock.leftPlatform.activationTimer || 0) - safeDt);
    }

    if (rightOccupied) {
        lock.rightPlatform.active = true;
        lock.rightPlatform.activationTimer = (lock.rightPlatform.activationTimer || 0) + safeDt;
    } else {
        lock.rightPlatform.active = false;
        lock.rightPlatform.activationTimer = Math.max(0, (lock.rightPlatform.activationTimer || 0) - safeDt);
    }

    // Check solo assistance latching
    const isSoloMode = activePlayers.length <= 1;
    if (isSoloMode) {
        if (leftOccupied && !rightOccupied) {
            lock.state.latchRemaining = CANAL_LOCK_CONFIG.SOLO_COOLDOWN_LATCH_SEC;
            lock.state.soloAssistActive = true;
        } else if (rightOccupied && !leftOccupied) {
            lock.state.latchRemaining = CANAL_LOCK_CONFIG.SOLO_COOLDOWN_LATCH_SEC;
            lock.state.soloAssistActive = true;
        } else if (lock.state.latchRemaining > 0) {
            lock.state.latchRemaining = Math.max(0, lock.state.latchRemaining - safeDt);
            if (lock.state.latchRemaining <= 0) {
                lock.state.soloAssistActive = false;
            }
        }
    } else {
        lock.state.soloAssistActive = false;
        lock.state.latchRemaining = 0;
    }

    // Determine if opening condition is met
    const dualSimultaneous = leftOccupied && rightOccupied;
    const soloSequential = isSoloMode && (
        (leftOccupied && lock.state.soloAssistActive) ||
        (rightOccupied && lock.state.soloAssistActive) ||
        dualSimultaneous
    );

    const shouldOpen = dualSimultaneous || soloSequential || (lock.state.isOpen && lock.state.isLocked === false);

    if (dualSimultaneous) {
        lock.state.coopActivated = true;
        lock.state.isLocked = false;
    }

    // Advance open progress
    if (shouldOpen) {
        lock.state.openProgress = Math.min(1.0, (lock.state.openProgress || 0) + CANAL_LOCK_CONFIG.OPENING_SPEED * safeDt);
        if (lock.state.openProgress >= 0.999) {
            lock.state.openProgress = 1.0;
            lock.state.isOpen = true;
            lock.state.isLocked = false;
        }
    } else if (!lock.state.isOpen) {
        // If not fully open, smoothly close back down
        lock.state.openProgress = Math.max(0.0, (lock.state.openProgress || 0) - CANAL_LOCK_CONFIG.CLOSING_SPEED * safeDt);
        lock.state.isOpen = false;
    }

    // Animate water level equalizing in lock chamber
    lock.state.waterLevelDelta = (1.0 - lock.state.openProgress) * 1.5;

    return {
        isOpen: lock.state.isOpen,
        openProgress: lock.state.openProgress,
        leftActive: lock.leftPlatform.active,
        rightActive: lock.rightPlatform.active,
        coopActivated: lock.state.coopActivated,
        soloAssistActive: lock.state.soloAssistActive,
        isLocked: lock.state.isLocked,
        latchRemaining: lock.state.latchRemaining,
    };
}

/**
 * Checks whether a raft is physically blocked from passing through the canal lock gate.
 *
 * @param {{x: number, z: number, radius?: number}} raft - Raft position and bounding radius
 * @param {Object} lock - Canal lock instance
 * @returns {boolean} True if raft collides with the closed gate barrier
 */
export function isRaftBlockedByLock(raft, lock) {
    if (!raft || !lock) return false;
    // If the gate is fully open (progress >= 0.95), it provides free passage
    if (lock.state?.isOpen || (lock.state?.openProgress ?? 0) >= 0.95) {
        return false;
    }

    const rx = raft.x ?? (raft.position ? raft.position.x : 0);
    const rz = raft.z ?? (raft.position ? raft.position.z : 0);
    const radius = raft.radius || 3.0;

    const barrierZ = lock.z;
    const halfDepth = CANAL_LOCK_CONFIG.BARRIER_DEPTH * 0.5;
    const halfWidth = (lock.barrierWidth || 50) * 0.5;

    // Check collision with the barrier cross-section
    const inZRange = rz >= (barrierZ - halfDepth - radius) && rz <= (barrierZ + halfDepth + radius);
    const inXRange = Math.abs(rx) <= (halfWidth + radius);

    return inZRange && inXRange;
}

/**
 * Resolves raft collision against a closed canal gate, pushing it back upstream.
 *
 * @param {{position: {x: number, z: number}, velocity?: {x: number, z: number}}} raft
 * @param {Object} lock - Canal lock instance
 * @returns {boolean} True if collision resolution took place
 */
export function resolveCanalGateCollision(raft, lock) {
    if (!raft || !lock) return false;
    if (!isRaftBlockedByLock(raft.position || raft, lock)) return false;

    const barrierZ = lock.z;
    const halfDepth = CANAL_LOCK_CONFIG.BARRIER_DEPTH * 0.5;
    const radius = raft.radius || 3.0;

    const pos = raft.position || raft;
    // Push raft back to upstream edge of barrier
    pos.z = barrierZ + halfDepth + radius + 0.1;

    // Damp downriver velocity
    if (raft.velocity && raft.velocity.z < 0) {
        raft.velocity.z = 0;
    }

    return true;
}
