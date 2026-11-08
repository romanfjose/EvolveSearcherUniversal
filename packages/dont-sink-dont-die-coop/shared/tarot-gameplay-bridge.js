/**
 * Don't Sink, Don't Die — Dream Tarot Checkpoint Draft & Live Multipliers Bridge
 *
 * Sovereign Core & Videogame Helmet 03 Directive:
 * - Pure, deterministic checkpoint blessing grantor and live gameplay modifier evaluator.
 * - Bridges checkpoint cross events to active gameplay modifiers with zero external dependencies.
 */

import {
    TAROT_CARD_IDS,
    TAROT_CARDS,
    createTarotDraftSession,
    applyTarotBlessing,
} from './dream-tarot.js';

/**
 * Grants a Dream Tarot blessing at a river checkpoint, updating equipped cards and stack counts.
 *
 * @param {object} tarotState - Player tarot state container.
 * @param {number} [checkpointZ=0] - Negative z-coordinate of checkpoint.
 * @param {number} [checkpointIdx=0] - Checkpoint index (0, 1, 2...).
 * @param {number} [seed=1337] - Seed integer for deterministic card draft dealing.
 * @param {number} [nowMs=0] - Timestamp in ms.
 * @returns {object} { granted: true, card: object, totalEquipped: number }
 */
export function grantCheckpointTarotBlessing(tarotState, checkpointZ = 0, checkpointIdx = 0, seed = 1337, nowMs = 0) {
    if (!tarotState || typeof tarotState !== 'object') {
        throw new TypeError('tarotState must be an object');
    }

    if (!Array.isArray(tarotState.equippedCards)) {
        tarotState.equippedCards = [];
    }
    if (!tarotState.stacks || typeof tarotState.stacks !== 'object') {
        tarotState.stacks = {};
    }
    if (!tarotState.blessings || typeof tarotState.blessings !== 'object') {
        tarotState.blessings = {};
    }

    const session = createTarotDraftSession({
        checkpointIndex: (checkpointIdx + 1) * 2,
        seed: seed + checkpointIdx * 31,
        startTimeMs: nowMs,
    });

    const chosen = session.cards[0];
    applyTarotBlessing(tarotState, chosen.id, nowMs);

    tarotState.equippedCards.push(chosen);
    tarotState.stacks[chosen.id] = (tarotState.stacks[chosen.id] || 0) + 1;

    return {
        granted: true,
        card: chosen,
        totalEquipped: tarotState.equippedCards.length,
    };
}

/**
 * Resolves the stack count for a given tarot card ID from tarotState.
 * Checks tarotState.stacks, tarotState.equippedCards, and tarotState.blessings.
 *
 * @param {object} tarotState - Player tarot state.
 * @param {string} cardId - Tarot card ID.
 * @returns {number} Non-negative integer stack count.
 */
function resolveCardStacks(tarotState, cardId) {
    if (!tarotState) return 0;

    if (tarotState.stacks && typeof tarotState.stacks[cardId] === 'number') {
        return Math.max(0, tarotState.stacks[cardId]);
    }

    if (Array.isArray(tarotState.equippedCards) && tarotState.equippedCards.length > 0) {
        let count = 0;
        for (const item of tarotState.equippedCards) {
            const id = typeof item === 'string' ? item : item?.id;
            if (id === cardId) {
                count += 1;
            }
        }
        if (count > 0) return count;
    }

    if (tarotState.blessings?.[cardId]?.count) {
        return Math.max(0, tarotState.blessings[cardId].count);
    }

    return 0;
}

/**
 * Computes live gameplay modifiers from active Dream Tarot blessing stacks.
 *
 * @param {object} tarotState - Player tarot state.
 * @returns {object} Live multipliers and mechanic flags:
 *   - oarThrustMultiplier: number (1 + 0.25 * stacks['caffeinated-oars'])
 *   - oarCadenceMultiplier: number (1 + 0.20 * stacks['caffeinated-oars'])
 *   - hasSqueakyOverdrive: boolean (every 3rd hit triggers 45 AoE shockwave damage)
 *   - hasHeavyPocketAnvil: boolean (landing from air deals 60 AoE slam damage within 6.5m)
 *   - reversePsychologyCoinsOnBlock: number (8 * stacks['reverse-psychology'])
 *   - magnetRadius: number (14 * stacks['plank-magnetism'])
 */
export function computeTarotLiveModifiers(tarotState) {
    const caffeinatedStacks = resolveCardStacks(tarotState, TAROT_CARD_IDS.CAFFEINATED_OARS);
    const squeakyStacks = resolveCardStacks(tarotState, TAROT_CARD_IDS.SQUEAKY_OVERDRIVE);
    const anvilStacks = resolveCardStacks(tarotState, TAROT_CARD_IDS.HEAVY_POCKET_ANVIL);
    const reversePsychologyStacks = resolveCardStacks(tarotState, TAROT_CARD_IDS.REVERSE_PSYCHOLOGY);
    const magnetStacks = resolveCardStacks(tarotState, TAROT_CARD_IDS.PLANK_MAGNETISM);

    return {
        oarThrustMultiplier: 1 + 0.25 * caffeinatedStacks,
        oarCadenceMultiplier: 1 + 0.20 * caffeinatedStacks,
        hasSqueakyOverdrive: squeakyStacks > 0,
        hasHeavyPocketAnvil: anvilStacks > 0,
        reversePsychologyCoinsOnBlock: 8 * reversePsychologyStacks,
        magnetRadius: 14 * magnetStacks,
    };
}
