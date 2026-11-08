/**
 * Multi-Tier Armory Physics & Wake Escalation Bridge
 * (`shared/tiered-upgrade-physics-bridge.js`)
 *
 * Sovereign Core & Videogame Helmet 06 Directive:
 * - Fulfills the sensory promise that purchasing high-tier armory upgrades changes
 *   how the watercraft feels, moves, and reacts in line of sight.
 * - Prevents high-tier motors, weapons, and armor from feeling like invisible stats or
 *   silent background number changes.
 * - Scales physical water wake foam ribbons, weapon melee knockback impulse, impact camera
 *   FOV micro-punch, and hull hydrodynamic stability across Tiers 0 to 3.
 *
 * Slots & Tiers:
 *   - Motor (T0..T3): wakeFoamMultiplier (1.0 -> 1.35 -> 1.75 -> 2.2)
 *   - Weapon (T0..T3): meleeKnockbackBonus (0 -> 0.8 -> 1.8 -> 3.0), cameraFovPunch (0 -> 1.2 -> 2.2 -> 3.5)
 *   - Armor (T0..T3): hullStabilityFactor (1.0 -> 1.2 -> 1.45 -> 1.75)
 *
 * Zero external dependencies. Pure, deterministic, headless-safe ES module.
 */

import {
    UPGRADE_SLOTS,
    ARMORY_UPGRADE_TREE,
} from './upgrade-tree.js';

/**
 * Progression curves and escalation scales across Tiers 0 through 3.
 */
export const TIERED_FEEL_SCALES = Object.freeze({
    // Wake foam volume & ribbon width multiplier driven by Motor tier
    WAKE_FOAM_MULTIPLIER: Object.freeze([1.0, 1.35, 1.75, 2.2]),

    // Melee attack impact knockback impulse bonus (N*s or m/s impulse) driven by Weapon tier
    MELEE_KNOCKBACK_BONUS: Object.freeze([0, 0.8, 1.8, 3.0]),

    // Camera FOV micro-punch degrees (impact zoom snappy juice) driven by Weapon tier
    CAMERA_FOV_PUNCH: Object.freeze([0, 1.2, 2.2, 3.5]),

    // Hull hydrodynamic stability & wave-rocking damping factor driven by Armor tier
    HULL_STABILITY_FACTOR: Object.freeze([1.0, 1.2, 1.45, 1.75]),
});

/**
 * Resolves the highest owned tier (0 | 1 | 2 | 3) for a designated slot
 * from an array of owned upgrade keys.
 *
 * Supports both explicit tiered IDs ('motor_1', 'motor_2', 'motor_3')
 * and legacy identifiers ('motor', 'motor_mk2', 'motor_mk3').
 *
 * @param {Array<string>} [upgrades=[]] - Owned upgrade ID strings
 * @param {string} [slot='motor'] - Target slot ('motor' | 'weapon' | 'armor')
 * @returns {number} Highest tier owned (0, 1, 2, or 3)
 */
export function resolveHighestOwnedTier(upgrades = [], slot = 'motor') {
    if (!Array.isArray(upgrades) || upgrades.length === 0) return 0;
    const targetSlot = typeof slot === 'string' ? slot.toLowerCase().trim() : 'motor';
    const slotTiers = ARMORY_UPGRADE_TREE[targetSlot];
    if (!slotTiers || !Array.isArray(slotTiers)) return 0;

    let highestTier = 0;

    for (const rawKey of upgrades) {
        if (!rawKey) continue;
        const key = String(rawKey).toLowerCase().trim();

        // 1. Direct ID match or legacy match in definition tree
        for (const item of slotTiers) {
            if (item.id.toLowerCase() === key || item.legacyType.toLowerCase() === key) {
                if (item.tier > highestTier) {
                    highestTier = item.tier;
                }
            }
        }

        // 2. Fallback heuristic pattern matching: `${slot}_${tier}` (e.g. 'motor_2')
        if (key.startsWith(`${targetSlot}_`)) {
            const parsed = parseInt(key.slice(targetSlot.length + 1), 10);
            if (Number.isFinite(parsed) && parsed > highestTier && parsed <= 3) {
                highestTier = parsed;
            }
        }
    }

    return Math.min(3, Math.max(0, highestTier));
}

/**
 * Computes tiered craft feel, wake escalation, and tactile feedback multipliers
 * for a watercraft based on owned armory upgrades.
 *
 * @param {Array<string>} [upgrades=[]] - Array of owned upgrade IDs or legacy keys
 * @returns {{
 *   motorTier: number,
 *   weaponTier: number,
 *   armorTier: number,
 *   wakeFoamMultiplier: number,
 *   meleeKnockbackBonus: number,
 *   cameraFovPunch: number,
 *   hullStabilityFactor: number
 * }}
 */
export function computeTieredCraftFeel(upgrades = []) {
    const list = Array.isArray(upgrades) ? upgrades : [];

    const motorTier = resolveHighestOwnedTier(list, UPGRADE_SLOTS.MOTOR || 'motor');
    const weaponTier = resolveHighestOwnedTier(list, UPGRADE_SLOTS.WEAPON || 'weapon');
    const armorTier = resolveHighestOwnedTier(list, UPGRADE_SLOTS.ARMOR || 'armor');

    const wakeFoamMultiplier = TIERED_FEEL_SCALES.WAKE_FOAM_MULTIPLIER[motorTier] ?? 1.0;
    const meleeKnockbackBonus = TIERED_FEEL_SCALES.MELEE_KNOCKBACK_BONUS[weaponTier] ?? 0;
    const cameraFovPunch = TIERED_FEEL_SCALES.CAMERA_FOV_PUNCH[weaponTier] ?? 0;
    const hullStabilityFactor = TIERED_FEEL_SCALES.HULL_STABILITY_FACTOR[armorTier] ?? 1.0;

    return {
        motorTier,
        weaponTier,
        armorTier,
        wakeFoamMultiplier,
        meleeKnockbackBonus,
        cameraFovPunch,
        hullStabilityFactor,
    };
}
