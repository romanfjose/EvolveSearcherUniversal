/**
 * Don't Sink, Don't Die — Final Boss Encounter Module:
 * "The Dread Kraken of the River Mouth"
 *
 * Deterministic 3-Phase State Machine for authoritative server / loopback simulation.
 * Zero external dependencies. Time advances strictly through tickKraken(state, dt).
 */

export const KRAKEN_SPAWN_Z = -1350;
export const KRAKEN_ARENA_Z_MIN = -1450;
export const KRAKEN_ARENA_Z_MAX = -1250;
export const KRAKEN_ARENA_RADIUS = 36;

export const KRAKEN_CONFIG = {
    name: 'The Dread Kraken of the River Mouth',
    spawnZ: KRAKEN_SPAWN_Z,
    homePosition: { x: 0, y: -2, z: KRAKEN_SPAWN_Z },
    maxHealth: 1500,
    tentacleCount: 4,
    tentacleJointCount: 8,
    // Phase thresholds (% of max HP)
    phaseThresholds: {
        phase1: 1.0,  // 1500 -> 1000 (100% - 66.7%)
        phase2: 0.6667, // 1000 -> 500 (66.7% - 33.3%)
        phase3: 0.3333, // 500 -> 0 (33.3% - 0%)
    },
    // Phase 1: Tentacle Slams & Telegraph Warning Rings
    phase1: {
        slamInterval: 3.5, // seconds between slams
        slamTelegraphDuration: 1.5, // warning ring duration before slam lands
        slamDamage: 35,
        slamRadius: 5.5,
    },
    // Phase 2: Ink Cloud Blind Wave + Whirlpool Suction Pull + Glowing Barnacle Weak-points
    phase2: {
        inkWaveInterval: 8.0,
        inkBlindDuration: 4.0,
        whirlpoolSuctionStrength: 18.0,
        whirlpoolRadius: 28.0,
        whirlpoolCenter: { x: 0, z: KRAKEN_SPAWN_Z },
        barnacleCount: 4,
        barnacleHp: 80,
        barnacleStunDuration: 4.5,
    },
    // Phase 3: Frenzied Sweeping Barrage & Coin Fountain Drop
    phase3: {
        sweepInterval: 2.2,
        sweepTelegraphDuration: 0.9,
        sweepDamage: 45,
        sweepArcAngle: Math.PI * 0.75, // sweeping arc
        sweepRadius: 18.0,
        coinFountainCount: 150,
        coinFountainTotalValue: 500,
    },
};

/**
 * Deterministic mulberry32 PRNG generator
 */
export function createRng(seed = 1) {
    let a = seed >>> 0;
    return function mulberry32() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Helper to clamp values in [min, max]
 */
export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

/**
 * Create fresh tentacle state
 */
export function createTentacleState(id, index, krakenPos) {
    const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
    const baseOffset = {
        x: Math.cos(angle) * 7.5,
        y: 0,
        z: Math.sin(angle) * 7.5,
    };
    return {
        id: `tentacle_${id}`,
        index,
        basePos: {
            x: krakenPos.x + baseOffset.x,
            y: krakenPos.y,
            z: krakenPos.z + baseOffset.z,
        },
        tipPos: {
            x: krakenPos.x + baseOffset.x * 1.5,
            y: 0,
            z: krakenPos.z + baseOffset.z * 1.5,
        },
        state: 'submerged', // 'submerged', 'telegraphing', 'slamming', 'sweeping', 'coiling', 'idle'
        slamTarget: null,
        slamProgress: 0,
        sweepAngle: 0,
        sweepDirection: 1,
        curlFactor: 0,
        jointAngles: new Array(KRAKEN_CONFIG.tentacleJointCount).fill(0),
    };
}

/**
 * Create fresh glowing barnacle weak-point state
 */
export function createBarnacles(krakenPos) {
    const barnacles = [];
    const offsets = [
        { name: 'Mantle Crest', x: 0, y: 3.5, z: 1.2 },
        { name: 'Left Temporal', x: -2.2, y: 1.8, z: 0.5 },
        { name: 'Right Temporal', x: 2.2, y: 1.8, z: 0.5 },
        { name: 'Beak Underbelly', x: 0, y: -0.5, z: 2.8 },
    ];
    for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i];
        barnacles.push({
            id: `barnacle_${i}`,
            name: off.name,
            relativePos: { x: off.x, y: off.y, z: off.z },
            worldPos: {
                x: krakenPos.x + off.x,
                y: krakenPos.y + off.y,
                z: krakenPos.z + off.z,
            },
            maxHealth: KRAKEN_CONFIG.phase2.barnacleHp,
            health: KRAKEN_CONFIG.phase2.barnacleHp,
            active: false,
            destroyed: false,
            glowingIntensity: 0.0,
        });
    }
    return barnacles;
}

/**
 * Initialize complete Kraken encounter state
 */
export function createKrakenState({ seed = 1337, customMaxHp = null } = {}) {
    const rng = createRng(seed);
    const maxHp = customMaxHp || KRAKEN_CONFIG.maxHealth;
    const pos = { ...KRAKEN_CONFIG.homePosition };

    const tentacles = [];
    for (let i = 0; i < KRAKEN_CONFIG.tentacleCount; i++) {
        tentacles.push(createTentacleState(i, i, pos));
    }

    const barnacles = createBarnacles(pos);

    return {
        id: 'boss_kraken',
        name: KRAKEN_CONFIG.name,
        seed,
        rng,
        time: 0,
        tickCount: 0,
        isSpawned: false,
        isDefeated: false,
        phase: 1, // 1, 2, or 3
        maxHealth: maxHp,
        health: maxHp,
        position: pos,
        velocity: { x: 0, y: 0, z: 0 },
        headBobOffset: 0,
        eyeGlow: 1.0,
        beakSnap: 0,

        // Status effects & timers
        isStunned: false,
        stunTimer: 0,
        stunCount: 0,

        // Phase 1 specifics
        slamCooldown: 1.0,
        telegraphRings: [], // array of { id, position, radius, maxRadius, duration, elapsed, tentacleIndex, damage }

        // Phase 2 specifics
        inkWaveTimer: 3.0,
        isInkCloudActive: false,
        inkCloudElapsed: 0,
        inkCloudDuration: KRAKEN_CONFIG.phase2.inkBlindDuration,
        whirlpoolActive: false,
        whirlpoolStrength: 0,
        barnacles,

        // Phase 3 specifics
        sweepTimer: 1.5,
        isFrenzyActive: false,
        frenzyMultiplier: 1.4,

        // Defeat & rewards
        deathTimer: 0,
        coinDrops: [], // array of { id, position, velocity, value, lifetime }

        // Articulated tentacles
        tentacles,
    };
}

/**
 * Check if the Kraken should spawn based on raft lead Z coordinate
 */
export function shouldKrakenSpawn(leadRaftZ, encounterZ = KRAKEN_SPAWN_Z, triggerDistance = 90) {
    return leadRaftZ <= (encounterZ + triggerDistance);
}

/**
 * Spawns the Kraken if not already spawned
 */
export function spawnKraken(krakenState) {
    if (krakenState.isSpawned) return [];
    krakenState.isSpawned = true;
    krakenState.phase = 1;
    krakenState.health = krakenState.maxHealth;
    return [{
        event: 'kraken:spawned',
        data: {
            id: krakenState.id,
            name: krakenState.name,
            position: krakenState.position,
            maxHealth: krakenState.maxHealth,
            phase: krakenState.phase,
        },
    }];
}

/**
 * Calculate whirlpool suction force vector for a given raft position in Phase 2
 */
export function calculateWhirlpoolSuction(raftPos, krakenState) {
    if (!krakenState.isSpawned || krakenState.phase !== 2 || !krakenState.whirlpoolActive || krakenState.isStunned) {
        return { x: 0, y: 0, z: 0, distance: 0, inRange: false };
    }

    const center = KRAKEN_CONFIG.phase2.whirlpoolCenter;
    const dx = center.x - raftPos.x;
    const dz = center.z - raftPos.z;
    const dist = Math.hypot(dx, dz);
    const maxR = KRAKEN_CONFIG.phase2.whirlpoolRadius;

    if (dist > maxR || dist < 0.001) {
        return { x: 0, y: 0, z: 0, distance: dist, inRange: false };
    }

    // Suction increases as you get closer to vortex core + tangential rotational pull
    const normFactor = 1.0 - (dist / maxR);
    const radialMag = KRAKEN_CONFIG.phase2.whirlpoolSuctionStrength * normFactor;
    const nx = dx / dist;
    const nz = dz / dist;

    // Tangential spiral (counter-clockwise)
    const tx = -nz;
    const tz = nx;
    const tangMag = radialMag * 0.75;

    return {
        x: nx * radialMag + tx * tangMag,
        y: -1.5 * normFactor, // downward drag
        z: nz * radialMag + tz * tangMag,
        distance: dist,
        inRange: true,
    };
}

/**
 * Applies damage to the Kraken or one of its weak-points
 */
export function damageKraken(krakenState, damage, hitTarget = null) {
    if (!krakenState.isSpawned || krakenState.isDefeated) {
        return { damageDealt: 0, stunTriggered: false, phaseChanged: false, events: [] };
    }

    const events = [];
    let damageDealt = 0;
    let stunTriggered = false;
    let phaseChanged = false;

    // Check if hitting a barnacle weak-point in Phase 2
    if (krakenState.phase === 2 && hitTarget && hitTarget.startsWith('barnacle_')) {
        const barnacle = krakenState.barnacles.find((b) => b.id === hitTarget);
        if (barnacle && barnacle.active && !barnacle.destroyed) {
            const actualDamage = Math.min(barnacle.health, damage);
            barnacle.health -= actualDamage;
            damageDealt = actualDamage;
            // Also damage boss main health pool (bonus critical damage)
            krakenState.health = Math.max(0, krakenState.health - actualDamage * 1.5);

            events.push({
                event: 'kraken:barnacle_hit',
                data: { barnacleId: barnacle.id, remainingHp: barnacle.health, critical: true },
            });

            if (barnacle.health <= 0) {
                barnacle.destroyed = true;
                barnacle.active = false;
                barnacle.glowingIntensity = 0.0;
                // Stun the Kraken!
                krakenState.isStunned = true;
                krakenState.stunTimer = KRAKEN_CONFIG.phase2.barnacleStunDuration;
                krakenState.stunCount++;
                stunTriggered = true;

                events.push({
                    event: 'kraken:stunned',
                    data: {
                        duration: krakenState.stunTimer,
                        stunCount: krakenState.stunCount,
                        source: barnacle.id,
                    },
                });
            }
        }
    } else {
        // Direct body hit
        // In Phase 2, if barnacles are active and kraken is not stunned, Kraken body has 50% armored resistance
        const effectiveDamage = (krakenState.phase === 2 && !krakenState.isStunned)
            ? damage * 0.5
            : damage;

        damageDealt = Math.min(krakenState.health, effectiveDamage);
        krakenState.health = Math.max(0, krakenState.health - damageDealt);

        events.push({
            event: 'kraken:damaged',
            data: { damageDealt, health: krakenState.health, maxHealth: krakenState.maxHealth },
        });
    }

    // Evaluate Phase Transitions
    const hpFraction = krakenState.health / krakenState.maxHealth;

    if (krakenState.health <= 0 && !krakenState.isDefeated) {
        krakenState.isDefeated = true;
        krakenState.phase = 3;
        events.push(...triggerKrakenDefeat(krakenState));
    } else if (krakenState.phase === 1 && hpFraction <= KRAKEN_CONFIG.phaseThresholds.phase2) {
        krakenState.phase = 2;
        phaseChanged = true;
        krakenState.whirlpoolActive = true;
        // Activate barnacles
        krakenState.barnacles.forEach((b) => {
            if (!b.destroyed) {
                b.active = true;
                b.glowingIntensity = 1.0;
            }
        });
        events.push({
            event: 'kraken:phase_change',
            data: {
                phase: 2,
                title: 'Phase II: Abyssal Maelstrom & Ink Fog',
                barnacles: krakenState.barnacles.map((b) => ({ id: b.id, name: b.name })),
            },
        });
    } else if (krakenState.phase === 2 && hpFraction <= KRAKEN_CONFIG.phaseThresholds.phase3) {
        krakenState.phase = 3;
        phaseChanged = true;
        krakenState.whirlpoolActive = false;
        krakenState.isFrenzyActive = true;
        krakenState.isStunned = false; // Frenzy breaks any active stun
        krakenState.stunTimer = 0;
        // Deactivate remaining barnacles
        krakenState.barnacles.forEach((b) => { b.active = false; });
        events.push({
            event: 'kraken:phase_change',
            data: {
                phase: 3,
                title: 'Phase III: Frenzied Sweeping Barrage',
            },
        });
    }

    return { damageDealt, stunTriggered, phaseChanged, events };
}

/**
 * Triggers the final Kraken defeat & massive coin fountain drop
 */
export function triggerKrakenDefeat(krakenState) {
    krakenState.isDefeated = true;
    krakenState.telegraphRings = [];
    krakenState.whirlpoolActive = false;
    krakenState.isInkCloudActive = false;

    // Generate massive coin fountain drop
    const drops = [];
    const count = KRAKEN_CONFIG.phase3.coinFountainCount;
    const valuePerCoin = Math.max(1, Math.floor(KRAKEN_CONFIG.phase3.coinFountainTotalValue / count));

    for (let i = 0; i < count; i++) {
        const u = krakenState.rng();
        const v = krakenState.rng();
        const theta = u * 2.0 * Math.PI;
        const speed = 4.0 + v * 12.0;
        const upwardSpeed = 8.0 + krakenState.rng() * 14.0;

        drops.push({
            id: `kraken_coin_${i}`,
            position: {
                x: krakenState.position.x + (krakenState.rng() - 0.5) * 4.0,
                y: krakenState.position.y + 4.0,
                z: krakenState.position.z + (krakenState.rng() - 0.5) * 4.0,
            },
            velocity: {
                x: Math.cos(theta) * speed,
                y: upwardSpeed,
                z: Math.sin(theta) * speed,
            },
            value: valuePerCoin,
            lifetime: 20.0, // persists for 20 seconds
        });
    }

    krakenState.coinDrops = drops;

    return [
        {
            event: 'kraken:defeated',
            data: {
                bossId: krakenState.id,
                totalCoins: count * valuePerCoin,
                coinCount: count,
                dropCount: drops.length,
            },
        },
    ];
}

/**
 * Update tick for Kraken state machine (deterministic simulation)
 */
export function tickKraken(krakenState, dt, targetPlayers = []) {
    if (!krakenState.isSpawned) return [];

    const events = [];
    krakenState.time += dt;
    krakenState.tickCount++;

    // Head bobbing & eye bioluminescence
    krakenState.headBobOffset = Math.sin(krakenState.time * 1.8) * 0.6;
    krakenState.eyeGlow = 0.75 + Math.sin(krakenState.time * 3.5) * 0.25;

    // Handle Defeat state animation & coin fountain physics
    if (krakenState.isDefeated) {
        krakenState.deathTimer += dt;
        // Boss slowly sinks down into the depths
        krakenState.position.y = Math.max(-25, krakenState.position.y - dt * 2.5);

        // Update coin fountain trajectories
        for (let i = 0; i < krakenState.coinDrops.length; i++) {
            const coin = krakenState.coinDrops[i];
            coin.position.x += coin.velocity.x * dt;
            coin.position.y += coin.velocity.y * dt;
            coin.position.z += coin.velocity.z * dt;
            // Gravity
            coin.velocity.y -= 25.0 * dt;
            // Water surface bounce/float
            if (coin.position.y <= 0) {
                coin.position.y = 0;
                coin.velocity.x *= 0.9;
                coin.velocity.z *= 0.9;
                coin.velocity.y = 0;
            }
            coin.lifetime -= dt;
        }
        krakenState.coinDrops = krakenState.coinDrops.filter((c) => c.lifetime > 0);
        return events;
    }

    // Handle Stun logic
    if (krakenState.isStunned) {
        krakenState.stunTimer -= dt;
        if (krakenState.stunTimer <= 0) {
            krakenState.isStunned = false;
            krakenState.stunTimer = 0;
            events.push({
                event: 'kraken:stun_recovered',
                data: { bossId: krakenState.id },
            });
        } else {
            // While stunned, attacks & whirlpool are paused
            krakenState.whirlpoolActive = false;
            return events;
        }
    }

    // Update active warning telegraph rings
    for (let i = krakenState.telegraphRings.length - 1; i >= 0; i--) {
        const ring = krakenState.telegraphRings[i];
        ring.elapsed += dt;
        const progress = ring.elapsed / ring.duration;
        ring.currentRadius = ring.maxRadius * clamp(progress, 0, 1);

        // When telegraph ring expires, trigger slam/sweep hit resolution
        if (ring.elapsed >= ring.duration) {
            const hitPlayers = [];
            for (const player of targetPlayers) {
                if (player.isDead) continue;
                const d = Math.hypot(player.position.x - ring.position.x, player.position.z - ring.position.z);
                if (d <= ring.maxRadius) {
                    hitPlayers.push({
                        id: player.id,
                        damage: ring.damage,
                        distance: d,
                    });
                }
            }

            events.push({
                event: 'kraken:telegraph_landed',
                data: {
                    ringId: ring.id,
                    tentacleIndex: ring.tentacleIndex,
                    position: ring.position,
                    radius: ring.maxRadius,
                    hitPlayers,
                },
            });

            // Set tentacle state to slamming / recovering
            const tentacle = krakenState.tentacles[ring.tentacleIndex];
            if (tentacle) {
                tentacle.state = 'slamming';
                tentacle.slamProgress = 1.0;
            }

            krakenState.telegraphRings.splice(i, 1);
        }
    }

    // Tentacle kinematics update
    for (const tentacle of krakenState.tentacles) {
        if (tentacle.state === 'slamming') {
            tentacle.slamProgress -= dt * 2.0;
            if (tentacle.slamProgress <= 0) {
                tentacle.state = 'idle';
                tentacle.slamProgress = 0;
            }
        }
        // Sinusoidal joint waving
        for (let j = 0; j < tentacle.jointAngles.length; j++) {
            const freq = 1.5 + j * 0.4;
            const phase = krakenState.time * freq + tentacle.index * 1.57;
            tentacle.jointAngles[j] = Math.sin(phase) * (0.15 + j * 0.05);
        }
    }

    // ──────────────── PHASE 1 LOGIC ────────────────
    if (krakenState.phase === 1) {
        krakenState.slamCooldown -= dt;
        if (krakenState.slamCooldown <= 0) {
            krakenState.slamCooldown = KRAKEN_CONFIG.phase1.slamInterval;

            // Pick 1 or 2 tentacles to slam
            const tentacleIdx = Math.floor(krakenState.rng() * 4);
            const tentacle = krakenState.tentacles[tentacleIdx];

            // Target nearest player or random position around arena
            let targetX = (krakenState.rng() - 0.5) * 22;
            let targetZ = KRAKEN_SPAWN_Z + (krakenState.rng() - 0.5) * 30;

            if (targetPlayers.length > 0) {
                const livePlayers = targetPlayers.filter((p) => !p.isDead);
                if (livePlayers.length > 0) {
                    const chosen = livePlayers[Math.floor(krakenState.rng() * livePlayers.length)];
                    targetX = clamp(chosen.position.x + (krakenState.rng() - 0.5) * 4, -13, 13);
                    targetZ = clamp(chosen.position.z + (krakenState.rng() - 0.5) * 4, KRAKEN_ARENA_Z_MIN, KRAKEN_ARENA_Z_MAX);
                }
            }

            const ringId = `slam_ring_${krakenState.tickCount}_${tentacleIdx}`;
            const ring = {
                id: ringId,
                position: { x: targetX, y: 0.1, z: targetZ },
                maxRadius: KRAKEN_CONFIG.phase1.slamRadius,
                currentRadius: 0.5,
                duration: KRAKEN_CONFIG.phase1.slamTelegraphDuration,
                elapsed: 0,
                tentacleIndex: tentacleIdx,
                damage: KRAKEN_CONFIG.phase1.slamDamage,
            };

            krakenState.telegraphRings.push(ring);
            tentacle.state = 'telegraphing';
            tentacle.slamTarget = ring.position;

            events.push({
                event: 'kraken:slam_telegraph_start',
                data: {
                    ringId: ring.id,
                    tentacleIndex: tentacleIdx,
                    position: ring.position,
                    radius: ring.maxRadius,
                    duration: ring.duration,
                },
            });
        }
    }

    // ──────────────── PHASE 2 LOGIC ────────────────
    else if (krakenState.phase === 2) {
        krakenState.whirlpoolActive = true;
        krakenState.whirlpoolStrength = 1.0;

        // Periodic Ink-cloud Blind Wave
        krakenState.inkWaveTimer -= dt;
        if (krakenState.inkWaveTimer <= 0) {
            krakenState.inkWaveTimer = KRAKEN_CONFIG.phase2.inkWaveInterval;
            krakenState.isInkCloudActive = true;
            krakenState.inkCloudElapsed = 0;

            events.push({
                event: 'kraken:ink_cloud_wave',
                data: {
                    duration: krakenState.inkCloudDuration,
                    blindIntensity: 0.85,
                    position: krakenState.position,
                },
            });
        }

        if (krakenState.isInkCloudActive) {
            krakenState.inkCloudElapsed += dt;
            if (krakenState.inkCloudElapsed >= krakenState.inkCloudDuration) {
                krakenState.isInkCloudActive = false;
                events.push({
                    event: 'kraken:ink_cloud_cleared',
                    data: { bossId: krakenState.id },
                });
            }
        }

        // Tentacle slams continue during Phase 2 (faster interval)
        krakenState.slamCooldown -= dt;
        if (krakenState.slamCooldown <= 0) {
            krakenState.slamCooldown = KRAKEN_CONFIG.phase1.slamInterval * 0.8;
            const tentacleIdx = Math.floor(krakenState.rng() * 4);
            const tentacle = krakenState.tentacles[tentacleIdx];

            let targetX = (krakenState.rng() - 0.5) * 20;
            let targetZ = KRAKEN_SPAWN_Z + (krakenState.rng() - 0.5) * 25;
            if (targetPlayers.length > 0) {
                const livePlayers = targetPlayers.filter((p) => !p.isDead);
                if (livePlayers.length > 0) {
                    const chosen = livePlayers[Math.floor(krakenState.rng() * livePlayers.length)];
                    targetX = clamp(chosen.position.x, -13, 13);
                    targetZ = clamp(chosen.position.z, KRAKEN_ARENA_Z_MIN, KRAKEN_ARENA_Z_MAX);
                }
            }

            const ring = {
                id: `p2_slam_${krakenState.tickCount}_${tentacleIdx}`,
                position: { x: targetX, y: 0.1, z: targetZ },
                maxRadius: KRAKEN_CONFIG.phase1.slamRadius,
                currentRadius: 0.5,
                duration: KRAKEN_CONFIG.phase1.slamTelegraphDuration * 0.85,
                elapsed: 0,
                tentacleIndex: tentacleIdx,
                damage: KRAKEN_CONFIG.phase1.slamDamage,
            };
            krakenState.telegraphRings.push(ring);
            tentacle.state = 'telegraphing';
            tentacle.slamTarget = ring.position;

            events.push({
                event: 'kraken:slam_telegraph_start',
                data: {
                    ringId: ring.id,
                    tentacleIndex: tentacleIdx,
                    position: ring.position,
                    radius: ring.maxRadius,
                    duration: ring.duration,
                },
            });
        }
    }

    // ──────────────── PHASE 3 LOGIC ────────────────
    else if (krakenState.phase === 3) {
        krakenState.isFrenzyActive = true;
        krakenState.sweepTimer -= dt;

        if (krakenState.sweepTimer <= 0) {
            krakenState.sweepTimer = KRAKEN_CONFIG.phase3.sweepInterval;

            // Pick 2 alternating tentacles for sweeping barrage
            const tentacleIdx1 = Math.floor(krakenState.rng() * 4);
            const tentacleIdx2 = (tentacleIdx1 + 2) % 4;

            for (const tIdx of [tentacleIdx1, tentacleIdx2]) {
                const tentacle = krakenState.tentacles[tIdx];
                const sweepCenterZ = KRAKEN_SPAWN_Z + (tIdx < 2 ? 8 : -8);
                const sweepX = (tIdx % 2 === 0 ? -1 : 1) * 6;

                const ring = {
                    id: `frenzy_sweep_${krakenState.tickCount}_${tIdx}`,
                    position: { x: sweepX, y: 0.1, z: sweepCenterZ },
                    maxRadius: KRAKEN_CONFIG.phase3.sweepRadius * 0.65,
                    currentRadius: 0.5,
                    duration: KRAKEN_CONFIG.phase3.sweepTelegraphDuration,
                    elapsed: 0,
                    tentacleIndex: tIdx,
                    damage: KRAKEN_CONFIG.phase3.sweepDamage,
                };
                krakenState.telegraphRings.push(ring);
                tentacle.state = 'sweeping';
                tentacle.sweepAngle = (krakenState.rng() - 0.5) * Math.PI;

                events.push({
                    event: 'kraken:sweep_telegraph_start',
                    data: {
                        ringId: ring.id,
                        tentacleIndex: tIdx,
                        position: ring.position,
                        radius: ring.maxRadius,
                        duration: ring.duration,
                        damage: ring.damage,
                    },
                });
            }
        }
    }

    return events;
}
