import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    KRAKEN_SPAWN_Z,
    KRAKEN_ARENA_Z_MIN,
    KRAKEN_ARENA_Z_MAX,
    KRAKEN_ARENA_RADIUS,
    KRAKEN_CONFIG,
    createRng,
    clamp,
    createKrakenState,
    shouldKrakenSpawn,
    spawnKraken,
    calculateWhirlpoolSuction,
    damageKraken,
    triggerKrakenDefeat,
    tickKraken,
} from '../shared/boss-kraken.js';

import {
    createKrakenMesh,
    updateKrakenMesh,
    resolveTHREE,
} from '../public/js/entities/boss-kraken-mesh.js';

/**
 * Headless Three.js mock matching Three.js APIs used in createKrakenMesh
 */
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
        setHex(h) {
            this.hex = h;
            return this;
        }
    }

    class Material {
        constructor(params = {}) {
            this.params = params;
            this.color = params.color !== undefined ? new Color(params.color) : new Color();
            this.roughness = params.roughness ?? 0.5;
            this.metalness = params.metalness ?? 0.0;
            this.wireframe = params.wireframe ?? false;
            this.transparent = params.transparent ?? false;
            this.opacity = params.opacity ?? 1.0;
        }
    }

    class Geometry {
        constructor(type, params) {
            this.type = type;
            this.params = params;
        }
    }

    class Object3D {
        constructor() {
            this.type = 'Object3D';
            this.name = '';
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.children = [];
            this.visible = true;
            this.userData = {};
        }
        add(child) {
            this.children.push(child);
            child.parent = this;
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
        constructor(geometry, material) {
            super();
            this.type = 'Mesh';
            this.geometry = geometry;
            this.material = material;
        }
    }

    return {
        Vector3,
        Euler,
        Color,
        Object3D,
        Group,
        Mesh,
        MeshStandardMaterial: class extends Material {},
        MeshBasicMaterial: class extends Material {},
        SphereGeometry: class extends Geometry {
            constructor(...args) { super('SphereGeometry', args); }
        },
        ConeGeometry: class extends Geometry {
            constructor(...args) { super('ConeGeometry', args); }
        },
        BoxGeometry: class extends Geometry {
            constructor(...args) { super('BoxGeometry', args); }
        },
        CylinderGeometry: class extends Geometry {
            constructor(...args) { super('CylinderGeometry', args); }
        },
        TorusGeometry: class extends Geometry {
            constructor(...args) { super('TorusGeometry', args); }
        },
        RingGeometry: class extends Geometry {
            constructor(...args) { super('RingGeometry', args); }
        },
    };
}

describe('Final Boss Encounter: The Dread Kraken of the River Mouth (Deterministic State Machine)', () => {

    it('1. correctly configures encounter constants and spawn coordinate at z = -1350', () => {
        assert.equal(KRAKEN_SPAWN_Z, -1350);
        assert.equal(KRAKEN_CONFIG.spawnZ, -1350);
        assert.equal(KRAKEN_CONFIG.homePosition.z, -1350);
        assert.equal(KRAKEN_CONFIG.homePosition.x, 0);
        assert.equal(KRAKEN_CONFIG.tentacleCount, 4);
        assert.equal(KRAKEN_CONFIG.tentacleJointCount, 8);
        assert.equal(KRAKEN_CONFIG.maxHealth, 1500);
        assert.ok(KRAKEN_ARENA_Z_MIN < KRAKEN_SPAWN_Z);
        assert.ok(KRAKEN_ARENA_Z_MAX > KRAKEN_SPAWN_Z);
    });

    it('2. evaluates shouldKrakenSpawn based on lead raft Z trigger distance', () => {
        // triggerDistance defaults to 90m, spawnZ = -1350 -> triggers at Z <= -1260
        assert.equal(shouldKrakenSpawn(0), false);
        assert.equal(shouldKrakenSpawn(-1200), false);
        assert.equal(shouldKrakenSpawn(-1260), true);
        assert.equal(shouldKrakenSpawn(-1300), true);
        assert.equal(shouldKrakenSpawn(-1350), true);
    });

    it('3. initializes clean, deterministic Kraken state', () => {
        const k = createKrakenState({ seed: 42 });
        assert.equal(k.isSpawned, false);
        assert.equal(k.isDefeated, false);
        assert.equal(k.phase, 1);
        assert.equal(k.health, 1500);
        assert.equal(k.maxHealth, 1500);
        assert.equal(k.position.z, -1350);
        assert.equal(k.tentacles.length, 4);
        assert.equal(k.barnacles.length, 4);
        assert.equal(k.isStunned, false);
        assert.equal(k.whirlpoolActive, false);
        assert.equal(k.isFrenzyActive, false);
        assert.equal(k.coinDrops.length, 0);
    });

    it('4. creates 4 tentacles with 8 joint angles each and initial submerged/idle state', () => {
        const k = createKrakenState();
        for (let i = 0; i < 4; i++) {
            const t = k.tentacles[i];
            assert.equal(t.id, `tentacle_${i}`);
            assert.equal(t.index, i);
            assert.equal(t.jointAngles.length, 8);
            assert.equal(typeof t.basePos.x, 'number');
            assert.equal(typeof t.basePos.z, 'number');
        }
    });

    it('5. creates 4 glowing barnacle weak-points initialized inactive for Phase 1', () => {
        const k = createKrakenState();
        assert.equal(k.barnacles.length, 4);
        for (let i = 0; i < 4; i++) {
            const b = k.barnacles[i];
            assert.equal(b.id, `barnacle_${i}`);
            assert.equal(b.active, false);
            assert.equal(b.destroyed, false);
            assert.equal(b.health, KRAKEN_CONFIG.phase2.barnacleHp);
            assert.equal(b.glowingIntensity, 0.0);
        }
    });

    it('6. handles spawnKraken idempotency and generates spawn network event', () => {
        const k = createKrakenState();
        const ev1 = spawnKraken(k);
        assert.equal(k.isSpawned, true);
        assert.equal(ev1.length, 1);
        assert.equal(ev1[0].event, 'kraken:spawned');
        assert.equal(ev1[0].data.phase, 1);

        // Calling again does not duplicate spawn
        const ev2 = spawnKraken(k);
        assert.equal(ev2.length, 0);
    });

    it('7. clamps numbers correctly within bounds', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-3, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
    });

    it('8. provides deterministic PRNG sequences with same seed', () => {
        const rng1 = createRng(12345);
        const rng2 = createRng(12345);
        for (let i = 0; i < 10; i++) {
            assert.equal(rng1(), rng2());
        }
    });

    it('9. deals direct damage in Phase 1 and tracks health reduction', () => {
        const k = createKrakenState();
        spawnKraken(k);
        const res = damageKraken(k, 200);
        assert.equal(res.damageDealt, 200);
        assert.equal(k.health, 1300);
        assert.equal(res.phaseChanged, false);
        assert.equal(res.events[0].event, 'kraken:damaged');
    });

    it('10. generates Phase 1 tentacle slam telegraph rings after slamCooldown expires', () => {
        const k = createKrakenState({ seed: 777 });
        spawnKraken(k);
        k.slamCooldown = 0.05; // almost expired

        const players = [{ id: 'p1', position: { x: 0, y: 0, z: -1340 }, isDead: false }];
        const evs = tickKraken(k, 0.1, players);

        const slamEvent = evs.find((e) => e.event === 'kraken:slam_telegraph_start');
        assert.ok(slamEvent, 'Should emit slam telegraph start event');
        assert.equal(k.telegraphRings.length, 1);
        assert.equal(k.telegraphRings[0].damage, KRAKEN_CONFIG.phase1.slamDamage);
        assert.equal(k.telegraphRings[0].maxRadius, KRAKEN_CONFIG.phase1.slamRadius);
    });

    it('11. expands telegraph warning ring radius over time', () => {
        const k = createKrakenState();
        spawnKraken(k);
        k.slamCooldown = 10.0; // Prevent automated new slam spawn during test
        k.telegraphRings.push({
            id: 'ring_test',
            position: { x: 0, y: 0, z: -1350 },
            maxRadius: 10,
            currentRadius: 0,
            duration: 2.0,
            elapsed: 0,
            tentacleIndex: 0,
            damage: 30,
        });

        tickKraken(k, 1.0, []);
        assert.equal(k.telegraphRings.length, 1);
        assert.equal(k.telegraphRings[0].elapsed, 1.0);
        assert.equal(k.telegraphRings[0].currentRadius, 5.0); // 50% elapsed = 5.0
    });

    it('12. resolves telegraph slam hit on players within the warning ring when duration ends', () => {
        const k = createKrakenState();
        spawnKraken(k);
        k.telegraphRings.push({
            id: 'ring_hit_test',
            position: { x: 2, y: 0, z: -1350 },
            maxRadius: 6,
            currentRadius: 0,
            duration: 1.0,
            elapsed: 0.95,
            tentacleIndex: 1,
            damage: 35,
        });

        const playerInside = { id: 'p_near', position: { x: 3, y: 0, z: -1350 }, isDead: false };
        const playerOutside = { id: 'p_far', position: { x: 20, y: 0, z: -1350 }, isDead: false };
        const evs = tickKraken(k, 0.1, [playerInside, playerOutside]);

        const landEv = evs.find((e) => e.event === 'kraken:telegraph_landed');
        assert.ok(landEv);
        assert.equal(landEv.data.hitPlayers.length, 1);
        assert.equal(landEv.data.hitPlayers[0].id, 'p_near');
        assert.equal(landEv.data.hitPlayers[0].damage, 35);
        assert.equal(k.telegraphRings.length, 0); // Ring cleared after landing
    });

    it('13. ignores dead players during telegraph slam resolution', () => {
        const k = createKrakenState();
        spawnKraken(k);
        k.telegraphRings.push({
            id: 'ring_dead_player',
            position: { x: 0, y: 0, z: -1350 },
            maxRadius: 6,
            currentRadius: 0,
            duration: 0.5,
            elapsed: 0.45,
            tentacleIndex: 0,
            damage: 35,
        });

        const deadPlayer = { id: 'p_dead', position: { x: 0, y: 0, z: -1350 }, isDead: true };
        const evs = tickKraken(k, 0.1, [deadPlayer]);
        const landEv = evs.find((e) => e.event === 'kraken:telegraph_landed');
        assert.ok(landEv);
        assert.equal(landEv.data.hitPlayers.length, 0);
    });

    it('14. triggers Phase 2 transition when HP reaches 66.7% threshold and activates barnacles & whirlpool', () => {
        const k = createKrakenState();
        spawnKraken(k);
        assert.equal(k.phase, 1);

        // 1500 * (1 - 0.6667) = ~500 damage to reach threshold
        const res = damageKraken(k, 501);
        assert.equal(res.phaseChanged, true);
        assert.equal(k.phase, 2);
        assert.equal(k.whirlpoolActive, true);

        // All 4 barnacles should now be active with glow
        for (const b of k.barnacles) {
            assert.equal(b.active, true);
            assert.equal(b.glowingIntensity, 1.0);
            assert.equal(b.destroyed, false);
        }

        const phaseEv = res.events.find((e) => e.event === 'kraken:phase_change');
        assert.ok(phaseEv);
        assert.equal(phaseEv.data.phase, 2);
    });

    it('15. computes active whirlpool suction pull vector in Phase 2 for nearby rafts', () => {
        const k = createKrakenState();
        spawnKraken(k);
        damageKraken(k, 510); // Enter Phase 2

        const raftPos = { x: 10, y: 0, z: -1350 };
        const suction = calculateWhirlpoolSuction(raftPos, k);
        assert.equal(suction.inRange, true);
        assert.ok(suction.x < 0, 'Suction should pull inward towards center x=0');
        assert.ok(suction.distance <= KRAKEN_CONFIG.phase2.whirlpoolRadius);
        assert.ok(suction.y < 0, 'Suction should create downward drag');
    });

    it('16. returns zero suction pull outside whirlpool radius', () => {
        const k = createKrakenState();
        spawnKraken(k);
        damageKraken(k, 510);

        const farPos = { x: 50, y: 0, z: -1350 };
        const suction = calculateWhirlpoolSuction(farPos, k);
        assert.equal(suction.inRange, false);
        assert.equal(suction.x, 0);
        assert.equal(suction.z, 0);
    });

    it('17. disables whirlpool suction when Kraken is stunned or in other phases', () => {
        const k = createKrakenState();
        spawnKraken(k);
        const p1Suction = calculateWhirlpoolSuction({ x: 5, z: -1350 }, k);
        assert.equal(p1Suction.inRange, false); // Phase 1 -> no suction

        damageKraken(k, 510); // Phase 2
        k.isStunned = true;
        const stunSuction = calculateWhirlpoolSuction({ x: 5, z: -1350 }, k);
        assert.equal(stunSuction.inRange, false); // Stunned -> no suction
    });

    it('18. applies armored body damage resistance in Phase 2 while unstunned', () => {
        const k = createKrakenState();
        spawnKraken(k);
        damageKraken(k, 510); // Enter Phase 2, HP = 990
        const preHp = k.health;

        const res = damageKraken(k, 100); // 50% armored resistance
        assert.equal(res.damageDealt, 50);
        assert.equal(k.health, preHp - 50);
    });

    it('19. allows targeting glowing barnacle weak-points and applies critical boss damage', () => {
        const k = createKrakenState();
        spawnKraken(k);
        damageKraken(k, 510); // Enter Phase 2
        const preHp = k.health;

        const res = damageKraken(k, 40, 'barnacle_0');
        assert.equal(res.damageDealt, 40);
        const b0 = k.barnacles.find((b) => b.id === 'barnacle_0');
        assert.equal(b0.health, 40); // 80 - 40
        assert.equal(b0.destroyed, false);
        // Critical damage to boss: 40 * 1.5 = 60
        assert.equal(k.health, preHp - 60);

        const hitEv = res.events.find((e) => e.event === 'kraken:barnacle_hit');
        assert.ok(hitEv);
        assert.equal(hitEv.data.critical, true);
    });

    it('20. destroying a barnacle weak-point triggers Kraken stun state and event', () => {
        const k = createKrakenState();
        spawnKraken(k);
        damageKraken(k, 510); // Phase 2

        const res = damageKraken(k, 80, 'barnacle_1');
        const b1 = k.barnacles.find((b) => b.id === 'barnacle_1');
        assert.equal(b1.destroyed, true);
        assert.equal(b1.active, false);
        assert.equal(res.stunTriggered, true);
        assert.equal(k.isStunned, true);
        assert.equal(k.stunTimer, KRAKEN_CONFIG.phase2.barnacleStunDuration);
        assert.equal(k.stunCount, 1);

        const stunEv = res.events.find((e) => e.event === 'kraken:stunned');
        assert.ok(stunEv);
        assert.equal(stunEv.data.source, 'barnacle_1');
    });

    it('21. recovers from stun state when stunTimer counts down to zero', () => {
        const k = createKrakenState();
        spawnKraken(k);
        damageKraken(k, 510);
        damageKraken(k, 80, 'barnacle_0'); // Stunned for 4.5s
        assert.equal(k.isStunned, true);

        // Tick 4.0s -> still stunned
        tickKraken(k, 4.0, []);
        assert.equal(k.isStunned, true);
        assert.ok(k.stunTimer > 0);

        // Tick remaining 0.6s -> recovered
        const evs = tickKraken(k, 0.6, []);
        assert.equal(k.isStunned, false);
        assert.equal(k.stunTimer, 0);

        const recEv = evs.find((e) => e.event === 'kraken:stun_recovered');
        assert.ok(recEv);
    });

    it('22. emits ink-cloud blind wave event periodically during Phase 2', () => {
        const k = createKrakenState();
        spawnKraken(k);
        damageKraken(k, 510); // Phase 2
        k.inkWaveTimer = 0.05;

        const evs = tickKraken(k, 0.1, []);
        const inkEv = evs.find((e) => e.event === 'kraken:ink_cloud_wave');
        assert.ok(inkEv);
        assert.equal(k.isInkCloudActive, true);
        assert.equal(inkEv.data.duration, KRAKEN_CONFIG.phase2.inkBlindDuration);

        // Advance until ink cloud clears
        const evs2 = tickKraken(k, KRAKEN_CONFIG.phase2.inkBlindDuration + 0.1, []);
        assert.equal(k.isInkCloudActive, false);
        const clearEv = evs2.find((e) => e.event === 'kraken:ink_cloud_cleared');
        assert.ok(clearEv);
    });

    it('23. transitions to Phase 3 frenzy when HP drops below 33.3% threshold', () => {
        const k = createKrakenState();
        spawnKraken(k);
        damageKraken(k, 510); // Phase 2

        // Stun to remove 50% body armor resistance and drop below 500 HP
        damageKraken(k, 80, 'barnacle_0');
        const res = damageKraken(k, 600); // Exceeds threshold to phase 3
        assert.equal(res.phaseChanged, true);
        assert.equal(k.phase, 3);
        assert.equal(k.isFrenzyActive, true);
        assert.equal(k.whirlpoolActive, false);

        const phaseEv = res.events.find((e) => e.event === 'kraken:phase_change');
        assert.ok(phaseEv);
        assert.equal(phaseEv.data.phase, 3);
    });

    it('24. Phase 3 triggers sweeping barrage attacks with alternating tentacles', () => {
        const k = createKrakenState({ seed: 999 });
        spawnKraken(k);
        damageKraken(k, 510);
        damageKraken(k, 80, 'barnacle_0');
        damageKraken(k, 600); // Phase 3

        k.sweepTimer = 0.05; // Force sweep trigger
        const evs = tickKraken(k, 0.1, []);

        const sweepEvents = evs.filter((e) => e.event === 'kraken:sweep_telegraph_start');
        assert.equal(sweepEvents.length, 2, 'Should sweep with 2 tentacles in barrage');
        assert.equal(sweepEvents[0].data.damage, KRAKEN_CONFIG.phase3.sweepDamage);
    });

    it('25. triggers final defeat and massive 150-coin fountain drop when HP reaches zero', () => {
        const k = createKrakenState({ seed: 888 });
        spawnKraken(k);
        damageKraken(k, 510);
        damageKraken(k, 80, 'barnacle_0');
        damageKraken(k, 600);

        // Kill blow
        const res = damageKraken(k, 1000);
        assert.equal(k.health, 0);
        assert.equal(k.isDefeated, true);

        const defeatEv = res.events.find((e) => e.event === 'kraken:defeated');
        assert.ok(defeatEv);
        assert.equal(defeatEv.data.coinCount, KRAKEN_CONFIG.phase3.coinFountainCount);
        assert.equal(k.coinDrops.length, KRAKEN_CONFIG.phase3.coinFountainCount);

        const firstCoin = k.coinDrops[0];
        assert.ok(firstCoin.velocity.y > 0, 'Coin fountain must erupt upwards');
        assert.ok(firstCoin.value > 0);
    });

    it('26. simulates coin fountain ballistic trajectories and water surface floating on tick', () => {
        const k = createKrakenState();
        spawnKraken(k);
        triggerKrakenDefeat(k);

        const coin = k.coinDrops[0];
        const initialY = coin.position.y;
        const initialVy = coin.velocity.y;

        tickKraken(k, 0.1, []);
        assert.ok(coin.position.y > initialY, 'Coin travels upward initially');
        assert.ok(coin.velocity.y < initialVy, 'Gravity reduces coin vertical velocity');

        // Fast-forward coin drop into water
        for (let i = 0; i < 40; i++) {
            tickKraken(k, 0.1, []);
        }
        assert.equal(coin.position.y, 0, 'Coin settles onto water surface (y = 0)');
        assert.equal(coin.velocity.y, 0);
    });

    it('27. handles overkill damage without dropping health below zero', () => {
        const k = createKrakenState();
        spawnKraken(k);
        const res = damageKraken(k, 99999);
        assert.equal(k.health, 0);
        assert.equal(res.damageDealt, 1500);
        assert.equal(k.isDefeated, true);
    });

    it('28. does not damage or tick an unspawned Kraken', () => {
        const k = createKrakenState();
        assert.equal(k.isSpawned, false);
        const res = damageKraken(k, 100);
        assert.equal(res.damageDealt, 0);
        assert.equal(res.events.length, 0);

        const tickEvs = tickKraken(k, 0.5, []);
        assert.equal(tickEvs.length, 0);
    });

    it('29. does not damage an already defeated Kraken', () => {
        const k = createKrakenState();
        spawnKraken(k);
        triggerKrakenDefeat(k);
        assert.equal(k.isDefeated, true);

        const res = damageKraken(k, 100);
        assert.equal(res.damageDealt, 0);
        assert.equal(res.events.length, 0);
    });

    it('30. produces identical simulation outcomes across identical seeds and inputs (Determinism)', () => {
        const k1 = createKrakenState({ seed: 4242 });
        const k2 = createKrakenState({ seed: 4242 });

        spawnKraken(k1);
        spawnKraken(k2);

        const player = { id: 'p1', position: { x: 3, y: 0, z: -1345 }, isDead: false };

        for (let t = 0; t < 50; t++) {
            const ev1 = tickKraken(k1, 0.1, [player]);
            const ev2 = tickKraken(k2, 0.1, [player]);

            assert.equal(ev1.length, ev2.length);
            assert.equal(k1.telegraphRings.length, k2.telegraphRings.length);
            assert.equal(k1.health, k2.health);
        }
    });
});

describe('3D Articulated Kraken Boss Builder (Three.js Mesh & Rigging)', () => {
    const mockTHREE = createMockTHREE();

    it('31. creates complete Kraken mesh hierarchy with head, mantle, eyes and beak', () => {
        const mesh = createKrakenMesh(mockTHREE);
        assert.equal(mesh.type, 'Group');
        assert.equal(mesh.name, 'BossKraken_TheDreadKraken');

        const { headGroup, mantleMesh, eyes, beakGroup, upperJaw, lowerJaw } = mesh.userData;
        assert.ok(headGroup);
        assert.ok(mantleMesh);
        assert.equal(mantleMesh.geometry.type, 'SphereGeometry');
        assert.equal(eyes.length, 2);
        assert.ok(beakGroup);
        assert.ok(upperJaw);
        assert.ok(lowerJaw);
    });

    it('32. procedural builder generates 4 tentacles with 8 articulated joints each and suction cups', () => {
        const mesh = createKrakenMesh(mockTHREE);
        const { tentacles } = mesh.userData;

        assert.equal(tentacles.length, 4);
        for (let t = 0; t < 4; t++) {
            const tentacle = tentacles[t];
            assert.equal(tentacle.root.name, `TentacleRoot_${t}`);
            assert.equal(tentacle.joints.length, 8);

            // Verify each joint contains a segment cylinder and suction cups
            const firstJoint = tentacle.joints[0];
            assert.equal(firstJoint.mesh.geometry.type, 'CylinderGeometry');
            const toruses = firstJoint.group.children.filter((c) => c.geometry && c.geometry.type === 'TorusGeometry');
            assert.equal(toruses.length, 3, 'Each joint must have 3 suction cups');
        }
    });

    it('33. procedural builder generates 4 barnacle weak-points and telegraph rings pool', () => {
        const mesh = createKrakenMesh(mockTHREE);
        const { barnacleMeshes, telegraphPool } = mesh.userData;

        assert.equal(barnacleMeshes.length, 4);
        for (let i = 0; i < 4; i++) {
            assert.equal(barnacleMeshes[i].group.visible, false); // invisible in Phase 1
            assert.ok(barnacleMeshes[i].core);
        }

        assert.equal(telegraphPool.length, 6);
        for (let i = 0; i < telegraphPool.length; i++) {
            assert.equal(telegraphPool[i].mesh.geometry.type, 'RingGeometry');
            assert.equal(telegraphPool[i].mesh.visible, false);
        }
    });

    it('34. updates head bobbing, eye bioluminescence and beak snapping in updateKrakenMesh', () => {
        const mesh = createKrakenMesh(mockTHREE);
        const state = createKrakenState();
        spawnKraken(state);

        tickKraken(state, 0.5, []);
        updateKrakenMesh(mesh, state, 0.5, state.time);

        assert.equal(mesh.position.z, -1350);
        assert.notEqual(mesh.position.y, 0); // bobbing offset applied

        // Test Phase 3 eye color change to angry crimson
        state.phase = 3;
        updateKrakenMesh(mesh, state, 0.016, 1.0);
        const eyeColor = mesh.userData.eyes[0].mesh.material.color.hex;
        assert.equal(eyeColor, 0xff0044);
    });

    it('35. updates tentacle joint kinematics and active warning telegraph rings', () => {
        const mesh = createKrakenMesh(mockTHREE);
        const state = createKrakenState();
        spawnKraken(state);

        // Add an active telegraph ring
        state.telegraphRings.push({
            id: 'ring_1',
            position: { x: 5, y: 0, z: -1345 },
            currentRadius: 4.0,
            maxRadius: 5.5,
        });

        // Set tentacle 0 to slamming
        state.tentacles[0].state = 'slamming';
        state.tentacles[0].slamProgress = 0.8;

        updateKrakenMesh(mesh, state, 0.016, 2.0);

        // First telegraph ring should now be visible and positioned
        const { telegraphPool, tentacles } = mesh.userData;
        assert.equal(telegraphPool[0].mesh.visible, true);
        assert.equal(telegraphPool[1].mesh.visible, false);

        // Tentacle 0 root joint rotation should be modified
        const joint0 = tentacles[0].joints[0];
        assert.notEqual(joint0.group.rotation.x, 0);
    });

    it('36. resolveTHREE falls back cleanly or returns null when no instance available', () => {
        assert.equal(resolveTHREE(mockTHREE), mockTHREE);
        assert.equal(resolveTHREE(null), null);
    });
});
