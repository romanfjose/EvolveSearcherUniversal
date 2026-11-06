/**
 * Helmet 03 — Synthetic José QA (The "Where's the Bathroom?" Breaker)
 * Armory Rapid Multi-Purchase & Duplicate-Buy Prevention Test Suite
 *
 * Mission Task: w5c-09-qa-breaker-harbor-shop-multi-purchase-stress
 *
 * Core Directives & Invariants Tested:
 * 1. Rapid concurrent mouse + keyboard [1]-[4] inputs NEVER double-charge coins.
 * 2. Player coins NEVER drop below 0 coins under high-frequency buy spam or corrupted inputs.
 * 3. Duplicate non-stacking upgrades are NEVER granted (idempotency, tier replacement, maxed tier lock).
 * 4. High-concurrency purchase storms across Armory Modal UI, QuickBuy Hotbar, and Transaction Engine
 *    behave deterministically without race conditions, memory leaks, or NaN state mutations.
 * 5. Impatient human behavioral attacks: rapid hammering of keys, clicking disabled buttons,
 *    submitting out-of-order tier purchases, and interleaved mouse clicks + hotkey presses.
 *
 * Zero external dependencies. Pure ES module test suite for Node.js test runner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    UPGRADE_SLOTS,
    ARMORY_UPGRADE_TREE,
    ALL_UPGRADES,
    getSlotCurrentTier,
    getNextSlotUpgrade,
    calculateCumulativeStats,
    canPurchaseArmoryUpgrade,
    resolveArmoryHotkey,
} from '../shared/upgrade-tree.js';

import {
    createArmoryShopUI,
} from '../public/js/ui/armory-shop.js';

import {
    QUICKBUY_SLOTS,
    HOTBAR_DEFINITIONS,
    evaluateQuickBuySlot,
    evaluateQuickBuySlots,
    canQuickBuySlot,
    executeQuickBuy,
    createQuickBuyHotbar,
} from '../public/js/ui/quickbuy-hotbar.js';

import {
    createEconomyTransactionManager,
    validateCoins,
    simulateSameMillisecondPurchaseStorm,
} from '../shared/qa-economy-breaker.js';

describe('Helmet 03 — Armory Rapid Multi-Purchase & Duplicate-Buy Prevention Suite', () => {

    describe('1. Coin Invariant & Underflow Defenses (Coins >= 0 & No Double-Charging)', () => {
        it('never deducts coins when an upgrade is attempted with insufficient balance', () => {
            const player = { coins: 9, upgrades: [] }; // motor_1 costs 10
            const check = canPurchaseArmoryUpgrade(player, 'motor_1');
            assert.equal(check.ok, false);
            assert.equal(check.reason, 'insufficient-coins');

            const manager = createEconomyTransactionManager();
            const res = manager.executePurchase(player, 'motor_1');
            assert.equal(res.success, false);
            assert.equal(player.coins, 9, 'Coins must not be deducted on failed purchase');
            assert.equal(player.upgrades.length, 0);
        });

        it('never allows player coins to drop below 0 during rapid sequential buy spam', () => {
            // Player starts with exactly 10 coins, enough for exactly 1 Motor Mk I (10c)
            const player = { id: 'p_tight_budget', coins: 10, upgrades: [] };
            const manager = createEconomyTransactionManager();

            const attempts = ['motor_1', 'motor_1', 'motor_2', 'weapon_1', 'armor_1'];
            const results = [];

            for (const upgradeId of attempts) {
                const res = manager.executePurchase(player, upgradeId, { cooldownMs: 0 });
                results.push(res);
            }

            const successes = results.filter((r) => r.success);
            const failures = results.filter((r) => !r.success);

            assert.equal(successes.length, 1, 'Only the first affordable upgrade should succeed');
            assert.equal(failures.length, 4, 'All subsequent attempts must fail due to insufficient funds or duplicate');
            assert.equal(player.coins, 0, 'Coins must reach exactly 0, never negative');
            assert.ok(player.coins >= 0, 'Coins must be >= 0');
            assert.deepEqual(player.upgrades, ['motor_1']);
        });

        it('rejects double-charging when the same slot is spammed repeatedly', () => {
            const player = { id: 'p_double_charge_check', coins: 100, upgrades: [] };
            const manager = createEconomyTransactionManager();

            // Attempt to buy motor_1 20 times in a row
            let successfulDeductions = 0;
            for (let i = 0; i < 20; i++) {
                const res = manager.executePurchase(player, 'motor_1', { cooldownMs: 0 });
                if (res.success) {
                    successfulDeductions++;
                }
            }

            assert.equal(successfulDeductions, 1, 'motor_1 should only be purchased and charged once');
            assert.equal(player.coins, 90, 'Exactly 10 coins deducted (100 - 10 = 90)');
            assert.deepEqual(player.upgrades, ['motor_1']);
        });

        it('handles non-integer, negative, and corrupt coin inputs cleanly without crashing or deducting', () => {
            const badCoins = [-50, -0.01, NaN, Infinity, -Infinity, null, undefined, '50'];
            for (const val of badCoins) {
                const player = { id: `p_corrupt_${val}`, coins: val, upgrades: [] };
                const manager = createEconomyTransactionManager();
                const res = manager.executePurchase(player, 'motor_1');
                assert.equal(res.success, false, `Should reject corrupt coin value: ${val}`);
                assert.equal(player.upgrades.length, 0);
            }
        });
    });

    describe('2. Non-Stacking Upgrade Idempotency & Tier Replacement', () => {
        it('guarantees that purchasing a higher tier replaces the lower tier without duplication', () => {
            const player = { id: 'p_tier_progression', coins: 100, upgrades: [] };
            const manager = createEconomyTransactionManager();

            // Tier 1: Motor Mk I (10c)
            const r1 = manager.executePurchase(player, 'motor_1', { timestampMs: 100 });
            assert.equal(r1.success, true);
            assert.deepEqual(player.upgrades, ['motor_1']);
            assert.equal(player.coins, 90);

            // Tier 2: Motor Mk II (25c)
            const r2 = manager.executePurchase(player, 'motor_2', { timestampMs: 200 });
            assert.equal(r2.success, true);
            // Must contain ONLY motor_2, NOT both motor_1 and motor_2
            assert.deepEqual(player.upgrades, ['motor_2']);
            assert.equal(player.coins, 65);

            // Tier 3: Motor Mk III (45c)
            const r3 = manager.executePurchase(player, 'motor_3', { timestampMs: 300 });
            assert.equal(r3.success, true);
            assert.deepEqual(player.upgrades, ['motor_3']);
            assert.equal(player.coins, 20);

            // Verify getSlotCurrentTier correctly resolves to 3
            assert.equal(getSlotCurrentTier(player.upgrades, UPGRADE_SLOTS.MOTOR), 3);
            assert.equal(getNextSlotUpgrade(player.upgrades, UPGRADE_SLOTS.MOTOR), null);
        });

        it('strictly rejects purchasing an already owned tier or a lower tier', () => {
            const player = { coins: 100, upgrades: ['weapon_2'] };

            // Trying to buy Tier 1 when Tier 2 is owned
            const checkT1 = canPurchaseArmoryUpgrade(player, 'weapon_1');
            assert.equal(checkT1.ok, false);
            assert.equal(checkT1.reason, 'already-owned-or-higher');

            // Trying to buy Tier 2 when Tier 2 is owned
            const checkT2 = canPurchaseArmoryUpgrade(player, 'weapon_2');
            assert.equal(checkT2.ok, false);
            assert.equal(checkT2.reason, 'already-owned-or-higher');
        });

        it('strictly rejects tier skipping (e.g. buying Tier 3 directly without Tier 1 and 2)', () => {
            const player = { coins: 500, upgrades: [] };
            const checkSkip = canPurchaseArmoryUpgrade(player, 'armor_3');
            assert.equal(checkSkip.ok, false);
            assert.equal(checkSkip.reason, 'prerequisite-tier-locked');

            const manager = createEconomyTransactionManager();
            const res = manager.executePurchase(player, 'armor_3');
            assert.equal(res.success, false);
            assert.equal(res.reason, 'prerequisite-tier-locked');
            assert.equal(player.coins, 500);
            assert.equal(player.upgrades.length, 0);
        });

        it('rejects further purchases when a slot has reached Tier 3 max', () => {
            const player = { coins: 500, upgrades: ['armor_3'] };
            const next = getNextSlotUpgrade(player.upgrades, UPGRADE_SLOTS.ARMOR);
            assert.equal(next, null);

            const hotkeyRes = resolveArmoryHotkey('3', player);
            assert.equal(hotkeyRes.action, 'slot_maxed');
            assert.equal(hotkeyRes.slot, 'armor');
        });
    });

    describe('3. Keyboard [1]-[4] Hotkey Rapid Multi-Purchase Stress', () => {
        it('resolves hotkeys 1, 2, 3 sequentially as upgrades are acquired', () => {
            const player = { coins: 100, upgrades: [] };

            // Hotkey 1 -> Motor 1
            const h1 = resolveArmoryHotkey('1', player);
            assert.equal(h1.action, 'buy');
            assert.equal(h1.item.id, 'motor_1');
            assert.equal(h1.ok, true);

            // Simulate purchase
            player.upgrades.push('motor_1');
            player.coins -= h1.item.cost; // 90c left

            // Hotkey 1 again -> Motor 2
            const h1_next = resolveArmoryHotkey('1', player);
            assert.equal(h1_next.action, 'buy');
            assert.equal(h1_next.item.id, 'motor_2');
            assert.equal(h1_next.ok, true);

            // Hotkey 2 -> Weapon 1
            const h2 = resolveArmoryHotkey('2', player);
            assert.equal(h2.action, 'buy');
            assert.equal(h2.item.id, 'weapon_1');
            assert.equal(h2.ok, true);

            // Hotkey 3 -> Armor 1
            const h3 = resolveArmoryHotkey('3', player);
            assert.equal(h3.action, 'buy');
            assert.equal(h3.item.id, 'armor_1');
            assert.equal(h3.ok, true);
        });

        it('hotkey [4] auto-equip cleanly stops when no upgrades are affordable', () => {
            const player = { coins: 5, upgrades: [] };
            const h4 = resolveArmoryHotkey('4', player);
            assert.equal(h4.action, 'none_affordable');
        });

        it('simulates rapid keyboard hammering of [1], [2], [3], [4] without coin leak or negative balance', () => {
            const player = { id: 'p_keyboard_hammer', coins: 45, upgrades: [] };
            const manager = createEconomyTransactionManager();
            const keys = ['1', '1', '2', '1', '3', '4', '2', '3', '1'];

            let totalSpent = 0;
            let timeCursor = 1000;

            for (const key of keys) {
                timeCursor += 60; // 60ms gap between keystrokes
                const resolved = resolveArmoryHotkey(key, player);
                if (resolved && resolved.item && (resolved.ok || resolved.action === 'auto_equip')) {
                    const outcome = manager.executePurchase(player, resolved.item.id, { timestampMs: timeCursor });
                    if (outcome.success) {
                        totalSpent += outcome.cost;
                    }
                }
            }

            assert.equal(player.coins, 45 - totalSpent);
            assert.ok(player.coins >= 0, 'Coins must never be negative');
            assert.ok(player.upgrades.length > 0);

            // Invariant: no duplicate items in player.upgrades
            const uniqueUpgrades = new Set(player.upgrades);
            assert.equal(uniqueUpgrades.size, player.upgrades.length, 'No duplicate upgrade entries in inventory');
        });
    });

    describe('4. Rapid Interleaved Mouse Clicks + Keyboard Hotkeys in Armory Shop UI', () => {
        it('prevents double-purchase when executePurchase is invoked rapidly from mouse clicks', () => {
            const purchasedItems = [];
            const emittedSocketEvents = [];

            const mockSocket = {
                emit: (event, data) => {
                    emittedSocketEvents.push({ event, data });
                },
            };

            const shop = createArmoryShopUI({
                socket: mockSocket,
                onPurchase: (item) => {
                    purchasedItems.push(item.id);
                },
            });

            // Player has 25 coins: enough for motor_1 (10c), but not enough for motor_2 (25c)
            shop.open({ coins: 25, upgrades: [] });

            // Rapid click 1: motor_1
            shop.executePurchase('motor_1');
            // Rapid click 2: motor_1 again (instant double-click on same button)
            shop.executePurchase('motor_1');
            // Rapid click 3: motor_1 a third time
            shop.executePurchase('motor_1');

            // Only 1 purchase should succeed
            assert.equal(purchasedItems.length, 1);
            assert.equal(purchasedItems[0], 'motor_1');
            assert.equal(emittedSocketEvents.length, 1);
            assert.equal(emittedSocketEvents[0].event, 'buyUpgrade');
            assert.equal(emittedSocketEvents[0].data, 'motor');

            shop.dispose();
        });

        it('interleaves mouse executePurchase and keyboard hotkey simulation without state corruption', () => {
            const purchasedItems = [];
            const shop = createArmoryShopUI({
                onPurchase: (item) => {
                    purchasedItems.push(item.id);
                },
            });

            // Player has 35 coins: can afford motor_1 (10c) and weapon_1 (15c) = 25c total (10c remaining)
            shop.open({ coins: 35, upgrades: [] });

            // 1. Mouse clicks motor_1
            shop.executePurchase('motor_1'); // 35 - 10 = 25c
            // 2. Keyboard press 2 -> Weapon Mk 1
            shop.executePurchase('weapon_1'); // 25 - 15 = 10c
            // 3. Mouse tries to click armor_1 (costs 20c, player only has 10c)
            shop.executePurchase('armor_1'); // Rejected!
            // 4. Keyboard press 1 -> tries to buy motor_2 (costs 25c, player only has 10c)
            shop.executePurchase('motor_2'); // Rejected!
            // 5. Mouse tries to click motor_1 again (already owned)
            shop.executePurchase('motor_1'); // Rejected!

            assert.equal(purchasedItems.length, 2);
            assert.deepEqual(purchasedItems, ['motor_1', 'weapon_1']);

            shop.dispose();
        });
    });

    describe('5. QuickBuy Hotbar Concurrency & Zero-Modal 1-Click Stress', () => {
        it('evaluates slot state dynamically as coins and health change', () => {
            const player = {
                coins: 10,
                health: 100,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            // Slot 1 (Engine, cost 10) can buy
            assert.equal(canQuickBuySlot('1', player).ok, true);
            // Slot 2 (Mallet, cost 15) cannot buy
            assert.equal(canQuickBuySlot('2', player).ok, false);
            assert.equal(canQuickBuySlot('2', player).reason, 'need_coins');
            // Slot 4 (Patch) cannot buy because health is 100/100
            assert.equal(canQuickBuySlot('4', player).ok, false);
            assert.equal(canQuickBuySlot('4', player).reason, 'full_hp');

            // Damage player
            player.health = 50;
            // Slot 4 (Patch, cost 15) cannot buy because only 10 coins
            assert.equal(canQuickBuySlot('4', player).ok, false);
            assert.equal(canQuickBuySlot('4', player).reason, 'need_coins');

            // Give coins
            player.coins = 20;
            // Now Slot 4 can buy!
            assert.equal(canQuickBuySlot('4', player).ok, true);
        });

        it('prevents double-purchase in QuickBuy when triggered repeatedly with insufficient funds', () => {
            const player = {
                coins: 15,
                health: 100,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            // Execute purchase on Slot 1 (Engine Mk I, cost 10)
            const r1 = executeQuickBuy('1', player);
            assert.equal(r1.success, true);
            assert.equal(r1.coinsDeducted, 10);

            // Update player state
            player.coins -= r1.coinsDeducted; // 5c left
            player.upgrades.push(r1.upgradeId);

            // Immediately try to buy Slot 1 again (Motor Mk II costs 25c)
            const r2 = executeQuickBuy('1', player);
            assert.equal(r2.success, false);
            assert.equal(r2.reason, 'need_coins');

            // Try to buy Slot 2 (Mallet Mk I costs 15c)
            const r3 = executeQuickBuy('2', player);
            assert.equal(r3.success, false);
            assert.equal(r3.reason, 'need_coins');

            // Try to buy Slot 3 (Hull Mk I costs 20c)
            const r4 = executeQuickBuy('3', player);
            assert.equal(r4.success, false);
            assert.equal(r4.reason, 'need_coins');

            assert.equal(player.coins, 5);
            assert.deepEqual(player.upgrades, ['motor_1']);
        });

        it('stress tests rapid QuickBuy triggerPurchase calls on createQuickBuyHotbar', () => {
            const purchases = [];
            const hotbar = createQuickBuyHotbar({
                enableHotkeys: false,
                onPurchase: (res) => {
                    purchases.push(res);
                },
            });

            // Player with 30 coins
            hotbar.updatePlayerData({
                coins: 30,
                health: 100,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            });

            // Rapid storm of triggers:
            // 1: Motor 1 (10c) -> 20c left
            const res1 = hotbar.triggerPurchase('1');
            // 1: Motor 2 (25c) -> needs 25c, has 20c -> fail
            const res2 = hotbar.triggerPurchase('1');
            // 2: Mallet 1 (15c) -> 5c left
            const res3 = hotbar.triggerPurchase('2');
            // 2: Mallet 2 (30c) -> needs 30c, has 5c -> fail
            const res4 = hotbar.triggerPurchase('2');
            // 3: Hull 1 (20c) -> needs 20c, has 5c -> fail
            const res5 = hotbar.triggerPurchase('3');

            assert.equal(res1.success, true);
            assert.equal(res2.success, false);
            assert.equal(res3.success, true);
            assert.equal(res4.success, false);
            assert.equal(res5.success, false);

            assert.equal(purchases.length, 2);
            assert.equal(purchases[0].upgradeId, 'motor_1');
            assert.equal(purchases[1].upgradeId, 'weapon_1');

            hotbar.dispose();
        });
    });

    describe('6. High-Frequency Same-Millisecond Purchase Storms', () => {
        it('handles 100 concurrent purchase attempts on the same item with exactly 1 success', () => {
            const storm = simulateSameMillisecondPurchaseStorm(
                { id: 'p_storm_100', coins: 1000, upgrades: [] },
                'weapon_1',
                100,
                5000 // exact timestamp
            );

            assert.equal(storm.totalAttempts, 100);
            assert.equal(storm.successCount, 1, 'Only exactly 1 purchase may succeed');
            assert.equal(storm.failureCount, 99, 'All 99 duplicate concurrent requests must be rejected');
            assert.equal(storm.initialCoins, 1000);
            assert.equal(storm.finalCoins, 1000 - ALL_UPGRADES.weapon_1.cost);
            assert.deepEqual(storm.finalUpgrades, ['weapon_1']);
            assert.equal(storm.idempotencyPassed, true);
        });

        it('executes a mixed storm of 60 rapid purchase requests across all 3 slots', () => {
            const player = { id: 'p_mixed_storm', coins: 200, upgrades: [] };
            const manager = createEconomyTransactionManager();

            // Total available tiers:
            // Motor: 10 + 25 + 45 = 80
            // Weapon: 15 + 30 + 55 = 100
            // Armor: 20 + 35 + 60 = 115
            // Total cost for all 9 tiers = 295
            // Player has 200 coins, so they can only afford a subset.

            const requestQueue = [
                'motor_1', 'motor_1', 'weapon_1', 'armor_1',
                'motor_2', 'motor_1', 'weapon_2', 'armor_2',
                'motor_3', 'weapon_3', 'armor_3', 'motor_2',
            ];

            const repeatedQueue = [];
            for (let i = 0; i < 5; i++) {
                repeatedQueue.push(...requestQueue);
            }
            assert.equal(repeatedQueue.length, 60);

            let time = 10000;
            const results = [];
            for (const item of repeatedQueue) {
                time += 10; // Rapid 10ms ticks
                const res = manager.executePurchase(player, item, { timestampMs: time, cooldownMs: 0 });
                results.push(res);
            }

            const successes = results.filter((r) => r.success);
            assert.ok(successes.length >= 3, 'Should succeed on valid tiered purchases');

            // Invariants:
            assert.ok(player.coins >= 0, 'Coins must never be negative');
            assert.ok(Number.isFinite(player.coins), 'Coins must be finite');

            // Upgrades array has at most 3 items (one per slot)
            assert.ok(player.upgrades.length <= 3, 'At most 3 active slot upgrades');

            // No duplicate slot upgrades
            const slots = player.upgrades.map((u) => ALL_UPGRADES[u].slot);
            const uniqueSlots = new Set(slots);
            assert.equal(uniqueSlots.size, slots.length, 'Each slot has at most one upgrade entry');

            // Cumulative stats compute cleanly without NaN
            const stats = calculateCumulativeStats(player.upgrades);
            assert.equal(Number.isNaN(stats.speed), false);
            assert.equal(Number.isNaN(stats.turnRate), false);
            assert.equal(Number.isNaN(stats.dps), false);
            assert.equal(Number.isNaN(stats.maxHp), false);
            assert.ok(stats.speed > 0);
            assert.ok(stats.maxHp >= 100);
        });
    });
});
