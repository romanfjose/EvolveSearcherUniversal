import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildShorelineLandmarks,
    animateShorelineLandmarks,
} from '../public/js/world/shoreline-landmarks.js';

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
        BoxGeometry: class extends Geometry {},
        CylinderGeometry: class extends Geometry {},
        SphereGeometry: class extends Geometry {},
        TorusGeometry: class extends Geometry {},
        OctahedronGeometry: class extends Geometry {},
        ConeGeometry: class extends Geometry {},
    };
}

describe('Shoreline Landmarks Module', () => {
    it('builds landmarks scene graph with all 4 landmark types', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 12345);

        assert.ok(handle, 'Handle returned from buildShorelineLandmarks');
        assert.ok(handle.group instanceof THREE.Group, 'Group is a THREE.Group');
        assert.equal(handle.group.name, 'ShorelineLandmarksRoot');
        assert.ok(Array.isArray(handle.items), 'Items is an array');
        assert.ok(handle.items.length >= 10, 'Creates substantial shoreline landmark items');
        assert.equal(handle.reactionThreshold, 35.0, 'Reaction threshold is 35m');

        const types = new Set(handle.items.map((it) => it.type));
        assert.ok(types.has('spectators'), 'Contains spectators');
        assert.ok(types.has('crane'), 'Contains crane');
        assert.ok(types.has('tavernSign'), 'Contains tavern sign');
        assert.ok(types.has('crystalObelisk'), 'Contains crystal obelisk');
    });

    it('positions landmarks along left and right riverbanks outside channel center', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 999);

        for (const item of handle.items) {
            assert.ok(
                Math.abs(item.position.x) >= 15.0,
                `Landmark x=${item.position.x} should be on the riverbank (|x| >= 15)`
            );
            assert.ok(
                item.position.z <= 0 && item.position.z >= -1600,
                `Landmark z=${item.position.z} within expected river reach`
            );
        }
    });

    it('spectator landmarks include grandstand, characters, arms, and jumping metadata', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 42);
        const spectators = handle.items.find((it) => it.type === 'spectators');

        assert.ok(spectators, 'Found spectators landmark');
        assert.ok(spectators.spectators.length >= 4, 'Has at least 4 individual spectators');
        const firstSpec = spectators.spectators[0];
        assert.ok(firstSpec.leftArm, 'Spec has left arm');
        assert.ok(firstSpec.rightArm, 'Spec has right arm');
        assert.ok(typeof firstSpec.jumpFreq === 'number', 'Spec has jump frequency');
        assert.ok(typeof firstSpec.baseY === 'number', 'Spec has baseY');
    });

    it('crane landmarks include jib boom, hoisted cargo, and swing parameters', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 42);
        const crane = handle.items.find((it) => it.type === 'crane');

        assert.ok(crane, 'Found crane landmark');
        assert.ok(crane.jibPivot, 'Has jibPivot');
        assert.ok(crane.cargo, 'Has cargo');
        assert.ok(typeof crane.swingSpeed === 'number', 'Has swingSpeed');
        assert.ok(typeof crane.baseAngle === 'number', 'Has baseAngle');
    });

    it('tavern sign landmarks include neon emissive materials and sign backings', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 42);
        const tavern = handle.items.find((it) => it.type === 'tavernSign');

        assert.ok(tavern, 'Found tavern landmark');
        assert.ok(Array.isArray(tavern.signMaterials), 'Has signMaterials array');
        assert.ok(tavern.signMaterials.length >= 3, 'Multiple neon sign materials');
        for (const mat of tavern.signMaterials) {
            assert.ok(mat.emissiveIntensity >= 0.5, 'Has neon emissive intensity');
        }
    });

    it('crystal obelisk landmarks include central monolith, energy ring, and orbiting shards', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 42);
        const obelisk = handle.items.find((it) => it.type === 'crystalObelisk');

        assert.ok(obelisk, 'Found crystal obelisk landmark');
        assert.ok(obelisk.crystalCore, 'Has central crystal monolith');
        assert.ok(obelisk.energyRing, 'Has energy ring');
        assert.ok(Array.isArray(obelisk.shards), 'Has orbiting crystal shards');
        assert.ok(obelisk.shards.length >= 3, 'Has at least 3 orbiting shards');
    });

    it('animateShorelineLandmarks detects raft proximity within 35m and triggers reactions', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 100);

        // Target landmark 0
        const target = handle.items[0];
        const initialReaction = target.reactionLevel;
        assert.equal(initialReaction, 0.0, 'Reaction starts at 0');

        // Place raft right next to target (< 35m)
        const nearRaftPos = {
            x: target.position.x,
            y: 0,
            z: target.position.z,
        };

        // Step animation forward
        for (let i = 0; i < 5; i++) {
            animateShorelineLandmarks(handle, nearRaftPos, 1.0 + i * 0.1);
        }

        const proxNear = handle.proximities.get(target.id);
        assert.ok(proxNear, 'Proximity record created');
        assert.equal(proxNear.isNear, true, 'isNear is true within 35m');
        assert.ok(target.reactionLevel > 0.1, 'reactionLevel increased towards excited state');

        // Place raft far away (> 35m, e.g. 200m downriver)
        const farRaftPos = {
            x: 0,
            y: 0,
            z: target.position.z - 200,
        };

        // Step animation forward to calm down
        for (let i = 0; i < 30; i++) {
            animateShorelineLandmarks(handle, farRaftPos, 2.0 + i * 0.1);
        }

        const proxFar = handle.proximities.get(target.id);
        assert.equal(proxFar.isNear, false, 'isNear is false beyond 35m');
        assert.ok(target.reactionLevel < 0.05, 'reactionLevel calmed back down towards 0');
    });

    it('animates spectator bouncing and arm waving', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 42);
        const spectators = handle.items.find((it) => it.type === 'spectators');
        const spec = spectators.spectators[0];

        const initialY = spec.group.position.y;
        const initialArmX = spec.leftArm.rotation.x;

        // Position raft nearby
        const nearPos = { x: spectators.position.x, y: 0, z: spectators.position.z };
        animateShorelineLandmarks(handle, nearPos, 0.5);

        // After animation tick
        assert.notEqual(
            spec.group.position.y + spec.leftArm.rotation.x,
            initialY + initialArmX,
            'Spectator group Y and arm rotation updated on tick'
        );
    });

    it('animates crane jib swiveling and hoisted cargo', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 42);
        const crane = handle.items.find((it) => it.type === 'crane');

        const initialJibY = crane.jibPivot.rotation.y;
        const initialCargoY = crane.cargo.position.y;

        const nearPos = { x: crane.position.x, y: 0, z: crane.position.z };
        animateShorelineLandmarks(handle, nearPos, 1.5);

        assert.notEqual(crane.jibPivot.rotation.y, initialJibY, 'Jib pivot rotated');
        assert.notEqual(crane.cargo.position.y, initialCargoY, 'Cargo bobbed');
    });

    it('animates tavern neon flicker and emissive boost when approached', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 42);
        const tavern = handle.items.find((it) => it.type === 'tavernSign');

        // Check far emissive
        const farPos = { x: 0, y: 0, z: tavern.position.z - 100 };
        animateShorelineLandmarks(handle, farPos, 1.0);
        const calmEmissive = tavern.signMaterials[0].emissiveIntensity;

        // Check near emissive
        const nearPos = { x: tavern.position.x, y: 0, z: tavern.position.z };
        for (let i = 0; i < 10; i++) {
            animateShorelineLandmarks(handle, nearPos, 2.0 + i * 0.05);
        }
        const excitedEmissive = tavern.signMaterials[0].emissiveIntensity;

        assert.ok(
            excitedEmissive > calmEmissive,
            `Excited neon emissive (${excitedEmissive}) should exceed calm emissive (${calmEmissive})`
        );
    });

    it('animates crystal obelisk spinning core and orbiting shards', () => {
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE, 42);
        const obelisk = handle.items.find((it) => it.type === 'crystalObelisk');

        const shard0 = obelisk.shards[0];
        const initShardX = shard0.mesh.position.x;
        const initCoreRotY = obelisk.crystalCore.rotation.y;

        const nearPos = { x: obelisk.position.x, y: 0, z: obelisk.position.z };
        animateShorelineLandmarks(handle, nearPos, 1.2);

        assert.notEqual(shard0.mesh.position.x, initShardX, 'Shard orbited around obelisk');
        assert.notEqual(obelisk.crystalCore.rotation.y, initCoreRotY, 'Core rotated');
    });

    it('gracefully handles null, undefined, or missing parameters', () => {
        // Should not throw on null / undefined inputs
        animateShorelineLandmarks(null, null, 0);
        animateShorelineLandmarks({}, null, 0);
        const THREE = createMockTHREE();
        const handle = buildShorelineLandmarks(THREE);
        animateShorelineLandmarks(handle, null, 0);
        animateShorelineLandmarks(handle, undefined, 10);
        assert.ok(true, 'Executed without crashing on missing params');
    });
});
