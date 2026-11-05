/**
 * Don't Sink, Don't Die — Economy & Checkpoint Draft Chaos Breaker
 * (Helmet 03 — "Where's the Bathroom?" Adversarial Saboteur)
 *
 * Attacks the interaction between the 3-Tier Harbor Armory (shared/upgrade-tree.js)
 * and Checkpoint Dream Tarot Draft (shared/dream-tarot.js).
 *
 * Invariants Enforced:
 * 1. Double-purchasing upgrades in the same millisecond or frame tick is strictly rejected (idempotency/lock).
 * 2. Buying with 0, NaN, negative, Infinity, or malformed coin values fails cleanly without state corruption.
 * 3. Stacking all 12 Tarot blessings simultaneously (including Glass Cannon, Heavy Timber, Midas Oar, Thunder Mallet)
 *    evaluates without divide-by-zero, NaN stats, or negative maxHealth/speed floors.
 * 4. Stat multipliers are clamped against extreme underflow or runaway overflow.
 *
 * Zero external dependencies. Pure, deterministic ES module.
 */

import {
    UPGRADE_SLOTS,
    BASE_PLAYER_STATS,
    ARMORY_UPGRADE_TREE,
    ALL_UPGRADES,
    UPGRADE_LOOKUP_BY_TYPE,
    getSlotCurrentTier,
    getNextSlotUpgrade,
    calculateCumulativeStats,
    canPurchaseArmoryUpgrade,
} from './upgrade-tree.js';

import {
    TAROT_CARD_IDS,
    TAROT_CARDS,
    createPlayerTarotState,
    applyTarotBlessing,
    hasTarotBlessing,
} from './dream-tarot.js';

// Hard minimum physical safety bounds
export const ECONOMY_SAFETY_BOUNDS = {
    MIN_SPEED: 1.0,
    MAX_SPEED: 120.0,
    MIN_HEALTH: 10,
    MAX_HEALTH: 5000,
    MIN_DPS: 1.0,
    MAX_DPS: 2000.0,
    MIN_TURN_RATE: 0.2,
    MAX_TURN_RATE: 10.0,
};

/**
 * Extended Tarot Blessing Definitions:
 * 6 base blessings from dream-tarot.js + 6 additional chaos arcana blessings
 * specifically targeted by stress/adversarial fuzz tests.
 */
export const EXTENDED_TAROT_IDS = {
    ...TAROT_CARD_IDS,
    GLASS_CANNON: 'glass-cannon',
    HEAVY_TIMBER: 'heavy-timber',
    MIDAS_OAR: 'midas-oar',
    THUNDER_MALLET: 'thunder-mallet',
    ABYSSAL_SIPHON: 'abyssal-siphon',
    TEMPEST_SAIL: 'tempest-sail',
};

export const ALL_12_TAROT_KEYS = [
    TAROT_CARD_IDS.CAFFEINATED_OARS,
    TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY,
    TAROT_CARD_IDS.HEAVY_POCKET_ANVIL,
    TAROT_CARD_IDS.SQUEAKY_OVERDRIVE,
    TAROT_CARD_IDS.PLANK_MAGNETISM,
    TAROT_CARD_IDS.REVERSE_PSYCHOLOGY,
    EXTENDED_TAROT_IDS.GLASS_CANNON,
    EXTENDED_TAROT_IDS.HEAVY_TIMBER,
    EXTENDED_TAROT_IDS.MIDAS_OAR,
    EXTENDED_TAROT_IDS.THUNDER_MALLET,
    EXTENDED_TAROT_IDS.ABYSSAL_SIPHON,
    EXTENDED_TAROT_IDS.TEMPEST_SAIL,
];

export const CHAOS_TAROT_DEFINITIONS = {
    ...TAROT_CARDS,
    [EXTENDED_TAROT_IDS.GLASS_CANNON]: {
        id: EXTENDED_TAROT_IDS.GLASS_CANNON,
        name: 'Glass Cannon',
        tagline: 'High fragility, hyper damage',
        arcana: 'Death',
        romanNumeral: 'XIII',
        icon: '💀',
        description: 'Health multiplier halved (0.5x), but weapon damage tripled (3.0x).',
        statModifiers: {
            maxHealthMultiplier: 0.5,
            dpsMultiplier: 3.0,
            speedMultiplier: 1.0,
            turnRateMultiplier: 1.0,
        },
    },
    [EXTENDED_TAROT_IDS.HEAVY_TIMBER]: {
        id: EXTENDED_TAROT_IDS.HEAVY_TIMBER,
        name: 'Heavy Timber',
        tagline: 'Titan hull ballast',
        arcana: 'The Hierophant',
        romanNumeral: 'V',
        icon: '🪵',
        description: '+80 max health, but -25% craft speed and turn rate.',
        statModifiers: {
            maxHealthDelta: 80,
            speedMultiplier: 0.75,
            turnRateMultiplier: 0.75,
            dpsMultiplier: 1.0,
        },
    },
    [EXTENDED_TAROT_IDS.MIDAS_OAR]: {
        id: EXTENDED_TAROT_IDS.MIDAS_OAR,
        name: 'Midas Oar',
        tagline: 'Liquid gold wake',
        arcana: 'The Empress',
        romanNumeral: 'III',
        icon: '👑',
        description: 'Paddling generates +1 coin every 20 strokes; +10% coin pickups.',
        statModifiers: {
            coinMultiplier: 1.1,
            speedMultiplier: 1.05,
            dpsMultiplier: 1.0,
            maxHealthMultiplier: 1.0,
        },
    },
    [EXTENDED_TAROT_IDS.THUNDER_MALLET]: {
        id: EXTENDED_TAROT_IDS.THUNDER_MALLET,
        name: 'Thunder Mallet',
        tagline: 'Charged river wrath',
        arcana: 'The Emperor',
        romanNumeral: 'IV',
        icon: '⚡',
        description: '+40% weapon DPS and arcing electrical discharge shocks.',
        statModifiers: {
            dpsMultiplier: 1.4,
            speedMultiplier: 1.0,
            maxHealthMultiplier: 1.0,
        },
    },
    [EXTENDED_TAROT_IDS.ABYSSAL_SIPHON]: {
        id: EXTENDED_TAROT_IDS.ABYSSAL_SIPHON,
        name: 'Abyssal Siphon',
        tagline: 'Vampiric undertow',
        arcana: 'The Moon',
        romanNumeral: 'XVIII',
        icon: '🌑',
        description: 'Converts 20% of dealt melee damage into hull self-repair.',
        statModifiers: {
            lifeStealRatio: 0.2,
            maxHealthMultiplier: 1.0,
            dpsMultiplier: 1.0,
            speedMultiplier: 1.0,
        },
    },
    [EXTENDED_TAROT_IDS.TEMPEST_SAIL]: {
        id: EXTENDED_TAROT_IDS.TEMPEST_SAIL,
        name: 'Tempest Sail',
        tagline: 'Storm-catcher wings',
        arcana: 'The Star',
        romanNumeral: 'XVII',
        icon: '⛵',
        description: '+30% speed and +20% turn agility through heavy rapids.',
        statModifiers: {
            speedMultiplier: 1.3,
            turnRateMultiplier: 1.2,
            maxHealthMultiplier: 1.0,
            dpsMultiplier: 1.0,
        },
    },
};

/**
 * Validates coin amounts defensively against invalid or malicious inputs.
 */
export function validateCoins(coins) {
    if (typeof coins !== 'number') return { valid: false, reason: 'coins-not-a-number' };
    if (!Number.isFinite(coins)) return { valid: false, reason: 'coins-not-finite' };
    if (Number.isNaN(coins)) return { valid: false, reason: 'coins-nan' };
    if (coins < 0) return { valid: false, reason: 'coins-negative' };
    return { valid: true, value: coins };
}

/**
 * Creates an economy transaction manager with concurrency locking and replay logs.
 */
export function createEconomyTransactionManager() {
    const transactionLog = [];
    const recentPurchases = new Map(); // key: `${playerId}:${upgradeId}` -> timestampMs
    const activeLocks = new Set(); // playerId lock during transaction execution

    return {
        transactionLog,
        recentPurchases,
        activeLocks,

        /**
         * Executes an armory purchase transaction with atomic locking, idempotency guards,
         * and coin sanity verification.
         */
        executePurchase(player, upgradeIdOrItem, { timestampMs = Date.now(), cooldownMs = 50 } = {}) {
            if (!player || typeof player !== 'object') {
                return { success: false, reason: 'invalid-player' };
            }

            const playerId = player.id || 'p_unknown';

            // 1. Concurrency Mutex Lock check
            if (activeLocks.has(playerId)) {
                return {
                    success: false,
                    reason: 'concurrent-transaction-locked',
                    playerId,
                };
            }

            // Acquire lock
            activeLocks.add(playerId);

            try {
                // 2. Validate player coins
                const coinCheck = validateCoins(player.coins);
                if (!coinCheck.valid) {
                    return {
                        success: false,
                        reason: `invalid-coins:${coinCheck.reason}`,
                        playerId,
                    };
                }

                // 3. Resolve item definition
                const item = typeof upgradeIdOrItem === 'string'
                    ? (ALL_UPGRADES[upgradeIdOrItem] || UPGRADE_LOOKUP_BY_TYPE[upgradeIdOrItem])
                    : upgradeIdOrItem;

                if (!item) {
                    return { success: false, reason: 'unknown-upgrade', playerId };
                }

                // 4. Same-millisecond double-purchase deduplication guard
                const purchaseKey = `${playerId}:${item.id}`;
                const lastPurchasedAt = recentPurchases.get(purchaseKey);
                if (lastPurchasedAt !== undefined && (timestampMs - lastPurchasedAt) < cooldownMs) {
                    return {
                        success: false,
                        reason: 'double-purchase-rate-limit',
                        purchaseKey,
                        elapsedMs: timestampMs - lastPurchasedAt,
                    };
                }

                // 5. Standard canPurchase armory check
                const check = canPurchaseArmoryUpgrade(player, item);
                if (!check.ok) {
                    return {
                        success: false,
                        reason: check.reason,
                        playerId,
                    };
                }

                // 6. Mutate player state atomically
                if (!Array.isArray(player.upgrades)) {
                    player.upgrades = [];
                }

                // Remove lower tiers in same slot if any
                const slot = item.slot;
                player.upgrades = player.upgrades.filter((u) => {
                    const existing = ALL_UPGRADES[u] || UPGRADE_LOOKUP_BY_TYPE[u];
                    return existing ? existing.slot !== slot : true;
                });

                player.upgrades.push(item.id);
                player.coins -= item.cost;

                // Ensure coins didn't underflow to negative or NaN
                if (!Number.isFinite(player.coins) || player.coins < 0) {
                    player.coins = Math.max(0, Math.floor(player.coins || 0));
                }

                recentPurchases.set(purchaseKey, timestampMs);

                const receipt = {
                    success: true,
                    playerId,
                    upgradeId: item.id,
                    slot: item.slot,
                    tier: item.tier,
                    cost: item.cost,
                    remainingCoins: player.coins,
                    timestampMs,
                };

                transactionLog.push(receipt);
                return receipt;
            } finally {
                // Release lock
                activeLocks.delete(playerId);
            }
        },
    };
}

/**
 * Computes combined stats across Armory Upgrades and Stacked Tarot Blessings.
 * Enforces hard floor limits, prevents NaN or divide-by-zero, and guarantees
 * sane raft physics even when extreme blessing combos like Glass Cannon + Heavy Timber
 * are stacked simultaneously.
 *
 * @param {Array<string>} upgrades - Player armory upgrade keys (e.g. ['motor_3', 'weapon_3', 'armor_3'])
 * @param {object|Array} tarotBlessings - Player tarot state or array of blessing card IDs
 * @param {object} [baseStats=BASE_PLAYER_STATS] - Base craft statistics
 * @returns {object} Calculated combined stats with guarantees
 */
export function calculateCombinedEconomyStats(upgrades = [], tarotBlessings = {}, baseStats = BASE_PLAYER_STATS) {
    // 1. Armory Upgrades Base Calculation
    const armoryStats = calculateCumulativeStats(upgrades);

    // Initial values starting from armory cumulative stats
    let speed = Number.isFinite(armoryStats.speed) ? armoryStats.speed : (baseStats.speed || 15.0);
    let turnRate = Number.isFinite(armoryStats.turnRate) ? armoryStats.turnRate : (baseStats.turnRate || 2.2);
    let dps = Number.isFinite(armoryStats.dps) ? armoryStats.dps : (baseStats.dps || 10.0);
    let maxHp = Number.isFinite(armoryStats.maxHp) ? armoryStats.maxHp : (baseStats.maxHp || 100);

    // Multipliers and deltas from Tarot Blessings
    let speedMult = 1.0;
    let turnRateMult = 1.0;
    let dpsMult = 1.0;
    let maxHpMult = 1.0;
    let maxHpDelta = 0;
    let coinMult = 1.0;
    let lifeSteal = 0.0;

    // Normalize blessings into an iterable set of card keys
    let blessingKeys = [];
    if (Array.isArray(tarotBlessings)) {
        blessingKeys = tarotBlessings;
    } else if (tarotBlessings && typeof tarotBlessings === 'object') {
        if (tarotBlessings.blessings && typeof tarotBlessings.blessings === 'object') {
            blessingKeys = Object.keys(tarotBlessings.blessings);
        } else {
            blessingKeys = Object.keys(tarotBlessings);
        }
    }

    // 2. Iterate all active tarot blessings
    for (const cardId of blessingKeys) {
        const def = CHAOS_TAROT_DEFINITIONS[cardId] || TAROT_CARDS[cardId];
        if (!def) continue;

        // Core blessings
        if (cardId === TAROT_CARD_IDS.CAFFEINATED_OARS) {
            speedMult *= (def.thrustMultiplier || 1.25);
        }

        // Extended / Chaos blessings
        if (def.statModifiers) {
            const mods = def.statModifiers;
            if (Number.isFinite(mods.speedMultiplier) && mods.speedMultiplier > 0) {
                speedMult *= mods.speedMultiplier;
            }
            if (Number.isFinite(mods.turnRateMultiplier) && mods.turnRateMultiplier > 0) {
                turnRateMult *= mods.turnRateMultiplier;
            }
            if (Number.isFinite(mods.dpsMultiplier) && mods.dpsMultiplier > 0) {
                dpsMult *= mods.dpsMultiplier;
            }
            if (Number.isFinite(mods.maxHealthMultiplier) && mods.maxHealthMultiplier > 0) {
                maxHpMult *= mods.maxHealthMultiplier;
            }
            if (Number.isFinite(mods.maxHealthDelta)) {
                maxHpDelta += mods.maxHealthDelta;
            }
            if (Number.isFinite(mods.coinMultiplier)) {
                coinMult *= mods.coinMultiplier;
            }
            if (Number.isFinite(mods.lifeStealRatio)) {
                lifeSteal += mods.lifeStealRatio;
            }
        }
    }

    // 3. Apply Multipliers and Deltas with Zero-Division & NaN guards
    // Guard multipliers against non-finite or negative values
    speedMult = (Number.isFinite(speedMult) && speedMult > 0) ? speedMult : 1.0;
    turnRateMult = (Number.isFinite(turnRateMult) && turnRateMult > 0) ? turnRateMult : 1.0;
    dpsMult = (Number.isFinite(dpsMult) && dpsMult > 0) ? dpsMult : 1.0;
    maxHpMult = (Number.isFinite(maxHpMult) && maxHpMult > 0) ? maxHpMult : 1.0;

    speed = speed * speedMult;
    turnRate = turnRate * turnRateMult;
    dps = dps * dpsMult;
    maxHp = (maxHp + maxHpDelta) * maxHpMult;

    // 4. Clamping and Physical Floor/Ceiling Invariants
    speed = Math.max(ECONOMY_SAFETY_BOUNDS.MIN_SPEED, Math.min(ECONOMY_SAFETY_BOUNDS.MAX_SPEED, speed));
    turnRate = Math.max(ECONOMY_SAFETY_BOUNDS.MIN_TURN_RATE, Math.min(ECONOMY_SAFETY_BOUNDS.MAX_TURN_RATE, turnRate));
    dps = Math.max(ECONOMY_SAFETY_BOUNDS.MIN_DPS, Math.min(ECONOMY_SAFETY_BOUNDS.MAX_DPS, dps));
    maxHp = Math.max(ECONOMY_SAFETY_BOUNDS.MIN_HEALTH, Math.min(ECONOMY_SAFETY_BOUNDS.MAX_HEALTH, Math.round(maxHp)));

    // Ensure all returned numbers are 100% finite and clean
    return {
        speed: Number(speed.toFixed(2)),
        turnRate: Number(turnRate.toFixed(2)),
        dps: Number(dps.toFixed(2)),
        maxHp: Math.round(maxHp),
        multipliers: {
            speedMult: Number(speedMult.toFixed(3)),
            turnRateMult: Number(turnRateMult.toFixed(3)),
            dpsMult: Number(dpsMult.toFixed(3)),
            maxHpMult: Number(maxHpMult.toFixed(3)),
            coinMult: Number(coinMult.toFixed(3)),
            lifeSteal: Number(lifeSteal.toFixed(2)),
        },
        blessingCount: blessingKeys.length,
    };
}

/**
 * Fuzzes purchasing an armory upgrade with corrupt coin inputs.
 * Verifies that 0, NaN, negative, string, or undefined coins never succeed
 * and never corrupt player state.
 */
export function fuzzArmoryCoinPurchase(player, upgradeId, coinValue) {
    const originalPlayer = {
        id: player?.id,
        upgrades: [...(player?.upgrades || [])],
        coins: player?.coins,
    };

    // Inject mutated coin value
    const testPlayer = {
        ...originalPlayer,
        coins: coinValue,
    };

    const manager = createEconomyTransactionManager();
    const result = manager.executePurchase(testPlayer, upgradeId);

    // Verify rejection
    const rejectedProperly = !result.success;

    return {
        coinValue,
        rejectedProperly,
        result,
        playerStatePreserved: Array.isArray(testPlayer.upgrades) && testPlayer.upgrades.length === originalPlayer.upgrades.length,
    };
}

/**
 * Simulates a concurrent purchasing frenzy in the exact same millisecond.
 * Attempts to purchase the same upgrade multiple times concurrently.
 */
export function simulateSameMillisecondPurchaseStorm(player, upgradeId, count = 10, timestampMs = 1000) {
    const manager = createEconomyTransactionManager();
    const testPlayer = {
        id: player.id || 'p1',
        coins: player.coins !== undefined ? player.coins : 100,
        upgrades: [...(player.upgrades || [])],
    };

    const initialCoins = testPlayer.coins;
    const results = [];

    for (let i = 0; i < count; i++) {
        const res = manager.executePurchase(testPlayer, upgradeId, { timestampMs });
        results.push(res);
    }

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    return {
        totalAttempts: count,
        successCount: successes.length,
        failureCount: failures.length,
        initialCoins,
        finalCoins: testPlayer.coins,
        finalUpgrades: testPlayer.upgrades,
        idempotencyPassed: successes.length === 1 && failures.length === count - 1,
    };
}
