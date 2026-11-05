/**
 * Act III: Sunken Ruin Sanctuaries & Sunken Crystal Temples 3D Biome Module
 * (`public/js/world/biome-act3-sunken-crystal-temples.js`)
 *
 * Implements a grand 3D architectural biome spanning Act III (-700 to -1150):
 *   1. Physical 3D Stepped Stone Ziggurats rising majestically out of the water
 *      with tiered platforms, moss-covered ceremonial steps, and altar brazier basins.
 *   2. Broken Colonnade Viaducts lining the waterway banks and sunken causeway arches.
 *   3. Giant Floating Crystal Obelisks hovering over deep water, bobbing & rotating
 *      with cyan/emerald emissive rune glyphs and orbiting levitating crystal shards.
 *   4. Carved Stone Sanctuary Plazas in mid-river where rafts can dock safely,
 *      featuring mooring bollards, protective ward stones, and calm-water zones.
 *   5. Ancient Aqueduct Gates spanning high across the river gorge with colossal
 *      stone arches, hanging vine curtains, and waterfall sluice crests.
 *
 * Exports:
 *   - `buildSunkenCrystalTemplesBiome(THREE, options)`
 *   - `stepSunkenCrystalTemplesBiome(group, dt, time)`
 *
 * Clean, zero-external-dependency ES module. Headless mock and Three.js compatible.
 */

/**
 * Deterministic pseudo-random number generator (LCG).
 */
function createPrng(seed = 1337) {
    let s = (Math.abs(seed) || 1337) % 2147483647;
    if (s === 0) s = 1;
    return function next() {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Helper to safely instantiate materials in both Three.js and headless mock environments.
 */
function createMaterial(THREE, type, params = {}) {
    const MatClass = THREE[type] || THREE.MeshStandardMaterial || THREE.Material;
    return new MatClass(params);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Stepped Stone Ziggurats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a multi-tiered stone ziggurat rising from below the river water level.
 * Features 3 to 4 stepped stone tiers, ceremonial access ramps, corner buttresses,
 * and an open-air summit shrine with glowing cyan/emerald sacrificial braziers.
 */
function createZigguratMesh(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `Ziggurat_${config.id}`;
    group.position.set(config.x, config.y || 0, config.z);
    group.rotation.y = config.rotationY || 0;

    const baseStoneMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x1e293b, // Dark abyssal slate
        roughness: 0.9,
        metalness: 0.15,
        flatShading: true,
    });
    const mossStoneMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x134e4a, // Mossy sunken teal-stone
        roughness: 0.85,
        metalness: 0.1,
        flatShading: true,
    });
    const runeGoldMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0xd97706,
        roughness: 0.4,
        metalness: 0.6,
    });
    const brazierFlameMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x06b6d4, // Cyan flame
        emissive: new THREE.Color ? new THREE.Color(0x06b6d4) : 0x06b6d4,
        emissiveIntensity: 1.6,
        roughness: 0.2,
    });

    const tierCount = config.tierCount || 4;
    const baseWidth = config.baseWidth || 28.0;
    const tierHeight = config.tierHeight || 3.2;
    let currentY = -1.5; // Foundation anchored slightly below waterline
    let currentWidth = baseWidth;

    const tiers = [];
    const braziers = [];

    for (let t = 0; t < tierCount; t++) {
        const mat = t % 2 === 0 ? baseStoneMat : mossStoneMat;
        const tierMesh = new THREE.Mesh(
            new THREE.BoxGeometry(currentWidth, tierHeight, currentWidth),
            mat
        );
        tierMesh.position.set(0, currentY + tierHeight * 0.5, 0);
        tierMesh.castShadow = true;
        tierMesh.receiveShadow = true;
        group.add(tierMesh);
        tiers.push(tierMesh);

        // Corner buttress pillars on the lower tiers
        if (t < tierCount - 1) {
            const cornerDist = (currentWidth * 0.5) - 0.8;
            for (const cx of [-cornerDist, cornerDist]) {
                for (const cz of [-cornerDist, cornerDist]) {
                    const buttress = new THREE.Mesh(
                        new THREE.BoxGeometry(1.6, tierHeight * 1.15, 1.6),
                        baseStoneMat
                    );
                    buttress.position.set(cx, currentY + (tierHeight * 1.15) * 0.5, cz);
                    group.add(buttress);
                }
            }
        }

        currentY += tierHeight;
        currentWidth *= 0.72; // Step inward for next tier
    }

    // Summit Shrine Altar Platform
    const shrineBase = new THREE.Mesh(
        new THREE.BoxGeometry(currentWidth * 0.85, 1.2, currentWidth * 0.85),
        runeGoldMat
    );
    shrineBase.position.set(0, currentY + 0.6, 0);
    group.add(shrineBase);

    // Summit Altar Braziers (4 corners of shrine summit)
    const bDist = (currentWidth * 0.85) * 0.35;
    for (const bx of [-bDist, bDist]) {
        for (const bz of [-bDist, bDist]) {
            const brazierGroup = new THREE.Group();
            brazierGroup.position.set(bx, currentY + 1.2, bz);

            const basin = new THREE.Mesh(
                new THREE.CylinderGeometry(0.6, 0.4, 0.8, 8),
                baseStoneMat
            );
            brazierGroup.add(basin);

            const flame = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.35, 0),
                brazierFlameMat
            );
            flame.position.y = 0.65;
            flame.scale.set(0.8, 1.4, 0.8);
            brazierGroup.add(flame);

            group.add(brazierGroup);
            braziers.push({
                group: brazierGroup,
                flame,
                mat: brazierFlameMat,
                baseY: currentY + 1.2,
                phase: prng() * Math.PI * 2,
            });
        }
    }

    // Ceremonial Access Ramp facing the river channel
    const rampWidth = 4.0;
    const rampLength = baseWidth * 0.65;
    const rampTotalHeight = tierHeight * 2;
    const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(rampWidth, 0.6, rampLength),
        mossStoneMat
    );
    const rampAngle = Math.atan2(rampTotalHeight, rampLength);
    ramp.rotation.x = -rampAngle;
    ramp.position.set(0, rampTotalHeight * 0.5 - 0.5, baseWidth * 0.5 + rampLength * 0.35);
    group.add(ramp);

    return {
        type: 'ziggurat',
        id: config.id,
        group,
        position: group.position,
        tiers,
        braziers,
        summitY: currentY + 1.2,
        baseWidth,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Broken Colonnade Viaducts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds broken Roman-style sunken colonnades and viaducts lining the waterway banks.
 * Features partially submerged cylindrical pillars, ornate capitals, cracked architraves,
 * and fallen column drums submerged in the water.
 */
function createColonnadeViaductMesh(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `ColonnadeViaduct_${config.id}`;
    group.position.set(config.x, config.y || 0, config.z);
    group.rotation.y = config.rotationY || 0;

    const columnMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x334155, // Weathered ancient slate
        roughness: 0.8,
        metalness: 0.2,
        flatShading: true,
    });
    const archMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x1e293b,
        roughness: 0.9,
        metalness: 0.1,
    });
    const runeGlowMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x10b981, // Emerald rune glow
        emissive: new THREE.Color ? new THREE.Color(0x059669) : 0x059669,
        emissiveIntensity: 1.1,
        roughness: 0.3,
    });

    const columnCount = config.columnCount || 6;
    const spacing = config.spacing || 7.5;
    const baseHeight = config.height || 12.0;
    const columns = [];

    for (let i = 0; i < columnCount; i++) {
        const cz = (i - (columnCount - 1) * 0.5) * spacing;
        const colGroup = new THREE.Group();
        colGroup.position.set(0, 0, cz);

        // Intentionally break or erode some columns for sunken antiquity
        const isBroken = i % 3 === 2;
        const colHeight = isBroken ? baseHeight * 0.55 : baseHeight;

        // Base plinth
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), archMat);
        plinth.position.y = 0.4;
        colGroup.add(plinth);

        // Fluted column shaft
        const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.85, 1.05, colHeight, 10),
            columnMat
        );
        shaft.position.y = 0.8 + colHeight * 0.5;
        colGroup.add(shaft);

        if (!isBroken) {
            // Ornate stone capital
            const capital = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.2), archMat);
            capital.position.y = 0.8 + colHeight + 0.45;
            colGroup.add(capital);

            // Carved emerald rune ring on alternating intact capitals
            if (i % 2 === 0) {
                const runeBand = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.08, 6, 16), runeGlowMat);
                runeBand.rotation.x = Math.PI * 0.5;
                runeBand.position.y = 0.8 + colHeight + 0.45;
                colGroup.add(runeBand);
            }
        } else {
            // Fallen broken column drum lying in the shallows nearby
            const fallenDrum = new THREE.Mesh(
                new THREE.CylinderGeometry(0.85, 0.85, 3.2, 8),
                columnMat
            );
            fallenDrum.rotation.z = Math.PI * 0.45;
            fallenDrum.rotation.y = prng() * Math.PI;
            fallenDrum.position.set(1.8, 0.5, 0.6);
            colGroup.add(fallenDrum);
        }

        group.add(colGroup);
        columns.push(colGroup);

        // Architrave lintel connecting non-broken adjacent columns
        if (i < columnCount - 1 && !isBroken && (i + 1) % 3 !== 2) {
            const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, spacing * 1.02), archMat);
            lintel.position.set(0, 0.8 + baseHeight + 1.4, cz + spacing * 0.5);
            group.add(lintel);
        }
    }

    return {
        type: 'colonnadeViaduct',
        id: config.id,
        group,
        position: group.position,
        columns,
        length: columnCount * spacing,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Giant Floating Crystal Obelisks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds giant monolithic crystal obelisks hovering levitated over the water.
 * Bob and rotate continuously with cyan and emerald emissive runes and orbiting energy shards.
 */
function createFloatingCrystalObeliskMesh(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `FloatingCrystalObelisk_${config.id}`;
    group.position.set(config.x, config.y || 4.5, config.z);

    const isEmerald = config.colorVariant === 'emerald';
    const primaryColor = isEmerald ? 0x10b981 : 0x06b6d4;
    const emissiveColor = isEmerald ? 0x059669 : 0x0891b2;

    const crystalMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: primaryColor,
        emissive: new THREE.Color ? new THREE.Color(emissiveColor) : emissiveColor,
        emissiveIntensity: 1.5,
        roughness: 0.12,
        metalness: 0.85,
        transparent: true,
        opacity: 0.92,
    });
    const runeRingMat = createMaterial(THREE, 'MeshBasicMaterial', {
        color: isEmerald ? 0x6ee7b7 : 0x67e8f9,
        wireframe: true,
    });
    const submergedPedestalMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x0f172a,
        roughness: 0.95,
        metalness: 0.2,
    });

    // Submerged ancient sunken pedestal under the floating crystal
    const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(2.8, 3.6, 2.2, 8),
        submergedPedestalMat
    );
    pedestal.position.set(0, -config.y || -4.5 + 1.0, 0);
    group.add(pedestal);

    // Floating Main Crystal Monolith (Octahedron elongated into prism spire)
    const coreHeight = config.height || 9.5;
    const coreRadius = config.radius || 2.4;
    const crystalCore = new THREE.Mesh(
        new THREE.OctahedronGeometry(coreRadius, 0),
        crystalMat
    );
    crystalCore.scale.set(1.0, coreHeight / (coreRadius * 2), 1.0);
    crystalCore.position.set(0, 0, 0);
    crystalCore.castShadow = true;
    group.add(crystalCore);

    // Orbiting rune energy rings (equatorial)
    const runeRing = new THREE.Mesh(
        new THREE.TorusGeometry(coreRadius * 1.55, 0.09, 8, 24),
        runeRingMat
    );
    runeRing.rotation.x = Math.PI * 0.45;
    group.add(runeRing);

    // Secondary vertical counter-rotating ring
    const secondaryRing = new THREE.Mesh(
        new THREE.TorusGeometry(coreRadius * 1.8, 0.06, 6, 20),
        runeRingMat
    );
    secondaryRing.rotation.y = Math.PI * 0.35;
    group.add(secondaryRing);

    // Orbiting levitating energy shards
    const shardCount = config.shardCount || 5;
    const shards = [];
    const shardMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: primaryColor,
        emissive: new THREE.Color ? new THREE.Color(emissiveColor) : emissiveColor,
        emissiveIntensity: 1.8,
        roughness: 0.1,
    });

    for (let i = 0; i < shardCount; i++) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), shardMat);
        shard.scale.set(0.65, 1.8, 0.65);
        group.add(shard);

        shards.push({
            mesh: shard,
            orbitRadius: coreRadius * 1.7 + (i % 2) * 0.9,
            speed: (i % 2 === 0 ? 1 : -1) * (0.8 + prng() * 0.7),
            phase: (i / shardCount) * Math.PI * 2,
            baseY: -1.2 + (i / shardCount) * 2.4,
        });
    }

    return {
        type: 'crystalObelisk',
        id: config.id,
        group,
        position: group.position,
        crystalCore,
        crystalMat,
        runeRing,
        secondaryRing,
        shards,
        baseY: config.y || 4.5,
        rotationSpeed: 0.35 + prng() * 0.3,
        bobSpeed: 1.2 + prng() * 0.5,
        bobAmplitude: 0.45,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Carved Stone Sanctuary Plazas (Safe Docking Zones)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds carved stone sanctuary plazas placed in mid-river where player rafts
 * can dock safely out of current hazards.
 * Features paved stone flagstone platform, mooring bollards, protective ward stones
 * with luminous crystal runes, and entrance channel beacons.
 */
function createSanctuaryPlazaMesh(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `SanctuaryPlaza_${config.id}`;
    group.position.set(config.x, config.y || 0.15, config.z);

    const stoneFloorMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x334155, // Carved granite/slate
        roughness: 0.75,
        metalness: 0.2,
    });
    const dockTrimMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x1e293b,
        roughness: 0.85,
    });
    const woodBollardMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x475569,
        roughness: 0.6,
        metalness: 0.5,
    });
    const wardRuneMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x34d399, // Luminous emerald ward
        emissive: new THREE.Color ? new THREE.Color(0x10b981) : 0x10b981,
        emissiveIntensity: 1.4,
        roughness: 0.2,
    });
    const safeZoneRingMat = createMaterial(THREE, 'MeshBasicMaterial', {
        color: 0x10b981,
        transparent: true,
        opacity: 0.3,
    });

    const width = config.width || 18.0;
    const length = config.length || 24.0;
    const halfW = width * 0.5;
    const halfL = length * 0.5;

    // A. Main Flagstone Plaza Deck (raised just above water line)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.6, length), stoneFloorMat);
    deck.position.set(0, 0, 0);
    deck.receiveShadow = true;
    group.add(deck);

    // Beveled Dock Edge Trims
    const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, length), dockTrimMat);
    leftTrim.position.set(-halfW + 0.25, 0.1, 0);
    const rightTrim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, length), dockTrimMat);
    rightTrim.position.set(halfW - 0.25, 0.1, 0);
    group.add(leftTrim, rightTrim);

    // B. Mooring Bollards (for docking tie-ups along left and right slips)
    const bollards = [];
    const bollardCount = 4;
    for (let i = 0; i < bollardCount; i++) {
        const bz = -halfL * 0.6 + (i / (bollardCount - 1)) * (length * 0.6);
        for (const bx of [-halfW + 0.7, halfW - 0.7]) {
            const bMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.22, 0.28, 0.85, 8),
                woodBollardMat
            );
            bMesh.position.set(bx, 0.5, bz);
            group.add(bMesh);
            bollards.push(bMesh);
        }
    }

    // C. Central Ward Obelisk & Protective Rune Monolith
    const wardGroup = new THREE.Group();
    wardGroup.position.set(0, 0.3, 0);

    const wardBase = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.0, 6), dockTrimMat);
    wardBase.position.y = 0.5;
    wardGroup.add(wardBase);

    const wardCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), wardRuneMat);
    wardCrystal.scale.set(0.7, 2.2, 0.7);
    wardCrystal.position.set(0, 2.1, 0);
    wardGroup.add(wardCrystal);

    // Calming ward protection aura ring projected on the water
    const auraRing = new THREE.Mesh(
        new THREE.RingGeometry(halfW * 0.9, halfW * 1.15, 32),
        safeZoneRingMat
    );
    auraRing.rotation.x = -Math.PI * 0.5;
    auraRing.position.set(0, 0.05, 0);
    wardGroup.add(auraRing);

    group.add(wardGroup);

    // Docking safety bounds rectangle centered on this plaza
    const dockingRadius = Math.max(width, length) * 0.55;

    return {
        type: 'sanctuaryPlaza',
        id: config.id,
        group,
        position: group.position,
        dockingRadius,
        safeBounds: {
            minX: config.x - halfW,
            maxX: config.x + halfW,
            minZ: config.z - halfL,
            maxZ: config.z + halfL,
        },
        wardCrystal,
        wardRuneMat,
        auraRing,
        bollards,
        isDocked: false,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Ancient Aqueduct Gates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds monumental ancient aqueduct gates spanning the river width gorge.
 * Features colossal twin support pylons, massive triumphal stone arches,
 * upper viaduct water channel, and hanging river sluice curtains.
 */
function createAqueductGateMesh(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `AqueductGate_${config.id}`;
    group.position.set(config.x || 0, config.y || 0, config.z);

    const archStoneMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x1e293b,
        roughness: 0.85,
        metalness: 0.2,
        flatShading: true,
    });
    const aqueductTrimMat = createMaterial(THREE, 'MeshStandardMaterial', {
        color: 0x0f172a,
        roughness: 0.75,
        metalness: 0.3,
    });
    const sluiceGlowMat = createMaterial(THREE, 'MeshBasicMaterial', {
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide || 2,
    });

    const spanWidth = config.spanWidth || 80.0;
    const gateHeight = config.gateHeight || 22.0;
    const pylonWidth = 7.0;
    const halfSpan = spanWidth * 0.5;

    // A. Colossal Left & Right Riverbank Anchor Pylons
    for (const sideX of [-halfSpan, halfSpan]) {
        const pylonGroup = new THREE.Group();
        pylonGroup.position.set(sideX, 0, 0);

        // Lower heavy foundation pillar
        const foundation = new THREE.Mesh(
            new THREE.BoxGeometry(pylonWidth * 1.3, 6.0, 9.0),
            archStoneMat
        );
        foundation.position.y = 1.5;
        pylonGroup.add(foundation);

        // Tall arch pylon column
        const column = new THREE.Mesh(
            new THREE.BoxGeometry(pylonWidth, gateHeight, 7.5),
            archStoneMat
        );
        column.position.y = gateHeight * 0.5;
        pylonGroup.add(column);

        // Capital cornice
        const cornice = new THREE.Mesh(
            new THREE.BoxGeometry(pylonWidth * 1.25, 2.0, 8.5),
            aqueductTrimMat
        );
        cornice.position.y = gateHeight + 1.0;
        pylonGroup.add(cornice);

        group.add(pylonGroup);
    }

    // B. Spanning Viaduct Deck / Trough Header
    const viaductDeck = new THREE.Mesh(
        new THREE.BoxGeometry(spanWidth + pylonWidth * 2, 3.2, 8.0),
        archStoneMat
    );
    viaductDeck.position.set(0, gateHeight + 2.6, 0);
    group.add(viaductDeck);

    // High protective balustrades
    for (const bz of [-3.8, 3.8]) {
        const balustrade = new THREE.Mesh(
            new THREE.BoxGeometry(spanWidth + pylonWidth * 2, 1.4, 0.4),
            aqueductTrimMat
        );
        balustrade.position.set(0, gateHeight + 4.5, bz);
        group.add(balustrade);
    }

    // C. Sweeping Arch Keystones Underneath Viaduct
    const archSegmentCount = 5;
    for (let a = 0; a < archSegmentCount; a++) {
        const norm = (a / (archSegmentCount - 1)) * 2 - 1; // -1 to 1
        const ax = norm * (halfSpan * 0.72);
        const archArch = new THREE.Mesh(
            new THREE.BoxGeometry(halfSpan * 0.32, 2.2, 6.5),
            archStoneMat
        );
        // Parabolic arch curve
        const archY = gateHeight - Math.pow(norm, 2) * 4.5;
        archArch.position.set(ax, archY, 0);
        group.add(archArch);
    }

    // D. Hanging Waterfall Sluice Curtain (procedural water plane from aqueduct trough)
    const sluiceCurtain = new THREE.Mesh(
        new THREE.PlaneGeometry(spanWidth * 0.65, gateHeight * 0.75),
        sluiceGlowMat
    );
    sluiceCurtain.position.set(0, gateHeight * 0.55, 0);
    group.add(sluiceCurtain);

    return {
        type: 'aqueductGate',
        id: config.id,
        group,
        position: group.position,
        spanWidth,
        gateHeight,
        clearanceHeight: gateHeight - 5.0,
        sluiceCurtain,
        sluiceGlowMat,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Biome Assembly & Step Director
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the complete physical 3D Act III Sunken Ruin Sanctuaries & Crystal Temples biome.
 *
 * @param {object} THREE - Three.js namespace or headless mock.
 * @param {object} [options={}] - Configuration options.
 * @param {number} [options.riverWidth=80] - Width of the river channel.
 * @param {number} [options.zStart=-700] - Start Z coordinate for Act III.
 * @param {number} [options.zEnd=-1150] - End Z coordinate for Act III.
 * @param {number} [options.seed=1337] - Seed for deterministic procedural placement.
 * @returns {THREE.Group} Root biome group with metadata in `group.userData`.
 */
export function buildSunkenCrystalTemplesBiome(THREE, options = {}) {
    const riverWidth = options.riverWidth ?? 80;
    const zStart = options.zStart ?? -700;
    const zEnd = options.zEnd ?? -1150;
    const seed = options.seed ?? 1337;
    const prng = createPrng(seed);

    const rootGroup = new THREE.Group();
    rootGroup.name = 'BiomeAct3_SunkenCrystalTemples';

    const halfW = riverWidth * 0.5;
    const zSpan = Math.abs(zEnd - zStart);

    const ziggurats = [];
    const colonnades = [];
    const obelisks = [];
    const sanctuaries = [];
    const aqueducts = [];

    // 1. Physical 3D Stepped Stone Ziggurats (Flanking the canyon riverbanks)
    // Placed along left and right banks between -730 and -1120
    const zigguratZPositions = [
        zStart - zSpan * 0.12, // ~ -754
        zStart - zSpan * 0.38, // ~ -871
        zStart - zSpan * 0.65, // ~ -992
        zStart - zSpan * 0.88, // ~ -1096
    ];

    for (let i = 0; i < zigguratZPositions.length; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const zPos = zigguratZPositions[i];
        const xPos = side * (halfW + 16.0 + (prng() - 0.5) * 4.0);
        const rotY = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;

        const zig = createZigguratMesh(THREE, {
            id: `zig_${i + 1}`,
            x: xPos,
            y: 0,
            z: zPos,
            rotationY: rotY,
            tierCount: 4,
            baseWidth: 26.0 + (i % 2) * 4.0,
            tierHeight: 3.2,
        }, prng);

        rootGroup.add(zig.group);
        ziggurats.push(zig);
    }

    // 2. Broken Colonnade Viaducts (Lining the channel edges)
    const colonnadeZPositions = [
        zStart - zSpan * 0.08,
        zStart - zSpan * 0.28,
        zStart - zSpan * 0.54,
        zStart - zSpan * 0.76,
    ];

    for (let c = 0; c < colonnadeZPositions.length; c++) {
        const side = c % 2 === 0 ? -1 : 1;
        const zPos = colonnadeZPositions[c];
        const xPos = side * (halfW + 4.5);

        const col = createColonnadeViaductMesh(THREE, {
            id: `col_${c + 1}`,
            x: xPos,
            y: 0,
            z: zPos,
            columnCount: 6,
            spacing: 7.0,
            height: 11.5,
        }, prng);

        rootGroup.add(col.group);
        colonnades.push(col);
    }

    // 3. Giant Floating Crystal Obelisks (Hovering over river deeps & alcoves)
    const obeliskZPositions = [
        zStart - zSpan * 0.2,  // ~ -790
        zStart - zSpan * 0.45, // ~ -902
        zStart - zSpan * 0.72, // ~ -1024
        zStart - zSpan * 0.94, // ~ -1123
    ];

    for (let o = 0; o < obeliskZPositions.length; o++) {
        const side = o % 2 === 0 ? -0.45 : 0.45;
        const xPos = side * halfW;
        const zPos = obeliskZPositions[o];
        const variant = o % 2 === 0 ? 'cyan' : 'emerald';

        const ob = createFloatingCrystalObeliskMesh(THREE, {
            id: `obelisk_${o + 1}`,
            x: xPos,
            y: 5.2,
            z: zPos,
            height: 9.0 + (o % 2) * 2.0,
            radius: 2.2,
            colorVariant: variant,
            shardCount: 5,
        }, prng);

        rootGroup.add(ob.group);
        obelisks.push(ob);
    }

    // 4. Carved Stone Sanctuary Plazas (Safe mid-river docking havens)
    const sanctuaryZPositions = [
        zStart - zSpan * 0.32, // ~ -844
        zStart - zSpan * 0.8,  // ~ -1060
    ];

    for (let s = 0; s < sanctuaryZPositions.length; s++) {
        // Place one slightly to the left, one slightly to the right of channel centerline
        const xPos = (s === 0 ? -1 : 1) * 8.0;
        const zPos = sanctuaryZPositions[s];

        const sanct = createSanctuaryPlazaMesh(THREE, {
            id: `sanctuary_${s + 1}`,
            x: xPos,
            y: 0.2,
            z: zPos,
            width: 16.0,
            length: 22.0,
        }, prng);

        rootGroup.add(sanct.group);
        sanctuaries.push(sanct);
    }

    // 5. Ancient Aqueduct Gates (Spanning across the river gorge)
    const aqueductZPositions = [
        zStart - zSpan * 0.16, // ~ -772
        zStart - zSpan * 0.6,  // ~ -970
    ];

    for (let a = 0; a < aqueductZPositions.length; a++) {
        const zPos = aqueductZPositions[a];

        const aq = createAqueductGateMesh(THREE, {
            id: `aqueduct_${a + 1}`,
            x: 0,
            y: 0,
            z: zPos,
            spanWidth: riverWidth + 12.0,
            gateHeight: 22.0,
        }, prng);

        rootGroup.add(aq.group);
        aqueducts.push(aq);
    }

    rootGroup.userData = {
        type: 'SunkenCrystalTemplesBiome',
        biomeId: 'act3-sunken-crystal-temples',
        riverWidth,
        zStart,
        zEnd,
        ziggurats,
        colonnades,
        obelisks,
        sanctuaries,
        aqueducts,
    };

    return rootGroup;
}

/**
 * Steps procedural animations across the Sunken Crystal Temples 3D biome:
 * bobs and spins crystal obelisks, orbits energy shards, pulses brazier flames,
 * animates ward runes, and shimmers aqueduct sluice curtains.
 *
 * @param {THREE.Group} group - The biome root group returned by `buildSunkenCrystalTemplesBiome`.
 * @param {number} dt - Frame delta time in seconds.
 * @param {number} time - Total elapsed elapsed game time in seconds.
 */
export function stepSunkenCrystalTemplesBiome(group, dt = 0.016, time = 0) {
    if (!group || !group.userData) return;
    const data = group.userData;

    // 1. Animate Giant Floating Crystal Obelisks
    if (Array.isArray(data.obelisks)) {
        for (const ob of data.obelisks) {
            // Smooth vertical floating bob
            const bob = Math.sin(time * ob.bobSpeed) * ob.bobAmplitude;
            ob.group.position.y = ob.baseY + bob;

            // Slow axial rotation
            if (ob.crystalCore) {
                ob.crystalCore.rotation.y = time * ob.rotationSpeed;
                ob.crystalCore.rotation.z = Math.sin(time * 0.8) * 0.05;
            }

            // Counter-rotating rune rings
            if (ob.runeRing) {
                ob.runeRing.rotation.z = time * 0.9;
            }
            if (ob.secondaryRing) {
                ob.secondaryRing.rotation.y = -time * 0.7;
            }

            // Pulse crystal emissive glow
            if (ob.crystalMat) {
                const pulse = 0.25 * Math.sin(time * 3.0);
                ob.crystalMat.emissiveIntensity = 1.5 + pulse;
            }

            // Orbit levitating shards around the obelisk
            if (Array.isArray(ob.shards)) {
                for (const s of ob.shards) {
                    const angle = time * s.speed + s.phase;
                    s.mesh.position.x = Math.cos(angle) * s.orbitRadius;
                    s.mesh.position.z = Math.sin(angle) * s.orbitRadius;
                    s.mesh.position.y = s.baseY + Math.sin(time * 2.2 + s.phase) * 0.35;
                    s.mesh.rotation.y = angle * 2.0;
                    s.mesh.rotation.x = Math.sin(angle);
                }
            }
        }
    }

    // 2. Animate Ziggurat Summit Braziers
    if (Array.isArray(data.ziggurats)) {
        for (const zig of data.ziggurats) {
            if (Array.isArray(zig.braziers)) {
                for (const b of zig.braziers) {
                    const flicker = Math.sin(time * 6.0 + b.phase) * 0.08;
                    b.flame.scale.y = 1.4 + flicker;
                    b.flame.rotation.y = time * 2.0 + b.phase;
                }
            }
        }
    }

    // 3. Animate Sanctuary Ward Crystals & Safe Zone Aura Rings
    if (Array.isArray(data.sanctuaries)) {
        for (const sanct of data.sanctuaries) {
            if (sanct.wardCrystal) {
                sanct.wardCrystal.rotation.y = time * 0.75;
                sanct.wardCrystal.position.y = 2.1 + Math.sin(time * 1.8) * 0.15;
            }
            if (sanct.wardRuneMat) {
                sanct.wardRuneMat.emissiveIntensity = 1.4 + Math.sin(time * 2.5) * 0.3;
            }
            if (sanct.auraRing) {
                const ringScale = 1.0 + Math.sin(time * 1.5) * 0.03;
                sanct.auraRing.scale.set(ringScale, ringScale, ringScale);
            }
        }
    }

    // 4. Animate Aqueduct Gate Sluice Curtains
    if (Array.isArray(data.aqueducts)) {
        for (const aq of data.aqueducts) {
            if (aq.sluiceGlowMat) {
                aq.sluiceGlowMat.opacity = 0.4 + Math.sin(time * 4.0) * 0.08;
            }
        }
    }
}
