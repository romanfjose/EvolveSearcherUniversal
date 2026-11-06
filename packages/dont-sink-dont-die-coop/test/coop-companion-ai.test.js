import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    COMPANION_AI_CONFIG,
    computeCompanionBotIntent,
    computeFlankPosition,
    evaluateHumanRestState,
    isPositionOnSanctuary,
    findGuardThreat,
    distXZ,
} from '../shared/coop-companion-ai.js';

describe('Co-Op Companion Formation & Sanctuary-Waiting AI', () => {

    describe('Flank Position & Distance Range (8m - 14m)', () => {
        test('calculates flank position within 8m to 14m envelope for port and starboard slots', () => {
            const humanPos = { x: 0, z: -100 };

            // Bot 0 (Port)
            const flank0 = computeFlankPosition(humanPos, 0, 15);
            assert.ok(flank0.distance >= COMPANION_AI_CONFIG.formation.minFlankDistance);
            assert.ok(flank0.distance <= COMPANION_AI_CONFIG.formation.maxFlankDistance);
            assert.ok(flank0.x < humanPos.x, 'Bot 0 should flank port (negative X)');
            assert.ok(flank0.z > humanPos.z, 'Bot 0 should trail at or behind human (greater Z)');

            // Bot 1 (Starboard)
            const flank1 = computeFlankPosition(humanPos, 1, 15);
            assert.ok(flank1.distance >= COMPANION_AI_CONFIG.formation.minFlankDistance);
            assert.ok(flank1.distance <= COMPANION_AI_CONFIG.formation.maxFlankDistance);
            assert.ok(flank1.x > humanPos.x, 'Bot 1 should flank starboard (positive X)');
            assert.ok(flank1.z > humanPos.z, 'Bot 1 should trail at or behind human (greater Z)');
        });

        test('clamps lateral target within river half-width safely avoiding walls', () => {
            const humanNearWall = { x: 13, z: -200 };
            const flank = computeFlankPosition(humanNearWall, 1, 15);
            assert.ok(flank.x <= 13.5, 'Must not place target inside or through river bank');
        });
    });

    describe('Sanctuary Platform Collision & Rest State Detection', () => {
        const platform = {
            id: 'plat_1',
            x: 5,
            z: -300,
            width: 10,
            length: 12,
        };

        test('correctly identifies when position is on sanctuary platform', () => {
            assert.equal(isPositionOnSanctuary({ x: 5, z: -300 }, platform), true);
            assert.equal(isPositionOnSanctuary({ x: 9, z: -305 }, platform), true);
            assert.equal(isPositionOnSanctuary({ x: 12, z: -300 }, platform), false);
            assert.equal(isPositionOnSanctuary({ x: 5, z: -350 }, platform), false);
        });

        test('supports circular sanctuary platform radius checks', () => {
            const circularPlat = { x: 0, z: -500, radius: 8 };
            assert.equal(isPositionOnSanctuary({ x: 2, z: -502 }, circularPlat), true);
            assert.equal(isPositionOnSanctuary({ x: 10, z: -500 }, circularPlat), false);
        });

        test('evaluateHumanRestState flags sanctuary resting when human enters platform', () => {
            const human = {
                id: 'player_1',
                position: { x: 5, z: -300 },
                velocity: { x: 0, z: 0 },
            };
            const rest = evaluateHumanRestState(human, [platform], -200);
            assert.equal(rest.isResting, true);
            assert.equal(rest.reason, 'sanctuary');
            assert.equal(rest.platform.id, 'plat_1');
        });
    });

    describe('Harbor City Shop & Anchor Detection', () => {
        test('detects when human stops in the Harbor City Shop near zShop', () => {
            const humanInShop = {
                id: 'player_1',
                position: { x: 10, z: -205 },
                velocity: { x: 0.1, z: 0.2 }, // stationary / low speed
            };
            const rest = evaluateHumanRestState(humanInShop, [], -200);
            assert.equal(rest.isResting, true);
            assert.equal(rest.reason, 'shop');
            assert.equal(rest.inShop, true);
        });

        test('detects when human explicitly drops anchor or stops paddling', () => {
            const humanAnchored = {
                id: 'player_1',
                position: { x: 0, z: -150 },
                velocity: { x: 0, z: 0 },
                anchorDropped: true,
            };
            const rest = evaluateHumanRestState(humanAnchored, [], -200);
            assert.equal(rest.isResting, true);
            assert.equal(rest.reason, 'anchored');
            assert.equal(rest.isAnchored, true);
        });
    });

    describe('Companion Bot Intent: Cruising Flank Formation', () => {
        test('maintains flank cruising formation alongside moving human player', () => {
            const bot = {
                id: 'bot_1',
                botIndex: 0,
                position: { x: -7, z: -94 },
                velocity: { x: 0, z: -10 },
            };
            const human = {
                id: 'player_1',
                position: { x: 0, z: -100 },
                velocity: { x: 0, z: -10 },
                inputs: { w: true },
            };

            const intent = computeCompanionBotIntent({
                bot,
                humanPlayers: [human],
                platforms: [],
                enemies: [],
                riverWidth: 30,
            });

            assert.equal(intent.state, 'flank_cruise');
            assert.equal(intent.brake, false);
            assert.ok(intent.throttle > 0);
            assert.ok(intent.flankDistance >= 8.0 && intent.flankDistance <= 14.0);
            assert.equal(intent.guarding, false);
        });

        test('prevents companion bot from racing downriver ahead of human player', () => {
            // Downriver is negative Z. If bot is at z = -120 and human is at z = -100,
            // the bot is 20m ahead downriver! It MUST immediately brake and hold.
            const racingAheadBot = {
                id: 'bot_1',
                botIndex: 0,
                position: { x: 0, z: -120 },
                velocity: { x: 0, z: -12 },
            };
            const laggingHuman = {
                id: 'player_1',
                position: { x: 0, z: -100 },
                velocity: { x: 0, z: -5 },
            };

            const intent = computeCompanionBotIntent({
                bot: racingAheadBot,
                humanPlayers: [laggingHuman],
            });

            assert.equal(intent.state, 'tether_brake');
            assert.equal(intent.brake, true, 'Bot must immediately brake if racing ahead');
            assert.equal(intent.throttle, 0.0);
            assert.equal(intent.racingAheadBlocked, true);
            assert.ok(intent.target.z >= laggingHuman.position.z, 'Target must trail behind human');
        });
    });

    describe('Companion Bot Intent: Waiting & Mooring at Sanctuary / Shop', () => {
        test('brakes and docks when human stops at Harbor City Shop', () => {
            const bot = {
                id: 'bot_1',
                botIndex: 0,
                position: { x: 8, z: -198 },
                velocity: { x: 0, z: 0 },
            };
            const humanInShop = {
                id: 'player_1',
                position: { x: 12, z: -202 },
                velocity: { x: 0, z: 0 },
                inShop: true,
            };

            const intent = computeCompanionBotIntent({
                bot,
                humanPlayers: [humanInShop],
                zShop: -200,
            });

            assert.ok(intent.state === 'waiting_docked' || intent.state === 'docking_approach');
            assert.equal(intent.guarding, true);
            assert.equal(intent.restReason, 'shop');
            if (intent.state === 'waiting_docked') {
                assert.equal(intent.brake, true);
                assert.equal(intent.throttle, 0.0);
            }
        });

        test('steers toward sanctuary platform mooring slot when human lands on platform', () => {
            const platform = { id: 'sanctuary_alpha', x: 0, z: -400, width: 14, length: 14 };
            const humanOnPlatform = {
                id: 'player_1',
                position: { x: 0, z: -400 },
                velocity: { x: 0, z: 0 },
                onSanctuary: true,
            };
            const botApproaching = {
                id: 'bot_1',
                botIndex: 0,
                position: { x: 0, z: -385 },
                velocity: { x: 0, z: -5 },
            };

            const intent = computeCompanionBotIntent({
                bot: botApproaching,
                humanPlayers: [humanOnPlatform],
                platforms: [platform],
            });

            assert.ok(intent.state === 'docking_approach' || intent.state === 'waiting_docked');
            assert.equal(intent.restReason, 'sanctuary');
            assert.equal(intent.guarding, true);
            assert.ok(intent.target !== null);
        });

        test('holds position when human drops anchor on open river', () => {
            const anchoredHuman = {
                id: 'player_1',
                position: { x: 2, z: -150 },
                velocity: { x: 0, z: 0 },
                anchorDropped: true,
            };
            // Stationed bot near its anchor orbit slot
            const botStationed = {
                id: 'bot_1',
                botIndex: 0,
                position: { x: 6.2, z: -145.8 },
                velocity: { x: 0, z: 0 },
            };

            const intent = computeCompanionBotIntent({
                bot: botStationed,
                humanPlayers: [anchoredHuman],
            });

            assert.equal(intent.state, 'waiting_docked');
            assert.equal(intent.brake, true);
            assert.equal(intent.throttle, 0.0);
            assert.equal(intent.restReason, 'anchored');
        });
    });

    describe('Guarding & Intercepting Threats', () => {
        test('findGuardThreat identifies the closest active enemy within guard radius', () => {
            const humanPos = { x: 0, z: -200 };
            const enemies = [
                { id: 'mud_1', position: { x: 3, z: -210 }, health: 50 },
                { id: 'mud_dead', position: { x: 1, z: -202 }, health: 0, isDead: true },
                { id: 'mud_far', position: { x: 50, z: -300 }, health: 100 },
            ];

            const threat = findGuardThreat(humanPos, enemies, 25);
            assert.ok(threat !== null);
            assert.equal(threat.enemy.id, 'mud_1');
        });

        test('switches to guard_intercept and engages threat when enemy approaches resting human', () => {
            const bot = {
                id: 'bot_1',
                botIndex: 0,
                position: { x: 2, z: -200 },
                velocity: { x: 0, z: 0 },
            };
            const humanAtShop = {
                id: 'player_1',
                position: { x: 10, z: -200 },
                velocity: { x: 0, z: 0 },
                inShop: true,
            };
            const enemyThreat = {
                id: 'alien_raider',
                position: { x: 6, z: -203 },
                health: 80,
            };

            const intent = computeCompanionBotIntent({
                bot,
                humanPlayers: [humanAtShop],
                enemies: [enemyThreat],
                zShop: -200,
            });

            assert.equal(intent.state, 'guard_intercept');
            assert.equal(intent.guarding, true);
            assert.equal(intent.threatTarget.id, 'alien_raider');
            assert.ok(intent.steer !== undefined);
        });

        test('triggers attack when close to the target enemy during guard intercept', () => {
            const bot = {
                id: 'bot_1',
                botIndex: 0,
                position: { x: 5, z: -200 },
                velocity: { x: 0, z: 0 },
            };
            const humanAnchored = {
                id: 'player_1',
                position: { x: 0, z: -200 },
                anchorDropped: true,
            };
            const closeEnemy = {
                id: 'close_worm',
                position: { x: 7, z: -201 },
                health: 40,
            };

            const intent = computeCompanionBotIntent({
                bot,
                humanPlayers: [humanAnchored],
                enemies: [closeEnemy],
            });

            assert.equal(intent.state, 'guard_intercept');
            assert.equal(intent.attack, true);
            assert.equal(intent.brake, true);
        });
    });

    describe('Robust Edge Case Handling', () => {
        test('handles dead bot cleanly', () => {
            const intent = computeCompanionBotIntent({
                bot: { id: 'bot_dead', isDead: true, health: 0 },
            });
            assert.equal(intent.state, 'dead');
            assert.equal(intent.brake, true);
            assert.equal(intent.throttle, 0);
        });

        test('handles missing or empty human players by solo drifting', () => {
            const bot = { id: 'bot_solo', position: { x: 0, z: -50 } };
            const intent = computeCompanionBotIntent({
                bot,
                humanPlayers: [],
            });
            assert.equal(intent.state, 'solo_drift');
            assert.equal(intent.guarding, false);
        });

        test('handles all human players dead', () => {
            const bot = { id: 'bot_survivor', position: { x: 0, z: -50 } };
            const humanDead = { id: 'human_rip', isDead: true, health: 0 };
            const intent = computeCompanionBotIntent({
                bot,
                humanPlayers: [humanDead],
            });
            assert.equal(intent.state, 'solo_drift');
        });

        test('handles missing optional parameters without throwing', () => {
            const bot = { id: 'bot_test', position: { x: 0, z: 0 } };
            const human = { id: 'p1', position: { x: 0, z: 0 } };
            const intent = computeCompanionBotIntent({ bot, humanPlayers: [human] });
            assert.ok(intent !== null);
            assert.equal(typeof intent.steer, 'number');
            assert.equal(typeof intent.throttle, 'number');
        });
    });

});
