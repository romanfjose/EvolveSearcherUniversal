import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../shared/destructibles.js';
import * as MeshBuilder from '../public/js/world/destructibles-mesh.js';

// Headless mock of Three.js for unit testing destructibles-mesh.js
function createMockThree() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
    }
    class Euler {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    }
    class Color {
        constructor(hex = 0xffffff) { this.hex = hex; }
        setHex(h) { this.hex = h; return this; }
    }
    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.children = [];
            this.visible = true;
            this.userData = {};
        }
        add(...objs) { this.children.push(...objs); }
        remove(obj) {
            const idx = this.children.indexOf(obj);
            if (idx >= 0) this.children.splice(idx, 1);
        }
    }
    class Group extends Object3D {}
    class Mesh extends Object3D {
        constructor(geometry, material) {
            super();
            this.geometry = geometry;
            this.material = material;
        }
    }
    class GeometryMock {
        constructor() {
            this.attributes = {
                position: { count: 8 },
            };
        }
        computeVertexNormals() {}
        rotateX() {}
        dispose() {}
    }
    return {
        Vector3,
        Euler,
        Color,
        Group,
        Mesh,
        BoxGeometry: GeometryMock,
        CylinderGeometry: GeometryMock,
        ConeGeometry: GeometryMock,
        SphereGeometry: GeometryMock,
        DodecahedronGeometry: GeometryMock,
        MeshBasicMaterial: class {
            constructor(params = {}) {
                this.color = new Color(params.color);
            }
        },
        MeshStandardMaterial: class {
            constructor(params = {}) {
                this.color = new Color(params.color);
            }
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Wooden River Barricades Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('destructibles: wooden river barricades', () => {
    test('createBarricade initializes with default properties', () => {
        const b = D.createBarricade('b1', 0, -100);
        assert.equal(b.id, 'b1');
        assert.equal(b.type, 'barricade');
        assert.equal(b.hp, D.DESTRUCTIBLE_CONSTANTS.BARRICADE.DEFAULT_HP);
        assert.equal(b.state, 'intact');
        assert.equal(b.width, D.DESTRUCTIBLE_CONSTANTS.BARRICADE.DEFAULT_WIDTH);
    });

    test('checkBarricadeCollision detects penetration within bounding box', () => {
        const b = D.createBarricade('b1', 0, -100, { width: 10, depth: 2 });
        // Point right at barricade center with radius 1.5
        const res = D.checkBarricadeCollision({ x: 0, z: -100 }, 1.5, b);
        assert.equal(res.collides, true);
        assert.ok(res.penetration > 0);
    });

    test('checkBarricadeCollision rejects point outside bounding range', () => {
        const b = D.createBarricade('b1', 0, -100, { width: 10, depth: 2 });
        const res = D.checkBarricadeCollision({ x: 12, z: -100 }, 1.0, b);
        assert.equal(res.collides, false);
    });

    test('damageBarricade reduces HP and transitions to damaged state', () => {
        const b = D.createBarricade('b1', 0, -100, { hp: 60 });
        const res = D.damageBarricade(b, 35, 'mallet');
        assert.equal(b.hp, 25);
        assert.equal(b.state, 'damaged');
        assert.equal(res.destroyed, false);
        assert.equal(res.debris.length, 0);
    });

    test('damageBarricade shatters barricade and spawns floating wood debris chunks', () => {
        const b = D.createBarricade('b1', 0, -100, { hp: 60 });
        const res = D.damageBarricade(b, 65, 'mallet', { x: 0, y: 0.8, z: -100 }, 20.0);
        assert.equal(b.hp, 0);
        assert.equal(b.state, 'broken');
        assert.equal(b.destroyedBy, 'mallet');
        assert.equal(res.destroyed, true);
        assert.ok(res.debris.length >= D.DESTRUCTIBLE_CONSTANTS.BARRICADE.DEBRIS_COUNT_MIN);
        assert.equal(res.debris[0].type, 'wood_chunk');
    });

    test('broken barricade does not collide or take additional damage', () => {
        const b = D.createBarricade('b1', 0, -100);
        b.state = 'broken';
        const col = D.checkBarricadeCollision({ x: 0, z: -100 }, 2.0, b);
        assert.equal(col.collides, false);

        const dmg = D.damageBarricade(b, 50);
        assert.equal(dmg.destroyed, false);
        assert.equal(dmg.debris.length, 0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Falling Suspension Bridges Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('destructibles: falling suspension bridges', () => {
    test('createSuspensionBridge initializes standing bridge across river', () => {
        const br = D.createSuspensionBridge('bridge1', -250, { width: 30, height: 8.5 });
        assert.equal(br.id, 'bridge1');
        assert.equal(br.state, 'standing');
        assert.equal(br.y, 8.5);
        assert.equal(br.anchorHpLeft, D.DESTRUCTIBLE_CONSTANTS.BRIDGE.ANCHOR_HP);
        assert.equal(br.anchorHpRight, D.DESTRUCTIBLE_CONSTANTS.BRIDGE.ANCHOR_HP);
    });

    test('damageBridgeAnchor weakens single anchor without immediately collapsing', () => {
        const br = D.createSuspensionBridge('bridge1', -250, { anchorHp: 100 });
        const res = D.damageBridgeAnchor(br, 'left', 40);
        assert.equal(br.anchorHpLeft, 60);
        assert.equal(br.anchorHpRight, 100);
        assert.equal(res.collapsed, false);
        assert.equal(br.state, 'standing');
    });

    test('destroying left anchor triggers directional bridge collapse', () => {
        const br = D.createSuspensionBridge('bridge1', -250, { anchorHp: 50 });
        const res = D.damageBridgeAnchor(br, 'left', 60, 'warMallet');
        assert.equal(br.anchorHpLeft, 0);
        assert.equal(res.collapsed, true);
        assert.equal(br.state, 'collapsing');
        assert.equal(br.tiltSide, -1); // tilts left
        assert.equal(br.collapsedBy, 'warMallet');
    });

    test('stepBridgeCollapse accelerates deck downwards toward water surface', () => {
        const br = D.createSuspensionBridge('bridge1', -250, { height: 8.5 });
        br.state = 'collapsing';

        const yInitial = br.y;
        D.stepBridgeCollapse(br, 0.5);
        assert.ok(br.collapseProgress > 0 && br.collapseProgress < 1.0);
        assert.ok(br.y < yInitial, 'bridge should drop toward water');
        assert.ok(Math.abs(br.tiltAngle) > 0, 'bridge should tilt while falling');
    });

    test('completing bridge collapse plunges into river and spawns floating planks', () => {
        const br = D.createSuspensionBridge('bridge1', -250);
        br.state = 'collapsing';

        // Step past total collapse duration
        const res = D.stepBridgeCollapse(br, br.collapseDuration + 0.1);
        assert.equal(res.completed, true);
        assert.equal(br.state, 'collapsed');
        assert.equal(br.y, D.DESTRUCTIBLE_CONSTANTS.DEBRIS.WATER_SURFACE_Y);
        assert.ok(res.splashDebris.length >= D.DESTRUCTIBLE_CONSTANTS.BRIDGE.DEBRIS_COUNT);
        assert.equal(res.splashDebris[0].type, 'bridge_plank');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Canyon Rockslide Hazards Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('destructibles: rockslide hazards', () => {
    test('createRockslideHazard builds dormant cliff boulders on designated side', () => {
        const rs = D.createRockslideHazard('rs1', -350, 'left', { boulderCount: 4 });
        assert.equal(rs.id, 'rs1');
        assert.equal(rs.cliffSide, 'left');
        assert.equal(rs.state, 'ready');
        assert.equal(rs.boulders.length, 4);
        assert.ok(rs.boulders[0].y >= D.DESTRUCTIBLE_CONSTANTS.ROCKSLIDE.CLIFF_HEIGHT);
    });

    test('checkRockslideTrigger activates when craft approaches trigger zone', () => {
        const rs = D.createRockslideHazard('rs1', -350, 'left', { triggerDistanceZ: 30 });
        const craftFar = [{ position: { x: 0, z: -200 } }]; // 150m away
        assert.equal(D.checkRockslideTrigger(rs, craftFar), false);

        const craftNear = [{ position: { x: 0, z: -330 } }]; // 20m away (<30m)
        assert.equal(D.checkRockslideTrigger(rs, craftNear), true);
        assert.equal(rs.state, 'active');
        assert.equal(rs.boulders[0].state, 'rolling');
        assert.ok(rs.boulders[0].vx > 0, 'left cliff boulders roll right (+x)');
    });

    test('checkRockslideTrigger correctly rolls left for right-bank cliff', () => {
        const rs = D.createRockslideHazard('rs2', -350, 'right');
        const craftNear = [{ position: { x: 0, z: -330 } }];
        assert.equal(D.checkRockslideTrigger(rs, craftNear), true);
        assert.ok(rs.boulders[0].vx < 0, 'right cliff boulders roll left (-x)');
    });

    test('stepRockslideBoulders simulates boulder gravity, rolling, and settling in river', () => {
        const rs = D.createRockslideHazard('rs1', -350, 'left');
        D.checkRockslideTrigger(rs, [{ position: { x: 0, z: -330 } }]); // activate

        const initialY = rs.boulders[0].y;
        D.stepRockslideBoulders(rs, 0.2);
        assert.ok(rs.boulders[0].y < initialY, 'boulders descend canyon slope');

        // Fast forward until boulders plunge into river and come to rest
        for (let i = 0; i < 40; i++) {
            D.stepRockslideBoulders(rs, 0.1);
        }
        assert.ok(rs.boulders[0].y <= D.DESTRUCTIBLE_CONSTANTS.DEBRIS.WATER_SURFACE_Y + rs.boulders[0].radius + 0.1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Floating Physics Debris Chunks Simulation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('destructibles: floating physics debris simulation', () => {
    test('spawnDebrisFromDestruction generates debris with impulse trajectory', () => {
        const origin = { x: 2, y: 1.0, z: -150 };
        const debris = D.spawnDebrisFromDestruction({
            type: 'wood_chunk',
            origin,
            count: 6,
            sourceImpulse: 25.0,
            sourceDirection: { x: 0, y: 0.5, z: -1 },
        });

        assert.equal(debris.length, 6);
        for (const d of debris) {
            assert.equal(d.type, 'wood_chunk');
            assert.ok(d.vy > 0, 'debris launched with positive vertical velocity');
            assert.ok(d.vz < 0, 'debris launched downriver with -z velocity');
            assert.equal(d.lifetime, D.DESTRUCTIBLE_CONSTANTS.DEBRIS.DEFAULT_LIFETIME_S);
        }
    });

    test('stepDebrisChunks integrates ballistic trajectory while airborne', () => {
        const d = {
            id: 'd1',
            type: 'wood_chunk',
            x: 0, y: 3.0, z: -100,
            vx: 0, vy: 5.0, vz: -5.0,
            rotation: { x: 0, y: 0, z: 0 },
            rotVelocity: { x: 1, y: 1, z: 1 },
            scale: 1.0,
            lifetime: 10,
            age: 0,
            onWater: false,
            bobOffset: 0,
        };

        const alive = D.stepDebrisChunks([d], 0.1, 0);
        assert.equal(alive.length, 1);
        assert.ok(d.vy < 5.0, 'gravity reduces vertical speed');
        assert.ok(d.z < -100, 'moves downriver');
    });

    test('stepDebrisChunks applies buoyancy and river current drift when floating on water', () => {
        const d = {
            id: 'd2',
            type: 'wood_chunk',
            x: 0, y: D.DESTRUCTIBLE_CONSTANTS.DEBRIS.WATER_SURFACE_Y, z: -100,
            vx: 0, vy: 0, vz: 0,
            rotation: { x: 0, y: 0, z: 0 },
            rotVelocity: { x: 1, y: 1, z: 1 },
            scale: 1.0,
            lifetime: 10,
            age: 1.0,
            onWater: true,
            bobOffset: 0,
        };

        D.stepDebrisChunks([d], 0.5, 1.0);
        assert.equal(d.onWater, true);
        assert.ok(d.vz < 0, 'drifts with downstream river current');
    });

    test('stepDebrisChunks filters out expired debris', () => {
        const d = {
            id: 'd3',
            type: 'stone_chunk',
            x: 0, y: 0.25, z: 0,
            vx: 0, vy: 0, vz: 0,
            rotation: { x: 0, y: 0, z: 0 },
            rotVelocity: { x: 0, y: 0, z: 0 },
            scale: 1.0,
            lifetime: 5.0,
            age: 4.95,
            onWater: true,
            bobOffset: 0,
        };

        const alive = D.stepDebrisChunks([d], 0.1, 5.0);
        assert.equal(alive.length, 0, 'expired debris should be culled');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Heavy Combat & Boss Smash Interactions Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('destructibles: heavy combat smash interactions', () => {
    test('evaluateWarMalletSmash hits and breaks nearby barricades with standard mallet', () => {
        const b = D.createBarricade('b1', 0, -100, { hp: 30 });
        const destructibles = { barricades: [b], bridges: [], rockslides: [] };

        const attacker = { position: { x: 0, y: 0.25, z: -98 }, upgrades: [] };
        const res = D.evaluateWarMalletSmash(attacker, destructibles);

        assert.equal(res.hits.length, 1);
        assert.equal(res.hits[0].targetId, 'b1');
        assert.equal(res.hits[0].damage, D.DESTRUCTIBLE_CONSTANTS.COMBAT.MALLET_BASE_DAMAGE);
        assert.equal(res.hits[0].destroyed, true);
        assert.ok(res.newDebris.length > 0);
    });

    test('evaluateWarMalletSmash with upgraded weapon deals 90 damage', () => {
        const b = D.createBarricade('b1', 0, -100, { hp: 80 });
        const destructibles = { barricades: [b], bridges: [], rockslides: [] };

        const attacker = { position: { x: 0, y: 0.25, z: -98 }, upgrades: ['weapon'] };
        const res = D.evaluateWarMalletSmash(attacker, destructibles);

        assert.equal(res.hits[0].damage, D.DESTRUCTIBLE_CONSTANTS.COMBAT.MALLET_UPGRADED_DAMAGE);
        assert.equal(res.hits[0].destroyed, true);
    });

    test('evaluateWarMalletSmash ignores targets out of reach', () => {
        const b = D.createBarricade('b1', 0, -100);
        const destructibles = { barricades: [b], bridges: [], rockslides: [] };

        const attackerFar = { position: { x: 0, y: 0.25, z: -50 }, upgrades: [] }; // 50m away
        const res = D.evaluateWarMalletSmash(attackerFar, destructibles);

        assert.equal(res.hits.length, 0);
        assert.equal(res.newDebris.length, 0);
    });

    test('evaluateLongWormChargeSmash obliterates barricades instantly with high impulse debris', () => {
        const b = D.createBarricade('b1', 0, -100, { hp: 100 });
        const destructibles = { barricades: [b], bridges: [], rockslides: [] };

        const chargingWorm = {
            id: 'longWorm',
            health: 200,
            state: 'charging',
            position: { x: 0, y: 0.5, z: -100 },
        };

        const res = D.evaluateLongWormChargeSmash(chargingWorm, destructibles);
        assert.equal(res.hits.length, 1);
        assert.equal(res.hits[0].smashedByBoss, true);
        assert.equal(b.state, 'broken');
        assert.equal(b.destroyedBy, 'longWorm');
        assert.ok(res.newDebris.length > 0);
    });

    test('evaluateLongWormChargeSmash does not smash when worm is idle or dead', () => {
        const b = D.createBarricade('b1', 0, -100);
        const destructibles = { barricades: [b], bridges: [], rockslides: [] };

        const idleWorm = { id: 'longWorm', health: 200, state: 'idle', position: { x: 0, y: 0.5, z: -100 } };
        assert.equal(D.evaluateLongWormChargeSmash(idleWorm, destructibles).hits.length, 0);

        const deadWorm = { id: 'longWorm', health: 0, state: 'charging', position: { x: 0, y: 0.5, z: -100 } };
        assert.equal(D.evaluateLongWormChargeSmash(deadWorm, destructibles).hits.length, 0);
    });

    test('evaluateLongWormChargeSmash smashes rolling boulders into stone debris', () => {
        const rs = D.createRockslideHazard('rs1', -200, 'left');
        rs.boulders[0].x = 0;
        rs.boulders[0].z = -200;
        const destructibles = { barricades: [], bridges: [], rockslides: [rs] };

        const chargingWorm = {
            id: 'longWorm',
            health: 200,
            state: 'charging',
            position: { x: 0, y: 0.5, z: -200 },
        };

        const res = D.evaluateLongWormChargeSmash(chargingWorm, destructibles);
        assert.equal(res.hits.length, 1);
        assert.equal(res.hits[0].targetType, 'boulder');
        assert.equal(rs.boulders[0].state, 'shattered');
        assert.equal(res.newDebris[0].type, 'stone_chunk');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Unified Layout Generation & Simulation Step Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('destructibles: unified layout generation and simulation step', () => {
    test('generateDestructiblesLayout is deterministic for a given seed', () => {
        const layoutA = D.generateDestructiblesLayout(1234, -1500, 30);
        const layoutB = D.generateDestructiblesLayout(1234, -1500, 30);
        assert.deepEqual(layoutA, layoutB);
    });

    test('generateDestructiblesLayout populates barricades, bridges, and rockslides', () => {
        const layout = D.generateDestructiblesLayout(777, -1500, 30);
        assert.ok(layout.barricades.length > 0, 'generates barricades');
        assert.ok(layout.bridges.length > 0, 'generates suspension bridges');
        assert.ok(layout.rockslides.length > 0, 'generates rockslide hazards');
    });

    test('stepDestructiblesSimulation triggers rockslides on craft approach and collects events', () => {
        const rs = D.createRockslideHazard('rs_step', -150, 'left', { triggerDistanceZ: 40 });
        const state = {
            barricades: [],
            bridges: [],
            rockslides: [rs],
            debris: [],
        };

        const res = D.stepDestructiblesSimulation(state, [{ position: { x: 0, z: -125 } }], 0.05, 0);
        assert.equal(res.events.length, 1);
        assert.equal(res.events[0].type, 'rockslideTriggered');
        assert.equal(rs.state, 'active');
    });

    test('stepDestructiblesSimulation advances bridge collapse and adds splash debris to state', () => {
        const br = D.createSuspensionBridge('br_step', -200);
        br.state = 'collapsing';
        br.collapseTime = br.collapseDuration - 0.02; // near end

        const state = {
            barricades: [],
            bridges: [br],
            rockslides: [],
            debris: [],
        };

        const res = D.stepDestructiblesSimulation(state, [], 0.05, 1.0);
        assert.ok(res.events.some((e) => e.type === 'bridgeCollapsed'));
        assert.ok(state.debris.length >= D.DESTRUCTIBLE_CONSTANTS.BRIDGE.DEBRIS_COUNT);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Three.js Renderer and Mesh Builder Tests (destructibles-mesh.js)
// ─────────────────────────────────────────────────────────────────────────────

describe('destructibles-mesh: Three.js renderer and animation lifecycle', () => {
    const mockThree = createMockThree();

    test('createBarricadeMesh builds composite group with logs, spikes, and crossbeams', () => {
        const b = D.createBarricade('b1', 0, -100);
        const mesh = MeshBuilder.createBarricadeMesh(mockThree, b);
        assert.equal(mesh.userData.type, 'barricade');
        assert.equal(mesh.userData.logMeshes.length, 7);
        assert.ok(mesh.children.length > 7);
    });

    test('createSuspensionBridgeMesh builds stone anchor towers, rope catenary, and deck', () => {
        const br = D.createSuspensionBridge('br1', -200);
        const mesh = MeshBuilder.createSuspensionBridgeMesh(mockThree, br);
        assert.equal(mesh.userData.type, 'bridge');
        assert.ok(mesh.userData.deckGroup);
        assert.ok(mesh.userData.ropeGroup);
        assert.equal(mesh.userData.plankMeshes.length, 14);
    });

    test('createRockslideMesh creates composite boulders and dust puffs', () => {
        const rs = D.createRockslideHazard('rs1', -300, 'left', { boulderCount: 3 });
        const mesh = MeshBuilder.createRockslideMesh(mockThree, rs);
        assert.equal(mesh.userData.type, 'rockslide');
        assert.equal(mesh.userData.boulderMeshes.length, 3);
    });

    test('createDebrisMeshSystem updates and clears active debris meshes dynamically', () => {
        const debrisSys = MeshBuilder.createDebrisMeshSystem(mockThree);
        const d1 = { id: 'd1', type: 'wood_chunk', x: 0, y: 1, z: -10, rotation: { x: 0, y: 0, z: 0 }, scale: 1.0 };
        const d2 = { id: 'd2', type: 'bridge_plank', x: 2, y: 1, z: -15, rotation: { x: 0, y: 0, z: 0 }, scale: 1.0 };

        debrisSys.updateDebris([d1, d2], 0);
        assert.equal(debrisSys.activeMeshes.size, 2);

        // Cull d1
        debrisSys.updateDebris([d2], 0.1);
        assert.equal(debrisSys.activeMeshes.size, 1);
        assert.ok(debrisSys.activeMeshes.has('d2'));

        debrisSys.clear();
        assert.equal(debrisSys.activeMeshes.size, 0);
    });

    test('buildDestructiblesGroup and animateDestructibles cycle visual states', () => {
        const layout = D.generateDestructiblesLayout(99, -400, 30);
        const handle = MeshBuilder.buildDestructiblesGroup(mockThree, layout);

        assert.ok(handle.rootGroup);
        assert.equal(handle.barricadeMeshes.length, layout.barricades.length);
        assert.equal(handle.bridgeMeshes.length, layout.bridges.length);
        assert.equal(handle.rockslideMeshes.length, layout.rockslides.length);

        // Trigger bridge collapse and test animation sync
        layout.bridges[0].state = 'collapsing';
        layout.bridges[0].y = 4.0;
        layout.bridges[0].tiltAngle = 0.3;

        // Damage first barricade
        layout.barricades[0].state = 'damaged';

        assert.doesNotThrow(() => {
            MeshBuilder.animateDestructibles(handle, layout, 1.2, 0.016);
            MeshBuilder.animateDestructibles(handle, layout, 2.5, 0.016);
        });

        // Break first barricade
        layout.barricades[0].state = 'broken';
        MeshBuilder.animateDestructibles(handle, layout, 3.0, 0.016);
        assert.equal(handle.barricadeMeshes[0].visible, false);
    });
});
