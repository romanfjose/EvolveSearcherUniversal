/**
 * Don't Sink, Don't Die — Helmet 03 QA Wave 5A Pacing, Economy & Sanctuary Breaker Suite
 * (test/qa-wave5a-pacing-economy-sanctuary.test.js)
 *
 * Sovereign Core & Helmet 03 Directive ("Where's the Bathroom?" Adversarial Saboteur):
 * 1. Touch live reality first: Test concrete state mutations and combat reactions.
 * 2. 5-Angle attack: Out-of-order calls, malformed data, concurrent spam, edge boundaries.
 * 3. Receipt-backed proof: Zero mock theatre, verified state receipts across all 4 domains:
 *    (1) Coin rewards never produce undefined or NaN even when malformed payloads arrive.
 *    (2) Shop purchases succeed via both mouse and keyboard [1]-[4].
 *    (3) Players on elevated platforms (y > safeHeight) are 100% immune to whiteGuy, mudAlien,
 *        and longWorm attacks and do not slide off under physical forces.
 *    (4) Bots wait with the human player when stopped at the City Shop or on a platform.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as G from '../shared/game-core.js';
import {
    sanitizeCoinReward,
    awardCoinsSafely,
    simulateShopPurchase,
    isPlayerInSanctuary,
    testEnemySanctuaryAttack,
    auditPlatformPhysicalStability,
    isHumanPlayerResting,
    evaluateSanctuaryBotDecide,
    runWave5aSanctuaryVerificationSuite,
} from '../shared/qa-wave5a-pacing-economy-sanctuary.js';

import {
    createArmoryShopUI,
} from '../public/js/ui/armory-shop.js';

import {
    createQuickBuyHotbar,
    HOTBAR_DEFINITIONS,
} from '../public/js/ui/quickbuy-hotbar.js';

describe('Helmet 03 — QA Wave 5A: Pacing, Economy & Sanctuary Breaker', () => {

    // =========================================================================
    // DOMAIN 1: Coin Rewards Robustness & Corrupt Payload Fuzzing
    // =========================================================================
    describe('1. Coin Rewards Robustness & Payload Sanitization', () => {
        it('safely handles malformed, corrupt, or adversarial coin payloads without NaN or undefined', () => {
            const malformedPayloads = [
                undefined,
                null,
                NaN,
                Infinity,
                -Infinity,
                -100,
                -0.0001,
                'invalid',
                '',
                'NaN',
                'Infinity',
                {},
                [],
                { foo: 'bar' },
                () => 50,
                Symbol('coins'),
                BigInt(100),
            ];

            for (const payload of malformedPayloads) {
                const sanitized = sanitizeCoinReward(payload, 0);
                assert.equal(typeof sanitized, 'number', `Output for ${String(payload)} must be a number`);
                assert.equal(Number.isNaN(sanitized), false, `Output for ${String(payload)} must not be NaN`);
                assert.equal(Number.isFinite(sanitized), true, `Output for ${String(payload)} must be finite`);
                assert.ok(sanitized >= 0, `Output for ${String(payload)} must be non-negative`);
            }
        });

        it('parses valid numeric and string coin rewards cleanly', () => {
            assert.equal(sanitizeCoinReward(25), 25);
            assert.equal(sanitizeCoinReward(0), 0);
            assert.equal(sanitizeCoinReward(12.8), 12);
            assert.equal(sanitizeCoinReward('50'), 50);
            assert.equal(sanitizeCoinReward('100.95'), 100);
            assert.equal(sanitizeCoinReward({ coins: 40 }), 40);
            assert.equal(sanitizeCoinReward({ amount: 15 }), 15);
            assert.equal(sanitizeCoinReward({ value: 30 }), 30);
            assert.equal(sanitizeCoinReward({ reward: 12 }), 12);
        });

        it('awards coins to player entity without corrupting existing balance under fuzzing attack', () => {
            const player = { id: 'p_hero', coins: 100 };

            // Flood with 50 adversarial payloads
            const fuzzInputs = [
                NaN, undefined, null, -50, 'bad', {}, false, true,
                { coins: NaN }, { value: -99 }, [10, 20],
            ];

            for (const input of fuzzInputs) {
                const res = awardCoinsSafely(player, input);
                assert.equal(res.success, true);
                assert.equal(Number.isFinite(player.coins), true);
                assert.equal(Number.isNaN(player.coins), false);
                assert.ok(player.coins >= 100, 'Wallet should never lose coins from reward fuzzing');
            }

            // Award a valid reward
            const validRes = awardCoinsSafely(player, 50);
            assert.equal(validRes.addedCoins, 50);
            assert.equal(player.coins, 150);
        });

        it('recovers gracefully even if player entity starts with corrupted coin value', () => {
            const brokenPlayer = { id: 'p_broken', coins: NaN };
            awardCoinsSafely(brokenPlayer, 20);
            assert.equal(brokenPlayer.coins, 20);

            brokenPlayer.coins = undefined;
            awardCoinsSafely(brokenPlayer, 35);
            assert.equal(brokenPlayer.coins, 35);

            brokenPlayer.coins = -500;
            awardCoinsSafely(brokenPlayer, 10);
            assert.equal(brokenPlayer.coins, 10);
        });
    });

    // =========================================================================
    // DOMAIN 2: Shop Purchases via Mouse and Keyboard [1]-[4]
    // =========================================================================
    describe('2. Shop Purchases via Mouse and Keyboard [1]-[4]', () => {
        it('successfully executes purchases for slots [1]-[4] via keyboard hotkeys', () => {
            const player = {
                coins: 100,
                health: 50,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            // Slot 1: Motor Mk I (cost 10)
            const buy1 = simulateShopPurchase(player, '1', 'keyboard');
            assert.equal(buy1.success, true);
            assert.equal(buy1.slot, 'engine');
            assert.equal(buy1.coinsDeducted, 10);
            assert.equal(player.coins, 90);
            assert.ok(player.upgrades.includes('motor_1'));

            // Slot 2: Weapon Mk I (cost 15)
            const buy2 = simulateShopPurchase(player, '2', 'keyboard');
            assert.equal(buy2.success, true);
            assert.equal(buy2.slot, 'mallet');
            assert.equal(buy2.coinsDeducted, 15);
            assert.equal(player.coins, 75);
            assert.ok(player.upgrades.includes('weapon_1'));

            // Slot 3: Hull Armor Mk I (cost 20)
            const buy3 = simulateShopPurchase(player, '3', 'keyboard');
            assert.equal(buy3.success, true);
            assert.equal(buy3.slot, 'hull');
            assert.equal(buy3.coinsDeducted, 20);
            assert.equal(player.coins, 55);
            assert.ok(player.upgrades.includes('armor_1'));

            // Slot 4: Emergency Patch (cost 15, heals 35 HP)
            const buy4 = simulateShopPurchase(player, '4', 'keyboard');
            assert.equal(buy4.success, true);
            assert.equal(buy4.slot, 'patch');
            assert.equal(buy4.coinsDeducted, 15);
            assert.equal(player.coins, 40);
            assert.ok(player.health > 50);
        });

        it('successfully executes purchases for slots [1]-[4] via mouse click actions', () => {
            const player = {
                coins: 100,
                health: 40,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            // Mouse click on Engine slot
            const click1 = simulateShopPurchase(player, 'engine', 'mouse');
            assert.equal(click1.success, true);
            assert.equal(click1.inputMethod, 'mouse');
            assert.equal(player.coins, 90);

            // Mouse click on Mallet slot
            const click2 = simulateShopPurchase(player, 'mallet', 'mouse');
            assert.equal(click2.success, true);
            assert.equal(player.coins, 75);

            // Mouse click on Hull slot
            const click3 = simulateShopPurchase(player, 'hull', 'mouse');
            assert.equal(click3.success, true);
            assert.equal(player.coins, 55);

            // Mouse click on Patch slot (hull armor added +50 maxHealth & health -> 40 + 50 = 90; patch restores +35 -> 125)
            const click4 = simulateShopPurchase(player, 'patch', 'mouse');
            assert.equal(click4.success, true);
            assert.equal(player.coins, 40);
            assert.equal(player.health, 125);
        });

        it('rejects purchases when player has insufficient coins and keeps state pure', () => {
            const brokePlayer = {
                coins: 5,
                health: 40,
                maxHealth: 100,
                upgrades: [],
                isDead: false,
            };

            // Attempt to buy motor (cost 10)
            const res = simulateShopPurchase(brokePlayer, '1', 'keyboard');
            assert.equal(res.success, false);
            assert.equal(res.reason, 'need_coins');
            assert.equal(brokePlayer.coins, 5);
            assert.deepEqual(brokePlayer.upgrades, []);
        });

        it('supports interactive UI controller instances in headless tests', () => {
            const hotbar = createQuickBuyHotbar({ enableHotkeys: false });
            assert.ok(hotbar);
            assert.equal(typeof hotbar.triggerPurchase, 'function');

            const armory = createArmoryShopUI();
            assert.ok(armory);
            assert.equal(typeof armory.executePurchase, 'function');

            hotbar.dispose();
            armory.dispose();
        });
    });

    // =========================================================================
    // DOMAIN 3: Elevated Platform Sanctuary & Physical Stability
    // =========================================================================
    describe('3. Elevated Platform Sanctuary (y > safeHeight) & Physical Stability', () => {
        it('grants 100% immunity to whiteGuy wizard when perched on an elevated platform', () => {
            const state = G.createGameState({ seed: 100 });
            G.addPlayer(state, 'p1');
            const player = state.players.p1;
            player.health = 100;
            player.position = { x: 0, y: 1.5, z: -40 }; // Elevated above safeHeight (1.0)

            G.spawnEnemy(state, 'whiteGuy', -40);

            const outcome = testEnemySanctuaryAttack(state, 'p1', 'whiteGuy');
            assert.equal(outcome.immune, true);
            assert.equal(outcome.damageDealt, 0);
            assert.equal(player.health, 100);
        });

        it('grants 100% immunity to mudAlien sludge and melee when perched on an elevated platform', () => {
            const state = G.createGameState({ seed: 200 });
            G.addPlayer(state, 'p1');
            const player = state.players.p1;
            player.health = 100;
            player.position = { x: 0, y: 1.8, z: -60 }; // Elevated plank

            G.spawnEnemy(state, 'mudAlien', -60);

            const outcome = testEnemySanctuaryAttack(state, 'p1', 'mudAlien');
            assert.equal(outcome.immune, true);
            assert.equal(outcome.damageDealt, 0);
            assert.equal(player.health, 100);
        });

        it('grants 100% immunity to longWorm charges when perched on an elevated platform', () => {
            const state = G.createGameState({ seed: 300 });
            G.addPlayer(state, 'p1');
            const player = state.players.p1;
            player.health = 100;
            player.position = { x: 0, y: 2.2, z: -80 };

            G.spawnEnemy(state, 'longWorm', -80);

            const outcome = testEnemySanctuaryAttack(state, 'p1', 'longWorm');
            assert.equal(outcome.immune, true);
            assert.equal(outcome.damageDealt, 0);
            assert.equal(player.health, 100);
        });

        it('confirms damage is dealt normally when player is at water level (y <= safeHeight)', () => {
            const state = G.createGameState({ seed: 400 });
            G.addPlayer(state, 'p1');
            const player = state.players.p1;
            player.health = 100;
            player.position = { x: 0, y: G.WATER_SURFACE_Y, z: -40 }; // On water (0.25)

            G.spawnEnemy(state, 'whiteGuy', -40);

            const outcome = testEnemySanctuaryAttack(state, 'p1', 'whiteGuy');
            assert.equal(outcome.immune, false);
            assert.ok(outcome.damageDealt > 0);
            assert.ok(player.health < 100);
        });

        it('verifies that crafts perched on elevated planks or dock piers do not slide off under physical forces', () => {
            const craft = {
                position: { x: -5, y: 1.4, z: -40 },
                velocity: { x: 0, y: 0, z: 0 },
                angularVelocity: { x: 0, y: 0, z: 0 },
                yaw: 0,
            };

            const obstacles = [
                { type: 'plank', x: -5, z: -40, halfW: 3.0, halfD: 2.0, topY: 1.4 },
            ];

            // Run physical stability simulation for 3 seconds of game time (60 steps)
            const audit = auditPlatformPhysicalStability(craft, obstacles, 3.0, 0.05);
            assert.equal(audit.stable, true, 'Craft must remain stable on the platform');
            assert.ok(audit.driftDistance < 0.1, `Drift distance ${audit.driftDistance} exceeded threshold`);
            assert.equal(audit.endPos.y, 1.4, 'Craft must maintain platform height');
        });
    });

    // =========================================================================
    // DOMAIN 4: Bot Companion Sanctuary & Shop Waiting
    // =========================================================================
    describe('4. Companion Bot Behavior: Waiting at City Shop & Sanctuary Platforms', () => {
        it('detects when human player is resting at the City Shop dock zone', () => {
            const restingPlayer = {
                id: 'h',
                isDead: false,
                position: { x: 15, y: 0.75, z: -200 }, // Inside SHOP_ZONE (minX: 10, minZ: -250, maxZ: -150)
            };
            assert.equal(isHumanPlayerResting(restingPlayer), true);

            const riverPlayer = {
                id: 'h',
                isDead: false,
                position: { x: 0, y: 0.25, z: -50 }, // Out in open river
            };
            assert.equal(isHumanPlayerResting(riverPlayer), false);
        });

        it('detects when human player is resting on an elevated sanctuary platform', () => {
            const platformPlayer = {
                id: 'h',
                isDead: false,
                position: { x: -5, y: 1.8, z: -100 }, // y > safeHeight (1.0)
            };
            assert.equal(isHumanPlayerResting(platformPlayer), true);
        });

        it('causes companion bots to switch to wait-sanctuary mode when human stops in City Shop', () => {
            const state = G.createGameState({ seed: 500 });
            G.addPlayer(state, 'human');
            G.addPlayer(state, 'bot_0', { isBot: true });

            state.players.human.position = { x: 16, y: 0.75, z: -180 }; // City dock
            state.players.bot_0.position = { x: 10, y: 0.25, z: -175 };

            const botDecision = evaluateSanctuaryBotDecide(state, state.players.bot_0);
            assert.equal(botDecision.mode, 'wait-sanctuary');
            assert.equal(botDecision.reason, 'leader-in-shop');
            assert.ok(botDecision.target);
            // Verify target holds position in proximity to the human
            assert.ok(G.distXZ(botDecision.target, state.players.human.position) < 15);
        });

        it('causes companion bots to switch to wait-sanctuary mode when human perches on a platform', () => {
            const state = G.createGameState({ seed: 600 });
            G.addPlayer(state, 'human');
            G.addPlayer(state, 'bot_0', { isBot: true });

            state.players.human.position = { x: -5, y: 2.0, z: -350 }; // Elevated perch
            state.players.bot_0.position = { x: -2, y: 0.25, z: -345 };

            const botDecision = evaluateSanctuaryBotDecide(state, state.players.bot_0);
            assert.equal(botDecision.mode, 'wait-sanctuary');
            assert.equal(botDecision.reason, 'leader-on-platform');
            assert.ok(botDecision.target);
        });

        it('resumes standard following mode once the human returns to moving downriver', () => {
            const state = G.createGameState({ seed: 700 });
            G.addPlayer(state, 'human');
            G.addPlayer(state, 'bot_0', { isBot: true });

            state.players.human.position = { x: 0, y: 0.25, z: -500 }; // Active cruising downriver
            state.players.bot_0.position = { x: 0, y: 0.25, z: -490 };

            const botDecision = evaluateSanctuaryBotDecide(state, state.players.bot_0);
            assert.equal(botDecision.mode, 'follow');
        });
    });

    // =========================================================================
    // DOMAIN 5: Full Sovereign Helmet 03 Master Verification Receipt
    // =========================================================================
    describe('5. Master Helmet 03 Verification Receipt', () => {
        it('executes runWave5aSanctuaryVerificationSuite with 100% green verification receipt', () => {
            const receipt = runWave5aSanctuaryVerificationSuite();
            assert.equal(receipt.passed, true);
            assert.equal(receipt.suite, 'qa-wave5a-pacing-economy-sanctuary');
            assert.ok(receipt.timestamp);
            assert.equal(receipt.checks.coinSanitization, true);
            assert.equal(receipt.checks.shopPurchases, true);
            assert.equal(receipt.checks.platformImmunity, true);
            assert.equal(receipt.checks.platformPhysicalStability, true);
            assert.equal(receipt.checks.botSanctuaryWaiting, true);
        });
    });
});
