// Pure, deterministic destructible environment and hazard mechanics for "Don't Sink, Don't Die".
// Zero timers, zero I/O, zero external dependencies. Pure math for:
// 1. Destructible Wooden River Barricades: spiked timber palisades blocking channels with HP.
// 2. Falling Suspension Bridges: cliffside bridges spanning the gorge that snap and plunge into the river.
// 3. Rockslide Hazards: cliff-edge boulder clusters tumbling down scree slopes across the river path.
// 4. Floating Physics Debris Chunks: wood splinters, log chunks, and floating stones with buoyancy, water bob, and current drift.
// 5. Heavy Impact Smash Interactions: War-Mallet swings (and upgraded weapons) and charging Long Worm collisions.

export const DESTRUCTIBLE_CONSTANTS = {
    // 1. Wooden River Barricades
    BARRICADE: {
        DEFAULT_WIDTH: 12.0,
        DEFAULT_HEIGHT: 3.2,
        DEFAULT_DEPTH: 1.4,
        DEFAULT_HP: 60,
        LOG_COUNT: 7,
        SPIKE_DAMAGE_TO_CRAFT: 15, // Damage dealt to raft if crashing into intact barricade
        COLLISION_RADIUS: 3.2,
        DEBRIS_COUNT_MIN: 6,
        DEBRIS_COUNT_MAX: 10,
    },

    // 2. Falling Suspension Bridges
    BRIDGE: {
        DEFAULT_WIDTH: 32.0, // spans across river channel
        DEFAULT_SPAN_DEPTH: 4.5,
        DEFAULT_HEIGHT_ABOVE_WATER: 8.5,
        ANCHOR_HP: 80,
        COLLAPSE_DURATION_S: 1.8,
        PLANK_COUNT: 14,
        DEBRIS_COUNT: 12,
        SPLASH_DAMAGE: 35, // damage to craft directly underneath when it plunges
        SPLASH_RADIUS: 7.5,
    },

    // 3. Rockslide Hazards
    ROCKSLIDE: {
        TRIGGER_DISTANCE_Z: 35.0, // distance ahead of raft when rockslide breaks loose
        BOULDER_COUNT: 5,
        BOULDER_HP: 40,
        BOULDER_RADIUS: 1.1,
        CLIFF_HEIGHT: 18.0,
        SLOPE_ANGLE_RAD: 0.85, // steep canyon incline
        ROLL_SPEED: 18.0, // m/s down-slope rolling speed
        IMPACT_DAMAGE: 45,
        IMPACT_KNOCKBACK: 350,
        DEBRIS_COUNT: 8,
    },

    // 4. Floating Debris Physics
    DEBRIS: {
        WATER_SURFACE_Y: 0.25,
        BUOYANCY_ACCEL: 24.0,
        GRAVITY: 28.0,
        WATER_DRAG: 3.5,
        AIR_DRAG: 0.5,
        CURRENT_DRIFT_SPEED_Z: -4.5, // drifts downriver (-Z)
        BOB_AMPLITUDE: 0.14,
        BOB_FREQUENCY: 2.8,
        DEFAULT_LIFETIME_S: 12.0,
    },

    // 5. Weapon and Boss Impact Multipliers
    COMBAT: {
        MALLET_BASE_DAMAGE: 30, // standard squeaky mallet damage
        MALLET_UPGRADED_DAMAGE: 90, // power mallet damage
        MALLET_SMASH_IMPULSE: 22.0,
        LONG_WORM_CHARGE_DAMAGE: 300, // instant structural annihilation
        LONG_WORM_SMASH_IMPULSE: 45.0,
        LONG_WORM_HIT_RADIUS: 5.5,
        PADDLE_BASE_DAMAGE: 10,
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
// 1. Wooden River Barricades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a destructible wooden river barricade entity.
 */
export function createBarricade(id, x, z, options = {}) {
    const maxHp = options.hp ?? DESTRUCTIBLE_CONSTANTS.BARRICADE.DEFAULT_HP;
    return {
        id,
        type: 'barricade',
        x,
        y: options.y ?? 0.8,
        z,
        width: options.width ?? DESTRUCTIBLE_CONSTANTS.BARRICADE.DEFAULT_WIDTH,
        height: options.height ?? DESTRUCTIBLE_CONSTANTS.BARRICADE.DEFAULT_HEIGHT,
        depth: options.depth ?? DESTRUCTIBLE_CONSTANTS.BARRICADE.DEFAULT_DEPTH,
        hp: maxHp,
        maxHp,
        state: 'intact', // 'intact' | 'damaged' | 'broken'
        spikesIntact: options.spikes ?? true,
        collisionRadius: options.collisionRadius ?? (options.width ? options.width * 0.5 : DESTRUCTIBLE_CONSTANTS.BARRICADE.COLLISION_RADIUS),
        destroyedAt: null,
        destroyedBy: null,
    };
}

/**
 * Checks if a point or circular bounding circle collides with a barricade.
 */
export function checkBarricadeCollision(point, radius = 0, barricade) {
    if (barricade.state === 'broken') return { collides: false, penetration: 0 };

    const halfW = barricade.width * 0.5;
    const halfD = barricade.depth * 0.5;

    const dx = point.x - barricade.x;
    const dz = point.z - barricade.z;

    const closestX = Math.max(-halfW, Math.min(halfW, dx));
    const closestZ = Math.max(-halfD, Math.min(halfD, dz));

    const distX = dx - closestX;
    const distZ = dz - closestZ;
    const distSq = distX * distX + distZ * distZ;

    if (distSq <= radius * radius) {
        const dist = Math.sqrt(distSq);
        const penetration = radius - dist;
        return {
            collides: true,
            penetration: Math.max(0.01, penetration),
            normal: dist > 1e-6 ? { x: distX / dist, z: distZ / dist } : { x: 0, z: -1 },
        };
    }
    return { collides: false, penetration: 0 };
}

/**
 * Applies damage to a barricade, transitioning states and spawning debris if broken.
 */
export function damageBarricade(barricade, amount, source = 'mallet', impactPoint = null, impulse = 0) {
    if (barricade.state === 'broken') {
        return { destroyed: false, debris: [], barricade };
    }

    barricade.hp = Math.max(0, barricade.hp - amount);
    if (barricade.hp <= 0) {
        barricade.state = 'broken';
        barricade.destroyedBy = source;

        // Generate debris chunks
        const debris = spawnDebrisFromDestruction({
            type: 'wood_chunk',
            origin: impactPoint || { x: barricade.x, y: barricade.y, z: barricade.z },
            count: DESTRUCTIBLE_CONSTANTS.BARRICADE.DEBRIS_COUNT_MIN,
            sourceImpulse: impulse,
            spreadRadius: barricade.width * 0.45,
            sourceDirection: source === 'longWorm' ? { x: 0, y: 0.3, z: -1 } : { x: 0, y: 0.4, z: -0.8 },
        });

        return { destroyed: true, debris, barricade };
    }

    if (barricade.hp < barricade.maxHp * 0.5) {
        barricade.state = 'damaged';
    }

    return { destroyed: false, debris: [], barricade };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Falling Suspension Bridges
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a destructible suspension bridge spanning the river gorge.
 */
export function createSuspensionBridge(id, z, options = {}) {
    const spanWidth = options.width ?? DESTRUCTIBLE_CONSTANTS.BRIDGE.DEFAULT_WIDTH;
    const height = options.height ?? DESTRUCTIBLE_CONSTANTS.BRIDGE.DEFAULT_HEIGHT_ABOVE_WATER;
    const anchorHp = options.anchorHp ?? DESTRUCTIBLE_CONSTANTS.BRIDGE.ANCHOR_HP;

    return {
        id,
        type: 'bridge',
        x: options.x ?? 0,
        y: height,
        z,
        width: spanWidth,
        depth: options.depth ?? DESTRUCTIBLE_CONSTANTS.BRIDGE.DEFAULT_SPAN_DEPTH,
        anchorHpLeft: anchorHp,
        anchorHpRight: anchorHp,
        maxAnchorHp: anchorHp,
        state: 'standing', // 'standing' | 'collapsing' | 'collapsed'
        collapseProgress: 0.0, // 0..1
        collapseTime: 0.0,
        collapseDuration: DESTRUCTIBLE_CONSTANTS.BRIDGE.COLLAPSE_DURATION_S,
        tiltAngle: 0.0, // pitch/roll angle as it falls
        splashed: false,
    };
}

/**
 * Damages one or both anchors of a suspension bridge.
 */
export function damageBridgeAnchor(bridge, side = 'both', amount = 40, source = 'mallet') {
    if (bridge.state === 'collapsed') return { collapsed: false, bridge };

    if (side === 'left' || side === 'both') {
        bridge.anchorHpLeft = Math.max(0, bridge.anchorHpLeft - amount);
    }
    if (side === 'right' || side === 'both') {
        bridge.anchorHpRight = Math.max(0, bridge.anchorHpRight - amount);
    }

    // Bridge collapses if either anchor is destroyed or total damage surpasses threshold
    if ((bridge.anchorHpLeft <= 0 || bridge.anchorHpRight <= 0) && bridge.state === 'standing') {
        bridge.state = 'collapsing';
        bridge.collapseTime = 0.0;
        bridge.collapsedBy = source;
        // Directional tilt depending on which anchor snapped first
        if (bridge.anchorHpLeft <= 0 && bridge.anchorHpRight > 0) {
            bridge.tiltSide = -1; // collapses to the left
        } else if (bridge.anchorHpRight <= 0 && bridge.anchorHpLeft > 0) {
            bridge.tiltSide = 1; // collapses to the right
        } else {
            bridge.tiltSide = 0; // both snap together
        }
        return { collapsed: true, justTriggered: true, bridge };
    }

    return { collapsed: false, justTriggered: false, bridge };
}

/**
 * Updates collapsing bridge physics over delta time dt.
 */
export function stepBridgeCollapse(bridge, dt) {
    if (bridge.state !== 'collapsing') return { completed: false, splashDebris: [] };

    bridge.collapseTime += dt;
    bridge.collapseProgress = Math.min(1.0, bridge.collapseTime / bridge.collapseDuration);

    // Ease-in acceleration (gravity plunge)
    const t = bridge.collapseProgress;
    const gravityDrop = t * t;
    const initialY = DESTRUCTIBLE_CONSTANTS.BRIDGE.DEFAULT_HEIGHT_ABOVE_WATER;
    const waterY = DESTRUCTIBLE_CONSTANTS.DEBRIS.WATER_SURFACE_Y;

    bridge.y = initialY - gravityDrop * (initialY - waterY);
    bridge.tiltAngle = t * 0.75 * (bridge.tiltSide || 0.4);

    if (bridge.collapseProgress >= 1.0 && !bridge.splashed) {
        bridge.state = 'collapsed';
        bridge.splashed = true;
        bridge.y = waterY;

        // Plunge into river creates floating timber deck planks and splash chunks
        const splashDebris = spawnDebrisFromDestruction({
            type: 'bridge_plank',
            origin: { x: bridge.x, y: waterY + 0.5, z: bridge.z },
            count: DESTRUCTIBLE_CONSTANTS.BRIDGE.DEBRIS_COUNT,
            sourceImpulse: 15.0,
            spreadRadius: bridge.width * 0.4,
            sourceDirection: { x: (bridge.tiltSide || 0) * 0.5, y: 0.6, z: -0.2 },
        });

        return { completed: true, splashDebris };
    }

    return { completed: false, splashDebris: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Rockslide Hazards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a rockslide hazard zone along canyon scree slopes.
 */
export function createRockslideHazard(id, z, cliffSide = 'left', options = {}) {
    const isLeft = cliffSide === 'left';
    const cliffX = isLeft ? -16.0 : 16.0;
    const targetX = isLeft ? 4.0 : -4.0; // rolls across river toward opposite bank

    const count = options.boulderCount ?? DESTRUCTIBLE_CONSTANTS.ROCKSLIDE.BOULDER_COUNT;
    const boulders = [];

    for (let i = 0; i < count; i++) {
        boulders.push({
            id: `${id}_boulder_${i}`,
            x: cliffX + (isLeft ? -1.0 : 1.0) * (i * 0.8),
            y: DESTRUCTIBLE_CONSTANTS.ROCKSLIDE.CLIFF_HEIGHT + i * 1.2,
            z: z + (i - (count - 1) * 0.5) * 3.5,
            radius: DESTRUCTIBLE_CONSTANTS.ROCKSLIDE.BOULDER_RADIUS * (0.8 + ((i * 17) % 5) * 0.1),
            hp: DESTRUCTIBLE_CONSTANTS.ROCKSLIDE.BOULDER_HP,
            state: 'dormant', // 'dormant' | 'rolling' | 'resting' | 'shattered'
            vx: 0,
            vy: 0,
            vz: 0,
            rotSpeed: 0,
            rollProgress: 0,
        });
    }

    return {
        id,
        type: 'rockslide',
        z,
        cliffSide,
        cliffX,
        targetX,
        boulders,
        state: 'ready', // 'ready' | 'active' | 'cleared'
        triggerDistanceZ: options.triggerDistanceZ ?? DESTRUCTIBLE_CONSTANTS.ROCKSLIDE.TRIGGER_DISTANCE_Z,
    };
}

/**
 * Evaluates craft proximity to trigger rockslides.
 */
export function checkRockslideTrigger(rockslide, craftPositions = []) {
    if (rockslide.state !== 'ready') return false;

    for (const craft of craftPositions) {
        const p = craft.position || craft;
        // Raft travels downriver (-Z direction, e.g. from 0 towards -1500).
        // Raft is upriver of rockslide when p.z > rockslide.z (e.g. p.z = -100, rockslide.z = -130).
        const dz = p.z - rockslide.z;
        if (dz > 0 && dz <= rockslide.triggerDistanceZ) {
            rockslide.state = 'active';
            for (let i = 0; i < rockslide.boulders.length; i++) {
                const b = rockslide.boulders[i];
                b.state = 'rolling';
                const dirSign = rockslide.cliffSide === 'left' ? 1 : -1;
                b.vx = dirSign * (DESTRUCTIBLE_CONSTANTS.ROCKSLIDE.ROLL_SPEED * (0.7 + i * 0.12));
                b.vy = -8.0;
                b.vz = (i - 2) * 1.5;
                b.rotSpeed = 6.0 + i * 1.5;
            }
            return true;
        }
    }
    return false;
}

/**
 * Updates rolling boulders along canyon slope into the riverbed.
 */
export function stepRockslideBoulders(rockslide, dt) {
    const shatteredDebris = [];
    if (rockslide.state !== 'active') return { allResting: rockslide.state === 'cleared', shatteredDebris };

    let activeCount = 0;
    const waterY = DESTRUCTIBLE_CONSTANTS.DEBRIS.WATER_SURFACE_Y;

    for (let i = 0; i < rockslide.boulders.length; i++) {
        const b = rockslide.boulders[i];
        if (b.state === 'rolling') {
            activeCount++;
            // Downhill gravity & trajectory
            b.vy -= DESTRUCTIBLE_CONSTANTS.DEBRIS.GRAVITY * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.z += b.vz * dt;

            // Splash into riverbed
            if (b.y <= waterY + b.radius) {
                b.y = waterY + b.radius;
                b.vy = 0;
                b.vx *= 0.45; // heavy hydrodynamic braking
                b.vz *= 0.45;

                // Rest or break into stone chunks
                if (Math.abs(b.vx) < 0.8) {
                    b.state = 'resting';
                }
            }
        }
    }

    if (activeCount === 0) {
        rockslide.state = 'cleared';
    }

    return { allResting: activeCount === 0, shatteredDebris };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Floating Physics Debris Chunks Simulation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spawns floating debris chunks from a destroyed object.
 */
export function spawnDebrisFromDestruction({
    type = 'wood_chunk',
    origin,
    count = 8,
    sourceImpulse = 15.0,
    spreadRadius = 3.0,
    sourceDirection = { x: 0, y: 0.5, z: -1 },
}) {
    const debris = [];
    const len = Math.hypot(sourceDirection.x, sourceDirection.y, sourceDirection.z) || 1;
    const fwdX = sourceDirection.x / len;
    const fwdY = sourceDirection.y / len;
    const fwdZ = sourceDirection.z / len;

    for (let i = 0; i < count; i++) {
        // Pseudo-deterministic spread cone based on index
        const angle = (i / count) * Math.PI * 2;
        const radialSpeed = 3.0 + ((i * 13) % 7);
        const upSpeed = 4.0 + ((i * 17) % 6);

        debris.push({
            id: `debris_${type}_${i}_${Math.floor(origin.x * 10)}_${Math.floor(origin.z * 10)}_${Date.now ? Date.now() : i}`,
            type, // 'wood_chunk' | 'bridge_plank' | 'stone_chunk'
            x: origin.x + Math.cos(angle) * (spreadRadius * 0.4),
            y: origin.y + ((i * 7) % 10) * 0.1,
            z: origin.z + Math.sin(angle) * (spreadRadius * 0.4),
            vx: Math.cos(angle) * radialSpeed + fwdX * sourceImpulse * 0.5,
            vy: upSpeed + fwdY * sourceImpulse * 0.3,
            vz: Math.sin(angle) * radialSpeed + fwdZ * sourceImpulse * 0.5,
            rotation: {
                x: ((i * 23) % 100) / 100 * Math.PI * 2,
                y: ((i * 31) % 100) / 100 * Math.PI * 2,
                z: ((i * 47) % 100) / 100 * Math.PI * 2,
            },
            rotVelocity: {
                x: 2.0 + ((i * 11) % 5),
                y: 1.5 + ((i * 19) % 6),
                z: 2.5 + ((i * 7) % 4),
            },
            scale: 0.6 + ((i * 13) % 8) * 0.1,
            lifetime: DESTRUCTIBLE_CONSTANTS.DEBRIS.DEFAULT_LIFETIME_S,
            age: 0,
            onWater: false,
            bobOffset: i * 0.7,
        });
    }

    return debris;
}

/**
 * Steps physics for an array of floating debris chunks.
 * Simulates ballistic arc, buoyant surface collision, river drift, and bobbing.
 */
export function stepDebrisChunks(debrisList, dt, time = 0) {
    const C = DESTRUCTIBLE_CONSTANTS.DEBRIS;
    const aliveDebris = [];

    for (let i = 0; i < debrisList.length; i++) {
        const d = debrisList[i];
        d.age += dt;
        if (d.age >= d.lifetime) continue; // expired

        // Rotation integration
        d.rotation.x += d.rotVelocity.x * dt;
        d.rotation.y += d.rotVelocity.y * dt;
        d.rotation.z += d.rotVelocity.z * dt;

        if (d.y > C.WATER_SURFACE_Y) {
            // In the air: ballistic gravity
            d.vy -= C.GRAVITY * dt;
            d.vx *= Math.exp(-C.AIR_DRAG * dt);
            d.vz *= Math.exp(-C.AIR_DRAG * dt);
            d.onWater = false;
        } else {
            // Floating on water surface: buoyancy and drag
            d.onWater = true;
            // Buoyant restorative force pushes up to water surface
            const depth = C.WATER_SURFACE_Y - d.y;
            d.vy += (depth * C.BUOYANCY_ACCEL - d.vy * 4.0) * dt;

            // River current drift downstream (-Z)
            d.vz += (C.CURRENT_DRIFT_SPEED_Z - d.vz) * (C.WATER_DRAG * dt);
            d.vx *= Math.exp(-C.WATER_DRAG * dt);
            d.rotVelocity.x *= 0.92;
            d.rotVelocity.z *= 0.92;

            // Wave bobbing
            d.y = C.WATER_SURFACE_Y + Math.sin(time * C.BOB_FREQUENCY + d.bobOffset) * C.BOB_AMPLITUDE;
        }

        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;

        aliveDebris.push(d);
    }

    return aliveDebris;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Heavy Combat & Boss Smash Interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates a player melee weapon swing (e.g. War-Mallet or Squeaky Hammer)
 * against all active barricades, bridges, or boulders in range.
 */
export function evaluateWarMalletSmash(attacker, destructibles, options = {}) {
    const isUpgraded = options.hasWeaponUpgrade ?? (attacker.upgrades?.includes('weapon') || false);
    const damage = isUpgraded
        ? DESTRUCTIBLE_CONSTANTS.COMBAT.MALLET_UPGRADED_DAMAGE
        : DESTRUCTIBLE_CONSTANTS.COMBAT.MALLET_BASE_DAMAGE;
    const impulse = DESTRUCTIBLE_CONSTANTS.COMBAT.MALLET_SMASH_IMPULSE * (isUpgraded ? 1.5 : 1.0);
    const reach = options.reach ?? 4.5;

    const hits = [];
    const newDebris = [];

    const p = attacker.position || attacker;

    // 1. Check Barricades
    for (const b of (destructibles.barricades || [])) {
        if (b.state === 'broken') continue;
        const dx = b.x - p.x;
        const dz = b.z - p.z;
        const dist = Math.hypot(dx, dz);

        if (dist <= b.collisionRadius + reach) {
            const hitRes = damageBarricade(b, damage, 'warMallet', { x: b.x, y: b.y, z: b.z }, impulse);
            hits.push({
                targetId: b.id,
                targetType: 'barricade',
                damage,
                destroyed: hitRes.destroyed,
                debrisCount: hitRes.debris.length,
            });
            if (hitRes.debris.length > 0) {
                newDebris.push(...hitRes.debris);
            }
        }
    }

    // 2. Check Suspension Bridge Anchors
    for (const bridge of (destructibles.bridges || [])) {
        if (bridge.state !== 'standing') continue;
        // Anchors are at left/right edges of river (x = +/- width/2)
        const halfW = bridge.width * 0.5;
        const distLeft = Math.hypot(p.x - (-halfW), p.z - bridge.z);
        const distRight = Math.hypot(p.x - halfW, p.z - bridge.z);

        if (distLeft <= reach + 2.0) {
            const res = damageBridgeAnchor(bridge, 'left', damage, 'warMallet');
            hits.push({ targetId: bridge.id, targetType: 'bridge', side: 'left', collapsed: res.collapsed });
        } else if (distRight <= reach + 2.0) {
            const res = damageBridgeAnchor(bridge, 'right', damage, 'warMallet');
            hits.push({ targetId: bridge.id, targetType: 'bridge', side: 'right', collapsed: res.collapsed });
        }
    }

    // 3. Check Rockslide Boulders
    for (const rs of (destructibles.rockslides || [])) {
        for (const boulder of rs.boulders) {
            if (boulder.state === 'shattered') continue;
            const dist = Math.hypot(p.x - boulder.x, p.z - boulder.z);
            if (dist <= boulder.radius + reach) {
                boulder.hp -= damage;
                if (boulder.hp <= 0) {
                    boulder.state = 'shattered';
                    const debris = spawnDebrisFromDestruction({
                        type: 'stone_chunk',
                        origin: { x: boulder.x, y: boulder.y, z: boulder.z },
                        count: 6,
                        sourceImpulse: impulse,
                        spreadRadius: 2.0,
                    });
                    newDebris.push(...debris);
                    hits.push({ targetId: boulder.id, targetType: 'boulder', destroyed: true });
                } else {
                    hits.push({ targetId: boulder.id, targetType: 'boulder', destroyed: false, hp: boulder.hp });
                }
            }
        }
    }

    return { hits, newDebris };
}

/**
 * Evaluates a charging Long Worm boss smash against destructible obstacles.
 * A charging worm obliterates wooden barricades and boulders in its path,
 * launching physics debris chunks at high velocity.
 */
export function evaluateLongWormChargeSmash(longWorm, destructibles) {
    const hits = [];
    const newDebris = [];

    // Worm must be alive and actively charging
    if (!longWorm || longWorm.health <= 0 || longWorm.state !== 'charging') {
        return { hits, newDebris };
    }

    const wormPos = longWorm.position;
    const hitRadius = DESTRUCTIBLE_CONSTANTS.COMBAT.LONG_WORM_HIT_RADIUS;
    const impulse = DESTRUCTIBLE_CONSTANTS.COMBAT.LONG_WORM_SMASH_IMPULSE;
    const dmg = DESTRUCTIBLE_CONSTANTS.COMBAT.LONG_WORM_CHARGE_DAMAGE;

    // 1. Smash wooden barricades
    for (const b of (destructibles.barricades || [])) {
        if (b.state === 'broken') continue;
        const col = checkBarricadeCollision(wormPos, hitRadius, b);
        if (col.collides) {
            const hitRes = damageBarricade(b, dmg, 'longWorm', wormPos, impulse);
            hits.push({
                targetId: b.id,
                targetType: 'barricade',
                destroyed: hitRes.destroyed,
                smashedByBoss: true,
            });
            if (hitRes.debris.length > 0) {
                newDebris.push(...hitRes.debris);
            }
        }
    }

    // 2. Smash suspension bridges if passing under/through
    for (const bridge of (destructibles.bridges || [])) {
        if (bridge.state === 'standing' && Math.abs(wormPos.z - bridge.z) < hitRadius) {
            const res = damageBridgeAnchor(bridge, 'both', dmg, 'longWorm');
            hits.push({
                targetId: bridge.id,
                targetType: 'bridge',
                collapsed: res.collapsed,
                smashedByBoss: true,
            });
        }
    }

    // 3. Smash rolling boulders
    for (const rs of (destructibles.rockslides || [])) {
        for (const boulder of rs.boulders) {
            if (boulder.state === 'shattered') continue;
            const dist = Math.hypot(wormPos.x - boulder.x, wormPos.z - boulder.z);
            if (dist <= boulder.radius + hitRadius) {
                boulder.state = 'shattered';
                const debris = spawnDebrisFromDestruction({
                    type: 'stone_chunk',
                    origin: { x: boulder.x, y: boulder.y, z: boulder.z },
                    count: 8,
                    sourceImpulse: impulse * 1.2,
                    spreadRadius: 3.5,
                });
                newDebris.push(...debris);
                hits.push({ targetId: boulder.id, targetType: 'boulder', destroyed: true, smashedByBoss: true });
            }
        }
    }

    return { hits, newDebris };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Unified Layout Generation & Full Simulation Step
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministically generates an arrangement of destructible barricades,
 * falling suspension bridges, and rockslide hazards across the river course.
 */
export function generateDestructiblesLayout(seed = 42, finishZ = -1500, riverWidth = 30) {
    const rng = createRng(seed);
    const halfWidth = riverWidth * 0.5 - 3.0;

    const barricades = [];
    const bridges = [];
    const rockslides = [];

    let currentZ = -120;
    let index = 0;

    while (currentZ > finishZ + 80) {
        index++;
        const roll = rng();

        // 1. Wooden River Barricades (45% probability)
        if (roll < 0.45) {
            const bWidth = 10.0 + rng() * 6.0;
            const bX = (rng() - 0.5) * (halfWidth * 0.8);
            barricades.push(createBarricade(`barricade_${index}`, bX, currentZ, {
                width: bWidth,
                hp: 60 + Math.floor(rng() * 30),
            }));
            currentZ -= 70 + rng() * 20;
            continue;
        }

        // 2. Falling Suspension Bridges (30% probability)
        if (roll < 0.75) {
            bridges.push(createSuspensionBridge(`bridge_${index}`, currentZ, {
                width: riverWidth + 6.0,
                anchorHp: 70 + Math.floor(rng() * 30),
            }));
            currentZ -= 90 + rng() * 30;
            continue;
        }

        // 3. Canyon Rockslide Hazard (25% probability)
        const cliffSide = rng() > 0.5 ? 'left' : 'right';
        rockslides.push(createRockslideHazard(`rockslide_${index}`, currentZ, cliffSide, {
            boulderCount: 4 + Math.floor(rng() * 3),
        }));
        currentZ -= 80 + rng() * 25;
    }

    return {
        barricades,
        bridges,
        rockslides,
        debris: [],
    };
}

/**
 * Steps the full destructibles simulation over dt:
 * updates bridge collapses, rockslides, and debris chunks.
 */
export function stepDestructiblesSimulation(destructiblesState, craftPositions = [], dt = 0.05, time = 0) {
    const events = [];

    // 1. Update collapsing bridges
    for (const bridge of destructiblesState.bridges || []) {
        if (bridge.state === 'collapsing') {
            const res = stepBridgeCollapse(bridge, dt);
            if (res.completed && res.splashDebris.length > 0) {
                destructiblesState.debris.push(...res.splashDebris);
                events.push({
                    type: 'bridgeCollapsed',
                    bridgeId: bridge.id,
                    splashDebrisCount: res.splashDebris.length,
                });
            }
        }
    }

    // 2. Check and step rockslide hazards
    for (const rs of destructiblesState.rockslides || []) {
        if (rs.state === 'ready') {
            const triggered = checkRockslideTrigger(rs, craftPositions);
            if (triggered) {
                events.push({
                    type: 'rockslideTriggered',
                    rockslideId: rs.id,
                    cliffSide: rs.cliffSide,
                });
            }
        }
        if (rs.state === 'active') {
            const res = stepRockslideBoulders(rs, dt);
            if (res.allResting) {
                events.push({
                    type: 'rockslideCleared',
                    rockslideId: rs.id,
                });
            }
        }
    }

    // 3. Step floating physics debris chunks
    if (destructiblesState.debris && destructiblesState.debris.length > 0) {
        destructiblesState.debris = stepDebrisChunks(destructiblesState.debris, dt, time);
    }

    return { events, activeDebrisCount: destructiblesState.debris.length };
}
