/**
 * Helmet 03 — Synthetic José QA (The "Where's the Bathroom?" Breaker)
 * Dual-Oar Stroke, Input Chaos, State Transition & Adversarial Stress Test Suite
 * (`test/qa-dual-oar-and-stroke-breaker.test.js`)
 *
 * Sovereign Core & Active Helmet (03_HELMET_QA_BREAKER.md) Directives:
 * - Real User + Ruthless Saboteur Contact: Never trust builder self-report or green mock theatre.
 * - Ask Where the Bathroom Is: 5-Angle Adversarial Attack against core game physics, combat,
 *   shop, enemy states, and wingman companion bots in `shared/game-core.js` and companion modules.
 *
 * 5-Angle Attack Matrix:
 * - Angle 1 (Input Chaos): Rapid out-of-order key toggling (`W`, `S`, `A`, `D`, `Space`, `attacking`)
 *   at variable dt (`0`, `1/240`, `1/60`, `0.25`) — zero NaNs in craft.position, craft.velocity, craft.yaw.
 * - Angle 2 (Mid-Action State Transitions): Purchasing motor upgrade while mid-air or docked on a solid plank,
 *   and stepping from water onto a `costado` plank while attacking — clean state transitions and mooring brake.
 * - Angle 3 (Adversarial Shop & Economy Spam): Attempting double-buys, negative/NaN coin balances,
 *   unknown upgrade strings, and rapid open/close cycles.
 * - Angle 4 (3 Dream Entities Boundary Stress): Testing `whiteGuy` safe-height immunity on planks,
 *   `mudAlien` city pier pursuit & police aggro, and `longWorm` 26-segment straight-vector lock under extreme coordinates.
 * - Angle 5 (Multiplayer Co-Op & Wingman Bot Desync): Disconnecting the lead player mid-wave while bots
 *   and enemies are active — target re-acquisition without crashes.
 *
 * Zero external dependencies. Pure ES module test suite for Node.js test runner (`node:test`, `node:assert/strict`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    PLAYER,
    WATER_SURFACE_Y,
    PHYSICS,
    UPGRADES,
    ENEMY_TYPES,
    SHOP_ZONE,
    createRng,
    createGameState,
    addPlayer,
    removePlayer,
    alivePlayers,
    leadPlayer,
    rearPlayer,
    spawnEnemy,
    playerHitEnemy,
    resolveEnemyHit,
    buyUpgrade,
    canPurchase,
    upgradeStats,
    handleClientEvent,
    driveWatercraft,
    stepWatercraftKinematics,
    resolveWorldBoundsAndObstacles,
    settleOnWater,
    stepWhiteGuy,
    stepMudAlien,
    stepLongWorm,
    tick,
    botDecide,
    stepBot,
} from '../shared/game-core.js';

import {
    canPurchaseArmoryUpgrade,
    UPGRADE_SLOTS,
} from '../shared/upgrade-tree.js';

import {
    sanitizeCoins,
    executeVerifiedShopPurchase,
} from '../shared/economy-integrity-guard.js';

import {
    createBotOrderState,
    issueBotOrder,
    decideTacticalBotOrder,
    BOT_COMMAND_IDS,
} from '../shared/bot-orders.js';

import {
    DREAM_ENTITIES,
    ENEMY_COMBAT_CONFIG,
    createEnemyCombatState,
    stepEnemyCombatState,
} from '../shared/enemies.js';

describe('Helmet 03 — Synthetic José QA Breaker: Dual-Oar Stroke & 5-Angle Chaos Suite', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // Angle 1: Input Chaos
    // Rapid out-of-order key toggling at variable dt (0, 1/240, 1/60, 0.25)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Angle 1 (Input Chaos): Rapid Out-of-Order Input Fuzzing & Variable Timesteps', () => {
        it('verifies zero NaNs across craft.position, velocity, and yaw under chaotic key bursts', () => {
            const rng = createRng(1337);
            const craft = {
                position: { x: 0, y: WATER_SURFACE_Y, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                angularVelocity: { x: 0, y: 0, z: 0 },
                yaw: 0,
            };

            const variableDts = [0, 1 / 240, 1 / 120, 1 / 60, 0.05, 0.25];
            const testSteps = 300;

            for (let step = 0; step < testSteps; step++) {
                const input = {
                    w: rng() > 0.45,
                    s: rng() > 0.65,
                    a: rng() > 0.5,
                    d: rng() > 0.5,
                    space: rng() > 0.85,
                    attacking: rng() > 0.7,
                    upgrades: step > 100 ? ['motor', 'weapon'] : [],
                    onSolid: step % 40 === 0,
                };
                const dt = variableDts[Math.floor(rng() * variableDts.length)];

                stepWatercraftKinematics(craft, input, dt);

                // Sovereign Core Truth: Invariants must hold on EVERY iteration
                assert.ok(Number.isFinite(craft.position.x), `Step ${step}: position.x became non-finite: ${craft.position.x}`);
                assert.ok(Number.isFinite(craft.position.y), `Step ${step}: position.y became non-finite: ${craft.position.y}`);
                assert.ok(Number.isFinite(craft.position.z), `Step ${step}: position.z became non-finite: ${craft.position.z}`);
                assert.ok(Number.isFinite(craft.velocity.x), `Step ${step}: velocity.x became non-finite: ${craft.velocity.x}`);
                assert.ok(Number.isFinite(craft.velocity.y), `Step ${step}: velocity.y became non-finite: ${craft.velocity.y}`);
                assert.ok(Number.isFinite(craft.velocity.z), `Step ${step}: velocity.z became non-finite: ${craft.velocity.z}`);
                assert.ok(Number.isFinite(craft.yaw), `Step ${step}: yaw became non-finite: ${craft.yaw}`);
                assert.ok(Number.isFinite(craft.angularVelocity.y), `Step ${step}: angularVelocity.y became non-finite: ${craft.angularVelocity.y}`);
            }

            // Verify position has progressed downriver
            assert.ok(craft.position.z < 0, 'Craft should have travelled downriver along -z');
        });

        it('handles zero dt (dt = 0) gracefully without dividing by zero or corrupting velocity', () => {
            const craft = {
                position: { x: 3.5, y: WATER_SURFACE_Y, z: -40 },
                velocity: { x: 2.0, y: 0, z: -12.0 },
                angularVelocity: { x: 0, y: 0.5, z: 0 },
                yaw: 0.2,
            };

            const input = { w: true, a: true, s: false, d: false, space: true, attacking: true, upgrades: [] };
            stepWatercraftKinematics(craft, input, 0);

            assert.equal(craft.position.x, 3.5, 'Position must not alter when dt = 0');
            assert.equal(craft.position.z, -40, 'Position must not alter when dt = 0');
            assert.equal(craft.yaw, 0.2, 'Yaw must not alter when dt = 0');
            assert.ok(Number.isFinite(craft.velocity.x));
            assert.ok(Number.isFinite(craft.velocity.z));
            assert.ok(Number.isFinite(craft.angularVelocity.y));
        });

        it('simulates rapid opposing stroke oscillations (W+S, A+D simultaneous spam)', () => {
            const craft = {
                position: { x: 0, y: WATER_SURFACE_Y, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                angularVelocity: { x: 0, y: 0, z: 0 },
                yaw: 0,
            };

            // Both W and S held simultaneously with opposing steering A + D
            for (let i = 0; i < 60; i++) {
                const input = {
                    w: true,
                    s: true,
                    a: true,
                    d: true,
                    space: false,
                    attacking: false,
                    upgrades: [],
                };
                stepWatercraftKinematics(craft, input, 1 / 60);
            }

            // Opposing helm (A - D) should cancel out steering target, yaw rate settles to 0
            assert.equal(craft.angularVelocity.y, 0, 'Opposing steering (A+D) must resolve target turn rate to zero');
            assert.equal(craft.yaw, 0, 'Yaw should remain 0 when helm inputs cancel');
            assert.ok(craft.velocity.z < 0, 'Net forward thrust (W=400N - S=100N + current) still drives downriver');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Angle 2: Mid-Action State Transitions
    // Mid-air motor purchase, Costa plank transitions while attacking, Mooring brake
    // ─────────────────────────────────────────────────────────────────────────
    describe('Angle 2 (Mid-Action State Transitions): Mid-Air Purchases, Costado Planks & Mooring Brake', () => {
        it('allows purchasing motor upgrade while airborne without dropping out of the sky or corrupting trajectory', () => {
            const state = createGameState({ seed: 777 });
            addPlayer(state, 'p1', { isBot: false });
            const p = state.players.p1;
            p.coins = 50;

            // Player kicks off ramp and is mid-air
            p.position = { x: 0, y: 12.0, z: -80 };
            p.velocity = { x: 1.0, y: 8.5, z: -25.0 };

            // Mid-air motor purchase
            const events = buyUpgrade(state, 'p1', 'motor');
            assert.ok(events.length > 0, 'Purchase events must be generated');
            assert.deepEqual(p.upgrades, ['motor'], 'Motor must be added to inventory');
            assert.equal(p.coins, 40, 'Coins deducted correctly (50 - 10 = 40)');

            // Upgraded stats immediately reflect motor
            const stats = upgradeStats(p.upgrades);
            assert.equal(stats.motorBoost, PHYSICS.motorBoost);

            // Craft in flight continues air drag without sudden teleportation
            const craft = {
                position: { ...p.position },
                velocity: { ...p.velocity },
                angularVelocity: { x: 0, y: 0, z: 0 },
                yaw: 0,
            };

            const sim = stepWatercraftKinematics(craft, { w: true, upgrades: p.upgrades }, 1 / 60);
            assert.equal(sim.jumped, false);
            assert.ok(craft.position.y > WATER_SURFACE_Y, 'Still airborne');
            assert.ok(Number.isFinite(craft.velocity.x));
            assert.ok(Number.isFinite(craft.velocity.y));
            assert.ok(Number.isFinite(craft.velocity.z));
        });

        it('steps from water onto costado plank while attacking: snaps to deck, grants onSolid, and settles cleanly', () => {
            const craft = {
                position: { x: 13.0, y: WATER_SURFACE_Y, z: -110 },
                velocity: { x: 6.0, y: 0, z: -8.0 },
                angularVelocity: { x: 0, y: 0, z: 0 },
                yaw: 0,
            };

            // Costado (riverbank) natural vegetation / wood plank with easy ramp
            const costadoPlank = {
                type: 'plank',
                x: 13.5,
                z: -110,
                topY: 1.6,
                halfW: 2.5,
                halfD: 6.0,
                easyRamp: true,
            };

            // Collision resolution while stepping onto costado
            const col = resolveWorldBoundsAndObstacles(craft, [costadoPlank]);
            assert.equal(col.onSolid, true, 'Craft must mount the costado plank');
            assert.equal(craft.position.y, 1.6, 'Craft y snaps to plank deck level');

            // While attacking on solid plank without W or S held, mooring brake activates
            driveWatercraft(craft, { onSolid: true, attacking: true, w: false, s: false, upgrades: [] }, 1 / 60);
            assert.ok(Number.isFinite(craft.velocity.x));
            assert.ok(Number.isFinite(craft.velocity.z));

            // Simulating settling on dock: high mooring drag halts drift within half a second
            for (let f = 0; f < 30; f++) {
                driveWatercraft(craft, { onSolid: true, attacking: false, w: false, s: false, upgrades: [] }, 1 / 60);
            }

            assert.equal(craft.velocity.x, 0, 'Mooring brake snaps tiny residual x velocity to 0');
            assert.equal(craft.velocity.z, 0, 'Mooring brake snaps tiny residual z velocity to 0');
        });

        it('purchasing armor while docked on solid plank increases maxHealth and current health seamlessly', () => {
            const state = createGameState({ seed: 500 });
            addPlayer(state, 'p1', { isBot: false });
            const p = state.players.p1;
            p.coins = 100;
            p.health = 80;
            p.maxHealth = 100;
            p.position = { x: 14.0, y: 1.5, z: -200 }; // On City Shop dock

            const buyEvents = buyUpgrade(state, 'p1', 'armor');
            assert.ok(buyEvents.some((e) => e.event === 'playerHealthUpdate'));
            assert.equal(p.maxHealth, 100 + UPGRADES.armor.maxHealthBonus);
            assert.equal(p.health, 80 + UPGRADES.armor.maxHealthBonus);
            assert.equal(p.coins, 100 - UPGRADES.armor.cost);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Angle 3: Adversarial Shop & Economy Spam
    // Double-buys, negative/NaN coins, unknown upgrade strings, rapid open/close spam
    // ─────────────────────────────────────────────────────────────────────────
    describe('Angle 3 (Adversarial Shop & Economy Spam): Coin Underflow & Upgrade Idempotency', () => {
        it('strictly rejects duplicate upgrade purchases without double-charging or corrupting inventory', () => {
            const state = createGameState({ seed: 321 });
            addPlayer(state, 'p1', { isBot: false });
            const p = state.players.p1;
            p.coins = 100;

            // Purchase 1: Motor
            const ev1 = buyUpgrade(state, 'p1', 'motor');
            assert.ok(ev1.length > 0);
            assert.equal(p.coins, 90);
            assert.deepEqual(p.upgrades, ['motor']);

            // Purchase 2: Immediate duplicate buy attempt
            const ev2 = buyUpgrade(state, 'p1', 'motor');
            assert.equal(ev2.length, 0, 'Duplicate purchase must return 0 events');
            assert.equal(p.coins, 90, 'Coins must not be deducted on duplicate purchase');
            assert.deepEqual(p.upgrades, ['motor'], 'Inventory must not duplicate motor');

            // Verify canPurchase explains refusal
            const check = canPurchase(p, 'motor');
            assert.equal(check.ok, false);
            assert.equal(check.reason, 'owned');
        });

        it('strictly prevents coin balance underflow below 0 and rejects negative/NaN balances', () => {
            const state = createGameState({ seed: 888 });
            addPlayer(state, 'p1', { isBot: false });
            const p = state.players.p1;

            // Insufficient coins test
            p.coins = 5;
            const resNoCoins = buyUpgrade(state, 'p1', 'weapon'); // weapon costs 15
            assert.equal(resNoCoins.length, 0, 'Insufficient coins purchase must fail');
            assert.equal(p.coins, 5, 'Coins must remain 5');

            // Corrupt negative coins attempt
            p.coins = -100;
            const resNegCoins = buyUpgrade(state, 'p1', 'weapon');
            assert.equal(resNegCoins.length, 0);
            assert.equal(p.coins, -100);

            // Economy guard sanitization defends against NaN/float pollution
            assert.equal(sanitizeCoins(NaN), 0);
            assert.equal(sanitizeCoins(-50), 0);
            assert.equal(sanitizeCoins(15.75), 15);
            assert.equal(sanitizeCoins(Infinity), 0);

            // Verified purchase helper rejects corrupted state
            const verifiedAttempt = executeVerifiedShopPurchase({ coins: NaN, upgrades: [] }, 'motor_1');
            assert.equal(verifiedAttempt.success, false);
            assert.equal(verifiedAttempt.reason, 'invalid-player-state');

            // Upgrade tree canPurchaseArmoryUpgrade also refuses NaN/negative coins
            assert.equal(canPurchaseArmoryUpgrade({ coins: NaN, upgrades: [] }, 'motor_1').ok, false);
            assert.equal(canPurchaseArmoryUpgrade({ coins: -10, upgrades: [] }, 'motor_1').ok, false);
        });

        it('rejects unknown or prototype-polluting upgrade strings', () => {
            const state = createGameState({ seed: 999 });
            addPlayer(state, 'p1', { isBot: false });
            const p = state.players.p1;
            p.coins = 1000;

            const badTypes = ['nuke', '__proto__', 'constructor', 'toString', '', null, undefined, 42];
            for (const bad of badTypes) {
                const evs = buyUpgrade(state, 'p1', bad);
                assert.equal(evs.length, 0, `Unknown upgrade '${bad}' must produce 0 events`);
                assert.equal(p.coins, 1000, 'Coins must not be touched');
                assert.equal(p.upgrades.length, 0, 'No corrupt upgrades in inventory');
            }
        });

        it('handles rapid client event spam and bogus modal toggle events safely', () => {
            const state = createGameState({ seed: 444 });
            addPlayer(state, 'p1', { isBot: false });

            // Spam unexpected client events through handleClientEvent
            const bogusEvents = ['openShop', 'closeShop', 'toggleShopModal', 'pingBathroom', 'cheatCoins'];
            for (const bogus of bogusEvents) {
                const out = handleClientEvent(state, 'p1', bogus, { test: 123 });
                assert.deepEqual(out, [], `Bogus client event '${bogus}' must be safely ignored`);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Angle 4: 3 Dream Entities Boundary Stress
    // whiteGuy safe-height, mudAlien city pier pursuit, longWorm 26-segment straight vector
    // ─────────────────────────────────────────────────────────────────────────
    describe('Angle 4 (3 Dream Entities Boundary Stress): White Guy, Mud Alien & Long Worm', () => {
        it('guarantees White Guy (River Wizard) cannot attack or throw players standing on elevated planks', () => {
            const state = createGameState({ seed: 123 });
            addPlayer(state, 'p1', { isBot: false });
            const p = state.players.p1;
            spawnEnemy(state, 'whiteGuy', -20);
            const wizard = state.enemies.whiteGuy;
            wizard.position = { x: 0, y: 0.5, z: -20 };

            // Player elevated on plank above safeHeight
            p.position = { x: 0, y: 1.8, z: -20 };
            const initialHealth = p.health;

            // Combat resolver check
            const events = resolveEnemyHit(state, 'p1', 'whiteGuy', false);
            assert.equal(events.length, 0, 'Player above safeHeight must take 0 damage from whiteGuy');
            assert.equal(p.health, initialHealth);
            assert.equal(p.damageTaken, 0);

            // Wizard AI steps into waiting state when target is elevated
            const aiMode = stepWhiteGuy(wizard, p, 1 / 60);
            assert.equal(aiMode, 'waiting', 'White guy AI must wait instead of chasing elevated targets');
        });

        it('verifies Mud Alien pursues toward City Pier and triggers police NPC counter-attack upon collateral hit', () => {
            const state = createGameState({ seed: 234 });
            addPlayer(state, 'p1', { isBot: false });
            const p = state.players.p1;

            // Position player at water near City Pier entrance
            p.position = { x: 12.0, y: WATER_SURFACE_Y, z: -190 };
            spawnEnemy(state, 'mudAlien', -180);
            const mudAlien = state.enemies.mudAlien;
            mudAlien.position = { x: 15.0, y: 0.5, z: -180 };

            // Mud alien should chase rear player in water
            const aiMode = stepMudAlien(mudAlien, p, 1 / 60);
            assert.equal(aiMode, 'chasing', 'Mud alien must chase waterborne target');

            // Place mud alien right next to pedestrian NPC in city district
            const targetNpc = state.npcs.find((n) => n.type === 'pedestrian');
            assert.ok(targetNpc, 'City district must contain pedestrian NPCs');
            mudAlien.position = { x: targetNpc.position.x, y: 0.5, z: targetNpc.position.z };

            // Tick game state: mudAlien AOE damages pedestrian, alerting city police
            const tickEvents = tick(state, 50);
            const npcUpdates = tickEvents.filter((e) => e.event === 'npcsUpdate');
            assert.ok(npcUpdates.length > 0, 'AOE damage to pedestrian emits npcsUpdate');

            // Verify police NPCs now aggro the mud alien
            const activePolice = state.npcs.filter((n) => n.type === 'police' && !n.isDead);
            assert.ok(activePolice.length > 0, 'Police officers must be active');
            for (const cop of activePolice) {
                assert.equal(cop.aggroTarget, 'mudAlien', 'Police must aggro the destructive Mud Alien');
            }

            // Further ticks: police deal damage to the mud alien
            const initialMudHp = mudAlien.health;
            tick(state, 50);
            assert.ok(mudAlien.health < initialMudHp, 'Police fire must reduce Mud Alien health');
        });

        it('verifies Long Worm locks a straight vector on rear raft and charges without sinusoidal deviation at extreme coords', () => {
            const state = createGameState({ seed: 345 });
            addPlayer(state, 'p1', { isBot: false });
            const p = state.players.p1;

            // Extreme downriver coordinates
            p.position = { x: 5.0, y: WATER_SURFACE_Y, z: -1250 };
            spawnEnemy(state, 'longWorm', -1200);
            const worm = state.enemies.longWorm;
            worm.position = { x: -8.0, y: 0.5, z: -1200 };

            // Initial step locks targetPos
            const state1 = stepLongWorm(worm, p, 1 / 60, state.now);
            assert.equal(state1, 'charging', 'Long worm transitions from idle to charging');
            assert.ok(worm.targetPos, 'Worm must acquire targetPos vector');
            assert.equal(worm.targetPos.x, p.position.x);
            assert.equal(worm.targetPos.z, p.position.z);

            // Compute locked straight-line angle
            const dx = worm.targetPos.x - worm.position.x;
            const dz = worm.targetPos.z - worm.position.z;
            const expectedAngle = Math.atan2(dx, dz);

            // Step charging worm multiple times along the vector
            for (let i = 0; i < 5; i++) {
                stepLongWorm(worm, p, 1 / 60, state.now);
                const curDx = worm.targetPos.x - worm.position.x;
                const curDz = worm.targetPos.z - worm.position.z;
                const curAngle = Math.atan2(curDx, curDz);
                assert.ok(
                    Math.abs(expectedAngle - curAngle) < 1e-10,
                    'Charging vector must stay completely straight (zero sinusoidal wiggle)'
                );
            }

            // Test 26-segment combat reaction config integrity
            const wormCombat = createEnemyCombatState(DREAM_ENTITIES.LONG_WORM);
            assert.equal(wormCombat.type, 'longWorm');
            stepEnemyCombatState(wormCombat, 1 / 60);
            assert.equal(ENEMY_COMBAT_CONFIG.LONG_WORM.SHUDDER_FREQUENCY, 24.0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Angle 5: Multiplayer Co-Op & Wingman Bot Desync
    // Disconnecting the lead player mid-wave while bots and enemies are active
    // ─────────────────────────────────────────────────────────────────────────
    describe('Angle 5 (Multiplayer Co-Op & Wingman Bot Desync): Lead Disconnect Mid-Wave & Target Re-Acquisition', () => {
        it('handles sudden lead human disconnect mid-wave without crashing, infinite loops, or NaN bot state', () => {
            const state = createGameState({ seed: 567 });

            // 1 Human Lead + 2 Wingman Bots
            addPlayer(state, 'human_lead', { isBot: false });
            addPlayer(state, 'bot_rusty', { isBot: true });
            addPlayer(state, 'bot_bolt', { isBot: true });
            state.gameStarted = true;

            // Spawn wave enemies ahead of the convoy
            spawnEnemy(state, 'whiteGuy', -40);
            spawnEnemy(state, 'mudAlien', -80);
            spawnEnemy(state, 'longWorm', -140);

            // Convoy travels downriver for 20 ticks
            for (let t = 0; t < 20; t++) {
                tick(state, 50);
            }

            const humanBefore = state.players.human_lead;
            const rustyBefore = state.players.bot_rusty;
            const boltBefore = state.players.bot_bolt;
            const rustyZBefore = rustyBefore.position.z;
            const boltZBefore = boltBefore.position.z;

            assert.ok(humanBefore && rustyBefore && boltBefore);
            assert.equal(leadPlayer(alivePlayers(state).filter((p) => !p.isBot))?.id, 'human_lead');

            // Impatient Human / Network Drop: Disconnect lead human suddenly mid-wave!
            const disconnectEvents = removePlayer(state, 'human_lead');
            assert.ok(disconnectEvents.some((e) => e.event === 'playerDisconnected' && e.data === 'human_lead'));
            assert.equal(state.players.human_lead, undefined, 'Lead player removed from state');

            // After human disconnect, lead human is null: bots must gracefully advance or engage autonomously
            const decisionRusty = botDecide(state, state.players.bot_rusty);
            assert.ok(['engage', 'advance', 'evade'].includes(decisionRusty.mode), `Bot mode was: ${decisionRusty.mode}`);

            // Run 50 more authoritative ticks without the human
            for (let t = 0; t < 50; t++) {
                const tickEvents = tick(state, 50);
                assert.ok(Array.isArray(tickEvents));

                // Invariant checks on both wingman bots
                const r = state.players.bot_rusty;
                const b = state.players.bot_bolt;

                assert.ok(Number.isFinite(r.position.x));
                assert.ok(Number.isFinite(r.position.y));
                assert.ok(Number.isFinite(r.position.z));
                assert.ok(Number.isFinite(r.quaternion.w));

                assert.ok(Number.isFinite(b.position.x));
                assert.ok(Number.isFinite(b.position.y));
                assert.ok(Number.isFinite(b.position.z));
                assert.ok(Number.isFinite(b.quaternion.w));
            }

            // Both bots survived the transition and re-acquired targets/advanced
            assert.ok(
                state.players.bot_rusty.position.z < rustyZBefore ||
                state.players.bot_bolt.position.z < boltZBefore,
                'Convoy bots continued forward progress or engaged wave threats'
            );
        });

        it('re-evaluates tactical orders when squad leader changes or issues commands', () => {
            const squad = createBotOrderState();
            assert.equal(squad.activeOrder, null);

            // Issue order to focus fire boss
            const res = issueBotOrder(squad, BOT_COMMAND_IDS.FOCUS_FIRE, { now: 1000 });
            assert.equal(res.success, true);
            assert.equal(squad.activeOrder.id, BOT_COMMAND_IDS.FOCUS_FIRE);

            // Bot tactical decision re-routes toward threat
            const state = createGameState({ seed: 77 });
            addPlayer(state, 'human_1', { isBot: false });
            addPlayer(state, 'bot_1', { isBot: true });
            spawnEnemy(state, 'longWorm', -80);
            const tactical = decideTacticalBotOrder(state, state.players.bot_1, squad.activeOrder);

            assert.equal(tactical.mode, 'order-focus-fire');
            assert.equal(tactical.enemyId, 'longWorm');
        });

        it('recovers cleanly when a new human player joins after previous lead disconnected', () => {
            const state = createGameState({ seed: 900 });
            addPlayer(state, 'bot_rusty', { isBot: true });
            state.gameStarted = true;

            // Step with solo bot
            tick(state, 50);

            // New human player joins as replacement leader
            const joinEvents = addPlayer(state, 'human_new', { isBot: false });
            assert.ok(joinEvents.some((e) => e.event === 'newPlayer'));

            // Step again: bot detects new human leader and transitions to follow
            const rusty = state.players.bot_rusty;
            const newHuman = state.players.human_new;
            newHuman.position = { x: 0, y: WATER_SURFACE_Y, z: -100 };
            rusty.position = { x: 0, y: WATER_SURFACE_Y, z: -80 };

            const decision = botDecide(state, rusty);
            assert.equal(decision.mode, 'follow', 'Bot should fall into formation behind the new leader');
            assert.ok(decision.target.z < rusty.position.z);
        });
    });
});
