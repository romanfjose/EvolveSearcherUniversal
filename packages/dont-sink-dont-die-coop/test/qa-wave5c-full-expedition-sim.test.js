import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    EXPEDITION_ACTS,
    SANCTUARY_PLATFORM_CONFIG,
    createRng,
    assertFiniteIntegerCoins,
    isPositionOnSanctuary,
    createExpeditionState,
    simulateAct1CoinCollection,
    simulateAct2HarborShop,
    simulateAct3SanctuaryDocking,
    simulateAct4BossKrakenEncounter,
    simulateFullCoopExpedition,
} from '../shared/qa-wave5c-full-expedition-sim.js';

import {
    PLAYER,
    SHOP_ZONE,
    isInShopZone,
    resolveWorldBoundsAndObstacles,
    resolveEnemyHit,
} from '../shared/game-core.js';

import {
    KRAKEN_SPAWN_Z,
    damageKraken,
} from '../shared/boss-kraken.js';

describe('Helmet 03 — QA Wave 5C Breaker: Full 4-Act Co-Op Expedition Simulation', () => {

    describe('1. Expedition State Initialization & Invariants', () => {
        it('initializes pristine expedition state with human captain and companion bot', () => {
            const exp = createExpeditionState({ seed: 777, playerCount: 2 });
            assert.equal(exp.seed, 777);
            assert.equal(exp.playerIds.length, 2);
            assert.ok(exp.gameState.players['p1']);
            assert.ok(exp.gameState.players['bot_1']);

            const p1 = exp.gameState.players['p1'];
            assert.equal(p1.isBot, false);
            assert.equal(p1.coins, PLAYER.startCoins);
            assert.equal(p1.health, PLAYER.startHealth);

            const bot1 = exp.gameState.players['bot_1'];
            assert.equal(bot1.isBot, true);
            assert.equal(bot1.coins, PLAYER.startCoins);
        });

        it('assertFiniteIntegerCoins helper rejects non-numbers, negative numbers, floats, NaN, and Infinity', () => {
            assert.equal(assertFiniteIntegerCoins(50).valid, true);
            assert.equal(assertFiniteIntegerCoins(0).valid, true);
            assert.equal(assertFiniteIntegerCoins(1000).valid, true);

            assert.equal(assertFiniteIntegerCoins(-5).valid, false);
            assert.equal(assertFiniteIntegerCoins(12.5).valid, false);
            assert.equal(assertFiniteIntegerCoins(NaN).valid, false);
            assert.equal(assertFiniteIntegerCoins(Infinity).valid, false);
            assert.equal(assertFiniteIntegerCoins(-Infinity).valid, false);
            assert.equal(assertFiniteIntegerCoins('50').valid, false);
            assert.equal(assertFiniteIntegerCoins(null).valid, false);
            assert.equal(assertFiniteIntegerCoins(undefined).valid, false);
            assert.equal(assertFiniteIntegerCoins({}).valid, false);
        });
    });

    describe('2. Act 1: Spawn & Airborne/Surface Coin Ring Collection', () => {
        it('collects coin rings in Act 1 and verifies finite integer coin balance without NaN or corruption', () => {
            const exp = createExpeditionState({ seed: 101 });
            const p1 = exp.gameState.players['p1'];
            const startCoins = p1.coins;

            const act1 = simulateAct1CoinCollection(exp);
            assert.equal(act1.completed, true);
            assert.equal(act1.coinInvariantsValid, true);
            assert.ok(act1.coinRingsHit >= 4, `Expected at least 4 rings hit, got ${act1.coinRingsHit}`);
            assert.ok(act1.coinsCollected > 0, 'Should have earned bonus coins');
            assert.equal(p1.coins, startCoins + act1.coinsCollected);

            const coinCheck = assertFiniteIntegerCoins(p1.coins);
            assert.equal(coinCheck.valid, true);
        });

        it('saboteur fuzzing: detects and logs violations when coin award is corrupted to float or NaN', () => {
            const exp = createExpeditionState({ seed: 202 });
            // Sabotage hazard coin rings with invalid float and NaN
            exp.hazards.coinRings = [
                { id: 'corrupt_float', x: 0, y: 0.5, z: -40, value: 12.75, radius: 3.0 },
                { id: 'corrupt_nan', x: 0, y: 0.5, z: -80, value: NaN, radius: 3.0 },
            ];

            const act1 = simulateAct1CoinCollection(exp);
            assert.equal(act1.coinInvariantsValid, false);
            assert.ok(exp.telemetry.violations.length >= 2);
            assert.ok(exp.telemetry.violations.some((v) => v.includes('Non-integer/corrupt coin pickup')));
        });
    });

    describe('3. Act 2: Harbor City Calm Lagoon & Armory Shop Purchase', () => {
        it('enters Harbor City calm basin, halts drift, and executes verified armory purchase', () => {
            const exp = createExpeditionState({ seed: 303 });
            simulateAct1CoinCollection(exp);

            const p1 = exp.gameState.players['p1'];
            const preCoins = p1.coins;

            const act2 = simulateAct2HarborShop(exp, 'motor_1');
            assert.equal(act2.completed, true);
            assert.equal(act2.harborReached, true);
            assert.equal(act2.stoppedInBasin, true);
            assert.equal(act2.purchaseSuccess, true);
            assert.equal(p1.coins, preCoins - 10);
            assert.ok(p1.upgrades.includes('motor_1'));

            const coinCheck = assertFiniteIntegerCoins(p1.coins);
            assert.equal(coinCheck.valid, true);
        });

        it('prevents purchase and flags violation when player has insufficient coins', () => {
            const exp = createExpeditionState({ seed: 404 });
            const p1 = exp.gameState.players['p1'];
            p1.coins = 5; // weapon_1 costs 15 coins

            const act2 = simulateAct2HarborShop(exp, 'weapon_1');
            assert.equal(act2.purchaseSuccess, false);
            assert.equal(act2.completed, false);
            assert.ok(exp.telemetry.violations.some((v) => v.includes('Harbor Armory purchase failed: insufficient-coins')));
            assert.equal(p1.coins, 5, 'Coins must not be deducted on failed purchase');
        });

        it('validates raft position boundaries in Harbor City Shop Zone', () => {
            assert.equal(isInShopZone({ x: 15, z: -200 }), true);
            assert.equal(isInShopZone({ x: 5, z: -200 }), false, 'x < minX should be outside shop dock');
            assert.equal(isInShopZone({ x: 15, z: -100 }), false, 'z > maxZ should be outside shop dock');
            assert.equal(isInShopZone({ x: 15, z: -300 }), false, 'z < minZ should be outside shop dock');
        });
    });

    describe('4. Act 3: Sanctuary Platform Docking & 100% Enemy Attack Immunity', () => {
        it('docks onto elevated Sanctuary Platform with onSolid and confirms 100% enemy attack immunity', () => {
            const exp = createExpeditionState({ seed: 505 });
            const p1 = exp.gameState.players['p1'];
            const startHealth = p1.health;

            const act3 = simulateAct3SanctuaryDocking(exp);
            assert.equal(act3.completed, true);
            assert.equal(act3.platformDocked, true);
            assert.equal(act3.onSolid, true);
            assert.equal(act3.immunityVerified, true);
            assert.equal(p1.health, startHealth, 'Hull health must remain 100% undamaged');
        });

        it('confirms raft floating at water level does NOT have immunity and takes normal damage', () => {
            const exp = createExpeditionState({ seed: 606 });
            const p1 = exp.gameState.players['p1'];
            p1.position.y = 0.25; // Water surface
            p1.position.z = -850;

            exp.gameState.enemies.whiteGuy = {
                id: 'whiteGuy',
                type: 'whiteGuy',
                health: 50,
                damage: 15,
                position: { x: 0, y: 0.5, z: -852 },
            };

            const attackEvents = resolveEnemyHit(exp.gameState, 'p1', 'whiteGuy', false);
            assert.ok(attackEvents.length > 0);
            assert.equal(p1.health, 100 - 15);
        });

        it('isPositionOnSanctuary correctly identifies coordinates on deck vs outside perimeter', () => {
            const plat = SANCTUARY_PLATFORM_CONFIG;
            // On platform deck
            assert.equal(isPositionOnSanctuary({ x: plat.x, y: plat.topY, z: plat.z }, plat), true);
            // Too low (at water level y = 0.25)
            assert.equal(isPositionOnSanctuary({ x: plat.x, y: 0.25, z: plat.z }, plat), false);
            // Too far laterally along X
            assert.equal(isPositionOnSanctuary({ x: plat.x + 20, y: plat.topY, z: plat.z }, plat), false);
            // Too far downriver along Z
            assert.equal(isPositionOnSanctuary({ x: plat.x, y: plat.topY, z: plat.z - 30 }, plat), false);
        });
    });

    describe('5. Act 4: Boss Kraken Arena Encounter & Zero NaN Verification', () => {
        it('simulates full Dread Kraken combat across all 3 phases down to defeat with zero NaNs', () => {
            const exp = createExpeditionState({ seed: 707 });
            const act4 = simulateAct4BossKrakenEncounter(exp);

            assert.equal(act4.completed, true);
            assert.equal(act4.krakenSpawned, true);
            assert.deepEqual(act4.phasesPassed, [1, 2, 3]);
            assert.equal(act4.defeatAchieved, true);
            assert.equal(act4.zeroNaNVerified, true);
            assert.equal(exp.krakenState.health, 0);
            assert.equal(exp.krakenState.isDefeated, true);
            assert.ok(exp.krakenState.coinDrops.length > 0);
        });

        it('stress-tests simultaneous tentacle slams without producing NaN or out-of-range transforms', () => {
            const exp = createExpeditionState({ seed: 808 });
            simulateAct4BossKrakenEncounter(exp);

            // Re-verify that after all phases and ticks, tentacle transforms remain strictly finite
            for (const tentacle of exp.krakenState.tentacles) {
                assert.ok(Number.isFinite(tentacle.basePos.x));
                assert.ok(Number.isFinite(tentacle.basePos.y));
                assert.ok(Number.isFinite(tentacle.basePos.z));
                assert.ok(Number.isFinite(tentacle.tipPos.x));
                assert.ok(Number.isFinite(tentacle.tipPos.y));
                assert.ok(Number.isFinite(tentacle.tipPos.z));
                for (let j = 0; j < tentacle.jointAngles.length; j++) {
                    const angle = tentacle.jointAngles[j];
                    assert.ok(Number.isFinite(angle), `Tentacle joint angle ${j} is not finite: ${angle}`);
                    assert.equal(Number.isNaN(angle), false);
                }
            }
        });
    });

    describe('6. Master Full Expedition Simulation & Determinism', () => {
        it('runs complete 4-Act Co-Op Expedition from start to finish with 100% green status', () => {
            const outcome = simulateFullCoopExpedition({ seed: 1337, playerCount: 3 });

            assert.equal(outcome.passed, true);
            assert.equal(outcome.playerCount, 3);
            assert.equal(outcome.telemetry.violations.length, 0);

            // Verify all 4 acts completed
            assert.equal(outcome.telemetry.act1.completed, true);
            assert.equal(outcome.telemetry.act2.completed, true);
            assert.equal(outcome.telemetry.act3.completed, true);
            assert.equal(outcome.telemetry.act4.completed, true);

            // Final player checks
            const p1 = outcome.finalPlayerState;
            assert.equal(p1.isDead, false);
            assert.ok(p1.upgrades.includes('motor_1'));
            assert.equal(assertFiniteIntegerCoins(p1.coins).valid, true);

            // Final kraken checks
            assert.equal(outcome.krakenState.isDefeated, true);
            assert.equal(outcome.krakenState.health, 0);
        });

        it('is 100% deterministic across identical runs with same seed', () => {
            const out1 = simulateFullCoopExpedition({ seed: 9999, playerCount: 2 });
            const out2 = simulateFullCoopExpedition({ seed: 9999, playerCount: 2 });

            assert.equal(out1.passed, out2.passed);
            assert.equal(out1.telemetry.act1.coinsCollected, out2.telemetry.act1.coinsCollected);
            assert.equal(out1.telemetry.act1.coinRingsHit, out2.telemetry.act1.coinRingsHit);
            assert.deepEqual(out1.telemetry.act2.purchases, out2.telemetry.act2.purchases);
            assert.equal(out1.finalPlayerState.coins, out2.finalPlayerState.coins);
            assert.equal(out1.krakenState.coinDrops.length, out2.krakenState.coinDrops.length);
        });
    });
});
