// Pure, deterministic Mid-River Fever-Dream Encounter Director for "Don't Sink, Don't Die".
// Zero timers, zero I/O, zero external dependencies. Pure math for:
// 1. 'capybara-hottub-barge': Steaming cedar hot-tub barge with 3 chill capybaras wearing tangerines;
//    sailing within 7m heals crew +15 HP/s and grants calm aura.
// 2. 'bureaucratic-swan-boat': Armored pedal-swan toll collector demanding a 5-coin river permit;
//    smashing the toll booth drops a 25-coin audit pinata.
// 3. 'rubber-ducky-stampede': 30 giant yellow rubber ducks bouncing down the rapids that act as
//    bouncy springboards when jumped on.
// 4. 'ghost-shopping-cart': Glowing supermarket trolley full of fireworks that latches onto the
//    raft for a 4-second rocket boost.
// 5. 'disco-crab-rave-island': Tiny sandbar with dancing neon crabs that doubles coin drops for
//    15 seconds if you honk/swing in rhythm.

export const DREAM_EVENT_TYPES = {
    CAPYBARA_HOTTUB: 'capybara-hottub-barge',
    BUREAUCRATIC_SWAN: 'bureaucratic-swan-boat',
    RUBBER_DUCKY_STAMPEDE: 'rubber-ducky-stampede',
    GHOST_SHOPPING_CART: 'ghost-shopping-cart',
    DISCO_CRAB_RAVE: 'disco-crab-rave-island',
};

export const DREAM_CONSTANTS = {
    // 1. Capybara Hot-Tub Barge
    CAPYBARA: {
        AURA_RADIUS: 7.0, // sailing within 7m
        HEAL_PER_SECOND: 15.0, // +15 HP/s
        BARGE_WIDTH: 5.0,
        BARGE_LENGTH: 7.0,
        CAPYBARA_COUNT: 3,
        CALM_AURA_DURATION_MS: 3000,
    },

    // 2. Bureaucratic Swan Boat
    SWAN: {
        TOLL_COIN_COST: 5, // 5-coin river permit
        AUDIT_PINATA_REWARD: 25, // smashing drops 25-coin pinata
        BOOTH_HEALTH: 40,
        DETECTION_RADIUS: 6.5,
        PASSAGE_RADIUS: 5.0,
        SWAN_SPEED: 4.0,
    },

    // 3. Rubber Ducky Stampede
    RUBBER_DUCKY: {
        TOTAL_DUCKS: 30,
        DUCK_RADIUS: 1.2,
        BOUNCE_IMPULSE_Y: 18.0, // springboard launch vertical velocity
        BOUNCE_BOOST_Z: -12.0, // springboard forward boost
        DOWNRIVER_SPEED: 8.0,
        BOB_AMPLITUDE: 0.45,
        BOB_FREQUENCY: 3.5,
    },

    // 4. Ghost Shopping Cart
    SHOPPING_CART: {
        LATCH_RADIUS: 3.5,
        BOOST_DURATION_MS: 4000, // 4-second rocket boost
        FORWARD_ACCEL: 45.0, // rocket thrust forward (-z)
        DETONATION_COIN_BONUS: 10,
        SPEED_MULTIPLIER: 1.8,
    },

    // 5. Disco Crab Rave Island
    DISCO_CRAB: {
        ISLAND_RADIUS: 6.0,
        CRAB_COUNT: 8,
        DOUBLE_COIN_DURATION_MS: 15000, // doubles coins for 15s
        BEAT_INTERVAL_MS: 500, // 120 BPM rhythm beat
        RHYTHM_TOLERANCE_MS: 180, // timing window to match rhythm
        COIN_MULTIPLIER: 2.0,
    },
};

/** Mulberry32 deterministic PRNG */
export function createRng(seed = 1) {
    let a = (seed >>> 0) || 1;
    return function mulberry32() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Capybara Hot-Tub Barge Mechanics
// ─────────────────────────────────────────────────────────────────────────────

export function createCapybaraBarge(id, x, z, options = {}) {
    return {
        id,
        type: DREAM_EVENT_TYPES.CAPYBARA_HOTTUB,
        x,
        y: options.y ?? 0.25,
        z,
        radius: options.radius ?? DREAM_CONSTANTS.CAPYBARA.AURA_RADIUS,
        healPerSecond: options.healPerSec ?? DREAM_CONSTANTS.CAPYBARA.HEAL_PER_SECOND,
        calmAuraDurationMs: DREAM_CONSTANTS.CAPYBARA.CALM_AURA_DURATION_MS,
        capybaras: [
            { id: 0, relX: -1.0, relZ: 0.8, tangerine: true, name: 'Chillin’ Carl' },
            { id: 1, relX: 0.9, relZ: 0.6, tangerine: true, name: 'Meditatin’ Mochi' },
            { id: 2, relX: 0.0, relZ: -0.9, tangerine: true, name: 'Zen Zezinho' },
        ],
        activeGuests: {},
    };
}

export function evaluateCapybaraInteraction(craft, barge, dt, now = 0) {
    const p = craft.position || craft;
    const dx = p.x - barge.x;
    const dz = p.z - barge.z;
    const dist = Math.hypot(dx, dz);
    const inside = dist <= barge.radius;

    let healedHp = 0;
    let calmAura = false;

    if (inside) {
        calmAura = true;
        const healAmt = barge.healPerSecond * dt;
        if (craft.health !== undefined && craft.maxHealth !== undefined) {
            const oldHp = craft.health;
            craft.health = Math.min(craft.maxHealth, craft.health + healAmt);
            healedHp = craft.health - oldHp;
        } else {
            healedHp = healAmt;
        }
        barge.activeGuests[craft.id || 'default'] = now;
    }

    return {
        inside,
        distance: dist,
        healedHp,
        calmAura,
        calmDurationRemainingMs: inside ? barge.calmAuraDurationMs : 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bureaucratic Swan Boat Mechanics
// ─────────────────────────────────────────────────────────────────────────────

export function createBureaucraticSwan(id, x, z, options = {}) {
    return {
        id,
        type: DREAM_EVENT_TYPES.BUREAUCRATIC_SWAN,
        x,
        y: options.y ?? 0.25,
        z,
        tollCost: options.tollCost ?? DREAM_CONSTANTS.SWAN.TOLL_COIN_COST,
        boothHealth: options.boothHealth ?? DREAM_CONSTANTS.SWAN.BOOTH_HEALTH,
        maxBoothHealth: options.boothHealth ?? DREAM_CONSTANTS.SWAN.BOOTH_HEALTH,
        state: 'demanding', // 'demanding' | 'permitted' | 'smashed'
        permitIssuedTo: {},
        pinataCollected: false,
        pinataReward: options.pinataReward ?? DREAM_CONSTANTS.SWAN.AUDIT_PINATA_REWARD,
        detectionRadius: options.detectionRadius ?? DREAM_CONSTANTS.SWAN.DETECTION_RADIUS,
    };
}

export function interactWithBureaucraticSwan(swan, player, action = { type: 'approach' }) {
    const p = player.position || player;
    const dist = Math.hypot(p.x - swan.x, p.z - swan.z);
    const inRange = dist <= swan.detectionRadius;

    if (!inRange) {
        return {
            success: false,
            reason: 'out-of-range',
            state: swan.state,
            coinsTransferred: 0,
        };
    }

    // A. Pay Toll permit
    if (action.type === 'pay_toll') {
        if (swan.state === 'smashed') {
            return { success: false, reason: 'booth-is-smashed', state: swan.state };
        }
        if (swan.permitIssuedTo[player.id || 'default']) {
            return { success: true, reason: 'already-permitted', state: swan.state, coinsTransferred: 0 };
        }
        const coins = player.coins ?? 0;
        if (coins < swan.tollCost) {
            return { success: false, reason: 'insufficient-coins', needed: swan.tollCost, current: coins };
        }
        if (player.coins !== undefined) {
            player.coins -= swan.tollCost;
        }
        swan.permitIssuedTo[player.id || 'default'] = true;
        swan.state = 'permitted';
        return {
            success: true,
            reason: 'toll-paid',
            state: swan.state,
            coinsTransferred: -swan.tollCost,
            hasPermit: true,
        };
    }

    // B. Attack / Smash the toll booth
    if (action.type === 'attack_booth') {
        if (swan.state === 'smashed') {
            return { success: false, reason: 'booth-already-smashed', pinataDropped: false };
        }
        const dmg = action.damage ?? 20;
        swan.boothHealth = Math.max(0, swan.boothHealth - dmg);
        let pinataDropped = false;
        let awardedCoins = 0;

        if (swan.boothHealth <= 0) {
            swan.state = 'smashed';
            if (!swan.pinataCollected) {
                swan.pinataCollected = true;
                pinataDropped = true;
                awardedCoins = swan.pinataReward;
                if (player.coins !== undefined) {
                    player.coins += awardedCoins;
                }
            }
        }

        return {
            success: true,
            damageDealt: dmg,
            remainingBoothHealth: swan.boothHealth,
            state: swan.state,
            pinataDropped,
            coinsAwarded: awardedCoins,
        };
    }

    // C. Approach check
    return {
        success: true,
        inRange: true,
        state: swan.state,
        hasPermit: !!swan.permitIssuedTo[player.id || 'default'],
        tollCost: swan.tollCost,
        pinataReward: swan.pinataReward,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Rubber Ducky Stampede Mechanics
// ─────────────────────────────────────────────────────────────────────────────

export function createRubberDuckyStampede(id, startZ, riverWidth = 30, seed = 101) {
    const rng = createRng(seed);
    const count = DREAM_CONSTANTS.RUBBER_DUCKY.TOTAL_DUCKS;
    const ducks = [];
    const halfW = (riverWidth * 0.5) - 2.5;

    for (let i = 0; i < count; i++) {
        const x = (rng() - 0.5) * 2 * halfW;
        // spread across a 90m band
        const z = startZ - rng() * 90;
        const phase = rng() * Math.PI * 2;
        const bobSpeed = 2.0 + rng() * 2.5;
        const downriverSpeed = DREAM_CONSTANTS.RUBBER_DUCKY.DOWNRIVER_SPEED * (0.8 + rng() * 0.4);

        ducks.push({
            id: `duck_${id}_${i}`,
            index: i,
            x,
            y: 0.3,
            z,
            initialZ: z,
            radius: DREAM_CONSTANTS.RUBBER_DUCKY.DUCK_RADIUS,
            downriverSpeed,
            bobSpeed,
            phase,
            bouncesCount: 0,
            scale: 0.85 + rng() * 0.5, // giant rubber duck scale
        });
    }

    return {
        id,
        type: DREAM_EVENT_TYPES.RUBBER_DUCKY_STAMPEDE,
        startZ,
        riverWidth,
        ducks,
    };
}

export function updateRubberDuckyStampede(stampede, dt, nowSec = 0) {
    for (let i = 0; i < stampede.ducks.length; i++) {
        const duck = stampede.ducks[i];
        duck.z -= duck.downriverSpeed * dt;
        duck.y = 0.3 + Math.sin(nowSec * duck.bobSpeed + duck.phase) * DREAM_CONSTANTS.RUBBER_DUCKY.BOB_AMPLITUDE;
    }
}

export function evaluateDuckySpringboard(craft, stampede) {
    const p = craft.position || craft;
    const v = craft.velocity || { x: 0, y: 0, z: 0 };
    let bounced = false;
    let hitDuckId = null;

    for (let i = 0; i < stampede.ducks.length; i++) {
        const duck = stampede.ducks[i];
        const dx = p.x - duck.x;
        const dz = p.z - duck.z;
        const distXZ = Math.hypot(dx, dz);

        // Springboard occurs when hitting duck from above or overlapping within bounding radius
        if (distXZ <= duck.radius + 1.0) {
            bounced = true;
            hitDuckId = duck.id;
            duck.bouncesCount++;

            // Apply springboard launch
            v.y = DREAM_CONSTANTS.RUBBER_DUCKY.BOUNCE_IMPULSE_Y;
            v.z = Math.min(v.z, DREAM_CONSTANTS.RUBBER_DUCKY.BOUNCE_BOOST_Z);
            break;
        }
    }

    return {
        bounced,
        hitDuckId,
        launchVelocityY: bounced ? DREAM_CONSTANTS.RUBBER_DUCKY.BOUNCE_IMPULSE_Y : 0,
        boostVelocityZ: bounced ? DREAM_CONSTANTS.RUBBER_DUCKY.BOUNCE_BOOST_Z : 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Ghost Shopping Cart Mechanics
// ─────────────────────────────────────────────────────────────────────────────

export function createGhostShoppingCart(id, x, z) {
    return {
        id,
        type: DREAM_EVENT_TYPES.GHOST_SHOPPING_CART,
        x,
        y: 0.3,
        z,
        latched: false,
        latchedCraftId: null,
        latchedAt: 0,
        boostRemainingMs: 0,
        exploded: false,
        fireworksBonusGiven: false,
    };
}

export function evaluateShoppingCartInteraction(cart, craft, dt, now = 0) {
    const p = craft.position || craft;
    const v = craft.velocity || { x: 0, y: 0, z: 0 };
    const result = {
        latched: cart.latched,
        boosting: false,
        exploded: cart.exploded,
        bonusCoins: 0,
    };

    if (cart.exploded) {
        return result;
    }

    // Check latch proximity if not yet latched
    if (!cart.latched) {
        const dist = Math.hypot(p.x - cart.x, p.z - cart.z);
        if (dist <= DREAM_CONSTANTS.SHOPPING_CART.LATCH_RADIUS) {
            cart.latched = true;
            cart.latchedCraftId = craft.id || 'default';
            cart.latchedAt = now;
            cart.boostRemainingMs = DREAM_CONSTANTS.SHOPPING_CART.BOOST_DURATION_MS;
        }
    }

    // If latched, apply 4-second rocket boost
    if (cart.latched && cart.boostRemainingMs > 0) {
        result.boosting = true;
        result.latched = true;
        const dtMs = dt * 1000;
        cart.boostRemainingMs = Math.max(0, cart.boostRemainingMs - dtMs);

        // Rocket propulsion acceleration downriver (-z)
        const forwardThrust = DREAM_CONSTANTS.SHOPPING_CART.FORWARD_ACCEL;
        v.z -= forwardThrust * dt;

        // Position cart relative to raft rear/side
        cart.x = p.x;
        cart.y = p.y;
        cart.z = p.z + 1.8;

        if (cart.boostRemainingMs <= 0) {
            // Explode fireworks at end of boost
            cart.exploded = true;
            result.exploded = true;
            if (!cart.fireworksBonusGiven) {
                cart.fireworksBonusGiven = true;
                result.bonusCoins = DREAM_CONSTANTS.SHOPPING_CART.DETONATION_COIN_BONUS;
                if (craft.coins !== undefined) {
                    craft.coins += result.bonusCoins;
                }
            }
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Disco Crab Rave Island Mechanics
// ─────────────────────────────────────────────────────────────────────────────

export function createDiscoCrabRaveIsland(id, x, z) {
    const crabs = [];
    for (let i = 0; i < DREAM_CONSTANTS.DISCO_CRAB.CRAB_COUNT; i++) {
        const angle = (i / DREAM_CONSTANTS.DISCO_CRAB.CRAB_COUNT) * Math.PI * 2;
        const r = 2.2 + (i % 3) * 0.8;
        crabs.push({
            id: `crab_${id}_${i}`,
            relX: Math.cos(angle) * r,
            relZ: Math.sin(angle) * r,
            neonColorIndex: i % 4, // 0: neon cyan, 1: hot pink, 2: neon green, 3: electric yellow
            groovePhase: i * 0.4,
        });
    }

    return {
        id,
        type: DREAM_EVENT_TYPES.DISCO_CRAB_RAVE,
        x,
        y: 0.1,
        z,
        radius: DREAM_CONSTANTS.DISCO_CRAB.ISLAND_RADIUS,
        crabs,
        raveActive: false,
        raveEndTime: 0,
        rhythmScore: 0,
        bpm: 120,
    };
}

export function evaluateCrabRaveRhythm(island, inputAction = {}, nowMs = 0) {
    const beatInterval = DREAM_CONSTANTS.DISCO_CRAB.BEAT_INTERVAL_MS; // 500ms
    const tolerance = DREAM_CONSTANTS.DISCO_CRAB.RHYTHM_TOLERANCE_MS;

    // Check action type: honk, swing mallet, or beat tap
    if (inputAction.type !== 'honk' && inputAction.type !== 'swing' && inputAction.type !== 'tap') {
        return { success: false, reason: 'invalid-action' };
    }

    // Time offset from nearest rhythmic beat
    const beatPhase = nowMs % beatInterval;
    const offsetFromBeat = Math.min(beatPhase, beatInterval - beatPhase);
    const onBeat = offsetFromBeat <= tolerance;

    if (onBeat) {
        island.rhythmScore += 1;
        // Trigger 15-second double coin drops if rhythm hit
        island.raveActive = true;
        island.raveEndTime = Math.max(island.raveEndTime, nowMs + DREAM_CONSTANTS.DISCO_CRAB.DOUBLE_COIN_DURATION_MS);
        return {
            success: true,
            onBeat: true,
            rhythmScore: island.rhythmScore,
            doubleCoinsActive: true,
            durationRemainingMs: island.raveEndTime - nowMs,
            multiplier: DREAM_CONSTANTS.DISCO_CRAB.COIN_MULTIPLIER,
        };
    }

    return {
        success: false,
        onBeat: false,
        offsetFromBeat,
        rhythmScore: island.rhythmScore,
        doubleCoinsActive: island.raveActive && nowMs < island.raveEndTime,
    };
}

export function isDoubleCoinsActive(island, nowMs = 0) {
    return island.raveActive && nowMs < island.raveEndTime;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Deterministic Dream Events Layout & Step Director
// ─────────────────────────────────────────────────────────────────────────────

export function generateDreamEncounters(seed = 42, finishZ = -1500, riverWidth = 30) {
    const rng = createRng(seed);
    const encounters = [];
    const types = [
        DREAM_EVENT_TYPES.CAPYBARA_HOTTUB,
        DREAM_EVENT_TYPES.BUREAUCRATIC_SWAN,
        DREAM_EVENT_TYPES.RUBBER_DUCKY_STAMPEDE,
        DREAM_EVENT_TYPES.GHOST_SHOPPING_CART,
        DREAM_EVENT_TYPES.DISCO_CRAB_RAVE,
    ];

    // Shuffle encounters deterministically using Fisher-Yates
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const temp = types[i];
        types[i] = types[j];
        types[j] = temp;
    }

    // River distance intervals between checkpoints
    const startZ = -120;
    const totalDist = Math.abs(finishZ) - 200;
    const spacing = totalDist / (types.length + 1);

    for (let i = 0; i < types.length; i++) {
        const type = types[i];
        const encounterZ = startZ - (i + 1) * spacing + (rng() - 0.5) * 30;
        const encounterX = (rng() - 0.5) * (riverWidth * 0.55);

        let encounter = null;
        const id = `dream_encounter_${i + 1}`;

        switch (type) {
            case DREAM_EVENT_TYPES.CAPYBARA_HOTTUB:
                encounter = createCapybaraBarge(id, encounterX, encounterZ);
                break;
            case DREAM_EVENT_TYPES.BUREAUCRATIC_SWAN:
                encounter = createBureaucraticSwan(id, encounterX, encounterZ);
                break;
            case DREAM_EVENT_TYPES.RUBBER_DUCKY_STAMPEDE:
                encounter = createRubberDuckyStampede(id, encounterZ, riverWidth, Math.floor(rng() * 10000));
                break;
            case DREAM_EVENT_TYPES.GHOST_SHOPPING_CART:
                encounter = createGhostShoppingCart(id, encounterX, encounterZ);
                break;
            case DREAM_EVENT_TYPES.DISCO_CRAB_RAVE:
                encounter = createDiscoCrabRaveIsland(id, encounterX, encounterZ);
                break;
            default:
                break;
        }

        if (encounter) {
            encounters.push(encounter);
        }
    }

    return encounters;
}

export function stepDreamEncounters(craft, encounters, dt, nowMs = 0) {
    const results = {
        capybaraAura: false,
        healedHp: 0,
        swanInteraction: null,
        duckyBounce: false,
        duckyLaunchVy: 0,
        rocketBoosting: false,
        cartExploded: false,
        bonusCoins: 0,
        doubleCoinsActive: false,
    };

    const nowSec = nowMs / 1000;

    for (let i = 0; i < encounters.length; i++) {
        const enc = encounters[i];
        switch (enc.type) {
            case DREAM_EVENT_TYPES.CAPYBARA_HOTTUB: {
                const res = evaluateCapybaraInteraction(craft, enc, dt, nowMs);
                if (res.inside) {
                    results.capybaraAura = true;
                    results.healedHp += res.healedHp;
                }
                break;
            }
            case DREAM_EVENT_TYPES.BUREAUCRATIC_SWAN: {
                const res = interactWithBureaucraticSwan(enc, craft, { type: 'approach' });
                results.swanInteraction = res;
                break;
            }
            case DREAM_EVENT_TYPES.RUBBER_DUCKY_STAMPEDE: {
                updateRubberDuckyStampede(enc, dt, nowSec);
                const bounceRes = evaluateDuckySpringboard(craft, enc);
                if (bounceRes.bounced) {
                    results.duckyBounce = true;
                    results.duckyLaunchVy = bounceRes.launchVelocityY;
                }
                break;
            }
            case DREAM_EVENT_TYPES.GHOST_SHOPPING_CART: {
                const cartRes = evaluateShoppingCartInteraction(enc, craft, dt, nowMs);
                if (cartRes.boosting) {
                    results.rocketBoosting = true;
                }
                if (cartRes.exploded) {
                    results.cartExploded = true;
                    results.bonusCoins += cartRes.bonusCoins;
                }
                break;
            }
            case DREAM_EVENT_TYPES.DISCO_CRAB_RAVE: {
                if (isDoubleCoinsActive(enc, nowMs)) {
                    results.doubleCoinsActive = true;
                }
                break;
            }
            default:
                break;
        }
    }

    return results;
}
