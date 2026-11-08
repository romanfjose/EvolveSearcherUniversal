import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveCrewClassPerks,
    applyCrewClassToKinematics,
    computeClassDiscountedCost,
    computeClassModifiedBlockDamage,
} from '../shared/crew-class-gameplay-bridge.js';

describe('Videogame Helmet 08 & Sovereign Core — Crew Class Gameplay Bridge', () => {
    describe('resolveCrewClassPerks: sanitization and perk values', () => {
        it('resolves helmsman perks with 1.15 turn responsiveness and defaults otherwise', () => {
            const perks = resolveCrewClassPerks('helmsman');
            assert.equal(perks.classId, 'helmsman');
            assert.equal(perks.turnResponsivenessMultiplier, 1.15);
            assert.equal(perks.meleeKnockbackMultiplier, 1.0);
            assert.equal(perks.swingArcMultiplier, 1.0);
            assert.equal(perks.shopCostMultiplier, 1.0);
            assert.equal(perks.motorSpeedMultiplier, 1.0);
            assert.equal(perks.blockDamageReductionBonus, 0.0);
            assert.equal(perks.reviveAuraMultiplier, 1.0);
        });

        it('defaults to helmsman when classId is undefined, null or empty', () => {
            const defaultPerks = resolveCrewClassPerks();
            assert.equal(defaultPerks.classId, 'helmsman');
            assert.equal(defaultPerks.turnResponsivenessMultiplier, 1.15);

            const nullPerks = resolveCrewClassPerks(null);
            assert.equal(nullPerks.classId, 'helmsman');
            assert.equal(nullPerks.turnResponsivenessMultiplier, 1.15);

            const emptyPerks = resolveCrewClassPerks('');
            assert.equal(emptyPerks.classId, 'helmsman');
            assert.equal(emptyPerks.turnResponsivenessMultiplier, 1.15);
        });

        it('resolves bruiser perks with 1.25 melee knockback and 1.25 swing arc', () => {
            const perks = resolveCrewClassPerks('bruiser');
            assert.equal(perks.classId, 'bruiser');
            assert.equal(perks.turnResponsivenessMultiplier, 1.0);
            assert.equal(perks.meleeKnockbackMultiplier, 1.25);
            assert.equal(perks.swingArcMultiplier, 1.25);
            assert.equal(perks.shopCostMultiplier, 1.0);
            assert.equal(perks.motorSpeedMultiplier, 1.0);
            assert.equal(perks.blockDamageReductionBonus, 0.0);
            assert.equal(perks.reviveAuraMultiplier, 1.0);
        });

        it('resolves tinkerer perks with 0.80 shop cost and 1.25 motor speed', () => {
            const perks = resolveCrewClassPerks('tinkerer');
            assert.equal(perks.classId, 'tinkerer');
            assert.equal(perks.turnResponsivenessMultiplier, 1.0);
            assert.equal(perks.meleeKnockbackMultiplier, 1.0);
            assert.equal(perks.swingArcMultiplier, 1.0);
            assert.equal(perks.shopCostMultiplier, 0.80);
            assert.equal(perks.motorSpeedMultiplier, 1.25);
            assert.equal(perks.blockDamageReductionBonus, 0.0);
            assert.equal(perks.reviveAuraMultiplier, 1.0);
        });

        it('resolves mystic perks with 0.25 block damage reduction bonus and 1.35 revive aura', () => {
            const perks = resolveCrewClassPerks('mystic');
            assert.equal(perks.classId, 'mystic');
            assert.equal(perks.turnResponsivenessMultiplier, 1.0);
            assert.equal(perks.meleeKnockbackMultiplier, 1.0);
            assert.equal(perks.swingArcMultiplier, 1.0);
            assert.equal(perks.shopCostMultiplier, 1.0);
            assert.equal(perks.motorSpeedMultiplier, 1.0);
            assert.equal(perks.blockDamageReductionBonus, 0.25);
            assert.equal(perks.reviveAuraMultiplier, 1.35);
        });

        it('handles case-insensitivity and whitespace cleanly', () => {
            const perks = resolveCrewClassPerks('  BRUISER  ');
            assert.equal(perks.classId, 'bruiser');
            assert.equal(perks.meleeKnockbackMultiplier, 1.25);
        });

        it('guarantees all numeric properties are finite numbers', () => {
            for (const id of ['helmsman', 'bruiser', 'tinkerer', 'mystic', 'unknown', null]) {
                const perks = resolveCrewClassPerks(id);
                for (const [key, value] of Object.entries(perks)) {
                    if (key !== 'classId') {
                        assert.ok(typeof value === 'number' && Number.isFinite(value), `${key} must be a finite number`);
                    }
                }
            }
        });
    });

    describe('applyCrewClassToKinematics: craft integration', () => {
        it('applies turnResponsivenessMultiplier to craft.angularVelocity.y for helmsman', () => {
            const craft = {
                angularVelocity: { x: 0, y: 2.0, z: 0 },
                velocity: { x: 0, y: 0, z: -5.0 },
            };

            applyCrewClassToKinematics(craft, 'helmsman', 1 / 60);

            assert.ok(craft.classPerks);
            assert.equal(craft.classPerks.classId, 'helmsman');
            assert.ok(Math.abs(craft.angularVelocity.y - (2.0 * 1.15)) < 1e-6);
        });

        it('does not scale angularVelocity.y for non-helmsman classes', () => {
            const craft = {
                angularVelocity: { x: 0, y: 2.0, z: 0 },
                velocity: { x: 0, y: 0, z: -5.0 },
            };

            applyCrewClassToKinematics(craft, 'bruiser', 1 / 60);

            assert.equal(craft.classPerks.classId, 'bruiser');
            assert.equal(craft.angularVelocity.y, 2.0);
        });

        it('applies motorSpeedMultiplier to velocity when motor thrust is active for tinkerer', () => {
            const craft = {
                angularVelocity: { x: 0, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: -10.0 },
                motorThrustActive: true,
            };

            applyCrewClassToKinematics(craft, 'tinkerer', 1 / 60);

            assert.equal(craft.classPerks.classId, 'tinkerer');
            assert.ok(Math.abs(craft.velocity.z - (-10.0 * 1.25)) < 1e-6);
        });

        it('does not boost velocity when motor thrust is inactive for tinkerer', () => {
            const craft = {
                angularVelocity: { x: 0, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: -10.0 },
                motorThrustActive: false,
            };

            applyCrewClassToKinematics(craft, 'tinkerer', 1 / 60);

            assert.equal(craft.velocity.z, -10.0);
        });

        it('detects motor activity via input and upgrades array', () => {
            const craft = {
                angularVelocity: { x: 0, y: 0, z: 0 },
                velocity: { x: 2.0, y: 0, z: -4.0 },
                upgrades: ['motor_1'],
                input: { w: true },
            };

            applyCrewClassToKinematics(craft, 'tinkerer', 1 / 60);

            assert.ok(Math.abs(craft.velocity.x - (2.0 * 1.25)) < 1e-6);
            assert.ok(Math.abs(craft.velocity.z - (-4.0 * 1.25)) < 1e-6);
        });

        it('handles null craft gracefully without throwing', () => {
            assert.doesNotThrow(() => {
                const res = applyCrewClassToKinematics(null, 'helmsman');
                assert.equal(res, null);
            });
        });
    });

    describe('computeClassDiscountedCost: shop discount calculation', () => {
        it('applies 20% discount for tinkerer and rounds correctly', () => {
            // 100 * 0.80 = 80
            assert.equal(computeClassDiscountedCost(100, 'tinkerer'), 80);
            // 75 * 0.80 = 60
            assert.equal(computeClassDiscountedCost(75, 'tinkerer'), 60);
            // 15 * 0.80 = 12
            assert.equal(computeClassDiscountedCost(15, 'tinkerer'), 12);
        });

        it('returns standard rounded cost for other classes', () => {
            assert.equal(computeClassDiscountedCost(100, 'helmsman'), 100);
            assert.equal(computeClassDiscountedCost(100, 'bruiser'), 100);
            assert.equal(computeClassDiscountedCost(100, 'mystic'), 100);
        });

        it('enforces a minimum cost of at least 1 coin', () => {
            assert.equal(computeClassDiscountedCost(0, 'tinkerer'), 1);
            assert.equal(computeClassDiscountedCost(-10, 'tinkerer'), 1);
            assert.equal(computeClassDiscountedCost(1, 'tinkerer'), 1); // 1 * 0.8 = 0.8 -> round = 1
        });

        it('handles non-numeric or NaN inputs safely', () => {
            assert.equal(computeClassDiscountedCost(NaN, 'tinkerer'), 1);
            assert.equal(computeClassDiscountedCost(null, 'tinkerer'), 1);
            assert.equal(computeClassDiscountedCost('invalid', 'tinkerer'), 1);
        });
    });

    describe('computeClassModifiedBlockDamage: combat block mitigation', () => {
        it('returns unmodified damage when isBlocking is false', () => {
            assert.equal(computeClassModifiedBlockDamage(100, 'helmsman', false), 100);
            assert.equal(computeClassModifiedBlockDamage(100, 'mystic', false), 100);
            assert.equal(computeClassModifiedBlockDamage(50, 'bruiser', false), 50);
        });

        it('applies standard 70% reduction (30% taken) for non-mystic classes when blocking', () => {
            // 100 * 0.30 = 30
            assert.equal(computeClassModifiedBlockDamage(100, 'helmsman', true), 30);
            assert.equal(computeClassModifiedBlockDamage(100, 'bruiser', true), 30);
            assert.equal(computeClassModifiedBlockDamage(100, 'tinkerer', true), 30);
        });

        it('applies Mystic extra block bonus clamped to take only 15% damage when blocking', () => {
            // 100 * 0.15 = 15
            assert.equal(computeClassModifiedBlockDamage(100, 'mystic', true), 15);
            // 40 * 0.15 = 6
            assert.equal(computeClassModifiedBlockDamage(40, 'mystic', true), 6);
        });

        it('safely handles 0, negative, and non-numeric damage', () => {
            assert.equal(computeClassModifiedBlockDamage(0, 'mystic', true), 0);
            assert.equal(computeClassModifiedBlockDamage(-20, 'mystic', true), 0);
            assert.equal(computeClassModifiedBlockDamage(NaN, 'mystic', true), 0);
            assert.equal(computeClassModifiedBlockDamage(null, 'mystic', true), 0);
        });
    });
});
