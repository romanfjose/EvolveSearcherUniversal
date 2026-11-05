/**
 * Don't Sink, Don't Die — Run Highlight Scorer & Social Challenge Link Engine
 * Zero external dependencies. Deterministic calculation of run highlights,
 * hype moments, comedic stunts, and friend challenge URL generator/parser.
 *
 * Core Moment Categories:
 *   1. WIZARD_YEET: Biggest Wizard yeet survived (force, airtime, distance, surviving with health).
 *   2. PLANK_PARKOUR: Longest plank parkour chain (consecutive plank landings without water touch).
 *   3. CLUTCH_REVIVE: Clutch 1-HP checkpoint revive (crossing checkpoint or reviving teammate with <= 1 HP).
 *   4. FASTEST_BOSS_KILL: Fastest Boss / Kraken kill (elapsed combat seconds, boss DPS).
 *   5. HAMMER_HONKS: Most Squeaky Hammer honks (rapid squeaks / hammer hits on monsters).
 */

export const HIGHLIGHT_TYPES = {
    WIZARD_YEET: 'wizard-yeet',
    PLANK_PARKOUR: 'plank-parkour',
    CLUTCH_REVIVE: 'clutch-revive',
    FASTEST_BOSS_KILL: 'fastest-boss-kill',
    HAMMER_HONKS: 'hammer-honks',
};

export const HIGHLIGHT_DEFINITIONS = {
    [HIGHLIGHT_TYPES.WIZARD_YEET]: {
        type: HIGHLIGHT_TYPES.WIZARD_YEET,
        title: 'Wizard Yeet Survivor',
        tagline: 'Defied Arcane Gravity',
        icon: '🧙‍♂️',
        badgeColor: '#a855f7', // Purple-500
        category: 'hype',
        description: 'Blown into orbit by the River Wizard and lived to tell the tale.',
        formatScore: (score) => `${Math.round(score)} Yeet Pts`,
        formatDetail: (m) => `Survives ${Math.round(m.force || 0)}N blast with ${Math.max(1, Math.round(m.remainingHp || 1))} HP left!`,
    },
    [HIGHLIGHT_TYPES.PLANK_PARKOUR]: {
        type: HIGHLIGHT_TYPES.PLANK_PARKOUR,
        title: 'Parkour Virtuoso',
        tagline: 'The Floor is Lava',
        icon: '🪵',
        badgeColor: '#10b981', // Emerald-500
        category: 'stunt',
        description: 'Chained consecutive pontoon and plank landings without touching river water.',
        formatScore: (score) => `${Math.round(score)} Combo`,
        formatDetail: (m) => `${m.chainLength || 0}-plank continuous chain across ${(m.distance || 0).toFixed(0)}m!`,
    },
    [HIGHLIGHT_TYPES.CLUTCH_REVIVE]: {
        type: HIGHLIGHT_TYPES.CLUTCH_REVIVE,
        title: '1-HP Miracle Anchor',
        tagline: 'Refused to Sink',
        icon: '❤️‍🔥',
        badgeColor: '#ef4444', // Red-500
        category: 'clutch',
        description: 'Crossed the river checkpoint gate with 1 HP remaining, resurrecting the entire crew.',
        formatScore: (score) => `${Math.round(score)} Clutch Pts`,
        formatDetail: (m) => `Revived ${m.revivedCount || 1} fallen mate(s) at checkpoint with ${Math.round(m.healthAtRevive ?? 1)} HP!`,
    },
    [HIGHLIGHT_TYPES.FASTEST_BOSS_KILL]: {
        type: HIGHLIGHT_TYPES.FASTEST_BOSS_KILL,
        title: 'Kraken Speed-Slayer',
        tagline: 'Calamari in Record Time',
        icon: '🦑',
        badgeColor: '#f59e0b', // Amber-500
        category: 'hype',
        description: 'Annihilated the Dread Kraken boss in blistering record time.',
        formatScore: (score) => `${Math.round(score)} DPS Pts`,
        formatDetail: (m) => `Slain in ${(m.durationSeconds || 0).toFixed(1)}s flat (${Math.round(m.dps || 0)} DPS)!`,
    },
    [HIGHLIGHT_TYPES.HAMMER_HONKS]: {
        type: HIGHLIGHT_TYPES.HAMMER_HONKS,
        title: 'Squeaky Symphonist',
        tagline: 'Maximum Honkage',
        icon: '🔨',
        badgeColor: '#ec4899', // Pink-500
        category: 'funny',
        description: 'Rattled enemy eardrums with an absurd rapid barrage of squeaky toy hammer strikes.',
        formatScore: (score) => `${Math.round(score)} Honks`,
        formatDetail: (m) => `Landed ${m.honkCount || 0} squeaks in ${(m.windowSeconds || 5).toFixed(1)}s window!`,
    },
};

// ─── Highlight Scoring Algorithms ──────────────────────────────────────────

/**
 * Computes score for a Wizard Yeet moment:
 * Force magnitude + surviving airtime bonus + low-health survival multiplier.
 * e.g., higher force survived at lower health yields higher hype score.
 */
export function scoreWizardYeet({ force = 0, airtimeSeconds = 0, remainingHp = 1, maxHp = 100 } = {}) {
    const f = Math.max(0, Number(force) || 0);
    const air = Math.max(0, Number(airtimeSeconds) || 0);
    const hp = Math.max(1, Number(remainingHp) || 1);
    const max = Math.max(hp, Number(maxHp) || 100);

    // Closeness to death bonus (0 near full hp, up to 1.5x at 1 HP)
    const dangerRatio = 1 - Math.min(1, Math.max(0, (hp - 1) / max));
    const dangerMultiplier = 1.0 + (dangerRatio * 1.5);

    // Score components: raw blast force + airtime hangtime
    const baseScore = (f * 0.25) + (air * 50);
    return Math.round(baseScore * dangerMultiplier);
}

/**
 * Computes score for a Plank Parkour chain moment:
 * Exponential chain bonus + distance traversed.
 */
export function scorePlankParkour({ chainLength = 0, distance = 0, totalAirtime = 0 } = {}) {
    const n = Math.max(0, Number(chainLength) || 0);
    const d = Math.max(0, Number(distance) || 0);
    const air = Math.max(0, Number(totalAirtime) || 0);

    if (n <= 0) return 0;
    // Base 50 pts per chain step + exponential streak bonus + distance coverage
    const streakBonus = Math.pow(n, 1.6) * 35;
    const distanceBonus = d * 4;
    const airtimeBonus = air * 15;
    return Math.round(streakBonus + distanceBonus + airtimeBonus);
}

/**
 * Computes score for a Clutch Revive moment:
 * Reviving at 1 HP gets massive multiplier, scaled by number of teammates resurrected.
 */
export function scoreClutchRevive({ healthAtRevive = 1, revivedCount = 1, checkpointZ = -300 } = {}) {
    const hp = Math.max(0.01, Number(healthAtRevive) || 1);
    const count = Math.max(1, Number(revivedCount) || 1);
    const depthBonus = Math.min(500, Math.abs(Number(checkpointZ) || 0) * 0.25);

    // HP factor: 1 HP or less gives maximum weight (1000 base), falls off steeply with high hp
    let hpMultiplier = 1.0;
    if (hp <= 1.5) {
        hpMultiplier = 3.5;
    } else if (hp <= 10) {
        hpMultiplier = 2.2;
    } else if (hp <= 25) {
        hpMultiplier = 1.5;
    } else {
        hpMultiplier = 1.0;
    }

    const baseClutch = 300 * count + depthBonus;
    return Math.round(baseClutch * hpMultiplier);
}

/**
 * Computes score for a Fastest Boss Kill moment:
 * Faster kill relative to baseline (e.g., 60s) yields higher score; high DPS rewarded.
 */
export function scoreFastestBossKill({ durationSeconds = 60, totalDamage = 1000, bossHp = 1000 } = {}) {
    const dur = Math.max(0.5, Number(durationSeconds) || 60);
    const dmg = Math.max(1, Number(totalDamage) || Number(bossHp) || 1000);
    const dps = dmg / dur;

    // Time factor: baseline 45s. Below 45s increases score dramatically.
    const speedScore = Math.max(50, (60 - Math.min(55, dur)) * 40);
    const dpsScore = dps * 5;
    return Math.round(speedScore + dpsScore);
}

/**
 * Computes score for Squeaky Hammer Honks:
 * Frequency of honks in rapid burst window + total honks landed.
 */
export function scoreHammerHonks({ honkCount = 0, windowSeconds = 5, damageDealt = 0 } = {}) {
    const count = Math.max(0, Number(honkCount) || 0);
    const win = Math.max(0.5, Number(windowSeconds) || 5);
    const rate = count / win;

    const basePoints = count * 60;
    const rateBonus = rate * 80;
    const dmgBonus = (Number(damageDealt) || 0) * 0.5;
    return Math.round(basePoints + rateBonus + dmgBonus);
}

// ─── Highlight Moment Normalization & Construction ─────────────────────────

export function createHighlightMoment(type, rawData = {}) {
    const def = HIGHLIGHT_DEFINITIONS[type];
    if (!def) {
        throw new Error(`Unknown highlight type: ${type}`);
    }

    let calculatedScore = 0;
    switch (type) {
        case HIGHLIGHT_TYPES.WIZARD_YEET:
            calculatedScore = scoreWizardYeet(rawData);
            break;
        case HIGHLIGHT_TYPES.PLANK_PARKOUR:
            calculatedScore = scorePlankParkour(rawData);
            break;
        case HIGHLIGHT_TYPES.CLUTCH_REVIVE:
            calculatedScore = scoreClutchRevive(rawData);
            break;
        case HIGHLIGHT_TYPES.FASTEST_BOSS_KILL:
            calculatedScore = scoreFastestBossKill(rawData);
            break;
        case HIGHLIGHT_TYPES.HAMMER_HONKS:
            calculatedScore = scoreHammerHonks(rawData);
            break;
    }

    const score = Number.isFinite(rawData.score) ? Number(rawData.score) : calculatedScore;
    const moment = {
        id: rawData.id || `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type,
        title: rawData.title || def.title,
        tagline: rawData.tagline || def.tagline,
        icon: def.icon,
        badgeColor: def.badgeColor,
        category: def.category,
        score,
        playerName: rawData.playerName || 'Crewmate',
        timestamp: Number(rawData.timestamp) || 0,
        data: { ...rawData },
    };

    moment.detail = def.formatDetail(moment.data);
    moment.scoreText = def.formatScore(score);

    return moment;
}

// ─── Highlight Tracker Class ───────────────────────────────────────────────

/**
 * State container for logging and ranking run highlights during gameplay.
 */
export class HighlightTracker {
    constructor() {
        this.moments = [];
        this.activePlankChains = new Map(); // playerId -> { chainLength, startZ, startT, lastAirtime }
        this.hammerHonkWindows = new Map(); // playerId -> array of timestamps
    }

    reset() {
        this.moments = [];
        this.activePlankChains.clear();
        this.hammerHonkWindows.clear();
    }

    /**
     * Record a raw moment and compute its score.
     */
    addMoment(type, rawData = {}) {
        const moment = createHighlightMoment(type, rawData);
        this.moments.push(moment);
        return moment;
    }

    /**
     * Helper to track Wizard Yeet event.
     */
    recordWizardYeet({ playerId, playerName, force, airtimeSeconds, remainingHp, maxHp, timestamp = 0 }) {
        return this.addMoment(HIGHLIGHT_TYPES.WIZARD_YEET, {
            playerId,
            playerName,
            force,
            airtimeSeconds,
            remainingHp,
            maxHp,
            timestamp,
        });
    }

    /**
     * Helper to step plank parkour chain.
     */
    recordPlankLanding({ playerId, playerName, plankZ = 0, airtime = 0.5, timestamp = 0 }) {
        let chain = this.activePlankChains.get(playerId);
        if (!chain) {
            chain = {
                chainLength: 1,
                startZ: plankZ,
                lastZ: plankZ,
                totalAirtime: airtime,
                startT: timestamp,
                playerName: playerName || 'Parkour Pro',
            };
            this.activePlankChains.set(playerId, chain);
        } else {
            chain.chainLength += 1;
            chain.lastZ = plankZ;
            chain.totalAirtime += airtime;
        }

        // Check if chain length is high enough to register as a highlight
        if (chain.chainLength >= 2) {
            const distance = Math.abs(chain.lastZ - chain.startZ);
            return this.addMoment(HIGHLIGHT_TYPES.PLANK_PARKOUR, {
                playerId,
                playerName: chain.playerName,
                chainLength: chain.chainLength,
                distance,
                totalAirtime: chain.totalAirtime,
                timestamp,
            });
        }
        return null;
    }

    /**
     * Resets parkour chain when player hits river water.
     */
    breakPlankChain(playerId) {
        this.activePlankChains.delete(playerId);
    }

    /**
     * Helper to track clutch revive.
     */
    recordClutchRevive({ playerId, playerName, healthAtRevive = 1, revivedCount = 1, checkpointZ = -300, timestamp = 0 }) {
        return this.addMoment(HIGHLIGHT_TYPES.CLUTCH_REVIVE, {
            playerId,
            playerName,
            healthAtRevive,
            revivedCount,
            checkpointZ,
            timestamp,
        });
    }

    /**
     * Helper to track boss kill.
     */
    recordBossKill({ durationSeconds, totalDamage, bossHp, teamNames = [], timestamp = 0 }) {
        const dps = durationSeconds > 0 ? (totalDamage || bossHp || 1000) / durationSeconds : 0;
        return this.addMoment(HIGHLIGHT_TYPES.FASTEST_BOSS_KILL, {
            durationSeconds,
            totalDamage: totalDamage || bossHp || 1000,
            bossHp: bossHp || 1000,
            dps,
            playerName: teamNames.join(', ') || 'Raft Squad',
            timestamp,
        });
    }

    /**
     * Helper to record squeaky hammer strike and count bursts.
     */
    recordHammerHonk({ playerId, playerName, damage = 20, timestamp = 0, burstWindowSeconds = 4 }) {
        let honks = this.hammerHonkWindows.get(playerId);
        if (!honks) {
            honks = [];
            this.hammerHonkWindows.set(playerId, honks);
        }
        honks.push(timestamp);

        // Keep timestamps within window
        const cutoff = timestamp - (burstWindowSeconds * 1000);
        while (honks.length > 0 && honks[0] < cutoff) {
            honks.shift();
        }

        if (honks.length >= 3) {
            const winSeconds = Math.max(0.5, (honks[honks.length - 1] - honks[0]) / 1000);
            return this.addMoment(HIGHLIGHT_TYPES.HAMMER_HONKS, {
                playerId,
                playerName,
                honkCount: honks.length,
                windowSeconds: winSeconds,
                damageDealt: damage * honks.length,
                timestamp,
            });
        }
        return null;
    }

    /**
     * Returns all logged moments.
     */
    getAllMoments() {
        return [...this.moments];
    }

    /**
     * Evaluates and extracts the top N funny / most hype highlights of the run.
     * Guarantees diverse categories when multiple distinct types exist.
     */
    getTopHighlights(limit = 3) {
        return selectTopHighlights(this.moments, limit);
    }
}

// ─── Top 3 Highlights Selection Engine ─────────────────────────────────────

/**
 * Selects the top N highlights from an array of moments.
 * Ensures diversity across distinct moment types if available,
 * breaking ties deterministically by score descending, then timestamp ascending.
 */
export function selectTopHighlights(momentsList = [], limit = 3) {
    if (!Array.isArray(momentsList) || momentsList.length === 0) {
        return getDefaultFallbackHighlights(limit);
    }

    // Sort all moments descending by score, tie-break by timestamp ascending
    const sorted = [...momentsList].sort((a, b) => {
        const diff = (b.score || 0) - (a.score || 0);
        if (diff !== 0) return diff;
        return (a.timestamp || 0) - (b.timestamp || 0);
    });

    const chosen = [];
    const usedTypes = new Set();

    // 1st Pass: Pick highest scoring moment of each distinct type to maximize diversity
    for (const m of sorted) {
        if (!usedTypes.has(m.type)) {
            chosen.push(m);
            usedTypes.add(m.type);
            if (chosen.length >= limit) break;
        }
    }

    // 2nd Pass: If we still need more moments to fill `limit`, take remaining top scores
    if (chosen.length < limit) {
        for (const m of sorted) {
            if (!chosen.includes(m)) {
                chosen.push(m);
                if (chosen.length >= limit) break;
            }
        }
    }

    // If still less than limit (e.g. peaceful or very short run), fill with themed fallbacks
    if (chosen.length < limit) {
        const fallbacks = getDefaultFallbackHighlights(limit);
        for (const fb of fallbacks) {
            if (!chosen.some((c) => c.type === fb.type)) {
                chosen.push(fb);
                if (chosen.length >= limit) break;
            }
        }
    }

    return chosen.slice(0, limit);
}

/**
 * Fallback highlight moments for short or empty runs.
 */
export function getDefaultFallbackHighlights(limit = 3) {
    const list = [
        createHighlightMoment(HIGHLIGHT_TYPES.PLANK_PARKOUR, {
            playerName: 'River Explorer',
            chainLength: 3,
            distance: 45,
            totalAirtime: 2.1,
            score: 450,
        }),
        createHighlightMoment(HIGHLIGHT_TYPES.HAMMER_HONKS, {
            playerName: 'Deckhand',
            honkCount: 8,
            windowSeconds: 3.2,
            damageDealt: 160,
            score: 720,
        }),
        createHighlightMoment(HIGHLIGHT_TYPES.CLUTCH_REVIVE, {
            playerName: 'Captain',
            healthAtRevive: 1,
            revivedCount: 1,
            checkpointZ: -300,
            score: 1350,
        }),
    ];
    return list.slice(0, limit);
}

// ─── Friend Challenge Link Generator & Parser ──────────────────────────────

/**
 * Generates 1-click Friend Challenge Link:
 * `?seed=...&ghost=...&squad=...&time=...`
 *
 * @param {object} params
 * @param {string|number} params.seed - River seed
 * @param {string} [params.ghost] - Replay ghost base64 / token string
 * @param {string} [params.squadName] - Crew or player name
 * @param {number} [params.timeMs] - Run completion time in ms
 * @param {string} [params.baseUrl] - Base URL (defaults to location.href or empty)
 */
export function generateChallengeUrl({
    seed = 1337,
    ghost = null,
    squadName = 'Raft Squad',
    timeMs = 0,
    baseUrl = '',
} = {}) {
    const params = new URLSearchParams();

    params.set('seed', String(seed));

    if (ghost) {
        // If ghost string is already prefixed or encoded, keep clean
        const cleanGhost = typeof ghost === 'string' ? ghost.trim() : JSON.stringify(ghost);
        params.set('ghost', cleanGhost);
    }

    if (squadName) {
        params.set('squad', String(squadName).slice(0, 32));
    }

    if (timeMs && timeMs > 0) {
        params.set('time', String(Math.round(timeMs)));
    }

    const query = params.toString();
    const base = baseUrl ? baseUrl.split('?')[0] : '';
    return base ? `${base}?${query}` : `?${query}`;
}

/**
 * Parses query params or URL string to extract challenge parameters.
 */
export function parseChallengeUrl(urlOrQueryString = '') {
    if (!urlOrQueryString) return null;

    let search = urlOrQueryString;
    if (search.includes('?')) {
        search = search.slice(search.indexOf('?') + 1);
    }

    const params = new URLSearchParams(search);
    const seedStr = params.get('seed');
    const ghost = params.get('ghost');
    const squad = params.get('squad');
    const timeStr = params.get('time');

    if (!seedStr && !ghost && !squad && !timeStr) {
        return null;
    }

    return {
        seed: seedStr ? (Number(seedStr) || seedStr) : null,
        ghost: ghost || null,
        squadName: squad || 'Raft Squad',
        timeMs: timeStr ? Number(timeStr) : null,
    };
}
