import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveHighestOwnedTier,
    computeTieredCraftFeel,
    TIERED_FEEL_SCALES,
} from '../shared/tiered-upgrade-physics-bridge.js';

describe('Videogame Helmet 06: Multi-Tier Armory Physics & Wake Escalation Bridge', () => {
    describe('resolveHighestOwnedTier: Slot & Tier Resolution', () => {
        it('returns tier 0 when upgrades array is empty, null, or undefined', () => {
            assert.equal(resolveHighestOwnedTier([], 'motor'), 0);
            assert.equal(resolveHighestOwnedTier(null, 'motor'), 0);
            assert.equal(resolveHighestOwnedTier(undefined, 'weapon'), 0);
            assert.equal(resolveHighestOwnedTier('not-an-array', 'armor'), 0);
        });

        it('defaults to slot "motor" when slot is omitted or invalid', () => {
            assert.equal(resolveHighestOwnedTier(['motor_1']), 1);
            assert.equal(resolveHighestOwnedTier(['motor_2'], null), 2);
            assert.equal(resolveHighestOwnedTier(['motor_3'], undefined), 3);
        });

        it('resolves explicit tiered IDs across all 3 slots (motor_1/2/3, weapon_1/2/3, armor_1/2/3)', () => {
            assert.equal(resolveHighestOwnedTier(['motor_1'], 'motor'), 1);
            assert.equal(resolveHighestOwnedTier(['motor_2'], 'motor'), 2);
            assert.equal(resolveHighestOwnedTier(['motor_3'], 'motor'), 3);

            assert.equal(resolveHighestOwnedTier(['weapon_1'], 'weapon'), 1);
            assert.equal(resolveHighestOwnedTier(['weapon_2'], 'weapon'), 2);
            assert.equal(resolveHighestOwnedTier(['weapon_3'], 'weapon'), 3);

            assert.equal(resolveHighestOwnedTier(['armor_1'], 'armor'), 1);
            assert.equal(resolveHighestOwnedTier(['armor_2'], 'armor'), 2);
            assert.equal(resolveHighestOwnedTier(['armor_3'], 'armor'), 3);
        });

        it('resolves legacy IDs (motor, motor_mk2, motor_mk3, weapon, weapon_mk2, weapon_mk3, armor, armor_mk2, armor_mk3)', () => {
            assert.equal(resolveHighestOwnedTier(['motor'], 'motor'), 1);
            assert.equal(resolveHighestOwnedTier(['motor_mk2'], 'motor'), 2);
            assert.equal(resolveHighestOwnedTier(['motor_mk3'], 'motor'), 3);

            assert.equal(resolveHighestOwnedTier(['weapon'], 'weapon'), 1);
            assert.equal(resolveHighestOwnedTier(['weapon_mk2'], 'weapon'), 2);
            assert.equal(resolveHighestOwnedTier(['weapon_mk3'], 'weapon'), 3);

            assert.equal(resolveHighestOwnedTier(['armor'], 'armor'), 1);
            assert.equal(resolveHighestOwnedTier(['armor_mk2'], 'armor'), 2);
            assert.equal(resolveHighestOwnedTier(['armor_mk3'], 'armor'), 3);
        });

        it('picks the highest owned tier when multiple tiers or slots are in inventory', () => {
            const mixedInventory = ['motor_1', 'motor_2', 'weapon_1', 'armor_3'];
            assert.equal(resolveHighestOwnedTier(mixedInventory, 'motor'), 2);
            assert.equal(resolveHighestOwnedTier(mixedInventory, 'weapon'), 1);
            assert.equal(resolveHighestOwnedTier(mixedInventory, 'armor'), 3);
        });

        it('handles unknown slots or unrecognized items gracefully without crashing', () => {
            assert.equal(resolveHighestOwnedTier(['unknown_gadget', 'patch'], 'motor'), 0);
            assert.equal(resolveHighestOwnedTier(['motor_1'], 'non_existent_slot'), 0);
            assert.equal(resolveHighestOwnedTier([null, undefined, '', '   '], 'motor'), 0);
        });

        it('is case-insensitive and trims whitespace in slot names and upgrade keys', () => {
            assert.equal(resolveHighestOwnedTier(['  motor_2  '], ' MOTOR '), 2);
            assert.equal(resolveHighestOwnedTier(['WEAPON_3'], 'weapon'), 3);
            assert.equal(resolveHighestOwnedTier(['  armor_mk2  '], ' Armor '), 2);
        });
    });

    describe('computeTieredCraftFeel: Sensory Feedback & Kinetic Escalation Curves', () => {
        it('returns baseline feel values at Tier 0 (no upgrades)', () => {
            const feel = computeTieredCraftFeel([]);
            assert.deepEqual(feel, {
                motorTier: 0,
                weaponTier: 0,
                armorTier: 0,
                wakeFoamMultiplier: 1.0,
                meleeKnockbackBonus: 0,
                cameraFovPunch: 0,
                hullStabilityFactor: 1.0,
            });
        });

        it('escalates wakeFoamMultiplier across Motor tiers (1.0 -> 1.35 -> 1.75 -> 2.2)', () => {
            assert.equal(computeTieredCraftFeel([]).wakeFoamMultiplier, 1.0);
            assert.equal(computeTieredCraftFeel(['motor_1']).wakeFoamMultiplier, 1.35);
            assert.equal(computeTieredCraftFeel(['motor_2']).wakeFoamMultiplier, 1.75);
            assert.equal(computeTieredCraftFeel(['motor_3']).wakeFoamMultiplier, 2.2);
        });

        it('escalates meleeKnockbackBonus across Weapon tiers (0 -> 0.8 -> 1.8 -> 3.0)', () => {
            assert.equal(computeTieredCraftFeel([]).meleeKnockbackBonus, 0);
            assert.equal(computeTieredCraftFeel(['weapon_1']).meleeKnockbackBonus, 0.8);
            assert.equal(computeTieredCraftFeel(['weapon_2']).meleeKnockbackBonus, 1.8);
            assert.equal(computeTieredCraftFeel(['weapon_3']).meleeKnockbackBonus, 3.0);
        });

        it('escalates cameraFovPunch across Weapon tiers (0 -> 1.2 -> 2.2 -> 3.5)', () => {
            assert.equal(computeTieredCraftFeel([]).cameraFovPunch, 0);
            assert.equal(computeTieredCraftFeel(['weapon_1']).cameraFovPunch, 1.2);
            assert.equal(computeTieredCraftFeel(['weapon_2']).cameraFovPunch, 2.2);
            assert.equal(computeTieredCraftFeel(['weapon_3']).cameraFovPunch, 3.5);
        });

        it('escalates hullStabilityFactor across Armor tiers (1.0 -> 1.2 -> 1.45 -> 1.75)', () => {
            assert.equal(computeTieredCraftFeel([]).hullStabilityFactor, 1.0);
            assert.equal(computeTieredCraftFeel(['armor_1']).hullStabilityFactor, 1.2);
            assert.equal(computeTieredCraftFeel(['armor_2']).hullStabilityFactor, 1.45);
            assert.equal(computeTieredCraftFeel(['armor_3']).hullStabilityFactor, 1.75);
        });

        it('computes mixed multi-tier loadouts accurately', () => {
            const feel = computeTieredCraftFeel(['motor_2', 'weapon_3', 'armor_1']);
            assert.equal(feel.motorTier, 2);
            assert.equal(feel.weaponTier, 3);
            assert.equal(feel.armorTier, 1);

            assert.equal(feel.wakeFoamMultiplier, 1.75);
            assert.equal(feel.meleeKnockbackBonus, 3.0);
            assert.equal(feel.cameraFovPunch, 3.5);
            assert.equal(feel.hullStabilityFactor, 1.2);
        });

        it('computes max apex loadouts (all Tier 3)', () => {
            const feel = computeTieredCraftFeel(['motor_3', 'weapon_3', 'armor_3']);
            assert.equal(feel.motorTier, 3);
            assert.equal(feel.weaponTier, 3);
            assert.equal(feel.armorTier, 3);

            assert.equal(feel.wakeFoamMultiplier, 2.2);
            assert.equal(feel.meleeKnockbackBonus, 3.0);
            assert.equal(feel.cameraFovPunch, 3.5);
            assert.equal(feel.hullStabilityFactor, 1.75);
        });

        it('handles null, undefined, corrupted or malformed input without NaN or errors', () => {
            const f1 = computeTieredCraftFeel(null);
            assert.equal(f1.wakeFoamMultiplier, 1.0);
            assert.equal(f1.meleeKnockbackBonus, 0);

            const f2 = computeTieredCraftFeel(['invalid_item', 42, null, { foo: 'bar' }]);
            assert.equal(f2.motorTier, 0);
            assert.equal(f2.weaponTier, 0);
            assert.equal(f2.armorTier, 0);
            assert.equal(f2.wakeFoamMultiplier, 1.0);
        });

        it('guarantees TIERED_FEEL_SCALES constants are strictly frozen', () => {
            assert.ok(Object.isFrozen(TIERED_FEEL_SCALES));
            assert.ok(Object.isFrozen(TIERED_FEEL_SCALES.WAKE_FOAM_MULTIPLIER));
            assert.ok(Object.isFrozen(TIERED_FEEL_SCALES.MELEE_KNOCKBACK_BONUS));
            assert.ok(Object.isFrozen(TIERED_FEEL_SCALES.CAMERA_FOV_PUNCH));
            assert.ok(Object.isFrozen(TIERED_FEEL_SCALES.HULL_STABILITY_FACTOR));
        });
    });
});
