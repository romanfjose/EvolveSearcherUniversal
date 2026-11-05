import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../shared/game-core.js';
import {
    BOT_COMMAND_IDS,
    BOT_COMMAND_KEYS,
    BOT_ORDER_DEFINITIONS,
    getBotOrderDefinition,
    createBotOrderState,
    createCalloutBubble,
    isBubbleActive,
    getBubbleOpacity,
    getBubbleFloatingY,
    getBotOrderBark,
    issueBotOrder,
    updateBotOrderState,
    findPriorityBoss,
    findUpcomingCheckpointZ,
    findNearbyScavengeTarget,
    decideTacticalBotOrder,
    calculateTacticalBotSpeed,
    calculateTacticalBotBlockChance,
    getTacticalWheelItems,
} from '../shared/bot-orders.js';

function createMockCrewState({ humanZ = 0, bots = 2 } = {}) {
    const s = G.createGameState({ seed: 42 });
    G.addPlayer(s, 'leader', { name: 'Captain Mateo' });
    s.players.leader.position = { x: 0, y: G.PLAYER.restY, z: humanZ };
    for (let i = 0; i < bots; i++) {
        G.addPlayer(s, `bot_${i}`, { isBot: true });
        s.players[`bot_${i}`].position = { x: (i === 0 ? -4 : 4), y: G.PLAYER.restY, z: humanZ + 5 };
    }
    return s;
}

describe('Tactical Bot Orders: Command & Key Definitions', () => {
    test('defines 4 canonical command IDs', () => {
        assert.equal(BOT_COMMAND_IDS.FORM_UP, 'form-up');
        assert.equal(BOT_COMMAND_IDS.FOCUS_FIRE, 'focus-fire');
        assert.equal(BOT_COMMAND_IDS.SCAVENGE, 'scavenge');
        assert.equal(BOT_COMMAND_IDS.RUSH_CHECKPOINT, 'rush-checkpoint');
    });

    test('maps numerical hotkeys 1, 2, 3, 4 to respective commands', () => {
        assert.equal(BOT_COMMAND_KEYS['1'], BOT_COMMAND_IDS.FORM_UP);
        assert.equal(BOT_COMMAND_KEYS['2'], BOT_COMMAND_IDS.FOCUS_FIRE);
        assert.equal(BOT_COMMAND_KEYS['3'], BOT_COMMAND_IDS.SCAVENGE);
        assert.equal(BOT_COMMAND_KEYS['4'], BOT_COMMAND_IDS.RUSH_CHECKPOINT);
    });

    test('getBotOrderDefinition resolves by key, id, or shortCode (case-insensitive)', () => {
        const byKey1 = getBotOrderDefinition('1');
        assert.ok(byKey1);
        assert.equal(byKey1.id, BOT_COMMAND_IDS.FORM_UP);
        assert.equal(byKey1.title, 'Form Up & Protect Rear');

        const byId2 = getBotOrderDefinition('focus-fire');
        assert.ok(byId2);
        assert.equal(byId2.id, BOT_COMMAND_IDS.FOCUS_FIRE);
        assert.equal(byId2.title, 'Focus Fire Boss');

        const byCode3 = getBotOrderDefinition('SCAVENGE');
        assert.ok(byCode3);
        assert.equal(byCode3.id, BOT_COMMAND_IDS.SCAVENGE);
        assert.equal(byCode3.title, 'Spread Out & Scavenge Coins');

        const byKey4 = getBotOrderDefinition(4);
        assert.ok(byKey4);
        assert.equal(byKey4.id, BOT_COMMAND_IDS.RUSH_CHECKPOINT);
        assert.equal(byKey4.title, 'Rush Next Checkpoint');

        assert.equal(getBotOrderDefinition('invalid-cmd'), null);
        assert.equal(getBotOrderDefinition(null), null);
    });

    test('each command definition has valid duration, cooldown, icon, and barks', () => {
        for (const [id, def] of Object.entries(BOT_ORDER_DEFINITIONS)) {
            assert.equal(def.id, id);
            assert.ok(def.durationMs > 0);
            assert.ok(def.cooldownMs > 0);
            assert.ok(def.icon && typeof def.icon === 'string');
            assert.ok(Array.isArray(def.barks.ack) && def.barks.ack.length >= 2);
            assert.ok(Array.isArray(def.barks.action) && def.barks.action.length >= 2);
        }
    });

    test('getTacticalWheelItems produces 4 sorted radial wheel items with degree/radian angles', () => {
        const wheel = getTacticalWheelItems();
        assert.equal(wheel.length, 4);
        assert.deepEqual(wheel.map((w) => w.key), ['1', '2', '3', '4']);
        assert.deepEqual(wheel.map((w) => w.angleDeg), [0, 90, 180, 270]);
        assert.ok(wheel.every((w) => w.colorCss.startsWith('#')));
    });
});

describe('Tactical Bot Orders: Order State & Issuance', () => {
    test('createBotOrderState initializes empty activeOrder and cooldown records', () => {
        const state = createBotOrderState();
        assert.equal(state.activeOrder, null);
        assert.deepEqual(state.history, []);
        assert.deepEqual(state.cooldowns, {});
        assert.deepEqual(state.bubbles, []);
    });

    test('issueBotOrder successfully activates order and emits leader & bot chat bubbles', () => {
        const orderState = createBotOrderState();
        const gameState = createMockCrewState({ humanZ: -50, bots: 2 });
        const leader = gameState.players.leader;
        const bots = [gameState.players.bot_0, gameState.players.bot_1];

        const res = issueBotOrder(orderState, '1', leader, bots, 1000);
        assert.ok(res.success);
        assert.equal(res.order.id, BOT_COMMAND_IDS.FORM_UP);
        assert.equal(res.order.issuedAt, 1000);
        assert.equal(res.order.expiresAt, 1000 + BOT_ORDER_DEFINITIONS[BOT_COMMAND_IDS.FORM_UP].durationMs);

        assert.equal(orderState.activeOrder.id, BOT_COMMAND_IDS.FORM_UP);
        assert.equal(orderState.history.length, 1);
        assert.equal(res.bubbles.length, 3); // 1 leader bubble + 2 bot bubbles
        assert.equal(res.bubbles[0].speakerId, 'leader');
        assert.ok(res.bubbles[0].text.includes('Form Up & Protect Rear'));
        assert.equal(res.bubbles[1].speakerId, 'bot_0');
        assert.equal(res.bubbles[2].speakerId, 'bot_1');
    });

    test('issueBotOrder rejects when command is currently on cooldown', () => {
        const orderState = createBotOrderState();
        const gameState = createMockCrewState();
        const leader = gameState.players.leader;
        const bots = [gameState.players.bot_0];

        const first = issueBotOrder(orderState, '2', leader, bots, 5000);
        assert.ok(first.success);

        // Immediate subsequent issue of the same command
        const second = issueBotOrder(orderState, '2', leader, bots, 5500);
        assert.equal(second.success, false);
        assert.equal(second.reason, 'cooldown-active');
        assert.ok(second.remainingCooldown > 0);
    });

    test('updateBotOrderState expires orders when timestamp passes expiresAt', () => {
        const orderState = createBotOrderState();
        const gameState = createMockCrewState();
        issueBotOrder(orderState, '3', gameState.players.leader, [], 1000);
        assert.ok(orderState.activeOrder);

        updateBotOrderState(orderState, gameState.players, 5000);
        assert.ok(orderState.activeOrder); // 14s duration, not expired at 5s

        updateBotOrderState(orderState, gameState.players, 1000 + 14001);
        assert.equal(orderState.activeOrder, null); // now expired
    });
});

describe('Tactical Bot Orders: Chat Callout Bubbles & VFX Math', () => {
    test('createCalloutBubble populates fields and sets expiration timestamp', () => {
        const b = createCalloutBubble({
            id: 'b_test',
            speakerId: 'bot_0',
            speakerName: 'Rusty',
            text: 'Holding defensive line!',
            position: { x: 2, y: 0.25, z: -10 },
            durationMs: 3000,
            createdAt: 1000,
        });

        assert.equal(b.id, 'b_test');
        assert.equal(b.speakerName, 'Rusty');
        assert.equal(b.expiresAt, 4000);
        assert.equal(isBubbleActive(b, 2000), true);
        assert.equal(isBubbleActive(b, 4000), false);
    });

    test('getBubbleOpacity computes fade-in, plateau, and fade-out', () => {
        const b = createCalloutBubble({
            durationMs: 3000, // fade-in 200ms, fade-out last 600ms (2400ms to 3000ms)
            createdAt: 1000,
        });

        // During 200ms fade-in
        assert.equal(getBubbleOpacity(b, 1000), 0);
        assert.equal(getBubbleOpacity(b, 1100), 0.5);

        // Full visibility
        assert.equal(getBubbleOpacity(b, 1500), 1.0);
        assert.equal(getBubbleOpacity(b, 3300), 1.0);

        // Fade-out in last 600ms (from t=3400 to t=4000)
        assert.equal(getBubbleOpacity(b, 3700), 0.5);
        assert.equal(getBubbleOpacity(b, 4000), 0);
        assert.equal(getBubbleOpacity(b, 4500), 0);
    });

    test('getBubbleFloatingY calculates animated bobbing height above raft', () => {
        const b = createCalloutBubble({
            position: { x: 0, y: 0.25, z: 0 },
            createdAt: 0,
        });

        const y0 = getBubbleFloatingY(b, 0, 2.0);
        const y1 = getBubbleFloatingY(b, 500, 2.0);
        assert.ok(Math.abs(y0 - 2.25) < 0.05);
        assert.ok(Math.abs(y1 - 2.25) <= 0.2);
    });

    test('updateBotOrderState syncs bubble 3D coordinates with player movements', () => {
        const orderState = createBotOrderState();
        const gameState = createMockCrewState({ humanZ: 0, bots: 1 });
        issueBotOrder(orderState, '1', gameState.players.leader, [gameState.players.bot_0], 100);

        // Move leader downriver
        gameState.players.leader.position.z = -75;
        updateBotOrderState(orderState, gameState.players, 500);

        const leaderBubble = orderState.bubbles.find((b) => b.speakerId === 'leader');
        assert.equal(leaderBubble.position.z, -75);
    });
});

describe('Tactical Bot Orders: Dialogue Barks & Helpers', () => {
    test('getBotOrderBark retrieves deterministic cycled banter', () => {
        const b0 = getBotOrderBark(BOT_COMMAND_IDS.FORM_UP, 0, false);
        const b1 = getBotOrderBark(BOT_COMMAND_IDS.FORM_UP, 1, false);
        assert.ok(typeof b0 === 'string' && b0.length > 5);
        assert.ok(typeof b1 === 'string' && b1.length > 5);
        assert.notEqual(b0, b1);

        const actBark = getBotOrderBark(BOT_COMMAND_IDS.FOCUS_FIRE, 0, true);
        assert.ok(actBark.includes('Smashing') || actBark.includes('pressure') || actBark.includes('beast'));
    });

    test('findPriorityBoss ranks bosses correctly (Kraken > Worm > Mud Alien > White Guy)', () => {
        const enemies = {
            whiteGuy: { id: 'whiteGuy', type: 'whiteGuy', health: 50 },
            mudAlien: { id: 'mudAlien', type: 'mudAlien', health: 150 },
            longWorm: { id: 'longWorm', type: 'longWorm', health: 200 },
        };

        const target1 = findPriorityBoss(enemies);
        assert.equal(target1.type, 'longWorm');

        enemies.kraken = { id: 'kraken', type: 'kraken', health: 600 };
        const target2 = findPriorityBoss(enemies);
        assert.equal(target2.id, 'kraken');

        // Dead bosses are ignored
        enemies.kraken.health = 0;
        enemies.longWorm.health = 0;
        const target3 = findPriorityBoss(enemies);
        assert.equal(target3.type, 'mudAlien');
    });

    test('findUpcomingCheckpointZ picks the next gate ahead', () => {
        assert.equal(findUpcomingCheckpointZ({ z: -50 }), G.CHECKPOINTS[0]); // -150
        assert.equal(findUpcomingCheckpointZ({ z: -160 }), G.CHECKPOINTS[1]); // -300
        assert.equal(findUpcomingCheckpointZ({ z: -1100 }), G.CHECKPOINTS[7]); // -1200
        assert.equal(findUpcomingCheckpointZ({ z: -1450 }), G.FINISH_Z); // -1200 passed -> finish (-1500)
    });

    test('findNearbyScavengeTarget locates nearest uncollected loot item', () => {
        const items = [
            { id: 'coin_1', position: { x: 5, z: -30 }, collected: false },
            { id: 'chest_1', position: { x: 1, z: -12 }, collected: false },
            { id: 'chest_old', position: { x: 0, z: -5 }, collected: true },
        ];
        const botPos = { x: 0, z: -10 };
        const target = findNearbyScavengeTarget(botPos, items, 30);
        assert.equal(target.id, 'chest_1');
    });
});

describe('Tactical Bot Orders: Decision Overrides & AI Behavior', () => {
    test('ORDER 1 (FORM_UP): clusters bots in defensive wedge behind the leader', () => {
        const gameState = createMockCrewState({ humanZ: -100, bots: 2 });
        const activeOrder = { id: BOT_COMMAND_IDS.FORM_UP };

        const d0 = decideTacticalBotOrder(gameState, gameState.players.bot_0, activeOrder);
        assert.equal(d0.mode, 'order-form-up');
        assert.equal(d0.target.x, -3.5);
        assert.equal(d0.target.z, -100 + 3.5);

        const d1 = decideTacticalBotOrder(gameState, gameState.players.bot_1, activeOrder);
        assert.equal(d1.target.x, 3.5);
        assert.equal(d1.target.z, -100 + 3.5);
    });

    test('ORDER 1 (FORM_UP): detects rear threats and commands interception', () => {
        const gameState = createMockCrewState({ humanZ: -100, bots: 1 });
        G.spawnEnemy(gameState, 'whiteGuy', -90); // Behind leader (z: -90 > -100)
        gameState.players.bot_0.position = { x: 0, y: 0.25, z: -95 };

        const activeOrder = { id: BOT_COMMAND_IDS.FORM_UP };
        const d = decideTacticalBotOrder(gameState, gameState.players.bot_0, activeOrder);
        assert.equal(d.isDefendingRear, true);
        assert.equal(d.enemyId, 'whiteGuy');
    });

    test('ORDER 2 (FOCUS_FIRE): commands all bots to swarm the priority boss', () => {
        const gameState = createMockCrewState({ humanZ: -200, bots: 2 });
        G.spawnEnemy(gameState, 'whiteGuy', -210);
        G.spawnEnemy(gameState, 'mudAlien', -230);
        gameState.enemies.whiteGuy.health = 50;
        gameState.enemies.mudAlien.health = 150;

        const activeOrder = { id: BOT_COMMAND_IDS.FOCUS_FIRE };
        const d = decideTacticalBotOrder(gameState, gameState.players.bot_0, activeOrder);
        assert.equal(d.mode, 'order-focus-fire');
        assert.equal(d.enemyId, 'mudAlien'); // Higher priority than whiteGuy
        assert.equal(d.speedBoost, 1.15);
        assert.equal(d.attackCooldownMultiplier, 0.75);
    });

    test('ORDER 3 (SCAVENGE): commands bot to navigate toward active loot pickup', () => {
        const gameState = createMockCrewState({ humanZ: -50, bots: 1 });
        const loot = [
            { id: 'shiny_chest', position: { x: 8, z: -60 }, collected: false },
        ];
        const activeOrder = { id: BOT_COMMAND_IDS.SCAVENGE };
        const d = decideTacticalBotOrder(gameState, gameState.players.bot_0, activeOrder, loot);

        assert.equal(d.mode, 'order-scavenge');
        assert.equal(d.pickupId, 'shiny_chest');
        assert.equal(d.isCollectingLoot, true);
        assert.equal(d.target.x, 8);
        assert.equal(d.target.z, -60);
    });

    test('ORDER 3 (SCAVENGE): fans bots wide across river channels when no pickup is near', () => {
        const gameState = createMockCrewState({ humanZ: -50, bots: 2 });
        const activeOrder = { id: BOT_COMMAND_IDS.SCAVENGE };
        const d0 = decideTacticalBotOrder(gameState, gameState.players.bot_0, activeOrder, []);
        const d1 = decideTacticalBotOrder(gameState, gameState.players.bot_1, activeOrder, []);

        assert.equal(d0.mode, 'order-scavenge-lane');
        assert.equal(d1.mode, 'order-scavenge-lane');
        assert.equal(d0.target.x, -11.0); // Left channel sweep
        assert.equal(d1.target.x, 11.0);  // Right channel sweep
    });

    test('ORDER 4 (RUSH_CHECKPOINT): sprints toward upcoming checkpoint gate', () => {
        const gameState = createMockCrewState({ humanZ: -40, bots: 2 });
        const activeOrder = { id: BOT_COMMAND_IDS.RUSH_CHECKPOINT };
        const d = decideTacticalBotOrder(gameState, gameState.players.bot_0, activeOrder);

        assert.equal(d.mode, 'order-rush-checkpoint');
        assert.equal(d.targetCheckpointZ, G.CHECKPOINTS[0]); // -150
        assert.equal(d.target.z, G.CHECKPOINTS[0] - 5);
        assert.equal(d.speedBoost, 1.25);
    });

    test('decideTacticalBotOrder returns null if bot is dead or game is won', () => {
        const gameState = createMockCrewState();
        const activeOrder = { id: BOT_COMMAND_IDS.FORM_UP };
        gameState.players.bot_0.isDead = true;
        assert.equal(decideTacticalBotOrder(gameState, gameState.players.bot_0, activeOrder), null);

        gameState.players.bot_0.isDead = false;
        gameState.gameWon = true;
        assert.equal(decideTacticalBotOrder(gameState, gameState.players.bot_0, activeOrder), null);
    });
});

describe('Tactical Bot Orders: Speed & Blocking Modifiers', () => {
    test('calculateTacticalBotSpeed applies speed boosts based on active order', () => {
        const bot = { upgrades: [] };
        const baseSpeed = calculateTacticalBotSpeed(bot, null);
        assert.ok(Math.abs(baseSpeed - 15) < 1e-6);

        const sprintSpeed = calculateTacticalBotSpeed(bot, { id: BOT_COMMAND_IDS.RUSH_CHECKPOINT });
        assert.ok(Math.abs(sprintSpeed - (15 * 1.25)) < 1e-6);

        const focusSpeed = calculateTacticalBotSpeed(bot, { id: BOT_COMMAND_IDS.FOCUS_FIRE });
        assert.ok(Math.abs(focusSpeed - (15 * 1.15)) < 1e-6);
    });

    test('calculateTacticalBotBlockChance increases parry chance during FORM_UP and reduces during FOCUS_FIRE', () => {
        const bot = {};
        const baseBlock = calculateTacticalBotBlockChance(bot, null, 0.35);
        assert.equal(baseBlock, 0.35);

        const formUpBlock = calculateTacticalBotBlockChance(bot, { id: BOT_COMMAND_IDS.FORM_UP }, 0.35);
        assert.equal(formUpBlock, 0.70); // 0.35 + 0.35

        const focusFireBlock = calculateTacticalBotBlockChance(bot, { id: BOT_COMMAND_IDS.FOCUS_FIRE }, 0.35);
        assert.ok(Math.abs(focusFireBlock - 0.25) < 1e-6); // 0.35 - 0.10
    });
});
