import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BUOY_CONFIG,
    buildNauticalBuoyLanes,
    stepNauticalBuoys,
} from '../public/js/world/nautical-buoy-lanes.js';

// Minimal mock Three.js environment for headless unit testing
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
            if (opts.color !== undefined) this.color = new Color(opts.color);
            if (opts.emissive !== undefined) this.emissive = new Color(opts.emissive);
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
        CylinderGeometry: class extends Geometry {},
        ConeGeometry: class extends Geometry {},
        TorusGeometry: class extends Geometry {},
        SphereGeometry: class extends Geometry {},
        RingGeometry: class extends Geometry {},
        OctahedronGeometry: class extends Geometry {},
    };
}

describe('3D Nautical Channel Buoy & Safe-Lane Beacon Builder', () => {
    it('exports required constants and builder/animation functions', () => {
        assert.equal(typeof buildNauticalBuoyLanes, 'function');
        assert.equal(typeof stepNauticalBuoys, 'function');
        assert.ok(BUOY_CONFIG);
        assert.equal(BUOY_CONFIG.DEFAULT_RIVER_WIDTH, 80.0);
        assert.equal(BUOY_CONFIG.DEFAULT_Z_START, 0);
        assert.equal(BUOY_CONFIG.DEFAULT_Z_END, -1500);
        assert.equal(BUOY_CONFIG.CHANNEL_BUOY_INTERVAL, 45.0);
    });

    it('builds a root group with metadata and buoy children using default parameters', () => {
        const THREE = createMockTHREE();
        const group = buildNauticalBuoyLanes(THREE);

        assert.ok(group instanceof THREE.Group, 'Group is a THREE.Group');
        assert.equal(group.name, 'NauticalBuoyLanes');
        assert.ok(group.userData, 'Group has userData');
        assert.equal(group.userData.riverWidth, 80.0);
        assert.equal(group.userData.zStart, 0);
        assert.equal(group.userData.zEnd, -1500);

        const buoys = group.userData.buoys;
        assert.ok(Array.isArray(buoys), 'UserData has buoys array');
        assert.ok(buoys.length > 50, `Expected > 50 buoys along 1500m river, got ${buoys.length}`);
        assert.equal(group.userData.buoyCount, buoys.length);
        assert.equal(group.children.length, buoys.length);
    });

    it('places green starboard buoys along the right river margin (x > 0)', () => {
        const THREE = createMockTHREE();
        const group = buildNauticalBuoyLanes(THREE, { riverWidth: 80.0 });
        const buoys = group.userData.buoys;

        const starboardBuoys = buoys.filter((b) => b.type === 'starboard');
        assert.ok(starboardBuoys.length >= 25, 'Substantial starboard channel buoys generated');

        for (const b of starboardBuoys) {
            // Starboard should be placed on right margin around +0.38 * 80m = +30.4m
            assert.ok(
                b.group.position.x > 25.0,
                `Starboard buoy x=${b.group.position.x} should be on the right side (x > 25m)`
            );
            assert.ok(
                b.group.position.x <= 40.0,
                `Starboard buoy x=${b.group.position.x} should remain within 80m river bank (x <= 40m)`
            );
        }
    });

    it('places red port buoys along the left river margin (x < 0)', () => {
        const THREE = createMockTHREE();
        const group = buildNauticalBuoyLanes(THREE, { riverWidth: 80.0 });
        const buoys = group.userData.buoys;

        const portBuoys = buoys.filter((b) => b.type === 'port');
        assert.ok(portBuoys.length >= 25, 'Substantial port channel buoys generated');

        for (const b of portBuoys) {
            // Port should be placed on left margin around -0.38 * 80m = -30.4m
            assert.ok(
                b.group.position.x < -25.0,
                `Port buoy x=${b.group.position.x} should be on the left side (x < -25m)`
            );
            assert.ok(
                b.group.position.x >= -40.0,
                `Port buoy x=${b.group.position.x} should remain within 80m river bank (x >= -40m)`
            );
        }
    });

    it('places emerald sanctuary buoys flanking safe dock platforms', () => {
        const THREE = createMockTHREE();
        const testPlatforms = [
            { id: 'dock-1', x: -28, z: -250, width: 14, length: 18 },
            { id: 'dock-2', x: 28, z: -750, width: 16, length: 20 },
        ];

        const group = buildNauticalBuoyLanes(THREE, {
            riverWidth: 80,
            platforms: testPlatforms,
        });
        const buoys = group.userData.buoys;

        const sanctuaryBuoys = buoys.filter((b) => b.type === 'sanctuary');
        // Each platform gets 3 approach/flank buoys = 6 buoys
        assert.equal(sanctuaryBuoys.length, 6);

        for (const b of sanctuaryBuoys) {
            assert.equal(b.role, 'dock_sanctuary');
            assert.ok(b.beaconMat, 'Sanctuary buoy has beacon material');
            // Check near either dock-1 or dock-2
            const nearDock1 = Math.hypot(b.group.position.x - (-28), b.group.position.z - (-250)) < 25;
            const nearDock2 = Math.hypot(b.group.position.x - 28, b.group.position.z - (-750)) < 25;
            assert.ok(nearDock1 || nearDock2, `Buoy at (${b.group.position.x}, ${b.group.position.z}) should flank a platform`);
        }
    });

    it('places harbor gateway beacon markers near Act II Harbor City calm basin entrance', () => {
        const THREE = createMockTHREE();
        const group = buildNauticalBuoyLanes(THREE, { riverWidth: 80 });
        const buoys = group.userData.buoys;

        const harborBuoys = buoys.filter((b) => b.type === 'harbor');
        assert.ok(harborBuoys.length >= 4, 'Includes harbor entrance fairway markers');

        for (const hb of harborBuoys) {
            // Harbor City is located on right bank around z = -140 to -260, x > 10
            assert.ok(hb.group.position.x > 10.0, `Harbor buoy x=${hb.group.position.x} on right bank`);
            assert.ok(
                hb.group.position.z <= -130 && hb.group.position.z >= -270,
                `Harbor buoy z=${hb.group.position.z} in Act II harbor zone`
            );
        }
    });

    it('stepNauticalBuoys applies buoyant vertical bobbing and surface wave tilt', () => {
        const THREE = createMockTHREE();
        const group = buildNauticalBuoyLanes(THREE);
        const buoys = group.userData.buoys;
        const firstBuoy = buoys[0];

        const initialY = firstBuoy.group.position.y;
        const initialRotZ = firstBuoy.group.rotation.z;

        // Step at t = 0.5s
        stepNauticalBuoys(group, 0.5);

        assert.notEqual(firstBuoy.group.position.y, initialY, 'Buoy Y position bobbed');
        assert.notEqual(firstBuoy.group.rotation.z, initialRotZ, 'Buoy rotation rolled');

        // Step at t = 1.5s
        const yAt05 = firstBuoy.group.position.y;
        stepNauticalBuoys(group, 1.5);
        assert.notEqual(firstBuoy.group.position.y, yAt05, 'Buoy continuously moves over time');
    });

    it('stepNauticalBuoys flashes beacon lanterns and scales water surface rings', () => {
        const THREE = createMockTHREE();
        const group = buildNauticalBuoyLanes(THREE);
        const buoys = group.userData.buoys;
        const firstBuoy = buoys[0];

        // Ensure beaconMat emissiveIntensity cycles
        stepNauticalBuoys(group, 0.1);
        const intensity1 = firstBuoy.beaconMat.emissiveIntensity;

        stepNauticalBuoys(group, 1.5);
        const intensity2 = firstBuoy.beaconMat.emissiveIntensity;

        assert.ok(typeof intensity1 === 'number');
        assert.ok(typeof intensity2 === 'number');

        // Test waterRing scaling
        assert.ok(firstBuoy.waterRing);
        assert.ok(firstBuoy.waterRing.scale.x > 0.8 && firstBuoy.waterRing.scale.x < 1.3);
    });

    it('gracefully handles missing, null, or invalid parameters in stepNauticalBuoys', () => {
        assert.doesNotThrow(() => stepNauticalBuoys(null, 1.0));
        assert.doesNotThrow(() => stepNauticalBuoys(undefined, 1.0));
        assert.doesNotThrow(() => stepNauticalBuoys({}, 1.0));
        assert.doesNotThrow(() => stepNauticalBuoys({ userData: {} }, 1.0));
        assert.doesNotThrow(() => stepNauticalBuoys({ userData: { buoys: [] } }, 1.0));
    });

    it('custom options allow adjusting river width and z limits', () => {
        const THREE = createMockTHREE();
        const group = buildNauticalBuoyLanes(THREE, {
            riverWidth: 60.0,
            zStart: -100,
            zEnd: -500,
        });

        assert.equal(group.userData.riverWidth, 60.0);
        assert.equal(group.userData.zStart, -100);
        assert.equal(group.userData.zEnd, -500);

        const buoys = group.userData.buoys;
        for (const b of buoys) {
            if (b.type === 'starboard') {
                assert.ok(b.group.position.x <= 30.0, `Within 60m width (half width 30m)`);
            } else if (b.type === 'port') {
                assert.ok(b.group.position.x >= -30.0, `Within 60m width (half width -30m)`);
            }
        }
    });
});
