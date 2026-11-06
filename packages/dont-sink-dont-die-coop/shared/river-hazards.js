// Pure, deterministic river hazards & stunt-ramp mechanics for "Don't Sink, Don't Die".
// Zero timers, zero I/O, zero external dependencies. Pure math for:
// 1. Whitewater Speed Boost Rapids: chevron zones that boost forward speed by +45% (+0.45).
// 2. Pulling Whirlpools: dynamic velocity field with tangential swirl and radial suction pull.
// 3. Wooden Stunt Jump Ramps: launches rafts airborne along ramp trajectory + bonus coin rings.
// 4. Exploding Mine Barrels: proximity detection, fuse countdown, explosive knockback and hull damage.

export const HAZARD_CONSTANTS = {
    // 1. Whitewater Speed Boost Rapids
    RAPIDS: {
        SPEED_BOOST_FACTOR: 0.45, // +45% forward speed boost
        DEFAULT_LENGTH: 24,
        DEFAULT_WIDTH: 10,
        CHEVRON_COUNT: 5,
        SURGE_ACCEL: 35.0, // m/s^2 forward boost acceleration applied to crafts
        PULSE_DURATION_S: 0.65, // boosted chevron glow & scale pulse duration
    },

    // 2. Pulling Whirlpools
    WHIRLPOOL: {
        DEFAULT_RADIUS: 9.0,
        CORE_RADIUS: 1.2,
        MAX_RADIAL_PULL: 18.0, // m/s inward pull acceleration
        MAX_TANGENTIAL_SWIRL: 24.0, // m/s angular swirl speed
        VORTEX_DEPTH: 1.8, // water depression depth at center
    },

    // 3. Wooden Stunt Jump Ramps
    RAMP: {
        DEFAULT_WIDTH: 6.0,
        DEFAULT_LENGTH: 8.0,
        HEIGHT: 2.2, // apex height of the ramp lip
        LAUNCH_VELOCITY_Y: 16.0, // vertical launch speed (airborne)
        LAUNCH_BOOST_Z: 14.0, // downriver boost velocity (-z)
        COIN_COUNT: 4, // bonus coin ring count
        COIN_VALUE: 5, // coins per ring
        COIN_RING_RADIUS: 1.5,
    },

    // 4. Exploding Mine Barrels
    MINE: {
        TRIGGER_RADIUS: 3.5, // proximity trigger distance
        BLAST_RADIUS: 7.0, // lethal/knockback damage radius
        FUSE_DURATION_MS: 1200, // 1.2s fuse time before detonation
        BASE_DAMAGE: 45, // direct contact/center damage
        MIN_DAMAGE: 10,
        MAX_KNOCKBACK_FORCE: 800, // impulse force
        BOB_AMPLITUDE: 0.25,
        BOB_FREQUENCY: 2.0,
        SHOCKWAVE_DURATION_S: 0.85, // visual shockwave expansion time
        SHOCKWAVE_MAX_RADIUS: 14.0, // expanding ring extent
        SHRAPNEL_COUNT: 12, // number of flying shrapnel chunks
        PLUME_HEIGHT: 6.5, // height of vertical detonation water plume
    },

    // 5. River Log Jams / Timber Barricades
    LOG_JAM: {
        DEFAULT_WIDTH: 12.0,
        DEFAULT_DEPTH: 3.0,
        DEFAULT_HP: 60,
        SHUDDER_DURATION_S: 0.45,
        SPLINTER_COUNT: 8,
        COLLISION_RADIUS: 2.5,
    },

    // 6. Hydrothermal River Geysers
    GEYSER: {
        DEFAULT_RADIUS: 7.5,
        BOIL_DURATION_S: 1.2, // pressurized boiling dome telegraph
        ERUPT_DURATION_S: 1.4, // violent vertical steam eruption
        REST_DURATION_S: 2.5, // dormant reset period
        MAX_UPDRAFT: 38.0,
        LATERAL_DISPERSAL: 11.0,
        PLUME_MAX_HEIGHT: 12.0,
    },

    // 7. Airborne Coin Ring Radial Burst
    COIN_RING_BURST: {
        DURATION_S: 0.65,
        EXPANSION_SCALE: 2.8,
        SPARKLE_COUNT: 10,
    },
};

/** Mulberry32 deterministic PRNG */
export function createRng(seed = 1) {
    let a = (seed >>> 0) || 1;
    return function mulberry32() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Whitewater Speed Boost Rapids Math
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if a point (x, z) is inside a rapids zone.
 * Rapids zones are oriented downriver along -Z (or have custom heading angle).
 */
export function isInsideRapids(point, rapids) {
    const halfW = (rapids.width ?? HAZARD_CONSTANTS.RAPIDS.DEFAULT_WIDTH) * 0.5;
    const halfL = (rapids.length ?? HAZARD_CONSTANTS.RAPIDS.DEFAULT_LENGTH) * 0.5;
    const dx = point.x - rapids.x;
    const dz = point.z - rapids.z;

    const angle = rapids.angle || 0;
    if (angle === 0) {
        return Math.abs(dx) <= halfW && Math.abs(dz) <= halfL;
    }
    // Rotate point into local rapids coordinate frame
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    return Math.abs(localX) <= halfW && Math.abs(localZ) <= halfL;
}

/**
 * Calculates rapids current acceleration or speed boost multiplier.
 * When inside, boosts forward velocity or applies a +45% boost vector.
 */
export function calculateRapidsBoost(craftVelocity, rapids) {
    const factor = HAZARD_CONSTANTS.RAPIDS.SPEED_BOOST_FACTOR; // +0.45
    const forwardDir = rapids.direction || { x: 0, z: -1 }; // downriver is -z
    const len = Math.hypot(forwardDir.x, forwardDir.z) || 1;
    const nx = forwardDir.x / len;
    const nz = forwardDir.z / len;

    // Component of craft velocity along rapids flow direction
    const dot = craftVelocity.x * nx + craftVelocity.z * nz;
    const currentSpeed = Math.hypot(craftVelocity.x, craftVelocity.z);
    
    // Boosted speed calculation: +45% boost magnitude
    const boostMagnitude = Math.max(currentSpeed * factor, 6.0 * factor);

    return {
        active: true,
        multiplier: 1.0 + factor, // 1.45
        boostForce: {
            x: nx * HAZARD_CONSTANTS.RAPIDS.SURGE_ACCEL,
            z: nz * HAZARD_CONSTANTS.RAPIDS.SURGE_ACCEL,
        },
        boostVelocity: {
            x: nx * boostMagnitude,
            z: nz * boostMagnitude,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pulling Whirlpool Math (Swirl + Radial Pull Field)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates the 2D velocity vector induced by a whirlpool at point (x, z).
 * Tangential swirl (v_theta) + inward radial pull (v_r).
 * Uses a modified Rankine vortex model to avoid infinite singularity at core.
 */
export function evaluateWhirlpoolField(point, whirlpool) {
    const dx = point.x - whirlpool.x;
    const dz = point.z - whirlpool.z;
    const distSq = dx * dx + dz * dz;
    const dist = Math.sqrt(distSq);
    const radius = whirlpool.radius || HAZARD_CONSTANTS.WHIRLPOOL.DEFAULT_RADIUS;

    if (dist >= radius || dist < 1e-6) {
        return {
            inside: false,
            radialPull: { x: 0, z: 0 },
            tangentialSwirl: { x: 0, z: 0 },
            combinedVelocity: { x: 0, z: 0 },
            vortexDepth: 0,
            normalizedDist: dist / radius,
        };
    }

    const coreR = whirlpool.coreRadius || HAZARD_CONSTANTS.WHIRLPOOL.CORE_RADIUS;
    const clockwise = whirlpool.clockwise ?? true;
    const dirSign = clockwise ? 1 : -1;

    // Normalized unit radial vector (from center outward)
    const urX = dx / dist;
    const urZ = dz / dist;

    // Tangential unit vector (perpendicular to ur: for clockwise (z, -x))
    const utX = dirSign * urZ;
    const utZ = dirSign * (-urX);

    // Profile: smooth falloff toward rim, rigid body core inside coreR
    const t = 1.0 - dist / radius; // 1 at center, 0 at edge
    const maxPull = whirlpool.maxPull || HAZARD_CONSTANTS.WHIRLPOOL.MAX_RADIAL_PULL;
    const maxSwirl = whirlpool.maxSwirl || HAZARD_CONSTANTS.WHIRLPOOL.MAX_TANGENTIAL_SWIRL;

    let pullSpeed = 0;
    let swirlSpeed = 0;

    if (dist < coreR) {
        // Inner core (linear falloff to 0 at r=0 to avoid infinite spin)
        const coreFactor = dist / coreR;
        pullSpeed = maxPull * (0.5 + 0.5 * coreFactor);
        swirlSpeed = maxSwirl * coreFactor;
    } else {
        // Outer vortex (1/r style decay softened by t)
        const outerFactor = (coreR / dist) * Math.sin(t * Math.PI * 0.5);
        pullSpeed = maxPull * outerFactor;
        swirlSpeed = maxSwirl * outerFactor;
    }

    // Inward radial pull: pointing toward whirlpool center (-ur)
    const vrX = -urX * pullSpeed;
    const vrZ = -urZ * pullSpeed;

    // Tangential swirl
    const vtX = utX * swirlSpeed;
    const vtZ = utZ * swirlSpeed;

    // Water surface depression (funnel height)
    const depthMax = whirlpool.depth || HAZARD_CONSTANTS.WHIRLPOOL.VORTEX_DEPTH;
    const vortexDepth = depthMax * Math.pow(t, 1.8);

    return {
        inside: true,
        radialPull: { x: vrX, z: vrZ },
        tangentialSwirl: { x: vtX, z: vtZ },
        combinedVelocity: { x: vrX + vtX, z: vrZ + vtZ },
        vortexDepth,
        normalizedDist: dist / radius,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Wooden Stunt Jump Ramp Math
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if a craft enters the stunt ramp zone and calculates launch physics.
 * Ramp is modeled as an inclined plane with base at zMax and apex lip at zMin (facing -z).
 */
export function evaluateRampInteraction(craft, ramp) {
    const halfW = (ramp.width || HAZARD_CONSTANTS.RAMP.DEFAULT_WIDTH) * 0.5;
    const length = ramp.length || HAZARD_CONSTANTS.RAMP.DEFAULT_LENGTH;
    const apexHeight = ramp.height || HAZARD_CONSTANTS.RAMP.HEIGHT;

    // Local coordinates relative to ramp center
    const dx = craft.position.x - ramp.x;
    const dz = craft.position.z - ramp.z;

    const halfL = length * 0.5;
    // Ramp bounds: x in [-halfW, halfW], z in [-halfL, halfL]
    if (Math.abs(dx) > halfW || Math.abs(dz) > halfL) {
        return { onRamp: false, launched: false, rampY: 0 };
    }

    // Progress along ramp from entry (+halfL downriver to -halfL apex)
    // 0 at entry (z = +halfL), 1.0 at launch lip (z = -halfL)
    const progress = (halfL - dz) / length;
    const rampY = progress * apexHeight;

    // Launch threshold: when crossing the lip (progress >= 0.85) moving downriver
    const isMovingDownriver = craft.velocity ? craft.velocity.z < 0 : true;
    const launched = progress >= 0.85 && isMovingDownriver;

    let launchVelocity = null;
    if (launched) {
        const vy = ramp.launchVelocityY || HAZARD_CONSTANTS.RAMP.LAUNCH_VELOCITY_Y;
        const vzBoost = ramp.launchBoostZ || HAZARD_CONSTANTS.RAMP.LAUNCH_BOOST_Z;
        launchVelocity = {
            x: craft.velocity ? craft.velocity.x * 0.9 : 0,
            y: vy,
            z: craft.velocity ? craft.velocity.z - vzBoost : -vzBoost,
        };
    }

    return {
        onRamp: true,
        launched,
        progress,
        rampY,
        launchVelocity,
    };
}

/**
 * Creates bonus coin rings hovering airborne along the ramp's launch trajectory.
 */
export function generateRampCoinRings(ramp) {
    const count = ramp.coinCount || HAZARD_CONSTANTS.RAMP.COIN_COUNT;
    const coinValue = ramp.coinValue || HAZARD_CONSTANTS.RAMP.COIN_VALUE;
    const apexHeight = ramp.height || HAZARD_CONSTANTS.RAMP.HEIGHT;
    const coins = [];

    // Ballistic arc ahead of ramp lip (from z = ramp.z - halfL downriver)
    const halfL = (ramp.length || HAZARD_CONSTANTS.RAMP.DEFAULT_LENGTH) * 0.5;
    const lipZ = ramp.z - halfL;

    for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1); // 0..1 progression along jump
        // Parabolic arc: rises up to peak then arches down
        const arcY = apexHeight + 2.5 * Math.sin(t * Math.PI);
        const arcZ = lipZ - t * 24.0; // 24m launch distance

        coins.push({
            id: `coin_ring_${ramp.id || 'r'}_${i}`,
            rampId: ramp.id,
            index: i,
            x: ramp.x,
            y: arcY,
            z: arcZ,
            radius: HAZARD_CONSTANTS.RAMP.COIN_RING_RADIUS,
            value: coinValue,
            collected: false,
        });
    }
    return coins;
}

/**
 * Checks proximity to coin rings and collects them.
 */
export function collectCoinRings(craftPosition, coinRings, collectRadius = 2.0) {
    let collectedCount = 0;
    let earnedCoins = 0;
    const collectedIds = [];

    for (let i = 0; i < coinRings.length; i++) {
        const ring = coinRings[i];
        if (ring.collected) continue;

        const dx = craftPosition.x - ring.x;
        const dy = craftPosition.y - ring.y;
        const dz = craftPosition.z - ring.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        const effectiveRadius = (ring.radius || 1.5) + collectRadius;
        if (distSq <= effectiveRadius * effectiveRadius) {
            ring.collected = true;
            ring.burstTriggered = true;
            ring.burstTimeS = 0;
            collectedCount++;
            earnedCoins += ring.value;
            collectedIds.push(ring.id);
        }
    }

    return {
        collectedCount,
        earnedCoins,
        collectedIds,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Exploding Mine Barrels Math
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory for a mine barrel state.
 */
export function createMineBarrel(id, x, z, options = {}) {
    return {
        id,
        x,
        y: options.y ?? 0.25,
        z,
        state: 'floating', // 'floating' | 'triggered' | 'detonated' | 'inert'
        fuseMs: HAZARD_CONSTANTS.MINE.FUSE_DURATION_MS,
        fuseTimerMs: 0,
        triggerRadius: options.triggerRadius || HAZARD_CONSTANTS.MINE.TRIGGER_RADIUS,
        blastRadius: options.blastRadius || HAZARD_CONSTANTS.MINE.BLAST_RADIUS,
        damage: options.damage || HAZARD_CONSTANTS.MINE.BASE_DAMAGE,
        knockback: options.knockback || HAZARD_CONSTANTS.MINE.MAX_KNOCKBACK_FORCE,
        detonatedAt: null,
    };
}

/**
 * Evaluates craft proximity to a mine, triggers fuse countdown, or executes detonation.
 * Deterministic with discrete step dtMs (e.g. 50ms).
 */
export function updateMineBarrel(mine, craftPositions = [], dtMs = 50, now = 0) {
    const events = [];

    if (mine.state === 'detonated' || mine.state === 'inert') {
        return { state: mine.state, events };
    }

    // 1. Proximity trigger check if floating
    if (mine.state === 'floating') {
        for (let i = 0; i < craftPositions.length; i++) {
            const craft = craftPositions[i];
            const p = craft.position || craft;
            const dx = p.x - mine.x;
            const dz = p.z - mine.z;
            const dist = Math.hypot(dx, dz);

            if (dist <= mine.triggerRadius) {
                mine.state = 'triggered';
                mine.fuseTimerMs = mine.fuseMs;
                events.push({
                    type: 'mineTriggered',
                    mineId: mine.id,
                    fuseMs: mine.fuseTimerMs,
                    triggeredBy: craft.id || i,
                });
                break;
            }
        }
    }

    // 2. Count down fuse if triggered
    if (mine.state === 'triggered') {
        mine.fuseTimerMs -= dtMs;
        if (mine.fuseTimerMs <= 0) {
            mine.state = 'detonated';
            mine.detonatedAt = now;

            // Compute blast impact on all craft in blast radius
            const blastHits = [];
            for (let i = 0; i < craftPositions.length; i++) {
                const craft = craftPositions[i];
                const p = craft.position || craft;
                const dx = p.x - mine.x;
                const dz = p.z - mine.z;
                const dist = Math.hypot(dx, dz);

                if (dist <= mine.blastRadius) {
                    // Falloff fraction (1 at center, 0 at blast edge)
                    const falloff = 1.0 - dist / mine.blastRadius;
                    const dmg = Math.round(HAZARD_CONSTANTS.MINE.MIN_DAMAGE + (mine.damage - HAZARD_CONSTANTS.MINE.MIN_DAMAGE) * falloff);

                    // Blast knockback impulse (unit outward vector * force * falloff)
                    const normDist = Math.max(dist, 0.5);
                    const nx = dx / normDist;
                    const nz = dz / normDist;
                    const knockForce = mine.knockback * falloff;

                    blastHits.push({
                        targetId: craft.id || i,
                        damage: dmg,
                        knockback: {
                            x: nx * knockForce,
                            y: 200 + 400 * falloff, // upward launch
                            z: nz * knockForce,
                        },
                        distance: dist,
                    });
                }
            }

                // Generate physical explosion payload with expanding shockwave ring and shrapnel chunks
                const shrapnel = [];
                for (let s = 0; s < HAZARD_CONSTANTS.MINE.SHRAPNEL_COUNT; s++) {
                    const ang = (s / HAZARD_CONSTANTS.MINE.SHRAPNEL_COUNT) * Math.PI * 2;
                    shrapnel.push({
                        id: `mine_shrap_${mine.id}_${s}`,
                        x: mine.x,
                        y: mine.y + 0.3,
                        z: mine.z,
                        vx: Math.cos(ang) * (8.0 + (s % 4) * 2.5),
                        vy: 6.0 + (s % 3) * 3.0,
                        vz: Math.sin(ang) * (8.0 + (s % 4) * 2.5),
                    });
                }

            events.push({
                type: 'mineDetonated',
                mineId: mine.id,
                x: mine.x,
                y: mine.y,
                z: mine.z,
                hits: blastHits,
                    shockwave: {
                        durationS: HAZARD_CONSTANTS.MINE.SHOCKWAVE_DURATION_S,
                        maxRadius: HAZARD_CONSTANTS.MINE.SHOCKWAVE_MAX_RADIUS,
                    },
                    shrapnel,
                    plumeHeight: HAZARD_CONSTANTS.MINE.PLUME_HEIGHT,
            });
        }
    }

    return {
        state: mine.state,
        fuseRemainingMs: Math.max(0, mine.fuseTimerMs),
        events,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. River Log Jams & Hydrothermal Geysers Math
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a river log jam barricade structure that shudders and splinters on collision.
 */
export function createLogJam(id, x, z, options = {}) {
    return {
        id,
        x,
        y: options.y ?? 0.4,
        z,
        width: options.width || HAZARD_CONSTANTS.LOG_JAM.DEFAULT_WIDTH,
        depth: options.depth || HAZARD_CONSTANTS.LOG_JAM.DEFAULT_DEPTH,
        hp: options.hp || HAZARD_CONSTANTS.LOG_JAM.DEFAULT_HP,
        maxHp: options.hp || HAZARD_CONSTANTS.LOG_JAM.DEFAULT_HP,
        state: 'intact', // 'intact' | 'shuddering' | 'splintered'
        shudderTimerS: 0,
        splinters: [],
        impactCount: 0,
    };
}

/**
 * Checks craft collision against a log jam and computes physical reaction (shudder, splinters, rebound).
 */
export function evaluateLogJamCollision(craft, logJam, dt = 0.05) {
    const halfW = logJam.width * 0.5;
    const halfD = logJam.depth * 0.5;
    const p = craft.position || craft;
    const dx = p.x - logJam.x;
    const dz = p.z - logJam.z;

    const insideX = Math.abs(dx) <= halfW + HAZARD_CONSTANTS.LOG_JAM.COLLISION_RADIUS;
    const insideZ = Math.abs(dz) <= halfD + HAZARD_CONSTANTS.LOG_JAM.COLLISION_RADIUS;

    if (!insideX || !insideZ || logJam.state === 'splintered') {
        return { collided: false, logJam };
    }

    // Impact confirmed! Apply physical reaction
    logJam.impactCount++;
    logJam.shudderTimerS = HAZARD_CONSTANTS.LOG_JAM.SHUDDER_DURATION_S;
    logJam.state = 'shuddering';

    const craftSpeed = Math.hypot(craft.velocity?.x || 0, craft.velocity?.z || 0);
    const impactDmg = Math.max(15, Math.round(craftSpeed * 3.5));
    logJam.hp = Math.max(0, logJam.hp - impactDmg);

    // Spawn flying wood splinters
    const splinters = [];
    const count = HAZARD_CONSTANTS.LOG_JAM.SPLINTER_COUNT;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        splinters.push({
            id: `splinter_${logJam.id}_${logJam.impactCount}_${i}`,
            x: p.x,
            y: (p.y || 0.4) + 0.3,
            z: p.z,
            vx: Math.cos(angle) * (3.0 + (i % 3) * 1.5),
            vy: 4.0 + (i % 4) * 1.5,
            vz: Math.sin(angle) * (3.0 + (i % 2) * 1.5) - 2.0,
            rotation: { x: i * 0.5, y: i * 0.8, z: i * 0.3 },
            scale: 0.6 + (i % 3) * 0.2,
            lifetimeS: 0.75,
        });
    }
    logJam.splinters.push(...splinters);

    if (logJam.hp <= 0) {
        logJam.state = 'splintered';
    }

    return {
        collided: true,
        damageDealt: impactDmg,
        remainingHp: logJam.hp,
        state: logJam.state,
        splinters,
        reboundForce: {
            x: dx === 0 ? 0 : (dx / Math.abs(dx)) * 12.0,
            z: 14.0, // rebound backwards against downriver momentum
        },
    };
}

/**
 * Creates a hydrothermal river geyser with pressurized boiling dome telegraph.
 */
export function createRiverGeyser(id, x, z, options = {}) {
    return {
        id,
        x,
        y: options.y ?? 0.2,
        z,
        radius: options.radius || HAZARD_CONSTANTS.GEYSER.DEFAULT_RADIUS,
        state: 'dormant', // 'dormant' | 'boiling' | 'erupting'
        boilDurationS: options.boilDurationS || HAZARD_CONSTANTS.GEYSER.BOIL_DURATION_S,
        eruptDurationS: options.eruptDurationS || HAZARD_CONSTANTS.GEYSER.ERUPT_DURATION_S,
        restDurationS: options.restDurationS || HAZARD_CONSTANTS.GEYSER.REST_DURATION_S,
        phaseTimerS: 0,
        cyclePeriodS: (options.boilDurationS || HAZARD_CONSTANTS.GEYSER.BOIL_DURATION_S) +
                      (options.eruptDurationS || HAZARD_CONSTANTS.GEYSER.ERUPT_DURATION_S) +
                      (options.restDurationS || HAZARD_CONSTANTS.GEYSER.REST_DURATION_S),
    };
}

/**
 * Evaluates geyser cycle phase (dormant -> boiling dome telegraph -> vertical steam eruption)
 * at a given time or step.
 */
export function evaluateGeyserState(geyser, timeSec) {
    const period = geyser.cyclePeriodS;
    const cycleTime = ((timeSec + (Math.abs(geyser.x) * 0.4)) % period + period) % period;

    const boilEnd = geyser.boilDurationS;
    const eruptEnd = boilEnd + geyser.eruptDurationS;

    let state = 'dormant';
    let telegraphProgress = 0; // 0..1 during boiling
    let eruptionProgress = 0;  // 0..1 during erupting
    let updraftForce = 0;
    let domeHeight = 0;
    let plumeHeight = 0;

    if (cycleTime < boilEnd) {
        // Phase 1: Pressurized boiling dome telegraph
        state = 'boiling';
        telegraphProgress = cycleTime / boilEnd;
        // Boiling water dome rises, expands, and bubbles
        domeHeight = Math.sin(telegraphProgress * Math.PI * 0.5) * 1.4;
    } else if (cycleTime < eruptEnd) {
        // Phase 2: Explosive steam eruption
        state = 'erupting';
        eruptionProgress = (cycleTime - boilEnd) / geyser.eruptDurationS;
        const surgeCurve = Math.sin(eruptionProgress * Math.PI);
        updraftForce = HAZARD_CONSTANTS.GEYSER.MAX_UPDRAFT * surgeCurve;
        plumeHeight = HAZARD_CONSTANTS.GEYSER.PLUME_MAX_HEIGHT * surgeCurve;
    } else {
        // Phase 3: Dormant
        state = 'dormant';
    }

    return {
        state,
        telegraphProgress,
        eruptionProgress,
        updraftForce,
        domeHeight,
        plumeHeight,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Unified River Hazards Environment & Simulation Step
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministically generates a layout of river hazards across the entire course.
 * z = 0 down to finishZ (e.g. -1500), avoiding overlapping zones.
 */
export function generateRiverHazardsLayout(seed = 101, finishZ = -1500, riverWidth = 30) {
    const rng = createRng(seed);
    const halfWidth = riverWidth * 0.5 - 2.5;

    const rapids = [];
    const whirlpools = [];
    const ramps = [];
    const mines = [];
    const coinRings = [];

    // Distribute hazards across river course, spaced every ~80m
    let currentZ = -60;
    let hazardId = 0;

    while (currentZ > finishZ + 60) {
        hazardId++;
        const roll = rng();

        // 1. Rapids zones (25% chance)
        if (roll < 0.25) {
            const rWidth = 8 + rng() * 6;
            const rLength = 25 + rng() * 15;
            const rX = (rng() - 0.5) * (halfWidth * 0.8);
            rapids.push({
                id: `rapids_${hazardId}`,
                x: rX,
                z: currentZ,
                width: rWidth,
                length: rLength,
                angle: (rng() - 0.5) * 0.2, // slight angle
                direction: { x: (rng() - 0.5) * 0.1, z: -1 },
            });
            currentZ -= rLength + 40;
            continue;
        }

        // 2. Whirlpools (25% chance)
        if (roll < 0.50) {
            const wRadius = 7.0 + rng() * 4.0;
            const wX = (rng() - 0.5) * (halfWidth * 1.1);
            whirlpools.push({
                id: `whirlpool_${hazardId}`,
                x: wX,
                z: currentZ,
                radius: wRadius,
                coreRadius: 1.2 + rng() * 0.5,
                clockwise: rng() > 0.5,
                maxPull: 14.0 + rng() * 6.0,
                maxSwirl: 20.0 + rng() * 8.0,
                depth: 1.6 + rng() * 0.6,
            });
            currentZ -= wRadius * 2 + 45;
            continue;
        }

        // 3. Stunt Jump Ramps (25% chance)
        if (roll < 0.75) {
            const rampW = 5.5 + rng() * 2.0;
            const rampL = 7.5 + rng() * 2.0;
            const rampX = (rng() - 0.5) * (halfWidth * 0.9);
            const ramp = {
                id: `ramp_${hazardId}`,
                x: rampX,
                z: currentZ,
                width: rampW,
                length: rampL,
                height: 2.2 + rng() * 0.5,
                coinCount: 4,
                coinValue: 5,
            };
            ramps.push(ramp);
            coinRings.push(...generateRampCoinRings(ramp));
            currentZ -= rampL + 50;
            continue;
        }

        // 4. Cluster of Floating Exploding Mine Barrels (25% chance)
        const clusterCount = 2 + Math.floor(rng() * 3);
        for (let c = 0; c < clusterCount; c++) {
            const mX = (rng() - 0.5) * (halfWidth * 1.3);
            const mZ = currentZ + (rng() - 0.5) * 15;
            mines.push(createMineBarrel(`mine_${hazardId}_${c}`, mX, mZ, {
                damage: 40 + Math.floor(rng() * 20),
            }));
        }
        currentZ -= 65;
    }

    return {
        rapids,
        whirlpools,
        ramps,
        mines,
        coinRings,
    };
}

/**
 * Steps the full river hazards simulation on a kinematic craft.
 * Modifies velocity, height, detects jumps, applies boosts, and updates mines.
 */
export function stepCraftWithRiverHazards(craft, hazards, dt, now = 0) {
    const result = {
        inRapids: false,
        rapidsBoostFactor: 1.0,
        inWhirlpool: false,
        whirlpoolDepth: 0,
        rampInteraction: null,
        coinsEarned: 0,
        mineEvents: [],
        appliedForces: { x: 0, y: 0, z: 0 },
    };

    const pos = craft.position;
    const vel = craft.velocity;

    // A. Check Rapids Speed Boost
    for (let i = 0; i < (hazards.rapids || []).length; i++) {
        const rap = hazards.rapids[i];
        if (isInsideRapids(pos, rap)) {
            result.inRapids = true;
            rap.boostPulseTimerS = HAZARD_CONSTANTS.RAPIDS.PULSE_DURATION_S;
            rap.isBoostingRaft = true;
            const boost = calculateRapidsBoost(vel, rap);
            result.rapidsBoostFactor = boost.multiplier; // 1.45
            // Apply forward surge boost acceleration + direct displacement so keel drag cannot cancel it
            vel.x += boost.boostForce.x * dt * 1.6;
            vel.z += boost.boostForce.z * dt * 1.6;
            pos.x += boost.boostForce.x * dt * 0.22;
            pos.z += boost.boostForce.z * dt * 0.22;
            result.appliedForces.x += boost.boostForce.x;
            result.appliedForces.z += boost.boostForce.z;
            break;
        }
    }

    // B. Check Pulling Whirlpools
    for (let i = 0; i < (hazards.whirlpools || []).length; i++) {
        const wp = hazards.whirlpools[i];
        const field = evaluateWhirlpoolField(pos, wp);
        if (field.inside) {
            result.inWhirlpool = true;
            result.whirlpoolDepth = Math.max(result.whirlpoolDepth, field.vortexDepth);
            // Apply strong swirl + radial suction to velocity, direct position displacement, and yaw spin
            vel.x += field.combinedVelocity.x * dt * 4.2;
            vel.z += field.combinedVelocity.z * dt * 4.2;
            pos.x += field.combinedVelocity.x * dt * 0.65;
            pos.z += field.combinedVelocity.z * dt * 0.65;
            const spinSign = wp.clockwise !== false ? -1 : 1;
            const spinRate = 3.4 + (1 - (field.normalizedDist ?? 0.5)) * 6.8;
            if (typeof craft.yaw === 'number') {
                craft.yaw += spinSign * spinRate * dt;
            }
            if (craft.angularVelocity && typeof craft.angularVelocity.y === 'number') {
                craft.angularVelocity.y += spinSign * spinRate * 0.5;
            }
            // Inner vortex core slingshot surge: reaching the vortex eye flings & pushes the raft outward!
            if ((field.normalizedDist ?? 1) < 0.28 && (vel.y || 0) <= 1.0) {
                vel.y = 11.5;
                vel.x += spinSign * 16.0;
                vel.z -= 18.0;
                result.whirlpoolLaunched = true;
            }
            result.appliedForces.x += field.combinedVelocity.x * 4.2;
            result.appliedForces.z += field.combinedVelocity.z * 4.2;
            break;
        }
    }

    // C. Check Stunt Jump Ramps
    for (let i = 0; i < (hazards.ramps || []).length; i++) {
        const ramp = hazards.ramps[i];
        const interaction = evaluateRampInteraction(craft, ramp);
        if (interaction.onRamp) {
            result.rampInteraction = interaction;
            // Elevate raft along ramp incline
            pos.y = Math.max(pos.y, interaction.rampY);
            if (interaction.launched && interaction.launchVelocity) {
                vel.x = interaction.launchVelocity.x;
                vel.y = interaction.launchVelocity.y;
                vel.z = interaction.launchVelocity.z;
            }
            break;
        }
    }

    // D. Collect airborne Coin Rings
    if (hazards.coinRings && hazards.coinRings.length > 0) {
        const coinRes = collectCoinRings(pos, hazards.coinRings, 2.2);
        if (coinRes.collectedCount > 0) {
            result.coinsEarned = coinRes.earnedCoins;
            result.collectedCoinIds = coinRes.collectedIds;
        }
    }

    // E. Update Mine Barrels
    if (hazards.mines && hazards.mines.length > 0) {
        const dtMs = Math.round(dt * 1000);
        for (let i = 0; i < hazards.mines.length; i++) {
            const mine = hazards.mines[i];
            const updateRes = updateMineBarrel(mine, [craft], dtMs, now);
            if (updateRes.events.length > 0) {
                result.mineEvents.push(...updateRes.events);
                // Apply knockback if hit by detonation
                for (const ev of updateRes.events) {
                    if (ev.type === 'mineDetonated') {
                        const hit = ev.hits.find((h) => h.targetId === craft.id || h.targetId === 0);
                        if (hit) {
                            vel.x += hit.knockback.x / (craft.mass || 5);
                            vel.y += hit.knockback.y / (craft.mass || 5);
                            vel.z += hit.knockback.z / (craft.mass || 5);
                        }
                    }
                }
            }
        }
    }

    // F. Update Log Jams (Barricades)
    if (hazards.logJams && hazards.logJams.length > 0) {
        result.logJamCollisions = [];
        for (let i = 0; i < hazards.logJams.length; i++) {
            const lj = hazards.logJams[i];
            const col = evaluateLogJamCollision(craft, lj, dt);
            if (col.collided) {
                result.logJamCollisions.push(col);
                vel.x += col.reboundForce.x;
                vel.z += col.reboundForce.z;
            }
            if (lj.shudderTimerS > 0) {
                lj.shudderTimerS = Math.max(0, lj.shudderTimerS - dt);
                if (lj.shudderTimerS === 0 && lj.state === 'shuddering') {
                    lj.state = lj.hp <= 0 ? 'splintered' : 'intact';
                }
            }
        }
    }

    // G. Update River Geysers
    if (hazards.geysers && hazards.geysers.length > 0) {
        result.activeGeysers = [];
        const timeSec = typeof now === 'number' ? (now > 10000 ? now * 0.001 : now) : 0;
        for (let i = 0; i < hazards.geysers.length; i++) {
            const g = hazards.geysers[i];
            const gState = evaluateGeyserState(g, timeSec);
            const dx = pos.x - g.x;
            const dz = pos.z - g.z;
            const distSq = dx * dx + dz * dz;
            if (distSq <= g.radius * g.radius) {
                result.activeGeysers.push({ geyserId: g.id, ...gState });
                if (gState.state === 'erupting' && gState.updraftForce > 0) {
                    const prox = 1.0 - Math.sqrt(distSq) / g.radius;
                    vel.y += gState.updraftForce * prox * dt;
                }
            }
        }
    }

    return result;
}
