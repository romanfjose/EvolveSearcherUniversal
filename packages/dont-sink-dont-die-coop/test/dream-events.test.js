import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../shared/dream-events.js';
import * as DMesh from '../public/js/world/dream-events-mesh.js';

// Headless Mock of Three.js for procedural mesh builder unit tests
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
        DodecahedronGeometry: GeometryMock,
        MeshBasicMaterial: class {
            constructor(params = {}) {
                this.color = new Color(params.color);
                this.wireframe = !!params.wireframe;
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

describe('Dream Events: Constants & Definitions', () => {
    test('defines all 5 required surreal dream event types', () => {
        assert.equal(D.DREAM_EVENT_TYPES.CAPYBARA_HOTTUB, 'capybara-hottub-barge');
        assert.equal(D.DREAM_EVENT_TYPES.BUREAUCRATIC_SWAN, 'bureaucratic-swan-boat');
        assert.equal(D.DREAM_EVENT_TYPES.RUBBER_DUCKY_STAMPEDE, 'rubber-ducky-stampede');
        assert.equal(D.DREAM_EVENT_TYPES.GHOST_SHOPPING_CART, 'ghost-shopping-cart');
        assert.equal(D.DREAM_EVENT_TYPES.DISCO_CRAB_RAVE, 'disco-crab-rave-island');
    });

    test('constants match exact requirements', () => {
        assert.equal(D.DREAM_CONSTANTS.CAPYBARA.AURA_RADIUS, 7.0);
        assert.equal(D.DREAM_CONSTANTS.CAPYBARA.HEAL_PER_SECOND, 15.0);
        assert.equal(D.DREAM_CONSTANTS.CAPYBARA.CAPYBARA_COUNT, 3);
        assert.equal(D.DREAM_CONSTANTS.SWAN.TOLL_COIN_COST, 5);
        assert.equal(D.DREAM_CONSTANTS.SWAN.AUDIT_PINATA_REWARD, 25);
        assert.equal(D.DREAM_CONSTANTS.RUBBER_DUCKY.TOTAL_DUCKS, 30);
        assert.equal(D.DREAM_CONSTANTS.SHOPPING_CART.BOOST_DURATION_MS, 4000);
        assert.equal(D.DREAM_CONSTANTS.DISCO_CRAB.DOUBLE_COIN_DURATION_MS, 15000);
    });

    test('Mulberry32 PRNG is deterministic for any seed', () => {
        const rng1 = D.createRng(999);
        const rng2 = D.createRng(999);
        const seq1 = [rng1(), rng1(), rng1()];
        const seq2 = [rng2(), rng2(), rng2()];
        assert.deepEqual(seq1, seq2);
    });
});

describe('Dream Events: Capybara Hot-Tub Barge', () => {
    test('createCapybaraBarge initializes with 3 capybaras with tangerines', () => {
        const barge = D.createCapybaraBarge('barge_1', 0, -200);
        assert.equal(barge.type, 'capybara-hottub-barge');
        assert.equal(barge.radius, 7.0);
        assert.equal(barge.capybaras.length, 3);
        barge.capybaras.forEach((c) => {
            assert.equal(c.tangerine, true);
        });
    });

    test('evaluateCapybaraInteraction outside 7m radius does not heal or grant calm aura', () => {
        const barge = D.createCapybaraBarge('barge_1', 0, -200);
        const craft = { id: 'raft_1', position: { x: 10, z: -200 }, health: 50, maxHealth: 100 };
        const res = D.evaluateCapybaraInteraction(craft, barge, 0.1, 0);

        assert.equal(res.inside, false);
        assert.equal(res.calmAura, false);
        assert.equal(res.healedHp, 0);
        assert.equal(craft.health, 50);
    });

    test('evaluateCapybaraInteraction within 7m heals crew at +15 HP/s and grants calm aura', () => {
        const barge = D.createCapybaraBarge('barge_1', 0, -200);
        const craft = { id: 'raft_1', position: { x: 4, z: -200 }, health: 50, maxHealth: 100 };
        // 0.2s elapsed -> 15 * 0.2 = 3 HP
        const res = D.evaluateCapybaraInteraction(craft, barge, 0.2, 1000);

        assert.equal(res.inside, true);
        assert.equal(res.calmAura, true);
        assert.ok(Math.abs(res.healedHp - 3.0) < 1e-4);
        assert.ok(Math.abs(craft.health - 53.0) < 1e-4);
        assert.ok(res.calmDurationRemainingMs > 0);
    });

    test('capybara healing caps at craft maxHealth', () => {
        const barge = D.createCapybaraBarge('barge_1', 0, -200);
        const craft = { id: 'raft_1', position: { x: 0, z: -200 }, health: 98, maxHealth: 100 };
        const res = D.evaluateCapybaraInteraction(craft, barge, 1.0, 2000); // would heal 15

        assert.equal(craft.health, 100);
        assert.equal(res.healedHp, 2.0);
    });

    test('capybara barge tracks active guests by timestamp', () => {
        const barge = D.createCapybaraBarge('barge_1', 0, -200);
        const craft = { id: 'p_alpha', position: { x: 2, z: -200 } };
        D.evaluateCapybaraInteraction(craft, barge, 0.05, 5500);

        assert.equal(barge.activeGuests['p_alpha'], 5500);
    });
});

describe('Dream Events: Bureaucratic Swan Boat', () => {
    test('createBureaucraticSwan initializes in demanding state with 5-coin toll and 25-coin pinata', () => {
        const swan = D.createBureaucraticSwan('swan_1', 2, -300);
        assert.equal(swan.type, 'bureaucratic-swan-boat');
        assert.equal(swan.state, 'demanding');
        assert.equal(swan.tollCost, 5);
        assert.equal(swan.pinataReward, 25);
        assert.equal(swan.pinataCollected, false);
    });

    test('interactWithBureaucraticSwan out of range fails gracefully', () => {
        const swan = D.createBureaucraticSwan('swan_1', 0, -300);
        const player = { id: 'p1', position: { x: 20, z: -300 }, coins: 10 };
        const res = D.interactWithBureaucraticSwan(swan, player, { type: 'pay_toll' });

        assert.equal(res.success, false);
        assert.equal(res.reason, 'out-of-range');
    });

    test('paying toll succeeds when player has sufficient coins', () => {
        const swan = D.createBureaucraticSwan('swan_1', 0, -300);
        const player = { id: 'p1', position: { x: 1, z: -300 }, coins: 12 };
        const res = D.interactWithBureaucraticSwan(swan, player, { type: 'pay_toll' });

        assert.equal(res.success, true);
        assert.equal(res.state, 'permitted');
        assert.equal(player.coins, 7); // 12 - 5
        assert.equal(res.coinsTransferred, -5);
        assert.equal(res.hasPermit, true);
    });

    test('paying toll rejects if player has insufficient coins', () => {
        const swan = D.createBureaucraticSwan('swan_1', 0, -300);
        const player = { id: 'p1', position: { x: 1, z: -300 }, coins: 3 };
        const res = D.interactWithBureaucraticSwan(swan, player, { type: 'pay_toll' });

        assert.equal(res.success, false);
        assert.equal(res.reason, 'insufficient-coins');
        assert.equal(player.coins, 3);
    });

    test('paying toll twice does not double-charge player', () => {
        const swan = D.createBureaucraticSwan('swan_1', 0, -300);
        const player = { id: 'p1', position: { x: 1, z: -300 }, coins: 20 };
        D.interactWithBureaucraticSwan(swan, player, { type: 'pay_toll' });
        const res2 = D.interactWithBureaucraticSwan(swan, player, { type: 'pay_toll' });

        assert.equal(res2.success, true);
        assert.equal(res2.reason, 'already-permitted');
        assert.equal(player.coins, 15);
    });

    test('smashing toll booth drops 25-coin audit pinata when destroyed', () => {
        const swan = D.createBureaucraticSwan('swan_1', 0, -300, { boothHealth: 40 });
        const player = { id: 'p1', position: { x: 1, z: -300 }, coins: 10 };

        // Hit 1: 20 damage (health 40 -> 20)
        const hit1 = D.interactWithBureaucraticSwan(swan, player, { type: 'attack_booth', damage: 20 });
        assert.equal(hit1.success, true);
        assert.equal(hit1.remainingBoothHealth, 20);
        assert.equal(hit1.pinataDropped, false);
        assert.equal(player.coins, 10);

        // Hit 2: 25 damage (health 20 -> 0) -> Smashes & drops 25 coins!
        const hit2 = D.interactWithBureaucraticSwan(swan, player, { type: 'attack_booth', damage: 25 });
        assert.equal(hit2.success, true);
        assert.equal(hit2.state, 'smashed');
        assert.equal(hit2.pinataDropped, true);
        assert.equal(hit2.coinsAwarded, 25);
        assert.equal(player.coins, 35); // 10 + 25
    });

    test('further attacks on smashed booth do not drop duplicate pinatas', () => {
        const swan = D.createBureaucraticSwan('swan_1', 0, -300, { boothHealth: 10 });
        const player = { id: 'p1', position: { x: 1, z: -300 }, coins: 10 };
        D.interactWithBureaucraticSwan(swan, player, { type: 'attack_booth', damage: 20 });
        assert.equal(player.coins, 35);

        const extraHit = D.interactWithBureaucraticSwan(swan, player, { type: 'attack_booth', damage: 10 });
        assert.equal(extraHit.success, false);
        assert.equal(extraHit.reason, 'booth-already-smashed');
        assert.equal(player.coins, 35);
    });
});

describe('Dream Events: Rubber Ducky Stampede', () => {
    test('createRubberDuckyStampede spawns exactly 30 giant ducks', () => {
        const stampede = D.createRubberDuckyStampede('stampede_1', -400, 30, 42);
        assert.equal(stampede.type, 'rubber-ducky-stampede');
        assert.equal(stampede.ducks.length, 30);
    });

    test('duck positions are bounded within river width channel', () => {
        const riverW = 30;
        const stampede = D.createRubberDuckyStampede('stampede_1', -400, riverW, 123);
        const halfW = (riverW * 0.5) - 2.5;

        for (const duck of stampede.ducks) {
            assert.ok(Math.abs(duck.x) <= halfW + 1e-4);
            assert.ok(duck.radius > 0);
            assert.ok(duck.scale > 0.5);
        }
    });

    test('updateRubberDuckyStampede moves ducks downriver and bobs Y position', () => {
        const stampede = D.createRubberDuckyStampede('stampede_1', -400, 30, 777);
        const z0 = stampede.ducks[0].z;

        D.updateRubberDuckyStampede(stampede, 0.5, 1.0);
        assert.ok(stampede.ducks[0].z < z0, 'ducks should move downriver along -z');
        assert.ok(Number.isFinite(stampede.ducks[0].y));
    });

    test('evaluateDuckySpringboard acts as bouncy springboard when jumping on duck', () => {
        const stampede = D.createRubberDuckyStampede('stampede_1', -400, 30, 42);
        const targetDuck = stampede.ducks[5];

        const craft = {
            position: { x: targetDuck.x, y: 0.8, z: targetDuck.z },
            velocity: { x: 0, y: -5, z: -10 },
        };

        const res = D.evaluateDuckySpringboard(craft, stampede);
        assert.equal(res.bounced, true);
        assert.equal(res.hitDuckId, targetDuck.id);
        assert.equal(res.launchVelocityY, D.DREAM_CONSTANTS.RUBBER_DUCKY.BOUNCE_IMPULSE_Y);
        assert.equal(res.boostVelocityZ, D.DREAM_CONSTANTS.RUBBER_DUCKY.BOUNCE_BOOST_Z);
        assert.equal(craft.velocity.y, D.DREAM_CONSTANTS.RUBBER_DUCKY.BOUNCE_IMPULSE_Y);
        assert.equal(craft.velocity.z, D.DREAM_CONSTANTS.RUBBER_DUCKY.BOUNCE_BOOST_Z);
        assert.equal(targetDuck.bouncesCount, 1);
    });

    test('evaluateDuckySpringboard ignores craft when out of range', () => {
        const stampede = D.createRubberDuckyStampede('stampede_1', -400, 30, 42);
        const craft = {
            position: { x: 25, y: 0.5, z: -100 },
            velocity: { x: 0, y: 0, z: -10 },
        };

        const res = D.evaluateDuckySpringboard(craft, stampede);
        assert.equal(res.bounced, false);
        assert.equal(res.hitDuckId, null);
    });
});

describe('Dream Events: Ghost Shopping Cart', () => {
    test('createGhostShoppingCart initializes glowing unlatched cart', () => {
        const cart = D.createGhostShoppingCart('cart_1', 0, -500);
        assert.equal(cart.type, 'ghost-shopping-cart');
        assert.equal(cart.latched, false);
        assert.equal(cart.boostRemainingMs, 0);
        assert.equal(cart.exploded, false);
    });

    test('evaluateShoppingCartInteraction latches onto raft within 3.5m', () => {
        const cart = D.createGhostShoppingCart('cart_1', 1, -500);
        const craft = {
            id: 'raft_rocket',
            position: { x: 1.5, y: 0.25, z: -500.5 },
            velocity: { x: 0, y: 0, z: -10 },
        };

        const res = D.evaluateShoppingCartInteraction(cart, craft, 0.1, 1000);
        assert.equal(cart.latched, true);
        assert.equal(cart.latchedCraftId, 'raft_rocket');
        assert.equal(res.boosting, true);
        assert.ok(craft.velocity.z < -10, 'rocket thrust should accelerate raft forward (-z)');
    });

    test('boost lasts for 4 seconds then detonates into fireworks with bonus coins', () => {
        const cart = D.createGhostShoppingCart('cart_1', 0, -500);
        const craft = {
            id: 'raft_rocket',
            position: { x: 0, y: 0.25, z: -500 },
            velocity: { x: 0, y: 0, z: -10 },
            coins: 5,
        };

        // First frame: latch
        D.evaluateShoppingCartInteraction(cart, craft, 0.1, 0);
        assert.equal(cart.latched, true);

        // Step 3.8s (total 3.9s)
        const resMid = D.evaluateShoppingCartInteraction(cart, craft, 3.8, 3800);
        assert.equal(resMid.boosting, true);
        assert.equal(cart.exploded, false);

        // Step remaining 0.2s -> explodes!
        const resEnd = D.evaluateShoppingCartInteraction(cart, craft, 0.2, 4000);
        assert.equal(cart.exploded, true);
        assert.equal(resEnd.exploded, true);
        assert.equal(resEnd.bonusCoins, D.DREAM_CONSTANTS.SHOPPING_CART.DETONATION_COIN_BONUS);
        assert.equal(craft.coins, 15); // 5 + 10
    });

    test('exploded cart ignores further interactions', () => {
        const cart = D.createGhostShoppingCart('cart_1', 0, -500);
        cart.exploded = true;
        const craft = { position: { x: 0, z: -500 } };
        const res = D.evaluateShoppingCartInteraction(cart, craft, 0.1, 5000);

        assert.equal(res.boosting, false);
        assert.equal(res.bonusCoins, 0);
    });
});

describe('Dream Events: Disco Crab Rave Island', () => {
    test('createDiscoCrabRaveIsland creates sandbar with 8 neon crabs', () => {
        const island = D.createDiscoCrabRaveIsland('island_1', 3, -600);
        assert.equal(island.type, 'disco-crab-rave-island');
        assert.equal(island.radius, 6.0);
        assert.equal(island.crabs.length, 8);
    });

    test('evaluateCrabRaveRhythm rejects non-rhythm actions', () => {
        const island = D.createDiscoCrabRaveIsland('island_1', 0, -600);
        const res = D.evaluateCrabRaveRhythm(island, { type: 'jump' }, 1000);
        assert.equal(res.success, false);
        assert.equal(res.reason, 'invalid-action');
    });

    test('evaluateCrabRaveRhythm awards double coin drops for 15s if rhythm hit on beat', () => {
        const island = D.createDiscoCrabRaveIsland('island_1', 0, -600);
        // Beat is every 500ms (120 BPM). 1000ms is exactly on beat!
        const res = D.evaluateCrabRaveRhythm(island, { type: 'honk' }, 1000);

        assert.equal(res.success, true);
        assert.equal(res.onBeat, true);
        assert.equal(res.doubleCoinsActive, true);
        assert.equal(res.multiplier, 2.0);
        assert.equal(island.raveActive, true);
        assert.equal(island.raveEndTime, 1000 + 15000);
    });

    test('evaluateCrabRaveRhythm detects off-beat rhythm miss', () => {
        const island = D.createDiscoCrabRaveIsland('island_1', 0, -600);
        // 250ms is halfway between beats (max offset = 250ms > tolerance 180ms)
        const res = D.evaluateCrabRaveRhythm(island, { type: 'swing' }, 250);

        assert.equal(res.success, false);
        assert.equal(res.onBeat, false);
        assert.ok(res.offsetFromBeat > D.DREAM_CONSTANTS.DISCO_CRAB.RHYTHM_TOLERANCE_MS);
    });

    test('isDoubleCoinsActive reflects active rave timer', () => {
        const island = D.createDiscoCrabRaveIsland('island_1', 0, -600);
        assert.equal(D.isDoubleCoinsActive(island, 500), false);

        D.evaluateCrabRaveRhythm(island, { type: 'tap' }, 500); // hit beat
        assert.equal(D.isDoubleCoinsActive(island, 5000), true);
        assert.equal(D.isDoubleCoinsActive(island, 20000), false); // expired after 15s
    });
});

describe('Dream Events: Layout Generation & Unified Stepping', () => {
    test('generateDreamEncounters creates all 5 unique encounters deterministically', () => {
        const enc1 = D.generateDreamEncounters(12345, -1500, 30);
        const enc2 = D.generateDreamEncounters(12345, -1500, 30);

        assert.equal(enc1.length, 5);
        assert.deepEqual(enc1, enc2);

        const types = new Set(enc1.map((e) => e.type));
        assert.equal(types.size, 5);
        assert.ok(types.has('capybara-hottub-barge'));
        assert.ok(types.has('bureaucratic-swan-boat'));
        assert.ok(types.has('rubber-ducky-stampede'));
        assert.ok(types.has('ghost-shopping-cart'));
        assert.ok(types.has('disco-crab-rave-island'));
    });

    test('different seeds produce different encounter orderings or layouts', () => {
        const encA = D.generateDreamEncounters(111, -1500, 30);
        const encB = D.generateDreamEncounters(999, -1500, 30);
        assert.notDeepEqual(encA.map((e) => e.type), encB.map((e) => e.type));
    });

    test('encounters are distributed down the river channel', () => {
        const encounters = D.generateDreamEncounters(555, -1500, 30);
        for (const enc of encounters) {
            const z = enc.z !== undefined ? enc.z : enc.startZ;
            assert.ok(z < 0 && z > -1500);
            if (enc.x !== undefined) {
                assert.ok(Math.abs(enc.x) < 15);
            }
        }
    });

    test('stepDreamEncounters integrates multi-encounter gameplay step', () => {
        const encounters = D.generateDreamEncounters(42, -1500, 30);
        const craft = {
            id: 'raft_main',
            position: { x: 0, y: 0.25, z: -200 },
            velocity: { x: 0, y: 0, z: -10 },
            health: 80,
            maxHealth: 100,
            coins: 20,
        };

        const res = D.stepDreamEncounters(craft, encounters, 0.05, 1000);
        assert.ok(res !== null);
        assert.equal(typeof res.capybaraAura, 'boolean');
        assert.equal(typeof res.rocketBoosting, 'boolean');
    });
});

describe('Dream Events: Three.js Procedural Meshes & Animation', () => {
    const mockThree = createMockThree();

    test('createCapybaraBargeMesh builds cedar barge, tub, and 3 capybaras with tangerines', () => {
        const bargeCfg = D.createCapybaraBarge('barge_test', 0, -100);
        const mesh = DMesh.createCapybaraBargeMesh(mockThree, bargeCfg);

        assert.equal(mesh.userData.type, 'capybaraBarge');
        assert.equal(mesh.userData.capybaraModels.length, 3);
        assert.ok(mesh.userData.auraRing);
        assert.ok(mesh.children.length >= 4);
    });

    test('createBureaucraticSwanMesh builds pedal swan, toll booth, and audit pinata', () => {
        const swanCfg = D.createBureaucraticSwan('swan_test', 0, -200);
        const mesh = DMesh.createBureaucraticSwanMesh(mockThree, swanCfg);

        assert.equal(mesh.userData.type, 'bureaucraticSwan');
        assert.ok(mesh.userData.booth);
        assert.ok(mesh.userData.pinataGroup);
        assert.ok(mesh.userData.neck);
    });

    test('createRubberDuckyMesh and createStampedeGroup build 30 giant ducks', () => {
        const stampedeCfg = D.createRubberDuckyStampede('stampede_test', -300, 30, 42);
        const group = DMesh.createStampedeGroup(mockThree, stampedeCfg);

        assert.equal(group.userData.type, 'stampedeGroup');
        assert.equal(group.userData.duckMeshes.length, 30);
        assert.equal(group.children.length, 30);
    });

    test('createGhostShoppingCartMesh builds wireframe trolley and firework rockets', () => {
        const cartCfg = D.createGhostShoppingCart('cart_test', 0, -400);
        const mesh = DMesh.createGhostShoppingCartMesh(mockThree, cartCfg);

        assert.equal(mesh.userData.type, 'ghostShoppingCart');
        assert.ok(mesh.userData.basket);
        assert.ok(mesh.userData.boosterCone);
        assert.equal(mesh.userData.rockets.length, 5);
    });

    test('createDiscoCrabRaveMesh builds sandbar, palm tree, mirror ball, and 8 neon crabs', () => {
        const islandCfg = D.createDiscoCrabRaveIsland('island_test', 0, -500);
        const mesh = DMesh.createDiscoCrabRaveMesh(mockThree, islandCfg);

        assert.equal(mesh.userData.type, 'discoCrabRave');
        assert.ok(mesh.userData.discoBall);
        assert.equal(mesh.userData.crabMeshes.length, 8);
    });

    test('buildDreamEventsGroup aggregates all meshes and animateDreamEvents cycles without throw', () => {
        const encounters = D.generateDreamEncounters(42, -1500, 30);
        const handle = DMesh.buildDreamEventsGroup(mockThree, encounters);

        assert.ok(handle.root);
        assert.ok(handle.capybaraMeshes.length > 0);
        assert.ok(handle.swanMeshes.length > 0);
        assert.ok(handle.stampedeMeshes.length > 0);
        assert.ok(handle.cartMeshes.length > 0);
        assert.ok(handle.crabMeshes.length > 0);

        assert.doesNotThrow(() => {
            DMesh.animateDreamEvents(handle, 1.0, 0.016);
            DMesh.animateDreamEvents(handle, 2.5, 0.016);
        });
    });
});
