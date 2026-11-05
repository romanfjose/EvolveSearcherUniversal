import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    UTILITY_CONFIG,
    scoreWhirlpoolAvoidance,
    scoreRampAlignment,
    scoreLootPickup,
    scoreFocusFire,
    scoreTetherRetention,
    evaluateCrewUtilityPlan,
    computeCrewBotPlan,
} from '../shared/ai-utility-planner.js';

describe('Autonomous AI Crewmate Utility Planner', () => {

    describe('Objective (1): Whirlpool Avoidance Scorer', () => {
        test('returns maximum safety utility (1.0) and zero danger when no whirlpools exist', () => {
            const res = scoreWhirlpoolAvoidance({ x: 0, z: -100 }, []);
            assert.equal(res.utility, 1.0);
            assert.equal(res.danger, 0.0);
            assert.equal(res.recommendedSteer, 0.0);
            assert.equal(res.targetWhirlpool, null);
            assert.equal(res.targetPos, null);
        });

        test('detects imminent downstream whirlpool and produces evasion steering away from center', () => {
            const botPos = { x: 2, z: -50 };
            const whirlpools = [
                { id: 'wp_1', x: 2, z: -60, radius: 8.0 }
            ];
            const res = scoreWhirlpoolAvoidance(botPos, whirlpools);
            assert.ok(res.danger > 0.0);
            assert.ok(res.utility < 1.0);
            assert.notEqual(res.recommendedSteer, 0);
            assert.equal(res.targetWhirlpool.id, 'wp_1');
            assert.ok(res.targetPos !== null);
        });

        test('ignores whirlpools far upstream or beyond threat horizon', () => {
            const botPos = { x: 0, z: -100 };
            const whirlpools = [
                { id: 'wp_past', x: 0, z: -80, radius: 6.0 },   // Upriver (behind)
                { id: 'wp_far', x: 0, z: -160, radius: 6.0 },   // Too far downriver
            ];
            const res = scoreWhirlpoolAvoidance(botPos, whirlpools);
            assert.equal(res.danger, 0.0);
            assert.equal(res.utility, 1.0);
            assert.equal(res.recommendedSteer, 0.0);
        });

        test('steers back toward river center if dodging would crash into river wall', () => {
            const botPos = { x: 12.0, z: -50 }; // near right bank
            const whirlpools = [
                { id: 'wp_wall', x: 11.0, z: -55, radius: 7.0 }
            ];
            const res = scoreWhirlpoolAvoidance(botPos, whirlpools);
            assert.ok(res.danger > 0);
            // Steering left (< 0) away from right bank
            assert.ok(res.recommendedSteer < 0);
        });
    });

    describe('Objective (2): Waterfall Stunt-Ramp Alignment Scorer', () => {
        test('returns zero utility when no ramps are available', () => {
            const res = scoreRampAlignment({ x: 0, z: -100 }, []);
            assert.equal(res.utility, 0.0);
            assert.equal(res.recommendedSteer, 0.0);
            assert.equal(res.targetRamp, null);
            assert.equal(res.aligned, false);
        });

        test('identifies downriver ramp and recommends lateral steering to align', () => {
            const botPos = { x: -4, z: -50 };
            const ramps = [
                { id: 'ramp_1', x: 2, z: -70, width: 6.0 }
            ];
            const res = scoreRampAlignment(botPos, ramps);
            assert.ok(res.utility > 0.0);
            assert.ok(res.recommendedSteer > 0.0); // steer right toward x=2
            assert.equal(res.targetRamp.id, 'ramp_1');
            assert.equal(res.aligned, false);
        });

        test('marks ramp as aligned when bot lateral position is within ramp width', () => {
            const botPos = { x: 2.2, z: -50 };
            const ramps = [
                { id: 'ramp_1', x: 2.0, z: -65, width: 6.0 }
            ];
            const res = scoreRampAlignment(botPos, ramps);
            assert.equal(res.aligned, true);
            assert.equal(res.recommendedSteer, 0.0);
        });

        test('ignores ramps that are already passed or out of seek range', () => {
            const botPos = { x: 0, z: -100 };
            const ramps = [
                { id: 'ramp_behind', x: 0, z: -90, width: 6.0 },
                { id: 'ramp_distant', x: 0, z: -200, width: 6.0 },
            ];
            const res = scoreRampAlignment(botPos, ramps);
            assert.equal(res.utility, 0.0);
            assert.equal(res.targetRamp, null);
        });
    });

    describe('Objective (3): Floating Coin Crate Pickup Scorer', () => {
        test('returns zero utility when no pickups are present or all collected', () => {
            const res1 = scoreLootPickup({ x: 0, z: 0 }, []);
            assert.equal(res1.utility, 0.0);

            const res2 = scoreLootPickup({ x: 0, z: 0 }, [
                { id: 'c1', position: { x: 0, z: -5 }, collected: true }
            ]);
            assert.equal(res2.utility, 0.0);
        });

        test('prioritizes high-value chests over loose coin streams at comparable distance', () => {
            const botPos = { x: 0, z: -50 };
            const pickups = [
                { id: 'coin_stream', type: 'gold-coin-stream', position: { x: -3, z: -60 }, collected: false },
                { id: 'chest', type: 'treasure-chest', position: { x: 3, z: -60 }, collected: false },
            ];
            const res = scoreLootPickup(botPos, pickups);
            assert.equal(res.targetPickup.id, 'chest');
            assert.ok(res.utility > 0);
            assert.ok(res.recommendedSteer > 0); // Steers right toward chest
        });

        test('selects closer item when distance significantly outweighs type bonus', () => {
            const botPos = { x: 0, z: -50 };
            const pickups = [
                { id: 'coin_close', type: 'gold-coin-stream', position: { x: 1, z: -52 }, collected: false },
                { id: 'chest_far', type: 'treasure-chest', position: { x: 0, z: -92 }, collected: false },
            ];
            const res = scoreLootPickup(botPos, pickups);
            assert.equal(res.targetPickup.id, 'coin_close');
        });
    });

    describe('Objective (4): Low-HP Enemy Focus Fire Scorer', () => {
        test('returns zero utility when no enemies are alive', () => {
            const res = scoreFocusFire({ x: 0, z: 0 }, []);
            assert.equal(res.utility, 0.0);
            assert.equal(res.targetEnemy, null);
        });

        test('prioritizes low-HP wounded enemy for focus fire', () => {
            const botPos = { x: 0, z: -50 };
            const enemies = [
                { id: 'enemy_tank', health: 150, maxHealth: 150, position: { x: -2, z: -55 } },
                { id: 'enemy_weak', health: 15, maxHealth: 100, position: { x: 3, z: -56 } },
            ];
            const res = scoreFocusFire(botPos, enemies);
            assert.equal(res.targetEnemy.id, 'enemy_weak');
            assert.ok(res.utility > 0);
            assert.ok(res.recommendedSteer > 0);
        });

        test('ignores dead or out of range enemies', () => {
            const botPos = { x: 0, z: -50 };
            const enemies = [
                { id: 'dead_guy', health: 0, isDead: true, position: { x: 0, z: -52 } },
                { id: 'far_guy', health: 10, position: { x: 0, z: -120 } },
            ];
            const res = scoreFocusFire(botPos, enemies);
            assert.equal(res.utility, 0.0);
            assert.equal(res.targetEnemy, null);
        });
    });

    describe('Objective (5): Co-op Tether Range Scorer', () => {
        test('maintains high utility (1.0) and zero violation when human is near or dead', () => {
            const botPos = { x: 0, z: -50 };
            const human = { id: 'p1', position: { x: 1, z: -53 }, isDead: false };
            const res = scoreTetherRetention(botPos, human);
            assert.equal(res.utility, 1.0);
            assert.equal(res.tetherViolation, false);

            const deadHuman = { id: 'p1', position: { x: 0, z: 0 }, isDead: true };
            const deadRes = scoreTetherRetention(botPos, deadHuman);
            assert.equal(deadRes.utility, 1.0);
        });

        test('triggers soft leash decay when exceeding soft tether limit', () => {
            const botPos = { x: 0, z: -50 };
            const human = { id: 'p1', position: { x: 0, z: -15 }, isDead: false }; // dist = 35m (soft is 28m)
            const res = scoreTetherRetention(botPos, human);
            assert.ok(res.utility < 1.0 && res.utility > 0.0);
            assert.equal(res.tetherViolation, false);
            assert.equal(res.distanceToLeader, 35.0);
        });

        test('triggers hard tether violation (utility 0) when exceeding hard tether limit', () => {
            const botPos = { x: 0, z: -100 };
            const human = { id: 'p1', position: { x: 0, z: -40 }, isDead: false }; // dist = 60m (hard is 45m)
            const res = scoreTetherRetention(botPos, human);
            assert.equal(res.utility, 0.0);
            assert.equal(res.tetherViolation, true);
        });
    });

    describe('Composite Utility Evaluator: evaluateCrewUtilityPlan & computeCrewBotPlan', () => {
        test('evaluates candidate actions and prioritizes whirlpool evasion above all else', () => {
            const bot = { id: 'bot_1', position: { x: 0, z: -50 }, upgrades: [] };
            const context = {
                whirlpools: [{ id: 'wp_danger', x: 0.5, z: -56, radius: 8.0 }],
                ramps: [{ id: 'ramp_1', x: 0, z: -60, width: 6.0 }],
                lootPickups: [{ id: 'chest', type: 'treasure-chest', position: { x: 0, z: -55 }, collected: false }],
                enemies: [{ id: 'goblin', health: 10, maxHealth: 50, position: { x: 0, z: -54 } }],
                humanPlayer: { id: 'leader', position: { x: 0, z: -45 }, isDead: false },
            };

            const plan = evaluateCrewUtilityPlan(bot, context);
            assert.equal(plan.topAction, 'dodge_whirlpool');
            assert.notEqual(plan.steer, 0);

            const botPlan = computeCrewBotPlan(bot, context);
            assert.equal(botPlan.mode, 'dodge_whirlpool');
            assert.equal(botPlan.paddle, true);
            assert.equal(Number.isFinite(botPlan.steer), true);
        });

        test('prioritizes low-HP focus fire when no immediate environmental hazard threatens', () => {
            const bot = { id: 'bot_1', position: { x: 0, z: -50 }, upgrades: [] };
            const context = {
                whirlpools: [],
                ramps: [],
                lootPickups: [],
                enemies: [{ id: 'low_hp_boss', health: 15, maxHealth: 150, position: { x: 1.5, z: -52 } }],
                humanPlayer: { id: 'leader', position: { x: 0, z: -48 }, isDead: false },
            };

            const plan = computeCrewBotPlan(bot, context);
            assert.equal(plan.mode, 'focus_fire');
            assert.equal(plan.attack, true); // enemy is within 4m attack range
            assert.ok(plan.steer > 0); // steers right toward enemy at x=1.5
        });

        test('prioritizes stunt-ramp alignment when ramp is ahead and triggers jump when lip is reached', () => {
            const bot = { id: 'bot_1', position: { x: 3.0, z: -60 }, upgrades: [] };
            const context = {
                whirlpools: [],
                ramps: [{ id: 'ramp_1', x: 3.0, z: -62, width: 6.0 }], // ramp is 2m ahead and aligned!
                lootPickups: [],
                enemies: [],
                humanPlayer: { id: 'leader', position: { x: 0, z: -55 }, isDead: false },
            };

            const plan = computeCrewBotPlan(bot, context);
            assert.equal(plan.mode, 'align_ramp');
            assert.equal(plan.jump, true);
        });

        test('switches to tether regrouping when human player is too far ahead or behind', () => {
            const bot = { id: 'bot_1', position: { x: 0, z: -120 }, upgrades: [] };
            const context = {
                whirlpools: [],
                ramps: [],
                lootPickups: [{ id: 'coin', type: 'gold-coin-stream', position: { x: 5, z: -125 }, collected: false }],
                enemies: [],
                humanPlayer: { id: 'leader', position: { x: 0, z: -50 }, isDead: false }, // 70m away!
            };

            const plan = computeCrewBotPlan(bot, context);
            assert.equal(plan.mode, 'regroup_tether');
        });

        test('gracefully handles dead bot or null positions with safe defaults', () => {
            const deadBot = { id: 'bot_dead', isDead: true, position: { x: 0, z: 0 } };
            const plan = computeCrewBotPlan(deadBot, {});
            assert.equal(plan.mode, 'dead');
            assert.equal(plan.steer, 0);
            assert.equal(plan.paddle, false);

            const nullPlan = evaluateCrewUtilityPlan(null, {});
            assert.equal(nullPlan.topAction, 'idle');
            assert.equal(nullPlan.steer, 0);
        });

        test('clamps steering to prevent bot from breaching river corridor walls', () => {
            const bot = { id: 'bot_edge', position: { x: 14.5, z: -50 }, upgrades: [] };
            const context = {
                whirlpools: [],
                ramps: [],
                lootPickups: [{ id: 'coin_outside', position: { x: 18, z: -55 }, collected: false }],
                enemies: [],
                humanPlayer: null,
            };

            const plan = computeCrewBotPlan(bot, context);
            assert.ok(plan.steer <= 0); // Must not steer further right outside river bounds
        });
    });

});
