import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    TAROT_CARD_IDS,
    TAROT_CARDS,
    createPlayerTarotState,
} from '../shared/dream-tarot.js';

import {
    grantCheckpointTarotBlessing,
    computeTarotLiveModifiers,
} from '../shared/tarot-gameplay-bridge.js';

describe('Videogame Helmet 03: Dream Tarot Checkpoint Draft & Live Multipliers Bridge', () => {
    describe('grantCheckpointTarotBlessing', () => {
        it('grants a card from session cards[0] and updates equippedCards and stacks', () => {
            const tarotState = createPlayerTarotState();
            const res = grantCheckpointTarotBlessing(tarotState, -150, 0, 1337, 100);

            assert.equal(res.granted, true);
            assert.ok(res.card);
            assert.ok(res.card.id);
            assert.equal(res.totalEquipped, 1);
            assert.equal(tarotState.equippedCards.length, 1);
            assert.equal(tarotState.equippedCards[0].id, res.card.id);
            assert.equal(tarotState.stacks[res.card.id], 1);
            assert.ok(tarotState.blessings[res.card.id]);
            assert.equal(tarotState.blessings[res.card.id].count, 1);
        });

        it('deterministic seeds produce predictable sequential blessings', () => {
            const stateA = createPlayerTarotState();
            const stateB = createPlayerTarotState();

            const rA0 = grantCheckpointTarotBlessing(stateA, -150, 0, 42, 50);
            const rB0 = grantCheckpointTarotBlessing(stateB, -150, 0, 42, 50);

            assert.equal(rA0.card.id, rB0.card.id);
            assert.equal(stateA.equippedCards.length, 1);

            const rA1 = grantCheckpointTarotBlessing(stateA, -300, 1, 42, 150);
            const rB1 = grantCheckpointTarotBlessing(stateB, -300, 1, 42, 150);

            assert.equal(rA1.card.id, rB1.card.id);
            assert.equal(stateA.equippedCards.length, 2);
            assert.equal(rA1.totalEquipped, 2);
        });

        it('handles uninitialized tarotState gracefully by creating missing properties', () => {
            const minimalState = {};
            const res = grantCheckpointTarotBlessing(minimalState, -150, 0, 1337, 0);

            assert.equal(res.granted, true);
            assert.equal(minimalState.equippedCards.length, 1);
            assert.equal(typeof minimalState.stacks, 'object');
            assert.equal(typeof minimalState.blessings, 'object');
        });

        it('throws TypeError if tarotState is not an object', () => {
            assert.throws(() => grantCheckpointTarotBlessing(null), {
                name: 'TypeError',
            });
            assert.throws(() => grantCheckpointTarotBlessing(undefined), {
                name: 'TypeError',
            });
        });
    });

    describe('computeTarotLiveModifiers', () => {
        it('returns baseline modifiers when no blessings are equipped', () => {
            const emptyState = { stacks: {}, equippedCards: [] };
            const mods = computeTarotLiveModifiers(emptyState);

            assert.deepEqual(mods, {
                oarThrustMultiplier: 1.0,
                oarCadenceMultiplier: 1.0,
                hasSqueakyOverdrive: false,
                hasHeavyPocketAnvil: false,
                reversePsychologyCoinsOnBlock: 0,
                magnetRadius: 0,
            });
        });

        it('computes live modifiers from tarotState.stacks', () => {
            const state = {
                stacks: {
                    [TAROT_CARD_IDS.CAFFEINATED_OARS]: 2,
                    [TAROT_CARD_IDS.SQUEAKY_OVERDRIVE]: 1,
                    [TAROT_CARD_IDS.HEAVY_POCKET_ANVIL]: 1,
                    [TAROT_CARD_IDS.REVERSE_PSYCHOLOGY]: 3,
                    [TAROT_CARD_IDS.PLANK_MAGNETISM]: 2,
                },
            };

            const mods = computeTarotLiveModifiers(state);

            // oarThrustMultiplier: 1 + 0.25 * 2 = 1.50
            assert.equal(mods.oarThrustMultiplier, 1.5);
            // oarCadenceMultiplier: 1 + 0.20 * 2 = 1.40
            assert.equal(mods.oarCadenceMultiplier, 1.4);
            // hasSqueakyOverdrive: true
            assert.equal(mods.hasSqueakyOverdrive, true);
            // hasHeavyPocketAnvil: true
            assert.equal(mods.hasHeavyPocketAnvil, true);
            // reversePsychologyCoinsOnBlock: 8 * 3 = 24
            assert.equal(mods.reversePsychologyCoinsOnBlock, 24);
            // magnetRadius: 14 * 2 = 28
            assert.equal(mods.magnetRadius, 28);
        });

        it('computes live modifiers from tarotState.equippedCards fallback', () => {
            const state = {
                equippedCards: [
                    TAROT_CARD_IDS.CAFFEINATED_OARS,
                    { id: TAROT_CARD_IDS.CAFFEINATED_OARS },
                    TAROT_CARD_IDS.SQUEAKY_OVERDRIVE,
                    TAROT_CARD_IDS.PLANK_MAGNETISM,
                ],
            };

            const mods = computeTarotLiveModifiers(state);

            assert.equal(mods.oarThrustMultiplier, 1.5);
            assert.equal(mods.oarCadenceMultiplier, 1.4);
            assert.equal(mods.hasSqueakyOverdrive, true);
            assert.equal(mods.hasHeavyPocketAnvil, false);
            assert.equal(mods.reversePsychologyCoinsOnBlock, 0);
            assert.equal(mods.magnetRadius, 14);
        });

        it('computes live modifiers from tarotState.blessings fallback', () => {
            const state = {
                blessings: {
                    [TAROT_CARD_IDS.HEAVY_POCKET_ANVIL]: { count: 1 },
                    [TAROT_CARD_IDS.REVERSE_PSYCHOLOGY]: { count: 2 },
                },
            };

            const mods = computeTarotLiveModifiers(state);

            assert.equal(mods.oarThrustMultiplier, 1.0);
            assert.equal(mods.oarCadenceMultiplier, 1.0);
            assert.equal(mods.hasSqueakyOverdrive, false);
            assert.equal(mods.hasHeavyPocketAnvil, true);
            assert.equal(mods.reversePsychologyCoinsOnBlock, 16);
            assert.equal(mods.magnetRadius, 0);
        });

        it('handles null, undefined or empty input gracefully', () => {
            const mods = computeTarotLiveModifiers(null);
            assert.equal(mods.oarThrustMultiplier, 1.0);
            assert.equal(mods.oarCadenceMultiplier, 1.0);
            assert.equal(mods.hasSqueakyOverdrive, false);
            assert.equal(mods.hasHeavyPocketAnvil, false);
            assert.equal(mods.reversePsychologyCoinsOnBlock, 0);
            assert.equal(mods.magnetRadius, 0);
        });
    });

    describe('End-to-End Checkpoint Grant -> Modifiers Bridge Workflow', () => {
        it('progressively grants blessings across checkpoints and scales live modifiers', () => {
            const tarotState = createPlayerTarotState();

            // Checkpoint 0
            const grant0 = grantCheckpointTarotBlessing(tarotState, -150, 0, 1337, 100);
            assert.equal(grant0.granted, true);
            const mods0 = computeTarotLiveModifiers(tarotState);

            assert.ok(mods0.oarThrustMultiplier >= 1.0);
            assert.ok(mods0.oarCadenceMultiplier >= 1.0);

            // Checkpoint 1
            const grant1 = grantCheckpointTarotBlessing(tarotState, -300, 1, 1337, 500);
            assert.equal(grant1.granted, true);
            assert.equal(grant1.totalEquipped, 2);

            const mods1 = computeTarotLiveModifiers(tarotState);
            assert.equal(typeof mods1.hasSqueakyOverdrive, 'boolean');
            assert.equal(typeof mods1.hasHeavyPocketAnvil, 'boolean');
            assert.equal(typeof mods1.reversePsychologyCoinsOnBlock, 'number');
            assert.equal(typeof mods1.magnetRadius, 'number');
        });
    });
});
