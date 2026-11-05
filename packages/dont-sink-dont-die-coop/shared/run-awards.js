/**
 * Don't Sink, Don't Die — Post-Run Co-Op Awards & Titles Evaluator
 * Zero external dependencies. Deterministic calculation of end-of-run player
 * medals, accolades, MVP rankings, and victory display cards.
 *
 * Core Medals & Titles:
 *   - 'Monster Hunter': High kills / damage dealt to enemies.
 *   - 'Untouchable Blocker': Damage prevented via shielding / parry efficiency.
 *   - 'Plank Parkour Master': Landings on elevated planks / obstacle stunts.
 *   - 'Big Spender': Shop upgrades purchased / coins spent in the Harbor Armory.
 *   - 'Rearguard Hero': Protecting the rear from the wizard / absorbing rear-guard threat.
 */

// ─── Constants & Metadata ──────────────────────────────────────────────────

export const MEDAL_DEFINITIONS = {
    'Monster Hunter': {
        id: 'monster-hunter',
        name: 'Monster Hunter',
        category: 'combat',
        icon: '⚔️',
        description: 'Dealt relentless damage to river horrors and scored the most kills.',
        badgeColor: '#ef4444', // Red-500
        tierThresholds: {
            bronze: 50,
            silver: 150,
            gold: 300,
        },
        computeScore(stats) {
            const kills = stats.kills || 0;
            const damage = stats.damageDealt || 0;
            return kills * 50 + damage;
        },
    },
    'Untouchable Blocker': {
        id: 'untouchable-blocker',
        name: 'Untouchable Blocker',
        category: 'defense',
        icon: '🛡️',
        description: 'Mastered shield timing, absorbing crushing blows with minimal hull damage.',
        badgeColor: '#3b82f6', // Blue-500
        tierThresholds: {
            bronze: 20,
            silver: 60,
            gold: 120,
        },
        computeScore(stats) {
            const blocked = stats.damageBlocked || 0;
            const parries = stats.perfectParries || 0;
            const blockHits = stats.blocks || 0;
            return blocked + parries * 25 + blockHits * 5;
        },
    },
    'Plank Parkour Master': {
        id: 'plank-parkour-master',
        name: 'Plank Parkour Master',
        category: 'mobility',
        icon: '🪵',
        description: 'Leaped from the waves onto high elevated pontoons and avoided river traps.',
        badgeColor: '#10b981', // Emerald-500
        tierThresholds: {
            bronze: 2,
            silver: 5,
            gold: 10,
        },
        computeScore(stats) {
            const plankLandings = stats.plankLandings || 0;
            const airtime = stats.airtimeSeconds || 0;
            const jumpCount = stats.jumps || 0;
            return plankLandings * 10 + airtime * 2 + jumpCount * 1;
        },
    },
    'Big Spender': {
        id: 'big-spender',
        name: 'Big Spender',
        category: 'economy',
        icon: '💰',
        description: 'Lavishly funded raft enhancements and purchased high-tier armor & engines.',
        badgeColor: '#f59e0b', // Amber-500
        tierThresholds: {
            bronze: 15,
            silver: 35,
            gold: 60,
        },
        computeScore(stats) {
            const coinsSpent = stats.coinsSpent || 0;
            const upgradesCount = Array.isArray(stats.upgrades)
                ? stats.upgrades.length
                : (stats.upgradesCount || 0);
            return coinsSpent + upgradesCount * 15;
        },
    },
    'Rearguard Hero': {
        id: 'rearguard-hero',
        name: 'Rearguard Hero',
        category: 'support',
        icon: '🦅',
        description: 'Stood watch as the squad anchor, taking the wizard aggro and protecting fallen allies.',
        badgeColor: '#8b5cf6', // Violet-500
        tierThresholds: {
            bronze: 30,
            silver: 80,
            gold: 160,
        },
        computeScore(stats) {
            const rearguardTime = stats.rearGuardTimeSeconds || 0;
            const revives = stats.revivesGiven || 0;
            const hitsTaken = stats.damageTaken || 0;
            return rearguardTime * 3 + revives * 40 + hitsTaken * 0.5;
        },
    },
};

export const MEDAL_KEYS = Object.keys(MEDAL_DEFINITIONS);

export const MEDAL_TIERS = {
    GOLD: 'Gold',
    SILVER: 'Silver',
    BRONZE: 'Bronze',
    NONE: 'None',
};

// ─── Evaluator Functions ───────────────────────────────────────────────────

/**
 * Normalizes input player run statistics into a reliable structured schema.
 */
export function normalizePlayerStats(player) {
    if (!player) {
        return {
            id: 'unknown',
            name: 'Anonymous Raft',
            isBot: false,
            color: 0xffffff,
            kills: 0,
            damageDealt: 0,
            damageTaken: 0,
            damageBlocked: 0,
            blocks: 0,
            perfectParries: 0,
            plankLandings: 0,
            airtimeSeconds: 0,
            jumps: 0,
            coinsSpent: 0,
            coinsRemaining: 0,
            upgrades: [],
            upgradesCount: 0,
            rearGuardTimeSeconds: 0,
            revivesGiven: 0,
            deaths: 0,
            finalScore: 0,
        };
    }

    const upgrades = Array.isArray(player.upgrades) ? [...player.upgrades] : [];
    const upgradesCount = upgrades.length || Number(player.upgradesCount) || 0;

    return {
        id: String(player.id || 'player'),
        name: String(player.name || `Player ${player.id || 1}`),
        isBot: Boolean(player.isBot),
        color: Number(player.color ?? 0xffffff),
        kills: Math.max(0, Number(player.kills) || 0),
        damageDealt: Math.max(0, Number(player.damageDealt) || 0),
        damageTaken: Math.max(0, Number(player.damageTaken) || 0),
        damageBlocked: Math.max(0, Number(player.damageBlocked) || 0),
        blocks: Math.max(0, Number(player.blocks) || 0),
        perfectParries: Math.max(0, Number(player.perfectParries) || 0),
        plankLandings: Math.max(0, Number(player.plankLandings) || 0),
        airtimeSeconds: Math.max(0, Number(player.airtimeSeconds) || 0),
        jumps: Math.max(0, Number(player.jumps) || 0),
        coinsSpent: Math.max(0, Number(player.coinsSpent) || 0),
        coinsRemaining: Math.max(0, Number(player.coins) || Number(player.coinsRemaining) || 0),
        upgrades,
        upgradesCount,
        rearGuardTimeSeconds: Math.max(0, Number(player.rearGuardTimeSeconds) || 0),
        revivesGiven: Math.max(0, Number(player.revivesGiven) || 0),
        deaths: Math.max(0, Number(player.deaths) || (player.isDead ? 1 : 0)),
        finalScore: Math.max(0, Number(player.score) || Number(player.finalScore) || 0),
    };
}

/**
 * Calculates which medal tier (Gold, Silver, Bronze, None) a score achieves.
 */
export function getMedalTier(medalKey, score) {
    const def = MEDAL_DEFINITIONS[medalKey];
    if (!def || !def.tierThresholds) return MEDAL_TIERS.NONE;
    if (score >= def.tierThresholds.gold) return MEDAL_TIERS.GOLD;
    if (score >= def.tierThresholds.silver) return MEDAL_TIERS.SILVER;
    if (score >= def.tierThresholds.bronze) return MEDAL_TIERS.BRONZE;
    return MEDAL_TIERS.NONE;
}

/**
 * Computes individual player scores and tiers for all medals.
 */
export function computePlayerMedalScores(rawPlayer) {
    const p = normalizePlayerStats(rawPlayer);
    const result = {
        playerId: p.id,
        playerName: p.name,
        scores: {},
        tiers: {},
        topMedal: null,
        topScore: -1,
    };

    for (const key of MEDAL_KEYS) {
        const def = MEDAL_DEFINITIONS[key];
        const score = def.computeScore(p);
        const tier = getMedalTier(key, score);
        result.scores[key] = score;
        result.tiers[key] = tier;

        if (score > result.topScore) {
            result.topScore = score;
            result.topMedal = key;
        }
    }

    return result;
}

/**
 * Evaluates squad awards across all crew players.
 * For each medal, identifies the winner (highest score), ranks all players,
 * and distributes awards, ensuring fair tie-breaking and granting distinct
 * primary titles when possible.
 *
 * @param {Array<object>} playersList - Array of player state/stat objects
 * @param {object} [options] - Options: minSquadScore, allowMultipleTitles
 * @returns {object} Full awards report with medals, winners, MVP, and player summaries.
 */
export function evaluateRunAwards(playersList = [], options = {}) {
    const list = Array.isArray(playersList)
        ? playersList
        : Object.values(playersList || {});

    const normalizedPlayers = list.map(normalizePlayerStats);

    if (normalizedPlayers.length === 0) {
        return {
            awards: {},
            playerSummaries: {},
            mvp: null,
            totalKills: 0,
            totalDamage: 0,
            totalCoinsSpent: 0,
            squadRating: 'D',
        };
    }

    // 1. Calculate per-player scores for each medal
    const playerMedalData = {};
    for (const p of normalizedPlayers) {
        playerMedalData[p.id] = computePlayerMedalScores(p);
    }

    // 2. Determine winners and leaderboards for each medal
    const awards = {};
    for (const key of MEDAL_KEYS) {
        const def = MEDAL_DEFINITIONS[key];
        const ranking = normalizedPlayers
            .map((p) => ({
                playerId: p.id,
                playerName: p.name,
                isBot: p.isBot,
                score: playerMedalData[p.id].scores[key],
                tier: playerMedalData[p.id].tiers[key],
            }))
            .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));

        const leader = ranking[0];
        const hasAchieved = leader && leader.score >= def.tierThresholds.bronze;

        awards[key] = {
            medal: key,
            id: def.id,
            icon: def.icon,
            badgeColor: def.badgeColor,
            winnerId: hasAchieved ? leader.playerId : null,
            winnerName: hasAchieved ? leader.playerName : null,
            winningScore: hasAchieved ? leader.score : 0,
            winningTier: hasAchieved ? leader.tier : MEDAL_TIERS.NONE,
            ranking,
        };
    }

    // 3. Calculate MVP based on comprehensive score formula
    let mvpPlayer = null;
    let highestMvpScore = -Infinity;

    for (const p of normalizedPlayers) {
        // MVP formula: Kills, Damage, Defense, Agility, Team Support, Objectives
        const combat = (p.kills * 100) + p.damageDealt;
        const defense = p.damageBlocked * 1.5;
        const agility = (p.plankLandings * 50) + (p.airtimeSeconds * 10);
        const economy = p.coinsSpent + (p.upgradesCount * 25);
        const support = (p.rearGuardTimeSeconds * 5) + (p.revivesGiven * 150);
        const penalties = p.deaths * 100;

        const mvpScore = Math.max(0, combat + defense + agility + economy + support - penalties);

        if (mvpScore > highestMvpScore || (mvpScore === highestMvpScore && !p.isBot)) {
            highestMvpScore = mvpScore;
            mvpPlayer = {
                id: p.id,
                name: p.name,
                isBot: p.isBot,
                mvpScore,
                color: p.color,
            };
        }
    }

    // 4. Construct comprehensive player summaries & primary title assignment
    const playerSummaries = {};
    for (const p of normalizedPlayers) {
        const pScores = playerMedalData[p.id];
        const wonMedals = [];

        for (const key of MEDAL_KEYS) {
            if (awards[key].winnerId === p.id) {
                wonMedals.push({
                    title: key,
                    tier: awards[key].winningTier,
                    icon: awards[key].icon,
                    score: awards[key].winningScore,
                });
            }
        }

        // Primary title: Best won medal, or player's highest relative scoring category
        let primaryTitle = 'River Survivor';
        if (wonMedals.length > 0) {
            // Sort by tier weight (Gold > Silver > Bronze) then score
            const tierWeight = { [MEDAL_TIERS.GOLD]: 3, [MEDAL_TIERS.SILVER]: 2, [MEDAL_TIERS.BRONZE]: 1, [MEDAL_TIERS.NONE]: 0 };
            wonMedals.sort((a, b) => (tierWeight[b.tier] - tierWeight[a.tier]) || (b.score - a.score));
            primaryTitle = wonMedals[0].title;
        } else if (pScores.topMedal && pScores.topScore > 0) {
            primaryTitle = pScores.topMedal;
        }

        playerSummaries[p.id] = {
            id: p.id,
            name: p.name,
            isBot: p.isBot,
            color: p.color,
            primaryTitle,
            wonMedals,
            allScores: pScores.scores,
            allTiers: pScores.tiers,
            isMvp: mvpPlayer?.id === p.id,
            stats: p,
        };
    }

    // 5. Squad Totals & Overall Co-Op Grade
    const totalKills = normalizedPlayers.reduce((sum, p) => sum + p.kills, 0);
    const totalDamage = normalizedPlayers.reduce((sum, p) => sum + p.damageDealt, 0);
    const totalCoinsSpent = normalizedPlayers.reduce((sum, p) => sum + p.coinsSpent, 0);
    const totalPlanks = normalizedPlayers.reduce((sum, p) => sum + p.plankLandings, 0);
    const totalDeaths = normalizedPlayers.reduce((sum, p) => sum + p.deaths, 0);

    const squadComposite = (totalKills * 200) + totalDamage + (totalPlanks * 100) + (totalCoinsSpent * 2) - (totalDeaths * 300);
    let squadRating = 'C';
    if (squadComposite >= 2000) squadRating = 'S+';
    else if (squadComposite >= 1400) squadRating = 'S';
    else if (squadComposite >= 900) squadRating = 'A';
    else if (squadComposite >= 500) squadRating = 'B';
    else if (squadComposite >= 200) squadRating = 'C';
    else squadRating = 'D';

    return {
        awards,
        playerSummaries,
        mvp: mvpPlayer,
        totalKills,
        totalDamage,
        totalCoinsSpent,
        totalPlanks,
        totalDeaths,
        squadRating,
        squadCompositeScore: squadComposite,
    };
}

/**
 * Formats a victory card string representation (useful for logging, toasts, or text display).
 */
export function formatAwardAnnouncement(awardReport) {
    if (!awardReport || !awardReport.awards) return 'Run Concluded.';
    const lines = ['🏆 --- VICTORY RUN CO-OP MEDALS --- 🏆'];

    if (awardReport.mvp) {
        lines.push(`⭐ MVP: ${awardReport.mvp.name} (${Math.round(awardReport.mvp.mvpScore)} pts)`);
    }

    for (const key of MEDAL_KEYS) {
        const aw = awardReport.awards[key];
        if (aw && aw.winnerId) {
            lines.push(`${aw.icon} [${aw.winningTier}] ${aw.medal}: ${aw.winnerName} (${Math.round(aw.winningScore)})`);
        } else {
            lines.push(`${MEDAL_DEFINITIONS[key].icon} [Unclaimed] ${key}`);
        }
    }

    lines.push(`🎖️ Squad Rating: ${awardReport.squadRating}`);
    return lines.join('\n');
}
