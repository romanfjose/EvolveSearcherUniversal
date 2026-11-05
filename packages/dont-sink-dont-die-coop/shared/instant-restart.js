/**
 * Don't Sink, Don't Die — Sub-200ms 1-Key Instant Run Reset ([R]) Manager
 * (`shared/instant-restart.js`)
 *
 * Sovereign Core & Helmet 01 Cockpit Pilot Directive:
 * Eliminate post-death bureaucracy:
 * - Pressing [R] (or Gamepad Start/Y) on Game Over or Victory screen resets
 *   the entire river state, raft physics, enemy pools, and timers in memory
 *   in <50ms without a browser page reload.
 * - Preserves player cosmetic loadout (hat, class, color, name), audio
 *   mix preferences, and personal best ghost recordings across resets.
 *
 * Zero external dependencies. Shared across client, loopback, and test runners.
 */

import {
    createGameState,
    addPlayer,
    PLAYER,
    WATER_SURFACE_Y,
    PHYSICS,
    createRng,
} from './game-core.js';
import {
    createKrakenState,
} from './boss-kraken.js';
import {
    createPlayerTarotState,
} from './dream-tarot.js';
import {
    GAMEPAD_STANDARD_BUTTONS,
} from './input-math.js';
import {
    DEFAULT_SETTINGS,
    sanitizeSettings,
} from './game-settings.js';

export const RESTART_KEY_CODES = ['KeyR', 'r', 'R'];
export const RESTART_GAMEPAD_BUTTONS = [
    GAMEPAD_STANDARD_BUTTONS.START, // Start / Options (9)
    GAMEPAD_STANDARD_BUTTONS.Y,     // Y / Triangle (3)
];

export const RUN_STATUS = {
    ACTIVE: 'active',
    GAME_OVER: 'game_over',
    VICTORY: 'victory',
};

export const MAX_RESET_BUDGET_MS = 50;

/**
 * Checks whether a keyboard event matches the instant restart key ([R]).
 *
 * @param {KeyboardEvent|object} event
 * @returns {boolean}
 */
export function isRestartKey(event) {
    if (!event) return false;
    const code = event.code;
    const key = event.key;
    if (code && (code === 'KeyR' || code.toLowerCase() === 'keyr')) return true;
    if (key && (key === 'r' || key === 'R')) return true;
    return false;
}

/**
 * Checks whether a gamepad snapshot or button pressed event indicates an instant restart trigger
 * (Gamepad Start or Y/Triangle).
 *
 * @param {object} gamepadSnapshotOrButton
 * @returns {boolean}
 */
export function isRestartGamepadButton(gamepadSnapshotOrButton) {
    if (!gamepadSnapshotOrButton) return false;

    // Handle scalar button index or name
    if (typeof gamepadSnapshotOrButton === 'number') {
        return RESTART_GAMEPAD_BUTTONS.includes(gamepadSnapshotOrButton);
    }

    if (typeof gamepadSnapshotOrButton === 'string') {
        const norm = gamepadSnapshotOrButton.toLowerCase();
        return norm === 'start' || norm === 'y' || norm === 'triangle';
    }

    // Handle gamepad snapshot object with buttons array or boolean flags
    if (gamepadSnapshotOrButton.buttons && Array.isArray(gamepadSnapshotOrButton.buttons)) {
        for (const btnIdx of RESTART_GAMEPAD_BUTTONS) {
            const btn = gamepadSnapshotOrButton.buttons[btnIdx];
            if (btn) {
                if (typeof btn === 'object' && (btn.pressed || (btn.value ?? 0) > 0.5)) return true;
                if (Boolean(btn) === true) return true;
            }
        }
    }

    if (gamepadSnapshotOrButton.start || gamepadSnapshotOrButton.restart || gamepadSnapshotOrButton.buttonY) {
        return true;
    }

    return false;
}

/**
 * Determines whether the current game state allows an instant restart.
 * By default, instant restarts are only eligible when the game is over (all dead, team wiped,
 * or game over state) or when victory is achieved, unless force is specified.
 *
 * @param {object} options
 * @param {string} [options.status] - 'active' | 'game_over' | 'victory'
 * @param {boolean} [options.isGameOver]
 * @param {boolean} [options.isVictory]
 * @param {boolean} [options.gameWon]
 * @param {object} [options.gameState] - game-core state
 * @param {boolean} [options.force] - Allow restart even during active gameplay
 * @returns {boolean}
 */
export function isRestartEligible(options = {}) {
    if (options.force) return true;

    if (options.status === RUN_STATUS.GAME_OVER || options.status === RUN_STATUS.VICTORY) {
        return true;
    }

    if (options.isGameOver || options.isVictory || options.gameWon) {
        return true;
    }

    const state = options.gameState;
    if (state) {
        if (state.gameWon) return true;
        const players = Object.values(state.players || {});
        if (state.gameStarted && players.length > 0 && players.every((p) => p.isDead)) {
            return true;
        }
    }

    return false;
}

/**
 * Extracts and preserves persistent player loadout, cosmetic attributes,
 * and audio mix settings from an existing state or config.
 *
 * @param {object} currentSessionOrSettings
 * @returns {object} Preserved profile
 */
export function extractPreservedProfile(currentSessionOrSettings = {}) {
    const raw = currentSessionOrSettings || {};
    const settings = raw.settings || raw;
    const player = raw.player || raw.leadPlayer || raw.players?.['p1'] || {};

    const sanitized = sanitizeSettings(settings);

    return {
        // Cosmetic Loadout
        cosmetics: {
            classId: raw.classId || player.classId || sanitized.classId || 'helmsman',
            hatId: raw.hatId || player.hatId || sanitized.hatId || 'captain_tricorn',
            playerName: raw.playerName || player.name || sanitized.playerName || 'Captain River',
            color: raw.color || player.color || 0x38f2ff,
            customSkin: raw.customSkin || player.customSkin || null,
        },
        // Audio Mix Preferences
        audio: {
            master: sanitized.audio.master,
            music: sanitized.audio.music,
            sfx: sanitized.audio.sfx,
            squeakyHammer: sanitized.audio.squeakyHammer,
            muted: sanitized.audio.muted,
        },
        // Personal Best Ghost Replay
        pbGhost: raw.pbGhost || raw.personalBest || null,
    };
}

/**
 * Resets the river game state, raft physics, enemy pools, and run timers in memory.
 * Guarantees execution completes within <50ms without full page reload.
 *
 * @param {object} options
 * @param {object} [options.currentSession] - Existing session object to reset
 * @param {object} [options.preservedProfile] - Profile extracted via extractPreservedProfile
 * @param {number|string} [options.seed] - Seed for next run (defaults to new or existing seed)
 * @param {number} [options.botCount] - Companion bot count
 * @param {string} [options.mode] - Game mode
 * @returns {object} Reset run result with initialized gameState, physics, pools, and timings
 */
export function resetRunInMemory(options = {}) {
    const startTimestamp = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

    const {
        currentSession = null,
        preservedProfile: customProfile = null,
        seed = (currentSession?.seed !== undefined ? currentSession.seed : 1),
        botCount = (currentSession?.botCount !== undefined ? currentSession.botCount : 2),
        mode = currentSession?.mode || 'campaign',
    } = options;

    // 1. Preserve or resolve profile
    const preserved = customProfile || extractPreservedProfile(currentSession || {});

    // 2. Initialize pristine deterministic RNG
    const numSeed = typeof seed === 'number' ? (seed >>> 0) : 1;
    const rng = createRng(numSeed);

    // 3. Reset river game-core state
    const newGameState = createGameState({ seed: numSeed, rng });
    newGameState.gameStarted = true;

    // 4. Add Lead Human Player with preserved cosmetics & pristine stats
    const leadPlayerId = 'p1';
    addPlayer(newGameState, leadPlayerId, {
        isBot: false,
        name: preserved.cosmetics.playerName,
    });

    const leadP = newGameState.players[leadPlayerId];
    if (leadP) {
        leadP.color = preserved.cosmetics.color;
        leadP.classId = preserved.cosmetics.classId;
        leadP.hatId = preserved.cosmetics.hatId;
        leadP.health = PLAYER.startHealth;
        leadP.maxHealth = PLAYER.startHealth;
        leadP.coins = PLAYER.startCoins;
        leadP.upgrades = [];
        leadP.kills = 0;
        leadP.damageDealt = 0;
        leadP.damageTaken = 0;
        leadP.isDead = false;
        leadP.bestZ = 0;
        leadP.position = { x: 0, y: WATER_SURFACE_Y, z: 0 };
        leadP.quaternion = { x: 0, y: 0, z: 0, w: 1 };
    }

    // 5. Add Companion Bots
    const targetBotCount = Math.min(3, Math.max(0, botCount));
    for (let i = 0; i < targetBotCount; i++) {
        addPlayer(newGameState, `bot_${i}`, { isBot: true });
    }

    // 6. Reset Raft Physics Kinematics State
    const raftPhysics = {
        position: { x: 0, y: WATER_SURFACE_Y, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        yawRate: 0,
        airborne: false,
        verticalSpeed: 0,
        mass: PLAYER.mass,
        headingThrust: 0,
        settledOnWater: true,
    };

    // 7. Reset Boss Kraken & Tarot State
    const krakenState = createKrakenState();
    const tarotState = createPlayerTarotState(leadPlayerId);

    // 8. Reset Run Timers
    const runTimers = {
        startTimeMs: 0,
        elapsedMs: 0,
        tickCount: 0,
        formattedTime: '00:00.00',
    };

    const endTimestamp = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const durationMs = Number((endTimestamp - startTimestamp).toFixed(3));

    const result = {
        success: true,
        durationMs,
        withinBudget: durationMs <= MAX_RESET_BUDGET_MS,
        mode,
        seed: numSeed,
        botCount: targetBotCount,
        gameState: newGameState,
        raftPhysics,
        krakenState,
        tarotState,
        runTimers,
        preservedProfile: preserved,
    };

    // If existing session is provided, update its references in-place
    if (currentSession && typeof currentSession === 'object') {
        currentSession.gameState = newGameState;
        currentSession.raftPhysics = raftPhysics;
        currentSession.krakenState = krakenState;
        currentSession.tarotState = tarotState;
        currentSession.runTimers = runTimers;
        currentSession.status = RUN_STATUS.ACTIVE;
        currentSession.isGameOver = false;
        currentSession.isVictory = false;
        currentSession.lastResetDurationMs = durationMs;
    }

    return result;
}

/**
 * InstantRunResetManager
 *
 * Listens for [R] keydown and Gamepad Start / Y inputs, validates eligibility,
 * and triggers sub-50ms run reset while preserving player cosmetics and PB ghost.
 */
export class InstantRunResetManager {
    constructor(options = {}) {
        this.gameState = options.gameState || null;
        this.status = options.status || RUN_STATUS.ACTIVE;
        this.preservedProfile = options.preservedProfile || extractPreservedProfile(options);
        this.onReset = options.onReset || null;
        this.botCount = options.botCount ?? 2;
        this.seed = options.seed ?? 1;
        this.mode = options.mode || 'campaign';
        this.enabled = options.enabled ?? true;

        this._resetCount = 0;
        this._lastResetDurationMs = 0;
        this._boundKeyDown = this._handleKeyDown.bind(this);
    }

    setStatus(status) {
        this.status = status;
    }

    setGameOver() {
        this.status = RUN_STATUS.GAME_OVER;
    }

    setVictory() {
        this.status = RUN_STATUS.VICTORY;
    }

    setActive() {
        this.status = RUN_STATUS.ACTIVE;
    }

    isEligible(force = false) {
        return isRestartEligible({
            status: this.status,
            gameState: this.gameState,
            force,
        });
    }

    /**
     * Executes the instant reset in memory.
     *
     * @param {object} [options]
     * @param {boolean} [options.force=false]
     * @returns {object|null} Reset result or null if ineligible
     */
    triggerReset(options = {}) {
        const force = options.force || false;
        if (!this.enabled) return null;
        if (!this.isEligible(force)) return null;

        const nextSeed = options.seed !== undefined ? options.seed : this.seed;

        const resetResult = resetRunInMemory({
            currentSession: this,
            preservedProfile: this.preservedProfile,
            seed: nextSeed,
            botCount: this.botCount,
            mode: this.mode,
        });

        this.status = RUN_STATUS.ACTIVE;
        this.gameState = resetResult.gameState;
        this._resetCount++;
        this._lastResetDurationMs = resetResult.durationMs;

        if (typeof this.onReset === 'function') {
            this.onReset(resetResult);
        }

        return resetResult;
    }

    /**
     * Handles keyboard events.
     */
    _handleKeyDown(event) {
        if (!this.enabled) return;
        if (isRestartKey(event)) {
            if (this.isEligible()) {
                if (typeof event.preventDefault === 'function') event.preventDefault();
                if (typeof event.stopPropagation === 'function') event.stopPropagation();
                this.triggerReset();
            }
        }
    }

    /**
     * Polls or handles gamepad input snapshot for restart trigger.
     *
     * @param {object} gamepadSnapshot
     * @returns {boolean} Whether a reset was triggered
     */
    handleGamepadInput(gamepadSnapshot) {
        if (!this.enabled) return false;
        if (isRestartGamepadButton(gamepadSnapshot)) {
            if (this.isEligible()) {
                this.triggerReset();
                return true;
            }
        }
        return false;
    }

    /**
     * Attaches keyboard listener to target window or DOM element.
     */
    attach(target = (typeof window !== 'undefined' ? window : null)) {
        if (target && typeof target.addEventListener === 'function') {
            target.addEventListener('keydown', this._boundKeyDown);
            this._target = target;
        }
    }

    /**
     * Detaches keyboard listener and releases handles.
     */
    dispose() {
        if (this._target && typeof this._target.removeEventListener === 'function') {
            this._target.removeEventListener('keydown', this._boundKeyDown);
            this._target = null;
        }
        this.enabled = false;
    }

    getStats() {
        return {
            resetCount: this._resetCount,
            lastResetDurationMs: this._lastResetDurationMs,
            status: this.status,
            mode: this.mode,
        };
    }
}
