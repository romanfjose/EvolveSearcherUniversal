/**
 * Don't Sink, Don't Die — Visceral Melee Clash, Parry Recoil & Knockback System
 *
 * Deterministic pure-math combat mechanics under Videogame Helmet 06
 * (Synthetic José World-Believability & Immersion Director):
 * 1. Fulfill Every Sensory Promise: Blocks & parries physically recoil both the defender
 *    and the attacker with directional knockback impulses and spark clash bursts.
 * 2. Kill the Shortcuts: No silent damage-number subtractions without bodily pushback.
 * 3. 2v1 Double-Team Stagger-Lock & Wizard Hat Spin: Consecutive melee strikes on the River Mage
 *    inflict escalating stagger-lock and high-speed angular spinning of his wizard hat.
 */

export const COMBAT_CONSTANTS = Object.freeze({
    // Recoil & Knockback impulses (m/s)
    BLOCK_RECOIL_PLAYER: 3.8,
    BLOCK_KNOCKBACK_ENEMY: 4.2,
    PARRY_RECOIL_PLAYER: 2.2,
    PARRY_KNOCKBACK_ENEMY: 7.5,
    MELEE_HIT_KNOCKBACK: 2.8,

    // Duration & hitstop (seconds)
    BLOCK_HITSTOP_SEC: 0.035,
    PARRY_HITSTOP_SEC: 0.080,
    PARRY_STAGGER_DURATION_SEC: 1.25,
    BLOCK_STAGGER_DURATION_SEC: 0.65,

    // 2v1 Double-team parameters against River Mage (whiteGuy)
    DOUBLE_TEAM_WINDOW_SEC: 2.5,
    MAGE_BASE_STAGGER_SEC: 0.9,
    MAGE_CONSECUTIVE_STAGGER_BONUS_SEC: 0.45,
    MAGE_MAX_STAGGER_SEC: 2.8,
    MAGE_HAT_SPIN_BASE_RAD_S: 18.0, // Initial angular speed for hat spin on 2v1 hit (~3 rev/s)
    MAGE_HAT_SPIN_DAMPING: 3.2,     // Exponential damping rate per second
});

/**
 * Calculates normalized 2D horizontal vector between two positions (XZ plane).
 *
 * @param {{x: number, z: number}} from
 * @param {{x: number, z: number}} to
 * @returns {{dx: number, dz: number, dist: number, nx: number, nz: number}}
 */
export function computeHorizontalDirection(from, to) {
    const dx = (to?.x ?? 0) - (from?.x ?? 0);
    const dz = (to?.z ?? 0) - (from?.z ?? 0);
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-5) {
        return { dx: 0, dz: 0, dist: 0, nx: 0, nz: -1 }; // Default downriver
    }
    return {
        dx,
        dz,
        dist,
        nx: dx / dist,
        nz: dz / dist,
    };
}

/**
 * Computes visceral melee clash recoil vectors and knockback impulses when a strike is blocked or parried.
 * Both the player and the enemy recoil in opposite directions along the impact line.
 *
 * @param {object} playerPos - {x, y, z}
 * @param {object} enemyPos - {x, y, z}
 * @param {boolean} isParry - True if a Perfect Parry, false if standard Block
 * @param {object} [options] - Custom velocity multipliers
 * @returns {object} { playerRecoil: {vx, vz}, enemyKnockback: {vx, vz}, clashPoint: {x, y, z}, hitstopSec: number, staggerSec: number }
 */
export function calculateClashImpulse(playerPos, enemyPos, isParry = false, options = {}) {
    const dir = computeHorizontalDirection(playerPos, enemyPos);
    // nx, nz point from Player -> Enemy.
    // Enemy is knocked away from Player (+nx, +nz).
    // Player recoils away from Enemy (-nx, -nz).

    const playerSpeed = isParry
        ? (options.parryPlayerRecoil ?? COMBAT_CONSTANTS.PARRY_RECOIL_PLAYER)
        : (options.blockPlayerRecoil ?? COMBAT_CONSTANTS.BLOCK_RECOIL_PLAYER);

    const enemySpeed = isParry
        ? (options.parryEnemyKnockback ?? COMBAT_CONSTANTS.PARRY_KNOCKBACK_ENEMY)
        : (options.blockEnemyKnockback ?? COMBAT_CONSTANTS.BLOCK_KNOCKBACK_ENEMY);

    const hitstopSec = isParry
        ? COMBAT_CONSTANTS.PARRY_HITSTOP_SEC
        : COMBAT_CONSTANTS.BLOCK_HITSTOP_SEC;

    const staggerSec = isParry
        ? COMBAT_CONSTANTS.PARRY_STAGGER_DURATION_SEC
        : COMBAT_CONSTANTS.BLOCK_STAGGER_DURATION_SEC;

    // Contact mid-point slightly biased towards player for spark burst
    const clashT = 0.45;
    const py = playerPos?.y ?? 0.25;
    const ey = enemyPos?.y ?? 0.5;

    return {
        playerRecoil: {
            vx: -dir.nx * playerSpeed,
            vz: -dir.nz * playerSpeed,
        },
        enemyKnockback: {
            vx: dir.nx * enemySpeed,
            vz: dir.nz * enemySpeed,
        },
        clashPoint: {
            x: (playerPos?.x ?? 0) + dir.dx * clashT,
            y: py + (ey - py) * clashT + 0.6,
            z: (playerPos?.z ?? 0) + dir.dz * clashT,
        },
        sparkNormal: {
            x: dir.nx,
            y: 0.35,
            z: dir.nz,
        },
        hitstopSec,
        staggerSec,
        isParry,
    };
}

/**
 * Creates runtime state for tracking 2v1 double-team hits and wizard hat spin on the River Mage.
 *
 * @returns {object} Mage combat state
 */
export function createMageCombatState() {
    return {
        consecutiveHits: 0,
        lastHitTimeSec: -999,
        staggerRemainingSec: 0,
        hatSpinAngle: 0,
        hatSpinVelocity: 0,
        hatWobblePhase: 0,
        isStaggerLocked: false,
    };
}

/**
 * Evaluates a melee hit on the River Mage, applying 2v1 double-team bonus rules,
 * consecutive hit stagger-lock progression, and hat spin impulse.
 *
 * @param {object} state - Mage combat state from `createMageCombatState`
 * @param {number} currentTimeSec - Current timestamp in seconds
 * @param {boolean} is2v1 - True if teammate raft assisted or hit within double-team window
 * @returns {object} Stagger-lock update outcome
 */
export function registerMageMeleeHit(state, currentTimeSec, is2v1 = false) {
    const dtSinceLast = currentTimeSec - state.lastHitTimeSec;
    const isCombo = dtSinceLast <= COMBAT_CONSTANTS.DOUBLE_TEAM_WINDOW_SEC;

    if (isCombo) {
        state.consecutiveHits += 1;
    } else {
        state.consecutiveHits = 1;
    }
    state.lastHitTimeSec = currentTimeSec;

    // Stagger duration calculation: increases with consecutive hits / 2v1
    const baseStagger = COMBAT_CONSTANTS.MAGE_BASE_STAGGER_SEC;
    const bonus = (state.consecutiveHits - 1) * COMBAT_CONSTANTS.MAGE_CONSECUTIVE_STAGGER_BONUS_SEC;
    const multiMultiplier = is2v1 ? 1.4 : 1.0;
    const addedStagger = Math.min(
        COMBAT_CONSTANTS.MAGE_MAX_STAGGER_SEC,
        (baseStagger + bonus) * multiMultiplier
    );

    // Stagger-lock refreshes and extends current stagger
    state.staggerRemainingSec = Math.max(state.staggerRemainingSec, addedStagger);
    state.isStaggerLocked = state.staggerRemainingSec > 0.1;

    // Hat spin velocity: impulse scales with combo count and 2v1
    const spinMultiplier = is2v1 ? 1.6 : 1.0;
    const hitSpinImpulse = COMBAT_CONSTANTS.MAGE_HAT_SPIN_BASE_RAD_S * (1.0 + Math.min(3, state.consecutiveHits * 0.35)) * spinMultiplier;
    state.hatSpinVelocity += hitSpinImpulse;

    return {
        consecutiveHits: state.consecutiveHits,
        staggerDurationSec: state.staggerRemainingSec,
        isStaggerLocked: state.isStaggerLocked,
        hatSpinVelocity: state.hatSpinVelocity,
        is2v1Bonus: is2v1,
    };
}

/**
 * Steps the River Mage combat state forward in time (damping hat spin, ticking down stagger).
 *
 * @param {object} state - Mage combat state
 * @param {number} dt - Frame delta in seconds
 */
export function stepMageCombatState(state, dt) {
    if (!state || dt <= 0) return;

    // Tick stagger down
    if (state.staggerRemainingSec > 0) {
        state.staggerRemainingSec = Math.max(0, state.staggerRemainingSec - dt);
        state.isStaggerLocked = state.staggerRemainingSec > 0.05;
    } else {
        state.isStaggerLocked = false;
    }

    // Step hat spin and wobble
    if (Math.abs(state.hatSpinVelocity) > 0.01) {
        state.hatSpinAngle = (state.hatSpinAngle + state.hatSpinVelocity * dt) % (Math.PI * 2);
        // Exponential damping
        state.hatSpinVelocity *= Math.exp(-COMBAT_CONSTANTS.MAGE_HAT_SPIN_DAMPING * dt);
        state.hatWobblePhase += dt * 14.0;
    } else {
        state.hatSpinVelocity = 0;
    }
}
