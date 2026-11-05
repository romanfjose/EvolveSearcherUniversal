/**
 * Don't Sink, Don't Die — Pocket-Raft Mid-Air Stunt Trick & Perfect Parry Reflection Engine
 *
 * Deterministic, pure-math gameplay logic with zero timers, zero I/O, zero external dependencies.
 * Handles:
 * 1. Mid-air pocket-raft stunts:
 *    - 'kickflip': 360-degree Pocket-Raft Kickflip (+5 coins, +2.5s hydro-planing speed boost on landing).
 *    - 'bellyflop-slam': High-altitude No-Raft Bellyflop Slam creating a 6m shockwave splash damaging nearby enemies on water landing.
 *    - 'plank-parkour-chain': Consecutive landings across elevated wooden planks (x2, x3, x4 multiplier + immunity from the Elevation-Blind Wizard).
 *    - 'wizard-head-bounce': Bouncing off the top of an enemy's head mid-air resets jump cooldown and awards +10 style coins.
 * 2. Perfect Parry Reflection:
 *    - 220ms Perfect Parry window when pressing Block (RMB/Shift) right before an enemy hit.
 *    - Reduces incoming damage to 0.
 *    - Triggers a 60ms hit-stop micro-freeze.
 *    - Reflects the Wizard's telekinetic throw impulse back at him (stunning him for 2.5s).
 */

export const TRICK_CONSTANTS = {
    // Air / Jump thresholds
    AIR_HEIGHT_THRESHOLD: 1.0, // craft.position.y > 1.0 is airborne / safe height
    BELLYFLOP_MIN_ALTITUDE: 3.0, // Minimum peak height achieved to qualify for bellyflop slam
    BELLYFLOP_SHOCKWAVE_RADIUS: 6.0, // 6m AoE shockwave splash on water landing
    BELLYFLOP_BASE_DAMAGE: 35, // AoE splash damage to nearby enemies

    // Kickflip constants
    KICKFLIP_COINS: 5,
    KICKFLIP_BOOST_DURATION: 2.5, // 2.5s hydro-planing speed boost on landing
    KICKFLIP_SPEED_MULTIPLIER: 1.6, // +60% speed multiplier during boost
    KICKFLIP_ROTATION_DEGREES: 360,

    // Head bounce constants
    HEAD_BOUNCE_COINS: 10,
    HEAD_BOUNCE_REBOUND_VELOCITY_Y: 18.0, // Mid-air rebound upward thrust
    HEAD_BOUNCE_RADIUS: 2.2, // Horizontal tolerance for enemy head hit
    HEAD_BOUNCE_MIN_VELOCITY_Y: -2.0, // Player must be falling or at apex

    // Plank parkour chain multipliers
    PLANK_CHAIN_MAX_GAP_MS: 3000, // Maximum time between plank landings to maintain chain
    PLANK_CHAIN_MULTIPLIERS: [1, 2, 3, 4], // 1st = x1 (or base), 2nd = x2, 3rd = x3, 4th+ = x4
    PLANK_BASE_SCORE: 25,
};

export const PARRY_CONSTANTS = {
    PERFECT_PARRY_WINDOW_MS: 220, // 220ms active window from block press
    HIT_STOP_MS: 60, // 60ms micro-freeze
    WIZARD_STUN_DURATION_MS: 2500, // 2.5s stun on reflected impulse
    COUNTER_DAMAGE: 20, // Reflection counter damage dealt to wizard
};

/**
 * Creates an initial trick & parry state for a player or craft.
 */
export function createPlayerTrickState() {
    return {
        // Airborne & Stunt tracking
        airborne: false,
        airborneTime: 0,
        jumpPeakY: 0,
        activeTrick: null, // 'kickflip' | 'bellyflop-slam' | null
        trickQueued: null, // Input registered while airborne
        kickflipRotation: 0, // 0..360 degrees
        kickflipCompleted: false,

        // Post-landing buffs
        hydroplaningTimer: 0, // seconds remaining of speed boost
        hydroplaningMultiplier: 1.0,

        // Plank parkour chain
        plankChainCount: 0,
        lastPlankLandingTime: -Infinity,
        wizardImmunity: false,

        // Block / Parry timing
        lastBlockPressTime: -Infinity,
        isBlocking: false,
        hitStopTimerMs: 0,

        // Jump reset flag
        jumpCooldownReset: false,

        // Stats & coins earned through tricks
        trickCoinsEarned: 0,
        tricksPerformed: {
            kickflip: 0,
            bellyflopSlam: 0,
            plankParkourChain: 0,
            wizardHeadBounce: 0,
            perfectParries: 0,
        },
    };
}

/**
 * Registers an input event for block / parry timing.
 *
 * @param {object} trickState - Player's trick state
 * @param {boolean} blockInput - Whether block key/RMB is pressed
 * @param {number} nowMs - Current game timestamp in ms
 */
export function recordBlockInput(trickState, blockInput, nowMs) {
    const wasBlocking = trickState.isBlocking;
    trickState.isBlocking = Boolean(blockInput);

    // Trigger block press timestamp only on fresh press (rising edge)
    if (blockInput && !wasBlocking) {
        trickState.lastBlockPressTime = nowMs;
    }
}

/**
 * Checks whether an incoming enemy hit falls within the 220ms Perfect Parry window.
 *
 * @param {object} trickState - Player trick state
 * @param {number} nowMs - Current game timestamp in ms
 * @returns {boolean} True if within the 220ms window
 */
export function isWithinParryWindow(trickState, nowMs) {
    if (!trickState.isBlocking) return false;
    const elapsed = nowMs - trickState.lastBlockPressTime;
    return elapsed >= 0 && elapsed <= PARRY_CONSTANTS.PERFECT_PARRY_WINDOW_MS;
}

/**
 * Resolves an incoming enemy attack against the player, taking the Perfect Parry into account.
 * If parried:
 * - Reduces damage to 0
 * - Triggers 60ms hit-stop micro-freeze
 * - If attack was from the Wizard ('whiteGuy'), reflects telekinetic impulse and stuns him for 2.5s.
 *
 * @param {object} trickState - Player's trick state
 * @param {number} incomingDamage - Base incoming damage from enemy
 * @param {string} enemyType - Enemy type ('whiteGuy', 'mudAlien', 'longWorm')
 * @param {object} [options] - Optional context: { nowMs, enemyRef, attackForce }
 * @returns {object} Resolution details { parried, damageTaken, hitStopMs, wizardStunned, reflectedImpulse }
 */
export function resolveIncomingHitWithParry(trickState, incomingDamage, enemyType, options = {}) {
    const nowMs = options.nowMs ?? 0;
    const parried = isWithinParryWindow(trickState, nowMs);

    if (parried) {
        trickState.hitStopTimerMs = PARRY_CONSTANTS.HIT_STOP_MS;
        trickState.tricksPerformed.perfectParries += 1;

        let wizardStunned = false;
        let reflectedImpulse = null;

        if (enemyType === 'whiteGuy') {
            wizardStunned = true;
            // Reverse the attack force or generate reflection impulse
            const force = options.attackForce || { x: 0, y: 300, z: 300 };
            reflectedImpulse = {
                x: -force.x,
                y: Math.max(150, force.y * 0.8),
                z: -force.z,
                stunDurationMs: PARRY_CONSTANTS.WIZARD_STUN_DURATION_MS,
                counterDamage: PARRY_CONSTANTS.COUNTER_DAMAGE,
            };

            // If enemy reference is passed directly, apply stun and damage
            if (options.enemyRef) {
                options.enemyRef.stunnedUntil = nowMs + PARRY_CONSTANTS.WIZARD_STUN_DURATION_MS;
                options.enemyRef.health = Math.max(0, (options.enemyRef.health || 0) - PARRY_CONSTANTS.COUNTER_DAMAGE);
            }
        }

        return {
            parried: true,
            damageTaken: 0,
            hitStopMs: PARRY_CONSTANTS.HIT_STOP_MS,
            wizardStunned,
            reflectedImpulse,
            counterDamage: enemyType === 'whiteGuy' ? PARRY_CONSTANTS.COUNTER_DAMAGE : 0,
        };
    }

    // Standard block or unblocked hit
    const damageTaken = trickState.isBlocking
        ? Math.floor(incomingDamage * 0.2) // 80% reduction on normal block
        : incomingDamage;

    return {
        parried: false,
        damageTaken,
        hitStopMs: 0,
        wizardStunned: false,
        reflectedImpulse: null,
        counterDamage: 0,
    };
}

/**
 * Checks and triggers mid-air stunt trick inputs while airborne:
 * - Steer (A/D) or Attack while airborne triggers 'kickflip' or 'bellyflop-slam'.
 *
 * @param {object} trickState - Player's trick state
 * @param {object} craft - Raft/player physics state { position, velocity }
 * @param {object} inputs - { attack, steer, a, d, left, right }
 * @param {number} nowMs - Current time in ms
 * @returns {string|null} The trick initiated, if any
 */
export function checkAirborneTrickInput(trickState, craft, inputs = {}, nowMs = 0) {
    if (!trickState.airborne) return null;

    const isSteering = Boolean(inputs.a || inputs.d || inputs.steer || inputs.left || inputs.right);
    const isAttacking = Boolean(inputs.attack || inputs.attacking);

    // If already doing a trick, do not overwrite unless completing
    if (trickState.activeTrick) return trickState.activeTrick;

    // High-altitude bellyflop slam (attack while falling or high altitude)
    if (isAttacking && (craft.position.y >= TRICK_CONSTANTS.BELLYFLOP_MIN_ALTITUDE || craft.velocity.y < -4.0)) {
        trickState.activeTrick = 'bellyflop-slam';
        return 'bellyflop-slam';
    }

    // Mid-air pocket-raft kickflip (steer or attack)
    if (isSteering || isAttacking) {
        trickState.activeTrick = 'kickflip';
        trickState.kickflipRotation = 0;
        trickState.kickflipCompleted = false;
        return 'kickflip';
    }

    return null;
}

/**
 * Checks for mid-air bounce off an enemy's head (e.g. River Wizard 'whiteGuy' or others).
 * When bouncing:
 * - Resets jump cooldown
 * - Thrusts player upward (rebound)
 * - Awards +10 style coins
 *
 * @param {object} craft - Player craft { position, velocity }
 * @param {object} trickState - Player trick state
 * @param {Array<object>} enemies - Array of enemy objects { id, type, position, health }
 * @returns {object|null} Head bounce event info or null
 */
export function checkWizardHeadBounce(craft, trickState, enemies = []) {
    // Only bounce when airborne and moving downward or near peak
    if (!trickState.airborne || craft.velocity.y > TRICK_CONSTANTS.HEAD_BOUNCE_MIN_VELOCITY_Y) {
        return null;
    }

    const pPos = craft.position;

    for (const enemy of enemies) {
        if (!enemy || enemy.health <= 0) continue;
        const ePos = enemy.position;
        const dx = pPos.x - ePos.x;
        const dz = pPos.z - ePos.z;
        const distXZ = Math.hypot(dx, dz);

        // Player must be above enemy within head bounce horizontal radius
        const headY = (ePos.y || 0.5) + 1.2; // Enemy head level
        const dy = pPos.y - headY;

        if (distXZ <= TRICK_CONSTANTS.HEAD_BOUNCE_RADIUS && dy >= -0.2 && dy <= 1.8) {
            // Rebound player upward
            craft.velocity.y = TRICK_CONSTANTS.HEAD_BOUNCE_REBOUND_VELOCITY_Y;
            trickState.jumpCooldownReset = true;
            trickState.trickCoinsEarned += TRICK_CONSTANTS.HEAD_BOUNCE_COINS;
            trickState.tricksPerformed.wizardHeadBounce += 1;

            return {
                enemyId: enemy.id,
                enemyType: enemy.type,
                coinsAwarded: TRICK_CONSTANTS.HEAD_BOUNCE_COINS,
                reboundY: craft.velocity.y,
                position: { ...pPos },
            };
        }
    }

    return null;
}

/**
 * Evaluates water or solid ground landing:
 * - Resolves active kickflip (awards +5 coins, activates 2.5s hydro-planing speed boost).
 * - Resolves active bellyflop slam (creates 6m shockwave splash damaging nearby enemies).
 * - Manages plank parkour chain (consecutive landings on elevated planks x2, x3, x4 multiplier + wizard immunity).
 *
 * @param {object} trickState - Player trick state
 * @param {object} craft - Player craft { position, velocity }
 * @param {object} landingInfo - { onWater, onSolid, onPlank, impactSpeed }
 * @param {Array<object>} enemies - Enemies in scene for shockwave AoE
 * @param {number} nowMs - Current timestamp in ms
 * @returns {object} Landing outcome summary { kickflipCompleted, bellyflopDamageEvents, plankChain, hydroplaningActive }
 */
export function resolveLanding(trickState, craft, landingInfo, enemies = [], nowMs = 0) {
    const outcome = {
        trick: trickState.activeTrick,
        coinsEarned: 0,
        speedBoostDuration: 0,
        shockwaveRadius: 0,
        shockwaveHits: [],
        plankChainCount: 0,
        plankMultiplier: 1,
        wizardImmunity: false,
    };

    // 1. Kickflip resolution
    if (trickState.activeTrick === 'kickflip') {
        trickState.kickflipCompleted = true;
        trickState.trickCoinsEarned += TRICK_CONSTANTS.KICKFLIP_COINS;
        trickState.tricksPerformed.kickflip += 1;
        trickState.hydroplaningTimer = TRICK_CONSTANTS.KICKFLIP_BOOST_DURATION;
        trickState.hydroplaningMultiplier = TRICK_CONSTANTS.KICKFLIP_SPEED_MULTIPLIER;

        outcome.coinsEarned += TRICK_CONSTANTS.KICKFLIP_COINS;
        outcome.speedBoostDuration = TRICK_CONSTANTS.KICKFLIP_BOOST_DURATION;
    }

    // 2. Bellyflop slam resolution (requires water landing)
    if (trickState.activeTrick === 'bellyflop-slam' && landingInfo.onWater) {
        trickState.tricksPerformed.bellyflopSlam += 1;
        outcome.shockwaveRadius = TRICK_CONSTANTS.BELLYFLOP_SHOCKWAVE_RADIUS;

        // Apply 6m AoE damage to nearby enemies
        const splashPos = craft.position;
        for (const enemy of enemies) {
            if (!enemy || enemy.health <= 0) continue;
            const dist = Math.hypot(enemy.position.x - splashPos.x, enemy.position.z - splashPos.z);
            if (dist <= TRICK_CONSTANTS.BELLYFLOP_SHOCKWAVE_RADIUS) {
                // Damage falls off slightly from epicenter
                const falloff = 1 - (dist / TRICK_CONSTANTS.BELLYFLOP_SHOCKWAVE_RADIUS) * 0.4;
                const damage = Math.round(TRICK_CONSTANTS.BELLYFLOP_BASE_DAMAGE * falloff);
                enemy.health = Math.max(0, enemy.health - damage);

                outcome.shockwaveHits.push({
                    enemyId: enemy.id,
                    enemyType: enemy.type,
                    damage,
                    dist,
                });
            }
        }
    }

    // 3. Plank parkour chain resolution
    if (landingInfo.onPlank) {
        const timeSinceLastPlank = nowMs - trickState.lastPlankLandingTime;
        if (timeSinceLastPlank <= TRICK_CONSTANTS.PLANK_CHAIN_MAX_GAP_MS) {
            trickState.plankChainCount = Math.min(4, trickState.plankChainCount + 1);
        } else {
            trickState.plankChainCount = 1;
        }

        trickState.lastPlankLandingTime = nowMs;
        trickState.wizardImmunity = true; // Immunity from the Elevation-Blind Wizard
        trickState.tricksPerformed.plankParkourChain += 1;

        const multiplier = TRICK_CONSTANTS.PLANK_CHAIN_MULTIPLIERS[trickState.plankChainCount - 1] || 1;
        outcome.plankChainCount = trickState.plankChainCount;
        outcome.plankMultiplier = multiplier;
        outcome.wizardImmunity = true;
    } else {
        // Landing on normal water or dock resets plank parkour chain and wizard immunity
        if (landingInfo.onWater) {
            trickState.plankChainCount = 0;
            trickState.wizardImmunity = false;
        }
    }

    // Reset airborne & stunt states
    trickState.airborne = false;
    trickState.airborneTime = 0;
    trickState.jumpPeakY = 0;
    trickState.activeTrick = null;

    return outcome;
}

/**
 * Step function to update player's trick state over a simulation delta time dt.
 *
 * @param {object} trickState - Player's trick state
 * @param {object} craft - Player craft { position, velocity }
 * @param {object} inputs - Input state { w, a, s, d, space, attack, block }
 * @param {number} dt - Step delta time in seconds
 * @param {number} nowMs - Current simulation time in milliseconds
 * @param {object} [context] - Context { enemies, obstacles }
 * @returns {object} Frame events { headBounce, landingOutcome, stuntState, hydroplaningActive }
 */
export function stepPlayerTricksAndParry(trickState, craft, inputs, dt, nowMs, context = {}) {
    const events = {
        headBounce: null,
        landing: null,
        parried: false,
        hydroplaningActive: trickState.hydroplaningTimer > 0,
    };

    // Update hit-stop micro-freeze timer
    if (trickState.hitStopTimerMs > 0) {
        trickState.hitStopTimerMs = Math.max(0, trickState.hitStopTimerMs - dt * 1000);
    }

    // Update hydro-planing speed boost timer
    if (trickState.hydroplaningTimer > 0) {
        trickState.hydroplaningTimer = Math.max(0, trickState.hydroplaningTimer - dt);
        if (trickState.hydroplaningTimer === 0) {
            trickState.hydroplaningMultiplier = 1.0;
        }
    }

    // Track block input timing
    recordBlockInput(trickState, inputs.block, nowMs);

    // Airborne detection (y > AIR_HEIGHT_THRESHOLD and not resting on water)
    const isAirborne = craft.position.y > TRICK_CONSTANTS.AIR_HEIGHT_THRESHOLD;

    if (isAirborne) {
        if (!trickState.airborne) {
            // Just became airborne
            trickState.airborne = true;
            trickState.airborneTime = 0;
            trickState.jumpPeakY = craft.position.y;
            trickState.activeTrick = null;
            trickState.kickflipRotation = 0;
        }

        trickState.airborneTime += dt;
        trickState.jumpPeakY = Math.max(trickState.jumpPeakY, craft.position.y);

        // Check if player initiates a mid-air stunt trick
        checkAirborneTrickInput(trickState, craft, inputs, nowMs);

        // Advance kickflip 360-degree rotation animation
        if (trickState.activeTrick === 'kickflip') {
            trickState.kickflipRotation = Math.min(360, trickState.kickflipRotation + (360 / 0.6) * dt);
        }

        // Check enemy head bounce mid-air
        if (context.enemies) {
            const bounce = checkWizardHeadBounce(craft, trickState, context.enemies);
            if (bounce) {
                events.headBounce = bounce;
            }
        }
    } else if (trickState.airborne) {
        // Just landed!
        const onPlank = Boolean(context.onPlank);
        const onWater = craft.position.y <= 0.35 && !onPlank;
        const landingInfo = {
            onWater,
            onPlank,
            onSolid: onPlank || Boolean(context.onSolid),
            impactSpeed: Math.abs(craft.velocity.y),
        };

        const landingOutcome = resolveLanding(trickState, craft, landingInfo, context.enemies || [], nowMs);
        events.landing = landingOutcome;
    }

    // Check plank chain timeout
    if (trickState.plankChainCount > 0 && nowMs - trickState.lastPlankLandingTime > TRICK_CONSTANTS.PLANK_CHAIN_MAX_GAP_MS) {
        trickState.plankChainCount = 0;
        trickState.wizardImmunity = false;
    }

    return events;
}
