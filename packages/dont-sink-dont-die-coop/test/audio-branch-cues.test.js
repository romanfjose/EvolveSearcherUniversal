import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    BRANCH_AUDIO_LIMITS,
    BRANCH_AUDIO_RECIPES,
    BRANCH_AUDIO_ALIASES,
    resolveBranchAudioRecipeKey,
    getBranchAudioCue,
} from '../shared/audio-branch-cues.js';

describe('Videogame Helmet 02 — Warm Low-Pass Audio Branch Cues', () => {
    describe('1. Audio Limits & Invariant Constants', () => {
        test('MAX_RECIPE_LOWPASS_FREQ is at or below 740 Hz', () => {
            assert.ok(BRANCH_AUDIO_LIMITS.MAX_RECIPE_LOWPASS_FREQ <= 740);
        });

        test('HARD_CEILING_LOWPASS_FREQ is at or below 750 Hz', () => {
            assert.ok(BRANCH_AUDIO_LIMITS.HARD_CEILING_LOWPASS_FREQ <= 750);
        });

        test('MAX_GAIN does not exceed 0.32 ear-safety ceiling', () => {
            assert.ok(BRANCH_AUDIO_LIMITS.MAX_GAIN <= 0.32);
        });
    });

    describe('2. Canonical BRANCH_AUDIO_RECIPES Definitions', () => {
        const REQUIRED_ORDER_CUES = [
            'order_form_up',
            'order_focus_fire',
            'order_scavenge',
            'order_rush_checkpoint',
        ];

        const REQUIRED_GADGET_CUES = [
            'gadget_harpoon',
            'gadget_shield_dome',
            'gadget_nitro_keg',
            'gadget_repair_drone',
        ];

        const REQUIRED_SPECIAL_CUES = [
            'tarot_blessing_granted',
            'photo_shutter_click',
        ];

        const ALL_REQUIRED_CUES = [
            ...REQUIRED_ORDER_CUES,
            ...REQUIRED_GADGET_CUES,
            ...REQUIRED_SPECIAL_CUES,
        ];

        test('contains all 10 canonical cue recipes', () => {
            for (const cueId of ALL_REQUIRED_CUES) {
                assert.ok(BRANCH_AUDIO_RECIPES[cueId], `Missing recipe for required cue: ${cueId}`);
                assert.equal(BRANCH_AUDIO_RECIPES[cueId].id, cueId);
            }
        });

        test('all recipes strictly obey lpFreq <= 740 Hz', () => {
            for (const [key, recipe] of Object.entries(BRANCH_AUDIO_RECIPES)) {
                assert.ok(
                    Number.isFinite(recipe.lpFreq),
                    `Recipe ${key} lpFreq is not a finite number: ${recipe.lpFreq}`
                );
                assert.ok(
                    recipe.lpFreq <= 740,
                    `Recipe ${key} lpFreq exceeds 740 Hz: ${recipe.lpFreq}`
                );
            }
        });

        test('all recipes strictly obey gain <= 0.32', () => {
            for (const [key, recipe] of Object.entries(BRANCH_AUDIO_RECIPES)) {
                assert.ok(
                    Number.isFinite(recipe.gain),
                    `Recipe ${key} gain is not a finite number: ${recipe.gain}`
                );
                assert.ok(
                    recipe.gain <= 0.32,
                    `Recipe ${key} gain exceeds 0.32: ${recipe.gain}`
                );
            }
        });

        test('all recipe fields contain valid finite numbers and valid oscillator types', () => {
            const validOscTypes = ['sine', 'triangle', 'square', 'sawtooth'];
            for (const [key, recipe] of Object.entries(BRANCH_AUDIO_RECIPES)) {
                assert.ok(validOscTypes.includes(recipe.type), `Recipe ${key} has invalid osc type: ${recipe.type}`);
                assert.ok(Number.isFinite(recipe.from) && recipe.from > 0, `Recipe ${key} invalid from freq: ${recipe.from}`);
                assert.ok(Number.isFinite(recipe.to) && recipe.to > 0, `Recipe ${key} invalid to freq: ${recipe.to}`);
                assert.ok(Number.isFinite(recipe.dur) && recipe.dur > 0, `Recipe ${key} invalid dur: ${recipe.dur}`);
                assert.ok(Number.isFinite(recipe.pan) && Math.abs(recipe.pan) <= 1.0, `Recipe ${key} invalid pan: ${recipe.pan}`);
            }
        });
    });

    describe('3. Key & Alias Resolution (resolveBranchAudioRecipeKey)', () => {
        test('resolves canonical keys', () => {
            assert.equal(resolveBranchAudioRecipeKey('order_form_up'), 'order_form_up');
            assert.equal(resolveBranchAudioRecipeKey('gadget_harpoon'), 'gadget_harpoon');
            assert.equal(resolveBranchAudioRecipeKey('tarot_blessing_granted'), 'tarot_blessing_granted');
            assert.equal(resolveBranchAudioRecipeKey('photo_shutter_click'), 'photo_shutter_click');
        });

        test('resolves hyphenated and shorthand aliases', () => {
            assert.equal(resolveBranchAudioRecipeKey('order-form-up'), 'order_form_up');
            assert.equal(resolveBranchAudioRecipeKey('form-up'), 'order_form_up');
            assert.equal(resolveBranchAudioRecipeKey('focus_fire'), 'order_focus_fire');
            assert.equal(resolveBranchAudioRecipeKey('scavenge'), 'order_scavenge');
            assert.equal(resolveBranchAudioRecipeKey('rush-checkpoint'), 'order_rush_checkpoint');
            assert.equal(resolveBranchAudioRecipeKey('harpoon'), 'gadget_harpoon');
            assert.equal(resolveBranchAudioRecipeKey('shield-dome'), 'gadget_shield_dome');
            assert.equal(resolveBranchAudioRecipeKey('nitro-keg'), 'gadget_nitro_keg');
            assert.equal(resolveBranchAudioRecipeKey('repair-drone'), 'gadget_repair_drone');
            assert.equal(resolveBranchAudioRecipeKey('tarot'), 'tarot_blessing_granted');
            assert.equal(resolveBranchAudioRecipeKey('shutter_click'), 'photo_shutter_click');
        });

        test('returns null for unknown or non-string inputs', () => {
            assert.equal(resolveBranchAudioRecipeKey('unknown_sound_foo'), null);
            assert.equal(resolveBranchAudioRecipeKey(null), null);
            assert.equal(resolveBranchAudioRecipeKey(undefined), null);
            assert.equal(resolveBranchAudioRecipeKey(123), null);
            assert.equal(resolveBranchAudioRecipeKey({}), null);
        });
    });

    describe('4. Audio Cue Synthesis Descriptor (getBranchAudioCue)', () => {
        test('generates valid descriptor for each canonical recipe with pitchJitter = 0', () => {
            for (const cueId of Object.keys(BRANCH_AUDIO_RECIPES)) {
                const cue = getBranchAudioCue(cueId, 0);
                assert.equal(cue.id, cueId);
                assert.ok(Number.isFinite(cue.from));
                assert.ok(Number.isFinite(cue.to));
                assert.ok(Number.isFinite(cue.dur));
                assert.ok(Number.isFinite(cue.lpFreq));
                assert.ok(Number.isFinite(cue.gain));
                assert.ok(Number.isFinite(cue.pan));
                assert.ok(Number.isFinite(cue.pitchJitter));

                assert.ok(cue.lpFreq <= 750, `lpFreq exceeds 750 for ${cueId}: ${cue.lpFreq}`);
                assert.ok(cue.gain <= 0.32, `gain exceeds 0.32 for ${cueId}: ${cue.gain}`);
            }
        });

        test('applies positive and negative pitch jitter safely', () => {
            const baseCue = getBranchAudioCue('order_focus_fire', 0);
            const highCue = getBranchAudioCue('order_focus_fire', 0.1);
            const lowCue = getBranchAudioCue('order_focus_fire', -0.1);

            assert.ok(highCue.from > baseCue.from, 'Positive jitter should increase from frequency');
            assert.ok(highCue.to > baseCue.to, 'Positive jitter should increase to frequency');
            assert.ok(lowCue.from < baseCue.from, 'Negative jitter should decrease from frequency');
            assert.ok(lowCue.to < baseCue.to, 'Negative jitter should decrease to frequency');

            assert.ok(highCue.lpFreq <= 750);
            assert.ok(lowCue.lpFreq <= 750);
            assert.ok(highCue.gain <= 0.32);
            assert.ok(lowCue.gain <= 0.32);
        });

        test('clamps extreme pitch jitter values to [-0.15, +0.15]', () => {
            const extremeHigh = getBranchAudioCue('photo_shutter_click', 5.0);
            const extremeLow = getBranchAudioCue('photo_shutter_click', -5.0);

            assert.equal(extremeHigh.pitchJitter, 0.15);
            assert.equal(extremeLow.pitchJitter, -0.15);
            assert.ok(extremeHigh.lpFreq <= 750);
            assert.ok(extremeLow.lpFreq <= 750);
        });

        test('falls back gracefully to order_form_up on unknown or invalid cueId', () => {
            const fallbackCue = getBranchAudioCue('non_existent_sound_12345');
            assert.equal(fallbackCue.id, 'order_form_up');
            assert.ok(fallbackCue.lpFreq <= 750);
            assert.ok(fallbackCue.gain <= 0.32);

            const nullCue = getBranchAudioCue(null);
            assert.equal(nullCue.id, 'order_form_up');

            const undefinedCue = getBranchAudioCue(undefined);
            assert.equal(undefinedCue.id, 'order_form_up');
        });

        test('handles NaN, Infinity, and non-numeric pitchJitter gracefully', () => {
            const nanCue = getBranchAudioCue('gadget_shield_dome', NaN);
            assert.equal(nanCue.pitchJitter, 0);
            assert.ok(Number.isFinite(nanCue.from));
            assert.ok(nanCue.lpFreq <= 750);

            const infCue = getBranchAudioCue('gadget_shield_dome', Infinity);
            assert.equal(infCue.pitchJitter, 0);

            const strCue = getBranchAudioCue('gadget_shield_dome', 'invalid');
            assert.equal(strCue.pitchJitter, 0);
        });

        test('all returned values are strictly finite across 100 random variations', () => {
            const keys = Object.keys(BRANCH_AUDIO_RECIPES);
            for (let i = 0; i < 100; i++) {
                const cueId = keys[i % keys.length];
                const jitter = (Math.random() - 0.5) * 0.4;
                const cue = getBranchAudioCue(cueId, jitter);

                for (const [k, v] of Object.entries(cue)) {
                    if (typeof v === 'number') {
                        assert.ok(Number.isFinite(v), `Property ${k} is not finite: ${v}`);
                    }
                }
                assert.ok(cue.lpFreq <= 750, `lpFreq ceiling violated: ${cue.lpFreq}`);
                assert.ok(cue.gain <= 0.32, `gain ceiling violated: ${cue.gain}`);
            }
        });
    });
});
