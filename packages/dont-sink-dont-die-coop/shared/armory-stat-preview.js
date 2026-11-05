/**
 * Armory Upgrade Stat Preview & Hotkey Badge Formatter
 * (`shared/armory-stat-preview.js`)
 *
 * Sovereign Helmet 04 & Helmet 01 Directive:
 * - Line-of-sight stat comparisons showing clear before/after speed, hull armor,
 *   and weapon reach deltas for dockside armory decisions.
 * - Prominent [1], [2], [3], [4] keyboard badges and mouse-click affordability states.
 * - Pure, deterministic, zero-dependency ES module compliant with Shared Core layer isolation.
 */

import {
    UPGRADE_SLOTS,
    ARMORY_UPGRADE_TREE,
    ALL_UPGRADES,
    UPGRADE_LOOKUP_BY_TYPE,
    BASE_PLAYER_STATS,
    getSlotCurrentTier,
} from './upgrade-tree.js';

/**
 * Baseline physical parameters for un-upgraded watercraft & crew combat.
 */
export const BASE_ARMORY_STATS = Object.freeze({
    speed: BASE_PLAYER_STATS.speed, // 15.0 m/s max forward speed
    hullArmor: BASE_PLAYER_STATS.maxHp, // 100 max HP (armor integrity)
    reach: 4.2, // 4.2m standard melee swing arc reach
});

/**
 * Weapon tier reach extension values (meters).
 * Weapon Mk 1: +0.6m (4.8m)
 * Weapon Mk 2: +1.2m (5.4m)
 * Weapon Mk 3: +2.0m (6.2m)
 */
export const WEAPON_REACH_BONUSES = Object.freeze({
    weapon_1: 0.6,
    weapon_2: 1.2,
    weapon_3: 2.0,
    weapon: 0.6,
    weapon_mk2: 1.2,
    weapon_mk3: 2.0,
});

/**
 * Hotkey bindings mapped to upgrade slots and actions.
 */
export const ARMORY_HOTKEY_BADGES = Object.freeze({
    [UPGRADE_SLOTS.MOTOR]: { key: '1', badge: '[1]', label: 'Motor' },
    [UPGRADE_SLOTS.WEAPON]: { key: '2', badge: '[2]', label: 'Weapon' },
    [UPGRADE_SLOTS.ARMOR]: { key: '3', badge: '[3]', label: 'Armor' },
    autoEquip: { key: '4', badge: '[4]', label: 'Crew Auto-Equip' },
});

/**
 * Resolves an upgrade definition item by ID, legacy key, or item object.
 *
 * @param {string|object} itemKey
 * @returns {object|null}
 */
export function resolveUpgradeItem(itemKey) {
    if (!itemKey) return null;
    if (typeof itemKey === 'object' && itemKey.id && itemKey.slot) {
        return itemKey;
    }
    const key = String(itemKey).trim();
    return ALL_UPGRADES[key] || UPGRADE_LOOKUP_BY_TYPE[key] || null;
}

/**
 * Computes before/after speed, hull armor, and weapon reach deltas for an upgrade.
 *
 * @param {object} [currentStats] - Current player stats { speed, hullArmor (or maxHp), reach }
 * @param {string|object} itemKey - Upgrade ID, legacy type, or upgrade definition object
 * @returns {{
 *   item: object|null,
 *   speed: { before: number, after: number, delta: number, formatted: string },
 *   hullArmor: { before: number, after: number, delta: number, formatted: string },
 *   reach: { before: number, after: number, delta: number, formatted: string },
 *   hasPositiveDelta: boolean,
 *   hasNegativeDelta: boolean
 * }}
 */
export function computeUpgradeStatDiff(currentStats = {}, itemKey) {
    const item = resolveUpgradeItem(itemKey);

    const curSpeed = Number.isFinite(currentStats?.speed) ? currentStats.speed : BASE_ARMORY_STATS.speed;
    const curArmor = Number.isFinite(currentStats?.hullArmor)
        ? currentStats.hullArmor
        : Number.isFinite(currentStats?.maxHp)
        ? currentStats.maxHp
        : BASE_ARMORY_STATS.hullArmor;
    const curReach = Number.isFinite(currentStats?.reach) ? currentStats.reach : BASE_ARMORY_STATS.reach;

    if (!item) {
        return {
            item: null,
            speed: { before: curSpeed, after: curSpeed, delta: 0, formatted: '+0 m/s' },
            hullArmor: { before: curArmor, after: curArmor, delta: 0, formatted: '+0 HP' },
            reach: { before: curReach, after: curReach, delta: 0, formatted: '+0.0m' },
            hasPositiveDelta: false,
            hasNegativeDelta: false,
        };
    }

    let speedDelta = 0;
    let armorDelta = 0;
    let reachDelta = 0;

    if (item.slot === UPGRADE_SLOTS.MOTOR) {
        speedDelta = item.stats?.speedDelta || 0;
    } else if (item.slot === UPGRADE_SLOTS.ARMOR) {
        armorDelta = item.stats?.maxHpDelta || 0;
    } else if (item.slot === UPGRADE_SLOTS.WEAPON) {
        reachDelta = WEAPON_REACH_BONUSES[item.id] || WEAPON_REACH_BONUSES[item.legacyType] || 0;
    }

    const nextSpeed = Number((curSpeed + speedDelta).toFixed(2));
    const nextArmor = Math.round(curArmor + armorDelta);
    const nextReach = Number((curReach + reachDelta).toFixed(2));

    const formatDelta = (delta, unit, decimals = 0) => {
        const sign = delta > 0 ? '+' : '';
        const numStr = decimals > 0 ? delta.toFixed(decimals) : String(delta);
        return `${sign}${numStr} ${unit}`.trim();
    };

    const hasPositiveDelta = speedDelta > 0 || armorDelta > 0 || reachDelta > 0;
    const hasNegativeDelta = speedDelta < 0 || armorDelta < 0 || reachDelta < 0;

    return {
        item,
        speed: {
            before: curSpeed,
            after: nextSpeed,
            delta: speedDelta,
            formatted: formatDelta(speedDelta, 'm/s', 1),
        },
        hullArmor: {
            before: curArmor,
            after: nextArmor,
            delta: armorDelta,
            formatted: formatDelta(armorDelta, 'HP', 0),
        },
        reach: {
            before: curReach,
            after: nextReach,
            delta: reachDelta,
            formatted: formatDelta(reachDelta, 'm', 1),
        },
        hasPositiveDelta,
        hasNegativeDelta,
    };
}

/**
 * Affordability states for mouse-click and visual presentation.
 */
export const AFFORDABILITY_STATES = Object.freeze({
    AFFORDABLE: 'affordable',
    INSUFFICIENT_COINS: 'insufficient_coins',
    OWNED: 'owned',
    LOCKED: 'locked',
    UNAVAILABLE: 'unavailable',
});

/**
 * Formats a rich card view model for dockside Armory rendering.
 *
 * @param {string|object} itemKey - Upgrade identifier or item definition
 * @param {number} playerCoins - Current player coin balance
 * @param {Array<string>} [ownedUpgrades=[]] - Array of owned upgrade IDs or legacy keys
 * @param {object} [currentStats={}] - Optional current stats override
 * @returns {object} Formatted View Model
 */
export function formatArmoryCardViewModel(itemKey, playerCoins = 0, ownedUpgrades = [], currentStats = {}) {
    const item = resolveUpgradeItem(itemKey);
    const safeCoins = Math.max(0, Number.isFinite(playerCoins) ? Math.floor(playerCoins) : 0);
    const safeOwned = Array.isArray(ownedUpgrades) ? ownedUpgrades : [];

    if (!item) {
        return {
            valid: false,
            item: null,
            state: AFFORDABILITY_STATES.UNAVAILABLE,
            badge: null,
            hotkey: null,
            canClickToBuy: false,
            buttonText: 'Unavailable',
            buttonCssClass: 'armory-btn-unavailable',
            statDiff: computeUpgradeStatDiff(currentStats, null),
        };
    }

    const slot = item.slot;
    const currentTier = getSlotCurrentTier(safeOwned, slot);
    const isOwned = item.tier <= currentTier;
    const isNextAvailable = item.tier === currentTier + 1;
    const isTierLocked = item.tier > currentTier + 1;

    let state = AFFORDABILITY_STATES.UNAVAILABLE;
    let canClickToBuy = false;
    let buttonText = 'Buy';
    let buttonCssClass = 'armory-btn-buy';
    let clickStateBadge = 'READY';

    if (isOwned) {
        state = AFFORDABILITY_STATES.OWNED;
        canClickToBuy = false;
        buttonText = 'Owned';
        buttonCssClass = 'armory-btn-owned';
        clickStateBadge = 'OWNED';
    } else if (isTierLocked) {
        state = AFFORDABILITY_STATES.LOCKED;
        canClickToBuy = false;
        buttonText = `Requires T${item.tier - 1}`;
        buttonCssClass = 'armory-btn-locked';
        clickStateBadge = 'LOCKED';
    } else if (safeCoins < item.cost) {
        state = AFFORDABILITY_STATES.INSUFFICIENT_COINS;
        canClickToBuy = false;
        buttonText = `Need ${item.cost - safeCoins}c`;
        buttonCssClass = 'armory-btn-need-coins';
        clickStateBadge = 'NEED COINS';
    } else {
        state = AFFORDABILITY_STATES.AFFORDABLE;
        canClickToBuy = true;
        buttonText = `Buy (${item.cost}c)`;
        buttonCssClass = 'armory-btn-affordable';
        clickStateBadge = 'AFFORDABLE';
    }

    const hotkeyInfo = ARMORY_HOTKEY_BADGES[slot] || null;
    const hotkeyBadge = hotkeyInfo ? hotkeyInfo.badge : '';
    const hotkeyChar = hotkeyInfo ? hotkeyInfo.key : '';

    const statDiff = computeUpgradeStatDiff(currentStats, item);

    return {
        valid: true,
        id: item.id,
        legacyType: item.legacyType,
        slot: item.slot,
        tier: item.tier,
        name: item.name,
        subtitle: item.subtitle,
        description: item.description,
        cost: item.cost,
        coinsDeficit: Math.max(0, item.cost - safeCoins),
        state,
        isOwned,
        isNextAvailable,
        isTierLocked,
        canClickToBuy,
        buttonText,
        buttonCssClass,
        clickStateBadge,
        hotkey: hotkeyChar,
        hotkeyBadge,
        statDiff,
        promptLabel: `${hotkeyBadge} ${item.name} • ${item.cost}c [${clickStateBadge}]`,
    };
}
