import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    isRestartKey,
    isRestartGamepadButton,
    isRestartEligible,
    extractPreservedProfile,
    resetRunInMemory,
    InstantRunResetManager,
    RUN_STATUS,
    MAX_RESET_BUDGET_MS,
    RESTART_KEY_CODES,
    RESTART_GAMEPAD_BUTTONS,
} from '../shared/instant-restart.js';
import { PLAYER, WATER_SURFACE_Y, createGameState, addPlayer } from '../shared/game-core.js';
import { GAMEPAD_STANDARD_BUTTONS } from '../shared/input-math.js';

describe('Cockpit 08: 1-Key Instant Run Reset - Trigger Detection', () => {
    it('detects [R] key variations from KeyboardEvent', () => {
        assert.equal(isRestartKey({ code: 'KeyR' }), true);
        assert.equal(isRestartKey({ code: 'keyr' }), true);
        assert.equal(isRestartKey({ key: 'r' }), true);
        assert.equal(isRestartKey({ key: 'R' }), true);
    });

    it('rejects unrelated keyboard keys', () => {
        assert.equal(isRestartKey({ code: 'KeyW' }), false);
        assert.equal(isRestartKey({ code: 'Space' }), false);
        assert.equal(isRestartKey({ code: 'Escape' }), false);
        assert.equal(isRestartKey({ key: 'Enter' }), false);
        assert.equal(isRestartKey(null), false);
        assert.equal(isRestartKey({}), false);
    });

    it('detects Gamepad Start (button 9) and Y / Triangle (button 3)', () => {
        // Direct button index
        assert.equal(isRestartGamepadButton(GAMEPAD_STANDARD_BUTTONS.START), true);
        assert.equal(isRestartGamepadButton(GAMEPAD_STANDARD_BUTTONS.Y), true);
        assert.equal(isRestartGamepadButton(9), true);
        assert.equal(isRestartGamepadButton(3), true);

        // String descriptors
        assert.equal(isRestartGamepadButton('start'), true);
        assert.equal(isRestartGamepadButton('Y'), true);
        assert.equal(isRestartGamepadButton('triangle'), true);

        // Gamepad snapshot object with buttons array
        const mockGamepadStart = {
            buttons: new Array(16).fill(false),
        };
        mockGamepadStart.buttons[9] = { pressed: true, value: 1.0 };
        assert.equal(isRestartGamepadButton(mockGamepadStart), true);

        const mockGamepadY = {
            buttons: new Array(16).fill(false),
        };
        mockGamepadY.buttons[3] = true;
        assert.equal(isRestartGamepadButton(mockGamepadY), true);

        // Gamepad snapshot with named flags
        assert.equal(isRestartGamepadButton({ start: true }), true);
        assert.equal(isRestartGamepadButton({ buttonY: true }), true);
        assert.equal(isRestartGamepadButton({ restart: true }), true);
    });

    it('rejects unrelated gamepad inputs', () => {
        assert.equal(isRestartGamepadButton(GAMEPAD_STANDARD_BUTTONS.A), false);
        assert.equal(isRestartGamepadButton(GAMEPAD_STANDARD_BUTTONS.B), false);
        assert.equal(isRestartGamepadButton(GAMEPAD_STANDARD_BUTTONS.X), false);
        assert.equal(isRestartGamepadButton('a'), false);
        assert.equal(isRestartGamepadButton(null), false);
        assert.equal(isRestartGamepadButton({ buttons: [{ pressed: true }] }), false);
    });
});

describe('Cockpit 08: Reset Eligibility Verification', () => {
    it('allows instant restart on GAME_OVER status or Victory status', () => {
        assert.equal(isRestartEligible({ status: RUN_STATUS.GAME_OVER }), true);
        assert.equal(isRestartEligible({ status: RUN_STATUS.VICTORY }), true);
        assert.equal(isRestartEligible({ isGameOver: true }), true);
        assert.equal(isRestartEligible({ isVictory: true }), true);
        assert.equal(isRestartEligible({ gameWon: true }), true);
    });

    it('allows instant restart when all players in gameState are dead', () => {
        const state = createGameState({ seed: 42 });
        state.gameStarted = true;
        addPlayer(state, 'p1');
        state.players['p1'].isDead = true;

        assert.equal(isRestartEligible({ gameState: state }), true);
    });

    it('blocks instant restart during active gameplay unless force is true', () => {
        const state = createGameState({ seed: 42 });
        state.gameStarted = true;
        addPlayer(state, 'p1');
        state.players['p1'].isDead = false;

        assert.equal(isRestartEligible({ status: RUN_STATUS.ACTIVE, gameState: state }), false);
        assert.equal(isRestartEligible({ status: RUN_STATUS.ACTIVE, gameState: state, force: true }), true);
    });
});

describe('Cockpit 08: Profile Preservation (Cosmetics, Audio, PB Ghost)', () => {
    it('extracts and preserves cosmetic loadout, audio preferences, and PB ghost', () => {
        const mockSession = {
            settings: {
                classId: 'mystic',
                hatId: 'viking_horns',
                playerName: 'Valkyrie River',
                audio: {
                    master: 1.5,
                    music: 0.5,
                    sfx: 1.2,
                    squeakyHammer: 1.8,
                    muted: false,
                },
            },
            color: 0xff00ff,
            pbGhost: {
                finalTimeMs: 124500,
                playerName: 'Valkyrie River',
                checkpoints: { '-150': 12000 },
            },
        };

        const preserved = extractPreservedProfile(mockSession);

        assert.equal(preserved.cosmetics.classId, 'mystic');
        assert.equal(preserved.cosmetics.hatId, 'viking_horns');
        assert.equal(preserved.cosmetics.playerName, 'Valkyrie River');
        assert.equal(preserved.cosmetics.color, 0xff00ff);

        assert.equal(preserved.audio.master, 1.5);
        assert.equal(preserved.audio.squeakyHammer, 1.8);
        assert.equal(preserved.audio.muted, false);

        assert.ok(preserved.pbGhost);
        assert.equal(preserved.pbGhost.finalTimeMs, 124500);
    });

    it('falls back to safe defaults when profile source is empty', () => {
        const preserved = extractPreservedProfile({});
        assert.equal(preserved.cosmetics.classId, 'helmsman');
        assert.equal(preserved.cosmetics.hatId, 'captain_tricorn');
        assert.equal(preserved.cosmetics.playerName, 'Captain River');
        assert.equal(preserved.audio.master, 1.0);
        assert.equal(preserved.pbGhost, null);
    });
});

describe('Cockpit 08: Sub-50ms In-Memory Run Reset Execution', () => {
    it('resets river state, raft physics, enemy pools, and timers in <50ms', () => {
        const profile = extractPreservedProfile({
            settings: {
                classId: 'tinkerer',
                hatId: 'traffic_cone',
                playerName: 'Wrench King',
                audio: { master: 0.9 },
            },
            pbGhost: { finalTimeMs: 98000 },
        });

        const resetResult = resetRunInMemory({
            preservedProfile: profile,
            seed: 777,
            botCount: 2,
        });

        assert.equal(resetResult.success, true);
        assert.ok(resetResult.durationMs <= MAX_RESET_BUDGET_MS, `Reset took ${resetResult.durationMs}ms, exceeded ${MAX_RESET_BUDGET_MS}ms`);
        assert.equal(resetResult.withinBudget, true);

        // Verify Game State Reset
        const gs = resetResult.gameState;
        assert.equal(gs.wave, 1);
        assert.equal(gs.gameStarted, true);
        assert.equal(gs.gameWon, false);

        // Verify Player Reset with preserved cosmetics
        const p1 = gs.players['p1'];
        assert.ok(p1);
        assert.equal(p1.name, 'Wrench King');
        assert.equal(p1.classId, 'tinkerer');
        assert.equal(p1.hatId, 'traffic_cone');
        assert.equal(p1.health, PLAYER.startHealth);
        assert.equal(p1.coins, PLAYER.startCoins);
        assert.equal(p1.isDead, false);
        assert.equal(p1.upgrades.length, 0);
        assert.equal(p1.position.z, 0);

        // Verify Bots
        assert.ok(gs.players['bot_0']);
        assert.ok(gs.players['bot_1']);
        assert.equal(gs.players['bot_0'].isBot, true);

        // Verify Enemy Pools
        assert.equal(gs.enemies.whiteGuy.hasSpawned, false);
        assert.equal(gs.enemies.mudAlien.hasSpawned, false);
        assert.equal(gs.enemies.longWorm.hasSpawned, false);

        // Verify Raft Kinematics Reset
        assert.equal(resetResult.raftPhysics.position.x, 0);
        assert.equal(resetResult.raftPhysics.position.y, WATER_SURFACE_Y);
        assert.equal(resetResult.raftPhysics.position.z, 0);
        assert.equal(resetResult.raftPhysics.velocity.x, 0);
        assert.equal(resetResult.raftPhysics.velocity.y, 0);
        assert.equal(resetResult.raftPhysics.velocity.z, 0);
        assert.equal(resetResult.raftPhysics.yaw, 0);

        // Verify Boss Kraken and Tarot reset
        assert.equal(resetResult.krakenState.isSpawned, false);
        assert.equal(Object.keys(resetResult.tarotState.blessings).length, 0);

        // Verify Preserved Profile Intact
        assert.equal(resetResult.preservedProfile.pbGhost.finalTimeMs, 98000);
        assert.equal(resetResult.preservedProfile.audio.master, 0.9);
    });

    it('benchmarks 100 consecutive in-memory resets ensuring every single reset stays <50ms', () => {
        const profile = extractPreservedProfile({
            settings: { hatId: 'giant_frog_hat' },
        });

        for (let i = 0; i < 100; i++) {
            const res = resetRunInMemory({
                preservedProfile: profile,
                seed: i + 1,
            });
            assert.ok(res.durationMs < MAX_RESET_BUDGET_MS, `Iteration ${i} reset duration ${res.durationMs}ms >= ${MAX_RESET_BUDGET_MS}ms`);
            assert.equal(res.gameState.wave, 1);
        }
    });
});

describe('Cockpit 08: InstantRunResetManager Controller Lifecycle', () => {
    it('initializes manager and controls status transitions', () => {
        const manager = new InstantRunResetManager({
            botCount: 2,
            seed: 99,
        });

        assert.equal(manager.status, RUN_STATUS.ACTIVE);
        assert.equal(manager.isEligible(), false);

        manager.setGameOver();
        assert.equal(manager.status, RUN_STATUS.GAME_OVER);
        assert.equal(manager.isEligible(), true);

        manager.setVictory();
        assert.equal(manager.status, RUN_STATUS.VICTORY);
        assert.equal(manager.isEligible(), true);

        manager.setActive();
        assert.equal(manager.status, RUN_STATUS.ACTIVE);
        assert.equal(manager.isEligible(), false);
    });

    it('triggers reset on [R] key press when eligible and invokes onReset callback', () => {
        let callbackResult = null;
        const manager = new InstantRunResetManager({
            onReset: (res) => {
                callbackResult = res;
            },
        });

        // Try while active -> blocked
        let res = manager.triggerReset();
        assert.equal(res, null);
        assert.equal(callbackResult, null);

        // Set game over and simulate [R] keydown event
        manager.setGameOver();
        let defaultPrevented = false;
        const mockEvent = {
            code: 'KeyR',
            preventDefault: () => { defaultPrevented = true; },
            stopPropagation: () => {},
        };

        manager._handleKeyDown(mockEvent);

        assert.equal(defaultPrevented, true);
        assert.ok(callbackResult);
        assert.equal(callbackResult.success, true);
        assert.equal(manager.status, RUN_STATUS.ACTIVE);
        assert.equal(manager.getStats().resetCount, 1);
        assert.ok(manager.getStats().lastResetDurationMs <= MAX_RESET_BUDGET_MS);
    });

    it('triggers reset on Gamepad Start button when game is over', () => {
        let resetFired = false;
        const manager = new InstantRunResetManager({
            onReset: () => { resetFired = true; },
        });

        manager.setGameOver();
        const handled = manager.handleGamepadInput({ start: true });

        assert.equal(handled, true);
        assert.equal(resetFired, true);
        assert.equal(manager.status, RUN_STATUS.ACTIVE);
    });

    it('disables manager cleanly via dispose()', () => {
        let called = false;
        const manager = new InstantRunResetManager({
            onReset: () => { called = true; },
        });

        manager.setGameOver();
        manager.dispose();

        assert.equal(manager.enabled, false);
        assert.equal(manager.triggerReset(), null);
        assert.equal(called, false);
    });
});
