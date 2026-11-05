import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAGNETIC_LOOT_CONSTANTS,
    createRng,
    clamp,
    lerp,
    vec3,
    vec3Add,
    vec3Sub,
    vec3Scale,
    vec3Length,
    vec3Distance,
    vec3Normalize,
    computeSpringDamperForce,
    calculateComboPitch,
    createComboTracker,
    registerComboPickup,
    stepComboTracker,
    createMagneticLootItem,
    spawnPinataBurst,
    findNearestRaft,
    stepMagneticLootItem,
    handleSmashPinata,
    createMagneticLootManager,
    stepMagneticLootSimulation,
} from '../shared/magnetic-loot.js';

describe('magnetic-loot: constants and configuration', () => {
    test('defines required loot types: coin and hull-plank', () => {
        assert.equal(MAGNETIC_LOOT_CONSTANTS.TYPES.COIN, 'coin');
        assert.equal(MAGNETIC_LOOT_CONSTANTS.TYPES.HULL_PLANK, 'hull-plank');
    });

    test('defines smash sources: barricade, barrel, enemy, pinata', () => {
        assert.equal(MAGNETIC_LOOT_CONSTANTS.SOURCES.BARRICADE, 'barricade');
        assert.equal(MAGNETIC_LOOT_CONSTANTS.SOURCES.BARREL, 'barrel');
        assert.equal(MAGNETIC_LOOT_CONSTANTS.SOURCES.ENEMY, 'enemy');
        assert.equal(MAGNETIC_LOOT_CONSTANTS.SOURCES.PINATA, 'pinata');
    });

    test('defines combo pitch escalation bounds (1.0x to 1.8x)', () => {
        assert.equal(MAGNETIC_LOOT_CONSTANTS.COMBO.MIN_PITCH, 1.0);
        assert.equal(MAGNETIC_LOOT_CONSTANTS.COMBO.MAX_PITCH, 1.8);
        assert.ok(MAGNETIC_LOOT_CONSTANTS.COMBO.PITCH_STEP > 0);
    });

    test('defines physicalized spring-damper parameters and magnet defaults', () => {
        assert.ok(MAGNETIC_LOOT_CONSTANTS.MAGNET.DEFAULT_RADIUS > 0);
        assert.ok(MAGNETIC_LOOT_CONSTANTS.MAGNET.SPRING_CONSTANT > 0);
        assert.ok(MAGNETIC_LOOT_CONSTANTS.MAGNET.DAMPER_CONSTANT > 0);
        assert.ok(MAGNETIC_LOOT_CONSTANTS.MAGNET.COLLECTION_RADIUS > 0);
    });
});

describe('magnetic-loot: 3D vector math and PRNG', () => {
    test('mulberry32 PRNG produces deterministic sequence', () => {
        const rng1 = createRng(12345);
        const rng2 = createRng(12345);
        for (let i = 0; i < 10; i++) {
            assert.equal(rng1(), rng2());
        }
    });

    test('vector arithmetic functions compute correct values', () => {
        const a = vec3(1, 2, 3);
        const b = vec3(4, 5, 6);
        assert.deepEqual(vec3Add(a, b), { x: 5, y: 7, z: 9 });
        assert.deepEqual(vec3Sub(b, a), { x: 3, y: 3, z: 3 });
        assert.deepEqual(vec3Scale(a, 2), { x: 2, y: 4, z: 6 });
        assert.equal(vec3Length(vec3(0, 3, 4)), 5);
        assert.equal(vec3Distance(vec3(0, 0, 0), vec3(0, 6, 8)), 10);
        assert.deepEqual(vec3Normalize(vec3(0, 10, 0)), { x: 0, y: 1, z: 0 });
        assert.deepEqual(vec3Normalize(vec3(0, 0, 0)), { x: 0, y: 0, z: 0 });
    });

    test('clamp and lerp restrict and interpolate numbers', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-2, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
        assert.equal(lerp(10, 20, 0.5), 15);
        assert.equal(lerp(10, 20, -1), 10);
        assert.equal(lerp(10, 20, 2), 20);
    });
});

describe('magnetic-loot: spring-damper magnetic attraction curves', () => {
    test('computeSpringDamperForce pulls directly toward target when at rest', () => {
        const pos = vec3(0, 0, 0);
        const vel = vec3(0, 0, 0);
        const target = vec3(5, 0, 0);

        const force = computeSpringDamperForce(pos, vel, target, 40.0, 10.0);
        assert.ok(force.x > 0, 'force.x must be positive pulling toward target');
        assert.equal(force.y, 0);
        assert.equal(force.z, 0);
    });

    test('computeSpringDamperForce dampens opposing velocity to eliminate overshoot', () => {
        const pos = vec3(0, 0, 0);
        const vel = vec3(10, 0, 0); // moving rapidly toward target
        const target = vec3(1, 0, 0); // close to target

        // Spring: 1 * 40 = 40. Damping: -10 * 10 = -100. Total = -60
        const force = computeSpringDamperForce(pos, vel, target, 40.0, 10.0, 0);
        assert.ok(force.x < 0, 'Damping must oppose excessive velocity near target to prevent erratic overshoot');
    });

    test('computeSpringDamperForce enforces baseline acceleration at long distance', () => {
        const pos = vec3(0, 0, 0);
        const vel = vec3(0, 0, 0);
        const target = vec3(0.01, 0, 0);

        const force = computeSpringDamperForce(pos, vel, target, 1.0, 0, 8.0);
        const mag = Math.hypot(force.x, force.y, force.z);
        assert.ok(mag >= 8.0, 'Baseline pull acceleration must be maintained');
    });
});

describe('magnetic-loot: combo pickup pitch escalation (1.0x -> 1.8x)', () => {
    test('calculateComboPitch starts at 1.0x and escalates smoothly', () => {
        assert.equal(calculateComboPitch(0), 1.0);
        assert.equal(calculateComboPitch(-1), 1.0);
        assert.equal(calculateComboPitch(1), 1.08);
        assert.equal(calculateComboPitch(5), 1.4);
    });

    test('calculateComboPitch caps strictly at 1.8x max pitch', () => {
        assert.equal(calculateComboPitch(10), 1.8);
        assert.equal(calculateComboPitch(50), 1.8);
    });

    test('createComboTracker and registerComboPickup manage escalating combo chain', () => {
        const tracker = createComboTracker(1000);
        assert.equal(tracker.count, 0);
        assert.equal(tracker.currentPitch, 1.0);

        // First pickup at t = 100ms
        const p1 = registerComboPickup(tracker, 100);
        assert.equal(p1.count, 1);
        assert.equal(p1.pitch, 1.0);
        assert.equal(p1.isNewCombo, true);

        // Second rapid pickup at t = 300ms
        const p2 = registerComboPickup(tracker, 300);
        assert.equal(p2.count, 2);
        assert.equal(p2.pitch, 1.08);
        assert.equal(p2.isNewCombo, false);

        // 10th rapid pickup escalates up towards 1.8x
        for (let i = 3; i <= 12; i++) {
            registerComboPickup(tracker, 300 + i * 50);
        }
        assert.equal(tracker.count, 12);
        assert.equal(tracker.currentPitch, 1.8);
    });

    test('combo resets to baseline 1.0x pitch after timeout window', () => {
        const tracker = createComboTracker(500); // 500ms timeout
        registerComboPickup(tracker, 100);
        registerComboPickup(tracker, 200);
        assert.equal(tracker.count, 2);
        assert.ok(tracker.currentPitch > 1.0);

        // Step past 500ms window (t = 800ms)
        stepComboTracker(tracker, 800);
        assert.equal(tracker.count, 0);
        assert.equal(tracker.currentPitch, 1.0);

        // Next pickup starts a new combo chain
        const fresh = registerComboPickup(tracker, 850);
        assert.equal(fresh.count, 1);
        assert.equal(fresh.pitch, 1.0);
        assert.equal(fresh.isNewCombo, true);
    });
});

describe('magnetic-loot: pinata fountain burst physics', () => {
    test('spawnPinataBurst generates coins and planks with fountain velocities', () => {
        const burst = spawnPinataBurst({
            sourceId: 'barricade_1',
            sourceType: 'barricade',
            origin: { x: 0, y: 1.5, z: -100 },
            coinCount: 6,
            plankCount: 2,
            seed: 777,
        });

        assert.equal(burst.length, 8);
        const coins = burst.filter((i) => i.type === 'coin');
        const planks = burst.filter((i) => i.type === 'hull-plank');
        assert.equal(coins.length, 6);
        assert.equal(planks.length, 2);

        // Verify fountain trajectories (radial burst + positive upward launch)
        for (const item of burst) {
            assert.ok(item.velocity.y > 0, 'Every fountain item must burst upwards');
            const radialSpeed = Math.hypot(item.velocity.x, item.velocity.z);
            assert.ok(radialSpeed > 2.0, 'Every fountain item must have radial dispersion');
            assert.equal(item.sourceId, 'barricade_1');
            assert.equal(item.collected, false);
        }
    });

    test('spawnPinataBurst is deterministic for identical seeds', () => {
        const burstA = spawnPinataBurst({ seed: 42, origin: { x: 2, y: 1, z: -50 } });
        const burstB = spawnPinataBurst({ seed: 42, origin: { x: 2, y: 1, z: -50 } });

        assert.equal(burstA.length, burstB.length);
        assert.deepEqual(burstA[0].velocity, burstB[0].velocity);
        assert.deepEqual(burstA[0].position, burstB[0].position);
    });

    test('handleSmashPinata configures appropriate rewards by source type', () => {
        // Barrel: 6 coins, 2 planks
        const barrelBurst = handleSmashPinata({ id: 'barrel_1', x: 0, y: 1, z: -10 }, 'barrel');
        assert.equal(barrelBurst.filter((i) => i.type === 'coin').length, 6);
        assert.equal(barrelBurst.filter((i) => i.type === 'hull-plank').length, 2);

        // Barricade: 10 coins, 4 planks
        const barricadeBurst = handleSmashPinata({ id: 'barricade_1', x: 0, y: 1, z: -20 }, 'barricade');
        assert.equal(barricadeBurst.filter((i) => i.type === 'coin').length, 10);
        assert.equal(barricadeBurst.filter((i) => i.type === 'hull-plank').length, 4);

        // Enemy: 8 coins, 1 plank
        const enemyBurst = handleSmashPinata({ id: 'enemy_1', x: 0, y: 1, z: -30 }, 'enemy');
        assert.equal(enemyBurst.filter((i) => i.type === 'coin').length, 8);
        assert.equal(enemyBurst.filter((i) => i.type === 'hull-plank').length, 1);
    });

    test('handleSmashPinata returns empty array for null source', () => {
        assert.deepEqual(handleSmashPinata(null, 'barrel'), []);
    });
});

describe('magnetic-loot: target raft detection and single item step', () => {
    test('findNearestRaft selects closest living player raft within magnet radius', () => {
        const itemPos = { x: 0, y: 0.5, z: -100 };
        const rafts = [
            { id: 'p1', health: 100, isDead: false, craft: { position: { x: 0, y: 0.5, z: -120 } } }, // 20m away (out of 9.5m radius)
            { id: 'p2', health: 100, isDead: false, craft: { position: { x: 2, y: 0.5, z: -103 } } }, // ~3.6m away
            { id: 'dead_guy', health: 0, isDead: true, craft: { position: { x: 0, y: 0.5, z: -100.5 } } }, // dead, ignore
        ];

        const nearest = findNearestRaft(itemPos, rafts, 9.5);
        assert.ok(nearest);
        assert.equal(nearest.raft.id, 'p2');
        assert.ok(nearest.distance < 4.0);
    });

    test('findNearestRaft returns null when all rafts are outside magnet radius', () => {
        const itemPos = { x: 0, y: 0.5, z: -100 };
        const rafts = [
            { id: 'p1', health: 100, isDead: false, position: { x: 50, y: 0.5, z: -100 } },
        ];
        assert.equal(findNearestRaft(itemPos, rafts, 9.5), null);
    });

    test('stepMagneticLootItem applies gravity and settles on water surface when no raft in range', () => {
        const item = createMagneticLootItem({
            id: 'item_1',
            type: 'coin',
            position: { x: 0, y: 3.0, z: -50 },
            velocity: { x: 0, y: 0, z: 0 },
        });

        // Step 1s in air
        for (let i = 0; i < 20; i++) {
            stepMagneticLootItem(item, 0.05, []);
        }

        assert.equal(item.homing, false);
        assert.equal(item.onWater, true);
        assert.ok(item.position.y <= MAGNETIC_LOOT_CONSTANTS.WATER_SURFACE_Y + 0.1);
        assert.ok(item.velocity.z < 0, 'Drifts downstream on river current');
    });

    test('stepMagneticLootItem homes in toward nearby raft and triggers collection', () => {
        const item = createMagneticLootItem({
            id: 'item_coin',
            type: 'coin',
            position: { x: 0, y: 0.25, z: -50 },
            velocity: { x: 0, y: 0, z: 0 },
        });

        const raft = {
            id: 'player_raft',
            health: 80,
            maxHealth: 100,
            coins: 10,
            craft: { position: { x: 0, y: 0.5, z: -53 } }, // 3m away (within magnet radius 9.5m)
        };

        // Advance simulation: item should home toward raft and get collected
        let collected = false;
        for (let i = 0; i < 30; i++) {
            const res = stepMagneticLootItem(item, 0.05, [raft]);
            if (res.collected) {
                collected = true;
                assert.equal(res.collectorRaft.id, 'player_raft');
                break;
            }
        }

        assert.equal(collected, true, 'Item should be collected after magnetic homing');
        assert.equal(item.collected, true);
        assert.equal(item.collectedBy, 'player_raft');
    });

    test('stepMagneticLootItem expires when age surpasses lifetime', () => {
        const item = createMagneticLootItem({
            id: 'old_item',
            position: { x: 0, y: 0.25, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            lifetime: 2.0,
        });

        const res = stepMagneticLootItem(item, 2.1, []);
        assert.equal(res.expired, true);
    });
});

describe('magnetic-loot: full simulation manager & smash integration', () => {
    test('stepMagneticLootSimulation resolves coin and hull-repair collections with combo pitch', () => {
        const manager = createMagneticLootManager();
        const player = {
            id: 'captain_viking',
            coins: 0,
            health: 50,
            maxHealth: 100,
            craft: { position: { x: 0, y: 0.5, z: -10 } },
        };

        // Spawn a burst near player
        const items = spawnPinataBurst({
            sourceId: 'smash_crate',
            origin: { x: 0, y: 1.0, z: -12 },
            coinCount: 3,
            plankCount: 1,
            seed: 99,
        });
        manager.items.push(...items);

        let totalEvents = [];
        // Step 60Hz ticks for 1.5 seconds (90 ticks)
        for (let t = 0; t < 90; t++) {
            const nowMs = t * 16.6;
            const res = stepMagneticLootSimulation(manager, [player], 0.0166, nowMs, t * 0.0166);
            if (res.events.length > 0) {
                totalEvents.push(...res.events);
            }
        }

        assert.ok(totalEvents.length >= 3, 'Multiple loot items should have been magnetically collected');
        assert.ok(player.coins > 0, 'Player should have earned gold coins');
        assert.ok(player.health > 50, 'Player hull health should have been repaired by plank');

        // Check combo audio pitch escalation across consecutive events
        const pitches = totalEvents.map((e) => e.audioPitch);
        assert.ok(pitches[0] >= 1.0);
        if (pitches.length > 1) {
            assert.ok(pitches[pitches.length - 1] > pitches[0], 'Audio pitch should escalate on combo pickups');
        }
    });

    test('stepMagneticLootSimulation isolates combo tracking across multiple rafts', () => {
        const manager = createMagneticLootManager();
        const raft1 = { id: 'raft_1', coins: 0, health: 100, position: { x: -20, y: 0.5, z: 0 } };
        const raft2 = { id: 'raft_2', coins: 0, health: 100, position: { x: 20, y: 0.5, z: 0 } };

        // Item at raft 1
        manager.items.push(createMagneticLootItem({
            id: 'c1',
            type: 'coin',
            position: { x: -20, y: 0.5, z: -0.5 },
            velocity: { x: 0, y: 0, z: 0 },
        }));

        // Item at raft 2
        manager.items.push(createMagneticLootItem({
            id: 'c2',
            type: 'coin',
            position: { x: 20, y: 0.5, z: -0.5 },
            velocity: { x: 0, y: 0, z: 0 },
        }));

        const res = stepMagneticLootSimulation(manager, [raft1, raft2], 0.05, 100, 0.1);
        assert.equal(res.events.length, 2);

        const event1 = res.events.find((e) => e.collectorRaftId === 'raft_1');
        const event2 = res.events.find((e) => e.collectorRaftId === 'raft_2');
        assert.ok(event1);
        assert.ok(event2);
        assert.equal(event1.comboCount, 1);
        assert.equal(event2.comboCount, 1);
    });

    test('stepMagneticLootSimulation respects maxHealth ceiling during plank repair', () => {
        const manager = createMagneticLootManager();
        const raft = {
            id: 'full_hp_raft',
            coins: 0,
            health: 98,
            maxHealth: 100,
            position: { x: 0, y: 0.5, z: 0 },
        };

        manager.items.push(createMagneticLootItem({
            id: 'plank_1',
            type: 'hull-plank',
            value: 20,
            position: { x: 0, y: 0.5, z: -0.5 },
            velocity: { x: 0, y: 0, z: 0 },
        }));

        const res = stepMagneticLootSimulation(manager, [raft], 0.05, 100, 0.1);
        assert.equal(res.events.length, 1);
        assert.equal(raft.health, 100);
        assert.equal(res.events[0].healthRestored, 2); // only 2 HP repaired to cap at maxHealth
    });
});
