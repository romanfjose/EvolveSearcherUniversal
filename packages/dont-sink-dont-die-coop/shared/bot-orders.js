/**
 * Don't Sink, Don't Die — AI Companion Bots Tactical Orders & Voice-Wheel System
 * Shared deterministic module for quick tactical ping / voice-wheel commands:
 *   1: 'Form Up & Protect Rear'
 *   2: 'Focus Fire Boss'
 *   3: 'Spread Out & Scavenge Coins'
 *   4: 'Rush Next Checkpoint'
 *
 * Provides command state management, tactical AI decision modifiers,
 * contextual bot verbal bark / dialogue responses, and floating chat callout bubbles.
 */

import {
    CHECKPOINTS,
    FINISH_Z,
    distXZ,
    dist3,
    clamp,
    steadyStateSpeed,
    watercraftThrust,
    PHYSICS,
    PLAYER,
    BOT,
    leadPlayer,
    rearPlayer,
    alivePlayers,
} from './game-core.js';

/**
 * Command IDs and numerical bindings (Keys 1-4)
 */
export const BOT_COMMAND_IDS = {
    FORM_UP: 'form-up',
    FOCUS_FIRE: 'focus-fire',
    SCAVENGE: 'scavenge',
    RUSH_CHECKPOINT: 'rush-checkpoint',
};

export const BOT_COMMAND_KEYS = {
    '1': BOT_COMMAND_IDS.FORM_UP,
    '2': BOT_COMMAND_IDS.FOCUS_FIRE,
    '3': BOT_COMMAND_IDS.SCAVENGE,
    '4': BOT_COMMAND_IDS.RUSH_CHECKPOINT,
};

/**
 * Tactical Order Definitions
 */
export const BOT_ORDER_DEFINITIONS = {
    [BOT_COMMAND_IDS.FORM_UP]: {
        id: BOT_COMMAND_IDS.FORM_UP,
        key: '1',
        title: 'Form Up & Protect Rear',
        shortCode: 'DEFEND',
        icon: '🛡️',
        durationMs: 12000,
        cooldownMs: 3000,
        colorHex: 0x38bdf8, // Sky blue defensive glow
        description: 'Orders AI companion rafts to tighten formation behind the lead raft, parry threats, and guard the rear.',
        barks: {
            ack: [
                'Forming defensive wedge! Watching your six, Captain!',
                'Shields up! Rearguard locked and loaded!',
                'Tightening formation! Nothing touches our stern!',
            ],
            action: [
                'Intercepting rear flanker!',
                'Holding the defensive line!',
                'Brace for impact! Absorbing hit!',
            ],
        },
        formationOffsets: [
            { x: -3.5, z: 3.5 },
            { x: 3.5, z: 3.5 },
            { x: 0.0, z: 6.5 },
        ],
        perks: {
            blockChanceBonus: 0.35,      // Increases block parry chance to ~70%
            attackCooldownMultiplier: 0.9,
            leashRadius: 25,
            formationGrip: 1.5,
        },
    },
    [BOT_COMMAND_IDS.FOCUS_FIRE]: {
        id: BOT_COMMAND_IDS.FOCUS_FIRE,
        key: '2',
        title: 'Focus Fire Boss',
        shortCode: 'ATTACK',
        icon: '⚔️',
        durationMs: 15000,
        cooldownMs: 4000,
        colorHex: 0xef4444, // Fiery red offensive glow
        description: 'Commands all bots to drop minor targets and relentlessly attack the highest-priority boss or major monster.',
        barks: {
            ack: [
                'Target locked! Unleashing everything we got!',
                'Focusing heavy artillery on the big beast!',
                'Boss sighted! War-Mallets primed and swinging!',
            ],
            action: [
                'Smashing the boss weak-point!',
                'Keep the pressure on, team!',
                'All hands strike the beast!',
            ],
        },
        perks: {
            engageRangeBonus: 35,       // Aggro range pushed out to 65m
            speedBoostMultiplier: 1.15, // +15% sprint toward boss
            attackCooldownMultiplier: 0.75, // Swings 25% faster
            blockChanceBonus: -0.10,    // Berserk aggression reduces blocking
        },
    },
    [BOT_COMMAND_IDS.SCAVENGE]: {
        id: BOT_COMMAND_IDS.SCAVENGE,
        key: '3',
        title: 'Spread Out & Scavenge Coins',
        shortCode: 'SCAVENGE',
        icon: '🪙',
        durationMs: 14000,
        cooldownMs: 3000,
        colorHex: 0xfacc15, // Amber gold coin shimmer
        description: 'Bots fan wide across the river channel to gather gold coins, crates, and power weapon drops.',
        barks: {
            ack: [
                'Fanning out for plunder! Looting river spoils!',
                'Spreading wide! Securing shiny gold and gear!',
                'Treasure sweep initiated! Keep the boat steady!',
            ],
            action: [
                'Snagged a prize from the current!',
                'Coins secured for the crew chest!',
                'Power weapon picked up! Ready for battle!',
            ],
        },
        spreadOffsetsX: [-11.0, 11.0, 0.0],
        perks: {
            pickupSearchRadius: 40,
            lootGreedMultiplier: 2.0,
            channelSpreadWeight: 1.4,
        },
    },
    [BOT_COMMAND_IDS.RUSH_CHECKPOINT]: {
        id: BOT_COMMAND_IDS.RUSH_CHECKPOINT,
        key: '4',
        title: 'Rush Next Checkpoint',
        shortCode: 'RUSH',
        icon: '⚡',
        durationMs: 16000,
        cooldownMs: 5000,
        colorHex: 0x10b981, // Emerald green checkpoint flare
        description: 'All bots enter overdrive paddling, ignoring stragglers to cross the upcoming checkpoint gate and revive fallen crew.',
        barks: {
            ack: [
                'Checkpoint sprint! Row with everything you got!',
                'Full speed ahead! Reaching that green gate!',
                'Pushing downriver! Revive is just ahead!',
            ],
            action: [
                'Passing the checkpoint arch!',
                'Gate reached! Crew revives active!',
                'Keep the momentum rolling!',
            ],
        },
        perks: {
            speedBoostMultiplier: 1.25, // +25% sprint thrust
            ignoreDisengagements: true,
            checkpointPriorityWeight: 3.0,
        },
    },
};

/**
 * Normalizes input key or command identifier into a canonical command definition.
 *
 * @param {string|number} keyOrId
 * @returns {object|null} Command definition or null if not recognized
 */
export function getBotOrderDefinition(keyOrId) {
    if (keyOrId === null || keyOrId === undefined) return null;
    const str = String(keyOrId).trim().toLowerCase();
    if (BOT_COMMAND_KEYS[str]) {
        return BOT_ORDER_DEFINITIONS[BOT_COMMAND_KEYS[str]];
    }
    for (const def of Object.values(BOT_ORDER_DEFINITIONS)) {
        if (def.id.toLowerCase() === str || def.shortCode.toLowerCase() === str) {
            return def;
        }
    }
    return null;
}

/**
 * Creates a fresh tactical order manager state.
 */
export function createBotOrderState() {
    return {
        activeOrder: null,
        history: [],
        cooldowns: {}, // commandId -> timestamp ms
        bubbles: [],   // Active floating chat bubbles
        bubbleCounter: 0,
    };
}

/**
 * Creates a floating chat callout bubble descriptor.
 */
export function createCalloutBubble({
    id,
    speakerId,
    speakerName,
    text,
    position = { x: 0, y: 1.8, z: 0 },
    commandId = null,
    colorHex = 0xffffff,
    durationMs = 3500,
    createdAt = 0,
}) {
    return {
        id: id || `bubble_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        speakerId,
        speakerName,
        text,
        position: { x: position.x, y: position.y, z: position.z },
        commandId,
        colorHex,
        durationMs,
        createdAt,
        expiresAt: createdAt + durationMs,
    };
}

/**
 * Evaluates whether a bubble is still visible and active at timestamp `now`.
 */
export function isBubbleActive(bubble, now = 0) {
    return bubble && now < bubble.expiresAt;
}

/**
 * Calculates visual fade opacity for a floating bubble:
 * Fast pop-in (first 200ms), solid hold, and smooth fade-out (last 600ms).
 */
export function getBubbleOpacity(bubble, now = 0) {
    if (!bubble) return 0;
    const elapsed = now - bubble.createdAt;
    const remaining = bubble.expiresAt - now;
    if (elapsed < 0 || remaining <= 0) return 0;

    const FADE_IN_MS = 200;
    const FADE_OUT_MS = 600;

    if (elapsed < FADE_IN_MS) {
        return clamp(elapsed / FADE_IN_MS, 0, 1);
    }
    if (remaining < FADE_OUT_MS) {
        return clamp(remaining / FADE_OUT_MS, 0, 1);
    }
    return 1.0;
}

/**
 * Computes bubble 3D bobbing floating offset above the raft.
 */
export function getBubbleFloatingY(bubble, now = 0, baseElevation = 2.4) {
    if (!bubble) return baseElevation;
    const elapsed = (now - bubble.createdAt) * 0.001; // seconds
    const bob = Math.sin(elapsed * 3.5) * 0.08;
    return (bubble.position.y || 0) + baseElevation + bob;
}

/**
 * Selects deterministic or indexed verbal dialogue bark for a command.
 */
export function getBotOrderBark(commandId, botIndex = 0, isAction = false) {
    const def = getBotOrderDefinition(commandId);
    if (!def) return 'Roger that, Captain!';
    const pool = isAction ? def.barks.action : def.barks.ack;
    const idx = Math.abs(botIndex) % pool.length;
    return pool[idx];
}

/**
 * Issues a tactical order from a commanding player to companion bots.
 *
 * @param {object} orderState - Tactical order manager state.
 * @param {string|number} commandKeyOrId - Command key ('1'-'4') or id ('form-up').
 * @param {object} issuer - Player issuing command (usually the human leader).
 * @param {Array<object>} bots - Array of companion bot player objects.
 * @param {number} [now=0] - Current simulation timestamp.
 * @returns {object} Result containing success flag, activeOrder, and newly spawned chat bubbles.
 */
export function issueBotOrder(orderState, commandKeyOrId, issuer, bots = [], now = 0) {
    const def = getBotOrderDefinition(commandKeyOrId);
    if (!def) {
        return { success: false, reason: 'unknown-command', bubbles: [] };
    }

    // Check cooldown
    const lastIssued = orderState.cooldowns[def.id] || -Infinity;
    if (now - lastIssued < def.cooldownMs) {
        const remainingCooldown = def.cooldownMs - (now - lastIssued);
        return { success: false, reason: 'cooldown-active', remainingCooldown, bubbles: [] };
    }

    // Update cooldown
    orderState.cooldowns[def.id] = now;

    // Build order record
    const activeOrder = {
        id: def.id,
        key: def.key,
        title: def.title,
        issuedBy: issuer ? issuer.id : 'captain',
        issuedAt: now,
        durationMs: def.durationMs,
        expiresAt: now + def.durationMs,
        colorHex: def.colorHex,
        definition: def,
    };
    orderState.activeOrder = activeOrder;
    orderState.history.push({ ...activeOrder });

    const newBubbles = [];

    // 1. Leader Callout Bubble
    if (issuer) {
        const leaderBubble = createCalloutBubble({
            id: `bubble_${orderState.bubbleCounter++}`,
            speakerId: issuer.id,
            speakerName: issuer.name || 'Captain',
            text: `${def.icon} ${def.title}!`,
            position: issuer.position || { x: 0, y: 0.25, z: 0 },
            commandId: def.id,
            colorHex: def.colorHex,
            durationMs: 3800,
            createdAt: now,
        });
        newBubbles.push(leaderBubble);
        orderState.bubbles.push(leaderBubble);
    }

    // 2. Companion Bot Acknowledgment Chat Bubbles
    const aliveBots = (bots || []).filter((b) => b && !b.isDead);
    aliveBots.forEach((bot, idx) => {
        const barkText = getBotOrderBark(def.id, bot.botIndex !== undefined ? bot.botIndex : idx, false);
        const botBubble = createCalloutBubble({
            id: `bubble_${orderState.bubbleCounter++}`,
            speakerId: bot.id,
            speakerName: bot.name || `Bot ${idx + 1}`,
            text: barkText,
            position: bot.position || { x: 0, y: 0.25, z: 0 },
            commandId: def.id,
            colorHex: bot.color || def.colorHex,
            durationMs: 3400,
            createdAt: now + 150 + idx * 100, // Staggered vocal responses
        });
        newBubbles.push(botBubble);
        orderState.bubbles.push(botBubble);
    });

    return {
        success: true,
        order: activeOrder,
        bubbles: newBubbles,
    };
}

/**
 * Ticks tactical order state: purges expired bubbles, checks order timeouts, and updates bubble positions.
 */
export function updateBotOrderState(orderState, players = {}, now = 0) {
    if (!orderState) return;

    // Check if active order has expired
    if (orderState.activeOrder && now >= orderState.activeOrder.expiresAt) {
        orderState.activeOrder = null;
    }

    // Update bubble positions tracking their speaker rafts
    for (let i = 0; i < orderState.bubbles.length; i++) {
        const b = orderState.bubbles[i];
        if (players[b.speakerId] && players[b.speakerId].position) {
            b.position.x = players[b.speakerId].position.x;
            b.position.y = players[b.speakerId].position.y;
            b.position.z = players[b.speakerId].position.z;
        }
    }

    // Purge expired bubbles
    orderState.bubbles = orderState.bubbles.filter((b) => now < b.expiresAt);
}

/**
 * Identifies the priority boss or toughest enemy in the scene.
 * Prioritizes Final Boss Kraken, then Long Worm, then Mud Alien, then White Guy.
 */
export function findPriorityBoss(enemies = {}) {
    const list = Object.values(enemies).filter((e) => e && e.health > 0);
    if (list.length === 0) return null;

    // Priority ranking by threat
    const rank = (e) => {
        if (e.id === 'kraken' || e.type === 'kraken') return 100;
        if (e.type === 'longWorm') return 80;
        if (e.type === 'mudAlien') return 60;
        if (e.type === 'whiteGuy') return 40;
        return e.maxHealth || 10;
    };

    return list.reduce((best, curr) => (!best || rank(curr) > rank(best) ? curr : best), null);
}

/**
 * Finds the closest upcoming checkpoint gate downriver from position `pos`.
 */
export function findUpcomingCheckpointZ(pos) {
    for (let i = 0; i < CHECKPOINTS.length; i++) {
        const cp = CHECKPOINTS[i];
        if (pos.z > cp) {
            return cp;
        }
    }
    return FINISH_Z;
}

/**
 * Finds the closest active collectible (coin or chest or weapon) in range.
 */
export function findNearbyScavengeTarget(botPos, lootPickups = [], searchRadius = 40) {
    if (!Array.isArray(lootPickups) || lootPickups.length === 0) return null;
    let closest = null;
    let closestDist = Infinity;

    for (let i = 0; i < lootPickups.length; i++) {
        const item = lootPickups[i];
        if (item.collected) continue;
        const d = distXZ(botPos, item.position);
        if (d <= searchRadius && d < closestDist) {
            closest = item;
            closestDist = d;
        }
    }
    return closest;
}

/**
 * Computes tactical override decision for an AI bot given active orders.
 * Seamlessly modifies or enhances standard `botDecide(state, bot)` logic.
 *
 * @param {object} state - Game state from game-core.
 * @param {object} bot - Bot player object.
 * @param {object|null} activeOrder - Currently active tactical order (or orderState.activeOrder).
 * @param {Array<object>} [lootPickups=[]] - Optional array of active loot pickups.
 * @returns {object|null} Tactical decision override, or null to follow standard bot AI.
 */
export function decideTacticalBotOrder(state, bot, activeOrder, lootPickups = []) {
    if (!bot || bot.isDead || state.gameWon || !activeOrder) {
        return null;
    }

    const leader = leadPlayer(alivePlayers(state).filter((p) => !p.isBot));
    const def = activeOrder.definition || getBotOrderDefinition(activeOrder.id);
    if (!def) return null;

    switch (def.id) {
        // =====================================================================
        // ORDER 1: FORM UP & PROTECT REAR
        // Tight defensive wedge behind the leader, intercepting rear threats
        // =====================================================================
        case BOT_COMMAND_IDS.FORM_UP: {
            const slot = def.formationOffsets[bot.botIndex % def.formationOffsets.length];
            const anchorZ = leader ? leader.position.z : bot.position.z;
            const anchorX = leader ? leader.position.x : 0;
            const target = {
                x: clamp(anchorX + slot.x, -BOT.xLimit, BOT.xLimit),
                z: anchorZ + slot.z,
            };

            // Rearguard protection: if an enemy is threatening the rear within 20m, prioritize parrying it
            const rearEnemy = Object.values(state.enemies).find(
                (e) => e && e.health > 0 && e.position.z > (leader ? leader.position.z : bot.position.z) && distXZ(bot.position, e.position) < 20
            );

            return {
                mode: 'order-form-up',
                commandId: def.id,
                target: rearEnemy ? rearEnemy.position : target,
                enemyId: rearEnemy ? rearEnemy.id : null,
                isDefendingRear: !!rearEnemy,
                blockChanceMultiplier: 1.0 + (def.perks.blockChanceBonus || 0.35),
                speedBoost: 1.0,
            };
        }

        // =====================================================================
        // ORDER 2: FOCUS FIRE BOSS
        // Drop minor skirmishes and swarm the priority boss / heaviest enemy
        // =====================================================================
        case BOT_COMMAND_IDS.FOCUS_FIRE: {
            const boss = findPriorityBoss(state.enemies);
            if (boss) {
                const d = distXZ(bot.position, boss.position);
                return {
                    mode: 'order-focus-fire',
                    commandId: def.id,
                    target: boss.position,
                    enemyId: boss.id,
                    distance: d,
                    speedBoost: def.perks.speedBoostMultiplier || 1.15,
                    attackCooldownMultiplier: def.perks.attackCooldownMultiplier || 0.75,
                };
            }
            // If no boss is alive, fallback to standard behavior
            return null;
        }

        // =====================================================================
        // ORDER 3: SPREAD OUT & SCAVENGE COINS
        // Sweep lateral lanes and seek nearby coins / power weapon crates
        // =====================================================================
        case BOT_COMMAND_IDS.SCAVENGE: {
            // First check for active nearby loot pickups
            const item = findNearbyScavengeTarget(bot.position, lootPickups, def.perks.pickupSearchRadius || 40);
            if (item) {
                return {
                    mode: 'order-scavenge',
                    commandId: def.id,
                    target: { x: item.position.x, z: item.position.z },
                    pickupId: item.id,
                    isCollectingLoot: true,
                    speedBoost: 1.05,
                };
            }

            // Otherwise, spread out into lateral river lanes ahead of the bot
            const spreadX = def.spreadOffsetsX[bot.botIndex % def.spreadOffsetsX.length];
            const anchorZ = leader ? leader.position.z : bot.position.z;
            return {
                mode: 'order-scavenge-lane',
                commandId: def.id,
                target: {
                    x: clamp(spreadX, -BOT.xLimit, BOT.xLimit),
                    z: anchorZ - 10,
                },
                isCollectingLoot: false,
                speedBoost: 1.0,
            };
        }

        // =====================================================================
        // ORDER 4: RUSH NEXT CHECKPOINT
        // Max paddle thrust straight toward the upcoming checkpoint gate
        // =====================================================================
        case BOT_COMMAND_IDS.RUSH_CHECKPOINT: {
            const targetZ = findUpcomingCheckpointZ(bot.position);
            // Lateral position tracks mid-channel with small offset per bot
            const laneOffset = ((bot.botIndex || 0) - 1) * 3.5;
            return {
                mode: 'order-rush-checkpoint',
                commandId: def.id,
                target: {
                    x: clamp(laneOffset, -BOT.xLimit, BOT.xLimit),
                    z: targetZ - 5,
                },
                targetCheckpointZ: targetZ,
                speedBoost: def.perks.speedBoostMultiplier || 1.25,
            };
        }

        default:
            return null;
    }
}

/**
 * Calculates modified bot paddle speed considering active tactical order.
 */
export function calculateTacticalBotSpeed(bot, activeOrder) {
    const baseSpeed = steadyStateSpeed(watercraftThrust({ w: true }, bot.upgrades || []) + PHYSICS.baseCurrent);
    if (!activeOrder) return baseSpeed;
    const def = activeOrder.definition || getBotOrderDefinition(activeOrder.id);
    if (!def || !def.perks || !def.perks.speedBoostMultiplier) return baseSpeed;
    return baseSpeed * def.perks.speedBoostMultiplier;
}

/**
 * Calculates modified bot block chance considering active tactical order.
 */
export function calculateTacticalBotBlockChance(bot, activeOrder, baseChance = BOT.blockChance) {
    if (!activeOrder) return baseChance;
    const def = activeOrder.definition || getBotOrderDefinition(activeOrder.id);
    if (!def || !def.perks || def.perks.blockChanceBonus === undefined) return baseChance;
    return clamp(baseChance + def.perks.blockChanceBonus, 0.05, 0.95);
}

/**
 * Tactical Voice-Wheel Menu item descriptor helper for HUD rendering.
 */
export function getTacticalWheelItems() {
    return [
        {
            key: '1',
            id: BOT_COMMAND_IDS.FORM_UP,
            label: 'Form Up & Protect Rear',
            icon: '🛡️',
            colorHex: 0x38bdf8,
            colorCss: '#38bdf8',
            angleDeg: 0,
            angleRad: 0,
        },
        {
            key: '2',
            id: BOT_COMMAND_IDS.FOCUS_FIRE,
            label: 'Focus Fire Boss',
            icon: '⚔️',
            colorHex: 0xef4444,
            colorCss: '#ef4444',
            angleDeg: 90,
            angleRad: Math.PI * 0.5,
        },
        {
            key: '3',
            id: BOT_COMMAND_IDS.SCAVENGE,
            label: 'Spread Out & Scavenge Coins',
            icon: '🪙',
            colorHex: 0xfacc15,
            colorCss: '#facc15',
            angleDeg: 180,
            angleRad: Math.PI,
        },
        {
            key: '4',
            id: BOT_COMMAND_IDS.RUSH_CHECKPOINT,
            label: 'Rush Next Checkpoint',
            icon: '⚡',
            colorHex: 0x10b981,
            colorCss: '#10b981',
            angleDeg: 270,
            angleRad: Math.PI * 1.5,
        },
    ];
}
