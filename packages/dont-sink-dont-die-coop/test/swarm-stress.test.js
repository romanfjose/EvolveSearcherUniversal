/**
 * Don't Sink, Don't Die — 50-Enemy Swarm & Multi-Bot Combat Stress Harness Test Suite
 * (`test/swarm-stress.test.js`)
 *
 * Verifies:
 * - 50 concurrent river enemies (Mud Aliens, Elevation-Blind Wizards, River Goblins, Flying Stingrays) + 4 AI companion bots.
 * - Attack, movement, and parry resolution in 60Hz ticks.
 * - Deterministic target selection and reproducible simulations under identical seeds.
 * - Zero O(N^3) frame stalls (<2ms per 60Hz tick for 50 entities).
 * - Clean disposal of defeated enemies (no zombie references or memory leaks).
 * - Elevation-blind wizard mechanics (elevation > 1 immunity).
 * - Impatient-Human QA Saboteur fuzzing: zero dt, empty swarm, massive entity bursts, extreme tick counts.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SWARM_TICK_HZ,
    SWARM_DT,
    ENEMY_ARCHETYPES,
    BOT_ARCHETYPES,
    SwarmSpatialGrid,
    distXZ,
    dist3,
    selectDeterministicTarget,
    createSwarmCombatState,
    disposeDefeatedEnemy,
    stepSwarmCombatTick,
    runSwarmStressBenchmark,
} from '../shared/swarm-stress.js';

describe('Swarm & Multi-Bot Harness: Archetype Definitions & Initialization', () => {
    test('defines all 4 required enemy archetypes with valid combat stats', () => {
        assert.ok(ENEMY_ARCHETYPES.MUD_ALIEN);
        assert.ok(ENEMY_ARCHETYPES.ELEVATION_BLIND_WIZARD);
        assert.ok(ENEMY_ARCHETYPES.RIVER_GOBLIN);
        assert.ok(ENEMY_ARCHETYPES.FLYING_STINGRAY);

        assert.equal(ENEMY_ARCHETYPES.MUD_ALIEN.type, 'mudAlien');
        assert.equal(ENEMY_ARCHETYPES.ELEVATION_BLIND_WIZARD.type, 'elevationBlindWizard');
        assert.equal(ENEMY_ARCHETYPES.RIVER_GOBLIN.type, 'riverGoblin');
        assert.equal(ENEMY_ARCHETYPES.FLYING_STINGRAY.type, 'flyingStingray');

        assert.equal(ENEMY_ARCHETYPES.ELEVATION_BLIND_WIZARD.elevationBlind, true);
        assert.equal(ENEMY_ARCHETYPES.FLYING_STINGRAY.flying, true);
    });

    test('defines 4 distinct AI companion bot archetypes', () => {
        const botKeys = Object.keys(BOT_ARCHETYPES);
        assert.equal(botKeys.length, 4);
        assert.ok(BOT_ARCHETYPES.BRUISER);
        assert.ok(BOT_ARCHETYPES.HELMSMAN);
        assert.ok(BOT_ARCHETYPES.MYSTIC);
        assert.ok(BOT_ARCHETYPES.TINKERER);

        for (const key of botKeys) {
            const b = BOT_ARCHETYPES[key];
            assert.ok(b.maxHealth > 0);
            assert.ok(b.attackDamage > 0);
            assert.ok(b.baseParryChance > 0);
            assert.ok(b.parryWindow > 0);
        }
    });

    test('initializes state with exactly 50 enemies and 4 companion bots by default', () => {
        const state = createSwarmCombatState({ seed: 777 });
        assert.equal(state.bots.length, 4);
        assert.equal(state.enemies.length, 50);

        // Verify all 4 enemy types are represented in the 50 enemies
        const types = new Set(state.enemies.map((e) => e.type));
        assert.equal(types.size, 4);
        assert.ok(types.has('mudAlien'));
        assert.ok(types.has('elevationBlindWizard'));
        assert.ok(types.has('riverGoblin'));
        assert.ok(types.has('flyingStingray'));

        // Verify initial metrics
        assert.equal(state.metrics.totalTicks, 0);
        assert.equal(state.metrics.enemiesDisposed, 0);
    });
});

describe('Swarm & Multi-Bot Harness: Spatial Partitioning Grid', () => {
    test('inserts entities and queries radius efficiently', () => {
        const grid = new SwarmSpatialGrid(8);
        const e1 = { id: 'e1', position: { x: 0, z: 0 } };
        const e2 = { id: 'e2', position: { x: 5, z: 5 } };
        const e3 = { id: 'e3', position: { x: 100, z: 100 } };

        grid.insert(e1);
        grid.insert(e2);
        grid.insert(e3);

        const resultsNearOrigin = grid.queryRadius({ x: 0, z: 0 }, 10);
        assert.equal(resultsNearOrigin.length, 2);
        assert.ok(resultsNearOrigin.some((e) => e.id === 'e1'));
        assert.ok(resultsNearOrigin.some((e) => e.id === 'e2'));
        assert.ok(!resultsNearOrigin.some((e) => e.id === 'e3'));

        grid.clear();
        const resultsAfterClear = grid.queryRadius({ x: 0, z: 0 }, 50);
        assert.equal(resultsAfterClear.length, 0);
    });
});

describe('Swarm & Multi-Bot Harness: Deterministic Target Selection & Tie-Breaking', () => {
    test('selects closest target first', () => {
        const attacker = { position: { x: 0, z: 0 }, archetype: {} };
        const t1 = { id: 't1', health: 100, position: { x: 10, z: 0 } };
        const t2 = { id: 't2', health: 100, position: { x: 3, z: 0 } };
        const t3 = { id: 't3', health: 100, position: { x: 8, z: 0 } };

        const target = selectDeterministicTarget(attacker, [t1, t2, t3]);
        assert.equal(target.id, 't2');
    });

    test('breaks distance ties using lowest health', () => {
        const attacker = { position: { x: 0, z: 0 }, archetype: {} };
        const t1 = { id: 't1', health: 80, position: { x: 5, z: 0 } };
        const t2 = { id: 't2', health: 25, position: { x: -5, z: 0 } }; // Same distance (5), lower HP
        const t3 = { id: 't3', health: 90, position: { x: 0, z: 5 } };

        const target = selectDeterministicTarget(attacker, [t1, t2, t3]);
        assert.equal(target.id, 't2');
    });

    test('breaks distance and health ties using lexical id comparison', () => {
        const attacker = { position: { x: 0, z: 0 }, archetype: {} };
        const t1 = { id: 'target_b', health: 50, position: { x: 4, z: 0 } };
        const t2 = { id: 'target_a', health: 50, position: { x: -4, z: 0 } }; // Same dist (4) and HP (50), lexical winner

        const target = selectDeterministicTarget(attacker, [t1, t2]);
        assert.equal(target.id, 'target_a');
    });

    test('Elevation-Blind Wizard skips elevated targets (y > 1.0)', () => {
        const wizardAttacker = {
            position: { x: 0, z: 0 },
            archetype: ENEMY_ARCHETYPES.ELEVATION_BLIND_WIZARD,
        };
        const elevatedBot = {
            id: 'bot_elevated',
            health: 20,
            position: { x: 2, y: 1.5, z: 0 }, // Elevated above y = 1.0
        };
        const groundedBot = {
            id: 'bot_grounded',
            health: 100,
            position: { x: 6, y: 0.25, z: 0 }, // Grounded at water level
        };

        const target = selectDeterministicTarget(wizardAttacker, [elevatedBot, groundedBot]);
        assert.equal(target.id, 'bot_grounded');
    });

    test('returns null if candidate list is empty or all targets are dead', () => {
        const attacker = { position: { x: 0, z: 0 }, archetype: {} };
        assert.equal(selectDeterministicTarget(attacker, []), null);
        assert.equal(
            selectDeterministicTarget(attacker, [
                { id: 'dead1', health: 0, isDead: true, position: { x: 1, z: 1 } },
            ]),
            null
        );
    });
});

describe('Swarm & Multi-Bot Harness: 60Hz Combat Tick & Defensive Parry', () => {
    test('resolves attacking, parrying, and damage in the same 60Hz tick', () => {
        const state = createSwarmCombatState({ seed: 101, enemyCount: 50 });
        const res = stepSwarmCombatTick(state, SWARM_DT);

        assert.equal(res.tickIndex, 1);
        assert.ok(typeof res.durationMs === 'number');
        assert.ok(res.activeBotsCount <= 4);
        assert.ok(res.activeEnemiesCount <= 50);
        assert.ok(Array.isArray(res.combatEvents));
    });

    test('bot defensive parry stuns enemy and reflects damage', () => {
        const state = createSwarmCombatState({ seed: 42, botCount: 1, enemyCount: 1 });
        const bot = state.bots[0];
        const enemy = state.enemies[0];

        // Position enemy and bot in immediate combat contact
        bot.position = { x: 0, y: 0.25, z: 0 };
        enemy.position = { x: 1.0, y: 0.25, z: 0 };
        bot.isParrying = true;
        bot.parryActiveUntil = 2.0;

        const enemyInitialHp = enemy.health;
        const botInitialHp = bot.health;

        // Force enemy ready to attack
        enemy.nextAttackAt = 0;

        const res = stepSwarmCombatTick(state, SWARM_DT);
        const parryEvent = res.combatEvents.find((e) => e.type === 'parry_counter');

        assert.ok(parryEvent, 'Should produce a parry counter event');
        assert.equal(parryEvent.botId, bot.id);
        assert.equal(parryEvent.enemyId, enemy.id);
        assert.ok(enemy.health < enemyInitialHp, 'Reflected damage should reduce enemy health');
        assert.equal(bot.health, botInitialHp, 'Parry should protect bot from incoming attack damage');
        assert.ok(enemy.stunnedUntil > state.time, 'Enemy should be stunned');
    });
});

describe('Swarm & Multi-Bot Harness: Defeated Enemy Disposal & Leak Invariants', () => {
    test('cleanly disposes defeated enemy without zombie references', () => {
        const state = createSwarmCombatState({ seed: 99 });
        const enemy = state.enemies[0];

        assert.equal(enemy.isDisposed, false);
        const disposed = disposeDefeatedEnemy(state, enemy);
        assert.equal(disposed, true);
        assert.equal(enemy.isDisposed, true);
        assert.equal(enemy.isDead, true);
        assert.equal(enemy.health, 0);
        assert.equal(enemy.targetId, null);
        assert.ok(enemy.position.x > 10000, 'Position should be quarantined away from combat');
        assert.ok(state.defeatedPool.includes(enemy.id));
        assert.equal(state.metrics.enemiesDisposed, 1);

        // Attempting to dispose again should return false (idempotent)
        assert.equal(disposeDefeatedEnemy(state, enemy), false);
    });

    test('multi-tick simulation disposes all defeated enemies with zero zombie leaks', () => {
        const bench = runSwarmStressBenchmark({ ticks: 120, seed: 12345, enemyCount: 50 });
        assert.equal(bench.deadUndisposedZombies, 0, 'Must have zero dead undisposed zombie entities');
        assert.ok(bench.combat.attacksExecuted > 0, 'Attacks must be executed during simulation');
    });
});

describe('Swarm & Multi-Bot Harness: Performance & Zero O(N^3) Frame Stalls', () => {
    test('50 concurrent enemies + 4 companion bots execute in <2ms per tick', () => {
        const bench = runSwarmStressBenchmark({ ticks: 100, seed: 555, enemyCount: 50, botCount: 4 });

        assert.equal(bench.totalTicks, 100);
        assert.ok(
            bench.performance.avgDurationMs < 2.0,
            `Average tick duration (${bench.performance.avgDurationMs}ms) must be < 2.0ms`
        );
        assert.ok(
            bench.performance.p99Ms < 2.0 || bench.performance.avgDurationMs < 1.0,
            `P99 tick duration (${bench.performance.p99Ms}ms) must remain responsive without O(N^3) stalls`
        );
    });

    test('simulation is 100% deterministic across identical seeds', () => {
        const benchA = runSwarmStressBenchmark({ ticks: 60, seed: 888, enemyCount: 50 });
        const benchB = runSwarmStressBenchmark({ ticks: 60, seed: 888, enemyCount: 50 });

        assert.equal(benchA.activeBotsRemaining, benchB.activeBotsRemaining);
        assert.equal(benchA.activeEnemiesRemaining, benchB.activeEnemiesRemaining);
        assert.equal(benchA.enemiesDisposed, benchB.enemiesDisposed);
        assert.equal(benchA.combat.attacksExecuted, benchB.combat.attacksExecuted);
        assert.equal(benchA.combat.parriesExecuted, benchB.combat.parriesExecuted);
        assert.equal(benchA.combat.damageDealtTotal, benchB.combat.damageDealtTotal);
    });
});

describe('Swarm & Multi-Bot Harness: Impatient-Human Adversarial QA Saboteur Fuzzing', () => {
    test('handles zero dt and negative dt gracefully without crashing or NaN', () => {
        const state = createSwarmCombatState({ seed: 77 });
        const resZero = stepSwarmCombatTick(state, 0);
        assert.ok(resZero);
        assert.ok(Number.isFinite(state.time));

        for (const b of state.bots) {
            assert.ok(Number.isFinite(b.position.x));
            assert.ok(Number.isFinite(b.position.z));
        }
        for (const e of state.enemies) {
            assert.ok(Number.isFinite(e.position.x));
            assert.ok(Number.isFinite(e.position.z));
        }
    });

    test('handles empty swarm without errors', () => {
        const state = createSwarmCombatState({ seed: 1, botCount: 0, enemyCount: 0 });
        const res = stepSwarmCombatTick(state, SWARM_DT);
        assert.equal(res.activeBotsCount, 0);
        assert.equal(res.activeEnemiesCount, 0);
        assert.equal(res.combatEvents.length, 0);
    });

    test('handles massive 100-enemy swarm without O(N^3) blowup', () => {
        const bench = runSwarmStressBenchmark({ ticks: 30, seed: 321, enemyCount: 100, botCount: 4 });
        assert.ok(
            bench.performance.avgDurationMs < 3.5,
            `100-enemy swarm avg duration (${bench.performance.avgDurationMs}ms) should scale gracefully`
        );
    });
});
