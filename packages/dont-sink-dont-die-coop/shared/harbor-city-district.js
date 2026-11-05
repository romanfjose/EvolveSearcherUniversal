/**
 * Act II Harbor City Calm Lagoon & Interactive Pier District (w5a-13)
 * (`shared/harbor-city-district.js`)
 *
 * Implements Helmet 04 & Sovereign Core Strategic Haven:
 * Defines the Act II City Shop Haven (z = -140 to -270) across an 80m wide basin (-40 <= x <= 40).
 * Provides a serene pause in the high-stakes 1500m river run featuring:
 *   1. Zero River Current: Dynamic dampening drops normal river forward flow to 0.0 inside the lagoon.
 *   2. 100% Enemy Truce Barrier: Hostile projectiles and chasing monsters cannot breach the seawalls.
 *   3. Three Mooring Berths:
 *      - Armory Wharf: Weapons, ballistas, squeaky hammers & turret upgrades.
 *      - Shipwright Drydock: Hull repair, armor plating, engine overhauls & motor mounts.
 *      - Tavern Sanctuary Pier: Crew refreshments, tarot blessings, morale & rumor banter.
 *   4. Automatic Shop Prompt Activation: Zero-bureaucracy proximity mooring triggers shop UI prompt
 *      instantly when moored within berth interaction radius.
 *
 * Pure, deterministic ES module. Zero DOM/Three.js or external dependencies.
 */

/**
 * Geometric and gameplay layout definition of the Harbor City Calm Lagoon & Pier District.
 */
export const HARBOR_CITY_LAYOUT = Object.freeze({
    id: 'act2_harbor_city_lagoon',
    name: 'Harbor City Calm Lagoon & Pier District',
    act: 2,
    biome: 'Drowned Harbor',

    // Act II Haven Z-extent and Basin Width (80m wide: x from -40 to +40)
    zRange: Object.freeze({
        entryZ: -140,
        exitZ: -270,
        minZ: -270,
        maxZ: -140,
        length: 130, // 270 - 140
    }),
    basin: Object.freeze({
        minX: -40,
        maxX: 40,
        width: 80,
        centerWaterlineX: 0,
        waterDepth: 4.5,
    }),

    // Seawall Barrier & Channel Breaches
    seawalls: Object.freeze({
        northGateZ: -140,
        southGateZ: -270,
        channelOpeningWidth: 26, // Width of seawall gap allowing raft navigation
        truceBarrierActive: true,
        projectileSuppression: true,
        truceDamageImmunity: 1.0, // 100% damage reduction from outside threats
    }),

    // Current & Kinematics Modifiers
    waterDynamics: Object.freeze({
        ambientRiverCurrent: 0.0, // 0.0 m/s river current inside lagoon
        entryBlendDistanceZ: 15.0, // Smooth transition zone at lagoon gates
        lateralDriftDamping: 0.85,  // Dampen wild drift velocity
        surfaceCalmFactor: 0.15,   // Waves suppressed by 85%
    }),

    // Three Distinct Mooring Berths
    berths: Object.freeze([
        {
            id: 'armory_wharf',
            name: 'Armory Wharf',
            category: 'weapon_and_turrets',
            promptText: 'Moored at Armory Wharf — Press [E] for Weapons & Turrets',
            promptAction: 'open_armory',
            position: Object.freeze({ x: 18.0, y: 0.25, z: -175.0 }),
            mooringRadius: 9.0,
            dockFacing: 'west', // Dock sits on east bank, facing into basin
            bannerColor: '#f59e0b', // Amber/gold
            services: Object.freeze(['weapons', 'gadgets', 'turrets', 'ammunition']),
        },
        {
            id: 'shipwright_drydock',
            name: 'Shipwright Drydock',
            category: 'hull_and_engine',
            promptText: 'Moored at Shipwright Drydock — Press [E] for Repairs & Hull Plating',
            promptAction: 'open_shipwright',
            position: Object.freeze({ x: 22.0, y: 0.25, z: -215.0 }),
            mooringRadius: 10.0,
            dockFacing: 'west',
            bannerColor: '#38bdf8', // Sky cyan
            services: Object.freeze(['hull_repairs', 'ironclad_armor', 'motor_overhaul', 'patch_kits']),
        },
        {
            id: 'tavern_sanctuary_pier',
            name: 'Tavern Sanctuary Pier',
            category: 'sanctuary_and_tarot',
            promptText: 'Moored at Tavern Pier — Press [E] for Refreshments & Blessings',
            promptAction: 'open_tavern',
            position: Object.freeze({ x: -20.0, y: 0.25, z: -195.0 }),
            mooringRadius: 9.5,
            dockFacing: 'east', // Dock sits on west bank, facing into basin
            bannerColor: '#a855f7', // Mystic purple
            services: Object.freeze(['tarot_blessings', 'crew_rations', 'crew_banter', 'vitality_restoration']),
        },
    ]),
});

/**
 * Calculates whether a position vector is inside the Harbor City Calm Lagoon basin.
 *
 * @param {{ x?: number, z?: number }|null} position
 * @returns {boolean}
 */
export function isInsideHarborBasin(position) {
    if (!position || typeof position.z !== 'number') return false;
    const x = typeof position.x === 'number' ? position.x : 0;
    const z = position.z;

    const inZ = z <= HARBOR_CITY_LAYOUT.zRange.maxZ && z >= HARBOR_CITY_LAYOUT.zRange.minZ;
    const inX = x >= HARBOR_CITY_LAYOUT.basin.minX && x <= HARBOR_CITY_LAYOUT.basin.maxX;

    return inZ && inX;
}

/**
 * Finds the nearest mooring berth to the given coordinates.
 *
 * @param {{ x?: number, y?: number, z?: number }|null} position
 * @returns {{
 *   berth: (typeof HARBOR_CITY_LAYOUT.berths[number]|null),
 *   distance: number,
 *   isMoored: boolean,
 *   promptActive: boolean,
 *   promptText: string|null,
 *   promptAction: string|null
 * }}
 */
export function getNearestHarborBerth(position) {
    if (!position || typeof position.z !== 'number') {
        return {
            berth: null,
            distance: Infinity,
            isMoored: false,
            promptActive: false,
            promptText: null,
            promptAction: null,
        };
    }

    const px = typeof position.x === 'number' ? position.x : 0;
    const pz = position.z;

    let closest = null;
    let minDistanceSq = Infinity;

    for (const berth of HARBOR_CITY_LAYOUT.berths) {
        const dx = px - berth.position.x;
        const dz = pz - berth.position.z;
        const dSq = dx * dx + dz * dz;

        if (dSq < minDistanceSq) {
            minDistanceSq = dSq;
            closest = berth;
        }
    }

    if (!closest) {
        return {
            berth: null,
            distance: Infinity,
            isMoored: false,
            promptActive: false,
            promptText: null,
            promptAction: null,
        };
    }

    const distance = Math.sqrt(minDistanceSq);
    const isMoored = distance <= closest.mooringRadius;

    return {
        berth: closest,
        distance,
        isMoored,
        promptActive: isMoored,
        promptText: isMoored ? closest.promptText : null,
        promptAction: isMoored ? closest.promptAction : null,
    };
}

/**
 * Computes the complete environmental, tactical, and mooring state of a player/craft in or around
 * the Harbor City Lagoon.
 *
 * @param {{ x?: number, y?: number, z?: number }|null} position
 * @param {number} [baseRiverSpeed=12.0] - Standard downstream river current speed (m/s) outside haven.
 * @returns {{
 *   isInHarbor: boolean,
 *   isInBasin: boolean,
 *   effectiveCurrent: number,
 *   currentFactor: number,
 *   truceBarrierActive: boolean,
 *   enemyTruceEnforced: boolean,
 *   seawallDamageReduction: number,
 *   nearestBerth: ReturnType<typeof getNearestHarborBerth>,
 *   isMoored: boolean,
 *   promptActive: boolean,
 *   promptText: string|null,
 *   promptAction: string|null,
 *   zoneName: string
 * }}
 */
export function getHarborZoneState(position, baseRiverSpeed = 12.0) {
    if (!position || typeof position.z !== 'number') {
        return {
            isInHarbor: false,
            isInBasin: false,
            effectiveCurrent: baseRiverSpeed,
            currentFactor: 1.0,
            truceBarrierActive: false,
            enemyTruceEnforced: false,
            seawallDamageReduction: 0.0,
            nearestBerth: getNearestHarborBerth(null),
            isMoored: false,
            promptActive: false,
            promptText: null,
            promptAction: null,
            zoneName: 'Open River',
        };
    }

    const z = position.z;
    const zRange = HARBOR_CITY_LAYOUT.zRange;
    const blendDist = HARBOR_CITY_LAYOUT.waterDynamics.entryBlendDistanceZ;

    // Check if within the full Z-band of Act II Harbor Haven
    const inHarborZ = z <= zRange.maxZ && z >= zRange.minZ;
    const inBasin = isInsideHarborBasin(position);

    // Calculate current dampening factor [0.0 = completely calm lagoon, 1.0 = raging open river]
    let currentFactor = 1.0;

    if (inBasin) {
        // Core lagoon basin has zero river current
        // Soft blend near north (entry) and south (exit) gate perimeters
        const distFromNorthGate = zRange.maxZ - z;
        const distFromSouthGate = z - zRange.minZ;

        if (distFromNorthGate < blendDist) {
            currentFactor = Math.max(0, distFromNorthGate / blendDist) * 0.0; // Rapidly drops to 0 inside
        } else if (distFromSouthGate < blendDist) {
            // Approaching south exit gate
            currentFactor = Math.min(1.0, (blendDist - distFromSouthGate) / blendDist);
        } else {
            currentFactor = 0.0;
        }
    } else if (inHarborZ) {
        // Outside lateral seawalls (x < -40 or x > 40)
        currentFactor = 1.0;
    } else {
        // Outside Z-boundary
        const distToNorthGate = z - zRange.maxZ;
        const distToSouthGate = zRange.minZ - z;

        if (distToNorthGate > 0 && distToNorthGate < blendDist) {
            // Approaching north gate entry
            currentFactor = Math.min(1.0, distToNorthGate / blendDist);
        } else if (distToSouthGate > 0 && distToSouthGate < blendDist) {
            // Exiting downriver
            currentFactor = Math.min(1.0, 1.0 - (distToSouthGate / blendDist));
        } else {
            currentFactor = 1.0;
        }
    }

    const effectiveCurrent = HARBOR_CITY_LAYOUT.waterDynamics.ambientRiverCurrent +
        (baseRiverSpeed * Math.max(0, Math.min(1, currentFactor)));

    // Truce barrier is 100% active inside the seawalls of the lagoon
    const enemyTruceEnforced = inBasin;
    const truceBarrierActive = inBasin;
    const seawallDamageReduction = inBasin ? HARBOR_CITY_LAYOUT.seawalls.truceDamageImmunity : 0.0;

    // Mooring berths evaluation
    const nearestBerth = getNearestHarborBerth(position);
    const isMoored = inBasin && nearestBerth.isMoored;
    const promptActive = isMoored;
    const promptText = isMoored ? nearestBerth.promptText : null;
    const promptAction = isMoored ? nearestBerth.promptAction : null;

    let zoneName = 'Open River';
    if (inBasin) {
        if (isMoored && nearestBerth.berth) {
            zoneName = `Harbor Basin: ${nearestBerth.berth.name}`;
        } else {
            zoneName = 'Harbor City Calm Lagoon';
        }
    } else if (inHarborZ) {
        zoneName = 'Outer Harbor Approach';
    }

    return {
        isInHarbor: inHarborZ,
        isInBasin: inBasin,
        effectiveCurrent,
        currentFactor,
        truceBarrierActive,
        enemyTruceEnforced,
        seawallDamageReduction,
        nearestBerth,
        isMoored,
        promptActive,
        promptText,
        promptAction,
        zoneName,
    };
}
