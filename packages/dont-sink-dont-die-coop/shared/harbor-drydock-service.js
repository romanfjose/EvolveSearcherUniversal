/**
 * Sovereign Core — Act II Interactive Harbor Drydock & Cargo Crane Mechanic
 * (shared/harbor-drydock-service.js)
 *
 * Implements Helmet 04 & Sovereign Directives:
 * - High-ROI haven for crews moored in the Act II Harbor City basin (-250 <= z <= -150).
 * - Full 100% hull repair via drydock hoist lifts and caulking without tick/pressure penalties.
 * - Free Harbor Supply Crate drops via mechanical cargo crane with physicalized rewards (coins, planks, temporary weapons).
 * - Pressure-free armory and upgrade inspection with stat delta projections.
 * - Pure ES module with zero external dependencies, compatible with Node.js and browser runtimes.
 *
 * @module harbor-drydock-service
 */

import { SHOP_ZONE, PLAYER, createRng } from './game-core.js';
import { ARMORY_UPGRADE_TREE, calculateStatComparison, getNextSlotUpgrade, UPGRADE_SLOTS } from './upgrade-tree.js';

/**
 * Service definitions, coordinates, and rates for Harbor City drydock operations.
 */
export const HARBOR_SERVICES = {
    // Spatial boundary of the sheltered Harbor City Basin
    basin: {
        minX: SHOP_ZONE?.minX ?? 10,
        maxX: 32,
        minZ: SHOP_ZONE?.minZ ?? -250,
        maxZ: SHOP_ZONE?.maxZ ?? -150,
        safeSpeedThreshold: 3.5, // m/s: maximum speed considered safely "moored"
    },
    // Drydock automated hull maintenance cradle
    drydock: {
        id: 'harbor_drydock_cradle',
        name: 'Harbor Drydock Cradle & Pump Station',
        repairRateHpPerSec: 35.0, // continuous HP restoration rate while moored
        instantFullRepairAvailable: true,
        fullRepairCostCoins: 0, // 100% free harbor service for battered crews
        soundCue: 'drydock_pumps_active',
    },
    // Overhead steam-powered harbor cargo crane
    crane: {
        id: 'harbor_cargo_crane',
        name: 'Gantry Steam Crane No. 4',
        position: { x: 22.0, y: 12.0, z: -200.0 },
        dropTarget: { x: 16.5, y: 0.85, z: -200.0 }, // Drydock loading pier
        cooldownSeconds: 60, // Per-player cooldown between crate claims
        defaultCrateReward: {
            coins: 25,
            hullRepairPlanks: 2,
            bonusTool: 'harbor-salvage-magnet',
        },
    },
    // Upgrade inspection & harbor armory services
    inspection: {
        id: 'harbor_inspection_dock',
        timePressureSuspended: true, // Pauses river hazard drift pressure
        availableSlots: [UPGRADE_SLOTS.MOTOR, UPGRADE_SLOTS.WEAPON, UPGRADE_SLOTS.ARMOR],
    },
};

/**
 * Checks if a player or position is situated inside the sheltered Harbor City basin.
 *
 * @param {object|null} pos - Position object {x, y, z} or player with position
 * @returns {boolean} True if within Harbor Basin coordinates
 */
export function isPlayerInHarborBasin(pos) {
    if (!pos) return false;
    const p = pos.position ? pos.position : pos;
    if (!p || typeof p.z !== 'number' || isNaN(p.z)) return false;
    const x = typeof p.x === 'number' ? p.x : 0;
    const { minX, maxX, minZ, maxZ } = HARBOR_SERVICES.basin;
    return x >= minX && x <= maxX && p.z >= minZ && p.z <= maxZ;
}

/**
 * Checks if a player is safely moored in the basin (inside basin and below safe speed).
 *
 * @param {object|null} player - Player object with position and optional velocity/speed
 * @returns {boolean} True if player is moored
 */
export function isPlayerMoored(player) {
    if (!player || player.isDead) return false;
    if (!isPlayerInHarborBasin(player)) return false;

    // Check velocity or speed if available
    let speed = 0;
    if (typeof player.speed === 'number') {
        speed = player.speed;
    } else if (player.velocity) {
        const vx = player.velocity.x || 0;
        const vz = player.velocity.z || 0;
        speed = Math.hypot(vx, vz);
    }

    return speed <= HARBOR_SERVICES.basin.safeSpeedThreshold;
}

/**
 * Evaluates continuous or instantaneous drydock hull repair for a player in the Harbor City basin.
 * Restores hull HP up to 100% of maxHealth without time pressure.
 *
 * @param {object|null} player - Player instance { health, maxHealth, position, velocity, ... }
 * @param {number} [dt=0.05] - Elapsed time in seconds
 * @param {object} [options={}] - Optional evaluation flags
 * @param {boolean} [options.instant=false] - If true, immediately restores hull to 100%
 * @returns {object} Status of drydock repair { active, repairedHp, currentHp, maxHp, isFullyRepaired, reason }
 */
export function evaluateDrydockRepair(player, dt = 0.05, options = {}) {
    if (!player) {
        return {
            active: false,
            repairedHp: 0,
            currentHp: 0,
            maxHp: 0,
            isFullyRepaired: false,
            reason: 'invalid-player',
        };
    }

    if (player.isDead) {
        return {
            active: false,
            repairedHp: 0,
            currentHp: 0,
            maxHp: player.maxHealth || PLAYER.startHealth,
            isFullyRepaired: false,
            reason: 'player-dead',
        };
    }

    if (!isPlayerInHarborBasin(player)) {
        const maxHp = player.maxHealth || PLAYER.startHealth;
        const currentHp = player.health !== undefined ? player.health : maxHp;
        return {
            active: false,
            repairedHp: 0,
            currentHp,
            maxHp,
            isFullyRepaired: currentHp >= maxHp,
            reason: 'outside-harbor-basin',
        };
    }

    const moored = isPlayerMoored(player);
    if (!moored && !options.instant) {
        const maxHp = player.maxHealth || PLAYER.startHealth;
        const currentHp = player.health !== undefined ? player.health : maxHp;
        return {
            active: false,
            repairedHp: 0,
            currentHp,
            maxHp,
            isFullyRepaired: currentHp >= maxHp,
            reason: 'craft-not-moored',
        };
    }

    const maxHp = player.maxHealth || PLAYER.startHealth;
    let currentHp = player.health !== undefined ? player.health : maxHp;

    if (currentHp >= maxHp) {
        return {
            active: true,
            repairedHp: 0,
            currentHp: maxHp,
            maxHp,
            isFullyRepaired: true,
            reason: 'already-at-full-health',
        };
    }

    let addedHp = 0;
    if (options.instant) {
        addedHp = maxHp - currentHp;
        currentHp = maxHp;
    } else {
        const rate = HARBOR_SERVICES.drydock.repairRateHpPerSec;
        const potentialAdd = rate * Math.max(0, dt);
        addedHp = Math.min(potentialAdd, maxHp - currentHp);
        currentHp = Math.min(maxHp, currentHp + addedHp);
    }

    player.health = currentHp;

    return {
        active: true,
        repairedHp: Number(addedHp.toFixed(2)),
        currentHp: Number(currentHp.toFixed(2)),
        maxHp,
        isFullyRepaired: currentHp >= maxHp,
        reason: null,
    };
}

/**
 * Possible contents for Harbor Supply Crate crane drops.
 */
export const CRANE_LOOT_TABLE = [
    {
        id: 'standard_provisions',
        label: 'Drydock Provisions Crate',
        coins: 20,
        planks: 2,
        powerup: 'repair_caulk',
        description: 'Standard harbor timber caulking kit and coin ration.',
    },
    {
        id: 'engineer_bounty',
        label: 'Master Shipwright Toolchest',
        coins: 40,
        planks: 3,
        powerup: 'overclock_propeller',
        description: 'High-grade copper rivets, machinist coins, and tuning grease.',
    },
    {
        id: 'smuggler_cache',
        label: 'Smuggler Waterproof Locker',
        coins: 60,
        planks: 1,
        powerup: 'salvage_grapple',
        description: 'Contraband harbor coins retrieved from sunken barges.',
    },
    {
        id: 'harbor_police_surplus',
        label: 'Harbor Patrol Defense Cache',
        coins: 30,
        planks: 4,
        powerup: 'depth_flare',
        description: 'Surplus patrol flak and reinforced cedar plating.',
    },
];

/**
 * Triggers a deterministic Harbor Crane cargo drop.
 * Yields physicalized crate contents, drop coordinates, animation duration, and RNG metadata.
 *
 * @param {number|string} [seed=1337] - Seed for deterministic drop generation
 * @returns {object} Harbor crate drop payload
 */
export function triggerHarborCraneDrop(seed = 1337) {
    const numSeed = typeof seed === 'number' ? seed : (function hashStr(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h + str.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
    })(String(seed));

    const rng = createRng(numSeed);

    const lootRoll = rng();
    const tableIndex = Math.min(
        CRANE_LOOT_TABLE.length - 1,
        Math.floor(lootRoll * CRANE_LOOT_TABLE.length)
    );
    const lootTemplate = CRANE_LOOT_TABLE[tableIndex];

    // Slight variance in dropped coins (+/- 10%)
    const coinVariation = Math.floor((rng() - 0.5) * 6);
    const finalCoins = Math.max(10, lootTemplate.coins + coinVariation);

    // Drop targeting with slight industrial crane jitter
    const target = HARBOR_SERVICES.crane.dropTarget;
    const jitterX = (rng() - 0.5) * 1.5;
    const jitterZ = (rng() - 0.5) * 2.0;

    const dropId = `harbor_crate_${Math.floor(rng() * 100000).toString(16)}`;

    return {
        id: dropId,
        sourceCrane: HARBOR_SERVICES.crane.id,
        craneOrigin: { ...HARBOR_SERVICES.crane.position },
        dropPosition: {
            x: Number((target.x + jitterX).toFixed(2)),
            y: target.y,
            z: Number((target.z + jitterZ).toFixed(2)),
        },
        fallDurationSeconds: 1.8,
        crate: {
            id: lootTemplate.id,
            label: lootTemplate.label,
            coins: finalCoins,
            hullRepairPlanks: lootTemplate.planks,
            powerup: lootTemplate.powerup,
            description: lootTemplate.description,
        },
        timestamp: Date.now ? Date.now() : 0,
    };
}

/**
 * Claims the free Harbor Supply Crate for a player.
 * Enforces mooring, harbor presence, and cooldown tracking.
 *
 * @param {object} player - Player instance
 * @param {number} [seed=42] - RNG seed for crane contents
 * @param {number} [nowSec=0] - Current game time in seconds
 * @returns {object} Claim result { ok, crate, reason, playerCoins }
 */
export function claimHarborSupplyCrate(player, seed = 42, nowSec = 0) {
    if (!player) return { ok: false, crate: null, reason: 'invalid-player' };
    if (!isPlayerInHarborBasin(player)) return { ok: false, crate: null, reason: 'outside-harbor' };
    if (!isPlayerMoored(player)) return { ok: false, crate: null, reason: 'craft-not-moored' };

    // Cooldown check
    const lastClaim = player.lastHarborCrateClaimTime || 0;
    const cooldown = HARBOR_SERVICES.crane.cooldownSeconds;
    if (nowSec > 0 && lastClaim > 0 && (nowSec - lastClaim) < cooldown) {
        const remaining = Math.ceil(cooldown - (nowSec - lastClaim));
        return {
            ok: false,
            crate: null,
            remainingCooldown: remaining,
            reason: 'cooldown-active',
        };
    }

    const drop = triggerHarborCraneDrop(seed);
    player.lastHarborCrateClaimTime = nowSec;
    player.coins = (player.coins || 0) + drop.crate.coins;

    return {
        ok: true,
        crate: drop,
        reason: null,
        playerCoins: player.coins,
    };
}

/**
 * Inspects all available armory upgrades without time pressure while moored in the Harbor Basin.
 * Provides projection deltas, costs, and affordability for each slot.
 *
 * @param {object} player - Player instance { upgrades, coins, ... }
 * @returns {object} Inspection manifest with all slots, projected stats, and recommendations
 */
export function inspectHarborUpgrades(player) {
    if (!player) return { ok: false, slots: [], reason: 'invalid-player' };

    const upgrades = player.upgrades || [];
    const coins = player.coins || 0;
    const inBasin = isPlayerInHarborBasin(player);
    const moored = isPlayerMoored(player);

    const slotInspections = HARBOR_SERVICES.inspection.availableSlots.map((slot) => {
        const nextUpgrade = getNextSlotUpgrade(upgrades, slot);
        const comparison = calculateStatComparison(upgrades, nextUpgrade);
        const canAfford = nextUpgrade ? coins >= nextUpgrade.cost : false;

        return {
            slot,
            nextUpgrade: nextUpgrade ? {
                id: nextUpgrade.id,
                name: nextUpgrade.name,
                subtitle: nextUpgrade.subtitle,
                cost: nextUpgrade.cost,
                tier: nextUpgrade.tier,
                description: nextUpgrade.description,
            } : null,
            isMaxTier: !nextUpgrade,
            canAfford,
            comparison,
        };
    });

    return {
        ok: true,
        inBasin,
        moored,
        timePressureSuspended: inBasin && moored,
        slots: slotInspections,
        playerCoins: coins,
    };
}
