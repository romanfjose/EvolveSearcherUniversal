import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SANCTUARY_BUFFS,
    SANCTUARY_CONFIG,
    createCampfireState,
    evaluateCampfireCrewRest,
    selectSanctuaryExpeditionBuff,
} from '../shared/coop-sanctuary-totems.js';

describe('Co-Op Sanctuary Campfire Ready-Check & Tactical Buff Totems', () => {
    describe('SANCTUARY_BUFFS Constants & Metadata', () => {
        test('exports all expected tactical sanctuary totems with proper attributes', () => {
            assert.ok(SANCTUARY_BUFFS, 'SANCTUARY_BUFFS must be defined');
            const buffKeys = Object.keys(SANCTUARY_BUFFS);
            assert.ok(buffKeys.length >= 4, 'Should offer at least 4 tactical totems');

            for (const key of buffKeys) {
                const buff = SANCTUARY_BUFFS[key];
                assert.ok(buff.id, `Buff ${key} must have an id`);
                assert.ok(buff.name, `Buff ${key} must have a name`);
                assert.ok(buff.category, `Buff ${key} must have a category`);
                assert.ok(buff.icon, `Buff ${key} must have an icon`);
                assert.ok(buff.description, `Buff ${key} must have a description`);
                assert.ok(buff.stats && typeof buff.stats === 'object', `Buff ${key} must provide stats`);
            }
        });

        test('SANCTUARY_CONFIG defines standard 3.0s rest threshold, +25 Hull HP and +15 Gold', () => {
            assert.equal(SANCTUARY_CONFIG.REST_TIME_REQUIRED_SEC, 3.0);
            assert.equal(SANCTUARY_CONFIG.BONUS_HULL_HP, 25);
            assert.equal(SANCTUARY_CONFIG.BONUS_GOLD, 15);
        });
    });

    describe('createCampfireState Helper', () => {
        test('initializes clean default state', () => {
            const state = createCampfireState();
            assert.equal(state.restTimer, 0);
            assert.equal(state.isTriggered, false);
            assert.equal(state.completed, false);
            assert.equal(state.selectedBuffId, null);
            assert.equal(state.selectedBuff, null);
            assert.deepEqual(state.playersPresent, []);
            assert.equal(state.lastProgressRatio, 0);
        });

        test('accepts partial overrides while enforcing safe boundaries', () => {
            const state = createCampfireState({
                restTimer: 1.5,
                isTriggered: true,
                selectedBuffId: 'aegis-bulwark',
                lastProgressRatio: 0.5,
            });
            assert.equal(state.restTimer, 1.5);
            assert.equal(state.isTriggered, true);
            assert.equal(state.selectedBuffId, 'aegis-bulwark');
            assert.equal(state.lastProgressRatio, 0.5);
        });
    });

    describe('evaluateCampfireCrewRest Ready-Check', () => {
        test('progresses rest timer when all crew members are resting on the platform', () => {
            const state = createCampfireState();
            const players = ['player1', 'player2'];

            // 1.0 second elapsed
            const res1 = evaluateCampfireCrewRest({
                playersOnPlatform: players,
                totalPlayers: 2,
                dt: 1.0,
                state,
            });

            assert.equal(res1.isReady, false);
            assert.equal(res1.justTriggered, false);
            assert.equal(res1.rewardApplied, false);
            assert.ok(Math.abs(res1.restTimer - 1.0) < 1e-5);
            assert.ok(Math.abs(res1.restProgress - 1.0 / 3.0) < 1e-5);
            assert.equal(res1.bonusHull, 0);
            assert.equal(res1.bonusGold, 0);

            // Another 1.0 second elapsed (total 2.0s)
            const res2 = evaluateCampfireCrewRest({
                playersOnPlatform: players,
                totalPlayers: 2,
                dt: 1.0,
                state,
            });

            assert.equal(res2.isReady, false);
            assert.ok(Math.abs(res2.restTimer - 2.0) < 1e-5);
            assert.ok(Math.abs(res2.restProgress - 2.0 / 3.0) < 1e-5);

            // Another 1.0 second elapsed (total 3.0s -> TRIGGERS!)
            const res3 = evaluateCampfireCrewRest({
                playersOnPlatform: players,
                totalPlayers: 2,
                dt: 1.0,
                state,
            });

            assert.equal(res3.isReady, true);
            assert.equal(res3.justTriggered, true);
            assert.equal(res3.rewardApplied, true);
            assert.equal(res3.bonusHull, 25);
            assert.equal(res3.bonusGold, 15);
            assert.equal(res3.restProgress, 1.0);
            assert.ok(res3.availableBuffs.length >= 4);
        });

        test('subsequent calls after trigger do not repeatedly re-trigger rewardApplied', () => {
            const state = createCampfireState({ restTimer: 3.0, completed: true, isTriggered: true });
            const res = evaluateCampfireCrewRest({
                playersOnPlatform: 2,
                totalPlayers: 2,
                dt: 0.5,
                state,
            });

            assert.equal(res.isReady, true);
            assert.equal(res.justTriggered, false);
            assert.equal(res.rewardApplied, false);
            // Completed bonus attributes remain accessible
            assert.equal(res.bonusHull, 25);
            assert.equal(res.bonusGold, 15);
        });

        test('resets or halts timer when crew members leave platform before 3 seconds', () => {
            const state = createCampfireState();

            // 1 player on platform when 2 are required
            evaluateCampfireCrewRest({
                playersOnPlatform: ['player1'],
                totalPlayers: 2,
                dt: 1.5,
                state,
                autoResetOnLeave: true,
            });

            assert.equal(state.restTimer, 0, 'Timer should not advance when crew is incomplete');

            // Advance with full crew to 2.0s
            evaluateCampfireCrewRest({
                playersOnPlatform: ['player1', 'player2'],
                totalPlayers: 2,
                dt: 2.0,
                state,
                autoResetOnLeave: true,
            });
            assert.equal(state.restTimer, 2.0);

            // One player leaves
            evaluateCampfireCrewRest({
                playersOnPlatform: ['player1'],
                totalPlayers: 2,
                dt: 0.5,
                state,
                autoResetOnLeave: true,
            });
            assert.equal(state.restTimer, 0, 'Should reset progress when a player leaves with autoResetOnLeave=true');
        });

        test('supports gradual decay when autoResetOnLeave is false', () => {
            const state = createCampfireState();

            // Advance with full crew to 2.0s
            evaluateCampfireCrewRest({
                playersOnPlatform: 2,
                totalPlayers: 2,
                dt: 2.0,
                state,
            });
            assert.equal(state.restTimer, 2.0);

            // Player leaves with autoResetOnLeave: false
            evaluateCampfireCrewRest({
                playersOnPlatform: 1,
                totalPlayers: 2,
                dt: 0.5,
                state,
                autoResetOnLeave: false,
            });

            // 2.0 - (0.5 * 1.5) = 1.25
            assert.ok(Math.abs(state.restTimer - 1.25) < 1e-5);
        });

        test('handles number count or array for playersOnPlatform seamlessly', () => {
            const state1 = createCampfireState();
            const res1 = evaluateCampfireCrewRest({
                playersOnPlatform: 3,
                totalPlayers: 3,
                dt: 3.0,
                state: state1,
            });
            assert.equal(res1.isReady, true);
            assert.equal(res1.presentCount, 3);
            assert.equal(res1.requiredCrew, 3);

            const state2 = createCampfireState();
            const res2 = evaluateCampfireCrewRest({
                playersOnPlatform: ['alpha', 'bravo', 'charlie'],
                totalPlayers: 3,
                dt: 3.0,
                state: state2,
            });
            assert.equal(res2.isReady, true);
            assert.equal(res2.presentCount, 3);
            assert.deepEqual(res2.state.playersPresent, ['alpha', 'bravo', 'charlie']);
        });

        test('handles single-player / solo crew mode cleanly (default totalPlayers=1)', () => {
            const state = createCampfireState();
            const res = evaluateCampfireCrewRest({
                playersOnPlatform: 1,
                dt: 3.0,
                state,
            });
            assert.equal(res.isReady, true);
            assert.equal(res.justTriggered, true);
            assert.equal(res.bonusHull, 25);
            assert.equal(res.bonusGold, 15);
        });

        test('gracefully handles missing parameters and edge inputs', () => {
            const res = evaluateCampfireCrewRest();
            assert.equal(res.isReady, false);
            assert.equal(res.justTriggered, false);
            assert.equal(res.restTimer, 0);
            assert.equal(res.restProgress, 0);
        });
    });

    describe('selectSanctuaryExpeditionBuff Selection API', () => {
        test('selects valid buff by ID and returns clean result', () => {
            const selection = selectSanctuaryExpeditionBuff('aegis-bulwark');
            assert.equal(selection.success, true);
            assert.ok(selection.buff);
            assert.equal(selection.buff.id, 'aegis-bulwark');
            assert.equal(selection.error, null);
        });

        test('selects valid buff by case-insensitive name or ID', () => {
            const selection1 = selectSanctuaryExpeditionBuff('TAILWIND-ZEPHYR');
            assert.equal(selection1.success, true);
            assert.equal(selection1.buff.id, 'tailwind-zephyr');

            const selection2 = selectSanctuaryExpeditionBuff("Alchemist's Coffer Totem");
            assert.equal(selection2.success, true);
            assert.equal(selection2.buff.id, 'alchemists-coffer');
        });

        test('accepts buff object with .id property', () => {
            const selection = selectSanctuaryExpeditionBuff(SANCTUARY_BUFFS.PHOENIX_EMBER);
            assert.equal(selection.success, true);
            assert.equal(selection.buff.id, 'phoenix-ember');
        });

        test('mutates passed state object on successful selection', () => {
            const state = createCampfireState({ isTriggered: true, completed: true });
            const selection = selectSanctuaryExpeditionBuff('phoenix-ember', state);

            assert.equal(selection.success, true);
            assert.equal(state.selectedBuffId, 'phoenix-ember');
            assert.equal(state.selectedBuff.id, 'phoenix-ember');
        });

        test('returns failure on invalid, missing, or unknown buff ID', () => {
            const emptyRes = selectSanctuaryExpeditionBuff(null);
            assert.equal(emptyRes.success, false);
            assert.equal(emptyRes.buff, null);
            assert.ok(emptyRes.error);

            const unknownRes = selectSanctuaryExpeditionBuff('non-existent-buff-xyz');
            assert.equal(unknownRes.success, false);
            assert.equal(unknownRes.buff, null);
            assert.ok(unknownRes.error.includes('not found'));
        });
    });
});
