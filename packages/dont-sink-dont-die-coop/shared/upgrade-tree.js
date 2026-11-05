/**
 * Harbor Armory & Upgrade Tree Logic
 * Pure, deterministic logic for multi-tier watercraft upgrades, stat evaluation,
 * visual comparison bars, hotkey mappings, and crew bot auto-equip priority.
 *
 * Slots & Tiers:
 * 1. Motor: Motor Mk I -> Motor Mk II -> Motor Mk III
 * 2. Weapon: Squeaky Mallet -> Thunder Gavel -> Leviathan Breaker
 * 3. Armor: Hull Armor -> Riveted Ironclad -> Aegis Plating
 */

export const UPGRADE_SLOTS = {
    MOTOR: 'motor',
    WEAPON: 'weapon',
    ARMOR: 'armor',
};

export const HOTKEY_UPGRADE_SLOTS = ['1', '2', '3'];

// Base player craft values without upgrades
export const BASE_PLAYER_STATS = {
    speed: 15.0,        // m/s max forward speed baseline
    turnRate: 2.2,     // rad/s baseline
    dps: 10.0,         // base attack damage (10 dmg / 1.0s cooldown)
    maxHp: 100,        // base player health
};

// Max reference values for normalized 0..100% UI stat comparison bars
export const STAT_BAR_MAX = {
    speed: 30.0,
    turnRate: 3.5,
    dps: 70.0,
    maxHp: 250,
};

export const ARMORY_UPGRADE_TREE = {
    motor: [
        {
            tier: 1,
            id: 'motor_1',
            legacyType: 'motor',
            slot: 'motor',
            name: 'Motor Mk I',
            subtitle: 'Outboard Combustion Propeller',
            cost: 10,
            stats: {
                speedDelta: +5.0,
                turnRateDelta: -0.66, // turn penalty ~30%
                dpsDelta: 0,
                maxHpDelta: 0,
            },
            description: 'Twin-blade bronze prop. Boosts forward thrust by +5 m/s with moderate helm resistance.',
            visualModel: 'motor_tier1',
        },
        {
            tier: 2,
            id: 'motor_2',
            legacyType: 'motor_mk2',
            slot: 'motor',
            name: 'Motor Mk II',
            subtitle: 'Supercharged Hydro-Turbine',
            cost: 25,
            stats: {
                speedDelta: +9.0,
                turnRateDelta: -0.40,
                dpsDelta: 0,
                maxHpDelta: 0,
            },
            description: 'Dual exhaust manifold and counter-rotating hydro-jets. Plane effortlessly through heavy chop.',
            visualModel: 'motor_tier2',
        },
        {
            tier: 3,
            id: 'motor_3',
            legacyType: 'motor_mk3',
            slot: 'motor',
            name: 'Motor Mk III',
            subtitle: 'Nitro Cavitation Impeller',
            cost: 45,
            stats: {
                speedDelta: +13.5,
                turnRateDelta: -0.20,
                dpsDelta: 0,
                maxHpDelta: 0,
            },
            description: 'Apex harbor engineering. Overdriven afterburners slice straight through maelstrom currents.',
            visualModel: 'motor_tier3',
        },
    ],
    weapon: [
        {
            tier: 1,
            id: 'weapon_1',
            legacyType: 'weapon',
            slot: 'weapon',
            name: 'Squeaky Mallet',
            subtitle: 'High-Impact Red Rubber Gavel',
            cost: 15,
            stats: {
                speedDelta: 0,
                turnRateDelta: 0,
                dpsDelta: +20.0, // 30 total dmg
                maxHpDelta: 0,
            },
            description: 'Deceptively devastating carnival hammer. Emits high-pitch squeaks that stagger river lurkers.',
            visualModel: 'weapon_tier1',
        },
        {
            tier: 2,
            id: 'weapon_2',
            legacyType: 'weapon_mk2',
            slot: 'weapon',
            name: 'Thunder Gavel',
            subtitle: 'Charged Runed Brass Warhammer',
            cost: 30,
            stats: {
                speedDelta: 0,
                turnRateDelta: 0,
                dpsDelta: +35.0, // 45 total dmg
                maxHpDelta: 0,
            },
            description: 'Enchanted with copper lightning coils that arc across river water to shock nearby targets.',
            visualModel: 'weapon_tier2',
        },
        {
            tier: 3,
            id: 'weapon_3',
            legacyType: 'weapon_mk3',
            slot: 'weapon',
            name: 'Leviathan Breaker',
            subtitle: 'Forged Abyssal Harpoon Maul',
            cost: 55,
            stats: {
                speedDelta: 0,
                turnRateDelta: 0,
                dpsDelta: +55.0, // 65 total dmg
                maxHpDelta: 0,
            },
            description: 'Hardened titanium skull-crusher made to shatter Kraken mantle armor and colossal river worms.',
            visualModel: 'weapon_tier3',
        },
    ],
    armor: [
        {
            tier: 1,
            id: 'armor_1',
            legacyType: 'armor',
            slot: 'armor',
            name: 'Hull Armor',
            subtitle: 'Reinforced Timber Bulwarks',
            cost: 20,
            stats: {
                speedDelta: 0,
                turnRateDelta: 0,
                dpsDelta: 0,
                maxHpDelta: +50, // 150 HP
            },
            description: 'Hardwood cross-bracing and iron gunwales that absorb debris collisions and enemy bites.',
            visualModel: 'armor_tier1',
        },
        {
            tier: 2,
            id: 'armor_2',
            legacyType: 'armor_mk2',
            slot: 'armor',
            name: 'Riveted Ironclad',
            subtitle: 'Heavy Plated Hull Skirts',
            cost: 35,
            stats: {
                speedDelta: 0,
                turnRateDelta: 0,
                dpsDelta: 0,
                maxHpDelta: +90, // 190 HP
            },
            description: 'Industrial cold-rolled iron plates riveted along the waterline to deflect mud alien slams.',
            visualModel: 'armor_tier2',
        },
        {
            tier: 3,
            id: 'armor_3',
            legacyType: 'armor_mk3',
            slot: 'armor',
            name: 'Aegis Plating',
            subtitle: 'Arcane Ward Citadel Bulkhead',
            cost: 60,
            stats: {
                speedDelta: 0,
                turnRateDelta: 0,
                dpsDelta: 0,
                maxHpDelta: +140, // 240 HP
            },
            description: 'Gleaming barrier alloy infused with glowing runes that fortifies the raft against all mortal perils.',
            visualModel: 'armor_tier3',
        },
    ],
};

// Flat registry of all upgrade definitions indexed by ID and legacyType
export const ALL_UPGRADES = {};
export const UPGRADE_LOOKUP_BY_TYPE = {};

for (const [slot, tiers] of Object.entries(ARMORY_UPGRADE_TREE)) {
    tiers.forEach((item) => {
        ALL_UPGRADES[item.id] = item;
        UPGRADE_LOOKUP_BY_TYPE[item.legacyType] = item;
    });
}

/**
 * Resolves current tier level (0, 1, 2, or 3) for a given slot from an array of player upgrade keys.
 * Handles both legacy keys ('motor', 'weapon', 'armor') and tiered keys ('motor_1', etc.).
 */
export function getSlotCurrentTier(upgrades = [], slot) {
    if (!ARMORY_UPGRADE_TREE[slot]) return 0;
    const tiers = ARMORY_UPGRADE_TREE[slot];

    let maxTier = 0;
    for (const u of upgrades) {
        // Direct ID match
        const byId = tiers.find((t) => t.id === u);
        if (byId && byId.tier > maxTier) {
            maxTier = byId.tier;
        }
        // Legacy type match
        const byLegacy = tiers.find((t) => t.legacyType === u);
        if (byLegacy && byLegacy.tier > maxTier) {
            maxTier = byLegacy.tier;
        }
    }
    return maxTier;
}

/**
 * Retrieves the next available upgrade item in a slot for the player.
 * Returns null if the slot is already max tier (Tier 3).
 */
export function getNextSlotUpgrade(upgrades = [], slot) {
    const currentTier = getSlotCurrentTier(upgrades, slot);
    if (currentTier >= 3) return null;
    return ARMORY_UPGRADE_TREE[slot][currentTier];
}

/**
 * Computes exact cumulative raft & crew stats given a list of purchased upgrades.
 */
export function calculateCumulativeStats(upgrades = []) {
    let speed = BASE_PLAYER_STATS.speed;
    let turnRate = BASE_PLAYER_STATS.turnRate;
    let dps = BASE_PLAYER_STATS.dps;
    let maxHp = BASE_PLAYER_STATS.maxHp;

    for (const slot of Object.values(UPGRADE_SLOTS)) {
        const tier = getSlotCurrentTier(upgrades, slot);
        if (tier > 0) {
            const item = ARMORY_UPGRADE_TREE[slot][tier - 1];
            speed += item.stats.speedDelta;
            turnRate += item.stats.turnRateDelta;
            dps += item.stats.dpsDelta;
            maxHp += item.stats.maxHpDelta;
        }
    }

    // Safeguard physical bounds
    speed = Math.max(5.0, Number(speed.toFixed(2)));
    turnRate = Math.max(0.5, Number(turnRate.toFixed(2)));
    dps = Math.max(10.0, Number(dps.toFixed(2)));
    maxHp = Math.max(100, Math.round(maxHp));

    return { speed, turnRate, dps, maxHp };
}

/**
 * Evaluates stat comparison percentages and delta changes between current loadout
 * and the prospective purchase of a candidate upgrade.
 */
export function calculateStatComparison(currentUpgrades = [], candidateUpgrade) {
    const currentStats = calculateCumulativeStats(currentUpgrades);

    if (!candidateUpgrade) {
        return {
            current: currentStats,
            projected: { ...currentStats },
            deltas: { speed: 0, turnRate: 0, dps: 0, maxHp: 0 },
            currentBars: normalizeStatBars(currentStats),
            projectedBars: normalizeStatBars(currentStats),
        };
    }

    // Simulate replacing the current slot tier with candidate upgrade
    const slot = candidateUpgrade.slot;
    const filtered = currentUpgrades.filter((u) => {
        const item = ALL_UPGRADES[u] || UPGRADE_LOOKUP_BY_TYPE[u];
        return item ? item.slot !== slot : true;
    });
    filtered.push(candidateUpgrade.id);

    const projectedStats = calculateCumulativeStats(filtered);

    const deltas = {
        speed: Number((projectedStats.speed - currentStats.speed).toFixed(2)),
        turnRate: Number((projectedStats.turnRate - currentStats.turnRate).toFixed(2)),
        dps: Number((projectedStats.dps - currentStats.dps).toFixed(2)),
        maxHp: Math.round(projectedStats.maxHp - currentStats.maxHp),
    };

    return {
        current: currentStats,
        projected: projectedStats,
        deltas,
        currentBars: normalizeStatBars(currentStats),
        projectedBars: normalizeStatBars(projectedStats),
    };
}

/**
 * Normalizes stats into 0..100 percentage values for visual progress comparison bars.
 */
export function normalizeStatBars(stats) {
    const clampPct = (val, max) => Math.min(100, Math.max(0, Number(((val / max) * 100).toFixed(1))));
    return {
        speedPct: clampPct(stats.speed, STAT_BAR_MAX.speed),
        turnRatePct: clampPct(stats.turnRate, STAT_BAR_MAX.turnRate),
        dpsPct: clampPct(stats.dps, STAT_BAR_MAX.dps),
        maxHpPct: clampPct(stats.maxHp, STAT_BAR_MAX.maxHp),
    };
}

/**
 * Checks if a player can afford and purchase a candidate upgrade.
 */
export function canPurchaseArmoryUpgrade(player, upgradeIdOrItem) {
    if (!player) return { ok: false, reason: 'invalid-player' };
    const item = typeof upgradeIdOrItem === 'string'
        ? (ALL_UPGRADES[upgradeIdOrItem] || UPGRADE_LOOKUP_BY_TYPE[upgradeIdOrItem])
        : upgradeIdOrItem;

    if (!item) return { ok: false, reason: 'unknown-upgrade' };

    const currentTier = getSlotCurrentTier(player.upgrades, item.slot);
    if (item.tier <= currentTier) {
        return { ok: false, reason: 'already-owned-or-higher' };
    }
    if (item.tier > currentTier + 1) {
        return { ok: false, reason: 'prerequisite-tier-locked' };
    }
    if ((player.coins || 0) < item.cost) {
        return { ok: false, reason: 'insufficient-coins' };
    }

    return { ok: true, reason: null };
}

/**
 * Maps hotkeys ('1', '2', '3', '4') to armory actions:
 * '1' -> Buy next Motor tier
 * '2' -> Buy next Weapon tier
 * '3' -> Buy next Armor tier
 * '4' -> Quick Auto-Equip best affordable item
 */
export function resolveArmoryHotkey(key, player) {
    const k = String(key).toLowerCase().trim();
    if (!player) return null;

    if (k === '1') {
        const next = getNextSlotUpgrade(player.upgrades, UPGRADE_SLOTS.MOTOR);
        if (!next) return { action: 'slot_maxed', slot: UPGRADE_SLOTS.MOTOR };
        const check = canPurchaseArmoryUpgrade(player, next);
        return { action: 'buy', slot: UPGRADE_SLOTS.MOTOR, item: next, ...check };
    }
    if (k === '2') {
        const next = getNextSlotUpgrade(player.upgrades, UPGRADE_SLOTS.WEAPON);
        if (!next) return { action: 'slot_maxed', slot: UPGRADE_SLOTS.WEAPON };
        const check = canPurchaseArmoryUpgrade(player, next);
        return { action: 'buy', slot: UPGRADE_SLOTS.WEAPON, item: next, ...check };
    }
    if (k === '3') {
        const next = getNextSlotUpgrade(player.upgrades, UPGRADE_SLOTS.ARMOR);
        if (!next) return { action: 'slot_maxed', slot: UPGRADE_SLOTS.ARMOR };
        const check = canPurchaseArmoryUpgrade(player, next);
        return { action: 'buy', slot: UPGRADE_SLOTS.ARMOR, item: next, ...check };
    }
    if (k === '4') {
        const recommendation = evaluateBotAutoEquip(player);
        if (!recommendation) return { action: 'none_affordable' };
        return { action: 'auto_equip', item: recommendation, ok: true, slot: recommendation.slot };
    }

    return null;
}

/**
 * Crew Bot Auto-Equip status & decision evaluator:
 * Evaluates all 3 slots based on bot priority (Weapon -> Armor -> Motor),
 * checks next tier availability and coin balance, and returns the highest priority
 * affordable upgrade item.
 */
export function evaluateBotAutoEquip(bot, priorityOrder = [UPGRADE_SLOTS.WEAPON, UPGRADE_SLOTS.ARMOR, UPGRADE_SLOTS.MOTOR]) {
    if (!bot || bot.isDead) return null;

    for (const slot of priorityOrder) {
        const next = getNextSlotUpgrade(bot.upgrades, slot);
        if (next && canPurchaseArmoryUpgrade(bot, next).ok) {
            return next;
        }
    }
    return null;
}

/**
 * Returns comprehensive auto-equip status summary for all crew bots in a team.
 */
export function getCrewBotsAutoEquipSummary(players = {}) {
    const bots = Object.values(players).filter((p) => p.isBot);
    return bots.map((bot) => {
        const nextPick = evaluateBotAutoEquip(bot);
        const tiers = {
            motor: getSlotCurrentTier(bot.upgrades, UPGRADE_SLOTS.MOTOR),
            weapon: getSlotCurrentTier(bot.upgrades, UPGRADE_SLOTS.WEAPON),
            armor: getSlotCurrentTier(bot.upgrades, UPGRADE_SLOTS.ARMOR),
        };
        const maxed = tiers.motor === 3 && tiers.weapon === 3 && tiers.armor === 3;
        return {
            id: bot.id,
            name: bot.name,
            coins: bot.coins,
            tiers,
            maxed,
            readyToUpgrade: !!nextPick,
            recommendedUpgrade: nextPick,
            statusLabel: maxed
                ? 'Fully Armed'
                : nextPick
                ? `Queued: ${nextPick.name} (${nextPick.cost}c)`
                : 'Saving Coins',
        };
    });
}
