import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createWaterWakeSystem } from '../public/js/vfx/water-wake-ribbons.js';

// ─── Lightweight Mock Three.js Factory for Zero-Dependency Headless Tests ────
function createMockThree() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }

    class Color {
        constructor(hex = 0xffffff) { this.hex = hex; }
        setHex(hex) { this.hex = hex; return this; }
    }

    class BufferAttribute {
        constructor(array, itemSize) {
            this.array = array;
            this.itemSize = itemSize;
            this.needsUpdate = false;
        }
        setUsage() { return this; }
    }

    class BufferGeometry {
        constructor() {
            this.attributes = {};
            this.index = null;
        }
        setAttribute(name, attr) {
            this.attributes[name] = attr;
            return this;
        }
        setIndex(index) {
            this.index = index;
            return this;
        }
        rotateX() { return this; }
        dispose() {}
    }

    class RingGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }
    class TorusGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }

    class Material {
        constructor(opts = {}) {
            this.color = opts.color ? new Color(opts.color) : new Color(0xffffff);
            this.opacity = opts.opacity ?? 1.0;
            this.transparent = opts.transparent ?? false;
            this.vertexColors = opts.vertexColors ?? false;
        }
        dispose() {}
    }

    class MeshBasicMaterial extends Material {}

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Vector3();
            this.scale = new Vector3(1, 1, 1);
            this.visible = true;
            this.frustumCulled = true;
            this.children = [];
            this.name = '';
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
        }
    }

    class Group extends Object3D {}
    class Mesh extends Object3D {
        constructor(geo, mat) {
            super();
            this.geometry = geo;
            this.material = mat;
        }
    }

    return {
        Vector3,
        Color,
        BufferAttribute,
        Float32BufferAttribute: BufferAttribute,
        Uint16BufferAttribute: BufferAttribute,
        BufferGeometry,
        RingGeometry,
        TorusGeometry,
        Material,
        MeshBasicMaterial,
        Group,
        Mesh,
        DoubleSide: 2,
        NormalBlending: 1,
        DynamicDrawUsage: 35048,
    };
}

function createMockScene() {
    const children = [];
    return {
        children,
        add(obj) { children.push(obj); },
        remove(obj) {
            const idx = children.indexOf(obj);
            if (idx !== -1) children.splice(idx, 1);
        },
    };
}

describe('Velocity-Reactive 3D Water Wake Ribbon & Splash Ring System', () => {
    it('initializes cleanly, adds rootGroup to scene, and exposes standard interface', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const wakeSystem = createWaterWakeSystem(THREE, scene);

        assert.ok(wakeSystem, 'Wake system instance must be returned');
        assert.ok(scene.children.includes(wakeSystem.rootGroup), 'Root group must be added to scene');
        assert.equal(typeof wakeSystem.update, 'function');
        assert.equal(typeof wakeSystem.triggerLandingSplash, 'function');
        assert.equal(typeof wakeSystem.dispose, 'function');
        assert.ok(wakeSystem._pools, 'Internal pools must be exposed for inspection');
        assert.equal(wakeSystem._pools.splashRings.length, 18);
        assert.ok(wakeSystem._pools.leftRibbon);
        assert.ok(wakeSystem._pools.rightRibbon);
    });

    it('generates V-shaped bow wake ribbons that widen and brighten as raft speed increases', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const wakeSystem = createWaterWakeSystem(THREE, scene);

        const { leftRibbon, rightRibbon } = wakeSystem._pools;

        // Test 1: Low speed cruising (3 m/s)
        wakeSystem.update(1 / 60, { x: 0, y: 0.25, z: -10 }, { x: 0, y: 0, z: -3 }, false, false);

        const lowSpeedLeftHead = leftRibbon.points[0];
        const lowSpeedRightHead = rightRibbon.points[0];
        assert.equal(lowSpeedLeftHead.active, true, 'Left ribbon head should be active');
        assert.equal(lowSpeedRightHead.active, true, 'Right ribbon head should be active');

        const lowSpeedWidth = lowSpeedLeftHead.width;
        const lowSpeedBrightness = lowSpeedLeftHead.brightness;
        const lowSpeedOpacity = leftRibbon.mat.opacity;

        assert.ok(lowSpeedWidth > 0.35 && lowSpeedWidth < 0.8, `Low speed width was ${lowSpeedWidth}`);
        assert.ok(lowSpeedBrightness > 0.2 && lowSpeedBrightness < 0.5, `Low speed brightness was ${lowSpeedBrightness}`);

        // Test 2: High speed sprint (20 m/s)
        wakeSystem.update(1 / 60, { x: 0, y: 0.25, z: -20 }, { x: 0, y: 0, z: -20 }, false, false);

        const highSpeedLeftHead = leftRibbon.points[0];
        const highSpeedWidth = highSpeedLeftHead.width;
        const highSpeedBrightness = highSpeedLeftHead.brightness;
        const highSpeedOpacity = leftRibbon.mat.opacity;

        // Must widen and brighten at higher velocity
        assert.ok(highSpeedWidth > lowSpeedWidth, `High speed width (${highSpeedWidth}) should be greater than low speed (${lowSpeedWidth})`);
        assert.ok(highSpeedBrightness > lowSpeedBrightness, `High speed brightness (${highSpeedBrightness}) should be greater than low speed (${lowSpeedBrightness})`);
        assert.ok(highSpeedOpacity >= lowSpeedOpacity, `High speed opacity (${highSpeedOpacity}) should be >= low speed opacity (${lowSpeedOpacity})`);

        // Check V-shape symmetry: left ribbon normal should be to the left (-X), right ribbon to the right (+X)
        assert.ok(highSpeedLeftHead.normX < 0, 'Left ribbon normal should point port side');
        assert.ok(rightRibbon.points[0].normX > 0, 'Right ribbon normal should point starboard side');
    });

    it('suspends bow wake emission when raft is airborne and smoothly decays existing ribbons', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const wakeSystem = createWaterWakeSystem(THREE, scene);

        const { leftRibbon } = wakeSystem._pools;

        // Cruise on water first
        wakeSystem.update(1 / 60, { x: 0, y: 0.25, z: -10 }, { x: 0, y: 0, z: -10 }, false, false);
        assert.equal(leftRibbon.points[0].active, true);

        // Jump into air (airborne = true, y = 3.5m)
        wakeSystem.update(1 / 60, { x: 0, y: 3.5, z: -15 }, { x: 0, y: 2.0, z: -10 }, true, false);

        // Head point should NOT be active when airborne
        assert.equal(leftRibbon.points[0].active, false, 'Airborne update must not emit new wake');

        // Step time while airborne to verify ribbon decay
        for (let i = 0; i < 30; i++) {
            wakeSystem.update(1 / 60, { x: 0, y: 3.5, z: -15 - i }, { x: 0, y: 0, z: -10 }, true, false);
        }

        // Ribbon opacity should decay towards 0
        assert.ok(leftRibbon.mat.opacity < 0.2, `Ribbon opacity should have decayed, got ${leftRibbon.mat.opacity}`);
    });

    it('generates concentric 3D turquoise/white splash rings upon landing', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const wakeSystem = createWaterWakeSystem(THREE, scene);

        const rings = wakeSystem._pools.splashRings;

        // Land on water after airborne jump
        const landingPos = { x: 2.5, y: 0.25, z: -85 };
        wakeSystem.update(1 / 60, landingPos, { x: 0, y: -5, z: -12 }, false, true);

        // Filter active rings triggered by landing
        const activeRings = rings.filter((r) => r.active);
        assert.ok(activeRings.length >= 3, `Expected at least 3 concentric rings, got ${activeRings.length}`);

        // Verify colors include brilliant white and vivid turquoise/cyan
        const activeColors = activeRings.map((r) => r.color);
        assert.ok(activeColors.includes(0xffffff), 'Should have a white splash ring');
        assert.ok(activeColors.includes(0x00f5d4), 'Should have a turquoise shockwave ring');

        // Advance simulation: rings should expand outwards
        wakeSystem.update(0.2, landingPos, { x: 0, y: 0, z: -10 }, false, false);

        for (const ring of activeRings) {
            if (ring.elapsed > 0) {
                assert.equal(ring.mesh.visible, true);
                assert.ok(ring.mesh.scale.x > 0.1, `Ring scale should have expanded: ${ring.mesh.scale.x}`);
                assert.ok(ring.mat.opacity > 0, 'Ring opacity should be visible during expansion');
            }
        }

        // Advance past full duration (1.2s): rings should complete and deactivate
        wakeSystem.update(1.5, landingPos, { x: 0, y: 0, z: -10 }, false, false);
        const lingeringRings = rings.filter((r) => r.active);
        assert.equal(lingeringRings.length, 0, 'All splash rings should cleanly deactivate after duration');
    });

    it('triggerLandingSplash API allows direct triggering with strength scaling', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const wakeSystem = createWaterWakeSystem(THREE, scene);

        const activated = wakeSystem.triggerLandingSplash({ x: 0, y: 0.25, z: -50 }, { strength: 2.0, ringCount: 4 });
        assert.equal(activated, 4, 'Should activate 4 concentric rings');

        const activeRings = wakeSystem._pools.splashRings.filter((r) => r.active);
        assert.equal(activeRings.length, 4);

        // Strength 2.0 should scale max radius higher than baseline
        const firstRing = activeRings[0];
        assert.ok(firstRing.maxRadius > 6.0, `Max radius should scale with strength, got ${firstRing.maxRadius}`);
    });

    it('handles scalar speed argument in update() seamlessly', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const wakeSystem = createWaterWakeSystem(THREE, scene);

        // Update with scalar speed (14)
        wakeSystem.update(1 / 60, { x: 0, y: 0.25, z: -10 }, 14, false, false);
        const { leftRibbon } = wakeSystem._pools;
        assert.equal(leftRibbon.points[0].active, true);
        assert.ok(leftRibbon.points[0].width > 0.5);
    });

    it('cleanly disposes all resources and removes rootGroup from scene', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const wakeSystem = createWaterWakeSystem(THREE, scene);

        assert.equal(scene.children.length, 1);
        wakeSystem.dispose();
        assert.equal(scene.children.length, 0);
    });
});
