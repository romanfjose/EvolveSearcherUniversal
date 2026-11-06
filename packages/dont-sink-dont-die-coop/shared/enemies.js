/**
 * Sovereign Core — Videogame Helmet 06: Physical Realism & Immersion Director
 * Authoritative Enemy Combat Reactions, Rig Flinch, Death Trajectories & Hazard Interactivity
 *
 * Why this exists:
 * Kills "dead vacuums" on the 3 Dream Entities (River Mage / White Guy in Wizard Hat,
 * 3-Legged Headless Mud Alien, 26-Segment Nokia-Vector Long Worm).
 * Guarantees that hits, parries, and deaths are never silent mesh deletions or invisible number ticks.
 * Every impact drives physical stagger/flinch/recoil on the 3D rig, every death plays an active
 * physical death animation (skyward spin or whirlpool vortex sink), and environmental hazards
 * (stunt ramps and pulling whirlpools) interact emergently with enemy knockbacks and telekinetic throws.
 *
 * Pure, deterministic gameplay logic with zero external dependencies.
 */

// ─── Dream Entity Identifiers & Configurations ─────────────────────────────

export const DREAM_ENTITIES = Object.freeze({
    WHITE_GUY: 'whiteGuy',
    MUD_ALIEN: 'mudAlien',
    LONG_WORM: 'longWorm',
});

export const DEATH_ANIMATION_TYPES = Object.freeze({
    SKYWARD_SPIN: 'skyward_spin',
    WHIRLPOOL_SINK: 'whirlpool_sink',
});

export const ENEMY_COMBAT_CONFIG = Object.freeze({
    // Rig flinch & hit recoil tuning
    RECOIL: {
        NORMAL_HIT_DURATION: 0.28,
        HEAVY_HIT_DURATION: 0.42,
        PARRY_STAGGER_DURATION: 1.10,
        RECOVERY_SPEED: 4.5,
    },
    // Specific rig reactions per entity
    WHITE_GUY: {
        HAT_MAX_WHIP_RAD: 0.55,       // Wizard hat flips backward on hit
        TORSO_MAX_TILT_RAD: 0.38,     // Torso arches back away from impact
        ARM_MAX_FLAIL_RAD: 1.25,      // Lanky arms flail upward/backward
        PARRY_SPIN_RATE: 12.0,        // Dazed spinning when parried
    },
    MUD_ALIEN: {
        BODY_MAX_SQUASH: 0.35,        // Jelly/mud flattening on impact
        BODY_MAX_TILT_RAD: 0.45,      // Headless body stumbles back
        LEG_STUMBLE_AMPLITUDE: 0.65,  // Tripod legs unbalance unevenly
        PARRY_STUMBLE_SPEED: 8.0,     // Rapid wobble cycle while dazed
    },
    LONG_WORM: {
        HEAD_MAX_RECOIL_M: 1.85,      // Head segment gets driven back along vector
        ACCORDION_COMPRESSION: 0.40,  // Body segments compress like a spring
        SHUDDER_FREQUENCY: 24.0,      // High-frequency ripple down the 26 segments
        PARRY_KNOT_RAD: 0.85,         // Neck curls back in recoil
    },
    // Physical death trajectory tuning
    DEATH: {
        SKYWARD_LAUNCH_VY: 18.0,      // Launch upward speed
        SKYWARD_SPIN_RAD: Math.PI * 6, // 1080° comedic tumble
        SKYWARD_GRAVITY: 22.0,
        WHIRLPOOL_SINK_SPEED: 2.2,    // Vertical pull into river abyss
        WHIRLPOOL_SPIN_SPEED: 14.0,   // Vortex angular velocity
        WATER_SURFACE_Y: 0.25,
        TOTAL_LIFETIME_SEC: 1.4,
    },
});

// ─── Pure Math Utilities ───────────────────────────────────────────────────

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

// ─── Enemy Combat State Creation & Stepping ────────────────────────────────

/**
 * Creates an authoritative combat reaction state for an enemy instance.
 *
 * @param {string} enemyType - 'whiteGuy' | 'mudAlien' | 'longWorm'
 * @returns {object} Initialized enemy combat state
 */
export function createEnemyCombatState(enemyType = DREAM_ENTITIES.WHITE_GUY) {
    return {
        type: enemyType,
        recoilTimer: 0,
        recoilDuration: 0,
        recoilIntensity: 0,
        isParried: false,
        isHeavy: false,
        hitDirection: { x: 0, y: 0, z: 1 },
        // Computed instantaneous rig offsets
        rigOffsets: {
            // White Guy
            hatTiltX: 0,
            hatTiltZ: 0,
            torsoTiltX: 0,
            torsoTiltZ: 0,
            armFlail: 0,
            dizzySpin: 0,
            // Mud Alien
            bodySquash: 0,
            bodyTiltX: 0,
            bodyTiltZ: 0,
            legStumble: [0, 0, 0],
            // Long Worm
            headRecoilZ: 0,
            accordionFactor: 0,
            shudderWave: 0,
        },
    };
}

/**
 * Applies a hit or parry impact to an enemy combat state.
 *
 * @param {object} combatState
 * @param {object} options
 * @param {number} [options.damage=10]
 * @param {{ x: number, y?: number, z: number }} [options.hitDirection]
 * @param {boolean} [options.isHeavy=false]
 * @param {boolean} [options.isParry=false]
 * @returns {object} Updated combatState
 */
export function applyEnemyHitReaction(combatState, options = {}) {
    if (!combatState) return combatState;

    const isParry = !!options.isParry;
    const isHeavy = !!options.isHeavy || (options.damage || 0) >= 25;
    const duration = isParry
        ? ENEMY_COMBAT_CONFIG.RECOIL.PARRY_STAGGER_DURATION
        : isHeavy
        ? ENEMY_COMBAT_CONFIG.RECOIL.HEAVY_HIT_DURATION
        : ENEMY_COMBAT_CONFIG.RECOIL.NORMAL_HIT_DURATION;

    combatState.isParried = isParry;
    combatState.isHeavy = isHeavy;
    combatState.recoilDuration = duration;
    combatState.recoilTimer = duration;
    combatState.recoilIntensity = isParry ? 1.5 : isHeavy ? 1.0 : 0.65;

    if (options.hitDirection) {
        const dx = options.hitDirection.x || 0;
        const dz = options.hitDirection.z || 0;
        const len = Math.hypot(dx, dz) || 1;
        combatState.hitDirection.x = dx / len;
        combatState.hitDirection.z = dz / len;
    } else {
        combatState.hitDirection.x = 0;
        combatState.hitDirection.z = -1;
    }

    // Immediately compute initial peak flinch
    updateRigOffsets(combatState, 1.0);
    return combatState;
}

/**
 * Steps the enemy recoil and flinch timers, smoothly recovering rig to neutral.
 *
 * @param {object} combatState
 * @param {number} dt - Frame delta in seconds
 * @returns {object} Updated combatState
 */
export function stepEnemyCombatState(combatState, dt) {
    if (!combatState || combatState.recoilTimer <= 0) {
        if (combatState) resetRigOffsets(combatState);
        return combatState;
    }

    combatState.recoilTimer = Math.max(0, combatState.recoilTimer - dt);
    const progress = combatState.recoilDuration > 0
        ? combatState.recoilTimer / combatState.recoilDuration
        : 0;

    if (progress <= 0) {
        combatState.isParried = false;
        combatState.isHeavy = false;
        resetRigOffsets(combatState);
    } else {
        updateRigOffsets(combatState, progress);
    }

    return combatState;
}

function resetRigOffsets(combatState) {
    const r = combatState.rigOffsets;
    r.hatTiltX = 0;
    r.hatTiltZ = 0;
    r.torsoTiltX = 0;
    r.torsoTiltZ = 0;
    r.armFlail = 0;
    r.dizzySpin = 0;
    r.bodySquash = 0;
    r.bodyTiltX = 0;
    r.bodyTiltZ = 0;
    r.legStumble[0] = 0;
    r.legStumble[1] = 0;
    r.legStumble[2] = 0;
    r.headRecoilZ = 0;
    r.accordionFactor = 0;
    r.shudderWave = 0;
}

function updateRigOffsets(combatState, progress) {
    const r = combatState.rigOffsets;
    const type = combatState.type;
    const intensity = combatState.recoilIntensity;
    const dirX = combatState.hitDirection.x;
    const dirZ = combatState.hitDirection.z;

    // Nonlinear elastic curve: snappy peak then exponential ease-out
    const curve = Math.sin(progress * Math.PI * 0.5);

    if (type === DREAM_ENTITIES.WHITE_GUY) {
        const cfg = ENEMY_COMBAT_CONFIG.WHITE_GUY;
        if (combatState.isParried) {
            // Parried: dazed, hat knocked sideways, arms spinning helpless
            r.dizzySpin = (1 - progress) * cfg.PARRY_SPIN_RATE;
            r.hatTiltX = -0.4 * curve;
            r.hatTiltZ = Math.sin((1 - progress) * 14.0) * 0.35 * curve;
            r.torsoTiltX = -0.3 * curve;
            r.armFlail = 0.8 * curve;
        } else {
            // Melee hit: Hat whips back opposite to hit vector, torso bends back
            r.dizzySpin = 0;
            r.hatTiltX = -dirZ * cfg.HAT_MAX_WHIP_RAD * intensity * curve;
            r.hatTiltZ = dirX * cfg.HAT_MAX_WHIP_RAD * intensity * curve;
            r.torsoTiltX = -dirZ * cfg.TORSO_MAX_TILT_RAD * intensity * curve;
            r.torsoTiltZ = dirX * cfg.TORSO_MAX_TILT_RAD * intensity * curve;
            r.armFlail = cfg.ARM_MAX_FLAIL_RAD * intensity * curve;
        }
    } else if (type === DREAM_ENTITIES.MUD_ALIEN) {
        const cfg = ENEMY_COMBAT_CONFIG.MUD_ALIEN;
        if (combatState.isParried) {
            // Parried: Tripod legs wobble wildly out of sync, body tilts back and forth
            const wobbleTime = (1 - progress) * cfg.PARRY_STUMBLE_SPEED;
            r.legStumble[0] = Math.sin(wobbleTime) * cfg.LEG_STUMBLE_AMPLITUDE * curve;
            r.legStumble[1] = Math.sin(wobbleTime + 2.09) * cfg.LEG_STUMBLE_AMPLITUDE * curve;
            r.legStumble[2] = Math.sin(wobbleTime + 4.18) * cfg.LEG_STUMBLE_AMPLITUDE * curve;
            r.bodyTiltX = Math.cos(wobbleTime) * 0.28 * curve;
            r.bodyTiltZ = Math.sin(wobbleTime) * 0.28 * curve;
            r.bodySquash = 0.15 * curve;
        } else {
            // Melee hit: Jelly body squashes down and rebounds, legs buckle
            r.bodySquash = cfg.BODY_MAX_SQUASH * intensity * curve;
            r.bodyTiltX = -dirZ * cfg.BODY_MAX_TILT_RAD * intensity * curve;
            r.bodyTiltZ = dirX * cfg.BODY_MAX_TILT_RAD * intensity * curve;
            r.legStumble[0] = dirZ * cfg.LEG_STUMBLE_AMPLITUDE * intensity * curve;
            r.legStumble[1] = -dirZ * cfg.LEG_STUMBLE_AMPLITUDE * 0.7 * intensity * curve;
            r.legStumble[2] = -dirX * cfg.LEG_STUMBLE_AMPLITUDE * intensity * curve;
        }
    } else if (type === DREAM_ENTITIES.LONG_WORM) {
        const cfg = ENEMY_COMBAT_CONFIG.LONG_WORM;
        if (combatState.isParried) {
            // Parried: Head segment knocked back hard, shudder wave travels through segments
            r.headRecoilZ = cfg.HEAD_MAX_RECOIL_M * curve;
            r.accordionFactor = cfg.ACCORDION_COMPRESSION * curve;
            r.shudderWave = Math.sin((1 - progress) * cfg.SHUDDER_FREQUENCY) * 0.45 * curve;
        } else {
            // Melee hit: Head pushed back along vector, body accordions
            r.headRecoilZ = cfg.HEAD_MAX_RECOIL_M * intensity * curve;
            r.accordionFactor = cfg.ACCORDION_COMPRESSION * intensity * curve;
            r.shudderWave = Math.sin((1 - progress) * cfg.SHUDDER_FREQUENCY * 0.6) * 0.25 * curve;
        }
    }
}

// ─── Hilarious Physical Death Trajectories ─────────────────────────────────

/**
 * Initiates a comedic physical death animation sequence for a defeated enemy.
 *
 * @param {string} enemyType - 'whiteGuy' | 'mudAlien' | 'longWorm'
 * @param {{ x: number, y: number, z: number }} position - Current world position
 * @param {object} [options={}]
 * @param {string} [options.animationType] - 'skyward_spin' | 'whirlpool_sink'
 * @param {{ x: number, z: number }} [options.killerVelocity]
 * @param {boolean} [options.inWhirlpool=false]
 * @returns {object} Physical death animation state
 */
export function startEnemyDeathAnimation(enemyType, position, options = {}) {
    const isWhirlpool = !!options.inWhirlpool || options.animationType === DEATH_ANIMATION_TYPES.WHIRLPOOL_SINK;
    const animType = isWhirlpool
        ? DEATH_ANIMATION_TYPES.WHIRLPOOL_SINK
        : DEATH_ANIMATION_TYPES.SKYWARD_SPIN;

    const cfg = ENEMY_COMBAT_CONFIG.DEATH;
    const px = position.x || 0;
    const py = Math.max(cfg.WATER_SURFACE_Y, position.y || cfg.WATER_SURFACE_Y);
    const pz = position.z || 0;

    let vx = 0;
    let vy = 0;
    let vz = 0;

    if (animType === DEATH_ANIMATION_TYPES.SKYWARD_SPIN) {
        vy = cfg.SKYWARD_LAUNCH_VY;
        // Comedic outward fling away from killer or river center
        const kx = options.killerVelocity?.x || 0;
        const kz = options.killerVelocity?.z || 0;
        vx = kx !== 0 ? kx * 0.8 : (px >= 0 ? 5.5 : -5.5);
        vz = kz !== 0 ? kz * 0.8 : -4.0; // slight downstream momentum
    } else {
        // Whirlpool sink: starts at water surface and spirals downward
        vy = -cfg.WHIRLPOOL_SINK_SPEED;
    }

    return {
        enemyType,
        animationType: animType,
        elapsed: 0,
        totalDuration: cfg.TOTAL_LIFETIME_SEC,
        isDespawned: false,
        hasSplashed: false,
        position: { x: px, y: py, z: pz },
        velocity: { x: vx, y: vy, z: vz },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1.0,
        opacity: 1.0,
    };
}

/**
 * Steps an active enemy death animation state by dt.
 *
 * @param {object} deathState - Active death state
 * @param {number} dt - Step duration in seconds
 * @returns {object} Updated death state
 */
export function stepEnemyDeathAnimation(deathState, dt) {
    if (!deathState || deathState.isDespawned) return deathState;

    deathState.elapsed += dt;
    const progress = clamp(deathState.elapsed / deathState.totalDuration, 0, 1);
    const cfg = ENEMY_COMBAT_CONFIG.DEATH;

    if (deathState.animationType === DEATH_ANIMATION_TYPES.SKYWARD_SPIN) {
        // Apply gravity to vertical velocity
        deathState.velocity.y -= cfg.SKYWARD_GRAVITY * dt;
        deathState.position.x += deathState.velocity.x * dt;
        deathState.position.y += deathState.velocity.y * dt;
        deathState.position.z += deathState.velocity.z * dt;

        // Hilarious multi-axis 1080° tumble
        deathState.rotation.x += 14.0 * dt;
        deathState.rotation.y += 18.0 * dt;
        deathState.rotation.z += 9.0 * dt;

        // Check water surface impact when descending
        if (deathState.velocity.y < 0 && deathState.position.y <= cfg.WATER_SURFACE_Y) {
            deathState.position.y = cfg.WATER_SURFACE_Y;
            deathState.hasSplashed = true;
            deathState.velocity.x *= 0.3;
            deathState.velocity.z *= 0.3;
            deathState.velocity.y = -1.2; // sink slowly after splash
        }

        // Near end of flight, shrink and fade out
        if (progress > 0.75) {
            const fadeT = (progress - 0.75) / 0.25;
            deathState.scale = Math.max(0, 1.0 - fadeT);
            deathState.opacity = Math.max(0, 1.0 - fadeT);
        }
    } else {
        // Whirlpool vortex sink: spiral orbit + downward suction
        const vortexProgress = progress * Math.PI * 4; // 2 full revolutions
        const currentRadius = lerp(2.5, 0.2, progress);

        deathState.position.y += deathState.velocity.y * dt;
        deathState.rotation.y += cfg.WHIRLPOOL_SPIN_SPEED * dt;
        deathState.rotation.z = Math.sin(vortexProgress) * 0.45;

        // Shrink into the vortex center
        deathState.scale = Math.max(0.1, 1.0 - progress * 0.85);
        deathState.opacity = Math.max(0, 1.0 - progress * 0.9);
    }

    if (deathState.elapsed >= deathState.totalDuration) {
        deathState.isDespawned = true;
        deathState.scale = 0;
        deathState.opacity = 0;
    }

    return deathState;
}

// ─── Emergent Hazard Interactivity (Happy Accidents) ──────────────────────

/**
 * Checks and resolves emergent physical interaction between an enemy entity
 * (knocked back or flung by telekinesis) and river hazards (stunt jump ramps & whirlpools).
 *
 * @param {object} enemy - Enemy entity with position and velocity
 * @param {object} hazard - Ramp or whirlpool hazard
 * @param {number} dt - Step duration in seconds
 * @returns {{ interacted: boolean, type: string|null, boostApplied: boolean }}
 */
export function applyEnemyHazardInteraction(enemy, hazard, dt = 0.016) {
    if (!enemy || !hazard || !enemy.position) {
        return { interacted: false, type: null, boostApplied: false };
    }

    const ex = enemy.position.x || 0;
    const ey = enemy.position.y || 0;
    const ez = enemy.position.z || 0;

    // 1. Stunt Jump Ramp Interaction: Launches the enemy skyward if propelled into the ramp face!
    if (hazard.type === 'ramp' || hazard.isRamp) {
        const rampX = hazard.x || hazard.position?.x || 0;
        const rampZ = hazard.z || hazard.position?.z || 0;
        const rampW = hazard.width || 8.0;
        const rampL = hazard.length || 10.0;
        const halfW = rampW / 2;
        const halfL = rampL / 2;

        const inRampX = Math.abs(ex - rampX) <= halfW;
        const inRampZ = Math.abs(ez - rampZ) <= halfL;

        if (inRampX && inRampZ) {
            enemy.velocity = enemy.velocity || { x: 0, y: 0, z: 0 };
            // Launch enemy airborne along ramp incline with comedic boost!
            const launchLift = hazard.launchLift || 15.0;
            const boostFactor = hazard.boostFactor || 1.35;

            if (enemy.velocity.y < launchLift) {
                enemy.velocity.y = launchLift;
                enemy.velocity.z *= boostFactor;
                enemy.position.y += 0.8;
                return { interacted: true, type: 'ramp_launch', boostApplied: true };
            }
        }
    }

    // 2. Pulling Whirlpool Vortex Interaction: Sucks enemies inward and swirls them!
    if (hazard.type === 'whirlpool' || hazard.isWhirlpool) {
        const wpX = hazard.x || hazard.position?.x || 0;
        const wpZ = hazard.z || hazard.position?.z || 0;
        const radius = hazard.radius || 9.5;
        const dx = wpX - ex;
        const dz = wpZ - ez;
        const dist = Math.hypot(dx, dz);

        if (dist > 0.05 && dist < radius) {
            enemy.velocity = enemy.velocity || { x: 0, y: 0, z: 0 };
            const pullStrength = (1 - dist / radius) * (hazard.pullStrength || 12.0);
            const swirlStrength = (hazard.swirlSpeed || 15.0) * (1 - dist / radius);

            // Radial suction inward
            const nx = dx / dist;
            const nz = dz / dist;
            enemy.velocity.x += nx * pullStrength * dt;
            enemy.velocity.z += nz * pullStrength * dt;

            // Tangential vortex rotation (perpendicular vector)
            const tx = -nz;
            const tz = nx;
            enemy.velocity.x += tx * swirlStrength * dt;
            enemy.velocity.z += tz * swirlStrength * dt;

            return { interacted: true, type: 'whirlpool_pull', boostApplied: true };
        }
    }

    return { interacted: false, type: null, boostApplied: false };
}
