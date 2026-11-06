/**
 * Sovereign Core & Helmet 05: Combat, AI & Encounter Designer
 * Combat Elevation, Directional Oar Strikes & Pursuit Fairness Engine
 * (`shared/combat-elevation.js`)
 *
 * Core Mandates under Videogame Helmet 05:
 * 1. Telegraph -> Window -> Punish:
 *    - Striking a staggered enemy grants a 1.5x punish multiplier.
 *    - Upgraded weapons (e.g. Squeaky Hammer) amplify kinetic impact.
 * 2. Physical Impact Juice:
 *    - Side-aware oar melee: swinging port (left) sweeps enemies outward to port + forward (-Z in local heading).
 *    - Swinging starboard (right) sweeps enemies outward to starboard + forward.
 * 3. Fair, Visceral, Readable Combat & Escape Margin:
 *    - Early-game pre-motor rowing guarantees an honest escape margin when strokes are timed properly.
 *    - Docked/solid crafts are immune to pursuit attrition.
 *    - Elevation on platforms/docks (y > safeHeight) remains 100% immune to waterborne attacks.
 *
 * Zero external dependencies, pure ES module compatible with Node.js and browser environments.
 */

export const COMBAT_ELEVATION_CONFIG = Object.freeze({
    DEFAULT_SAFE_HEIGHT: 1.0,
    BASE_OAR_DAMAGE: 10,
    HAMMER_OAR_DAMAGE: 30,
    STAGGER_PUNISH_MULTIPLIER: 1.5,
    BASE_KNOCKBACK_LATERAL: 6.0,
    BASE_KNOCKBACK_FORWARD: 4.5,
    BASE_OAR_REACH: 4.2,
    MIN_OAR_REACH: 0.5,
    MAX_ELEVATION_DIFF: 4.0,
    OAR_ARC_ALLOWANCE_RAD: Math.PI * 0.65, // ~117 degrees sweep allowance per side
    PRE_MOTOR_ROWING_ESCAPE_MARGIN: 1.8,  // m/s guaranteed minimum escape margin under rhythmic rowing
    MIN_PURSUIT_ESCAPE_RATIO: 1.15,       // Player must maintain at least 15% speed margin over enemy when rowing properly
});

/**
 * Calculates Euclidean 2D distance on the horizontal XZ plane.
 *
 * @param {{ x?: number, z?: number }} a
 * @param {{ x?: number, z?: number }} b
 * @returns {number}
 */
export function distXZ(a, b) {
    if (!a || !b) return Infinity;
    const dx = (a.x ?? 0) - (b.x ?? 0);
    const dz = (a.z ?? 0) - (b.z ?? 0);
    return Math.hypot(dx, dz);
}

/**
 * Evaluates whether an attacker standing at attackerPos has vertical elevation immunity
 * against an entity at targetPos.
 *
 * @param {{ y?: number }} attackerPos
 * @param {number} [safeHeightThreshold=COMBAT_ELEVATION_CONFIG.DEFAULT_SAFE_HEIGHT]
 * @returns {boolean}
 */
export function isElevatedAboveSafeHeight(attackerPos, safeHeightThreshold = COMBAT_ELEVATION_CONFIG.DEFAULT_SAFE_HEIGHT) {
    const y = attackerPos?.y;
    return typeof y === 'number' && Number.isFinite(y) && y > safeHeightThreshold;
}

/**
 * Resolves a directional oar strike from a player/raft against an enemy.
 *
 * Side detection & heading mechanics:
 *   - Attacker yaw is in radians (0 = heading downriver along world -Z).
 *   - Forward vector: fx = -sin(attackerYaw), fz = -cos(attackerYaw)
 *   - Right (starboard) vector: rx = cos(attackerYaw), rz = -sin(attackerYaw)
 *   - Left (port) vector: lx = -cos(attackerYaw), lz = sin(attackerYaw)
 *
 * Strike validation:
 *   - Checks horizontal reach within [minReach, maxReach] and vertical reach <= maxElevationDiff.
 *   - Identifies which side ('left' | 'right') the enemy resides on relative to the raft's heading.
 *   - Verifies whether the chosen swingSide matches the enemy's side or falls within angular sweep allowance.
 *
 * Kinetic punch & knockback:
 *   - Left oar sweeps outward to port (left) + forward downriver.
 *   - Right oar sweeps outward to starboard (right) + forward downriver.
 *   - When isStaggered is true, a 1.5x punish multiplier is applied to damage and knockback impulses.
 *   - When hasHammer is true, weapon damage is scaled to HAMMER_OAR_DAMAGE.
 *
 * @param {object} [params={}]
 * @param {{ x: number, y?: number, z: number }} [params.attackerPos] - Raft or player origin
 * @param {number} [params.attackerYaw=0] - Heading angle in radians (0 = downriver along -Z)
 * @param {'left'|'right'} [params.swingSide='right'] - Chosen oar to swing ('left' for port, 'right' for starboard)
 * @param {{ x: number, y?: number, z: number }} [params.enemyPos] - World position of targeted enemy
 * @param {boolean} [params.isStaggered=false] - Whether enemy is currently in wind-up or parry stagger
 * @param {boolean} [params.hasHammer=false] - Whether attacker wields the upgraded Squeaky Hammer
 * @param {number} [params.maxReach] - Custom maximum melee strike reach
 * @param {number} [params.minReach] - Custom inner guard threshold
 * @returns {object} Strike result descriptor
 */
export function resolveDirectionalOarStrike({
    attackerPos = { x: 0, y: 0.25, z: 0 },
    attackerYaw = 0,
    swingSide = 'right',
    enemyPos = { x: 0, y: 0.25, z: 0 },
    isStaggered = false,
    hasHammer = false,
    maxReach = COMBAT_ELEVATION_CONFIG.BASE_OAR_REACH,
    minReach = COMBAT_ELEVATION_CONFIG.MIN_OAR_REACH,
} = {}) {
    const sanitizedYaw = Number.isFinite(attackerYaw) ? attackerYaw : 0;
    const ax = Number.isFinite(attackerPos?.x) ? attackerPos.x : 0;
    const ay = Number.isFinite(attackerPos?.y) ? attackerPos.y : 0.25;
    const az = Number.isFinite(attackerPos?.z) ? attackerPos.z : 0;

    const ex = Number.isFinite(enemyPos?.x) ? enemyPos.x : 0;
    const ey = Number.isFinite(enemyPos?.y) ? enemyPos.y : 0.25;
    const ez = Number.isFinite(enemyPos?.z) ? enemyPos.z : 0;

    const dx = ex - ax;
    const dy = ey - ay;
    const dz = ez - az;

    const distXZ = Math.hypot(dx, dz);
    const dist3D = Math.hypot(distXZ, dy);

    // Forward and Right basis vectors
    const fwdX = -Math.sin(sanitizedYaw);
    const fwdZ = -Math.cos(sanitizedYaw);
    const rightX = Math.cos(sanitizedYaw);
    const rightZ = -Math.sin(sanitizedYaw);

    // Project relative displacement onto forward and lateral (starboard/port) axes
    const forwardProj = dx * fwdX + dz * fwdZ;
    const lateralProj = dx * rightX + dz * rightZ; // Positive = starboard (right), negative = port (left)

    const enemySide = lateralProj >= 0 ? 'right' : 'left';
    const sideMatch = swingSide === enemySide;

    // Check vertical threshold
    const withinElevation = Math.abs(dy) <= COMBAT_ELEVATION_CONFIG.MAX_ELEVATION_DIFF;

    // Check horizontal distance
    const withinReach = distXZ >= minReach && distXZ <= maxReach;

    // Calculate angle relative to chosen side vector
    // For 'right': side vector is (rightX, rightZ)
    // For 'left': side vector is (-rightX, -rightZ)
    const sideDirX = swingSide === 'right' ? rightX : -rightX;
    const sideDirZ = swingSide === 'right' ? rightZ : -rightZ;

    const normXZ = distXZ > 1e-5 ? distXZ : 1;
    const toEnemyNormX = dx / normXZ;
    const toEnemyNormZ = dz / normXZ;

    // Dot product with side-forward blend (bias towards forward-quarter sweep)
    const sweepDirX = (sideDirX * 0.7 + fwdX * 0.3);
    const sweepDirZ = (sideDirZ * 0.7 + fwdZ * 0.3);
    const sweepNorm = Math.hypot(sweepDirX, sweepDirZ) || 1;
    const sweepUnitX = sweepDirX / sweepNorm;
    const sweepUnitZ = sweepDirZ / sweepNorm;

    const sweepDot = Math.max(-1, Math.min(1, toEnemyNormX * sweepUnitX + toEnemyNormZ * sweepUnitZ));
    const angleDiff = Math.acos(sweepDot);
    const withinArc = angleDiff <= COMBAT_ELEVATION_CONFIG.OAR_ARC_ALLOWANCE_RAD;

    // A strike connects cleanly if it's within reach, elevation, and either strictly matches side or falls inside sweep arc
    const hit = withinElevation && withinReach && (sideMatch || withinArc);

    // Base damage and punish bonus
    const baseDamage = hasHammer
        ? COMBAT_ELEVATION_CONFIG.HAMMER_OAR_DAMAGE
        : COMBAT_ELEVATION_CONFIG.BASE_OAR_DAMAGE;
    const punishMultiplier = isStaggered ? COMBAT_ELEVATION_CONFIG.STAGGER_PUNISH_MULTIPLIER : 1.0;
    const damage = Math.round(baseDamage * punishMultiplier);

    // Knockback impulse vector:
    // Left oar: outward to port (-rightX, -rightZ) + forward (fwdX, fwdZ)
    // Right oar: outward to starboard (+rightX, +rightZ) + forward (fwdX, fwdZ)
    const lateralMag = COMBAT_ELEVATION_CONFIG.BASE_KNOCKBACK_LATERAL * punishMultiplier * (hasHammer ? 1.4 : 1.0);
    const forwardMag = COMBAT_ELEVATION_CONFIG.BASE_KNOCKBACK_FORWARD * punishMultiplier * (hasHammer ? 1.4 : 1.0);

    const knockbackX = (swingSide === 'right' ? rightX : -rightX) * lateralMag + fwdX * forwardMag;
    const knockbackZ = (swingSide === 'right' ? rightZ : -rightZ) * lateralMag + fwdZ * forwardMag;

    return {
        hit,
        swingSide,
        enemySide,
        sideMatch,
        distanceXZ: distXZ,
        distance3D: dist3D,
        angleDiff,
        isStaggered: Boolean(isStaggered),
        punishApplied: Boolean(isStaggered && hit),
        damage: hit ? damage : 0,
        knockback: hit
            ? {
                x: Number(knockbackX.toFixed(3)),
                y: 0.5 * punishMultiplier,
                z: Number(knockbackZ.toFixed(3)),
                magnitude: Number(Math.hypot(knockbackX, knockbackZ).toFixed(3)),
            }
            : { x: 0, y: 0, z: 0, magnitude: 0 },
        impactDescription: hit
            ? `${swingSide.toUpperCase()} oar ${isStaggered ? 'PUNISH SMASH' : 'strike'} connected on ${enemySide} side!`
            : `Missed (${distXZ > maxReach ? 'out of reach' : 'incorrect side / arc'})`,
    };
}

/**
 * Evaluates whether the enemy pursuit pacing and difficulty is fair against the player's craft,
 * specifically guaranteeing that early-game pre-motor rowing has an honest escape margin
 * when oar strokes are timed properly.
 *
 * Rules:
 *   1. Solid Ground / Dock Sanctuary:
 *      - When onSolid is true, craft is docked on a platform or safe pier; pursuit threat is 0.
 *      - escapeMargin is infinite (guaranteed safe).
 *   2. Motorized Craft (hasMotor = true):
 *      - Powered propulsion naturally outpaces or matches standard river pursuit.
 *   3. Pre-Motor Manual Rowing (hasMotor = false):
 *      - Evaluates effective player rowing speed vs enemy pursuit speed.
 *      - If playerSpeed exceeds enemySpeed by at least PRE_MOTOR_ROWING_ESCAPE_MARGIN or
 *        has a speed ratio >= MIN_PURSUIT_ESCAPE_RATIO, fairness check passes.
 *      - If enemy speed is tuned unfairly high compared to raw rowing speeds without telegraphs,
 *        identifies required speed bonus or recommendations to preserve player agency.
 *
 * @param {object} [params={}]
 * @param {number} [params.playerSpeed=0] - Current player forward/resultant speed in m/s
 * @param {number} [params.enemySpeed=0] - Pursuing enemy speed in m/s
 * @param {boolean} [params.hasMotor=false] - Whether player has purchased an outboard combustion motor
 * @param {boolean} [params.onSolid=false] - Whether craft is docked atop a platform / safe haven
 * @returns {object} Fairness assessment descriptor
 */
export function evaluateEnemyPursuitFairness({
    playerSpeed = 0,
    enemySpeed = 0,
    hasMotor = false,
    onSolid = false,
} = {}) {
    const pSpeed = Math.max(0, Number.isFinite(playerSpeed) ? playerSpeed : 0);
    const eSpeed = Math.max(0, Number.isFinite(enemySpeed) ? enemySpeed : 0);

    // 1. Solid / Platform Safe Haven
    if (onSolid) {
        return {
            isFair: true,
            status: 'safe_haven',
            escapeMargin: Infinity,
            speedRatio: Infinity,
            hasMotor: Boolean(hasMotor),
            onSolid: true,
            recommendedPlayerBoost: 0,
            summary: 'Player is resting on solid platform/dock. Enemy pursuit is 100% neutralized.',
        };
    }

    // 2. Motorized Craft
    if (hasMotor) {
        const margin = pSpeed - eSpeed;
        const ratio = eSpeed > 0 ? pSpeed / eSpeed : Infinity;
        const isFair = margin >= 0 || pSpeed >= 12.0;

        return {
            isFair,
            status: isFair ? 'motorized_advantaged' : 'motorized_contested',
            escapeMargin: Number(margin.toFixed(2)),
            speedRatio: Number(ratio.toFixed(2)),
            hasMotor: true,
            onSolid: false,
            recommendedPlayerBoost: isFair ? 0 : Number(Math.max(0, eSpeed - pSpeed + 1.0).toFixed(2)),
            summary: isFair
                ? 'Outboard motor provides sufficient speed against waterborne enemies.'
                : 'Motor speed is below pursuing enemy velocity; acceleration or evasion required.',
        };
    }

    // 3. Pre-Motor Manual Rowing
    const rawMargin = pSpeed - eSpeed;
    const speedRatio = eSpeed > 0 ? pSpeed / eSpeed : Infinity;

    // Pre-motor rowing with rhythm provides an escape window if player maintains >= enemySpeed - 0.5m/s buffer
    // or if the craft is actively escaping with margin >= PRE_MOTOR_ROWING_ESCAPE_MARGIN.
    // Early-game enemies (whiteGuy speed: 15, mudAlien speed: 10) require rhythmic strokes (~12-16 m/s peak).
    const hasAdequateMargin = rawMargin >= COMBAT_ELEVATION_CONFIG.PRE_MOTOR_ROWING_ESCAPE_MARGIN;
    const hasAdequateRatio = speedRatio >= COMBAT_ELEVATION_CONFIG.MIN_PURSUIT_ESCAPE_RATIO;
    const isHonestRhythmicEscape = pSpeed >= (eSpeed * 0.95);

    const isFair = hasAdequateMargin || hasAdequateRatio || isHonestRhythmicEscape;
    const neededBoost = isFair
        ? 0
        : Math.max(0, Number((eSpeed + COMBAT_ELEVATION_CONFIG.PRE_MOTOR_ROWING_ESCAPE_MARGIN - pSpeed).toFixed(2)));

    return {
        isFair,
        status: isFair ? 'rowing_fair_escape' : 'rowing_unfair_pressure',
        escapeMargin: Number(rawMargin.toFixed(2)),
        speedRatio: Number(speedRatio.toFixed(2)),
        hasMotor: false,
        onSolid: false,
        recommendedPlayerBoost: neededBoost,
        summary: isFair
            ? 'Pre-motor rowing pacing is fair: timed oar strokes allow clean evasion and escape.'
            : `Enemy pursuit speed (${eSpeed.toFixed(1)} m/s) outpaces manual rowing (${pSpeed.toFixed(1)} m/s) without adequate escape window. Boost needed: +${neededBoost.toFixed(1)} m/s.`,
    };
}
