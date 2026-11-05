/**
 * Don't Sink, Don't Die — Co-Op Crew Treasury & Shared Coin Dividend System
 * (`shared/coop-crew-treasury.js`)
 *
 * Implements cooperative coin mechanics for team survival:
 *   1. `distributeCrewCoinPickup`: When teammates stay within cohesion radius (default 25m),
 *      every coin pickup grants the collecting player their full base coins plus awards a +25%
 *      cohesion dividend bonus to all alive nearby crewmates.
 *   2. `poolCrewCoinsForPurchase`: Allows collective purchasing at Harbor City armories or
 *      sanctuary docks by pooling coins across active crewmates fairly, deducting funds, and
 *      returning atomic transaction receipts.
 *   3. Bulletproof arithmetic: Enforces non-negative finite integer invariants, prevents NaN,
 *      underflow, or float drift across all transactions.
 *
 * Zero external dependencies. Pure, deterministic, headless-safe ES module.
 */

// Default configuration constants
export const COOP_TREASURY_CONFIG = Object.freeze({
    DEFAULT_COHESION_RADIUS: 25.0, // meters
    COHESION_DIVIDEND_RATE: 0.25,   // +25% bonus to in-range crewmates
    MIN_DIVIDEND_COINS: 1,         // Minimum dividend awarded if base coins > 0
});

/**
 * Sanitizes and normalizes coin numbers to non-negative finite integers.
 * Defends against NaN, null, undefined, strings, Infinity, and floats.
 *
 * @param {*} value - Raw coin value
 * @param {number} [fallback=0] - Fallback integer
 * @returns {number} Non-negative safe integer
 */
export function sanitizeCoins(value, fallback = 0) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && !Number.isNaN(parsed) && parsed > 0) {
            return Math.floor(parsed);
        }
        return Math.max(0, Math.floor(fallback));
    }
    return Math.max(0, Math.floor(value));
}

/**
 * Calculates Euclidean distance between two player entities or position vectors.
 * Handles { position: { x, y, z } }, { x, y, z }, or 2D { x, z } vectors.
 *
 * @param {object} p1 - First entity or position
 * @param {object} p2 - Second entity or position
 * @returns {number} Distance in meters
 */
export function calculatePlayerDistance(p1, p2) {
    if (!p1 || !p2) return Infinity;

    const pos1 = p1.position || p1;
    const pos2 = p2.position || p2;

    const x1 = Number.isFinite(pos1.x) ? pos1.x : 0;
    const z1 = Number.isFinite(pos1.z) ? pos1.z : 0;
    const y1 = Number.isFinite(pos1.y) ? pos1.y : 0;

    const x2 = Number.isFinite(pos2.x) ? pos2.x : 0;
    const z2 = Number.isFinite(pos2.z) ? pos2.z : 0;
    const y2 = Number.isFinite(pos2.y) ? pos2.y : 0;

    const dx = x1 - x2;
    const dy = y1 - y2;
    const dz = z1 - z2;

    return Math.hypot(dx, dy, dz);
}

/**
 * Normalizes an array or object-map of crew players into a standard array.
 *
 * @param {Array|object} crewPlayers - Array or record map of player objects
 * @returns {Array<object>} Array of player objects
 */
export function normalizeCrewPlayers(crewPlayers) {
    if (!crewPlayers) return [];
    if (Array.isArray(crewPlayers)) return crewPlayers.filter(Boolean);
    if (typeof crewPlayers === 'object') return Object.values(crewPlayers).filter(Boolean);
    return [];
}

/**
 * Evaluates whether a crewmate is eligible to receive cohesion dividends.
 *
 * @param {object} player - Player object
 * @returns {boolean} True if player is active and alive
 */
export function isEligibleCrewmate(player) {
    if (!player || typeof player !== 'object') return false;
    if (player.isDead || player.health <= 0) return false;
    return true;
}

/**
 * Distributes coins from a pickup event among the collecting player and nearby crewmates.
 *
 * When teammates stay within cohesionBonusRadius (default 25m), every coin pickup awards
 * the collecting player their full base coins, and grants a +25% Co-Op Cohesion Dividend
 * to each alive crewmate in range.
 *
 * @param {object} options
 * @param {string} options.pickerId - ID of the player who collected the pickup
 * @param {number} options.baseCoins - Base coin value of the collected item
 * @param {Array<object>|Record<string, object>} options.crewPlayers - All players in the match
 * @param {number} [options.cohesionBonusRadius=25.0] - Max distance in meters to receive dividend
 * @param {number} [options.dividendRate=0.25] - Bonus rate (default 0.25 = +25%)
 * @param {boolean} [options.mutate=true] - Whether to directly mutate player.coins on passed objects
 * @returns {object} Distribution summary report
 */
export function distributeCrewCoinPickup({
    pickerId,
    baseCoins = 0,
    crewPlayers = [],
    cohesionBonusRadius = COOP_TREASURY_CONFIG.DEFAULT_COHESION_RADIUS,
    dividendRate = COOP_TREASURY_CONFIG.COHESION_DIVIDEND_RATE,
    mutate = true,
} = {}) {
    const safeBaseCoins = sanitizeCoins(baseCoins);
    const radius = Number.isFinite(cohesionBonusRadius) && cohesionBonusRadius > 0
        ? cohesionBonusRadius
        : COOP_TREASURY_CONFIG.DEFAULT_COHESION_RADIUS;
    const rate = Number.isFinite(dividendRate) && dividendRate >= 0
        ? dividendRate
        : COOP_TREASURY_CONFIG.COHESION_DIVIDEND_RATE;

    const playersList = normalizeCrewPlayers(crewPlayers);
    const picker = playersList.find((p) => (p.id || p.playerId) === pickerId) || null;

    // Calculate individual dividend amount (e.g. 25% of baseCoins, minimum 1 if baseCoins > 0)
    let unitDividend = 0;
    if (safeBaseCoins > 0) {
        unitDividend = Math.max(
            COOP_TREASURY_CONFIG.MIN_DIVIDEND_COINS,
            Math.round(safeBaseCoins * rate)
        );
    }

    const dividendRecipients = [];
    let totalDividendsAwarded = 0;

    // Award picker first if picker exists and safeBaseCoins > 0
    let pickerCoinsAwarded = safeBaseCoins;
    if (picker) {
        picker.coins = sanitizeCoins(picker.coins);
        if (mutate && pickerCoinsAwarded > 0) {
            picker.coins += pickerCoinsAwarded;
        }
    }

    // Award cohesion dividends to nearby eligible crewmates
    for (const mate of playersList) {
        const mateId = mate.id || mate.playerId;
        // Skip picker (picker already got 100% of base coins)
        if (mateId === pickerId) continue;

        if (!isEligibleCrewmate(mate)) {
            continue;
        }

        const distance = picker ? calculatePlayerDistance(picker, mate) : Infinity;
        const inCohesionRange = distance <= radius;

        if (inCohesionRange && unitDividend > 0) {
            mate.coins = sanitizeCoins(mate.coins);
            if (mutate) {
                mate.coins += unitDividend;
            }
            totalDividendsAwarded += unitDividend;
            dividendRecipients.push({
                playerId: mateId,
                distance: Number(distance.toFixed(2)),
                coinsAwarded: unitDividend,
                newTotalCoins: mate.coins,
            });
        }
    }

    const grandTotalGenerated = pickerCoinsAwarded + totalDividendsAwarded;

    return {
        pickerId,
        baseCoins: safeBaseCoins,
        cohesionBonusRadius: radius,
        dividendRate: rate,
        unitDividend,
        pickerCoinsAwarded,
        pickerNewTotalCoins: picker ? picker.coins : null,
        dividendRecipients,
        totalDividendsAwarded,
        grandTotalGenerated,
    };
}

/**
 * Pools coins across crewmates to execute a joint team purchase (e.g. ship repairs, armory upgrades).
 *
 * Deducts fairly from active crew members:
 *   1. Computes total treasury across all eligible alive crewmates.
 *   2. If pooled total < cost, rejects transaction cleanly without deducting any coins.
 *   3. If pooled total >= cost, deducts proportionally/sequentially from crew balances.
 *   4. Ensures zero NaN, zero negative balances, and deterministic integer accounting.
 *
 * @param {Array<object>|Record<string, object>} crewPlayers - Crew players
 * @param {number} cost - Required purchase price in coins
 * @param {object} [options={}] - Custom pooling configuration
 * @param {boolean} [options.mutate=true] - Whether to mutate player.coins
 * @param {string} [options.priorityPlayerId=null] - Preferred player to draw from first before others
 * @returns {object} Purchase transaction receipt
 */
export function poolCrewCoinsForPurchase(crewPlayers, cost = 0, options = {}) {
    const mutate = options.mutate !== false;
    const priorityPlayerId = options.priorityPlayerId || null;
    const safeCost = sanitizeCoins(cost);

    const playersList = normalizeCrewPlayers(crewPlayers);
    const eligibleCrew = playersList.filter(isEligibleCrewmate);

    // Sanitize all balances
    for (const p of eligibleCrew) {
        p.coins = sanitizeCoins(p.coins);
    }

    const totalAvailable = eligibleCrew.reduce((sum, p) => sum + p.coins, 0);

    // If cost is 0, immediate free purchase success
    if (safeCost === 0) {
        return {
            success: true,
            cost: 0,
            totalAvailable,
            remainingTreasury: totalAvailable,
            contributions: [],
            reason: 'free-purchase',
        };
    }

    // Insufficient total crew funds
    if (totalAvailable < safeCost) {
        return {
            success: false,
            cost: safeCost,
            totalAvailable,
            shortfall: safeCost - totalAvailable,
            contributions: [],
            reason: 'insufficient-funds',
        };
    }

    // Order crew for deduction: priority player first, then highest balance to lowest
    const sortedCrew = [...eligibleCrew].sort((a, b) => {
        const idA = a.id || a.playerId;
        const idB = b.id || b.playerId;
        if (priorityPlayerId) {
            if (idA === priorityPlayerId) return -1;
            if (idB === priorityPlayerId) return 1;
        }
        return b.coins - a.coins;
    });

    let remainingNeeded = safeCost;
    const contributions = [];

    for (const player of sortedCrew) {
        if (remainingNeeded <= 0) break;
        if (player.coins <= 0) continue;

        const deduction = Math.min(player.coins, remainingNeeded);
        remainingNeeded -= deduction;

        if (mutate) {
            player.coins -= deduction;
        }

        contributions.push({
            playerId: player.id || player.playerId,
            deducted: deduction,
            remainingCoins: player.coins,
        });
    }

    const remainingTreasury = eligibleCrew.reduce((sum, p) => sum + p.coins, 0);

    return {
        success: true,
        cost: safeCost,
        totalAvailable,
        remainingTreasury,
        contributions,
        reason: 'purchase-complete',
    };
}
