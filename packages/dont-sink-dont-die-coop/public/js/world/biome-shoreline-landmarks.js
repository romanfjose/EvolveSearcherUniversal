/**
 * Biome Shoreline Landmarks & Atmospheric Setpiece Builder
 * (`public/js/world/biome-shoreline-landmarks.js`)
 *
 * Populates both banks of the 80m river with act-specific 3D silhouette architecture
 * to provide a striking, living horizon and unmistakable biome identity:
 *   - Act 1 (Amber Canyon): Sawmill lumber cranes, rotating circular buzzsaws, timber docks & pine bluffs.
 *   - Act 2 (Neon Harbor): Multi-story brick warehouses, cobblestone docks, gothic belltowers with swinging bells & harbor lanterns.
 *   - Act 3 (Bioluminescent Cavern): Sunken mossy statues with glowing pulsating eyes & ancient glowing aqueducts with flowing light waterfalls.
 *   - Act 4 (Tempest Maelstrom): Shattered wrecked frigates with swaying broken masts & cascading volcanic lava falls with ember spouts.
 *
 * Clean, zero-external-dependency ES module. Headless-safe with Three.js injection.
 */

/**
 * Deterministic pseudo-random number generator (LCG).
 */
function createPrng(seed = 101) {
    let s = (Math.abs(Math.floor(seed)) || 101) % 2147483647;
    if (s === 0) s = 1;
    return function next() {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Material instantiation helper with safe fallbacks.
 */
function createMat(THREE, type, params) {
    const MatClass = THREE[type] || THREE.MeshStandardMaterial || THREE.Material;
    return new MatClass(params);
}

// ─────────────────────────────────────────────────────────────────────────────
// ACT 1: Sawmill Cranes & Pine Bluffs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an industrial timber sawmill crane on a wooden pier bank.
 * Features a heavy A-frame timber crane, suspended log hoist, rotating saw blade,
 * and timber piles.
 */
function createSawmillCrane(THREE, side, z, bankOffset, prng) {
    const group = new THREE.Group();
    group.name = `SawmillCrane_${side > 0 ? 'R' : 'L'}_${Math.round(z)}`;
    group.position.set(side * bankOffset, 0, z);
    // Face toward the river
    group.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;

    const woodDarkMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x4a2e1b,
        roughness: 0.85,
        metalness: 0.1,
    });
    const woodLightMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x825732,
        roughness: 0.8,
    });
    const ironMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x27272a,
        roughness: 0.4,
        metalness: 0.8,
    });
    const steelMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xd4d4d8,
        roughness: 0.2,
        metalness: 0.9,
    });

    // 1. Heavy Timber Pier Deck / Sawmill Foundation
    const deck = new THREE.Mesh(new THREE.BoxGeometry(10.0, 1.2, 8.0), woodDarkMat);
    deck.position.set(0, 0.6, 0);
    group.add(deck);

    // Foundation stilts / pilings
    for (const px of [-4.2, 4.2]) {
        for (const pz of [-3.2, 3.2]) {
            const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 3.5, 6), woodDarkMat);
            stilt.position.set(px, -1.0, pz);
            group.add(stilt);
        }
    }

    // 2. Crane A-Frame Towers
    const towerA = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12.0, 0.6), woodLightMat);
    towerA.position.set(-1.8, 6.0, -1.5);
    towerA.rotation.z = -0.12;
    group.add(towerA);

    const towerB = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12.0, 0.6), woodLightMat);
    towerB.position.set(1.8, 6.0, -1.5);
    towerB.rotation.z = 0.12;
    group.add(towerB);

    // Top Crossbeam
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.7, 0.7), woodDarkMat);
    topBeam.position.set(0, 11.6, -1.5);
    group.add(topBeam);

    // 3. Cantilever Timber Boom Extending over river
    const boomPivot = new THREE.Group();
    boomPivot.position.set(0, 11.2, -1.5);
    group.add(boomPivot);

    const boomArm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 9.5), woodLightMat);
    boomArm.position.set(0, 0, 4.0);
    boomPivot.add(boomArm);

    // Cable and suspended log payload
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.0, 4), ironMat);
    cable.position.set(0, -2.5, 8.0);
    boomPivot.add(cable);

    const suspendedLog = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 4.2, 8), woodDarkMat);
    suspendedLog.rotation.z = Math.PI * 0.5;
    suspendedLog.position.set(0, -5.2, 8.0);
    boomPivot.add(suspendedLog);

    // 4. Rotating Sawmill Buzzsaw & Shed
    const shed = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.8, 4.0), woodDarkMat);
    shed.position.set(-1.5, 2.5, -2.5);
    group.add(shed);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4), woodLightMat);
    roof.position.set(-1.5, 5.2, -2.5);
    roof.rotation.y = Math.PI * 0.25;
    group.add(roof);

    // Circular Saw Blade
    const sawBlade = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 0.06, 16),
        steelMat
    );
    sawBlade.position.set(1.8, 1.5, 0.8);
    sawBlade.rotation.x = Math.PI * 0.5;
    group.add(sawBlade);

    // Wood chips / sawdust pile
    const pileMat = createMat(THREE, 'MeshStandardMaterial', { color: 0xd97706, roughness: 0.9 });
    const pile = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.8, 8), pileMat);
    pile.position.set(1.8, 1.2, 0.8);
    group.add(pile);

    return {
        type: 'sawmillCrane',
        group,
        boomPivot,
        suspendedLog,
        sawBlade,
        sawSpeed: 18.0 + prng() * 6.0,
        swaySpeed: 1.2 + prng() * 0.5,
        swayPhase: prng() * Math.PI * 2,
    };
}

/**
 * Creates high-cliff Pine Bluffs with stepped layered red-rock cliffs and dense pine clusters.
 */
function createPineBluff(THREE, side, z, bankOffset, prng) {
    const group = new THREE.Group();
    group.name = `PineBluff_${side > 0 ? 'R' : 'L'}_${Math.round(z)}`;
    group.position.set(side * (bankOffset + 6.0), 0, z);

    const rockMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x8b4513,
        roughness: 0.95,
        flatShading: true,
    });
    const rockUpperMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xa0522d,
        roughness: 0.9,
        flatShading: true,
    });
    const pineTrunkMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3d2817,
        roughness: 0.85,
    });
    const pineNeedlesMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x1e3a1e,
        roughness: 0.75,
        flatShading: true,
    });

    // 1. Stepped Canyon Cliff Bluff
    const bluffBase = new THREE.Mesh(new THREE.BoxGeometry(14.0, 10.0, 24.0), rockMat);
    bluffBase.position.set(side * 2.0, 5.0, 0);
    group.add(bluffBase);

    const bluffTier2 = new THREE.Mesh(new THREE.BoxGeometry(10.0, 7.0, 18.0), rockUpperMat);
    bluffTier2.position.set(side * 4.0, 13.5, 0);
    group.add(bluffTier2);

    const bluffPinnacle = new THREE.Mesh(new THREE.ConeGeometry(4.5, 8.0, 5), rockUpperMat);
    bluffPinnacle.position.set(side * 5.0, 21.0, (prng() - 0.5) * 6.0);
    group.add(bluffPinnacle);

    // 2. Pine Trees perched along the bluff ridges
    const pineCount = 5 + Math.floor(prng() * 4);
    const pineTrees = [];

    for (let p = 0; p < pineCount; p++) {
        const pine = new THREE.Group();
        const px = side * (0.5 + prng() * 6.0);
        const pz = (p / pineCount - 0.5) * 20.0 + (prng() - 0.5) * 3.0;
        const py = 10.0 + (p % 2 === 0 ? 7.0 : 0.0);

        pine.position.set(px, py, pz);

        // Trunk
        const trunkH = 3.5 + prng() * 1.5;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, trunkH, 6), pineTrunkMat);
        trunk.position.y = trunkH * 0.5;
        pine.add(trunk);

        // Tiered Conical Foliage
        const tiers = 3;
        for (let t = 0; t < tiers; t++) {
            const coneH = 3.2 - t * 0.6;
            const coneR = 2.0 - t * 0.45;
            const needles = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 6), pineNeedlesMat);
            needles.position.y = trunkH * 0.6 + t * 1.6;
            pine.add(needles);
        }

        group.add(pine);
        pineTrees.push({
            group: pine,
            phase: prng() * Math.PI * 2,
            windFactor: 0.03 + prng() * 0.03,
        });
    }

    return {
        type: 'pineBluff',
        group,
        pineTrees,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACT 2: Brick Warehouses & Belltowers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an industrial multi-story brick shipping warehouse with cobblestone loading docks,
 * arched delivery doors, slate roofs, and warm dock lantern lights.
 */
function createBrickWarehouse(THREE, side, z, bankOffset, prng) {
    const group = new THREE.Group();
    group.name = `BrickWarehouse_${side > 0 ? 'R' : 'L'}_${Math.round(z)}`;
    group.position.set(side * bankOffset, 0, z);
    group.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;

    const brickMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x7f2d1d, // Weathered industrial red-brick
        roughness: 0.8,
        metalness: 0.1,
    });
    const stoneTrimMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xd4d4d8,
        roughness: 0.7,
    });
    const slateRoofMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x334155, // Dark slate
        roughness: 0.6,
    });
    const dockCobbleMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x475569,
        roughness: 0.9,
    });
    const ironDoorMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x18181b,
        roughness: 0.5,
        metalness: 0.6,
    });
    const lanternGlowMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xfef08a,
        emissive: new THREE.Color(0xf59e0b),
        emissiveIntensity: 1.4,
    });

    // 1. Cobblestone Quay / Dock Ramp
    const quay = new THREE.Mesh(new THREE.BoxGeometry(16.0, 1.2, 10.0), dockCobbleMat);
    quay.position.set(0, 0.6, 0);
    group.add(quay);

    // Quay bollards
    for (const bx of [-6.0, 0, 6.0]) {
        const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.9, 8), ironDoorMat);
        bollard.position.set(bx, 1.5, 4.4);
        group.add(bollard);
    }

    // 2. Main Warehouse Brick Structure
    const wH = 10.5;
    const warehouseBody = new THREE.Mesh(new THREE.BoxGeometry(14.0, wH, 8.0), brickMat);
    warehouseBody.position.set(0, 1.2 + wH * 0.5, -1.0);
    group.add(warehouseBody);

    // Stone facade belt & lintels
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.5, 8.4), stoneTrimMat);
    lintel.position.set(0, 7.2, -1.0);
    group.add(lintel);

    // Sloped Slate Gabled Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(9.0, 4.5, 4), slateRoofMat);
    roof.position.set(0, 1.2 + wH + 2.2, -1.0);
    roof.rotation.y = Math.PI * 0.25;
    roof.scale.set(1.3, 1.0, 0.85);
    group.add(roof);

    // 3. Cargo Doors
    for (const dx of [-3.5, 3.5]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.8, 0.3), ironDoorMat);
        door.position.set(dx, 3.1, 3.05);
        group.add(door);
    }

    // 4. Harbor Lanterns (Warm flickering)
    const lanterns = [];
    for (const lx of [-5.5, 5.5]) {
        const lanternPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), ironDoorMat);
        lanternPole.position.set(lx, 4.5, 3.3);
        group.add(lanternPole);

        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), lanternGlowMat);
        lantern.position.set(lx, 5.1, 3.3);
        group.add(lantern);
        lanterns.push(lantern);
    }

    return {
        type: 'brickWarehouse',
        group,
        lanterns,
        lanternMat: lanternGlowMat,
        flickerSeed: prng() * 100,
    };
}

/**
 * Creates a gothic brick and stone belltower overlooking the harbor channel.
 * Features an arched belfry, a swinging brass bell, spire, and clock face.
 */
function createHarborBelltower(THREE, side, z, bankOffset, prng) {
    const group = new THREE.Group();
    group.name = `HarborBelltower_${side > 0 ? 'R' : 'L'}_${Math.round(z)}`;
    group.position.set(side * bankOffset, 0, z);
    group.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;

    const stoneBaseMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3f3f46,
        roughness: 0.9,
    });
    const brickMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x991b1b, // Weathered harbor brick
        roughness: 0.8,
    });
    const roofCopperMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x0d9488, // Verdigris oxidized copper
        roughness: 0.5,
        metalness: 0.2,
    });
    const brassBellMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xd97706,
        emissive: new THREE.Color(0xb45309),
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.8,
    });
    const clockMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xfef08a,
        emissive: new THREE.Color(0xfde047),
        emissiveIntensity: 0.6,
    });

    // 1. Tower Base & Shaft
    const base = new THREE.Mesh(new THREE.BoxGeometry(7.0, 6.0, 7.0), stoneBaseMat);
    base.position.set(0, 3.0, 0);
    group.add(base);

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(5.6, 16.0, 5.6), brickMat);
    shaft.position.set(0, 14.0, 0);
    group.add(shaft);

    // Clock Face on river side
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.25, 16), clockMat);
    clock.rotation.x = Math.PI * 0.5;
    clock.position.set(0, 17.5, 2.85);
    group.add(clock);

    // 2. Open Arched Belfry
    const belfryFloor = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.8, 6.4), stoneBaseMat);
    belfryFloor.position.set(0, 22.4, 0);
    group.add(belfryFloor);

    // 4 Belfry Pillars
    for (const bx of [-2.4, 2.4]) {
        for (const bz of [-2.4, 2.4]) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.0, 0.7), stoneBaseMat);
            pillar.position.set(bx, 25.0, bz);
            group.add(pillar);
        }
    }

    // 3. Articulated Brass Bell Hanging in Belfry
    const bellPivot = new THREE.Group();
    bellPivot.position.set(0, 26.8, 0);
    group.add(bellPivot);

    const bellYoke = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.4), stoneBaseMat);
    bellYoke.position.set(0, 0, 0);
    bellPivot.add(bellYoke);

    const bellBody = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.8, 12), brassBellMat);
    bellBody.rotation.x = Math.PI;
    bellBody.position.set(0, -1.0, 0);
    bellPivot.add(bellBody);

    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), brassBellMat);
    clapper.position.set(0, -1.9, 0);
    bellPivot.add(clapper);

    // 4. Steep Gothic Copper Spire
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.6, 12.0, 4), roofCopperMat);
    spire.position.set(0, 33.5, 0);
    spire.rotation.y = Math.PI * 0.25;
    group.add(spire);

    // Weather vane / finial
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 6), brassBellMat);
    finial.position.set(0, 40.5, 0);
    group.add(finial);

    return {
        type: 'harborBelltower',
        group,
        bellPivot,
        swingSpeed: 2.4 + prng() * 0.8,
        swingPhase: prng() * Math.PI * 2,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACT 3: Sunken Statues & Glowing Aqueducts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an ancient sunken titan statue emerging half-submerged from the riverbank shallows.
 * Features carved mossy stone torso, tilting cracked helmet, and glowing pulsating eyes.
 */
function createSunkenStatue(THREE, side, z, bankOffset, prng) {
    const group = new THREE.Group();
    group.name = `SunkenStatue_${side > 0 ? 'R' : 'L'}_${Math.round(z)}`;
    group.position.set(side * (bankOffset - 2.0), 0, z);
    // Angled look toward the river
    group.rotation.y = side > 0 ? -Math.PI * 0.45 : Math.PI * 0.45;
    group.rotation.z = (side > 0 ? -1 : 1) * 0.12; // Weathered slump into river

    const mossyStoneMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x1e293b,
        roughness: 0.95,
        flatShading: true,
    });
    const runeStoneMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x0f172a,
        roughness: 0.85,
    });
    const glowEyeMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x22d3ee,
        emissive: new THREE.Color(0x06b6d4),
        emissiveIntensity: 1.8,
    });
    const waterFloraMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x064e3b,
        roughness: 0.9,
    });

    // 1. Titan Pedestal & Submerged Base
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.0, 2.5, 8), runeStoneMat);
    pedestal.position.set(0, 0.8, 0);
    group.add(pedestal);

    // 2. Titan Massive Torso & Pauldrons
    const torso = new THREE.Mesh(new THREE.BoxGeometry(6.2, 7.5, 4.0), mossyStoneMat);
    torso.position.set(0, 5.2, 0);
    group.add(torso);

    for (const px of [-3.8, 3.8]) {
        const pauldron = new THREE.Mesh(new THREE.ConeGeometry(2.0, 3.5, 6), mossyStoneMat);
        pauldron.rotation.z = px > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
        pauldron.position.set(px, 7.8, 0);
        group.add(pauldron);
    }

    // 3. Colossal Head & Crown
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 10.5, 0.4);
    headGroup.rotation.x = 0.15; // Gazing downward at passing rafts
    group.add(headGroup);

    const head = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.8, 3.2), mossyStoneMat);
    headGroup.add(head);

    // Spiked Titan Crown
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.0, 6), runeStoneMat);
    crown.position.set(0, 2.6, 0);
    headGroup.add(crown);

    // 4. Glowing Abyssal Eyes
    const eyes = [];
    for (const ex of [-0.75, 0.75]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), glowEyeMat);
        eye.position.set(ex, 0.4, 1.65);
        headGroup.add(eye);
        eyes.push(eye);
    }

    // Waterweed / moss clumps draped on shoulders
    const weed = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), waterFloraMat);
    weed.position.set(-2.2, 8.5, 1.2);
    group.add(weed);

    return {
        type: 'sunkenStatue',
        group,
        headGroup,
        eyes,
        glowEyeMat,
        pulseSpeed: 1.8 + prng() * 0.8,
        pulsePhase: prng() * Math.PI * 2,
    };
}

/**
 * Creates an ancient towering glowing aqueduct archway running along or over the bank.
 * Features carved stone arches, glowing cyan runic waterways, and luminous waterfalls cascading down.
 */
function createGlowingAqueduct(THREE, side, z, bankOffset, prng) {
    const group = new THREE.Group();
    group.name = `GlowingAqueduct_${side > 0 ? 'R' : 'L'}_${Math.round(z)}`;
    group.position.set(side * bankOffset, 0, z);
    group.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;

    const cavernArchMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x1e293b,
        roughness: 0.9,
        flatShading: true,
    });
    const runeTrimMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x0e7490,
        emissive: new THREE.Color(0x0891b2),
        emissiveIntensity: 0.8,
    });
    const aquaWaterMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x22d3ee,
        emissive: new THREE.Color(0x06b6d4),
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.85,
    });

    const archH = 18.0;
    const archSpan = 14.0;

    // 1. Twin Massive Support Piers
    for (const px of [-archSpan * 0.5, archSpan * 0.5]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, archH, 3.2), cavernArchMat);
        pier.position.set(px, archH * 0.5, 0);
        group.add(pier);

        // Pier decorative capital
        const cap = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.2, 4.0), runeTrimMat);
        cap.position.set(px, archH - 0.6, 0);
        group.add(cap);
    }

    // 2. High Water Spanning Trough
    const troughSpan = archSpan + 6.0;
    const trough = new THREE.Mesh(new THREE.BoxGeometry(troughSpan, 2.4, 4.2), cavernArchMat);
    trough.position.set(0, archH + 1.2, 0);
    group.add(trough);

    // Glowing Runic Waterway in the upper channel
    const glowRiver = new THREE.Mesh(new THREE.BoxGeometry(troughSpan * 0.98, 0.4, 3.0), aquaWaterMat);
    glowRiver.position.set(0, archH + 2.2, 0);
    group.add(glowRiver);

    // 3. Cascading Luminous Waterfall Pouring Over Spout toward river
    const spout = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 2.0), cavernArchMat);
    spout.position.set(0, archH + 1.2, 2.5);
    group.add(spout);

    const fallMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, archH + 1.0), aquaWaterMat);
    fallMesh.position.set(0, (archH + 1.0) * 0.5, 3.4);
    group.add(fallMesh);

    // Water Splash Pool at bottom
    const splash = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 0.4, 8), aquaWaterMat);
    splash.position.set(0, 0.2, 3.4);
    group.add(splash);

    return {
        type: 'glowingAqueduct',
        group,
        fallMesh,
        glowRiver,
        aquaWaterMat,
        splash,
        flowSpeed: 3.5 + prng() * 1.5,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACT 4: Wrecked Frigates & Lava Falls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a shattered wooden warship frigate shipwrecked upon the craggy shoreline.
 * Features a split hull ribbed with timbers, leaning broken masts with torn sails,
 * and a skeletal pirate figurehead.
 */
function createWreckedFrigate(THREE, side, z, bankOffset, prng) {
    const group = new THREE.Group();
    group.name = `WreckedFrigate_${side > 0 ? 'R' : 'L'}_${Math.round(z)}`;
    group.position.set(side * (bankOffset - 3.0), 0, z);
    // Beached diagonally
    group.rotation.y = (side > 0 ? -1 : 1) * (0.8 + prng() * 0.4);
    group.rotation.z = (side > 0 ? -1 : 1) * (0.18 + prng() * 0.1); // Ship list/tilt

    const hullWoodMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x27272a, // Dark charred/rotted timber
        roughness: 0.9,
    });
    const ribMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3f3f46,
        roughness: 0.85,
    });
    const sailMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x71717a, // Tattered storm sail
        roughness: 0.95,
        transparent: true,
        opacity: 0.8,
    });
    const goldMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xd97706,
        roughness: 0.4,
        metalness: 0.8,
    });

    // 1. Lower Keel & Broken Main Hull
    const hullLength = 18.0;
    const keel = new THREE.Mesh(new THREE.BoxGeometry(hullLength, 2.5, 5.0), hullWoodMat);
    keel.position.set(0, 1.2, 0);
    group.add(keel);

    // Exposed broken rib frames along hull sides
    for (let r = 0; r < 7; r++) {
        const rx = -6.0 + r * 2.0;
        const rib = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.22, 6, 8, Math.PI), ribMat);
        rib.rotation.y = Math.PI * 0.5;
        rib.rotation.x = Math.PI;
        rib.position.set(rx, 2.5, 0);
        group.add(rib);
    }

    // High Poop Deck (Stern Castle)
    const sternCastle = new THREE.Mesh(new THREE.BoxGeometry(5.0, 4.2, 4.6), hullWoodMat);
    sternCastle.position.set(-6.5, 3.8, 0);
    group.add(sternCastle);

    // Figurehead at bow (Dragon / Skeleton)
    const figurehead = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.5, 5), goldMat);
    figurehead.rotation.z = -Math.PI * 0.4;
    figurehead.position.set(9.2, 2.6, 0);
    group.add(figurehead);

    // 2. Leaning Broken Mainmast
    const mastPivot = new THREE.Group();
    mastPivot.position.set(0, 2.5, 0);
    mastPivot.rotation.z = (side > 0 ? 0.2 : -0.2) + (prng() - 0.5) * 0.15;
    group.add(mastPivot);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 14.0, 8), ribMat);
    mast.position.y = 7.0;
    mastPivot.add(mast);

    // Cross-spar yardarm
    const yardarm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.5, 6), ribMat);
    yardarm.rotation.z = Math.PI * 0.5;
    yardarm.position.set(0, 10.5, 0);
    mastPivot.add(yardarm);

    // Shredded hanging sail
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 4.5), sailMat);
    sail.position.set(0, 8.2, 0.4);
    sail.rotation.x = 0.1;
    mastPivot.add(sail);

    return {
        type: 'wreckedFrigate',
        group,
        mastPivot,
        sail,
        swaySpeed: 1.0 + prng() * 0.5,
        swayPhase: prng() * Math.PI * 2,
    };
}

/**
 * Creates towering volcanic crags with molten glowing lava falls spilling into the river.
 * Features basalt pillars, pulsating crimson-orange lava sheets, and rising magma ember spouts.
 */
function createLavaFalls(THREE, side, z, bankOffset, prng) {
    const group = new THREE.Group();
    group.name = `LavaFalls_${side > 0 ? 'R' : 'L'}_${Math.round(z)}`;
    group.position.set(side * bankOffset, 0, z);
    group.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;

    const basaltMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x18181b, // Obsidian volcanic black
        roughness: 0.95,
        flatShading: true,
    });
    const lavaMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xef4444,
        emissive: new THREE.Color(0xf97316),
        emissiveIntensity: 2.2,
        roughness: 0.2,
    });
    const emberMat = createMat(THREE, 'MeshBasicMaterial', {
        color: 0xfacc15,
    });

    const cliffH = 22.0;

    // 1. Stepped Hexagonal Basalt Pillars
    for (let c = 0; c < 8; c++) {
        const cx = -6.0 + (c % 4) * 4.0 + (prng() - 0.5) * 1.5;
        const cz = Math.floor(c / 4) * -4.0 - 2.0;
        const colH = cliffH * (0.6 + prng() * 0.4);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.2, colH, 6), basaltMat);
        col.position.set(cx, colH * 0.5, cz);
        group.add(col);
    }

    // 2. High Volcanic Magma Lip & Lava Sheet
    const lip = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.4, 4.0), basaltMat);
    lip.position.set(0, cliffH, -1.0);
    group.add(lip);

    // Glowing Molten Lava Falls Cascade
    const lavaSheet = new THREE.Mesh(new THREE.PlaneGeometry(4.2, cliffH + 1.0), lavaMat);
    lavaSheet.position.set(0, (cliffH + 1.0) * 0.5, 1.2);
    group.add(lavaSheet);

    // Molten River Boiling Caldron at Base
    const caldron = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.2, 0.6, 10), lavaMat);
    caldron.position.set(0, 0.3, 2.0);
    group.add(caldron);

    // 3. Floating Magma Embers Spout
    const embers = [];
    const emberCount = 6;
    for (let e = 0; e < emberCount; e++) {
        const ember = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), emberMat);
        ember.position.set((prng() - 0.5) * 3.5, 1.0 + prng() * 12.0, 1.5 + (prng() - 0.5) * 2.0);
        group.add(ember);
        embers.push({
            mesh: ember,
            baseX: ember.position.x,
            baseZ: ember.position.z,
            speed: 3.0 + prng() * 4.0,
            phase: prng() * Math.PI * 2,
        });
    }

    return {
        type: 'lavaFalls',
        group,
        lavaSheet,
        caldron,
        lavaMat,
        embers,
        flickerSeed: prng() * 100,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: buildBiomeShorelineSetpieces & updateShorelineSetpieces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Populates both banks of the river with act-specific 3D silhouette architecture.
 *
 * @param {object} THREE - Three.js namespace or mock.
 * @param {object} [options={}]
 * @param {number} [options.actIndex=1] - Act index (1 = Canyon, 2 = Harbor, 3 = Cavern, 4 = Tempest).
 * @param {number} [options.zStart=0] - Starting Z coordinate.
 * @param {number} [options.zEnd=-375] - Ending Z coordinate.
 * @param {number} [options.riverWidth=80] - Total river width in meters (default 80m).
 * @param {number} [options.seed=101] - Deterministic PRNG seed.
 * @returns {THREE.Group} Root group containing all generated landmark setpieces.
 */
export function buildBiomeShorelineSetpieces(THREE, options = {}) {
    const actIndex = Math.max(1, Math.min(4, Math.floor(options.actIndex ?? 1)));
    const zStart = options.zStart ?? 0;
    const zEnd = options.zEnd ?? -375;
    const riverWidth = Number.isFinite(options.riverWidth) && options.riverWidth > 0 ? options.riverWidth : 80;
    const seed = options.seed ?? (1000 + actIndex * 137);

    const prng = createPrng(seed);
    const rootGroup = new THREE.Group();
    rootGroup.name = `BiomeShorelineSetpieces_Act${actIndex}`;

    const halfW = riverWidth * 0.5;
    // Setpieces are stationed just beyond the water corridor on the left (-1) and right (+1) banks
    const bankOffset = halfW + 6.0;

    const span = Math.abs(zStart - zEnd);
    const minZ = Math.min(zStart, zEnd);
    const maxZ = Math.max(zStart, zEnd);

    // Determine spacing: generate landmarks every 45-65m down each bank
    const interval = Math.max(35, Math.min(75, span / 5));
    const setpieceList = [];

    // Distribute setpieces alternating along left and right banks
    for (let z = maxZ - 20; z >= minZ + 20; z -= interval) {
        // Left bank setpiece
        const zLeft = z + (prng() - 0.5) * 12.0;
        let leftSetpiece = null;

        // Right bank setpiece
        const zRight = z - interval * 0.5 + (prng() - 0.5) * 12.0;
        let rightSetpiece = null;

        if (actIndex === 1) {
            // Act 1: Sawmill Cranes & Pine Bluffs
            leftSetpiece = (setpieceList.length % 2 === 0)
                ? createSawmillCrane(THREE, -1, zLeft, bankOffset, prng)
                : createPineBluff(THREE, -1, zLeft, bankOffset, prng);

            rightSetpiece = (setpieceList.length % 2 === 0)
                ? createPineBluff(THREE, 1, zRight, bankOffset, prng)
                : createSawmillCrane(THREE, 1, zRight, bankOffset, prng);

        } else if (actIndex === 2) {
            // Act 2: Brick Warehouses & Belltowers
            leftSetpiece = (setpieceList.length % 2 === 0)
                ? createBrickWarehouse(THREE, -1, zLeft, bankOffset, prng)
                : createHarborBelltower(THREE, -1, zLeft, bankOffset, prng);

            rightSetpiece = (setpieceList.length % 2 === 0)
                ? createHarborBelltower(THREE, 1, zRight, bankOffset, prng)
                : createBrickWarehouse(THREE, 1, zRight, bankOffset, prng);

        } else if (actIndex === 3) {
            // Act 3: Sunken Statues & Glowing Aqueducts
            leftSetpiece = (setpieceList.length % 2 === 0)
                ? createSunkenStatue(THREE, -1, zLeft, bankOffset, prng)
                : createGlowingAqueduct(THREE, -1, zLeft, bankOffset, prng);

            rightSetpiece = (setpieceList.length % 2 === 0)
                ? createGlowingAqueduct(THREE, 1, zRight, bankOffset, prng)
                : createSunkenStatue(THREE, 1, zRight, bankOffset, prng);

        } else if (actIndex === 4) {
            // Act 4: Wrecked Frigates & Lava Falls
            leftSetpiece = (setpieceList.length % 2 === 0)
                ? createWreckedFrigate(THREE, -1, zLeft, bankOffset, prng)
                : createLavaFalls(THREE, -1, zLeft, bankOffset, prng);

            rightSetpiece = (setpieceList.length % 2 === 0)
                ? createLavaFalls(THREE, 1, zRight, bankOffset, prng)
                : createWreckedFrigate(THREE, 1, zRight, bankOffset, prng);
        }

        if (leftSetpiece) {
            rootGroup.add(leftSetpiece.group);
            setpieceList.push(leftSetpiece);
        }
        if (rightSetpiece) {
            rootGroup.add(rightSetpiece.group);
            setpieceList.push(rightSetpiece);
        }
    }

    // Attach metadata to group for update Shoreline Setpieces
    rootGroup.userData = {
        actIndex,
        zStart,
        zEnd,
        riverWidth,
        setpieceList,
    };

    return rootGroup;
}

/**
 * Updates dynamic animations across all biome shoreline setpieces:
 *   - Buzzsaw spinning & crane boom sway (Act 1)
 *   - Bell swinging & harbor lantern flicker (Act 2)
 *   - Titan eye pulse & waterfall flow (Act 3)
 *   - Broken mast sway, lava pulse & rising magma embers (Act 4)
 *
 * @param {THREE.Group} group - The root setpiece group created by `buildBiomeShorelineSetpieces`.
 * @param {number} [dt=0.016] - Frame delta time in seconds.
 * @param {number} [time=0] - Total elapsed game time in seconds.
 */
export function updateShorelineSetpieces(group, dt = 0.016, time = 0) {
    if (!group || !group.userData || !Array.isArray(group.userData.setpieceList)) {
        return;
    }

    const setpieceList = group.userData.setpieceList;
    const safeTime = Number.isFinite(time) ? time : 0;
    const safeDt = Number.isFinite(dt) ? dt : 0.016;

    for (let i = 0; i < setpieceList.length; i++) {
        const item = setpieceList[i];
        if (!item) continue;

        // ─── Act 1: Sawmill Crane & Pine Bluff Animations ───────────────
        if (item.type === 'sawmillCrane') {
            // Rotate circular buzzsaw
            if (item.sawBlade && item.sawBlade.rotation) {
                item.sawBlade.rotation.z += item.sawSpeed * safeDt;
            }
            // Gentle boom & suspended log sway
            if (item.boomPivot && item.boomPivot.rotation) {
                item.boomPivot.rotation.y = Math.sin(safeTime * item.swaySpeed + item.swayPhase) * 0.08;
            }
            if (item.suspendedLog && item.suspendedLog.rotation) {
                item.suspendedLog.rotation.x = Math.cos(safeTime * item.swaySpeed * 1.5 + item.swayPhase) * 0.05;
            }
        } else if (item.type === 'pineBluff') {
            // Wind rustle swaying pine trees
            if (Array.isArray(item.pineTrees)) {
                for (const pine of item.pineTrees) {
                    if (pine.group && pine.group.rotation) {
                        pine.group.rotation.z = Math.sin(safeTime * 2.0 + pine.phase) * pine.windFactor;
                    }
                }
            }
        }

        // ─── Act 2: Brick Warehouse & Harbor Belltower Animations ────────
        else if (item.type === 'brickWarehouse') {
            // Lantern subtle flicker
            if (item.lanternMat) {
                const flicker = Math.sin(safeTime * 14.0 + item.flickerSeed) * 0.25;
                item.lanternMat.emissiveIntensity = Math.max(0.4, 1.4 + flicker);
            }
        } else if (item.type === 'harborBelltower') {
            // Swinging gothic belfry bell
            if (item.bellPivot && item.bellPivot.rotation) {
                item.bellPivot.rotation.z = Math.sin(safeTime * item.swingSpeed + item.swingPhase) * 0.45;
            }
        }

        // ─── Act 3: Sunken Statue & Glowing Aqueduct Animations ──────────
        else if (item.type === 'sunkenStatue') {
            // Pulsating abyssal titan eye glow
            if (item.glowEyeMat) {
                const pulse = Math.sin(safeTime * item.pulseSpeed + item.pulsePhase) * 0.6;
                item.glowEyeMat.emissiveIntensity = Math.max(0.6, 1.8 + pulse);
            }
        } else if (item.type === 'glowingAqueduct') {
            // Luminous waterfall and runic flow pulse
            if (item.aquaWaterMat) {
                const flow = Math.sin(safeTime * item.flowSpeed) * 0.3;
                item.aquaWaterMat.emissiveIntensity = Math.max(0.8, 1.5 + flow);
            }
            if (item.splash && item.splash.scale) {
                const s = 1.0 + Math.sin(safeTime * 4.0) * 0.12;
                item.splash.scale.set(s, 1.0, s);
            }
        }

        // ─── Act 4: Wrecked Frigate & Lava Falls Animations ─────────────
        else if (item.type === 'wreckedFrigate') {
            // Broken mast creaking sway in storm wind
            if (item.mastPivot && item.mastPivot.rotation) {
                item.mastPivot.rotation.x = Math.sin(safeTime * item.swaySpeed + item.swayPhase) * 0.08;
            }
            // Tattered sail fluttering
            if (item.sail && item.sail.rotation) {
                item.sail.rotation.y = Math.cos(safeTime * 3.5 + item.swayPhase) * 0.15;
            }
        } else if (item.type === 'lavaFalls') {
            // Molten lava cascade emissive pulse
            if (item.lavaMat) {
                const lPulse = Math.sin(safeTime * 3.0 + item.flickerSeed) * 0.4;
                item.lavaMat.emissiveIntensity = Math.max(1.0, 2.2 + lPulse);
            }
            // Rising magma embers spouting upward
            if (Array.isArray(item.embers)) {
                for (const emb of item.embers) {
                    if (emb.mesh && emb.mesh.position) {
                        emb.mesh.position.y += emb.speed * safeDt;
                        // Cycle back to bottom when reaching cliff top
                        if (emb.mesh.position.y > 22.0) {
                            emb.mesh.position.y = 1.0;
                        }
                        emb.mesh.position.x = emb.baseX + Math.sin(safeTime * 2.5 + emb.phase) * 0.4;
                    }
                }
            }
        }
    }
}
