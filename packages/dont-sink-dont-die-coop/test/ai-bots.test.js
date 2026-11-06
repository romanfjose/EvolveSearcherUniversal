import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    BOT_ALIVENESS_CONFIG,
    createBotAlivenessState,
    evaluateBotDangerReaction,
    findNearestSafePlank,
    isBotTargetedByRiverMage,
    isBotTargetedByNokiaWorm,
    shouldBotHopToPlank,
    shouldBotSwingAtEnemy,
    triggerBotSwing,
    triggerVictoryHop,
    stepVictoryHop,
    stepBotExpressiveAliveness,
} from '../shared/ai-bots.js';
import { PLAYER } from '../shared/game-core.js';

describe('AI Companion Bots Physical Expressiveness & Reactive Aliveness (shared/ai-bots.js)', () => {
    describe('1. Danger Detection & Ducking/Bracing Reactions', () => {
        test('isBotTargetedByRiverMage detects telegraph windup within threat radius', () => {
            const botPos = { x: 0, y: 0.25, z: -50 };
            const mage = { id: 'whiteGuy', health: 100, position: { x: 2, y: 0.5, z: -60 } }; // dist ~ 10.2m (< 18m)
            const telegraphActive = { windup: 0.45, duration: 0.85 };
            const telegraphIdle = { windup: 0, duration: 0.85 };

            assert.equal(isBotTargetedByRiverMage(botPos, mage, telegraphActive), true);
            // Even without windup, close proximity (< 14m) triggers alertness
            assert.equal(isBotTargetedByRiverMage(botPos, mage, telegraphIdle), true);

            // Far away (> 18m) should not target bot
            const farMage = { id: 'whiteGuy', health: 100, position: { x: 0, y: 0.5, z: -80 } }; // dist = 30m
            assert.equal(isBotTargetedByRiverMage(botPos, farMage, telegraphActive), false);

            // Dead mage poses no threat
            const deadMage = { id: 'whiteGuy', health: 0, position: { x: 2, y: 0.5, z: -60 } };
            assert.equal(isBotTargetedByRiverMage(botPos, deadMage, telegraphActive), false);
        });

        test('isBotTargetedByNokiaWorm detects charging vector along corridor', () => {
            const botPos = { x: 2, y: 0.25, z: -100 };
            const wormChargingInCorridor = {
                id: 'longWorm',
                health: 200,
                state: 'charging',
                position: { x: 0, y: 0.5, z: -80 },
                targetPos: { x: 0, z: -120 },
            };
            assert.equal(isBotTargetedByNokiaWorm(botPos, wormChargingInCorridor), true);

            // Worm not charging (e.g. idle or submerged)
            const wormIdle = { ...wormChargingInCorridor, state: 'idle' };
            assert.equal(isBotTargetedByNokiaWorm(botPos, wormIdle), false);

            // Worm charging in completely distant corridor
            const wormFarX = {
                ...wormChargingInCorridor,
                position: { x: 18, y: 0.5, z: -80 },
                targetPos: { x: 18, z: -120 },
            };
            assert.equal(isBotTargetedByNokiaWorm(botPos, wormFarX), false);
        });

        test('evaluateBotDangerReaction commands duck and brace when targeted', () => {
            const bot = { id: 'bot_1', position: { x: 1, y: 0.25, z: -50 }, health: 80 };
            const enemies = {
                whiteGuy: { id: 'whiteGuy', health: 120, position: { x: 0, y: 0.5, z: -55 } },
                longWorm: { id: 'longWorm', health: 200, state: 'idle', position: { x: 0, z: 0 } },
            };
            const telegraphs = {
                whiteGuy: { windup: 0.5, duration: 0.85 },
            };

            const reaction = evaluateBotDangerReaction(bot, enemies, telegraphs);
            assert.equal(reaction.shouldDuck, true);
            assert.equal(reaction.shouldBrace, true);
            assert.equal(reaction.threatType, 'riverMage');

            // Dead bot does not duck
            bot.isDead = true;
            assert.equal(evaluateBotDangerReaction(bot, enemies, telegraphs).shouldDuck, false);
        });
    });

    describe('2. Physical Combat Swings & Weapon Reach', () => {
        test('shouldBotSwingAtEnemy returns true within melee reach distance', () => {
            const bot = { position: { x: 0, y: 0.25, z: -20 } };
            const nearEnemy = { position: { x: 1.5, y: 0.5, z: -22 }, health: 50 }; // dist ~ 2.5m
            const farEnemy = { position: { x: 10, y: 0.5, z: -35 }, health: 50 };   // dist > 15m

            assert.equal(shouldBotSwingAtEnemy(bot, nearEnemy), true);
            assert.equal(shouldBotSwingAtEnemy(bot, farEnemy), false);
        });

        test('triggerBotSwing initiates swing timer and stepBotExpressiveAliveness produces swing arc', () => {
            const state = createBotAlivenessState('b0');
            const bot = { id: 'b0', position: { x: 0, y: 0.25, z: 0 }, health: 100 };

            triggerBotSwing(state);
            assert.equal(state.isSwinging, true);
            assert.ok(state.swingTimer > 0);

            const frame = stepBotExpressiveAliveness(state, bot, {}, 0.1);
            assert.ok(frame.swingArc > 0, 'Swing arc should be positive during swing');
        });
    });

    describe('3. Low-HP Safe Plank Hopping Refuge', () => {
        test('findNearestSafePlank identifies closest elevated platform', () => {
            const botPos = { x: 2, y: 0.25, z: -100 };
            const platforms = [
                { id: 'p_low', x: 0, y: 0.5, z: -105 }, // below safeHeight
                { id: 'p_near', x: 5, y: 1.5, z: -102 }, // elevated, distance ~ 3.6m
                { id: 'p_far', x: 0, y: 2.0, z: -150 },  // elevated, distance 50m
            ];

            const found = findNearestSafePlank(botPos, platforms);
            assert.ok(found);
            assert.equal(found.id, 'p_near');
            assert.ok(found.y > PLAYER.safeHeight);
        });

        test('shouldBotHopToPlank triggers only when HP is critical and near a safe plank', () => {
            const safePlatforms = [{ id: 'dock_1', x: 4, y: 1.5, z: -50 }];

            // Full health: should NOT hop
            const healthyBot = { id: 'b0', health: 100, maxHealth: 100, position: { x: 0, y: 0.25, z: -50 } };
            assert.equal(shouldBotHopToPlank(healthyBot, safePlatforms).shouldHop, false);

            // Critical health (25 HP / 100): SHOULD hop towards safe plank
            const woundedBot = { id: 'b0', health: 25, maxHealth: 100, position: { x: 0, y: 0.25, z: -50 } };
            const hopRes = shouldBotHopToPlank(woundedBot, safePlatforms);
            assert.equal(hopRes.shouldHop, true);
            assert.equal(hopRes.targetPlank.id, 'dock_1');
            assert.ok(hopRes.hopImpulse.y > 0, 'Must have upward jump impulse');

            // If already onSolid / elevated, no need to hop
            const perchedBot = { ...woundedBot, onSolid: true, position: { x: 4, y: 1.5, z: -50 } };
            assert.equal(shouldBotHopToPlank(perchedBot, safePlatforms).shouldHop, false);
        });
    });

    describe('4. Victory Hops & Celebratory Reactions', () => {
        test('triggerVictoryHop and stepVictoryHop generate smooth vertical arc and arm raise', () => {
            const state = createBotAlivenessState('b1');
            triggerVictoryHop(state, 'enemy_killed');
            assert.equal(state.lastCelebrationReason, 'enemy_killed');
            assert.ok(state.victoryHopTimer > 0);

            // Mid-hop step
            const midHop = stepVictoryHop(state, BOT_ALIVENESS_CONFIG.victory.hopDurationSec * 0.5);
            assert.equal(midHop.isHopping, true);
            assert.ok(midHop.yOffset > 0.4, 'Mid-hop should reach near peak height');
            assert.ok(Math.abs(midHop.armAngle) > 1.0, 'Arm angle should be raised high in celebration');

            // Complete hop
            const endHop = stepVictoryHop(state, BOT_ALIVENESS_CONFIG.victory.hopDurationSec);
            assert.equal(endHop.isHopping, false);
            assert.ok(Math.abs(endHop.yOffset) < 1e-6);
        });
    });

    describe('5. Integrated stepBotExpressiveAliveness Simulation', () => {
        test('blends ducking posture when danger approaches and releases smoothly', () => {
            const state = createBotAlivenessState('b0');
            const bot = { id: 'b0', position: { x: 0, y: 0.25, z: -30 }, health: 90 };
            const enemies = {
                whiteGuy: { id: 'whiteGuy', health: 100, position: { x: 1, y: 0.5, z: -35 } },
            };
            const telegraphs = {
                whiteGuy: { windup: 0.6, duration: 0.85 },
            };

            // Step with danger present
            const frame1 = stepBotExpressiveAliveness(state, bot, { enemies, telegraphs }, 0.1);
            assert.equal(frame1.isDucking, true);
            assert.equal(frame1.isBracing, true);
            assert.ok(frame1.duckOffsetY < 0, 'Duck crouch should lower torso');
            assert.ok(frame1.duckPitch > 0, 'Duck posture should tilt torso forward');
            assert.ok(frame1.braceAngle < 0, 'Brace angle should tuck arms defensively');

            // Enemy killed or removed -> danger ends -> posture eases back up
            enemies.whiteGuy.health = 0;
            const frame2 = stepBotExpressiveAliveness(state, bot, { enemies, telegraphs }, 0.5);
            assert.equal(frame2.isDucking, false);
            assert.equal(frame2.isBracing, false);
        });
    });
});
