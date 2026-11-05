import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    AUTO_PICK_TIMEOUT_MS,
    TAROT_CARD_IDS,
    TAROT_CARD_KEYS,
    TAROT_CARDS,
    isTarotCheckpoint,
    createTarotRng,
    dealTarotCards,
    createTarotDraftSession,
    updateDraftTimer,
    selectDraftCard,
    createPlayerTarotState,
    applyTarotBlessing,
    hasTarotBlessing,
    getPaddleCadenceModifier,
    triggerDiplomaticImmunity,
    evaluateHeavyPocketAnvilSlam,
    recordSqueakyHammerHit,
    stepPlankMagnetism,
    resolveReversePsychologyBlock,
} from '../shared/dream-tarot.js';
import { createTarotDraftHUD } from '../public/js/ui/tarot-draft.js';

describe('Dream Tarot Card Metadata & Definitions', () => {
    test('defines all 6 required bizarre tarot blessing cards', () => {
        const expectedIds = [
            'caffeinated-oars',
            'diplomatic-immunity',
            'heavy-pocket-anvil',
            'squeaky-overdrive',
            'plank-magnetism',
            'reverse-psychology',
        ];

        assert.equal(TAROT_CARD_KEYS.length, 6);
        for (const id of expectedIds) {
            assert.ok(TAROT_CARD_KEYS.includes(id), `Missing key in TAROT_CARD_KEYS: ${id}`);
            assert.ok(TAROT_CARDS[id], `Missing definition in TAROT_CARDS for: ${id}`);
        }
    });

    test('each card definition possesses valid text, arcana, icon, and colors', () => {
        for (const card of Object.values(TAROT_CARDS)) {
            assert.ok(card.id && typeof card.id === 'string');
            assert.ok(card.name && typeof card.name === 'string');
            assert.ok(card.tagline && typeof card.tagline === 'string');
            assert.ok(card.arcana && typeof card.arcana === 'string');
            assert.ok(card.romanNumeral && typeof card.romanNumeral === 'string');
            assert.ok(card.icon && typeof card.icon === 'string');
            assert.ok(card.description && typeof card.description === 'string');
            assert.ok(Number.isFinite(card.colorHex));
            assert.ok(card.accentColor && typeof card.accentColor === 'string');
            assert.ok(card.lore && typeof card.lore === 'string');
        }
    });

    test('verifies specific mechanic fields per card definition', () => {
        const caff = TAROT_CARDS[TAROT_CARD_IDS.CAFFEINATED_OARS];
        assert.equal(caff.cadenceMultiplier, 1.25);
        assert.equal(caff.thrustMultiplier, 1.25);
        assert.equal(caff.wakeVfxType, 'espresso_foam');

        const police = TAROT_CARDS[TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY];
        assert.equal(police.summonsCount, 2);
        assert.equal(police.officerType, 'police_jetski');

        const anvil = TAROT_CARDS[TAROT_CARD_IDS.HEAVY_POCKET_ANVIL];
        assert.equal(anvil.slamDamage, 60);
        assert.ok(anvil.slamRadius >= 5.0);

        const squeak = TAROT_CARDS[TAROT_CARD_IDS.SQUEAKY_OVERDRIVE];
        assert.equal(squeak.hitInterval, 3);
        assert.equal(squeak.soundDecibels, 140);

        const magnet = TAROT_CARDS[TAROT_CARD_IDS.PLANK_MAGNETISM];
        assert.equal(magnet.magnetRadius, 14.0);

        const rev = TAROT_CARDS[TAROT_CARD_IDS.REVERSE_PSYCHOLOGY];
        assert.equal(rev.coinRewardOnBlock, 8);
    });
});

describe('Checkpoint Eligibility (Every 2nd Checkpoint Crossed)', () => {
    test('returns true for even checkpoint numbers (2, 4, 6, 8)', () => {
        assert.equal(isTarotCheckpoint(2), true);
        assert.equal(isTarotCheckpoint(4), true);
        assert.equal(isTarotCheckpoint(6), true);
        assert.equal(isTarotCheckpoint(8), true);
    });

    test('returns false for odd checkpoint numbers (1, 3, 5, 7)', () => {
        assert.equal(isTarotCheckpoint(1), false);
        assert.equal(isTarotCheckpoint(3), false);
        assert.equal(isTarotCheckpoint(5), false);
        assert.equal(isTarotCheckpoint(7), false);
    });

    test('evaluates negative river z-coordinates correctly (-300, -600, -900, -1200)', () => {
        // checkpoint spacing = 150m:
        // z = -150 is #1 (false)
        // z = -300 is #2 (true)
        // z = -450 is #3 (false)
        // z = -600 is #4 (true)
        // z = -900 is #6 (true)
        // z = -1200 is #8 (true)
        assert.equal(isTarotCheckpoint(-150), false);
        assert.equal(isTarotCheckpoint(-300), true);
        assert.equal(isTarotCheckpoint(-450), false);
        assert.equal(isTarotCheckpoint(-600), true);
        assert.equal(isTarotCheckpoint(-750), false);
        assert.equal(isTarotCheckpoint(-900), true);
        assert.equal(isTarotCheckpoint(-1200), true);
    });

    test('returns false for invalid or zero inputs', () => {
        assert.equal(isTarotCheckpoint(0), false);
        assert.equal(isTarotCheckpoint(-50), false);
        assert.equal(isTarotCheckpoint(null), false);
        assert.equal(isTarotCheckpoint(undefined), false);
        assert.equal(isTarotCheckpoint(NaN), false);
    });
});

describe('Seeded Deterministic Card Dealing', () => {
    test('createTarotRng is deterministic across runs with identical seed', () => {
        const rng1 = createTarotRng(42);
        const rng2 = createTarotRng(42);
        for (let i = 0; i < 20; i++) {
            assert.equal(rng1(), rng2());
        }
    });

    test('dealTarotCards yields exactly 3 unique cards without duplicates', () => {
        const cards = dealTarotCards({ seedOrRng: 101, count: 3 });
        assert.equal(cards.length, 3);
        const ids = cards.map((c) => c.id);
        const uniqueIds = new Set(ids);
        assert.equal(uniqueIds.size, 3);
    });

    test('dealTarotCards produces identical results given identical seed', () => {
        const dealA = dealTarotCards({ seedOrRng: 888, count: 3 });
        const dealB = dealTarotCards({ seedOrRng: 888, count: 3 });
        assert.deepEqual(dealA, dealB);
    });

    test('dealTarotCards respects excludeIds to avoid re-offering owned blessings', () => {
        const exclude = [TAROT_CARD_IDS.CAFFEINATED_OARS, TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY];
        const deal = dealTarotCards({ seedOrRng: 55, excludeIds: exclude, count: 3 });

        for (const card of deal) {
            assert.ok(!exclude.includes(card.id), `Card ${card.id} should have been excluded`);
        }
    });

    test('dealTarotCards gracefully falls back to full pool if remaining cards is less than count', () => {
        // Exclude 5 cards out of 6
        const exclude = TAROT_CARD_KEYS.slice(0, 5);
        const deal = dealTarotCards({ seedOrRng: 77, excludeIds: exclude, count: 3 });
        assert.equal(deal.length, 3);
    });
});

describe('Draft Session State & Input Selection ([1], [2], [3])', () => {
    test('createTarotDraftSession initializes session with 3 cards and 6s duration', () => {
        const session = createTarotDraftSession({ checkpointIndex: 2, seed: 999, startTimeMs: 1000 });
        assert.equal(session.active, true);
        assert.equal(session.completed, false);
        assert.equal(session.checkpointIndex, 2);
        assert.equal(session.cards.length, 3);
        assert.equal(session.durationMs, AUTO_PICK_TIMEOUT_MS);
        assert.equal(session.expiresAtMs, 1000 + AUTO_PICK_TIMEOUT_MS);
        assert.equal(session.remainingMs, AUTO_PICK_TIMEOUT_MS);
        assert.equal(session.selectedCard, null);
    });

    test('selectDraftCard accepts numeric index (0, 1, 2)', () => {
        const session = createTarotDraftSession({ checkpointIndex: 2, seed: 10 });
        const secondCard = session.cards[1];
        const res = selectDraftCard(session, 1, 500);

        assert.equal(res.success, true);
        assert.equal(res.card.id, secondCard.id);
        assert.equal(session.active, false);
        assert.equal(session.completed, true);
        assert.equal(session.selectedIndex, 1);
        assert.equal(session.selectedCardId, secondCard.id);
    });

    test('selectDraftCard accepts keyboard hotkeys "1", "2", "3"', () => {
        const session = createTarotDraftSession({ checkpointIndex: 4, seed: 20 });
        const thirdCard = session.cards[2];
        const res = selectDraftCard(session, '3', 600);

        assert.equal(res.success, true);
        assert.equal(res.card.id, thirdCard.id);
        assert.equal(session.selectedIndex, 2);
    });

    test('selectDraftCard rejects out-of-range choices', () => {
        const session = createTarotDraftSession({ checkpointIndex: 2, seed: 30 });
        const invalidIndex = selectDraftCard(session, 5);
        assert.equal(invalidIndex.success, false);
        assert.equal(invalidIndex.reason, 'invalid-choice');

        const invalidKey = selectDraftCard(session, '9');
        assert.equal(invalidKey.success, false);
        assert.equal(invalidKey.reason, 'invalid-choice');
    });

    test('selectDraftCard cannot pick twice once completed', () => {
        const session = createTarotDraftSession({ checkpointIndex: 2, seed: 40 });
        const pick1 = selectDraftCard(session, '1');
        assert.equal(pick1.success, true);

        const pick2 = selectDraftCard(session, '2');
        assert.equal(pick2.success, false);
        assert.equal(pick2.reason, 'already-completed');
    });
});

describe('Auto-Pick Timer Mechanics (6-Second Window)', () => {
    test('updateDraftTimer counts down remaining milliseconds', () => {
        const startTime = 10000;
        const session = createTarotDraftSession({ checkpointIndex: 2, seed: 50, startTimeMs: startTime });

        const tick1 = updateDraftTimer(session, startTime + 2000);
        assert.equal(tick1.expired, false);
        assert.equal(session.remainingMs, 4000);

        const tick2 = updateDraftTimer(session, startTime + 5000);
        assert.equal(tick2.expired, false);
        assert.equal(session.remainingMs, 1000);
    });

    test('updateDraftTimer automatically selects card index 0 when 6000ms elapses', () => {
        const startTime = 10000;
        const session = createTarotDraftSession({ checkpointIndex: 2, seed: 60, startTimeMs: startTime });
        const expectedCard = session.cards[0];

        // Advance beyond 6000ms
        const outcome = updateDraftTimer(session, startTime + 6001);
        assert.equal(outcome.expired, true);
        assert.equal(outcome.autoSelected, true);
        assert.equal(outcome.selectedCard.id, expectedCard.id);
        assert.equal(session.active, false);
        assert.equal(session.completed, true);
        assert.equal(session.autoPicked, true);
        assert.equal(session.selectedIndex, 0);
    });
});

describe('Player Tarot State & Blessing Inventory', () => {
    test('createPlayerTarotState initializes empty blessings map and counters', () => {
        const state = createPlayerTarotState();
        assert.deepEqual(state.blessings, {});
        assert.equal(state.squeakyHitCounter, 0);
        assert.deepEqual(state.policeSummons, []);
        assert.equal(state.coinsEarnedFromBlocks, 0);
    });

    test('applyTarotBlessing adds blessing to player state and increments count on repeat', () => {
        const state = createPlayerTarotState();
        const res1 = applyTarotBlessing(state, TAROT_CARD_IDS.CAFFEINATED_OARS, 100);
        assert.equal(res1.success, true);
        assert.equal(hasTarotBlessing(state, TAROT_CARD_IDS.CAFFEINATED_OARS), true);
        assert.equal(state.blessings[TAROT_CARD_IDS.CAFFEINATED_OARS].count, 1);

        const res2 = applyTarotBlessing(state, TAROT_CARD_IDS.CAFFEINATED_OARS, 200);
        assert.equal(res2.success, true);
        assert.equal(state.blessings[TAROT_CARD_IDS.CAFFEINATED_OARS].count, 2);
    });

    test('applyTarotBlessing rejects unknown card IDs', () => {
        const state = createPlayerTarotState();
        const res = applyTarotBlessing(state, 'non-existent-card');
        assert.equal(res.success, false);
        assert.equal(res.reason, 'unknown-card');
    });
});

describe('Blessing Mechanic 1: caffeinated-oars (+25% paddle cadence & espresso wake)', () => {
    test('returns default 1.0 cadence and no espresso foam without blessing', () => {
        const state = createPlayerTarotState();
        const mod = getPaddleCadenceModifier(state);
        assert.equal(mod.cadenceMultiplier, 1.0);
        assert.equal(mod.thrustMultiplier, 1.0);
        assert.equal(mod.espressoFoam, false);
    });

    test('grants +25% paddle cadence and activates espresso wake foam with blessing', () => {
        const state = createPlayerTarotState();
        applyTarotBlessing(state, TAROT_CARD_IDS.CAFFEINATED_OARS);
        const mod = getPaddleCadenceModifier(state);
        assert.equal(mod.cadenceMultiplier, 1.25);
        assert.equal(mod.thrustMultiplier, 1.25);
        assert.equal(mod.espressoFoam, true);
    });
});

describe('Blessing Mechanic 2: diplomatic-immunity (Summons 2 Harbor Police officers on jet-skis)', () => {
    test('does nothing if blessing is inactive', () => {
        const state = createPlayerTarotState();
        const res = triggerDiplomaticImmunity(state, { x: 0, y: 0.25, z: -100 });
        assert.equal(res.summoned, false);
        assert.equal(res.officers.length, 0);
    });

    test('summons exactly 2 Harbor Police officers on jet-skis targeting nearest monster', () => {
        const state = createPlayerTarotState();
        applyTarotBlessing(state, TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY);

        const raftPos = { x: 0, y: 0.25, z: -300 };
        const enemies = {
            farEnemy: { id: 'farEnemy', position: { x: 0, y: 0.5, z: -350 }, health: 50 },
            nearEnemy: { id: 'nearEnemy', position: { x: 2, y: 0.5, z: -305 }, health: 80 },
        };

        const res = triggerDiplomaticImmunity(state, raftPos, enemies, 5000);
        assert.equal(res.summoned, true);
        assert.equal(res.count, 2);
        assert.equal(res.officers.length, 2);

        // Verify officer details
        for (const officer of res.officers) {
            assert.equal(officer.type, 'police_jetski');
            assert.equal(officer.targetEnemyId, 'nearEnemy');
            assert.equal(officer.shotDamage, 12);
        }
        assert.equal(state.policeSummons.length, 2);
    });
});

describe('Blessing Mechanic 3: heavy-pocket-anvil (60 AoE slam damage on enemy)', () => {
    test('returns inactive without blessing', () => {
        const state = createPlayerTarotState();
        const res = evaluateHeavyPocketAnvilSlam(state, { x: 0, y: 0.25, z: -100 });
        assert.equal(res.active, false);
        assert.equal(res.damageDealt, 0);
    });

    test('deals 60 AoE slam damage to enemies within slam radius', () => {
        const state = createPlayerTarotState();
        applyTarotBlessing(state, TAROT_CARD_IDS.HEAVY_POCKET_ANVIL);

        const landingPos = { x: 0, y: 0.25, z: -200 };
        const enemies = {
            e1: { id: 'e1', type: 'whiteGuy', position: { x: 2, y: 0.5, z: -200 }, health: 100 }, // within 2m (<6.5m)
            e2: { id: 'e2', type: 'mudAlien', position: { x: -4, y: 0.5, z: -202 }, health: 150 }, // within ~4.5m (<6.5m)
            e3: { id: 'e3', type: 'longWorm', position: { x: 15, y: 0.5, z: -200 }, health: 200 }, // 15m away (outside radius)
        };

        const res = evaluateHeavyPocketAnvilSlam(state, landingPos, enemies);
        assert.equal(res.active, true);
        assert.equal(res.slamDamage, 60);
        assert.equal(res.hitEnemies.length, 2);

        const hitIds = res.hitEnemies.map((h) => h.enemyId);
        assert.ok(hitIds.includes('e1'));
        assert.ok(hitIds.includes('e2'));
        assert.ok(!hitIds.includes('e3'));
        assert.equal(res.totalDamage, 120);
    });
});

describe('Blessing Mechanic 4: squeaky-overdrive (140 dB shockwave every 3rd hit)', () => {
    test('does nothing without blessing', () => {
        const state = createPlayerTarotState();
        const res = recordSqueakyHammerHit(state, { x: 0, y: 0, z: 0 });
        assert.equal(res.shockwaveTriggered, false);
    });

    test('hits 1 and 2 do not trigger shockwave; hit 3 triggers 140 dB shockwave', () => {
        const state = createPlayerTarotState();
        applyTarotBlessing(state, TAROT_CARD_IDS.SQUEAKY_OVERDRIVE);

        const hitPos = { x: 0, y: 0.5, z: -100 };
        const enemies = {
            e1: { id: 'e1', position: { x: 3, y: 0.5, z: -100 }, health: 100 },
        };

        // Hit 1
        const h1 = recordSqueakyHammerHit(state, hitPos, enemies);
        assert.equal(h1.shockwaveTriggered, false);
        assert.equal(h1.currentCount, 1);
        assert.equal(h1.hitsUntilOverdrive, 2);

        // Hit 2
        const h2 = recordSqueakyHammerHit(state, hitPos, enemies);
        assert.equal(h2.shockwaveTriggered, false);
        assert.equal(h2.currentCount, 2);
        assert.equal(h2.hitsUntilOverdrive, 1);

        // Hit 3: Overdrive!
        const h3 = recordSqueakyHammerHit(state, hitPos, enemies);
        assert.equal(h3.shockwaveTriggered, true);
        assert.equal(h3.currentCount, 3);
        assert.equal(h3.decibels, 140);
        assert.equal(h3.shockwaveDamage, 45);
        assert.equal(h3.hitEnemies.length, 1);
        assert.equal(h3.hitEnemies[0].enemyId, 'e1');

        // Hit 4: resets back to counting
        const h4 = recordSqueakyHammerHit(state, hitPos, enemies);
        assert.equal(h4.shockwaveTriggered, false);
        assert.equal(h4.currentCount, 4);
        assert.equal(h4.hitsUntilOverdrive, 2);
    });
});

describe('Blessing Mechanic 5: plank-magnetism (Coins and crates within 14m gravitate)', () => {
    test('does not move items if blessing is inactive', () => {
        const state = createPlayerTarotState();
        const raftPos = { x: 0, y: 0.25, z: -100 };
        const loot = [{ id: 'coin1', position: { x: 5, y: 0.25, z: -100 } }];

        const res = stepPlankMagnetism(state, raftPos, loot, 0.05);
        assert.equal(res.active, false);
        assert.equal(res.attractedCount, 0);
        assert.equal(loot[0].position.x, 5);
    });

    test('pulls loot within 14m toward the raft, ignoring items further away', () => {
        const state = createPlayerTarotState();
        applyTarotBlessing(state, TAROT_CARD_IDS.PLANK_MAGNETISM);

        const raftPos = { x: 0, y: 0.25, z: -100 };
        const nearLoot = { id: 'nearCoin', position: { x: 6, y: 0.25, z: -100 } }; // 6m away (<14m)
        const farLoot = { id: 'farCrate', position: { x: 20, y: 0.25, z: -100 } };  // 20m away (>14m)
        const loot = [nearLoot, farLoot];

        const res = stepPlankMagnetism(state, raftPos, loot, 0.1);
        assert.equal(res.active, true);
        assert.equal(res.attractedCount, 1);
        assert.equal(res.itemsMoved[0].id, 'nearCoin');

        // nearLoot moved closer to raft (x decreased from 6 toward 0)
        assert.ok(nearLoot.position.x < 6);
        // farLoot did not move
        assert.equal(farLoot.position.x, 20);
    });
});

describe('Blessing Mechanic 6: reverse-psychology (Wizard throw block boosts +8 coins instead of hurting)', () => {
    test('returns standard damage if unblocked or without blessing', () => {
        const state = createPlayerTarotState();
        const player = { coins: 50, health: 100 };

        // Unblocked with blessing
        applyTarotBlessing(state, TAROT_CARD_IDS.REVERSE_PSYCHOLOGY);
        const resUnblocked = resolveReversePsychologyBlock(state, player, 'whiteGuy', false);
        assert.equal(resUnblocked.converted, false);
        assert.equal(player.coins, 50);

        // Blocked without blessing
        const noBlessingState = createPlayerTarotState();
        const resNoBlessing = resolveReversePsychologyBlock(noBlessingState, player, 'whiteGuy', true);
        assert.equal(resNoBlessing.converted, false);
        assert.equal(player.coins, 50);
    });

    test('blocking Wizard throw awards +8 coins with 0.0 damage multiplier', () => {
        const state = createPlayerTarotState();
        applyTarotBlessing(state, TAROT_CARD_IDS.REVERSE_PSYCHOLOGY);

        const player = { coins: 50, health: 100 };
        const res = resolveReversePsychologyBlock(state, player, 'whiteGuy', true);

        assert.equal(res.converted, true);
        assert.equal(res.coinsAdded, 8);
        assert.equal(res.damageMultiplier, 0.0);
        assert.equal(res.reflectKnockback, true);
        assert.equal(player.coins, 58);
        assert.equal(state.coinsEarnedFromBlocks, 8);
    });

    test('does not convert blocks from other non-wizard monsters', () => {
        const state = createPlayerTarotState();
        applyTarotBlessing(state, TAROT_CARD_IDS.REVERSE_PSYCHOLOGY);

        const player = { coins: 50, health: 100 };
        const res = resolveReversePsychologyBlock(state, player, 'mudAlien', true);
        assert.equal(res.converted, false);
        assert.equal(player.coins, 50);
    });
});

describe('Tarot Draft HUD Lifecycle & Standalone Safety', () => {
    test('createTarotDraftHUD initializes cleanly in headless environments', () => {
        let selected = null;
        const hud = createTarotDraftHUD({
            onSelect: (card) => { selected = card; },
        });

        assert.equal(hud.isVisible(), false);
        const session = hud.showDraft({ checkpointIndex: 2, seed: 1234 });
        assert.ok(session);
        assert.equal(session.cards.length, 3);
        assert.equal(hud.isVisible(), true);

        hud.hideDraft();
        assert.equal(hud.isVisible(), false);
        hud.dispose();
    });

    test('HUD pickOption selects card by index and updates session', () => {
        const hud = createTarotDraftHUD();
        hud.showDraft({ checkpointIndex: 4, seed: 4321 });

        const outcome = hud.pickOption(1);
        assert.equal(outcome.success, true);
        assert.equal(outcome.selectedIndex, 1);
        hud.dispose();
    });
});
