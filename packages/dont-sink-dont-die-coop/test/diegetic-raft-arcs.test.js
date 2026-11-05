import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ARC_COLORS,
    ARC_CONFIG,
    clamp,
    lerp,
    getHealthColorHex,
    computeArcOpacity,
    buildArcGeometry,
    createArcMaterial,
    createDiegeticRaftArcs,
} from '../public/js/ui/diegetic-raft-arcs.js';

// ─── Lightweight Mock Three.js Factory for Headless Unit Tests ───────────────
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

    class BufferAttribute {
        constructor(array, itemSize) {
            this.array = array;
            this.itemSize = itemSize;
        }
    }

    class BufferGeometry {
        constructor() {
            this.attributes = {};
            this.index = null;
            this.disposed = false;
        }
        setAttribute(name, attr) {
            this.attributes[name] = attr;
            return this;
        }
        setIndex(indices) {
            this.index = indices;
            return this;
        }
        rotateX() {
            return this;
        }
        dispose() {
            this.disposed = true;
        }
    }

    class RingGeometry extends BufferGeometry {
        constructor(innerRadius, outerRadius, thetaSegments, phiSegments, thetaStart, thetaLength) {
            super();
            this.parameters = { innerRadius, outerRadius, thetaSegments, phiSegments, thetaStart, thetaLength };
        }
    }

    class Material {
        constructor(opts = {}) {
            this.color = {
                hex: opts.color ?? 0xffffff,
                setHex(h) { this.hex = h; },
            };
            this.opacity = opts.opacity ?? 1.0;
            this.transparent = opts.transparent ?? false;
            this.depthWrite = opts.depthWrite ?? true;
            this.side = opts.side ?? 0;
            this.disposed = false;
        }
        dispose() {
            this.disposed = true;
        }
    }

    class MeshBasicMaterial extends Material {}

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.visible = true;
            this.children = [];
            this.parent = null;
            this.name = '';
        }
        add(child) {
            this.children.push(child);
            child.parent = this;
            return this;
        }
        remove(child) {
            const idx = this.children.indexOf(child);
            if (idx !== -1) {
                this.children.splice(idx, 1);
                child.parent = null;
            }
            return this;
        }
    }

    class Mesh extends Object3D {
        constructor(geometry, material) {
            super();
            this.geometry = geometry;
            this.material = material;
        }
    }

    class Group extends Object3D {}

    class Scene extends Object3D {}

    return {
        Vector3,
        Euler,
        BufferAttribute,
        BufferGeometry,
        RingGeometry,
        MeshBasicMaterial,
        Mesh,
        Group,
        Scene,
        DoubleSide: 2,
    };
}

// ─── TEST SUITES ─────────────────────────────────────────────────────────────

describe('Diegetic 3D Raft Health & Stamina Arc Rings — Pure Math Helpers', () => {
    it('clamp restricts value within bounds', () => {
        assert.equal(clamp(-0.5, 0, 1), 0);
        assert.equal(clamp(1.5, 0, 1), 1);
        assert.equal(clamp(0.42, 0, 1), 0.42);
    });

    it('lerp interpolates cleanly', () => {
        assert.equal(lerp(10, 20, 0), 10);
        assert.equal(lerp(10, 20, 1), 20);
        assert.equal(lerp(10, 20, 0.5), 15);
    });

    it('getHealthColorHex transitions smoothly emerald -> amber -> crimson', () => {
        // Full health (1.0) -> emerald #10b981
        const fullColor = getHealthColorHex(1.0);
        assert.equal(fullColor, ARC_COLORS.HULL_EMERALD);

        // Half health (0.5) -> amber #f59e0b
        const midColor = getHealthColorHex(0.5);
        assert.equal(midColor, ARC_COLORS.HULL_AMBER);

        // Zero health (0.0) -> crimson #ef4444
        const deadColor = getHealthColorHex(0.0);
        assert.equal(deadColor, ARC_COLORS.HULL_CRIMSON);

        // High health (0.75) is between emerald and amber
        const highColor = getHealthColorHex(0.75);
        const rComp = (highColor >> 16) & 0xff;
        const gComp = (highColor >> 8) & 0xff;
        assert.ok(rComp > 0x10 && rComp < 0xf5, 'Red component is interpolated');
        assert.ok(gComp > 0x9e && gComp < 0xb9, 'Green component is interpolated');

        // Low health (0.25) is between crimson and amber
        const lowColor = getHealthColorHex(0.25);
        const rCompLow = (lowColor >> 16) & 0xff;
        const gCompLow = (lowColor >> 8) & 0xff;
        assert.ok(rCompLow >= 0xef, 'Red component remains high near danger');
        assert.ok(gCompLow > 0x44 && gCompLow < 0x9e, 'Green component is interpolated in danger band');
    });

    it('computeArcOpacity auto-fades to 25% (0.25) when nominal, and scales up under damage/stunts', () => {
        // Nominal state: 100% HP, 100% stamina, no pulses
        const nominal = computeArcOpacity({
            healthRatio: 1.0,
            staminaRatio: 1.0,
            damagePulseTimer: 0,
            stuntPulseTimer: 0,
            isAirborne: false,
        });
        assert.equal(nominal, 0.25, 'Auto-fades to exactly 25% opacity when full/nominal');

        // Damaged state: health dropped to 40%
        const damaged = computeArcOpacity({
            healthRatio: 0.4,
            staminaRatio: 1.0,
            damagePulseTimer: 0,
            stuntPulseTimer: 0,
            isAirborne: false,
        });
        assert.ok(damaged > 0.5, 'Damaged craft maintains higher opacity for pilot awareness');

        // Damage pulse: immediate hit
        const damagePulsing = computeArcOpacity({
            healthRatio: 1.0,
            staminaRatio: 1.0,
            damagePulseTimer: 0.9,
            stuntPulseTimer: 0,
            isAirborne: false,
        });
        assert.ok(damagePulsing >= 0.88, 'Taking damage triggers bright pulse (>0.88)');

        // Stunt pulse: charging stunt / kickflip
        const stuntPulsing = computeArcOpacity({
            healthRatio: 1.0,
            staminaRatio: 0.8,
            damagePulseTimer: 0,
            stuntPulseTimer: 0.8,
            isAirborne: true,
        });
        assert.ok(stuntPulsing >= 0.75, 'Charging stunt triggers bright cyan pulse');
    });
});

describe('Diegetic 3D Raft Health & Stamina Arc Rings — Component Architecture & Lifecycle', () => {
    it('initializes cleanly, adds rootGroup to scene, and builds meshes', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();

        const arcs = createDiegeticRaftArcs(THREE, scene);
        assert.ok(arcs.rootGroup, 'rootGroup exists');
        assert.equal(arcs.rootGroup.name, 'DiegeticRaftArcs_Root');
        assert.ok(scene.children.includes(arcs.rootGroup), 'rootGroup is added to scene');

        assert.ok(arcs.healthFillMesh, 'health fill mesh created');
        assert.ok(arcs.staminaFillMesh, 'stamina fill mesh created');
        assert.ok(arcs.healthBackMesh, 'health backplate mesh created');
        assert.ok(arcs.staminaBackMesh, 'stamina backplate mesh created');

        assert.equal(arcs.currentHealth, 100);
        assert.equal(arcs.maxHealth, 100);
        assert.equal(arcs.currentStamina, 1.0);
        assert.equal(arcs.visible, true);
    });

    it('anchors on water surface just behind the raft according to raft heading/position', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();

        const arcs = createDiegeticRaftArcs(THREE, scene, {
            waterLevel: 0.25,
            offsetBehind: 2.5,
            yOffset: 0.1,
        });

        // Raft at origin facing downriver (yaw = 0)
        arcs.update(0.016, {
            position: { x: 5, y: 0.25, z: -100 },
            yaw: 0,
            health: 100,
            maxHealth: 100,
            stamina: 1.0,
        });

        // Behind raft is +Z when yaw=0: posX=5, posZ = -100 + 2.5 = -97.5
        assert.equal(arcs.rootGroup.position.x, 5);
        assert.ok(Math.abs(arcs.rootGroup.position.y - 0.35) < 0.001); // 0.25 + 0.1
        assert.equal(arcs.rootGroup.position.z, -97.5);
        assert.equal(arcs.rootGroup.rotation.y, 0);

        // Raft rotated 90 degrees (Math.PI / 2)
        arcs.update(0.016, {
            position: { x: 0, y: 0.25, z: -200 },
            yaw: Math.PI / 2,
        });
        // Stern offset X: sin(PI/2)*2.5 = 2.5, Z: cos(PI/2)*2.5 = 0
        assert.ok(Math.abs(arcs.rootGroup.position.x - 2.5) < 0.001);
        assert.ok(Math.abs(arcs.rootGroup.position.z - (-200)) < 0.001);
        assert.ok(Math.abs(arcs.rootGroup.rotation.y - Math.PI / 2) < 0.001);
    });

    it('updates health color and scales down as hull is damaged', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const arcs = createDiegeticRaftArcs(THREE, scene);

        // Healthy state
        arcs.update(0.016, { health: 100, maxHealth: 100 });
        assert.equal(arcs.healthFillMat.color.hex, ARC_COLORS.HULL_EMERALD);
        assert.equal(arcs.healthFillMesh.scale.x, 1);

        // Drop health to 50%
        arcs.update(0.016, { health: 50, maxHealth: 100 });
        assert.equal(arcs.healthFillMat.color.hex, ARC_COLORS.HULL_AMBER);
        assert.equal(arcs.healthFillMesh.scale.x, 0.5);

        // Critical health 10%
        arcs.update(0.016, { health: 10, maxHealth: 100 });
        const criticalColor = arcs.healthFillMat.color.hex;
        const rComp = (criticalColor >> 16) & 0xff;
        const gComp = (criticalColor >> 8) & 0xff;
        assert.ok(rComp > 0xed, 'Critical health has high red');
        assert.ok(gComp < 0x60, 'Critical health has low green');
        assert.equal(arcs.healthFillMesh.scale.x, 0.1);
    });

    it('pulses brightly on takingDamage or chargingStunt, and decays smoothly', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const arcs = createDiegeticRaftArcs(THREE, scene);

        // Step a few frames to settle nominal opacity
        for (let i = 0; i < 20; i++) {
            arcs.update(0.05, { health: 100, maxHealth: 100, stamina: 1.0 });
        }
        assert.ok(arcs.currentOpacity < 0.35, 'Settles towards nominal ~0.25 opacity');

        // Taking damage triggers pulse
        arcs.update(0.016, { takingDamage: true });
        assert.ok(arcs.currentOpacity > 0.35, 'Begins pulsing brightly on damage');

        // Charging stunt
        arcs.update(0.016, { chargingStunt: true, jumpReadiness: 0.7 });
        assert.equal(arcs.staminaFillMat.color.hex, ARC_COLORS.STAMINA_CHARGING);

        // Direct pulse calls
        arcs.triggerDamagePulse(0.5);
        arcs.triggerStuntPulse(0.5);
        arcs.update(0.016);
        assert.ok(arcs.currentOpacity > 0.4);
    });

    it('toggle setVisible and disposes all resources cleanly', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const arcs = createDiegeticRaftArcs(THREE, scene);

        arcs.setVisible(false);
        assert.equal(arcs.visible, false);
        arcs.update(0.016);
        assert.equal(arcs.rootGroup.visible, false);

        arcs.setVisible(true);
        assert.equal(arcs.visible, true);
        arcs.update(0.016);
        assert.equal(arcs.rootGroup.visible, true);

        // Disposal
        arcs.dispose();
        assert.equal(scene.children.includes(arcs.rootGroup), false, 'rootGroup removed from scene');
        assert.equal(arcs.rootGroup.children.length, 0, 'all child meshes unhooked');
    });

    it('buildArcGeometry creates valid fallback BufferGeometry if RingGeometry is not defined', () => {
        const THREE_NO_RING = {
            BufferGeometry: class {
                constructor() { this.attributes = {}; this.index = null; }
                setAttribute(n, a) { this.attributes[n] = a; }
                setIndex(i) { this.index = i; }
            },
            BufferAttribute: class {
                constructor(a, s) { this.array = a; this.itemSize = s; }
            },
        };

        const geo = buildArcGeometry(THREE_NO_RING, 1.5, 2.0, Math.PI, 0, 16);
        assert.ok(geo.attributes.position, 'positions set');
        assert.ok(geo.index, 'indices set');
        assert.equal(geo.attributes.position.array.length, (16 + 1) * 2 * 3);
    });

    it('guarantees zero NaN values on transforms and matrices', () => {
        const THREE = createMockThree();
        const scene = new THREE.Scene();
        const arcs = createDiegeticRaftArcs(THREE, scene);

        // Feed edge cases like undefined or zero
        arcs.update(0.016, {
            position: { x: NaN, y: NaN, z: NaN },
            yaw: NaN,
            health: NaN,
            maxHealth: NaN,
            stamina: NaN,
        });

        assert.ok(Number.isFinite(arcs.rootGroup.position.x));
        assert.ok(Number.isFinite(arcs.rootGroup.position.y));
        assert.ok(Number.isFinite(arcs.rootGroup.position.z));
        assert.ok(Number.isFinite(arcs.rootGroup.rotation.y));
        assert.ok(Number.isFinite(arcs.healthFillMesh.scale.x));
        assert.ok(Number.isFinite(arcs.staminaFillMesh.scale.x));
    });
});
