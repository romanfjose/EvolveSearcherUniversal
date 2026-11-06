import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    computeUpgradeStatDiff,
    formatArmoryCardViewModel,
    resolveUpgradeItem,
    AFFORDABILITY_STATES,
    ARMORY_HOTKEY_BADGES,
    BASE_ARMORY_STATS,
    WEAPON_REACH_BONUSES,
} from '../shared/armory-stat-preview.js';
import { ALL_UPGRADES, UPGRADE_SLOTS } from '../shared/upgrade-tree.js';

describe('Armory Upgrade Stat Preview & Hotkey Badge Formatter', () => {
    describe('resolveUpgradeItem', () => {
        it('resolves items by ID', () => {
            const motor1 = resolveUpgradeItem('motor_1');
            assert.ok(motor1);
            assert.equal(motor1.id, 'motor_1');
            assert.equal(motor1.slot, UPGRADE_SLOTS.MOTOR);

            const weapon2 = resolveUpgradeItem('weapon_2');
            assert.ok(weapon2);
            assert.equal(weapon2.id, 'weapon_2');

            const armor3 = resolveUpgradeItem('armor_3');
            assert.ok(armor3);
            assert.equal(armor3.id, 'armor_3');
        });

        it('resolves items by legacy type keys', () => {
            const motor = resolveUpgradeItem('motor');
            assert.ok(motor);
            assert.equal(motor.id, 'motor_1');

            const weaponMk2 = resolveUpgradeItem('weapon_mk2');
            assert.ok(weaponMk2);
            assert.equal(weaponMk2.id, 'weapon_2');

            const armorMk3 = resolveUpgradeItem('armor_mk3');
            assert.ok(armorMk3);
            assert.equal(armorMk3.id, 'armor_3');
        });

        it('resolves item objects passed directly', () => {
            const rawObj = ALL_UPGRADES['motor_2'];
            const resolved = resolveUpgradeItem(rawObj);
            assert.equal(resolved, rawObj);
        });

        it('returns null for unknown or empty keys', () => {
            assert.equal(resolveUpgradeItem(null), null);
            assert.equal(resolveUpgradeItem(undefined), null);
            assert.equal(resolveUpgradeItem(''), null);
            assert.equal(resolveUpgradeItem('invalid_upgrade_id'), null);
        });
    });

    describe('computeUpgradeStatDiff', () => {
        it('returns zero deltas when item is null or unknown', () => {
            const diff = computeUpgradeStatDiff({ speed: 18, hullArmor: 150, reach: 4.5 }, null);
            assert.equal(diff.item, null);
            assert.equal(diff.speed.delta, 0);
            assert.equal(diff.speed.before, 18);
            assert.equal(diff.speed.after, 18);
            assert.equal(diff.hullArmor.delta, 0);
            assert.equal(diff.hullArmor.before, 150);
            assert.equal(diff.hullArmor.after, 150);
            assert.equal(diff.reach.delta, 0);
            assert.equal(diff.reach.before, 4.5);
            assert.equal(diff.reach.after, 4.5);
            assert.equal(diff.hasPositiveDelta, false);
            assert.equal(diff.hasNegativeDelta, false);
        });

        it('uses BASE_ARMORY_STATS defaults when currentStats is omitted or empty', () => {
            const diff = computeUpgradeStatDiff({}, 'motor_1');
            assert.equal(diff.speed.before, BASE_ARMORY_STATS.speed);
            assert.equal(diff.hullArmor.before, BASE_ARMORY_STATS.hullArmor);
            assert.equal(diff.reach.before, BASE_ARMORY_STATS.reach);
        });

        it('supports maxHp alias for hullArmor in currentStats', () => {
            const diff = computeUpgradeStatDiff({ maxHp: 190 }, 'armor_1');
            assert.equal(diff.hullArmor.before, 190);
            assert.equal(diff.hullArmor.after, 240);
            assert.equal(diff.hullArmor.delta, 50);
            assert.equal(diff.hullArmor.formatted, '+50 HP');
        });

        it('computes speed delta correctly for Motor upgrades', () => {
            const diff1 = computeUpgradeStatDiff({ speed: 15.0 }, 'motor_1');
            assert.equal(diff1.speed.delta, 5.0);
            assert.equal(diff1.speed.after, 20.0);
            assert.equal(diff1.speed.formatted, '+5.0 m/s');
            assert.equal(diff1.hullArmor.delta, 0);
            assert.equal(diff1.reach.delta, 0);
            assert.equal(diff1.hasPositiveDelta, true);

            const diff3 = computeUpgradeStatDiff({ speed: 20.0 }, 'motor_3');
            assert.equal(diff3.speed.delta, 13.5);
            assert.equal(diff3.speed.after, 33.5);
            assert.equal(diff3.speed.formatted, '+13.5 m/s');
        });

        it('computes hull armor delta correctly for Armor upgrades', () => {
            const diff1 = computeUpgradeStatDiff({ hullArmor: 100 }, 'armor_1');
            assert.equal(diff1.hullArmor.delta, 50);
            assert.equal(diff1.hullArmor.after, 150);
            assert.equal(diff1.hullArmor.formatted, '+50 HP');
            assert.equal(diff1.speed.delta, 0);
            assert.equal(diff1.reach.delta, 0);

            const diff2 = computeUpgradeStatDiff({ hullArmor: 100 }, 'armor_2');
            assert.equal(diff2.hullArmor.delta, 90);
            assert.equal(diff2.hullArmor.after, 190);

            const diff3 = computeUpgradeStatDiff({ hullArmor: 100 }, 'armor_3');
            assert.equal(diff3.hullArmor.delta, 140);
            assert.equal(diff3.hullArmor.after, 240);
        });

        it('computes weapon reach delta correctly for Weapon upgrades', () => {
            const diff1 = computeUpgradeStatDiff({ reach: 4.2 }, 'weapon_1');
            assert.equal(diff1.reach.delta, 0.6);
            assert.equal(diff1.reach.after, 4.8);
            assert.equal(diff1.reach.formatted, '+0.6 m');
            assert.equal(diff1.speed.delta, 0);
            assert.equal(diff1.hullArmor.delta, 0);

            const diff2 = computeUpgradeStatDiff({ reach: 4.2 }, 'weapon_2');
            assert.equal(diff2.reach.delta, 1.2);
            assert.equal(diff2.reach.after, 5.4);
            assert.equal(diff2.reach.formatted, '+1.2 m');

            const diff3 = computeUpgradeStatDiff({ reach: 4.2 }, 'weapon_3');
            assert.equal(diff3.reach.delta, 2.0);
            assert.equal(diff3.reach.after, 6.2);
            assert.equal(diff3.reach.formatted, '+2.0 m');
        });
    });

    describe('formatArmoryCardViewModel', () => {
        it('returns invalid card view model for unknown itemKey', () => {
            const vm = formatArmoryCardViewModel('unknown_item', 100, []);
            assert.equal(vm.valid, false);
            assert.equal(vm.item, null);
            assert.equal(vm.state, AFFORDABILITY_STATES.UNAVAILABLE);
            assert.equal(vm.canClickToBuy, false);
            assert.equal(vm.buttonText, 'Unavailable');
        });

        it('formats state AFFORDABLE when player has enough coins for next tier', () => {
            // motor_1 costs 10c, player has 15c
            const vm = formatArmoryCardViewModel('motor_1', 15, []);
            assert.equal(vm.valid, true);
            assert.equal(vm.id, 'motor_1');
            assert.equal(vm.slot, UPGRADE_SLOTS.MOTOR);
            assert.equal(vm.tier, 1);
            assert.equal(vm.cost, 10);
            assert.equal(vm.coinsDeficit, 0);
            assert.equal(vm.state, AFFORDABILITY_STATES.AFFORDABLE);
            assert.equal(vm.canClickToBuy, true);
            assert.equal(vm.buttonText, 'Buy (10c)');
            assert.equal(vm.buttonCssClass, 'armory-btn-affordable');
            assert.equal(vm.clickStateBadge, 'AFFORDABLE');
            assert.equal(vm.hotkey, '1');
            assert.equal(vm.hotkeyBadge, '[1]');
            assert.ok(vm.promptLabel.includes('[1]'));
            assert.ok(vm.promptLabel.includes('AFFORDABLE'));
            assert.equal(vm.statDiff.speed.delta, 5.0);
        });

        it('formats state INSUFFICIENT_COINS when player cannot afford next tier', () => {
            // motor_1 costs 10c, player has 4c
            const vm = formatArmoryCardViewModel('motor_1', 4, []);
            assert.equal(vm.valid, true);
            assert.equal(vm.state, AFFORDABILITY_STATES.INSUFFICIENT_COINS);
            assert.equal(vm.canClickToBuy, false);
            assert.equal(vm.coinsDeficit, 6);
            assert.equal(vm.buttonText, 'Need 6c');
            assert.equal(vm.buttonCssClass, 'armory-btn-need-coins');
            assert.equal(vm.clickStateBadge, 'NEED COINS');
        });

        it('formats state OWNED when item is already owned or surpassed', () => {
            // weapon_1 is owned when ownedUpgrades includes 'weapon_1' or higher 'weapon_2'
            const vm1 = formatArmoryCardViewModel('weapon_1', 100, ['weapon_1']);
            assert.equal(vm1.state, AFFORDABILITY_STATES.OWNED);
            assert.equal(vm1.isOwned, true);
            assert.equal(vm1.canClickToBuy, false);
            assert.equal(vm1.buttonText, 'Owned');
            assert.equal(vm1.buttonCssClass, 'armory-btn-owned');
            assert.equal(vm1.clickStateBadge, 'OWNED');

            const vm2 = formatArmoryCardViewModel('weapon_1', 100, ['weapon_2']);
            assert.equal(vm2.state, AFFORDABILITY_STATES.OWNED);
            assert.equal(vm2.isOwned, true);
        });

        it('formats state LOCKED when item prerequisites are not met', () => {
            // armor_2 requires armor_1 first. When player has no upgrades, armor_2 is locked.
            const vm = formatArmoryCardViewModel('armor_2', 100, []);
            assert.equal(vm.state, AFFORDABILITY_STATES.LOCKED);
            assert.equal(vm.isTierLocked, true);
            assert.equal(vm.canClickToBuy, false);
            assert.equal(vm.buttonText, 'Requires T1');
            assert.equal(vm.buttonCssClass, 'armory-btn-locked');
            assert.equal(vm.clickStateBadge, 'LOCKED');
        });

        it('maps hotkey badges [1], [2], [3] accurately across slots', () => {
            const motorVm = formatArmoryCardViewModel('motor_1', 50, []);
            assert.equal(motorVm.hotkey, '1');
            assert.equal(motorVm.hotkeyBadge, '[1]');

            const weaponVm = formatArmoryCardViewModel('weapon_1', 50, []);
            assert.equal(weaponVm.hotkey, '2');
            assert.equal(weaponVm.hotkeyBadge, '[2]');

            const armorVm = formatArmoryCardViewModel('armor_1', 50, []);
            assert.equal(armorVm.hotkey, '3');
            assert.equal(armorVm.hotkeyBadge, '[3]');
        });

        it('exposes ARMORY_HOTKEY_BADGES with [4] Crew Auto-Equip definition', () => {
            assert.equal(ARMORY_HOTKEY_BADGES.autoEquip.key, '4');
            assert.equal(ARMORY_HOTKEY_BADGES.autoEquip.badge, '[4]');
            assert.equal(ARMORY_HOTKEY_BADGES.autoEquip.label, 'Crew Auto-Equip');
        });

        it('handles non-numeric and negative player coins gracefully without throwing', () => {
            const vmNeg = formatArmoryCardViewModel('motor_1', -50, []);
            assert.equal(vmNeg.coinsDeficit, 10);
            assert.equal(vmNeg.state, AFFORDABILITY_STATES.INSUFFICIENT_COINS);

            const vmNaN = formatArmoryCardViewModel('motor_1', NaN, []);
            assert.equal(vmNaN.coinsDeficit, 10);
            assert.equal(vmNaN.state, AFFORDABILITY_STATES.INSUFFICIENT_COINS);

            const vmNull = formatArmoryCardViewModel('motor_1', null, []);
            assert.equal(vmNull.coinsDeficit, 10);
            assert.equal(vmNull.state, AFFORDABILITY_STATES.INSUFFICIENT_COINS);
        });
    });
});
