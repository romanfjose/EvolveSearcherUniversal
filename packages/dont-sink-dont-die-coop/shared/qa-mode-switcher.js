/**
 * Don't Sink, Don't Die — Rapid Party Mode Switcher & Lifecycle Torture Tester
 * (`shared/qa-mode-switcher.js`)
 *
 * Helmet 03 ("Where's the Bathroom?" QA Breaker) Lifecycle Stress Harness:
 * Rapidly cycles game sessions across all 4 party modes:
 *   1. 'coop'        (Standard 4-Player / Bot Co-Op Campaign)
 *   2. 'daily'       (Daily Mutator Fever-Dream Seeded Challenge)
 *   3. 'splitscreen' (2-Player Dual Viewport Couch Co-Op)
 *   4. 'endless'     (Rogue-River Infinite Sectors & Perk Drafts)
 *
 * Enforces zero state leakage across transitions:
 * - coins, health, wave index, krakenState, tarot blessings, endless loop counters
 *   must reset cleanly to pristine initial values on EVERY mode switch.
 * - Handles mid-frame aborts, random seeds, and aggressive state mutation fuzzing.
 *
 * Pure, zero-dependency ES module. Shared across server, browser, and test runner.
 */

import {
    createGameState,
    addPlayer,
    tick,
    PLAYER,
    TICK_MS,
} from './game-core.js';
import {
    createKrakenState,
    spawnKraken,
    damageKraken,
    tickKraken,
} from './boss-kraken.js';
import {
    createPlayerTarotState,
    applyTarotBlessing,
    TAROT_CARD_IDS,
} from './dream-tarot.js';
import {
    EndlessSession,
    ENDLESS_START_Z,
} from './endless-mode.js';
import {
    getDailyMutator,
    applyMutatorModifiers,
} from './replay-ghost.js';

export const PARTY_MODES = {
    COOP: 'coop',
    DAILY: 'daily',
    SPLITSCREEN: 'splitscreen',
    ENDLESS: 'endless',
};

export const PARTY_MODE_KEYS = [
    PARTY_MODES.COOP,
    PARTY_MODES.DAILY,
    PARTY_MODES.SPLITSCREEN,
    PARTY_MODES.ENDLESS,
];

/**
 * Deterministic mulberry32 PRNG generator.
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
 * Baseline initial values that must hold true for any fresh session.
 */
export const INITIAL_STATE_BASELINES = {
    coins: PLAYER.startCoins, // 50
    health: PLAYER.startHealth, // 100
    wave: 1,
    krakenSpawned: false,
    krakenDefeated: false,
    krakenHpRatio: 1.0,
    tarotBlessingCount: 0,
    endlessLoopCounter: 0,
    sectorsCleared: 0,
};

/**
 * Creates a pristine, isolated session for one of the 4 party modes.
 *
 * @param {string} mode - One of 'coop', 'daily', 'splitscreen', 'endless'.
 * @param {object} options
 * @param {number} [options.seed=1337] - Seed for simulation RNG.
 * @param {string} [options.sessionId=null] - Unique identifier for the session.
 * @param {number} [options.botCount=2] - Number of companion bots for coop.
 * @returns {object} Fresh session object.
 */
export function createPartySession(mode, { seed = 1337, sessionId = null, botCount = 2 } = {}) {
    const cleanMode = String(mode).toLowerCase().trim();
    if (!PARTY_MODE_KEYS.includes(cleanMode)) {
        throw new Error(`Invalid party mode: "${mode}". Expected one of: ${PARTY_MODE_KEYS.join(', ')}`);
    }

    const sId = sessionId || `session_${cleanMode}_${seed}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const sessionRng = createRng(seed);

    // 1. Core game state
    const gameState = createGameState({ seed, rng: sessionRng });

    // 2. Add players based on mode
    if (cleanMode === PARTY_MODES.COOP) {
        addPlayer(gameState, 'p1', { isBot: false, name: 'Captain' });
        for (let i = 0; i < Math.min(3, botCount); i++) {
            addPlayer(gameState, `bot_${i}`, { isBot: true });
        }
    } else if (cleanMode === PARTY_MODES.SPLITSCREEN) {
        addPlayer(gameState, 'p1', { isBot: false, name: 'Player 1' });
        addPlayer(gameState, 'p2', { isBot: false, name: 'Player 2' });
    } else if (cleanMode === PARTY_MODES.DAILY) {
        addPlayer(gameState, 'p1', { isBot: false, name: 'Daily Navigator' });
    } else if (cleanMode === PARTY_MODES.ENDLESS) {
        addPlayer(gameState, 'p1', { isBot: false, name: 'Endless Survivor' });
    }

    // 3. Mode-specific subsystem attachments
    let dailyMutator = null;
    let endlessSession = null;
    const krakenState = createKrakenState({ seed });
    const tarotState = createPlayerTarotState();

    if (cleanMode === PARTY_MODES.DAILY) {
        dailyMutator = getDailyMutator(seed);
        // Apply mutator health or speed adjustments cleanly to player
        if (dailyMutator.modifiers?.healthMultiplier) {
            const p = gameState.players['p1'];
            if (p) {
                p.maxHealth = Math.round(p.maxHealth * dailyMutator.modifiers.healthMultiplier);
                p.health = p.maxHealth;
            }
        }
    } else if (cleanMode === PARTY_MODES.ENDLESS) {
        endlessSession = new EndlessSession({ seed, playerName: 'Endless Survivor' });
    }

    return {
        id: sId,
        mode: cleanMode,
        seed,
        status: 'active', // 'active', 'aborted', 'completed', 'torn_down'
        frameCount: 0,
        elapsedMs: 0,
        gameState,
        krakenState,
        tarotState,
        dailyMutator,
        endlessSession,
        abortedAtFrame: null,
        abortReason: null,
    };
}

/**
 * Extracts a standardized state snapshot from an active or aborted session.
 * Used to verify invariants and detect cross-session leakage.
 *
 * @param {object} session
 * @returns {object} Clean telemetry snapshot.
 */
export function captureStateSnapshot(session) {
    if (!session || !session.gameState) {
        return {
            valid: false,
            mode: null,
            coins: null,
            health: null,
            wave: null,
            krakenSpawned: null,
            krakenDefeated: null,
            krakenHpRatio: null,
            tarotBlessingCount: null,
            endlessLoopCounter: null,
            sectorsCleared: null,
        };
    }

    const primaryPlayer = session.gameState.players['p1'] || Object.values(session.gameState.players)[0] || null;
    const coins = primaryPlayer ? primaryPlayer.coins : 0;
    const health = primaryPlayer ? primaryPlayer.health : 0;
    const wave = session.gameState.wave;

    const krakenSpawned = Boolean(session.krakenState?.isSpawned);
    const krakenDefeated = Boolean(session.krakenState?.isDefeated);
    const krakenHpRatio = session.krakenState ? (session.krakenState.health / session.krakenState.maxHealth) : 0;

    const tarotBlessingCount = session.tarotState ? Object.keys(session.tarotState.blessings || {}).length : 0;

    const endlessLoopCounter = session.endlessSession ? session.endlessSession.currentSectorIndex : 0;
    const sectorsCleared = session.endlessSession ? session.endlessSession.sectorsCleared : 0;

    return {
        valid: true,
        sessionId: session.id,
        mode: session.mode,
        status: session.status,
        frameCount: session.frameCount,
        elapsedMs: session.elapsedMs,
        coins,
        health,
        wave,
        krakenSpawned,
        krakenDefeated,
        krakenHpRatio,
        tarotBlessingCount,
        endlessLoopCounter,
        sectorsCleared,
    };
}

/**
 * Simulates gameplay execution for N frames or ticks on a session.
 * Mutates state dynamically: advances position, earns coins, takes damage,
 * spawns/fights the Kraken, drafts Tarot cards, advances endless sectors.
 *
 * @param {object} session
 * @param {number} [ticks=1] - Number of ticks to simulate.
 * @param {object} [fuzzActions={}] - Optional forced mutations to stress test state changes.
 * @returns {object} Snapshot of state after step.
 */
export function stepSession(session, ticks = 1, fuzzActions = {}) {
    if (session.status !== 'active') {
        return captureStateSnapshot(session);
    }

    const p1 = session.gameState.players['p1'];

    for (let t = 0; t < ticks; t++) {
        if (session.status !== 'active') break;

        session.frameCount++;
        session.elapsedMs += TICK_MS;

        // Advance simulation tick
        tick(session.gameState, TICK_MS);

        if (p1 && !p1.isDead) {
            // Simulate progression downriver
            p1.position.z -= 5;
            p1.bestZ = Math.min(p1.bestZ, p1.position.z);

            // Natural wave progression
            if (p1.position.z <= -150 * session.gameState.wave) {
                session.gameState.wave++;
            }
        }

        // Apply fuzzing actions to dirty the state
        if (fuzzActions.addCoins && p1) {
            p1.coins += fuzzActions.addCoins;
        }
        if (fuzzActions.takeDamage && p1) {
            p1.health = Math.max(1, p1.health - fuzzActions.takeDamage);
        }
        if (fuzzActions.triggerTarot && session.tarotState) {
            const cards = Object.values(TAROT_CARD_IDS);
            const card = cards[session.frameCount % cards.length];
            applyTarotBlessing(session.tarotState, card, session.elapsedMs);
        }
        if (fuzzActions.triggerKraken && session.krakenState) {
            if (!session.krakenState.isSpawned) {
                spawnKraken(session.krakenState);
            }
            damageKraken(session.krakenState, 150);
            tickKraken(session.krakenState, 0.05, Object.values(session.gameState.players));
        }
        if (fuzzActions.advanceEndless && session.endlessSession) {
            session.endlessSession.updateRaftZ(ENDLESS_START_Z - 500 * (session.endlessSession.currentSectorIndex + 1));
            session.endlessSession.sectorsCleared++;
        }
    }

    return captureStateSnapshot(session);
}

/**
 * Mid-frame Abort Simulator ("Where's the Bathroom?" Breaker).
 * Simulates an impatient user slamming Back/Home/Switch while the physics loop
 * or combat tick is half-finished.
 *
 * @param {object} session
 * @param {string} [reason='mid_frame_user_abort']
 * @returns {object} Final aborted state snapshot.
 */
export function abortSession(session, reason = 'mid_frame_user_abort') {
    if (!session || session.status === 'torn_down') {
        return { ok: false, error: 'Session already torn down or invalid' };
    }

    session.status = 'aborted';
    session.abortedAtFrame = session.frameCount;
    session.abortReason = reason;

    return {
        ok: true,
        sessionId: session.id,
        mode: session.mode,
        abortedAtFrame: session.frameCount,
        snapshot: captureStateSnapshot(session),
    };
}

/**
 * Tears down a session, releasing all handles and validating zero lingering leaks.
 *
 * @param {object} session
 * @returns {boolean} True if teardown succeeded cleanly.
 */
export function teardownSession(session) {
    if (!session) return false;

    session.status = 'torn_down';

    // Disconnect/clear players from gameState
    if (session.gameState?.players) {
        for (const pid of Object.keys(session.gameState.players)) {
            delete session.gameState.players[pid];
        }
    }

    // Clear endless session
    if (session.endlessSession) {
        session.endlessSession.chainer = null;
        session.endlessSession = null;
    }

    // Clear kraken state
    if (session.krakenState) {
        session.krakenState.tentacles = [];
        session.krakenState.telegraphRings = [];
        session.krakenState.coinDrops = [];
    }

    return true;
}

/**
 * Verifies that a newly created session exhibits ZERO state leakage from
 * previous runs or modified globals.
 *
 * Checks:
 * - coins === startCoins (or mutator modified baseline)
 * - health === maxHealth / startHealth
 * - wave === 1
 * - krakenState.isSpawned === false && krakenState.isDefeated === false
 * - tarot blessings count === 0
 * - endless loop counter === 0
 *
 * @param {object} newSession - Newly created session to verify.
 * @param {object} [previousSnapshot=null] - Optional snapshot of the previous dirty run for comparison.
 * @returns {object} { clean: boolean, violations: Array<string> }
 */
export function verifyZeroStateLeakage(newSession, previousSnapshot = null) {
    const violations = [];
    const snapshot = captureStateSnapshot(newSession);

    if (!snapshot.valid) {
        return { clean: false, violations: ['Invalid session state snapshot'] };
    }

    // 1. Coins Check
    // If previous run had dirty coins (e.g. 350c), new session must not carry them over!
    if (snapshot.coins !== INITIAL_STATE_BASELINES.coins) {
        violations.push(`Coins leaked: expected ${INITIAL_STATE_BASELINES.coins}, found ${snapshot.coins}`);
    }

    // 2. Health Check
    // Daily mutators might legitimately alter initial health, otherwise must equal startHealth
    if (newSession.mode !== PARTY_MODES.DAILY) {
        if (snapshot.health !== INITIAL_STATE_BASELINES.health) {
            violations.push(`Health leaked: expected ${INITIAL_STATE_BASELINES.health}, found ${snapshot.health}`);
        }
    } else {
        const p1 = newSession.gameState.players['p1'];
        if (p1 && snapshot.health !== p1.maxHealth) {
            violations.push(`Daily mode health mismatch: expected ${p1.maxHealth}, found ${snapshot.health}`);
        }
    }

    // 3. Wave Index Check
    if (snapshot.wave !== INITIAL_STATE_BASELINES.wave) {
        violations.push(`Wave index leaked: expected ${INITIAL_STATE_BASELINES.wave}, found ${snapshot.wave}`);
    }

    // 4. Kraken State Check
    if (snapshot.krakenSpawned !== INITIAL_STATE_BASELINES.krakenSpawned) {
        violations.push('Kraken spawn state leaked: new session spawned is true');
    }
    if (snapshot.krakenDefeated !== INITIAL_STATE_BASELINES.krakenDefeated) {
        violations.push('Kraken defeat state leaked: new session defeated is true');
    }
    if (snapshot.krakenHpRatio !== INITIAL_STATE_BASELINES.krakenHpRatio) {
        violations.push(`Kraken HP leaked: ratio expected 1.0, found ${snapshot.krakenHpRatio}`);
    }

    // 5. Tarot Blessings Check
    if (snapshot.tarotBlessingCount !== INITIAL_STATE_BASELINES.tarotBlessingCount) {
        violations.push(`Tarot blessings leaked: expected 0, found ${snapshot.tarotBlessingCount}`);
    }

    // 6. Endless Loop Counters Check
    if (snapshot.endlessLoopCounter !== INITIAL_STATE_BASELINES.endlessLoopCounter) {
        violations.push(`Endless sector index leaked: expected 0, found ${snapshot.endlessLoopCounter}`);
    }
    if (snapshot.sectorsCleared !== INITIAL_STATE_BASELINES.sectorsCleared) {
        violations.push(`Endless sectors cleared leaked: expected 0, found ${snapshot.sectorsCleared}`);
    }

    // 7. Cross-check against dirty previous run if provided
    if (previousSnapshot && previousSnapshot.valid) {
        if (previousSnapshot.coins > snapshot.coins && snapshot.coins > INITIAL_STATE_BASELINES.coins) {
            violations.push(`Cross-session coin leakage detected from ${previousSnapshot.sessionId}`);
        }
        if (previousSnapshot.wave > 1 && snapshot.wave === previousSnapshot.wave) {
            violations.push(`Cross-session wave leakage detected from ${previousSnapshot.sessionId}`);
        }
    }

    return {
        clean: violations.length === 0,
        violations,
        snapshot,
    };
}

/**
 * Party Mode Switcher Controller
 * Manages active session lifecycle, mode switching, dirtying runs, and teardown.
 */
export class PartyModeSwitcher {
    constructor({ initialMode = PARTY_MODES.COOP, seed = 1337 } = {}) {
        this.currentMode = initialMode;
        this.seed = seed;
        this.activeSession = createPartySession(initialMode, { seed });
        this.history = [];
        this.switchCount = 0;
    }

    /**
     * Rapidly switches to a new party mode, optionally aborting mid-frame.
     *
     * @param {string} targetMode - Mode to switch to.
     * @param {object} options
     * @param {number} [options.seed=null] - Seed for next session.
     * @param {boolean} [options.abortMidFrame=false] - Whether to simulate mid-frame abort.
     * @param {string} [options.abortReason='user_mode_switch'] - Reason for abort.
     * @returns {object} { success: boolean, previousSnapshot: object, newSnapshot: object, leakage: object }
     */
    switchMode(targetMode, { seed = null, abortMidFrame = false, abortReason = 'user_mode_switch' } = {}) {
        const nextSeed = seed !== null ? seed : (this.seed + this.switchCount * 9973 + 1);
        const prevSession = this.activeSession;
        let prevSnapshot = null;

        if (prevSession) {
            if (abortMidFrame) {
                abortSession(prevSession, abortReason);
            }
            prevSnapshot = captureStateSnapshot(prevSession);
            teardownSession(prevSession);
            this.history.push(prevSnapshot);
        }

        // Create new session
        const newSession = createPartySession(targetMode, { seed: nextSeed });
        this.activeSession = newSession;
        this.currentMode = targetMode;
        this.switchCount++;

        // Verify zero leakage
        const leakage = verifyZeroStateLeakage(newSession, prevSnapshot);

        return {
            success: leakage.clean,
            switchIndex: this.switchCount,
            mode: targetMode,
            seed: nextSeed,
            previousSnapshot: prevSnapshot,
            newSnapshot: leakage.snapshot,
            leakage,
        };
    }

    getActiveSession() {
        return this.activeSession;
    }

    dispose() {
        if (this.activeSession) {
            teardownSession(this.activeSession);
            this.activeSession = null;
        }
    }
}

/**
 * Rapid Party Mode Switching & Lifecycle Torture Tester
 *
 * Executes 50 rapid cycles across all 4 modes with:
 * - random seeds
 * - mid-frame aborts
 * - heavy state pollution (coins, health, kraken, wave, tarot, endless)
 * - verification of zero state leakage on every single switch
 *
 * @param {object} options
 * @param {number} [options.iterations=50] - Number of mode switch cycles (defaults to 50).
 * @param {number} [options.masterSeed=42069] - Master seed for deterministic PRNG.
 * @param {boolean} [options.verbose=false] - Log progress details.
 * @returns {object} Comprehensive torture test receipt.
 */
export function runModeSwitchingTortureTest({
    iterations = 50,
    masterSeed = 42069,
    verbose = false,
} = {}) {
    const rng = createRng(masterSeed);
    const switcher = new PartyModeSwitcher({ initialMode: PARTY_MODES.COOP, seed: masterSeed });
    const cycleReceipts = [];
    let totalLeaks = 0;
    const allViolations = [];

    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
        // 1. Pick next mode randomly from all 4 modes
        const nextMode = PARTY_MODE_KEYS[Math.floor(rng() * PARTY_MODE_KEYS.length)];
        const stepSeed = Math.floor(rng() * 1000000) + 1;

        // 2. Pollute the current active session heavily before switching
        const currentSession = switcher.getActiveSession();
        const runTicks = 3 + Math.floor(rng() * 15);

        // State pollution fuzzing
        stepSession(currentSession, runTicks, {
            addCoins: 50 + Math.floor(rng() * 300),
            takeDamage: 10 + Math.floor(rng() * 40),
            triggerTarot: rng() > 0.3,
            triggerKraken: rng() > 0.4,
            advanceEndless: currentSession.mode === PARTY_MODES.ENDLESS || rng() > 0.5,
        });

        // 3. Decide whether to trigger mid-frame abort (50% chance)
        const abortMidFrame = rng() > 0.5;
        const abortReason = abortMidFrame
            ? `chaos_abort_cycle_${i}_frame_${currentSession.frameCount}`
            : 'clean_transition';

        // 4. Switch mode
        const switchResult = switcher.switchMode(nextMode, {
            seed: stepSeed,
            abortMidFrame,
            abortReason,
        });

        if (!switchResult.success) {
            totalLeaks++;
            allViolations.push({
                cycle: i + 1,
                fromMode: switchResult.previousSnapshot?.mode,
                toMode: nextMode,
                violations: switchResult.leakage.violations,
            });
        }

        cycleReceipts.push({
            cycle: i + 1,
            fromMode: switchResult.previousSnapshot?.mode,
            toMode: nextMode,
            seed: stepSeed,
            abortedMidFrame: abortMidFrame,
            clean: switchResult.leakage.clean,
            violations: switchResult.leakage.violations,
        });

        if (verbose && (i + 1) % 10 === 0) {
            console.log(`[Torture Tester] Completed ${i + 1}/${iterations} cycles (Leaks: ${totalLeaks})...`);
        }
    }

    switcher.dispose();
    const durationMs = Date.now() - startTime;

    return {
        ok: totalLeaks === 0,
        iterations,
        masterSeed,
        durationMs,
        totalLeaks,
        modesTested: [...PARTY_MODE_KEYS],
        allViolations,
        cycleReceipts,
    };
}
