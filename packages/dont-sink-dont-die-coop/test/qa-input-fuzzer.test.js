import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    MODAL_TYPES,
    ORDER_COMMANDS,
    createUiStateFuzzer,
    generateChaosBurstSequence,
    runImpatientHumanFuzzCampaign,
} from '../shared/qa-input-fuzzer.js';

describe('Impatient-Human Input Chaos Fuzzer ("Where\'s the Bathroom?" Breaker)', () => {
    test('initializes cleanly in Title modal state by default', () => {
        const fuzzer = createUiStateFuzzer();
        assert.equal(fuzzer.getCurrentModal(), MODAL_TYPES.TITLE);
        assert.equal(fuzzer.isGameplayActive(), false);

        const snap = fuzzer.getStateSnapshot();
        assert.equal(snap.activeModal, MODAL_TYPES.TITLE);
        assert.equal(snap.hasModalOpen, true);
        assert.equal(snap.gameStarted, false);
    });

    test('supports starting immediately in active gameplay when specified', () => {
        const fuzzer = createUiStateFuzzer({ gameStarted: true });
        assert.equal(fuzzer.getCurrentModal(), MODAL_TYPES.NONE);
        assert.equal(fuzzer.isGameplayActive(), true);
    });

    test('verifies at most one modal overlay traps focus at any time', () => {
        const fuzzer = createUiStateFuzzer({ gameStarted: true });

        // Open Armory (B)
        fuzzer.dispatchAction('b');
        assert.equal(fuzzer.getCurrentModal(), MODAL_TYPES.ARMORY);

        // Open Photo Mode (P) while Armory is open -> replaces modal focus cleanly
        fuzzer.dispatchAction('p');
        assert.equal(fuzzer.getCurrentModal(), MODAL_TYPES.PHOTO_MODE);

        // Checkpoint Tarot draft triggers -> replaces modal focus cleanly
        fuzzer.dispatchAction('open_tarot');
        assert.equal(fuzzer.getCurrentModal(), MODAL_TYPES.TAROT);

        // Settings opens -> replaces focus
        fuzzer.dispatchAction('settings');
        assert.equal(fuzzer.getCurrentModal(), MODAL_TYPES.SETTINGS);

        // Assert zero invariant violations
        assert.equal(fuzzer.getViolations().length, 0);
    });

    test('handles double-clicking Start Game smoothly without duplicate state corruption', () => {
        const fuzzer = createUiStateFuzzer({ initialModal: MODAL_TYPES.TITLE });
        assert.equal(fuzzer.getCurrentModal(), MODAL_TYPES.TITLE);

        // Rapid double click on Start Game button
        fuzzer.dispatchAction('click_start');
        fuzzer.dispatchAction('click_start');

        assert.equal(fuzzer.getCurrentModal(), MODAL_TYPES.NONE);
        assert.equal(fuzzer.isGameplayActive(), true);
        assert.equal(fuzzer.getViolations().length, 0);
    });

    test('pressing Esc always dismisses any active modal and restores clean gameplay control', () => {
        const modals = [
            MODAL_TYPES.ARMORY,
            MODAL_TYPES.TAROT,
            MODAL_TYPES.PHOTO_MODE,
            MODAL_TYPES.SETTINGS,
        ];

        for (const modal of modals) {
            const fuzzer = createUiStateFuzzer({ gameStarted: true });
            if (modal === MODAL_TYPES.ARMORY) fuzzer.dispatchAction('b');
            else if (modal === MODAL_TYPES.PHOTO_MODE) fuzzer.dispatchAction('p');
            else if (modal === MODAL_TYPES.TAROT) fuzzer.dispatchAction('open_tarot');
            else if (modal === MODAL_TYPES.SETTINGS) fuzzer.dispatchAction('settings');

            assert.equal(fuzzer.getCurrentModal(), modal);

            // Press Esc
            fuzzer.dispatchAction('esc');
            assert.equal(fuzzer.getCurrentModal(), MODAL_TYPES.NONE);
            assert.equal(fuzzer.isGameplayActive(), true);

            // Steering control is fully responsive after Esc
            fuzzer.dispatchAction('steer_left');
            assert.equal(fuzzer.getStateSnapshot().inputState.steering, -1);

            fuzzer.dispatchAction('steer_right');
            assert.equal(fuzzer.getStateSnapshot().inputState.steering, 1);

            fuzzer.dispatchAction('steer_neutral');
            assert.equal(fuzzer.getStateSnapshot().inputState.steering, 0);
        }
    });

    test('simulates simultaneous key spamming inside 500ms bursts (Space + B + Esc + P + Z/X/C/V + 1/2/3)', () => {
        const fuzzer = createUiStateFuzzer({ gameStarted: true });

        const burstInputs = [
            'space', // kickflip
            'b',     // armory
            'esc',   // settings / dismiss
            'p',     // photo mode
            'z',     // order focus boss
            'x',     // order defend raft
            'c',     // order scavenge
            'v',     // order race checkpoint
            '1',     // tarot / hotkey 1
            '2',     // tarot / hotkey 2
            '3',     // tarot / hotkey 3
        ];

        const outcome = fuzzer.simulateInputBurst(burstInputs, 500);
        assert.equal(outcome.actionCount, burstInputs.length);
        assert.equal(outcome.windowMs, 500);

        // Invariant holds: at most one modal open, zero violations
        const snap = fuzzer.getStateSnapshot();
        const validModals = Object.values(MODAL_TYPES);
        assert.ok(validModals.includes(snap.activeModal));
        assert.equal(fuzzer.getViolations().length, 0);
    });

    test('generates deterministic chaos sequences across multiple bursts', () => {
        const seq1 = generateChaosBurstSequence({ count: 5, burstSize: 10, seed: 999 });
        const seq2 = generateChaosBurstSequence({ count: 5, burstSize: 10, seed: 999 });

        assert.equal(seq1.length, 5);
        assert.equal(seq1[0].length, 10);
        assert.deepEqual(seq1, seq2);
    });

    test('runs an extensive Impatient-Human Fuzz campaign with 100% green verdict', () => {
        const campaign = runImpatientHumanFuzzCampaign({
            batchCount: 40,
            burstSize: 20,
            seed: 777,
        });

        assert.equal(campaign.passed, true);
        assert.equal(campaign.violationsCount, 0);
        assert.equal(campaign.violations.length, 0);
        assert.ok(campaign.totalInputs >= 800);
        assert.ok(campaign.escRecoveries > 10);
        assert.ok(campaign.receipt.includes('Status: PASSED'));
    });
});
