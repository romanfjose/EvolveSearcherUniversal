import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../shared/river-hazards.js';
import * as MeshBuilder from '../public/js/world/hazards-mesh.js';

// Headless mock of Three.js for unit testing hazards-mesh.js
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
                position: {
                    count: 8,
                    getX: () => 1,
                    getY: () => 0,
                    getZ: () => 1,
                    setX: () => {},
                    setY: () => {},
                    setZ: () => {},
                },
            };
        }
        computeVertexNormals() {}
        rotateX() {}
    }
    return {
        Vector3,
        Euler,
        Color,
        Group,
        Mesh,
        PlaneGeometry: GeometryMock,
        CylinderGeometry: GeometryMock,
        BoxGeometry: GeometryMock,
        SphereGeometry: GeometryMock,
        TorusGeometry: GeometryMock,
        CircleGeometry: GeometryMock,
        ConeGeometry: GeometryMock,
        RingGeometry: GeometryMock,
        ShaderMaterial: class {
            constructor(params = {}) {
                this.uniforms = params.uniforms || {};
            }
        },
        MeshBasicMaterial: class {
            constructor(params = {}) {
                this.color = new Color(params.color);
            }
        },
        MeshStandardMaterial: class {
            constructor(params = {}) {
                this.color = new Color(params.color);
                this.emissive = params.emissive ? new Color(params.emissive) : new Color(0);
            }
        },
        DoubleSide: 2,
    };
}

describe('river hazards: whitewater speed boost rapids', () => {
    const rapids = {
        x: 0,
        z: -100,
        width: 10,
        length: 20,
        angle: 0,
        direction: { x: 0, z: -1 },
    };

    test('isInsideRapids detects points within bounds', () => {
        assert.equal(H.isInsideRapids({ x: 0, z: -100 }, rapids), true);
        assert.equal(H.isInsideRapids({ x: 4.5, z: -95 }, rapids), true);
        assert.equal(H.isInsideRapids({ x: -4.5, z: -108 }, rapids), true);
        assert.equal(H.isInsideRapids({ x: 5.0, z: -100 }, rapids), true); // on edge
    });

    test('isInsideRapids rejects points outside bounds', () => {
        assert.equal(H.isInsideRapids({ x: 5.5, z: -100 }, rapids), false);
        assert.equal(H.isInsideRapids({ x: 0, z: -89.5 }, rapids), false);
        assert.equal(H.isInsideRapids({ x: 0, z: -110.5 }, rapids), false);
        assert.equal(H.isInsideRapids({ x: 20, z: -200 }, rapids), false);
    });

    test('isInsideRapids handles rotated/angled rapids zones', () => {
        const angledRapids = { x: 0, z: 0, width: 4, length: 20, angle: Math.PI / 2 };
        // rotated 90 degrees: width is along z, length along x
        assert.equal(H.isInsideRapids({ x: 8, z: 0 }, angledRapids), true);
        assert.equal(H.isInsideRapids({ x: 0, z: 1.5 }, angledRapids), true);
        assert.equal(H.isInsideRapids({ x: 0, z: 3.0 }, angledRapids), false);
    });

    test('calculateRapidsBoost provides exact +45% speed boost factor', () => {
        const craftVelocity = { x: 0, z: -10 };
        const boost = H.calculateRapidsBoost(craftVelocity, rapids);
        assert.equal(boost.active, true);
        assert.equal(boost.multiplier, 1.45); // +45%
        assert.equal(H.HAZARD_CONSTANTS.RAPIDS.SPEED_BOOST_FACTOR, 0.45);
    });

    test('calculateRapidsBoost applies forward surge boost force along rapids direction', () => {
        const craftVelocity = { x: 0, z: -10 };
        const boost = H.calculateRapidsBoost(craftVelocity, rapids);
        assert.ok(boost.boostForce.z < 0); // downriver force
        assert.equal(boost.boostForce.x, 0);
        assert.equal(boost.boostForce.z, -H.HAZARD_CONSTANTS.RAPIDS.SURGE_ACCEL);
    });

    test('calculateRapidsBoost handles angled flow vector', () => {
        const angled = { ...rapids, direction: { x: 1, z: -1 } };
        const boost = H.calculateRapidsBoost({ x: 2, z: -2 }, angled);
        assert.ok(boost.boostForce.x > 0);
        assert.ok(boost.boostForce.z < 0);
        assert.ok(Math.abs(Math.hypot(boost.boostForce.x, boost.boostForce.z) - H.HAZARD_CONSTANTS.RAPIDS.SURGE_ACCEL) < 1e-6);
    });

    test('calculateRapidsBoost enforces minimum boost floor even when stationary', () => {
        const stationary = { x: 0, z: 0 };
        const boost = H.calculateRapidsBoost(stationary, rapids);
        assert.ok(Math.hypot(boost.boostVelocity.x, boost.boostVelocity.z) > 0);
        assert.equal(boost.boostVelocity.z, -6.0 * 0.45);
    });
});

describe('river hazards: pulling whirlpools (tangential swirl + radial suction)', () => {
    const whirlpool = {
        x: 0,
        z: -200,
        radius: 10,
        coreRadius: 2,
        clockwise: true,
        maxPull: 15,
        maxSwirl: 20,
        depth: 2.0,
    };

    test('evaluateWhirlpoolField returns inside=false outside radius', () => {
        const res = H.evaluateWhirlpoolField({ x: 15, z: -200 }, whirlpool);
        assert.equal(res.inside, false);
        assert.deepEqual(res.combinedVelocity, { x: 0, z: 0 });
        assert.equal(res.vortexDepth, 0);
    });

    test('evaluateWhirlpoolField returns inward radial pull toward center', () => {
        // Point is to the east (x = 5, z = -200)
        const res = H.evaluateWhirlpoolField({ x: 5, z: -200 }, whirlpool);
        assert.equal(res.inside, true);
        assert.ok(res.radialPull.x < 0, 'radial pull should point west towards center');
        assert.ok(Math.abs(res.radialPull.z) < 1e-6, 'radial pull z should be 0 along x axis');
    });

    test('evaluateWhirlpoolField returns clockwise tangential swirl', () => {
        // Point is to the east (x = 5, z = -200) -> clockwise swirl pushes south (-z)
        const res = H.evaluateWhirlpoolField({ x: 5, z: -200 }, whirlpool);
        assert.ok(res.tangentialSwirl.z < 0, 'clockwise swirl at East pushes downriver (-z)');
        assert.ok(Math.abs(res.tangentialSwirl.x) < 1e-6);
    });

    test('evaluateWhirlpoolField flips tangential swirl for counter-clockwise whirlpool', () => {
        const ccwWhirlpool = { ...whirlpool, clockwise: false };
        const res = H.evaluateWhirlpoolField({ x: 5, z: -200 }, ccwWhirlpool);
        assert.ok(res.tangentialSwirl.z > 0, 'counter-clockwise swirl at East pushes upriver (+z)');
    });

    test('evaluateWhirlpoolField combines radial pull and tangential swirl', () => {
        const res = H.evaluateWhirlpoolField({ x: 5, z: -200 }, whirlpool);
        assert.equal(res.combinedVelocity.x, res.radialPull.x + res.tangentialSwirl.x);
        assert.equal(res.combinedVelocity.y, undefined);
        assert.equal(res.combinedVelocity.z, res.radialPull.z + res.tangentialSwirl.z);
    });

    test('vortex depth increases closer to whirlpool center', () => {
        const outer = H.evaluateWhirlpoolField({ x: 8, z: -200 }, whirlpool);
        const mid = H.evaluateWhirlpoolField({ x: 4, z: -200 }, whirlpool);
        const near = H.evaluateWhirlpoolField({ x: 1, z: -200 }, whirlpool);

        assert.ok(near.vortexDepth > mid.vortexDepth);
        assert.ok(mid.vortexDepth > outer.vortexDepth);
        assert.ok(near.vortexDepth <= whirlpool.depth);
    });

    test('inner core has finite non-singular velocity', () => {
        const coreRes = H.evaluateWhirlpoolField({ x: 0.1, z: -200 }, whirlpool);
        assert.equal(coreRes.inside, true);
        assert.ok(Number.isFinite(coreRes.combinedVelocity.x));
        assert.ok(Number.isFinite(coreRes.combinedVelocity.z));
    });
});

describe('river hazards: wooden stunt jump ramps & bonus coin rings', () => {
    const ramp = {
        id: 'ramp_1',
        x: 0,
        z: -300,
        width: 6,
        length: 8,
        height: 2.2,
        launchVelocityY: 16.0,
        launchBoostZ: 14.0,
    };

    test('evaluateRampInteraction detects when craft is outside ramp footprint', () => {
        const craft = { position: { x: 5, y: 0.25, z: -300 }, velocity: { x: 0, z: -10 } };
        const res = H.evaluateRampInteraction(craft, ramp);
        assert.equal(res.onRamp, false);
        assert.equal(res.launched, false);
    });

    test('evaluateRampInteraction slopes craft upwards along ramp incline', () => {
        // Entry is at z = -300 + 4 = -296 (progress = 0)
        // Center is at z = -300 (progress = 0.5)
        const craftEntry = { position: { x: 0, y: 0.25, z: -296 }, velocity: { x: 0, z: -10 } };
        const resEntry = H.evaluateRampInteraction(craftEntry, ramp);
        assert.equal(resEntry.onRamp, true);
        assert.ok(Math.abs(resEntry.progress - 0.0) < 1e-4);
        assert.ok(Math.abs(resEntry.rampY - 0.0) < 1e-4);

        const craftMid = { position: { x: 0, y: 0.25, z: -300 }, velocity: { x: 0, z: -10 } };
        const resMid = H.evaluateRampInteraction(craftMid, ramp);
        assert.equal(resMid.onRamp, true);
        assert.ok(Math.abs(resMid.progress - 0.5) < 1e-4);
        assert.ok(Math.abs(resMid.rampY - ramp.height * 0.5) < 1e-4);
    });

    test('evaluateRampInteraction triggers airborne launch at the ramp lip', () => {
        // Lip is at z = -304 (progress = 1.0)
        const craftAtLip = { position: { x: 0, y: 2.0, z: -303.5 }, velocity: { x: 0, z: -12 } };
        const res = H.evaluateRampInteraction(craftAtLip, ramp);
        assert.equal(res.onRamp, true);
        assert.equal(res.launched, true);
        assert.ok(res.launchVelocity !== null);
        assert.equal(res.launchVelocity.y, 16.0);
        assert.equal(res.launchVelocity.z, -12 - 14.0); // current + boost
    });

    test('evaluateRampInteraction does not launch when moving backwards upriver', () => {
        const craftBackwards = { position: { x: 0, y: 2.0, z: -303.5 }, velocity: { x: 0, z: 5 } };
        const res = H.evaluateRampInteraction(craftBackwards, ramp);
        assert.equal(res.launched, false);
        assert.equal(res.launchVelocity, null);
    });

    test('generateRampCoinRings creates parabolic airborne coin arc ahead of ramp', () => {
        const coinRings = H.generateRampCoinRings(ramp);
        assert.equal(coinRings.length, H.HAZARD_CONSTANTS.RAMP.COIN_COUNT);

        // Check parabolic arc heights
        for (let i = 0; i < coinRings.length; i++) {
            const ring = coinRings[i];
            assert.equal(ring.rampId, ramp.id);
            assert.equal(ring.collected, false);
            assert.ok(ring.y > ramp.height, 'coin rings should be airborne above ramp apex');
            assert.ok(ring.z < ramp.z - ramp.length * 0.5, 'coin rings should be downriver of lip');
        }
    });

    test('collectCoinRings collects airborne rings when passing through them', () => {
        const coinRings = H.generateRampCoinRings(ramp);
        const targetRing = coinRings[1];

        // Craft passes near targetRing
        const craftPos = { x: targetRing.x, y: targetRing.y, z: targetRing.z };
        const res = H.collectCoinRings(craftPos, coinRings);

        assert.equal(res.collectedCount, 1);
        assert.equal(res.earnedCoins, targetRing.value);
        assert.deepEqual(res.collectedIds, [targetRing.id]);
        assert.equal(targetRing.collected, true);

        // Collecting again does not double-credit
        const res2 = H.collectCoinRings(craftPos, coinRings);
        assert.equal(res2.collectedCount, 0);
        assert.equal(res2.earnedCoins, 0);
    });
});

describe('river hazards: exploding mine barrels', () => {
    test('createMineBarrel initializes with default floating state and properties', () => {
        const mine = H.createMineBarrel('mine_test_1', 2, -400);
        assert.equal(mine.id, 'mine_test_1');
        assert.equal(mine.state, 'floating');
        assert.equal(mine.triggerRadius, H.HAZARD_CONSTANTS.MINE.TRIGGER_RADIUS);
        assert.equal(mine.blastRadius, H.HAZARD_CONSTANTS.MINE.BLAST_RADIUS);
        assert.equal(mine.damage, H.HAZARD_CONSTANTS.MINE.BASE_DAMAGE);
    });

    test('updateMineBarrel stays floating when craft is outside trigger radius', () => {
        const mine = H.createMineBarrel('m1', 0, -100);
        const res = H.updateMineBarrel(mine, [{ x: 10, z: -100 }], 50, 0);
        assert.equal(res.state, 'floating');
        assert.equal(res.events.length, 0);
    });

    test('updateMineBarrel triggers fuse countdown upon proximity contact', () => {
        const mine = H.createMineBarrel('m1', 0, -100);
        const res = H.updateMineBarrel(mine, [{ id: 'player1', x: 2, z: -100 }], 50, 1000);
        assert.equal(res.state, 'triggered');
        assert.equal(res.events.length, 1);
        assert.equal(res.events[0].type, 'mineTriggered');
        assert.equal(res.events[0].mineId, 'm1');
        assert.equal(res.events[0].triggeredBy, 'player1');
    });

    test('fuse counts down deterministically over discrete steps', () => {
        const mine = H.createMineBarrel('m1', 0, -100);
        H.updateMineBarrel(mine, [{ id: 'p1', x: 0, z: -100 }], 50, 0); // trigger

        assert.equal(mine.state, 'triggered');
        const fuseInitial = mine.fuseTimerMs;

        H.updateMineBarrel(mine, [], 100, 100);
        assert.equal(mine.fuseTimerMs, fuseInitial - 100);
        assert.equal(mine.state, 'triggered');
    });

    test('detonates after fuse duration expires, dealing damage and knockback', () => {
        const mine = H.createMineBarrel('m1', 0, -100, { damage: 50, blastRadius: 10, knockback: 600 });
        H.updateMineBarrel(mine, [{ id: 'p1', x: 0, z: -100 }], 50, 0); // triggered

        // Fast forward fuse duration
        const res = H.updateMineBarrel(mine, [{ id: 'p1', x: 2, z: -100 }], mine.fuseMs, 1200);
        assert.equal(res.state, 'detonated');
        assert.equal(mine.state, 'detonated');

        const detEvent = res.events.find((e) => e.type === 'mineDetonated');
        assert.ok(detEvent);
        assert.equal(detEvent.hits.length, 1);
        const hit = detEvent.hits[0];
        assert.equal(hit.targetId, 'p1');
        assert.ok(hit.damage > 0 && hit.damage <= 50);
        assert.ok(hit.knockback.x > 0, 'knockback pushes eastward away from mine');
        assert.ok(hit.knockback.y > 0, 'knockback lifts craft vertically');
    });

    test('craft outside blast radius takes no damage on detonation', () => {
        const mine = H.createMineBarrel('m1', 0, -100, { blastRadius: 6 });
        H.updateMineBarrel(mine, [{ id: 'p1', x: 0, z: -100 }], 50, 0); // trigger

        // Step to detonation with craft far away
        const res = H.updateMineBarrel(mine, [{ id: 'p1', x: 20, z: -100 }], mine.fuseMs, 1200);
        const detEvent = res.events.find((e) => e.type === 'mineDetonated');
        assert.ok(detEvent);
        assert.equal(detEvent.hits.length, 0);
    });

    test('inert/detonated mine ignores further craft interaction', () => {
        const mine = H.createMineBarrel('m1', 0, -100);
        mine.state = 'detonated';
        const res = H.updateMineBarrel(mine, [{ x: 0, z: -100 }], 50, 5000);
        assert.equal(res.state, 'detonated');
        assert.equal(res.events.length, 0);
    });
});

describe('river hazards: layout generation and full simulation step', () => {
    test('generateRiverHazardsLayout is deterministic for a given seed', () => {
        const layoutA = H.generateRiverHazardsLayout(777, -1500, 30);
        const layoutB = H.generateRiverHazardsLayout(777, -1500, 30);
        assert.deepEqual(layoutA, layoutB);
    });

    test('generateRiverHazardsLayout populates all 4 hazard types and coin rings', () => {
        const layout = H.generateRiverHazardsLayout(42, -1500, 30);
        assert.ok(layout.rapids.length > 0, 'should generate rapids');
        assert.ok(layout.whirlpools.length > 0, 'should generate whirlpools');
        assert.ok(layout.ramps.length > 0, 'should generate ramps');
        assert.ok(layout.mines.length > 0, 'should generate mines');
        assert.ok(layout.coinRings.length > 0, 'should generate bonus coin rings');
    });

    test('generateRiverHazardsLayout respects river channel width bounds', () => {
        const riverW = 30;
        const layout = H.generateRiverHazardsLayout(123, -1500, riverW);
        for (const r of layout.rapids) {
            assert.ok(Math.abs(r.x) < riverW * 0.5);
        }
        for (const w of layout.whirlpools) {
            assert.ok(Math.abs(w.x) < riverW * 0.5);
        }
        for (const r of layout.ramps) {
            assert.ok(Math.abs(r.x) < riverW * 0.5);
        }
        for (const m of layout.mines) {
            assert.ok(Math.abs(m.x) < riverW * 0.5);
        }
    });

    test('stepCraftWithRiverHazards applies rapids acceleration correctly', () => {
        const craft = {
            id: 'c1',
            mass: 5,
            position: { x: 0, y: 0.25, z: -100 },
            velocity: { x: 0, y: 0, z: -10 },
        };
        const hazards = {
            rapids: [{ x: 0, z: -100, width: 10, length: 20, direction: { x: 0, z: -1 } }],
            whirlpools: [],
            ramps: [],
            mines: [],
            coinRings: [],
        };

        const v0 = craft.velocity.z;
        const res = H.stepCraftWithRiverHazards(craft, hazards, 0.1);
        assert.equal(res.inRapids, true);
        assert.equal(res.rapidsBoostFactor, 1.45);
        assert.ok(craft.velocity.z < v0, 'rapids should accelerate craft downriver (-z)');
    });

    test('stepCraftWithRiverHazards applies whirlpool vortex pull', () => {
        const craft = {
            id: 'c1',
            mass: 5,
            position: { x: 3, y: 0.25, z: -200 },
            velocity: { x: 0, y: 0, z: 0 },
        };
        const hazards = {
            rapids: [],
            whirlpools: [{ x: 0, z: -200, radius: 8, coreRadius: 1, clockwise: true }],
            ramps: [],
            mines: [],
            coinRings: [],
        };

        const res = H.stepCraftWithRiverHazards(craft, hazards, 0.1);
        assert.equal(res.inWhirlpool, true);
        assert.ok(res.whirlpoolDepth > 0);
        assert.ok(craft.velocity.x < 0, 'whirlpool should pull craft towards x=0');
    });

    test('stepCraftWithRiverHazards executes ramp jump and awards coin rings', () => {
        const ramp = { id: 'r1', x: 0, z: -300, width: 6, length: 8, height: 2.5 };
        const coinRings = H.generateRampCoinRings(ramp);
        const targetCoin = coinRings[0];

        const craft = {
            id: 'c1',
            mass: 5,
            position: { x: targetCoin.x, y: targetCoin.y, z: targetCoin.z },
            velocity: { x: 0, y: 0, z: -10 },
        };
        const hazards = {
            rapids: [],
            whirlpools: [],
            ramps: [ramp],
            mines: [],
            coinRings,
        };

        const res = H.stepCraftWithRiverHazards(craft, hazards, 0.1);
        assert.equal(res.coinsEarned, targetCoin.value);
        assert.equal(targetCoin.collected, true);
    });

    test('stepCraftWithRiverHazards propagates mine proximity and explosion knockback', () => {
        const mine = H.createMineBarrel('m_step', 0, -400);
        const craft = {
            id: 'c1',
            mass: 5,
            position: { x: 0, y: 0.25, z: -400.5 },
            velocity: { x: 0, y: 0, z: 0 },
        };
        const hazards = {
            rapids: [],
            whirlpools: [],
            ramps: [],
            mines: [mine],
            coinRings: [],
        };

        // Step 1: Proximity triggers mine
        const res1 = H.stepCraftWithRiverHazards(craft, hazards, 0.05, 0);
        assert.equal(res1.mineEvents.length, 1);
        assert.equal(res1.mineEvents[0].type, 'mineTriggered');

        // Step 2: Detonation applies knockback force to craft velocity
        mine.fuseTimerMs = 10; // trigger immediate blast on next step
        const res2 = H.stepCraftWithRiverHazards(craft, hazards, 0.05, 1200);
        assert.ok(res2.mineEvents.some((e) => e.type === 'mineDetonated'));
        assert.ok(craft.velocity.y > 0, 'explosion knockback launches craft upwards');
    });
});

describe('hazards-mesh: Three.js renderer and animation builders', () => {
    const mockThree = createMockThree();

    test('createRapidsMesh returns valid mesh group with shader uniforms', () => {
        const rapidsConfig = { x: 0, z: -50, width: 12, length: 30 };
        const group = MeshBuilder.createRapidsMesh(mockThree, rapidsConfig);
        assert.equal(group.userData.type, 'rapids');
        assert.ok(group.userData.shaderMat.uniforms.uTime);
        assert.equal(group.userData.chevronArrows.length, 5);
    });

    test('createWhirlpoolMesh builds funnel mesh with clockwise/counter-clockwise uniform', () => {
        const wpConfig = { x: 0, z: -150, radius: 8, depth: 1.5, clockwise: false };
        const group = MeshBuilder.createWhirlpoolMesh(mockThree, wpConfig);
        assert.equal(group.userData.type, 'whirlpool');
        assert.equal(group.userData.shaderMat.uniforms.uDir.value, -1.0);
    });

    test('createRampMesh builds wooden deck and support pilings', () => {
        const rampConfig = { x: 2, z: -250, width: 6, length: 8, height: 2.2 };
        const group = MeshBuilder.createRampMesh(mockThree, rampConfig);
        assert.equal(group.userData.type, 'ramp');
        assert.ok(group.children.length >= 4);
    });

    test('createCoinRingMesh builds 3D gold ring and translucent disc', () => {
        const coinData = { id: 'c1', x: 0, y: 3.5, z: -260, radius: 1.5 };
        const group = MeshBuilder.createCoinRingMesh(mockThree, coinData);
        assert.equal(group.userData.type, 'coinRing');
        assert.equal(group.position.y, 3.5);
    });

    test('createMineMesh builds barrel body, chemical spikes, and warning beacon', () => {
        const mineConfig = { id: 'm1', x: -5, z: -350, triggerRadius: 4.0 };
        const group = MeshBuilder.createMineMesh(mockThree, mineConfig);
        assert.equal(group.userData.type, 'mine');
        assert.ok(group.userData.beaconMat);
        assert.ok(group.userData.auraRing);
    });

    test('buildRiverHazardsGroup and animateRiverHazards cycle animations smoothly', () => {
        const layout = H.generateRiverHazardsLayout(11, -300, 30);
        const handle = MeshBuilder.buildRiverHazardsGroup(mockThree, layout);

        assert.ok(handle.rootGroup);
        assert.equal(handle.rapidsMeshes.length, layout.rapids.length);
        assert.equal(handle.whirlpoolMeshes.length, layout.whirlpools.length);
        assert.equal(handle.rampMeshes.length, layout.ramps.length);
        assert.equal(handle.coinRingMeshes.length, layout.coinRings.length);
        assert.equal(handle.mineMeshes.length, layout.mines.length);

        // Test animation update ticks
        assert.doesNotThrow(() => {
            MeshBuilder.animateRiverHazards(handle, 1.5, 0.016);
            MeshBuilder.animateRiverHazards(handle, 3.0, 0.016);
        });
    });
});
