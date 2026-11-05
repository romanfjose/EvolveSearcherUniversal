/**
 * Bulletproof Economy & Shop Transaction Guard
 * (`shared/economy-integrity-guard.js`)
 *
 * Enforces Helmet 02 ("The RTS Flight Engineer") Economy Integrity Directives:
 *   1. Zero undefined/NaN coin corruption: Sanitizes any raw input (strings, floats, null,
 *      undefined, objects, Infinity) into a clean, finite integer coin count.
 *   2. Atomic and safe balance mutations: Prevents balance underflow, silently clamping or
 *      safely rejecting overdrafts while returning transparent transaction receipts.
 *   3. Subsystem Reward Normalization: Transparently bridges disparate game events
 *      (e.g., river hazards returning `coinsEarned` vs `earnedCoins`, trick systems awarding
 *      `coinsAwarded`, boss drops with `value`, or dream events granting `bonusCoins`).
 *   4. Verified Shop Transactions: Fully validates purchases across catalog items, supporting
 *      both direct mouse clicks and keyboard hotkeys ([1]-[4]), checking funds, prerequisite
 *      tiers, duplicate purchases, and health bounds before state mutation.
 *
 * Zero external dependencies. Pure, deterministic, headless-safe ES module.
 */

import {
    ARMORY_UPGRADE_TREE,
    ALL_UPGRADES,
    UPGRADE_SLOTS,
    getSlotCurrentTier,
    getNextSlotUpgrade,
    canPurchaseArmoryUpgrade,
} from './upgrade-tree.js';

/**
 * Standard Shop Catalog mapping for hotkeys and standard armory/repair items.
 */
export const DEFAULT_SHOP_CATALOG = Object.freeze({
    // Hotkey [1]: Engine (Motor Mk I -> II -> III)
    '1': {
        key: '1',
        slot: UPGRADE_SLOTS.MOTOR,
        type: 'upgrade',
        name: 'Engine Upgrade',
    },
    // Hotkey [2]: Mallet (Squeaky Mallet -> Thunder Gavel -> Leviathan Breaker)
    '2': {
        key: '2',
        slot: UPGRADE_SLOTS.WEAPON,
        type: 'upgrade',
        name: 'Weapon Upgrade',
    },
    // Hotkey [3]: Hull (Hull Armor -> Riveted Ironclad -> Aegis Plating)
    '3': {
        key: '3',
        slot: UPGRADE_SLOTS.ARMOR,
        type: 'upgrade',
        name: 'Armor Upgrade',
    },
    // Hotkey [4]: Emergency Patch (+35 HP repair for 15c)
    '4': {
        key: '4',
        type: 'repair',
        name: 'Emergency Patch',
        cost: 15,
        healAmount: 35,
    },
    // Direct named items
    patch: {
        key: 'patch',
        type: 'repair',
        name: 'Emergency Patch',
        cost: 15,
        healAmount: 35,
    },
    repair: {
        key: 'repair',
        type: 'repair',
        name: 'Emergency Patch',
        cost: 15,
        healAmount: 35,
    },
});

/**
 * Defensively cleanses and sanitizes any raw value into a finite non-negative integer.
 *
 * Rejects or coerces NaN, null, undefined, strings, Infinity, and negative values.
 *
 * @param {*} value - Raw value to sanitize (e.g. from network payload, DOM input, or loot drop).
 * @param {number} [fallback=0] - Fallback finite non-negative integer if value is unrecoverable.
 * @returns {number} Guaranteed clean non-negative integer.
 */
export function sanitizeCoins(value, fallback = 0) {
    const safeFallback = (typeof fallback === 'number' && Number.isFinite(fallback) && !Number.isNaN(fallback))
        ? Math.max(0, Math.floor(fallback))
        : 0;

    if (value === null || value === undefined) {
        return safeFallback;
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value) || Number.isNaN(value)) {
            return safeFallback;
        }
        return Math.max(0, Math.floor(value));
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return safeFallback;
        const num = Number(trimmed);
        if (Number.isFinite(num) && !Number.isNaN(num)) {
            return Math.max(0, Math.floor(num));
        }
        return safeFallback;
    }

    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }

    // Objects, arrays, functions, symbols
    return safeFallback;
}

/**
 * Safely applies an integer coin delta to an existing balance.
 *
 * @param {*} currentCoins - Existing player coins.
 * @param {*} delta - Coin change (+gain or -cost).
 * @param {object} [options]
 * @param {boolean} [options.allowNegative=false] - Whether negative resulting balance is permitted.
 * @param {number} [options.minBalance=0] - Hard floor limit on coin balance.
 * @param {number} [options.maxBalance=9999999] - Hard ceiling cap on coin balance.
 * @returns {{
 *   success: boolean,
 *   previousCoins: number,
 *   newCoins: number,
 *   deltaApplied: number,
 *   requestedDelta: number,
 *   clamped: boolean,
 *   reason: string|null
 * }}
 */
export function applySafeCoinDelta(currentCoins, delta, options = {}) {
    const {
        allowNegative = false,
        minBalance = 0,
        maxBalance = 9999999,
    } = options;

    const safeCurrent = sanitizeCoins(currentCoins);

    // Delta can be positive or negative, but must be finite number
    let safeDelta = 0;
    if (typeof delta === 'number' && Number.isFinite(delta) && !Number.isNaN(delta)) {
        safeDelta = Math.trunc(delta);
    } else if (typeof delta === 'string') {
        const parsed = Number(delta.trim());
        if (Number.isFinite(parsed) && !Number.isNaN(parsed)) {
            safeDelta = Math.trunc(parsed);
        }
    }

    const unconstrained = safeCurrent + safeDelta;
    const floor = allowNegative ? -Infinity : Math.max(0, Math.floor(minBalance));
    const ceiling = Math.max(floor, Math.floor(maxBalance));

    // If spending more than available and negative balances are forbidden
    if (!allowNegative && unconstrained < floor) {
        return {
            success: false,
            previousCoins: safeCurrent,
            newCoins: safeCurrent,
            deltaApplied: 0,
            requestedDelta: safeDelta,
            clamped: true,
            reason: 'insufficient-coins',
        };
    }

    const clampedCoins = Math.min(ceiling, Math.max(floor, unconstrained));
    const deltaApplied = clampedCoins - safeCurrent;

    return {
        success: true,
        previousCoins: safeCurrent,
        newCoins: clampedCoins,
        deltaApplied,
        requestedDelta: safeDelta,
        clamped: clampedCoins !== unconstrained,
        reason: null,
    };
}

/**
 * Normalizes disparate coin reward payloads from various game subsystems.
 *
 * Handles variations across subsystems:
 *   - river hazards: `payload.coinsEarned` or `payload.earnedCoins`
 *   - trick system: `payload.coinsEarned` or `payload.coinsAwarded`
 *   - kraken boss / crates: `payload.value` or `payload.totalCoins`
 *   - dream events: `payload.bonusCoins` or `payload.awardedCoins`
 *   - general: `payload.coins`, `payload.amount`, `payload.gold`
 *   - optional multiplier: `payload.coinMultiplier` or `payload.multiplier`
 *
 * @param {*} payload - The raw payload or number passed from a game event.
 * @returns {{
 *   coinsEarned: number,
 *   rawCoins: number,
 *   multiplier: number,
 *   sourceProperty: string|null,
 *   valid: boolean
 * }}
 */
export function normalizeCoinRewardPayload(payload) {
    if (payload === null || payload === undefined) {
        return {
            coinsEarned: 0,
            rawCoins: 0,
            multiplier: 1.0,
            sourceProperty: null,
            valid: false,
        };
    }

    // Direct numeric reward
    if (typeof payload === 'number') {
        const safe = sanitizeCoins(payload);
        return {
            coinsEarned: safe,
            rawCoins: safe,
            multiplier: 1.0,
            sourceProperty: 'numeric_literal',
            valid: Number.isFinite(payload) && !Number.isNaN(payload) && payload >= 0,
        };
    }

    if (typeof payload !== 'object') {
        return {
            coinsEarned: 0,
            rawCoins: 0,
            multiplier: 1.0,
            sourceProperty: null,
            valid: false,
        };
    }

    // Multiplier extraction
    let multiplier = 1.0;
    const rawMult = payload.coinMultiplier ?? payload.multiplier ?? payload.bonusMultiplier;
    if (typeof rawMult === 'number' && Number.isFinite(rawMult) && !Number.isNaN(rawMult) && rawMult > 0) {
        multiplier = rawMult;
    }

    // Priority list of common coin fields across DontSinkDontDie modules
    const candidateKeys = [
        'coinsEarned',
        'earnedCoins',
        'coinsAwarded',
        'awardedCoins',
        'coinsBonus',
        'bonusCoins',
        'totalCoins',
        'coins',
        'value',
        'amount',
        'gold',
    ];

    let sourceProperty = null;
    let foundValue = null;

    for (const key of candidateKeys) {
        if (payload[key] !== undefined && payload[key] !== null) {
            sourceProperty = key;
            foundValue = payload[key];
            break;
        }
    }

    if (sourceProperty === null) {
        return {
            coinsEarned: 0,
            rawCoins: 0,
            multiplier,
            sourceProperty: null,
            valid: false,
        };
    }

    const rawCoins = sanitizeCoins(foundValue);
    const finalCoins = Math.floor(rawCoins * multiplier);

    return {
        coinsEarned: Math.max(0, finalCoins),
        rawCoins,
        multiplier,
        sourceProperty,
        valid: rawCoins > 0 || foundValue === 0,
    };
}

/**
 * Resolves a shop item candidate from itemKey, hotkey, or catalog entry.
 *
 * @param {string|number} itemKeyOrHotkey
 * @param {object} playerStats
 * @param {object} catalog
 * @returns {object|null} Candidate resolution with action type.
 */
function resolveShopItem(itemKeyOrHotkey, playerStats, catalog) {
    if (!itemKeyOrHotkey) return null;

    const rawStr = String(itemKeyOrHotkey).trim();
    const keyLower = rawStr.toLowerCase();

    // 1. Direct Catalog Match
    const catalogItem = catalog[rawStr] || catalog[keyLower];
    if (catalogItem) {
        if (catalogItem.type === 'upgrade' && catalogItem.slot) {
            const nextItem = getNextSlotUpgrade(playerStats.upgrades, catalogItem.slot);
            return {
                resolvedType: 'upgrade',
                slot: catalogItem.slot,
                item: nextItem,
                isMaxed: !nextItem,
                cost: nextItem ? nextItem.cost : 0,
                name: nextItem ? nextItem.name : `${catalogItem.name} (Maxed)`,
                inputKey: rawStr,
            };
        }
        if (catalogItem.type === 'repair') {
            return {
                resolvedType: 'repair',
                slot: 'patch',
                item: catalogItem,
                isMaxed: false,
                cost: catalogItem.cost ?? 15,
                healAmount: catalogItem.healAmount ?? 35,
                name: catalogItem.name || 'Emergency Patch',
                inputKey: rawStr,
            };
        }
        return {
            resolvedType: catalogItem.type || 'item',
            slot: catalogItem.slot || null,
            item: catalogItem,
            isMaxed: false,
            cost: catalogItem.cost ?? 0,
            name: catalogItem.name || rawStr,
            inputKey: rawStr,
        };
    }

    // 2. Direct Upgrade ID or legacy type match from armory tree (e.g., 'motor_1', 'motor_mk2')
    const upgradeItem = ALL_UPGRADES[rawStr] || ALL_UPGRADES[keyLower];
    if (upgradeItem) {
        return {
            resolvedType: 'upgrade',
            slot: upgradeItem.slot,
            item: upgradeItem,
            isMaxed: false,
            cost: upgradeItem.cost,
            name: upgradeItem.name,
            inputKey: rawStr,
        };
    }

    // 3. Slot match ('motor', 'weapon', 'armor')
    if (Object.values(UPGRADE_SLOTS).includes(keyLower)) {
        const nextItem = getNextSlotUpgrade(playerStats.upgrades, keyLower);
        return {
            resolvedType: 'upgrade',
            slot: keyLower,
            item: nextItem,
            isMaxed: !nextItem,
            cost: nextItem ? nextItem.cost : 0,
            name: nextItem ? nextItem.name : `${keyLower} (Maxed)`,
            inputKey: rawStr,
        };
    }

    return null;
}

/**
 * Executes a strictly verified shop purchase transaction.
 *
 * Supports both mouse clicks (passing itemKey) and keyboard hotkeys ([1], [2], [3], [4]).
 * Atomically verifies coin balance, item availability, prerequisite tiers, and health limits.
 * Guarantees zero NaN coin balance and produces a comprehensive audit receipt.
 *
 * @param {object} params
 * @param {object} params.playerStats - Player state ({ coins, health, maxHealth, upgrades, isDead }).
 * @param {string|number} [params.itemKey] - Item key, slot, or upgrade ID.
 * @param {string|number} [params.hotkey] - Optional hotkey ([1]-[4]).
 * @param {object} [params.catalog] - Optional custom catalog (defaults to DEFAULT_SHOP_CATALOG).
 * @param {string} [params.inputMethod] - 'hotkey' | 'mouse' | 'programmatic'.
 * @param {boolean} [params.mutatePlayer=true] - Whether to mutate playerStats in place.
 * @returns {{
 *   success: boolean,
 *   reason: string|null,
 *   itemKey: string,
 *   itemName: string|null,
 *   itemType: string|null,
 *   coinsDeducted: number,
 *   previousCoins: number,
 *   remainingCoins: number,
 *   inputMethod: string,
 *   item: object|null,
 *   healedAmount?: number
 * }}
 */
export function executeVerifiedShopPurchase({
    playerStats,
    itemKey,
    hotkey,
    catalog = DEFAULT_SHOP_CATALOG,
    inputMethod,
    mutatePlayer = true,
}) {
    if (!playerStats || typeof playerStats !== 'object') {
        return {
            success: false,
            reason: 'invalid-player-state',
            itemKey: String(itemKey || hotkey || 'unknown'),
            itemName: null,
            itemType: null,
            coinsDeducted: 0,
            previousCoins: 0,
            remainingCoins: 0,
            inputMethod: inputMethod || 'unknown',
            item: null,
        };
    }

    // Guarantee clean non-negative integer player balance
    const currentCoins = sanitizeCoins(playerStats.coins);
    playerStats.coins = currentCoins;

    if (!Array.isArray(playerStats.upgrades)) {
        playerStats.upgrades = [];
    }

    const isDead = Boolean(playerStats.isDead);
    if (isDead) {
        return {
            success: false,
            reason: 'player-is-dead',
            itemKey: String(itemKey || hotkey || 'unknown'),
            itemName: null,
            itemType: null,
            coinsDeducted: 0,
            previousCoins: currentCoins,
            remainingCoins: currentCoins,
            inputMethod: inputMethod || 'unknown',
            item: null,
        };
    }

    // Determine target key and input method
    const targetKey = hotkey !== undefined && hotkey !== null ? String(hotkey) : String(itemKey || '');
    const resolvedInputMethod = inputMethod || (hotkey !== undefined ? 'hotkey' : 'mouse');

    const resolution = resolveShopItem(targetKey, playerStats, catalog);
    if (!resolution) {
        return {
            success: false,
            reason: 'item-not-found',
            itemKey: targetKey,
            itemName: null,
            itemType: null,
            coinsDeducted: 0,
            previousCoins: currentCoins,
            remainingCoins: currentCoins,
            inputMethod: resolvedInputMethod,
            item: null,
        };
    }

    // 1. Repair / Emergency Patch handling
    if (resolution.resolvedType === 'repair') {
        const curHealth = Number.isFinite(playerStats.health) ? playerStats.health : 100;
        const maxHealth = Number.isFinite(playerStats.maxHealth) ? playerStats.maxHealth : 100;

        if (curHealth >= maxHealth) {
            return {
                success: false,
                reason: 'health-already-full',
                itemKey: targetKey,
                itemName: resolution.name,
                itemType: 'repair',
                coinsDeducted: 0,
                previousCoins: currentCoins,
                remainingCoins: currentCoins,
                inputMethod: resolvedInputMethod,
                item: resolution.item,
            };
        }

        const cost = resolution.cost;
        if (currentCoins < cost) {
            return {
                success: false,
                reason: 'insufficient-coins',
                itemKey: targetKey,
                itemName: resolution.name,
                itemType: 'repair',
                coinsDeducted: 0,
                previousCoins: currentCoins,
                remainingCoins: currentCoins,
                inputMethod: resolvedInputMethod,
                item: resolution.item,
            };
        }

        const healAmount = resolution.healAmount || 35;
        const newHealth = Math.min(maxHealth, curHealth + healAmount);
        const actualHealed = newHealth - curHealth;
        const deltaResult = applySafeCoinDelta(currentCoins, -cost);

        if (mutatePlayer) {
            playerStats.coins = deltaResult.newCoins;
            playerStats.health = newHealth;
        }

        return {
            success: true,
            reason: null,
            itemKey: targetKey,
            itemName: resolution.name,
            itemType: 'repair',
            coinsDeducted: cost,
            previousCoins: currentCoins,
            remainingCoins: deltaResult.newCoins,
            healedAmount: actualHealed,
            inputMethod: resolvedInputMethod,
            item: resolution.item,
        };
    }

    // 2. Upgrade handling
    if (resolution.resolvedType === 'upgrade') {
        if (resolution.isMaxed || !resolution.item) {
            return {
                success: false,
                reason: 'slot-already-maxed',
                itemKey: targetKey,
                itemName: resolution.name,
                itemType: 'upgrade',
                coinsDeducted: 0,
                previousCoins: currentCoins,
                remainingCoins: currentCoins,
                inputMethod: resolvedInputMethod,
                item: null,
            };
        }

        const candidateItem = resolution.item;
        const check = canPurchaseArmoryUpgrade(playerStats, candidateItem);

        if (!check.ok) {
            return {
                success: false,
                reason: check.reason,
                itemKey: targetKey,
                itemName: candidateItem.name,
                itemType: 'upgrade',
                coinsDeducted: 0,
                previousCoins: currentCoins,
                remainingCoins: currentCoins,
                inputMethod: resolvedInputMethod,
                item: candidateItem,
            };
        }

        const cost = candidateItem.cost;
        const deltaResult = applySafeCoinDelta(currentCoins, -cost);

        if (mutatePlayer) {
            // Replace existing lower tiers in same slot if present
            const slot = candidateItem.slot;
            playerStats.upgrades = playerStats.upgrades.filter((u) => {
                const existing = ALL_UPGRADES[u];
                return existing ? existing.slot !== slot : true;
            });
            playerStats.upgrades.push(candidateItem.id);
            playerStats.coins = deltaResult.newCoins;
        }

        return {
            success: true,
            reason: null,
            itemKey: targetKey,
            itemName: candidateItem.name,
            itemType: 'upgrade',
            coinsDeducted: cost,
            previousCoins: currentCoins,
            remainingCoins: deltaResult.newCoins,
            inputMethod: resolvedInputMethod,
            item: candidateItem,
        };
    }

    // 3. Generic shop item fallback
    const cost = resolution.cost;
    if (currentCoins < cost) {
        return {
            success: false,
            reason: 'insufficient-coins',
            itemKey: targetKey,
            itemName: resolution.name,
            itemType: resolution.resolvedType,
            coinsDeducted: 0,
            previousCoins: currentCoins,
            remainingCoins: currentCoins,
            inputMethod: resolvedInputMethod,
            item: resolution.item,
        };
    }

    const deltaResult = applySafeCoinDelta(currentCoins, -cost);
    if (mutatePlayer) {
        playerStats.coins = deltaResult.newCoins;
    }

    return {
        success: true,
        reason: null,
        itemKey: targetKey,
        itemName: resolution.name,
        itemType: resolution.resolvedType,
        coinsDeducted: cost,
        previousCoins: currentCoins,
        remainingCoins: deltaResult.newCoins,
        inputMethod: resolvedInputMethod,
        item: resolution.item,
    };
}
