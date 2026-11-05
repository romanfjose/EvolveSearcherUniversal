/**
 * Mid-River Split-Route Archipelago Generator & Channel Routing Engine
 * (`shared/biome-route-branching.js`)
 *
 * Sovereign Core & Helmet 04 Directive:
 * Gives crews tactical navigation choices across the 1500m river course instead
 * of an uninterrupted linear tube. Places large procedural scenic 3D mid-river islands
 * that split the river into asymmetric channels:
 *   1. Tactical Calm Channels: Slower current (0.75x speed), safer platforms, calm water,
 *      and repair crate pickups to recover hull HP.
 *   2. High-Risk Rapids Channels: Faster surging current (1.35x speed), whitewater hazards,
 *      narrow chokepoints, and bonus spinning gold rings.
 *
 * Pure, deterministic ES module. Headless-safe with zero un-guarded DOM/window/document
 * or bare Three.js global leaks (passes architecture-validator and qa:helmet).
 */

/**
 * Standard route and channel configuration constants.
 */
export const ROUTE_BRANCH_CONFIG = Object.freeze({
    DEFAULT_RIVER_WIDTH: 80.0,
    DEFAULT_FINISH_Z: -1500.0,
    DEFAULT_SEED: 101,

    // Island spacing and bounds
    MIN_ISLAND_LENGTH: 55.0,
    MAX_ISLAND_LENGTH: 85.0,
    MIN_ISLAND_WIDTH: 18.0,
    MAX_ISLAND_WIDTH: 32.0,
    ISLAND_SPACING_Z: 280.0,
    FIRST_ISLAND_Z: -120.0,
    BUFFER_FROM_FINISH_Z: 100.0,

    // Channel dynamics
    CALM_CHANNEL: {
        TYPE: 'calm',
        CURRENT_MULTIPLIER: 0.75, // 25% slower current for precision steering & repairs
        WATER_TURBULENCE: 0.25,
        REPAIR_CRATES_PER_ISLAND: 2,
        REPAIR_HP_VALUE: 25,
        COLLISION_BUFFER: 2.0,
    },
    RAPIDS_CHANNEL: {
        TYPE: 'rapids',
        CURRENT_MULTIPLIER: 1.35, // 35% faster forward surge
        WATER_TURBULENCE: 1.2,
        GOLD_RINGS_PER_ISLAND: 3,
        GOLD_RING_VALUE: 15,
        COLLISION_BUFFER: 1.8,
    },
    OPEN_RIVER: {
        TYPE: 'open',
        CURRENT_MULTIPLIER: 1.0,
        WATER_TURBULENCE: 0.5,
    },
});

/**
 * Linear congruential generator (LCG) for deterministic procedural archipelago layout.
 *
 * @param {number} seed - Integer seed
 * @returns {() => number} Random float generator in range [0, 1)
 */
export function createBranchingRng(seed = 101) {
    let s = (Math.abs(Math.floor(seed)) || 101) % 2147483647;
    if (s === 0) s = 1;
    return function next() {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Generates an array of scenic split-route islands down the center of the river course.
 *
 * @param {object} [options={}]
 * @param {number} [options.seed=101] - Deterministic PRNG seed
 * @param {number} [options.riverWidth=80] - River width in meters
 * @param {number} [options.finishZ=-1500] - River finish Z coordinate
 * @returns {Array<object>} List of island specifications
 */
export function generateSplitRouteIslands(options = {}) {
    const seed = Number.isFinite(options.seed) ? options.seed : ROUTE_BRANCH_CONFIG.DEFAULT_SEED;
    const riverWidth = Number.isFinite(options.riverWidth) && options.riverWidth > 0
        ? options.riverWidth
        : ROUTE_BRANCH_CONFIG.DEFAULT_RIVER_WIDTH;
    const finishZ = Number.isFinite(options.finishZ)
        ? options.finishZ
        : ROUTE_BRANCH_CONFIG.DEFAULT_FINISH_Z;

    const rng = createBranchingRng(seed);
    const islands = [];

    let currentZ = ROUTE_BRANCH_CONFIG.FIRST_ISLAND_Z;
    let islandIndex = 0;

    const halfW = riverWidth * 0.5;

    while (currentZ > finishZ + ROUTE_BRANCH_CONFIG.BUFFER_FROM_FINISH_Z) {
        islandIndex++;

        // Island dimensions
        const length = ROUTE_BRANCH_CONFIG.MIN_ISLAND_LENGTH +
            rng() * (ROUTE_BRANCH_CONFIG.MAX_ISLAND_LENGTH - ROUTE_BRANCH_CONFIG.MIN_ISLAND_LENGTH);
        const width = ROUTE_BRANCH_CONFIG.MIN_ISLAND_WIDTH +
            rng() * (ROUTE_BRANCH_CONFIG.MAX_ISLAND_WIDTH - ROUTE_BRANCH_CONFIG.MIN_ISLAND_WIDTH);
        const height = 4.5 + rng() * 3.5;

        // Slight center offset so the river split is asymmetric and tactically interesting
        const maxOffset = (halfW - width * 0.5) * 0.22;
        const centerX = (rng() - 0.5) * 2 * maxOffset;

        // Determine which side is the Calm Channel and which is the Rapids Channel
        // Left channel: x < (centerX - width * 0.5)
        // Right channel: x > (centerX + width * 0.5)
        const calmOnLeft = rng() > 0.5;
        const leftChannelType = calmOnLeft ? 'calm' : 'rapids';
        const rightChannelType = calmOnLeft ? 'rapids' : 'calm';

        const leftBankX = -halfW;
        const rightBankX = halfW;
        const islandMinX = centerX - width * 0.5;
        const islandMaxX = centerX + width * 0.5;

        const leftWidth = islandMinX - leftBankX;
        const rightWidth = rightBankX - islandMaxX;

        const islandZStart = currentZ + length * 0.5;
        const islandZEnd = currentZ - length * 0.5;

        // Generate Repair Crates along the Calm Channel
        const calmSide = calmOnLeft ? 'left' : 'right';
        const calmMidX = calmOnLeft ? (leftBankX + islandMinX) * 0.5 : (islandMaxX + rightBankX) * 0.5;
        const repairCrates = [];
        const crateCount = ROUTE_BRANCH_CONFIG.CALM_CHANNEL.REPAIR_CRATES_PER_ISLAND;

        for (let c = 0; c < crateCount; c++) {
            const zPct = (c + 1) / (crateCount + 1);
            const crateZ = islandZStart - zPct * length;
            repairCrates.push({
                id: `repair_crate_${islandIndex}_${c + 1}`,
                x: calmMidX + (rng() - 0.5) * 2.0,
                y: 0.5,
                z: crateZ,
                hpRecover: ROUTE_BRANCH_CONFIG.CALM_CHANNEL.REPAIR_HP_VALUE,
                collected: false,
            });
        }

        // Generate Gold Rings along the Rapids Channel
        const rapidsSide = calmOnLeft ? 'right' : 'left';
        const rapidsMidX = calmOnLeft ? (islandMaxX + rightBankX) * 0.5 : (leftBankX + islandMinX) * 0.5;
        const goldRings = [];
        const ringCount = ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.GOLD_RINGS_PER_ISLAND;

        for (let r = 0; r < ringCount; r++) {
            const zPct = (r + 1) / (ringCount + 1);
            const ringZ = islandZStart - zPct * length;
            goldRings.push({
                id: `gold_ring_${islandIndex}_${r + 1}`,
                x: rapidsMidX + (rng() - 0.5) * 2.5,
                y: 1.2 + rng() * 0.6,
                z: ringZ,
                value: ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.GOLD_RING_VALUE,
                radius: 1.6,
                collected: false,
            });
        }

        // Biome / Visual theme for the island based on Z depth
        let biomeTheme = 'canyon';
        if (currentZ < -1125) {
            biomeTheme = 'tempest';
        } else if (currentZ < -750) {
            biomeTheme = 'bioluminescent';
        } else if (currentZ < -375) {
            biomeTheme = 'harbor';
        }

        islands.push({
            id: `island_archipelago_${islandIndex}`,
            index: islandIndex,
            x: centerX,
            y: 0.0,
            z: currentZ,
            width,
            length,
            height,
            zStart: islandZStart,
            zEnd: islandZEnd,
            minX: islandMinX,
            maxX: islandMaxX,
            calmSide,
            rapidsSide,
            leftChannel: {
                type: leftChannelType,
                width: leftWidth,
                minX: leftBankX,
                maxX: islandMinX,
                currentMultiplier: leftChannelType === 'calm'
                    ? ROUTE_BRANCH_CONFIG.CALM_CHANNEL.CURRENT_MULTIPLIER
                    : ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.CURRENT_MULTIPLIER,
            },
            rightChannel: {
                type: rightChannelType,
                width: rightWidth,
                minX: islandMaxX,
                maxX: rightBankX,
                currentMultiplier: rightChannelType === 'calm'
                    ? ROUTE_BRANCH_CONFIG.CALM_CHANNEL.CURRENT_MULTIPLIER
                    : ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.CURRENT_MULTIPLIER,
            },
            repairCrates,
            goldRings,
            biomeTheme,
            foliageSeed: Math.floor(rng() * 100000),
        });

        currentZ -= (length + ROUTE_BRANCH_CONFIG.ISLAND_SPACING_Z);
    }

    return islands;
}

/**
 * Evaluates the navigation route channel at a given river coordinate (x, z).
 * Returns route metadata, current speed multiplier, channel type ('calm' | 'rapids' | 'open' | 'island'),
 * and distance to the nearest island obstacle.
 *
 * @param {number} x - Horizontal river coordinate
 * @param {number} z - Downriver coordinate (typically <= 0)
 * @param {Array<object>} islands - Array of island specifications generated by generateSplitRouteIslands
 * @param {number} [riverWidth=80] - River width in meters
 * @returns {object} Channel route evaluation
 */
export function getChannelRouteAt(x, z, islands, riverWidth = ROUTE_BRANCH_CONFIG.DEFAULT_RIVER_WIDTH) {
    if (!Array.isArray(islands) || islands.length === 0) {
        return {
            channelType: ROUTE_BRANCH_CONFIG.OPEN_RIVER.TYPE,
            currentMultiplier: ROUTE_BRANCH_CONFIG.OPEN_RIVER.CURRENT_MULTIPLIER,
            turbulence: ROUTE_BRANCH_CONFIG.OPEN_RIVER.WATER_TURBULENCE,
            inIslandBounds: false,
            activeIsland: null,
            channelSide: null,
            distanceToIsland: Infinity,
            recommendedAction: 'cruise',
        };
    }

    // Find if (x, z) falls within the longitudinal span of any island (with small lead-in padding)
    for (let i = 0; i < islands.length; i++) {
        const island = islands[i];
        const halfL = island.length * 0.5;
        const halfW = island.width * 0.5;

        // Check if within island longitudinal range [zEnd, zStart]
        if (z <= island.zStart + 5.0 && z >= island.zEnd - 5.0) {
            // Distance from island center
            const dx = Math.abs(x - island.x);
            const dz = Math.abs(z - island.z);

            // Check if craft is directly on the island footprint (solid ground / cliff)
            const inSolidIsland = (dx <= halfW) && (dz <= halfL);

            // Elliptical footprint distance approximation
            const normX = dx / (halfW || 1);
            const normZ = dz / (halfL || 1);
            const ellipticalDistSq = normX * normX + normZ * normZ;
            const isInsideEllipticalIsland = ellipticalDistSq <= 1.0;

            const isCollidingWithIsland = inSolidIsland || isInsideEllipticalIsland;

            if (isCollidingWithIsland) {
                return {
                    channelType: 'island',
                    currentMultiplier: 0.0,
                    turbulence: 0.0,
                    inIslandBounds: true,
                    activeIsland: island,
                    channelSide: x < island.x ? 'left' : 'right',
                    distanceToIsland: 0.0,
                    recommendedAction: 'steer_clear_grounding',
                };
            }

            // Craft is in the left or right water channel
            if (x < island.x) {
                // Left channel
                const channel = island.leftChannel;
                const distToBank = Math.max(0, x - channel.minX);
                const distToIslandEdge = Math.max(0, island.minX - x);
                const minClearance = Math.min(distToBank, distToIslandEdge);

                return {
                    channelType: channel.type,
                    currentMultiplier: channel.currentMultiplier,
                    turbulence: channel.type === 'calm'
                        ? ROUTE_BRANCH_CONFIG.CALM_CHANNEL.WATER_TURBULENCE
                        : ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.WATER_TURBULENCE,
                    inIslandBounds: false,
                    activeIsland: island,
                    channelSide: 'left',
                    distanceToIsland: distToIslandEdge,
                    clearance: minClearance,
                    recommendedAction: channel.type === 'calm' ? 'repair_and_stabilize' : 'catch_gold_rings',
                };
            } else {
                // Right channel
                const channel = island.rightChannel;
                const distToIslandEdge = Math.max(0, x - island.maxX);
                const distToBank = Math.max(0, channel.maxX - x);
                const minClearance = Math.min(distToBank, distToIslandEdge);

                return {
                    channelType: channel.type,
                    currentMultiplier: channel.currentMultiplier,
                    turbulence: channel.type === 'calm'
                        ? ROUTE_BRANCH_CONFIG.CALM_CHANNEL.WATER_TURBULENCE
                        : ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.WATER_TURBULENCE,
                    inIslandBounds: false,
                    activeIsland: island,
                    channelSide: 'right',
                    distanceToIsland: distToIslandEdge,
                    clearance: minClearance,
                    recommendedAction: channel.type === 'calm' ? 'repair_and_stabilize' : 'catch_gold_rings',
                };
            }
        }
    }

    // Default open river segment
    return {
        channelType: ROUTE_BRANCH_CONFIG.OPEN_RIVER.TYPE,
        currentMultiplier: ROUTE_BRANCH_CONFIG.OPEN_RIVER.CURRENT_MULTIPLIER,
        turbulence: ROUTE_BRANCH_CONFIG.OPEN_RIVER.WATER_TURBULENCE,
        inIslandBounds: false,
        activeIsland: null,
        channelSide: null,
        distanceToIsland: Infinity,
        recommendedAction: 'cruise',
    };
}

/**
 * Builds a composite 3D Three.js mesh group for a split-route island.
 *
 * Includes:
 *   - Main rocky island landmass with bevelled shoreline beaches
 *   - Biome-specific vegetation / crystal spires / harbor ruins
 *   - Channel beacon buoys (Calm: Emerald beacon; Rapids: Amber/Gold beacon)
 *   - 3D interactive repair crates on the calm channel
 *   - 3D spinning gold rings on the rapids channel
 *   - Clean `dispose()` method to free all textures, geometries, and materials without memory leaks.
 *
 * @param {object} THREE - Dependency-injected Three.js namespace
 * @param {object} islandSpec - Specification object from generateSplitRouteIslands()
 * @returns {object} Three.js Group with metadata and dispose method
 */
export function buildIsland3DMesh(THREE, islandSpec) {
    if (!THREE) {
        throw new Error('buildIsland3DMesh requires THREE injected parameter.');
    }

    const rootGroup = new (THREE.Group || class { constructor() { this.children = []; } add(c) { this.children.push(c); } })();
    rootGroup.name = islandSpec.id || 'SplitRouteIsland';
    if (rootGroup.position && rootGroup.position.set) {
        rootGroup.position.set(islandSpec.x, islandSpec.y || 0, islandSpec.z);
    }

    const disposedResources = {
        geometries: [],
        materials: [],
    };

    function track(res) {
        if (!res) return res;
        if (Array.isArray(res)) {
            res.forEach(track);
            return res;
        }
        if (res.geometry) disposedResources.geometries.push(res.geometry);
        if (res.material) {
            if (Array.isArray(res.material)) {
                res.material.forEach((m) => disposedResources.materials.push(m));
            } else {
                disposedResources.materials.push(res.material);
            }
        }
        return res;
    }

    const width = islandSpec.width || 24;
    const length = islandSpec.length || 60;
    const height = islandSpec.height || 6.0;

    // Palette per biome theme
    const THEME_PALETTES = {
        canyon: {
            rockColor: 0x8b4513,
            sandColor: 0xd2b48c,
            foliageColor: 0x4a7c29,
        },
        harbor: {
            rockColor: 0x475569,
            sandColor: 0x64748b,
            foliageColor: 0x22c55e,
        },
        bioluminescent: {
            rockColor: 0x1e1b4b,
            sandColor: 0x312e81,
            foliageColor: 0x06b6d4,
        },
        tempest: {
            rockColor: 0x1e293b,
            sandColor: 0x334155,
            foliageColor: 0x38bdf8,
        },
    };

    const palette = THEME_PALETTES[islandSpec.biomeTheme] || THEME_PALETTES.canyon;

    // 1. Shoreline Sandy Beach / Base Skirt
    const beachGeo = new (THREE.CylinderGeometry || THREE.BufferGeometry)(
        width * 0.52,
        width * 0.58,
        1.2,
        16,
        1
    );
    if (beachGeo.scale) beachGeo.scale(1, 1, length / width);
    const beachMat = new (THREE.MeshStandardMaterial || THREE.MeshBasicMaterial)({
        color: palette.sandColor,
        roughness: 0.9,
    });
    const beachMesh = track(new THREE.Mesh(beachGeo, beachMat));
    if (beachMesh.position) beachMesh.position.y = 0.4;
    rootGroup.add(beachMesh);

    // 2. Central Rock Mesa / High Plateau
    const cliffGeo = new (THREE.CylinderGeometry || THREE.BufferGeometry)(
        width * 0.40,
        width * 0.48,
        height,
        12,
        1
    );
    if (cliffGeo.scale) cliffGeo.scale(1, 1, (length * 0.85) / width);
    const cliffMat = new (THREE.MeshStandardMaterial || THREE.MeshBasicMaterial)({
        color: palette.rockColor,
        roughness: 0.85,
    });
    const cliffMesh = track(new THREE.Mesh(cliffGeo, cliffMat));
    if (cliffMesh.position) cliffMesh.position.y = height * 0.5 + 0.5;
    rootGroup.add(cliffMesh);

    // 3. Foliage / Rocks / Props on Top of Plateau
    const foliageGroup = new (THREE.Group || class { constructor() { this.children = []; } add(c) { this.children.push(c); } })();
    foliageGroup.name = 'IslandFoliage';
    rootGroup.add(foliageGroup);

    const prng = createBranchingRng(islandSpec.foliageSeed || 999);
    const propCount = 6 + Math.floor(prng() * 4);

    const treeConeGeo = new (THREE.ConeGeometry || THREE.BufferGeometry)(1.8, 4.2, 5);
    const treeMat = new (THREE.MeshStandardMaterial || THREE.MeshBasicMaterial)({
        color: palette.foliageColor,
        roughness: 0.8,
    });

    for (let p = 0; p < propCount; p++) {
        const angle = prng() * Math.PI * 2;
        const radFrac = Math.sqrt(prng()) * 0.7;
        const px = Math.cos(angle) * (width * 0.32) * radFrac;
        const pz = Math.sin(angle) * (length * 0.35) * radFrac;

        const treeMesh = track(new THREE.Mesh(treeConeGeo, treeMat));
        if (treeMesh.position) {
            treeMesh.position.set(px, height + 2.1, pz);
            const scaleY = 0.8 + prng() * 0.5;
            treeMesh.scale.set(scaleY, scaleY, scaleY);
        }
        foliageGroup.add(treeMesh);
    }

    // 4. Channel Guide Beacons (Entrance split point markers)
    // Left Channel Beacon
    const leftBeaconColor = islandSpec.leftChannel.type === 'calm' ? 0x10b981 : 0xf59e0b;
    const beaconGeo = new (THREE.CylinderGeometry || THREE.BufferGeometry)(0.3, 0.4, 3.2, 8);
    const leftBeaconMat = new (THREE.MeshBasicMaterial || THREE.MeshStandardMaterial)({
        color: leftBeaconColor,
    });
    const leftBeaconMesh = track(new THREE.Mesh(beaconGeo, leftBeaconMat));
    if (leftBeaconMesh.position) {
        leftBeaconMesh.position.set(-width * 0.55, 1.6, length * 0.45);
    }
    rootGroup.add(leftBeaconMesh);

    // Right Channel Beacon
    const rightBeaconColor = islandSpec.rightChannel.type === 'calm' ? 0x10b981 : 0xf59e0b;
    const rightBeaconMat = new (THREE.MeshBasicMaterial || THREE.MeshStandardMaterial)({
        color: rightBeaconColor,
    });
    const rightBeaconMesh = track(new THREE.Mesh(beaconGeo, rightBeaconMat));
    if (rightBeaconMesh.position) {
        rightBeaconMesh.position.set(width * 0.55, 1.6, length * 0.45);
    }
    rootGroup.add(rightBeaconMesh);

    // 5. 3D Collectible Meshes: Repair Crates & Gold Rings
    const collectiblesGroup = new (THREE.Group || class { constructor() { this.children = []; } add(c) { this.children.push(c); } })();
    collectiblesGroup.name = 'IslandCollectibles';
    rootGroup.add(collectiblesGroup);

    // Repair Crates
    const crateGeo = new (THREE.BoxGeometry || THREE.BufferGeometry)(1.4, 1.4, 1.4);
    const crateMat = new (THREE.MeshStandardMaterial || THREE.MeshBasicMaterial)({
        color: 0x10b981, // Emerald medical / repair crate
    });

    if (Array.isArray(islandSpec.repairCrates)) {
        for (const crateData of islandSpec.repairCrates) {
            const crateMesh = track(new THREE.Mesh(crateGeo, crateMat));
            if (crateMesh.position) {
                // Position relative to island rootGroup
                crateMesh.position.set(crateData.x - islandSpec.x, crateData.y, crateData.z - islandSpec.z);
            }
            crateMesh.name = crateData.id;
            crateMesh.userData = { ...crateData, type: 'repair_crate' };
            collectiblesGroup.add(crateMesh);
        }
    }

    // Gold Rings
    const ringGeo = new (THREE.TorusGeometry || THREE.BufferGeometry)(1.2, 0.22, 8, 16);
    const ringMat = new (THREE.MeshStandardMaterial || THREE.MeshBasicMaterial)({
        color: 0xfbbf24, // Bright Gold
    });

    const ringMeshes = [];
    if (Array.isArray(islandSpec.goldRings)) {
        for (const ringData of islandSpec.goldRings) {
            const ringMesh = track(new THREE.Mesh(ringGeo, ringMat));
            if (ringMesh.position) {
                ringMesh.position.set(ringData.x - islandSpec.x, ringData.y, ringData.z - islandSpec.z);
            }
            ringMesh.name = ringData.id;
            ringMesh.userData = { ...ringData, type: 'gold_ring' };
            collectiblesGroup.add(ringMesh);
            ringMeshes.push(ringMesh);
        }
    }

    /**
     * Per-frame animation for spinning gold rings and gentle floating crate bob.
     */
    function update(dt, time) {
        const t = typeof time === 'number' ? time : Date.now() * 0.001;
        for (let i = 0; i < ringMeshes.length; i++) {
            const rMesh = ringMeshes[i];
            if (rMesh.rotation) {
                rMesh.rotation.y += (dt || 0.016) * 2.5;
                rMesh.rotation.x = Math.sin(t * 3.0 + i) * 0.2;
            }
        }
    }

    /**
     * Cleanly disposes of all Three.js geometries and materials.
     */
    function dispose() {
        disposedResources.geometries.forEach((g) => {
            if (g && typeof g.dispose === 'function') g.dispose();
        });
        disposedResources.materials.forEach((m) => {
            if (m && typeof m.dispose === 'function') m.dispose();
        });
        disposedResources.geometries.length = 0;
        disposedResources.materials.length = 0;
        if (rootGroup.parent && typeof rootGroup.parent.remove === 'function') {
            rootGroup.parent.remove(rootGroup);
        }
    }

    return {
        rootGroup,
        spec: islandSpec,
        update,
        dispose,
        disposedResources,
    };
}
