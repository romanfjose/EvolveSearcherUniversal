import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    PARTY_MODES,
    PARTY_MODE_KEYS,
    INITIAL_STATE_BASELINES,
    createPartySession,
    captureStateSnapshot,
    stepSession,
    abortSession,
    teardownSession,
    verifyZeroStateLeakage,
    PartyModeSwitcher,
    runModeSwitchingTortureTest,
    createRng,
} from '../shared/qa-mode-switcher.js';
import { PLAYER } from '../shared/game-core.js';
import { TAROT_CARD_IDS, applyTarotBlessing } from '../shared/dream-tarot.js';
import { spawnKraken, damageKraken } from '../shared/boss-kraken.js';

describe('QA Breaker 05: Mode Switcher - Constants & Setup', () => {
    it('defines all 4 required party modes', () => {
        assert.equal(PARTY_MODES.COOP, 'coop');
        assert.equal(PARTY_MODES.DAILY, 'daily');
        assert.equal(PARTY_MODES.SPLITSCREEN, 'splitscreen');
        assert.equal(PARTY_MODES.ENDLESS, 'endless');

        assert.deepEqual(PARTY_MODE_KEYS, ['coop', 'daily', 'splitscreen', 'endless']);
    });

    it('defines initial state baselines matching core game standards', () => {
        assert.equal(INITIAL_STATE_BASELINES.coins, PLAYER.startCoins);
        assert.equal(INITIAL_STATE_BASELINES.health, PLAYER.startHealth);
        assert.equal(INITIAL_STATE_BASELINES.wave, 1);
        assert.equal(INITIAL_STATE_BASELINES.krakenSpawned, false);
        assert.equal(INITIAL_STATE_BASELINES.krakenDefeated, false);
        assert.equal(INITIAL_STATE_BASELINES.krakenHpRatio, 1.0);
        assert.equal(INITIAL_STATE_BASELINES.tarotBlessingCount, 0);
        assert.equal(INITIAL_STATE_BASELINES.endlessLoopCounter, 0);
        assert.equal(INITIAL_STATE_BASELINES.sectorsCleared, 0);
    });

    it('rejects invalid party mode names on session creation', () => {
        assert.throws(() => {
            createPartySession('battle_royale');
        }, /Invalid party mode/);
        assert.throws(() => {
            createPartySession('');
        }, /Invalid party mode/);
    });
});

describe('QA Breaker 05: Mode Specific Session Initialization', () => {
    it('initializes coop mode with captain and companion bots', () => {
        const session = createPartySession(PARTY_MODES.COOP, { seed: 101, botCount: 2 });
        assert.equal(session.mode, 'coop');
        assert.equal(session.status, 'active');
        assert.ok(session.gameState.players['p1']);
        assert.equal(session.gameState.players['p1'].isBot, false);
        assert.ok(session.gameState.players['bot_0']);
        assert.ok(session.gameState.players['bot_1']);
        assert.equal(session.gameState.players['bot_0'].isBot, true);

        const snap = captureStateSnapshot(session);
        assert.equal(snap.coins, PLAYER.startCoins);
        assert.equal(snap.health, PLAYER.startHealth);
        assert.equal(snap.wave, 1);
        assert.equal(snap.krakenSpawned, false);
        assert.equal(snap.tarotBlessingCount, 0);
        assert.equal(snap.endlessLoopCounter, 0);
    });

    it('initializes splitscreen mode with Player 1 and Player 2', () => {
        const session = createPartySession(PARTY_MODES.SPLITSCREEN, { seed: 202 });
        assert.equal(session.mode, 'splitscreen');
        assert.ok(session.gameState.players['p1']);
        assert.ok(session.gameState.players['p2']);
        assert.equal(session.gameState.players['p1'].isBot, false);
        assert.equal(session.gameState.players['p2'].isBot, false);

        const snap = captureStateSnapshot(session);
        assert.equal(snap.coins, PLAYER.startCoins);
        assert.equal(snap.health, PLAYER.startHealth);
        assert.equal(snap.wave, 1);
    });

    it('initializes daily mode with seeded daily challenge mutator', () => {
        const session = createPartySession(PARTY_MODES.DAILY, { seed: 55555 });
        assert.equal(session.mode, 'daily');
        assert.ok(session.dailyMutator);
        assert.ok(session.dailyMutator.name);

        const snap = captureStateSnapshot(session);
        assert.equal(snap.coins, PLAYER.startCoins);
        assert.ok(snap.health > 0);
        assert.equal(snap.wave, 1);
    });

    it('initializes endless mode with dedicated EndlessSession controller', () => {
        const session = createPartySession(PARTY_MODES.ENDLESS, { seed: 9999 });
        assert.equal(session.mode, 'endless');
        assert.ok(session.endlessSession);
        assert.equal(session.endlessSession.currentSectorIndex, 0);

        const snap = captureStateSnapshot(session);
        assert.equal(snap.coins, PLAYER.startCoins);
        assert.equal(snap.health, PLAYER.startHealth);
        assert.equal(snap.endlessLoopCounter, 0);
        assert.equal(snap.sectorsCleared, 0);
    });
});

describe('QA Breaker 05: Session Stepping, Fuzzing & Mid-Frame Aborts', () => {
    it('steps simulation and advances frameCount and elapsedMs', () => {
        const session = createPartySession(PARTY_MODES.COOP, { seed: 100 });
        assert.equal(session.frameCount, 0);
        assert.equal(session.elapsedMs, 0);

        stepSession(session, 5);
        assert.equal(session.frameCount, 5);
        assert.equal(session.elapsedMs, 250);
    });

    it('pollutes session state when fuzz actions are provided', () => {
        const session = createPartySession(PARTY_MODES.COOP, { seed: 200 });
        const snapBefore = captureStateSnapshot(session);

        stepSession(session, 10, {
            addCoins: 250,
            takeDamage: 30,
            triggerTarot: true,
            triggerKraken: true,
        });

        const snapAfter = captureStateSnapshot(session);
        assert.ok(snapAfter.coins > snapBefore.coins, 'Coins should be polluted');
        assert.ok(snapAfter.health < snapBefore.health, 'Health should be reduced by damage');
        assert.ok(snapAfter.tarotBlessingCount > 0, 'Tarot blessings should be acquired');
        assert.equal(snapAfter.krakenSpawned, true, 'Kraken should be spawned');
        assert.ok(snapAfter.krakenHpRatio < 1.0, 'Kraken should take damage');
    });

    it('aborts session mid-frame cleanly and records abort metadata', () => {
        const session = createPartySession(PARTY_MODES.DAILY, { seed: 300 });
        stepSession(session, 7);

        const abortResult = abortSession(session, 'test_user_escape');
        assert.equal(abortResult.ok, true);
        assert.equal(abortResult.abortedAtFrame, 7);
        assert.equal(session.status, 'aborted');
        assert.equal(session.abortReason, 'test_user_escape');

        // Subsequent steps should do nothing
        stepSession(session, 10);
        assert.equal(session.frameCount, 7);
    });

    it('tears down session cleanly releasing player and boss handles', () => {
        const session = createPartySession(PARTY_MODES.ENDLESS, { seed: 400 });
        stepSession(session, 4, { triggerKraken: true });

        const teardownOk = teardownSession(session);
        assert.equal(teardownOk, true);
        assert.equal(session.status, 'torn_down');
        assert.equal(Object.keys(session.gameState.players).length, 0);
        assert.equal(session.endlessSession, null);
    });
});

describe('QA Breaker 05: State Leakage Detection (The Saboteur Detector)', () => {
    it('detects no leakage in a pristine fresh session', () => {
        const session = createPartySession(PARTY_MODES.COOP, { seed: 10 });
        const leakage = verifyZeroStateLeakage(session);
        assert.equal(leakage.clean, true);
        assert.equal(leakage.violations.length, 0);
    });

    it('detects coin leakage if a session is contaminated with prior coins', () => {
        const session = createPartySession(PARTY_MODES.COOP, { seed: 11 });
        session.gameState.players['p1'].coins = 999; // Corrupt coins!

        const leakage = verifyZeroStateLeakage(session);
        assert.equal(leakage.clean, false);
        assert.ok(leakage.violations.some((v) => v.includes('Coins leaked')));
    });

    it('detects wave leakage if wave counter fails to reset', () => {
        const session = createPartySession(PARTY_MODES.SPLITSCREEN, { seed: 12 });
        session.gameState.wave = 7; // Corrupt wave!

        const leakage = verifyZeroStateLeakage(session);
        assert.equal(leakage.clean, false);
        assert.ok(leakage.violations.some((v) => v.includes('Wave index leaked')));
    });

    it('detects kraken leakage if boss state is retained from previous battle', () => {
        const session = createPartySession(PARTY_MODES.DAILY, { seed: 13 });
        session.krakenState.isSpawned = true; // Corrupt boss state!

        const leakage = verifyZeroStateLeakage(session);
        assert.equal(leakage.clean, false);
        assert.ok(leakage.violations.some((v) => v.includes('Kraken spawn state leaked')));
    });

    it('detects tarot blessing leakage if previous buffs carry over', () => {
        const session = createPartySession(PARTY_MODES.ENDLESS, { seed: 14 });
        applyTarotBlessing(session.tarotState, TAROT_CARD_IDS.CAFFEINATED_OARS);

        const leakage = verifyZeroStateLeakage(session);
        assert.equal(leakage.clean, false);
        assert.ok(leakage.violations.some((v) => v.includes('Tarot blessings leaked')));
    });

    it('detects endless loop counter leakage if sector index carries over', () => {
        const session = createPartySession(PARTY_MODES.ENDLESS, { seed: 15 });
        session.endlessSession.currentSectorIndex = 4; // Corrupt sector!

        const leakage = verifyZeroStateLeakage(session);
        assert.equal(leakage.clean, false);
        assert.ok(leakage.violations.some((v) => v.includes('Endless sector index leaked')));
    });
});

describe('QA Breaker 05: PartyModeSwitcher Controller Lifecycle', () => {
    it('switches between party modes cleanly with mid-frame aborts', () => {
        const switcher = new PartyModeSwitcher({ initialMode: PARTY_MODES.COOP, seed: 1337 });
        assert.equal(switcher.currentMode, PARTY_MODES.COOP);

        // Dirty session 1
        stepSession(switcher.getActiveSession(), 10, { addCoins: 300, triggerKraken: true });

        // Switch to Daily with mid-frame abort
        const switch1 = switcher.switchMode(PARTY_MODES.DAILY, { abortMidFrame: true });
        assert.equal(switch1.success, true);
        assert.equal(switcher.currentMode, PARTY_MODES.DAILY);
        assert.equal(switch1.leakage.clean, true);
        assert.equal(switch1.newSnapshot.coins, PLAYER.startCoins);
        assert.equal(switch1.newSnapshot.krakenSpawned, false);

        // Switch to Splitscreen
        const switch2 = switcher.switchMode(PARTY_MODES.SPLITSCREEN, { abortMidFrame: false });
        assert.equal(switch2.success, true);
        assert.equal(switcher.currentMode, PARTY_MODES.SPLITSCREEN);
        assert.equal(switch2.leakage.clean, true);

        // Switch to Endless
        const switch3 = switcher.switchMode(PARTY_MODES.ENDLESS, { abortMidFrame: true });
        assert.equal(switch3.success, true);
        assert.equal(switcher.currentMode, PARTY_MODES.ENDLESS);
        assert.equal(switch3.leakage.clean, true);

        switcher.dispose();
    });
});

describe('QA Breaker 05: 50-Cycle Rapid Mode Switching Torture Test', () => {
    it('rapidly cycles game sessions across all 4 modes 50 times in a row with zero state leakage', () => {
        const report = runModeSwitchingTortureTest({
            iterations: 50,
            masterSeed: 777888,
            verbose: false,
        });

        assert.equal(report.ok, true, `Torture test failed with ${report.totalLeaks} leaks: ${JSON.stringify(report.allViolations)}`);
        assert.equal(report.iterations, 50);
        assert.equal(report.totalLeaks, 0);
        assert.equal(report.allViolations.length, 0);
        assert.equal(report.cycleReceipts.length, 50);

        // Verify all 4 modes were exercised
        const encounteredModes = new Set(report.cycleReceipts.map((c) => c.toMode));
        for (const mode of PARTY_MODE_KEYS) {
            assert.ok(encounteredModes.has(mode), `Mode "${mode}" should have been exercised during torture test`);
        }

        // Verify mid-frame aborts occurred during the test
        const abortCount = report.cycleReceipts.filter((c) => c.abortedMidFrame).length;
        assert.ok(abortCount >= 10, `Expected at least 10 mid-frame aborts, got ${abortCount}`);

        // Verify every single cycle has clean: true
        for (const cycle of report.cycleReceipts) {
            assert.equal(cycle.clean, true, `Cycle ${cycle.cycle} from ${cycle.fromMode} to ${cycle.toMode} leaked state`);
            assert.equal(cycle.violations.length, 0);
        }
    });

    it('passes torture test deterministically across different master seeds', () => {
        for (const seed of [12345, 99999, 42069]) {
            const report = runModeSwitchingTortureTest({
                iterations: 20,
                masterSeed: seed,
            });
            assert.equal(report.ok, true, `Torture test failed on seed ${seed}`);
            assert.equal(report.totalLeaks, 0);
        }
    });
});
