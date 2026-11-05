import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    createBossTelegraphVFX,
    TELEGRAPH_COLORS,
} from '../public/js/vfx/boss-telegraphs.js';
import {
    createKrakenState,
    spawnKraken,
    tickKraken,
    KRAKEN_CONFIG,
} from '../shared/boss-kraken.js';

// ─── Lightweight Mock Three.js Suite for headless Node testing ───────────
function createMockThree() {
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
        setScalar(s) {
            this.x = s;
            this.y = s;
            this.z = s;
            return this;
        }
        copy(v) {
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            return this;
        }
    }

    class Color {
        constructor(hex = 0) {
            this.hex = hex;
        }
        setHex(hex) {
            this.hex = hex;
            return this;
        }
    }

    class BufferGeometry {
        constructor() {
            this.disposed = false;
        }
        dispose() {
            this.disposed = true;
        }
    }

    class RingGeometry extends BufferGeometry {
        constructor(innerRadius, outerRadius, thetaSegments) {
            super();
            this.innerRadius = innerRadius;
            this.outerRadius = outerRadius;
            this.thetaSegments = thetaSegments;
        }
    }

    class PlaneGeometry extends BufferGeometry {
        constructor(w, h) {
            super();
            this.w = w;
            this.h = h;
        }
    }

    class Material {
        constructor(opts = {}) {
            this.color = opts.color ? new Color(opts.color) : new Color(0xffffff);
            this.opacity = opts.opacity ?? 1.0;
            this.transparent = opts.transparent ?? false;
            this.side = opts.side || 0;
            this.depthWrite = opts.depthWrite ?? true;
            this.disposed = false;
        }
        dispose() {
            this.disposed = true;
        }
    }

    class MeshBasicMaterial extends Material {}
    class SpriteMaterial extends Material {}

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Vector3();
            this.scale = new Vector3(1, 1, 1);
            this.visible = true;
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
            if (idx >= 0) this.children.splice(idx, 1);
            return this;
        }
    }

    class Group extends Object3D {}
    class Scene extends Object3D {}
    class Mesh extends Object3D {
        constructor(geometry, material) {
            super();
            this.geometry = geometry;
            this.material = material;
        }
    }
    class Sprite extends Object3D {
        constructor(material) {
            super();
            this.material = material;
        }
    }

    return {
        Vector3,
        Color,
        BufferGeometry,
        RingGeometry,
        PlaneGeometry,
        Material,
        MeshBasicMaterial,
        SpriteMaterial,
        Object3D,
        Group,
        Scene,
        Mesh,
        Sprite,
        DoubleSide: 2,
    };
}

describe('Boss Weakpoint Telegraphs & Reticles VFX Suite', () => {
    it('throws when THREE or scene is missing', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        assert.throws(() => createBossTelegraphVFX(null, scene));
        assert.throws(() => createBossTelegraphVFX(THREE, null));
    });

    it('initializes pools and adds rootGroup to scene', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const vfx = createBossTelegraphVFX(THREE, scene);

        assert.ok(vfx, 'VFX instance created');
        assert.ok(vfx.rootGroup, 'rootGroup exists');
        assert.equal(scene.children.includes(vfx.rootGroup), true, 'rootGroup added to scene');
        assert.equal(vfx.dangerRingPool.length, 6, '6 danger rings in pool');
        assert.equal(vfx.weakpointPool.length, 6, '6 weakpoint reticles in pool');
        assert.equal(vfx.bannerPool.length, 6, '6 callout banners in pool');

        // All pools should initially be invisible
        assert.equal(vfx.dangerRingPool.every((r) => !r.group.visible), true);
        assert.equal(vfx.weakpointPool.every((w) => !w.group.visible), true);
        assert.equal(vfx.bannerPool.every((b) => !b.mesh.visible), true);
    });

    it('hides all elements when krakenState is null, not spawned, or defeated', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const vfx = createBossTelegraphVFX(THREE, scene);

        vfx.update(0.016, null);
        assert.equal(vfx.dangerRingPool.every((r) => !r.group.visible), true);

        const krakenState = createKrakenState();
        vfx.update(0.016, krakenState);
        assert.equal(vfx.dangerRingPool.every((r) => !r.group.visible), true);

        spawnKraken(krakenState);
        krakenState.isDefeated = true;
        vfx.update(0.016, krakenState);
        assert.equal(vfx.dangerRingPool.every((r) => !r.group.visible), true);
    });

    it('activates pulsing neon-crimson danger rings during tentacle telegraphing', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const vfx = createBossTelegraphVFX(THREE, scene);

        const krakenState = createKrakenState();
        spawnKraken(krakenState);

        // Add a mock telegraph ring
        krakenState.telegraphRings.push({
            id: 'test_ring_1',
            position: { x: 5, y: 0.1, z: -1350 },
            maxRadius: 5.5,
            currentRadius: 2.0,
            duration: 1.5,
            elapsed: 0.75,
            tentacleIndex: 0,
            damage: 35,
        });

        vfx.update(0.016, krakenState, 1.0);

        const activeRings = vfx.dangerRingPool.filter((r) => r.active && r.group.visible);
        assert.equal(activeRings.length, 1, 'one danger ring should be active');

        const ring = activeRings[0];
        assert.equal(ring.group.position.x, 5);
        assert.equal(ring.group.position.z, -1350);
        assert.equal(ring.progress, 0.5, 'progress should be 0.75 / 1.5 = 0.5');
        assert.ok(ring.outerMat.opacity > 0.5, 'outer ring opacity is high');
        assert.equal(ring.outerMat.color.hex, TELEGRAPH_COLORS.DANGER_CRIMSON);
    });

    it('flips into glowing emerald "SMASH WEAKPOINT!" reticle and callout when tentacle is slamming/vulnerable', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const vfx = createBossTelegraphVFX(THREE, scene);

        const krakenState = createKrakenState();
        spawnKraken(krakenState);

        // Tentacle 0 has landed on surface and is in vulnerable slamming/recovery state
        krakenState.tentacles[0].state = 'slamming';
        krakenState.tentacles[0].slamProgress = 0.8;
        krakenState.tentacles[0].slamTarget = { x: -3.5, y: 0.1, z: -1340 };

        vfx.update(0.016, krakenState, 2.0);

        // Danger rings should be 0 because telegraph ended
        const activeDangerRings = vfx.dangerRingPool.filter((r) => r.group.visible);
        assert.equal(activeDangerRings.length, 0);

        // Weakpoint reticles should be active at the tentacle impact position
        const activeWeakpoints = vfx.weakpointPool.filter((w) => w.active && w.group.visible);
        assert.equal(activeWeakpoints.length, 1, '1 weakpoint reticle active');
        assert.equal(activeWeakpoints[0].group.position.x, -3.5);
        assert.equal(activeWeakpoints[0].group.position.z, -1340);
        assert.equal(activeWeakpoints[0].outerMat.color.hex, TELEGRAPH_COLORS.WEAKPOINT_EMERALD);

        // Callout banner should be visible floating above the target
        const activeBanners = vfx.bannerPool.filter((b) => b.active && b.mesh.visible);
        assert.equal(activeBanners.length, 1, '1 callout banner visible');
        assert.equal(activeBanners[0].mesh.position.x, -3.5);
        assert.equal(activeBanners[0].mesh.position.z, -1340);
        assert.ok(activeBanners[0].mesh.position.y >= 3.0, 'banner floats above water plane');
    });

    it('tracks Phase 2 glowing barnacle weak-points and callouts', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const vfx = createBossTelegraphVFX(THREE, scene);

        const krakenState = createKrakenState();
        spawnKraken(krakenState);
        krakenState.phase = 2;

        // Activate 2 barnacles
        krakenState.barnacles[0].active = true;
        krakenState.barnacles[0].destroyed = false;
        krakenState.barnacles[1].active = true;
        krakenState.barnacles[1].destroyed = false;

        vfx.update(0.016, krakenState, 3.5);

        const activeWeakpoints = vfx.weakpointPool.filter((w) => w.active && w.group.visible);
        assert.equal(activeWeakpoints.length, 2, '2 barnacle weakpoints active');
        assert.equal(activeWeakpoints[0].outerMat.color.hex, TELEGRAPH_COLORS.BARNACLE_AMBER);

        const activeBanners = vfx.bannerPool.filter((b) => b.active && b.mesh.visible);
        assert.equal(activeBanners.length, 2, '2 barnacle callout banners active');
    });

    it('cleans up and removes rootGroup from scene on dispose()', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const vfx = createBossTelegraphVFX(THREE, scene);

        assert.equal(scene.children.includes(vfx.rootGroup), true);
        vfx.dispose();
        assert.equal(scene.children.includes(vfx.rootGroup), false, 'rootGroup removed from scene');
        assert.equal(vfx.dangerRingPool.every((r) => !r.group.visible), true);
        assert.equal(vfx.weakpointPool.every((w) => !w.group.visible), true);
        assert.equal(vfx.bannerPool.every((b) => !b.mesh.visible), true);
    });
});
