// Co-op raft attachments and tactical gadget system for "Don't Sink, Don't Die".
// Pure and deterministic: handles auto-aiming ballista, shockwave parry bell,
// regenerating nitro hydro-jets, and clockwork pelican repair aura.
// Zero external dependencies.

export const GADGET_TYPES = {
    HARPOON: 'harpoon',
    SHIELD_DOME: 'shield-dome',
    NITRO_KEG: 'nitro-keg',
    REPAIR_DRONE: 'repair-drone',
};

export const GADGET_SLOTS = {
    BOW: 'bow',
    CENTER: 'center',
    STERN: 'stern',
    COMPANION: 'companion',
};

export const GADGET_CONFIGS = {
    [GADGET_TYPES.HARPOON]: {
        id: GADGET_TYPES.HARPOON,
        name: 'Bow Harpoon Ballista',
        slot: GADGET_SLOTS.BOW,
        cost: 35,
        fireIntervalMs: 1800, // fires every 1.8s
        range: 38,
        boltDamage: 28,
        boltSpeed: 45, // m/s
        tetherDurationMs: 1200,
        pullForce: 180, // pull tethered enemy toward raft
        description: 'Bow-mounted auto-aiming Harpoon Ballista that fires tethered bolts at the nearest enemy every 1.8s.',
    },
    [GADGET_TYPES.SHIELD_DOME]: {
        id: GADGET_TYPES.SHIELD_DOME,
        name: 'Arcane Shockwave Bell',
        slot: GADGET_SLOTS.CENTER,
        cost: 40,
        cooldownMs: 8000,
        shockwaveRadius: 10,
        knockbackForce: 350,
        parryWindowMs: 750, // window after activation that nullifies throws and reflects 50% damage
        damage: 15,
        description: 'Arcane Shockwave Bell that parries throws and pushes enemies back on cooldown.',
    },
    [GADGET_TYPES.NITRO_KEG]: {
        id: GADGET_TYPES.NITRO_KEG,
        name: 'Twin Nitro Hydro-Jets',
        slot: GADGET_SLOTS.STERN,
        cost: 30,
        maxFuel: 100,
        burnRatePerSec: 35, // ~2.85s of continuous boost
        regenRatePerSec: 18, // ~5.5s to fully recharge from empty
        thrustBoost: 220, // added thrust force
        topSpeedBonus: 1.45,
        regenDelayMs: 600, // pause before fuel starts recharging after use
        description: 'Twin rear hydro-jet boosters with regenerating fuel gauge.',
    },
    [GADGET_TYPES.REPAIR_DRONE]: {
        id: GADGET_TYPES.REPAIR_DRONE,
        name: 'Clockwork Pelican Lantern',
        slot: GADGET_SLOTS.COMPANION,
        cost: 45,
        auraRadius: 12, // passively heals crewmates within 12m
        healPerSec: 4.5,
        healTickIntervalMs: 500, // tick heal twice per second
        orbitRadius: 2.8,
        orbitSpeedRadPerSec: 1.4,
        hoverHeight: 2.2,
        description: 'Clockwork pelican/lantern companion that passively heals crewmates within 12m.',
    },
};

/**
 * Creates default tactical gadget state for a player raft.
 */
export function createRaftGadgetState() {
    return {
        installed: {}, // { [gadgetId]: { installedAt, active, level } }
        harpoon: {
            lastFireTime: -Infinity,
            activeBolts: [], // array of { id, startPos, targetPos, targetId, t, duration, damage }
            targetId: null,
            aimAngle: 0,
        },
        shieldDome: {
            lastActivatedTime: -Infinity,
            isShockwaveActive: false,
            shockwaveProgress: 0, // 0 to 1
            parryingUntil: -Infinity,
        },
        nitroKeg: {
            fuel: GADGET_CONFIGS[GADGET_TYPES.NITRO_KEG].maxFuel,
            maxFuel: GADGET_CONFIGS[GADGET_TYPES.NITRO_KEG].maxFuel,
            isBoosting: false,
            lastBurnTime: 0,
        },
        repairDrone: {
            orbitAngle: 0,
            lastHealTick: 0,
            beamTargets: [], // player ids currently receiving beam
        },
    };
}

/**
 * Checks if a player can attach or craft a gadget.
 */
export function canInstallGadget(playerState, gadgetState, gadgetId) {
    const config = GADGET_CONFIGS[gadgetId];
    if (!config) return { ok: false, reason: 'unknown-gadget' };
    if (gadgetState.installed[gadgetId]) return { ok: false, reason: 'already-installed' };
    if ((playerState?.coins ?? 0) < config.cost) return { ok: false, reason: 'insufficient-coins' };

    // Check if slot is occupied
    for (const [id] of Object.entries(gadgetState.installed)) {
        if (GADGET_CONFIGS[id]?.slot === config.slot) {
            return { ok: false, reason: 'slot-occupied' };
        }
    }
    return { ok: true, reason: null };
}

/**
 * Installs a gadget into the raft state and deducts cost from player coins.
 */
export function installGadget(playerState, gadgetState, gadgetId, now = 0) {
    const check = canInstallGadget(playerState, gadgetState, gadgetId);
    if (!check.ok) return { success: false, reason: check.reason };

    const config = GADGET_CONFIGS[gadgetId];
    playerState.coins -= config.cost;
    gadgetState.installed[gadgetId] = {
        installedAt: now,
        active: true,
        level: 1,
    };

    return {
        success: true,
        gadgetId,
        slot: config.slot,
        remainingCoins: playerState.coins,
    };
}

/**
 * Uninstalls a gadget and refunds a fraction of the cost.
 */
export function uninstallGadget(playerState, gadgetState, gadgetId, refundRatio = 0.5) {
    if (!gadgetState.installed[gadgetId]) return { success: false, reason: 'not-installed' };
    const config = GADGET_CONFIGS[gadgetId];
    delete gadgetState.installed[gadgetId];
    const refund = Math.floor(config.cost * refundRatio);
    if (playerState) playerState.coins = (playerState.coins || 0) + refund;

    return { success: true, refund };
}

/**
 * Vector distance helper (2D XZ plane)
 */
export function distanceXZ(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Find closest active enemy within range of a raft position.
 */
export function findNearestEnemy(raftPos, enemies, maxRange = Infinity) {
    let nearest = null;
    let minDist = maxRange;

    for (const enemy of Object.values(enemies || {})) {
        if (!enemy || (enemy.health !== undefined && enemy.health <= 0) || enemy.isDead) continue;
        const d = distanceXZ(raftPos, enemy.position);
        if (d < minDist) {
            minDist = d;
            nearest = { enemy, distance: d };
        }
    }
    return nearest;
}

/**
 * Update harpoon ballista targeting and firing logic.
 */
export function updateHarpoon(gadgetState, raftPos, raftYaw, enemies, now, dt) {
    if (!gadgetState.installed[GADGET_TYPES.HARPOON]) return [];
    const cfg = GADGET_CONFIGS[GADGET_TYPES.HARPOON];
    const events = [];
    const harpoon = gadgetState.harpoon;

    // Advance active bolts
    harpoon.activeBolts = harpoon.activeBolts.filter((bolt) => {
        bolt.elapsed += dt * 1000;
        return bolt.elapsed < bolt.tetherDurationMs;
    });

    const nearest = findNearestEnemy(raftPos, enemies, cfg.range);
    if (nearest) {
        harpoon.targetId = nearest.enemy.id;
        const dx = nearest.enemy.position.x - raftPos.x;
        const dz = nearest.enemy.position.z - raftPos.z;
        harpoon.aimAngle = Math.atan2(dx, -dz) - raftYaw;

        if (now - harpoon.lastFireTime >= cfg.fireIntervalMs) {
            harpoon.lastFireTime = now;
            const boltId = `bolt_${now}_${Math.floor(Math.random() * 1000)}`;
            const bolt = {
                id: boltId,
                startPos: { x: raftPos.x, y: (raftPos.y || 0) + 0.4, z: raftPos.z },
                targetId: nearest.enemy.id,
                targetPos: { x: nearest.enemy.position.x, y: nearest.enemy.position.y || 0.5, z: nearest.enemy.position.z },
                damage: cfg.boltDamage,
                elapsed: 0,
                tetherDurationMs: cfg.tetherDurationMs,
                pullForce: cfg.pullForce,
            };
            harpoon.activeBolts.push(bolt);

            events.push({
                type: 'harpoon_fire',
                boltId,
                targetId: nearest.enemy.id,
                damage: cfg.boltDamage,
                aimAngle: harpoon.aimAngle,
            });
        }
    } else {
        harpoon.targetId = null;
    }

    return events;
}

/**
 * Activates Arcane Shockwave Bell if installed and not on cooldown.
 */
export function activateShieldDome(gadgetState, now) {
    if (!gadgetState.installed[GADGET_TYPES.SHIELD_DOME]) {
        return { success: false, reason: 'not-installed' };
    }
    const cfg = GADGET_CONFIGS[GADGET_TYPES.SHIELD_DOME];
    const dome = gadgetState.shieldDome;

    if (now - dome.lastActivatedTime < cfg.cooldownMs) {
        return {
            success: false,
            reason: 'cooldown',
            remainingMs: cfg.cooldownMs - (now - dome.lastActivatedTime),
        };
    }

    dome.lastActivatedTime = now;
    dome.isShockwaveActive = true;
    dome.shockwaveProgress = 0;
    dome.parryingUntil = now + cfg.parryWindowMs;

    return {
        success: true,
        parryWindowMs: cfg.parryWindowMs,
        radius: cfg.shockwaveRadius,
        damage: cfg.damage,
        knockbackForce: cfg.knockbackForce,
    };
}

/**
 * Update shield dome animation & shockwave collision resolution.
 */
export function updateShieldDome(gadgetState, raftPos, enemies, now, dt) {
    if (!gadgetState.installed[GADGET_TYPES.SHIELD_DOME]) return [];
    const cfg = GADGET_CONFIGS[GADGET_TYPES.SHIELD_DOME];
    const dome = gadgetState.shieldDome;
    const events = [];

    if (dome.isShockwaveActive) {
        // Shockwave expands over 0.6 seconds
        dome.shockwaveProgress += dt / 0.6;
        const currentRadius = dome.shockwaveProgress * cfg.shockwaveRadius;

        if (dome.shockwaveProgress >= 1) {
            dome.isShockwaveActive = false;
            dome.shockwaveProgress = 1;
        }

        // Apply knockback and damage to enemies reached by shockwave
        for (const enemy of Object.values(enemies || {})) {
            if (!enemy || (enemy.health !== undefined && enemy.health <= 0) || enemy.isDead) continue;
            const dist = distanceXZ(raftPos, enemy.position);
            if (dist <= currentRadius && !enemy._shockwaveHit) {
                enemy._shockwaveHit = true;
                const dirX = dist > 0.01 ? (enemy.position.x - raftPos.x) / dist : 0;
                const dirZ = dist > 0.01 ? (enemy.position.z - raftPos.z) / dist : -1;

                events.push({
                    type: 'shockwave_hit',
                    enemyId: enemy.id,
                    damage: cfg.damage,
                    knockback: {
                        x: dirX * (cfg.knockbackForce / (enemy.mass || 10)),
                        z: dirZ * (cfg.knockbackForce / (enemy.mass || 10)),
                    },
                });
            }
        }
    } else {
        // Reset hit flags when shockwave completes
        for (const enemy of Object.values(enemies || {})) {
            if (enemy?._shockwaveHit) delete enemy._shockwaveHit;
        }
    }

    return events;
}

/**
 * Check if the raft is currently in the parry window and parry an incoming throw or hit.
 */
export function checkShieldDomeParry(gadgetState, incomingDamage, now) {
    if (!gadgetState.installed[GADGET_TYPES.SHIELD_DOME]) {
        return { parried: false, effectiveDamage: incomingDamage };
    }
    const dome = gadgetState.shieldDome;
    if (now <= dome.parryingUntil) {
        return {
            parried: true,
            effectiveDamage: 0,
            reflectedDamage: Math.round(incomingDamage * 0.5),
            throwNullified: true,
        };
    }
    return { parried: false, effectiveDamage: incomingDamage };
}

/**
 * Sets boosting state on nitro hydro-jets.
 */
export function setNitroBoost(gadgetState, isBoosting) {
    if (!gadgetState.installed[GADGET_TYPES.NITRO_KEG]) return false;
    gadgetState.nitroKeg.isBoosting = isBoosting;
    return true;
}

/**
 * Updates fuel burn and regeneration on nitro keg.
 */
export function updateNitroKeg(gadgetState, now, dt) {
    if (!gadgetState.installed[GADGET_TYPES.NITRO_KEG]) {
        return { thrustBoost: 0, fuelPercent: 0, active: false };
    }
    const cfg = GADGET_CONFIGS[GADGET_TYPES.NITRO_KEG];
    const nitro = gadgetState.nitroKeg;

    let appliedThrust = 0;
    let isActive = false;

    if (nitro.isBoosting && nitro.fuel > 0) {
        const burn = cfg.burnRatePerSec * dt;
        nitro.fuel = Math.max(0, nitro.fuel - burn);
        nitro.lastBurnTime = now;
        appliedThrust = cfg.thrustBoost;
        isActive = true;
    } else {
        // Regen after regenDelayMs
        if (now - nitro.lastBurnTime >= cfg.regenDelayMs) {
            const regen = cfg.regenRatePerSec * dt;
            nitro.fuel = Math.min(cfg.maxFuel, nitro.fuel + regen);
        }
    }

    return {
        thrustBoost: appliedThrust,
        fuel: nitro.fuel,
        maxFuel: cfg.maxFuel,
        fuelPercent: nitro.fuel / cfg.maxFuel,
        active: isActive,
    };
}

/**
 * Updates repair drone orbit and heals nearby crewmates within 12m.
 */
export function updateRepairDrone(gadgetState, raftPos, crewList, now, dt) {
    if (!gadgetState.installed[GADGET_TYPES.REPAIR_DRONE]) {
        return { healedTargets: [], companionPos: null };
    }
    const cfg = GADGET_CONFIGS[GADGET_TYPES.REPAIR_DRONE];
    const drone = gadgetState.repairDrone;

    // Update orbit kinematics
    drone.orbitAngle = (drone.orbitAngle + cfg.orbitSpeedRadPerSec * dt) % (Math.PI * 2);
    const companionPos = {
        x: raftPos.x + Math.cos(drone.orbitAngle) * cfg.orbitRadius,
        y: (raftPos.y || 0) + cfg.hoverHeight + Math.sin(drone.orbitAngle * 2) * 0.25,
        z: raftPos.z + Math.sin(drone.orbitAngle) * cfg.orbitRadius,
    };

    const healedTargets = [];
    if (now - drone.lastHealTick >= cfg.healTickIntervalMs) {
        drone.lastHealTick = now;
        const tickHealAmount = cfg.healPerSec * (cfg.healTickIntervalMs / 1000);

        for (const crew of crewList || []) {
            if (!crew || crew.isDead) continue;
            const dist = distanceXZ(raftPos, crew.position);
            if (dist <= cfg.auraRadius && crew.health < crew.maxHealth) {
                const prev = crew.health;
                crew.health = Math.min(crew.maxHealth, crew.health + tickHealAmount);
                const actual = crew.health - prev;
                if (actual > 0) {
                    healedTargets.push({ id: crew.id, amount: actual, currentHealth: crew.health });
                }
            }
        }
        drone.beamTargets = healedTargets.map((t) => t.id);
    }

    return {
        healedTargets,
        companionPos,
        beamTargetIds: drone.beamTargets,
    };
}

/**
 * Unified update for all attached gadgets on a raft.
 */
export function updateRaftGadgets({
    gadgetState,
    raftPos,
    raftYaw = 0,
    enemies = {},
    crewList = [],
    now = 0,
    dt = 0.05,
}) {
    if (!gadgetState || !gadgetState.installed) return {};

    const harpoonEvents = updateHarpoon(gadgetState, raftPos, raftYaw, enemies, now, dt);
    const shieldEvents = updateShieldDome(gadgetState, raftPos, enemies, now, dt);
    const nitroStatus = updateNitroKeg(gadgetState, now, dt);
    const droneStatus = updateRepairDrone(gadgetState, raftPos, crewList, now, dt);

    return {
        harpoonEvents,
        shieldEvents,
        nitroStatus,
        droneStatus,
    };
}
