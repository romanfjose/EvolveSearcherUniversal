import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    UPGRADE_SLOTS,
    BASE_PLAYER_STATS,
    ARMORY_UPGRADE_TREE,
    ALL_UPGRADES,
    canPurchaseArmoryUpgrade,
    getSlotCurrentTier,
    calculateCumulativeStats,
} from '../shared/upgrade-tree.js';

import {
    TAROT_CARD_IDS,
    TAROT_CARDS,
    createPlayerTarotState,
    applyTarotBlessing,
    hasTarotBlessing,
    dealTarotCards,
    createTarotDraftSession,
    selectDraftCard,
} from '../shared/dream-tarot.js';

import {
    ECONOMY_SAFETY_BOUNDS,
    EXTENDED_TAROT_IDS,
    ALL_12_TAROT_KEYS,
    CHAOS_TAROT_DEFINITIONS,
    validateCoins,
    createEconomyTransactionManager,
    calculateCombinedEconomyStats,
    fuzzArmoryCoinPurchase,
    simulateSameMillisecondPurchaseStorm,
} from '../shared/qa-economy-breaker.js';

describe('Helmet 03 — QA Economy Breaker: Transaction Mutex & Same-Millisecond Spam', () => {
    it('executes a single valid armory purchase and deducts correct coins', () => {
        const manager = createEconomyTransactionManager();
        const player = {
            id: 'p_hero',
            coins: 50,
            upgrades: [],
        };

        const res = manager.executePurchase(player, 'motor_1', { timestampMs: 1000 });
        assert.equal(res.success, true);
        assert.equal(res.upgradeId, 'motor_1');
        assert.equal(res.cost, 10);
        assert.equal(player.coins, 40);
        assert.deepEqual(player.upgrades, ['motor_1']);
    });

    it('rejects double-purchasing the same upgrade in the exact same millisecond', () => {
        const storm = simulateSameMillisecondPurchaseStorm(
            { id: 'p_spammer', coins: 100, upgrades: [] },
            'motor_1',
            10,
            1000 // All 10 requests at timestamp 1000
        );

        assert.equal(storm.totalAttempts, 10);
        assert.equal(storm.successCount, 1, 'Only exactly 1 purchase should succeed');
        assert.equal(storm.failureCount, 9, 'The remaining 9 concurrent spam calls must be rejected');
        assert.equal(storm.initialCoins, 100);
        assert.equal(storm.finalCoins, 90, 'Coins should be deducted exactly once (10c)');
        assert.deepEqual(storm.finalUpgrades, ['motor_1']);
        assert.equal(storm.idempotencyPassed, true);
    });

    it('prevents concurrent execution when transaction lock is active', () => {
        const manager = createEconomyTransactionManager();
        const player = { id: 'p_locked', coins: 100, upgrades: [] };

        // Artificially activate lock
        manager.activeLocks.add('p_locked');

        const res = manager.executePurchase(player, 'weapon_1', { timestampMs: 1500 });
        assert.equal(res.success, false);
        assert.equal(res.reason, 'concurrent-transaction-locked');
        assert.equal(player.coins, 100, 'Coins must remain untouched');
    });

    it('allows sequential tiered upgrades across different slots and timestamps', () => {
        const manager = createEconomyTransactionManager();
        const player = { id: 'p_progression', coins: 200, upgrades: [] };

        // Buy Motor Tier 1 (10c)
        const t1 = manager.executePurchase(player, 'motor_1', { timestampMs: 1000 });
        assert.equal(t1.success, true);

        // Buy Motor Tier 2 after cooldown (25c)
        const t2 = manager.executePurchase(player, 'motor_2', { timestampMs: 1100 });
        assert.equal(t2.success, true);
        assert.ok(player.upgrades.includes('motor_2'));
        assert.ok(!player.upgrades.includes('motor_1'), 'Tier 1 should be replaced by Tier 2');

        // Buy Weapon Tier 1 (15c)
        const t3 = manager.executePurchase(player, 'weapon_1', { timestampMs: 1200 });
        assert.equal(t3.success, true);

        assert.equal(player.coins, 200 - 10 - 25 - 15);
    });
});

describe('Helmet 03 — QA Economy Breaker: Coin Validation & Corrupt Input Fuzzing', () => {
    const corruptCoinValues = [
        0,
        -1,
        -999,
        NaN,
        Infinity,
        -Infinity,
        '100',
        null,
        undefined,
        {},
        [],
        () => 50,
        Symbol('coins'),
    ];

    corruptCoinValues.forEach((coinVal) => {
        it(`safely rejects armory purchase when coins = ${String(coinVal)} without state corruption`, () => {
            const player = {
                id: 'p_fuzz',
                coins: coinVal,
                upgrades: ['motor_1'],
            };

            const fuzzResult = fuzzArmoryCoinPurchase(player, 'motor_2', coinVal);
            assert.equal(fuzzResult.rejectedProperly, true, `Should have rejected coin value: ${String(coinVal)}`);
            assert.equal(fuzzResult.playerStatePreserved, true, 'Player upgrade array must not be altered');
        });
    });

    it('validateCoins helper rejects invalid formats and accepts clean positive numbers', () => {
        assert.equal(validateCoins(50).valid, true);
        assert.equal(validateCoins(0).valid, true);
        assert.equal(validateCoins(-5).valid, false);
        assert.equal(validateCoins(NaN).valid, false);
        assert.equal(validateCoins(Infinity).valid, false);
        assert.equal(validateCoins('50').valid, false);
        assert.equal(validateCoins(null).valid, false);
        assert.equal(validateCoins(undefined).valid, false);
    });

    it('rejects purchase when player has positive coins but less than upgrade cost', () => {
        const manager = createEconomyTransactionManager();
        const player = { id: 'p_broke', coins: 5, upgrades: [] };

        // weapon_1 costs 15 coins
        const res = manager.executePurchase(player, 'weapon_1');
        assert.equal(res.success, false);
        assert.equal(res.reason, 'insufficient-coins');
        assert.equal(player.coins, 5);
        assert.deepEqual(player.upgrades, []);
    });
});

describe('Helmet 03 — QA Economy Breaker: Stacking All 12 Tarot Blessings Simultaneously', () => {
    it('defines all 12 Tarot Blessings including the 4 specified chaos arcana cards', () => {
        assert.equal(ALL_12_TAROT_KEYS.length, 12);

        // Core 6
        assert.ok(ALL_12_TAROT_KEYS.includes(TAROT_CARD_IDS.CAFFEINATED_OARS));
        assert.ok(ALL_12_TAROT_KEYS.includes(TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY));
        assert.ok(ALL_12_TAROT_KEYS.includes(TAROT_CARD_IDS.HEAVY_POCKET_ANVIL));
        assert.ok(ALL_12_TAROT_KEYS.includes(TAROT_CARD_IDS.SQUEAKY_OVERDRIVE));
        assert.ok(ALL_12_TAROT_KEYS.includes(TAROT_CARD_IDS.PLANK_MAGNETISM));
        assert.ok(ALL_12_TAROT_KEYS.includes(TAROT_CARD_IDS.REVERSE_PSYCHOLOGY));

        // Extended Chaos 6 (including Glass Cannon, Heavy Timber, Midas Oar, Thunder Mallet)
        assert.ok(ALL_12_TAROT_KEYS.includes(EXTENDED_TAROT_IDS.GLASS_CANNON));
        assert.ok(ALL_12_TAROT_KEYS.includes(EXTENDED_TAROT_IDS.HEAVY_TIMBER));
        assert.ok(ALL_12_TAROT_KEYS.includes(EXTENDED_TAROT_IDS.MIDAS_OAR));
        assert.ok(ALL_12_TAROT_KEYS.includes(EXTENDED_TAROT_IDS.THUNDER_MALLET));
        assert.ok(ALL_12_TAROT_KEYS.includes(EXTENDED_TAROT_IDS.ABYSSAL_SIPHON));
        assert.ok(ALL_12_TAROT_KEYS.includes(EXTENDED_TAROT_IDS.TEMPEST_SAIL));

        for (const key of ALL_12_TAROT_KEYS) {
            const def = CHAOS_TAROT_DEFINITIONS[key];
            assert.ok(def, `Missing card definition for ${key}`);
            assert.ok(def.name);
            assert.ok(def.arcana);
        }
    });

    it('stacks all 12 Tarot blessings simultaneously with Tier 3 Armory upgrades', () => {
        const fullTier3Upgrades = ['motor_3', 'weapon_3', 'armor_3'];
        const full12Blessings = [...ALL_12_TAROT_KEYS];

        const combined = calculateCombinedEconomyStats(fullTier3Upgrades, full12Blessings);

        // Verify counts
        assert.equal(combined.blessingCount, 12);

        // Verify No NaN anywhere
        assert.equal(Number.isNaN(combined.speed), false, 'speed must not be NaN');
        assert.equal(Number.isNaN(combined.turnRate), false, 'turnRate must not be NaN');
        assert.equal(Number.isNaN(combined.dps), false, 'dps must not be NaN');
        assert.equal(Number.isNaN(combined.maxHp), false, 'maxHp must not be NaN');

        // Verify Finite numbers
        assert.equal(Number.isFinite(combined.speed), true);
        assert.equal(Number.isFinite(combined.turnRate), true);
        assert.equal(Number.isFinite(combined.dps), true);
        assert.equal(Number.isFinite(combined.maxHp), true);

        // Verify Safety Bounds: positive, never zero or negative
        assert.ok(combined.speed >= ECONOMY_SAFETY_BOUNDS.MIN_SPEED, `speed ${combined.speed} below min`);
        assert.ok(combined.turnRate >= ECONOMY_SAFETY_BOUNDS.MIN_TURN_RATE, `turnRate ${combined.turnRate} below min`);
        assert.ok(combined.dps >= ECONOMY_SAFETY_BOUNDS.MIN_DPS, `dps ${combined.dps} below min`);
        assert.ok(combined.maxHp >= ECONOMY_SAFETY_BOUNDS.MIN_HEALTH, `maxHp ${combined.maxHp} below min`);

        // Multipliers check
        assert.ok(combined.multipliers.dpsMult > 1.0, 'DPS multiplier should be heavily boosted');
        assert.ok(combined.multipliers.lifeSteal > 0.0, 'Life steal should be active from Abyssal Siphon');
    });

    it('preserves physical minimum health floor even when Glass Cannon (0.5x) is repeatedly applied', () => {
        // Base health with no armor is 100 HP.
        // Stacking Glass Cannon multiple times:
        const stackedGlassCannons = Array(8).fill(EXTENDED_TAROT_IDS.GLASS_CANNON);
        const stats = calculateCombinedEconomyStats([], stackedGlassCannons);

        // 100 * (0.5^8) = 100 * 0.0039 = 0.39 HP -> Should clamp to MIN_HEALTH (10 HP)
        assert.ok(stats.maxHp >= ECONOMY_SAFETY_BOUNDS.MIN_HEALTH);
        assert.equal(Number.isFinite(stats.maxHp), true);
        assert.equal(stats.maxHp, ECONOMY_SAFETY_BOUNDS.MIN_HEALTH);
    });

    it('preserves physical speed floor even when Heavy Timber (-25% speed) is repeatedly applied', () => {
        // Stacking Heavy Timber 10 times:
        const stackedHeavyTimber = Array(10).fill(EXTENDED_TAROT_IDS.HEAVY_TIMBER);
        const stats = calculateCombinedEconomyStats([], stackedHeavyTimber);

        // 15 * (0.75^10) = 0.845 m/s -> Should clamp to MIN_SPEED (1.0 m/s)
        assert.ok(stats.speed >= ECONOMY_SAFETY_BOUNDS.MIN_SPEED);
        assert.equal(Number.isFinite(stats.speed), true);
        assert.equal(stats.speed, ECONOMY_SAFETY_BOUNDS.MIN_SPEED);
    });

    it('never divides by zero or produces infinite multipliers under pathological zero stats', () => {
        const pathologicalBase = {
            speed: 0,
            turnRate: 0,
            dps: 0,
            maxHp: 0,
        };

        const result = calculateCombinedEconomyStats([], ALL_12_TAROT_KEYS, pathologicalBase);

        assert.equal(Number.isFinite(result.speed), true);
        assert.equal(Number.isFinite(result.maxHp), true);
        assert.equal(Number.isFinite(result.dps), true);
        assert.equal(Number.isFinite(result.turnRate), true);

        assert.ok(result.speed >= ECONOMY_SAFETY_BOUNDS.MIN_SPEED);
        assert.ok(result.maxHp >= ECONOMY_SAFETY_BOUNDS.MIN_HEALTH);
        assert.ok(result.dps >= ECONOMY_SAFETY_BOUNDS.MIN_DPS);
        assert.ok(result.turnRate >= ECONOMY_SAFETY_BOUNDS.MIN_TURN_RATE);
    });
});

describe('Helmet 03 — QA Economy Breaker: Armory & Checkpoint Draft Race Interaction', () => {
    it('seamlessly integrates player state between armory upgrades and draft sessions', () => {
        const manager = createEconomyTransactionManager();
        const player = {
            id: 'p_dual_wielder',
            coins: 100,
            upgrades: [],
            tarotState: createPlayerTarotState(),
        };

        // 1. Player buys Motor Mk I at dockside
        const p1 = manager.executePurchase(player, 'motor_1', { timestampMs: 500 });
        assert.equal(p1.success, true);
        assert.equal(player.coins, 90);

        // 2. Player reaches checkpoint #2 and starts a Tarot Draft session
        const session = createTarotDraftSession({
            checkpointIndex: 2,
            seed: 777,
            startTimeMs: 1000,
        });
        assert.equal(session.active, true);
        assert.equal(session.cards.length, 3);

        // 3. Player picks card 1
        const draftOutcome = selectDraftCard(session, 0, 1500);
        assert.equal(draftOutcome.success, true);
        applyTarotBlessing(player.tarotState, draftOutcome.card.id, 1500);

        assert.equal(hasTarotBlessing(player.tarotState, draftOutcome.card.id), true);

        // 4. Combined stats correctly blend the motor upgrade and the drafted blessing
        const stats = calculateCombinedEconomyStats(player.upgrades, player.tarotState);
        assert.equal(Number.isFinite(stats.speed), true);
        assert.ok(stats.speed >= BASE_PLAYER_STATS.speed);
    });

    it('deals unique tarot cards without crashing even when dealing across multiple checkpoints', () => {
        const dealtCardIds = new Set();
        for (let cp = 2; cp <= 10; cp += 2) {
            const cards = dealTarotCards({ seedOrRng: cp * 42, count: 3 });
            assert.equal(cards.length, 3);
            cards.forEach((c) => dealtCardIds.add(c.id));
        }
        assert.ok(dealtCardIds.size >= 3);
    });
});
