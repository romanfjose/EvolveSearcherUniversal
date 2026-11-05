/**
 * Don't Sink, Don't Die — Sanctuary Platform Lookout & Tactical Scout Camera
 * (`shared/sanctuary-lookout-scout.js`)
 *
 * WHY THIS EXISTS:
 * When players dock at a Sanctuary Platform or Safe Haven, transitioning the camera
 * into a high-angle telescope overview gives the pilot immediate strategic clarity:
 * revealing downriver hazards (whirlpools, rapids, mines, barricades), gold coin rings,
 * approaching enemy patrols, and the next safe docks across the upcoming 200m river reach.
 *
 * Sovereign Helmet Directives:
 * - Helmet 01 (Cockpit Pilot): One glance shows the whole board. No cognitive hunt or camera wrestling.
 * - Helmet 02 (The RTS Flight Engineer): Pure deterministic math, zero DOM/Three.js global leaks,
 *   clean zero-dependency module boundaries.
 * - Helmet 04 (Strategist Shark): Instant tactical payoff when docking, turning safe docks into
 *   high-value expedition planning centers.
 */

export const LOOKOUT_SCOUT_CONFIG = Object.freeze({
    DEFAULT_SCOUT_RANGE: 200.0,         // Default lookahead distance downriver (meters)
    DEFAULT_RIVER_WIDTH: 30.0,          // Standard canyon river width
    OVERVIEW_CAMERA_ELEVATION: 28.0,    // Camera height (Y) above water surface
    OVERVIEW_CAMERA_Z_BACK: 18.0,       // Camera offset upriver (positive Z relative to platform)
    OVERVIEW_LOOKAHEAD_Z: 75.0,         // Target focus point downriver (negative Z)
    OVERVIEW_FOV: 68.0,                 // Elevated panoramic tactical FOV
    LANE_COUNT: 3,                      // Port (Left), Center, Starboard (Right) lanes
});

/**
 * Normalizes a 3D coordinate vector from object formats {x, y, z} or defaults.
 *
 * @param {object|null} pos
 * @returns {{ x: number, y: number, z: number }}
 */
function normalizePosition(pos) {
    if (!pos || typeof pos !== 'object') {
        return { x: 0, y: 0, z: 0 };
    }
    const x = Number(pos.x ?? pos.position?.x) || 0;
    const y = Number(pos.y ?? pos.position?.y) || 0;
    const z = Number(pos.z ?? pos.position?.z) || 0;
    return { x, y, z };
}

/**
 * Computes an elevated overview scout camera posture positioned above a Sanctuary Platform.
 * Focuses downriver to provide a cinematic and tactical telescope overview of the upcoming river.
 *
 * @param {object} platformPos - Position of the platform/dock {x, y, z}
 * @param {number} [riverWidth=30] - Width of the river channel
 * @param {object} [options={}] - Custom camera overrides
 * @returns {object} Camera posture descriptor { position, target, fov, pitchRad, yawRad, elevation, lookAheadDistance }
 */
export function computeScoutOverviewCamera(platformPos, riverWidth = LOOKOUT_SCOUT_CONFIG.DEFAULT_RIVER_WIDTH, options = {}) {
    const pos = normalizePosition(platformPos);
    const rw = Number.isFinite(riverWidth) && riverWidth > 0 ? riverWidth : LOOKOUT_SCOUT_CONFIG.DEFAULT_RIVER_WIDTH;

    const elevation = options.elevation ?? LOOKOUT_SCOUT_CONFIG.OVERVIEW_CAMERA_ELEVATION;
    const zBack = options.zBack ?? LOOKOUT_SCOUT_CONFIG.OVERVIEW_CAMERA_Z_BACK;
    const lookAheadZ = options.lookAheadZ ?? LOOKOUT_SCOUT_CONFIG.OVERVIEW_LOOKAHEAD_Z;
    const fov = options.fov ?? LOOKOUT_SCOUT_CONFIG.OVERVIEW_FOV;

    // Platform center or slight inward nudge toward river centerline
    // Raft platforms are typically near shorelines; bias camera toward channel center (x = 0)
    const lateralCentering = options.centerLateral ?? 0.6; // 0 = keep platform x, 1 = true river center (x = 0)
    const camX = pos.x * (1 - lateralCentering);
    const camY = Math.max(elevation, pos.y + elevation);
    // Downriver is along negative Z; camera sits upriver (pos.z + zBack)
    const camZ = pos.z + zBack;

    // Target lookAt point downriver along channel center
    const targetX = pos.x * (1 - Math.min(1.0, lateralCentering * 1.5));
    const targetY = 0.5; // Near water level
    const targetZ = pos.z - lookAheadZ;

    // Relative directional vector from camera to lookAt target
    const dx = targetX - camX;
    const dy = targetY - camY;
    const dz = targetZ - camZ;
    const horizDist = Math.hypot(dx, dz);

    // Camera angles
    // pitch: downwards tilt angle (radians)
    const pitchRad = Math.atan2(-dy, horizDist);
    // yaw: lateral rotation angle (radians, 0 is straight downriver along -Z)
    const yawRad = Math.atan2(dx, -dz);

    return {
        position: {
            x: Number(camX.toFixed(2)),
            y: Number(camY.toFixed(2)),
            z: Number(camZ.toFixed(2)),
        },
        target: {
            x: Number(targetX.toFixed(2)),
            y: Number(targetY.toFixed(2)),
            z: Number(targetZ.toFixed(2)),
        },
        fov,
        pitchRad: Number(pitchRad.toFixed(4)),
        yawRad: Number(yawRad.toFixed(4)),
        elevation,
        lookAheadDistance: lookAheadZ,
        riverWidth: rw,
    };
}

/**
 * Determines river corridor navigation lane for a given lateral X position.
 * Lanes: 'port' (left / negative X), 'center', 'starboard' (right / positive X).
 *
 * @param {number} x
 * @param {number} halfWidth
 * @returns {'port'|'center'|'starboard'}
 */
export function classifyRiverLane(x, halfWidth = 15.0) {
    const third = halfWidth / 3;
    if (x < -third) return 'port';
    if (x > third) return 'starboard';
    return 'center';
}

/**
 * Scans upcoming downriver entities within [zPos - range, zPos].
 * In Don't Sink, Don't Die, rafts travel downriver in the negative Z direction:
 * Upcoming entities have z < zPos, with distance = zPos - z.
 *
 * Ingests obstacles, enemies, coin rings, and platforms (from layout generators,
 * object pools, or direct arrays), categorizes hazards, computes distances,
 * assesses lane threat density, and reveals upcoming safe havens.
 *
 * @param {object} scanParams
 * @param {number} scanParams.zPos - Current raft / platform Z position
 * @param {Array<object>|object} [scanParams.obstacles] - Hazard layout object or obstacle list
 * @param {Array<object>} [scanParams.enemies] - Array of enemy entities
 * @param {Array<object>} [scanParams.platforms] - Array of sanctuary platforms / docks
 * @param {Array<object>} [scanParams.coinRings] - Array of floating coin pickups / rings
 * @param {number} [scanParams.range=200] - Lookahead scanning range downriver in meters
 * @param {number} [scanParams.riverWidth=30] - River channel width
 * @returns {object} Scout scan report with categorized hazards, coin rings, platforms, and lane threat evaluation
 */
export function scanDownriverHazards({
    zPos = 0,
    obstacles = null,
    enemies = [],
    platforms = [],
    coinRings = [],
    range = LOOKOUT_SCOUT_CONFIG.DEFAULT_SCOUT_RANGE,
    riverWidth = LOOKOUT_SCOUT_CONFIG.DEFAULT_RIVER_WIDTH,
} = {}) {
    const originZ = Number(zPos) || 0;
    const maxRange = Number.isFinite(range) && range > 0 ? range : LOOKOUT_SCOUT_CONFIG.DEFAULT_SCOUT_RANGE;
    const minZ = originZ - maxRange; // Downriver boundary
    const halfWidth = (Number.isFinite(riverWidth) && riverWidth > 0 ? riverWidth : LOOKOUT_SCOUT_CONFIG.DEFAULT_RIVER_WIDTH) * 0.5;

    // Containers for detected items
    const detectedHazards = [];
    const detectedCoinRings = [];
    const detectedEnemies = [];
    const detectedPlatforms = [];

    // Helper to evaluate if an entity is in the downriver window [minZ, originZ]
    function inWindow(z) {
        return z <= originZ && z >= minZ;
    }

    // 1. Ingest Obstacles
    // Supports both flat arrays and hazard container layouts (with whirlpools, rapids, ramps, mines, barricades)
    if (obstacles) {
        if (Array.isArray(obstacles)) {
            for (const item of obstacles) {
                if (!item) continue;
                const pos = normalizePosition(item);
                if (inWindow(pos.z)) {
                    const dist = originZ - pos.z;
                    const lane = classifyRiverLane(pos.x, halfWidth);
                    detectedHazards.push({
                        id: item.id || `obstacle_${detectedHazards.length + 1}`,
                        type: item.type || 'obstacle',
                        x: pos.x,
                        y: pos.y,
                        z: pos.z,
                        distanceDownriver: Number(dist.toFixed(1)),
                        lane,
                        severity: item.damage ? (item.damage > 30 ? 'high' : 'medium') : 'medium',
                        raw: item,
                    });
                }
            }
        } else if (typeof obstacles === 'object') {
            // Layout container generated by river-hazards.js or destructibles.js
            // Whirlpools
            if (Array.isArray(obstacles.whirlpools)) {
                for (const w of obstacles.whirlpools) {
                    if (inWindow(w.z)) {
                        const dist = originZ - w.z;
                        detectedHazards.push({
                            id: w.id || `whirlpool_${detectedHazards.length + 1}`,
                            type: 'whirlpool',
                            x: w.x || 0,
                            y: 0,
                            z: w.z,
                            radius: w.radius || 8.0,
                            distanceDownriver: Number(dist.toFixed(1)),
                            lane: classifyRiverLane(w.x || 0, halfWidth),
                            severity: 'high',
                            raw: w,
                        });
                    }
                }
            }

            // Rapids
            if (Array.isArray(obstacles.rapids)) {
                for (const r of obstacles.rapids) {
                    if (inWindow(r.z)) {
                        const dist = originZ - r.z;
                        detectedHazards.push({
                            id: r.id || `rapids_${detectedHazards.length + 1}`,
                            type: 'rapids',
                            x: r.x || 0,
                            y: 0,
                            z: r.z,
                            width: r.width,
                            length: r.length,
                            distanceDownriver: Number(dist.toFixed(1)),
                            lane: classifyRiverLane(r.x || 0, halfWidth),
                            severity: 'medium',
                            raw: r,
                        });
                    }
                }
            }

            // Ramps
            if (Array.isArray(obstacles.ramps)) {
                for (const r of obstacles.ramps) {
                    if (inWindow(r.z)) {
                        const dist = originZ - r.z;
                        detectedHazards.push({
                            id: r.id || `ramp_${detectedHazards.length + 1}`,
                            type: 'ramp',
                            x: r.x || 0,
                            y: 0,
                            z: r.z,
                            distanceDownriver: Number(dist.toFixed(1)),
                            lane: classifyRiverLane(r.x || 0, halfWidth),
                            severity: 'low', // Stunt ramp (opportunity)
                            raw: r,
                        });
                    }
                }
            }

            // Exploding Mine Barrels
            if (Array.isArray(obstacles.mines)) {
                for (const m of obstacles.mines) {
                    const pos = normalizePosition(m);
                    if (inWindow(pos.z)) {
                        const dist = originZ - pos.z;
                        detectedHazards.push({
                            id: m.id || `mine_${detectedHazards.length + 1}`,
                            type: 'mine',
                            x: pos.x,
                            y: pos.y,
                            z: pos.z,
                            distanceDownriver: Number(dist.toFixed(1)),
                            lane: classifyRiverLane(pos.x, halfWidth),
                            severity: 'high',
                            raw: m,
                        });
                    }
                }
            }

            // Coin Rings directly inside obstacles container
            if (Array.isArray(obstacles.coinRings)) {
                for (const c of obstacles.coinRings) {
                    const pos = normalizePosition(c);
                    if (inWindow(pos.z)) {
                        const dist = originZ - pos.z;
                        detectedCoinRings.push({
                            id: c.id || `coin_${detectedCoinRings.length + 1}`,
                            type: 'coinRing',
                            x: pos.x,
                            y: pos.y,
                            z: pos.z,
                            value: c.value ?? 5,
                            distanceDownriver: Number(dist.toFixed(1)),
                            lane: classifyRiverLane(pos.x, halfWidth),
                            raw: c,
                        });
                    }
                }
            }
        }
    }

    // 2. Ingest Coin Rings (if passed as separate array)
    if (Array.isArray(coinRings)) {
        for (const c of coinRings) {
            if (!c) continue;
            const pos = normalizePosition(c);
            if (inWindow(pos.z)) {
                const dist = originZ - pos.z;
                detectedCoinRings.push({
                    id: c.id || `coin_${detectedCoinRings.length + 1}`,
                    type: 'coinRing',
                    x: pos.x,
                    y: pos.y,
                    z: pos.z,
                    value: c.value ?? 5,
                    distanceDownriver: Number(dist.toFixed(1)),
                    lane: classifyRiverLane(pos.x, halfWidth),
                    raw: c,
                });
            }
        }
    }

    // 3. Ingest Enemies
    if (Array.isArray(enemies)) {
        for (const e of enemies) {
            if (!e) continue;
            const pos = normalizePosition(e);
            if (inWindow(pos.z)) {
                const dist = originZ - pos.z;
                detectedEnemies.push({
                    id: e.id || `enemy_${detectedEnemies.length + 1}`,
                    type: e.type || 'enemy',
                    name: e.name || 'River Threat',
                    x: pos.x,
                    y: pos.y,
                    z: pos.z,
                    distanceDownriver: Number(dist.toFixed(1)),
                    lane: classifyRiverLane(pos.x, halfWidth),
                    hp: e.hp,
                    raw: e,
                });
            }
        }
    }

    // 4. Ingest Sanctuary Platforms / Safe Docks
    if (Array.isArray(platforms)) {
        for (const p of platforms) {
            if (!p) continue;
            const pos = normalizePosition(p);
            // Platforms strictly ahead downriver (distance > 0.5m)
            if (pos.z < originZ - 0.5 && pos.z >= minZ) {
                const dist = originZ - pos.z;
                detectedPlatforms.push({
                    id: p.id || `platform_${detectedPlatforms.length + 1}`,
                    name: p.name || 'Sanctuary Dock',
                    x: pos.x,
                    y: pos.y,
                    z: pos.z,
                    distanceDownriver: Number(dist.toFixed(1)),
                    lane: classifyRiverLane(pos.x, halfWidth),
                    isShop: !!p.isShop,
                    raw: p,
                });
            }
        }
    }

    // Sort detected lists by distance downriver ascending (closest first)
    const byDistance = (a, b) => a.distanceDownriver - b.distanceDownriver;
    detectedHazards.sort(byDistance);
    detectedCoinRings.sort(byDistance);
    detectedEnemies.sort(byDistance);
    detectedPlatforms.sort(byDistance);

    // Compute Lane Threat Density for tactical steering decisions
    const laneHazardCounts = { port: 0, center: 0, starboard: 0 };
    for (const h of detectedHazards) {
        if (h.severity === 'high' || h.severity === 'medium') {
            laneHazardCounts[h.lane] = (laneHazardCounts[h.lane] || 0) + (h.severity === 'high' ? 2 : 1);
        }
    }
    for (const e of detectedEnemies) {
        laneHazardCounts[e.lane] = (laneHazardCounts[e.lane] || 0) + 1;
    }

    // Recommend safest navigational lane
    let recommendedLane = 'center';
    let minThreat = laneHazardCounts.center;
    if (laneHazardCounts.port < minThreat) {
        recommendedLane = 'port';
        minThreat = laneHazardCounts.port;
    }
    if (laneHazardCounts.starboard < minThreat) {
        recommendedLane = 'starboard';
        minThreat = laneHazardCounts.starboard;
    }

    const totalCoinsAvailable = detectedCoinRings.reduce((sum, c) => sum + (c.value || 0), 0);
    const nextSafeDock = detectedPlatforms.length > 0 ? detectedPlatforms[0] : null;

    return {
        scanOriginZ: originZ,
        scanRangeMeters: maxRange,
        scannedWindow: { minZ, maxZ: originZ },
        summary: {
            hazardsCount: detectedHazards.length,
            enemiesCount: detectedEnemies.length,
            coinRingsCount: detectedCoinRings.length,
            platformsCount: detectedPlatforms.length,
            totalCoinsAvailable,
            recommendedLane,
            laneThreatScores: laneHazardCounts,
        },
        hazards: detectedHazards,
        coinRings: detectedCoinRings,
        enemies: detectedEnemies,
        platforms: detectedPlatforms,
        nextSafeDock,
    };
}
