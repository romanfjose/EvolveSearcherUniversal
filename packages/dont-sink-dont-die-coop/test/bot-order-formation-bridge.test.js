import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    BOT_COMMAND_IDS,
    createBotOrderState,
    getBotOrderBark,
} from '../shared/bot-orders.js';

import {
    KEY_TO_BOT_ORDER,
    dispatchBotOrderByKey,
    computeWingmanOrderedTarget,
} from '../shared/bot-order-formation-bridge.js';

describe('Tactical Bot Order Keybind & Wingman Formation Bridge', () => {
    describe('KEY_TO_BOT_ORDER keybind mappings', () => {
        it('maps z/x/c/v hotkeys to valid BOT_COMMAND_IDS', () => {
            assert.equal(KEY_TO_BOT_ORDER['z'], BOT_COMMAND_IDS.FOCUS_FIRE);
            assert.equal(KEY_TO_BOT_ORDER['x'], BOT_COMMAND_IDS.FORM_UP);
            assert.equal(KEY_TO_BOT_ORDER['c'], BOT_COMMAND_IDS.SCAVENGE);
            assert.equal(KEY_TO_BOT_ORDER['v'], BOT_COMMAND_IDS.RUSH_CHECKPOINT);

            assert.equal(KEY_TO_BOT_ORDER['Z'], BOT_COMMAND_IDS.FOCUS_FIRE);
            assert.equal(KEY_TO_BOT_ORDER['X'], BOT_COMMAND_IDS.FORM_UP);
            assert.equal(KEY_TO_BOT_ORDER['C'], BOT_COMMAND_IDS.SCAVENGE);
            assert.equal(KEY_TO_BOT_ORDER['V'], BOT_COMMAND_IDS.RUSH_CHECKPOINT);
        });

        it('maps numbers 1/2/3/4 to valid BOT_COMMAND_IDS', () => {
            assert.equal(KEY_TO_BOT_ORDER['1'], BOT_COMMAND_IDS.FOCUS_FIRE);
            assert.equal(KEY_TO_BOT_ORDER['2'], BOT_COMMAND_IDS.FORM_UP);
            assert.equal(KEY_TO_BOT_ORDER['3'], BOT_COMMAND_IDS.SCAVENGE);
            assert.equal(KEY_TO_BOT_ORDER['4'], BOT_COMMAND_IDS.RUSH_CHECKPOINT);
        });

        it('supports KeyboardEvent code strings like KeyZ, KeyX, KeyC, KeyV, Digit1-4', () => {
            assert.equal(KEY_TO_BOT_ORDER['KeyZ'], BOT_COMMAND_IDS.FOCUS_FIRE);
            assert.equal(KEY_TO_BOT_ORDER['KeyX'], BOT_COMMAND_IDS.FORM_UP);
            assert.equal(KEY_TO_BOT_ORDER['KeyC'], BOT_COMMAND_IDS.SCAVENGE);
            assert.equal(KEY_TO_BOT_ORDER['KeyV'], BOT_COMMAND_IDS.RUSH_CHECKPOINT);

            assert.equal(KEY_TO_BOT_ORDER['Digit1'], BOT_COMMAND_IDS.FOCUS_FIRE);
            assert.equal(KEY_TO_BOT_ORDER['Digit2'], BOT_COMMAND_IDS.FORM_UP);
            assert.equal(KEY_TO_BOT_ORDER['Digit3'], BOT_COMMAND_IDS.SCAVENGE);
            assert.equal(KEY_TO_BOT_ORDER['Digit4'], BOT_COMMAND_IDS.RUSH_CHECKPOINT);
        });
    });

    describe('dispatchBotOrderByKey', () => {
        it('dispatches valid order and returns commandId, bark, and issued flag', () => {
            const state = createBotOrderState();
            const res = dispatchBotOrderByKey(state, 'z', 1000);

            assert.equal(res.issued, true);
            assert.equal(res.commandId, BOT_COMMAND_IDS.FOCUS_FIRE);
            assert.equal(typeof res.bark, 'string');
            assert.ok(res.bark.length > 0);
            assert.equal(res.bark, getBotOrderBark(BOT_COMMAND_IDS.FOCUS_FIRE, 0, false));
            assert.equal(state.activeOrder?.id, BOT_COMMAND_IDS.FOCUS_FIRE);
        });

        it('dispatches through numerical keys 1-4', () => {
            const state = createBotOrderState();
            const res = dispatchBotOrderByKey(state, '2', 2000);

            assert.equal(res.issued, true);
            assert.equal(res.commandId, BOT_COMMAND_IDS.FORM_UP);
            assert.equal(state.activeOrder?.id, BOT_COMMAND_IDS.FORM_UP);
        });

        it('handles unmapped keys gracefully', () => {
            const state = createBotOrderState();
            const res = dispatchBotOrderByKey(state, 'p', 1000);

            assert.equal(res.issued, false);
            assert.equal(res.commandId, null);
            assert.equal(res.bark, null);
            assert.equal(res.reason, 'unmapped-key');
        });

        it('handles null/undefined key or null state gracefully', () => {
            const state = createBotOrderState();
            assert.equal(dispatchBotOrderByKey(state, null, 1000).issued, false);
            assert.equal(dispatchBotOrderByKey(state, undefined, 1000).issued, false);
            assert.equal(dispatchBotOrderByKey(null, 'z', 1000).issued, false);
        });

        it('respects cooldowns by default on rapid re-press of the same order', () => {
            const state = createBotOrderState();
            const first = dispatchBotOrderByKey(state, 'z', 1000);
            assert.equal(first.issued, true);

            // Immediate re-press of 'z'
            const second = dispatchBotOrderByKey(state, 'z', 1500);
            assert.equal(second.issued, false);
            assert.equal(second.reason, 'cooldown-active');
            assert.ok(second.remainingCooldown > 0);
        });

        it('bypasses cooldown when ignoreCooldown is true for instant hotkey switching', () => {
            const state = createBotOrderState();
            const first = dispatchBotOrderByKey(state, 'z', 1000);
            assert.equal(first.issued, true);

            // Re-press with ignoreCooldown: true
            const second = dispatchBotOrderByKey(state, 'z', 1500, { ignoreCooldown: true });
            assert.equal(second.issued, true);
            assert.equal(second.commandId, BOT_COMMAND_IDS.FOCUS_FIRE);
        });

        it('passes issuer and bot descriptors to issueBotOrder generating bubbles', () => {
            const state = createBotOrderState();
            const issuer = { id: 'p1', name: 'Commander', position: { x: 5, y: 0.25, z: -10 } };
            const bots = [
                { id: 'b0', name: 'Wingman 1', position: { x: 2, y: 0.25, z: -8 } },
                { id: 'b1', name: 'Wingman 2', position: { x: 8, y: 0.25, z: -8 } },
            ];

            const res = dispatchBotOrderByKey(state, 'x', 3000, { issuer, bots });
            assert.equal(res.issued, true);
            assert.equal(res.commandId, BOT_COMMAND_IDS.FORM_UP);
            assert.ok(Array.isArray(res.bubbles));
            assert.equal(res.bubbles.length, 3); // 1 leader + 2 bots
        });
    });

    describe('computeWingmanOrderedTarget', () => {
        const playerPos = { x: 10, y: 0.25, z: -50 };

        describe('form-up formation', () => {
            it('computes tight rear defensive wedge with alternating offsets', () => {
                // botIndex 0 (even): x = playerPos.x - 3.2, z = playerPos.z + 3.0
                const target0 = computeWingmanOrderedTarget({
                    botIndex: 0,
                    playerPos,
                    activeOrderId: BOT_COMMAND_IDS.FORM_UP,
                });
                assert.equal(target0.mode, 'form-up');
                assert.ok(Math.abs(target0.x - (10 - 3.2)) < 1e-6);
                assert.ok(Math.abs(target0.z - (-50 + 3.0)) < 1e-6);

                // botIndex 1 (odd): x = playerPos.x + 3.2, z = playerPos.z + 3.0
                const target1 = computeWingmanOrderedTarget({
                    botIndex: 1,
                    playerPos,
                    activeOrderId: BOT_COMMAND_IDS.FORM_UP,
                });
                assert.equal(target1.mode, 'form-up');
                assert.ok(Math.abs(target1.x - (10 + 3.2)) < 1e-6);
                assert.ok(Math.abs(target1.z - (-50 + 3.0)) < 1e-6);
            });
        });

        describe('focus-fire formation', () => {
            it('intercepts nearest living enemy when enemies are present', () => {
                const enemies = {
                    farEnemy: { id: 'far', x: 20, z: -100, health: 50 },
                    nearEnemy: { id: 'near', position: { x: 8, y: 0, z: -55 }, health: 40 },
                    deadEnemy: { id: 'dead', x: 10, z: -51, health: 0 },
                };

                const target = computeWingmanOrderedTarget({
                    botIndex: 0,
                    playerPos,
                    activeOrderId: BOT_COMMAND_IDS.FOCUS_FIRE,
                    enemies,
                });

                assert.equal(target.mode, 'focus-fire');
                assert.equal(target.x, 8);
                assert.equal(target.z, -55);
            });

            it('charges downriver ahead of lead when no living enemies exist', () => {
                const enemies = {
                    dead1: { id: 'd1', x: 5, z: -60, health: 0 },
                    dead2: { id: 'd2', x: 12, z: -70, isDead: true },
                };

                const target = computeWingmanOrderedTarget({
                    botIndex: 0,
                    playerPos,
                    activeOrderId: BOT_COMMAND_IDS.FOCUS_FIRE,
                    enemies,
                });

                assert.equal(target.mode, 'focus-fire');
                assert.equal(target.x, 10);
                assert.ok(Math.abs(target.z - (-50 - 8.5)) < 1e-6);
            });

            it('works with enemy array input as well as object map', () => {
                const enemyArray = [
                    { id: 'e1', x: -5, z: -60, health: 100 },
                ];
                const target = computeWingmanOrderedTarget({
                    botIndex: 0,
                    playerPos,
                    activeOrderId: BOT_COMMAND_IDS.FOCUS_FIRE,
                    enemies: enemyArray,
                });

                assert.equal(target.x, -5);
                assert.equal(target.z, -60);
            });
        });

        describe('scavenge formation', () => {
            it('spreads wide across lateral river channels', () => {
                // botIndex 0 (even): x = -16, z = playerPos.z - 2.0
                const target0 = computeWingmanOrderedTarget({
                    botIndex: 0,
                    playerPos,
                    activeOrderId: BOT_COMMAND_IDS.SCAVENGE,
                });
                assert.equal(target0.mode, 'scavenge');
                assert.equal(target0.x, -16);
                assert.ok(Math.abs(target0.z - (-50 - 2.0)) < 1e-6);

                // botIndex 1 (odd): x = 16, z = playerPos.z - 2.0
                const target1 = computeWingmanOrderedTarget({
                    botIndex: 1,
                    playerPos,
                    activeOrderId: BOT_COMMAND_IDS.SCAVENGE,
                });
                assert.equal(target1.mode, 'scavenge');
                assert.equal(target1.x, 16);
                assert.ok(Math.abs(target1.z - (-50 - 2.0)) < 1e-6);
            });
        });

        describe('rush-checkpoint formation', () => {
            it('sprints downriver ahead of lead with alternating offsets', () => {
                // botIndex 0 (even): x = playerPos.x - 4.5, z = playerPos.z - 11.0
                const target0 = computeWingmanOrderedTarget({
                    botIndex: 0,
                    playerPos,
                    activeOrderId: BOT_COMMAND_IDS.RUSH_CHECKPOINT,
                });
                assert.equal(target0.mode, 'rush-checkpoint');
                assert.ok(Math.abs(target0.x - (10 - 4.5)) < 1e-6);
                assert.ok(Math.abs(target0.z - (-50 - 11.0)) < 1e-6);

                // botIndex 1 (odd): x = playerPos.x + 4.5, z = playerPos.z - 11.0
                const target1 = computeWingmanOrderedTarget({
                    botIndex: 1,
                    playerPos,
                    activeOrderId: BOT_COMMAND_IDS.RUSH_CHECKPOINT,
                });
                assert.equal(target1.mode, 'rush-checkpoint');
                assert.ok(Math.abs(target1.x - (10 + 4.5)) < 1e-6);
                assert.ok(Math.abs(target1.z - (-50 - 11.0)) < 1e-6);
            });
        });

        describe('default fallback and boundaries', () => {
            it('returns default rear wingman position when order is null or unrecognized', () => {
                const target = computeWingmanOrderedTarget({
                    botIndex: 0,
                    playerPos,
                    activeOrderId: null,
                });
                assert.equal(target.mode, 'default');
                assert.ok(Math.abs(target.x - (10 - 3.5)) < 1e-6);
                assert.ok(Math.abs(target.z - (-50 + 4.0)) < 1e-6);
            });

            it('strictly clamps lateral X to [-playableHalfWidth, playableHalfWidth]', () => {
                const extremeLead = { x: 38, y: 0, z: -100 };
                const target = computeWingmanOrderedTarget({
                    botIndex: 1, // +4.5 => 42.5
                    playerPos: extremeLead,
                    activeOrderId: BOT_COMMAND_IDS.RUSH_CHECKPOINT,
                    playableHalfWidth: 40,
                });
                assert.equal(target.x, 40); // clamped to 40
            });

            it('handles missing or malformed playerPos without NaNs', () => {
                const target = computeWingmanOrderedTarget({
                    botIndex: 0,
                    playerPos: null,
                    activeOrderId: BOT_COMMAND_IDS.FORM_UP,
                });
                assert.ok(Number.isFinite(target.x));
                assert.ok(Number.isFinite(target.z));
            });
        });
    });
});
