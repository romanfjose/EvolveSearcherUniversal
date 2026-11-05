import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    KRAKEN_SPAWN_Z,
    KRAKEN_CONFIG,
    createKrakenState,
    shouldKrakenSpawn,
    spawnKraken,
    damageKraken,
    tickKraken,
} from '../shared/boss-kraken.js';

import {
    createMockRaft,
    verifyRaftTeleportAndSpawn,
    assertZeroNaNTentacles,
    stressSimultaneousTentacleSlams,
    safeDamageKraken,
    simulateFullKrakenEncounter,
    runBossArenaSaboteurSuite,
} from '../shared/qa-boss-verifier.js';

describe('QA Breaker 03: Dread Kraken Boss Arena Saboteur & Phase Verifier', () => {

    describe('1. Arena Teleportation & Spawn Invariants', () => {
        it('should correctly spawn at z = -1350 and never spawn at z = 0', () => {
            const audit = verifyRaftTeleportAndSpawn({ spawnZ: -1350, originZ: 0 });
            assert.equal(audit.passed, true);
            assert.equal(audit.canSpawnAtStart, false);
            assert.equal(audit.spawnStateAtStart, false);
            assert.equal(audit.canSpawnAtArena, true);
            assert.equal(audit.isSpawnedAtArena, true);
            assert.equal(audit.krakenPhase, 1);
            assert.equal(audit.krakenHealth, 1500);
        });

        it('should verify test raft teleportation directly sets raft z to -1350', () => {
            const raft = createMockRaft('player_test', 0);
            assert.equal(raft.position.z, 0);
            assert.equal(shouldKrakenSpawn(raft.position.z), false);

            const state = createKrakenState();
            assert.equal(state.isSpawned, false);

            // Teleport to z = -1350
            raft.position.z = -1350;
            assert.equal(shouldKrakenSpawn(raft.position.z), true);

            const evs = spawnKraken(state);
            assert.equal(state.isSpawned, true);
            assert.equal(evs.length, 1);
            assert.equal(evs[0].event, 'kraken:spawned');
        });
    });

    describe('2. Combat Simulation Across All 3 Kraken Phases', () => {
        it('should track Phase 1 (1500 HP) -> Phase 2 (1000 HP) -> Phase 3 (500 HP) -> Defeat (0 HP)', () => {
            const state = createKrakenState({ seed: 101 });
            spawnKraken(state);
            assert.equal(state.phase, 1);
            assert.equal(state.health, 1500);

            // Phase 1 -> Phase 2 at <= 1000 HP
            const p2Res = damageKraken(state, 501);
            assert.equal(p2Res.phaseChanged, true);
            assert.equal(state.phase, 2);
            assert.ok(state.health <= 1000);
            assert.equal(state.whirlpoolActive, true);
            assert.ok(state.barnacles.every((b) => b.active));

            // Stun and damage through Phase 2 to Phase 3 at <= 500 HP
            const barnacleRes = damageKraken(state, 80, 'barnacle_0');
            assert.equal(barnacleRes.stunTriggered, true);
            assert.equal(state.isStunned, true);

            const p3Res = damageKraken(state, 600);
            assert.equal(p3Res.phaseChanged, true);
            assert.equal(state.phase, 3);
            assert.ok(state.health <= 500);
            assert.equal(state.isFrenzyActive, true);
            assert.equal(state.whirlpoolActive, false);

            // Phase 3 -> Defeat at 0 HP
            const defeatRes = damageKraken(state, 1000);
            assert.equal(state.health, 0);
            assert.equal(state.isDefeated, true);
            const defeatEv = defeatRes.events.find((e) => e.event === 'kraken:defeated');
            assert.ok(defeatEv, 'Defeat event emitted');
            assert.equal(defeatEv.data.coinCount, KRAKEN_CONFIG.phase3.coinFountainCount);
        });

        it('should handle out-of-order burst damage and overkill cleanly', () => {
            const state = createKrakenState({ seed: 202 });
            spawnKraken(state);

            // Massive burst from 1500 directly down to 0 in one frame
            const overkillRes = damageKraken(state, 50000);
            assert.equal(state.health, 0);
            assert.equal(state.isDefeated, true);
            assert.equal(overkillRes.damageDealt, 1500);

            // Verify clean defeat emission
            const defeatEv = overkillRes.events.find((e) => e.event === 'kraken:defeated');
            assert.ok(defeatEv);
            assert.equal(state.coinDrops.length, 150);

            // Subsequent damage should be ignored
            const postRes = damageKraken(state, 100);
            assert.equal(postRes.damageDealt, 0);
            assert.equal(postRes.events.length, 0);
        });
    });

    describe('3. Impatient Saboteur Fuzzing & Negative Damage', () => {
        it('should reject negative damage, NaN, and Infinity without healing or NaN corruption', () => {
            const state = createKrakenState();
            spawnKraken(state);
            const initialHp = state.health;

            // Safe damage wrapper sanitizes negative damage
            const negRes = safeDamageKraken(state, -500);
            assert.equal(negRes.damageDealt, 0);
            assert.equal(state.health, initialHp);

            // Safe damage wrapper sanitizes NaN & Infinity
            const nanRes = safeDamageKraken(state, NaN);
            assert.equal(nanRes.damageDealt, 0);
            assert.equal(state.health, initialHp);

            const infRes = safeDamageKraken(state, Infinity);
            assert.equal(infRes.damageDealt, 0);
            assert.equal(state.health, initialHp);

            // String or undefined damage
            const strRes = safeDamageKraken(state, 'invalid');
            assert.equal(strRes.damageDealt, 0);
            assert.equal(state.health, initialHp);
        });
    });

    describe('4. Simultaneous Tentacle Slams & Zero NaN Transform Invariant', () => {
        it('should survive simultaneous slams on all tentacles with zero NaN joint positions', () => {
            const state = createKrakenState({ seed: 303 });
            spawnKraken(state);

            const stress = stressSimultaneousTentacleSlams(state, 0.05, 15);
            assert.equal(stress.passed, true);
            assert.equal(stress.allJointsClean, true);
            assert.ok(stress.collectedEvents.length > 0);

            // Check invariant explicitly
            const nanCheck = assertZeroNaNTentacles(state);
            assert.equal(nanCheck.valid, true);
            assert.equal(nanCheck.invalidNodes.length, 0);
        });

        it('should detect corrupted NaN values if joints are compromised', () => {
            const state = createKrakenState();
            state.tentacles[1].jointAngles[2] = NaN;
            const nanCheck = assertZeroNaNTentacles(state);
            assert.equal(nanCheck.valid, false);
            assert.ok(nanCheck.invalidNodes.includes('tentacle_1.jointAngles[2]'));
        });
    });

    describe('5. Victory Reward & Ballistics Verification', () => {
        it('should emit valid coin fountain ballistics upon defeat without NaN coordinates', () => {
            const state = createKrakenState({ seed: 404 });
            spawnKraken(state);
            damageKraken(state, 1500); // Defeat

            assert.equal(state.isDefeated, true);
            assert.equal(state.coinDrops.length, 150);

            // Step ballistic physics over 20 ticks
            for (let t = 0; t < 20; t++) {
                tickKraken(state, 0.05, []);
            }

            for (const coin of state.coinDrops) {
                assert.ok(Number.isFinite(coin.position.x));
                assert.ok(Number.isFinite(coin.position.y));
                assert.ok(Number.isFinite(coin.position.z));
                assert.ok(Number.isFinite(coin.velocity.x));
                assert.ok(Number.isFinite(coin.velocity.y));
                assert.ok(Number.isFinite(coin.velocity.z));
                assert.ok(coin.position.y >= 0, 'Coins do not sink below water surface');
                assert.ok(coin.value > 0);
            }
        });
    });

    describe('6. Master QA Saboteur Receipt Suite', () => {
        it('should execute full encounter simulation with 100% green status', () => {
            const encounter = simulateFullKrakenEncounter({ seed: 7777 });
            assert.equal(encounter.passed, true);
            assert.equal(encounter.fuzzPassed, true);
            assert.equal(encounter.phase2Reached, true);
            assert.equal(encounter.suctionActive, true);
            assert.equal(encounter.slamStressPassed, true);
            assert.equal(encounter.phase3Reached, true);
            assert.equal(encounter.defeatReached, true);
            assert.equal(encounter.coinsValid, true);
            assert.equal(encounter.postDefeatJointsValid, true);
        });

        it('should generate structured receipt from runBossArenaSaboteurSuite()', () => {
            const receipt = runBossArenaSaboteurSuite();
            assert.equal(receipt.passed, true);
            assert.equal(receipt.suite, 'qa-boss-verifier:dread-kraken');
            assert.ok(receipt.timestamp);
            assert.equal(receipt.teleportAudit.passed, true);
            assert.equal(receipt.combatAudit.passed, true);
            assert.equal(receipt.combatAudit.phase2Reached, true);
            assert.equal(receipt.combatAudit.phase3Reached, true);
            assert.equal(receipt.combatAudit.defeatReached, true);
            assert.equal(receipt.combatAudit.coinsValid, true);
            assert.equal(receipt.combatAudit.postDefeatJointsValid, true);
        });
    });
});
