/**
 * River Route Landmark & Zone Payoff Verifier
 * (`shared/landmark-payoff-verifier.js`)
 *
 * Sovereign Core & Videogame Helmet 07 Directive:
 * Synthetic José World Connoisseur & Purist Curator.
 *
 * Every drop of visual attention is a promise to the player's mind.
 * Matches visual loudness to actual purpose and flavor:
 * 1. 'true_signpost': Tells the player where they are. Signals authentic zonal transitions.
 * 2. 'centerpiece_magnet': Calls the player's eye and demands focus, MUST deliver a real,
 *    satisfying gameplay payoff the moment the player reaches it.
 *
 * Verifies key landmark zones down the 1500m river route:
 * - Tutorial Sanctuary Dock (z = -42) -> 'sanctuary_heal'
 * - Centreline Whirlpool (z = -76) -> 'vortex_slingshot'
 * - Whitewater Rapids (z = -112) -> 'downriver_speed_boost'
 * - Walled Harbor City & Police Promenade (z = -145..-255) -> 'police_crossfire_and_armory'
 * - Sunken Crystal Temples (z = -750) -> 'sanctuary_heal'
 * - Volcanic Caldera (z = -1150) -> 'downriver_speed_boost'
 * - Dread Kraken Gate (z = -1420) -> 'boss_encounter'
 * - Finish Arch (z = -1500) -> 'run_victory'
 *
 * Pure, deterministic ES module. Zero DOM/window/global Three.js leaks.
 */

/**
 * Valid curation tiers under Videogame Helmet 07.
 */
export const CURATION_TIERS = Object.freeze({
    TRUE_SIGNPOST: 'true_signpost',
    CENTERPIECE_MAGNET: 'centerpiece_magnet',
    QUIET_TEXTURE: 'quiet_texture',
});

/**
 * Concrete gameplay payoffs required for active landmark zones.
 */
export const GAMEPLAY_PAYOFFS = Object.freeze({
    SANCTUARY_HEAL: 'sanctuary_heal',
    VORTEX_SLINGSHOT: 'vortex_slingshot',
    DOWNRIVER_SPEED_BOOST: 'downriver_speed_boost',
    POLICE_CROSSFIRE_AND_ARMORY: 'police_crossfire_and_armory',
    BOSS_ENCOUNTER: 'boss_encounter',
    RUN_VICTORY: 'run_victory',
});

/**
 * Authoritative river route key zones along the 1500m river course.
 */
export const RIVER_KEY_ZONES = Object.freeze([
    Object.freeze({
        id: 'tutorial_sanctuary_dock',
        name: 'Tutorial Sanctuary Dock',
        curationTier: CURATION_TIERS.CENTERPIECE_MAGNET,
        payoff: GAMEPLAY_PAYOFFS.SANCTUARY_HEAL,
        center: Object.freeze({ x: -16, z: -42 }),
        targetZ: -42,
        zRange: Object.freeze({ minZ: -54, maxZ: -30 }),
        xRange: Object.freeze({ minX: -40, maxX: 40 }),
        description: 'First resting platform with campfire repair beacon and tutorial mooring.',
    }),
    Object.freeze({
        id: 'centreline_whirlpool',
        name: 'Centreline Whirlpool',
        curationTier: CURATION_TIERS.CENTERPIECE_MAGNET,
        payoff: GAMEPLAY_PAYOFFS.VORTEX_SLINGSHOT,
        center: Object.freeze({ x: 0, z: -76 }),
        targetZ: -76,
        zRange: Object.freeze({ minZ: -88, maxZ: -64 }),
        xRange: Object.freeze({ minX: -22, maxX: 22 }),
        description: 'Abyssal swirl vortex delivering high-torque slingshot propulsion to skilled pilots.',
    }),
    Object.freeze({
        id: 'whitewater_rapids',
        name: 'Whitewater Rapids',
        curationTier: CURATION_TIERS.CENTERPIECE_MAGNET,
        payoff: GAMEPLAY_PAYOFFS.DOWNRIVER_SPEED_BOOST,
        center: Object.freeze({ x: 0, z: -112 }),
        targetZ: -112,
        zRange: Object.freeze({ minZ: -128, maxZ: -96 }),
        xRange: Object.freeze({ minX: -40, maxX: 40 }),
        description: 'Surging river flume with whitecaps and speed boost pushdown.',
    }),
    Object.freeze({
        id: 'walled_harbor_city_police_promenade',
        name: 'Walled Harbor City & Police Promenade',
        curationTier: CURATION_TIERS.CENTERPIECE_MAGNET,
        payoff: GAMEPLAY_PAYOFFS.POLICE_CROSSFIRE_AND_ARMORY,
        center: Object.freeze({ x: 0, z: -200 }),
        targetZ: -200,
        zRange: Object.freeze({ minZ: -255, maxZ: -145 }),
        xRange: Object.freeze({ minX: -45, maxX: 45 }),
        description: 'Act II fortified haven featuring armory shop, drydock repairs, and police sniper crossfire.',
    }),
    Object.freeze({
        id: 'sunken_crystal_temples',
        name: 'Sunken Crystal Temples',
        curationTier: CURATION_TIERS.TRUE_SIGNPOST,
        payoff: GAMEPLAY_PAYOFFS.SANCTUARY_HEAL,
        center: Object.freeze({ x: 0, z: -750 }),
        targetZ: -750,
        zRange: Object.freeze({ minZ: -780, maxZ: -720 }),
        xRange: Object.freeze({ minX: -45, maxX: 45 }),
        description: 'Bioluminescent ancient shrine obelisks marking Act III entry and restoring crew health.',
    }),
    Object.freeze({
        id: 'volcanic_caldera',
        name: 'Volcanic Caldera',
        curationTier: CURATION_TIERS.TRUE_SIGNPOST,
        payoff: GAMEPLAY_PAYOFFS.DOWNRIVER_SPEED_BOOST,
        center: Object.freeze({ x: 0, z: -1150 }),
        targetZ: -1150,
        zRange: Object.freeze({ minZ: -1180, maxZ: -1120 }),
        xRange: Object.freeze({ minX: -45, maxX: 45 }),
        description: 'Act IV hydrothermal caldera vents propelling crafts into the ash-fall eclipse.',
    }),
    Object.freeze({
        id: 'dread_kraken_gate',
        name: 'Dread Kraken Gate',
        curationTier: CURATION_TIERS.CENTERPIECE_MAGNET,
        payoff: GAMEPLAY_PAYOFFS.BOSS_ENCOUNTER,
        center: Object.freeze({ x: 0, z: -1420 }),
        targetZ: -1420,
        zRange: Object.freeze({ minZ: -1450, maxZ: -1390 }),
        xRange: Object.freeze({ minX: -45, maxX: 45 }),
        description: 'Massive obsidian basalt gate heralding the 3-phase Dread Kraken boss encounter.',
    }),
    Object.freeze({
        id: 'finish_arch',
        name: 'Finish Arch',
        curationTier: CURATION_TIERS.TRUE_SIGNPOST,
        payoff: GAMEPLAY_PAYOFFS.RUN_VICTORY,
        center: Object.freeze({ x: 0, z: -1500 }),
        targetZ: -1500,
        zRange: Object.freeze({ minZ: -1540, maxZ: -1480 }),
        xRange: Object.freeze({ minX: -45, maxX: 45 }),
        description: 'Grand victory archway terminating the 1.5km run with celebration fanfare.',
    }),
]);

/**
 * Validates whether a spatial point is inside a key zone definition.
 *
 * @param {object} zone - Key zone entry from RIVER_KEY_ZONES.
 * @param {number} x - Horizontal river coordinate.
 * @param {number} z - Downriver coordinate (negative).
 * @returns {boolean} True if coordinates fall within zone bounds.
 */
export function isPositionInKeyZone(zone, x, z) {
    if (!zone || typeof zone !== 'object') return false;
    if (typeof x !== 'number' || !Number.isFinite(x)) return false;
    if (typeof z !== 'number' || !Number.isFinite(z)) return false;

    const { zRange, xRange } = zone;
    if (zRange) {
        if (z < zRange.minZ || z > zRange.maxZ) {
            return false;
        }
    }
    if (xRange) {
        if (x < xRange.minX || x > xRange.maxX) {
            return false;
        }
    }
    return true;
}

/**
 * Finds the active landmark zone at a given world position.
 * Returns the matching zone descriptor or null if not inside any key zone.
 *
 * @param {number} x
 * @param {number} z
 * @returns {object|null}
 */
export function findActiveKeyZone(x, z) {
    for (const zone of RIVER_KEY_ZONES) {
        if (isPositionInKeyZone(zone, x, z)) {
            return zone;
        }
    }
    return null;
}

/**
 * Finds the nearest key zone to the specified coordinates based on longitudinal (Z) distance.
 *
 * @param {number} z
 * @returns {object} Nearest zone descriptor and distance
 */
export function getNearestKeyZone(z) {
    const validZ = (typeof z === 'number' && Number.isFinite(z)) ? z : 0;
    let closestZone = RIVER_KEY_ZONES[0];
    let minDistance = Infinity;

    for (const zone of RIVER_KEY_ZONES) {
        const centerZ = zone.center ? zone.center.z : zone.targetZ;
        const dist = Math.abs(validZ - centerZ);
        if (dist < minDistance) {
            minDistance = dist;
            closestZone = zone;
        }
    }

    return {
        zone: closestZone,
        distanceZ: minDistance,
    };
}

/**
 * Verifies the landmark zone and its payoff at the player's position.
 *
 * Under Helmet 07 & Sovereign Core:
 * Every landmark must honestly belong to a valid curation tier and deliver
 * its genuine gameplay consequence.
 *
 * @param {object} [position={}]
 * @param {number} [position.x=0] - Horizontal river coordinate.
 * @param {number} [position.z=0] - Downriver longitudinal coordinate.
 * @returns {object} Active zone verification result:
 *   - active: boolean
 *   - zone: object descriptor (or null if outside any key zone)
 *   - zoneId: string | null
 *   - name: string | null
 *   - curationTier: 'true_signpost' | 'centerpiece_magnet' | 'quiet_texture'
 *   - payoff: 'sanctuary_heal' | 'vortex_slingshot' | 'downriver_speed_boost' | 'police_crossfire_and_armory' | 'boss_encounter' | 'run_victory' | null
 *   - targetZ: number | null
 *   - verified: boolean
 */
export function verifyZonePayoffAtPosition(position = {}) {
    const safePos = (position && typeof position === 'object') ? position : {};
    const safeX = (typeof safePos.x === 'number' && Number.isFinite(safePos.x)) ? safePos.x : 0;
    const safeZ = (typeof safePos.z === 'number' && Number.isFinite(safePos.z)) ? safePos.z : 0;

    const matchedZone = findActiveKeyZone(safeX, safeZ);

    if (!matchedZone) {
        const { zone: nearest, distanceZ } = getNearestKeyZone(safeZ);
        return {
            active: false,
            zone: null,
            zoneId: null,
            name: null,
            curationTier: CURATION_TIERS.QUIET_TEXTURE,
            payoff: null,
            targetZ: null,
            verified: false,
            nearestZone: {
                id: nearest.id,
                name: nearest.name,
                distanceZ,
            },
        };
    }

    return {
        active: true,
        zone: matchedZone,
        zoneId: matchedZone.id,
        name: matchedZone.name,
        curationTier: matchedZone.curationTier,
        payoff: matchedZone.payoff,
        targetZ: matchedZone.targetZ,
        verified: Boolean(matchedZone.payoff && matchedZone.curationTier),
    };
}
