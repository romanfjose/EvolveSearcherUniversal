/**
 * Don't Sink, Don't Die — Tactical Bot Order Keybind & 3D Wingman Formation Bridge
 * (`shared/bot-order-formation-bridge.js`)
 *
 * Sovereign Core & Helmet 02 Architecture (The RTS Flight Engineer):
 * - Bridges input key events (Z/X/C/V hotkeys and 1/2/3/4 numbers) to canonical bot orders.
 * - Dispatches tactical bot orders with zero-chatter, zero-lag, instant responsiveness.
 * - Computes deterministic, bounded 3D wingman formation target waypoints across:
 *     'form-up': Tight rear defensive wedge guarding the leader's stern.
 *     'focus-fire': Intercepts nearest living enemy or charges ahead downriver.
 *     'scavenge': Spreads wide across lateral river channels to scoop up loot.
 *     'rush-checkpoint': Overdrive sprint downriver ahead of the lead raft.
 * - Pure, deterministic calculations with strict input clamping and zero external runtime dependencies.
 */

import {
    BOT_COMMAND_IDS,
    issueBotOrder,
    getBotOrderBark,
} from './bot-orders.js';

/**
 * Keybind-to-command mapping supporting Z/X/C/V hotkeys, digits 1-4,
 * and KeyboardEvent.code strings (case-insensitive).
 */
export const KEY_TO_BOT_ORDER = Object.freeze({
    // Standard Z/X/C/V tactical mappings
    'z': BOT_COMMAND_IDS.FOCUS_FIRE,
    'x': BOT_COMMAND_IDS.FORM_UP,
    'c': BOT_COMMAND_IDS.SCAVENGE,
    'v': BOT_COMMAND_IDS.RUSH_CHECKPOINT,

    'Z': BOT_COMMAND_IDS.FOCUS_FIRE,
    'X': BOT_COMMAND_IDS.FORM_UP,
    'C': BOT_COMMAND_IDS.SCAVENGE,
    'V': BOT_COMMAND_IDS.RUSH_CHECKPOINT,

    'KeyZ': BOT_COMMAND_IDS.FOCUS_FIRE,
    'KeyX': BOT_COMMAND_IDS.FORM_UP,
    'KeyC': BOT_COMMAND_IDS.SCAVENGE,
    'KeyV': BOT_COMMAND_IDS.RUSH_CHECKPOINT,

    // Numerical 1/2/3/4 mappings
    '1': BOT_COMMAND_IDS.FOCUS_FIRE,
    '2': BOT_COMMAND_IDS.FORM_UP,
    '3': BOT_COMMAND_IDS.SCAVENGE,
    '4': BOT_COMMAND_IDS.RUSH_CHECKPOINT,

    'Digit1': BOT_COMMAND_IDS.FOCUS_FIRE,
    'Digit2': BOT_COMMAND_IDS.FORM_UP,
    'Digit3': BOT_COMMAND_IDS.SCAVENGE,
    'Digit4': BOT_COMMAND_IDS.RUSH_CHECKPOINT,
    'Numpad1': BOT_COMMAND_IDS.FOCUS_FIRE,
    'Numpad2': BOT_COMMAND_IDS.FORM_UP,
    'Numpad3': BOT_COMMAND_IDS.SCAVENGE,
    'Numpad4': BOT_COMMAND_IDS.RUSH_CHECKPOINT,
});

/**
 * Normalizes input key and resolves the corresponding BOT_COMMAND_IDS value.
 *
 * @param {string|number} key
 * @returns {string|null} Canonical command ID or null if unmapped
 */
function resolveCommandIdFromKey(key) {
    if (key === null || key === undefined) return null;
    const str = String(key).trim();
    if (KEY_TO_BOT_ORDER[str]) return KEY_TO_BOT_ORDER[str];
    if (KEY_TO_BOT_ORDER[str.toLowerCase()]) return KEY_TO_BOT_ORDER[str.toLowerCase()];
    return null;
}

/**
 * Extracts a normalized 3D/2D point from any position representation.
 *
 * @param {object} pos
 * @returns {{x: number, y: number, z: number}}
 */
function extractPosition(pos) {
    if (!pos) return { x: 0, y: 0, z: 0 };
    if (pos.position && typeof pos.position === 'object') {
        return {
            x: Number(pos.position.x) || 0,
            y: Number(pos.position.y) || 0,
            z: Number(pos.position.z) || 0,
        };
    }
    return {
        x: Number(pos.x) || 0,
        y: Number(pos.y) || 0,
        z: Number(pos.z) || 0,
    };
}

/**
 * Dispatches a tactical bot order using keyboard hotkeys or numerical inputs.
 *
 * @param {object} botOrderState - State created via createBotOrderState()
 * @param {string|number} key - Key string ('z', 'x', 'c', 'v', '1'-'4', etc.)
 * @param {number} [nowMs=0] - Current simulation timestamp in milliseconds
 * @param {object} [options={}] - Execution options
 * @param {boolean} [options.ignoreCooldown=false] - If true, resets cooldown for immediate responsiveness
 * @param {object} [options.issuer=null] - Human player ordering the bots
 * @param {Array<object>} [options.bots=[]] - Companion bot player objects
 * @returns {{ issued: boolean, commandId: string|null, bark: string|null, reason?: string }}
 */
export function dispatchBotOrderByKey(botOrderState, key, nowMs = 0, {
    ignoreCooldown = false,
    issuer = null,
    bots = [],
} = {}) {
    const commandId = resolveCommandIdFromKey(key);
    if (!commandId || !botOrderState) {
        return {
            issued: false,
            commandId: null,
            bark: null,
            reason: 'unmapped-key',
        };
    }

    if (ignoreCooldown && botOrderState.cooldowns) {
        // Clear cooldown record for this command or when switching orders
        delete botOrderState.cooldowns[commandId];
    }

    const result = issueBotOrder(botOrderState, commandId, issuer, bots, nowMs);

    if (result.success) {
        const bark = getBotOrderBark(commandId, 0, false);
        return {
            issued: true,
            commandId,
            bark,
            order: result.order,
            bubbles: result.bubbles,
        };
    }

    return {
        issued: false,
        commandId,
        bark: null,
        reason: result.reason,
        remainingCooldown: result.remainingCooldown,
    };
}

/**
 * Computes deterministic wingman target coordinates for companion bots
 * based on the currently active tactical order.
 *
 * @param {object} params
 * @param {number} [params.botIndex=0] - Zero-based index of the companion bot
 * @param {object} params.playerPos - Leader position { x, y, z }
 * @param {string|null} [params.activeOrderId=null] - Active command ID ('form-up', 'focus-fire', etc.)
 * @param {object|Array} [params.enemies={}] - Current active enemies table or array
 * @param {number} [params.playableHalfWidth=40] - River playable half-width bound (x clamped to [-halfWidth, halfWidth])
 * @returns {{ x: number, z: number, mode: string }}
 */
export function computeWingmanOrderedTarget({
    botIndex = 0,
    playerPos,
    activeOrderId = null,
    enemies = {},
    playableHalfWidth = 40,
} = {}) {
    const lead = extractPosition(playerPos);
    const halfW = Math.max(0, Number(playableHalfWidth) || 40);
    const idx = Math.abs(Number(botIndex) || 0);

    const clampX = (val) => Math.max(-halfW, Math.min(halfW, val));

    switch (activeOrderId) {
        // =====================================================================
        // 'form-up': tight rear defensive wedge
        // x = playerPos.x + (botIndex % 2 === 0 ? -3.2 : 3.2), z = playerPos.z + 3.0
        // =====================================================================
        case BOT_COMMAND_IDS.FORM_UP: {
            const offsetX = (idx % 2 === 0) ? -3.2 : 3.2;
            const targetX = clampX(lead.x + offsetX);
            const targetZ = lead.z + 3.0;
            return {
                x: targetX,
                z: targetZ,
                mode: 'form-up',
            };
        }

        // =====================================================================
        // 'focus-fire': intercepts nearest living enemy or charges ahead
        // =====================================================================
        case BOT_COMMAND_IDS.FOCUS_FIRE: {
            const enemyList = Array.isArray(enemies) ? enemies : Object.values(enemies || {});
            const livingEnemies = enemyList.filter((e) => e && !e.isDead && (e.health === undefined || e.health > 0));

            if (livingEnemies.length > 0) {
                // Find nearest living enemy by Euclidean distance in XZ plane
                let nearest = null;
                let minDistSq = Infinity;

                for (let i = 0; i < livingEnemies.length; i++) {
                    const enemy = livingEnemies[i];
                    const ePos = extractPosition(enemy);
                    const dx = ePos.x - lead.x;
                    const dz = ePos.z - lead.z;
                    const distSq = dx * dx + dz * dz;
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        nearest = ePos;
                    }
                }

                if (nearest) {
                    return {
                        x: clampX(nearest.x),
                        z: nearest.z,
                        mode: 'focus-fire',
                    };
                }
            }

            // Fallback when no living enemies: charge downriver ahead of lead
            return {
                x: clampX(lead.x),
                z: lead.z - 8.5,
                mode: 'focus-fire',
            };
        }

        // =====================================================================
        // 'scavenge': spreads wide across the channel
        // x = botIndex % 2 === 0 ? -16 : 16, z = playerPos.z - 2.0
        // =====================================================================
        case BOT_COMMAND_IDS.SCAVENGE: {
            const spreadX = (idx % 2 === 0) ? -16 : 16;
            return {
                x: clampX(spreadX),
                z: lead.z - 2.0,
                mode: 'scavenge',
            };
        }

        // =====================================================================
        // 'rush-checkpoint': sprints downriver ahead of lead
        // x = playerPos.x + (botIndex % 2 === 0 ? -4.5 : 4.5), z = playerPos.z - 11.0
        // =====================================================================
        case BOT_COMMAND_IDS.RUSH_CHECKPOINT: {
            const offsetX = (idx % 2 === 0) ? -4.5 : 4.5;
            return {
                x: clampX(lead.x + offsetX),
                z: lead.z - 11.0,
                mode: 'rush-checkpoint',
            };
        }

        // Default: follow behind in standard formation
        default: {
            const offsetX = (idx % 2 === 0) ? -3.5 : 3.5;
            return {
                x: clampX(lead.x + offsetX),
                z: lead.z + 4.0,
                mode: 'default',
            };
        }
    }
}
