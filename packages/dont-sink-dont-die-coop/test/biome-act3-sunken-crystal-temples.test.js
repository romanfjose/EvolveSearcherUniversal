import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSunkenCrystalTemplesBiome,
    stepSunkenCrystalTemplesBiome,
} from '../public/js/world/biome-act3-sunken-crystal-temples.js';

// Minimal Three.js headless mock implementation for unit tests
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
        copy(v) {
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            return this;
        }
        clone() {
            return new Vector3(this.x, this.y, this.z);
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

    class Color {
        constructor(hex = 0xffffff) {
            this.hex = hex;
        }
        setHex(hex) {
            this.hex = hex;
            return this;
        }
    }

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.scale.set = (x, y, z) => {
                this.scale.x = x;
                this.scale.y = y;
                this.scale.z = z;
                return this.scale;
            };
            this.children = [];
            this.visible = true;
            this.userData = {};
            this.name = '';
            this.castShadow = false;
            this.receiveShadow = false;
        }
        add(...objs) {
            for (const o of objs) {
                if (o) this.children.push(o);
            }
            return this;
        }
        remove(obj) {
            const idx = this.children.indexOf(obj);
            if (idx !== -1) this.children.splice(idx, 1);
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
        constructor(geo, mat) {
            super();
            this.type = 'Mesh';
            this.geometry = geo;
            this.material = mat;
        }
    }

    class Material {
        constructor(opts = {}) {
            Object.assign(this, opts);
            if (opts.color !== undefined) this.color = typeof opts.color === 'number' ? new Color(opts.color) : opts.color;
            if (opts.emissive !== undefined) this.emissive = typeof opts.emissive === 'number' ? new Color(opts.emissive) : opts.emissive;
            this.emissiveIntensity = opts.emissiveIntensity ?? 1.0;
        }
    }

    class Geometry {
        constructor(...args) {
            this.type = this.constructor.name;
            this.args = args;
        }
    }

    return {
        Vector3,
        Euler,
        Color,
        Object3D,
        Group,
        Mesh,
        Material,
        MeshStandardMaterial: class extends Material {},
        MeshBasicMaterial: class extends Material {},
        BoxGeometry: class extends Geometry {},
        CylinderGeometry: class extends Geometry {},
        OctahedronGeometry: class extends Geometry {},
        TorusGeometry: class extends Geometry {},
        RingGeometry: class extends Geometry {},
        PlaneGeometry: class extends Geometry {},
        DoubleSide: 2,
    };
}

describe('Act III Sunken Crystal Temples 3D Biome Module', () => {
    it('builds biome group with default parameters and correct metadata', () => {
        const THREE = createMockTHREE();
        const root = buildSunkenCrystalTemplesBiome(THREE);

        assert.ok(root, 'Root group is returned');
        assert.equal(root.name, 'BiomeAct3_SunkenCrystalTemples');
        assert.ok(root.userData, 'Root group has userData');
        assert.equal(root.userData.biomeId, 'act3-sunken-crystal-temples');
        assert.equal(root.userData.riverWidth, 80);
        assert.equal(root.userData.zStart, -700);
        assert.equal(root.userData.zEnd, -1150);

        assert.ok(Array.isArray(root.userData.ziggurats), 'Ziggurats list created');
        assert.ok(Array.isArray(root.userData.colonnades), 'Colonnades list created');
        assert.ok(Array.isArray(root.userData.obelisks), 'Obelisks list created');
        assert.ok(Array.isArray(root.userData.sanctuaries), 'Sanctuaries list created');
        assert.ok(Array.isArray(root.userData.aqueducts), 'Aqueducts list created');
    });

    it('honors custom options for riverWidth, zStart, and zEnd', () => {
        const THREE = createMockTHREE();
        const customRoot = buildSunkenCrystalTemplesBiome(THREE, {
            riverWidth: 100,
            zStart: -750,
            zEnd: -1200,
            seed: 9999,
        });

        assert.equal(customRoot.userData.riverWidth, 100);
        assert.equal(customRoot.userData.zStart, -750);
        assert.equal(customRoot.userData.zEnd, -1200);

        // All elements must fall between zStart and zEnd
        for (const zig of customRoot.userData.ziggurats) {
            assert.ok(zig.position.z <= -750 && zig.position.z >= -1200, `Ziggurat z out of range: ${zig.position.z}`);
        }
        for (const aq of customRoot.userData.aqueducts) {
            assert.ok(aq.position.z <= -750 && aq.position.z >= -1200, `Aqueduct z out of range: ${aq.position.z}`);
            assert.ok(aq.spanWidth >= 100, `Aqueduct spans entire river width: ${aq.spanWidth}`);
        }
    });

    it('creates physical stepped stone ziggurats with tiers, summit braziers, and ramps', () => {
        const THREE = createMockTHREE();
        const root = buildSunkenCrystalTemplesBiome(THREE, { riverWidth: 80 });
        const ziggurats = root.userData.ziggurats;

        assert.ok(ziggurats.length >= 4, 'Constructs multiple ziggurats');
        for (const zig of ziggurats) {
            assert.equal(zig.type, 'ziggurat');
            assert.ok(zig.group.children.length > 0, 'Ziggurat has child meshes');
            assert.ok(Array.isArray(zig.tiers) && zig.tiers.length >= 3, 'Has at least 3 stepped tiers');
            assert.ok(Array.isArray(zig.braziers) && zig.braziers.length === 4, 'Has 4 summit braziers');
            assert.ok(zig.summitY > 8.0, 'Summit reaches high above river water level');
            assert.ok(Math.abs(zig.position.x) > 40.0, 'Ziggurats placed safely outside river channel center');
        }
    });

    it('creates broken colonnade viaducts with fluted pillars, fallen drums, and architraves', () => {
        const THREE = createMockTHREE();
        const root = buildSunkenCrystalTemplesBiome(THREE);
        const colonnades = root.userData.colonnades;

        assert.ok(colonnades.length >= 4, 'Constructs multiple colonnades');
        for (const col of colonnades) {
            assert.equal(col.type, 'colonnadeViaduct');
            assert.ok(col.columns.length >= 6, 'Contains multiple columns');
            assert.ok(col.length > 30.0, 'Colonnade has substantial architectural length');
            assert.ok(Math.abs(col.position.x) >= 40.0, 'Colonnades line waterway edges');
        }
    });

    it('creates giant floating crystal obelisks with rotating spires and orbiting shards', () => {
        const THREE = createMockTHREE();
        const root = buildSunkenCrystalTemplesBiome(THREE);
        const obelisks = root.userData.obelisks;

        assert.ok(obelisks.length >= 4, 'Constructs floating crystal obelisks');
        for (const ob of obelisks) {
            assert.equal(ob.type, 'crystalObelisk');
            assert.ok(ob.crystalCore, 'Has main crystal monolith core');
            assert.ok(ob.runeRing, 'Has equatorial rune ring');
            assert.ok(ob.secondaryRing, 'Has secondary rune ring');
            assert.ok(Array.isArray(ob.shards) && ob.shards.length >= 4, 'Has orbiting levitating shards');
            assert.ok(ob.crystalMat.emissiveIntensity >= 1.0, 'Has glowing emissive intensity');
            assert.ok(typeof ob.bobSpeed === 'number', 'Has bobSpeed');
            assert.ok(typeof ob.rotationSpeed === 'number', 'Has rotationSpeed');
        }
    });

    it('creates carved stone sanctuary plazas with mooring bollards and safe docking bounds', () => {
        const THREE = createMockTHREE();
        const root = buildSunkenCrystalTemplesBiome(THREE);
        const sanctuaries = root.userData.sanctuaries;

        assert.ok(sanctuaries.length >= 2, 'Constructs multiple sanctuary docking plazas');
        for (const sanct of sanctuaries) {
            assert.equal(sanct.type, 'sanctuaryPlaza');
            assert.ok(sanct.dockingRadius >= 10.0, 'Has generous docking radius');
            assert.ok(sanct.safeBounds, 'Has safeBounds coordinates');
            assert.ok(sanct.safeBounds.minX < sanct.safeBounds.maxX, 'Valid min/max X');
            assert.ok(sanct.safeBounds.minZ < sanct.safeBounds.maxZ, 'Valid min/max Z');
            assert.ok(sanct.wardCrystal, 'Has central ward crystal');
            assert.ok(sanct.auraRing, 'Has ward calming aura ring');
            assert.ok(Array.isArray(sanct.bollards) && sanct.bollards.length >= 6, 'Has docking mooring bollards');

            // Sanctuaries should be accessible within channel reach (|x| <= 15)
            assert.ok(Math.abs(sanct.position.x) <= 20.0, 'Sanctuary is accessible in mid-river');
        }
    });

    it('creates monumental ancient aqueduct gates spanning across the river width', () => {
        const THREE = createMockTHREE();
        const root = buildSunkenCrystalTemplesBiome(THREE, { riverWidth: 80 });
        const aqueducts = root.userData.aqueducts;

        assert.ok(aqueducts.length >= 2, 'Constructs multiple aqueduct gates');
        for (const aq of aqueducts) {
            assert.equal(aq.type, 'aqueductGate');
            assert.ok(aq.spanWidth >= 80, 'Spans at least river width');
            assert.ok(aq.gateHeight >= 20.0, 'Towering gate height');
            assert.ok(aq.clearanceHeight >= 15.0, 'Ample clearance for rafts underneath');
            assert.ok(aq.sluiceCurtain, 'Has hanging waterfall sluice curtain');
        }
    });

    it('stepSunkenCrystalTemplesBiome animates obelisks, braziers, sanctuaries, and aqueducts', () => {
        const THREE = createMockTHREE();
        const root = buildSunkenCrystalTemplesBiome(THREE);
        const obelisk = root.userData.obelisks[0];
        const initialY = obelisk.group.position.y;
        const initialCoreRotY = obelisk.crystalCore.rotation.y;
        const initialShardX = obelisk.shards[0].mesh.position.x;
        const initialBrazierRotY = root.userData.ziggurats[0].braziers[0].flame.rotation.y;
        const initialSanctuaryRotY = root.userData.sanctuaries[0].wardCrystal.rotation.y;

        // Step animation forward
        stepSunkenCrystalTemplesBiome(root, 0.016, 1.5);

        // Check obelisk bobbing & rotation
        assert.notEqual(obelisk.group.position.y, initialY, 'Obelisk bobbed along Y axis');
        assert.notEqual(obelisk.crystalCore.rotation.y, initialCoreRotY, 'Obelisk crystal core rotated');
        assert.notEqual(obelisk.shards[0].mesh.position.x, initialShardX, 'Shard orbited around obelisk');

        // Check ziggurat brazier flickered
        assert.notEqual(
            root.userData.ziggurats[0].braziers[0].flame.rotation.y,
            initialBrazierRotY,
            'Ziggurat brazier flame rotated/flickered'
        );

        // Check sanctuary ward crystal rotated
        assert.notEqual(
            root.userData.sanctuaries[0].wardCrystal.rotation.y,
            initialSanctuaryRotY,
            'Sanctuary ward crystal rotated'
        );
    });

    it('stepSunkenCrystalTemplesBiome handles edge cases gracefully (null, empty, missing userData)', () => {
        assert.doesNotThrow(() => {
            stepSunkenCrystalTemplesBiome(null, 0.016, 0);
            stepSunkenCrystalTemplesBiome(undefined, 0.016, 0);
            stepSunkenCrystalTemplesBiome({}, 0.016, 0);
            stepSunkenCrystalTemplesBiome({ userData: {} }, 0.016, 0);
        });
    });

    it('verifies scene-graph transform integrity (zero NaNs or Infinities)', () => {
        const THREE = createMockTHREE();
        const root = buildSunkenCrystalTemplesBiome(THREE);

        function auditNode(node) {
            for (const axis of ['x', 'y', 'z']) {
                assert.ok(!Number.isNaN(node.position[axis]), `NaN in position.${axis}`);
                assert.ok(!Number.isNaN(node.rotation[axis]), `NaN in rotation.${axis}`);
                assert.ok(!Number.isNaN(node.scale[axis]), `NaN in scale.${axis}`);
                assert.ok(Number.isFinite(node.position[axis]), `Infinity in position.${axis}`);
                assert.ok(Number.isFinite(node.rotation[axis]), `Infinity in rotation.${axis}`);
                assert.ok(Number.isFinite(node.scale[axis]), `Infinity in scale.${axis}`);
            }
            for (const child of node.children) {
                auditNode(child);
            }
        }

        auditNode(root);

        // Step and audit again
        stepSunkenCrystalTemplesBiome(root, 0.016, 2.5);
        auditNode(root);
    });
});
