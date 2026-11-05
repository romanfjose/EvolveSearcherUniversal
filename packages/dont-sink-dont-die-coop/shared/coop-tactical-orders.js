/**
 * Don't Sink, Don't Die — Tactical Co-Op Order & Platform Target Selector
 * (`shared/coop-tactical-orders.js`)
 *
 * Sovereign Core & Helmet 02 Architecture (The RTS Flight Engineer):
 * - Pure, deterministic tactical command & coordinate resolution engine.
 * - Enables explicit co-op order issuance via [Z]/[X]/[C]/[V] hotkeys:
 *     [Z] Dock at Nearest Platform
 *     [X] Hold Position / Anchor Here
 *     [C] Meet at Harbor Shop
 *     [V] Focus Boss
 * - Calculates target waypoints, arrival thresholds, docking anchors, and combat steering.
 * - Zero timers, zero I/O, zero global leaks, and zero external dependencies.
 */

import {
    clamp,
    distXZ,
    SHOP_ZONE,
} from './game-core.js';

/**
 * Canonical Co-op Tactical Order Definitions and Hotkey Mappings ([Z]/[X]/[C]/[V])
 */
export const COOP_ORDERS = Object.freeze({
    DOCK_PLATFORM: {
        id: 'dock-platform',
        key: 'Z',
        code: 'KeyZ',
        title: 'Dock at Nearest Platform',
        shortCode: 'DOCK',
        icon: '⚓',
        colorHex: 0x10b981, // Emerald green safe haven
        colorCss: '#10b981',
        description: 'Commands companion bots and crewmates to navigate to and moor at the nearest sanctuary platform.',
        durationMs: 18000,
        cooldownMs: 3000,
        arrivalDistance: 4.5,
        barks: {
            ack: [
                'Setting course for the dock platform!',
                'Aye! Moving to secure safe mooring!',
                'Platform spotted! Heading in to dock!',
            ],
            action: [
                'Tying off ropes at the bollard!',
                'Moored safely at the platform!',
            ],
        },
    },
    HOLD_POSITION: {
        id: 'hold-position',
        key: 'X',
        code: 'KeyX',
        title: 'Hold Position / Anchor Here',
        shortCode: 'HOLD',
        icon: '🛑',
        colorHex: 0x38bdf8, // Sky blue brake / steady
        colorCss: '#38bdf8',
        description: 'Orders companion rafts to drop anchor, cut thrust, and hold their current river coordinates.',
        durationMs: 15000,
        cooldownMs: 2500,
        arrivalDistance: 3.0,
        barks: {
            ack: [
                'Dropping anchor! Holding position here!',
                'Braking hard! Holding the line!',
                'Paddles up! Anchoring on your mark!',
            ],
            action: [
                'Anchor set! Raft stationary!',
                'Holding coordinates steady!',
            ],
        },
    },
    MEET_SHOP: {
        id: 'meet-shop',
        key: 'C',
        code: 'KeyC',
        title: 'Meet at Harbor Shop',
        shortCode: 'SHOP',
        icon: '🏪',
        colorHex: 0xfacc15, // Amber gold commerce
        colorCss: '#facc15',
        description: 'Rallies all crew to converge on the Harbor City Armory Shop dock to gear up.',
        durationMs: 20000,
        cooldownMs: 4000,
        arrivalDistance: 6.0,
        barks: {
            ack: [
                'Rallying at the Harbor Shop wharf!',
                'Heading to drydock! Time to upgrade our gear!',
                'Rendezvous at the shop! Moving out!',
            ],
            action: [
                'Arrived at the shop wharf!',
                'Browsing armory wares!',
            ],
        },
    },
    FOCUS_BOSS: {
        id: 'focus-boss',
        key: 'V',
        code: 'KeyV',
        title: 'Focus Boss',
        shortCode: 'BOSS',
        icon: '⚔️',
        durationMs: 16000,
        cooldownMs: 3500,
        colorHex: 0xef4444, // Crimson red aggressive attack
        colorCss: '#ef4444',
        description: 'Commands all crew to swarm the highest-priority boss or elite monster with heavy attacks.',
        arrivalDistance: 5.0,
        barks: {
            ack: [
                'Focusing all firepower on the boss!',
                'Target locked! Swarming the beast!',
                'War-mallets ready! Striking the monster!',
            ],
            action: [
                'Pounding the boss weak-point!',
                'Keeping the pressure on the beast!',
            ],
        },
    },
});

/**
 * Normalized lookup table for matching key, code, or order id.
 */
export const COOP_ORDER_LOOKUP = Object.freeze({
    // Hotkeys (Upper and lower)
    'z': COOP_ORDERS.DOCK_PLATFORM,
    'x': COOP_ORDERS.HOLD_POSITION,
    'c': COOP_ORDERS.MEET_SHOP,
    'v': COOP_ORDERS.FOCUS_BOSS,
    'KeyZ': COOP_ORDERS.DOCK_PLATFORM,
    'KeyX': COOP_ORDERS.HOLD_POSITION,
    'KeyC': COOP_ORDERS.MEET_SHOP,
    'KeyV': COOP_ORDERS.FOCUS_BOSS,
    // Order IDs
    'dock-platform': COOP_ORDERS.DOCK_PLATFORM,
    'hold-position': COOP_ORDERS.HOLD_POSITION,
    'meet-shop': COOP_ORDERS.MEET_SHOP,
    'focus-boss': COOP_ORDERS.FOCUS_BOSS,
    // ShortCodes
    'dock': COOP_ORDERS.DOCK_PLATFORM,
    'hold': COOP_ORDERS.HOLD_POSITION,
    'shop': COOP_ORDERS.MEET_SHOP,
    'boss': COOP_ORDERS.FOCUS_BOSS,
});

/**
 * Normalizes input key or command identifier into a canonical COOP_ORDERS definition.
 *
 * @param {string} orderTypeOrKey
 * @returns {object|null}
 */
export function getTacticalOrderDefinition(orderTypeOrKey) {
    if (!orderTypeOrKey) return null;
    const str = String(orderTypeOrKey).trim();
    if (COOP_ORDER_LOOKUP[str]) return COOP_ORDER_LOOKUP[str];
    if (COOP_ORDER_LOOKUP[str.toLowerCase()]) return COOP_ORDER_LOOKUP[str.toLowerCase()];
    for (const def of Object.values(COOP_ORDERS)) {
        if (def.id === str || def.key === str || def.shortCode === str) {
            return def;
        }
    }
    return null;
}

/**
 * Extracts a normalized 3D/2D point from any position representation.
 * @param {object} entity
 * @returns {{x: number, y: number, z: number}}
 */
function extractPosition(entity) {
    if (!entity) return { x: 0, y: 0, z: 0 };
    if (entity.position && typeof entity.position === 'object') {
        return {
            x: Number(entity.position.x) || 0,
            y: Number(entity.position.y) || 0,
            z: Number(entity.position.z) || 0,
        };
    }
    return {
        x: Number(entity.x) || 0,
        y: Number(entity.y) || 0,
        z: Number(entity.z) || 0,
    };
}

/**
 * Finds the nearest sanctuary platform relative to a reference position.
 * Prioritizes platforms downriver or in closest proximity.
 *
 * @param {{x: number, y?: number, z: number}} refPos
 * @param {Array<object>} platforms
 * @returns {object|null}
 */
export function findNearestPlatform(refPos, platforms = []) {
    if (!Array.isArray(platforms) || platforms.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    for (let i = 0; i < platforms.length; i++) {
        const plat = platforms[i];
        if (!plat) continue;
        const platPos = extractPosition(plat);

        // Distance in XZ plane
        const dist = distXZ(refPos, platPos);

        // Small downriver bias (ahead along negative z is slightly preferred over behind)
        const isAhead = platPos.z <= refPos.z;
        const weightedDist = isAhead ? dist * 0.85 : dist * 1.25;

        if (weightedDist < minDistance) {
            minDistance = weightedDist;
            nearest = plat;
        }
    }

    return nearest;
}

/**
 * Default Harbor City Shop anchor coordinate (center of harbor dock).
 */
export const DEFAULT_SHOP_COORDINATE = Object.freeze({
    x: 12.0,
    y: 0.25,
    z: ((SHOP_ZONE?.minZ ?? -250) + (SHOP_ZONE?.maxZ ?? -150)) * 0.5, // -200
});

/**
 * Resolves the primary boss or strongest enemy from a list or dictionary.
 *
 * @param {object|Array} enemies
 * @returns {object|null}
 */
export function findTacticalBossTarget(enemies) {
    if (!enemies) return null;
    const list = Array.isArray(enemies) ? enemies : Object.values(enemies);
    const active = list.filter((e) => e && !e.isDead && (e.health === undefined || e.health > 0));
    if (active.length === 0) return null;

    const rank = (e) => {
        if (e.id === 'kraken' || e.type === 'kraken') return 100;
        if (e.type === 'longWorm') return 80;
        if (e.type === 'mudAlien') return 60;
        if (e.type === 'whiteGuy') return 40;
        return e.maxHealth || e.health || 10;
    };

    return active.reduce((best, curr) => (!best || rank(curr) > rank(best) ? curr : best), null);
}

/**
 * Issues an explicit Tactical Co-Op Order.
 *
 * @param {object} params
 * @param {object} [params.issuer] - Commanding player / raft object
 * @param {string} params.orderType - Order identifier or hotkey ('Z', 'X', 'C', 'V', 'dock-platform', etc.)
 * @param {Array<object>} [params.platforms=[]] - Available sanctuary platforms along the river
 * @param {number|object} [params.zShop] - Harbor Shop Z position or full coordinate object
 * @param {object|Array} [params.enemies] - Optional enemy table/array for FOCUS_BOSS
 * @param {number} [params.now] - Current simulation timestamp in ms
 * @returns {object} Formatted tactical order record
 */
export function issueTacticalOrder({
    issuer = null,
    orderType,
    platforms = [],
    zShop = null,
    enemies = null,
    now = 0,
} = {}) {
    const def = getTacticalOrderDefinition(orderType);
    if (!def) {
        return {
            success: false,
            reason: 'unknown-order-type',
            order: null,
        };
    }

    const issuerPos = extractPosition(issuer);
    const issuerId = issuer?.id || 'player';
    const issuerName = issuer?.name || 'Leader';

    let targetPlatform = null;
    let targetPosition = null;
    let targetEnemy = null;
    let holdPosition = null;

    // Resolve specific targets according to order type
    switch (def.id) {
        case COOP_ORDERS.DOCK_PLATFORM.id: {
            targetPlatform = findNearestPlatform(issuerPos, platforms);
            if (targetPlatform) {
                const pPos = extractPosition(targetPlatform);
                targetPosition = {
                    x: pPos.x,
                    y: pPos.y,
                    z: pPos.z,
                    platformId: targetPlatform.id || null,
                };
            } else {
                // Fallback: dock at riverbank edge nearest to issuer
                const bankX = issuerPos.x >= 0 ? 11.5 : -11.5;
                targetPosition = { x: bankX, y: 0.25, z: issuerPos.z - 15.0, fallback: true };
            }
            break;
        }

        case COOP_ORDERS.HOLD_POSITION.id: {
            // Anchor coordinates track the position where the order was issued
            holdPosition = { x: issuerPos.x, y: issuerPos.y, z: issuerPos.z };
            targetPosition = { ...holdPosition };
            break;
        }

        case COOP_ORDERS.MEET_SHOP.id: {
            if (typeof zShop === 'number') {
                targetPosition = { x: DEFAULT_SHOP_COORDINATE.x, y: 0.25, z: zShop };
            } else if (zShop && typeof zShop === 'object') {
                const sPos = extractPosition(zShop);
                targetPosition = { x: sPos.x, y: sPos.y, z: sPos.z };
            } else {
                targetPosition = { ...DEFAULT_SHOP_COORDINATE };
            }
            break;
        }

        case COOP_ORDERS.FOCUS_BOSS.id: {
            targetEnemy = findTacticalBossTarget(enemies);
            if (targetEnemy) {
                const ePos = extractPosition(targetEnemy);
                targetPosition = { x: ePos.x, y: ePos.y, z: ePos.z, enemyId: targetEnemy.id };
            } else {
                // Fallback: look ahead downriver for incoming boss
                targetPosition = { x: 0, y: 0.25, z: issuerPos.z - 45.0, fallback: true };
            }
            break;
        }

        default:
            break;
    }

    const orderRecord = {
        id: `order_${def.id}_${now}_${Math.random().toString(36).slice(2, 7)}`,
        orderType: def.id,
        key: def.key,
        code: def.code,
        title: def.title,
        shortCode: def.shortCode,
        icon: def.icon,
        colorHex: def.colorHex,
        colorCss: def.colorCss,
        issuerId,
        issuerName,
        issuedAt: now,
        expiresAt: now + def.durationMs,
        durationMs: def.durationMs,
        targetPlatform,
        targetPosition,
        targetEnemy,
        holdPosition,
        definition: def,
    };

    return {
        success: true,
        order: orderRecord,
    };
}

/**
 * Checks whether a given tactical order is active and unexpired.
 *
 * @param {object} order
 * @param {number} [now=0]
 * @returns {boolean}
 */
export function isOrderActive(order, now = 0) {
    if (!order || !order.orderType) return false;
    return now < order.expiresAt;
}

/**
 * Resolves an AI companion bot's navigation waypoint, steering direction,
 * and behavioral states given an active tactical co-op order.
 *
 * @param {object} bot - Companion bot player object
 * @param {object|null} activeOrder - Order record issued via issueTacticalOrder
 * @param {object|null} humanPlayer - Commanding human player
 * @param {object} [context={}] - Additional context (current simulation now, enemies, platforms)
 * @returns {object} Tactical bot order target guidance
 */
export function resolveBotOrderTarget(bot, activeOrder, humanPlayer = null, context = {}) {
    if (!bot || bot.isDead) {
        return {
            orderType: 'none',
            active: false,
            target: null,
            steer: 0,
            paddle: false,
            anchor: false,
            isArrived: false,
            shouldDock: false,
            shouldHold: false,
            action: 'dead',
        };
    }

    const now = context.now || 0;
    const botPos = extractPosition(bot);
    const humanPos = extractPosition(humanPlayer);

    // If order has expired or is null, fallback to following human leader
    if (!activeOrder || !isOrderActive(activeOrder, now)) {
        const followX = humanPos.x + ((bot.botIndex || 1) % 2 === 0 ? 3.5 : -3.5);
        const followZ = humanPos.z + 4.0;
        const dx = followX - botPos.x;
        const dist = distXZ(botPos, { x: followX, z: followZ });

        return {
            orderType: 'none',
            active: false,
            target: { x: followX, y: botPos.y, z: followZ },
            steer: Number(clamp(dx * 0.25, -1.0, 1.0).toFixed(4)),
            paddle: dist > 2.0,
            anchor: false,
            isArrived: dist <= 2.5,
            shouldDock: false,
            shouldHold: false,
            action: 'follow_leader',
        };
    }

    const def = activeOrder.definition || getTacticalOrderDefinition(activeOrder.orderType);
    const arrivalRadius = def?.arrivalDistance || 4.5;

    switch (activeOrder.orderType) {
        // =====================================================================
        // ORDER [Z]: DOCK AT NEAREST PLATFORM
        // =====================================================================
        case COOP_ORDERS.DOCK_PLATFORM.id: {
            let platTarget = activeOrder.targetPosition;
            if (!platTarget && context.platforms) {
                const nearest = findNearestPlatform(botPos, context.platforms);
                if (nearest) platTarget = extractPosition(nearest);
            }
            if (!platTarget) {
                platTarget = { x: 10.0, y: 0.25, z: botPos.z - 10.0 };
            }

            // Offset bot parking slots so bots don't occupy the exact same piling
            const botIdx = bot.botIndex !== undefined ? bot.botIndex : 0;
            const parkingOffset = (botIdx + 1) * 2.2;
            const targetX = platTarget.x > 0 ? platTarget.x - parkingOffset * 0.5 : platTarget.x + parkingOffset * 0.5;
            const targetZ = platTarget.z + ((botIdx % 2 === 0) ? -1.0 : 1.0) * 1.5;

            const dist = distXZ(botPos, { x: targetX, z: targetZ });
            const isArrived = dist <= arrivalRadius;

            // When docked, cut paddle thrust and drop anchor
            const paddle = !isArrived;
            const anchor = isArrived;
            const dx = targetX - botPos.x;
            const steer = isArrived ? 0 : Number(clamp(dx * 0.35, -1.0, 1.0).toFixed(4));

            return {
                orderType: activeOrder.orderType,
                active: true,
                orderId: activeOrder.id,
                target: { x: targetX, y: platTarget.y || 0.25, z: targetZ },
                targetPlatform: activeOrder.targetPlatform || null,
                distanceToTarget: Number(dist.toFixed(2)),
                isArrived,
                shouldDock: true,
                shouldHold: isArrived,
                anchor,
                paddle,
                steer,
                speedMultiplier: isArrived ? 0.0 : 1.15,
                action: isArrived ? 'docked_platform' : 'navigating_to_platform',
            };
        }

        // =====================================================================
        // ORDER [X]: HOLD POSITION / ANCHOR HERE
        // =====================================================================
        case COOP_ORDERS.HOLD_POSITION.id: {
            const holdPos = activeOrder.holdPosition || activeOrder.targetPosition || botPos;
            const dist = distXZ(botPos, holdPos);
            const isArrived = dist <= arrivalRadius;

            // Anchor is engaged immediately to halt downstream river drift
            const anchor = true;
            const dx = holdPos.x - botPos.x;
            const dz = holdPos.z - botPos.z;

            // If drifted away, apply corrective counter-steering
            const steer = dist > 1.5 ? Number(clamp(dx * 0.3, -1.0, 1.0).toFixed(4)) : 0;
            const paddle = dist > 3.0 && dz < 0; // Only paddle forward if washed behind hold point

            return {
                orderType: activeOrder.orderType,
                active: true,
                orderId: activeOrder.id,
                target: { x: holdPos.x, y: holdPos.y || 0.25, z: holdPos.z },
                distanceToTarget: Number(dist.toFixed(2)),
                isArrived,
                shouldDock: false,
                shouldHold: true,
                anchor,
                paddle,
                steer,
                speedMultiplier: 0.0,
                action: 'anchored_holding_position',
            };
        }

        // =====================================================================
        // ORDER [C]: MEET AT HARBOR SHOP
        // =====================================================================
        case COOP_ORDERS.MEET_SHOP.id: {
            const shopTarget = activeOrder.targetPosition || DEFAULT_SHOP_COORDINATE;
            // Fan out bots along the wharf (lateral / z offsets)
            const botIdx = bot.botIndex !== undefined ? bot.botIndex : 0;
            const wharfOffsetZ = (botIdx - 0.5) * 4.0;
            const targetX = shopTarget.x;
            const targetZ = shopTarget.z + wharfOffsetZ;

            const dist = distXZ(botPos, { x: targetX, z: targetZ });
            const isArrived = dist <= arrivalRadius;

            const dx = targetX - botPos.x;
            const steer = isArrived ? 0 : Number(clamp(dx * 0.25, -1.0, 1.0).toFixed(4));
            const paddle = !isArrived;
            const anchor = isArrived;

            return {
                orderType: activeOrder.orderType,
                active: true,
                orderId: activeOrder.id,
                target: { x: targetX, y: shopTarget.y || 0.25, z: targetZ },
                distanceToTarget: Number(dist.toFixed(2)),
                isArrived,
                shouldDock: true,
                shouldHold: isArrived,
                anchor,
                paddle,
                steer,
                speedMultiplier: isArrived ? 0.0 : 1.25, // Sprint thrust toward shop
                action: isArrived ? 'moored_at_shop' : 'sprinting_to_shop',
            };
        }

        // =====================================================================
        // ORDER [V]: FOCUS BOSS
        // =====================================================================
        case COOP_ORDERS.FOCUS_BOSS.id: {
            // Check if active target enemy still alive or search anew
            let boss = activeOrder.targetEnemy;
            if ((!boss || boss.health <= 0 || boss.isDead) && context.enemies) {
                boss = findTacticalBossTarget(context.enemies);
            }

            const targetPos = boss ? extractPosition(boss) : (activeOrder.targetPosition || { x: 0, y: 0.25, z: botPos.z - 30.0 });
            const dist = distXZ(botPos, targetPos);
            const inMeleeRange = dist <= arrivalRadius;

            const dx = targetPos.x - botPos.x;
            const steer = Number(clamp(dx * 0.35, -1.0, 1.0).toFixed(4));

            return {
                orderType: activeOrder.orderType,
                active: true,
                orderId: activeOrder.id,
                target: { x: targetPos.x, y: targetPos.y || 0.25, z: targetPos.z },
                targetEnemy: boss || null,
                focusEnemyId: boss?.id || null,
                distanceToTarget: Number(dist.toFixed(2)),
                isArrived: inMeleeRange,
                shouldDock: false,
                shouldHold: false,
                anchor: false,
                paddle: dist > 3.0,
                attack: inMeleeRange,
                steer,
                speedMultiplier: 1.2, // Aggressive boost toward boss
                action: inMeleeRange ? 'attacking_boss' : 'swarming_boss',
            };
        }

        default:
            return {
                orderType: 'unknown',
                active: false,
                target: null,
                steer: 0,
                paddle: false,
                anchor: false,
                isArrived: false,
                shouldDock: false,
                shouldHold: false,
                action: 'idle',
            };
    }
}
