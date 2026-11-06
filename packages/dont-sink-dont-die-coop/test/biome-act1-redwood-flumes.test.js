import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRedwoodFlumesBiome,
    stepRedwoodFlumesBiome,
} from '../public/js/world/biome-act1-redwood-flumes.js';

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
            this.children = [];
            this.visible = true;
            this.castShadow = false;
            this.receiveShadow = false;
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

    class PointLight extends Object3D {
        constructor(colorHex = 0xffffff, intensity = 1, distance = 0, decay = 2) {
            super();
            this.type = 'PointLight';
            this.color = new Color(colorHex);
            this.intensity = intensity;
            this.distance = distance;
            this.decay = decay;
        }
    }

    class Material {
        constructor(opts = {}) {
            Object.assign(this, opts);
            if (opts.color !== undefined) this.color = new Color(opts.color);
            if (opts.emissive !== undefined) this.emissive = new Color(opts.emissive);
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
        PointLight,
        Material,
        MeshStandardMaterial: class extends Material {},
        MeshBasicMaterial: class extends Material {},
        BoxGeometry: class extends Geometry {},
        CylinderGeometry: class extends Geometry {},
        SphereGeometry: class extends Geometry {},
        TorusGeometry: class extends Geometry {},
        DodecahedronGeometry: class extends Geometry {},
        ConeGeometry: class extends Geometry {},
    };
}

describe('Act I: Redwood Flumes 3D Architectural Biome', () => {
    it('builds biome scene graph with expected structure and metadata defaults', () => {
        const THREE = createMockTHREE();
        const root = buildRedwoodFlumesBiome(THREE);

        assert.ok(root, 'Root group created');
        assert.equal(root.name, 'Act1_RedwoodFlumes_BiomeRoot');
        assert.ok(root.userData, 'userData populated');
        assert.equal(root.userData.riverWidth, 80);
        assert.equal(root.userData.zStart, 0);
        assert.equal(root.userData.zEnd, -350);
        assert.ok(root.children.length > 0, 'Contains architectural elements');
    });

    it('creates rotating 8m timber waterwheels on stone mill foundations along riverbanks', () => {
        const THREE = createMockTHREE();
        const root = buildRedwoodFlumesBiome(THREE, { riverWidth: 80 });
        const waterwheels = root.userData.waterwheels;

        assert.ok(Array.isArray(waterwheels));
        assert.equal(waterwheels.length, 4, 'Should create 4 waterwheel millhouses');

        for (const mill of waterwheels) {
            assert.equal(mill.type, 'waterwheelMill');
            assert.ok(mill.group instanceof THREE.Group);
            assert.ok(mill.waterwheelPivot instanceof THREE.Group);
            assert.ok(typeof mill.rotationSpeed === 'number');
            assert.ok(mill.rotationSpeed > 0);

            // Verify position is set outside channel bounds (|x| >= riverWidth/2)
            assert.ok(
                Math.abs(mill.group.position.x) >= 40,
                `Mill x=${mill.group.position.x} should be on the riverbank`
            );
            assert.ok(
                mill.group.position.z <= 0 && mill.group.position.z >= -350,
                `Mill z=${mill.group.position.z} within Act I reach`
            );

            // Verify stone foundation and wheel rings/paddles exist
            const foundation = mill.group.children.find(
                (c) => c.geometry?.type === 'BoxGeometry' && c.position.y === 2.5
            );
            assert.ok(foundation, 'Mill has stone foundation');
            assert.ok(mill.waterwheelPivot.children.length >= 8, 'Waterwheel has spokes and blades');
        }
    });

    it('creates overhead wooden log-flume aqueduct bridges spanning the river at z = -60 and z = -120', () => {
        const THREE = createMockTHREE();
        const root = buildRedwoodFlumesBiome(THREE, { riverWidth: 80 });
        const aqueducts = root.userData.aqueducts;

        assert.ok(Array.isArray(aqueducts));
        assert.equal(aqueducts.length, 2, 'Should create 2 aqueduct bridges');

        const zs = aqueducts.map((a) => a.z);
        assert.ok(zs.includes(-60), 'Contains bridge at z=-60');
        assert.ok(zs.includes(-120), 'Contains bridge at z=-120');

        for (const aq of aqueducts) {
            assert.equal(aq.type, 'logFlumeAqueduct');
            assert.ok(aq.group instanceof THREE.Group);
            assert.ok(aq.bridgeSpan >= 80, 'Bridge span covers the 80m river');
            assert.ok(aq.bridgeHeight >= 12, 'Clear height allows raft passage');

            // Find trough floor and water ribbon
            const children = aq.group.children;
            const floor = children.find(
                (c) => c.geometry?.type === 'BoxGeometry' && c.position.y === aq.bridgeHeight
            );
            assert.ok(floor, 'Aqueduct has trough floor');

            // Find support bents / piers
            const piers = children.filter((c) => c instanceof THREE.Group);
            assert.ok(piers.length >= 4, 'Aqueduct has multiple timber trestle support piers');
        }
    });

    it('creates tiered cliffside watchtowers with warm lantern point-lights', () => {
        const THREE = createMockTHREE();
        const root = buildRedwoodFlumesBiome(THREE, { riverWidth: 80 });
        const watchtowers = root.userData.watchtowers;

        assert.ok(Array.isArray(watchtowers));
        assert.equal(watchtowers.length, 6, 'Should create 6 cliffside watchtowers');

        for (const tow of watchtowers) {
            assert.equal(tow.type, 'cliffWatchtower');
            assert.ok(tow.group instanceof THREE.Group);
            assert.ok(tow.lanternMesh, 'Watchtower has lantern mesh');
            assert.ok(tow.pointLight, 'Watchtower has lantern point light');
            assert.ok(tow.baseIntensity > 0, 'Watchtower has base light intensity');

            // Watchtowers situated high on the canyon banks
            assert.ok(
                Math.abs(tow.group.position.x) > 40 + 15,
                `Watchtower x=${tow.group.position.x} set back on the cliff`
            );
            assert.ok(tow.group.position.y >= 3.0, 'Elevated on cliff outcrop');
        }
    });

    it('creates mid-river mossy boulder islands with safe wooden mooring docks', () => {
        const THREE = createMockTHREE();
        const root = buildRedwoodFlumesBiome(THREE, { riverWidth: 80 });
        const islands = root.userData.islands;

        assert.ok(Array.isArray(islands));
        assert.equal(islands.length, 3, 'Should create 3 mid-river boulder islands');

        for (const isl of islands) {
            assert.equal(isl.type, 'mossyBoulderIsland');
            assert.ok(isl.group instanceof THREE.Group);
            assert.ok(isl.radius >= 4.0, 'Substantial boulder island radius');

            // Islands are situated mid-river (|x| < riverWidth / 2)
            assert.ok(
                Math.abs(isl.group.position.x) < 40,
                `Island x=${isl.group.position.x} should be mid-river`
            );

            // Contains main boulder, dock deck, and bollards
            const mainBoulder = isl.group.children.find(
                (c) => c.geometry?.type === 'DodecahedronGeometry'
            );
            assert.ok(mainBoulder, 'Island has central dodecahedron boulder');

            const dockDeck = isl.group.children.find(
                (c) => c.geometry?.type === 'BoxGeometry' && c.position.y > 0.4
            );
            assert.ok(dockDeck, 'Island has wooden mooring dock deck');

            const bollards = isl.group.children.filter(
                (c) => c.geometry?.type === 'CylinderGeometry' && c.position.y > 0.8
            );
            assert.ok(bollards.length >= 4, 'Island dock has 4 mooring posts/bollards');
        }
    });

    it('stepRedwoodFlumesBiome smoothly rotates waterwheels over time', () => {
        const THREE = createMockTHREE();
        const root = buildRedwoodFlumesBiome(THREE, { riverWidth: 80 });
        const mill0 = root.userData.waterwheels[0];

        const initialAngle = mill0.waterwheelPivot.rotation.x;
        stepRedwoodFlumesBiome(root, 0.1, 0.1);

        assert.notEqual(
            mill0.waterwheelPivot.rotation.x,
            initialAngle,
            'Waterwheel rotated after step'
        );
        assert.ok(mill0.waterwheelPivot.rotation.x > initialAngle);

        // Step further
        stepRedwoodFlumesBiome(root, 0.5, 0.6);
        assert.ok(mill0.waterwheelPivot.rotation.x > initialAngle + 0.1);
    });

    it('stepRedwoodFlumesBiome animates lantern flicker and point light intensity', () => {
        const THREE = createMockTHREE();
        const root = buildRedwoodFlumesBiome(THREE, { riverWidth: 80 });
        const tow0 = root.userData.watchtowers[0];

        const baseInt = tow0.pointLight.intensity;
        stepRedwoodFlumesBiome(root, 0.05, 1.25);
        const flicker1 = tow0.pointLight.intensity;

        stepRedwoodFlumesBiome(root, 0.05, 2.75);
        const flicker2 = tow0.pointLight.intensity;

        assert.ok(flicker1 > 0, 'Light has positive intensity');
        assert.ok(flicker2 > 0, 'Light has positive intensity');
        assert.notEqual(flicker1, flicker2, 'Flicker intensity varies with time');
    });

    it('respects custom riverWidth, zStart, and zEnd bounds', () => {
        const THREE = createMockTHREE();
        // A short sub-stretch between -50 and -100
        const root = buildRedwoodFlumesBiome(THREE, {
            riverWidth: 100,
            zStart: -50,
            zEnd: -100,
        });

        assert.equal(root.userData.riverWidth, 100);
        // Only elements within [-50, -100] are added
        for (const mill of root.userData.waterwheels) {
            assert.ok(mill.group.position.z <= -50 && mill.group.position.z >= -100);
        }
        for (const aq of root.userData.aqueducts) {
            assert.ok(aq.z <= -50 && aq.z >= -100);
        }
        for (const tow of root.userData.watchtowers) {
            assert.ok(tow.group.position.z <= -50 && tow.group.position.z >= -100);
        }
        for (const isl of root.userData.islands) {
            assert.ok(isl.group.position.z <= -50 && isl.group.position.z >= -100);
        }
    });

    it('gracefully handles missing, null, or empty arguments in stepRedwoodFlumesBiome', () => {
        stepRedwoodFlumesBiome(null, 0.016);
        stepRedwoodFlumesBiome({}, 0.016);
        stepRedwoodFlumesBiome({ userData: {} }, 0.016);
        assert.ok(true, 'Did not crash on null/empty inputs');
    });
});
