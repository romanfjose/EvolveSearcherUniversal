import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildWalledHarborCityBiome,
    stepWalledHarborCityBiome,
} from '../public/js/world/biome-act2-walled-harbor-city.js';

// Minimal Three.js Mock for Node headless execution
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
            this.castShadow = false;
            this.receiveShadow = false;
        }
    }

    class Material {
        constructor(opts = {}) {
            Object.assign(this, opts);
            if (opts.color !== undefined) this.color = new Color(opts.color);
            if (opts.emissive !== undefined) {
                this.emissive = opts.emissive instanceof Color ? opts.emissive : new Color(opts.emissive);
            }
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
        ConeGeometry: class extends Geometry {},
    };
}

describe('Act II: Walled Harbor City & Canal District 3D Biome', () => {
    it('throws when THREE instance is not provided', () => {
        assert.throws(() => {
            buildWalledHarborCityBiome(null);
        }, /requires a valid THREE/);
    });

    it('builds harbor city root group with default options', () => {
        const THREE = createMockTHREE();
        const root = buildWalledHarborCityBiome(THREE);

        assert.ok(root instanceof THREE.Group, 'root is a THREE.Group');
        assert.equal(root.name, 'Act2WalledHarborCityBiome');
        assert.ok(root.userData, 'root has userData');
        assert.equal(root.userData.riverWidth, 80);
        assert.equal(root.userData.zStart, -140);
        assert.equal(root.userData.zEnd, -700);
        assert.ok(root.children.length >= 3, 'contains sea wall, marina, and townhouses');
    });

    it('builds sea-wall and twin rotating beacon lighthouses at z = -150', () => {
        const THREE = createMockTHREE();
        const root = buildWalledHarborCityBiome(THREE, { riverWidth: 80, zStart: -140, zEnd: -700 });
        const seaWall = root.children.find((c) => c.name === 'HarborSeaWallAndBastions');

        assert.ok(seaWall, 'found HarborSeaWallAndBastions group');
        assert.ok(Array.isArray(root.userData.lighthouses), 'userData has lighthouses');
        assert.equal(root.userData.lighthouses.length, 2, 'twin lighthouses created');

        const [lh1, lh2] = root.userData.lighthouses;
        assert.notEqual(lh1.side, lh2.side, 'one lighthouse on port, one on starboard');
        assert.equal(lh1.towerGroup.position.z, -150, 'lighthouse positioned at z = -150');
        assert.equal(lh2.towerGroup.position.z, -150, 'lighthouse positioned at z = -150');
        assert.ok(lh1.beamPivot, 'lighthouse 1 has beamPivot');
        assert.ok(lh2.beamPivot, 'lighthouse 2 has beamPivot');
        assert.ok(Math.abs(lh1.rotationSpeed) > 0, 'lighthouse 1 has rotationSpeed');
    });

    it('builds marina bays with quays, pilings, stone arch bridges, cranes, market stalls, and moored barges', () => {
        const THREE = createMockTHREE();
        const root = buildWalledHarborCityBiome(THREE, { riverWidth: 80, zStart: -140, zEnd: -700 });
        const marina = root.children.find((c) => c.name === 'MarinaBaysAndCanalInlets');

        assert.ok(marina, 'found MarinaBaysAndCanalInlets group');
        assert.equal(marina.children.length, 2, 'has port and starboard marina bay groups');

        // Check moored barges in userData
        assert.ok(Array.isArray(root.userData.barges), 'userData has barges array');
        assert.equal(root.userData.barges.length, 4, '4 moored cargo barges created (2 per side)');
        for (const barge of root.userData.barges) {
            assert.ok(barge.group, 'barge has Three.js group');
            assert.ok(barge.group.position.z <= -160 && barge.group.position.z >= -260, 'barge in marina bay range');
            assert.ok(typeof barge.baseY === 'number', 'barge has baseY');
            assert.ok(typeof barge.bobSpeed === 'number', 'barge has bobSpeed');
        }

        // Check crane gantries in userData
        assert.ok(Array.isArray(root.userData.cranes), 'userData has cranes array');
        assert.equal(root.userData.cranes.length, 4, '4 crane gantries created (2 per side)');
        for (const crane of root.userData.cranes) {
            assert.ok(crane.cargoCrate, 'crane has cargoCrate');
            assert.ok(typeof crane.baseY === 'number', 'crane has baseY');
        }
    });

    it('builds multi-story canal townhouses with gabled roofs and lit windows spanning zStart to zEnd', () => {
        const THREE = createMockTHREE();
        const root = buildWalledHarborCityBiome(THREE, { riverWidth: 80, zStart: -140, zEnd: -700 });
        const townhousesGroup = root.children.find((c) => c.name === 'CanalTownhousesWaterfront');

        assert.ok(townhousesGroup, 'found CanalTownhousesWaterfront group');
        assert.ok(Array.isArray(root.userData.townhouses), 'userData has townhouses array');
        assert.ok(root.userData.townhouses.length >= 40, 'substantially populated canal waterfront');

        for (const house of root.userData.townhouses) {
            assert.ok(house.stories >= 2 && house.stories <= 4, 'houses have 2-4 stories');
            assert.ok(house.z <= -140 && house.z >= -700, `house z (${house.z}) within zStart and zEnd`);
            assert.ok(Math.abs(house.x) > 40, 'houses positioned outside central river canal (|x| > 40)');
        }

        // Verify window glow materials are collected
        assert.ok(Array.isArray(root.userData.windowMaterials), 'userData has windowMaterials');
        assert.ok(root.userData.windowMaterials.length > 0, 'has lit window materials');
    });

    it('stepWalledHarborCityBiome animates beacons, barges, cranes, and window glow', () => {
        const THREE = createMockTHREE();
        const root = buildWalledHarborCityBiome(THREE);

        const lh = root.userData.lighthouses[0];
        const barge = root.userData.barges[0];
        const crane = root.userData.cranes[0];
        const winMat = root.userData.windowMaterials[0];

        const initialLhRotY = lh.beamPivot.rotation.y;
        const initialBargeY = barge.group.position.y;
        const initialBargeRollZ = barge.group.rotation.z;
        const initialCraneY = crane.cargoCrate.position.y;
        const initialWinGlow = winMat.emissiveIntensity;

        // Step simulation forward
        stepWalledHarborCityBiome(root, 0.05, 1.0);

        assert.notEqual(lh.beamPivot.rotation.y, initialLhRotY, 'lighthouse beacon rotated');
        assert.notEqual(barge.group.position.y, initialBargeY, 'barge bobbed vertically');
        assert.notEqual(barge.group.rotation.z, initialBargeRollZ, 'barge rolled on water');
        assert.notEqual(crane.cargoCrate.position.y, initialCraneY, 'crane cargo swayed/bobbed');
        assert.notEqual(winMat.emissiveIntensity, initialWinGlow, 'window emissive pulsed');
    });

    it('stepWalledHarborCityBiome handles null, undefined, and empty group arguments gracefully', () => {
        assert.doesNotThrow(() => {
            stepWalledHarborCityBiome(null, 0.016, 0);
            stepWalledHarborCityBiome({}, 0.016, 0);
            stepWalledHarborCityBiome({ userData: {} }, 0.016, 0);
        });
    });
});
