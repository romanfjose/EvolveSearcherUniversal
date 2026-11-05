/**
 * Don't Sink, Don't Die — Magnetic Coin Trails & Shattering Timber Piñata Physics
 * (`shared/magnetic-loot.js`)
 *
 * Pure, deterministic ES module for physicalized loot drops (gold coins & hull-repair planks)
 * that burst outward in an explosive fountain when a wooden barricade, barrel, or enemy is smashed,
 * and then home in magnetically toward the nearest player raft within magnetRadius.
 *
 * Zero external dependencies. Zero timers, zero I/O, no unseeded Math.random.
 */

export const MAGNETIC_LOOT_CONSTANTS = {
    // Loot types
    TYPES: {
        COIN: 'coin',
        HULL_PLANK: 'hull-plank',
    },

    // Source categories for pinata smash
    SOURCES: {
        BARRICADE: 'barricade',
        BARREL: 'barrel',
        ENEMY: 'enemy',
        PINATA: 'pinata',
    },

    // World & Ballistics
    WATER_SURFACE_Y: 0.25,
    GRAVITY: 24.0,
    AIR_DRAG: 0.8,
    WATER_DRAG: 3.2,
    WATER_RESTITUTION: 0.35, // bounce damping on water entry
    CURRENT_DRIFT_SPEED_Z: -3.5, // downriver drift

    // Pinata fountain ejection defaults
    FOUNTAIN: {
        BASE_UPWARD_SPEED: 8.5,
        SPREAD_RADIUS_SPEED: 5.5,
        COIN_COUNT_DEFAULT: 8,
        PLANK_COUNT_DEFAULT: 3,
        MAX_ITEMS_PER_BURST: 40,
    },

    // Spring-Damper magnetic homing physics
    MAGNET: {
        DEFAULT_RADIUS: 9.5, // magnet activation range in meters
        SPRING_CONSTANT: 48.0, // k: restoring attraction force stiffness
        DAMPER_CONSTANT: 12.0, // c: velocity damping coefficient to prevent erratic overshoot
        MAX_HOMING_SPEED: 32.0, // maximum homing terminal velocity (m/s)
        COLLECTION_RADIUS: 1.4, // distance to raft center or player where loot is collected
        MIN_PULL_ACCEL: 8.0, // minimum homing pull acceleration even at edge of radius
    },

    // Rewards
    REWARDS: {
        COIN_VALUE: 5, // gold coins awarded per coin item
        HULL_PLANK_REPAIR: 15, // raft HP restored per hull repair plank
        BARREL_COINS: 6,
        BARREL_PLANKS: 2,
        BARRICADE_COINS: 10,
        BARRICADE_PLANKS: 4,
        ENEMY_COINS: 8,
        ENEMY_PLANKS: 1,
    },

    // Combo pickup pitch escalation
    COMBO: {
        MIN_PITCH: 1.0,
        MAX_PITCH: 1.8,
        PITCH_STEP: 0.08, // pitch multiplier step per rapid pickup
        TIMEOUT_MS: 1200, // combo reset window in milliseconds
        TIMEOUT_S: 1.2, // combo reset window in seconds
    },

    // Item lifetimes
    LIFETIME_S: 18.0,
    FLOAT_BOB_AMPLITUDE: 0.08,
    FLOAT_BOB_FREQUENCY: 3.0,
};

/**
 * Deterministic Mulberry32 PRNG
 */
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

// ─── 3D Vector Math Helpers ────────────────────────────────────────────────

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

export function vec3(x = 0, y = 0, z = 0) {
    return { x, y, z };
}

export function vec3Add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Length(v) {
    return Math.hypot(v.x, v.y, v.z);
}

export function vec3Distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function vec3Normalize(v) {
    const len = vec3Length(v);
    if (len > 1e-8) {
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }
    return { x: 0, y: 0, z: 0 };
}

// ─── Spring-Damper Attraction Math ─────────────────────────────────────────

/**
 * Computes smooth second-order spring-damper acceleration vector toward target.
 * Formula: a = (F_spring + F_damping) / m
 * where F_spring = k * (target - pos)
 * and   F_damping = -c * vel
 *
 * @param {object} pos - Current item 3D position {x, y, z}
 * @param {object} vel - Current item 3D velocity {x, y, z}
 * @param {object} targetPos - Target raft/player 3D position {x, y, z}
 * @param {number} k - Spring constant stiffness (restoring force)
 * @param {number} c - Damper constant (damping against overshoot)
 * @param {number} minPull - Minimum acceleration magnitude
 * @returns {{ x: number, y: number, z: number }} 3D acceleration vector
 */
export function computeSpringDamperForce(pos, vel, targetPos, k = 48.0, c = 12.0, minPull = 8.0) {
    const delta = vec3Sub(targetPos, pos);
    const dist = vec3Length(delta);

    // Spring restoring force pulling toward target
    let fx = delta.x * k;
    let fy = delta.y * k;
    let fz = delta.z * k;

    // Damper force resisting existing velocity
    fx -= vel.x * c;
    fy -= vel.y * c;
    fz -= vel.z * c;

    // Ensure a baseline pull along direction when approaching from far
    if (dist > 1e-4) {
        const dir = vec3Scale(delta, 1 / dist);
        const forceMagnitude = Math.hypot(fx, fy, fz);
        if (forceMagnitude < minPull) {
            fx += dir.x * (minPull - forceMagnitude);
            fy += dir.y * (minPull - forceMagnitude);
            fz += dir.z * (minPull - forceMagnitude);
        }
    }

    return { x: fx, y: fy, z: fz };
}

// ─── Combo Pickup Pitch Escalator ──────────────────────────────────────────

/**
 * Calculates audio pitch multiplier for rapid consecutive loot pickups.
 * Escalates smoothly from 1.0x up to 1.8x.
 *
 * @param {number} comboCount - Number of rapid pickups in current chain (0, 1, 2, ...)
 * @param {number} [minPitch=1.0] - Baseline pitch
 * @param {number} [maxPitch=1.8] - Peak pitch cap
 * @param {number} [step=0.08] - Increment per combo count
 * @returns {number} Audio pitch multiplier in [1.0, 1.8]
 */
export function calculateComboPitch(comboCount, minPitch = 1.0, maxPitch = 1.8, step = 0.08) {
    if (!Number.isFinite(comboCount) || comboCount <= 0) return minPitch;
    const computed = minPitch + comboCount * step;
    return Math.min(maxPitch, Math.max(minPitch, Number(computed.toFixed(3))));
}

/**
 * Creates a standalone combo tracker instance.
 */
export function createComboTracker(timeoutMs = MAGNETIC_LOOT_CONSTANTS.COMBO.TIMEOUT_MS) {
    return {
        count: 0,
        lastPickupTime: -Infinity,
        timeoutMs,
        currentPitch: MAGNETIC_LOOT_CONSTANTS.COMBO.MIN_PITCH,
    };
}

/**
 * Registers a loot pickup on the combo tracker, escalating combo count & pitch.
 *
 * @param {object} tracker - Combo tracker state
 * @param {number} nowMs - Current timestamp in ms
 * @returns {{ count: number, pitch: number, isNewCombo: boolean }}
 */
export function registerComboPickup(tracker, nowMs) {
    const elapsed = nowMs - tracker.lastPickupTime;
    let isNewCombo = false;

    if (elapsed > tracker.timeoutMs || tracker.count === 0) {
        tracker.count = 1;
        isNewCombo = true;
    } else {
        tracker.count += 1;
    }

    tracker.lastPickupTime = nowMs;
    tracker.currentPitch = calculateComboPitch(
        tracker.count - 1,
        MAGNETIC_LOOT_CONSTANTS.COMBO.MIN_PITCH,
        MAGNETIC_LOOT_CONSTANTS.COMBO.MAX_PITCH,
        MAGNETIC_LOOT_CONSTANTS.COMBO.PITCH_STEP
    );

    return {
        count: tracker.count,
        pitch: tracker.currentPitch,
        isNewCombo,
    };
}

/**
 * Steps/updates combo tracker, resetting count if timeout exceeded.
 */
export function stepComboTracker(tracker, nowMs) {
    if (tracker.count > 0 && nowMs - tracker.lastPickupTime > tracker.timeoutMs) {
        tracker.count = 0;
        tracker.currentPitch = MAGNETIC_LOOT_CONSTANTS.COMBO.MIN_PITCH;
    }
    return tracker;
}

// ─── Pinata Fountain Spawning ──────────────────────────────────────────────

/**
 * Spawns an individual physicalized magnetic loot item.
 */
export function createMagneticLootItem({
    id,
    type = MAGNETIC_LOOT_CONSTANTS.TYPES.COIN,
    position,
    velocity,
    rotation = { x: 0, y: 0, z: 0 },
    rotVelocity = { x: 0, y: 0, z: 0 },
    sourceId = null,
    sourceType = null,
    value = null,
    lifetime = MAGNETIC_LOOT_CONSTANTS.LIFETIME_S,
    bobOffset = 0,
}) {
    const isCoin = type === MAGNETIC_LOOT_CONSTANTS.TYPES.COIN;
    const defaultValue = isCoin
        ? MAGNETIC_LOOT_CONSTANTS.REWARDS.COIN_VALUE
        : MAGNETIC_LOOT_CONSTANTS.REWARDS.HULL_PLANK_REPAIR;

    return {
        id,
        type, // 'coin' | 'hull-plank'
        position: { x: position.x, y: position.y, z: position.z },
        velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
        rotVelocity: { x: rotVelocity.x, y: rotVelocity.y, z: rotVelocity.z },
        sourceId,
        sourceType,
        value: value !== null ? value : defaultValue,
        age: 0,
        lifetime,
        onWater: false,
        homing: false,
        targetRaftId: null,
        collected: false,
        collectedBy: null,
        bobOffset,
    };
}

/**
 * Spawns a physicalized fountain burst of coins and hull-repair planks.
 * Items burst outward radially and upward in a fountain cone before homing.
 *
 * @param {object} options
 * @param {string} options.sourceId - ID of smashed obstacle/enemy
 * @param {string} [options.sourceType='pinata'] - 'barricade' | 'barrel' | 'enemy' | 'pinata'
 * @param {object} options.origin - 3D origin point {x, y, z}
 * @param {number} [options.coinCount] - Number of coins to burst
 * @param {number} [options.plankCount] - Number of repair planks to burst
 * @param {number} [options.seed=42] - Deterministic PRNG seed
 * @param {number} [options.baseUpwardSpeed] - Vertical launch speed
 * @param {number} [options.radialSpeed] - Outward radial speed
 * @returns {Array<object>} Array of physicalized loot items
 */
export function spawnPinataBurst({
    sourceId = 'pinata_0',
    sourceType = MAGNETIC_LOOT_CONSTANTS.SOURCES.PINATA,
    origin = { x: 0, y: 1.0, z: 0 },
    coinCount = null,
    plankCount = null,
    seed = 42,
    baseUpwardSpeed = MAGNETIC_LOOT_CONSTANTS.FOUNTAIN.BASE_UPWARD_SPEED,
    radialSpeed = MAGNETIC_LOOT_CONSTANTS.FOUNTAIN.SPREAD_RADIUS_SPEED,
} = {}) {
    const rng = createRng(seed);

    let numCoins = coinCount;
    let numPlanks = plankCount;

    if (numCoins === null || numPlanks === null) {
        switch (sourceType) {
            case MAGNETIC_LOOT_CONSTANTS.SOURCES.BARREL:
                numCoins = numCoins ?? MAGNETIC_LOOT_CONSTANTS.REWARDS.BARREL_COINS;
                numPlanks = numPlanks ?? MAGNETIC_LOOT_CONSTANTS.REWARDS.BARREL_PLANKS;
                break;
            case MAGNETIC_LOOT_CONSTANTS.SOURCES.BARRICADE:
                numCoins = numCoins ?? MAGNETIC_LOOT_CONSTANTS.REWARDS.BARRICADE_COINS;
                numPlanks = numPlanks ?? MAGNETIC_LOOT_CONSTANTS.REWARDS.BARRICADE_PLANKS;
                break;
            case MAGNETIC_LOOT_CONSTANTS.SOURCES.ENEMY:
                numCoins = numCoins ?? MAGNETIC_LOOT_CONSTANTS.REWARDS.ENEMY_COINS;
                numPlanks = numPlanks ?? MAGNETIC_LOOT_CONSTANTS.REWARDS.ENEMY_PLANKS;
                break;
            default:
                numCoins = numCoins ?? MAGNETIC_LOOT_CONSTANTS.FOUNTAIN.COIN_COUNT_DEFAULT;
                numPlanks = numPlanks ?? MAGNETIC_LOOT_CONSTANTS.FOUNTAIN.PLANK_COUNT_DEFAULT;
                break;
        }
    }

    const items = [];
    const totalItems = Math.min(
        MAGNETIC_LOOT_CONSTANTS.FOUNTAIN.MAX_ITEMS_PER_BURST,
        numCoins + numPlanks
    );

    let coinIndex = 0;
    let plankIndex = 0;

    for (let i = 0; i < totalItems; i++) {
        // Distribute planks and coins cleanly across the burst
        const isPlank = plankIndex < numPlanks && (i % Math.ceil(totalItems / (numPlanks || 1)) === 0 || coinIndex >= numCoins);
        const itemType = isPlank ? MAGNETIC_LOOT_CONSTANTS.TYPES.HULL_PLANK : MAGNETIC_LOOT_CONSTANTS.TYPES.COIN;
        const subIndex = isPlank ? plankIndex++ : coinIndex++;

        // Fountain cone math: radial angle + jittered speed
        const angle = (i / totalItems) * Math.PI * 2 + (rng() - 0.5) * 0.4;
        const speedJitter = 0.75 + rng() * 0.5;
        const radVel = radialSpeed * speedJitter;
        const upVel = baseUpwardSpeed * (0.8 + rng() * 0.45);

        const vx = Math.cos(angle) * radVel;
        const vy = upVel;
        const vz = Math.sin(angle) * radVel;

        const item = createMagneticLootItem({
            id: `${sourceId}_${itemType}_${subIndex}`,
            type: itemType,
            position: {
                x: origin.x + (rng() - 0.5) * 0.4,
                y: origin.y + (rng() - 0.5) * 0.3,
                z: origin.z + (rng() - 0.5) * 0.4,
            },
            velocity: { x: vx, y: vy, z: vz },
            rotation: {
                x: rng() * Math.PI * 2,
                y: rng() * Math.PI * 2,
                z: rng() * Math.PI * 2,
            },
            rotVelocity: {
                x: (rng() - 0.5) * 12.0,
                y: (rng() - 0.5) * 14.0,
                z: (rng() - 0.5) * 10.0,
            },
            sourceId,
            sourceType,
            bobOffset: rng() * Math.PI * 2,
        });

        items.push(item);
    }

    return items;
}

// ─── Target Raft Selection ─────────────────────────────────────────────────

/**
 * Finds the nearest active player raft within magnetRadius.
 *
 * @param {object} itemPos - 3D position of loot {x, y, z}
 * @param {Array<object>|object} rafts - Array or dictionary of player rafts
 * @param {number} magnetRadius - Maximum attraction radius
 * @returns {{ raft: object, distance: number, raftPos: object }|null}
 */
export function findNearestRaft(itemPos, rafts, magnetRadius = MAGNETIC_LOOT_CONSTANTS.MAGNET.DEFAULT_RADIUS) {
    const raftList = Array.isArray(rafts) ? rafts : Object.values(rafts || {});
    let nearest = null;
    let minDistance = magnetRadius;

    for (let i = 0; i < raftList.length; i++) {
        const raft = raftList[i];
        if (!raft) continue;
        if (raft.isDead || raft.health <= 0) continue;

        // Extract raft position from craft.position, position, or raft itself
        const pos = raft.craft?.position || raft.position || (typeof raft.x === 'number' ? raft : null);
        if (!pos) continue;

        const dist = vec3Distance(itemPos, pos);
        if (dist <= minDistance) {
            minDistance = dist;
            nearest = {
                raft,
                distance: dist,
                raftPos: { x: pos.x, y: pos.y, z: pos.z },
            };
        }
    }

    return nearest;
}

// ─── Single Item Physics & Magnetism Step ──────────────────────────────────

/**
 * Steps physics for a single physicalized loot item over dt.
 * - Simulates fountain arc and gravity while airborne
 * - Handles hydrodynamic water bounce and floating bob at river surface
 * - Applies smooth spring-damper homing attraction toward nearest player raft
 * - Triggers collection when reaching raft collection radius
 *
 * @param {object} item - Magnetic loot item
 * @param {number} dt - Timestep in seconds
 * @param {Array<object>|object} rafts - Active player rafts
 * @param {object} [config] - Physics overrides
 * @param {number} [elapsedSec=0] - World time for floating wave bob
 * @returns {{ item: object, collected: boolean, collectorRaft: object|null }}
 */
export function stepMagneticLootItem(
    item,
    dt,
    rafts = [],
    config = {},
    elapsedSec = 0
) {
    if (item.collected) {
        return { item, collected: false, collectorRaft: null };
    }

    item.age += dt;
    if (item.age >= item.lifetime) {
        return { item, collected: false, collectorRaft: null, expired: true };
    }

    const waterY = config.waterSurfaceY ?? MAGNETIC_LOOT_CONSTANTS.WATER_SURFACE_Y;
    const gravity = config.gravity ?? MAGNETIC_LOOT_CONSTANTS.GRAVITY;
    const magnetRadius = config.magnetRadius ?? MAGNETIC_LOOT_CONSTANTS.MAGNET.DEFAULT_RADIUS;
    const springK = config.springConstant ?? MAGNETIC_LOOT_CONSTANTS.MAGNET.SPRING_CONSTANT;
    const damperC = config.damperConstant ?? MAGNETIC_LOOT_CONSTANTS.MAGNET.DAMPER_CONSTANT;
    const maxSpeed = config.maxHomingSpeed ?? MAGNETIC_LOOT_CONSTANTS.MAGNET.MAX_HOMING_SPEED;
    const collectionRadius = config.collectionRadius ?? MAGNETIC_LOOT_CONSTANTS.MAGNET.COLLECTION_RADIUS;

    // 1. Rotation integration
    item.rotation.x += item.rotVelocity.x * dt;
    item.rotation.y += item.rotVelocity.y * dt;
    item.rotation.z += item.rotVelocity.z * dt;

    // 2. Nearest Raft Query & Magnetic Homing
    const target = findNearestRaft(item.position, rafts, magnetRadius);

    if (target) {
        item.homing = true;
        item.targetRaftId = target.raft.id || 'player';

        // Check collection threshold
        if (target.distance <= collectionRadius) {
            item.collected = true;
            item.collectedBy = target.raft.id || 'player';
            return { item, collected: true, collectorRaft: target.raft };
        }

        // Apply smooth spring-damper attraction
        const force = computeSpringDamperForce(
            item.position,
            item.velocity,
            target.raftPos,
            springK,
            damperC,
            MAGNETIC_LOOT_CONSTANTS.MAGNET.MIN_PULL_ACCEL
        );

        item.velocity.x += force.x * dt;
        item.velocity.y += force.y * dt;
        item.velocity.z += force.z * dt;

        // Clamp to maximum homing velocity
        const curSpeed = vec3Length(item.velocity);
        if (curSpeed > maxSpeed) {
            item.velocity = vec3Scale(item.velocity, maxSpeed / curSpeed);
        }
    } else {
        item.homing = false;
        item.targetRaftId = null;

        // Ballistic gravity when airborne and not homing
        if (item.position.y > waterY || item.velocity.y > 0) {
            item.velocity.y -= gravity * dt;
            const airDrag = Math.exp(-MAGNETIC_LOOT_CONSTANTS.AIR_DRAG * dt);
            item.velocity.x *= airDrag;
            item.velocity.z *= airDrag;
            item.onWater = false;
        } else {
            // Floating on water surface
            item.onWater = true;
            // Current downstream drift
            item.velocity.z += (MAGNETIC_LOOT_CONSTANTS.CURRENT_DRIFT_SPEED_Z - item.velocity.z) * (MAGNETIC_LOOT_CONSTANTS.WATER_DRAG * dt);
            const waterDrag = Math.exp(-MAGNETIC_LOOT_CONSTANTS.WATER_DRAG * dt);
            item.velocity.x *= waterDrag;
            item.velocity.y *= 0.5;
            item.rotVelocity.x *= 0.9;
            item.rotVelocity.z *= 0.9;
        }
    }

    // 3. Integrate position
    item.position.x += item.velocity.x * dt;
    item.position.y += item.velocity.y * dt;
    item.position.z += item.velocity.z * dt;

    // 4. Water surface collision / bounce
    if (!item.homing && item.position.y <= waterY) {
        if (item.velocity.y < -1.5) {
            item.velocity.y = -item.velocity.y * MAGNETIC_LOOT_CONSTANTS.WATER_RESTITUTION;
            item.position.y = waterY;
        } else {
            item.velocity.y = 0;
            const bob = Math.sin(elapsedSec * MAGNETIC_LOOT_CONSTANTS.FLOAT_BOB_FREQUENCY + item.bobOffset) * MAGNETIC_LOOT_CONSTANTS.FLOAT_BOB_AMPLITUDE;
            item.position.y = waterY + bob;
        }
    }

    return { item, collected: false, collectorRaft: null };
}

// ─── Pinata Smash Triggers ─────────────────────────────────────────────────

/**
 * Handles smashing a wooden barricade, barrel, or enemy and spawns the pinata loot burst.
 *
 * @param {object} source - Smashed entity (must have position {x,y,z} or x,z)
 * @param {string} sourceType - 'barricade' | 'barrel' | 'enemy' | 'pinata'
 * @param {object} [options] - Optional custom counts and seed
 * @returns {Array<object>} Spawned magnetic loot items
 */
export function handleSmashPinata(source, sourceType, options = {}) {
    if (!source) return [];

    const origin = source.position || {
        x: source.x ?? 0,
        y: source.y ?? 1.0,
        z: source.z ?? 0,
    };

    const sourceId = source.id || `${sourceType}_${Math.floor(Math.abs(origin.z))}`;

    return spawnPinataBurst({
        sourceId,
        sourceType,
        origin,
        coinCount: options.coinCount,
        plankCount: options.plankCount,
        seed: options.seed ?? Math.floor(Math.abs(origin.x * 100 + origin.z * 10) + 1),
        baseUpwardSpeed: options.baseUpwardSpeed,
        radialSpeed: options.radialSpeed,
    });
}

// ─── Simulation State Manager ──────────────────────────────────────────────

/**
 * Creates a centralized simulation manager for physicalized magnetic loot items.
 */
export function createMagneticLootManager(options = {}) {
    return {
        items: [],
        comboTrackers: new Map(), // playerId -> comboTracker
        totalCoinsCollected: 0,
        totalPlanksCollected: 0,
        totalHealthRestored: 0,
        config: { ...options },
    };
}

/**
 * Steps the complete magnetic loot simulation across all active items and rafts.
 * Resolves fountain physics, spring-damper attraction, collection events, and combo audio pitch.
 *
 * @param {object} manager - Magnetic loot manager state
 * @param {Array<object>|object} rafts - Active player rafts
 * @param {number} dt - Step delta time (s)
 * @param {number} [nowMs=0] - Current timestamp (ms)
 * @param {number} [elapsedSec=0] - Total elapsed game time (s)
 * @returns {{ events: Array<object>, activeCount: number }}
 */
export function stepMagneticLootSimulation(manager, rafts = [], dt = 0.05, nowMs = 0, elapsedSec = 0) {
    const events = [];
    const aliveItems = [];

    const raftList = Array.isArray(rafts) ? rafts : Object.values(rafts || {});

    for (let i = 0; i < manager.items.length; i++) {
        const item = manager.items[i];
        if (item.collected) continue;

        const res = stepMagneticLootItem(item, dt, raftList, manager.config, elapsedSec);

        if (res.collected && res.collectorRaft) {
            const raft = res.collectorRaft;
            const raftId = raft.id || 'player';

            // Resolve player combo tracker
            let tracker = manager.comboTrackers.get(raftId);
            if (!tracker) {
                tracker = createComboTracker();
                manager.comboTrackers.set(raftId, tracker);
            }

            const comboResult = registerComboPickup(tracker, nowMs);

            let coinsAwarded = 0;
            let healthRestored = 0;

            if (item.type === MAGNETIC_LOOT_CONSTANTS.TYPES.COIN) {
                coinsAwarded = item.value;
                raft.coins = (raft.coins || 0) + coinsAwarded;
                manager.totalCoinsCollected += coinsAwarded;
            } else if (item.type === MAGNETIC_LOOT_CONSTANTS.TYPES.HULL_PLANK) {
                const maxHp = raft.maxHealth || 100;
                const currentHp = raft.health !== undefined ? raft.health : maxHp;
                healthRestored = Math.min(maxHp, currentHp + item.value) - currentHp;
                raft.health = currentHp + healthRestored;
                manager.totalPlanksCollected += 1;
                manager.totalHealthRestored += healthRestored;
            }

            events.push({
                type: 'lootCollected',
                itemId: item.id,
                lootType: item.type,
                value: item.value,
                coinsAwarded,
                healthRestored,
                collectorRaftId: raftId,
                position: { ...item.position },
                comboCount: comboResult.count,
                audioPitch: comboResult.pitch,
            });
        } else if (!res.expired) {
            aliveItems.push(item);
        }
    }

    // Update combo trackers for inactive rafts
    for (const [raftId, tracker] of manager.comboTrackers.entries()) {
        stepComboTracker(tracker, nowMs);
    }

    manager.items = aliveItems;

    return {
        events,
        activeCount: aliveItems.length,
    };
}
