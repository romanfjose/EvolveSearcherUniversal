import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    RIVER_BIOMES,
    TRANSITION_ZONE_METERS,
    getBiomeAtZ,
    interpolateBiomePalette,
    createBiomePropsGroup,
} from '../public/js/world/biomes.js';

/**
 * Mock Three.js implementation for headless deterministic testing
 * of createBiomePropsGroup.
 */
function createMockTHREE() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        set(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }
    }

    class Euler {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        set(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }
    }

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.children = [];
            this.castShadow = false;
            this.receiveShadow = false;
            this.name = '';
        }
        add(...objs) {
            for (const obj of objs) {
                if (obj) this.children.push(obj);
            }
            return this;
        }
    }

    class Group extends Object3D {
        constructor() {
            super();
            this.type = 'Group';
        }
    }

    class Mesh extends Object3D {
        constructor(geometry, material) {
            super();
            this.type = 'Mesh';
            this.geometry = geometry;
            this.material = material;
        }
    }

    class Geometry {
        constructor(type, ...args) {
            this.type = type;
            this.args = args;
        }
    }

    class Material {
        constructor(type, params = {}) {
            this.type = type;
            Object.assign(this, params);
        }
    }

    return {
        Group,
        Mesh,
        MeshStandardMaterial: class extends Material { constructor(p) { super('MeshStandardMaterial', p); } },
        MeshBasicMaterial: class extends Material { constructor(p) { super('MeshBasicMaterial', p); } },
        ConeGeometry: class extends Geometry { constructor(...a) { super('ConeGeometry', ...a); } },
        CylinderGeometry: class extends Geometry { constructor(...a) { super('CylinderGeometry', ...a); } },
        BoxGeometry: class extends Geometry { constructor(...a) { super('BoxGeometry', ...a); } },
        SphereGeometry: class extends Geometry { constructor(...a) { super('SphereGeometry', ...a); } },
        DodecahedronGeometry: class extends Geometry { constructor(...a) { super('DodecahedronGeometry', ...a); } },
        OctahedronGeometry: class extends Geometry { constructor(...a) { super('OctahedronGeometry', ...a); } },
        TorusGeometry: class extends Geometry { constructor(...a) { super('TorusGeometry', ...a); } },
        DoubleSide: 2,
    };
}

describe('RIVER_BIOMES definition and structure', () => {
    test('defines exactly 4 core River Acts', () => {
        assert.equal(RIVER_BIOMES.length, 4);
    });

    test('Act I: Amber Canyon Headwaters spans 0 to -375', () => {
        const act1 = RIVER_BIOMES[0];
        assert.equal(act1.actIndex, 1);
        assert.equal(act1.id, 'amber-canyon');
        assert.equal(act1.zStart, 0);
        assert.equal(act1.zEnd, -375);
    });

    test('Act II: Neon Harbor & Smuggler Docks spans -375 to -750', () => {
        const act2 = RIVER_BIOMES[1];
        assert.equal(act2.actIndex, 2);
        assert.equal(act2.id, 'neon-harbor');
        assert.equal(act2.zStart, -375);
        assert.equal(act2.zEnd, -750);
    });

    test('Act III: Bioluminescent Abyssal Gorge spans -750 to -1125', () => {
        const act3 = RIVER_BIOMES[2];
        assert.equal(act3.actIndex, 3);
        assert.equal(act3.id, 'bioluminescent-gorge');
        assert.equal(act3.zStart, -750);
        assert.equal(act3.zEnd, -1125);
    });

    test('Act IV: Tempest Maelstrom & Citadel Mouth spans -1125 to -1500 (extensible)', () => {
        const act4 = RIVER_BIOMES[3];
        assert.equal(act4.actIndex, 4);
        assert.equal(act4.id, 'tempest-maelstrom');
        assert.equal(act4.zStart, -1125);
        assert.equal(act4.zEnd, -1500);
    });

    test('every biome has valid RGB channel ranges [0, 1] for sky, fog, water, and lights', () => {
        for (const b of RIVER_BIOMES) {
            for (const color of [b.skyColors.top, b.skyColors.mid, b.skyColors.horizon, b.fogColor, b.waterColors.shallow, b.waterColors.deep, b.light.sunColor, b.light.hemiSky, b.light.hemiGround]) {
                assert.ok(color.r >= 0 && color.r <= 1, `${b.id} color.r out of bounds: ${color.r}`);
                assert.ok(color.g >= 0 && color.g <= 1, `${b.id} color.g out of bounds: ${color.g}`);
                assert.ok(color.b >= 0 && color.b <= 1, `${b.id} color.b out of bounds: ${color.b}`);
            }
            assert.ok(b.fogDensity > 0 && b.fogDensity < 0.1);
            assert.ok(b.waveAmplitude > 0 && b.waveAmplitude < 1.0);
            assert.ok(b.waveSpeed > 0 && b.waveSpeed <= 3.0);
            assert.ok(b.waterColors.clarity >= 0 && b.waterColors.clarity <= 1);
            assert.ok(Array.isArray(b.features) && b.features.length >= 4);
        }
    });
});

describe('getBiomeAtZ resolution and clamping', () => {
    test('returns Act I for positive or start coordinates z >= 0 down to -374.9', () => {
        assert.equal(getBiomeAtZ(100).actIndex, 1);
        assert.equal(getBiomeAtZ(0).actIndex, 1);
        assert.equal(getBiomeAtZ(-100).actIndex, 1);
        assert.equal(getBiomeAtZ(-374.9).actIndex, 1);
    });

    test('returns Act II for -375 down to -749.9', () => {
        assert.equal(getBiomeAtZ(-375).actIndex, 2);
        assert.equal(getBiomeAtZ(-500).actIndex, 2);
        assert.equal(getBiomeAtZ(-749.9).actIndex, 2);
    });

    test('returns Act III for -750 down to -1124.9', () => {
        assert.equal(getBiomeAtZ(-750).actIndex, 3);
        assert.equal(getBiomeAtZ(-900).actIndex, 3);
        assert.equal(getBiomeAtZ(-1124.9).actIndex, 3);
    });

    test('returns Act IV for -1125 down to -1500', () => {
        assert.equal(getBiomeAtZ(-1125).actIndex, 4);
        assert.equal(getBiomeAtZ(-1300).actIndex, 4);
        assert.equal(getBiomeAtZ(-1500).actIndex, 4);
    });

    test('extensible: returns Act IV for deep rogue-river survival past -1500 to -4000', () => {
        assert.equal(getBiomeAtZ(-1501).actIndex, 4);
        assert.equal(getBiomeAtZ(-2500).actIndex, 4);
        assert.equal(getBiomeAtZ(-4000).actIndex, 4);
        assert.equal(getBiomeAtZ(-9999).actIndex, 4);
    });
});

describe('interpolateBiomePalette smooth interpolation', () => {
    test('pure Act I values when well before the first transition zone', () => {
        const pal = interpolateBiomePalette(0);
        assert.equal(pal.actIndex, 1);
        assert.equal(pal.primaryBiome, 'amber-canyon');
        assert.equal(pal.blendRatio, 0);
        assert.equal(pal.fogDensity, RIVER_BIOMES[0].fogDensity);
        assert.equal(pal.waveAmplitude, RIVER_BIOMES[0].waveAmplitude);
    });

    test('pure Act II values in the middle of Act II (-562.5)', () => {
        const pal = interpolateBiomePalette(-562.5);
        assert.equal(pal.actIndex, 2);
        assert.equal(pal.primaryBiome, 'neon-harbor');
        assert.equal(pal.blendRatio, 0);
        assert.equal(pal.fogDensity, RIVER_BIOMES[1].fogDensity);
        assert.equal(pal.waveAmplitude, RIVER_BIOMES[1].waveAmplitude);
        assert.equal(pal.waterColors.clarity, RIVER_BIOMES[1].waterColors.clarity);
    });

    test('pure Act III values in the middle of Act III (-937.5)', () => {
        const pal = interpolateBiomePalette(-937.5);
        assert.equal(pal.actIndex, 3);
        assert.equal(pal.primaryBiome, 'bioluminescent-gorge');
        assert.equal(pal.blendRatio, 0);
        assert.equal(pal.fogDensity, RIVER_BIOMES[2].fogDensity);
        assert.equal(pal.waveAmplitude, RIVER_BIOMES[2].waveAmplitude);
        assert.equal(pal.waterColors.clarity, RIVER_BIOMES[2].waterColors.clarity);
    });

    test('pure Act IV values in Act IV and past -1500 down to -4000', () => {
        for (const z of [-1400, -1500, -2500, -4000]) {
            const pal = interpolateBiomePalette(z);
            assert.equal(pal.actIndex, 4);
            assert.equal(pal.primaryBiome, 'tempest-maelstrom');
            assert.equal(pal.blendRatio, 0);
            assert.equal(pal.fogDensity, RIVER_BIOMES[3].fogDensity);
            assert.equal(pal.waveAmplitude, RIVER_BIOMES[3].waveAmplitude);
            assert.equal(pal.waterColors.clarity, RIVER_BIOMES[3].waterColors.clarity);
        }
    });

    test('exact 50/50 midpoint blend at the Act 1 -> Act 2 boundary (z = -375)', () => {
        const pal = interpolateBiomePalette(-375);
        assert.ok(Math.abs(pal.blendRatio - 0.5) < 1e-6);
        const expectedDensity = (RIVER_BIOMES[0].fogDensity + RIVER_BIOMES[1].fogDensity) * 0.5;
        assert.ok(Math.abs(pal.fogDensity - expectedDensity) < 1e-6);
        const expectedWaveAmp = (RIVER_BIOMES[0].waveAmplitude + RIVER_BIOMES[1].waveAmplitude) * 0.5;
        assert.ok(Math.abs(pal.waveAmplitude - expectedWaveAmp) < 1e-6);
        const expectedClarity = (RIVER_BIOMES[0].waterColors.clarity + RIVER_BIOMES[1].waterColors.clarity) * 0.5;
        assert.ok(Math.abs(pal.waterColors.clarity - expectedClarity) < 1e-6);
    });

    test('exact 50/50 midpoint blend at the Act 2 -> Act 3 boundary (z = -750)', () => {
        const pal = interpolateBiomePalette(-750);
        assert.ok(Math.abs(pal.blendRatio - 0.5) < 1e-6);
        const expectedDensity = (RIVER_BIOMES[1].fogDensity + RIVER_BIOMES[2].fogDensity) * 0.5;
        assert.ok(Math.abs(pal.fogDensity - expectedDensity) < 1e-6);
        const expectedWaveAmp = (RIVER_BIOMES[1].waveAmplitude + RIVER_BIOMES[2].waveAmplitude) * 0.5;
        assert.ok(Math.abs(pal.waveAmplitude - expectedWaveAmp) < 1e-6);
    });

    test('exact 50/50 midpoint blend at the Act 3 -> Act 4 boundary (z = -1125)', () => {
        const pal = interpolateBiomePalette(-1125);
        assert.ok(Math.abs(pal.blendRatio - 0.5) < 1e-6);
        const expectedDensity = (RIVER_BIOMES[2].fogDensity + RIVER_BIOMES[3].fogDensity) * 0.5;
        assert.ok(Math.abs(pal.fogDensity - expectedDensity) < 1e-6);
        const expectedWaveAmp = (RIVER_BIOMES[2].waveAmplitude + RIVER_BIOMES[3].waveAmplitude) * 0.5;
        assert.ok(Math.abs(pal.waveAmplitude - expectedWaveAmp) < 1e-6);
    });

    test('transition zone boundaries start and end smoothly', () => {
        const tZone = TRANSITION_ZONE_METERS;
        // Start of transition 1
        const startT1 = interpolateBiomePalette(-375 + tZone);
        assert.equal(startT1.blendRatio, 0);
        // End of transition 1
        const endT1 = interpolateBiomePalette(-375 - tZone);
        assert.equal(endT1.blendRatio, 1);
        assert.equal(endT1.actIndex, 2);
    });

    test('intermediate blend ratio is strictly monotonic inside transition zone', () => {
        const tZone = TRANSITION_ZONE_METERS;
        let lastRatio = -1;
        // Test step through transition zone from start (-300) to end (-450)
        for (let offset = tZone; offset >= -tZone; offset -= 15) {
            const z = -375 + offset;
            const pal = interpolateBiomePalette(z);
            assert.ok(pal.blendRatio >= lastRatio, `Non-monotonic blend at z=${z}`);
            lastRatio = pal.blendRatio;
        }
    });

    test('interpolated colors remain strictly in valid range [0, 1] across all z', () => {
        for (let z = 50; z >= -1600; z -= 25) {
            const p = interpolateBiomePalette(z);
            for (const c of [p.skyColors.top, p.skyColors.mid, p.skyColors.horizon, p.fogColor, p.waterColors.shallow, p.waterColors.deep, p.light.sunColor, p.light.hemiSky, p.light.hemiGround]) {
                assert.ok(c.r >= 0 && c.r <= 1, `r out of bounds at z=${z}: ${c.r}`);
                assert.ok(c.g >= 0 && c.g <= 1, `g out of bounds at z=${z}: ${c.g}`);
                assert.ok(c.b >= 0 && c.b <= 1, `b out of bounds at z=${z}: ${c.b}`);
            }
            assert.ok(p.fogDensity > 0);
            assert.ok(p.waveAmplitude > 0);
            assert.ok(p.waterColors.clarity >= 0 && p.waterColors.clarity <= 1);
        }
    });
});

describe('createBiomePropsGroup procedural landmark generation', () => {
    const mockTHREE = createMockTHREE();

    test('creates valid Three.js Group with proper naming for each Act', () => {
        for (let act = 1; act <= 4; act++) {
            const group = createBiomePropsGroup(mockTHREE, act, 30);
            assert.equal(group.type, 'Group');
            assert.equal(group.name, `BiomeProps_Act_${act}`);
            assert.ok(group.children.length > 0, `Act ${act} has no child props`);
        }
    });

    test('Act I generates canyon spires and floating timber logs with correct materials', () => {
        const group = createBiomePropsGroup(mockTHREE, 1, 30);
        // 8 spire clusters + 6 driftwood logs = 14 top-level groups
        assert.equal(group.children.length, 14);

        // Check spire child components
        const firstSpire = group.children[0];
        assert.equal(firstSpire.type, 'Group');
        assert.ok(firstSpire.children.length >= 4); // 1 cone spire + 3 boulders
        assert.equal(firstSpire.children[0].geometry.type, 'ConeGeometry');

        // Check driftwood logs
        const firstLog = group.children[8];
        assert.equal(firstLog.type, 'Group');
        assert.equal(firstLog.children[0].geometry.type, 'CylinderGeometry');
    });

    test('Act I props remain outside river channel center bounds', () => {
        const riverWidth = 30;
        const halfW = riverWidth * 0.5;
        const group = createBiomePropsGroup(mockTHREE, 1, riverWidth);

        for (let i = 0; i < 8; i++) {
            const spire = group.children[i];
            // Spires placed at |x| >= halfW + 12
            assert.ok(Math.abs(spire.position.x) >= halfW + 10, `Spire placed inside channel: ${spire.position.x}`);
        }
    });

    test('Act II generates industrial cargo cranes and mooring buoys with spotlight cones', () => {
        const group = createBiomePropsGroup(mockTHREE, 2, 30);
        // 4 cranes + 6 mooring buoys = 10 top-level props
        assert.equal(group.children.length, 10);

        const crane = group.children[0];
        assert.equal(crane.type, 'Group');
        // Crane has tower base, boom, cabin, beacon, spotlight cone
        assert.ok(crane.children.length >= 5);
        const coneMesh = crane.children.find((c) => c.geometry?.type === 'ConeGeometry');
        assert.ok(coneMesh, 'Crane missing spotlight cone');
        assert.equal(coneMesh.material.transparent, true);

        const buoy = group.children[4];
        assert.equal(buoy.type, 'Group');
        assert.ok(buoy.children.length >= 3); // floatMesh + mast + light
    });

    test('Act III generates glowing crystal stalagmites, weeping willows, and fireflies', () => {
        const group = createBiomePropsGroup(mockTHREE, 3, 30);
        // 10 stalagmites + 4 weeping willows + 12 fireflies = 26 top-level props
        assert.equal(group.children.length, 26);

        const stalagmite = group.children[0];
        assert.equal(stalagmite.type, 'Group');
        // Stalagmite has base + 3 crystal spires
        assert.ok(stalagmite.children.length >= 4);
        const crystalMesh = stalagmite.children[1];
        assert.equal(crystalMesh.geometry.type, 'OctahedronGeometry');
        assert.ok(crystalMesh.material.emissiveIntensity > 0, 'Crystal lacks emissive glow');

        const willow = group.children[10];
        assert.equal(willow.type, 'Group');
        assert.ok(willow.children.length >= 5); // trunk + 4 foliage cones

        const firefly = group.children[14];
        assert.equal(firefly.type, 'Mesh');
        assert.equal(firefly.geometry.type, 'SphereGeometry');
    });

    test('Act IV generates sunken citadel pillars, capital caps, rune rings, and monoliths', () => {
        const group = createBiomePropsGroup(mockTHREE, 4, 30);
        // 8 pillars + 5 monoliths = 13 top-level props
        assert.equal(group.children.length, 13);

        const pillarGroup = group.children[0];
        assert.equal(pillarGroup.type, 'Group');
        // Pillar 0 has column + cap + rune ring
        assert.ok(pillarGroup.children.length >= 3);
        const runeRing = pillarGroup.children.find((c) => c.geometry?.type === 'TorusGeometry');
        assert.ok(runeRing, 'Pillar missing lightning rune ring');

        const monolith = group.children[8];
        assert.equal(monolith.type, 'Mesh');
        assert.equal(monolith.geometry.type, 'BoxGeometry');
    });

    test('createBiomePropsGroup adapts correctly to custom river width', () => {
        const narrowGroup = createBiomePropsGroup(mockTHREE, 1, 20);
        const wideGroup = createBiomePropsGroup(mockTHREE, 1, 50);

        const narrowSpireX = Math.abs(narrowGroup.children[0].position.x);
        const wideSpireX = Math.abs(wideGroup.children[0].position.x);

        assert.ok(wideSpireX > narrowSpireX, `Wide spire x (${wideSpireX}) should be farther than narrow spire x (${narrowSpireX})`);
    });

    test('returns empty group for unrecognised actIndex without crashing', () => {
        const emptyGroup = createBiomePropsGroup(mockTHREE, 99, 30);
        assert.equal(emptyGroup.type, 'Group');
        assert.equal(emptyGroup.children.length, 0);
    });
});
