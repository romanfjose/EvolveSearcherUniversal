/**
 * Don't Sink, Don't Die — AI Companion Bots Expressive Aliveness & Physical Reactions
 * (`shared/ai-bots.js`)
 *
 * Sovereign Core & Videogame Helmet 06 (World-Believability & Immersion Director):
 * "You do not care about textbook simulation or realistic physics—you care about
 * whether the world feels alive and answers the player back. Human immersion is broken
 * by deadness and broken promises... stage props pretending to be a world."
 *
 * This module breathes physical, reactive life into AI companion bots:
 * 1. Ducking & Bracing: Duck down into the hull and brace defensively when targeted
 *    by the River Mage ('whiteGuy') during telegraph wind-up or when the charging
 *    Nokia Worm ('longWorm') heads along their trajectory.
 * 2. Physical Combat Swings: Full physical torso lunge and weapon/oar sweep arcs
 *    when actively engaging or punishing river threats.
 * 3. Low-HP Plank Hopping: When critically wounded (health <= 35%), companion bots
 *    actively steer and hop toward elevated planks or solid platforms for refuge.
 * 4. Victory Hops & Celebrations: Jubilant vertical hop and oar raise whenever
 *    an enemy is defeated or a downriver checkpoint gate is crossed.
 */

import {
    clamp,
    distXZ,
    dist3,
    PLAYER,
    BOT,
    WATER_SURFACE_Y,
} from './game-core.js';

export const BOT_ALIVENESS_CONFIG = Object.freeze({
    // Danger reaction thresholds
    danger: {
        mageTelegraphRadius: 18.0,
        mageGrabThreatRadius: 14.0,
        wormChargeDistanceZ: 35.0,
        wormChargeCorridorX: 6.5,
        duckCrouchY: -0.22,
        duckPitchForward: 0.28,
        duckHeadDropY: -0.15,
        braceArmAngle: -1.2,
    },
    // Combat physical swing parameters
    combat: {
        swingDurationSec: 0.35,
        swingReachDistance: 4.5,
        torsoLungeZ: -0.2,
        torsoLungePitch: 0.18,
    },
    // Low-HP refuge and plank hopping
    refuge: {
        criticalHealthThreshold: 35,
        seekPlankRadius: 30.0,
        hopImpulseY: 6.5,
        hopForwardImpulseZ: -8.0,
        safeDeckHeight: 1.12,
    },
    // Victory celebrations
    victory: {
        hopDurationSec: 0.75,
        hopPeakHeight: 0.55,
        hopRotY: Math.PI * 0.35,
        oarPumpAngle: -1.5,
    },
});

/**
 * Creates an expressive aliveness state for a bot companion.
 * @param {string|number} botId
 * @returns {object}
 */
export function createBotAlivenessState(botId = 'bot') {
    return {
        id: botId,
        isDucking: false,
        isBracing: false,
        duckProgress: 0, // 0 = upright, 1 = fully tucked into hull
        threatSource: null, // 'riverMage' | 'nokiaWorm' | null
        swingTimer: 0,
        isSwinging: false,
        seekingRefuge: false,
        refugePlankTarget: null,
        victoryHopTimer: 0,
        victoryHopDuration: BOT_ALIVENESS_CONFIG.victory.hopDurationSec,
        lastCelebrationReason: null,
    };
}

/**
 * Evaluates whether a bot is actively targeted or in danger from the River Mage (`whiteGuy`).
 * Checks enemy position, telegraph windup state, or telekinetic targeting.
 *
 * @param {object} botPos - { x, y, z }
 * @param {object} mageEnemy - enemy state for 'whiteGuy'
 * @param {object} [telegraph] - telegraph state { windup, duration }
 * @returns {boolean}
 */
export function isBotTargetedByRiverMage(botPos, mageEnemy, telegraph = null) {
    if (!botPos || !mageEnemy || mageEnemy.health <= 0) return false;
    const magePos = mageEnemy.position || mageEnemy;
    const dist = distXZ(botPos, magePos);

    if (dist > BOT_ALIVENESS_CONFIG.danger.mageTelegraphRadius) return false;

    // Check if mage is in active attack windup or targeting within grab radius
    const inWindup = telegraph && (telegraph.windup > 0 || (telegraph.windupProgress && telegraph.windupProgress > 0.05));
    const closeDanger = dist <= BOT_ALIVENESS_CONFIG.danger.mageGrabThreatRadius;

    return Boolean(inWindup || closeDanger);
}

/**
 * Evaluates whether a bot is threatened by the charging Nokia Worm (`longWorm`).
 * Checks if the worm is charging along the river corridor towards or past the bot.
 *
 * @param {object} botPos - { x, y, z }
 * @param {object} wormEnemy - enemy state for 'longWorm'
 * @returns {boolean}
 */
export function isBotTargetedByNokiaWorm(botPos, wormEnemy) {
    if (!botPos || !wormEnemy || wormEnemy.health <= 0) return false;
    if (wormEnemy.state !== 'charging') return false;

    const wormPos = wormEnemy.position || wormEnemy;
    const targetPos = wormEnemy.targetPos || wormPos;

    // Distance to charging line or charge target
    const distToTarget = distXZ(botPos, targetPos);
    if (distToTarget <= BOT.evadeRadius + 2.0) return true;

    // Check corridor: worm is upriver/downriver within threatDistanceZ and within corridor X
    const dz = Math.abs(wormPos.z - botPos.z);
    const dx = Math.abs(wormPos.x - botPos.x);

    return dz <= BOT_ALIVENESS_CONFIG.danger.wormChargeDistanceZ && dx <= BOT_ALIVENESS_CONFIG.danger.wormChargeCorridorX;
}

/**
 * Evaluates danger reactions (ducking & bracing) for a bot companion.
 *
 * @param {object} bot - bot entity { id, position, health, etc. }
 * @param {object} enemies - map of enemies { whiteGuy, longWorm, mudAlien }
 * @param {object} [telegraphs={}] - map of enemy telegraphs
 * @returns {object} { shouldDuck, shouldBrace, threatType, threatSource }
 */
export function evaluateBotDangerReaction(bot, enemies = {}, telegraphs = {}) {
    if (!bot || bot.isDead || (bot.health !== undefined && bot.health <= 0)) {
        return { shouldDuck: false, shouldBrace: false, threatType: 'none', threatSource: null };
    }

    const botPos = bot.position || { x: 0, y: 0.25, z: 0 };
    const mage = enemies.whiteGuy;
    const worm = enemies.longWorm;

    const targetedByMage = isBotTargetedByRiverMage(botPos, mage, telegraphs.whiteGuy);
    if (targetedByMage) {
        return {
            shouldDuck: true,
            shouldBrace: true,
            threatType: 'riverMage',
            threatSource: mage,
        };
    }

    const targetedByWorm = isBotTargetedByNokiaWorm(botPos, worm);
    if (targetedByWorm) {
        return {
            shouldDuck: true,
            shouldBrace: true,
            threatType: 'nokiaWorm',
            threatSource: worm,
        };
    }

    return {
        shouldDuck: false,
        shouldBrace: false,
        threatType: 'none',
        threatSource: null,
    };
}

/**
 * Finds the nearest safe elevated plank, platform, or shore promenade for a low-HP bot.
 *
 * @param {object} botPos - { x, y, z }
 * @param {Array<object>} platforms - list of platforms / planks
 * @returns {object|null} nearest platform or null
 */
export function findNearestSafePlank(botPos, platforms = []) {
    if (!botPos || !Array.isArray(platforms) || platforms.length === 0) return null;
    let nearest = null;
    let minDist = Infinity;

    for (const p of platforms) {
        if (!p) continue;
        const px = p.x ?? p.position?.x ?? 0;
        const pz = p.z ?? p.position?.z ?? 0;
        const py = p.topY ?? p.y ?? p.position?.y ?? 1.12;

        // Planks or platforms elevated above PLAYER.safeHeight (1.0m) provide refuge from river enemies
        if (py < PLAYER.safeHeight) continue;

        const d = distXZ(botPos, { x: px, z: pz });
        if (d <= BOT_ALIVENESS_CONFIG.refuge.seekPlankRadius && d < minDist) {
            minDist = d;
            nearest = {
                id: p.id,
                x: px,
                y: py,
                z: pz,
                width: p.width || 10,
                length: p.length || 12,
                distance: d,
            };
        }
    }
    return nearest;
}

/**
 * Evaluates whether a bot needs to escape water and hop onto safe planks/platforms.
 *
 * @param {object} bot - { health, maxHealth, position, onSolid }
 * @param {Array<object>} platforms - available platforms
 * @returns {object} { shouldHop, targetPlank, hopImpulse }
 */
export function shouldBotHopToPlank(bot, platforms = []) {
    if (!bot || bot.isDead) return { shouldHop: false, targetPlank: null, hopImpulse: null };
    const hp = bot.health ?? 100;
    const maxHp = bot.maxHealth ?? 100;
    const hpPercent = (hp / maxHp) * 100;

    // Only seek refuge when health is critical (<= 35%) and not already on solid ground
    const isCritical = hpPercent <= BOT_ALIVENESS_CONFIG.refuge.criticalHealthThreshold;
    const botPos = bot.position || { x: 0, y: 0.25, z: 0 };
    const onSolid = Boolean(bot.onSolid || botPos.y > PLAYER.safeHeight);

    if (!isCritical || onSolid) {
        return { shouldHop: false, targetPlank: null, hopImpulse: null, isCritical };
    }

    const plank = findNearestSafePlank(botPos, platforms);
    if (!plank) {
        return { shouldHop: false, targetPlank: null, hopImpulse: null, isCritical };
    }

    // Direction vector towards plank
    const dx = plank.x - botPos.x;
    const dz = plank.z - botPos.z;
    const dist = Math.hypot(dx, dz);

    const hopImpulse = {
        x: dist > 0 ? (dx / dist) * 4.0 : 0,
        y: BOT_ALIVENESS_CONFIG.refuge.hopImpulseY,
        z: dist > 0 ? (dz / dist) * 5.0 : BOT_ALIVENESS_CONFIG.refuge.hopForwardImpulseZ,
    };

    return {
        shouldHop: true,
        targetPlank: plank,
        hopImpulse,
        isCritical: true,
    };
}

/**
 * Triggers a celebratory victory hop for a bot (on enemy death or checkpoint crossed).
 *
 * @param {object} state - bot aliveness state
 * @param {string} [reason='enemy_killed'] - 'enemy_killed' | 'checkpoint' | 'game_won'
 */
export function triggerVictoryHop(state, reason = 'enemy_killed') {
    if (!state) return;
    state.victoryHopTimer = BOT_ALIVENESS_CONFIG.victory.hopDurationSec;
    state.lastCelebrationReason = reason;
}

/**
 * Steps the victory hop animation timer and calculates the 3D visual offset.
 *
 * @param {object} state - bot aliveness state
 * @param {number} dt - delta time in seconds
 * @returns {object} { isHopping, yOffset, rotY, armAngle }
 */
export function stepVictoryHop(state, dt) {
    if (!state || state.victoryHopTimer <= 0) {
        return { isHopping: false, yOffset: 0, rotY: 0, armAngle: 0 };
    }

    state.victoryHopTimer = Math.max(0, state.victoryHopTimer - dt);
    const duration = BOT_ALIVENESS_CONFIG.victory.hopDurationSec;
    const progress = 1 - (state.victoryHopTimer / duration); // 0 to 1

    // Parabolic hop curve: sin(progress * PI)
    const hopSin = Math.sin(progress * Math.PI);
    const yOffset = hopSin * BOT_ALIVENESS_CONFIG.victory.hopPeakHeight;
    // Cheerful twist
    const rotY = Math.sin(progress * Math.PI * 2) * BOT_ALIVENESS_CONFIG.victory.hopRotY * 0.4;
    // Oar/arm pump into the air
    const armAngle = -hopSin * BOT_ALIVENESS_CONFIG.victory.oarPumpAngle;

    return {
        isHopping: state.victoryHopTimer > 0,
        yOffset,
        rotY,
        armAngle,
        progress,
    };
}

/**
 * Triggers a physical melee swing animation for a bot.
 *
 * @param {object} state - bot aliveness state
 */
export function triggerBotSwing(state) {
    if (!state) return;
    state.swingTimer = BOT_ALIVENESS_CONFIG.combat.swingDurationSec;
    state.isSwinging = true;
}

/**
 * Evaluates whether an engaging bot should swing its weapon/oar at an enemy.
 *
 * @param {object} bot - { position }
 * @param {object} targetEnemy - { position, health }
 * @returns {boolean}
 */
export function shouldBotSwingAtEnemy(bot, targetEnemy) {
    if (!bot || !targetEnemy || targetEnemy.health <= 0) return false;
    const botPos = bot.position || bot;
    const ePos = targetEnemy.position || targetEnemy;
    const d = dist3(botPos, ePos);
    return d <= BOT_ALIVENESS_CONFIG.combat.swingReachDistance;
}

/**
 * Advances the bot aliveness simulation by dt seconds and applies physical postures.
 * Mutates `alivenessState` and outputs reactive transform overrides for the 3D rig.
 *
 * @param {object} alivenessState - state created via createBotAlivenessState
 * @param {object} botEntity - authoritative bot entity
 * @param {object} context - { enemies, telegraphs, platforms }
 * @param {number} dt - delta time in seconds
 * @returns {object} expressive frame adjustments { duckOffset, braceAngle, swingArc, victoryOffset, isDucking, isBracing, isHopping }
 */
export function stepBotExpressiveAliveness(alivenessState, botEntity, context = {}, dt = 0.016) {
    if (!alivenessState || !botEntity || botEntity.isDead) {
        return {
            duckOffsetY: 0,
            duckPitch: 0,
            braceAngle: 0,
            swingArc: 0,
            victoryOffsetY: 0,
            victoryRotY: 0,
            isDucking: false,
            isBracing: false,
            isHopping: false,
            seekingRefuge: false,
        };
    }

    const { enemies = {}, telegraphs = {}, platforms = [] } = context;

    // 1. Danger Evaluation (Ducking / Bracing)
    const danger = evaluateBotDangerReaction(botEntity, enemies, telegraphs);
    alivenessState.isDucking = danger.shouldDuck;
    alivenessState.isBracing = danger.shouldBrace;
    alivenessState.threatSource = danger.threatType;

    // Smooth crouch blend (ease in/out)
    const targetDuck = danger.shouldDuck ? 1.0 : 0.0;
    const duckLerpRate = danger.shouldDuck ? 12.0 : 6.0;
    alivenessState.duckProgress += (targetDuck - alivenessState.duckProgress) * (1 - Math.exp(-duckLerpRate * dt));
    alivenessState.duckProgress = clamp(alivenessState.duckProgress, 0, 1);

    const duckOffsetY = alivenessState.duckProgress * BOT_ALIVENESS_CONFIG.danger.duckCrouchY;
    const duckPitch = alivenessState.duckProgress * BOT_ALIVENESS_CONFIG.danger.duckPitchForward;
    const braceAngle = alivenessState.duckProgress * BOT_ALIVENESS_CONFIG.danger.braceArmAngle;

    // 2. Combat Physical Swing
    if (alivenessState.swingTimer > 0) {
        alivenessState.swingTimer = Math.max(0, alivenessState.swingTimer - dt);
        alivenessState.isSwinging = alivenessState.swingTimer > 0;
    }
    const swingProgress = alivenessState.swingTimer / BOT_ALIVENESS_CONFIG.combat.swingDurationSec;
    const swingArc = Math.sin((1 - swingProgress) * Math.PI);

    // 3. Refuge / Low-HP Plank Hopping Check
    const refugeCheck = shouldBotHopToPlank(botEntity, platforms);
    alivenessState.seekingRefuge = refugeCheck.shouldHop;
    alivenessState.refugePlankTarget = refugeCheck.targetPlank;

    // 4. Victory Hop Evaluation
    const victory = stepVictoryHop(alivenessState, dt);

    return {
        duckOffsetY,
        duckPitch,
        braceAngle,
        swingArc,
        victoryOffsetY: victory.yOffset,
        victoryRotY: victory.rotY,
        victoryArmAngle: victory.armAngle,
        isDucking: alivenessState.isDucking,
        isBracing: alivenessState.isBracing,
        isHopping: victory.isHopping,
        seekingRefuge: alivenessState.seekingRefuge,
        refugePlankTarget: alivenessState.refugePlankTarget,
        hopImpulse: refugeCheck.hopImpulse,
    };
}
