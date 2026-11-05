import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    MEDAL_DEFINITIONS,
    MEDAL_KEYS,
    MEDAL_TIERS,
    normalizePlayerStats,
    getMedalTier,
    computePlayerMedalScores,
    evaluateRunAwards,
    formatAwardAnnouncement,
} from '../shared/run-awards.js';

describe('run-awards metadata and medal definitions', () => {
    test('defines all five required co-op awards', () => {
        const expected = [
            'Monster Hunter',
            'Untouchable Blocker',
            'Plank Parkour Master',
            'Big Spender',
            'Rearguard Hero',
        ];
        assert.deepEqual(MEDAL_KEYS, expected);
        for (const key of expected) {
            assert.ok(MEDAL_DEFINITIONS[key], `Missing definition for ${key}`);
            assert.ok(MEDAL_DEFINITIONS[key].id);
            assert.ok(MEDAL_DEFINITIONS[key].icon);
            assert.ok(MEDAL_DEFINITIONS[key].description);
            assert.ok(MEDAL_DEFINITIONS[key].badgeColor);
            assert.equal(typeof MEDAL_DEFINITIONS[key].computeScore, 'function');
        }
    });

    test('all medal tiers have strictly increasing bronze < silver < gold thresholds', () => {
        for (const key of MEDAL_KEYS) {
            const t = MEDAL_DEFINITIONS[key].tierThresholds;
            assert.ok(t.bronze > 0, `${key} bronze threshold must be > 0`);
            assert.ok(t.silver > t.bronze, `${key} silver threshold must be > bronze`);
            assert.ok(t.gold > t.silver, `${key} gold threshold must be > silver`);
        }
    });

    test('getMedalTier maps scores to appropriate tier bounds', () => {
        const mh = 'Monster Hunter';
        assert.equal(getMedalTier(mh, 0), MEDAL_TIERS.NONE);
        assert.equal(getMedalTier(mh, 49), MEDAL_TIERS.NONE);
        assert.equal(getMedalTier(mh, 50), MEDAL_TIERS.BRONZE);
        assert.equal(getMedalTier(mh, 149), MEDAL_TIERS.BRONZE);
        assert.equal(getMedalTier(mh, 150), MEDAL_TIERS.SILVER);
        assert.equal(getMedalTier(mh, 299), MEDAL_TIERS.SILVER);
        assert.equal(getMedalTier(mh, 300), MEDAL_TIERS.GOLD);
        assert.equal(getMedalTier(mh, 1000), MEDAL_TIERS.GOLD);
    });

    test('getMedalTier returns NONE for unknown medal key', () => {
        assert.equal(getMedalTier('NonExistentMedal', 9999), MEDAL_TIERS.NONE);
    });
});

describe('normalizePlayerStats helper', () => {
    test('handles null and undefined input safely with defaults', () => {
        const stats = normalizePlayerStats(null);
        assert.equal(stats.id, 'unknown');
        assert.equal(stats.name, 'Anonymous Raft');
        assert.equal(stats.kills, 0);
        assert.equal(stats.damageDealt, 0);
        assert.equal(stats.damageBlocked, 0);
        assert.equal(stats.plankLandings, 0);
        assert.equal(stats.coinsSpent, 0);
        assert.equal(stats.deaths, 0);
        assert.deepEqual(stats.upgrades, []);
    });

    test('normalizes partial player object and parses numeric properties', () => {
        const raw = {
            id: 'player-1',
            name: 'Captain Hook',
            kills: '3',
            damageDealt: 125.6,
            upgrades: ['motor', 'weapon'],
            isBot: 0,
        };
        const stats = normalizePlayerStats(raw);
        assert.equal(stats.id, 'player-1');
        assert.equal(stats.name, 'Captain Hook');
        assert.equal(stats.kills, 3);
        assert.equal(stats.damageDealt, 125.6);
        assert.equal(stats.upgradesCount, 2);
        assert.equal(stats.isBot, false);
    });

    test('clamps negative numeric values to zero', () => {
        const raw = {
            kills: -5,
            damageDealt: -100,
            damageBlocked: -20,
            plankLandings: -1,
            coinsSpent: -10,
        };
        const stats = normalizePlayerStats(raw);
        assert.equal(stats.kills, 0);
        assert.equal(stats.damageDealt, 0);
        assert.equal(stats.damageBlocked, 0);
        assert.equal(stats.plankLandings, 0);
        assert.equal(stats.coinsSpent, 0);
    });

    test('derives deaths from isDead boolean flag if deaths is not explicitly supplied', () => {
        const deadPlayer = normalizePlayerStats({ isDead: true });
        const alivePlayer = normalizePlayerStats({ isDead: false });
        assert.equal(deadPlayer.deaths, 1);
        assert.equal(alivePlayer.deaths, 0);
    });
});

describe('individual medal scoring logic', () => {
    test('Monster Hunter formula: 50 * kills + damageDealt', () => {
        const p = { kills: 4, damageDealt: 120 };
        const score = MEDAL_DEFINITIONS['Monster Hunter'].computeScore(p);
        assert.equal(score, 4 * 50 + 120); // 320 -> Gold
        assert.equal(getMedalTier('Monster Hunter', score), MEDAL_TIERS.GOLD);
    });

    test('Untouchable Blocker formula: damageBlocked + 25 * parries + 5 * blocks', () => {
        const p = { damageBlocked: 50, perfectParries: 2, blocks: 4 };
        const score = MEDAL_DEFINITIONS['Untouchable Blocker'].computeScore(p);
        assert.equal(score, 50 + 2 * 25 + 4 * 5); // 120 -> Gold
        assert.equal(getMedalTier('Untouchable Blocker', score), MEDAL_TIERS.GOLD);
    });

    test('Plank Parkour Master formula: 10 * plankLandings + 2 * airtimeSeconds + jumps', () => {
        const p = { plankLandings: 3, airtimeSeconds: 5, jumps: 8 };
        const score = MEDAL_DEFINITIONS['Plank Parkour Master'].computeScore(p);
        assert.equal(score, 3 * 10 + 5 * 2 + 8 * 1); // 48 -> Gold (threshold is 10)
        assert.equal(getMedalTier('Plank Parkour Master', score), MEDAL_TIERS.GOLD);
    });

    test('Big Spender formula: coinsSpent + 15 * upgradesCount', () => {
        const p = { coinsSpent: 45, upgrades: ['motor', 'weapon'] };
        const score = MEDAL_DEFINITIONS['Big Spender'].computeScore(p);
        assert.equal(score, 45 + 2 * 15); // 75 -> Gold (threshold is 60)
        assert.equal(getMedalTier('Big Spender', score), MEDAL_TIERS.GOLD);
    });

    test('Rearguard Hero formula: 3 * rearGuardTimeSeconds + 40 * revivesGiven + 0.5 * damageTaken', () => {
        const p = { rearGuardTimeSeconds: 30, revivesGiven: 2, damageTaken: 40 };
        const score = MEDAL_DEFINITIONS['Rearguard Hero'].computeScore(p);
        assert.equal(score, 30 * 3 + 2 * 40 + 40 * 0.5); // 90 + 80 + 20 = 190 -> Gold (threshold 160)
        assert.equal(getMedalTier('Rearguard Hero', score), MEDAL_TIERS.GOLD);
    });
});

describe('computePlayerMedalScores utility', () => {
    test('computes scores and tiers for each medal on a single player', () => {
        const p = {
            id: 'p1',
            name: 'Hero',
            kills: 2,
            damageDealt: 80,
            damageBlocked: 30,
            plankLandings: 2,
            coinsSpent: 20,
            rearGuardTimeSeconds: 10,
        };
        const res = computePlayerMedalScores(p);
        assert.equal(res.playerId, 'p1');
        assert.equal(res.playerName, 'Hero');
        assert.ok(res.scores['Monster Hunter'] > 0);
        assert.ok(res.scores['Untouchable Blocker'] > 0);
        assert.ok(res.scores['Plank Parkour Master'] > 0);
        assert.ok(res.scores['Big Spender'] > 0);
        assert.ok(res.scores['Rearguard Hero'] > 0);
        assert.ok(res.topMedal);
        assert.ok(res.topScore > 0);
    });
});

describe('evaluateRunAwards squad evaluation', () => {
    test('handles empty squad gracefully', () => {
        const report = evaluateRunAwards([]);
        assert.equal(report.mvp, null);
        assert.equal(report.totalKills, 0);
        assert.equal(report.squadRating, 'D');
        assert.deepEqual(report.playerSummaries, {});
    });

    test('evaluates solo player run and awards eligible medals', () => {
        const soloPlayer = {
            id: 'solo-1',
            name: 'Lone Wolf',
            kills: 5,
            damageDealt: 200,
            damageBlocked: 80,
            plankLandings: 4,
            coinsSpent: 40,
            rearGuardTimeSeconds: 50,
            upgrades: ['motor'],
        };
        const report = evaluateRunAwards([soloPlayer]);
        assert.ok(report.mvp);
        assert.equal(report.mvp.id, 'solo-1');
        assert.equal(report.awards['Monster Hunter'].winnerId, 'solo-1');
        assert.equal(report.awards['Untouchable Blocker'].winnerId, 'solo-1');
        assert.equal(report.awards['Plank Parkour Master'].winnerId, 'solo-1');
        assert.equal(report.awards['Big Spender'].winnerId, 'solo-1');
        assert.equal(report.awards['Rearguard Hero'].winnerId, 'solo-1');
        assert.ok(report.totalKills === 5);
        assert.ok(report.totalDamage === 200);
    });

    test('correctly distributes medals among 4 specialized co-op players', () => {
        const p1 = {
            id: 'p1',
            name: 'Slayer',
            kills: 6,
            damageDealt: 350, // Monster Hunter champion
        };
        const p2 = {
            id: 'p2',
            name: 'Tank',
            damageBlocked: 140,
            perfectParries: 4, // Untouchable Blocker champion
        };
        const p3 = {
            id: 'p3',
            name: 'Acrobat',
            plankLandings: 12,
            airtimeSeconds: 15, // Plank Parkour Master champion
        };
        const p4 = {
            id: 'p4',
            name: 'Merchant',
            coinsSpent: 80,
            upgrades: ['motor', 'weapon', 'armor'], // Big Spender champion
        };

        const report = evaluateRunAwards([p1, p2, p3, p4]);

        assert.equal(report.awards['Monster Hunter'].winnerId, 'p1');
        assert.equal(report.awards['Untouchable Blocker'].winnerId, 'p2');
        assert.equal(report.awards['Plank Parkour Master'].winnerId, 'p3');
        assert.equal(report.awards['Big Spender'].winnerId, 'p4');

        // Verify primary titles match their distinct roles
        assert.equal(report.playerSummaries['p1'].primaryTitle, 'Monster Hunter');
        assert.equal(report.playerSummaries['p2'].primaryTitle, 'Untouchable Blocker');
        assert.equal(report.playerSummaries['p3'].primaryTitle, 'Plank Parkour Master');
        assert.equal(report.playerSummaries['p4'].primaryTitle, 'Big Spender');
    });

    test('rearguard protector wins Rearguard Hero medal', () => {
        const leader = {
            id: 'leader',
            name: 'Speedrunner',
            kills: 1,
            damageDealt: 30,
            rearGuardTimeSeconds: 2,
        };
        const rearguard = {
            id: 'guard',
            name: 'Anchor',
            rearGuardTimeSeconds: 90,
            revivesGiven: 3,
            damageTaken: 60,
        };

        const report = evaluateRunAwards([leader, rearguard]);
        assert.equal(report.awards['Rearguard Hero'].winnerId, 'guard');
        assert.equal(report.awards['Rearguard Hero'].winningTier, MEDAL_TIERS.GOLD);
    });

    test('leaves medal unclaimed if no player meets minimum bronze threshold', () => {
        const pacifists = [
            { id: 'p1', name: 'Peace 1', kills: 0, damageDealt: 5 },
            { id: 'p2', name: 'Peace 2', kills: 0, damageDealt: 10 },
        ];
        // Threshold for Monster Hunter Bronze is 50
        const report = evaluateRunAwards(pacifists);
        assert.equal(report.awards['Monster Hunter'].winnerId, null);
        assert.equal(report.awards['Monster Hunter'].winningTier, MEDAL_TIERS.NONE);
        assert.equal(report.awards['Monster Hunter'].winningScore, 0);
    });

    test('tie breaking is deterministic (uses playerId ascending as secondary sort)', () => {
        const pA = { id: 'playerA', name: 'Alice', kills: 2, damageDealt: 100 };
        const pB = { id: 'playerB', name: 'Bob', kills: 2, damageDealt: 100 };

        const report = evaluateRunAwards([pB, pA]);
        // Scores are identical: 2 * 50 + 100 = 200. playerA < playerB alphabetically.
        assert.equal(report.awards['Monster Hunter'].winnerId, 'playerA');
    });

    test('mvp prefers human players over AI bots in exact ties', () => {
        const human = {
            id: 'h1',
            name: 'Human Player',
            isBot: false,
            kills: 2,
            damageDealt: 50,
        };
        const bot = {
            id: 'b1',
            name: 'Rusty',
            isBot: true,
            kills: 2,
            damageDealt: 50,
        };
        const report = evaluateRunAwards([bot, human]);
        assert.equal(report.mvp.id, 'h1');
        assert.equal(report.mvp.isBot, false);
    });

    test('mvp score is penalized by deaths', () => {
        const recklessHero = {
            id: 'reckless',
            name: 'Reckless',
            kills: 5,
            damageDealt: 200,
            deaths: 4, // 4 * 100 = -400 penalty
        };
        const carefulHero = {
            id: 'careful',
            name: 'Careful',
            kills: 4,
            damageDealt: 180,
            deaths: 0,
        };
        const report = evaluateRunAwards([recklessHero, carefulHero]);
        assert.equal(report.mvp.id, 'careful');
    });

    test('calculates squad totals and assigns composite rating correctly', () => {
        const legendaryCrew = [
            { id: 'p1', kills: 8, damageDealt: 500, plankLandings: 6, coinsSpent: 50, deaths: 0 },
            { id: 'p2', kills: 6, damageDealt: 450, plankLandings: 4, coinsSpent: 40, deaths: 0 },
        ];
        const report = evaluateRunAwards(legendaryCrew);
        assert.equal(report.totalKills, 14);
        assert.equal(report.totalDamage, 950);
        assert.equal(report.totalPlanks, 10);
        assert.equal(report.totalCoinsSpent, 90);
        assert.equal(report.totalDeaths, 0);
        assert.equal(report.squadRating, 'S+');
    });

    test('assigns lower ratings (A, B, C, D) for lower squad composites', () => {
        const modestCrew = [
            { id: 'p1', kills: 1, damageDealt: 50, plankLandings: 0, coinsSpent: 10, deaths: 2 },
        ];
        const report = evaluateRunAwards(modestCrew);
        assert.ok(['C', 'D'].includes(report.squadRating));
    });

    test('accepts object map of players as well as array', () => {
        const playerMap = {
            'id-1': { id: 'id-1', name: 'Alpha', kills: 3, damageDealt: 100 },
            'id-2': { id: 'id-2', name: 'Beta', kills: 1, damageDealt: 50 },
        };
        const report = evaluateRunAwards(playerMap);
        assert.equal(report.awards['Monster Hunter'].winnerId, 'id-1');
        assert.ok(report.playerSummaries['id-1']);
        assert.ok(report.playerSummaries['id-2']);
    });
});

describe('formatAwardAnnouncement formatter', () => {
    test('formats a readable announcement string with MVP and medal details', () => {
        const crew = [
            { id: 'p1', name: 'Viking', kills: 5, damageDealt: 200 },
            { id: 'p2', name: 'Shieldmaiden', damageBlocked: 100 },
        ];
        const report = evaluateRunAwards(crew);
        const text = formatAwardAnnouncement(report);

        assert.ok(text.includes('VICTORY RUN CO-OP MEDALS'));
        assert.ok(text.includes('MVP:'));
        assert.ok(text.includes('Monster Hunter'));
        assert.ok(text.includes('Untouchable Blocker'));
        assert.ok(text.includes('Squad Rating:'));
    });

    test('handles empty or malformed report safely', () => {
        assert.equal(formatAwardAnnouncement(null), 'Run Concluded.');
        assert.equal(formatAwardAnnouncement({}), 'Run Concluded.');
    });
});
