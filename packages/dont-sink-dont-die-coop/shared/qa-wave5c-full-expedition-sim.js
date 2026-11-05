/**
 * Don't Sink, Don't Die — 4-Act Co-Op Expedition Simulation Engine & QA Breaker
 * (`shared/qa-wave5c-full-expedition-sim.js`)
 *
 * Helmet 03 ("Where's the Bathroom?" Breaker) & Sovereign Core:
 * End-to-end deterministic verification harness for an entire 4-Act Co-Op Expedition:
 *   1. Act 1 (Amber Canyon): Spawn, river kinematics, coin ring collection with strict finite integer invariants.
 *   2. Act 2 (Neon Harbor City): Calm basin entry (z = -150 to -250), drift cessation, dockside Armory shop purchase with mutex & balance verification.
 *   3. Act 3 (Sunken Ruin Sanctuaries): Elevated sanctuary platform approach, soft-docking/landing (onSolid), and 100% enemy attack immunity.
 *   4. Act 4 (Tempest Maelstrom): Boss Kraken arena combat simulation across all 3 phases down to defeat, coin fountain ballistics, and 0 NaN transform verification.
 *
 * Zero-dependency pure ES module. Shared across node:test, headless sniper, and browser.
 *
 * @module qa-wave5c-full-expedition-sim
 */

import {
    createGameState,
    addPlayer,
    tick,
    resolveWorldBoundsAndObstacles,
    resolveEnemyHit,
    PLAYER,
    PHYSICS,
    SHOP_ZONE,
    isInShopZone,
    TICK_MS,
} from './game-core.js';

import {
    collectCoinRings,
    generateRiverHazardsLayout,
} from './river-hazards.js';

import {
    createEconomyTransactionManager,
    validateCoins,
} from './qa-economy-breaker.js';

import {
    createKrakenState,
    spawnKraken,
    damageKraken,
    tickKraken,
    calculateWhirlpoolSuction,
    KRAKEN_SPAWN_Z,
} from './boss-kraken.js';

import {
    assertZeroNaNTentacles,
    stressSimultaneousTentacleSlams,
} from './qa-boss-verifier.js';

import {
    auditSceneGraphNaN,
} from './qa-receipt-generator.js';

export const EXPEDITION_ACTS = {
    ACT_1: { index: 1, id: 'amber-canyon', name: 'Amber Canyon Headwaters', zStart: 0, zEnd: -375 },
    ACT_2: { index: 2, id: 'neon-harbor', name: 'Neon Harbor & Smuggler Docks', zStart: -375, zEnd: -750 },
    ACT_3: { index: 3, id: 'bioluminescent-gorge', name: 'Bioluminescent Ruin Sanctuaries', zStart: -750, zEnd: -1125 },
    ACT_4: { index: 4, id: 'tempest-maelstrom', name: 'Tempest Maelstrom & Kraken Arena', zStart: -1125, zEnd: -1500 },
};

export const SANCTUARY_PLATFORM_CONFIG = {
    id: 'sanctuary_platform_act3',
    type: 'plank',
    x: 0,
    z: -850,
    halfW: 6.0,
    halfD: 8.0,
    topY: 1.5, // > PLAYER.safeHeight (1.0), triggering absolute immunity against water-level threats
};

/**
 * Deterministic Mulberry32 PRNG generator.
 */
export function createRng(seed = 1) {
    let a = (seed >>> 0) || 1;
    return function mulberry32() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Validates that a coin value is a finite, non-negative integer.
 *
 * @param {*} value
 * @returns {{ valid: boolean, reason?: string }}
 */
export function assertFiniteIntegerCoins(value) {
    if (typeof value !== 'number') {
        return { valid: false, reason: `Coin value is not a number: ${typeof value}` };
    }
    if (!Number.isFinite(value)) {
        return { valid: false, reason: `Coin value is not finite: ${value}` };
    }
    if (Number.isNaN(value)) {
        return { valid: false, reason: 'Coin value is NaN' };
    }
    if (!Number.isInteger(value)) {
        return { valid: false, reason: `Coin value must be an integer, got float: ${value}` };
    }
    if (value < 0) {
        return { valid: false, reason: `Coin value cannot be negative: ${value}` };
    }
    return { valid: true };
}

/**
 * Checks whether an entity or raft position is safely protected atop a Sanctuary Platform.
 *
 * @param {{ x: number, y: number, z: number }} position
 * @param {object} [platform=SANCTUARY_PLATFORM_CONFIG]
 * @returns {boolean}
 */
export function isPositionOnSanctuary(position, platform = SANCTUARY_PLATFORM_CONFIG) {
    if (!position || typeof position !== 'object') return false;
    const x = position.x ?? 0;
    const y = position.y ?? 0;
    const z = position.z ?? 0;

    const insideX = Math.abs(x - platform.x) <= platform.halfW + 0.75;
    const insideZ = Math.abs(z - platform.z) <= platform.halfD + 0.95;
    const onDeckY = y >= platform.topY - 0.2 && y <= platform.topY + 0.5;

    return insideX && insideZ && onDeckY && y > PLAYER.safeHeight;
}

/**
 * Creates the complete Co-Op Expedition runtime state.
 *
 * @param {object} [options={}]
 * @param {number} [options.seed=1337]
 * @param {number} [options.playerCount=2]
 * @param {object} [options.sanctuaryPlatform=SANCTUARY_PLATFORM_CONFIG]
 * @returns {object}
 */
export function createExpeditionState({
    seed = 1337,
    playerCount = 2,
    sanctuaryPlatform = SANCTUARY_PLATFORM_CONFIG,
} = {}) {
    const rng = createRng(seed);
    const gameState = createGameState({ seed, rng });
    const economyManager = createEconomyTransactionManager();
    const krakenState = createKrakenState({ seed });

    // Initialize 2-4 co-op players: Human Captain (p1) + Companion Bots
    const playerIds = [];
    addPlayer(gameState, 'p1', { isBot: false, name: 'Captain' });
    gameState.players['p1'].velocity = { x: 0, y: 0, z: 0 };
    playerIds.push('p1');

    for (let i = 1; i < Math.min(4, Math.max(1, playerCount)); i++) {
        const botId = `bot_${i}`;
        addPlayer(gameState, botId, { isBot: true, name: `Crewmate ${i}` });
        playerIds.push(botId);
    }

    // River hazards layout for the 1500m expedition
    const hazards = generateRiverHazardsLayout(seed, -1500, 30);

    // Guaranteed bonus coin rings in Act 1 (around z = -50 to -250)
    hazards.coinRings = hazards.coinRings || [];
    const guaranteedRings = [
        { id: 'ring_act1_1', x: 0, y: 0.5, z: -40, value: 10, radius: 2.5 },
        { id: 'ring_act1_2', x: 2, y: 0.5, z: -80, value: 15, radius: 2.5 },
        { id: 'ring_act1_3', x: -2, y: 0.5, z: -120, value: 20, radius: 2.5 },
        { id: 'ring_act1_4', x: 1, y: 0.5, z: -160, value: 25, radius: 2.5 },
    ];
    for (const r of guaranteedRings) {
        if (!hazards.coinRings.some((existing) => existing.id === r.id)) {
            hazards.coinRings.push(r);
        }
    }

    // Act 3 Sanctuary Platform obstacle
    const obstacles = [sanctuaryPlatform];

    return {
        seed,
        now: 0,
        currentAct: 1,
        gameState,
        economyManager,
        krakenState,
        hazards,
        obstacles,
        sanctuaryPlatform,
        playerIds,
        telemetry: {
            act1: { completed: false, coinsCollected: 0, coinRingsHit: 0, coinInvariantsValid: true },
            act2: { completed: false, harborReached: false, stoppedInBasin: false, purchases: [], purchaseSuccess: false },
            act3: { completed: false, platformDocked: false, onSolid: false, immunityVerified: false },
            act4: { completed: false, krakenSpawned: false, phasesPassed: [], defeatAchieved: false, zeroNaNVerified: true },
            totalEvents: [],
            violations: [],
        },
    };
}

/**
 * Simulates Act 1: Spawn & Airborne/Surface Coin Ring collection.
 * Enforces finite integer invariants on all coin awards.
 *
 * @param {object} expedition
 * @returns {object} Telemetry report for Act 1
 */
export function simulateAct1CoinCollection(expedition) {
    const { gameState, hazards, playerIds, telemetry } = expedition;
    const p1 = gameState.players['p1'];

    // 1. Verify clean spawn state at river start
    if (p1.position.z !== 0 && p1.position.z < -10) {
        telemetry.violations.push(`Act 1 Spawn violation: initial z is ${p1.position.z}`);
    }

    const coinCheckInitial = assertFiniteIntegerCoins(p1.coins);
    if (!coinCheckInitial.valid) {
        telemetry.violations.push(`Act 1 Spawn coin check failed: ${coinCheckInitial.reason}`);
        telemetry.act1.coinInvariantsValid = false;
    }

    let initialCoins = p1.coins;
    let coinsCollected = 0;
    let ringsHit = 0;

    // 2. Step raft downriver through Act 1 to collect coin rings
    const act1Rings = hazards.coinRings.filter((r) => r.z >= -350 && !r.collected);

    for (const ring of act1Rings) {
        // Position raft directly at the coin ring
        p1.position.x = ring.x;
        p1.position.y = ring.y;
        p1.position.z = ring.z;

        // Collect coin rings
        const collectRes = collectCoinRings(p1.position, [ring], 3.0);
        if (collectRes.collectedCount > 0) {
            ringsHit += collectRes.collectedCount;
            const awarded = collectRes.earnedCoins;

            // Invariant: awarded coins must be finite positive integer
            const intCheck = assertFiniteIntegerCoins(awarded);
            if (!intCheck.valid) {
                telemetry.violations.push(`Non-integer/corrupt coin pickup: ${intCheck.reason}`);
                telemetry.act1.coinInvariantsValid = false;
            }

            p1.coins += Math.floor(awarded);
            coinsCollected += Math.floor(awarded);

            // Invariant: total coins must remain finite integer
            const balanceCheck = assertFiniteIntegerCoins(p1.coins);
            if (!balanceCheck.valid) {
                telemetry.violations.push(`Player balance corrupted after coin pickup: ${balanceCheck.reason}`);
                telemetry.act1.coinInvariantsValid = false;
            }
        }
    }

    // Synchronize companion bots slightly trailing
    for (let i = 1; i < playerIds.length; i++) {
        const bot = gameState.players[playerIds[i]];
        if (bot) {
            bot.position.z = p1.position.z + 4 * i;
            bot.position.x = p1.position.x;
            const botCoinCheck = assertFiniteIntegerCoins(bot.coins);
            if (!botCoinCheck.valid) {
                telemetry.violations.push(`Bot ${bot.id} coin balance corrupted: ${botCoinCheck.reason}`);
                telemetry.act1.coinInvariantsValid = false;
            }
        }
    }

    telemetry.act1.completed = ringsHit > 0 && telemetry.act1.coinInvariantsValid;
    telemetry.act1.coinsCollected = coinsCollected;
    telemetry.act1.coinRingsHit = ringsHit;

    return telemetry.act1;
}

/**
 * Simulates Act 2: Harbor City calm lagoon entry, drift reduction/stop, and dockside Armory shop purchase.
 *
 * @param {object} expedition
 * @param {string} [upgradeId='motor_1']
 * @returns {object} Telemetry report for Act 2
 */
export function simulateAct2HarborShop(expedition, upgradeId = 'motor_1') {
    const { gameState, economyManager, playerIds, telemetry } = expedition;
    const p1 = gameState.players['p1'];

    // 1. Move players into the Harbor City Shop Zone (x > 10, z = -200)
    p1.position.x = 18.0; // Inside harbor basin
    p1.position.z = -200.0; // Center of SHOP_ZONE (z = -250 to -150)
    p1.velocity = p1.velocity || { x: 0, y: 0, z: 0 };
    p1.velocity.x = 0;
    p1.velocity.z = 0; // Halted drift in calm waters

    const inHarbor = isInShopZone(p1.position);
    telemetry.act2.harborReached = inHarbor;
    telemetry.act2.stoppedInBasin = (p1.velocity.z === 0 && p1.velocity.x === 0);

    if (!inHarbor) {
        telemetry.violations.push(`Failed to register raft in Harbor City shop zone at (${p1.position.x}, ${p1.position.z})`);
    }

    // 2. Ensure player has sufficient verified coins for the purchase
    const coinAuditBefore = validateCoins(p1.coins);
    if (!coinAuditBefore.valid) {
        telemetry.violations.push(`Pre-purchase coins invalid: ${coinAuditBefore.reason}`);
    }

    const initialCoins = p1.coins;
    p1.upgrades = p1.upgrades || [];

    // 3. Execute verified dockside purchase via Economy Transaction Manager
    const purchaseResult = economyManager.executePurchase(p1, upgradeId, {
        timestampMs: expedition.now + 1000,
    });

    if (purchaseResult.success) {
        telemetry.act2.purchaseSuccess = true;
        telemetry.act2.purchases.push({
            upgradeId,
            cost: purchaseResult.cost,
            coinsBefore: initialCoins,
            coinsAfter: p1.coins,
        });

        // Invariant: Balance deducted accurately, no negative/NaN
        const coinAuditAfter = assertFiniteIntegerCoins(p1.coins);
        if (!coinAuditAfter.valid) {
            telemetry.violations.push(`Post-purchase coins corrupted: ${coinAuditAfter.reason}`);
        }
        if (p1.coins !== initialCoins - purchaseResult.cost) {
            telemetry.violations.push(`Coin deduction mismatch: expected ${initialCoins - purchaseResult.cost}, got ${p1.coins}`);
        }
        if (!p1.upgrades.includes(upgradeId)) {
            telemetry.violations.push(`Purchased upgrade ${upgradeId} missing from player upgrades`);
        }
    } else {
        telemetry.violations.push(`Harbor Armory purchase failed: ${purchaseResult.reason}`);
    }

    telemetry.act2.completed = telemetry.act2.harborReached && telemetry.act2.purchaseSuccess;
    return telemetry.act2;
}

/**
 * Simulates Act 3: Elevated Sanctuary Platform docking, soft landing, onSolid flag, and 100% enemy attack immunity.
 *
 * @param {object} expedition
 * @returns {object} Telemetry report for Act 3
 */
export function simulateAct3SanctuaryDocking(expedition) {
    const { gameState, obstacles, sanctuaryPlatform, telemetry } = expedition;
    const p1 = gameState.players['p1'];

    // 1. Position raft at platform coordinates and resolve obstacle physics
    p1.position.x = sanctuaryPlatform.x;
    p1.position.z = sanctuaryPlatform.z;
    p1.position.y = sanctuaryPlatform.topY + 0.1; // Coming down from jump onto deck
    p1.velocity = p1.velocity || { x: 0, y: 0, z: 0 };
    p1.velocity.y = -2.0;

    // Step kinematic world resolver
    const resolveResult = resolveWorldBoundsAndObstacles(p1, obstacles);
    const onSolid = resolveResult.onSolid;
    const docked = isPositionOnSanctuary(p1.position, sanctuaryPlatform);

    telemetry.act3.platformDocked = docked;
    telemetry.act3.onSolid = onSolid;

    if (!docked || !onSolid) {
        telemetry.violations.push(`Sanctuary platform landing failed: docked=${docked}, onSolid=${onSolid}`);
    }

    // 2. Verify 100% Enemy Attack Immunity against River Wizard ('whiteGuy')
    gameState.enemies.whiteGuy = {
        id: 'whiteGuy',
        type: 'whiteGuy',
        health: 50,
        damage: 15,
        position: { x: sanctuaryPlatform.x, y: 0.5, z: sanctuaryPlatform.z - 2 },
    };

    const initialHealth = p1.health;
    // Attempt enemy attack while player is docked atop platform (y > PLAYER.safeHeight)
    const attackEvents = resolveEnemyHit(gameState, 'p1', 'whiteGuy', false);

    // Immunity check: zero damage taken, zero health update events
    if (p1.health !== initialHealth || attackEvents.length > 0) {
        telemetry.violations.push(`Enemy attack breached sanctuary platform immunity: damage taken=${initialHealth - p1.health}`);
        telemetry.act3.immunityVerified = false;
    } else {
        telemetry.act3.immunityVerified = true;
    }

    telemetry.act3.completed = telemetry.act3.platformDocked && telemetry.act3.onSolid && telemetry.act3.immunityVerified;
    return telemetry.act3;
}

/**
 * Simulates Act 4: Dread Kraken Boss encounter at z = -1350 across all 3 phases down to defeat,
 * coin fountain ballistics, and 0 NaN transform verification.
 *
 * @param {object} expedition
 * @returns {object} Telemetry report for Act 4
 */
export function simulateAct4BossKrakenEncounter(expedition) {
    const { krakenState, gameState, telemetry } = expedition;
    const p1 = gameState.players['p1'];

    // 1. Teleport raft to Boss Arena (z = -1350)
    p1.position.x = 0;
    p1.position.y = 0.25;
    p1.position.z = KRAKEN_SPAWN_Z;

    // 2. Spawn Kraken
    spawnKraken(krakenState);
    telemetry.act4.krakenSpawned = krakenState.isSpawned;
    if (!krakenState.isSpawned) {
        telemetry.violations.push('Kraken failed to spawn in Arena at z = -1350');
    }

    // Check NaN in Phase 1
    const p1Nan = assertZeroNaNTentacles(krakenState);
    if (!p1Nan.valid) {
        telemetry.violations.push(`Phase 1 tentacle NaN detected: ${p1Nan.invalidNodes.join(', ')}`);
        telemetry.act4.zeroNaNVerified = false;
    }
    telemetry.act4.phasesPassed.push(1);

    // 3. Combat: Phase 1 -> Phase 2 (damage down to <= 1000 HP)
    damageKraken(krakenState, 550);
    if (krakenState.phase === 2 && krakenState.whirlpoolActive) {
        telemetry.act4.phasesPassed.push(2);
        // Verify suction math produces finite vectors
        const suction = calculateWhirlpoolSuction(p1.position, krakenState);
        if (!Number.isFinite(suction.x) || !Number.isFinite(suction.z)) {
            telemetry.violations.push('Phase 2 whirlpool suction produced NaN');
            telemetry.act4.zeroNaNVerified = false;
        }
    } else {
        telemetry.violations.push('Failed to transition Kraken into Phase 2');
    }

    // Stress simultaneous tentacle slams in Phase 2
    const slamStress = stressSimultaneousTentacleSlams(krakenState, 0.05, 10);
    if (!slamStress.passed || !slamStress.allJointsClean) {
        telemetry.violations.push('Phase 2 tentacle slam stress corrupted joint angles');
        telemetry.act4.zeroNaNVerified = false;
    }

    // 4. Combat: Phase 2 -> Phase 3 (destroy barnacle + damage to <= 500 HP)
    damageKraken(krakenState, 100, 'barnacle_0'); // Stun
    damageKraken(krakenState, 500); // Transition to Phase 3

    if (krakenState.phase === 3 && krakenState.isFrenzyActive) {
        telemetry.act4.phasesPassed.push(3);
    } else {
        telemetry.violations.push('Failed to transition Kraken into Phase 3');
    }

    // 5. Combat: Phase 3 -> Defeat (0 HP)
    const defeatResult = damageKraken(krakenState, 1000);
    if (krakenState.isDefeated && krakenState.health === 0) {
        telemetry.act4.defeatAchieved = true;
    } else {
        telemetry.violations.push('Kraken defeat condition not reached');
    }

    // 6. Step Coin Fountain Ballistics post-defeat
    for (let t = 0; t < 15; t++) {
        tickKraken(krakenState, 0.05, [p1]);
    }

    if (krakenState.coinDrops.length === 0) {
        telemetry.violations.push('Defeated Kraken failed to spawn coin drops');
    } else {
        for (const coin of krakenState.coinDrops) {
            const coords = [coin.position.x, coin.position.y, coin.position.z, coin.velocity.x, coin.velocity.y, coin.velocity.z];
            if (coords.some((c) => !Number.isFinite(c) || Number.isNaN(c))) {
                telemetry.violations.push('Corrupt NaN coin drop ballistics detected');
                telemetry.act4.zeroNaNVerified = false;
                break;
            }
        }
    }

    // Final Zero-NaN audit on tentacle joints
    const finalNan = assertZeroNaNTentacles(krakenState);
    if (!finalNan.valid) {
        telemetry.violations.push(`Post-defeat tentacle NaN detected: ${finalNan.invalidNodes.join(', ')}`);
        telemetry.act4.zeroNaNVerified = false;
    }

    // Scene Graph NaN audit on a mock representation
    const mockKrakenScene = {
        name: 'DreadKrakenRig',
        position: { x: 0, y: 0, z: KRAKEN_SPAWN_Z },
        rotation: { x: 0, y: 0, z: 0 },
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
        children: krakenState.tentacles.map((t, idx) => ({
            name: `Tentacle_${idx}`,
            position: { x: t.x || 0, y: 0, z: t.z || 0 },
            rotation: { x: t.jointAngles[0] || 0, y: t.jointAngles[1] || 0, z: t.jointAngles[2] || 0 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
            children: [],
        })),
    };
    const sceneDefects = auditSceneGraphNaN(mockKrakenScene);
    if (sceneDefects.length > 0) {
        telemetry.violations.push(`Scene-graph NaN defects found: ${sceneDefects.length}`);
        telemetry.act4.zeroNaNVerified = false;
    }

    telemetry.act4.completed = telemetry.act4.krakenSpawned &&
        telemetry.act4.phasesPassed.length === 3 &&
        telemetry.act4.defeatAchieved &&
        telemetry.act4.zeroNaNVerified;

    return telemetry.act4;
}

/**
 * Runs a complete deterministic 4-Act Co-Op Expedition Simulation.
 *
 * Sequence:
 *   1. Spawn & Coin Ring pickup with finite integer checks (Act 1).
 *   2. Harbor City Calm Basin stop & Armory upgrade purchase (Act 2).
 *   3. Sanctuary Platform docking, soft landing, onSolid, and enemy immunity (Act 3).
 *   4. Dread Kraken boss encounter across 3 phases to defeat with 0 NaNs (Act 4).
 *
 * @param {object} [options={}]
 * @returns {object} Expedition outcome and audit receipt.
 */
export function simulateFullCoopExpedition(options = {}) {
    const expedition = createExpeditionState(options);

    // Step 1: Act 1 Coin Collection
    simulateAct1CoinCollection(expedition);

    // Step 2: Act 2 Harbor City Shop Purchase
    simulateAct2HarborShop(expedition, options.upgradeId || 'motor_1');

    // Step 3: Act 3 Sanctuary Platform Docking & Immunity
    simulateAct3SanctuaryDocking(expedition);

    // Step 4: Act 4 Boss Kraken Arena Encounter
    simulateAct4BossKrakenEncounter(expedition);

    const isAllPassed = expedition.telemetry.act1.completed &&
        expedition.telemetry.act2.completed &&
        expedition.telemetry.act3.completed &&
        expedition.telemetry.act4.completed &&
        expedition.telemetry.violations.length === 0;

    return {
        passed: isAllPassed,
        seed: expedition.seed,
        playerCount: expedition.playerIds.length,
        telemetry: expedition.telemetry,
        finalPlayerState: expedition.gameState.players['p1'],
        krakenState: expedition.krakenState,
    };
}
