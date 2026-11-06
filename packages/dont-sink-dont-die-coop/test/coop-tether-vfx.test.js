import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    createCoopTetherVfx,
    updateCoopTetherVfx,
    COOP_TETHER_CONFIG,
    evaluateTetherBand,
    computeCatenaryPoint,
    getDistance3D,
    clamp,
    lerp,
    normalizeCrewPlayers,
    extractPosition,
} from '../public/js/vfx/coop-tether-vfx.js';

// ─── Lightweight Mock Three.js Factory for Headless Node Environment ────────
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
            this.disposed = false;
        }
        setAttribute(name, attr) {
            this.attributes[name] = attr;
            return this;
        }
        rotateX() { return this; }
        dispose() { this.disposed = true; }
    }

    class RingGeometry extends BufferGeometry {
        constructor(...args) {
            super();
            this.args = args;
        }
    }

    class Material {
        constructor(opts = {}) {
            this.color = opts.color ? new Color(opts.color) : new Color(0xffffff);
            this.opacity = opts.opacity ?? 1.0;
            this.transparent = opts.transparent ?? false;
            this.side = opts.side ?? 0;
            this.depthWrite = opts.depthWrite ?? true;
            this.disposed = false;
        }
        dispose() { this.disposed = true; }
    }

    class MeshBasicMaterial extends Material {}
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
        Float32BufferAttribute: BufferAttribute,
        BufferGeometry,
        RingGeometry,
        Material,
        MeshBasicMaterial,
        LineBasicMaterial,
        Group,
        Mesh,
        Line,
        DoubleSide: 2,
        DynamicDrawUsage: 35048,
    };
}

describe('3D Co-Op Teammate Tether, Cohesion Aura & Directional Beacon VFX', () => {

    describe('Constants and Mathematical Helpers', () => {
        it('exports required distance thresholds and color definitions', () => {
            assert.equal(COOP_TETHER_CONFIG.COHESION_DISTANCE, 22.0);
            assert.equal(COOP_TETHER_CONFIG.WARNING_MIN_DISTANCE, 25.0);
            assert.equal(COOP_TETHER_CONFIG.WARNING_MAX_DISTANCE, 45.0);
            assert.equal(COOP_TETHER_CONFIG.BEACON_MIN_DISTANCE, 25.0);

            assert.equal(COOP_TETHER_CONFIG.COLORS.GOLDEN_TETHER, 0xffd700);
            assert.equal(COOP_TETHER_CONFIG.COLORS.AMBER_WARNING, 0xf59e0b);
            assert.ok(COOP_TETHER_CONFIG.COLORS.COHESION_AURA);
            assert.ok(COOP_TETHER_CONFIG.COLORS.BEACON_CHEVRON);
        });

        it('clamp and lerp handle boundaries safely', () => {
            assert.equal(clamp(5, 0, 10), 5);
            assert.equal(clamp(-1, 0, 10), 0);
            assert.equal(clamp(15, 0, 10), 10);
            assert.equal(clamp(NaN, 0, 10), 0);

            assert.equal(lerp(10, 20, 0), 10);
            assert.equal(lerp(10, 20, 1), 20);
            assert.equal(lerp(10, 20, 0.5), 15);
        });

        it('getDistance3D calculates correct Euclidean distances', () => {
            const p1 = { x: 0, y: 0, z: 0 };
            const p2 = { x: 3, y: 0, z: 4 };
            const { dx, dy, dz, distHoriz, distTotal } = getDistance3D(p1, p2);

            assert.equal(dx, 3);
            assert.equal(dy, 0);
            assert.equal(dz, 4);
            assert.equal(distHoriz, 5);
            assert.equal(distTotal, 5);
        });

        it('evaluateTetherBand categorizes distances into cohesion, transition, warning, and separated bands', () => {
            // Close Cohesion <= 22m: golden hawser and teamwork aura active
            const close = evaluateTetherBand(15.0);
            assert.equal(close.state, 'cohesion');
            assert.equal(close.isAuraActive, true);
            assert.equal(close.isWarning, false);
            assert.equal(close.isBeaconActive, false);
            assert.equal(close.colorHex, COOP_TETHER_CONFIG.COLORS.GOLDEN_TETHER);

            // Transition buffer (22m - 25m)
            const trans = evaluateTetherBand(23.5);
            assert.equal(trans.state, 'transition');
            assert.equal(trans.isAuraActive, false);
            assert.equal(trans.isWarning, false);

            // Warning band (25m - 45m): amber tension and directional beacon active
            const warn = evaluateTetherBand(32.0);
            assert.equal(warn.state, 'warning');
            assert.equal(warn.isAuraActive, false);
            assert.equal(warn.isWarning, true);
            assert.equal(warn.isBeaconActive, true);
            assert.equal(warn.colorHex, COOP_TETHER_CONFIG.COLORS.AMBER_WARNING);

            // Critical warning near snap (42m)
            const crit = evaluateTetherBand(42.0);
            assert.equal(crit.state, 'warning');
            assert.equal(crit.colorHex, COOP_TETHER_CONFIG.COLORS.AMBER_CRITICAL);

            // Separated > 45m: line snaps, edge-of-view beacon remains active
            const sep = evaluateTetherBand(55.0);
            assert.equal(sep.state, 'separated');
            assert.equal(sep.isAuraActive, false);
            assert.equal(sep.isWarning, false);
            assert.equal(sep.isBeaconActive, true);
        });

        it('computeCatenaryPoint computes smooth parabolic sag and energy waves', () => {
            const p1 = { x: 0, y: 0.25, z: 0 };
            const p2 = { x: 10, y: 0.25, z: 0 };

            const mid = computeCatenaryPoint(p1, p2, 0.5, 10, 0, 'cohesion');
            assert.ok(Math.abs(mid.x - 5.0) < 1e-4);
            assert.ok(mid.y < 0.7, 'Midpoint should sag lower due to catenary gravity');

            const start = computeCatenaryPoint(p1, p2, 0.0, 10, 0, 'cohesion');
            assert.ok(Math.abs(start.x - 0.0) < 1e-4);

            const end = computeCatenaryPoint(p1, p2, 1.0, 10, 0, 'cohesion');
            assert.ok(Math.abs(end.x - 10.0) < 1e-4);
        });

        it('normalizeCrewPlayers handles arrays, maps, and objects gracefully', () => {
            assert.deepEqual(normalizeCrewPlayers(null), []);
            assert.deepEqual(normalizeCrewPlayers([1, 2]), [1, 2]);
            assert.deepEqual(normalizeCrewPlayers({ a: { name: 'A' }, b: { name: 'B' } }), [{ name: 'A' }, { name: 'B' }]);
        });

        it('extractPosition safely extracts positions from diverse player formats', () => {
            assert.equal(extractPosition(null), null);
            assert.deepEqual(extractPosition({ x: 5, z: -10 }), { x: 5, y: 0.25, z: -10 });
            assert.deepEqual(extractPosition({ position: { x: 3, y: 1.5, z: -40 } }), { x: 3, y: 1.5, z: -40 });
        });
    });

    describe('System Creation, Pooling & Lifecycle', () => {
        it('throws when THREE instance is not provided', () => {
            assert.throws(() => createCoopTetherVfx(null));
        });

        it('initializes pools, groups, and attaches controller interface', () => {
            const THREE = createMockThree();
            const vfxGroup = createCoopTetherVfx(THREE);

            assert.ok(vfxGroup, 'vfxGroup must be returned');
            assert.equal(vfxGroup.name, 'CoopTetherVfx_Root');
            assert.ok(vfxGroup._pools, 'Internal pools must be exposed');

            const { tetherPool, auraPool, beaconPool } = vfxGroup._pools;
            assert.equal(tetherPool.length, 8, '8 pooled tether lines');
            assert.equal(auraPool.length, 9, '9 pooled aura rings (8 mates + 1 local)');
            assert.equal(beaconPool.length, 8, '8 pooled compass beacons');

            // All meshes should start invisible
            assert.ok(tetherPool.every((t) => !t.line.visible));
            assert.ok(auraPool.every((a) => !a.mesh.visible));
            assert.ok(beaconPool.every((b) => !b.group.visible));
        });

        it('cleanly disposes all geometries and materials on dispose()', () => {
            const THREE = createMockThree();
            const vfxGroup = createCoopTetherVfx(THREE);

            const { tetherPool, auraPool, beaconPool } = vfxGroup._pools;
            const tGeo = tetherPool[0].geo;
            const aGeo = auraPool[0].geo;

            vfxGroup.dispose();

            assert.equal(tGeo.disposed, true);
            assert.equal(aGeo.disposed, true);
            assert.equal(vfxGroup._pools.tetherPool.length, 0);
            assert.equal(vfxGroup._pools.auraPool.length, 0);
            assert.equal(vfxGroup._pools.beaconPool.length, 0);
        });
    });

    describe('Runtime Simulation & Proximity Band Reactions', () => {
        it('renders glowing golden nautical tow-line and cohesion water aura when within <= 22m', () => {
            const THREE = createMockThree();
            const vfxGroup = createCoopTetherVfx(THREE);

            const localPlayer = { id: 'p_local', position: { x: 0, y: 0.25, z: -100 } };
            const crewPlayers = [
                { id: 'p_mate1', position: { x: 8, y: 0.25, z: -110 } }, // Distance ~12.8m <= 22m
            ];

            updateCoopTetherVfx(vfxGroup, { localPlayer, crewPlayers, time: 1.0 });

            const { tetherPool, auraPool, beaconPool } = vfxGroup._pools;

            // 1. Tow-line should be active with golden hawser color
            const activeTethers = tetherPool.filter((t) => t.active && t.line.visible);
            assert.equal(activeTethers.length, 1, '1 tether active');
            assert.equal(activeTethers[0].state, 'cohesion');
            assert.equal(activeTethers[0].mat.color.hex, COOP_TETHER_CONFIG.COLORS.GOLDEN_TETHER);
            assert.ok(activeTethers[0].mat.opacity > 0.7);

            // 2. Both teammate and local player should have active cohesion aura rings
            const activeAuras = auraPool.filter((a) => a.active && a.mesh.visible);
            assert.equal(activeAuras.length, 2, '2 cohesion aura rings active (mate + local)');
            assert.equal(activeAuras[0].targetId, 'p_mate1');
            assert.equal(activeAuras[1].targetId, 'p_local');

            // 3. Directional compass beacon should NOT be active for close teammates
            const activeBeacons = beaconPool.filter((b) => b.active && b.group.visible);
            assert.equal(activeBeacons.length, 0, 'No beacon for close cohesion teammates');
        });

        it('activates pulsing amber warning line when teammate drifts between 25m and 45m', () => {
            const THREE = createMockThree();
            const vfxGroup = createCoopTetherVfx(THREE);

            const localPlayer = { id: 'p_local', x: 0, z: -100 };
            const crewPlayers = [
                { id: 'p_mate1', x: 0, z: -135 }, // 35m away (warning zone)
            ];

            updateCoopTetherVfx(vfxGroup, { localPlayer, crewPlayers, time: 2.5 });

            const { tetherPool, auraPool, beaconPool } = vfxGroup._pools;

            // Tether line should be active in 'warning' state with amber color
            const activeTethers = tetherPool.filter((t) => t.active && t.line.visible);
            assert.equal(activeTethers.length, 1);
            assert.equal(activeTethers[0].state, 'warning');
            assert.equal(activeTethers[0].mat.color.hex, COOP_TETHER_CONFIG.COLORS.AMBER_WARNING);

            // Cohesion aura should be deactivated because distance > 22m
            const activeAuras = auraPool.filter((a) => a.active && a.mesh.visible);
            assert.equal(activeAuras.length, 0, 'Cohesion aura should not be active in warning zone');

            // Directional compass chevron should be active pointing towards the drifting teammate
            const activeBeacons = beaconPool.filter((b) => b.active && b.group.visible);
            assert.equal(activeBeacons.length, 1, 'Compass beacon must activate for drifting teammate');
            assert.equal(activeBeacons[0].teammateId, 'p_mate1');

            // Compass position should be on orbit around local player
            const beaconPos = activeBeacons[0].group.position;
            const distFromLocal = Math.hypot(beaconPos.x - localPlayer.x, beaconPos.z - localPlayer.z);
            assert.ok(Math.abs(distFromLocal - COOP_TETHER_CONFIG.BEACON_ORBIT_RADIUS) < 0.1);
        });

        it('orients 3D edge-of-view directional beacon toward separated teammate (> 45m)', () => {
            const THREE = createMockThree();
            const vfxGroup = createCoopTetherVfx(THREE);

            const localPlayer = { id: 'p_local', x: 0, z: -100 };
            // Teammate separated far downriver along -Z (dz = -60m)
            const crewPlayers = [
                { id: 'p_lost_mate', x: 0, z: -160 },
            ];

            updateCoopTetherVfx(vfxGroup, { localPlayer, crewPlayers, time: 3.0 });

            const { tetherPool, auraPool, beaconPool } = vfxGroup._pools;

            // Hawser line snaps/disappears beyond 45m
            const activeTethers = tetherPool.filter((t) => t.active && t.line.visible);
            assert.equal(activeTethers.length, 0, 'Tow-line should snap/hide beyond 45m');

            // Compass beacon remains vividly active
            const activeBeacons = beaconPool.filter((b) => b.active && b.group.visible);
            assert.equal(activeBeacons.length, 1);
            assert.equal(activeBeacons[0].teammateId, 'p_lost_mate');

            // Bearing pointing downriver (-Z): dx = 0, dz = -60 -> angle = Math.atan2(0, -60) = Math.PI
            const expectedBearing = Math.atan2(0, -60);
            assert.ok(Math.abs(activeBeacons[0].bearingRad - expectedBearing) < 1e-4);

            // Orbit positioning
            const beaconPos = activeBeacons[0].group.position;
            assert.ok(Math.abs(beaconPos.x - 0) < 1e-4);
            assert.ok(beaconPos.z < localPlayer.z, 'Beacon should be positioned downriver (-Z)');
        });

        it('filters out dead teammates and self-references cleanly', () => {
            const THREE = createMockThree();
            const vfxGroup = createCoopTetherVfx(THREE);

            const localPlayer = { id: 'p_local', x: 0, z: 0 };
            const crewPlayers = [
                { id: 'p_local', x: 0, z: 0 },                  // Self
                { id: 'p_dead1', x: 10, z: 0, isDead: true },   // Dead flag
                { id: 'p_dead2', x: 0, z: 10, health: 0 },      // 0 health
                { id: 'p_alive', x: 10, z: 5, health: 100 },    // Valid alive mate
            ];

            updateCoopTetherVfx(vfxGroup, { localPlayer, crewPlayers, time: 0 });

            const { tetherPool } = vfxGroup._pools;
            const activeTethers = tetherPool.filter((t) => t.active && t.line.visible);
            assert.equal(activeTethers.length, 1, 'Only the alive teammate should be tethered');
            assert.equal(activeTethers[0].teammateId, 'p_alive');
        });

        it('hides all elements when local player is missing or dead', () => {
            const THREE = createMockThree();
            const vfxGroup = createCoopTetherVfx(THREE);

            // First active
            updateCoopTetherVfx(vfxGroup, {
                localPlayer: { id: 'p_local', x: 0, z: 0 },
                crewPlayers: [{ id: 'p_mate', x: 10, z: 0 }],
            });
            assert.equal(vfxGroup._pools.tetherPool.filter((t) => t.line.visible).length, 1);

            // Local player becomes null/missing
            updateCoopTetherVfx(vfxGroup, { localPlayer: null });

            assert.equal(vfxGroup._pools.tetherPool.every((t) => !t.line.visible), true);
            assert.equal(vfxGroup._pools.auraPool.every((a) => !a.mesh.visible), true);
            assert.equal(vfxGroup._pools.beaconPool.every((b) => !b.group.visible), true);
        });
    });
});
