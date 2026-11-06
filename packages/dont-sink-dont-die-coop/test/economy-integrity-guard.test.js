import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_SHOP_CATALOG,
    sanitizeCoins,
    applySafeCoinDelta,
    normalizeCoinRewardPayload,
    executeVerifiedShopPurchase,
} from '../shared/economy-integrity-guard.js';

import {
    UPGRADE_SLOTS,
    ARMORY_UPGRADE_TREE,
} from '../shared/upgrade-tree.js';

describe('Bulletproof Economy & Shop Transaction Guard (Helmet 02 w5a-11)', () => {
    describe('sanitizeCoins() — Defense against NaN, Undefined, Floats, and Corrupt Types', () => {
        it('returns clean integers when given valid non-negative numbers', () => {
            assert.equal(sanitizeCoins(0), 0);
            assert.equal(sanitizeCoins(1), 1);
            assert.equal(sanitizeCoins(42), 42);
            assert.equal(sanitizeCoins(1000000), 1000000);
        });

        it('floors floating-point values to integer coin balances', () => {
            assert.equal(sanitizeCoins(15.9), 15);
            assert.equal(sanitizeCoins(0.2), 0);
            assert.equal(sanitizeCoins(99.999), 99);
        });

        it('sanitizes NaN, undefined, and null to fallback (default 0)', () => {
            assert.equal(sanitizeCoins(NaN), 0);
            assert.equal(sanitizeCoins(undefined), 0);
            assert.equal(sanitizeCoins(null), 0);
            assert.equal(sanitizeCoins(NaN, 50), 50);
            assert.equal(sanitizeCoins(undefined, 25), 25);
            assert.equal(sanitizeCoins(null, 10), 10);
        });

        it('sanitizes infinite values to fallback', () => {
            assert.equal(sanitizeCoins(Infinity), 0);
            assert.equal(sanitizeCoins(-Infinity), 0);
            assert.equal(sanitizeCoins(Infinity, 100), 100);
        });

        it('sanitizes negative values to 0 without underflow', () => {
            assert.equal(sanitizeCoins(-1), 0);
            assert.equal(sanitizeCoins(-999), 0);
            assert.equal(sanitizeCoins(-0.01), 0);
        });

        it('parses valid numeric strings cleanly and rejects malformed strings', () => {
            assert.equal(sanitizeCoins('100'), 100);
            assert.equal(sanitizeCoins('  45.8  '), 45);
            assert.equal(sanitizeCoins('0'), 0);
            assert.equal(sanitizeCoins('abc'), 0);
            assert.equal(sanitizeCoins('NaN'), 0);
            assert.equal(sanitizeCoins(''), 0);
            assert.equal(sanitizeCoins('   ', 12), 12);
        });

        it('handles non-numeric objects, arrays, and functions safely', () => {
            assert.equal(sanitizeCoins({}), 0);
            assert.equal(sanitizeCoins({ coins: 50 }), 0);
            assert.equal(sanitizeCoins([10]), 0);
            assert.equal(sanitizeCoins(() => 50), 0);
            assert.equal(sanitizeCoins(Symbol('coin')), 0);
        });

        it('handles boolean values deterministically', () => {
            assert.equal(sanitizeCoins(true), 1);
            assert.equal(sanitizeCoins(false), 0);
        });

        it('sanitizes fallback argument defensively if corrupt fallback is passed', () => {
            assert.equal(sanitizeCoins(NaN, NaN), 0);
            assert.equal(sanitizeCoins(NaN, -10), 0);
            assert.equal(sanitizeCoins(NaN, 'corrupt'), 0);
            assert.equal(sanitizeCoins(NaN, 33.7), 33);
        });
    });

    describe('applySafeCoinDelta() — Balance Transitions and Overdraft Prevention', () => {
        it('applies positive deltas (earnings) accurately', () => {
            const res = applySafeCoinDelta(50, 25);
            assert.equal(res.success, true);
            assert.equal(res.previousCoins, 50);
            assert.equal(res.newCoins, 75);
            assert.equal(res.deltaApplied, 25);
            assert.equal(res.clamped, false);
            assert.equal(res.reason, null);
        });

        it('applies negative deltas (spending) when player has sufficient funds', () => {
            const res = applySafeCoinDelta(50, -20);
            assert.equal(res.success, true);
            assert.equal(res.previousCoins, 50);
            assert.equal(res.newCoins, 30);
            assert.equal(res.deltaApplied, -20);
            assert.equal(res.clamped, false);
            assert.equal(res.reason, null);
        });

        it('rejects purchase overdraft when balance would drop below zero (allowNegative=false)', () => {
            const res = applySafeCoinDelta(15, -20);
            assert.equal(res.success, false);
            assert.equal(res.previousCoins, 15);
            assert.equal(res.newCoins, 15);
            assert.equal(res.deltaApplied, 0);
            assert.equal(res.clamped, true);
            assert.equal(res.reason, 'insufficient-coins');
        });

        it('handles allowNegative=true cleanly if explicitly enabled', () => {
            const res = applySafeCoinDelta(15, -20, { allowNegative: true });
            assert.equal(res.success, true);
            assert.equal(res.previousCoins, 15);
            assert.equal(res.newCoins, -5);
            assert.equal(res.deltaApplied, -20);
            assert.equal(res.clamped, false);
        });

        it('clamps balance to maxBalance ceiling when earnings exceed cap', () => {
            const res = applySafeCoinDelta(990, 50, { maxBalance: 1000 });
            assert.equal(res.success, true);
            assert.equal(res.previousCoins, 990);
            assert.equal(res.newCoins, 1000);
            assert.equal(res.deltaApplied, 10);
            assert.equal(res.clamped, true);
        });

        it('protects against NaN or undefined deltas without corrupting balance', () => {
            const res1 = applySafeCoinDelta(50, NaN);
            assert.equal(res1.success, true);
            assert.equal(res1.newCoins, 50);
            assert.equal(res1.deltaApplied, 0);

            const res2 = applySafeCoinDelta(50, undefined);
            assert.equal(res2.success, true);
            assert.equal(res2.newCoins, 50);
            assert.equal(res2.deltaApplied, 0);

            const res3 = applySafeCoinDelta(NaN, 10);
            assert.equal(res3.success, true);
            assert.equal(res3.previousCoins, 0);
            assert.equal(res3.newCoins, 10);
        });

        it('truncates floating deltas to integer adjustments', () => {
            const res = applySafeCoinDelta(10, 5.85);
            assert.equal(res.success, true);
            assert.equal(res.newCoins, 15);
            assert.equal(res.deltaApplied, 5);
        });
    });

    describe('normalizeCoinRewardPayload() — Cross-Subsystem Event Normalization', () => {
        it('normalizes river hazard ring payload with earnedCoins', () => {
            const payload = { earnedCoins: 10, source: 'river_ring' };
            const res = normalizeCoinRewardPayload(payload);
            assert.equal(res.coinsEarned, 10);
            assert.equal(res.rawCoins, 10);
            assert.equal(res.sourceProperty, 'earnedCoins');
            assert.equal(res.valid, true);
        });

        it('normalizes coin pickup payload with coinsEarned', () => {
            const payload = { coinsEarned: 25, entityId: 'floating_crate' };
            const res = normalizeCoinRewardPayload(payload);
            assert.equal(res.coinsEarned, 25);
            assert.equal(res.rawCoins, 25);
            assert.equal(res.sourceProperty, 'coinsEarned');
            assert.equal(res.valid, true);
        });

        it('normalizes trick system payload with coinsAwarded', () => {
            const payload = { coinsAwarded: 5, trick: 'kickflip' };
            const res = normalizeCoinRewardPayload(payload);
            assert.equal(res.coinsEarned, 5);
            assert.equal(res.sourceProperty, 'coinsAwarded');
            assert.equal(res.valid, true);
        });

        it('normalizes boss coin burst payload with value', () => {
            const payload = { value: 50, bossId: 'kraken' };
            const res = normalizeCoinRewardPayload(payload);
            assert.equal(res.coinsEarned, 50);
            assert.equal(res.sourceProperty, 'value');
            assert.equal(res.valid, true);
        });

        it('normalizes dream event payload with bonusCoins and totalCoins', () => {
            const res1 = normalizeCoinRewardPayload({ bonusCoins: 12 });
            assert.equal(res1.coinsEarned, 12);
            assert.equal(res1.sourceProperty, 'bonusCoins');

            const res2 = normalizeCoinRewardPayload({ totalCoins: 100 });
            assert.equal(res2.coinsEarned, 100);
            assert.equal(res2.sourceProperty, 'totalCoins');
        });

        it('applies multiplier (e.g. Style Rank S or Tarot Midas Oar)', () => {
            const payload = {
                coinsEarned: 20,
                multiplier: 2.0, // Rank S 2.0x boost
            };
            const res = normalizeCoinRewardPayload(payload);
            assert.equal(res.rawCoins, 20);
            assert.equal(res.coinsEarned, 40);
            assert.equal(res.multiplier, 2.0);
            assert.equal(res.valid, true);
        });

        it('handles direct numeric reward literals', () => {
            const res = normalizeCoinRewardPayload(35);
            assert.equal(res.coinsEarned, 35);
            assert.equal(res.sourceProperty, 'numeric_literal');
            assert.equal(res.valid, true);
        });

        it('safely handles missing, null, undefined, or empty payloads', () => {
            assert.equal(normalizeCoinRewardPayload(null).valid, false);
            assert.equal(normalizeCoinRewardPayload(undefined).valid, false);
            assert.equal(normalizeCoinRewardPayload({}).valid, false);
            assert.equal(normalizeCoinRewardPayload({ someOtherField: 123 }).valid, false);
            assert.equal(normalizeCoinRewardPayload(null).coinsEarned, 0);
        });

        it('handles corrupt/NaN coin values inside payload without throwing', () => {
            const res = normalizeCoinRewardPayload({ coinsEarned: NaN });
            assert.equal(res.coinsEarned, 0);
            assert.equal(res.valid, false);
        });
    });

    describe('executeVerifiedShopPurchase() — Verified Hotkey & Click Transactions', () => {
        it('executes Hotkey [1] purchase: buys Motor Mk I (10c)', () => {
            const player = {
                coins: 50,
                health: 100,
                maxHealth: 100,
                upgrades: [],
            };

            const receipt = executeVerifiedShopPurchase({
                playerStats: player,
                hotkey: '1',
            });

            assert.equal(receipt.success, true);
            assert.equal(receipt.itemType, 'upgrade');
            assert.equal(receipt.itemName, 'Motor Mk I');
            assert.equal(receipt.coinsDeducted, 10);
            assert.equal(receipt.previousCoins, 50);
            assert.equal(receipt.remainingCoins, 40);
            assert.equal(receipt.inputMethod, 'hotkey');
            assert.equal(player.coins, 40);
            assert.ok(player.upgrades.includes('motor_1'));
        });

        it('executes sequential upgrades with tier replacement in same slot', () => {
            const player = {
                coins: 100,
                health: 100,
                maxHealth: 100,
                upgrades: ['motor_1'],
            };

            // Hotkey [1] again -> buys Motor Mk II (25c)
            const receipt = executeVerifiedShopPurchase({
                playerStats: player,
                hotkey: '1',
            });

            assert.equal(receipt.success, true);
            assert.equal(receipt.itemName, 'Motor Mk II');
            assert.equal(receipt.coinsDeducted, 25);
            assert.equal(player.coins, 75);
            assert.ok(player.upgrades.includes('motor_2'));
            assert.ok(!player.upgrades.includes('motor_1'), 'Tier 1 must be replaced by Tier 2');
        });

        it('rejects purchase when slot is already max tier (Tier 3)', () => {
            const player = {
                coins: 500,
                health: 100,
                maxHealth: 100,
                upgrades: ['motor_3'],
            };

            const receipt = executeVerifiedShopPurchase({
                playerStats: player,
                hotkey: '1',
            });

            assert.equal(receipt.success, false);
            assert.equal(receipt.reason, 'slot-already-maxed');
            assert.equal(receipt.coinsDeducted, 0);
            assert.equal(player.coins, 500);
        });

        it('rejects purchase when player has insufficient coins', () => {
            const player = {
                coins: 5, // Motor Mk I costs 10
                health: 100,
                maxHealth: 100,
                upgrades: [],
            };

            const receipt = executeVerifiedShopPurchase({
                playerStats: player,
                hotkey: '1',
            });

            assert.equal(receipt.success, false);
            assert.equal(receipt.reason, 'insufficient-coins');
            assert.equal(receipt.coinsDeducted, 0);
            assert.equal(player.coins, 5);
            assert.deepEqual(player.upgrades, []);
        });

        it('executes Hotkey [4] Emergency Patch: restores health when damaged', () => {
            const player = {
                coins: 30,
                health: 40,
                maxHealth: 100,
                upgrades: [],
            };

            const receipt = executeVerifiedShopPurchase({
                playerStats: player,
                hotkey: '4',
            });

            assert.equal(receipt.success, true);
            assert.equal(receipt.itemType, 'repair');
            assert.equal(receipt.itemName, 'Emergency Patch');
            assert.equal(receipt.coinsDeducted, 15);
            assert.equal(receipt.remainingCoins, 15);
            assert.equal(receipt.healedAmount, 35);
            assert.equal(player.coins, 15);
            assert.equal(player.health, 75);
        });

        it('rejects Emergency Patch when health is already full', () => {
            const player = {
                coins: 50,
                health: 100,
                maxHealth: 100,
                upgrades: [],
            };

            const receipt = executeVerifiedShopPurchase({
                playerStats: player,
                hotkey: '4',
            });

            assert.equal(receipt.success, false);
            assert.equal(receipt.reason, 'health-already-full');
            assert.equal(receipt.coinsDeducted, 0);
            assert.equal(player.coins, 50);
            assert.equal(player.health, 100);
        });

        it('supports mouse click purchases passing itemKey and inputMethod="mouse"', () => {
            const player = {
                coins: 50,
                health: 60,
                maxHealth: 100,
                upgrades: [],
            };

            // Direct click on weapon (Hotkey 2 slot)
            const r1 = executeVerifiedShopPurchase({
                playerStats: player,
                itemKey: 'weapon_1',
                inputMethod: 'mouse',
            });

            assert.equal(r1.success, true);
            assert.equal(r1.inputMethod, 'mouse');
            assert.equal(r1.itemName, 'Squeaky Mallet');
            assert.equal(r1.coinsDeducted, 15);
            assert.equal(player.coins, 35);

            // Direct click on patch
            const r2 = executeVerifiedShopPurchase({
                playerStats: player,
                itemKey: 'patch',
                inputMethod: 'mouse',
            });

            assert.equal(r2.success, true);
            assert.equal(r2.itemType, 'repair');
            assert.equal(r2.coinsDeducted, 15);
            assert.equal(player.coins, 20);
            assert.equal(player.health, 95);
        });

        it('rejects purchase when player is dead', () => {
            const player = {
                coins: 100,
                health: 0,
                isDead: true,
                upgrades: [],
            };

            const receipt = executeVerifiedShopPurchase({
                playerStats: player,
                hotkey: '1',
            });

            assert.equal(receipt.success, false);
            assert.equal(receipt.reason, 'player-is-dead');
            assert.equal(player.coins, 100);
        });

        it('handles corrupt NaN player coins gracefully by resetting to 0 and rejecting purchase', () => {
            const player = {
                coins: NaN,
                health: 100,
                maxHealth: 100,
                upgrades: [],
            };

            const receipt = executeVerifiedShopPurchase({
                playerStats: player,
                hotkey: '1',
            });

            assert.equal(receipt.success, false);
            assert.equal(receipt.reason, 'insufficient-coins');
            assert.equal(player.coins, 0);
            assert.equal(Number.isNaN(player.coins), false);
        });

        it('supports mutatePlayer=false without modifying the source player object', () => {
            const player = {
                coins: 50,
                health: 50,
                maxHealth: 100,
                upgrades: [],
            };

            const receipt = executeVerifiedShopPurchase({
                playerStats: player,
                hotkey: '1',
                mutatePlayer: false,
            });

            assert.equal(receipt.success, true);
            assert.equal(receipt.coinsDeducted, 10);
            assert.equal(receipt.remainingCoins, 40);
            // Player state preserved
            assert.equal(player.coins, 50);
            assert.deepEqual(player.upgrades, []);
        });
    });
});
