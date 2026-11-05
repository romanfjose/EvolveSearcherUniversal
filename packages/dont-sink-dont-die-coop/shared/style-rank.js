/**
 * Don't Sink, Don't Die — Arcade Style Rank Meter & Viking Helmet Flame Aura (shark-09)
 *
 * Deterministic arcade combo meter, style announcer cues, coin multipliers,
 * and procedural 3D golden/cyan flame crown aura around the player's Viking helmet.
 *
 * Ranks:
 *   D: DRIFTING                 (threshold: 0,   multiplier: 1.0x)
 *   C: CRUISING                 (threshold: 100, multiplier: 1.1x)
 *   B: BRAWLING!                (threshold: 250, multiplier: 1.25x)
 *   A: ANCHOR SMASHER!!         (threshold: 450, multiplier: 1.5x, golden flame aura)
 *   S: SOVEREIGN FEVER DREAM!!! (threshold: 700, multiplier: 2.0x, cyan / divine flame crown)
 *
 * Aggressive Actions tracked:
 *   - kickflips: +75 style pts
 *   - waterfall jumps: +90 style pts
 *   - mallet smashes: +60 style pts
 *   - parries: +100 style pts
 *   - speed > 14 m/s: continuous accumulation (+20 pts/sec)
 *
 * Zero external dependencies. Fully mockable for headless node:test suites.
 */

export const STYLE_RANKS = {
    D: {
        key: 'D',
        title: 'DRIFTING',
        fullTitle: 'D — DRIFTING',
        minPoints: 0,
        coinMultiplier: 1.0,
        flameAura: false,
        flameColorHex: 0x000000,
        flameColorName: 'none',
        announcerCue: 'DRIFTING...',
    },
    C: {
        key: 'C',
        title: 'CRUISING',
        fullTitle: 'C — CRUISING',
        minPoints: 100,
        coinMultiplier: 1.1,
        flameAura: false,
        flameColorHex: 0x000000,
        flameColorName: 'none',
        announcerCue: 'CRUISING!',
    },
    B: {
        key: 'B',
        title: 'BRAWLING!',
        fullTitle: 'B — BRAWLING!',
        minPoints: 250,
        coinMultiplier: 1.25,
        flameAura: false,
        flameColorHex: 0x000000,
        flameColorName: 'none',
        announcerCue: 'BRAWLING!!',
    },
    A: {
        key: 'A',
        title: 'ANCHOR SMASHER!!',
        fullTitle: 'A — ANCHOR SMASHER!!',
        minPoints: 450,
        coinMultiplier: 1.5,
        flameAura: true,
        flameColorHex: 0xffb703, // Golden flame
        flameColorName: 'gold',
        announcerCue: 'ANCHOR SMASHER!!!',
    },
    S: {
        key: 'S',
        title: 'SOVEREIGN FEVER DREAM!!!',
        fullTitle: 'S — SOVEREIGN FEVER DREAM!!!',
        minPoints: 700,
        coinMultiplier: 2.0,
        flameAura: true,
        flameColorHex: 0x00f5d4, // Cyan divine flame
        flameColorName: 'cyan',
        announcerCue: 'SOVEREIGN FEVER DREAM!!!!',
    },
};

export const RANK_ORDER = ['D', 'C', 'B', 'A', 'S'];

export const STYLE_ACTIONS = {
    KICKFLIP: { id: 'kickflip', points: 75, name: 'Pocket-Raft Kickflip' },
    WATERFALL_JUMP: { id: 'waterfall_jump', points: 90, name: 'Waterfall Stunt Ramp Jump' },
    MALLET_SMASH: { id: 'mallet_smash', points: 60, name: 'War Mallet Heavy Smash' },
    PARRY: { id: 'parry', points: 100, name: 'Perfect Parry Deflection' },
    HIGH_SPEED: { id: 'high_speed', threshold: 14.0, pointsPerSecond: 25, name: 'High Speed Velocity (>14 m/s)' },
};

export const STYLE_CONFIG = {
    MAX_POINTS: 1000,
    BASE_DECAY_RATE: 18, // points lost per second when no aggressive actions occur
    DECAY_GRACE_PERIOD: 1.8, // seconds after an aggressive action before decay kicks in
    HIGH_SPEED_THRESHOLD: 14.0, // m/s required to trigger aggressive speed style points
};

/**
 * Creates a fresh Style Rank state tracker.
 */
export function createStyleRankState() {
    return {
        points: 0,
        rank: 'D',
        highestRankAchieved: 'D',
        comboCount: 0,
        lastActionTime: 0,
        decayTimer: 0, // seconds elapsed since last aggressive action
        totalStylePointsEarned: 0,
        actionStats: {
            kickflips: 0,
            waterfallJumps: 0,
            malletSmashes: 0,
            parries: 0,
            highSpeedSeconds: 0,
        },
        announcer: {
            queuedMessage: null,
            lastAnnouncedRank: 'D',
            announcementTime: 0,
        },
    };
}

/**
 * Determines current rank object based on point total.
 *
 * @param {number} points
 * @returns {object} Rank definition from STYLE_RANKS
 */
export function getRankForPoints(points) {
    const clamped = Math.max(0, Math.min(STYLE_CONFIG.MAX_POINTS, points));
    if (clamped >= STYLE_RANKS.S.minPoints) return STYLE_RANKS.S;
    if (clamped >= STYLE_RANKS.A.minPoints) return STYLE_RANKS.A;
    if (clamped >= STYLE_RANKS.B.minPoints) return STYLE_RANKS.B;
    if (clamped >= STYLE_RANKS.C.minPoints) return STYLE_RANKS.C;
    return STYLE_RANKS.D;
}

/**
 * Computes progress within the current rank towards the next rank [0..1].
 * Returns 1.0 when at Rank S.
 *
 * @param {number} points
 * @returns {{ rank: string, progress: number, pointsToNext: number }}
 */
export function getRankProgress(points) {
    const currentRank = getRankForPoints(points);
    const currentIdx = RANK_ORDER.indexOf(currentRank.key);

    if (currentIdx === RANK_ORDER.length - 1) {
        return {
            rank: currentRank.key,
            progress: 1.0,
            pointsToNext: 0,
        };
    }

    const nextRank = STYLE_RANKS[RANK_ORDER[currentIdx + 1]];
    const span = nextRank.minPoints - currentRank.minPoints;
    const progress = Math.max(0, Math.min(1.0, (points - currentRank.minPoints) / span));
    const pointsToNext = Math.max(0, nextRank.minPoints - points);

    return {
        rank: currentRank.key,
        progress,
        pointsToNext,
    };
}

/**
 * Records an aggressive play action to climb style ranks.
 *
 * @param {object} state - Style rank state from createStyleRankState()
 * @param {string} actionType - 'kickflip' | 'waterfall_jump' | 'mallet_smash' | 'parry'
 * @param {object} [options] - Optional params { pointsOverride, now = 0 }
 * @returns {object} Result of the action { pointsAwarded, newPoints, prevRank, newRank, rankUp }
 */
export function recordStyleAction(state, actionType, options = {}) {
    if (!state) return null;

    let pointsAwarded = 0;
    const norm = String(actionType).toLowerCase();

    if (norm === 'kickflip' || norm === 'kickflips') {
        pointsAwarded = options.pointsOverride ?? STYLE_ACTIONS.KICKFLIP.points;
        state.actionStats.kickflips += 1;
    } else if (norm === 'waterfall_jump' || norm === 'waterfall_jumps' || norm === 'waterfall') {
        pointsAwarded = options.pointsOverride ?? STYLE_ACTIONS.WATERFALL_JUMP.points;
        state.actionStats.waterfallJumps += 1;
    } else if (norm === 'mallet_smash' || norm === 'mallet_smashes' || norm === 'mallet') {
        pointsAwarded = options.pointsOverride ?? STYLE_ACTIONS.MALLET_SMASH.points;
        state.actionStats.malletSmashes += 1;
    } else if (norm === 'parry' || norm === 'parries') {
        pointsAwarded = options.pointsOverride ?? STYLE_ACTIONS.PARRY.points;
        state.actionStats.parries += 1;
    } else if (options.pointsOverride) {
        pointsAwarded = options.pointsOverride;
    }

    const prevRankKey = state.rank;
    state.points = Math.min(STYLE_CONFIG.MAX_POINTS, state.points + pointsAwarded);
    state.totalStylePointsEarned += pointsAwarded;
    state.comboCount += 1;
    state.decayTimer = 0; // reset decay grace period
    state.lastActionTime = options.now ?? 0;

    const newRank = getRankForPoints(state.points);
    state.rank = newRank.key;

    // Track highest rank
    const prevIdx = RANK_ORDER.indexOf(state.highestRankAchieved);
    const newIdx = RANK_ORDER.indexOf(newRank.key);
    if (newIdx > prevIdx) {
        state.highestRankAchieved = newRank.key;
    }

    const rankUp = RANK_ORDER.indexOf(newRank.key) > RANK_ORDER.indexOf(prevRankKey);
    if (rankUp) {
        state.announcer.queuedMessage = newRank.announcerCue;
        state.announcer.lastAnnouncedRank = newRank.key;
        state.announcer.announcementTime = options.now ?? 0;
    }

    return {
        action: actionType,
        pointsAwarded,
        newPoints: state.points,
        prevRank: prevRankKey,
        newRank: state.rank,
        rankUp,
        multiplier: newRank.coinMultiplier,
        flameAura: newRank.flameAura,
    };
}

/**
 * Step function to update style rank over delta time dt.
 * Handles high speed (> 14 m/s) aggressive reward, combo decay, and rank recalculation.
 *
 * @param {object} state - Style rank state
 * @param {number} dt - Frame delta time in seconds
 * @param {number} currentSpeed - Raft forward/horizontal velocity in m/s
 * @param {number} [now=0] - Current game time in seconds
 * @returns {object} Step summary { points, rank, isDecaying, highSpeedActive, multiplier }
 */
export function stepStyleRank(state, dt, currentSpeed = 0, now = 0) {
    if (!state || dt <= 0) return null;

    let highSpeedActive = false;
    const speed = Math.abs(currentSpeed);

    // 1. High-speed aggressive play reward (> 14 m/s)
    if (speed >= STYLE_CONFIG.HIGH_SPEED_THRESHOLD) {
        highSpeedActive = true;
        const speedPoints = STYLE_ACTIONS.HIGH_SPEED.pointsPerSecond * dt;
        state.points = Math.min(STYLE_CONFIG.MAX_POINTS, state.points + speedPoints);
        state.totalStylePointsEarned += speedPoints;
        state.actionStats.highSpeedSeconds += dt;
        state.decayTimer = 0; // High speed sustains the combo
    } else {
        // 2. Advance decay timer
        state.decayTimer += dt;
    }

    // 3. Style point decay after grace period
    let isDecaying = false;
    if (state.decayTimer > STYLE_CONFIG.DECAY_GRACE_PERIOD) {
        isDecaying = true;
        // Point decay scales gently with rank
        const currentRankDef = STYLE_RANKS[state.rank];
        const decayMultiplier = currentRankDef.key === 'S' ? 1.5 : (currentRankDef.key === 'A' ? 1.25 : 1.0);
        const decayAmount = STYLE_CONFIG.BASE_DECAY_RATE * decayMultiplier * dt;
        state.points = Math.max(0, state.points - decayAmount);
    }

    // 4. Update rank and announcer
    const prevRank = state.rank;
    const currentRank = getRankForPoints(state.points);
    state.rank = currentRank.key;

    if (RANK_ORDER.indexOf(state.rank) > RANK_ORDER.indexOf(prevRank)) {
        state.announcer.queuedMessage = currentRank.announcerCue;
        state.announcer.lastAnnouncedRank = currentRank.key;
        state.announcer.announcementTime = now;
        if (RANK_ORDER.indexOf(state.rank) > RANK_ORDER.indexOf(state.highestRankAchieved)) {
            state.highestRankAchieved = state.rank;
        }
    }

    return {
        points: state.points,
        rank: state.rank,
        multiplier: currentRank.coinMultiplier,
        flameAura: currentRank.flameAura,
        flameColorHex: currentRank.flameColorHex,
        flameColorName: currentRank.flameColorName,
        isDecaying,
        highSpeedActive,
    };
}

/**
 * Calculates boosted coin reward based on current Style Rank multiplier.
 * Rank A boosts drops by 1.5x, Rank S boosts drops by 2.0x.
 *
 * @param {object} state - Style rank state
 * @param {number} baseCoins - Normal coin value
 * @returns {{ baseCoins: number, boostedCoins: number, multiplier: number, bonusCoins: number }}
 */
export function getStyleCoinBoost(state, baseCoins = 0) {
    const rankDef = state ? STYLE_RANKS[state.rank] || STYLE_RANKS.D : STYLE_RANKS.D;
    const multiplier = rankDef.coinMultiplier;
    const boostedCoins = Math.round(baseCoins * multiplier);
    const bonusCoins = Math.max(0, boostedCoins - baseCoins);

    return {
        baseCoins,
        boostedCoins,
        multiplier,
        bonusCoins,
    };
}

/**
 * Checks and consumes any queued announcer message.
 *
 * @param {object} state - Style rank state
 * @returns {string|null} Announcer cue string or null
 */
export function checkRankAnnouncer(state) {
    if (!state || !state.announcer || !state.announcer.queuedMessage) {
        return null;
    }
    const msg = state.announcer.queuedMessage;
    state.announcer.queuedMessage = null;
    return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCEDURAL 3D VIKING HELMET FLAME CROWN AURA (Three.js integration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Procedural 3D Golden/Cyan Viking Helmet Flame Crown Aura builder.
 * Ignites around the player's horned helmet when Rank A or Rank S is active.
 *
 * Visual characteristics:
 *   - Rank A: Blazing Golden Flame (0xffb703 / 0xfb8500)
 *   - Rank S: Divine Cyan Flame (0x00f5d4 / 0x48cae4)
 *   - Ring of 8 procedural flame tongues / spikes around helmet brow
 *   - Pulsing core aura halo & flickering dynamic tip offsets
 *
 * @param {object} THREE - Three.js namespace
 * @param {object} [options]
 * @returns {object} Flame crown controller { rootGroup, update, setRank, dispose }
 */
export function createHelmetFlameCrown(THREE, options = {}) {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'VikingHelmetFlameCrown';
    rootGroup.visible = false;

    const FLAME_TONGUE_COUNT = 8;
    const flameTongues = [];

    // Core Aura Ring Geometry & Material
    const ringGeo = new (THREE.TorusGeometry || THREE.BufferGeometry)(0.44, 0.05, 8, 16);
    const ringMat = new (THREE.MeshBasicMaterial || THREE.ShaderMaterial)({
        color: 0xffb703,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.02;
    rootGroup.add(ringMesh);

    // 8 Procedural Flame Spikes / Tongues
    const coneGeo = new (THREE.ConeGeometry || THREE.BufferGeometry)(0.08, 0.38, 6);
    const flameMat = new (THREE.MeshBasicMaterial || THREE.ShaderMaterial)({
        color: 0xffb703,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
    });

    for (let i = 0; i < FLAME_TONGUE_COUNT; i++) {
        const angle = (i * Math.PI * 2) / FLAME_TONGUE_COUNT;
        const tongueMesh = new THREE.Mesh(coneGeo, flameMat.clone ? flameMat.clone() : flameMat);

        const radius = 0.44;
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;

        tongueMesh.position.set(x, 0.16, z);
        tongueMesh.rotation.y = angle;
        // Lean flame tongues slightly outward
        tongueMesh.rotation.x = Math.cos(angle) * 0.18;
        tongueMesh.rotation.z = -Math.sin(angle) * 0.18;

        rootGroup.add(tongueMesh);
        flameTongues.push({
            mesh: tongueMesh,
            baseX: x,
            baseZ: z,
            angle,
            phaseOffset: i * 0.785,
            baseScaleY: 1.0,
        });
    }

    let currentRankKey = 'D';

    /**
     * Updates flame material colors and visibility based on rank.
     *
     * @param {string} rankKey - 'D' | 'C' | 'B' | 'A' | 'S'
     */
    function setRank(rankKey) {
        currentRankKey = rankKey;
        const rankDef = STYLE_RANKS[rankKey] || STYLE_RANKS.D;

        if (!rankDef.flameAura) {
            rootGroup.visible = false;
            return;
        }

        rootGroup.visible = true;
        const hex = rankDef.flameColorHex;

        if (ringMat.color && ringMat.color.setHex) {
            ringMat.color.setHex(hex);
        }
        for (const t of flameTongues) {
            if (t.mesh.material && t.mesh.material.color && t.mesh.material.color.setHex) {
                t.mesh.material.color.setHex(hex);
            }
        }
    }

    /**
     * Continuous animation loop for procedural flame flicker and wave pulse.
     *
     * @param {number} dt - Delta time
     * @param {number} time - Global elapsed time
     * @param {object} [rankState] - Optional style rank state
     */
    function update(dt, time = 0, rankState = null) {
        if (rankState) {
            setRank(rankState.rank);
        }

        if (!rootGroup.visible) return;

        // Pulse the base ring slightly
        const pulse = 1.0 + Math.sin(time * 6.0) * 0.08;
        ringMesh.scale.set(pulse, pulse, pulse);

        // Animate flame tongues (flicker height and rotational sway)
        const isRankS = currentRankKey === 'S';
        const flickerSpeed = isRankS ? 14.0 : 9.0;
        const scaleAmp = isRankS ? 0.35 : 0.22;

        for (let i = 0; i < flameTongues.length; i++) {
            const t = flameTongues[i];
            const wave = Math.sin(time * flickerSpeed + t.phaseOffset);
            const flickerScale = 1.0 + wave * scaleAmp;

            t.mesh.scale.set(1.0, flickerScale, 1.0);
            t.mesh.position.y = 0.16 + wave * 0.04;

            // Subtle flutter in wind / turbulence
            t.mesh.rotation.x = Math.cos(t.angle) * 0.18 + Math.cos(time * 8.0 + t.phaseOffset) * 0.08;
            t.mesh.rotation.z = -Math.sin(t.angle) * 0.18 + Math.sin(time * 8.0 + t.phaseOffset) * 0.08;
        }
    }

    /**
     * Cleanly disposes geometries and materials.
     */
    function dispose() {
        if (ringGeo && ringGeo.dispose) ringGeo.dispose();
        if (ringMat && ringMat.dispose) ringMat.dispose();
        if (coneGeo && coneGeo.dispose) coneGeo.dispose();
        for (const t of flameTongues) {
            if (t.mesh.material && t.mesh.material.dispose) {
                t.mesh.material.dispose();
            }
        }
    }

    return {
        rootGroup,
        flameTongues,
        ringMesh,
        setRank,
        update,
        dispose,
        getCurrentRank: () => currentRankKey,
    };
}
