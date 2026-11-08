import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveEscapeKeyAction,
    createSingleDispatchKeyGuard,
    ESCAPE_ACTIONS,
} from '../shared/modal-and-keybind-router.js';

describe('Modal & Keybind Router: [Esc] Priority Hierarchy (resolveEscapeKeyAction)', () => {
    it('Priority 1: returns close_armory when isArmoryOpen is true regardless of other modals', () => {
        // Armory open alone
        assert.deepEqual(resolveEscapeKeyAction({ isArmoryOpen: true }), {
            action: ESCAPE_ACTIONS.CLOSE_ARMORY,
        });

        // Armory open while Photo Mode, Settings, and Title are also active
        assert.deepEqual(
            resolveEscapeKeyAction({
                isArmoryOpen: true,
                isPhotoModeActive: true,
                isSettingsOpen: true,
                isTitleVisible: true,
            }),
            { action: ESCAPE_ACTIONS.CLOSE_ARMORY }
        );
    });

    it('Priority 2: returns exit_photo_mode when isPhotoModeActive is true and isArmoryOpen is false', () => {
        // Photo Mode active alone
        assert.deepEqual(resolveEscapeKeyAction({ isPhotoModeActive: true }), {
            action: ESCAPE_ACTIONS.EXIT_PHOTO_MODE,
        });

        // Photo Mode active while Settings and Title are also active
        assert.deepEqual(
            resolveEscapeKeyAction({
                isArmoryOpen: false,
                isPhotoModeActive: true,
                isSettingsOpen: true,
                isTitleVisible: true,
            }),
            { action: ESCAPE_ACTIONS.EXIT_PHOTO_MODE }
        );
    });

    it('Priority 3: returns close_settings when isSettingsOpen is true and Armory/Photo are false', () => {
        // Settings open alone
        assert.deepEqual(resolveEscapeKeyAction({ isSettingsOpen: true }), {
            action: ESCAPE_ACTIONS.CLOSE_SETTINGS,
        });

        // Settings open while Title is visible
        assert.deepEqual(
            resolveEscapeKeyAction({
                isArmoryOpen: false,
                isPhotoModeActive: false,
                isSettingsOpen: true,
                isTitleVisible: true,
            }),
            { action: ESCAPE_ACTIONS.CLOSE_SETTINGS }
        );
    });

    it('Priority 4: returns open_settings when no higher-priority modals are open', () => {
        // Empty parameter
        assert.deepEqual(resolveEscapeKeyAction(), {
            action: ESCAPE_ACTIONS.OPEN_SETTINGS,
        });

        // Explicit empty object
        assert.deepEqual(resolveEscapeKeyAction({}), {
            action: ESCAPE_ACTIONS.OPEN_SETTINGS,
        });

        // All modals false
        assert.deepEqual(
            resolveEscapeKeyAction({
                isArmoryOpen: false,
                isPhotoModeActive: false,
                isSettingsOpen: false,
                isTitleVisible: false,
            }),
            { action: ESCAPE_ACTIONS.OPEN_SETTINGS }
        );

        // Title visible but no modal open
        assert.deepEqual(
            resolveEscapeKeyAction({
                isArmoryOpen: false,
                isPhotoModeActive: false,
                isSettingsOpen: false,
                isTitleVisible: true,
            }),
            { action: ESCAPE_ACTIONS.OPEN_SETTINGS }
        );
    });

    it('handles truthy/falsy non-boolean values safely without crashing', () => {
        assert.deepEqual(
            resolveEscapeKeyAction({ isArmoryOpen: 1 }),
            { action: ESCAPE_ACTIONS.CLOSE_ARMORY }
        );
        assert.deepEqual(
            resolveEscapeKeyAction({ isArmoryOpen: 0, isPhotoModeActive: 'yes' }),
            { action: ESCAPE_ACTIONS.EXIT_PHOTO_MODE }
        );
        assert.deepEqual(
            resolveEscapeKeyAction({ isArmoryOpen: null, isPhotoModeActive: undefined, isSettingsOpen: {} }),
            { action: ESCAPE_ACTIONS.CLOSE_SETTINGS }
        );
    });
});

describe('Single-Dispatch Key Guard (createSingleDispatchKeyGuard)', () => {
    it('initializes with default debounce of 80ms', () => {
        const guard = createSingleDispatchKeyGuard();
        assert.equal(guard.getDebounceMs(), 80);
    });

    it('accepts custom debounce duration and sanitizes invalid values', () => {
        const customGuard = createSingleDispatchKeyGuard(120);
        assert.equal(customGuard.getDebounceMs(), 120);

        const invalidGuard = createSingleDispatchKeyGuard(-50);
        assert.equal(invalidGuard.getDebounceMs(), 80);

        const nanGuard = createSingleDispatchKeyGuard(NaN);
        assert.equal(nanGuard.getDebounceMs(), 80);
    });

    it('solves double-listener bug: suppresses duplicate key dispatch in the same frame (nowMs delta < debounceMs)', () => {
        const guard = createSingleDispatchKeyGuard(80);
        const t0 = 1000;

        // Listener 1 (e.g. photo-and-awards.js) processes [P] at t0
        assert.equal(guard.shouldProcess('p', t0), true, 'First listener should process [P]');

        // Listener 2 (e.g. aaa-fever-director.js) fires in the same frame at t0 (dt = 0ms)
        assert.equal(guard.shouldProcess('p', t0), false, 'Duplicate listener in same frame MUST be blocked');

        // Microtask / slight hitch at t0 + 16ms (1 frame at 60fps)
        assert.equal(guard.shouldProcess('p', t0 + 16), false, 'Rapid repeat within debounce must be blocked');

        // After debounce period (t0 + 85ms > 80ms)
        assert.equal(guard.shouldProcess('p', t0 + 85), true, 'Subsequent deliberate press after debounce must pass');
    });

    it('tracks different keys independently without cross-blocking', () => {
        const guard = createSingleDispatchKeyGuard(80);
        const t0 = 2000;

        // Press 'p'
        assert.equal(guard.shouldProcess('p', t0), true);
        assert.equal(guard.shouldProcess('p', t0 + 10), false);

        // Press 'b' (Armory) at the same time
        assert.equal(guard.shouldProcess('b', t0 + 10), true, 'Different key [B] should not be blocked by [P]');
        assert.equal(guard.shouldProcess('b', t0 + 20), false, 'Immediate duplicate [B] should be blocked');

        // Press 'Escape'
        assert.equal(guard.shouldProcess('Escape', t0 + 30), true, 'Escape should process independently');
    });

    it('normalizes key casing and whitespace', () => {
        const guard = createSingleDispatchKeyGuard(80);
        const t0 = 3000;

        assert.equal(guard.shouldProcess('P', t0), true);
        assert.equal(guard.shouldProcess('p', t0 + 10), false, 'Lowercase "p" should match uppercase "P"');
        assert.equal(guard.shouldProcess(' P ', t0 + 20), false, 'Whitespace-padded " P " should match');
    });

    it('handles invalid or non-string key inputs defensively', () => {
        const guard = createSingleDispatchKeyGuard(80);
        assert.equal(guard.shouldProcess(null), false);
        assert.equal(guard.shouldProcess(undefined), false);
        assert.equal(guard.shouldProcess(''), false);
        assert.equal(guard.shouldProcess(123), false);
        assert.equal(guard.shouldProcess({}), false);
    });

    it('supports resetKey and resetAll for deterministic test / lifecycle teardown', () => {
        const guard = createSingleDispatchKeyGuard(80);
        const t0 = 4000;

        assert.equal(guard.shouldProcess('p', t0), true);
        assert.equal(guard.shouldProcess('p', t0 + 10), false);

        // Reset key 'p'
        guard.resetKey('p');
        assert.equal(guard.shouldProcess('p', t0 + 15), true, 'Reset key allows immediate re-dispatch');

        // Dispatch multiple keys
        assert.equal(guard.shouldProcess('b', t0 + 20), true);
        assert.equal(guard.shouldProcess('b', t0 + 25), false);

        guard.resetAll();
        assert.equal(guard.shouldProcess('b', t0 + 30), true, 'resetAll allows immediate re-dispatch of all keys');
    });

    it('tracks lastDispatched timestamp query accurately', () => {
        const guard = createSingleDispatchKeyGuard(80);
        assert.equal(guard.getLastDispatched('p'), -1);

        guard.shouldProcess('p', 5000);
        assert.equal(guard.getLastDispatched('p'), 5000);
        assert.equal(guard.getLastDispatched('P'), 5000); // Case-insensitive query
        assert.equal(guard.getLastDispatched('unknown'), -1);
    });
});
