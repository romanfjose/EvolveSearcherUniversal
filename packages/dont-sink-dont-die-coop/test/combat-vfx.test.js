import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    clamp,
    lerp,
    vec3,
    vec3Add,
    vec3Sub,
    vec3Scale,
    vec3Length,
    vec3Distance,
    vec3Normalize,
    vec3Dot,
    vec3Cross,
    vec3Lerp,
    easeOutQuad,
    easeInCubic,
    lerpColorHex,
    computeSlashArcPoint,
    generateSlashRibbonMesh,
    checkMeleeArcHit,
    computeHexagonCellVertices,
    checkParryInterception,
    calculateSparkVelocity,
    stepArcaneBoltTrajectory,
    generateTetherBeamPoints,
    intersectRaySphere,
    calculateMuzzleFlashState,
    calculateTracerLine,
    calculateCoinBurstInitialVelocity,
    stepCoinPhysics,
} from '../shared/combat-vfx-math.js';

import { createCombatVFXSystem } from '../public/js/vfx/combat-vfx.js';

// ─── Deterministic Mock Three.js Suite for VFX Unit Testing ───────────────
function createMockThree() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }

    class Color {
        constructor(hex = 0) { this.hex = hex; }
        setHex(hex) { this.hex = hex; return this; }
    }

    class BufferAttribute {
        constructor(array, itemSize) {
            this.array = array;
            this.itemSize = itemSize;
            this.needsUpdate = false;
        }
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
        dispose() {}
    }

    class SphereGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }
    class OctahedronGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }
    class CylinderGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }

    class Material {
        constructor(opts = {}) {
            this.color = opts.color ? new Color(opts.color) : new Color(0);
            this.opacity = opts.opacity ?? 1.0;
            this.transparent = opts.transparent ?? false;
            this.uniforms = opts.uniforms || {};
        }
        clone() {
            return new Material({ color: this.color.hex, opacity: this.opacity, transparent: this.transparent, uniforms: { ...this.uniforms } });
        }
        dispose() {}
    }

    class ShaderMaterial extends Material {}
    class MeshBasicMaterial extends Material {}
    class MeshStandardMaterial extends Material {}
    class PointsMaterial extends Material {}
    class LineBasicMaterial extends Material {}

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
    class Points extends Object3D {
        constructor(geo, mat) {
            super();
            this.geometry = geo;
            this.material = mat;
        }
    }
    class Line extends Object3D {
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
        BufferGeometry,
        SphereGeometry,
        OctahedronGeometry,
        CylinderGeometry,
        ShaderMaterial,
        MeshBasicMaterial,
        MeshStandardMaterial,
        PointsMaterial,
        LineBasicMaterial,
        Group,
        Mesh,
        Points,
        Line,
        DoubleSide: 2,
        AdditiveBlending: 2,
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

describe('deterministic 3D vector and math foundations', () => {
    it('clamp restricts values strictly within [min, max]', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-5, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
    });

    it('lerp interpolates linearly with clamping to [0, 1]', () => {
        assert.equal(lerp(10, 20, 0), 10);
        assert.equal(lerp(10, 20, 0.5), 15);
        assert.equal(lerp(10, 20, 1.0), 20);
        assert.equal(lerp(10, 20, -1.0), 10);
        assert.equal(lerp(10, 20, 2.0), 20);
    });

    it('vector math helpers compute correct dot, cross, norm and distance', () => {
        const v1 = vec3(1, 0, 0);
        const v2 = vec3(0, 1, 0);
        assert.equal(vec3Dot(v1, v2), 0);

        const vCross = vec3Cross(v1, v2);
        assert.deepEqual(vCross, { x: 0, y: 0, z: 1 });

        const dist = vec3Distance(vec3(0, 0, 0), vec3(3, 4, 0));
        assert.equal(dist, 5);

        const norm = vec3Normalize(vec3(0, 10, 0));
        assert.deepEqual(norm, { x: 0, y: 1, z: 0 });
    });

    it('lerpColorHex blends RGB hex colors component-wise', () => {
        const c1 = 0x000000;
        const c2 = 0xffffff;
        const mid = lerpColorHex(c1, c2, 0.5);
        assert.equal((mid >> 16) & 0xff, 128);
        assert.equal((mid >> 8) & 0xff, 128);
        assert.equal(mid & 0xff, 128);
    });
});

describe('Melee Oar/War-Mallet crescent slash ribbon math', () => {
    it('computeSlashArcPoint places vertices symmetrically around forward -Z', () => {
        const origin = { x: 0, y: 1, z: 0 };
        const yaw = 0; // forward is -Z
        const ptCenter = computeSlashArcPoint(origin, 0, yaw, 3.0, 0);
        assert.ok(Math.abs(ptCenter.x) < 1e-6);
        assert.ok(Math.abs(ptCenter.z - (-3.0)) < 1e-6);

        const ptRight = computeSlashArcPoint(origin, -Math.PI / 4, yaw, 3.0, 0);
        const ptLeft = computeSlashArcPoint(origin, Math.PI / 4, yaw, 3.0, 0);
        assert.ok(ptRight.x < 0);
        assert.ok(ptLeft.x > 0);
        assert.ok(Math.abs(ptRight.x + ptLeft.x) < 1e-6);
    });

    it('generateSlashRibbonMesh builds valid vertex, uv, and index buffers', () => {
        const origin = { x: 0, y: 0, z: 0 };
        const segments = 16;
        const ribbon = generateSlashRibbonMesh(origin, 0, -Math.PI * 0.4, Math.PI * 0.4, segments);

        assert.equal(ribbon.positions.length, (segments + 1) * 2 * 3);
        assert.equal(ribbon.uvs.length, (segments + 1) * 2 * 2);
        assert.equal(ribbon.indices.length, segments * 6);

        // UVs are normalized from 0 to 1
        assert.equal(ribbon.uvs[0], 0.0);
        assert.equal(ribbon.uvs[ribbon.uvs.length - 2], 1.0);
    });

    it('checkMeleeArcHit detects enemy directly in front within weapon reach', () => {
        const attackerPos = { x: 0, y: 0, z: 0 };
        const attackerYaw = 0; // forward is -Z
        const enemyPos = { x: 0, y: 0, z: -3.0 };

        const hitResult = checkMeleeArcHit(attackerPos, attackerYaw, enemyPos, 1.5, Math.PI * 0.5, 4.0);
        assert.equal(hitResult.hit, true);
        assert.ok(hitResult.distance < 3.1);
        assert.ok(hitResult.angleDiff < 0.1);
    });

    it('checkMeleeArcHit rejects enemies behind or out of range', () => {
        const attackerPos = { x: 0, y: 0, z: 0 };
        const attackerYaw = 0;
        const behindPos = { x: 0, y: 0, z: 5.0 };
        const outOfRangePos = { x: 0, y: 0, z: -10.0 };

        assert.equal(checkMeleeArcHit(attackerPos, attackerYaw, behindPos).hit, false);
        assert.equal(checkMeleeArcHit(attackerPos, attackerYaw, outOfRangePos).hit, false);
    });
});

describe('Golden Block Parry Hexagon Dome & spark burst math', () => {
    it('computeHexagonCellVertices returns 7 vertices forming a regular hexagon on dome', () => {
        const vertices = computeHexagonCellVertices(2.4, Math.PI * 0.25, 0, 0.5);
        assert.equal(vertices.length, 7); // center + 6 rim points

        const center = vertices[0];
        // All perimeter vertices must be roughly hexSize away from center
        for (let i = 1; i <= 6; i++) {
            const d = vec3Distance(center, vertices[i]);
            assert.ok(Math.abs(d - 0.5) < 1e-4, `Hexagon vertex ${i} distance ${d} deviates from 0.5`);
        }
    });

    it('checkParryInterception recognizes frontal enemy strikes within shield dome', () => {
        const playerPos = { x: 0, y: 0, z: 0 };
        const playerYaw = 0; // forward is -Z
        const strikePos = { x: 0, y: 0.5, z: -2.3 };

        const res = checkParryInterception(playerPos, playerYaw, strikePos, 2.4);
        assert.equal(res.parried, true);
        assert.ok(res.sparkNormal.z < 0, 'Spark normal should reflect forward toward incoming attack');
    });

    it('checkParryInterception denies flanking rear attacks', () => {
        const playerPos = { x: 0, y: 0, z: 0 };
        const playerYaw = 0;
        const rearStrike = { x: 0, y: 0.5, z: 2.3 }; // behind player

        const res = checkParryInterception(playerPos, playerYaw, rearStrike, 2.4);
        assert.equal(res.parried, false);
    });

    it('calculateSparkVelocity produces deterministic dispersed velocities with upward bounce', () => {
        const normal = { x: 0, y: 0, z: -1 };
        const spark0 = calculateSparkVelocity(normal, 0, 20, 12);
        const spark0Repeat = calculateSparkVelocity(normal, 0, 20, 12);
        assert.deepEqual(spark0, spark0Repeat);
        assert.ok(spark0.vy > 0, 'Sparks should have positive upward velocity component');

        const spark5 = calculateSparkVelocity(normal, 5, 20, 12);
        assert.notDeepEqual(spark0, spark5);
    });
});

describe('Wizard Arcane Bolt & Telekinetic Tether Beam math', () => {
    it('stepArcaneBoltTrajectory steers homing bolt towards target position', () => {
        const pos = { x: -5, y: 2, z: 0 };
        const vel = { x: 0, y: 0, z: -10 };
        const target = { x: 5, y: 2, z: 0 };

        const step = stepArcaneBoltTrajectory(pos, vel, target, 0.1, 20.0, 25.0, 0, 0, 0);
        // Velocity X should steer toward positive X
        assert.ok(step.vel.x > 0, `Velocity x was ${step.vel.x}`);
        assert.ok(step.pos.x > pos.x);
    });

    it('generateTetherBeamPoints creates continuous chaotic electric arc between endpoints', () => {
        const start = { x: -10, y: 2, z: -50 };
        const end = { x: 0, y: 1, z: 0 };
        const segments = 24;
        const pts = generateTetherBeamPoints(start, end, segments, 1.5, 0.8);

        assert.equal(pts.length, (segments + 1) * 3);
        // Start point is exact
        assert.equal(pts[0], start.x);
        assert.equal(pts[1], start.y);
        assert.equal(pts[2], start.z);

        // End point is exact
        const lastIdx = segments * 3;
        assert.ok(Math.abs(pts[lastIdx + 0] - end.x) < 1e-4);
        assert.ok(Math.abs(pts[lastIdx + 1] - end.y) < 1e-4);
        assert.ok(Math.abs(pts[lastIdx + 2] - end.z) < 1e-4);

        // Middle points exhibit non-zero jitter
        const midIdx = Math.floor(segments / 2) * 3;
        const linearMidY = (start.y + end.y) * 0.5;
        assert.notEqual(pts[midIdx + 1], linearMidY);
    });

    it('intersectRaySphere detects bolt hit with target bounding sphere', () => {
        const origin = { x: 0, y: 1, z: -10 };
        const dir = { x: 0, y: 0, z: 1 };
        const sphere = { x: 0, y: 1, z: 0 };
        const radius = 2.0;

        const res = intersectRaySphere(origin, dir, 20.0, sphere, radius);
        assert.equal(res.hit, true);
        assert.ok(Math.abs(res.t - 8.0) < 1e-4); // Hits at z = -2.0 (distance 8 from -10)
        assert.ok(Math.abs(res.hitPoint.z - (-2.0)) < 1e-4);
    });

    it('intersectRaySphere misses when ray direction bypasses sphere', () => {
        const origin = { x: 0, y: 1, z: -10 };
        const dir = { x: 1, y: 0, z: 0 }; // Heading perpendicular
        const sphere = { x: 0, y: 1, z: 0 };

        const res = intersectRaySphere(origin, dir, 20.0, sphere, 2.0);
        assert.equal(res.hit, false);
    });
});

describe('Police cruiser muzzle flash and supersonic tracer math', () => {
    it('calculateMuzzleFlashState starts at peak intensity and decays exponentially', () => {
        const f0 = calculateMuzzleFlashState(0.0, 0.08);
        assert.equal(f0.intensity, 1.0);
        assert.equal(f0.scale, 1.0);

        const fMid = calculateMuzzleFlashState(0.04, 0.08);
        assert.ok(fMid.intensity < 0.6 && fMid.intensity > 0.01);

        const fEnd = calculateMuzzleFlashState(0.081, 0.08);
        assert.equal(fEnd.intensity, 0);
        assert.equal(fEnd.scale, 0);
    });

    it('calculateTracerLine moves beam segment forward from muzzle to target', () => {
        const origin = { x: 25, y: 0, z: -200 };
        const target = { x: 0, y: 0, z: -200 }; // 25m distance along -X
        const speed = 100.0;
        const length = 5.0;

        // At t = 0.1s, head travelled 10m from origin.x=25 -> x=15, tail at 5m from origin.x=25 -> x=20
        const step1 = calculateTracerLine(origin, target, 0.1, speed, length);
        assert.equal(step1.active, true);
        assert.equal(step1.arrived, false);
        assert.ok(Math.abs(step1.head.x - 15) < 1e-4, `Expected head.x to be ~15, got ${step1.head.x}`);
        assert.ok(Math.abs(step1.tail.x - 20) < 1e-4, `Expected tail.x to be ~20, got ${step1.tail.x}`);

        // At t = 0.35s, tail reaches target, tracer completes
        const stepDone = calculateTracerLine(origin, target, 0.35, speed, length);
        assert.equal(stepDone.active, false);
        assert.equal(stepDone.arrived, true);
    });
});

describe('Floating 3D coin burst fountain ballistics and magnetism', () => {
    it('calculateCoinBurstInitialVelocity radiates coins radially with upward launch speed', () => {
        const c0 = calculateCoinBurstInitialVelocity(0, 12, 10.0, 6.0);
        const c6 = calculateCoinBurstInitialVelocity(6, 12, 10.0, 6.0);

        assert.ok(c0.vy > 8.0);
        assert.ok(c6.vy > 8.0);
        // Opposing angles on radial circle
        assert.ok(c0.vx * c6.vx < 0 || Math.abs(c0.vx) < 0.5);
    });

    it('stepCoinPhysics bounces coin off water surface and floats at rest Y', () => {
        let pos = { x: 0, y: 3.0, z: 0 };
        let vel = { x: 0, y: 0, z: 0 };
        const dt = 0.05;

        // Fall under gravity towards water (y = 0.25)
        for (let i = 0; i < 20; i++) {
            const step = stepCoinPhysics(pos, vel, dt, null, 0.25, 26.0, 0.4);
            pos = step.pos;
            vel = step.vel;
        }

        assert.ok(pos.y >= 0.25, 'Coin should not sink below water surface level');
    });

    it('stepCoinPhysics pulls coin towards player and marks as collected on contact', () => {
        const playerPos = { x: 0, y: 0.5, z: 0 };
        let pos = { x: 4.0, y: 0.25, z: 0 };
        let vel = { x: 0, y: 0, z: 0 };
        const dt = 0.05;

        let collected = false;
        for (let i = 0; i < 30; i++) {
            const step = stepCoinPhysics(pos, vel, dt, playerPos, 0.25, 26.0, 0.35, 8.0, 50.0);
            pos = step.pos;
            vel = step.vel;
            if (step.collected) {
                collected = true;
                break;
            }
        }

        assert.equal(collected, true, 'Coin should have been pulled to player and collected');
    });
});

describe('Three.js Combat VFX System Lifecycle & Pooling (Zero-GC)', () => {
    it('initializes CombatVFXSystem, pre-allocates pools, and adds rootGroup to scene', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createCombatVFXSystem(THREE, scene);

        assert.ok(scene.children.includes(vfx.rootGroup));
        assert.equal(vfx._pools.slashPool.length, 8);
        assert.equal(vfx._pools.parryDomePool.length, 4);
        assert.equal(vfx._pools.boltPool.length, 16);
        assert.equal(vfx._pools.tetherPool.length, 4);
        assert.equal(vfx._pools.muzzlePool.length, 8);
        assert.equal(vfx._pools.tracerPool.length, 16);
        assert.equal(vfx._pools.coinPool.length, 112);
    });

    it('triggerSlash activates pooled mesh and recycles cleanly on expiration', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createCombatVFXSystem(THREE, scene);

        const slot = vfx.triggerSlash({ x: 0, y: 1, z: 0 }, 0, { duration: 0.2 });
        assert.ok(slot);
        assert.equal(slot.active, true);
        assert.equal(slot.mesh.visible, true);

        // Advance past duration
        vfx.update(0.25);
        assert.equal(slot.active, false);
        assert.equal(slot.mesh.visible, false);
    });

    it('triggerParryShield activates dome and radiates spark burst particles', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createCombatVFXSystem(THREE, scene);

        vfx.triggerParryShield({ x: 0, y: 1, z: -2 }, { x: 0, y: 0, z: -1 }, { sparkCount: 16 });
        const activeSparks = Array.from(vfx._pools.sparkActive).filter((a) => a === 1).length;
        assert.equal(activeSparks, 16);

        // Step simulation past lifetime
        vfx.update(0.6);
        const expiredSparks = Array.from(vfx._pools.sparkActive).filter((a) => a === 1).length;
        assert.equal(expiredSparks, 0);
    });

    it('spawnArcaneBolt tracks target and triggers onHit callback', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createCombatVFXSystem(THREE, scene);

        let hitTriggered = false;
        const bolt = vfx.spawnArcaneBolt(
            { x: 0, y: 2, z: -20 },
            { x: 0, y: 1, z: 0 },
            (hitPos, reachedTarget) => {
                hitTriggered = true;
                assert.equal(reachedTarget, true);
            }
        );

        assert.ok(bolt);
        assert.equal(bolt.active, true);

        // Step bolt toward target
        for (let i = 0; i < 40; i++) {
            vfx.update(0.05);
            if (!bolt.active) break;
        }

        assert.equal(hitTriggered, true);
        assert.equal(bolt.active, false);
    });

    it('triggerPoliceGunshot triggers muzzle flash and tracer beam with onImpact callback', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createCombatVFXSystem(THREE, scene);

        let impacted = false;
        vfx.triggerPoliceGunshot({ x: 20, y: 2, z: -180 }, { x: 10, y: 1, z: -180 }, (target) => {
            impacted = true;
            assert.equal(target.x, 10);
        });

        // Step tracer flight
        for (let i = 0; i < 15; i++) {
            vfx.update(0.02);
            if (impacted) break;
        }

        assert.equal(impacted, true);
    });

    it('triggerCoinBurst spawns multiple coins and pulls them to nearest player', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createCombatVFXSystem(THREE, scene);

        vfx.triggerCoinBurst({ x: 0, y: 1, z: -50 }, 10);
        const activeCoins = vfx._pools.coinPool.filter((c) => c.active);
        assert.equal(activeCoins.length, 10);

        // Place player near coins to trigger magnetism
        const playerPos = { player1: { x: 0, y: 0.5, z: -50 } };
        for (let i = 0; i < 40; i++) {
            vfx.update(0.05, 0, playerPos);
        }

        const remainingCoins = vfx._pools.coinPool.filter((c) => c.active);
        assert.ok(remainingCoins.length < 10, 'Coins should have been collected by player');
    });

    it('cleanly removes all pooled objects and disposes resources on dispose()', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createCombatVFXSystem(THREE, scene);

        assert.equal(scene.children.length, 1);
        vfx.dispose();
        assert.equal(scene.children.length, 0);
    });
});
