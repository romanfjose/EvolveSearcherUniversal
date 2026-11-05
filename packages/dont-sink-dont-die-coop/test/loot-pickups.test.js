import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    PICKUP_TYPES,
    PICKUP_CATEGORIES,
    PICKUP_DEFINITIONS,
    createPickup,
    generateRiverLoot,
    canCollectPickup,
    applyPickupCollection,
    useTemporaryWeapon,
    isTemporaryWeaponActive,
    stepLootPickups,
} from '../shared/loot-pickups.js';

import {
    createLootPickupMesh,
    animateLootPickupMesh,
    triggerLootPickupCollection,
} from '../public/js/entities/loot-mesh.js';

/**
 * Headless mock Three.js factory for testing loot-mesh.js without browser or DOM
 */
function createMockTHREE() {
    class MockVector3 {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x; this.y = y; this.z = z;
        }
        set(x, y, z) {
            this.x = x; this.y = y; this.z = z; return this;
        }
        setScalar(s) {
            this.x = s; this.y = s; this.z = s; return this;
        }
    }

    class MockEuler {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x; this.y = y; this.z = z;
        }
        set(x, y, z) {
            this.x = x; this.y = y; this.z = z; return this;
        }
    }

    class MockObject3D {
        constructor() {
            this.position = new MockVector3();
            this.rotation = new MockEuler();
            this.scale = new MockVector3(1, 1, 1);
            this.children = [];
            this.name = '';
            this.visible = true;
            this.castShadow = false;
            this.userData = {};
        }
        add(...objs) {
            for (const obj of objs) {
                if (obj) this.children.push(obj);
            }
            return this;
        }
        getObjectByName(name) {
            if (this.name === name) return this;
            for (const child of this.children) {
                const found = child.getObjectByName(name);
                if (found) return found;
            }
            return null;
        }
    }

    class MockGroup extends MockObject3D {
        constructor() { super(); this.type = 'Group'; }
    }

    class MockMesh extends MockObject3D {
        constructor(geometry, material) {
            super();
            this.type = 'Mesh';
            this.geometry = geometry;
            this.material = material;
        }
    }

    class MockMaterial {
        constructor(params = {}) {
            Object.assign(this, params);
        }
    }

    class MockGeometry {
        constructor(type, ...args) {
            this.type = type;
            this.args = args;
        }
    }

    return {
        Group: MockGroup,
        Mesh: MockMesh,
        MeshStandardMaterial: class extends MockMaterial {},
        MeshBasicMaterial: class extends MockMaterial {},
        BoxGeometry: class extends MockGeometry { constructor(...a) { super('BoxGeometry', ...a); } },
        CylinderGeometry: class extends MockGeometry { constructor(...a) { super('CylinderGeometry', ...a); } },
        SphereGeometry: class extends MockGeometry { constructor(...a) { super('SphereGeometry', ...a); } },
        TorusGeometry: class extends MockGeometry { constructor(...a) { super('TorusGeometry', ...a); } },
        ConeGeometry: class extends MockGeometry { constructor(...a) { super('ConeGeometry', ...a); } },
        DodecahedronGeometry: class extends MockGeometry { constructor(...a) { super('DodecahedronGeometry', ...a); } },
        OctahedronGeometry: class extends MockGeometry { constructor(...a) { super('OctahedronGeometry', ...a); } },
    };
}

describe('Loot pickup types and definitions', () => {
    it('defines all 6 required pickup types', () => {
        const required = [
            PICKUP_TYPES.CHEST,
            PICKUP_TYPES.COIN_STREAM,
            PICKUP_TYPES.REPAIR_KIT,
            PICKUP_TYPES.WEAPON_LIGHTNING_OAR,
            PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL,
            PICKUP_TYPES.WEAPON_FROST_WARHAMMER,
        ];
        for (const type of required) {
            assert.ok(PICKUP_DEFINITIONS[type], `Missing definition for ${type}`);
            assert.equal(PICKUP_DEFINITIONS[type].type, type);
        }
    });

    it('categorizes treasure, consumables, and weapons appropriately', () => {
        assert.equal(PICKUP_DEFINITIONS[PICKUP_TYPES.CHEST].category, PICKUP_CATEGORIES.TREASURE);
        assert.equal(PICKUP_DEFINITIONS[PICKUP_TYPES.COIN_STREAM].category, PICKUP_CATEGORIES.TREASURE);
        assert.equal(PICKUP_DEFINITIONS[PICKUP_TYPES.REPAIR_KIT].category, PICKUP_CATEGORIES.CONSUMABLE);
        assert.equal(PICKUP_DEFINITIONS[PICKUP_TYPES.WEAPON_LIGHTNING_OAR].category, PICKUP_CATEGORIES.WEAPON);
        assert.equal(PICKUP_DEFINITIONS[PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL].category, PICKUP_CATEGORIES.WEAPON);
        assert.equal(PICKUP_DEFINITIONS[PICKUP_TYPES.WEAPON_FROST_WARHAMMER].category, PICKUP_CATEGORIES.WEAPON);
    });

    it('each pickup definition provides valid numbers for radii, heights, and hex colors', () => {
        for (const [key, def] of Object.entries(PICKUP_DEFINITIONS)) {
            assert.ok(def.collectionRadius > 1.0, `${key} radius must be > 1.0`);
            assert.ok(def.heightOffset >= 0, `${key} heightOffset must be non-negative`);
            assert.ok(typeof def.colorHex === 'number', `${key} colorHex must be a number`);
            assert.ok(typeof def.auraColorHex === 'number', `${key} auraColorHex must be a number`);
        }
    });

    it('temporary weapons have positive durations, maxUses, and damage values', () => {
        const weapons = [
            PICKUP_DEFINITIONS[PICKUP_TYPES.WEAPON_LIGHTNING_OAR],
            PICKUP_DEFINITIONS[PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL],
            PICKUP_DEFINITIONS[PICKUP_TYPES.WEAPON_FROST_WARHAMMER],
        ];
        for (const w of weapons) {
            assert.ok(w.durationMs >= 10000, `${w.type} durationMs should be at least 10s`);
            assert.ok(w.maxUses >= 3, `${w.type} maxUses should be at least 3`);
            assert.ok(w.damage >= 30, `${w.type} damage should be at least 30`);
        }
    });
});

describe('createPickup instance constructor', () => {
    it('creates a pickup instance with correct coordinate offsets and properties', () => {
        const p = createPickup('loot_1', PICKUP_TYPES.CHEST, { x: 5, y: 0.25, z: -100 });
        assert.equal(p.id, 'loot_1');
        assert.equal(p.type, PICKUP_TYPES.CHEST);
        assert.equal(p.position.x, 5);
        assert.equal(p.position.z, -100);
        assert.ok(p.position.y > 0.25, 'y should include heightOffset');
        assert.equal(p.collected, false);
        assert.equal(p.surface, 'water');
    });

    it('throws error when creating an unknown pickup type', () => {
        assert.throws(() => {
            createPickup('loot_err', 'unknown_type', { x: 0, y: 0, z: 0 });
        }, /Unknown pickup type/);
    });
});

describe('generateRiverLoot deterministic seeded spawner', () => {
    const mockPlanks = [
        { type: 'plank', id: 'plank_1', x: -8, z: -200, halfW: 2, halfD: 1.5, topY: 1.6 },
        { type: 'plank', id: 'plank_2', x: 7, z: -450, halfW: 2.5, halfD: 1.5, topY: 1.8 },
        { type: 'plank', id: 'plank_3', x: -5, z: -700, halfW: 2, halfD: 2, topY: 1.5 },
        { type: 'plank', id: 'plank_4', x: 6, z: -1100, halfW: 3, halfD: 1.5, topY: 1.7 },
    ];

    it('produces identical output for identical seeds', () => {
        const lootA = generateRiverLoot({ seed: 12345, obstacles: mockPlanks, count: 40 });
        const lootB = generateRiverLoot({ seed: 12345, obstacles: mockPlanks, count: 40 });
        assert.equal(lootA.length, lootB.length);
        assert.deepEqual(lootA, lootB);
    });

    it('produces different placements for different seeds', () => {
        const loot1 = generateRiverLoot({ seed: 111, obstacles: mockPlanks, count: 40 });
        const loot2 = generateRiverLoot({ seed: 999, obstacles: mockPlanks, count: 40 });
        assert.notDeepEqual(loot1[0].position, loot2[0].position);
    });

    it('spawns high-tier loot atop elevated wooden plank obstacles', () => {
        const loot = generateRiverLoot({ seed: 777, obstacles: mockPlanks, count: 30 });
        const plankLoot = loot.filter((p) => p.surface === 'plank');
        assert.ok(plankLoot.length > 0, 'Should spawn at least one reward on planks');

        for (const p of plankLoot) {
            assert.equal(p.surface, 'plank');
            assert.ok(p.sourceObstacleId, 'Should track source obstacle ID');
            assert.ok(p.position.y >= 1.5, `Plank pickup y should be elevated: ${p.position.y}`);
            // Planks favor weapons and treasure
            assert.ok(
                [
                    PICKUP_TYPES.WEAPON_LIGHTNING_OAR,
                    PICKUP_TYPES.WEAPON_FROST_WARHAMMER,
                    PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL,
                    PICKUP_TYPES.CHEST,
                ].includes(p.type)
            );
        }
    });

    it('restricts water pickup positions within river channel width', () => {
        const riverWidth = 30;
        const halfW = riverWidth * 0.5;
        const loot = generateRiverLoot({ seed: 42, obstacles: mockPlanks, riverWidth, count: 45 });
        const waterLoot = loot.filter((p) => p.surface === 'water');

        for (const p of waterLoot) {
            assert.ok(
                Math.abs(p.position.x) < halfW,
                `Water pickup x ${p.position.x} out of river channel ${halfW}`
            );
        }
    });

    it('orders generated pickups downriver by descending Z', () => {
        const loot = generateRiverLoot({ seed: 42, obstacles: mockPlanks, count: 30 });
        for (let i = 1; i < loot.length; i++) {
            assert.ok(
                loot[i].position.z <= loot[i - 1].position.z,
                `Loot not sorted downriver: z[${i}] = ${loot[i].position.z} vs z[${i-1}] = ${loot[i - 1].position.z}`
            );
        }
    });
});

describe('canCollectPickup 3D distance and height mechanics', () => {
    const waterPickup = createPickup('p1', PICKUP_TYPES.CHEST, { x: 0, y: 0.25, z: -50 });
    const elevatedPlankPickup = createPickup('p2', PICKUP_TYPES.WEAPON_LIGHTNING_OAR, { x: 5, y: 1.8, z: -100 }, 'plank');

    it('allows collection when player is horizontally and vertically close', () => {
        const playerPos = { x: 0.5, y: 0.25, z: -50.2 };
        assert.equal(canCollectPickup(playerPos, waterPickup.position, waterPickup.radius), true);
    });

    it('rejects collection when player is too far horizontally', () => {
        const playerPos = { x: 5.0, y: 0.25, z: -50.0 };
        assert.equal(canCollectPickup(playerPos, waterPickup.position, waterPickup.radius), false);
    });

    it('rewards jumping onto elevated planks and prevents ground raft from reaching plank loot from below', () => {
        // Floating raft on water (y = 0.25) cannot reach elevated plank pickup (y = 2.25)
        const waterRaftPos = { x: 5.0, y: 0.25, z: -100 };
        assert.equal(canCollectPickup(waterRaftPos, elevatedPlankPickup.position, 2.5, 1.0), false);

        // Player jumping or atop the plank (y = 1.9) collects it successfully!
        const elevatedPlayerPos = { x: 5.1, y: 1.9, z: -100.1 };
        assert.equal(canCollectPickup(elevatedPlayerPos, elevatedPlankPickup.position, 2.5, 1.0), true);
    });
});

describe('applyPickupCollection mechanics', () => {
    it('awards 40 gold coins for Sunken Treasure Chest', () => {
        const player = { id: 'p1', coins: 10, health: 100, maxHealth: 100 };
        const chest = createPickup('c1', PICKUP_TYPES.CHEST, { x: 0, y: 0, z: -50 });

        const outcome = applyPickupCollection(player, chest, 1000);
        assert.equal(outcome.success, true);
        assert.equal(outcome.coinsAwarded, 40);
        assert.equal(player.coins, 50);
        assert.equal(chest.collected, true);
        assert.equal(chest.collectedBy, 'p1');
        assert.equal(chest.collectedAt, 1000);
    });

    it('awards 12 gold coins for Gold Coin Stream', () => {
        const player = { id: 'p1', coins: 0, health: 100, maxHealth: 100 };
        const stream = createPickup('s1', PICKUP_TYPES.COIN_STREAM, { x: 0, y: 0, z: -60 });

        const outcome = applyPickupCollection(player, stream, 2000);
        assert.equal(outcome.coinsAwarded, 12);
        assert.equal(player.coins, 12);
    });

    it('repairs raft HP up to maxHealth with Repair Kit', () => {
        const player = { id: 'p1', coins: 0, health: 50, maxHealth: 100 };
        const kit = createPickup('k1', PICKUP_TYPES.REPAIR_KIT, { x: 0, y: 0, z: -70 });

        const outcome = applyPickupCollection(player, kit, 3000);
        assert.equal(outcome.healthRestored, 40);
        assert.equal(player.health, 90);

        // Second kit heals up to maxHealth (clamped at 100)
        const kit2 = createPickup('k2', PICKUP_TYPES.REPAIR_KIT, { x: 0, y: 0, z: -80 });
        const outcome2 = applyPickupCollection(player, kit2, 3500);
        assert.equal(outcome2.healthRestored, 10);
        assert.equal(player.health, 100);
    });

    it('equips temporary weapon with correct timer and charges', () => {
        const player = { id: 'p1', coins: 0, health: 100, maxHealth: 100 };
        const pickup = createPickup('w1', PICKUP_TYPES.WEAPON_LIGHTNING_OAR, { x: 0, y: 0, z: -90 });

        const now = 5000;
        const outcome = applyPickupCollection(player, pickup, now);
        assert.equal(outcome.success, true);
        assert.ok(player.temporaryWeapon);
        assert.equal(player.temporaryWeapon.type, PICKUP_TYPES.WEAPON_LIGHTNING_OAR);
        assert.equal(player.temporaryWeapon.usesLeft, 6);
        assert.equal(player.temporaryWeapon.damage, 35);
        assert.equal(player.temporaryWeapon.speedBonus, 50);
        assert.equal(player.temporaryWeapon.expiresAt, now + 15000);
    });

    it('refuses collection on already collected pickup', () => {
        const player = { id: 'p1', coins: 10 };
        const chest = createPickup('c1', PICKUP_TYPES.CHEST, { x: 0, y: 0, z: -50 });
        applyPickupCollection(player, chest);

        const outcome2 = applyPickupCollection(player, chest);
        assert.equal(outcome2.success, false);
        assert.equal(outcome2.reason, 'already-collected-or-invalid');
    });
});

describe('Temporary weapon usage and expiry', () => {
    it('consumes uses until spent', () => {
        const player = {
            id: 'p1',
            temporaryWeapon: {
                type: PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL,
                usesLeft: 2,
                expiresAt: 20000,
                damage: 75,
            },
        };

        const res1 = useTemporaryWeapon(player, 1000);
        assert.equal(res1.active, true);
        assert.equal(res1.usesRemaining, 1);
        assert.equal(res1.spent, false);
        assert.equal(isTemporaryWeaponActive(player, 1000), true);

        const res2 = useTemporaryWeapon(player, 2000);
        assert.equal(res2.active, true);
        assert.equal(res2.usesRemaining, 0);
        assert.equal(res2.spent, true);
        assert.equal(player.temporaryWeapon, null);
        assert.equal(isTemporaryWeaponActive(player, 2000), false);
    });

    it('expires after durationMs elapses', () => {
        const player = {
            id: 'p1',
            temporaryWeapon: {
                type: PICKUP_TYPES.WEAPON_FROST_WARHAMMER,
                usesLeft: 5,
                expiresAt: 10000,
                damage: 55,
            },
        };

        assert.equal(isTemporaryWeaponActive(player, 9999), true);
        assert.equal(isTemporaryWeaponActive(player, 10001), false);

        const res = useTemporaryWeapon(player, 10005);
        assert.equal(res.active, false);
        assert.equal(res.expired, true);
        assert.equal(player.temporaryWeapon, null);
    });
});

describe('stepLootPickups tick loop helper', () => {
    it('processes player collisions and generates event payloads', () => {
        const p1 = { id: 'player_1', position: { x: 0, y: 0.25, z: -50 }, coins: 0, isDead: false };
        const p2 = { id: 'player_2', position: { x: 20, y: 0.25, z: -200 }, coins: 0, isDead: false };

        const pickups = [
            createPickup('loot_a', PICKUP_TYPES.CHEST, { x: 0.2, y: 0.25, z: -50.1 }),
            createPickup('loot_b', PICKUP_TYPES.COIN_STREAM, { x: 20, y: 0.25, z: -100 }), // Out of range
        ];

        const events = stepLootPickups(pickups, { player_1: p1, player_2: p2 }, 12000);
        assert.equal(events.length, 1);
        assert.equal(events[0].pickupId, 'loot_a');
        assert.equal(events[0].playerId, 'player_1');
        assert.equal(p1.coins, 40);
        assert.equal(pickups[0].collected, true);
        assert.equal(pickups[1].collected, false);
    });

    it('ignores dead players for pickup collection', () => {
        const deadPlayer = { id: 'p_dead', position: { x: 0, y: 0.25, z: -50 }, coins: 0, isDead: true };
        const pickups = [createPickup('loot_a', PICKUP_TYPES.CHEST, { x: 0, y: 0.25, z: -50 })];

        const events = stepLootPickups(pickups, { p_dead: deadPlayer }, 1000);
        assert.equal(events.length, 0);
        assert.equal(pickups[0].collected, false);
    });
});

describe('Three.js Loot Mesh Builder (loot-mesh.js)', () => {
    const mockTHREE = createMockTHREE();

    it('builds valid Three.js mesh groups for all 6 pickup types', () => {
        for (const type of Object.values(PICKUP_TYPES)) {
            const mesh = createLootPickupMesh(mockTHREE, type);
            assert.equal(mesh.type, 'Group');
            assert.equal(mesh.name, `Pickup_${type}`);
            assert.ok(mesh.getObjectByName('BobGroup'));
            assert.ok(mesh.getObjectByName('AuraRing'));
            assert.ok(mesh.getObjectByName('InnerAuraRing'));
            assert.ok(mesh.getObjectByName('BeaconCore'));
            assert.ok(mesh.getObjectByName('Model'));
            assert.equal(mesh.userData.pickupType, type);
        }
    });

    it('treasure chest mesh contains box coffer, rounded lid, and gold latch', () => {
        const chest = createLootPickupMesh(mockTHREE, PICKUP_TYPES.CHEST);
        const model = chest.getObjectByName('Model');
        assert.ok(model.children.length >= 4);
        const boxGeo = model.children.find((c) => c.geometry?.type === 'BoxGeometry');
        const cylGeo = model.children.find((c) => c.geometry?.type === 'CylinderGeometry');
        assert.ok(boxGeo, 'Chest missing Box coffer');
        assert.ok(cylGeo, 'Chest missing rounded Cylinder lid');
    });

    it('gold coin stream mesh contains coin discs and sparkle glints', () => {
        const stream = createLootPickupMesh(mockTHREE, PICKUP_TYPES.COIN_STREAM);
        const model = stream.getObjectByName('Model');
        const coins = model.children.filter((c) => c.geometry?.type === 'CylinderGeometry');
        const sparkles = model.children.filter((c) => c.geometry?.type === 'OctahedronGeometry');
        assert.equal(coins.length, 3);
        assert.equal(sparkles.length, 3);
    });

    it('repair kit mesh contains toolbox, cross emblem, and brass handle', () => {
        const kit = createLootPickupMesh(mockTHREE, PICKUP_TYPES.REPAIR_KIT);
        const model = kit.getObjectByName('Model');
        const handle = model.children.find((c) => c.geometry?.type === 'TorusGeometry');
        assert.ok(handle, 'Repair kit missing Torus handle');
    });

    it('lightning oar mesh contains shaft, dual blades, and lightning coils', () => {
        const oar = createLootPickupMesh(mockTHREE, PICKUP_TYPES.WEAPON_LIGHTNING_OAR);
        const model = oar.getObjectByName('Model');
        const coils = model.children.filter((c) => c.geometry?.type === 'TorusGeometry');
        assert.equal(coils.length, 4);
    });

    it('explosive barrel mesh contains cylinder body, steel hoops, fuse, and spark', () => {
        const barrel = createLootPickupMesh(mockTHREE, PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL);
        const model = barrel.getObjectByName('Model');
        const spark = model.children.find((c) => c.geometry?.type === 'SphereGeometry');
        assert.ok(spark, 'Missing sizzling fuse spark');
    });

    it('frost warhammer mesh contains heavy haft, glacial head, and ice spikes', () => {
        const hammer = createLootPickupMesh(mockTHREE, PICKUP_TYPES.WEAPON_FROST_WARHAMMER);
        const model = hammer.getObjectByName('Model');
        const spikes = model.children.filter((c) => c.geometry?.type === 'ConeGeometry');
        assert.equal(spikes.length, 2);
    });

    it('animateLootPickupMesh bobs and rotates model and aura rings', () => {
        const mesh = createLootPickupMesh(mockTHREE, PICKUP_TYPES.CHEST);
        const bobGroup = mesh.getObjectByName('BobGroup');
        const aura = mesh.getObjectByName('AuraRing');

        const initialY = bobGroup.position.y;
        const initialRotY = bobGroup.rotation.y;
        const initialAuraRotZ = aura.rotation.z;

        animateLootPickupMesh(mesh, 0.1, 1.0);

        assert.notEqual(bobGroup.position.y, initialY);
        assert.notEqual(bobGroup.rotation.y, initialRotY);
        assert.notEqual(aura.rotation.z, initialAuraRotZ);
    });

    it('triggerLootPickupCollection initiates burst animation and hides mesh when completed', () => {
        const mesh = createLootPickupMesh(mockTHREE, PICKUP_TYPES.REPAIR_KIT);
        triggerLootPickupCollection(mesh);
        assert.equal(mesh.userData.isCollected, true);

        // Step animation until collection duration finishes
        for (let i = 0; i < 10; i++) {
            animateLootPickupMesh(mesh, 0.05, i * 0.05);
        }
        assert.equal(mesh.visible, false);
    });
});
