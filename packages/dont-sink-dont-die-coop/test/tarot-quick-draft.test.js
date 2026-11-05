import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    TAROT_CARD_IDS,
    TAROT_CARDS,
    createTarotDraftSession,
} from '../shared/dream-tarot.js';
import {
    RECOMMENDED_BADGE_TEXT,
    CLASS_TAROT_SYNERGY,
    evaluateTarotSynergy,
    getRecommendedTarotPick,
    createQuickTarotDraftSession,
    handleTarotQuickKey,
} from '../shared/tarot-quick-draft.js';

describe('Cockpit 09: Tarot Synergy Scoring & Build Evaluation', () => {
    test('evaluates base score and returns reasonable defaults on missing or empty player state', () => {
        const syn = evaluateTarotSynergy(TAROT_CARD_IDS.CAFFEINATED_OARS);
        assert.ok(syn.score > 0);
        assert.equal(syn.cardId, TAROT_CARD_IDS.CAFFEINATED_OARS);
        assert.ok(Array.isArray(syn.reasons));
    });

    test('gracefully handles unknown cards or invalid arguments', () => {
        const unknown = evaluateTarotSynergy('non-existent-card-id');
        assert.equal(unknown.score, 0);
        assert.deepEqual(unknown.reasons, ['Unknown Card']);

        const empty = evaluateTarotSynergy(null);
        assert.equal(empty.score, 0);
    });

    test('awards Bruiser highest synergy for Squeaky Overdrive and Heavy Pocket Anvil', () => {
        const bruiser = { classId: 'bruiser' };
        const squeaky = evaluateTarotSynergy(TAROT_CARD_IDS.SQUEAKY_OVERDRIVE, bruiser);
        const anvil = evaluateTarotSynergy(TAROT_CARD_IDS.HEAVY_POCKET_ANVIL, bruiser);
        const oars = evaluateTarotSynergy(TAROT_CARD_IDS.CAFFEINATED_OARS, bruiser);

        assert.equal(squeaky.score, 10 + 50); // 60
        assert.equal(anvil.score, 10 + 40);   // 50
        assert.ok(squeaky.score > oars.score);
        assert.ok(anvil.score > oars.score);
        assert.ok(squeaky.reasons[0].includes('Bruiser Signature Synergy'));
    });

    test('awards Helmsman highest synergy for Caffeinated Oars and Plank Magnetism', () => {
        const helmsman = { classId: 'helmsman' };
        const oars = evaluateTarotSynergy(TAROT_CARD_IDS.CAFFEINATED_OARS, helmsman);
        const magnet = evaluateTarotSynergy(TAROT_CARD_IDS.PLANK_MAGNETISM, helmsman);
        const squeaky = evaluateTarotSynergy(TAROT_CARD_IDS.SQUEAKY_OVERDRIVE, helmsman);

        assert.equal(oars.score, 10 + 45); // 55
        assert.equal(magnet.score, 10 + 30); // 40
        assert.ok(oars.score > squeaky.score);
        assert.ok(oars.reasons[0].includes('Helmsman Signature Synergy'));
    });

    test('awards Tinkerer highest synergy for Plank Magnetism and Diplomatic Immunity', () => {
        const tinkerer = { classId: 'tinkerer' };
        const magnet = evaluateTarotSynergy(TAROT_CARD_IDS.PLANK_MAGNETISM, tinkerer);
        const police = evaluateTarotSynergy(TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY, tinkerer);
        const anvil = evaluateTarotSynergy(TAROT_CARD_IDS.HEAVY_POCKET_ANVIL, tinkerer);

        assert.equal(magnet.score, 10 + 50); // 60
        assert.equal(police.score, 10 + 35); // 45
        assert.ok(magnet.score > anvil.score);
        assert.ok(magnet.reasons[0].includes('Tinkerer Signature Synergy'));
    });

    test('awards Mystic highest synergy for Reverse Psychology and Diplomatic Immunity', () => {
        const mystic = { classId: 'mystic' };
        const reverse = evaluateTarotSynergy(TAROT_CARD_IDS.REVERSE_PSYCHOLOGY, mystic);
        const police = evaluateTarotSynergy(TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY, mystic);
        const oars = evaluateTarotSynergy(TAROT_CARD_IDS.CAFFEINATED_OARS, mystic);

        assert.equal(reverse.score, 10 + 50); // 60
        assert.equal(police.score, 10 + 35); // 45
        assert.ok(reverse.score > oars.score);
        assert.ok(reverse.reasons[0].includes('Mystic Signature Synergy'));
    });

    test('boosts Squeaky Overdrive when player has weapon upgrades', () => {
        const basePlayer = { classId: 'bruiser', upgrades: [] };
        const armedPlayer = { classId: 'bruiser', upgrades: ['weapon_tier_1', 'weapon_tier_2'] };

        const baseScore = evaluateTarotSynergy(TAROT_CARD_IDS.SQUEAKY_OVERDRIVE, basePlayer).score;
        const armedScore = evaluateTarotSynergy(TAROT_CARD_IDS.SQUEAKY_OVERDRIVE, armedPlayer).score;

        assert.ok(armedScore > baseScore);
        assert.equal(armedScore - baseScore, 30); // 2 tiers * 15
    });

    test('boosts Caffeinated Oars when player has motor upgrades', () => {
        const basePlayer = { classId: 'helmsman', upgrades: [] };
        const motorPlayer = { classId: 'helmsman', upgrades: ['motor_1'] };

        const baseScore = evaluateTarotSynergy(TAROT_CARD_IDS.CAFFEINATED_OARS, basePlayer).score;
        const motorScore = evaluateTarotSynergy(TAROT_CARD_IDS.CAFFEINATED_OARS, motorPlayer).score;

        assert.ok(motorScore > baseScore);
        assert.equal(motorScore - baseScore, 15);
    });

    test('boosts Reverse Psychology and Heavy Pocket Anvil when player has armor upgrades', () => {
        const basePlayer = { classId: 'mystic', upgrades: [] };
        const armoredPlayer = { classId: 'mystic', upgrades: ['armor_tier_1'] };

        const baseRev = evaluateTarotSynergy(TAROT_CARD_IDS.REVERSE_PSYCHOLOGY, basePlayer).score;
        const armoredRev = evaluateTarotSynergy(TAROT_CARD_IDS.REVERSE_PSYCHOLOGY, armoredPlayer).score;

        assert.ok(armoredRev > baseRev);
        assert.equal(armoredRev - baseRev, 12);
    });

    test('boosts defensive cards when hull/health is critical (<40%)', () => {
        const healthyPlayer = { classId: 'helmsman', health: 100, maxHealth: 100 };
        const damagedPlayer = { classId: 'helmsman', health: 25, maxHealth: 100 };

        const healthyPolice = evaluateTarotSynergy(TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY, healthyPlayer).score;
        const damagedPolice = evaluateTarotSynergy(TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY, damagedPlayer).score;

        assert.equal(damagedPolice - healthyPolice, 25);
    });

    test('boosts Plank Magnetism when player has low coins (<35)', () => {
        const richPlayer = { classId: 'helmsman', coins: 150 };
        const brokePlayer = { classId: 'helmsman', coins: 10 };

        const richMagnet = evaluateTarotSynergy(TAROT_CARD_IDS.PLANK_MAGNETISM, richPlayer).score;
        const brokeMagnet = evaluateTarotSynergy(TAROT_CARD_IDS.PLANK_MAGNETISM, brokePlayer).score;

        assert.equal(brokeMagnet - richMagnet, 25);
    });

    test('boosts score if blessing is already active (stacking bonus)', () => {
        const noBlessing = { classId: 'bruiser', tarotBlessings: {} };
        const withBlessing = { classId: 'bruiser', tarotBlessings: { [TAROT_CARD_IDS.SQUEAKY_OVERDRIVE]: true } };

        const score1 = evaluateTarotSynergy(TAROT_CARD_IDS.SQUEAKY_OVERDRIVE, noBlessing).score;
        const score2 = evaluateTarotSynergy(TAROT_CARD_IDS.SQUEAKY_OVERDRIVE, withBlessing).score;

        assert.equal(score2 - score1, 10);
    });
});

describe('Cockpit 09: Pre-Baked Recommendation (v0.8)', () => {
    test('getRecommendedTarotPick returns correct highest-synergy card from an offered hand', () => {
        const hand = [
            TAROT_CARDS[TAROT_CARD_IDS.PLANK_MAGNETISM],
            TAROT_CARDS[TAROT_CARD_IDS.SQUEAKY_OVERDRIVE],
            TAROT_CARDS[TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY],
        ];

        // Bruiser -> Squeaky Overdrive (index 1)
        const bruiserPick = getRecommendedTarotPick(hand, { classId: 'bruiser' });
        assert.equal(bruiserPick.recommendedIndex, 1);
        assert.equal(bruiserPick.recommendedCard.id, TAROT_CARD_IDS.SQUEAKY_OVERDRIVE);
        assert.equal(bruiserPick.badgeText, RECOMMENDED_BADGE_TEXT);

        // Tinkerer -> Plank Magnetism (index 0)
        const tinkererPick = getRecommendedTarotPick(hand, { classId: 'tinkerer' });
        assert.equal(tinkererPick.recommendedIndex, 0);
        assert.equal(tinkererPick.recommendedCard.id, TAROT_CARD_IDS.PLANK_MAGNETISM);
    });

    test('getRecommendedTarotPick handles empty hands safely', () => {
        const empty = getRecommendedTarotPick([], { classId: 'bruiser' });
        assert.equal(empty.recommendedIndex, -1);
        assert.equal(empty.recommendedCard, null);
    });

    test('createQuickTarotDraftSession pre-bakes v0.8 recommendation and marks card badges', () => {
        const session = createQuickTarotDraftSession({
            checkpointIndex: 2,
            seed: 777,
            playerState: { classId: 'bruiser' },
            startTimeMs: 1000,
        });

        assert.equal(session.active, true);
        assert.equal(session.completed, false);
        assert.equal(session.cards.length, 3);
        assert.ok(session.recommendedIndex >= 0 && session.recommendedIndex < 3);
        assert.ok(session.recommendedCard);
        assert.equal(session.badgeText, RECOMMENDED_BADGE_TEXT);

        // Check cards array enrichment
        const recCard = session.cards[session.recommendedIndex];
        assert.equal(recCard.isRecommended, true);
        assert.equal(recCard.badge, RECOMMENDED_BADGE_TEXT);
        assert.ok(recCard.hotkeyLabel.includes('[SPACE]'));

        // Non-recommended cards should not have the badge
        session.cards.forEach((card, idx) => {
            if (idx !== session.recommendedIndex) {
                assert.equal(card.isRecommended, false);
                assert.equal(card.badge, null);
                assert.equal(card.hotkeyLabel, `[${idx + 1}]`);
            }
        });
    });
});

describe('Cockpit 09: 1-Keystroke Instant Draft ([1], [2], [3], [Space])', () => {
    test('instantly drafts recommended card with [Space] in <0.5s', () => {
        const startTime = 5000;
        const session = createQuickTarotDraftSession({
            checkpointIndex: 2,
            seed: 888,
            playerState: { classId: 'helmsman' },
            startTimeMs: startTime,
        });

        const recCard = session.recommendedCard;
        const recIndex = session.recommendedIndex;

        // Pilot hits Space at 120ms
        const outcome = handleTarotQuickKey(session, 'Space', startTime + 120);

        assert.equal(outcome.success, true);
        assert.equal(outcome.isQuickPick, true);
        assert.equal(outcome.card.id, recCard.id);
        assert.equal(outcome.selectedIndex, recIndex);
        assert.equal(outcome.usedKey, 'Space');
        assert.equal(outcome.timeTakenMs, 120);
        assert.ok(outcome.timeTakenMs < 500, 'Must draft in <0.5s');

        assert.equal(session.active, false);
        assert.equal(session.completed, true);
        assert.equal(session.selectedCardId, recCard.id);
    });

    test('supports raw whitespace key " " and event objects for Space', () => {
        const session1 = createQuickTarotDraftSession({ checkpointIndex: 2, seed: 101, playerState: { classId: 'mystic' } });
        const res1 = handleTarotQuickKey(session1, ' ', 100);
        assert.equal(res1.success, true);
        assert.equal(res1.isQuickPick, true);

        const session2 = createQuickTarotDraftSession({ checkpointIndex: 2, seed: 102, playerState: { classId: 'mystic' } });
        const res2 = handleTarotQuickKey(session2, { code: 'Space', key: ' ' }, 100);
        assert.equal(res2.success, true);
        assert.equal(res2.isQuickPick, true);
    });

    test('drafts cards via direct numeric hotkeys "1", "2", "3"', () => {
        // Hotkey 1
        const s1 = createQuickTarotDraftSession({ checkpointIndex: 2, seed: 201 });
        const firstCard = s1.cards[0];
        const res1 = handleTarotQuickKey(s1, '1', 50);
        assert.equal(res1.success, true);
        assert.equal(res1.card.id, firstCard.id);
        assert.equal(res1.selectedIndex, 0);

        // Hotkey 2
        const s2 = createQuickTarotDraftSession({ checkpointIndex: 2, seed: 202 });
        const secondCard = s2.cards[1];
        const res2 = handleTarotQuickKey(s2, '2', 75);
        assert.equal(res2.success, true);
        assert.equal(res2.card.id, secondCard.id);
        assert.equal(res2.selectedIndex, 1);

        // Hotkey 3
        const s3 = createQuickTarotDraftSession({ checkpointIndex: 2, seed: 203 });
        const thirdCard = s3.cards[2];
        const res3 = handleTarotQuickKey(s3, '3', 90);
        assert.equal(res3.success, true);
        assert.equal(res3.card.id, thirdCard.id);
        assert.equal(res3.selectedIndex, 2);
    });

    test('supports KeyboardEvent code patterns (Digit1, Digit2, Digit3, Numpad1)', () => {
        const s = createQuickTarotDraftSession({ checkpointIndex: 4, seed: 301 });
        const res = handleTarotQuickKey(s, { code: 'Digit2', key: '2' }, 200);
        assert.equal(res.success, true);
        assert.equal(res.selectedIndex, 1);
    });

    test('rejects unrecognized keys without side effects', () => {
        const s = createQuickTarotDraftSession({ checkpointIndex: 2, seed: 401 });
        const res = handleTarotQuickKey(s, 'KeyF', 100);
        assert.equal(res.success, false);
        assert.equal(res.reason, 'unrecognized-key');
        assert.equal(s.active, true);
        assert.equal(s.completed, false);
    });

    test('prevents double-picking once completed', () => {
        const s = createQuickTarotDraftSession({ checkpointIndex: 2, seed: 501 });
        const firstPick = handleTarotQuickKey(s, 'Space', 100);
        assert.equal(firstPick.success, true);

        const secondPick = handleTarotQuickKey(s, '1', 200);
        assert.equal(secondPick.success, false);
        assert.equal(secondPick.reason, 'already-completed');
    });

    test('handles missing or inactive session safely', () => {
        assert.equal(handleTarotQuickKey(null, 'Space').success, false);
        const inactive = { active: false, completed: true };
        assert.equal(handleTarotQuickKey(inactive, 'Space').success, false);
    });
});
