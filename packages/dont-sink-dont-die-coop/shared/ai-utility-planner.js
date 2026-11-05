/**
 * Don't Sink, Don't Die — Autonomous AI Crewmate Utility Planner
 * (`shared/ai-utility-planner.js`)
 *
 * Sovereign Core & Helmet 02 Architecture (The RTS Flight Engineer):
 * - Pure, deterministic multi-objective utility planner for AI companion crewmates.
 * - Zero timers, zero I/O, zero global leaks, and zero external dependencies.
 * - Evaluates 5 core tactical objectives:
 *     (1) Whirlpool Avoidance: High-priority negative utility avoidance vector.
 *     (2) Waterfall Stunt-Ramp Alignment: Seeking downriver stunt ramps for bonus speed and coins.
 *     (3) Floating Coin Crate Pickup: Navigating toward nearby coin streams, chests, and crates.
 *     (4) Low-HP Enemy Focus Fire: Prioritizing vulnerable / low-health enemies to eliminate threats fast.
 *     (5) Co-op Tether Range: Staying within tether range of the human player / lead raft.
 */

import {
    distXZ,
    dist3,
    clamp,
    RIVER,
    BOT,
    PLAYER,
    leadPlayer,
    alivePlayers,
} from './game-core.js';

import {
    HAZARD_CONSTANTS,
} from './river-hazards.js';

/**
 * Default Configuration & Weights for Multi-Objective Utility Evaluation
 */
export const UTILITY_CONFIG = {
    weights: {
        whirlpoolAvoidance: 100.0,
        rampAlignment: 45.0,
        lootPickup: 35.0,
        focusFire: 50.0,
        tetherRetention: 60.0,
    },
    whirlpool: {
        threatDistanceZ: 35.0,
        safetyBuffer: 6.0,
        criticalRadiusRatio: 1.25,
    },
    ramp: {
        seekAheadMinZ: 2.0,
        seekAheadMaxZ: 50.0,
        alignmentToleranceX: 1.5,
    },
    loot: {
        maxSearchRadius: 45.0,
        chestBonusMultiplier: 1.5,
    },
    focusFire: {
        maxEngageDistance: 30.0,
        lowHpThreshold: 50,
        criticalHpThreshold: 20,
    },
    tether: {
        idealDistance: 12.0,
        maxSoftTether: 28.0,
        hardTether: 45.0,
    },
    corridor: {
        riverHalfWidth: (RIVER.width || 30) * 0.5 - 2.5,
        wallAvoidBuffer: 3.0,
        wallPenaltyWeight: 80.0,
    },
};

/**
 * Objective (1): Whirlpool Avoidance Scorer
 * Returns utility score [0 to 1], avoidance steering direction (-1 to 1), and danger level.
 * High danger generates urgent avoidance steering away from whirlpool suction cores.
 */
export function scoreWhirlpoolAvoidance(botPos, whirlpools = [], config = UTILITY_CONFIG) {
    if (!whirlpools || whirlpools.length === 0) {
        return {
            utility: 1.0, // Maximum safety
            danger: 0.0,
            recommendedSteer: 0.0,
            targetWhirlpool: null,
            targetPos: null,
        };
    }

    let highestDanger = 0.0;
    let closestWhirlpool = null;
    let avoidSteer = 0.0;

    for (let i = 0; i < whirlpools.length; i++) {
        const wp = whirlpools[i];
        const dz = wp.z - botPos.z; // negative downriver (wp is ahead if dz < 0)
        const radius = wp.radius || HAZARD_CONSTANTS.WHIRLPOOL.DEFAULT_RADIUS;
        const dangerRadius = radius + config.whirlpool.safetyBuffer;

        // Threat window: downstream up to threatDistanceZ or close proximity behind
        if (dz <= 3.0 && dz >= -config.whirlpool.threatDistanceZ) {
            const dx = botPos.x - wp.x;
            const dist = Math.hypot(dx, dz);

            if (dist < dangerRadius) {
                // Danger scales inversely with distance to core
                const proximity = clamp(1.0 - dist / dangerRadius, 0.0, 1.0);
                if (proximity > highestDanger) {
                    highestDanger = proximity;
                    closestWhirlpool = wp;

                    // Compute avoidance lateral steer
                    let dirX = dx === 0 ? (botPos.x >= 0 ? 1 : -1) : Math.sign(dx);
                    // Avoid steering directly into river wall
                    const maxWallX = config.corridor.riverHalfWidth;
                    if (botPos.x + dirX * 3 > maxWallX) dirX = -1;
                    if (botPos.x + dirX * 3 < -maxWallX) dirX = 1;

                    avoidSteer = dirX * clamp(proximity * 1.5, 0.4, 1.0);
                }
            }
        }
    }

    // High danger corresponds to lower utility for maintaining current heading
    // Utility of an avoidance maneuver is proportional to the averted danger
    return {
        utility: clamp(1.0 - highestDanger, 0.0, 1.0),
        danger: highestDanger,
        recommendedSteer: avoidSteer,
        targetWhirlpool: closestWhirlpool,
        targetPos: closestWhirlpool
            ? { x: botPos.x + avoidSteer * 6.0, z: closestWhirlpool.z - 5.0 }
            : null,
    };
}

/**
 * Objective (2): Waterfall Stunt-Ramp Alignment Scorer
 * Evaluates upcoming stunt jump ramps ahead of the bot and calculates
 * alignment utility and lateral adjustment.
 */
export function scoreRampAlignment(botPos, ramps = [], config = UTILITY_CONFIG) {
    if (!ramps || ramps.length === 0) {
        return {
            utility: 0.0,
            recommendedSteer: 0.0,
            targetRamp: null,
            targetPos: null,
            aligned: false,
        };
    }

    let bestRamp = null;
    let bestDistZ = Infinity;

    for (let i = 0; i < ramps.length; i++) {
        const ramp = ramps[i];
        const dz = ramp.z - botPos.z; // negative downriver

        // Only evaluate ramps ahead of the bot
        if (dz <= -config.ramp.seekAheadMinZ && dz >= -config.ramp.seekAheadMaxZ) {
            const distZ = Math.abs(dz);
            if (distZ < bestDistZ) {
                bestDistZ = distZ;
                bestRamp = ramp;
            }
        }
    }

    if (!bestRamp) {
        return {
            utility: 0.0,
            recommendedSteer: 0.0,
            targetRamp: null,
            targetPos: null,
            aligned: false,
        };
    }

    const dx = bestRamp.x - botPos.x;
    const rampHalfW = (bestRamp.width || HAZARD_CONSTANTS.RAMP.DEFAULT_WIDTH) * 0.5;
    const isAligned = Math.abs(dx) <= rampHalfW;

    // Utility is highest when ramp is within immediate horizon and lateral deviation is small
    const distanceFactor = 1.0 - bestDistZ / config.ramp.seekAheadMaxZ;
    const alignmentFactor = clamp(1.0 - Math.abs(dx) / (config.corridor.riverHalfWidth * 2), 0.0, 1.0);
    const utility = clamp(distanceFactor * 0.5 + alignmentFactor * 0.5, 0.0, 1.0);

    const steer = isAligned ? 0.0 : Math.sign(dx) * clamp(Math.abs(dx) / rampHalfW, 0.3, 1.0);

    return {
        utility,
        recommendedSteer: steer,
        targetRamp: bestRamp,
        targetPos: { x: bestRamp.x, z: bestRamp.z },
        aligned: isAligned,
    };
}

/**
 * Objective (3): Floating Coin Crate & Loot Pickup Scorer
 * Scans active loot pickups / coin crates, weighting high-value chests higher than loose coins.
 */
export function scoreLootPickup(botPos, lootPickups = [], config = UTILITY_CONFIG) {
    if (!lootPickups || lootPickups.length === 0) {
        return {
            utility: 0.0,
            recommendedSteer: 0.0,
            targetPickup: null,
            targetPos: null,
        };
    }

    let bestItem = null;
    let highestScore = -Infinity;

    for (let i = 0; i < lootPickups.length; i++) {
        const item = lootPickups[i];
        if (item.collected) continue;

        const d = distXZ(botPos, item.position);
        if (d > config.loot.maxSearchRadius) continue;

        // Higher base value for chests and repair kits
        let baseValue = 1.0;
        if (item.type === 'treasure-chest' || item.category === 'treasure') {
            baseValue = config.loot.chestBonusMultiplier;
        } else if (item.type === 'repair-kit' || item.category === 'consumable') {
            baseValue = 1.3;
        }

        // Distance attenuation
        const distanceDiscount = 1.0 - d / config.loot.maxSearchRadius;
        const score = baseValue * distanceDiscount;

        if (score > highestScore) {
            highestScore = score;
            bestItem = item;
        }
    }

    if (!bestItem) {
        return {
            utility: 0.0,
            recommendedSteer: 0.0,
            targetPickup: null,
            targetPos: null,
        };
    }

    const dx = bestItem.position.x - botPos.x;
    const steer = Math.sign(dx) * clamp(Math.abs(dx) / 5.0, 0.2, 1.0);

    return {
        utility: clamp(highestScore, 0.0, 1.0),
        recommendedSteer: steer,
        targetPickup: bestItem,
        targetPos: { x: bestItem.position.x, z: bestItem.position.z },
    };
}

/**
 * Objective (4): Low-HP Enemy Focus Fire Scorer
 * Prioritizes vulnerable, wounded, and low-health enemies to clear threats quickly.
 */
export function scoreFocusFire(botPos, enemies = {}, config = UTILITY_CONFIG) {
    const enemyList = Array.isArray(enemies) ? enemies : Object.values(enemies);
    const activeEnemies = enemyList.filter((e) => e && !e.isDead && e.health > 0);

    if (activeEnemies.length === 0) {
        return {
            utility: 0.0,
            recommendedSteer: 0.0,
            targetEnemy: null,
            targetPos: null,
        };
    }

    let bestEnemy = null;
    let highestScore = -Infinity;

    for (let i = 0; i < activeEnemies.length; i++) {
        const enemy = activeEnemies[i];
        const d = distXZ(botPos, enemy.position);
        if (d > config.focusFire.maxEngageDistance) continue;

        const maxHp = enemy.maxHealth || 100;
        const currentHp = enemy.health;
        const hpRatio = clamp(currentHp / maxHp, 0.0, 1.0);

        // Low-HP bonus: enemies under threshold get exponential priority
        let lowHpMultiplier = 1.0;
        if (currentHp <= config.focusFire.criticalHpThreshold) {
            lowHpMultiplier = 2.5;
        } else if (currentHp <= config.focusFire.lowHpThreshold) {
            lowHpMultiplier = 1.8;
        }

        const distanceFactor = 1.0 - d / config.focusFire.maxEngageDistance;
        // Inverted HP factor: lower remaining HP produces higher focus utility
        const vulnerabilityFactor = (1.0 - hpRatio * 0.7);

        const score = distanceFactor * vulnerabilityFactor * lowHpMultiplier;

        if (score > highestScore) {
            highestScore = score;
            bestEnemy = enemy;
        }
    }

    if (!bestEnemy) {
        return {
            utility: 0.0,
            recommendedSteer: 0.0,
            targetEnemy: null,
            targetPos: null,
        };
    }

    const dx = bestEnemy.position.x - botPos.x;
    const steer = Math.sign(dx) * clamp(Math.abs(dx) / 6.0, 0.2, 1.0);

    return {
        utility: clamp(highestScore / 2.5, 0.0, 1.0),
        recommendedSteer: steer,
        targetEnemy: bestEnemy,
        targetPos: { x: bestEnemy.position.x, z: bestEnemy.position.z },
    };
}

/**
 * Objective (5): Co-op Tether Range Scorer
 * Enforces staying within tether range of the human player / lead raft.
 * Evaluates soft and hard leash thresholds to maintain co-op formation.
 */
export function scoreTetherRetention(botPos, humanPlayer, config = UTILITY_CONFIG) {
    if (!humanPlayer || humanPlayer.isDead) {
        return {
            utility: 1.0, // Human dead or absent; tether invariant satisfied
            tetherViolation: false,
            recommendedSteer: 0.0,
            targetPos: null,
            distanceToLeader: 0.0,
        };
    }

    const d = distXZ(botPos, humanPlayer.position);
    const softLimit = config.tether.maxSoftTether;
    const hardLimit = config.tether.hardTether;

    let utility = 1.0;
    let tetherViolation = false;
    let steer = 0.0;

    if (d > hardLimit) {
        // Critical breach: must immediately sprint back toward human
        utility = 0.0;
        tetherViolation = true;
    } else if (d > softLimit) {
        // Soft leash: utility decays smoothly toward hard limit
        utility = clamp(1.0 - (d - softLimit) / (hardLimit - softLimit), 0.0, 1.0);
    }

    if (d > config.tether.idealDistance) {
        const dx = humanPlayer.position.x - botPos.x;
        steer = Math.sign(dx) * clamp(Math.abs(dx) / 10.0, 0.2, 1.0);
    }

    return {
        utility,
        tetherViolation,
        recommendedSteer: steer,
        targetPos: { x: humanPlayer.position.x, z: humanPlayer.position.z },
        distanceToLeader: d,
    };
}

/**
 * Evaluates multi-objective utility for a crewmate bot across all 5 tactical domains.
 *
 * @param {object} bot - AI companion bot object with position, upgrades, etc.
 * @param {object} context - World context { humanPlayer, whirlpools, ramps, lootPickups, enemies }
 * @param {object} [config=UTILITY_CONFIG] - Custom weights and limits configuration.
 * @returns {object} Scored objectives and overall utility summary.
 */
export function evaluateCrewUtilityPlan(bot, context = {}, config = UTILITY_CONFIG) {
    if (!bot || !bot.position) {
        return {
            topAction: 'idle',
            scores: {},
            weightedUtility: 0,
            chosenTarget: null,
            targetAction: 'idle',
            steer: 0,
        };
    }

    const botPos = bot.position;
    const whirlpools = context.whirlpools || context.hazards?.whirlpools || [];
    const ramps = context.ramps || context.hazards?.ramps || [];
    const lootPickups = context.lootPickups || context.pickups || [];
    const enemies = context.enemies || [];
    const human = context.humanPlayer || context.leader || null;

    // 1. Evaluate Individual Objectives
    const objWhirlpool = scoreWhirlpoolAvoidance(botPos, whirlpools, config);
    const objRamp = scoreRampAlignment(botPos, ramps, config);
    const objLoot = scoreLootPickup(botPos, lootPickups, config);
    const objFocusFire = scoreFocusFire(botPos, enemies, config);
    const objTether = scoreTetherRetention(botPos, human, config);

    // 2. Weighted Utility Computation
    const weights = config.weights;

    // Whirlpool danger imposes dominant negative penalty / evasion urge
    const whirlpoolUrgency = objWhirlpool.danger > 0.3 ? (objWhirlpool.danger * weights.whirlpoolAvoidance * 1.5) : 0;
    const tetherUrgency = objTether.tetherViolation ? (weights.tetherRetention * 2.0) : 0;

    const candidateActions = [
        {
            action: 'dodge_whirlpool',
            weight: weights.whirlpoolAvoidance,
            rawUtility: objWhirlpool.danger, // higher danger => higher urgency to dodge
            totalScore: whirlpoolUrgency,
            steer: objWhirlpool.recommendedSteer,
            target: objWhirlpool.targetPos,
            details: objWhirlpool,
        },
        {
            action: 'regroup_tether',
            weight: weights.tetherRetention,
            rawUtility: 1.0 - objTether.utility,
            totalScore: tetherUrgency + (1.0 - objTether.utility) * weights.tetherRetention,
            steer: objTether.recommendedSteer,
            target: objTether.targetPos,
            details: objTether,
        },
        {
            action: 'focus_fire',
            weight: weights.focusFire,
            rawUtility: objFocusFire.utility,
            totalScore: objFocusFire.utility * weights.focusFire,
            steer: objFocusFire.recommendedSteer,
            target: objFocusFire.targetPos,
            details: objFocusFire,
        },
        {
            action: 'align_ramp',
            weight: weights.rampAlignment,
            rawUtility: objRamp.utility,
            totalScore: objRamp.utility * weights.rampAlignment,
            steer: objRamp.recommendedSteer,
            target: objRamp.targetPos,
            details: objRamp,
        },
        {
            action: 'collect_loot',
            weight: weights.lootPickup,
            rawUtility: objLoot.utility,
            totalScore: objLoot.utility * weights.lootPickup,
            steer: objLoot.recommendedSteer,
            target: objLoot.targetPos,
            details: objLoot,
        },
    ];

    // Select candidate action with highest total utility score
    let best = candidateActions[0];
    for (let i = 1; i < candidateActions.length; i++) {
        if (candidateActions[i].totalScore > best.totalScore) {
            best = candidateActions[i];
        }
    }

    // Default to cruise / follow formation if no action scores meaningfully
    const topAction = best.totalScore > 5.0 ? best.action : 'cruise';
    const chosenTarget = best.totalScore > 5.0 ? best.target : (objTether.targetPos || { x: 0, z: botPos.z - 20 });
    const finalSteer = best.totalScore > 5.0 ? best.steer : objTether.recommendedSteer;

    return {
        topAction,
        chosenTarget,
        steer: Number(clamp(finalSteer, -1.0, 1.0).toFixed(4)),
        scores: {
            whirlpool: objWhirlpool,
            ramp: objRamp,
            loot: objLoot,
            focusFire: objFocusFire,
            tether: objTether,
        },
        candidateActions,
        bestAction: best,
    };
}

/**
 * Computes deterministic steering, thrust, and action directives for an AI crewmate bot.
 * Integrates directly with game-core and bot update steps.
 *
 * @param {object} bot - AI companion bot player object.
 * @param {object} context - Environment context { whirlpools, ramps, lootPickups, enemies, humanPlayer }
 * @param {object} [config=UTILITY_CONFIG] - Custom weights/limits configuration.
 * @returns {object} AI crew command { steer, paddle, attack, jump, mode, target }
 */
export function computeCrewBotPlan(bot, context = {}, config = UTILITY_CONFIG) {
    if (!bot || bot.isDead) {
        return {
            mode: 'dead',
            steer: 0,
            paddle: false,
            attack: false,
            jump: false,
            target: null,
        };
    }

    const plan = evaluateCrewUtilityPlan(bot, context, config);
    let paddle = true;
    let attack = false;
    let jump = false;

    if (plan.topAction === 'focus_fire') {
        const targetEnemy = plan.scores.focusFire.targetEnemy;
        if (targetEnemy) {
            const d = distXZ(bot.position, targetEnemy.position);
            if (d <= (PLAYER.attackRange || 4.0)) {
                attack = true;
            }
        }
    } else if (plan.topAction === 'align_ramp') {
        const ramp = plan.scores.ramp.targetRamp;
        if (ramp) {
            const dz = Math.abs(ramp.z - bot.position.z);
            if (dz < 4.0 && plan.scores.ramp.aligned) {
                jump = true;
            }
        }
    }

    // Corridor clamping
    const halfW = config.corridor.riverHalfWidth;
    let adjustedSteer = plan.steer;
    if (bot.position.x > halfW) {
        adjustedSteer = -1.0;
    } else if (bot.position.x < -halfW) {
        adjustedSteer = 1.0;
    }

    return {
        mode: plan.topAction,
        steer: Number(clamp(adjustedSteer, -1.0, 1.0).toFixed(4)),
        paddle,
        attack,
        jump,
        target: plan.chosenTarget,
        scores: plan.scores,
    };
}
