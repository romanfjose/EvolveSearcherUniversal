/**
 * Act IV: Volcanic Shipwreck Graveyard & Citadel Mouth Caldera Biome
 * (`public/js/world/biome-act4-volcanic-shipwreck-caldera.js`)
 *
 * Why this exists:
 * Delivers the high-stakes climax of the 1500m river course for Act IV (z = -1150 to -1600m).
 * Builds a monumental 3D volcanic caldera biome containing five colossal architectural setpieces:
 *   1. Colossal Upturned Wooden Galleon Hull Ribs: Dramatic arches spanning over the water channel.
 *   2. Jagged Basalt Sea Stacks with Magma Fissures: Looming volcanic rock with animated molten veins.
 *   3. Rusted Iron Chain-Towers: Industrial mooring spires with hanging heavy iron chains swaying above.
 *   4. Fortified Obsidian Bastion Walls: Defensive battlement gates flanking the citadel mouth.
 *   5. Reinforced Ironclad Salvage Docks: Steampunk industrial drydocks with catwalks, cranes & smelters.
 *
 * Features dynamic real-time stepping via stepVolcanicShipwreckCalderaBiome(group, dt, time)
 * providing molten glow pulsation, chain breeze sway, and smelter ember flickering.
 *
 * Clean, zero-external-dependency ES module. Compatible with Three.js and headless unit mocks.
 */

/**
 * Deterministic pseudo-random number generator (LCG).
 * @param {number} seed
 * @returns {() => number}
 */
export function createPrng(seed = 42) {
    let s = (Math.abs(seed) || 42) % 2147483647;
    if (s === 0) s = 1;
    return function next() {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Robust material creator supporting standard Three.js classes and lightweight mocks.
 * @param {object} THREE
 * @param {string} type
 * @param {object} params
 * @returns {object}
 */
function createMat(THREE, type, params = {}) {
    const MatClass = THREE[type] || THREE.MeshStandardMaterial || THREE.MeshBasicMaterial || THREE.Material;
    if (typeof MatClass === 'function') {
        return new MatClass(params);
    }
    return { type, ...params };
}

/**
 * Color helper ensuring support for Three.js Color objects or hex numbers in mocks.
 * @param {object} THREE
 * @param {number} hex
 * @returns {object|number}
 */
function createColor(THREE, hex) {
    if (THREE && typeof THREE.Color === 'function') {
        return new THREE.Color(hex);
    }
    return hex;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Colossal Upturned Wooden Galleon Hull Ribs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an arching skeletal rib cage from an upturned colossal galleon hull
 * spanning across or overarching the river channel.
 *
 * @param {object} THREE
 * @param {object} config - { x, y, z, spanWidth, height, ribCount, rotationY }
 * @param {function} prng
 * @returns {object} Setpiece item record
 */
function createGalleonHullRibs(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `GalleonHullRibs_${config.id}`;
    group.position.set(config.x || 0, config.y || 0, config.z);
    group.rotation.y = config.rotationY || 0;

    const spanWidth = config.spanWidth || 70;
    const ribHeight = config.height || 28;
    const ribCount = config.ribCount || 7;
    const ribSpacing = 9.0;

    // Weathered, charred dark oak wood
    const woodMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x2b1d14,
        roughness: 0.9,
        metalness: 0.1,
    });

    // Barnacle & charred iron brackets
    const bracketMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x403833,
        roughness: 0.7,
        metalness: 0.6,
    });

    // Central Keelson Spine Beam spanning the length
    const keelsonLength = ribCount * ribSpacing + 12;
    const keelson = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 3.2, keelsonLength),
        woodMat
    );
    keelson.position.set(0, ribHeight, 0);
    group.add(keelson);

    const ribs = [];

    for (let i = 0; i < ribCount; i++) {
        const ribZ = -((ribCount - 1) * ribSpacing * 0.5) + i * ribSpacing;
        const ribGroup = new THREE.Group();
        ribGroup.position.set(0, 0, ribZ);

        // Curvature factor: arch tapering towards bow/stern
        const distFromCenter = Math.abs(i - (ribCount - 1) * 0.5) / ((ribCount - 1) * 0.5);
        const currentSpan = spanWidth * (1.0 - distFromCenter * 0.25);
        const currentHeight = ribHeight * (1.0 - distFromCenter * 0.15);

        // Build multi-segment polygonal arch ribs (Left & Right curves)
        const segmentsPerSide = 5;
        for (let s = 0; s < segmentsPerSide; s++) {
            const t0 = s / segmentsPerSide;
            const t1 = (s + 1) / segmentsPerSide;

            // Parabolic / elliptical rib arch coordinates
            // Left flank
            const x0_l = -(currentSpan * 0.5) * (1 - Math.sin(t0 * Math.PI * 0.5));
            const y0_l = currentHeight * Math.sin(t0 * Math.PI * 0.5);
            const x1_l = -(currentSpan * 0.5) * (1 - Math.sin(t1 * Math.PI * 0.5));
            const y1_l = currentHeight * Math.sin(t1 * Math.PI * 0.5);

            const dx_l = x1_l - x0_l;
            const dy_l = y1_l - y0_l;
            const segLen_l = Math.hypot(dx_l, dy_l);
            const angle_l = Math.atan2(dy_l, dx_l);

            const leftBeam = new THREE.Mesh(
                new THREE.BoxGeometry(segLen_l, 1.6, 1.4),
                woodMat
            );
            leftBeam.position.set((x0_l + x1_l) * 0.5, (y0_l + y1_l) * 0.5, 0);
            leftBeam.rotation.z = angle_l;
            ribGroup.add(leftBeam);

            // Right flank
            const x0_r = -x0_l;
            const y0_r = y0_l;
            const x1_r = -x1_l;
            const y1_r = y1_l;

            const dx_r = x1_r - x0_r;
            const dy_r = y1_r - y0_r;
            const segLen_r = Math.hypot(dx_r, dy_r);
            const angle_r = Math.atan2(dy_r, dx_r);

            const rightBeam = new THREE.Mesh(
                new THREE.BoxGeometry(segLen_r, 1.6, 1.4),
                woodMat
            );
            rightBeam.position.set((x0_r + x1_r) * 0.5, (y0_r + y1_r) * 0.5, 0);
            rightBeam.rotation.z = angle_r;
            ribGroup.add(rightBeam);

            // Iron joint bolt / bracket
            if (s > 0) {
                const jointL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.6), bracketMat);
                jointL.position.set(x0_l, y0_l, 0);
                ribGroup.add(jointL);

                const jointR = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.6), bracketMat);
                jointR.position.set(x0_r, y0_r, 0);
                ribGroup.add(jointR);
            }
        }

        // Hanging tattered cargo nets or rigging ropes
        if (i % 2 === 0) {
            const ropeMat = createMat(THREE, 'MeshBasicMaterial', { color: 0x1f1811 });
            const ropeLen = 6 + (prng() * 6);
            const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, ropeLen, 6), ropeMat);
            const dropX = (prng() - 0.5) * (currentSpan * 0.35);
            rope.position.set(dropX, currentHeight - ropeLen * 0.5, 0);
            ribGroup.add(rope);
        }

        group.add(ribGroup);
        ribs.push(ribGroup);
    }

    return {
        type: 'galleonRibs',
        id: config.id,
        group,
        position: group.position,
        keelson,
        ribs,
        woodMat,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Jagged Basalt Sea Stacks with Glowing Magma Fissures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a cluster of towering volcanic columnar basalt sea stacks with
 * veins of pulsating, glowing molten lava fissures.
 *
 * @param {object} THREE
 * @param {object} config - { x, y, z, height, radius, stackCount }
 * @param {function} prng
 * @returns {object} Setpiece item record
 */
function createBasaltMagmaSeaStacks(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `BasaltMagmaStack_${config.id}`;
    group.position.set(config.x, config.y || 0, config.z);

    const baseHeight = config.height || 36;
    const baseRadius = config.radius || 7;
    const stackCount = config.stackCount || 5;

    // Dark volcanic basalt column material
    const basaltMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x181a1b,
        roughness: 0.95,
        metalness: 0.1,
    });

    // Molten emissive magma fissure material
    const magmaColor = createColor(THREE, 0xff4500);
    const magmaMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xff3700,
        emissive: magmaColor,
        emissiveIntensity: 2.2,
        roughness: 0.3,
    });

    const columns = [];
    const fissures = [];

    for (let c = 0; c < stackCount; c++) {
        const colGroup = new THREE.Group();
        const angle = (c / stackCount) * Math.PI * 2 + (prng() * 0.4);
        const dist = c === 0 ? 0 : baseRadius * (0.6 + prng() * 0.7);
        const colX = Math.cos(angle) * dist;
        const colZ = Math.sin(angle) * dist;
        const colH = baseHeight * (c === 0 ? 1.0 : (0.55 + prng() * 0.4));
        const colR = (baseRadius * 0.35) * (0.8 + prng() * 0.5);

        colGroup.position.set(colX, 0, colZ);

        // Hexagonal prismatic column (Cylinder with 6 sides)
        const colMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(colR * 0.85, colR, colH, 6),
            basaltMat
        );
        colMesh.position.y = colH * 0.5;
        colMesh.rotation.y = prng() * Math.PI;
        colGroup.add(colMesh);

        // Magma fissure vein bands winding vertically
        const fissureBands = 2 + Math.floor(prng() * 2);
        for (let b = 0; b < fissureBands; b++) {
            const fissureH = 1.2 + prng() * 1.5;
            const fissureMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(colR * 0.88, colR * 0.92, fissureH, 6),
                magmaMat
            );
            fissureMesh.position.y = colH * (0.2 + (b / fissureBands) * 0.6);
            fissureMesh.rotation.y = colMesh.rotation.y + prng() * 0.2;
            colGroup.add(fissureMesh);
            fissures.push(fissureMesh);
        }

        group.add(colGroup);
        columns.push(colGroup);
    }

    return {
        type: 'basaltSeaStacks',
        id: config.id,
        group,
        position: group.position,
        columns,
        fissures,
        magmaMat,
        baseEmissiveIntensity: 2.2,
        pulseSpeed: 1.5 + prng() * 0.8,
        pulsePhase: prng() * Math.PI * 2,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Rusted Iron Chain-Towers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates heavy mooring chain-towers with massive catenary iron chains
 * suspended above the river or connecting across crags.
 *
 * @param {object} THREE
 * @param {object} config - { x, y, z, height, chainLength, side }
 * @param {function} prng
 * @returns {object} Setpiece item record
 */
function createIronChainTower(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `IronChainTower_${config.id}`;
    group.position.set(config.x, config.y || 0, config.z);

    const towerH = config.height || 32;
    const towerRadius = 3.6;

    // Weathered, rusted cast-iron metal
    const rustIronMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3d2817, // Deep rusted bronze-iron
        roughness: 0.75,
        metalness: 0.7,
    });
    const chainMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x1f1d1d,
        roughness: 0.6,
        metalness: 0.85,
    });

    // Heavy riveted stone/iron foundation
    const foundation = new THREE.Mesh(
        new THREE.CylinderGeometry(towerRadius * 1.3, towerRadius * 1.6, 6, 8),
        rustIronMat
    );
    foundation.position.y = 3;
    group.add(foundation);

    // Multi-tier lattice tower shaft
    const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(towerRadius * 0.7, towerRadius, towerH - 6, 8),
        rustIronMat
    );
    shaft.position.y = (towerH - 6) * 0.5 + 6;
    group.add(shaft);

    // Cantilever chain winch arm extending over the water
    const armLen = 14;
    const armGroup = new THREE.Group();
    armGroup.position.set(0, towerH, 0);

    const armMesh = new THREE.Mesh(
        new THREE.BoxGeometry(armLen, 2.2, 2.4),
        rustIronMat
    );
    const sideDir = config.side < 0 ? 1 : -1; // Extend towards river channel
    armMesh.position.set(sideDir * (armLen * 0.5), 0, 0);
    armGroup.add(armMesh);
    group.add(armGroup);

    // Hanging colossal chain links with physics sway
    const chainLinks = [];
    const chainPivot = new THREE.Group();
    chainPivot.position.set(sideDir * (armLen - 2), towerH - 1, 0);
    group.add(chainPivot);

    const linkCount = 8;
    const linkLength = 2.4;
    for (let l = 0; l < linkCount; l++) {
        const link = new THREE.Mesh(
            new THREE.TorusGeometry(1.1, 0.32, 6, 12),
            chainMat
        );
        link.position.y = -l * linkLength;
        // Alternate torus link orientations (0 and 90 deg)
        if (l % 2 === 1) link.rotation.y = Math.PI * 0.5;
        chainPivot.add(link);
        chainLinks.push(link);
    }

    // Heavy anchor or salvage weight at the end of chain
    const weightMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 2.2, 3.2, 6),
        rustIronMat
    );
    weightMesh.position.y = -(linkCount * linkLength + 1.6);
    chainPivot.add(weightMesh);

    return {
        type: 'chainTower',
        id: config.id,
        group,
        position: group.position,
        chainPivot,
        chainLinks,
        swaySpeed: 1.1 + prng() * 0.4,
        swayPhase: prng() * Math.PI * 2,
        swayAmplitude: 0.12 + prng() * 0.08,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Fortified Obsidian Bastion Walls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates massive obsidian fortress walls and gateway ramparts
 * guarding the river mouth entry into the Caldera Citadel.
 *
 * @param {object} THREE
 * @param {object} config - { x, y, z, width, height, side }
 * @param {function} prng
 * @returns {object} Setpiece item record
 */
function createObsidianBastionWall(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `ObsidianBastion_${config.id}`;
    group.position.set(config.x, config.y || 0, config.z);

    const wallW = config.width || 42;
    const wallH = config.height || 30;
    const wallD = 12;

    // Jet-black reflective volcanic obsidian stone
    const obsidianMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x0f1115,
        roughness: 0.3,
        metalness: 0.8,
    });
    // Glowing defensive ward glyphs / braziers
    const wardGlowColor = createColor(THREE, 0xef4444);
    const wardMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xdc2626,
        emissive: wardGlowColor,
        emissiveIntensity: 1.8,
        roughness: 0.2,
    });

    // Main angled fortress battlement wall
    const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(wallW, wallH, wallD),
        obsidianMat
    );
    wallMesh.position.set(0, wallH * 0.5, 0);
    group.add(wallMesh);

    // Crenellations / battlements along the top ridge
    const merlonCount = 5;
    const merlonW = wallW / (merlonCount * 2);
    for (let m = 0; m < merlonCount; m++) {
        const merlon = new THREE.Mesh(
            new THREE.BoxGeometry(merlonW, 3.5, wallD + 1),
            obsidianMat
        );
        const merlonX = -wallW * 0.5 + (m * 2 + 0.5) * merlonW;
        merlon.position.set(merlonX, wallH + 1.75, 0);
        group.add(merlon);
    }

    // Defensive Watchtower Spire at inner river edge
    const spireH = wallH + 14;
    const spireR = 5.0;
    const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(spireR * 0.7, spireR, spireH, 8),
        obsidianMat
    );
    const innerEdgeX = config.side < 0 ? wallW * 0.45 : -wallW * 0.45;
    spire.position.set(innerEdgeX, spireH * 0.5, 0);
    group.add(spire);

    // Glowing Citadel Ward Braziers atop the spire
    const brazierMat = wardMat;
    const brazier = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 8, 8),
        brazierMat
    );
    brazier.position.set(innerEdgeX, spireH + 1.5, 0);
    group.add(brazier);

    return {
        type: 'obsidianBastion',
        id: config.id,
        group,
        position: group.position,
        brazier,
        wardMat,
        baseEmissiveIntensity: 1.8,
        flickerSeed: prng() * 100,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Reinforced Ironclad Salvage Docks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates heavy ironclad shipyard docks with drydock slipways,
 * elevated industrial catwalks, steam smelters, and cranes.
 *
 * @param {object} THREE
 * @param {object} config - { x, y, z, side }
 * @param {function} prng
 * @returns {object} Setpiece item record
 */
function createIroncladSalvageDock(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `IroncladDock_${config.id}`;
    group.position.set(config.x, config.y || 0, config.z);

    // Reinforced steel plates and heavy industrial wood
    const ironPlateMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x475569, // Slate steel
        roughness: 0.5,
        metalness: 0.7,
    });
    const dockWoodMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3e2723,
        roughness: 0.85,
    });
    // Smelter core furnace glow
    const furnaceGlowColor = createColor(THREE, 0xf97316);
    const furnaceMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xea580c,
        emissive: furnaceGlowColor,
        emissiveIntensity: 2.5,
        roughness: 0.2,
    });

    // Heavy Dock Wharf Platform
    const platformW = 24;
    const platformD = 40;
    const platformH = 3.5;
    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(platformW, platformH, platformD),
        dockWoodMat
    );
    platform.position.set(0, platformH * 0.5, 0);
    group.add(platform);

    // Steel sheet pilings & reinforcement rim
    const rim = new THREE.Mesh(
        new THREE.BoxGeometry(platformW + 1.5, 1.2, platformD + 1.5),
        ironPlateMat
    );
    rim.position.set(0, platformH, 0);
    group.add(rim);

    // Salvage Smelter Kiln / Furnace
    const smelter = new THREE.Group();
    smelter.position.set(config.side < 0 ? -6 : 6, platformH, -8);

    const furnaceBase = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 4.0, 7.0, 8),
        ironPlateMat
    );
    furnaceBase.position.y = 3.5;
    smelter.add(furnaceBase);

    // Molten furnace grate hatch
    const grate = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 2.4, 1.0),
        furnaceMat
    );
    const frontSide = config.side < 0 ? 1 : -1;
    grate.position.set(frontSide * 3.2, 2.8, 0);
    smelter.add(grate);

    // Twin Exhaust Smokestacks
    for (let s = 0; s < 2; s++) {
        const chimney = new THREE.Mesh(
            new THREE.CylinderGeometry(0.7, 0.7, 9.0, 8),
            ironPlateMat
        );
        chimney.position.set((s - 0.5) * 2.2, 9.0, 0);
        smelter.add(chimney);
    }
    group.add(smelter);

    // Salvage Derrick Crane with swiveling jib boom
    const cranePivot = new THREE.Group();
    cranePivot.position.set(config.side < 0 ? 5 : -5, platformH, 8);

    const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 1.0, 14, 8),
        ironPlateMat
    );
    mast.position.y = 7;
    cranePivot.add(mast);

    const boomArm = new THREE.Mesh(
        new THREE.BoxGeometry(16, 0.9, 0.9),
        ironPlateMat
    );
    boomArm.position.set(config.side < 0 ? 8 : -8, 13.5, 0);
    cranePivot.add(boomArm);

    group.add(cranePivot);

    return {
        type: 'ironcladDock',
        id: config.id,
        group,
        position: group.position,
        cranePivot,
        furnaceMat,
        grate,
        baseEmissiveIntensity: 2.5,
        craneSwingSpeed: 0.6 + prng() * 0.4,
        cranePhase: prng() * Math.PI * 2,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Master Biome Builder & Step Director
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the complete Act IV: Volcanic Shipwreck Graveyard & Citadel Mouth Caldera Biome.
 *
 * @param {object} THREE - Three.js library instance or mock.
 * @param {object} [options={}]
 * @param {number} [options.riverWidth=80] - Width of the river channel.
 * @param {number} [options.zStart=-1150] - Act IV entry coordinate.
 * @param {number} [options.zEnd=-1600] - Act IV caldera terminus / citadel mouth.
 * @param {number} [options.seed=4242] - Procedural generation seed.
 * @returns {THREE.Group} Top-level biome group containing all architectural setpieces.
 */
export function buildVolcanicShipwreckCalderaBiome(THREE, options = {}) {
    const riverWidth = options.riverWidth ?? 80;
    const zStart = options.zStart ?? -1150;
    const zEnd = options.zEnd ?? -1600;
    const seed = options.seed ?? 4242;

    const prng = createPrng(seed);
    const rootGroup = new THREE.Group();
    rootGroup.name = 'Act4_VolcanicShipwreckCalderaBiome';

    const halfW = riverWidth * 0.5;
    const length = Math.abs(zEnd - zStart);
    const items = [];

    let idCounter = 1;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Colossal Galleon Hull Rib Arches Overarching the Channel
    // Placed at monumental gates crossing the river course
    // ─────────────────────────────────────────────────────────────────────────
    const ribLocations = [
        { z: zStart - length * 0.15, span: riverWidth + 12, height: 32, ribs: 7 },
        { z: zStart - length * 0.50, span: riverWidth + 16, height: 36, ribs: 9 },
        { z: zStart - length * 0.85, span: riverWidth + 14, height: 34, ribs: 8 },
    ];

    for (const loc of ribLocations) {
        const galleon = createGalleonHullRibs(
            THREE,
            {
                id: idCounter++,
                x: 0,
                y: 0,
                z: loc.z,
                spanWidth: loc.span,
                height: loc.height,
                ribCount: loc.ribs,
            },
            prng
        );
        rootGroup.add(galleon.group);
        items.push(galleon);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Jagged Basalt Sea Stacks with Glowing Magma Fissures
    // Flanking both left and right riverbanks throughout the caldera
    // ─────────────────────────────────────────────────────────────────────────
    const stackZCoords = [
        zStart - length * 0.08,
        zStart - length * 0.28,
        zStart - length * 0.45,
        zStart - length * 0.65,
        zStart - length * 0.82,
        zStart - length * 0.95,
    ];

    for (let i = 0; i < stackZCoords.length; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const stackX = side * (halfW + 18 + prng() * 12);
        const stackZ = stackZCoords[i] + (prng() - 0.5) * 15;

        const seaStack = createBasaltMagmaSeaStacks(
            THREE,
            {
                id: idCounter++,
                x: stackX,
                z: stackZ,
                height: 38 + prng() * 16,
                radius: 8 + prng() * 4,
                stackCount: 5 + Math.floor(prng() * 3),
            },
            prng
        );
        rootGroup.add(seaStack.group);
        items.push(seaStack);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Rusted Iron Chain-Towers
    // Industrial mooring towers with catenary iron chains along bank crags
    // ─────────────────────────────────────────────────────────────────────────
    const towerConfigs = [
        { side: -1, z: zStart - length * 0.20 },
        { side: 1, z: zStart - length * 0.38 },
        { side: -1, z: zStart - length * 0.60 },
        { side: 1, z: zStart - length * 0.78 },
    ];

    for (const cfg of towerConfigs) {
        const towerX = cfg.side * (halfW + 8 + prng() * 4);
        const towerZ = cfg.z + (prng() - 0.5) * 10;

        const chainTower = createIronChainTower(
            THREE,
            {
                id: idCounter++,
                x: towerX,
                z: towerZ,
                height: 32 + prng() * 8,
                side: cfg.side,
            },
            prng
        );
        rootGroup.add(chainTower.group);
        items.push(chainTower);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Fortified Obsidian Bastion Walls
    // Twin monumental battlements at the river mouth (zEnd)
    // ─────────────────────────────────────────────────────────────────────────
    const bastionSides = [-1, 1];
    for (const side of bastionSides) {
        const bastionX = side * (halfW + 20);
        const bastionZ = zEnd + 35;

        const bastion = createObsidianBastionWall(
            THREE,
            {
                id: idCounter++,
                x: bastionX,
                z: bastionZ,
                width: 48,
                height: 34,
                side,
            },
            prng
        );
        rootGroup.add(bastion.group);
        items.push(bastion);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Reinforced Ironclad Salvage Docks
    // Steampunk drydocks with smelters and cranes on opposing shores
    // ─────────────────────────────────────────────────────────────────────────
    const dockConfigs = [
        { side: -1, z: zStart - length * 0.32 },
        { side: 1, z: zStart - length * 0.72 },
    ];

    for (const cfg of dockConfigs) {
        const dockX = cfg.side * (halfW + 14);
        const dockZ = cfg.z;

        const dock = createIroncladSalvageDock(
            THREE,
            {
                id: idCounter++,
                x: dockX,
                z: dockZ,
                side: cfg.side,
            },
            prng
        );
        rootGroup.add(dock.group);
        items.push(dock);
    }

    // Expose metadata on rootGroup for inspection & stepping
    rootGroup.userData = {
        isAct4CalderaBiome: true,
        riverWidth,
        zStart,
        zEnd,
        items,
        time: 0,
    };

    return rootGroup;
}

/**
 * Animates and steps the Act IV Volcanic Caldera Biome setpieces.
 *
 * Drives:
 *   - Magma fissure emissive breathing and heat pulsing
 *   - Iron chain catenary pendulum breeze sway
 *   - Obsidian bastion ward brazier flickering
 *   - Salvage dock derrick crane boom swiveling and smelter kiln pulsing
 *
 * @param {THREE.Group} group - The biome root group returned by buildVolcanicShipwreckCalderaBiome.
 * @param {number} [dt=0.016] - Delta time in seconds.
 * @param {number} [time=0] - Total elapsed game time in seconds.
 */
export function stepVolcanicShipwreckCalderaBiome(group, dt = 0.016, time = 0) {
    if (!group || !group.userData) return;

    const items = group.userData.items;
    if (!Array.isArray(items)) return;

    // Use passed time or accumulate
    const t = typeof time === 'number' && !isNaN(time) ? time : (group.userData.time = (group.userData.time || 0) + (dt || 0.016));

    for (const item of items) {
        // 1. Basalt Sea Stacks: Molten magma pulse
        if (item.type === 'basaltSeaStacks' && item.magmaMat) {
            const wave = Math.sin(t * item.pulseSpeed + item.pulsePhase);
            // Emissive intensity breathes between 1.6 and 3.0
            const pulse = item.baseEmissiveIntensity + wave * 0.7;
            if (typeof item.magmaMat.emissiveIntensity === 'number') {
                item.magmaMat.emissiveIntensity = Math.max(0.5, pulse);
            }
        }

        // 2. Iron Chain Towers: Chain sway in volcanic caldera thermals
        else if (item.type === 'chainTower' && item.chainPivot) {
            const sway = Math.sin(t * item.swaySpeed + item.swayPhase) * item.swayAmplitude;
            if (item.chainPivot.rotation) {
                item.chainPivot.rotation.z = sway;
                item.chainPivot.rotation.x = Math.cos(t * item.swaySpeed * 0.7 + item.swayPhase) * (item.swayAmplitude * 0.35);
            }
        }

        // 3. Obsidian Bastions: Ward brazier flicker
        else if (item.type === 'obsidianBastion' && item.wardMat) {
            const flicker = Math.sin(t * 14.0 + item.flickerSeed) * 0.25 +
                            Math.cos(t * 22.0 + item.flickerSeed * 1.5) * 0.15;
            if (typeof item.wardMat.emissiveIntensity === 'number') {
                item.wardMat.emissiveIntensity = Math.max(0.4, item.baseEmissiveIntensity + flicker);
            }
        }

        // 4. Ironclad Salvage Docks: Derrick crane swiveling & furnace kiln flicker
        else if (item.type === 'ironcladDock') {
            if (item.cranePivot && item.cranePivot.rotation) {
                const craneAngle = Math.sin(t * item.craneSwingSpeed + item.cranePhase) * 0.45;
                item.cranePivot.rotation.y = craneAngle;
            }
            if (item.furnaceMat && typeof item.furnaceMat.emissiveIntensity === 'number') {
                const kilnPulse = Math.sin(t * 8.0) * 0.4 + Math.sin(t * 18.0) * 0.2;
                item.furnaceMat.emissiveIntensity = Math.max(0.8, item.baseEmissiveIntensity + kilnPulse);
            }
        }
    }
}
