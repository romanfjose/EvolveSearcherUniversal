import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    COOP_TREASURY_CONFIG,
    sanitizeCoins,
    calculatePlayerDistance,
    normalizeCrewPlayers,
    isEligibleCrewmate,
    distributeCrewCoinPickup,
    poolCrewCoinsForPurchase,
} from '../shared/coop-crew-treasury.js';

describe('Co-Op Crew Treasury & Coin Dividend Config', () => {
    it('provides immutable configuration constants with default 25m cohesion and 25% dividend rate', () => {
        assert.equal(COOP_TREASURY_CONFIG.DEFAULT_COHESION_RADIUS, 25.0);
        assert.equal(COOP_TREASURY_CONFIG.COHESION_DIVIDEND_RATE, 0.25);
        assert.equal(COOP_TREASURY_CONFIG.MIN_DIVIDEND_COINS, 1);
        assert.ok(Object.isFrozen(COOP_TREASURY_CONFIG));
    });
});

describe('Coin sanitization & arithmetic integrity', () => {
    it('normalizes valid integers and floats to non-negative integers', () => {
        assert.equal(sanitizeCoins(10), 10);
        assert.equal(sanitizeCoins(15.99), 15);
        assert.equal(sanitizeCoins(0), 0);
        assert.equal(sanitizeCoins('42'), 42);
    });

    it('defends against NaN, null, undefined, negatives, and Infinity', () => {
        assert.equal(sanitizeCoins(NaN), 0);
        assert.equal(sanitizeCoins(NaN, 5), 5);
        assert.equal(sanitizeCoins(null), 0);
        assert.equal(sanitizeCoins(undefined), 0);
        assert.equal(sanitizeCoins(-10), 0);
        assert.equal(sanitizeCoins(Infinity), 0);
        assert.equal(sanitizeCoins(-Infinity), 0);
        assert.equal(sanitizeCoins('not-a-number'), 0);
    });
});

describe('Player distance calculation & crewmate eligibility', () => {
    it('calculates 3D and 2D Euclidean distance accurately', () => {
        const p1 = { position: { x: 0, y: 0, z: 0 } };
        const p2 = { position: { x: 3, y: 4, z: 0 } };
        assert.equal(calculatePlayerDistance(p1, p2), 5.0);

        const p3 = { x: 0, y: 0, z: 0 };
        const p4 = { x: 0, y: 0, z: -20 };
        assert.equal(calculatePlayerDistance(p3, p4), 20.0);
    });

    it('returns Infinity when either player is missing or null', () => {
        assert.equal(calculatePlayerDistance(null, { x: 0, y: 0, z: 0 }), Infinity);
        assert.equal(calculatePlayerDistance({ x: 0, y: 0, z: 0 }, undefined), Infinity);
    });

    it('checks crewmate eligibility correctly (filters dead or negative HP)', () => {
        assert.equal(isEligibleCrewmate({ id: 'p1', health: 100, isDead: false }), true);
        assert.equal(isEligibleCrewmate({ id: 'p2', health: 0, isDead: true }), false);
        assert.equal(isEligibleCrewmate({ id: 'p3', health: -10, isDead: false }), false);
        assert.equal(isEligibleCrewmate(null), false);
    });
});

describe('distributeCrewCoinPickup mechanics', () => {
    it('awards 100% base coins to the picker and 25% dividend to teammate within 25m', () => {
        const crew = [
            { id: 'p1', coins: 10, position: { x: 0, y: 0, z: -100 }, health: 100 },
            { id: 'p2', coins: 0, position: { x: 10, y: 0, z: -100 }, health: 100 }, // dist = 10m <= 25m
        ];

        const report = distributeCrewCoinPickup({
            pickerId: 'p1',
            baseCoins: 40,
            crewPlayers: crew,
        });

        assert.equal(report.pickerId, 'p1');
        assert.equal(report.baseCoins, 40);
        assert.equal(report.pickerCoinsAwarded, 40);
        assert.equal(report.unitDividend, 10); // 40 * 0.25 = 10
        assert.equal(report.totalDividendsAwarded, 10);
        assert.equal(report.grandTotalGenerated, 50);

        // Verify mutation on player objects
        const p1 = crew.find((p) => p.id === 'p1');
        const p2 = crew.find((p) => p.id === 'p2');
        assert.equal(p1.coins, 50); // 10 + 40
        assert.equal(p2.coins, 10); // 0 + 10
    });

    it('awards no dividend to teammate outside 25m cohesion radius', () => {
        const crew = [
            { id: 'p1', coins: 5, position: { x: 0, y: 0, z: -50 }, health: 100 },
            { id: 'p2', coins: 0, position: { x: 30, y: 0, z: -50 }, health: 100 }, // dist = 30m > 25m
        ];

        const report = distributeCrewCoinPickup({
            pickerId: 'p1',
            baseCoins: 20,
            crewPlayers: crew,
            cohesionBonusRadius: 25,
        });

        assert.equal(report.pickerCoinsAwarded, 20);
        assert.equal(report.totalDividendsAwarded, 0);
        assert.equal(report.dividendRecipients.length, 0);

        const p1 = crew.find((p) => p.id === 'p1');
        const p2 = crew.find((p) => p.id === 'p2');
        assert.equal(p1.coins, 25); // 5 + 20
        assert.equal(p2.coins, 0);  // 0 + 0
    });

    it('distributes dividends to multiple in-range teammates simultaneously', () => {
        const crew = {
            p1: { id: 'p1', coins: 0, position: { x: 0, y: 0, z: -200 }, health: 100 },
            p2: { id: 'p2', coins: 15, position: { x: 5, y: 0, z: -205 }, health: 100 }, // dist ~ 7m <= 25m
            p3: { id: 'p3', coins: 100, position: { x: -12, y: 0, z: -210 }, health: 100 }, // dist ~ 15.6m <= 25m
            p4: { id: 'p4', coins: 50, position: { x: 0, y: 0, z: -350 }, health: 100 }, // dist = 150m > 25m (too far)
            deadMate: { id: 'deadMate', coins: 0, position: { x: 2, y: 0, z: -200 }, isDead: true }, // dead
        };

        const report = distributeCrewCoinPickup({
            pickerId: 'p1',
            baseCoins: 12,
            crewPlayers: crew,
        });

        // baseCoins = 12, 25% = 3
        assert.equal(report.unitDividend, 3);
        assert.equal(report.dividendRecipients.length, 2);
        assert.equal(report.totalDividendsAwarded, 6); // 3 + 3
        assert.equal(report.grandTotalGenerated, 18); // 12 + 6

        assert.equal(crew.p1.coins, 12);
        assert.equal(crew.p2.coins, 18); // 15 + 3
        assert.equal(crew.p3.coins, 103); // 100 + 3
        assert.equal(crew.p4.coins, 50); // unchanged
        assert.equal(crew.deadMate.coins, 0); // dead player untouched
    });

    it('guarantees minimum dividend of 1 coin for small pickups (e.g. 1-3 coins)', () => {
        const crew = [
            { id: 'p1', coins: 0, position: { x: 0, y: 0, z: 0 }, health: 100 },
            { id: 'p2', coins: 0, position: { x: 1, y: 0, z: 0 }, health: 100 },
        ];

        const report = distributeCrewCoinPickup({
            pickerId: 'p1',
            baseCoins: 1,
            crewPlayers: crew,
        });

        assert.equal(report.baseCoins, 1);
        assert.equal(report.unitDividend, 1); // Math.max(1, Math.round(1 * 0.25)) = 1
        assert.equal(crew[0].coins, 1);
        assert.equal(crew[1].coins, 1);
    });

    it('handles zero baseCoins or 0 dividend rate without errors or NaN', () => {
        const crew = [
            { id: 'p1', coins: 10, position: { x: 0, y: 0, z: 0 }, health: 100 },
            { id: 'p2', coins: 10, position: { x: 2, y: 0, z: 0 }, health: 100 },
        ];

        const report = distributeCrewCoinPickup({
            pickerId: 'p1',
            baseCoins: 0,
            crewPlayers: crew,
        });

        assert.equal(report.baseCoins, 0);
        assert.equal(report.unitDividend, 0);
        assert.equal(report.totalDividendsAwarded, 0);
        assert.equal(crew[0].coins, 10);
        assert.equal(crew[1].coins, 10);
    });

    it('never produces NaN when inputs are corrupt (NaN, strings, nulls)', () => {
        const crew = [
            { id: 'p1', coins: NaN, position: { x: NaN, y: 'bad', z: null }, health: 100 },
            { id: 'p2', coins: undefined, position: null, health: 100 },
        ];

        const report = distributeCrewCoinPickup({
            pickerId: 'p1',
            baseCoins: NaN,
            crewPlayers: crew,
        });

        assert.equal(Number.isNaN(report.baseCoins), false);
        assert.equal(Number.isNaN(report.unitDividend), false);
        assert.equal(Number.isNaN(crew[0].coins), false);
        assert.equal(crew[0].coins, 0);
    });

    it('supports dry-run mode (mutate: false) leaving player objects untouched', () => {
        const crew = [
            { id: 'p1', coins: 10, position: { x: 0, y: 0, z: 0 }, health: 100 },
            { id: 'p2', coins: 5, position: { x: 1, y: 0, z: 0 }, health: 100 },
        ];

        const report = distributeCrewCoinPickup({
            pickerId: 'p1',
            baseCoins: 40,
            crewPlayers: crew,
            mutate: false,
        });

        assert.equal(report.grandTotalGenerated, 50);
        assert.equal(crew[0].coins, 10);
        assert.equal(crew[1].coins, 5);
    });
});

describe('poolCrewCoinsForPurchase mechanics', () => {
    it('executes team purchase when crew collectively has enough coins', () => {
        const crew = [
            { id: 'p1', coins: 30, health: 100 },
            { id: 'p2', coins: 20, health: 100 },
        ];

        const receipt = poolCrewCoinsForPurchase(crew, 45);
        assert.equal(receipt.success, true);
        assert.equal(receipt.cost, 45);
        assert.equal(receipt.totalAvailable, 50);
        assert.equal(receipt.remainingTreasury, 5);
        assert.equal(receipt.contributions.length, 2);

        // Deducts highest balance first (p1 had 30 -> 30 deducted, p2 had 20 -> 15 deducted)
        const c1 = receipt.contributions.find((c) => c.playerId === 'p1');
        const c2 = receipt.contributions.find((c) => c.playerId === 'p2');
        assert.equal(c1.deducted, 30);
        assert.equal(c2.deducted, 15);

        assert.equal(crew[0].coins, 0);
        assert.equal(crew[1].coins, 5);
    });

    it('respects priorityPlayerId by drawing from their balance first', () => {
        const crew = [
            { id: 'p1', coins: 50, health: 100 },
            { id: 'p2', coins: 50, health: 100 },
        ];

        const receipt = poolCrewCoinsForPurchase(crew, 30, { priorityPlayerId: 'p2' });
        assert.equal(receipt.success, true);
        assert.equal(receipt.contributions.length, 1);
        assert.equal(receipt.contributions[0].playerId, 'p2');
        assert.equal(receipt.contributions[0].deducted, 30);

        assert.equal(crew[0].coins, 50);
        assert.equal(crew[1].coins, 20);
    });

    it('rejects purchase cleanly when crew funds are insufficient', () => {
        const crew = [
            { id: 'p1', coins: 10, health: 100 },
            { id: 'p2', coins: 15, health: 100 },
        ];

        const receipt = poolCrewCoinsForPurchase(crew, 30);
        assert.equal(receipt.success, false);
        assert.equal(receipt.reason, 'insufficient-funds');
        assert.equal(receipt.totalAvailable, 25);
        assert.equal(receipt.shortfall, 5);

        // Verify balances untouched
        assert.equal(crew[0].coins, 10);
        assert.equal(crew[1].coins, 15);
    });

    it('allows free purchase (cost = 0)', () => {
        const crew = [{ id: 'p1', coins: 15, health: 100 }];
        const receipt = poolCrewCoinsForPurchase(crew, 0);
        assert.equal(receipt.success, true);
        assert.equal(receipt.reason, 'free-purchase');
        assert.equal(crew[0].coins, 15);
    });

    it('ignores dead crewmates and negative coin values', () => {
        const crew = [
            { id: 'alive', coins: 20, health: 100 },
            { id: 'dead', coins: 100, health: 0, isDead: true },
        ];

        const receipt = poolCrewCoinsForPurchase(crew, 30);
        assert.equal(receipt.success, false);
        assert.equal(receipt.totalAvailable, 20); // Dead mate's 100 coins not accessible
    });

    it('handles dry-run mode (mutate: false)', () => {
        const crew = [{ id: 'p1', coins: 50, health: 100 }];
        const receipt = poolCrewCoinsForPurchase(crew, 25, { mutate: false });
        assert.equal(receipt.success, true);
        assert.equal(crew[0].coins, 50); // Unmutated
    });
});
