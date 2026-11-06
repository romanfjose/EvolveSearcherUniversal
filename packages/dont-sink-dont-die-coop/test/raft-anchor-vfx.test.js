import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ANCHOR_VFX_CONFIG,
    createRaftAnchorVfx,
    updateRaftAnchorVfx,
} from '../public/js/vfx/raft-anchor-vfx.js';

/**
 * Headless Three.js mock for deterministic unit testing.
 */
function createMockTHREE() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }
    class Euler {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    }
    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.children = [];
            this.visible = true;
            this.castShadow = false;
            this.name = '';
            this.userData = {};
        }
        add(...objs) {
            for (const o of objs) if (o) this.children.push(o);
            return this;
        }
        remove(obj) {
            const idx = this.children.indexOf(obj);
            if (idx !== -1) this.children.splice(idx, 1);
        }
    }
    class Group extends Object3D { constructor() { super(); this.type = 'Group'; } }
    class Mesh extends Object3D {
        constructor(geo, mat) {
            super();
            this.type = 'Mesh';
            this.geometry = geo;
            this.material = mat;
        }
    }
    class Geometry {
        constructor(type, ...args) { this.type = type; this.args = args; }
        rotateX() { return this; }
        rotateZ() { return this; }
        dispose() {}
    }
    class Material {
        constructor(type, p = {}) {
            this.type = type;
            this.opacity = 1.0;
            this.transparent = false;
            Object.assign(this, p);
        }
        clone() {
            return new Material(this.type, this);
        }
        dispose() {}
    }

    return {
        Group,
        Mesh,
        MeshStandardMaterial: class extends Material { constructor(p) { super('MeshStandardMaterial', p); } },
        MeshBasicMaterial: class extends Material { constructor(p) { super('MeshBasicMaterial', p); } },
        CylinderGeometry: class extends Geometry { constructor(...a) { super('CylinderGeometry', ...a); } },
        BoxGeometry: class extends Geometry { constructor(...a) { super('BoxGeometry', ...a); } },
        ConeGeometry: class extends Geometry { constructor(...a) { super('ConeGeometry', ...a); } },
        SphereGeometry: class extends Geometry { constructor(...a) { super('SphereGeometry', ...a); } },
        TorusGeometry: class extends Geometry { constructor(...a) { super('TorusGeometry', ...a); } },
        RingGeometry: class extends Geometry { constructor(...a) { super('RingGeometry', ...a); } },
        DoubleSide: 2,
    };
}

describe('3D Iron Anchor & Mooring Line VFX Hierarchy Assembly', () => {
    it('creates root group with correct name, sub-groups, and userData handles', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);

        assert.equal(root.type, 'Group');
        assert.equal(root.name, 'RaftAnchorVfx_Root');
        assert.ok(root.userData);
        assert.ok(root.userData.state);
        assert.ok(root.userData.anchorGroup);
        assert.ok(root.userData.chainLinks);
        assert.ok(root.userData.portRope);
        assert.ok(root.userData.starboardRope);
        assert.ok(root.userData.foamMeshes);
        assert.ok(root.userData.brakingWakeGroup);

        // Verify chain link count matches configuration
        assert.equal(root.userData.chainLinks.length, ANCHOR_VFX_CONFIG.CHAIN_LINK_COUNT);
        // Verify foam particle pool pre-allocation
        assert.equal(root.userData.foamMeshes.length, ANCHOR_VFX_CONFIG.BRAKE_FOAM_PARTICLES);
    });

    it('initializes anchor in stowed position and hides chain links and mooring ropes', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);
        const { anchorGroup, chainLinks, portRope, starboardRope } = root.userData;

        assert.equal(anchorGroup.position.x, ANCHOR_VFX_CONFIG.STOWED_ANCHOR_POS.x);
        assert.equal(anchorGroup.position.y, ANCHOR_VFX_CONFIG.STOWED_ANCHOR_POS.y);
        assert.equal(anchorGroup.position.z, ANCHOR_VFX_CONFIG.STOWED_ANCHOR_POS.z);

        // Chains are hidden while stowed
        for (const link of chainLinks) {
            assert.equal(link.visible, false);
        }

        // Mooring ropes are hidden while not on solid platform
        assert.equal(portRope.mesh.visible, false);
        assert.equal(starboardRope.mesh.visible, false);
    });
});

describe('Anchor Dropping & Raising Kinematics (anchored: true / false)', () => {
    it('lowers anchor into water column and deploys chain links when anchored: true', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);
        const { state, anchorGroup, chainLinks } = root.userData;

        // Step time while anchored
        for (let i = 1; i <= 30; i++) {
            updateRaftAnchorVfx(root, { anchored: true, onSolid: false, velocity: 5, time: i * 0.05 });
        }

        // Drop progress should have reached 1.0 (deployed)
        assert.equal(state.dropProgress, 1.0);
        assert.ok(anchorGroup.position.y < 0, `Anchor Y (${anchorGroup.position.y}) should be deep in water`);
        assert.ok(
            Math.abs(anchorGroup.position.y - ANCHOR_VFX_CONFIG.DEPLOYED_ANCHOR_DEPTH) < 0.1,
            `Anchor Y (${anchorGroup.position.y}) should be near target depth`
        );

        // Chain links should now be visible and follow a descending catenary curve
        const visibleLinks = chainLinks.filter((l) => l.visible);
        assert.ok(visibleLinks.length > 0, 'Chain links should be visible when deployed');
        assert.equal(visibleLinks.length, chainLinks.length);

        // First link should be higher than the last link
        assert.ok(visibleLinks[0].position.y > visibleLinks[visibleLinks.length - 1].position.y);
    });

    it('retracts anchor back to stowed position when anchored is released', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);
        const { state, anchorGroup, chainLinks } = root.userData;

        // First lower anchor
        for (let i = 1; i <= 20; i++) {
            updateRaftAnchorVfx(root, { anchored: true, onSolid: false, velocity: 0, time: i * 0.05 });
        }
        assert.equal(state.dropProgress, 1.0);

        // Now release anchor
        for (let i = 21; i <= 45; i++) {
            updateRaftAnchorVfx(root, { anchored: false, onSolid: false, velocity: 2, time: i * 0.05 });
        }

        // Drop progress should return to 0.0
        assert.equal(state.dropProgress, 0.0);
        assert.ok(
            Math.abs(anchorGroup.position.y - ANCHOR_VFX_CONFIG.STOWED_ANCHOR_POS.y) < 0.01,
            'Anchor should return to stowed Y'
        );
        assert.ok(
            Math.abs(anchorGroup.position.z - ANCHOR_VFX_CONFIG.STOWED_ANCHOR_POS.z) < 0.01,
            'Anchor should return to stowed Z'
        );

        // Chain links should be hidden again
        const visibleLinks = chainLinks.filter((l) => l.visible);
        assert.equal(visibleLinks.length, 0);
    });
});

describe('Taut Mooring Ropes Docking (onSolid: true / false)', () => {
    it('activates and tightens port and starboard mooring lines when onSolid: true', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);
        const { portRope, starboardRope } = root.userData;

        assert.equal(portRope.mesh.visible, false);
        assert.equal(starboardRope.mesh.visible, false);

        // Dock on platform
        updateRaftAnchorVfx(root, { anchored: false, onSolid: true, velocity: 0, time: 1.0 });

        assert.equal(portRope.mesh.visible, true);
        assert.equal(starboardRope.mesh.visible, true);

        // Verify ropes are stretched (scale.y reflects distance between cleat and bollard)
        assert.ok(portRope.mesh.scale.y > 1.0, 'Port rope scale.y should be non-trivial');
        assert.ok(starboardRope.mesh.scale.y > 1.0, 'Starboard rope scale.y should be non-trivial');

        // Verify port rope is on the negative X side and starboard on positive X side
        assert.ok(portRope.mesh.position.x < 0, 'Port rope midpoint should be on port side (X < 0)');
        assert.ok(starboardRope.mesh.position.x > 0, 'Starboard rope midpoint should be on starboard side (X > 0)');
    });

    it('hides mooring lines immediately when un-docked (onSolid: false)', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);
        const { portRope, starboardRope } = root.userData;

        // Dock
        updateRaftAnchorVfx(root, { anchored: false, onSolid: true, velocity: 0, time: 1.0 });
        assert.equal(portRope.mesh.visible, true);

        // Leave dock
        updateRaftAnchorVfx(root, { anchored: false, onSolid: false, velocity: 8, time: 1.1 });
        assert.equal(portRope.mesh.visible, false);
        assert.equal(starboardRope.mesh.visible, false);
    });
});

describe('Hydrodynamic Braking Wake Foam & Churn VFX', () => {
    it('spawns braking wake particles when anchored in water with forward velocity', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);
        const { foamMeshes } = root.userData;

        // When stationary or stowed, no braking wake
        updateRaftAnchorVfx(root, { anchored: false, onSolid: false, velocity: 0, time: 0.1 });
        assert.equal(foamMeshes.filter((f) => f.active).length, 0);

        // Lower anchor and brake at speed
        for (let i = 1; i <= 25; i++) {
            updateRaftAnchorVfx(root, {
                anchored: true,
                onSolid: false,
                velocity: { x: 0, y: 0, z: -10 },
                time: i * 0.05,
            });
        }

        // Active particles should have been spawned and animated
        const spawnedAtLeastOnce = foamMeshes.some((f) => f.active || f.mesh.visible);
        assert.ok(spawnedAtLeastOnce, 'Braking wake churn foam should be triggered while braking at speed');
    });

    it('recycles foam particles cleanly when their lifespan expires', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);
        const { foamMeshes } = root.userData;

        // Spawn some particles
        for (let i = 1; i <= 20; i++) {
            updateRaftAnchorVfx(root, { anchored: true, onSolid: false, velocity: 12, time: i * 0.05 });
        }

        // Manually activate a particle with short lifespan to verify recycling
        const testParticle = foamMeshes[0];
        testParticle.active = true;
        testParticle.age = 0.5;
        testParticle.lifespan = 0.55;
        testParticle.mesh.visible = true;

        // Advance past lifespan
        updateRaftAnchorVfx(root, { anchored: true, onSolid: false, velocity: 0, time: 5.0 });

        assert.equal(testParticle.active, false);
        assert.equal(testParticle.mesh.visible, false);
    });
});

describe('Raft Anchor VFX Lifecycle & Cleanup', () => {
    it('tolerates missing or partial arguments without throwing', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);

        assert.doesNotThrow(() => updateRaftAnchorVfx(null));
        assert.doesNotThrow(() => updateRaftAnchorVfx({}));
        assert.doesNotThrow(() => updateRaftAnchorVfx(root));
        assert.doesNotThrow(() => updateRaftAnchorVfx(root, { anchored: true }));
        assert.doesNotThrow(() => updateRaftAnchorVfx(root, { velocity: { x: 1 } }));
    });

    it('cleanly disposes all geometries and materials on root.dispose()', () => {
        const THREE = createMockTHREE();
        const root = createRaftAnchorVfx(THREE);

        let disposeCalledCount = 0;
        for (const geo of root.userData.state.geometries) {
            geo.dispose = () => { disposeCalledCount++; };
        }
        for (const mat of root.userData.state.materials) {
            mat.dispose = () => { disposeCalledCount++; };
        }

        assert.ok(root.children.length > 0);
        root.dispose();

        assert.ok(disposeCalledCount >= 10, `Expected >= 10 disposes, got ${disposeCalledCount}`);
        assert.equal(root.children.length, 0, 'Root should remove all children upon disposal');
    });
});
