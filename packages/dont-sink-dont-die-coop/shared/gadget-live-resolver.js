// Raft Gadgets Live Combat & Propulsion Resolver
// Bridges high-level raft attachments and tactical gadget mechanics into concrete combat,
// propulsion, healing, and shockwave physics for 60Hz live gameplay.
// Zero external dependencies. Pure and deterministic.

import {
    GADGET_TYPES,
    installGadget,
    updateRaftGadgets,
    setNitroBoost,
} from './raft-gadgets.js';

/**
 * Normalizes gadget IDs from snake_case or legacy strings to standard hyphenated GADGET_TYPES.
 *
 * @param {string} rawId
 * @returns {string|null} Normalized GADGET_TYPES string, or null if unknown.
 */
export function normalizeGadgetId(rawId) {
    if (!rawId || typeof rawId !== 'string') return null;

    const trimmed = rawId.trim().toLowerCase();
    const clean = trimmed.replace(/_/g, '-');

    switch (clean) {
        case GADGET_TYPES.HARPOON:
            return GADGET_TYPES.HARPOON;
        case GADGET_TYPES.SHIELD_DOME:
            return GADGET_TYPES.SHIELD_DOME;
        case GADGET_TYPES.NITRO_KEG:
            return GADGET_TYPES.NITRO_KEG;
        case GADGET_TYPES.REPAIR_DRONE:
            return GADGET_TYPES.REPAIR_DRONE;
        default:
            return null;
    }
}

/**
 * Installs gadgets corresponding to armory slot purchases.
 * Maps slot === 'weapon' -> 'harpoon', slot === 'armor' -> 'shield-dome', slot === 'motor' -> 'nitro-keg'.
 * If upgradeId ends with '_2' or '_3' (tier 2/3 upgrade), also installs 'repair-drone'.
 * Guarantees gadgetState.installed[normalizedId] is populated.
 *
 * @param {object} gadgetState
 * @param {string} slot - 'weapon' | 'armor' | 'motor'
 * @param {string} [upgradeId='']
 * @returns {object} { installed: string[], success: boolean }
 */
export function installGadgetForArmoryPurchase(gadgetState, slot, upgradeId = '') {
    if (!gadgetState) {
        return { installed: [], success: false };
    }
    if (!gadgetState.installed) {
        gadgetState.installed = {};
    }

    const installed = [];

    let targetGadget = null;
    if (slot === 'weapon') targetGadget = GADGET_TYPES.HARPOON;
    else if (slot === 'armor') targetGadget = GADGET_TYPES.SHIELD_DOME;
    else if (slot === 'motor') targetGadget = GADGET_TYPES.NITRO_KEG;

    if (targetGadget) {
        const normalized = normalizeGadgetId(targetGadget);
        if (normalized) {
            installGadget({ coins: 9999 }, gadgetState, normalized);
            if (!gadgetState.installed[normalized]) {
                gadgetState.installed[normalized] = { installedAt: 0, active: true, level: 1 };
            }
            installed.push(normalized);
        }
    }

    // Tier 2 or Tier 3 upgrades unlock the repair drone companion
    const isTier2Or3 = typeof upgradeId === 'string' && (upgradeId.endsWith('_2') || upgradeId.endsWith('_3'));
    if (isTier2Or3) {
        const droneId = GADGET_TYPES.REPAIR_DRONE;
        installGadget({ coins: 9999 }, gadgetState, droneId);
        if (!gadgetState.installed[droneId]) {
            gadgetState.installed[droneId] = { installedAt: 0, active: true, level: 1 };
        }
        installed.push(droneId);
    }

    return {
        installed,
        success: installed.length > 0,
    };
}

/**
 * Steps updateRaftGadgets and translates returned events into concrete simulation results.
 *
 * @param {object} options
 * @param {object} options.gadgetState - Raft gadget state object
 * @param {object} options.craft - Craft kinematic object ({ position: {x,y,z}, velocity: {x,y,z}, yaw })
 * @param {object} [options.enemies={}] - Map/Object of active enemies
 * @param {boolean} [options.isBoosting=false] - Whether pilot is holding boost / nitro
 * @param {number} [options.now=0] - Current simulation timestamp in ms
 * @param {number} [options.dt=1/60] - Delta time in seconds
 * @returns {object} { enemyHits: Array<{ enemyId, damage, knockback }>, velocityDelta: { x, z }, healedHp: number, shockwaveTriggered: boolean }
 */
export function stepAndApplyRaftGadgets({
    gadgetState,
    craft,
    enemies = {},
    isBoosting = false,
    now = 0,
    dt = 1 / 60,
} = {}) {
    const result = {
        enemyHits: [],
        velocityDelta: { x: 0, z: 0 },
        healedHp: 0,
        shockwaveTriggered: false,
    };

    if (!gadgetState || !craft) {
        return result;
    }

    const raftPos = craft.position || { x: 0, y: 0, z: 0 };
    const raftYaw = craft.yaw || 0;

    // Apply boost input state to nitro hydro-jets
    if (gadgetState.installed?.[GADGET_TYPES.NITRO_KEG]) {
        setNitroBoost(gadgetState, Boolean(isBoosting));
    }

    // Track shockwave activation transition using lastActivatedTime or a tracker on shieldDome
    if (gadgetState.shieldDome) {
        const dome = gadgetState.shieldDome;
        if (dome.isShockwaveActive && dome._lastHandledActivation !== dome.lastActivatedTime) {
            dome._lastHandledActivation = dome.lastActivatedTime;
            result.shockwaveTriggered = true;
        }
    }

    // Create a local crew list representing the pilot/craft to receive repair drone aura heals
    const pilotCrewMember = {
        id: craft.id || 'local_pilot',
        position: raftPos,
        health: craft.health ?? 100,
        maxHealth: craft.maxHealth ?? 100,
        isDead: Boolean(craft.isDead),
    };

    // Step core gadget logic
    const updateOutput = updateRaftGadgets({
        gadgetState,
        raftPos,
        raftYaw,
        enemies,
        crewList: [pilotCrewMember],
        now,
        dt,
    });

    // 1. Process Harpoon Ballista events
    if (Array.isArray(updateOutput.harpoonEvents)) {
        for (const ev of updateOutput.harpoonEvents) {
            if (ev.type === 'harpoon_fire' && ev.targetId) {
                // Compute knockback/pull vector toward craft
                const enemy = enemies[ev.targetId];
                let kx = 0;
                let kz = 0;
                if (enemy && enemy.position) {
                    const dx = raftPos.x - enemy.position.x;
                    const dz = raftPos.z - enemy.position.z;
                    const dist = Math.hypot(dx, dz) || 1;
                    kx = (dx / dist) * 12; // pull towards raft
                    kz = (dz / dist) * 12;
                }
                result.enemyHits.push({
                    enemyId: ev.targetId,
                    damage: ev.damage,
                    knockback: { x: kx, z: kz },
                });
            }
        }
    }

    // 2. Process Shockwave Bell events
    if (Array.isArray(updateOutput.shieldEvents)) {
        for (const ev of updateOutput.shieldEvents) {
            if (ev.type === 'shockwave_hit') {
                result.enemyHits.push({
                    enemyId: ev.enemyId,
                    damage: ev.damage,
                    knockback: ev.knockback || { x: 0, z: 0 },
                });
            }
        }
    }

    // 3. Process Nitro Keg propulsion thrust
    if (updateOutput.nitroStatus && updateOutput.nitroStatus.active && updateOutput.nitroStatus.thrustBoost > 0) {
        // Forward heading vector from craft.yaw: headingOf(yaw) = (-sin(yaw), -cos(yaw))
        const forwardX = -Math.sin(raftYaw);
        const forwardZ = -Math.cos(raftYaw);
        const thrust = updateOutput.nitroStatus.thrustBoost;

        // Velocity delta = (Thrust / mass) * dt, assuming nominal mass ~35kg for agile craft
        const craftMass = craft.mass || 35;
        const accel = thrust / craftMass;

        result.velocityDelta.x = forwardX * accel * dt;
        result.velocityDelta.z = forwardZ * accel * dt;

        // Directly apply to craft velocity if craft.velocity is mutable
        if (craft.velocity) {
            craft.velocity.x = (craft.velocity.x || 0) + result.velocityDelta.x;
            craft.velocity.z = (craft.velocity.z || 0) + result.velocityDelta.z;
        }
    }

    // 4. Process Repair Drone companion healing
    if (updateOutput.droneStatus && Array.isArray(updateOutput.droneStatus.healedTargets)) {
        for (const target of updateOutput.droneStatus.healedTargets) {
            result.healedHp += target.amount || 0;
            if (craft.health !== undefined && craft.maxHealth !== undefined) {
                craft.health = Math.min(craft.maxHealth, craft.health + (target.amount || 0));
            }
        }
    }

    return result;
}
