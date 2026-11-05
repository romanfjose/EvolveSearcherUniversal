/**
 * Don't Sink, Don't Die — 1-Keystroke Tarot Blessing Selection & Pre-Baked Recommendation
 *
 * Sovereign Core & Helmet 01 Directive:
 * - Pre-bake the Checkpoint Dream Tarot draft to v0.8: automatically highlight the highest-synergy
 *   card for the player's current build as "RECOMMENDED [SPACE]".
 * - Instant 1-key drafting via [1], [2], [3], or [Space] in <0.5s without touching the mouse.
 * - Pure, deterministic evaluation of crew class, armory upgrade tier synergies, and active blessings.
 * - Zero external dependencies.
 */

import {
    TAROT_CARD_IDS,
    TAROT_CARDS,
    createTarotDraftSession,
    selectDraftCard,
} from './dream-tarot.js';

export const RECOMMENDED_BADGE_TEXT = 'RECOMMENDED [SPACE]';

/**
 * Base synergy weights by crew class ID.
 * Helmsman: speed & navigation -> Caffeinated Oars (+25% cadence/thrust) & Plank Magnetism.
 * Bruiser: melee & impact -> Squeaky Overdrive (hammer resonance) & Heavy Pocket Anvil (slam AoE).
 * Tinkerer: economy & gadgets -> Plank Magnetism (coin pull) & Diplomatic Immunity (jetski turret support).
 * Mystic: defense & arcane -> Reverse Psychology (Wizard throw block boost) & Diplomatic Immunity.
 */
export const CLASS_TAROT_SYNERGY = {
    helmsman: {
        [TAROT_CARD_IDS.CAFFEINATED_OARS]: 45,
        [TAROT_CARD_IDS.PLANK_MAGNETISM]: 30,
        [TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY]: 20,
        [TAROT_CARD_IDS.REVERSE_PSYCHOLOGY]: 15,
        [TAROT_CARD_IDS.SQUEAKY_OVERDRIVE]: 10,
        [TAROT_CARD_IDS.HEAVY_POCKET_ANVIL]: 10,
    },
    bruiser: {
        [TAROT_CARD_IDS.SQUEAKY_OVERDRIVE]: 50,
        [TAROT_CARD_IDS.HEAVY_POCKET_ANVIL]: 40,
        [TAROT_CARD_IDS.CAFFEINATED_OARS]: 20,
        [TAROT_CARD_IDS.REVERSE_PSYCHOLOGY]: 15,
        [TAROT_CARD_IDS.PLANK_MAGNETISM]: 15,
        [TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY]: 10,
    },
    tinkerer: {
        [TAROT_CARD_IDS.PLANK_MAGNETISM]: 50,
        [TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY]: 35,
        [TAROT_CARD_IDS.CAFFEINATED_OARS]: 25,
        [TAROT_CARD_IDS.REVERSE_PSYCHOLOGY]: 20,
        [TAROT_CARD_IDS.SQUEAKY_OVERDRIVE]: 15,
        [TAROT_CARD_IDS.HEAVY_POCKET_ANVIL]: 10,
    },
    mystic: {
        [TAROT_CARD_IDS.REVERSE_PSYCHOLOGY]: 50,
        [TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY]: 35,
        [TAROT_CARD_IDS.HEAVY_POCKET_ANVIL]: 25,
        [TAROT_CARD_IDS.PLANK_MAGNETISM]: 20,
        [TAROT_CARD_IDS.CAFFEINATED_OARS]: 15,
        [TAROT_CARD_IDS.SQUEAKY_OVERDRIVE]: 10,
    },
};

/**
 * Calculates synergy score for a single tarot card against the player's current build.
 * Factors:
 * 1. Base card baseline score (10).
 * 2. Class synergy bonus (up to +50).
 * 3. Equipment / Armory upgrades bonus:
 *    - Weapon upgrades (e.g. Squeaky Mallet, Thunder Gavel) synergize heavily with Squeaky Overdrive (+20 per tier).
 *    - Motor upgrades synergize with Caffeinated Oars (+15 per tier).
 *    - Armor / Shield upgrades synergize with Reverse Psychology & Heavy Pocket Anvil (+15 per tier).
 * 4. Active blessings stacking / compounding:
 *    - Stacking owned blessings provides diminishing or scaling returns (+10 if already owned).
 * 5. Run state context (low health boosts defensive/escape cards, low coins boosts Plank Magnetism).
 *
 * @param {object|string} cardOrId - Tarot card object or ID string.
 * @param {object} [playerState={}] - Player state (classId, upgrades, coins, health, maxHealth, blessings).
 * @returns {object} { score: number, reasons: Array<string> }
 */
export function evaluateTarotSynergy(cardOrId, playerState = {}) {
    const cardId = typeof cardOrId === 'string' ? cardOrId : cardOrId?.id;
    const card = TAROT_CARDS[cardId] || (typeof cardOrId === 'object' ? cardOrId : null);

    if (!cardId || !card) {
        return { score: 0, reasons: ['Unknown Card'] };
    }

    let score = 10; // Baseline
    const reasons = [];

    const rawClassId = playerState.classId || playerState.className || playerState.crewClass || 'helmsman';
    const classId = typeof rawClassId === 'string' ? rawClassId.trim().toLowerCase() : 'helmsman';

    // 1. Crew Class Synergy
    const classWeights = CLASS_TAROT_SYNERGY[classId] || CLASS_TAROT_SYNERGY.helmsman;
    const classBonus = classWeights[cardId] || 15;
    score += classBonus;
    if (classBonus >= 35) {
        reasons.push(`${capitalize(classId)} Signature Synergy (+${classBonus})`);
    } else if (classBonus >= 20) {
        reasons.push(`${capitalize(classId)} Alignment (+${classBonus})`);
    }

    // 2. Armory Upgrade Synergy
    const upgrades = Array.isArray(playerState.upgrades)
        ? playerState.upgrades
        : (playerState.upgrades ? Object.keys(playerState.upgrades) : []);

    // Check weapon tiers
    const hasWeapon = upgrades.some((u) => typeof u === 'string' && u.includes('weapon'));
    const weaponTiers = upgrades.filter((u) => typeof u === 'string' && u.includes('weapon')).length;
    if (cardId === TAROT_CARD_IDS.SQUEAKY_OVERDRIVE && hasWeapon) {
        const bonus = 15 * Math.max(1, weaponTiers);
        score += bonus;
        reasons.push(`Weapon Tech Resonance (+${bonus})`);
    }

    // Check motor tiers
    const hasMotor = upgrades.some((u) => typeof u === 'string' && u.includes('motor'));
    const motorTiers = upgrades.filter((u) => typeof u === 'string' && u.includes('motor')).length;
    if (cardId === TAROT_CARD_IDS.CAFFEINATED_OARS && hasMotor) {
        const bonus = 15 * Math.max(1, motorTiers);
        score += bonus;
        reasons.push(`Outboard Motor Acceleration (+${bonus})`);
    }

    // Check armor tiers
    const hasArmor = upgrades.some((u) => typeof u === 'string' && u.includes('armor'));
    const armorTiers = upgrades.filter((u) => typeof u === 'string' && u.includes('armor')).length;
    if ((cardId === TAROT_CARD_IDS.REVERSE_PSYCHOLOGY || cardId === TAROT_CARD_IDS.HEAVY_POCKET_ANVIL) && hasArmor) {
        const bonus = 12 * Math.max(1, armorTiers);
        score += bonus;
        reasons.push(`Reinforced Hull Mass (+${bonus})`);
    }

    // 3. Situational / Run State Context
    // Low health: Diplomatic Immunity (distraction) & Reverse Psychology (safety)
    const health = Number.isFinite(playerState.health) ? playerState.health : 100;
    const maxHealth = Number.isFinite(playerState.maxHealth) ? playerState.maxHealth : 100;
    if (health / maxHealth < 0.4) {
        if (cardId === TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY) {
            score += 25;
            reasons.push('Harbor Police Escort at Critical Hull (+25)');
        } else if (cardId === TAROT_CARD_IDS.REVERSE_PSYCHOLOGY) {
            score += 20;
            reasons.push('Defensive Coin Shielding (+20)');
        }
    }

    // Low coins (< 40): Plank Magnetism helps fund armory upgrades
    const coins = Number.isFinite(playerState.coins) ? playerState.coins : 50;
    if (coins < 35 && cardId === TAROT_CARD_IDS.PLANK_MAGNETISM) {
        score += 25;
        reasons.push('Emergency Salvage Magnet (+25)');
    }

    // 4. Stacking / Existing Blessing Synergy
    const blessings = playerState.tarotBlessings || playerState.blessings || {};
    const hasOwned = Array.isArray(blessings)
        ? blessings.includes(cardId)
        : Boolean(blessings[cardId]);
    if (hasOwned) {
        score += 10;
        reasons.push('Blessing Stacking (+10)');
    }

    return {
        score,
        cardId,
        reasons: reasons.length > 0 ? reasons : ['General Effectiveness (+10)'],
        summary: reasons.join(' • '),
    };
}

/**
 * Evaluates a list of offered cards and returns the highest synergy pick.
 *
 * @param {Array<object>} cards - Array of card definitions.
 * @param {object} [playerState={}] - Current player build/state.
 * @returns {object} { recommendedIndex: number, recommendedCard: object, synergy: object }
 */
export function getRecommendedTarotPick(cards = [], playerState = {}) {
    if (!Array.isArray(cards) || cards.length === 0) {
        return {
            recommendedIndex: -1,
            recommendedCard: null,
            synergy: { score: 0, reasons: [] },
        };
    }

    let highestIndex = 0;
    let highestSynergy = evaluateTarotSynergy(cards[0], playerState);

    for (let i = 1; i < cards.length; i++) {
        const synergy = evaluateTarotSynergy(cards[i], playerState);
        if (synergy.score > highestSynergy.score) {
            highestSynergy = synergy;
            highestIndex = i;
        }
    }

    return {
        recommendedIndex: highestIndex,
        recommendedCard: cards[highestIndex],
        synergy: highestSynergy,
        badgeText: RECOMMENDED_BADGE_TEXT,
    };
}

/**
 * Creates or wraps a Tarot Draft session pre-baked to v0.8 with instant recommendation metadata.
 * Automatically computes synergy scores and tags cards with recommended flags and hotkey hints.
 *
 * @param {object} options
 * @param {number} [options.checkpointIndex=2] - Checkpoint number.
 * @param {number} [options.seed=1337] - PRNG seed.
 * @param {object} [options.playerState={}] - Player build state for synergy evaluation.
 * @param {number} [options.startTimeMs=0] - Clock start.
 * @returns {object} Enhanced draft session pre-baked to v0.8.
 */
export function createQuickTarotDraftSession({
    checkpointIndex = 2,
    seed = 1337,
    playerState = {},
    startTimeMs = 0,
    currentBlessings = [],
    autoPickDurationMs = 6000,
} = {}) {
    // 1. Create standard deterministic session
    const session = createTarotDraftSession({
        checkpointIndex,
        seed,
        startTimeMs,
        currentBlessings,
        autoPickDurationMs,
    });

    // 2. Pre-bake recommendation to v0.8
    const rec = getRecommendedTarotPick(session.cards, playerState);

    session.playerState = playerState;
    session.recommendedIndex = rec.recommendedIndex;
    session.recommendedCard = rec.recommendedCard;
    session.recommendedCardId = rec.recommendedCard?.id || null;
    session.recommendedSynergy = rec.synergy;
    session.badgeText = RECOMMENDED_BADGE_TEXT;
    session.quickDraftKey = ' '; // Space key trigger

    // Enrich each card object in session.cards with quick-draft hotkey metadata
    session.cards = session.cards.map((card, idx) => {
        const isRec = idx === rec.recommendedIndex;
        const synergy = evaluateTarotSynergy(card, playerState);
        return {
            ...card,
            draftIndex: idx,
            hotkey: String(idx + 1),
            isRecommended: isRec,
            synergyScore: synergy.score,
            synergyReason: synergy.summary,
            badge: isRec ? RECOMMENDED_BADGE_TEXT : null,
            hotkeyLabel: isRec ? `[${idx + 1}] or [SPACE]` : `[${idx + 1}]`,
        };
    });

    return session;
}

/**
 * Handles 1-keystroke inputs for instant draft resolution.
 * Supports:
 * - Direct index hotkeys: '1', '2', '3' (or 'Digit1', 'Digit2', 'Digit3', 'Numpad1', etc.)
 * - Instant recommendation hotkey: ' ' or 'Space' or 'Spacebar'
 *
 * @param {object} session - Active quick draft session.
 * @param {string|object} keyOrEvent - KeyboardEvent, event.key, or code string.
 * @param {number} [nowMs=0] - Timestamp of keypress.
 * @returns {object} Selection outcome { success: boolean, card: object|null, key: string, isQuickPick: boolean }
 */
export function handleTarotQuickKey(session, keyOrEvent, nowMs = 0) {
    if (!session) {
        return { success: false, card: null, reason: 'no-session' };
    }
    if (!session.active || session.completed) {
        return { success: false, card: session.selectedCard, reason: 'already-completed' };
    }

    const { key, code } = parseKeyEvent(keyOrEvent);
    let chosenIndex = -1;
    let isQuickPick = false;

    // 1. Check Space / Recommended shortcut
    if (key === ' ' || key === 'Space' || key === 'Spacebar' || code === 'Space') {
        chosenIndex = session.recommendedIndex ?? 0;
        isQuickPick = true;
    }
    // 2. Check 1-Key Direct numeric hotkeys
    else if (key === '1' || code === 'Digit1' || code === 'Numpad1') {
        chosenIndex = 0;
    } else if (key === '2' || code === 'Digit2' || code === 'Numpad2') {
        chosenIndex = 1;
    } else if (key === '3' || code === 'Digit3' || code === 'Numpad3') {
        chosenIndex = 2;
    } else {
        return { success: false, card: null, reason: 'unrecognized-key' };
    }

    if (chosenIndex < 0 || chosenIndex >= session.cards.length) {
        return { success: false, card: null, reason: 'index-out-of-range' };
    }

    // Execute instant draft selection
    const res = selectDraftCard(session, chosenIndex, nowMs);
    if (!res.success) {
        return res;
    }

    return {
        success: true,
        card: res.card,
        selectedIndex: res.selectedIndex,
        isQuickPick,
        usedKey: isQuickPick ? 'Space' : String(res.selectedIndex + 1),
        timeTakenMs: Math.max(0, nowMs - session.startTimeMs),
    };
}

/**
 * Normalizes keyboard event or raw string into canonical key & code.
 */
function parseKeyEvent(keyOrEvent) {
    if (!keyOrEvent) return { key: '', code: '' };
    if (typeof keyOrEvent === 'string') {
        return { key: keyOrEvent, code: keyOrEvent };
    }
    return {
        key: keyOrEvent.key || keyOrEvent.code || '',
        code: keyOrEvent.code || keyOrEvent.key || '',
    };
}

/**
 * Simple string capitalizer.
 */
function capitalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
