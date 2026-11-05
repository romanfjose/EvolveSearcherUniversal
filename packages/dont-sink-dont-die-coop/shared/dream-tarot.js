/**
 * Don't Sink, Don't Die — Checkpoint "Dream Tarot" Rogue-Lite Blessing Draft System
 *
 * Pure, deterministic module for dealing, drafting, and applying bizarre Dream Tarot
 * blessing cards whenever players cross every 2nd checkpoint gate.
 * Zero external dependencies.
 */

import { CHECKPOINTS, CHECKPOINT_SPACING } from './game-core.js';

// Auto-pick timeout window in milliseconds (6 seconds so gameplay never stalls)
export const AUTO_PICK_TIMEOUT_MS = 6000;

// Unique identifier constants for the 6 required Dream Tarot cards
export const TAROT_CARD_IDS = {
    CAFFEINATED_OARS: 'caffeinated-oars',
    DIPLOMATIC_IMMUNITY: 'diplomatic-immunity',
    HEAVY_POCKET_ANVIL: 'heavy-pocket-anvil',
    SQUEAKY_OVERDRIVE: 'squeaky-overdrive',
    PLANK_MAGNETISM: 'plank-magnetism',
    REVERSE_PSYCHOLOGY: 'reverse-psychology',
};

export const TAROT_CARD_KEYS = Object.values(TAROT_CARD_IDS);

// Full card definitions with stats, flavor lore, visuals, and mechanic numbers
export const TAROT_CARDS = {
    [TAROT_CARD_IDS.CAFFEINATED_OARS]: {
        id: TAROT_CARD_IDS.CAFFEINATED_OARS,
        name: 'Caffeinated Oars',
        tagline: 'High-octane roast wake',
        arcana: 'The Chariot',
        romanNumeral: 'VII',
        icon: '☕',
        description: '+25% paddle cadence & espresso wake foam trailing your raft.',
        colorHex: 0xd97706, // Amber espresso gold
        accentColor: '#f59e0b',
        cadenceMultiplier: 1.25,
        thrustMultiplier: 1.25,
        wakeVfxType: 'espresso_foam',
        lore: 'Dunked in scalding dark espresso brewed by river goblins. Your strokes blur into pure vibration.',
    },
    [TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY]: {
        id: TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY,
        name: 'Diplomatic Immunity',
        tagline: 'Official harbor enforcement',
        arcana: 'Justice',
        romanNumeral: 'XI',
        icon: '🚓',
        description: 'Summons 2 Harbor Police officers on jet-skis to shoot the nearest monster.',
        colorHex: 0x2563eb, // Cobalt blue police siren
        accentColor: '#3b82f6',
        summonsCount: 2,
        officerType: 'police_jetski',
        shotsPerBurst: 3,
        shotDamage: 12,
        lore: 'A waterlogged diplomatic passport stamped with high-clearance harbor authority.',
    },
    [TAROT_CARD_IDS.HEAVY_POCKET_ANVIL]: {
        id: TAROT_CARD_IDS.HEAVY_POCKET_ANVIL,
        name: 'Heavy Pocket Anvil',
        tagline: 'Weight of the deep',
        arcana: 'The Tower',
        romanNumeral: 'XVI',
        icon: '⚓',
        description: 'Whipping your raft out of your pocket onto an enemy deals 60 AoE slam damage.',
        colorHex: 0x9333ea, // Deep arcane purple
        accentColor: '#a855f7',
        slamDamage: 60,
        slamRadius: 6.5,
        knockbackImpulse: 280,
        lore: 'Your pocket raft suddenly weighs four tons of solid iron when airborne above river monsters.',
    },
    [TAROT_CARD_IDS.SQUEAKY_OVERDRIVE]: {
        id: TAROT_CARD_IDS.SQUEAKY_OVERDRIVE,
        name: 'Squeaky Overdrive',
        tagline: 'Acoustic devastation',
        arcana: 'The Magician',
        romanNumeral: 'I',
        icon: '🔨',
        description: 'Every 3rd Squeaky Hammer hit unleashes a 140 dB ultrasonichonk shockwave.',
        colorHex: 0xec4899, // Hot magenta honk
        accentColor: '#f43f5e',
        hitInterval: 3,
        shockwaveRadius: 8.0,
        shockwaveDamage: 45,
        soundDecibels: 140,
        lore: 'The squeaker diaphragm reaches sonic resonance, tearing reality with a high-pitched honk.',
    },
    [TAROT_CARD_IDS.PLANK_MAGNETISM]: {
        id: TAROT_CARD_IDS.PLANK_MAGNETISM,
        name: 'Plank Magnetism',
        tagline: 'Orbital river salvage',
        arcana: 'The Wheel of Fortune',
        romanNumeral: 'X',
        icon: '🧲',
        description: 'Coins and crates within 14m gravitate toward your raft.',
        colorHex: 0x10b981, // Emerald attractor
        accentColor: '#34d399',
        magnetRadius: 14.0,
        attractionForce: 35.0,
        lore: 'Your raft hull becomes polarized to polished gold and seasoned oak planks.',
    },
    [TAROT_CARD_IDS.REVERSE_PSYCHOLOGY]: {
        id: TAROT_CARD_IDS.REVERSE_PSYCHOLOGY,
        name: 'Reverse Psychology',
        tagline: 'Arcane coin refund',
        arcana: 'The Fool',
        romanNumeral: '0',
        icon: '🃏',
        description: 'Wizard throw boosts your coins by +8 instead of hurting when blocked.',
        colorHex: 0x8b5cf6, // Violet trickster
        accentColor: '#a78bfa',
        coinRewardOnBlock: 8,
        blockDamageMultiplier: 0.0,
        reflectKnockback: true,
        lore: 'You convince the Wizard that tossing you through the air is actually an expensive honor.',
    },
};

/**
 * Checks if a checkpoint index or z-coordinate qualifies for a Dream Tarot Draft.
 * Triggered at every 2nd checkpoint crossed (checkpoints #2, #4, #6, #8, etc.).
 *
 * @param {number} checkpoint - Checkpoint 1-based index (e.g. 2, 4) or 0-based index or z-coordinate (e.g. -300, -600).
 * @returns {boolean} True if this checkpoint triggers a 3-card Dream Tarot draft.
 */
export function isTarotCheckpoint(checkpoint) {
    if (typeof checkpoint !== 'number' || !Number.isFinite(checkpoint)) return false;

    // Check by negative river z-coordinate
    if (checkpoint <= -CHECKPOINT_SPACING) {
        const index = Math.round(Math.abs(checkpoint) / CHECKPOINT_SPACING);
        return index > 0 && index % 2 === 0;
    }

    // Check by positive 1-based checkpoint gate number (2, 4, 6, 8, ...)
    if (checkpoint >= 1) {
        const rounded = Math.round(checkpoint);
        return rounded % 2 === 0;
    }

    return false;
}

/**
 * Deterministic PRNG helper based on Mulberry32 algorithm.
 */
export function createTarotRng(seed = 1) {
    let a = (seed >>> 0) || 1;
    return function mulberry32() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Deals 3 unique, seeded Dream Tarot blessing cards from the card pool.
 *
 * @param {object} options
 * @param {number|Function} [options.seedOrRng=42] - Seed integer or RNG function.
 * @param {Array<string>} [options.excludeIds=[]] - Optional list of card IDs to exclude if already owned.
 * @param {number} [options.count=3] - Number of cards to deal (defaults to 3).
 * @returns {Array<object>} Array of 3 card definitions.
 */
export function dealTarotCards({ seedOrRng = 42, excludeIds = [], count = 3 } = {}) {
    const rng = typeof seedOrRng === 'function' ? seedOrRng : createTarotRng(seedOrRng);
    const available = TAROT_CARD_KEYS.filter((id) => !excludeIds.includes(id));

    // Fall back to full pool if not enough unpicked cards remain
    const pool = available.length >= count ? [...available] : [...TAROT_CARD_KEYS];

    // Fisher-Yates deterministic partial shuffle
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const temp = pool[i];
        pool[i] = pool[j];
        pool[j] = temp;
    }

    const selectedIds = pool.slice(0, count);
    return selectedIds.map((id) => ({ ...TAROT_CARDS[id] }));
}

/**
 * Creates a new active Tarot Draft session state.
 *
 * @param {object} options
 * @param {number} options.checkpointIndex - Checkpoint number (2, 4, 6, etc.).
 * @param {number} [options.seed=1337] - Seed for random dealing.
 * @param {number} [options.startTimeMs=0] - Current game time when draft begins.
 * @param {Array<string>} [options.currentBlessings=[]] - Player's current active card IDs.
 * @returns {object} Tarot draft session object.
 */
export function createTarotDraftSession({
    checkpointIndex = 2,
    seed = 1337,
    startTimeMs = 0,
    currentBlessings = [],
    autoPickDurationMs = AUTO_PICK_TIMEOUT_MS,
} = {}) {
    // Unique seed mixing run seed and checkpoint index for stable determinism
    const combinedSeed = (seed * 10007 + checkpointIndex * 1337) >>> 0;
    const cards = dealTarotCards({ seedOrRng: combinedSeed, excludeIds: currentBlessings, count: 3 });

    return {
        active: true,
        checkpointIndex,
        seed: combinedSeed,
        cards,
        startTimeMs,
        durationMs: autoPickDurationMs,
        expiresAtMs: startTimeMs + autoPickDurationMs,
        remainingMs: autoPickDurationMs,
        selectedCardId: null,
        selectedCard: null,
        selectedIndex: -1,
        autoPicked: false,
        completed: false,
    };
}

/**
 * Evaluates whether draft should auto-pick due to elapsed time.
 * If elapsed >= duration, automatically picks the first card (index 0) so gameplay never stalls.
 *
 * @param {object} session - Active draft session.
 * @param {number} currentTimeMs - Current clock time in ms.
 * @returns {object} { expired: boolean, autoSelected: boolean, selectedCard: object|null }
 */
export function updateDraftTimer(session, currentTimeMs) {
    if (!session || !session.active || session.completed) {
        return { expired: false, autoSelected: false, selectedCard: session?.selectedCard || null };
    }

    const elapsed = Math.max(0, currentTimeMs - session.startTimeMs);
    session.remainingMs = Math.max(0, session.durationMs - elapsed);

    if (session.remainingMs <= 0) {
        // Auto-pick card 1 (index 0) so gameplay never stalls
        const fallbackCard = session.cards[0] || TAROT_CARDS[TAROT_CARD_IDS.CAFFEINATED_OARS];
        session.active = false;
        session.completed = true;
        session.autoPicked = true;
        session.selectedIndex = 0;
        session.selectedCardId = fallbackCard.id;
        session.selectedCard = fallbackCard;

        return {
            expired: true,
            autoSelected: true,
            selectedCard: fallbackCard,
            selectedIndex: 0,
        };
    }

    return {
        expired: false,
        autoSelected: false,
        selectedCard: null,
        remainingMs: session.remainingMs,
    };
}

/**
 * Handles picking a card by index (0, 1, 2) or hotkey input ('1', '2', '3').
 *
 * @param {object} session - Active draft session.
 * @param {number|string} choice - Index 0..2 or string key '1'..'3'.
 * @param {number} [currentTimeMs=0] - Current time in ms.
 * @returns {object} Selection outcome { success: boolean, card: object|null, reason?: string }
 */
export function selectDraftCard(session, choice, currentTimeMs = 0) {
    if (!session) {
        return { success: false, card: null, reason: 'no-session' };
    }
    if (!session.active || session.completed) {
        return { success: false, card: session.selectedCard, reason: 'already-completed' };
    }

    let index = -1;
    if (typeof choice === 'number') {
        index = Math.floor(choice);
    } else if (typeof choice === 'string') {
        const clean = choice.trim();
        if (clean === '1') index = 0;
        else if (clean === '2') index = 1;
        else if (clean === '3') index = 2;
        else {
            // Check if choice is card id
            index = session.cards.findIndex((c) => c.id === clean);
        }
    }

    if (index < 0 || index >= session.cards.length) {
        return { success: false, card: null, reason: 'invalid-choice' };
    }

    const card = session.cards[index];
    session.active = false;
    session.completed = true;
    session.autoPicked = false;
    session.selectedIndex = index;
    session.selectedCardId = card.id;
    session.selectedCard = card;

    return {
        success: true,
        card,
        selectedIndex: index,
        autoPicked: false,
    };
}

/**
 * Initializes tarot blessings state container for a player.
 */
export function createPlayerTarotState() {
    return {
        blessings: {}, // Map of cardId -> { acquiredAt, count, level }
        squeakyHitCounter: 0,
        policeSummons: [], // Active police officers on jet-skis
        activeAnvilSlam: false,
        coinsEarnedFromBlocks: 0,
    };
}

/**
 * Applies an acquired tarot blessing card to the player's tarot state.
 *
 * @param {object} playerTarotState - The player's tarot state.
 * @param {string|object} cardOrId - Tarot card object or ID string.
 * @param {number} [now=0] - Timestamp when acquired.
 * @returns {object} Mutation result.
 */
export function applyTarotBlessing(playerTarotState, cardOrId, now = 0) {
    const cardId = typeof cardOrId === 'string' ? cardOrId : cardOrId?.id;
    const def = TAROT_CARDS[cardId];
    if (!def) {
        return { success: false, reason: 'unknown-card' };
    }

    if (!playerTarotState.blessings[cardId]) {
        playerTarotState.blessings[cardId] = {
            id: cardId,
            name: def.name,
            acquiredAt: now,
            count: 1,
        };
    } else {
        playerTarotState.blessings[cardId].count += 1;
    }

    return {
        success: true,
        cardId,
        card: def,
        totalBlessings: Object.keys(playerTarotState.blessings).length,
    };
}

/**
 * Checks if a player has a specific Dream Tarot blessing active.
 */
export function hasTarotBlessing(playerTarotState, cardId) {
    return Boolean(playerTarotState?.blessings?.[cardId]);
}

/**
 * [Mechanic 1: caffeinated-oars]
 * Computes paddle cadence and thrust force multiplier.
 * +25% paddle cadence & thrust, plus espresso foam wake trail.
 */
export function getPaddleCadenceModifier(playerTarotState) {
    if (!hasTarotBlessing(playerTarotState, TAROT_CARD_IDS.CAFFEINATED_OARS)) {
        return { cadenceMultiplier: 1.0, thrustMultiplier: 1.0, espressoFoam: false };
    }
    const def = TAROT_CARDS[TAROT_CARD_IDS.CAFFEINATED_OARS];
    return {
        cadenceMultiplier: def.cadenceMultiplier,
        thrustMultiplier: def.thrustMultiplier,
        espressoFoam: true,
    };
}

/**
 * [Mechanic 2: diplomatic-immunity]
 * Handles spawning/summoning 2 Harbor Police officers on jet-skis to shoot the nearest monster.
 *
 * @param {object} playerTarotState - Player tarot state.
 * @param {object} raftPosition - Current raft position { x, y, z }.
 * @param {object} enemies - Map of active enemies.
 * @param {number} [now=0] - Current timestamp.
 * @returns {object} Summon result containing 2 officer entities and initial firing commands.
 */
export function triggerDiplomaticImmunity(playerTarotState, raftPosition, enemies = {}, now = 0) {
    if (!hasTarotBlessing(playerTarotState, TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY)) {
        return { summoned: false, officers: [] };
    }
    const def = TAROT_CARDS[TAROT_CARD_IDS.DIPLOMATIC_IMMUNITY];

    // Find nearest alive monster
    let nearestEnemy = null;
    let minDist = Infinity;
    for (const enemy of Object.values(enemies)) {
        if (!enemy || (enemy.health !== undefined && enemy.health <= 0) || enemy.isDead) continue;
        const dist = Math.hypot(raftPosition.x - enemy.position.x, raftPosition.z - enemy.position.z);
        if (dist < minDist) {
            minDist = dist;
            nearestEnemy = enemy;
        }
    }

    const officers = [];
    for (let i = 0; i < def.summonsCount; i++) {
        const sideOffset = i === 0 ? -4 : 4;
        const officer = {
            id: `police_jetski_${now}_${i}`,
            type: def.officerType,
            position: {
                x: raftPosition.x + sideOffset,
                y: 0.3,
                z: raftPosition.z + 2,
            },
            targetEnemyId: nearestEnemy?.id || null,
            targetPosition: nearestEnemy ? { ...nearestEnemy.position } : null,
            shotDamage: def.shotDamage,
            shotsRemaining: def.shotsPerBurst,
            summonedAt: now,
        };
        officers.push(officer);
    }

    playerTarotState.policeSummons = [...playerTarotState.policeSummons, ...officers];

    return {
        summoned: true,
        count: officers.length,
        officers,
        targetEnemy: nearestEnemy,
        totalShotDamage: def.shotDamage * def.shotsPerBurst * def.summonsCount,
    };
}

/**
 * [Mechanic 3: heavy-pocket-anvil]
 * Evaluates pocket-raft slam damage when whipping the raft out mid-air onto an enemy.
 * Deals 60 AoE slam damage within 6.5m radius.
 *
 * @param {object} playerTarotState - Player tarot state.
 * @param {object} landingPos - Position where raft slams into water or enemy { x, y, z }.
 * @param {object} enemies - Map of enemies.
 * @returns {object} Slam impact result with affected enemies and damage dealt.
 */
export function evaluateHeavyPocketAnvilSlam(playerTarotState, landingPos, enemies = {}) {
    if (!hasTarotBlessing(playerTarotState, TAROT_CARD_IDS.HEAVY_POCKET_ANVIL)) {
        return { active: false, damageDealt: 0, hitEnemies: [] };
    }
    const def = TAROT_CARDS[TAROT_CARD_IDS.HEAVY_POCKET_ANVIL];
    const hitEnemies = [];
    let totalDamage = 0;

    for (const enemy of Object.values(enemies)) {
        if (!enemy || (enemy.health !== undefined && enemy.health <= 0) || enemy.isDead) continue;
        const dist = Math.hypot(landingPos.x - enemy.position.x, landingPos.z - enemy.position.z);
        if (dist <= def.slamRadius) {
            hitEnemies.push({
                enemyId: enemy.id,
                enemyType: enemy.type,
                damage: def.slamDamage,
                knockbackImpulse: def.knockbackImpulse,
                distance: dist,
            });
            totalDamage += def.slamDamage;
        }
    }

    return {
        active: true,
        slamDamage: def.slamDamage,
        slamRadius: def.slamRadius,
        knockbackImpulse: def.knockbackImpulse,
        hitEnemies,
        totalDamage,
    };
}

/**
 * [Mechanic 4: squeaky-overdrive]
 * Tracks Squeaky Hammer hits. Every 3rd hit unleashes a 140 dB ultrasonichonk shockwave.
 *
 * @param {object} playerTarotState - Player tarot state.
 * @param {object} hitTargetPos - Target position of hammer hit { x, y, z }.
 * @param {object} enemies - Active enemies map.
 * @returns {object} Overdrive hit result with shockwave triggers if every 3rd hit.
 */
export function recordSqueakyHammerHit(playerTarotState, hitTargetPos, enemies = {}) {
    if (!hasTarotBlessing(playerTarotState, TAROT_CARD_IDS.SQUEAKY_OVERDRIVE)) {
        return { shockwaveTriggered: false, currentCount: 0, hitEnemies: [] };
    }
    const def = TAROT_CARDS[TAROT_CARD_IDS.SQUEAKY_OVERDRIVE];
    playerTarotState.squeakyHitCounter = (playerTarotState.squeakyHitCounter || 0) + 1;
    const isOverdrive = playerTarotState.squeakyHitCounter % def.hitInterval === 0;

    if (!isOverdrive) {
        return {
            shockwaveTriggered: false,
            currentCount: playerTarotState.squeakyHitCounter,
            hitsUntilOverdrive: def.hitInterval - (playerTarotState.squeakyHitCounter % def.hitInterval),
            hitEnemies: [],
        };
    }

    // Trigger ultrasonichonk shockwave dealing 45 damage in 8m radius
    const hitEnemies = [];
    for (const enemy of Object.values(enemies)) {
        if (!enemy || (enemy.health !== undefined && enemy.health <= 0) || enemy.isDead) continue;
        const dist = Math.hypot(hitTargetPos.x - enemy.position.x, hitTargetPos.z - enemy.position.z);
        if (dist <= def.shockwaveRadius) {
            hitEnemies.push({
                enemyId: enemy.id,
                enemyType: enemy.type,
                damage: def.shockwaveDamage,
                distance: dist,
            });
        }
    }

    return {
        shockwaveTriggered: true,
        currentCount: playerTarotState.squeakyHitCounter,
        hitsUntilOverdrive: def.hitInterval,
        decibels: def.soundDecibels,
        shockwaveRadius: def.shockwaveRadius,
        shockwaveDamage: def.shockwaveDamage,
        hitEnemies,
    };
}

/**
 * [Mechanic 5: plank-magnetism]
 * Pulls gold coins and crates within 14m toward the raft.
 *
 * @param {object} playerTarotState - Player tarot state.
 * @param {object} raftPos - Raft position { x, y, z }.
 * @param {Array<object>} lootItems - Array of floating pickups or coins.
 * @param {number} dt - Delta time in seconds.
 * @returns {object} Result with attracted items and velocity deltas.
 */
export function stepPlankMagnetism(playerTarotState, raftPos, lootItems = [], dt = 0.05) {
    if (!hasTarotBlessing(playerTarotState, TAROT_CARD_IDS.PLANK_MAGNETISM)) {
        return { active: false, attractedCount: 0, itemsMoved: [] };
    }
    const def = TAROT_CARDS[TAROT_CARD_IDS.PLANK_MAGNETISM];
    const itemsMoved = [];

    for (let i = 0; i < lootItems.length; i++) {
        const item = lootItems[i];
        if (!item || item.collected) continue;

        const pos = item.position || item;
        const dx = raftPos.x - pos.x;
        const dz = raftPos.z - pos.z;
        const dist = Math.hypot(dx, dz);

        if (dist <= def.magnetRadius && dist > 0.1) {
            // Pull toward raft
            const dirX = dx / dist;
            const dirZ = dz / dist;
            const moveStep = Math.min(dist, def.attractionForce * dt);

            pos.x += dirX * moveStep;
            pos.z += dirZ * moveStep;

            itemsMoved.push({
                id: item.id || `loot_${i}`,
                distance: dist,
                movedX: dirX * moveStep,
                movedZ: dirZ * moveStep,
            });
        }
    }

    return {
        active: true,
        magnetRadius: def.magnetRadius,
        attractedCount: itemsMoved.length,
        itemsMoved,
    };
}

/**
 * [Mechanic 6: reverse-psychology]
 * When blocking an incoming attack (specifically Wizard throw/hit):
 * Wizard throw boosts your coins by +8 instead of hurting when blocked!
 *
 * @param {object} playerTarotState - Player tarot state.
 * @param {object} player - Player object with coins, health, etc.
 * @param {string} attackerType - Enemy type ('whiteGuy', 'mudAlien', etc.).
 * @param {boolean} isBlocking - True if the player is holding block.
 * @returns {object} Block resolution { converted: boolean, coinsAdded: number, damageDealt: number }
 */
export function resolveReversePsychologyBlock(playerTarotState, player, attackerType, isBlocking) {
    if (!isBlocking || !hasTarotBlessing(playerTarotState, TAROT_CARD_IDS.REVERSE_PSYCHOLOGY)) {
        return { converted: false, coinsAdded: 0, damageMultiplier: 1.0 };
    }

    // Applies specifically to the Wizard (whiteGuy)
    if (attackerType === 'whiteGuy' || attackerType === 'wizard') {
        const def = TAROT_CARDS[TAROT_CARD_IDS.REVERSE_PSYCHOLOGY];
        const coinsAwarded = def.coinRewardOnBlock; // +8 coins

        if (player) {
            player.coins = (player.coins || 0) + coinsAwarded;
        }
        playerTarotState.coinsEarnedFromBlocks = (playerTarotState.coinsEarnedFromBlocks || 0) + coinsAwarded;

        return {
            converted: true,
            coinsAdded: coinsAwarded,
            damageMultiplier: def.blockDamageMultiplier, // 0.0 damage!
            reflectKnockback: def.reflectKnockback,
            newCoinTotal: player?.coins || 0,
        };
    }

    return {
        converted: false,
        coinsAdded: 0,
        damageMultiplier: 1.0,
    };
}
