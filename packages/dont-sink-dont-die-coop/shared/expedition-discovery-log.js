/**
 * Sanctuary Island Discovery & Expedition Journal Module
 * (`shared/expedition-discovery-log.js`)
 *
 * Sovereign Core & Helmet 04 Directive:
 * High-yield, asymmetric reward and scenic landmark discovery engine.
 * Rewards pilots with +20 Discovery Gold and a scenic landmark banner the first
 * time they dock at each major Sanctuary Platform, Harbor District pier, or ancient shrine.
 *
 * Pure, deterministic ES module with zero external dependencies. Headless-safe.
 */

/**
 * Standard Discovery Gold reward bestowed upon first-time docking.
 */
export const DISCOVERY_GOLD_REWARD = 20;

/**
 * Comprehensive Landmark & Sanctuary Pier Registry spanning all 4 River Acts.
 * Each landmark specifies:
 * - id: Unique string identifier
 * - name: Display title
 * - act: River Act index (1 to 4)
 * - type: 'sanctuary_platform' | 'harbor_pier' | 'ancient_shrine' | 'outpost'
 * - bounds: Axis-aligned bounding box { minX, maxX, minZ, maxZ, minY?, maxY? }
 * - center: Centroid coordinates { x, y, z }
 * - dockRadius: Proximity fallback radius in meters
 * - banner: Visual display metadata { title, subtitle, tag, icon, soundEffect, atmosphereColor }
 * - lore: Flavor journal entry text explaining the landmark's historical/river significance
 */
export const LANDMARK_REGISTRY = Object.freeze([
    // Act I: Amber Canyon Headwaters (z: 0 to -375)
    {
        id: 'act1_timber_mill_haven',
        name: 'Redwood Flume Sanctuary',
        act: 1,
        type: 'sanctuary_platform',
        bounds: { minX: -26, maxX: -10, minZ: -125, maxZ: -95, minY: 0.2, maxY: 3.5 },
        center: { x: -18, y: 0.8, z: -110 },
        dockRadius: 16,
        banner: {
            title: 'REDWOOD FLUME SANCTUARY',
            subtitle: 'Old Timber Haven — Act I',
            tag: 'SANCTUARY PLATFORM',
            icon: '🌲',
            soundEffect: 'discovery_chime_wood',
            atmosphereColor: '#ffb347',
        },
        lore: 'A centuries-old redwood logging camp platform with mooring bollards and calm backwater eddies.',
    },
    {
        id: 'act1_whirlpool_watch_shrine',
        name: 'Rapids Watchtower Shrine',
        act: 1,
        type: 'ancient_shrine',
        bounds: { minX: 10, maxX: 26, minZ: -290, maxZ: -255, minY: 0.2, maxY: 3.5 },
        center: { x: 18, y: 1.0, z: -272 },
        dockRadius: 16,
        banner: {
            title: 'RAPIDS WATCHTOWER SHRINE',
            subtitle: 'Canyon Lookout — Act I',
            tag: 'ANCIENT SHRINE',
            icon: '🗿',
            soundEffect: 'discovery_chime_canyon',
            atmosphereColor: '#f39c12',
        },
        lore: 'Perched high above the amber froth, river monks kept watch over migrating mud beasts and treacherous rapids.',
    },

    // Act II: Walled Harbor City & Smuggler Docks (z: -375 to -750)
    {
        id: 'act2_harbor_armory_wharf',
        name: 'Harbor Armory Wharf',
        act: 2,
        type: 'harbor_pier',
        bounds: { minX: 10, maxX: 32, minZ: -250, maxZ: -150, minY: 0.2, maxY: 4.0 },
        center: { x: 20, y: 0.75, z: -200 },
        dockRadius: 22,
        banner: {
            title: 'HARBOR ARMORY WHARF',
            subtitle: 'Industrial Dock & Supply Pier — Act II',
            tag: 'HARBOR DISTRICT',
            icon: '⚓',
            soundEffect: 'discovery_chime_harbor',
            atmosphereColor: '#00d2ff',
        },
        lore: 'The main trade pier of the Walled City, where merchants forge hulls and harbor patrol monitors river traffic.',
    },
    {
        id: 'act2_smugglers_cove_pier',
        name: "Smuggler's Mooring Basin",
        act: 2,
        type: 'harbor_pier',
        bounds: { minX: -32, maxX: -12, minZ: -560, maxZ: -510, minY: 0.2, maxY: 3.5 },
        center: { x: -22, y: 0.8, z: -535 },
        dockRadius: 18,
        banner: {
            title: "SMUGGLER'S MOORING BASIN",
            subtitle: 'Neon Pier Outpost — Act II',
            tag: 'HARBOR DISTRICT',
            icon: '🏮',
            soundEffect: 'discovery_chime_neon',
            atmosphereColor: '#e056fd',
        },
        lore: 'Tucked beneath rusted drawbridges, shadowy bargemen stash illicit fireworks and rare black-market gadgets.',
    },

    // Act III: Bioluminescent Abyssal Gorge & Sunken Ruins (z: -750 to -1125)
    {
        id: 'act3_crystal_ruins_sanctuary',
        name: 'Sunken Colonnade Sanctuary',
        act: 3,
        type: 'sanctuary_platform',
        bounds: { minX: -24, maxX: -6, minZ: -870, maxZ: -830, minY: 0.2, maxY: 4.0 },
        center: { x: -15, y: 1.2, z: -850 },
        dockRadius: 18,
        banner: {
            title: 'SUNKEN COLONNADE SANCTUARY',
            subtitle: 'Ancient Ruin Plaza — Act III',
            tag: 'SANCTUARY PLATFORM',
            icon: '🔮',
            soundEffect: 'discovery_chime_crystal',
            atmosphereColor: '#20bf6b',
        },
        lore: 'Carved obsidian plazas glowing with luminescent moss; sacred runes shield moored watercraft from abyssal tentacles.',
    },
    {
        id: 'act3_deep_obelisk_shrine',
        name: 'Abyssal Geyser Shrine',
        act: 3,
        type: 'ancient_shrine',
        bounds: { minX: 8, maxX: 26, minZ: -1060, maxZ: -1015, minY: 0.2, maxY: 4.5 },
        center: { x: 17, y: 1.5, z: -1038 },
        dockRadius: 18,
        banner: {
            title: 'ABYSSAL GEYSER SHRINE',
            subtitle: 'Subterranean Altar — Act III',
            tag: 'ANCIENT SHRINE',
            icon: '✨',
            soundEffect: 'discovery_chime_abyss',
            atmosphereColor: '#0fb9b1',
        },
        lore: 'A towering crystal spire humming with anti-gravity thermal currents, honoring ancient pilots of the drowned depth.',
    },

    // Act IV: Tempest Maelstrom & Citadel Mouth (z: -1125 to -1500+)
    {
        id: 'act4_citadel_bastion_dock',
        name: 'Maelstrom Citadel Bastion',
        act: 4,
        type: 'sanctuary_platform',
        bounds: { minX: -22, maxX: 22, minZ: -1380, maxZ: -1320, minY: 0.2, maxY: 5.0 },
        center: { x: 0, y: 1.8, z: -1350 },
        dockRadius: 24,
        banner: {
            title: 'MAELSTROM CITADEL BASTION',
            subtitle: 'Final Haven Gate — Act IV',
            tag: 'SANCTUARY PLATFORM',
            icon: '⚡',
            soundEffect: 'discovery_chime_citadel',
            atmosphereColor: '#eb3b5a',
        },
        lore: 'Heavy granite breakwaters fortified with lightning rods, providing the final respite before the Kraken Leviathan trench.',
    },
]);

/**
 * Creates a clean, empty expedition discovery log state.
 *
 * @param {object} [initial={}]
 * @returns {object} Expedition discovery log state
 */
export function createExpeditionDiscoveryLog(initial = {}) {
    return {
        discoveredIds: Array.isArray(initial.discoveredIds) ? [...initial.discoveredIds] : [],
        totalDiscoveryGoldAwarded: Number(initial.totalDiscoveryGoldAwarded) || 0,
        discoveries: Array.isArray(initial.discoveries) ? [...initial.discoveries] : [],
        lastDiscoveredId: initial.lastDiscoveredId || null,
        lastBanner: initial.lastBanner || null,
        createdAt: initial.createdAt || Date.now(),
        updatedAt: initial.updatedAt || Date.now(),
    };
}

/**
 * Determines whether a 2D or 3D player position is within docking boundary of a landmark.
 * Checks axis-aligned 3D/2D bounding box first, then Euclidean radial distance fallback.
 *
 * @param {object} playerPos - { x, y?, z }
 * @param {object} landmark - Landmark registry entry
 * @returns {boolean}
 */
export function isPositionAtLandmark(playerPos, landmark) {
    if (!playerPos || !landmark || typeof playerPos.z !== 'number' || typeof playerPos.x !== 'number') {
        return false;
    }

    const { x, z } = playerPos;
    const y = typeof playerPos.y === 'number' ? playerPos.y : (landmark.center?.y ?? 0.8);

    // 1. Check AABB bounds if available
    const b = landmark.bounds;
    if (b && typeof b.minX === 'number' && typeof b.maxX === 'number' && typeof b.minZ === 'number' && typeof b.maxZ === 'number') {
        const inX = x >= b.minX && x <= b.maxX;
        const inZ = z >= b.minZ && z <= b.maxZ;
        const inY = (b.minY === undefined || y >= b.minY - 0.5) && (b.maxY === undefined || y <= b.maxY + 0.5);
        if (inX && inZ && inY) {
            return true;
        }
    }

    // 2. Proximity radial fallback around center
    if (landmark.center && typeof landmark.center.x === 'number' && typeof landmark.center.z === 'number') {
        const dx = x - landmark.center.x;
        const dz = z - landmark.center.z;
        const distSq = dx * dx + dz * dz;
        const radius = landmark.dockRadius || 16;
        if (distSq <= radius * radius) {
            return true;
        }
    }

    return false;
}

/**
 * Finds the nearest matching landmark for a given player position.
 *
 * @param {object} playerPos - { x, y?, z }
 * @param {Array<object>} [registry=LANDMARK_REGISTRY]
 * @returns {object|null} Matching landmark or null
 */
export function findLandmarkAtPosition(playerPos, registry = LANDMARK_REGISTRY) {
    if (!playerPos || !Array.isArray(registry)) return null;

    for (const landmark of registry) {
        if (isPositionAtLandmark(playerPos, landmark)) {
            return landmark;
        }
    }
    return null;
}

/**
 * Core discovery evaluation:
 * Checks player's position against the landmark registry. If the player has docked
 * at a major Sanctuary Platform or Harbor District pier for the first time:
 * - Records the landmark in the expedition log
 * - Bestows +20 Discovery Gold
 * - Constructs and returns the scenic landmark banner view model
 *
 * If the landmark was already discovered, returns { discovered: false, alreadyDiscovered: true, ... } with 0 gold.
 * If no landmark is within docking reach, returns { discovered: false, landmark: null, ... }.
 *
 * @param {object} log - Expedition discovery log state
 * @param {object} playerPos - { x, y?, z }
 * @param {object} [options={}]
 * @param {Array<object>} [options.registry=LANDMARK_REGISTRY] - Optional custom landmark registry
 * @param {number} [options.rewardAmount=DISCOVERY_GOLD_REWARD] - Gold reward override
 * @param {number} [options.timestamp=Date.now()] - Timestamp
 * @param {boolean} [options.onSolid=true] - Optional docking requirement (e.g. on solid dock surface)
 * @returns {object} Discovery result receipt
 */
export function recordLandmarkDiscovery(log, playerPos, options = {}) {
    const registry = options.registry || LANDMARK_REGISTRY;
    const rewardAmount = typeof options.rewardAmount === 'number' ? options.rewardAmount : DISCOVERY_GOLD_REWARD;
    const timestamp = typeof options.timestamp === 'number' ? options.timestamp : Date.now();

    if (!log) {
        return {
            discovered: false,
            alreadyDiscovered: false,
            goldAwarded: 0,
            banner: null,
            landmark: null,
            error: 'missing_log',
        };
    }

    // Ensure log structure integrity
    if (!Array.isArray(log.discoveredIds)) log.discoveredIds = [];
    if (!Array.isArray(log.discoveries)) log.discoveries = [];
    if (typeof log.totalDiscoveryGoldAwarded !== 'number') log.totalDiscoveryGoldAwarded = 0;

    const landmark = findLandmarkAtPosition(playerPos, registry);
    if (!landmark) {
        return {
            discovered: false,
            alreadyDiscovered: false,
            goldAwarded: 0,
            banner: null,
            landmark: null,
            totalDiscovered: log.discoveredIds.length,
            totalRegistryLandmarks: registry.length,
        };
    }

    // Check if already discovered in this expedition
    if (log.discoveredIds.includes(landmark.id)) {
        return {
            discovered: false,
            alreadyDiscovered: true,
            landmarkId: landmark.id,
            landmark,
            goldAwarded: 0,
            banner: null,
            totalDiscovered: log.discoveredIds.length,
            totalRegistryLandmarks: registry.length,
        };
    }

    // First-time discovery!
    log.discoveredIds.push(landmark.id);
    log.totalDiscoveryGoldAwarded += rewardAmount;
    log.lastDiscoveredId = landmark.id;
    log.updatedAt = timestamp;

    const banner = {
        ...landmark.banner,
        landmarkId: landmark.id,
        rewardGold: rewardAmount,
        discoveredAt: timestamp,
        discoveryIndex: log.discoveredIds.length,
        totalLandmarks: registry.length,
        act: landmark.act,
        lore: landmark.lore,
    };

    const discoveryRecord = {
        id: landmark.id,
        name: landmark.name,
        act: landmark.act,
        type: landmark.type,
        goldAwarded: rewardAmount,
        timestamp,
        playerPos: {
            x: Number(playerPos.x?.toFixed?.(2) ?? playerPos.x),
            y: Number(playerPos.y?.toFixed?.(2) ?? playerPos.y ?? 0),
            z: Number(playerPos.z?.toFixed?.(2) ?? playerPos.z),
        },
    };

    log.discoveries.push(discoveryRecord);
    log.lastBanner = banner;

    return {
        discovered: true,
        alreadyDiscovered: false,
        landmarkId: landmark.id,
        landmark,
        goldAwarded: rewardAmount,
        banner,
        totalDiscovered: log.discoveredIds.length,
        totalRegistryLandmarks: registry.length,
        allDiscovered: log.discoveredIds.length >= registry.length,
    };
}

/**
 * Returns a summary view-model of the player's expedition journal.
 *
 * @param {object} log - Expedition discovery log state
 * @param {Array<object>} [registry=LANDMARK_REGISTRY]
 * @returns {object} Journal summary view model
 */
export function getExpeditionJournalSummary(log, registry = LANDMARK_REGISTRY) {
    const discoveredIds = new Set(log?.discoveredIds || []);
    const totalCount = registry.length;
    const discoveredCount = discoveredIds.size;
    const progressPct = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;

    const entries = registry.map((landmark) => {
        const isFound = discoveredIds.has(landmark.id);
        const record = (log?.discoveries || []).find((d) => d.id === landmark.id);
        return {
            id: landmark.id,
            name: landmark.name,
            act: landmark.act,
            type: landmark.type,
            discovered: isFound,
            goldAwarded: isFound ? (record?.goldAwarded ?? DISCOVERY_GOLD_REWARD) : 0,
            lore: isFound ? landmark.lore : '??? [Dock at this sanctuary to decipher expedition lore]',
            icon: landmark.banner?.icon || '📍',
            tag: landmark.banner?.tag || 'LANDMARK',
            atmosphereColor: landmark.banner?.atmosphereColor || '#ffffff',
        };
    });

    return {
        totalLandmarks: totalCount,
        discoveredCount,
        progressPct,
        totalGoldAwarded: log?.totalDiscoveryGoldAwarded || 0,
        allDiscovered: discoveredCount >= totalCount,
        entries,
    };
}

/**
 * Serializes the log for network transmission or local storage.
 *
 * @param {object} log
 * @returns {string} JSON string
 */
export function serializeExpeditionLog(log) {
    return JSON.stringify({
        discoveredIds: log?.discoveredIds || [],
        totalDiscoveryGoldAwarded: log?.totalDiscoveryGoldAwarded || 0,
        discoveries: log?.discoveries || [],
        lastDiscoveredId: log?.lastDiscoveredId || null,
        createdAt: log?.createdAt || Date.now(),
        updatedAt: log?.updatedAt || Date.now(),
    });
}

/**
 * Deserializes an expedition discovery log from JSON.
 *
 * @param {string|object} raw
 * @returns {object} Clean log instance
 */
export function deserializeExpeditionLog(raw) {
    if (!raw) return createExpeditionDiscoveryLog();
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return createExpeditionDiscoveryLog(parsed);
    } catch {
        return createExpeditionDiscoveryLog();
    }
}
