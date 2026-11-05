/**
 * Don't Sink, Don't Die — Sanctuary Shrine Teammate Respawn & Recall Beacon
 * (`shared/sanctuary-respawn-beacon.js`)
 *
 * Sovereign Core & Helmet 01/02 Directives:
 * - Visceral line-of-sight recovery: Docking at any Sanctuary Platform automatically
 *   regroups or revives fallen/separated teammates right beside your raft.
 * - Eliminates coop waiting friction: No dead crewmate left stranded downriver or
 *   forced to spectate while a surviving player docks at a shrine.
 * - Pure deterministic math, zero DOM/Three.js global leaks, headless safe.
 *
 * Exports:
 * - canRecallFallenCrewmate(player, platform, options)
 * - executeSanctuaryRecall(crewPlayers, platform, options)
 * - isPlayerAtSanctuary(player, platform)
 * - computeRecallPositions(dockedPlayer, count, spacing)
 * - SANCTUARY_BEACON_CONFIG
 */

export const SANCTUARY_BEACON_CONFIG = Object.freeze({
    DEFAULT_PLATFORM_RADIUS: 12.0,      // Default docking radius around platform center if no explicit bounds
    DOCKING_TOLERANCE_Y: 3.5,           // Acceptable Y elevation for platform docking
    SEPARATION_RECALL_DISTANCE: 40.0,   // Distance at which an alive player is considered estranged/separated
    REVIVE_HEALTH_PERCENT: 1.0,         // Health percentage restored on revive (1.0 = 100% maxHealth)
    REGROUP_HEAL_FLAT: 25,              // Bonus HP repaired on surviving separated teammates when recalled
    SIDE_OFFSET_SPACING: 3.2,           // Lateral spacing between rafts beside the docked player
    LONGITUDINAL_STAGGER: 1.2,          // Slight forward/aft stagger to prevent raft overlap
});

/**
 * Checks whether a 3D or 2D position is within a sanctuary platform's boundary.
 * Supports various platform representations:
 * - Circular/Cylindrical: { x, z, radius } or { position: { x, y, z }, radius }
 * - Rectangular/AABB: { minX, maxX, minZ, maxZ } or { x, z, width, length / depth }
 * - Object with bounds or position vector
 *
 * @param {object} pos - Position object { x, y?, z }
 * @param {object} platform - Platform descriptor
 * @returns {boolean} True if position is within platform bounds
 */
export function isPositionInsidePlatform(pos, platform) {
    if (!pos || !platform) return false;

    const px = Number.isFinite(pos.x) ? pos.x : 0;
    const pz = Number.isFinite(pos.z) ? pos.z : 0;

    // Direct AABB min/max check
    if (
        Number.isFinite(platform.minX) &&
        Number.isFinite(platform.maxX) &&
        Number.isFinite(platform.minZ) &&
        Number.isFinite(platform.maxZ)
    ) {
        return px >= platform.minX && px <= platform.maxX && pz >= platform.minZ && pz <= platform.maxZ;
    }

    // Platform center coordinates
    const cx = Number.isFinite(platform.position?.x)
        ? platform.position.x
        : Number.isFinite(platform.x)
          ? platform.x
          : 0;
    const cz = Number.isFinite(platform.position?.z)
        ? platform.position.z
        : Number.isFinite(platform.z)
          ? platform.z
          : 0;

    // Platform bounding box by width (X) and length/depth (Z)
    const width = platform.width ?? platform.sizeX;
    const length = platform.length ?? platform.depth ?? platform.sizeZ;
    if (Number.isFinite(width) && Number.isFinite(length) && width > 0 && length > 0) {
        const halfW = width * 0.5;
        const halfL = length * 0.5;
        return Math.abs(px - cx) <= halfW && Math.abs(pz - cz) <= halfL;
    }

    // Radius / circle fallback
    const radius = Number.isFinite(platform.radius)
        ? platform.radius
        : SANCTUARY_BEACON_CONFIG.DEFAULT_PLATFORM_RADIUS;
    const dx = px - cx;
    const dz = pz - cz;
    return (dx * dx + dz * dz) <= (radius * radius);
}

/**
 * Determines whether a player raft is securely docked / resting at a sanctuary platform.
 *
 * @param {object} player - Player object with position and optional flags
 * @param {object} platform - Platform descriptor
 * @param {object} [options] - Optional custom tolerances
 * @returns {boolean} True if player is safely docked at sanctuary
 */
export function isPlayerAtSanctuary(player, platform, options = {}) {
    if (!player || player.isDead || !platform) return false;

    // If player has explicit docked flag
    if (player.isDocked === true || player.dockedAtSanctuary === true) {
        return true;
    }

    const pos = player.position;
    if (!pos) return false;

    // Check horizontal inclusion
    if (!isPositionInsidePlatform(pos, platform)) {
        return false;
    }

    // Check optional Y elevation tolerance if platform has explicit Y
    const platformY = platform.position?.y ?? platform.y;
    if (Number.isFinite(platformY) && Number.isFinite(pos.y)) {
        const tolY = options.dockingToleranceY ?? SANCTUARY_BEACON_CONFIG.DOCKING_TOLERANCE_Y;
        if (Math.abs(pos.y - platformY) > tolY) {
            return false;
        }
    }

    return true;
}

/**
 * Evaluates whether a player docked at a sanctuary platform can activate the recall beacon
 * to regroup or revive fallen/separated teammates.
 *
 * @param {object} player - The summoning / docked player
 * @param {object} platform - The sanctuary platform
 * @param {object} [options] - Additional evaluation parameters
 * @returns {boolean} True if recall can be performed by this player at this platform
 */
export function canRecallFallenCrewmate(player, platform, options = {}) {
    if (!player || typeof player !== 'object') return false;
    if (player.isDead) return false;
    if (!platform || typeof platform !== 'object') return false;

    // Player must be at the sanctuary platform
    if (!isPlayerAtSanctuary(player, platform, options)) {
        return false;
    }

    // Platform must not be deactivated / burnt out
    if (platform.isDepleted === true || platform.active === false) {
        return false;
    }

    // Cooldown check if platform or player tracks last recall timestamp
    const now = options.currentTime ?? Date.now();
    const cooldownMs = options.cooldownMs ?? platform.recallCooldownMs ?? 0;
    if (cooldownMs > 0) {
        const lastRecall = platform.lastRecallTime ?? player.lastRecallTime ?? 0;
        if (now - lastRecall < cooldownMs) {
            return false;
        }
    }

    return true;
}

/**
 * Computes non-overlapping raft landing slots clustered directly beside the docked host raft.
 * Places teammates to the left, right, slightly staggered, facing the same direction.
 *
 * @param {object} hostPlayer - Host player object with position and optional heading/yaw
 * @param {number} count - Number of positions to generate
 * @param {object} [options] - Spacing and stagger options
 * @returns {Array<{ x: number, y: number, z: number, yaw?: number }>} Safe spawn slot positions
 */
export function computeRecallPositions(hostPlayer, count, options = {}) {
    if (count <= 0) return [];

    const hostPos = hostPlayer?.position || { x: 0, y: 0.25, z: 0 };
    const spacing = options.spacing ?? SANCTUARY_BEACON_CONFIG.SIDE_OFFSET_SPACING;
    const stagger = options.stagger ?? SANCTUARY_BEACON_CONFIG.LONGITUDINAL_STAGGER;
    const baseY = Number.isFinite(hostPos.y) ? hostPos.y : 0.25;

    // Derive orientation / forward vector from host player
    const yaw = Number.isFinite(hostPlayer?.yaw) ? hostPlayer.yaw : 0;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    // Right normal vector relative to heading
    const rightX = cosY;
    const rightZ = -sinY;

    // Forward vector
    const fwdX = sinY;
    const fwdZ = cosY;

    const positions = [];

    for (let i = 0; i < count; i++) {
        // Alternate left (-1) and right (+1), scaling outward
        const side = (i % 2 === 0) ? -1 : 1;
        const tier = Math.floor(i / 2) + 1;
        const lateralDist = side * tier * spacing;
        const longitudinalDist = ((i % 3) - 1) * stagger;

        const posX = hostPos.x + (rightX * lateralDist) + (fwdX * longitudinalDist);
        const posZ = hostPos.z + (rightZ * lateralDist) + (fwdZ * longitudinalDist);

        positions.push({
            x: Math.round(posX * 100) / 100,
            y: baseY,
            z: Math.round(posZ * 100) / 100,
            yaw,
        });
    }

    return positions;
}

/**
 * Executes a Sanctuary Shrine Recall & Respawn on all eligible crew members.
 * - Any dead crewmate (`isDead === true` or `health <= 0`) is fully revived beside the raft.
 * - Any alive crewmate separated beyond `separationThreshold` (default 40m) is safely recalled/regrouped beside the raft.
 * - Velocity is neutralized to halt runaway downriver drift.
 * - Restores health and returns comprehensive event telemetry for game audio/VFX directors.
 *
 * @param {object[]|Record<string, object>} crewPlayers - Array or Map/dict of player objects
 * @param {object} platform - Sanctuary platform object
 * @param {object} [options] - Execution options (hostPlayer, separationThreshold, reviveHpPercent, healFlat)
 * @returns {{
 *   success: boolean,
 *   revivedCount: number,
 *   recalledCount: number,
 *   revivedPlayers: object[],
 *   recalledPlayers: object[],
 *   events: Array<{ event: string, data: any }>
 * }} Outcome summary and events
 */
export function executeSanctuaryRecall(crewPlayers, platform, options = {}) {
    if (!crewPlayers || !platform) {
        return {
            success: false,
            revivedCount: 0,
            recalledCount: 0,
            revivedPlayers: [],
            recalledPlayers: [],
            events: [],
        };
    }

    // Normalize crewPlayers collection to an array
    const playersList = Array.isArray(crewPlayers)
        ? crewPlayers
        : Object.values(crewPlayers);

    if (playersList.length === 0) {
        return {
            success: false,
            revivedCount: 0,
            recalledCount: 0,
            revivedPlayers: [],
            recalledPlayers: [],
            events: [],
        };
    }

    // Determine host / summoning player
    let hostPlayer = options.hostPlayer || null;
    if (!hostPlayer) {
        // Find first alive player docked at the platform
        hostPlayer = playersList.find((p) => p && !p.isDead && isPlayerAtSanctuary(p, platform, options)) || null;
    }

    // If still no valid docked player found, recall cannot proceed
    if (!hostPlayer || !canRecallFallenCrewmate(hostPlayer, platform, options)) {
        return {
            success: false,
            revivedCount: 0,
            recalledCount: 0,
            revivedPlayers: [],
            recalledPlayers: [],
            events: [],
        };
    }

    const separationDist = options.separationThreshold ?? SANCTUARY_BEACON_CONFIG.SEPARATION_RECALL_DISTANCE;
    const reviveHpPercent = options.reviveHpPercent ?? SANCTUARY_BEACON_CONFIG.REVIVE_HEALTH_PERCENT;
    const flatHeal = options.flatHeal ?? SANCTUARY_BEACON_CONFIG.REGROUP_HEAL_FLAT;

    const targetsToRecall = [];

    for (const p of playersList) {
        if (!p || p === hostPlayer || p.id === hostPlayer.id) continue;

        const isDead = p.isDead === true || (Number.isFinite(p.health) && p.health <= 0);

        if (isDead) {
            targetsToRecall.push({ player: p, reason: 'revive' });
            continue;
        }

        // Alive player — check if separated beyond distance threshold
        const hPos = hostPlayer.position || { x: 0, z: 0 };
        const pPos = p.position || { x: 0, z: 0 };
        const dx = pPos.x - hPos.x;
        const dz = pPos.z - hPos.z;
        const distSq = dx * dx + dz * dz;

        if (distSq >= separationDist * separationDist) {
            targetsToRecall.push({ player: p, reason: 'regroup' });
        }
    }

    if (targetsToRecall.length === 0) {
        return {
            success: true,
            revivedCount: 0,
            recalledCount: 0,
            revivedPlayers: [],
            recalledPlayers: [],
            events: [],
        };
    }

    // Compute safe spawn positions beside host
    const spawnSlots = computeRecallPositions(hostPlayer, targetsToRecall.length, options);

    const revivedPlayers = [];
    const recalledPlayers = [];
    const events = [];

    // Track execution timestamp on platform/host for cooldowns
    const now = options.currentTime ?? Date.now();
    platform.lastRecallTime = now;
    if (hostPlayer) hostPlayer.lastRecallTime = now;

    targetsToRecall.forEach((entry, idx) => {
        const { player: p, reason } = entry;
        const slot = spawnSlots[idx] || hostPlayer.position;

        // Apply new coordinates
        p.position = {
            x: slot.x,
            y: slot.y,
            z: slot.z,
        };

        // Align yaw if slot defines it
        if (Number.isFinite(slot.yaw)) {
            p.yaw = slot.yaw;
        }

        // Neutralize velocity
        if (p.velocity && typeof p.velocity === 'object') {
            p.velocity.x = 0;
            p.velocity.y = 0;
            p.velocity.z = 0;
        }

        const maxHp = Number.isFinite(p.maxHealth) && p.maxHealth > 0 ? p.maxHealth : 100;

        if (reason === 'revive') {
            p.isDead = false;
            p.health = Math.round(maxHp * reviveHpPercent);
            revivedPlayers.push(p);

            // Canonical playerRevived event for game-core / hud listeners
            events.push({
                event: 'playerRevived',
                data: p,
            });

            events.push({
                event: 'sanctuaryTeammateRespawned',
                data: {
                    playerId: p.id,
                    hostId: hostPlayer.id,
                    platformId: platform.id ?? 'sanctuary_platform',
                    position: { ...p.position },
                    health: p.health,
                    maxHealth: maxHp,
                },
            });
        } else {
            // Regroup surviving separated teammate
            p.health = Math.min(maxHp, (p.health || 0) + flatHeal);
            recalledPlayers.push(p);

            events.push({
                event: 'sanctuaryTeammateRecalled',
                data: {
                    playerId: p.id,
                    hostId: hostPlayer.id,
                    platformId: platform.id ?? 'sanctuary_platform',
                    position: { ...p.position },
                    health: p.health,
                    maxHealth: maxHp,
                    healed: flatHeal,
                },
            });
        }
    });

    // Master beacon activation event
    events.unshift({
        event: 'sanctuaryBeaconActivated',
        data: {
            hostId: hostPlayer.id,
            platformId: platform.id ?? 'sanctuary_platform',
            revivedCount: revivedPlayers.length,
            recalledCount: recalledPlayers.length,
            totalRecovered: targetsToRecall.length,
        },
    });

    return {
        success: true,
        revivedCount: revivedPlayers.length,
        recalledCount: recalledPlayers.length,
        revivedPlayers,
        recalledPlayers,
        events,
    };
}
