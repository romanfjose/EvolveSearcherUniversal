/**
 * Don't Sink, Don't Die — Crew Class Passive Perks Gameplay Bridge
 * Videogame Helmet 08 & Sovereign Core
 *
 * Bridges playable crew class passive perks into live craft kinematics,
 * combat damage mitigation, armory shop pricing, and team aura calculations.
 */

import { CREW_CLASSES, getCrewClass } from './crew-classes.js';

/**
 * Resolves a sanitized perk object with guaranteed finite numbers for the given classId.
 *
 * Defaults to 'helmsman' if classId is omitted, null, or invalid.
 * Perks returned:
 * - classId: string
 * - turnResponsivenessMultiplier: number (1.15 for helmsman, 1.0 otherwise)
 * - meleeKnockbackMultiplier: number (1.25 for bruiser, 1.0 otherwise)
 * - swingArcMultiplier: number (1.25 for bruiser, 1.0 otherwise)
 * - shopCostMultiplier: number (0.80 for tinkerer, 1.0 otherwise)
 * - motorSpeedMultiplier: number (1.25 for tinkerer, 1.0 otherwise)
 * - blockDamageReductionBonus: number (0.25 for mystic, 0.0 otherwise)
 * - reviveAuraMultiplier: number (1.35 for mystic, 1.0 otherwise)
 *
 * @param {string} [classId='helmsman']
 * @returns {object} Sanitized perk configuration object
 */
export function resolveCrewClassPerks(classId = 'helmsman') {
    const cls = getCrewClass(classId, 'helmsman');
    const id = cls && cls.id ? cls.id : 'helmsman';

    return {
        classId: id,
        turnResponsivenessMultiplier: id === 'helmsman' ? 1.15 : 1.0,
        meleeKnockbackMultiplier: id === 'bruiser' ? 1.25 : 1.0,
        swingArcMultiplier: id === 'bruiser' ? 1.25 : 1.0,
        shopCostMultiplier: id === 'tinkerer' ? 0.80 : 1.0,
        motorSpeedMultiplier: id === 'tinkerer' ? 1.25 : 1.0,
        blockDamageReductionBonus: id === 'mystic' ? 0.25 : 0.0,
        reviveAuraMultiplier: id === 'mystic' ? 1.35 : 1.0,
    };
}

/**
 * Applies class passive perks to craft kinematics.
 * - Applies turnResponsivenessMultiplier to craft.angularVelocity.y.
 * - Applies motorSpeedMultiplier to forward velocity when motor thrust is active.
 * - Stores craft.classPerks = resolveCrewClassPerks(classId).
 *
 * @param {object} craft - Kinematic craft object ({ velocity, angularVelocity, ... })
 * @param {string} [classId='helmsman'] - Selected crew class ID
 * @param {number} [dt=1/60] - Timestep delta in seconds
 * @returns {object} The modified craft object
 */
export function applyCrewClassToKinematics(craft, classId = 'helmsman', dt = 1 / 60) {
    if (!craft) return craft;

    const perks = resolveCrewClassPerks(classId);
    craft.classPerks = perks;

    // Apply turn responsiveness multiplier to angularVelocity.y
    if (craft.angularVelocity && typeof craft.angularVelocity.y === 'number' && Number.isFinite(craft.angularVelocity.y)) {
        if (perks.turnResponsivenessMultiplier !== 1.0) {
            craft.angularVelocity.y *= perks.turnResponsivenessMultiplier;
        }
    }

    // Determine if motor thrust is active
    const isMotorActive = Boolean(
        craft.motorThrustActive ||
        craft.isMotorActive ||
        craft.motorActive ||
        craft.motorEngaged ||
        (craft.input && (craft.input.motorThrustActive || craft.input.isMotorActive)) ||
        (Array.isArray(craft.upgrades) && craft.upgrades.some(u => typeof u === 'string' && u.startsWith('motor')) && craft.input?.w)
    );

    // If motor is active and motorSpeedMultiplier differs from 1.0, scale planar velocity
    if (isMotorActive && perks.motorSpeedMultiplier !== 1.0 && craft.velocity) {
        if (typeof craft.velocity.x === 'number' && Number.isFinite(craft.velocity.x)) {
            craft.velocity.x *= perks.motorSpeedMultiplier;
        }
        if (typeof craft.velocity.z === 'number' && Number.isFinite(craft.velocity.z)) {
            craft.velocity.z *= perks.motorSpeedMultiplier;
        }
    }

    return craft;
}

/**
 * Computes the discounted shop cost based on crew class.
 * Tinkerer gains a 20% discount (shopCostMultiplier = 0.80).
 * Always returns at least 1 coin (Math.max(1, Math.round(baseCost * perks.shopCostMultiplier))).
 *
 * @param {number} baseCost - Base item cost in coins
 * @param {string} [classId='helmsman'] - Selected crew class ID
 * @returns {number} Integer cost after class discount
 */
export function computeClassDiscountedCost(baseCost, classId = 'helmsman') {
    const cost = Number(baseCost);
    if (!Number.isFinite(cost) || cost <= 0) {
        return 1;
    }
    const perks = resolveCrewClassPerks(classId);
    return Math.max(1, Math.round(cost * perks.shopCostMultiplier));
}

/**
 * Computes damage taken after applying block damage reduction and class perks.
 *
 * When isBlocking is false, returns incomingDamage unmodified (or clamped to >= 0).
 * When isBlocking is true:
 * - Standard block absorbs 70% damage (30% taken: baseBlockFactor = 0.30).
 * - Mystic bonus reduces damage taken by an extra blockDamageReductionBonus (0.25).
 * - Clamped so Mystic takes only 15% (0.15) of incoming damage (i.e. 0.30 - 0.25 = 0.05, clamped to min 0.15).
 *
 * @param {number} incomingDamage - Raw damage before block
 * @param {string} [classId='helmsman'] - Selected crew class ID
 * @param {boolean} [isBlocking=false] - Whether craft/player is currently in block stance
 * @returns {number} Damage taken after block calculations
 */
export function computeClassModifiedBlockDamage(incomingDamage, classId = 'helmsman', isBlocking = false) {
    const rawDamage = Number(incomingDamage);
    if (!Number.isFinite(rawDamage) || rawDamage <= 0) {
        return 0;
    }

    if (!isBlocking) {
        return rawDamage;
    }

    const perks = resolveCrewClassPerks(classId);

    // Standard block: 70% reduction -> 30% taken (0.30 factor)
    let damageFactor = 0.30;

    if (perks.blockDamageReductionBonus > 0) {
        // Mystic takes only 15% of incoming damage
        damageFactor = Math.max(0.15, damageFactor - perks.blockDamageReductionBonus);
    }

    return Math.max(0, rawDamage * damageFactor);
}
