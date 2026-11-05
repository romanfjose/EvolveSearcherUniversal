/**
 * Act I: Redwood Flumes 3D Architectural Biome
 * (`public/js/world/biome-act1-redwood-flumes.js`)
 *
 * Implements a true 3D architectural logging-camp biome along an 80m-wide
 * canyon river channel for Act I (z = 0 to -350m):
 *   1. Rotating 8m timber waterwheels on stone mill foundations with timber millhouses.
 *   2. Overhead wooden log-flume aqueduct bridges spanning the 80m river at z = -60 and z = -120,
 *      complete with elevated flume troughs, support bents, and water chutes.
 *   3. Tiered cliffside watchtowers with warm lantern point-lights (or fallback emissive meshes)
 *      and observation decks on the canyon cliffs.
 *   4. Mid-river mossy boulder islands with safe wooden mooring docks, mooring posts, and rope ties.
 *
 * Designed as a clean zero-dependency ES module compatible with Three.js or headless mocks.
 */

/**
 * Deterministic pseudo-random number generator (LCG).
 */
function createPrng(seed = 101) {
    let s = (Math.abs(seed) || 101) % 2147483647;
    if (s === 0) s = 1;
    return function next() {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Fallback-safe material instantiator.
 */
function createMat(THREE, type, params = {}) {
    const MatClass = THREE[type] || THREE.MeshStandardMaterial || THREE.MeshBasicMaterial || THREE.Material;
    return new MatClass(params);
}

/**
 * Creates a PointLight or an emissive Object3D fallback.
 */
function createLight(THREE, colorHex, intensity, distance, decay = 2) {
    if (typeof THREE.PointLight === 'function') {
        return new THREE.PointLight(colorHex, intensity, distance, decay);
    }
    const dummy = new THREE.Object3D();
    dummy.isPointLight = true;
    dummy.color = typeof THREE.Color === 'function' ? new THREE.Color(colorHex) : { hex: colorHex, setHex() {} };
    dummy.intensity = intensity;
    dummy.distance = distance;
    dummy.decay = decay;
    return dummy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Architectures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Rotating 8m Timber Waterwheel on Stone Mill Foundation
 */
function createWaterwheelMill(THREE, { x, z, side, id, waterwheelRadius = 4.0 }) {
    const millGroup = new THREE.Group();
    millGroup.name = `WaterwheelMill_${id}`;
    millGroup.position.set(x, 0, z);

    // Stone Mill Foundation
    const stoneMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x524b45,
        roughness: 0.95,
        metalness: 0.1,
        flatShading: true,
    });
    const millFoundation = new THREE.Mesh(new THREE.BoxGeometry(10.0, 5.0, 14.0), stoneMat);
    millFoundation.position.set(0, 2.5, 0);
    millFoundation.castShadow = true;
    millFoundation.receiveShadow = true;
    millGroup.add(millFoundation);

    // Timber Millhouse Building atop stone foundation
    const woodWallMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x6e3d23, // Redwood timber
        roughness: 0.8,
    });
    const roofMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3d2817,
        roughness: 0.7,
    });
    const millHouse = new THREE.Mesh(new THREE.BoxGeometry(8.5, 6.0, 10.0), woodWallMat);
    millHouse.position.set(0, 7.5, 0);
    millHouse.castShadow = true;
    millGroup.add(millHouse);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.0, 3.5, 4), roofMat);
    roof.position.set(0, 12.0, 0);
    roof.rotation.y = Math.PI * 0.25;
    roof.castShadow = true;
    millGroup.add(roof);

    // Rotating Waterwheel assembly
    // The waterwheel sits on the river-facing side of the stone foundation
    const waterwheelPivot = new THREE.Group();
    waterwheelPivot.name = `WaterwheelPivot_${id}`;
    // Position wheel facing the river: if side > 0, wheel is on negative X side facing river
    const wheelOffsetX = side > 0 ? -5.5 : 5.5;
    waterwheelPivot.position.set(wheelOffsetX, 3.8, 0);
    millGroup.add(waterwheelPivot);

    const timberDarkMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x4a2e1b,
        roughness: 0.75,
    });
    const timberPaddleMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x7c4728,
        roughness: 0.85,
    });

    // Central axle
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.2, 10), timberDarkMat);
    axle.rotation.z = Math.PI * 0.5;
    waterwheelPivot.add(axle);

    // Outer & Inner Wheel Rings (8m diameter -> 4m radius)
    const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(waterwheelRadius, 0.2, 8, 24), timberDarkMat);
    ringOuter.rotation.y = Math.PI * 0.5;
    waterwheelPivot.add(ringOuter);

    const ringInner = new THREE.Mesh(new THREE.TorusGeometry(waterwheelRadius * 0.55, 0.16, 8, 20), timberDarkMat);
    ringInner.rotation.y = Math.PI * 0.5;
    waterwheelPivot.add(ringInner);

    // Spokes and Paddles (8 blades)
    const bladeCount = 8;
    const paddles = [];
    for (let i = 0; i < bladeCount; i++) {
        const angle = (i / bladeCount) * Math.PI * 2;
        // Spoke spoke beam
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.22, waterwheelRadius * 1.9, 0.22), timberDarkMat);
        spoke.rotation.x = angle;
        waterwheelPivot.add(spoke);

        // Water paddle / bucket blade at the rim
        const paddle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.9), timberPaddleMat);
        paddle.position.set(0, Math.sin(angle) * (waterwheelRadius - 0.2), Math.cos(angle) * (waterwheelRadius - 0.2));
        paddle.rotation.x = angle + Math.PI * 0.5;
        waterwheelPivot.add(paddle);
        paddles.push(paddle);
    }

    return {
        id,
        type: 'waterwheelMill',
        group: millGroup,
        waterwheelPivot,
        rotationSpeed: 0.65 + (side > 0 ? 0.1 : -0.1),
        currentAngle: 0,
    };
}

/**
 * 2. Overhead Wooden Log-Flume Aqueduct Bridge spanning the river
 */
function createLogFlumeAqueduct(THREE, { z, riverWidth = 80, id }) {
    const aqueductGroup = new THREE.Group();
    aqueductGroup.name = `LogFlumeAqueduct_${id}`;
    aqueductGroup.position.set(0, 0, z);

    const timberStructureMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x5c3317,
        roughness: 0.85,
    });
    const flumeTroughMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x7a4321,
        roughness: 0.7,
    });
    const flumeWaterMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x22c1c3,
        roughness: 0.2,
        metalness: 0.3,
        transparent: true,
        opacity: 0.75,
    });

    const bridgeSpan = riverWidth + 30; // Spans across the full 80m river into the canyon cliffs
    const bridgeHeight = 16.0; // Clear height above river surface (raft clearance)

    // Main Overhead Flume Trough (U-channel floor & walls)
    const troughFloor = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan, 0.4, 4.0), flumeTroughMat);
    troughFloor.position.set(0, bridgeHeight, 0);
    aqueductGroup.add(troughFloor);

    // Left wall of trough
    const troughWallZ1 = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan, 1.6, 0.3), flumeTroughMat);
    troughWallZ1.position.set(0, bridgeHeight + 0.8, -1.85);
    aqueductGroup.add(troughWallZ1);

    // Right wall of trough
    const troughWallZ2 = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan, 1.6, 0.3), flumeTroughMat);
    troughWallZ2.position.set(0, bridgeHeight + 0.8, 1.85);
    aqueductGroup.add(troughWallZ2);

    // Rushing water layer inside the flume trough
    const waterRibbon = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan, 0.1, 3.4), flumeWaterMat);
    waterRibbon.position.set(0, bridgeHeight + 0.3, 0);
    aqueductGroup.add(waterRibbon);

    // Giant Timber Trestle Support Bents / A-Frames along the span
    const pierXs = [-(riverWidth * 0.38), -(riverWidth * 0.15), (riverWidth * 0.15), (riverWidth * 0.38)];
    for (let p = 0; p < pierXs.length; p++) {
        const px = pierXs[p];
        const pierGroup = new THREE.Group();
        pierGroup.position.set(px, 0, 0);

        // Left leg
        const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, bridgeHeight, 8), timberStructureMat);
        leg1.position.set(0, bridgeHeight * 0.5, -1.8);
        leg1.rotation.z = (p % 2 === 0 ? 0.04 : -0.04);
        pierGroup.add(leg1);

        // Right leg
        const leg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, bridgeHeight, 8), timberStructureMat);
        leg2.position.set(0, bridgeHeight * 0.5, 1.8);
        leg2.rotation.z = (p % 2 === 0 ? -0.04 : 0.04);
        pierGroup.add(leg2);

        // Horizontal cross-braces
        for (let b = 1; b <= 3; b++) {
            const brace = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 4.2), timberStructureMat);
            brace.position.set(0, (bridgeHeight / 4) * b, 0);
            pierGroup.add(brace);
        }

        aqueductGroup.add(pierGroup);
    }

    // Timber log floating in the flume chute as architectural storytelling
    const logMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3d2314,
        roughness: 0.8,
    });
    const decorativeLog = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 4.2, 8), logMat);
    decorativeLog.position.set(id % 2 === 0 ? -12 : 8, bridgeHeight + 0.55, 0);
    decorativeLog.rotation.z = Math.PI * 0.5;
    aqueductGroup.add(decorativeLog);

    return {
        id,
        type: 'logFlumeAqueduct',
        group: aqueductGroup,
        bridgeHeight,
        bridgeSpan,
        z,
    };
}

/**
 * 3. Tiered Cliffside Watchtowers with Warm Lantern Point-Lights
 */
function createCliffsideWatchtower(THREE, { x, z, side, id, baseCliffY = 0 }) {
    const towerGroup = new THREE.Group();
    towerGroup.name = `CliffWatchtower_${id}`;
    towerGroup.position.set(x, baseCliffY, z);

    const stoneCliffMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x7c3f25, // Red rock canyon cliff
        roughness: 0.9,
        metalness: 0.05,
        flatShading: true,
    });
    const timberMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x5c3317,
        roughness: 0.8,
    });
    const platformMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x8a5229,
        roughness: 0.75,
    });
    const lanternGlassMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xffe082,
        emissive: typeof THREE.Color === 'function' ? new THREE.Color(0xff9800) : { hex: 0xff9800, setHex() {} },
        emissiveIntensity: 1.8,
        roughness: 0.2,
    });

    // Cliff outcrop foundation
    const cliffBase = new THREE.Mesh(new THREE.BoxGeometry(14.0, 8.0, 14.0), stoneCliffMat);
    cliffBase.position.set(0, 4.0, 0);
    cliffBase.castShadow = true;
    towerGroup.add(cliffBase);

    // Watchtower Tier 1 (4 heavy corner pillars)
    const pillarHeight = 12.0;
    const towerFootprint = 7.0;
    const halfFoot = towerFootprint * 0.5;

    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, pillarHeight, 8), timberMat);
            pillar.position.set(sx * halfFoot, 8.0 + pillarHeight * 0.5, sz * halfFoot);
            towerGroup.add(pillar);
        }
    }

    // Mid-tier cross bracing
    const crossBrace = new THREE.Mesh(new THREE.BoxGeometry(towerFootprint, 0.35, towerFootprint), timberMat);
    crossBrace.position.set(0, 8.0 + pillarHeight * 0.5, 0);
    towerGroup.add(crossBrace);

    // Observation Deck Platform
    const deckY = 8.0 + pillarHeight;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(towerFootprint + 1.8, 0.45, towerFootprint + 1.8), platformMat);
    deck.position.set(0, deckY, 0);
    towerGroup.add(deck);

    // Deck Perimeter Railing
    const railMat = createMat(THREE, 'MeshStandardMaterial', { color: 0x3d2314, roughness: 0.8 });
    const railing = new THREE.Mesh(new THREE.BoxGeometry(towerFootprint + 1.6, 1.0, towerFootprint + 1.6), railMat);
    railing.position.set(0, deckY + 0.6, 0);
    towerGroup.add(railing);

    // Watchtower Pyramid Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(towerFootprint * 0.85, 3.8, 4), timberMat);
    roof.position.set(0, deckY + 3.8, 0);
    roof.rotation.y = Math.PI * 0.25;
    towerGroup.add(roof);

    // Warm Lantern Point-Light dangling from the tower observation beam
    const lanternArm = new THREE.Mesh(new THREE.BoxGeometry(side > 0 ? -3.0 : 3.0, 0.25, 0.25), timberMat);
    const lanternArmX = side > 0 ? -halfFoot - 1.2 : halfFoot + 1.2;
    lanternArm.position.set(lanternArmX, deckY + 1.2, 0);
    towerGroup.add(lanternArm);

    // Hanging Lantern Mesh
    const lanternMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), lanternGlassMat);
    lanternMesh.position.set(side > 0 ? -halfFoot - 2.5 : halfFoot + 2.5, deckY + 0.5, 0);
    towerGroup.add(lanternMesh);

    // Point Light source
    const pointLight = createLight(THREE, 0xffa726, 2.2, 28, 2);
    pointLight.position.set(lanternMesh.position.x, lanternMesh.position.y - 0.2, lanternMesh.position.z);
    towerGroup.add(pointLight);

    return {
        id,
        type: 'cliffWatchtower',
        group: towerGroup,
        lanternMesh,
        pointLight,
        baseIntensity: 2.2,
        flickerSeed: id * 31.7,
    };
}

/**
 * 4. Mid-River Mossy Boulder Island with Wooden Mooring Dock
 */
function createMossyBoulderIsland(THREE, { x, z, id, radius = 5.5 }) {
    const islandGroup = new THREE.Group();
    islandGroup.name = `MossyBoulderIsland_${id}`;
    islandGroup.position.set(x, 0, z);

    // River stone & moss materials
    const mossRockMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x47553b, // Mossy olive stone
        roughness: 0.95,
        flatShading: true,
    });
    const riverBedStoneMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3f3d37,
        roughness: 0.9,
        flatShading: true,
    });
    const dockWoodMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x734828,
        roughness: 0.8,
    });
    const ropeMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xd4a373,
        roughness: 0.9,
    });

    // Central massive mossy boulder
    const mainBoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), mossRockMat);
    mainBoulder.scale.set(1.4, 0.75, 1.1);
    mainBoulder.position.set(0, radius * 0.45, 0);
    mainBoulder.castShadow = true;
    mainBoulder.receiveShadow = true;
    islandGroup.add(mainBoulder);

    // Clustered smaller shoreline stones
    for (let b = 0; b < 4; b++) {
        const bRad = 1.2 + (b * 0.6);
        const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(bRad, 0), riverBedStoneMat);
        const bAngle = (b / 4) * Math.PI * 2 + 0.3;
        boulder.position.set(Math.cos(bAngle) * (radius + 0.8), bRad * 0.4, Math.sin(bAngle) * (radius * 0.8));
        boulder.castShadow = true;
        islandGroup.add(boulder);
    }

    // Wooden Mooring Dock Jetty extending into calmer water
    const dockDeck = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 7.5), dockWoodMat);
    dockDeck.position.set(0, 0.55, radius + 2.5);
    dockDeck.castShadow = true;
    dockDeck.receiveShadow = true;
    islandGroup.add(dockDeck);

    // Mooring Posts / Bollards (4 wooden pilings)
    const bollardXs = [-1.8, 1.8];
    const bollardZs = [radius + 0.5, radius + 5.5];
    for (const bx of bollardXs) {
        for (const bz of bollardZs) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.6, 8), dockWoodMat);
            post.position.set(bx, 0.9, bz);
            islandGroup.add(post);

            // Coiled rope ring around post head
            const ropeRing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 6, 12), ropeMat);
            ropeRing.position.set(bx, 1.35, bz);
            ropeRing.rotation.x = Math.PI * 0.5;
            islandGroup.add(ropeRing);
        }
    }

    // Dock safety lantern post
    const dockLantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 8),
        createMat(THREE, 'MeshBasicMaterial', { color: 0xfacc15 })
    );
    dockLantern.position.set(1.8, 1.8, radius + 5.5);
    islandGroup.add(dockLantern);

    return {
        id,
        type: 'mossyBoulderIsland',
        group: islandGroup,
        position: islandGroup.position,
        radius,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the complete 3D architectural logging-camp biome for Act I.
 *
 * @param {object} THREE - The Three.js library instance or mock.
 * @param {object} [options]
 * @param {number} [options.riverWidth=80] - Width of the canyon river (canonical 80m).
 * @param {number} [options.zStart=0] - Start of Act I downriver coordinate (0m).
 * @param {number} [options.zEnd=-350] - End of Act I coordinate (-350m).
 * @returns {THREE.Group} Root biome group with metadata in `userData`.
 */
export function buildRedwoodFlumesBiome(THREE, { riverWidth = 80, zStart = 0, zEnd = -350 } = {}) {
    const root = new THREE.Group();
    root.name = 'Act1_RedwoodFlumes_BiomeRoot';

    const halfW = riverWidth * 0.5;
    const waterwheels = [];
    const aqueducts = [];
    const watchtowers = [];
    const islands = [];

    // 1. Rotating 8m timber waterwheels along riverbanks (4 mills)
    const millLocations = [
        { side: -1, z: -40, xDist: halfW + 6.0 },
        { side: 1, z: -95, xDist: halfW + 6.0 },
        { side: -1, z: -175, xDist: halfW + 6.5 },
        { side: 1, z: -270, xDist: halfW + 6.0 },
    ];
    let millId = 1;
    for (const loc of millLocations) {
        if (loc.z <= zStart && loc.z >= zEnd) {
            const mill = createWaterwheelMill(THREE, {
                x: loc.side * loc.xDist,
                z: loc.z,
                side: loc.side,
                id: millId++,
                waterwheelRadius: 4.0, // 8m diameter
            });
            root.add(mill.group);
            waterwheels.push(mill);
        }
    }

    // 2. Overhead wooden log-flume aqueduct bridges spanning the river at z = -60 and z = -120
    const aqueductZs = [-60, -120];
    let aqId = 1;
    for (const az of aqueductZs) {
        if (az <= zStart && az >= zEnd) {
            const aqueduct = createLogFlumeAqueduct(THREE, {
                z: az,
                riverWidth,
                id: aqId++,
            });
            root.add(aqueduct.group);
            aqueducts.push(aqueduct);
        }
    }

    // 3. Tiered cliffside watchtowers with warm lantern point-lights (6 watchtowers)
    const towerLocations = [
        { side: 1, z: -25, xDist: halfW + 18.0, cliffY: 3.0 },
        { side: -1, z: -80, xDist: halfW + 20.0, cliffY: 4.5 },
        { side: 1, z: -145, xDist: halfW + 19.0, cliffY: 3.5 },
        { side: -1, z: -210, xDist: halfW + 21.0, cliffY: 5.0 },
        { side: 1, z: -290, xDist: halfW + 18.5, cliffY: 4.0 },
        { side: -1, z: -335, xDist: halfW + 20.0, cliffY: 3.5 },
    ];
    let towerId = 1;
    for (const tow of towerLocations) {
        if (tow.z <= zStart && tow.z >= zEnd) {
            const watchtower = createCliffsideWatchtower(THREE, {
                x: tow.side * tow.xDist,
                z: tow.z,
                side: tow.side,
                id: towerId++,
                baseCliffY: tow.cliffY,
            });
            root.add(watchtower.group);
            watchtowers.push(watchtower);
        }
    }

    // 4. Mid-river mossy boulder islands with safe wooden mooring docks (3 islands)
    const islandLocations = [
        { x: -14.0, z: -85, rad: 5.5 },
        { x: 16.0, z: -195, rad: 6.0 },
        { x: -10.0, z: -310, rad: 5.0 },
    ];
    let islandId = 1;
    for (const isl of islandLocations) {
        if (isl.z <= zStart && isl.z >= zEnd) {
            const island = createMossyBoulderIsland(THREE, {
                x: isl.x,
                z: isl.z,
                id: islandId++,
                radius: isl.rad,
            });
            root.add(island.group);
            islands.push(island);
        }
    }

    // Attach tracking references on root.userData for animation and inspections
    root.userData = {
        riverWidth,
        zStart,
        zEnd,
        waterwheels,
        aqueducts,
        watchtowers,
        islands,
        elapsed: 0,
    };

    return root;
}

/**
 * Animates the Act I Redwood Flumes biome structures (waterwheel rotation, lantern flicker).
 *
 * @param {THREE.Group} group - The biome root group returned by `buildRedwoodFlumesBiome`.
 * @param {number} dt - Delta time in seconds since last frame.
 * @param {number} [time] - Total elapsed game time in seconds.
 */
export function stepRedwoodFlumesBiome(group, dt = 0.016, time) {
    if (!group || !group.userData) return;
    const uData = group.userData;
    const elapsed = time !== undefined ? time : (uData.elapsed || 0) + dt;
    uData.elapsed = elapsed;

    // 1. Rotate waterwheels
    if (Array.isArray(uData.waterwheels)) {
        for (const mill of uData.waterwheels) {
            if (mill.waterwheelPivot) {
                const deltaAngle = (mill.rotationSpeed || 0.6) * dt;
                mill.currentAngle = (mill.currentAngle || 0) + deltaAngle;
                mill.waterwheelPivot.rotation.x = mill.currentAngle;
            }
        }
    }

    // 2. Animate lantern flickering on watchtowers
    if (Array.isArray(uData.watchtowers)) {
        for (const tow of uData.watchtowers) {
            const seed = tow.flickerSeed || 1;
            // High-frequency subtle warm candle/flame flicker
            const flicker = Math.sin(elapsed * 9.0 + seed) * 0.12 + Math.cos(elapsed * 17.0 + seed * 2) * 0.08;
            const targetIntensity = Math.max(0.5, (tow.baseIntensity || 2.0) + flicker);

            if (tow.pointLight) {
                tow.pointLight.intensity = targetIntensity;
            }
            if (tow.lanternMesh?.material) {
                tow.lanternMesh.material.emissiveIntensity = targetIntensity * 0.8;
            }
        }
    }
}
