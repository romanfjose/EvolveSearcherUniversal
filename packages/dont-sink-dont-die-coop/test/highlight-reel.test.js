import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    HIGHLIGHT_TYPES,
    HIGHLIGHT_DEFINITIONS,
    scoreWizardYeet,
    scorePlankParkour,
    scoreClutchRevive,
    scoreFastestBossKill,
    scoreHammerHonks,
    createHighlightMoment,
    HighlightTracker,
    selectTopHighlights,
    getDefaultFallbackHighlights,
    generateChallengeUrl,
    parseChallengeUrl,
} from '../shared/highlight-reel.js';

import {
    POSTCARD_WIDTH,
    POSTCARD_HEIGHT,
    renderPostcardToCanvas,
    createSharePostcardManager,
} from '../public/js/ui/share-postcard.js';

describe('Highlight Reel: Type definitions and metadata', () => {
    test('defines all 5 required highlight moment categories', () => {
        const expectedTypes = [
            'wizard-yeet',
            'plank-parkour',
            'clutch-revive',
            'fastest-boss-kill',
            'hammer-honks',
        ];
        assert.deepEqual(Object.values(HIGHLIGHT_TYPES), expectedTypes);

        for (const type of expectedTypes) {
            const def = HIGHLIGHT_DEFINITIONS[type];
            assert.ok(def, `Missing definition for ${type}`);
            assert.ok(def.title, `Missing title for ${type}`);
            assert.ok(def.tagline, `Missing tagline for ${type}`);
            assert.ok(def.icon, `Missing icon for ${type}`);
            assert.ok(def.badgeColor, `Missing badge color for ${type}`);
            assert.ok(def.category, `Missing category for ${type}`);
            assert.equal(typeof def.formatScore, 'function');
            assert.equal(typeof def.formatDetail, 'function');
        }
    });

    test('formatScore and formatDetail format strings properly for all moment types', () => {
        for (const [type, def] of Object.entries(HIGHLIGHT_DEFINITIONS)) {
            const scoreStr = def.formatScore(123.4);
            assert.ok(scoreStr.includes('123'));
            const detailStr = def.formatDetail({
                force: 500,
                remainingHp: 1,
                chainLength: 4,
                distance: 30,
                revivedCount: 2,
                healthAtRevive: 1,
                durationSeconds: 12.5,
                dps: 150,
                honkCount: 6,
                windowSeconds: 2.5,
            });
            assert.equal(typeof detailStr, 'string');
            assert.ok(detailStr.length > 5);
        }
    });
});

describe('Highlight Reel: Wizard Yeet scoring logic', () => {
    test('higher force and higher airtime yields higher score', () => {
        const low = scoreWizardYeet({ force: 200, airtimeSeconds: 1, remainingHp: 50 });
        const high = scoreWizardYeet({ force: 800, airtimeSeconds: 3, remainingHp: 50 });
        assert.ok(high > low, `Expected ${high} > ${low}`);
    });

    test('clutch survival with 1 HP yields maximum danger multiplier bonus', () => {
        const fullHpScore = scoreWizardYeet({ force: 500, airtimeSeconds: 2, remainingHp: 100, maxHp: 100 });
        const oneHpScore = scoreWizardYeet({ force: 500, airtimeSeconds: 2, remainingHp: 1, maxHp: 100 });
        assert.ok(oneHpScore > fullHpScore * 2, `1-HP clutch (${oneHpScore}) should be over 2x full hp (${fullHpScore})`);
    });

    test('handles zero, negative, or invalid inputs safely without NaN', () => {
        const score = scoreWizardYeet({ force: -100, airtimeSeconds: null, remainingHp: 'invalid' });
        assert.ok(Number.isFinite(score));
        assert.ok(score >= 0);
    });
});

describe('Highlight Reel: Plank Parkour chain scoring logic', () => {
    test('longer continuous parkour chain scales non-linearly', () => {
        const chain2 = scorePlankParkour({ chainLength: 2, distance: 10, totalAirtime: 1 });
        const chain5 = scorePlankParkour({ chainLength: 5, distance: 30, totalAirtime: 3 });
        const chain10 = scorePlankParkour({ chainLength: 10, distance: 70, totalAirtime: 7 });

        assert.ok(chain5 > chain2 * 2);
        assert.ok(chain10 > chain5 * 2.5);
    });

    test('zero or negative chain length returns zero score', () => {
        assert.equal(scorePlankParkour({ chainLength: 0 }), 0);
        assert.equal(scorePlankParkour({ chainLength: -3 }), 0);
    });

    test('greater distance and airtime reward extra bonus points', () => {
        const shortDist = scorePlankParkour({ chainLength: 4, distance: 10, totalAirtime: 1 });
        const longDist = scorePlankParkour({ chainLength: 4, distance: 60, totalAirtime: 4 });
        assert.ok(longDist > shortDist);
    });
});

describe('Highlight Reel: Clutch 1-HP Checkpoint Revive scoring logic', () => {
    test('reviving at 1 HP gives substantial multiplier compared to reviving at full HP', () => {
        const safeRevive = scoreClutchRevive({ healthAtRevive: 100, revivedCount: 1, checkpointZ: -300 });
        const clutchRevive = scoreClutchRevive({ healthAtRevive: 1, revivedCount: 1, checkpointZ: -300 });
        assert.ok(clutchRevive > safeRevive * 3, `Clutch revive score ${clutchRevive} should be > 3x ${safeRevive}`);
    });

    test('reviving more squad teammates scales base score proportionally', () => {
        const soloRevive = scoreClutchRevive({ healthAtRevive: 1, revivedCount: 1, checkpointZ: -150 });
        const squadRevive = scoreClutchRevive({ healthAtRevive: 1, revivedCount: 3, checkpointZ: -150 });
        assert.ok(squadRevive > soloRevive * 2);
    });

    test('checkpoints deeper down the river grant depth bonus', () => {
        const shallow = scoreClutchRevive({ healthAtRevive: 1, revivedCount: 1, checkpointZ: -150 });
        const deep = scoreClutchRevive({ healthAtRevive: 1, revivedCount: 1, checkpointZ: -1500 });
        assert.ok(deep > shallow);
    });
});

describe('Highlight Reel: Fastest Boss Kill scoring logic', () => {
    test('faster boss kill duration generates significantly higher score', () => {
        const slowKill = scoreFastestBossKill({ durationSeconds: 50, totalDamage: 1000 });
        const fastKill = scoreFastestBossKill({ durationSeconds: 15, totalDamage: 1000 });
        assert.ok(fastKill > slowKill * 2, `Fast kill (${fastKill}) should beat slow kill (${slowKill})`);
    });

    test('high DPS adds significant points to boss kill score', () => {
        const normalDps = scoreFastestBossKill({ durationSeconds: 20, totalDamage: 1000 });
        const insaneDps = scoreFastestBossKill({ durationSeconds: 20, totalDamage: 3000 });
        assert.ok(insaneDps > normalDps);
    });

    test('gracefully clamps extremely short or negative durations', () => {
        const instant = scoreFastestBossKill({ durationSeconds: 0, totalDamage: 500 });
        assert.ok(Number.isFinite(instant));
        assert.ok(instant > 0);
    });
});

describe('Highlight Reel: Squeaky Hammer Honks scoring logic', () => {
    test('high honk count in a tight burst window awards top comedy score', () => {
        const spam = scoreHammerHonks({ honkCount: 12, windowSeconds: 2.5, damageDealt: 240 });
        const sparse = scoreHammerHonks({ honkCount: 3, windowSeconds: 5, damageDealt: 60 });
        assert.ok(spam > sparse * 3);
    });

    test('handles zero honks returning zero', () => {
        assert.equal(scoreHammerHonks({ honkCount: 0, windowSeconds: 3 }), 0);
    });
});

describe('Highlight Reel: createHighlightMoment helper', () => {
    test('throws error on unregistered highlight type', () => {
        assert.throws(() => {
            createHighlightMoment('alien-teleport-dance');
        }, /Unknown highlight type/);
    });

    test('populates all fields and formats strings correctly', () => {
        const moment = createHighlightMoment(HIGHLIGHT_TYPES.WIZARD_YEET, {
            force: 600,
            airtimeSeconds: 2.2,
            remainingHp: 1,
            playerName: 'Deckhand Bob',
        });
        assert.equal(moment.type, HIGHLIGHT_TYPES.WIZARD_YEET);
        assert.equal(moment.playerName, 'Deckhand Bob');
        assert.equal(moment.title, 'Wizard Yeet Survivor');
        assert.ok(moment.score > 0);
        assert.ok(moment.scoreText.includes('Yeet Pts'));
        assert.ok(moment.detail.includes('600N blast'));
    });
});

describe('Highlight Reel: HighlightTracker lifecycle & event logging', () => {
    test('records Wizard yeet events and stores them in tracker', () => {
        const tracker = new HighlightTracker();
        const m = tracker.recordWizardYeet({
            playerId: 'p1',
            playerName: 'Sailor',
            force: 700,
            airtimeSeconds: 2.5,
            remainingHp: 1,
            timestamp: 12000,
        });
        assert.ok(m);
        assert.equal(tracker.getAllMoments().length, 1);
        assert.equal(tracker.getAllMoments()[0].type, HIGHLIGHT_TYPES.WIZARD_YEET);
    });

    test('tracks consecutive plank parkour landing chains and registers highlight on chain >= 2', () => {
        const tracker = new HighlightTracker();
        // 1st landing: sets up chain, does not register highlight yet
        const first = tracker.recordPlankLanding({ playerId: 'p1', plankZ: -100, airtime: 0.5, timestamp: 1000 });
        assert.equal(first, null);
        assert.equal(tracker.getAllMoments().length, 0);

        // 2nd landing: chain length 2, registers highlight
        const second = tracker.recordPlankLanding({ playerId: 'p1', plankZ: -125, airtime: 0.6, timestamp: 2000 });
        assert.ok(second);
        assert.equal(second.type, HIGHLIGHT_TYPES.PLANK_PARKOUR);
        assert.equal(second.data.chainLength, 2);
        assert.equal(tracker.getAllMoments().length, 1);

        // 3rd landing: increments chain to 3
        const third = tracker.recordPlankLanding({ playerId: 'p1', plankZ: -160, airtime: 0.8, timestamp: 3000 });
        assert.equal(third.data.chainLength, 3);
        assert.equal(tracker.getAllMoments().length, 2);
    });

    test('breakPlankChain clears active streak when hitting river water', () => {
        const tracker = new HighlightTracker();
        tracker.recordPlankLanding({ playerId: 'p1', plankZ: -100 });
        tracker.recordPlankLanding({ playerId: 'p1', plankZ: -130 });
        assert.equal(tracker.activePlankChains.has('p1'), true);

        tracker.breakPlankChain('p1');
        assert.equal(tracker.activePlankChains.has('p1'), false);

        // Next landing starts fresh at chain length 1
        const fresh = tracker.recordPlankLanding({ playerId: 'p1', plankZ: -200 });
        assert.equal(fresh, null);
    });

    test('records clutch checkpoint revive events', () => {
        const tracker = new HighlightTracker();
        const m = tracker.recordClutchRevive({
            playerId: 'p2',
            playerName: 'Doctor',
            healthAtRevive: 1,
            revivedCount: 2,
            checkpointZ: -450,
            timestamp: 45000,
        });
        assert.ok(m);
        assert.equal(m.type, HIGHLIGHT_TYPES.CLUTCH_REVIVE);
        assert.ok(m.score > 1000);
    });

    test('records fastest boss kill with team names', () => {
        const tracker = new HighlightTracker();
        const m = tracker.recordBossKill({
            durationSeconds: 18.2,
            totalDamage: 1200,
            bossHp: 1000,
            teamNames: ['Alpha', 'Bravo'],
            timestamp: 60000,
        });
        assert.ok(m);
        assert.equal(m.type, HIGHLIGHT_TYPES.FASTEST_BOSS_KILL);
        assert.ok(m.playerName.includes('Alpha, Bravo'));
    });

    test('accumulates hammer honks and triggers highlight when hitting 3+ honks in window', () => {
        const tracker = new HighlightTracker();
        const h1 = tracker.recordHammerHonk({ playerId: 'p1', timestamp: 1000 });
        const h2 = tracker.recordHammerHonk({ playerId: 'p1', timestamp: 1500 });
        assert.equal(h1, null);
        assert.equal(h2, null);

        // 3rd honk within window triggers moment
        const h3 = tracker.recordHammerHonk({ playerId: 'p1', timestamp: 2000 });
        assert.ok(h3);
        assert.equal(h3.type, HIGHLIGHT_TYPES.HAMMER_HONKS);
        assert.equal(h3.data.honkCount, 3);
    });

    test('reset clears moments, active plank chains, and hammer windows', () => {
        const tracker = new HighlightTracker();
        tracker.recordWizardYeet({ force: 400 });
        tracker.recordPlankLanding({ playerId: 'p1', plankZ: -100 });
        tracker.recordHammerHonk({ playerId: 'p1', timestamp: 1000 });
        assert.ok(tracker.getAllMoments().length > 0);

        tracker.reset();
        assert.equal(tracker.getAllMoments().length, 0);
        assert.equal(tracker.activePlankChains.size, 0);
        assert.equal(tracker.hammerHonkWindows.size, 0);
    });
});

describe('Highlight Reel: selectTopHighlights & top-3 selection algorithm', () => {
    test('extracts top 3 moments prioritizing category diversity across different types', () => {
        const tracker = new HighlightTracker();
        // Add 2 wizard yeets
        tracker.addMoment(HIGHLIGHT_TYPES.WIZARD_YEET, { score: 900, title: 'Yeet High' });
        tracker.addMoment(HIGHLIGHT_TYPES.WIZARD_YEET, { score: 850, title: 'Yeet Lower' });
        // Add 1 clutch revive
        tracker.addMoment(HIGHLIGHT_TYPES.CLUTCH_REVIVE, { score: 700, title: 'Revive Clutch' });
        // Add 1 boss kill
        tracker.addMoment(HIGHLIGHT_TYPES.FASTEST_BOSS_KILL, { score: 600, title: 'Boss Kill' });

        const top3 = tracker.getTopHighlights(3);
        assert.equal(top3.length, 3);
        const types = top3.map((m) => m.type);
        // Diverse pick should include WIZARD_YEET, CLUTCH_REVIVE, and FASTEST_BOSS_KILL
        assert.ok(types.includes(HIGHLIGHT_TYPES.WIZARD_YEET));
        assert.ok(types.includes(HIGHLIGHT_TYPES.CLUTCH_REVIVE));
        assert.ok(types.includes(HIGHLIGHT_TYPES.FASTEST_BOSS_KILL));
        // Highest wizard yeet should be picked
        assert.equal(top3[0].title, 'Yeet High');
    });

    test('fills remaining slots with duplicate categories if fewer distinct categories exist', () => {
        const moments = [
            createHighlightMoment(HIGHLIGHT_TYPES.WIZARD_YEET, { score: 1000, title: 'Yeet 1' }),
            createHighlightMoment(HIGHLIGHT_TYPES.WIZARD_YEET, { score: 800, title: 'Yeet 2' }),
            createHighlightMoment(HIGHLIGHT_TYPES.WIZARD_YEET, { score: 600, title: 'Yeet 3' }),
        ];
        const top3 = selectTopHighlights(moments, 3);
        assert.equal(top3.length, 3);
        assert.equal(top3[0].title, 'Yeet 1');
        assert.equal(top3[1].title, 'Yeet 2');
        assert.equal(top3[2].title, 'Yeet 3');
    });

    test('returns high-quality themed fallback highlights on empty run', () => {
        const top3 = selectTopHighlights([], 3);
        assert.equal(top3.length, 3);
        for (const item of top3) {
            assert.ok(item.title);
            assert.ok(item.score > 0);
            assert.ok(item.badgeColor);
        }
    });

    test('tie breaking on identical scores orders by timestamp ascending', () => {
        const moments = [
            createHighlightMoment(HIGHLIGHT_TYPES.HAMMER_HONKS, { score: 500, timestamp: 3000, id: 'later' }),
            createHighlightMoment(HIGHLIGHT_TYPES.HAMMER_HONKS, { score: 500, timestamp: 1000, id: 'earlier' }),
        ];
        const res = selectTopHighlights(moments, 2);
        assert.equal(res[0].id, 'earlier');
        assert.equal(res[1].id, 'later');
    });
});

describe('Highlight Reel: Friend Challenge Link generation & parsing', () => {
    test('generates valid challenge URL query string with seed, ghost, squad, and time', () => {
        const url = generateChallengeUrl({
            seed: 98765,
            ghost: 'GHOST_ABC123',
            squadName: 'Sea Dogs',
            timeMs: 145000,
            baseUrl: 'https://dontsink.io',
        });
        assert.ok(url.startsWith('https://dontsink.io?'));
        assert.ok(url.includes('seed=98765'));
        assert.ok(url.includes('ghost=GHOST_ABC123'));
        assert.ok(url.includes('squad=Sea+Dogs') || url.includes('squad=Sea%20Dogs'));
        assert.ok(url.includes('time=145000'));
    });

    test('generates relative challenge query string when baseUrl is omitted', () => {
        const rel = generateChallengeUrl({ seed: 42 });
        assert.ok(rel.startsWith('?seed=42'));
    });

    test('parseChallengeUrl parses full URL correctly into structured object', () => {
        const parsed = parseChallengeUrl('https://dontsink.io/game?seed=4567&ghost=TEST_GHOST&squad=Raft_Crew&time=88000');
        assert.equal(parsed.seed, 4567);
        assert.equal(parsed.ghost, 'TEST_GHOST');
        assert.equal(parsed.squadName, 'Raft_Crew');
        assert.equal(parsed.timeMs, 88000);
    });

    test('parseChallengeUrl parses raw query string correctly', () => {
        const parsed = parseChallengeUrl('?seed=123&ghost=TOKEN_XYZ');
        assert.equal(parsed.seed, 123);
        assert.equal(parsed.ghost, 'TOKEN_XYZ');
    });

    test('parseChallengeUrl returns null on empty or invalid inputs', () => {
        assert.equal(parseChallengeUrl(''), null);
        assert.equal(parseChallengeUrl(null), null);
        assert.equal(parseChallengeUrl('https://dontsink.io/'), null);
    });
});

describe('Postcard Generator: Canvas rendering and dimensions', () => {
    test('postcard constants enforce standard 1200x630 social share dimensions', () => {
        assert.equal(POSTCARD_WIDTH, 1200);
        assert.equal(POSTCARD_HEIGHT, 630);
    });

    test('renderPostcardToCanvas draws all background, borders, text, and 3 highlight cards without throwing', () => {
        // Mock standard 2D Context calls
        const operations = [];
        const ctxMock = {
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
            fillRect: (...args) => operations.push({ op: 'fillRect', args }),
            strokeRect: (...args) => operations.push({ op: 'strokeRect', args }),
            beginPath: () => operations.push({ op: 'beginPath' }),
            moveTo: () => operations.push({ op: 'moveTo' }),
            lineTo: () => operations.push({ op: 'lineTo' }),
            stroke: () => operations.push({ op: 'stroke' }),
            fill: () => operations.push({ op: 'fill' }),
            arc: () => operations.push({ op: 'arc' }),
            rect: () => operations.push({ op: 'rect' }),
            fillText: (text) => operations.push({ op: 'fillText', text }),
            measureText: (text) => ({ width: text.length * 8 }),
            save: () => operations.push({ op: 'save' }),
            restore: () => operations.push({ op: 'restore' }),
        };

        const moments = [
            createHighlightMoment(HIGHLIGHT_TYPES.WIZARD_YEET, { force: 750, remainingHp: 1, playerName: 'Jules' }),
            createHighlightMoment(HIGHLIGHT_TYPES.PLANK_PARKOUR, { chainLength: 5, distance: 40 }),
            createHighlightMoment(HIGHLIGHT_TYPES.FASTEST_BOSS_KILL, { durationSeconds: 14.5 }),
        ];

        renderPostcardToCanvas(ctxMock, {
            title: "DON'T SINK, DON'T DIE",
            subtitle: 'RIVER MOUTH VICTORY DISPATCH',
            crewNames: ['Jules', 'Partner'],
            squadRating: 'S+',
            finalTimeFormatted: '03:45.2',
            seed: 777,
            highlights: moments,
            watermark: '?seed=777&ghost=mock',
        });

        // Verify key elements were rendered
        const fillTexts = operations.filter((o) => o.op === 'fillText').map((o) => o.text);
        assert.ok(fillTexts.some((t) => t.includes("DON'T SINK, DON'T DIE")));
        assert.ok(fillTexts.some((t) => t.includes('S+')));
        assert.ok(fillTexts.some((t) => t.includes('03:45.2')));
        assert.ok(fillTexts.some((t) => t.includes('SEED #777')));
        assert.ok(fillTexts.some((t) => t.includes('#1')));
        assert.ok(fillTexts.some((t) => t.includes('#2')));
        assert.ok(fillTexts.some((t) => t.includes('#3')));
        assert.ok(fillTexts.some((t) => t.includes('Wizard Yeet Survivor')));
    });

    test('createSharePostcardManager operates cleanly in headless test environment', () => {
        const mgr = createSharePostcardManager({
            baseUrl: 'https://dontsink.io/game',
        });
        assert.ok(mgr.tracker instanceof HighlightTracker);

        const data = mgr.show({
            seed: 2026,
            finalTimeMs: 185000,
            squadRating: 'S',
            crewNames: ['Raft Captain'],
        });

        assert.equal(data.seed, 2026);
        assert.equal(data.squadRating, 'S');
        assert.ok(data.challengeUrl.includes('seed=2026'));
        assert.equal(data.highlights.length, 3);

        mgr.hide();
        mgr.dispose();
    });
});
