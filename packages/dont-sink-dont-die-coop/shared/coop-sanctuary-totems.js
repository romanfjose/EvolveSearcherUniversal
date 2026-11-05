/**
 * Don't Sink, Don't Die — Co-Op Sanctuary Campfire Ready-Check & Tactical Buff Totems
 * (`shared/coop-sanctuary-totems.js`)
 *
 * Sovereign Core & Helmet 01 Directive (The Cockpit Pilot & Tactical RTS Engineer):
 * - Pure, deterministic co-op sanctuary platform regrouping and campfire ready-check system.
 * - When players jump onto a sanctuary side platform or harbor rest dock to think and regroup,
 *   resting together for 3.0 seconds triggers a Crew Regroup bonus (+25 Hull HP, +15 Gold)
 *   and unlocks a selectable Expedition Tactical Totem Buff for the team.
 * - Zero timers, zero I/O, zero global leaks, zero external dependencies.
 * - Line-of-sight clarity, 1-click execution, and clean state mutations.
 */

/**
 * Standard Sanctuary Expedition Buff choices offered upon completing a Campfire Crew Regroup.
 */
export const SANCTUARY_BUFFS = Object.freeze({
    AEGIS_BULWARK: Object.freeze({
        id: 'aegis-bulwark',
        name: 'Aegis Bulwark Totem',
        category: 'defense',
        icon: '🛡️',
        description: 'Imbues the raft with +25% armor resistance against river hazards and collision damage.',
        stats: Object.freeze({
            damageReduction: 0.25,
            bonusMaxHealth: 20,
        }),
    }),
    TAILWIND_ZEPHYR: Object.freeze({
        id: 'tailwind-zephyr',
        name: 'Tailwind Zephyr Totem',
        category: 'speed',
        icon: '💨',
        description: 'Grants +20% forward paddle thrust and increases top speed downriver.',
        stats: Object.freeze({
            thrustMultiplier: 1.20,
            turnRateMultiplier: 1.10,
        }),
    }),
    ALCHEMISTS_COFFER: Object.freeze({
        id: 'alchemists-coffer',
        name: "Alchemist's Coffer Totem",
        category: 'economy',
        icon: '🪙',
        description: 'Coin pickups and enemy spoils yield +50% extra gold coins downriver.',
        stats: Object.freeze({
            coinDropMultiplier: 1.50,
            instantBonusCoins: 10,
        }),
    }),
    PHOENIX_EMBER: Object.freeze({
        id: 'phoenix-ember',
        name: 'Phoenix Ember Totem',
        category: 'revival',
        icon: '🔥',
        description: 'Instantly revives fallen crewmates at 50% HP or grants an emergency auto-revive shield.',
        stats: Object.freeze({
            autoReviveCharges: 1,
            reviveHealthPercent: 0.50,
        }),
    }),
});

/**
 * Configuration parameters for sanctuary platforms and campfire ready-checks.
 */
export const SANCTUARY_CONFIG = Object.freeze({
    REST_TIME_REQUIRED_SEC: 3.0,
    BONUS_HULL_HP: 25,
    BONUS_GOLD: 15,
    MIN_CREW_PERCENT: 1.0, // Default: 100% of alive crew must be on platform to channel
});

/**
 * Creates an initial or reset campfire rest state.
 *
 * @param {object} [initial={}] - Optional partial overrides
 * @returns {object} Clean campfire tracking state
 */
export function createCampfireState(initial = {}) {
    return {
        restTimer: Math.max(0, Number(initial.restTimer) || 0),
        isTriggered: Boolean(initial.isTriggered),
        completed: Boolean(initial.completed),
        selectedBuffId: initial.selectedBuffId || null,
        selectedBuff: initial.selectedBuff || null,
        playersPresent: Array.isArray(initial.playersPresent) ? [...initial.playersPresent] : [],
        lastProgressRatio: Math.min(1.0, Math.max(0.0, Number(initial.lastProgressRatio) || 0)),
    };
}

/**
 * Evaluates campfire crew rest progress on a sanctuary side platform or City Harbor dock.
 *
 * When all active/alive players (or players passed in playersOnPlatform) rest together on the
 * platform for the required duration (default 3.0s), the campfire triggers the Crew Regroup bonus:
 * +25 Hull HP, +15 Gold, and ready status to pick an expedition buff.
 *
 * @param {object} options
 * @param {Array<object|string|number>|number} [options.playersOnPlatform=[]] - Players or count of players currently on the platform
 * @param {number} [options.totalPlayers=1] - Total active/alive crew size required for ready-check
 * @param {number} [options.dt=0] - Frame delta time in seconds
 * @param {object} [options.state] - Mutable or snapshot campfire state
 * @param {number} [options.restThreshold=3.0] - Target rest duration in seconds (default 3.0)
 * @param {number} [options.bonusHull=25] - Hull HP awarded upon trigger (default 25)
 * @param {number} [options.bonusGold=15] - Gold awarded upon trigger (default 15)
 * @param {boolean} [options.autoResetOnLeave=true] - Whether leaving the platform decays or resets progress
 * @returns {object} Evaluation summary {
 *   restTimer,
 *   restProgress,
 *   isReady,
 *   justTriggered,
 *   bonusHull,
 *   bonusGold,
 *   rewardApplied,
 *   availableBuffs,
 *   state
 * }
 */
export function evaluateCampfireCrewRest({
    playersOnPlatform = [],
    totalPlayers = 1,
    dt = 0,
    state = null,
    restThreshold = SANCTUARY_CONFIG.REST_TIME_REQUIRED_SEC,
    bonusHull = SANCTUARY_CONFIG.BONUS_HULL_HP,
    bonusGold = SANCTUARY_CONFIG.BONUS_GOLD,
    autoResetOnLeave = true,
} = {}) {
    // Normalize platform players and count
    let presentCount = 0;
    let presentPlayers = [];

    if (typeof playersOnPlatform === 'number') {
        presentCount = Math.max(0, playersOnPlatform);
        presentPlayers = Array.from({ length: presentCount }, (_, i) => `player_${i + 1}`);
    } else if (Array.isArray(playersOnPlatform)) {
        presentPlayers = playersOnPlatform.filter(Boolean);
        presentCount = presentPlayers.length;
    }

    const requiredCrew = Math.max(1, Number(totalPlayers) || 1);
    const stepDt = Math.max(0, Number(dt) || 0);
    const targetTime = Math.max(0.1, Number(restThreshold) || SANCTUARY_CONFIG.REST_TIME_REQUIRED_SEC);

    // Initialize or utilize state object
    const campfireState = state || createCampfireState();
    campfireState.playersPresent = presentPlayers;

    const allCrewPresent = presentCount >= requiredCrew;
    let justTriggered = false;
    let rewardApplied = false;

    if (!campfireState.completed) {
        if (allCrewPresent) {
            // Accumulate rest time
            campfireState.restTimer = Math.min(targetTime, (campfireState.restTimer || 0) + stepDt);
        } else {
            // Crew not fully gathered: reset or decay
            if (autoResetOnLeave) {
                campfireState.restTimer = 0;
            } else {
                campfireState.restTimer = Math.max(0, (campfireState.restTimer || 0) - stepDt * 1.5);
            }
        }

        // Check if regroup condition is satisfied
        if (campfireState.restTimer >= targetTime) {
            campfireState.isTriggered = true;
            campfireState.completed = true;
            justTriggered = true;
            rewardApplied = true;
        }
    }

    const restProgress = Math.min(1.0, campfireState.restTimer / targetTime);
    campfireState.lastProgressRatio = restProgress;

    return {
        restTimer: campfireState.restTimer,
        restProgress,
        isReady: campfireState.completed || campfireState.isTriggered,
        justTriggered,
        allCrewPresent,
        presentCount,
        requiredCrew,
        bonusHull: (justTriggered || campfireState.completed) ? bonusHull : 0,
        bonusGold: (justTriggered || campfireState.completed) ? bonusGold : 0,
        rewardApplied: justTriggered,
        availableBuffs: Object.values(SANCTUARY_BUFFS),
        state: campfireState,
    };
}

/**
 * Selects an expedition totem buff for the crew from the available sanctuary choices.
 *
 * @param {string|object} choiceId - Buff ID string (e.g. 'aegis-bulwark', 'tailwind-zephyr') or buff object
 * @param {object} [state] - Optional campfire state to mutate with the selection
 * @returns {object} Selection result { success: boolean, buff: object|null, error: string|null }
 */
export function selectSanctuaryExpeditionBuff(choiceId, state = null) {
    if (!choiceId) {
        return {
            success: false,
            buff: null,
            error: 'No buff ID provided',
        };
    }

    const normalizedId = typeof choiceId === 'string'
        ? choiceId.trim().toLowerCase()
        : (choiceId?.id ? String(choiceId.id).trim().toLowerCase() : '');

    const foundBuff = Object.values(SANCTUARY_BUFFS).find(
        (b) => b.id.toLowerCase() === normalizedId || b.name.toLowerCase() === normalizedId
    );

    if (!foundBuff) {
        return {
            success: false,
            buff: null,
            error: `Buff "${choiceId}" not found in SANCTUARY_BUFFS`,
        };
    }

    if (state && typeof state === 'object') {
        state.selectedBuffId = foundBuff.id;
        state.selectedBuff = foundBuff;
    }

    return {
        success: true,
        buff: foundBuff,
        error: null,
    };
}
