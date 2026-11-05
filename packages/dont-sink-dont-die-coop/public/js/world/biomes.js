/**
 * Don't Sink, Don't Die — 4-Act River Biomes Engine
 * Zero-dependency ES module for Act identification, palette interpolation,
 * and procedural 3D landmark prop generation.
 */

export const RIVER_BIOMES = [
    {
        actIndex: 1,
        id: 'amber-canyon',
        name: 'Amber Canyon Headwaters',
        zStart: 0,
        zEnd: -375,
        fogDensity: 0.0035,
        waveAmplitude: 0.08,
        waveSpeed: 1.0,
        skyColors: {
            top: { r: 0.05, g: 0.11, b: 0.21 },       // 0x0d1b35 deep twilight
            mid: { r: 0.17, g: 0.30, b: 0.44 },       // 0x2b4c6f mid gradient
            horizon: { r: 0.85, g: 0.50, b: 0.33 },   // 0xd97f54 warm sunset
        },
        fogColor: { r: 0.16, g: 0.24, b: 0.33 },      // 0x283c54
        waterColors: {
            shallow: { r: 0.23, g: 0.18, b: 0.15 },   // 0x3a2f25 muddy brown
            deep: { r: 0.02, g: 0.12, b: 0.21 },      // 0x041f36 deep murk
            clarity: 0.1,
        },
        light: {
            sunColor: { r: 1.0, g: 0.88, b: 0.70 },   // 0xffe0b2 warm golden
            sunIntensity: 1.3,
            hemiSky: { r: 0.62, g: 0.77, b: 1.0 },     // 0x9ec5ff
            hemiGround: { r: 0.24, g: 0.18, b: 0.12 },  // 0x3d2e1e
        },
        features: ['canyon-spires', 'red-rock-bluffs', 'floating-timber', 'warm-haze'],
    },
    {
        actIndex: 2,
        id: 'neon-harbor',
        name: 'Neon Harbor & Smuggler Docks',
        zStart: -375,
        zEnd: -750,
        fogDensity: 0.0045,
        waveAmplitude: 0.06,
        waveSpeed: 0.85,
        skyColors: {
            top: { r: 0.04, g: 0.06, b: 0.16 },       // 0x0a1029 indigo night
            mid: { r: 0.09, g: 0.13, b: 0.27 },       // 0x172145 dark purple/slate
            horizon: { r: 0.28, g: 0.18, b: 0.45 },   // 0x472e73 neon twilight
        },
        fogColor: { r: 0.10, g: 0.12, b: 0.22 },      // 0x191e38 harbor haze
        waterColors: {
            shallow: { r: 0.07, g: 0.25, b: 0.38 },   // 0x123f61 industrial blue
            deep: { r: 0.03, g: 0.08, b: 0.18 },      // 0x08142e midnight oil
            clarity: 0.45,
        },
        light: {
            sunColor: { r: 0.45, g: 0.75, b: 1.0 },    // 0x73bfff cool cyan-blue
            sunIntensity: 0.95,
            hemiSky: { r: 0.32, g: 0.42, b: 0.68 },   // 0x526bae
            hemiGround: { r: 0.12, g: 0.14, b: 0.22 },  // 0x1e2438
        },
        features: ['merchant-cranes', 'mooring-buoys', 'police-spotlights', 'neon-glow'],
    },
    {
        actIndex: 3,
        id: 'bioluminescent-gorge',
        name: 'Bioluminescent Abyssal Gorge',
        zStart: -750,
        zEnd: -1125,
        fogDensity: 0.0055,
        waveAmplitude: 0.11,
        waveSpeed: 1.25,
        skyColors: {
            top: { r: 0.01, g: 0.03, b: 0.08 },       // 0x030814 deep cavern
            mid: { r: 0.04, g: 0.10, b: 0.18 },       // 0x0a1a2e abyssal teal
            horizon: { r: 0.08, g: 0.35, b: 0.42 },   // 0x14596b glowing cyan
        },
        fogColor: { r: 0.05, g: 0.15, b: 0.20 },      // 0x0d2633 bioluminescent mist
        waterColors: {
            shallow: { r: 0.04, g: 0.38, b: 0.45 },   // 0x0a6173 glowing emerald-teal
            deep: { r: 0.01, g: 0.15, b: 0.22 },      // 0x032638 abyssal deep
            clarity: 0.8,
        },
        light: {
            sunColor: { r: 0.35, g: 0.95, b: 0.85 },   // 0x59f3d9 cyan crystal glow
            sunIntensity: 0.8,
            hemiSky: { r: 0.18, g: 0.58, b: 0.65 },   // 0x2e94a6
            hemiGround: { r: 0.08, g: 0.18, b: 0.16 },  // 0x142e29
        },
        features: ['glowing-stalagmites', 'weeping-willows', 'spore-fireflies', 'magenta-crystals'],
    },
    {
        actIndex: 4,
        id: 'tempest-maelstrom',
        name: 'Tempest Maelstrom & Citadel Mouth',
        zStart: -1125,
        zEnd: -1500, // Extensible to -4000
        fogDensity: 0.0068,
        waveAmplitude: 0.19,
        waveSpeed: 1.7,
        skyColors: {
            top: { r: 0.03, g: 0.05, b: 0.10 },       // 0x080d1a tempest navy
            mid: { r: 0.11, g: 0.14, b: 0.22 },       // 0x1c2438 storm clouds
            horizon: { r: 0.22, g: 0.28, b: 0.38 },   // 0x384761 lightning overcast
        },
        fogColor: { r: 0.14, g: 0.17, b: 0.24 },      // 0x242b3d storm fog
        waterColors: {
            shallow: { r: 0.09, g: 0.35, b: 0.55 },   // 0x17598c stormy ocean
            deep: { r: 0.02, g: 0.10, b: 0.20 },      // 0x051a33 trench deep
            clarity: 1.0,
        },
        light: {
            sunColor: { r: 0.75, g: 0.82, b: 0.95 },   // 0xc0d1f2 pale lightning overcast
            sunIntensity: 1.1,
            hemiSky: { r: 0.35, g: 0.42, b: 0.58 },   // 0x596b94
            hemiGround: { r: 0.09, g: 0.11, b: 0.15 },  // 0x171c26
        },
        features: ['maelstrom-waves', 'marble-ruins', 'lightning-flashes', 'citadel-pillars'],
    },
];

export const TRANSITION_ZONE_METERS = 75;

/** Helper clamp function */
function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

/** Linear interpolation between two numbers */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Linear interpolation between RGB objects */
function lerpColor(c1, c2, t) {
    return {
        r: lerp(c1.r, c2.r, t),
        g: lerp(c1.g, c2.g, t),
        b: lerp(c1.b, c2.b, t),
    };
}

/**
 * Returns the primary biome definition active at coordinate z (downriver is negative z).
 * Handles progression from z >= 0 down past z = -1500 (extensible to -4000).
 */
export function getBiomeAtZ(z) {
    const numBiomes = RIVER_BIOMES.length;
    if (z >= RIVER_BIOMES[0].zStart) {
        return RIVER_BIOMES[0];
    }
    for (let i = 0; i < numBiomes; i++) {
        const biome = RIVER_BIOMES[i];
        if (z > biome.zEnd) {
            return biome;
        }
    }
    // Beyond z = -1500, act IV persists all the way down to -4000+
    return RIVER_BIOMES[numBiomes - 1];
}

/**
 * Deterministically computes the smoothly interpolated biome palette at river coordinate z.
 * Across act boundary regions (+/- TRANSITION_ZONE_METERS), colors, fog, wave amplitude,
 * and lighting blend seamlessly.
 */
export function interpolateBiomePalette(z) {
    const act1 = RIVER_BIOMES[0];
    const act2 = RIVER_BIOMES[1];
    const act3 = RIVER_BIOMES[2];
    const act4 = RIVER_BIOMES[3];

    // Boundaries: -375, -750, -1125
    const tZone = TRANSITION_ZONE_METERS;

    let b1 = act1;
    let b2 = act1;
    let factor = 0;

    if (z >= act1.zEnd + tZone) {
        // Pure Act 1
        b1 = act1;
        b2 = act1;
        factor = 0;
    } else if (z >= act1.zEnd - tZone) {
        // Blend Act 1 -> Act 2
        b1 = act1;
        b2 = act2;
        factor = clamp((act1.zEnd + tZone - z) / (2 * tZone), 0, 1);
    } else if (z >= act2.zEnd + tZone) {
        // Pure Act 2
        b1 = act2;
        b2 = act2;
        factor = 0;
    } else if (z >= act2.zEnd - tZone) {
        // Blend Act 2 -> Act 3
        b1 = act2;
        b2 = act3;
        factor = clamp((act2.zEnd + tZone - z) / (2 * tZone), 0, 1);
    } else if (z >= act3.zEnd + tZone) {
        // Pure Act 3
        b1 = act3;
        b2 = act3;
        factor = 0;
    } else if (z >= act3.zEnd - tZone) {
        // Blend Act 3 -> Act 4
        b1 = act3;
        b2 = act4;
        factor = clamp((act3.zEnd + tZone - z) / (2 * tZone), 0, 1);
    } else {
        // Pure Act 4 (and beyond -1500 down to -4000)
        b1 = act4;
        b2 = act4;
        factor = 0;
    }

    return {
        actIndex: factor < 0.5 ? b1.actIndex : b2.actIndex,
        z,
        fogDensity: lerp(b1.fogDensity, b2.fogDensity, factor),
        fogColor: lerpColor(b1.fogColor, b2.fogColor, factor),
        waveAmplitude: lerp(b1.waveAmplitude, b2.waveAmplitude, factor),
        waveSpeed: lerp(b1.waveSpeed, b2.waveSpeed, factor),
        skyColors: {
            top: lerpColor(b1.skyColors.top, b2.skyColors.top, factor),
            mid: lerpColor(b1.skyColors.mid, b2.skyColors.mid, factor),
            horizon: lerpColor(b1.skyColors.horizon, b2.skyColors.horizon, factor),
        },
        waterColors: {
            shallow: lerpColor(b1.waterColors.shallow, b2.waterColors.shallow, factor),
            deep: lerpColor(b1.waterColors.deep, b2.waterColors.deep, factor),
            clarity: lerp(b1.waterColors.clarity, b2.waterColors.clarity, factor),
        },
        light: {
            sunColor: lerpColor(b1.light.sunColor, b2.light.sunColor, factor),
            sunIntensity: lerp(b1.light.sunIntensity, b2.light.sunIntensity, factor),
            hemiSky: lerpColor(b1.light.hemiSky, b2.light.hemiSky, factor),
            hemiGround: lerpColor(b1.light.hemiGround, b2.light.hemiGround, factor),
        },
        primaryBiome: b1.id,
        nextBiome: b2.id,
        blendRatio: factor,
    };
}

/**
 * Creates rich procedural Three.js landmark props for a specific Act.
 * Act I: Red-rock canyon spires, weathered timber logs, canyon bluffs.
 * Act II: Industrial shipyard cranes, floating radar buoys, spotlight beacons.
 * Act III: Bioluminescent glowing crystal stalagmites, weeping swamp willows, floating spore firefly motes.
 * Act IV: Sunken ancient marble ruin pillars, broken arches, storm obelisks.
 *
 * @param {object} THREE - The Three.js library instance.
 * @param {number} actIndex - Act number (1, 2, 3, or 4).
 * @param {number} riverWidth - Width of the river channel.
 * @returns {THREE.Group} Procedural 3D landmarks group.
 */
export function createBiomePropsGroup(THREE, actIndex, riverWidth = 30) {
    const group = new THREE.Group();
    group.name = `BiomeProps_Act_${actIndex}`;

    const halfW = riverWidth * 0.5;

    if (actIndex === 1) {
        // ─── ACT I: Amber Canyon Headwaters ─────────────────────────────
        const redRockMat = new THREE.MeshStandardMaterial({
            color: 0x9e4b2d,
            roughness: 0.85,
            metalness: 0.05,
            flatShading: true,
        });
        const sandRockMat = new THREE.MeshStandardMaterial({
            color: 0xc48255,
            roughness: 0.9,
            flatShading: true,
        });
        const timberMat = new THREE.MeshStandardMaterial({
            color: 0x4a321d,
            roughness: 0.8,
        });

        // Canyon Spire clusters on both banks
        for (let i = 0; i < 8; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const spireGroup = new THREE.Group();
            const posX = side * (halfW + 12 + (i * 3.7) % 15);
            const posZ = -30 - i * 40;
            spireGroup.position.set(posX, 0, posZ);

            const height = 18 + (i * 5.3) % 14;
            const radius = 3.5 + (i * 1.2) % 3;
            const spireGeo = new THREE.ConeGeometry(radius, height, 6);
            const spireMesh = new THREE.Mesh(spireGeo, (i % 3 === 0) ? sandRockMat : redRockMat);
            spireMesh.position.y = height * 0.5;
            spireMesh.castShadow = true;
            spireMesh.receiveShadow = true;
            spireGroup.add(spireMesh);

            // Surrounding boulders
            for (let b = 0; b < 3; b++) {
                const bSize = 1.2 + (b * 0.8);
                const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(bSize, 1), redRockMat);
                boulder.position.set((b - 1) * 2.8, bSize * 0.5, (b % 2 === 0 ? 1 : -1) * 2.5);
                boulder.castShadow = true;
                spireGroup.add(boulder);
            }
            group.add(spireGroup);
        }

        // Floating Driftwood & Timber along the river margins
        for (let t = 0; t < 6; t++) {
            const side = t % 2 === 0 ? 1 : -1;
            const logGroup = new THREE.Group();
            const lx = side * (halfW - 2.5 - (t % 3) * 1.2);
            const lz = -45 - t * 50;
            logGroup.position.set(lx, 0.1, lz);

            const logLength = 5 + (t % 3) * 2;
            const log = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, logLength, 8), timberMat);
            log.rotation.x = Math.PI / 2;
            log.rotation.z = (t * 0.4) - 0.2;
            log.castShadow = true;
            logGroup.add(log);
            group.add(logGroup);
        }

    } else if (actIndex === 2) {
        // ─── ACT II: Neon Harbor & Smuggler Docks ───────────────────────
        const steelMat = new THREE.MeshStandardMaterial({
            color: 0x2e3846,
            roughness: 0.5,
            metalness: 0.7,
        });
        const rustYellowMat = new THREE.MeshStandardMaterial({
            color: 0xd99b26,
            roughness: 0.6,
            metalness: 0.3,
        });
        const buoyRedMat = new THREE.MeshStandardMaterial({
            color: 0xd92d20,
            roughness: 0.4,
            metalness: 0.2,
        });
        const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
        const neonMagentaMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
        const spotlightMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        // Harbor Industrial Cargo Cranes on the banks
        for (let c = 0; c < 4; c++) {
            const side = c % 2 === 0 ? 1 : -1;
            const crane = new THREE.Group();
            crane.position.set(side * (halfW + 14), 0, -390 - c * 85);

            // Crane tower base
            const baseTower = new THREE.Mesh(new THREE.BoxGeometry(4, 22, 4), rustYellowMat);
            baseTower.position.y = 11;
            baseTower.castShadow = true;
            crane.add(baseTower);

            // Horizontal cantilever boom projecting over the river
            const boom = new THREE.Mesh(new THREE.BoxGeometry(side > 0 ? -16 : 16, 1.8, 2.2), steelMat);
            boom.position.set(side > 0 ? -7 : 7, 21.5, 0);
            boom.castShadow = true;
            crane.add(boom);

            // Cabin & Warning Beacon
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 2.8, 3), steelMat);
            cabin.position.set(0, 22, 0);
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), neonMagentaMat);
            beacon.position.set(0, 24, 0);
            crane.add(cabin, beacon);

            // Spotlight cone angled down toward the water
            const coneGeo = new THREE.ConeGeometry(5, 18, 16, 1, true);
            const coneMesh = new THREE.Mesh(coneGeo, spotlightMat);
            coneMesh.position.set(side > 0 ? -11 : 11, 12, 0);
            coneMesh.rotation.z = side > 0 ? 0.35 : -0.35;
            crane.add(coneMesh);

            group.add(crane);
        }

        // Mooring Buoys with pulsating navigational light tops
        for (let b = 0; b < 6; b++) {
            const side = b % 2 === 0 ? 1 : -1;
            const buoyGroup = new THREE.Group();
            const bx = side * (halfW - 2.8);
            const bz = -410 - b * 55;
            buoyGroup.position.set(bx, 0.3, bz);

            const floatMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 1.4, 10), buoyRedMat);
            floatMesh.castShadow = true;
            buoyGroup.add(floatMesh);

            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), steelMat);
            mast.position.y = 1.3;
            const light = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), neonCyanMat);
            light.position.y = 2.1;
            buoyGroup.add(mast, light);

            group.add(buoyGroup);
        }

    } else if (actIndex === 3) {
        // ─── ACT III: Bioluminescent Abyssal Gorge ───────────────────────
        const crystalCyanMat = new THREE.MeshStandardMaterial({
            color: 0x06b6d4,
            emissive: 0x0891b2,
            emissiveIntensity: 0.7,
            roughness: 0.2,
            metalness: 0.8,
            transparent: true,
            opacity: 0.9,
        });
        const crystalMagentaMat = new THREE.MeshStandardMaterial({
            color: 0xd946ef,
            emissive: 0xa21caf,
            emissiveIntensity: 0.75,
            roughness: 0.2,
            metalness: 0.7,
            transparent: true,
            opacity: 0.9,
        });
        const cavernStoneMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true,
        });
        const willowFoliageMat = new THREE.MeshStandardMaterial({
            color: 0x0f766e,
            emissive: 0x042f2e,
            roughness: 0.75,
        });
        const fireflyMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

        // Giant Crystal Stalagmites along gorge banks
        for (let k = 0; k < 10; k++) {
            const side = k % 2 === 0 ? 1 : -1;
            const stGroup = new THREE.Group();
            const sx = side * (halfW + 8 + (k * 4.1) % 12);
            const sz = -770 - k * 35;
            stGroup.position.set(sx, 0, sz);

            // Rock base
            const base = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 1), cavernStoneMat);
            base.position.y = 1.5;
            stGroup.add(base);

            // Glowing Crystal spire clusters (cyan + magenta)
            for (let c = 0; c < 3; c++) {
                const cHeight = 8 + (k + c * 3) % 9;
                const cRadius = 0.9 + c * 0.3;
                const mat = (k + c) % 2 === 0 ? crystalCyanMat : crystalMagentaMat;
                const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(cRadius, 0), mat);
                crystal.scale.set(1.0, cHeight * 0.45, 1.0);
                crystal.position.set((c - 1) * 1.4, cHeight * 0.35, (c % 2 === 0 ? 0.7 : -0.7));
                crystal.rotation.z = (c - 1) * 0.15;
                crystal.castShadow = true;
                stGroup.add(crystal);
            }
            group.add(stGroup);
        }

        // Giant Weeping Swamp Willows with drooping branches
        for (let w = 0; w < 4; w++) {
            const side = w % 2 === 0 ? 1 : -1;
            const tree = new THREE.Group();
            tree.position.set(side * (halfW + 11), 0, -800 - w * 75);

            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 10, 8), cavernStoneMat);
            trunk.position.y = 5;
            trunk.castShadow = true;
            tree.add(trunk);

            // Drooping willow foliage canopy
            for (let f = 0; f < 4; f++) {
                const foliage = new THREE.Mesh(new THREE.ConeGeometry(3.8 - f * 0.5, 6, 7), willowFoliageMat);
                foliage.position.set(Math.cos(f * 1.57) * 2.2, 8.5 - f * 0.8, Math.sin(f * 1.57) * 2.2);
                foliage.rotation.x = Math.sin(f) * 0.2;
                foliage.castShadow = true;
                tree.add(foliage);
            }
            group.add(tree);
        }

        // Floating Spore Firefly Motes
        for (let s = 0; s < 12; s++) {
            const mote = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), fireflyMat);
            const side = s % 2 === 0 ? 1 : -1;
            mote.position.set(side * (s * 2.1 % halfW), 1.2 + (s % 4) * 0.8, -760 - s * 29);
            group.add(mote);
        }

    } else if (actIndex === 4) {
        // ─── ACT IV: Tempest Maelstrom & Citadel Mouth ───────────────────
        const ruinMarbleMat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            roughness: 0.65,
            metalness: 0.15,
            flatShading: true,
        });
        const darkCitadelMat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.7,
            metalness: 0.4,
        });
        const lightningGlyphMat = new THREE.MeshBasicMaterial({
            color: 0x60a5fa,
            wireframe: true,
        });

        // Sunken Citadel Pillars & Broken Marble Arches flanking the maelstrom
        for (let p = 0; p < 8; p++) {
            const side = p % 2 === 0 ? 1 : -1;
            const ruinGroup = new THREE.Group();
            const rx = side * (halfW + 6 + (p * 2.7) % 10);
            const rz = -1140 - p * 45;
            ruinGroup.position.set(rx, 0, rz);

            const pillarHeight = 14 + (p * 3) % 8;
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, pillarHeight, 10), ruinMarbleMat);
            pillar.position.y = pillarHeight * 0.5 - 1.5;
            pillar.rotation.z = side * (0.05 + (p % 3) * 0.04);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            ruinGroup.add(pillar);

            // Weathered capital top
            const cap = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 4.2), darkCitadelMat);
            cap.position.y = pillarHeight - 1.2;
            ruinGroup.add(cap);

            // Storm rune ring hovering atop every alternate pillar
            if (p % 2 === 0) {
                const runeRing = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.15, 8, 16), lightningGlyphMat);
                runeRing.position.y = pillarHeight + 0.8;
                runeRing.rotation.x = Math.PI / 2;
                ruinGroup.add(runeRing);
            }

            group.add(ruinGroup);
        }

        // Half-submerged broken monoliths in the shallows
        for (let m = 0; m < 5; m++) {
            const side = m % 2 === 0 ? 1 : -1;
            const monolith = new THREE.Mesh(new THREE.BoxGeometry(3.5, 9, 3.5), darkCitadelMat);
            monolith.position.set(side * (halfW - 3.2), 1.8, -1160 - m * 65);
            monolith.rotation.x = 0.25;
            monolith.rotation.y = m * 0.6;
            monolith.castShadow = true;
            monolith.receiveShadow = true;
            group.add(monolith);
        }
    }

    return group;
}
