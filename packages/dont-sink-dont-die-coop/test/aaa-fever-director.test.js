import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAAAFeverDirector } from '../public/js/aaa-fever-director.js';

function createMockTHREE() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        clone() { return new Vector3(this.x, this.y, this.z); }
        add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
        sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
        multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
        addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
        distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
        length() { return Math.hypot(this.x, this.y, this.z); }
        normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
        project() { return this; }
    }
    class Quaternion {
        constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
        set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
        copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
        setFromAxisAngle() { return this; }
    }
    class Euler {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    }
    class Color {
        constructor(hex = 0xffffff) { this.hex = hex; this.r = 1; this.g = 1; this.b = 1; }
        setHex(h) { this.hex = h; return this; }
        set(h) { this.hex = h; return this; }
        copy(c) { this.hex = c.hex; return this; }
        lerp() { return this; }
        clone() { return new Color(this.hex); }
    }
    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.scale.setScalar = (s) => { this.scale.set(s, s, s); };
            this.quaternion = new Quaternion();
            this.children = [];
            this.userData = {};
            this.visible = true;
            this.parent = null;
        }
        add(...objs) {
            for (const o of objs) {
                if (o) { o.parent = this; this.children.push(o); }
            }
            return this;
        }
        remove(...objs) {
            for (const o of objs) {
                const idx = this.children.indexOf(o);
                if (idx >= 0) this.children.splice(idx, 1);
            }
            return this;
        }
        lookAt() {}
        traverse(cb) { cb(this); for (const c of this.children) c.traverse?.(cb); }
    }
    class Group extends Object3D {}
    class Scene extends Object3D {}
    class Mesh extends Object3D {
        constructor(geo = {}, mat = {}) {
            super();
            this.geometry = geo;
            this.material = mat;
        }
    }
    class InstancedMesh extends Mesh {
        constructor(geo, mat, count) {
            super(geo, mat);
            this.count = count;
            this.instanceMatrix = { needsUpdate: false };
        }
        setMatrixAt() {}
        setColorAt() {}
    }
    class Points extends Object3D {
        constructor(geo = {}, mat = {}) {
            super();
            this.geometry = geo;
            this.material = mat;
        }
    }
    class Line extends Object3D {
        constructor(geo = {}, mat = {}) {
            super();
            this.geometry = geo;
            this.material = mat;
        }
    }
    class BufferAttribute {
        constructor(array = new Float32Array(96), itemSize = 3) {
            this.array = array;
            this.itemSize = itemSize;
            this.count = Math.floor(array.length / itemSize);
            this.needsUpdate = false;
        }
        setUsage() { return this; }
        getX(i) { return this.array[i * 3] || 0; }
        getY(i) { return this.array[i * 3 + 1] || 0; }
        getZ(i) { return this.array[i * 3 + 2] || 0; }
        setY(i, y) { this.array[i * 3 + 1] = y; }
        setXYZ(i, x, y, z) { this.array[i * 3] = x; this.array[i * 3 + 1] = y; this.array[i * 3 + 2] = z; }
    }
    class BufferGeometry {
        constructor() {
            this.attributes = { position: new BufferAttribute(new Float32Array(96), 3) };
        }
        getAttribute(name) { return this.attributes[name]; }
        setAttribute(name, attr) { this.attributes[name] = attr; return this; }
        setIndex() { return this; }
        setFromPoints() { return this; }
        rotateX() { return this; }
        rotateY() { return this; }
        rotateZ() { return this; }
        translate() { return this; }
        scale() { return this; }
        computeVertexNormals() { return this; }
        dispose() {}
    }
    class Material {
        constructor(opts = {}) { Object.assign(this, opts); this.color = new Color(opts.color ?? 0xffffff); this.emissive = new Color(opts.emissive ?? 0x000000); }
        dispose() {}
        clone() { return new Material(this); }
    }
    class ShaderMaterial extends Material {
        constructor(opts = {}) { super(opts); this.uniforms = opts.uniforms || {}; }
    }
    class Light extends Object3D {
        constructor(color = 0xffffff, intensity = 1) { super(); this.color = new Color(color); this.intensity = intensity; }
    }
    class CatmullRomCurve3 {
        constructor(pts = []) { this.points = pts; }
        getPoints() { return [new Vector3(), new Vector3()]; }
        getPointAt() { return new Vector3(); }
    }
    class Matrix4 {
        compose() { return this; }
        makeRotationFromEuler() { return this; }
        setPosition() { return this; }
    }
    return {
        Vector4: class { constructor(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; } set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } },
        Vector3,
        Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } },
        Quaternion,
        Euler,
        Color,
        Object3D,
        Group,
        Scene,
        Mesh,
        InstancedMesh,
        Points,
        Line,
        BufferAttribute,
        Float32BufferAttribute: BufferAttribute,
        BufferGeometry,
        BoxGeometry: BufferGeometry,
        SphereGeometry: BufferGeometry,
        CylinderGeometry: BufferGeometry,
        ConeGeometry: BufferGeometry,
        PlaneGeometry: BufferGeometry,
        RingGeometry: BufferGeometry,
        TorusGeometry: BufferGeometry,
        OctahedronGeometry: BufferGeometry,
        DodecahedronGeometry: BufferGeometry,
        IcosahedronGeometry: BufferGeometry,
        TetrahedronGeometry: BufferGeometry,
        TubeGeometry: BufferGeometry,
        CapsuleGeometry: BufferGeometry,
        CircleGeometry: BufferGeometry,
        LatheGeometry: BufferGeometry,
        ExtrudeGeometry: BufferGeometry,
        Shape: class { moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {} },
        CatmullRomCurve3,
        Matrix4,
        MeshStandardMaterial: Material,
        MeshBasicMaterial: Material,
        MeshPhongMaterial: Material,
        MeshLambertMaterial: Material,
        MeshPhysicalMaterial: Material,
        PointsMaterial: Material,
        LineBasicMaterial: Material,
        SpriteMaterial: Material,
        ShaderMaterial,
        Sprite: Object3D,
        AmbientLight: Light,
        DirectionalLight: Light,
        PointLight: Light,
        SpotLight: Light,
        HemisphereLight: Light,
        FogExp2: class { constructor(color, density) { this.color = new Color(color); this.density = density; } },
        PerspectiveCamera: class extends Object3D { constructor(fov = 75) { super(); this.fov = fov; } updateProjectionMatrix() {} },
        DoubleSide: 2,
        FrontSide: 0,
        BackSide: 1,
        AdditiveBlending: 2,
        NormalBlending: 1,
        DynamicDrawUsage: 35048,
        MathUtils: {
            clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
            lerp: (a, b, t) => a + (b - a) * t,
            degToRad: (d) => (d * Math.PI) / 180,
        },
    };
}

describe('AAA Fever-Dream Unified Game Director integration suite', () => {
    it('initializes all 25 Wave 1 & Wave 2 systems and steps 60Hz + frame loop cleanly', () => {
        const THREE = createMockTHREE();
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x1a2436, 0.005);
        const camera = new THREE.PerspectiveCamera(75);
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        const riverShaderMat = {
            uniforms: {
                uDeepColor: { value: new THREE.Color(0x0a2540) },
                uShallowColor: { value: new THREE.Color(0x1ca3ec) },
            },
        };

        const raftGroup = new THREE.Group();
        const raftTilt = new THREE.Group();
        const raftHull = new THREE.Group();
        const headGroup = new THREE.Group();
        raftGroup.add(raftTilt);
        raftTilt.add(raftHull);

        const myRaft = {
            vis: {
                group: raftGroup,
                tilt: raftTilt,
                raft: raftHull,
                rig: { headGroup },
                anim: { airborne: false, yaw: 0, speed: 10 },
            },
            craft: {
                position: new THREE.Vector3(0, 0.5, -120),
                velocity: new THREE.Vector3(0, 0, -12),
                angularVelocity: { x: 0, y: 0.1, z: 0 },
                yaw: 0,
                quaternion: new THREE.Quaternion(),
            },
        };

        const myStats = { coins: 150, upgrades: ['weapon'] };
        let coinsGranted = 0;

        const director = createAAAFeverDirector({
            THREE,
            scene,
            camera,
            renderer: { domElement: null },
            ambientLight,
            directionalLight,
            riverShaderMat,
            obstacles: [{ type: 'plank', x: 2, z: -125, halfW: 2, halfD: 2, topY: 1.5 }],
            socket: { id: 'test-player', emit() {} },
            hud: { toast() {}, setStats() {}, setHealth() {} },
            sfx: { hit() {}, kill() {}, wave() {}, upgrade() {}, splash() {} },
            splash() {},
            popAt() {},
            getMyRaft: () => myRaft,
            getOtherPlayers: () => ({}),
            getEnemiesData: () => ({
                whiteGuy: { id: 'whiteGuy', type: 'whiteGuy', health: 80, position: { x: 1, y: 1, z: -123 } },
                mudAlien: { id: 'mudAlien', type: 'mudAlien', health: 100, position: { x: -3, y: 1, z: -130 } },
                longWorm: { id: 'longWorm', type: 'longWorm', health: 200, state: 'charging', position: { x: 0, y: 0.5, z: -140 } },
            }),
            enemyMeshes: {
                whiteGuy: new THREE.Group(),
                mudAlien: new THREE.Group(),
                longWorm: new THREE.Group(),
            },
            getMyStats: () => myStats,
            getIsDead: () => false,
            onGrantCoins: (d) => { coinsGranted += d; myStats.coins += d; },
            onHealPlayer: () => {},
        });

        assert.ok(director, 'director should be created');

        // Step 60Hz physics and per-frame visual update across all 4 acts
        for (const z of [-100, -450, -850, -1390]) {
            myRaft.craft.position.z = z;
            director.fixedStep(1 / 60, 1000);
            director.update(1 / 60, 1.0, 1000);
        }

        // Trigger player attack (VFX + destructibles + Kraken check)
        director.onPlayerAttack();

        // Trigger Perfect Parry
        director.onBlockPressed(2000);
        const parryRes = director.resolvePlayerHit(25, 'whiteGuy', 2050);
        assert.equal(parryRes.parried, true, 'should trigger Perfect Parry within 180ms window');
        assert.equal(parryRes.finalDamage, 0, 'Perfect Parry negates incoming damage');
        assert.ok(coinsGranted >= 15, 'Perfect Parry rewards bonus coins');

        // Trigger Checkpoint Tarot Draft and Victory Awards
        director.onCheckpointCrossed(-300, 0);
        director.onGameWon();
    });
});
