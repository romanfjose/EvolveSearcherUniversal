import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    COOP_ORDERS,
    COOP_ORDER_LOOKUP,
    DEFAULT_SHOP_COORDINATE,
    getTacticalOrderDefinition,
    findNearestPlatform,
    findTacticalBossTarget,
    issueTacticalOrder,
    isOrderActive,
    resolveBotOrderTarget,
} from '../shared/coop-tactical-orders.js';

describe('Tactical Co-Op Orders: Canonical Definitions & Hotkeys', () => {
    test('defines 4 canonical orders mapped to Z, X, C, V', () => {
        assert.equal(COOP_ORDERS.DOCK_PLATFORM.key, 'Z');
        assert.equal(COOP_ORDERS.DOCK_PLATFORM.code, 'KeyZ');
        assert.equal(COOP_ORDERS.DOCK_PLATFORM.title, 'Dock at Nearest Platform');

        assert.equal(COOP_ORDERS.HOLD_POSITION.key, 'X');
        assert.equal(COOP_ORDERS.HOLD_POSITION.code, 'KeyX');
        assert.equal(COOP_ORDERS.HOLD_POSITION.title, 'Hold Position / Anchor Here');

        assert.equal(COOP_ORDERS.MEET_SHOP.key, 'C');
        assert.equal(COOP_ORDERS.MEET_SHOP.code, 'KeyC');
        assert.equal(COOP_ORDERS.MEET_SHOP.title, 'Meet at Harbor Shop');

        assert.equal(COOP_ORDERS.FOCUS_BOSS.key, 'V');
        assert.equal(COOP_ORDERS.FOCUS_BOSS.code, 'KeyV');
        assert.equal(COOP_ORDERS.FOCUS_BOSS.title, 'Focus Boss');
    });

    test('getTacticalOrderDefinition resolves by key, code, id, or shortCode (case-insensitive)', () => {
        // Hotkey resolution
        assert.equal(getTacticalOrderDefinition('Z'), COOP_ORDERS.DOCK_PLATFORM);
        assert.equal(getTacticalOrderDefinition('z'), COOP_ORDERS.DOCK_PLATFORM);
        assert.equal(getTacticalOrderDefinition('KeyZ'), COOP_ORDERS.DOCK_PLATFORM);

        assert.equal(getTacticalOrderDefinition('X'), COOP_ORDERS.HOLD_POSITION);
        assert.equal(getTacticalOrderDefinition('x'), COOP_ORDERS.HOLD_POSITION);
        assert.equal(getTacticalOrderDefinition('KeyX'), COOP_ORDERS.HOLD_POSITION);

        assert.equal(getTacticalOrderDefinition('C'), COOP_ORDERS.MEET_SHOP);
        assert.equal(getTacticalOrderDefinition('c'), COOP_ORDERS.MEET_SHOP);
        assert.equal(getTacticalOrderDefinition('KeyC'), COOP_ORDERS.MEET_SHOP);

        assert.equal(getTacticalOrderDefinition('V'), COOP_ORDERS.FOCUS_BOSS);
        assert.equal(getTacticalOrderDefinition('v'), COOP_ORDERS.FOCUS_BOSS);
        assert.equal(getTacticalOrderDefinition('KeyV'), COOP_ORDERS.FOCUS_BOSS);

        // ID resolution
        assert.equal(getTacticalOrderDefinition('dock-platform'), COOP_ORDERS.DOCK_PLATFORM);
        assert.equal(getTacticalOrderDefinition('hold-position'), COOP_ORDERS.HOLD_POSITION);
        assert.equal(getTacticalOrderDefinition('meet-shop'), COOP_ORDERS.MEET_SHOP);
        assert.equal(getTacticalOrderDefinition('focus-boss'), COOP_ORDERS.FOCUS_BOSS);

        // ShortCode resolution
        assert.equal(getTacticalOrderDefinition('dock'), COOP_ORDERS.DOCK_PLATFORM);
        assert.equal(getTacticalOrderDefinition('HOLD'), COOP_ORDERS.HOLD_POSITION);
        assert.equal(getTacticalOrderDefinition('Shop'), COOP_ORDERS.MEET_SHOP);
        assert.equal(getTacticalOrderDefinition('boss'), COOP_ORDERS.FOCUS_BOSS);

        // Invalid
        assert.equal(getTacticalOrderDefinition('unknown'), null);
        assert.equal(getTacticalOrderDefinition(null), null);
    });

    test('each definition has valid icons, barks, colors, and arrivalDistance', () => {
        for (const [id, def] of Object.entries(COOP_ORDERS)) {
            assert.ok(def.icon && typeof def.icon === 'string');
            assert.ok(def.colorHex > 0);
            assert.ok(def.colorCss.startsWith('#'));
            assert.ok(def.durationMs >= 10000);
            assert.ok(def.cooldownMs >= 2000);
            assert.ok(def.arrivalDistance > 0);
            assert.ok(Array.isArray(def.barks.ack) && def.barks.ack.length >= 2);
            assert.ok(Array.isArray(def.barks.action) && def.barks.action.length >= 2);
        }
    });
});

describe('Tactical Co-Op Orders: Platform & Target Search Helpers', () => {
    test('findNearestPlatform selects the closest platform with downriver bias', () => {
        const platforms = [
            { id: 'plat_behind', position: { x: 0, y: 0.2, z: 20 } },
            { id: 'plat_ahead', position: { x: 0, y: 0.2, z: -25 } },
            { id: 'plat_far', position: { x: 10, y: 0.2, z: -80 } },
        ];
        const refPos = { x: 0, y: 0.2, z: 0 };

        const nearest = findNearestPlatform(refPos, platforms);
        assert.ok(nearest);
        // plat_ahead is downriver (negative z), receiving downriver bias
        assert.equal(nearest.id, 'plat_ahead');

        // Works with empty or invalid platforms
        assert.equal(findNearestPlatform(refPos, []), null);
        assert.equal(findNearestPlatform(refPos, null), null);
    });

    test('findTacticalBossTarget ranks bosses accurately', () => {
        const enemies = [
            { id: 'mob1', type: 'whiteGuy', health: 40 },
            { id: 'worm', type: 'longWorm', health: 180 },
            { id: 'alien', type: 'mudAlien', health: 100 },
        ];
        const boss = findTacticalBossTarget(enemies);
        assert.equal(boss.id, 'worm');

        // Kraken takes precedence
        enemies.push({ id: 'kraken', type: 'kraken', health: 500 });
        const krakenBoss = findTacticalBossTarget(enemies);
        assert.equal(krakenBoss.id, 'kraken');

        // Dead enemies are skipped
        krakenBoss.health = 0;
        const nextBoss = findTacticalBossTarget(enemies);
        assert.equal(nextBoss.id, 'worm');
    });
});

describe('Tactical Co-Op Orders: issueTacticalOrder', () => {
    test('rejects unknown order types safely', () => {
        const res = issueTacticalOrder({ orderType: 'invalid-type' });
        assert.equal(res.success, false);
        assert.equal(res.reason, 'unknown-order-type');
        assert.equal(res.order, null);
    });

    test('issues [Z] DOCK_PLATFORM with target platform and fallback', () => {
        const issuer = { id: 'capt', name: 'Captain', position: { x: 2, y: 0.25, z: -50 } };
        const platforms = [
            { id: 'haven_1', position: { x: 10, y: 0.2, z: -70 } },
            { id: 'haven_2', position: { x: -10, y: 0.2, z: -150 } },
        ];

        const res = issueTacticalOrder({
            issuer,
            orderType: 'Z',
            platforms,
            now: 2000,
        });

        assert.ok(res.success);
        assert.equal(res.order.orderType, 'dock-platform');
        assert.equal(res.order.key, 'Z');
        assert.equal(res.order.issuerId, 'capt');
        assert.equal(res.order.issuedAt, 2000);
        assert.equal(res.order.expiresAt, 2000 + COOP_ORDERS.DOCK_PLATFORM.durationMs);
        assert.ok(res.order.targetPlatform);
        assert.equal(res.order.targetPlatform.id, 'haven_1');
        assert.equal(res.order.targetPosition.x, 10);
        assert.equal(res.order.targetPosition.z, -70);

        // Fallback when no platforms available
        const fallbackRes = issueTacticalOrder({
            issuer,
            orderType: 'dock-platform',
            platforms: [],
            now: 2000,
        });
        assert.ok(fallbackRes.success);
        assert.equal(fallbackRes.order.targetPlatform, null);
        assert.equal(fallbackRes.order.targetPosition.fallback, true);
    });

    test('issues [X] HOLD_POSITION capturing issuer coordinates as hold point', () => {
        const issuer = { id: 'p1', position: { x: -4, y: 0.25, z: -120 } };
        const res = issueTacticalOrder({
            issuer,
            orderType: 'X',
            now: 5000,
        });

        assert.ok(res.success);
        assert.equal(res.order.orderType, 'hold-position');
        assert.equal(res.order.key, 'X');
        assert.deepEqual(res.order.holdPosition, { x: -4, y: 0.25, z: -120 });
        assert.deepEqual(res.order.targetPosition, { x: -4, y: 0.25, z: -120 });
    });

    test('issues [C] MEET_SHOP targeting harbor shop coordinates or custom zShop', () => {
        const issuer = { id: 'p1', position: { x: 0, y: 0.25, z: -50 } };

        // Default shop
        const resDefault = issueTacticalOrder({
            issuer,
            orderType: 'C',
            now: 1000,
        });
        assert.ok(resDefault.success);
        assert.equal(resDefault.order.orderType, 'meet-shop');
        assert.equal(resDefault.order.targetPosition.x, DEFAULT_SHOP_COORDINATE.x);
        assert.equal(resDefault.order.targetPosition.z, DEFAULT_SHOP_COORDINATE.z);

        // Custom numerical zShop
        const resCustomZ = issueTacticalOrder({
            issuer,
            orderType: 'KeyC',
            zShop: -220,
            now: 1000,
        });
        assert.ok(resCustomZ.success);
        assert.equal(resCustomZ.order.targetPosition.z, -220);

        // Custom object zShop
        const resObj = issueTacticalOrder({
            issuer,
            orderType: 'meet-shop',
            zShop: { x: 14.5, y: 0.5, z: -210 },
            now: 1000,
        });
        assert.ok(resObj.success);
        assert.equal(resObj.order.targetPosition.x, 14.5);
        assert.equal(resObj.order.targetPosition.z, -210);
    });

    test('issues [V] FOCUS_BOSS targeting active boss or forward downriver', () => {
        const issuer = { id: 'p1', position: { x: 0, y: 0.25, z: -300 } };
        const enemies = {
            mob: { id: 'mob', type: 'whiteGuy', health: 30, position: { x: 1, z: -310 } },
            kraken: { id: 'kraken', type: 'kraken', health: 400, position: { x: 0, z: -350 } },
        };

        const res = issueTacticalOrder({
            issuer,
            orderType: 'V',
            enemies,
            now: 4000,
        });
        assert.ok(res.success);
        assert.equal(res.order.orderType, 'focus-boss');
        assert.ok(res.order.targetEnemy);
        assert.equal(res.order.targetEnemy.id, 'kraken');
        assert.equal(res.order.targetPosition.enemyId, 'kraken');
        assert.equal(res.order.targetPosition.z, -350);

        // Fallback when no enemies are present
        const resFallback = issueTacticalOrder({
            issuer,
            orderType: 'focus-boss',
            enemies: [],
            now: 4000,
        });
        assert.ok(resFallback.success);
        assert.equal(resFallback.order.targetEnemy, null);
        assert.equal(resFallback.order.targetPosition.fallback, true);
    });
});

describe('Tactical Co-Op Orders: isOrderActive', () => {
    test('correctly evaluates order expiration based on timestamp', () => {
        const { order } = issueTacticalOrder({ orderType: 'Z', now: 1000 });
        assert.equal(isOrderActive(order, 1000), true);
        assert.equal(isOrderActive(order, 1000 + order.durationMs - 1), true);
        assert.equal(isOrderActive(order, 1000 + order.durationMs), false);
        assert.equal(isOrderActive(null, 1000), false);
    });
});

describe('Tactical Co-Op Orders: resolveBotOrderTarget', () => {
    test('handles dead bots cleanly with action "dead"', () => {
        const bot = { id: 'bot_0', isDead: true, position: { x: 0, y: 0, z: 0 } };
        const res = resolveBotOrderTarget(bot, null);
        assert.equal(res.action, 'dead');
        assert.equal(res.paddle, false);
        assert.equal(res.steer, 0);
    });

    test('falls back to follow_leader when no active order is present', () => {
        const bot = { id: 'bot_0', botIndex: 0, position: { x: 0, y: 0.25, z: -10 } };
        const human = { id: 'human', position: { x: 0, y: 0.25, z: -20 } };

        const guidance = resolveBotOrderTarget(bot, null, human);
        assert.equal(guidance.active, false);
        assert.equal(guidance.action, 'follow_leader');
        assert.ok(guidance.target);
        assert.equal(guidance.paddle, true);
    });

    test('[Z] DOCK_PLATFORM guides bot to platform, offsets parking, drops anchor on arrival', () => {
        const platform = { id: 'dock_1', position: { x: 10, y: 0.2, z: -100 } };
        const bot = { id: 'bot_0', botIndex: 0, position: { x: 2, y: 0.25, z: -80 } };
        const { order } = issueTacticalOrder({ orderType: 'Z', platforms: [platform], now: 1000 });

        // En route
        const enRoute = resolveBotOrderTarget(bot, order, null, { now: 1500 });
        assert.equal(enRoute.active, true);
        assert.equal(enRoute.orderType, 'dock-platform');
        assert.equal(enRoute.action, 'navigating_to_platform');
        assert.equal(enRoute.shouldDock, true);
        assert.equal(enRoute.paddle, true);
        assert.equal(enRoute.anchor, false);
        assert.ok(enRoute.steer > 0); // Steer right toward x=10
        assert.equal(enRoute.speedMultiplier, 1.15);

        // Arrived at parking slot
        bot.position = { x: enRoute.target.x, y: 0.25, z: enRoute.target.z };
        const arrived = resolveBotOrderTarget(bot, order, null, { now: 2000 });
        assert.equal(arrived.isArrived, true);
        assert.equal(arrived.action, 'docked_platform');
        assert.equal(arrived.paddle, false);
        assert.equal(arrived.anchor, true);
        assert.equal(arrived.speedMultiplier, 0.0);
    });

    test('[X] HOLD_POSITION immediately engages anchor to freeze downstream drift', () => {
        const bot = { id: 'bot_0', position: { x: -2, y: 0.25, z: -150 } };
        const { order } = issueTacticalOrder({
            issuer: bot,
            orderType: 'X',
            now: 2000,
        });

        const guidance = resolveBotOrderTarget(bot, order, null, { now: 2500 });
        assert.equal(guidance.active, true);
        assert.equal(guidance.orderType, 'hold-position');
        assert.equal(guidance.anchor, true);
        assert.equal(guidance.shouldHold, true);
        assert.equal(guidance.action, 'anchored_holding_position');
        assert.equal(guidance.speedMultiplier, 0.0);
    });

    test('[C] MEET_SHOP sprints bots toward the harbor shop and fans along wharf', () => {
        const bot0 = { id: 'bot_0', botIndex: 0, position: { x: 0, y: 0.25, z: -100 } };
        const bot1 = { id: 'bot_1', botIndex: 1, position: { x: 0, y: 0.25, z: -100 } };
        const { order } = issueTacticalOrder({ orderType: 'C', zShop: -200, now: 1000 });

        const g0 = resolveBotOrderTarget(bot0, order, null, { now: 1500 });
        const g1 = resolveBotOrderTarget(bot1, order, null, { now: 1500 });

        assert.equal(g0.active, true);
        assert.equal(g0.action, 'sprinting_to_shop');
        assert.equal(g0.speedMultiplier, 1.25);
        assert.equal(g0.shouldDock, true);
        assert.notEqual(g0.target.z, g1.target.z); // Distinct wharf positions
    });

    test('[V] FOCUS_BOSS swarms boss and triggers attacks in melee range', () => {
        const kraken = { id: 'kraken', type: 'kraken', health: 400, position: { x: 0, y: 0.25, z: -250 } };
        const bot = { id: 'bot_0', position: { x: 0, y: 0.25, z: -220 } };
        const { order } = issueTacticalOrder({ orderType: 'V', enemies: [kraken], now: 1000 });

        // Swarming
        const swarming = resolveBotOrderTarget(bot, order, null, { now: 1500, enemies: [kraken] });
        assert.equal(swarming.action, 'swarming_boss');
        assert.equal(swarming.focusEnemyId, 'kraken');
        assert.equal(swarming.attack, false);
        assert.equal(swarming.speedMultiplier, 1.2);

        // Within melee range
        bot.position.z = -248;
        const melee = resolveBotOrderTarget(bot, order, null, { now: 2000, enemies: [kraken] });
        assert.equal(melee.isArrived, true);
        assert.equal(melee.action, 'attacking_boss');
        assert.equal(melee.attack, true);
    });
});
