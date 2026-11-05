/**
 * Comprehensive node:test suite for Zero-Modal 1-Click Inline Quick-Buy Hotbar
 *
 * Verifies:
 * - 4-slot definition constants & mappings ([1] ⚡ Engine, [2] 🔨 Mallet, [3] 🪵 Hull, [4] 🩹 Patch).
 * - Pure slot state evaluation across coin balances, health, and upgrade tiers.
 * - Green light affordability status ('ready') and line-of-sight visual flags.
 * - Single keystroke / 1-click execution and state mutation proposals.
 * - DOM component lifecycle (mount, render, update, line-of-sight flash, cleanup).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    QUICKBUY_SLOTS,
    EMERGENCY_PATCH_CONFIG,
    HOTBAR_DEFINITIONS,
    evaluateQuickBuySlot,
    evaluateQuickBuySlots,
    canQuickBuySlot,
    executeQuickBuy,
    createQuickBuyHotbar,
} from '../public/js/ui/quickbuy-hotbar.js';

describe('Zero-Modal 1-Click Inline Quick-Buy Hotbar Logic & Architecture', () => {
    describe('Hotbar Slot Matrix & Specifications', () => {
        it('exports all 4 canonical quick-buy slots', () => {
            assert.equal(QUICKBUY_SLOTS.ENGINE, 'engine');
            assert.equal(QUICKBUY_SLOTS.MALLET, 'mallet');
            assert.equal(QUICKBUY_SLOTS.HULL, 'hull');
            assert.equal(QUICKBUY_SLOTS.PATCH, 'patch');
        });

        it('has exactly 4 hotbar definitions with keys 1-4 and respective icons', () => {
            assert.equal(HOTBAR_DEFINITIONS.length, 4);

            const [slot1, slot2, slot3, slot4] = HOTBAR_DEFINITIONS;
            assert.equal(slot1.key, '1');
            assert.equal(slot1.slot, QUICKBUY_SLOTS.ENGINE);
            assert.equal(slot1.icon, '⚡');

            assert.equal(slot2.key, '2');
            assert.equal(slot2.slot, QUICKBUY_SLOTS.MALLET);
            assert.equal(slot2.icon, '🔨');

            assert.equal(slot3.key, '3');
            assert.equal(slot3.slot, QUICKBUY_SLOTS.HULL);
            assert.equal(slot3.icon, '🪵');

            assert.equal(slot4.key, '4');
            assert.equal(slot4.slot, QUICKBUY_SLOTS.PATCH);
            assert.equal(slot4.icon, '🩹');
            assert.equal(slot4.type, 'repair');
        });

        it('configures emergency hull patch with realistic combat repair parameters', () => {
            assert.equal(EMERGENCY_PATCH_CONFIG.id, 'quick_patch');
            assert.equal(EMERGENCY_PATCH_CONFIG.cost, 15);
            assert.equal(EMERGENCY_PATCH_CONFIG.healAmount, 35);
        });
    });

    describe('Pure State Evaluation (evaluateQuickBuySlot & evaluateQuickBuySlots)', () => {
        it('evaluates initial player state (50 coins, Tier 0 upgrades, full HP)', () => {
            const player = {
                coins: 50,
                health: 100,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            const slots = evaluateQuickBuySlots(player);
            assert.equal(slots.length, 4);

            // Slot 1: Engine Mk I (cost 10, affordable -> ready)
            assert.equal(slots[0].key, '1');
            assert.equal(slots[0].slot, 'engine');
            assert.equal(slots[0].tier, 0);
            assert.equal(slots[0].cost, 10);
            assert.equal(slots[0].canAfford, true);
            assert.equal(slots[0].canBuy, true);
            assert.equal(slots[0].status, 'ready');

            // Slot 2: Mallet Mk I (cost 15, affordable -> ready)
            assert.equal(slots[1].key, '2');
            assert.equal(slots[1].slot, 'mallet');
            assert.equal(slots[1].tier, 0);
            assert.equal(slots[1].cost, 15);
            assert.equal(slots[1].canAfford, true);
            assert.equal(slots[1].canBuy, true);
            assert.equal(slots[1].status, 'ready');

            // Slot 3: Hull Armor Mk I (cost 20, affordable -> ready)
            assert.equal(slots[2].key, '3');
            assert.equal(slots[2].slot, 'hull');
            assert.equal(slots[2].tier, 0);
            assert.equal(slots[2].cost, 20);
            assert.equal(slots[2].canAfford, true);
            assert.equal(slots[2].canBuy, true);
            assert.equal(slots[2].status, 'ready');

            // Slot 4: Patch (full HP -> not needed -> status 'full_hp', canBuy false)
            assert.equal(slots[3].key, '4');
            assert.equal(slots[3].slot, 'patch');
            assert.equal(slots[3].cost, 15);
            assert.equal(slots[3].needsRepair, false);
            assert.equal(slots[3].canBuy, false);
            assert.equal(slots[3].status, 'full_hp');
        });

        it('lights up Slot 4 Patch green when raft has sustained combat damage and has coins', () => {
            const player = {
                coins: 20,
                health: 40,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            const slots = evaluateQuickBuySlots(player);
            const patchSlot = slots[3];
            assert.equal(patchSlot.needsRepair, true);
            assert.equal(patchSlot.canAfford, true);
            assert.equal(patchSlot.canBuy, true);
            assert.equal(patchSlot.status, 'ready');
        });

        it('marks slots need_coins when player coin balance is insufficient', () => {
            const player = {
                coins: 8,
                health: 50,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            const slots = evaluateQuickBuySlots(player);
            // Engine cost 10 -> need_coins
            assert.equal(slots[0].canAfford, false);
            assert.equal(slots[0].canBuy, false);
            assert.equal(slots[0].status, 'need_coins');

            // Patch cost 15 -> need_coins
            assert.equal(slots[3].canAfford, false);
            assert.equal(slots[3].canBuy, false);
            assert.equal(slots[3].status, 'need_coins');
        });

        it('disables all slots when player is dead', () => {
            const player = {
                coins: 500,
                health: 0,
                maxHealth: 100,
                upgrades: [],
                isDead: true,
            };

            const slots = evaluateQuickBuySlots(player);
            for (const s of slots) {
                assert.equal(s.canBuy, false);
                assert.equal(s.status, 'dead');
            }
        });

        it('marks upgrade slots as maxed when Tier 3 has been purchased', () => {
            const player = {
                coins: 500,
                health: 100,
                maxHealth: 100,
                upgrades: ['motor_1', 'motor_2', 'motor_3'],
                isDead: false,
            };

            const slots = evaluateQuickBuySlots(player);
            const engineSlot = slots[0];
            assert.equal(engineSlot.tier, 3);
            assert.equal(engineSlot.isMaxed, true);
            assert.equal(engineSlot.canBuy, false);
            assert.equal(engineSlot.status, 'maxed');
        });
    });

    describe('Single Keystroke & 1-Click Purchase Resolution (executeQuickBuy)', () => {
        it('resolves valid upgrade purchase and returns optimistic state mutation', () => {
            const player = {
                coins: 50,
                health: 100,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            const res = executeQuickBuy('1', player);
            assert.equal(res.success, true);
            assert.equal(res.type, 'upgrade');
            assert.equal(res.key, '1');
            assert.equal(res.slot, 'engine');
            assert.equal(res.upgradeId, 'motor_1');
            assert.equal(res.legacyType, 'motor');
            assert.equal(res.cost, 10);
            assert.equal(res.coinsDeducted, 10);
            assert.equal(res.newTier, 1);
        });

        it('resolves tier progression for subsequent purchases (Tier 1 -> Tier 2 -> Tier 3)', () => {
            const player = {
                coins: 50,
                health: 100,
                maxHealth: 100,
                upgrades: ['weapon_1'],
                isDead: false,
            };

            // Mallet is currently Tier 1 (Squeaky Mallet). Next is Tier 2 (Thunder Gavel, cost 30)
            const res = executeQuickBuy('2', player);
            assert.equal(res.success, true);
            assert.equal(res.upgradeId, 'weapon_2');
            assert.equal(res.cost, 30);
            assert.equal(res.newTier, 2);
        });

        it('resolves emergency hull patch and clamps health to maxHealth', () => {
            const player = {
                coins: 30,
                health: 80,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            const res = executeQuickBuy('4', player);
            assert.equal(res.success, true);
            assert.equal(res.type, 'repair');
            assert.equal(res.key, '4');
            assert.equal(res.slot, 'patch');
            assert.equal(res.cost, 15);
            assert.equal(res.healAmount, 35);
            assert.equal(res.healthRestored, 20); // 80 + 35 = 115, clamped to 100 -> +20
            assert.equal(res.newHealth, 100);
        });

        it('rejects purchase when slot cannot be bought', () => {
            const poorPlayer = {
                coins: 2,
                health: 50,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            const res = executeQuickBuy('1', poorPlayer);
            assert.equal(res.success, false);
            assert.equal(res.reason, 'need_coins');
        });

        it('rejects purchase for invalid key', () => {
            const res = executeQuickBuy('9', { coins: 100 });
            assert.equal(res.success, false);
            assert.equal(res.reason, 'unknown_slot');
        });
    });

    describe('Component Lifecycle & UI Controller (createQuickBuyHotbar)', () => {
        it('instantiates cleanly with public controller API in headless mode', () => {
            const hotbar = createQuickBuyHotbar({ enableHotkeys: false });
            assert.equal(typeof hotbar.updatePlayerData, 'function');
            assert.equal(typeof hotbar.triggerPurchase, 'function');
            assert.equal(typeof hotbar.getSlots, 'function');
            assert.equal(typeof hotbar.render, 'function');
            assert.equal(typeof hotbar.dispose, 'function');

            const slots = hotbar.getSlots();
            assert.equal(slots.length, 4);
            hotbar.dispose();
        });

        it('triggers purchase, invokes onPurchase callback, and emits socket event', () => {
            let callbackPayload = null;
            let emittedEvent = null;
            let emittedData = null;

            const fakeSocket = {
                emit: (event, data) => {
                    emittedEvent = event;
                    emittedData = data;
                },
            };

            const hotbar = createQuickBuyHotbar({
                socket: fakeSocket,
                enableHotkeys: false,
                onPurchase: (res) => {
                    callbackPayload = res;
                },
            });

            // Initial state has 50 coins
            hotbar.updatePlayerData({
                coins: 50,
                health: 100,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            });

            const result = hotbar.triggerPurchase('1');
            assert.equal(result.success, true);
            assert.equal(result.upgradeId, 'motor_1');

            // Verify callback
            assert.ok(callbackPayload);
            assert.equal(callbackPayload.upgradeId, 'motor_1');

            // Verify socket event
            assert.equal(emittedEvent, 'buyUpgrade');
            assert.equal(emittedData, 'motor'); // Legacy fallback for server compatibility

            hotbar.dispose();
        });

        it('handles emergency repair via triggerPurchase and emits repairRaft event', () => {
            let emittedEvent = null;
            let emittedData = null;

            const fakeSocket = {
                emit: (event, data) => {
                    emittedEvent = event;
                    emittedData = data;
                },
            };

            const hotbar = createQuickBuyHotbar({
                socket: fakeSocket,
                enableHotkeys: false,
            });

            hotbar.updatePlayerData({
                coins: 50,
                health: 40,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            });

            const result = hotbar.triggerPurchase('4');
            assert.equal(result.success, true);
            assert.equal(result.type, 'repair');
            assert.equal(emittedEvent, 'repairRaft');
            assert.equal(emittedData.amount, 35);
            assert.equal(emittedData.cost, 15);

            hotbar.dispose();
        });
    });
});
