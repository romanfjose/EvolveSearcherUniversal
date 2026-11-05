/**
 * Don't Sink, Don't Die — Endless Rogue-River Survival Mode
 *
 * Procedurally chains river sectors past z = -1500 infinitely with:
 * 1. Escalating Boss Duos (dual boss encounters pairing river threats with escalating HP, damage, and modifiers)
 * 2. Rogue-like Perk Draft cards at every 3rd checkpoint (seeded 3-card offerings with rarity tiers & stackable effects)
 * 3. Global Seed Leaderboards (entry recording, validation, ranking, deterministic seed hashing)
 *
 * Zero external dependencies. Pure, deterministic logic designed for shared use
 * across server, browser, and test runner.
 */

export const ENDLESS_START_Z = -1500;
export const SECTOR_LENGTH = 450; // Each sector is 450m (contains 3 checkpoints spaced at 150m)
export const CHECKPOINT_SPACING = 150;
export const PERK_DRAFT_CHECKPOINT_INTERVAL = 3; // Offered at every 3rd checkpoint
export const DEFAULT_RIVER_WIDTH = 30;

/**
 * Biome types cycling or chaining past sector 0.
 */
export const ENDLESS_BIOMES = [
    {
        id: 'abyssal_neon_trench',
        name: 'Abyssal Neon Trench',
        fogColor: 0x050c1a,
        waterColor: 0x00f0ff,
        ambientColor: 0x112244,
        hazardIntensity: 1.2,
    },
    {
        id: 'crimson_magma_canyon',
        name: 'Crimson Magma Canyon',
        fogColor: 0x1a0505,
        waterColor: 0xff3b00,
        ambientColor: 0x331111,
        hazardIntensity: 1.5,
    },
    {
        id: 'toxic_spore_swamp',
        name: 'Toxic Spore Swamp',
        fogColor: 0x081a08,
        waterColor: 0x39ff14,
        ambientColor: 0x112b11,
        hazardIntensity: 1.35,
    },
    {
        id: 'celestial_void_rift',
        name: 'Celestial Void Rift',
        fogColor: 0x120024,
        waterColor: 0xbf00ff,
        ambientColor: 0x25083a,
        hazardIntensity: 1.75,
    },
    {
        id: 'frozen_tempest_fjord',
        name: 'Frozen Tempest Fjord',
        fogColor: 0x0a192f,
        waterColor: 0x80d8ff,
        ambientColor: 0x102a45,
        hazardIntensity: 1.4,
    },
];

/**
 * Rogue-like Perk Draft Card Pool.
 * Each card provides stackable attribute modifiers or passive abilities.
 */
export const PERK_POOL = [
    {
        id: 'espresso_oars',
        name: 'Espresso Oars',
        rarity: 'common',
        description: '+20% paddle thrust and +10% forward speed.',
        stats: { paddleBoost: 0.20, forwardSpeedBoost: 0.10 },
    },
    {
        id: 'reinforced_keel',
        name: 'Reinforced Iron Keel',
        rarity: 'common',
        description: '+40 max hull HP and +15% keel grip turning stability.',
        stats: { maxHpBonus: 40, keelGripBonus: 0.15 },
    },
    {
        id: 'squeaky_thunder',
        name: 'Squeaky Thunderhead',
        rarity: 'uncommon',
        description: '+18 melee damage and +25% knockback force on enemy hits.',
        stats: { damageBonus: 18, knockbackMultiplier: 1.25 },
    },
    {
        id: 'buoyant_cushion',
        name: 'Aether Buoyancy Bladder',
        rarity: 'uncommon',
        description: '+2.5m jump height and -30% gravity fall damage impact.',
        stats: { jumpBonus: 2.5, gravityReduction: 0.30 },
    },
    {
        id: 'vampiric_splinter',
        name: 'Vampiric Driftwood',
        rarity: 'rare',
        description: 'Lifesteal: restore 12% of damage dealt back to raft integrity.',
        stats: { lifestealRatio: 0.12 },
    },
    {
        id: 'nitro_afterburner',
        name: 'Nitro Surge Injector',
        rarity: 'rare',
        description: '+45% top speed boost through rapids and stunt ramps.',
        stats: { rapidsBoostBonus: 0.45 },
    },
    {
        id: 'mirror_aegis',
        name: 'Mirror Aegis Shield',
        rarity: 'epic',
        description: 'Perfect blocking reflects 60% damage back to attacker and negates throw force.',
        stats: { reflectRatio: 0.60, throwImmunity: true },
    },
    {
        id: 'citadel_magnet',
        name: 'Citadel Coin Vortex',
        rarity: 'uncommon',
        description: 'Coins and floating loot gravitate to the raft within 18m radius.',
        stats: { coinAttractRadius: 18 },
    },
    {
        id: 'chrono_rudder',
        name: 'Chrono Rudder',
        rarity: 'epic',
        description: '+35% steering turn rate and 20% slower boss attack frequency.',
        stats: { turnRateBonus: 0.35, bossSlowFactor: 0.20 },
    },
    {
        id: 'phoenix_plank',
        name: 'Phoenix Heart Planks',
        rarity: 'legendary',
        description: 'Once per sector, fatal damage revives raft with 50% HP and a 3s shockwave shield.',
        stats: { phoenixRevive: 1, phoenixHpRatio: 0.50 },
    },
];

/**
 * Available Boss Archetypes for Endless Boss Duos.
 */
export const BOSS_ARCHETYPES = {
    krakenTentacleLord: {
        id: 'krakenTentacleLord',
        name: 'Kraken Tentacle Lord',
        baseHp: 600,
        baseDamage: 30,
        speed: 16,
        attackType: 'slam_barrage',
        color: 0x9900ff,
    },
    infernalWorm: {
        id: 'infernalWorm',
        name: 'Infernal Magma Leviathan',
        baseHp: 500,
        baseDamage: 38,
        speed: 36,
        attackType: 'tunneling_charge',
        color: 0xff3300,
    },
    shadowSorcerer: {
        id: 'shadowSorcerer',
        name: 'Shadow River Sorcerer',
        baseHp: 350,
        baseDamage: 25,
        speed: 22,
        attackType: 'arcane_teleport_throw',
        color: 0x00ffff,
    },
    toxicBehemoth: {
        id: 'toxicBehemoth',
        name: 'Toxic Sludge Behemoth',
        baseHp: 750,
        baseDamage: 28,
        speed: 12,
        attackType: 'sludge_whirlpool_aoe',
        color: 0x22c55e,
    },
    stormGargoyle: {
        id: 'stormGargoyle',
        name: 'Tempest Sky Gargoyle',
        baseHp: 420,
        baseDamage: 32,
        speed: 28,
        attackType: 'lightning_dive',
        color: 0xfacc15,
    },
};

export const BOSS_ARCHETYPE_KEYS = Object.keys(BOSS_ARCHETYPES);

/**
 * Deterministic mulberry32 PRNG generator.
 */
export function createRng(seed = 1) {
    let a = (seed >>> 0) || 1;
    return function mulberry32() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Hashes an arbitrary string into a deterministic 32-bit unsigned integer.
 */
export function hashString(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Converts a seed (number or string) into a clean 32-bit integer seed.
 */
export function normalizeSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
        return (seed >>> 0) || 1;
    }
    if (typeof seed === 'string' && seed.trim().length > 0) {
        return hashString(seed.trim());
    }
    return 1337;
}

/**
 * Computes sector index from downriver Z coordinate.
 * Sector 0 starts at ENDLESS_START_Z (-1500).
 * Z coordinates decrease further into negative infinity.
 */
export function getSectorIndexFromZ(z) {
    if (z > ENDLESS_START_Z) return -1; // Before endless zone
    const distancePastStart = ENDLESS_START_Z - z;
    return Math.floor(distancePastStart / SECTOR_LENGTH);
}

/**
 * Computes Z bounds [zStart, zEnd] for a sector index.
 * e.g., sector 0: [-1500, -1950]
 */
export function getSectorZBounds(sectorIndex) {
    const safeIndex = Math.max(0, sectorIndex);
    const zStart = ENDLESS_START_Z - safeIndex * SECTOR_LENGTH;
    const zEnd = zStart - SECTOR_LENGTH;
    return { zStart, zEnd };
}

/**
 * Computes the total checkpoint index count reached from start of run.
 * Campaign has 10 checkpoints (up to -1500). Endless checkpoints continue past that.
 */
export function getCheckpointCountAtZ(z) {
    if (z >= 0) return 0;
    return Math.floor(Math.abs(z) / CHECKPOINT_SPACING);
}

/**
 * Checks if crossing a specific checkpoint index triggers a Perk Draft.
 * Perk draft triggers at every 3rd checkpoint in endless mode.
 */
export function isPerkDraftCheckpoint(checkpointIndex) {
    return checkpointIndex > 0 && checkpointIndex % PERK_DRAFT_CHECKPOINT_INTERVAL === 0;
}

/**
 * Procedurally generates a River Sector chunk with deterministic biomes,
 * checkpoints, river obstacles, and hazards.
 */
export function generateRiverSector(sectorIndex, globalSeed = 1337) {
    const seed = normalizeSeed(globalSeed) + sectorIndex * 7919;
    const rng = createRng(seed);
    const { zStart, zEnd } = getSectorZBounds(sectorIndex);

    // Pick biome cycling through ENDLESS_BIOMES with deterministic variations
    const biomeIndex = Math.floor(rng() * ENDLESS_BIOMES.length);
    const baseBiome = ENDLESS_BIOMES[biomeIndex];
    const biome = {
        ...baseBiome,
        sectorIndex,
        intensity: 1.0 + sectorIndex * 0.15,
        waterSpeedMultiplier: 1.0 + sectorIndex * 0.08,
    };

    // Generate checkpoints in this sector (3 checkpoints spaced by CHECKPOINT_SPACING)
    const checkpoints = [];
    for (let i = 1; i <= 3; i++) {
        const cpZ = zStart - i * CHECKPOINT_SPACING;
        const totalCpIndex = getCheckpointCountAtZ(cpZ);
        const offersPerkDraft = isPerkDraftCheckpoint(totalCpIndex);
        checkpoints.push({
            id: `endless_cp_s${sectorIndex}_${i}`,
            sectorIndex,
            checkpointIndex: totalCpIndex,
            z: cpZ,
            offersPerkDraft,
            cleared: false,
        });
    }

    // Procedural river hazards inside sector
    const hazards = [];
    const hazardCount = 4 + Math.floor(rng() * 4) + Math.min(6, sectorIndex);
    for (let h = 0; h < hazardCount; h++) {
        const hTypeRoll = rng();
        const hz = zStart - 40 - rng() * (SECTOR_LENGTH - 80);
        const hx = (rng() - 0.5) * (DEFAULT_RIVER_WIDTH - 6);

        let type = 'rapids';
        if (hTypeRoll > 0.65) type = 'whirlpool';
        else if (hTypeRoll > 0.40) type = 'mine';
        else if (hTypeRoll > 0.20) type = 'ramp';

        hazards.push({
            id: `hazard_s${sectorIndex}_${h}`,
            type,
            x: hx,
            z: hz,
            severity: 1.0 + sectorIndex * 0.1,
        });
    }

    // Sector Boss Duo Encounter at the sector climax (near zEnd + 50)
    const bossDuo = generateBossDuo(sectorIndex, seed + 101, zEnd + 60);

    return {
        sectorIndex,
        zStart,
        zEnd,
        seed,
        biome,
        checkpoints,
        hazards,
        bossDuo,
    };
}

/**
 * Procedurally chains and caches infinite river sectors around the player's lead Z.
 */
export class SectorChainer {
    constructor(globalSeed = 1337, bufferSectors = 2) {
        this.globalSeed = normalizeSeed(globalSeed);
        this.bufferSectors = bufferSectors;
        this.sectors = new Map(); // sectorIndex -> Sector
        this.highestSectorReached = 0;
    }

    getSector(sectorIndex) {
        if (sectorIndex < 0) return null;
        if (!this.sectors.has(sectorIndex)) {
            const sector = generateRiverSector(sectorIndex, this.globalSeed);
            this.sectors.set(sectorIndex, sector);
        }
        return this.sectors.get(sectorIndex);
    }

    updateLeadZ(leadZ) {
        const currentSectorIdx = Math.max(0, getSectorIndexFromZ(leadZ));
        if (currentSectorIdx > this.highestSectorReached) {
            this.highestSectorReached = currentSectorIdx;
        }

        // Preload upcoming sectors in buffer
        const minIdx = Math.max(0, currentSectorIdx - 1);
        const maxIdx = currentSectorIdx + this.bufferSectors;

        for (let idx = minIdx; idx <= maxIdx; idx++) {
            this.getSector(idx);
        }

        // Prune distant historical sectors behind player to avoid memory leaks
        const pruneThreshold = currentSectorIdx - 3;
        for (const [idx] of this.sectors) {
            if (idx < pruneThreshold) {
                this.sectors.delete(idx);
            }
        }

        return {
            currentSectorIdx,
            activeSectors: Array.from(this.sectors.keys()).sort((a, b) => a - b),
        };
    }

    getActiveSectorCount() {
        return this.sectors.size;
    }
}

/**
 * Generates an Escalating Boss Duo encounter for a sector.
 * Dual boss pairs with escalating health, damage, and complementary attack modifiers.
 */
export function generateBossDuo(sectorIndex, encounterSeed, encounterZ) {
    const rng = createRng(encounterSeed);
    const scaleFactor = 1.0 + sectorIndex * 0.35; // 35% HP & damage escalation per sector
    const duoModifiers = [
        'berserk_frenzy',
        'twin_vortex_sync',
        'shielded_bond',
        'toxic_trail',
        'chrono_haste',
    ];

    // Pick 2 distinct boss archetypes
    const archetypePool = [...BOSS_ARCHETYPE_KEYS];
    const pick1Index = Math.floor(rng() * archetypePool.length);
    const key1 = archetypePool.splice(pick1Index, 1)[0];
    const pick2Index = Math.floor(rng() * archetypePool.length);
    const key2 = archetypePool[pick2Index];

    const base1 = BOSS_ARCHETYPES[key1];
    const base2 = BOSS_ARCHETYPES[key2];

    const duoModifier = duoModifiers[Math.floor(rng() * duoModifiers.length)];

    const bossA = {
        id: `boss_s${sectorIndex}_A_${base1.id}`,
        role: 'Alpha',
        archetypeId: base1.id,
        name: `${base1.name} [Sector ${sectorIndex + 1}]`,
        maxHp: Math.round(base1.baseHp * scaleFactor),
        hp: Math.round(base1.baseHp * scaleFactor),
        damage: Math.round(base1.baseDamage * (1.0 + sectorIndex * 0.25)),
        speed: base1.speed * (1.0 + Math.min(0.5, sectorIndex * 0.05)),
        attackType: base1.attackType,
        position: { x: -6 - rng() * 3, y: 0.5, z: encounterZ },
        color: base1.color,
        isDefeated: false,
    };

    const bossB = {
        id: `boss_s${sectorIndex}_B_${base2.id}`,
        role: 'Beta',
        archetypeId: base2.id,
        name: `${base2.name} [Sector ${sectorIndex + 1}]`,
        maxHp: Math.round(base2.baseHp * scaleFactor),
        hp: Math.round(base2.baseHp * scaleFactor),
        damage: Math.round(base2.baseDamage * (1.0 + sectorIndex * 0.25)),
        speed: base2.speed * (1.0 + Math.min(0.5, sectorIndex * 0.05)),
        attackType: base2.attackType,
        position: { x: 6 + rng() * 3, y: 0.5, z: encounterZ - 10 },
        color: base2.color,
        isDefeated: false,
    };

    return {
        id: `duo_encounter_s${sectorIndex}`,
        sectorIndex,
        encounterZ,
        scaleFactor,
        duoModifier,
        isCleared: false,
        bossA,
        bossB,
        totalInitialHp: bossA.maxHp + bossB.maxHp,
    };
}

/**
 * Applies damage to one or both bosses in a Boss Duo and evaluates synergy traits.
 */
export function damageBossDuo(bossDuo, bossRole, damage) {
    if (!bossDuo || bossDuo.isCleared) {
        return { damageDealt: 0, duoCleared: false, events: [] };
    }

    const events = [];
    const targetBoss = (bossRole === 'Alpha' || bossRole === bossDuo.bossA.id)
        ? bossDuo.bossA
        : bossDuo.bossB;

    if (targetBoss.isDefeated) {
        return { damageDealt: 0, duoCleared: false, events: [] };
    }

    // Shielded bond modifier: if other boss is alive, 25% damage transferred to partner
    let effectiveDmg = damage;
    const partner = targetBoss === bossDuo.bossA ? bossDuo.bossB : bossDuo.bossA;

    if (bossDuo.duoModifier === 'shielded_bond' && !partner.isDefeated) {
        const split = Math.round(damage * 0.25);
        effectiveDmg = damage - split;
        partner.hp = Math.max(0, partner.hp - split);
        events.push({
            event: 'bossDuo:shielded_bond_split',
            data: { target: targetBoss.id, partner: partner.id, splitDamage: split },
        });
        if (partner.hp <= 0) {
            partner.isDefeated = true;
            events.push({ event: 'bossDuo:boss_ko', data: { bossId: partner.id, role: partner.role } });
        }
    }

    const dealt = Math.min(targetBoss.hp, effectiveDmg);
    targetBoss.hp = Math.max(0, targetBoss.hp - dealt);

    events.push({
        event: 'bossDuo:boss_damaged',
        data: { bossId: targetBoss.id, role: targetBoss.role, damage: dealt, remainingHp: targetBoss.hp },
    });

    if (targetBoss.hp <= 0 && !targetBoss.isDefeated) {
        targetBoss.isDefeated = true;
        events.push({ event: 'bossDuo:boss_ko', data: { bossId: targetBoss.id, role: targetBoss.role } });

        // Berserk Frenzy modifier: when one dies, surviving boss gets +35% damage and speed
        if (!partner.isDefeated && bossDuo.duoModifier === 'berserk_frenzy') {
            partner.damage = Math.round(partner.damage * 1.35);
            partner.speed *= 1.35;
            events.push({
                event: 'bossDuo:berserk_enrage',
                data: { bossId: partner.id, newDamage: partner.damage },
            });
        }
    }

    if (bossDuo.bossA.isDefeated && bossDuo.bossB.isDefeated && !bossDuo.isCleared) {
        bossDuo.isCleared = true;
        events.push({
            event: 'bossDuo:cleared',
            data: {
                sectorIndex: bossDuo.sectorIndex,
                duoId: bossDuo.id,
                rewardCoins: 100 + bossDuo.sectorIndex * 50,
            },
        });
    }

    return { damageDealt: dealt, duoCleared: bossDuo.isCleared, events };
}

/**
 * Generates 3 seeded Rogue-like Perk Draft cards for checkpoint rewards.
 */
export function rollPerkDraft(checkpointIndex, runSeed = 1337) {
    const seed = normalizeSeed(runSeed) + checkpointIndex * 9973;
    const rng = createRng(seed);

    // Pick 3 unique cards from pool
    const poolCopy = [...PERK_POOL];
    const offeredCards = [];

    for (let i = 0; i < 3; i++) {
        if (poolCopy.length === 0) break;
        const index = Math.floor(rng() * poolCopy.length);
        const card = poolCopy.splice(index, 1)[0];
        offeredCards.push({
            ...card,
            offerSlot: i + 1, // keys [1, 2, 3]
        });
    }

    return {
        checkpointIndex,
        seed,
        cards: offeredCards,
        autoPickCardId: offeredCards[0]?.id || null, // default timeout pick
    };
}

/**
 * Applies a drafted perk card to a player's active perk inventory.
 */
export function applyPerkCard(inventory, perkCard) {
    if (!inventory) inventory = { perks: {}, stats: {} };
    if (!inventory.perks) inventory.perks = {};
    if (!inventory.stats) inventory.stats = {};

    const card = typeof perkCard === 'string'
        ? PERK_POOL.find((p) => p.id === perkCard)
        : perkCard;

    if (!card) return inventory;

    // Increment perk count
    inventory.perks[card.id] = (inventory.perks[card.id] || 0) + 1;

    // Stack stats
    for (const [statKey, value] of Object.entries(card.stats || {})) {
        if (typeof value === 'number') {
            inventory.stats[statKey] = (inventory.stats[statKey] || 0) + value;
        } else {
            inventory.stats[statKey] = value;
        }
    }

    return inventory;
}

/**
 * Calculates modified player stats incorporating all stacked perk draft cards.
 */
export function calculatePlayerPerkStats(baseStats = {}, perkInventory = {}) {
    const stats = { ...baseStats };
    const pStats = perkInventory.stats || {};

    if (pStats.paddleBoost) {
        stats.paddleThrust = (stats.paddleThrust ?? 200) * (1.0 + pStats.paddleBoost);
    }
    if (pStats.forwardSpeedBoost) {
        stats.forwardSpeedBonus = (stats.forwardSpeedBonus ?? 0) + pStats.forwardSpeedBoost;
    }
    if (pStats.maxHpBonus) {
        stats.maxHealth = (stats.maxHealth ?? 100) + pStats.maxHpBonus;
    }
    if (pStats.damageBonus) {
        stats.attackDamage = (stats.attackDamage ?? 10) + pStats.damageBonus;
    }
    if (pStats.knockbackMultiplier) {
        stats.knockback = (stats.knockback ?? 1.0) * pStats.knockbackMultiplier;
    }
    if (pStats.jumpBonus) {
        stats.jumpVelocity = (stats.jumpVelocity ?? 18) + pStats.jumpBonus;
    }
    if (pStats.lifestealRatio) {
        stats.lifestealRatio = (stats.lifestealRatio ?? 0) + pStats.lifestealRatio;
    }
    if (pStats.turnRateBonus) {
        stats.turnRate = (stats.turnRate ?? 2.2) * (1.0 + pStats.turnRateBonus);
    }
    if (pStats.reflectRatio) {
        stats.reflectRatio = (stats.reflectRatio ?? 0) + pStats.reflectRatio;
    }
    if (pStats.throwImmunity) {
        stats.throwImmunity = true;
    }
    if (pStats.coinAttractRadius) {
        stats.coinAttractRadius = Math.max(stats.coinAttractRadius ?? 0, pStats.coinAttractRadius);
    }
    if (pStats.phoenixRevive) {
        stats.phoenixRevive = (stats.phoenixRevive ?? 0) + pStats.phoenixRevive;
    }

    return stats;
}

/**
 * Global Seed Leaderboard Manager.
 * Stores, sorts, filters, and validates seeded run records.
 */
export class EndlessLeaderboard {
    constructor({ maxEntriesPerSeed = 100 } = {}) {
        this.maxEntriesPerSeed = maxEntriesPerSeed;
        // seedKey -> array of entries
        this.leaderboards = new Map();
    }

    getSeedKey(seed) {
        return `seed_${normalizeSeed(seed)}`;
    }

    recordRun({
        playerName = 'Navigator',
        seed = 1337,
        furthestZ = -1500,
        sectorsCleared = 0,
        bossesDefeated = 0,
        kills = 0,
        perksDrafted = [],
        durationMs = 0,
        timestamp = Date.now(),
    } = {}) {
        const seedKey = this.getSeedKey(seed);
        if (!this.leaderboards.has(seedKey)) {
            this.leaderboards.set(seedKey, []);
        }

        const entries = this.leaderboards.get(seedKey);
        const distance = Math.max(0, Math.round(Math.abs(furthestZ)));

        // Score formula: Distance (1 pt/m) + Sectors (1000 pts) + Bosses (1500 pts) + Kills (100 pts)
        const score = distance + sectorsCleared * 1000 + bossesDefeated * 1500 + kills * 100;

        const entry = {
            id: `run_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            playerName: String(playerName).slice(0, 24),
            seed: normalizeSeed(seed),
            score,
            distance,
            furthestZ,
            sectorsCleared,
            bossesDefeated,
            kills,
            perkCount: perksDrafted.length,
            perksDrafted: [...perksDrafted],
            durationMs,
            timestamp,
        };

        entries.push(entry);

        // Sort descending by score, tiebreak with faster duration then earlier timestamp
        entries.sort((a, b) => b.score - a.score || a.durationMs - b.durationMs || a.timestamp - b.timestamp);

        // Clamp to max entries
        if (entries.length > this.maxEntriesPerSeed) {
            entries.length = this.maxEntriesPerSeed;
        }

        const rank = entries.findIndex((e) => e.id === entry.id) + 1;
        return {
            entry,
            rank,
            totalRanked: entries.length,
            isNewTop10: rank <= 10,
        };
    }

    getTopScores(seed, limit = 10) {
        const seedKey = this.getSeedKey(seed);
        const list = this.leaderboards.get(seedKey) || [];
        return list.slice(0, limit);
    }

    getPlayerBest(seed, playerName) {
        const seedKey = this.getSeedKey(seed);
        const list = this.leaderboards.get(seedKey) || [];
        return list.find((e) => e.playerName.toLowerCase() === playerName.toLowerCase()) || null;
    }

    clear(seed = null) {
        if (seed != null) {
            this.leaderboards.delete(this.getSeedKey(seed));
        } else {
            this.leaderboards.clear();
        }
    }

    exportJSON(seed) {
        const seedKey = this.getSeedKey(seed);
        const entries = this.leaderboards.get(seedKey) || [];
        return JSON.stringify({ seed: normalizeSeed(seed), entries });
    }

    importJSON(jsonStr) {
        try {
            const parsed = JSON.parse(jsonStr);
            if (!parsed || !parsed.seed || !Array.isArray(parsed.entries)) return false;
            const seedKey = this.getSeedKey(parsed.seed);
            this.leaderboards.set(seedKey, parsed.entries);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Complete Endless Mode Session Controller.
 * Ties together SectorChainer, Perk Draft State, Boss Duos, and Telemetry.
 */
export class EndlessSession {
    constructor({ seed = 1337, playerName = 'Raft Captain' } = {}) {
        this.seed = normalizeSeed(seed);
        this.playerName = playerName;
        this.chainer = new SectorChainer(this.seed);
        this.leaderboard = new EndlessLeaderboard();

        this.leadZ = 0;
        this.furthestZ = 0;
        this.currentSectorIndex = 0;
        this.sectorsCleared = 0;
        this.bossesDefeated = 0;
        this.kills = 0;
        this.coins = 50;

        // Perk drafting state
        this.perkInventory = { perks: {}, stats: {} };
        this.activeDraftOffer = null; // { checkpointIndex, cards, timerMs }
        this.clearedCheckpoints = new Set();

        // Active encounter
        this.activeBossDuo = null;
        this.isGameOver = false;
        this.startTime = Date.now();
    }

    updateRaftZ(z) {
        this.leadZ = z;
        if (z < this.furthestZ) {
            this.furthestZ = z;
        }

        // Only manage endless sectors once past ENDLESS_START_Z
        if (z > ENDLESS_START_Z) {
            return { inEndless: false, newEvents: [] };
        }

        const events = [];
        const sectorIdx = getSectorIndexFromZ(z);
        this.currentSectorIndex = sectorIdx;

        // Update sector buffer
        this.chainer.updateLeadZ(z);
        const currentSector = this.chainer.getSector(sectorIdx);

        // Checkpoint crossings and perk draft detection
        if (currentSector) {
            for (const cp of currentSector.checkpoints) {
                if (z <= cp.z && !this.clearedCheckpoints.has(cp.id)) {
                    this.clearedCheckpoints.add(cp.id);
                    events.push({
                        event: 'endless:checkpoint_crossed',
                        data: { id: cp.id, checkpointIndex: cp.checkpointIndex, z: cp.z },
                    });

                    // Trigger Perk Draft at every 3rd checkpoint
                    if (cp.offersPerkDraft) {
                        this.activeDraftOffer = rollPerkDraft(cp.checkpointIndex, this.seed);
                        events.push({
                            event: 'endless:perk_draft_offered',
                            data: this.activeDraftOffer,
                        });
                    }
                }
            }

            // Check Boss Duo trigger
            if (currentSector.bossDuo && !currentSector.bossDuo.isCleared) {
                if (z <= currentSector.bossDuo.encounterZ + 40 && !this.activeBossDuo) {
                    this.activeBossDuo = currentSector.bossDuo;
                    events.push({
                        event: 'endless:boss_duo_spawned',
                        data: {
                            id: this.activeBossDuo.id,
                            sectorIndex: sectorIdx,
                            modifier: this.activeBossDuo.duoModifier,
                            bossA: this.activeBossDuo.bossA,
                            bossB: this.activeBossDuo.bossB,
                        },
                    });
                }
            }
        }

        return {
            inEndless: true,
            sectorIndex: sectorIdx,
            activeDraftOffer: this.activeDraftOffer,
            activeBossDuo: this.activeBossDuo,
            newEvents: events,
        };
    }

    chooseDraftCard(cardSlotIndex) {
        if (!this.activeDraftOffer) return null;
        const card = this.activeDraftOffer.cards.find((c) => c.offerSlot === cardSlotIndex);
        if (!card) return null;

        applyPerkCard(this.perkInventory, card);
        const picked = { ...card };
        this.activeDraftOffer = null; // Clear offer after pick
        return picked;
    }

    finishRun() {
        this.isGameOver = true;
        const durationMs = Date.now() - this.startTime;
        const draftedList = Object.entries(this.perkInventory.perks).flatMap(([id, count]) =>
            Array(count).fill(id)
        );

        return this.leaderboard.recordRun({
            playerName: this.playerName,
            seed: this.seed,
            furthestZ: this.furthestZ,
            sectorsCleared: this.sectorsCleared,
            bossesDefeated: this.bossesDefeated,
            kills: this.kills,
            perksDrafted: draftedList,
            durationMs,
        });
    }
}
