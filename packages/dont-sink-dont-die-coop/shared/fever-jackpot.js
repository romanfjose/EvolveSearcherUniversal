/**
 * Don't Sink, Don't Die — Zero-Pause Overhead Fever Jackpot Slot Spinner
 * (`shared/fever-jackpot.js`)
 *
 * Pure, deterministic module for triggering and animating a fast 1.5-second
 * 3-reel holographic slot machine above the player's raft when hitting a
 * Golden Fever Chest on a waterfall stunt ramp.
 *
 * Core principles:
 * - ZERO MENU PAUSE: The raft keeps flying downriver and physics continue ticking.
 * - Deterministic seeded odds using standard LCG PRNG.
 * - Guaranteed pity jackpot system: after N consecutive non-jackpot spins,
 *   a 3-matching jackpot is guaranteed.
 * - 5 thematic symbols:
 *     1. 🪙 Triple Gold ('triple-gold')
 *     2. ⚡ Hyper Nitro ('hyper-nitro')
 *     3. 🔨 Mega Mallet ('mega-mallet')
 *     4. 🦆 Rubber Ducky Armada ('rubber-ducky-armada')
 *     5. 🦀 Crab Rave Shield ('crab-rave-shield')
 * - Pure ES module with zero external dependencies.
 */

// Total spin duration in seconds
export const FEVER_SPIN_DURATION_SEC = 1.5;

// Staggered reel lock times in seconds
export const REEL_STOP_DELAYS_SEC = [0.7, 1.1, 1.5];

// Default consecutive non-jackpot count before guaranteed jackpot pity trigger
export const DEFAULT_PITY_THRESHOLD = 4;

// Symbol identifiers
export const FEVER_SYMBOLS = {
    TRIPLE_GOLD: 'triple-gold',
    HYPER_NITRO: 'hyper-nitro',
    MEGA_MALLET: 'mega-mallet',
    RUBBER_DUCKY: 'rubber-ducky-armada',
    CRAB_SHIELD: 'crab-rave-shield',
};

export const SYMBOL_KEYS = Object.values(FEVER_SYMBOLS);

// Symbol definitions, weights (relative odds), visual metadata, and payout descriptors
export const SYMBOL_DEFINITIONS = {
    [FEVER_SYMBOLS.TRIPLE_GOLD]: {
        id: FEVER_SYMBOLS.TRIPLE_GOLD,
        name: 'Triple Gold',
        icon: '🪙',
        colorHex: 0xfacc15,
        accentColor: '#fde047',
        weight: 35, // 35% base weight in single reel roll
        jackpotPayout: {
            type: 'coins',
            amount: 75,
            message: 'JACKPOT! +75 Gold Coins showered on deck!',
        },
        partialPayout: {
            type: 'coins',
            amount: 20,
            message: '2x Gold Match! +20 Gold Coins.',
        },
        consolationPayout: {
            type: 'coins',
            amount: 5,
            message: 'Scattered Coin +5 Gold.',
        },
    },
    [FEVER_SYMBOLS.HYPER_NITRO]: {
        id: FEVER_SYMBOLS.HYPER_NITRO,
        name: 'Hyper Nitro',
        icon: '⚡',
        colorHex: 0x38bdf8,
        accentColor: '#0284c7',
        weight: 25,
        jackpotPayout: {
            type: 'nitro_boost',
            speedMultiplier: 2.2,
            durationSec: 4.0,
            message: 'SUPERCHARGED! 4s Hyper Nitro Rocket Surge!',
        },
        partialPayout: {
            type: 'nitro_boost',
            speedMultiplier: 1.5,
            durationSec: 2.0,
            message: 'Quick Turbo Pulse! 2s speed boost.',
        },
        consolationPayout: {
            type: 'nitro_boost',
            speedMultiplier: 1.2,
            durationSec: 1.0,
            message: 'Small wake spurt.',
        },
    },
    [FEVER_SYMBOLS.MEGA_MALLET]: {
        id: FEVER_SYMBOLS.MEGA_MALLET,
        name: 'Mega Mallet',
        icon: '🔨',
        colorHex: 0xf97316,
        accentColor: '#ea580c',
        weight: 20,
        jackpotPayout: {
            type: 'mega_mallet',
            damageBonus: 60,
            aoeRadius: 8.0,
            durationSec: 6.0,
            message: 'TITAN SMASH! +60 Mega Mallet AOE for 6 seconds!',
        },
        partialPayout: {
            type: 'mega_mallet',
            damageBonus: 25,
            aoeRadius: 4.0,
            durationSec: 3.0,
            message: 'Squeaky Slam! +25 Mallet damage for 3 seconds.',
        },
        consolationPayout: {
            type: 'mega_mallet',
            damageBonus: 10,
            aoeRadius: 2.0,
            durationSec: 1.5,
            message: 'Mini tap mallet.',
        },
    },
    [FEVER_SYMBOLS.RUBBER_DUCKY]: {
        id: FEVER_SYMBOLS.RUBBER_DUCKY,
        name: 'Rubber Ducky Armada',
        icon: '🦆',
        colorHex: 0xfef08a,
        accentColor: '#eab308',
        weight: 12,
        jackpotPayout: {
            type: 'ducky_armada',
            duckCount: 12,
            springboardBounceY: 22.0,
            message: 'QUACKSTORM! 12 giant inflatable ducks deployed as springboards!',
        },
        partialPayout: {
            type: 'ducky_armada',
            duckCount: 4,
            springboardBounceY: 16.0,
            message: 'Ducky Escort! 4 bouncy decoy duckies spawned.',
        },
        consolationPayout: {
            type: 'ducky_armada',
            duckCount: 1,
            springboardBounceY: 12.0,
            message: 'Single rubber duck splash.',
        },
    },
    [FEVER_SYMBOLS.CRAB_SHIELD]: {
        id: FEVER_SYMBOLS.CRAB_SHIELD,
        name: 'Crab Rave Shield',
        icon: '🦀',
        colorHex: 0xf43f5e,
        accentColor: '#e11d48',
        weight: 8,
        jackpotPayout: {
            type: 'crab_shield',
            invincibleSec: 5.0,
            reflectDamage: 40,
            discoCoinsDoubleSec: 8.0,
            message: 'CRAB RAVE! 5s Invincibility & Reflect + 2x Disco Coins for 8s!',
        },
        partialPayout: {
            type: 'crab_shield',
            invincibleSec: 2.5,
            reflectDamage: 15,
            discoCoinsDoubleSec: 4.0,
            message: 'Mini Crab Guard! 2.5s shield.',
        },
        consolationPayout: {
            type: 'crab_shield',
            invincibleSec: 1.0,
            reflectDamage: 5,
            discoCoinsDoubleSec: 0,
            message: 'Tiny crab shell armor.',
        },
    },
};

/**
 * Deterministic Linear Congruential Generator (LCG) PRNG
 * Matches standard shared seeds in Don't Sink, Don't Die.
 */
export function createFeverRng(seed = 1) {
    let s = (Math.floor(Number(seed)) || 1) >>> 0;
    if (s === 0) s = 1;
    return () => {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * Weighted random symbol picker for a single reel.
 */
export function rollSingleSymbol(rng) {
    const totalWeight = SYMBOL_KEYS.reduce((sum, key) => sum + SYMBOL_DEFINITIONS[key].weight, 0);
    let r = rng() * totalWeight;
    for (const key of SYMBOL_KEYS) {
        const w = SYMBOL_DEFINITIONS[key].weight;
        if (r < w) {
            return key;
        }
        r -= w;
    }
    return SYMBOL_KEYS[0];
}

/**
 * Checks if 3 reels constitute a Jackpot (all 3 matching),
 * a Partial Match (2 matching), or a Bust (all 3 distinct).
 */
export function evaluateReelMatch(reels) {
    if (!reels || reels.length !== 3) {
        return { isJackpot: false, isPartial: false, matchingSymbol: null, matchCount: 0 };
    }
    const [r0, r1, r2] = reels;
    if (r0 === r1 && r1 === r2) {
        return {
            isJackpot: true,
            isPartial: false,
            matchingSymbol: r0,
            matchCount: 3,
        };
    }
    if (r0 === r1 || r0 === r2) {
        return {
            isJackpot: false,
            isPartial: true,
            matchingSymbol: r0,
            matchCount: 2,
        };
    }
    if (r1 === r2) {
        return {
            isJackpot: false,
            isPartial: true,
            matchingSymbol: r1,
            matchCount: 2,
        };
    }
    return {
        isJackpot: false,
        isPartial: false,
        matchingSymbol: null,
        matchCount: 1,
    };
}

/**
 * Rolls 3 reels deterministically, respecting the guaranteed pity jackpot counter.
 * If pityCounter >= pityThreshold, guarantees 3 matching symbols of a weighted random pick.
 */
export function rollSlotReels(rng, pityCounter = 0, pityThreshold = DEFAULT_PITY_THRESHOLD) {
    const isPityTriggered = pityCounter >= pityThreshold;

    if (isPityTriggered) {
        const pitySymbol = rollSingleSymbol(rng);
        return {
            reels: [pitySymbol, pitySymbol, pitySymbol],
            isJackpot: true,
            isPity: true,
            pityCounter: 0,
        };
    }

    const reels = [rollSingleSymbol(rng), rollSingleSymbol(rng), rollSingleSymbol(rng)];
    const match = evaluateReelMatch(reels);

    return {
        reels,
        isJackpot: match.isJackpot,
        isPity: false,
        pityCounter: match.isJackpot ? 0 : pityCounter + 1,
    };
}

/**
 * Calculates payout and reward payloads from final reels.
 */
export function calculatePayout(reels) {
    const match = evaluateReelMatch(reels);

    if (match.isJackpot) {
        const def = SYMBOL_DEFINITIONS[match.matchingSymbol];
        return {
            tier: 'jackpot',
            symbol: match.matchingSymbol,
            payout: def.jackpotPayout,
            summary: def.jackpotPayout.message,
            visualRank: 'FEVER_JACKPOT_SSS',
        };
    }

    if (match.isPartial) {
        const def = SYMBOL_DEFINITIONS[match.matchingSymbol];
        return {
            tier: 'partial',
            symbol: match.matchingSymbol,
            payout: def.partialPayout,
            summary: def.partialPayout.message,
            visualRank: 'FEVER_PARTIAL_S',
        };
    }

    // Bust / Consolation from the primary reel
    const primarySymbol = reels[0] || FEVER_SYMBOLS.TRIPLE_GOLD;
    const def = SYMBOL_DEFINITIONS[primarySymbol];
    return {
        tier: 'consolation',
        symbol: primarySymbol,
        payout: def.consolationPayout,
        summary: def.consolationPayout.message,
        visualRank: 'FEVER_CONSOLATION',
    };
}

/**
 * Evaluates whether a player's craft collides with or activates a Golden Fever Chest
 * placed on a waterfall stunt ramp.
 *
 * @param {object} craft - Raft craft state { position: {x,y,z}, velocity: {x,y,z} }
 * @param {object} chest - Golden Fever Chest object { id, x, y, z, radius, collected }
 * @returns {boolean} Whether the chest was hit.
 */
export function evaluateFeverChestHit(craft, chest) {
    if (!craft || !craft.position || !chest || chest.collected) return false;

    const radius = chest.radius || 3.0;
    const dx = craft.position.x - chest.x;
    const dy = (craft.position.y || 0) - (chest.y || 0);
    const dz = craft.position.z - chest.z;

    // Fast spherical / cylindrical collision detection
    const distSq = dx * dx + dy * dy + dz * dz;
    return distSq <= radius * radius;
}

/**
 * Creates an active Fever Jackpot Slot Spinner session.
 */
export function createFeverJackpotSession({
    seed = 1,
    pityCounter = 0,
    pityThreshold = DEFAULT_PITY_THRESHOLD,
    durationSec = FEVER_SPIN_DURATION_SEC,
    stopDelays = REEL_STOP_DELAYS_SEC,
    chestId = null,
} = {}) {
    const rng = createFeverRng(seed);
    const rollOutcome = rollSlotReels(rng, pityCounter, pityThreshold);

    return {
        active: true,
        elapsedSec: 0,
        durationSec,
        stopDelays: [...stopDelays],
        targetReels: rollOutcome.reels,
        isJackpot: rollOutcome.isJackpot,
        isPity: rollOutcome.isPity,
        nextPityCounter: rollOutcome.pityCounter,
        chestId,
        // Current display symbols (either rolling or locked)
        locked: [false, false, false],
        currentSymbols: [rollOutcome.reels[0], rollOutcome.reels[1], rollOutcome.reels[2]],
        spinFrequencies: [18.0, 22.0, 26.0], // Symbol blur cycles per second while spinning
        completed: false,
        outcome: null,
        // Holographic HUD/3D position offset relative to raft
        overheadOffset: { x: 0, y: 3.2, z: 0 },
    };
}

/**
 * Steps the slot spin session by delta time (dt in seconds).
 * Zero-pause: advances strictly based on delta time while caller continues raft simulation.
 *
 * @param {object} session - Fever jackpot session
 * @param {number} dt - Elapsed seconds since last tick
 * @param {Function} [onComplete] - Optional callback upon spin conclusion
 * @returns {object} Status of the spin step
 */
export function stepFeverJackpotSession(session, dt, onComplete = null) {
    if (!session || !session.active || session.completed) {
        return {
            active: session?.active ?? false,
            completed: session?.completed ?? false,
            justLockedReel: null,
            outcome: session?.outcome ?? null,
        };
    }

    session.elapsedSec += Math.max(0, dt);
    let justLockedReel = null;

    // Check reel locks
    for (let i = 0; i < 3; i++) {
        if (!session.locked[i] && session.elapsedSec >= session.stopDelays[i]) {
            session.locked[i] = true;
            session.currentSymbols[i] = session.targetReels[i];
            justLockedReel = i;
        } else if (!session.locked[i]) {
            // Rapidly cycle symbols during spin based on elapsed time and reel frequency
            const cycleIndex = Math.floor(session.elapsedSec * session.spinFrequencies[i]) % SYMBOL_KEYS.length;
            session.currentSymbols[i] = SYMBOL_KEYS[cycleIndex];
        }
    }

    // Complete session once duration is exceeded
    if (session.elapsedSec >= session.durationSec && !session.completed) {
        session.completed = true;
        session.locked = [true, true, true];
        session.currentSymbols = [...session.targetReels];
        session.outcome = calculatePayout(session.targetReels);
        session.active = false;

        if (typeof onComplete === 'function') {
            onComplete(session.outcome, session);
        }
    }

    return {
        active: session.active,
        completed: session.completed,
        justLockedReel,
        elapsedSec: session.elapsedSec,
        progress: Math.min(1.0, session.elapsedSec / session.durationSec),
        locked: [...session.locked],
        currentSymbols: [...session.currentSymbols],
        outcome: session.outcome,
    };
}

/**
 * Computes holographic 3D billboard transform coordinates above the player's raft.
 * Supports floating sine bob and scale pulse when jackpots strike.
 */
export function getOverheadHologramTransform(session, raftPosition, elapsedTotalSec = 0) {
    if (!raftPosition) {
        return { x: 0, y: 3.2, z: 0, scale: 1.0, opacity: 1.0, glowIntensity: 1.0 };
    }

    const baseX = raftPosition.x + (session?.overheadOffset?.x || 0);
    const baseZ = raftPosition.z + (session?.overheadOffset?.z || 0);
    const baseY = (raftPosition.y || 0) + (session?.overheadOffset?.y || 3.2);

    // Subtle holographic hovering float
    const floatY = baseY + Math.sin(elapsedTotalSec * 4.5) * 0.15;

    // Entrance pop and jackpot pulse
    let scale = 1.0;
    let opacity = 1.0;
    let glowIntensity = 1.0;

    if (session) {
        const spinProgress = Math.min(1.0, session.elapsedSec / session.durationSec);
        if (spinProgress < 0.15 && session.elapsedSec > 0) {
            // Quick 0.2s pop-in
            scale = 0.5 + (spinProgress / 0.15) * 0.5;
            opacity = Math.max(0.1, spinProgress / 0.15);
        } else if (session.elapsedSec === 0) {
            scale = 0.5;
            opacity = 0.2;
        } else if (session.completed) {
            // Victory pulse on jackpot
            if (session.isJackpot) {
                const victoryBeat = (session.elapsedSec - session.durationSec) * 6.0;
                scale = 1.0 + Math.max(0, Math.sin(victoryBeat) * 0.25);
                glowIntensity = 2.5;
            }
        }
    }

    return {
        x: baseX,
        y: floatY,
        z: baseZ,
        scale,
        opacity,
        glowIntensity,
    };
}

/**
 * Applies the calculated jackpot outcome to a player raft state.
 *
 * @param {object} player - Player state { coins, temporaryWeapon, speedBoost, shield, etc. }
 * @param {object} outcome - Payout outcome from calculatePayout
 * @param {number} [now=0] - Current timestamp in ms
 * @returns {object} Applied reward receipt
 */
export function applyFeverPayout(player, outcome, now = 0) {
    if (!player || !outcome || !outcome.payout) {
        return { success: false, reason: 'Invalid player or outcome' };
    }

    const { payout, tier, symbol } = outcome;
    const receipt = {
        success: true,
        tier,
        symbol,
        type: payout.type,
        message: outcome.summary,
        applied: {},
    };

    switch (payout.type) {
        case 'coins': {
            const added = payout.amount || 0;
            player.coins = (player.coins || 0) + added;
            receipt.applied = { coinsAdded: added, totalCoins: player.coins };
            break;
        }
        case 'nitro_boost': {
            player.nitroBoost = {
                active: true,
                speedMultiplier: payout.speedMultiplier || 1.5,
                expiresAt: now + (payout.durationSec || 2.0) * 1000,
            };
            receipt.applied = { ...player.nitroBoost };
            break;
        }
        case 'mega_mallet': {
            player.megaMalletBuff = {
                active: true,
                damageBonus: payout.damageBonus || 30,
                aoeRadius: payout.aoeRadius || 4.0,
                expiresAt: now + (payout.durationSec || 3.0) * 1000,
            };
            receipt.applied = { ...player.megaMalletBuff };
            break;
        }
        case 'ducky_armada': {
            player.duckyArmada = {
                active: true,
                duckCount: payout.duckCount || 4,
                springboardBounceY: payout.springboardBounceY || 16.0,
                createdAt: now,
            };
            receipt.applied = { ...player.duckyArmada };
            break;
        }
        case 'crab_shield': {
            player.crabShield = {
                active: true,
                invincibleUntil: now + (payout.invincibleSec || 3.0) * 1000,
                reflectDamage: payout.reflectDamage || 20,
                doubleCoinsUntil: payout.discoCoinsDoubleSec ? now + payout.discoCoinsDoubleSec * 1000 : 0,
            };
            receipt.applied = { ...player.crabShield };
            break;
        }
        default:
            break;
    }

    return receipt;
}

/**
 * Creates a Golden Fever Chest item placed atop a waterfall stunt ramp.
 *
 * @param {object} ramp - Ramp hazard descriptor { id, x, y, z, height, length }
 * @param {number} [customRadius=3.2] - Hitbox radius
 * @returns {object} Golden Fever Chest definition
 */
export function createWaterfallFeverChest(ramp, customRadius = 3.2) {
    const rampX = ramp?.x ?? 0;
    const rampY = ramp?.height ?? 2.5;
    const halfL = ((ramp?.length ?? 8.0) * 0.5);
    // Position chest hovering near launch apex lip
    const chestZ = (ramp?.z ?? -300) - halfL;

    return {
        id: `fever_chest_${ramp?.id || 'waterfall_ramp'}`,
        rampId: ramp?.id || 'ramp_default',
        x: rampX,
        y: rampY + 1.2, // Hovers 1.2m above the apex lip
        z: chestZ,
        radius: customRadius,
        collected: false,
        type: 'golden-fever-chest',
        shimmerColor: 0xffdf00,
        spinSpeed: 2.0,
    };
}
