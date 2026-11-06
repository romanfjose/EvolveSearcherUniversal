import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildBiomeShorelineSetpieces,
    updateShorelineSetpieces,
} from '../public/js/world/biome-shoreline-landmarks.js';

// Minimal Mock of Three.js for Node native unit tests
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
        }
        add(...objs) {
            for (const o of objs) {
                if (o) this.children.push(o);
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
        constructor() {
            this.type = this.constructor.name;
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
        SphereGeometry: class extends Geometry {},
        TorusGeometry: class extends Geometry {},
        OctahedronGeometry: class extends Geometry {},
        ConeGeometry: class extends Geometry {},
        PlaneGeometry: class extends Geometry {},
        DodecahedronGeometry: class extends Geometry {},
    };
}

describe('Biome Shoreline Landmarks Module', () => {
    it('builds Act 1 setpieces: sawmill cranes and pine bluffs', () => {
        const THREE = createMockTHREE();
        const root = buildBiomeShorelineSetpieces(THREE, {
            actIndex: 1,
            zStart: 0,
            zEnd: -375,
            riverWidth: 80,
            seed: 42,
        });

        assert.ok(root instanceof THREE.Group, 'Root is a THREE.Group');
        assert.equal(root.name, 'BiomeShorelineSetpieces_Act1');
        assert.ok(root.userData.setpieceList.length >= 8, 'Has at least 8 setpiece landmarks');

        const types = new Set(root.userData.setpieceList.map((s) => s.type));
        assert.ok(types.has('sawmillCrane'), 'Contains sawmillCrane');
        assert.ok(types.has('pineBluff'), 'Contains pineBluff');

        const crane = root.userData.setpieceList.find((s) => s.type === 'sawmillCrane');
        assert.ok(crane.boomPivot, 'Crane has boomPivot');
        assert.ok(crane.sawBlade, 'Crane has sawBlade');
        assert.ok(crane.suspendedLog, 'Crane has suspendedLog');

        const bluff = root.userData.setpieceList.find((s) => s.type === 'pineBluff');
        assert.ok(bluff.pineTrees.length >= 5, 'Bluff has pine trees');
    });

    it('builds Act 2 setpieces: brick warehouses and belltowers', () => {
        const THREE = createMockTHREE();
        const root = buildBiomeShorelineSetpieces(THREE, {
            actIndex: 2,
            zStart: -375,
            zEnd: -750,
            riverWidth: 80,
            seed: 123,
        });

        assert.equal(root.name, 'BiomeShorelineSetpieces_Act2');
        const types = new Set(root.userData.setpieceList.map((s) => s.type));
        assert.ok(types.has('brickWarehouse'), 'Contains brickWarehouse');
        assert.ok(types.has('harborBelltower'), 'Contains harborBelltower');

        const warehouse = root.userData.setpieceList.find((s) => s.type === 'brickWarehouse');
        assert.ok(warehouse.lanterns.length >= 2, 'Warehouse has lanterns');
        assert.ok(warehouse.lanternMat, 'Warehouse has lanternMat');

        const belltower = root.userData.setpieceList.find((s) => s.type === 'harborBelltower');
        assert.ok(belltower.bellPivot, 'Belltower has bellPivot');
    });

    it('builds Act 3 setpieces: sunken statues and glowing aqueducts', () => {
        const THREE = createMockTHREE();
        const root = buildBiomeShorelineSetpieces(THREE, {
            actIndex: 3,
            zStart: -750,
            zEnd: -1125,
            riverWidth: 80,
            seed: 456,
        });

        assert.equal(root.name, 'BiomeShorelineSetpieces_Act3');
        const types = new Set(root.userData.setpieceList.map((s) => s.type));
        assert.ok(types.has('sunkenStatue'), 'Contains sunkenStatue');
        assert.ok(types.has('glowingAqueduct'), 'Contains glowingAqueduct');

        const statue = root.userData.setpieceList.find((s) => s.type === 'sunkenStatue');
        assert.ok(statue.eyes.length === 2, 'Statue has 2 eyes');
        assert.ok(statue.glowEyeMat, 'Statue has glowEyeMat');

        const aqueduct = root.userData.setpieceList.find((s) => s.type === 'glowingAqueduct');
        assert.ok(aqueduct.fallMesh, 'Aqueduct has fallMesh');
        assert.ok(aqueduct.aquaWaterMat, 'Aqueduct has aquaWaterMat');
        assert.ok(aqueduct.splash, 'Aqueduct has splash pool');
    });

    it('builds Act 4 setpieces: wrecked frigates and lava falls', () => {
        const THREE = createMockTHREE();
        const root = buildBiomeShorelineSetpieces(THREE, {
            actIndex: 4,
            zStart: -1125,
            zEnd: -1500,
            riverWidth: 80,
            seed: 789,
        });

        assert.equal(root.name, 'BiomeShorelineSetpieces_Act4');
        const types = new Set(root.userData.setpieceList.map((s) => s.type));
        assert.ok(types.has('wreckedFrigate'), 'Contains wreckedFrigate');
        assert.ok(types.has('lavaFalls'), 'Contains lavaFalls');

        const frigate = root.userData.setpieceList.find((s) => s.type === 'wreckedFrigate');
        assert.ok(frigate.mastPivot, 'Frigate has mastPivot');
        assert.ok(frigate.sail, 'Frigate has sail');

        const lava = root.userData.setpieceList.find((s) => s.type === 'lavaFalls');
        assert.ok(lava.lavaSheet, 'Lava falls has lavaSheet');
        assert.ok(lava.lavaMat, 'Lava falls has lavaMat');
        assert.ok(lava.embers.length >= 6, 'Lava falls has magma embers');
    });

    it('positions landmarks along both riverbanks outside channel center', () => {
        const THREE = createMockTHREE();
        const riverWidth = 80;
        const halfW = riverWidth * 0.5;
        const root = buildBiomeShorelineSetpieces(THREE, {
            actIndex: 1,
            riverWidth,
        });

        let hasLeft = false;
        let hasRight = false;

        for (const item of root.userData.setpieceList) {
            const x = item.group.position.x;
            assert.ok(
                Math.abs(x) >= halfW,
                `Setpiece x=${x} must be on shoreline bank (|x| >= ${halfW})`
            );
            if (x < 0) hasLeft = true;
            if (x > 0) hasRight = true;
        }

        assert.ok(hasLeft, 'Has setpieces on the left riverbank');
        assert.ok(hasRight, 'Has setpieces on the right riverbank');
    });

    it('updateShorelineSetpieces animates dynamic components across acts without error or NaN', () => {
        const THREE = createMockTHREE();

        for (let act = 1; act <= 4; act++) {
            const root = buildBiomeShorelineSetpieces(THREE, { actIndex: act, riverWidth: 80 });

            // Step updateShorelineSetpieces multiple ticks
            for (let t = 0; t < 10; t++) {
                updateShorelineSetpieces(root, 0.016, t * 0.016);
            }

            // Verify no NaN values in positions or rotations
            for (const item of root.userData.setpieceList) {
                assert.ok(!Number.isNaN(item.group.position.x), 'position.x is not NaN');
                assert.ok(!Number.isNaN(item.group.position.y), 'position.y is not NaN');
                assert.ok(!Number.isNaN(item.group.position.z), 'position.z is not NaN');
                assert.ok(!Number.isNaN(item.group.rotation.y), 'rotation.y is not NaN');
            }
        }
    });

    it('updateShorelineSetpieces updates specific act 1-4 elements', () => {
        const THREE = createMockTHREE();

        // Act 1
        const root1 = buildBiomeShorelineSetpieces(THREE, { actIndex: 1 });
        const crane = root1.userData.setpieceList.find((s) => s.type === 'sawmillCrane');
        const initSawZ = crane.sawBlade.rotation.z;
        updateShorelineSetpieces(root1, 0.1, 1.0);
        assert.notEqual(crane.sawBlade.rotation.z, initSawZ, 'Saw blade rotated');

        // Act 2
        const root2 = buildBiomeShorelineSetpieces(THREE, { actIndex: 2 });
        const belltower = root2.userData.setpieceList.find((s) => s.type === 'harborBelltower');
        updateShorelineSetpieces(root2, 0.1, 1.0);
        assert.ok(Math.abs(belltower.bellPivot.rotation.z) > 0, 'Bell pivoted');

        // Act 3
        const root3 = buildBiomeShorelineSetpieces(THREE, { actIndex: 3 });
        const aqueduct = root3.userData.setpieceList.find((s) => s.type === 'glowingAqueduct');
        updateShorelineSetpieces(root3, 0.1, 1.0);
        assert.ok(aqueduct.aquaWaterMat.emissiveIntensity > 0, 'Aqueduct water emissive updated');

        // Act 4
        const root4 = buildBiomeShorelineSetpieces(THREE, { actIndex: 4 });
        const lava = root4.userData.setpieceList.find((s) => s.type === 'lavaFalls');
        const ember0 = lava.embers[0];
        const initEmberY = ember0.mesh.position.y;
        updateShorelineSetpieces(root4, 0.5, 2.0);
        assert.notEqual(ember0.mesh.position.y, initEmberY, 'Ember ascended');
    });

    it('handles edge cases gracefully: null or undefined options and groups', () => {
        const THREE = createMockTHREE();
        // Null group to update
        assert.doesNotThrow(() => updateShorelineSetpieces(null, 0.016, 1.0));
        assert.doesNotThrow(() => updateShorelineSetpieces({}, 0.016, 1.0));
        assert.doesNotThrow(() => updateShorelineSetpieces({ userData: {} }, 0.016, 1.0));

        // Default options to build
        const defaultRoot = buildBiomeShorelineSetpieces(THREE);
        assert.ok(defaultRoot instanceof THREE.Group);
        assert.equal(defaultRoot.userData.actIndex, 1);
        assert.equal(defaultRoot.userData.riverWidth, 80);

        // Clamped actIndex out of range
        const lowAct = buildBiomeShorelineSetpieces(THREE, { actIndex: -5 });
        assert.equal(lowAct.userData.actIndex, 1);

        const highAct = buildBiomeShorelineSetpieces(THREE, { actIndex: 99 });
        assert.equal(highAct.userData.actIndex, 4);
    });
});
