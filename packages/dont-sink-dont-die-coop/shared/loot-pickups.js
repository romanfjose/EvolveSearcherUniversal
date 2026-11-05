/**
 * Don't Sink, Don't Die — River Loot Crate & Temporary Weapon Pickup System
 * Shared deterministic module for procedural seeded loot spawning,
 * collision/collection math, temporary weapon buffs, and repair mechanics.
 */

import { RIVER, FINISH_Z, PLAYER, WATER_SURFACE_Y, createRng } from './game-core.js';

// Types of pickups supported
export const PICKUP_TYPES = {
    CHEST: 'treasure-chest',
    COIN_STREAM: 'gold-coin-stream',
    REPAIR_KIT: 'repair-kit',
    WEAPON_LIGHTNING_OAR: 'weapon-lightning-oar',
    WEAPON_EXPLOSIVE_BARREL: 'weapon-explosive-barrel',
    WEAPON_FROST_WARHAMMER: 'weapon-frost-warhammer',
};

// Pickup categories
export const PICKUP_CATEGORIES = {
    TREASURE: 'treasure',
    CONSUMABLE: 'consumable',
    WEAPON: 'weapon',
};

// Full definitions for each pickup type
export const PICKUP_DEFINITIONS = {
    [PICKUP_TYPES.CHEST]: {
        type: PICKUP_TYPES.CHEST,
        category: PICKUP_CATEGORIES.TREASURE,
        name: 'Sunken Treasure Chest',
        coinReward: 40,
        healAmount: 0,
        durationMs: 0,
        collectionRadius: 2.8,
        heightOffset: 0.35,
        colorHex: 0xf59e0b,
        auraColorHex: 0xfbbf24,
        description: 'Contains 40 gold coins and shiny loot.',
    },
    [PICKUP_TYPES.COIN_STREAM]: {
        type: PICKUP_TYPES.COIN_STREAM,
        category: PICKUP_CATEGORIES.TREASURE,
        name: 'Gold Coin Stream',
        coinReward: 12,
        healAmount: 0,
        durationMs: 0,
        collectionRadius: 2.2,
        heightOffset: 0.25,
        colorHex: 0xfacc15,
        auraColorHex: 0xfef08a,
        description: 'A floating line of gleaming gold coins (+12 coins).',
    },
    [PICKUP_TYPES.REPAIR_KIT]: {
        type: PICKUP_TYPES.REPAIR_KIT,
        category: PICKUP_CATEGORIES.CONSUMABLE,
        name: 'Watertight Repair Kit',
        coinReward: 0,
        healAmount: 40,
        durationMs: 0,
        collectionRadius: 2.5,
        heightOffset: 0.3,
        colorHex: 0x10b981,
        auraColorHex: 0x34d399,
        description: 'Instantly patches raft breaches and restores +40 HP.',
    },
    [PICKUP_TYPES.WEAPON_LIGHTNING_OAR]: {
        type: PICKUP_TYPES.WEAPON_LIGHTNING_OAR,
        category: PICKUP_CATEGORIES.WEAPON,
        name: 'Lightning Oar',
        coinReward: 0,
        healAmount: 0,
        durationMs: 15000,
        maxUses: 6,
        damage: 35,
        speedBonus: 50, // +50 N paddle thrust
        chainTargets: 3,
        collectionRadius: 2.5,
        heightOffset: 0.45,
        colorHex: 0x38bdf8,
        auraColorHex: 0x0284c7,
        description: 'Electrified paddle that boosts speed (+50N) and shocks up to 3 enemies for 35 dmg.',
    },
    [PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL]: {
        type: PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL,
        category: PICKUP_CATEGORIES.WEAPON,
        name: 'Explosive Barrel Toss',
        coinReward: 0,
        healAmount: 0,
        durationMs: 20000,
        maxUses: 3,
        damage: 75,
        blastRadius: 8.5,
        collectionRadius: 2.5,
        heightOffset: 0.4,
        colorHex: 0xef4444,
        auraColorHex: 0xf97316,
        description: 'Launches volatile gunpowder barrels dealing 75 AoE damage in an 8.5m radius.',
    },
    [PICKUP_TYPES.WEAPON_FROST_WARHAMMER]: {
        type: PICKUP_TYPES.WEAPON_FROST_WARHAMMER,
        category: PICKUP_CATEGORIES.WEAPON,
        name: 'Frost Warhammer',
        coinReward: 0,
        healAmount: 0,
        durationMs: 18000,
        maxUses: 5,
        damage: 55,
        freezeDurationMs: 3500,
        collectionRadius: 2.5,
        heightOffset: 0.45,
        colorHex: 0xa5f3fc,
        auraColorHex: 0x06b6d4,
        description: 'Glacial war hammer dealing 55 damage and freezing river monsters solid for 3.5s.',
    },
};

/**
 * Creates a unique deterministic pickup instance
 */
export function createPickup(id, type, position, surface = 'water', sourceObstacleId = null) {
    const def = PICKUP_DEFINITIONS[type];
    if (!def) {
        throw new Error(`Unknown pickup type: ${type}`);
    }

    return {
        id,
        type,
        category: def.category,
        name: def.name,
        position: {
            x: position.x,
            y: position.y + (def.heightOffset || 0.3),
            z: position.z,
        },
        surface, // 'water' or 'plank'
        sourceObstacleId,
        collected: false,
        collectedBy: null,
        collectedAt: null,
        radius: def.collectionRadius,
        definition: def,
    };
}

/**
 * Pure deterministic spawner placing loot along the river channel and atop elevated wooden plank obstacles.
 *
 * @param {object} options
 * @param {number} [options.seed=42] - Seed for Mulberry32 RNG.
 * @param {Array<object>} [options.obstacles=[]] - Array of obstacle objects (especially elevated planks).
 * @param {number} [options.riverLength=2000] - Total river length in meters.
 * @param {number} [options.riverWidth=30] - River channel width in meters.
 * @param {number} [options.count=60] - Target number of water pickups to spawn.
 * @returns {Array<object>} Array of deterministic pickup objects.
 */
export function generateRiverLoot({
    seed = 42,
    obstacles = [],
    riverLength = Math.abs(FINISH_Z) || 1500,
    riverWidth = RIVER.width || 30,
    count = 50,
} = {}) {
    const rng = createRng(seed);
    const pickups = [];
    let pickupIndex = 0;

    const channelHalfW = (riverWidth * 0.5) - 3.5; // Avoid placing inside canyon walls

    // 1. First, spawn guaranteed premium rewards atop elevated wooden plank obstacles
    // Rewarding skilled players who jump onto planks!
    const planks = obstacles.filter((obs) => obs && obs.type === 'plank');
    for (let i = 0; i < planks.length; i++) {
        const plank = planks[i];
        // 65% chance for a plank to host an elevated high-value reward
        if (rng() < 0.65) {
            const roll = rng();
            let selectedType;
            if (roll < 0.35) {
                // High-tier weapons on planks
                selectedType = PICKUP_TYPES.WEAPON_LIGHTNING_OAR;
            } else if (roll < 0.65) {
                selectedType = PICKUP_TYPES.WEAPON_FROST_WARHAMMER;
            } else if (roll < 0.85) {
                selectedType = PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL;
            } else {
                selectedType = PICKUP_TYPES.CHEST;
            }

            const pickup = createPickup(
                `loot_plank_${pickupIndex++}`,
                selectedType,
                {
                    x: plank.x + (rng() - 0.5) * Math.min(1.2, (plank.halfW || 1.5) * 0.8),
                    y: plank.topY !== undefined ? plank.topY : 1.6,
                    z: plank.z + (rng() - 0.5) * Math.min(1.2, (plank.halfD || 1.0) * 0.8),
                },
                'plank',
                plank.id || `plank_${i}`
            );
            pickups.push(pickup);
        }
    }

    // 2. Spawn floating loot along the water channel
    const weaponPool = [
        PICKUP_TYPES.WEAPON_LIGHTNING_OAR,
        PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL,
        PICKUP_TYPES.WEAPON_FROST_WARHAMMER,
    ];

    const zStep = (riverLength - 80) / count;
    for (let i = 0; i < count; i++) {
        // Staggered downriver z coordinate
        const baseZ = -30 - (i * zStep) + (rng() - 0.5) * (zStep * 0.6);
        if (baseZ < FINISH_Z) continue;

        const x = (rng() - 0.5) * 2 * channelHalfW;
        const roll = rng();

        let type;
        if (roll < 0.40) {
            type = PICKUP_TYPES.COIN_STREAM;
        } else if (roll < 0.65) {
            type = PICKUP_TYPES.CHEST;
        } else if (roll < 0.82) {
            type = PICKUP_TYPES.REPAIR_KIT;
        } else {
            // Random power weapon
            const wIdx = Math.floor(rng() * weaponPool.length);
            type = weaponPool[wIdx];
        }

        const pickup = createPickup(
            `loot_water_${pickupIndex++}`,
            type,
            {
                x,
                y: WATER_SURFACE_Y,
                z: baseZ,
            },
            'water',
            null
        );
        pickups.push(pickup);
    }

    // Sort ascending by z (downriver order: 0 to -1500)
    pickups.sort((a, b) => b.position.z - a.position.z);
    return pickups;
}

/**
 * 3D Distance check between raft/player and pickup
 */
export function canCollectPickup(playerPos, pickupPos, radius = 2.5, maxVerticalDiff = 1.2) {
    const dx = playerPos.x - pickupPos.x;
    const dy = playerPos.y - pickupPos.y;
    const dz = playerPos.z - pickupPos.z;

    // Horizontal distance
    const distXZ = Math.hypot(dx, dz);
    if (distXZ > radius) return false;

    // Vertical height check: player must be close vertically (e.g. within 1.2m)
    // To pick up an elevated plank item (height ~2.2m), a floating raft at y=0.25 (dy=2.0)
    // cannot reach it, but a jumping or plank-riding player (y=1.9, dy=0.3) can!
    const distY = Math.abs(dy);
    return distY <= maxVerticalDiff;
}

/**
 * Applies collection consequences of a pickup to a player and game state.
 *
 * @param {object} player - Player object from game-core.
 * @param {object} pickup - The collected pickup object.
 * @param {number} [now=0] - Current timestamp in milliseconds.
 * @returns {object} Outcome describing applied changes and network event payloads.
 */
export function applyPickupCollection(player, pickup, now = 0) {
    if (!player || !pickup || pickup.collected) {
        return { success: false, reason: 'already-collected-or-invalid' };
    }

    const def = pickup.definition || PICKUP_DEFINITIONS[pickup.type];
    pickup.collected = true;
    pickup.collectedBy = player.id;
    pickup.collectedAt = now;

    let coinsAwarded = 0;
    let healthRestored = 0;
    let equippedWeapon = null;

    // 1. Coins reward
    if (def.coinReward > 0) {
        coinsAwarded = def.coinReward;
        player.coins = (player.coins || 0) + coinsAwarded;
    }

    // 2. Health repair
    if (def.healAmount > 0) {
        const maxHp = player.maxHealth || PLAYER.startHealth;
        const currentHp = player.health !== undefined ? player.health : maxHp;
        const potentialHp = currentHp + def.healAmount;
        healthRestored = Math.min(potentialHp, maxHp) - currentHp;
        player.health = currentHp + healthRestored;
    }

    // 3. Power weapon equip
    if (def.category === PICKUP_CATEGORIES.WEAPON) {
        equippedWeapon = {
            type: def.type,
            name: def.name,
            usesLeft: def.maxUses,
            expiresAt: now + def.durationMs,
            damage: def.damage,
            speedBonus: def.speedBonus || 0,
            chainTargets: def.chainTargets || 0,
            blastRadius: def.blastRadius || 0,
            freezeDurationMs: def.freezeDurationMs || 0,
        };
        player.temporaryWeapon = equippedWeapon;
    }

    return {
        success: true,
        pickupId: pickup.id,
        playerId: player.id,
        type: pickup.type,
        coinsAwarded,
        healthRestored,
        equippedWeapon,
    };
}

/**
 * Consumes one charge from player's active temporary weapon.
 * Checks expiry and charge count.
 *
 * @param {object} player - Player object.
 * @param {number} [now=0] - Current timestamp in milliseconds.
 * @returns {object} Weapon strike result.
 */
export function useTemporaryWeapon(player, now = 0) {
    const weapon = player.temporaryWeapon;
    if (!weapon) {
        return { active: false, weapon: null, expired: true };
    }

    if (now > weapon.expiresAt || weapon.usesLeft <= 0) {
        player.temporaryWeapon = null;
        return { active: false, weapon, expired: true };
    }

    weapon.usesLeft -= 1;
    const spent = weapon.usesLeft <= 0;
    if (spent) {
        player.temporaryWeapon = null;
    }

    return {
        active: true,
        weapon,
        usesRemaining: weapon.usesLeft,
        spent,
        expired: false,
    };
}

/**
 * Checks if a player's temporary weapon is still active and valid.
 */
export function isTemporaryWeaponActive(player, now = 0) {
    if (!player || !player.temporaryWeapon) return false;
    const w = player.temporaryWeapon;
    return now <= w.expiresAt && w.usesLeft > 0;
}

/**
 * Pure math helper to evaluate pickup collection for an entire list of active pickups.
 * Used in server/loopback tick loops.
 *
 * @param {Array<object>} pickups - Array of pickups.
 * @param {object} players - Map of players by ID.
 * @param {number} [now=0] - Current timestamp in ms.
 * @returns {Array<object>} Collection event records for network broadcasting.
 */
export function stepLootPickups(pickups, players, now = 0) {
    const events = [];
    const playerList = Object.values(players).filter((p) => p && !p.isDead);

    for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (pickup.collected) continue;

        for (let pIdx = 0; pIdx < playerList.length; pIdx++) {
            const player = playerList[pIdx];
            if (canCollectPickup(player.position, pickup.position, pickup.radius)) {
                const outcome = applyPickupCollection(player, pickup, now);
                if (outcome.success) {
                    events.push(outcome);
                    break; // Picked up by one player
                }
            }
        }
    }

    return events;
}
