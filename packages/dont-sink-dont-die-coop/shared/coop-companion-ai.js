/**
 * Don't Sink, Don't Die — Co-Op Companion Formation & Sanctuary-Waiting AI
 * (`shared/coop-companion-ai.js`)
 *
 * Sovereign Core & Helmet 01/02 Directives:
 * - Pure, deterministic companion AI intent evaluator for co-op AI bots.
 * - Zero timers, zero I/O, zero global leaks, zero external dependencies.
 * - Prevents AI bots from blindly racing downriver ahead of the human player.
 * - Detects when human players stop at the Harbor City Shop (near zShop / SHOP_ZONE),
 *   drop anchor, or land on a Sanctuary Platform:
 *     * Bots immediately brake (brake = true, throttle = 0).
 *     * Steer toward the sanctuary/dock perimeter or platform mooring spot.
 *     * Guard the human player by engaging approaching threats within guard radius.
 * - When cruising downriver, bots maintain a dynamic flank formation within 8m–14m
 *   of the human player so the crew always sails together.
 */

/**
 * Standard configuration constants for Companion Formation & Waiting AI.
 */
export const COMPANION_AI_CONFIG = {
    // Cruising formation distance limits
    formation: {
        minFlankDistance: 8.0,
        maxFlankDistance: 14.0,
        lateralFlankX: 7.5,
        rearTrailingZ: 5.5,
        aheadClampToleranceZ: 1.5, // Bots must never race ahead of human by more than this
    },
    // Sanctuary & Harbor waiting parameters
    waiting: {
        dockProximityThreshold: 22.0,
        anchorSpeedThreshold: 1.2,
        guardRadius: 28.0,
        attackRange: 5.0,
        brakingDecel: 0.9,
    },
    // Default Harbor City Shop anchor Z (aligns with SHOP_ZONE ~ -200)
    defaultZShop: -200,
    // Default river width
    defaultRiverWidth: 30,
};

/**
 * Pure math helper: clamp value between min and max.
 */
function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

/**
 * Pure math helper: 2D Euclidean distance in the horizontal river plane (X/Z).
 */
export function distXZ(a, b) {
    if (!a || !b) return Infinity;
    const dx = (a.x ?? 0) - (b.x ?? 0);
    const dz = (a.z ?? 0) - (b.z ?? 0);
    return Math.hypot(dx, dz);
}

/**
 * Determines whether a given player (or position) is inside a sanctuary platform.
 * Platforms can be specified with center {x, z} and extents {width, length} or radius.
 */
export function isPositionOnSanctuary(pos, platform) {
    if (!pos || !platform) return false;
    const px = pos.x ?? 0;
    const pz = pos.z ?? 0;

    const platX = platform.x ?? platform.position?.x ?? 0;
    const platZ = platform.z ?? platform.position?.z ?? 0;

    if (platform.radius !== undefined) {
        return Math.hypot(px - platX, pz - platZ) <= platform.radius;
    }

    const halfW = (platform.width || platform.sizeX || 12) * 0.5;
    const halfL = (platform.length || platform.lengthZ || platform.sizeZ || 12) * 0.5;

    return Math.abs(px - platX) <= halfW && Math.abs(pz - platZ) <= halfL;
}

/**
 * Evaluates the primary human player state regarding anchor, shop, or sanctuary resting.
 *
 * @param {object} human - Human player object.
 * @param {Array<object>} platforms - Array of sanctuary platforms.
 * @param {number} zShop - Harbor shop Z coordinate or shop band.
 * @returns {object} Status object indicating anchor, shop, or sanctuary state.
 */
export function evaluateHumanRestState(human, platforms = [], zShop = COMPANION_AI_CONFIG.defaultZShop) {
    if (!human || human.isDead) {
        return {
            isResting: false,
            reason: 'none',
            platform: null,
            inShop: false,
            isAnchored: false,
        };
    }

    const pos = human.position || human;
    const vel = human.velocity || { x: 0, y: 0, z: 0 };
    const speed = Math.hypot(vel.x || 0, vel.z || 0);

    // 1. Explicit Anchor flag or stationary near-zero speed
    const isExplicitlyAnchored = Boolean(human.anchorDropped || human.isAnchored || human.anchored);
    const isSpeedStationary = speed < COMPANION_AI_CONFIG.waiting.anchorSpeedThreshold;

    // 2. Sanctuary Platform check
    let sanctuaryPlat = null;
    if (human.onSanctuary || human.isRestingOnPlatform) {
        sanctuaryPlat = platforms.find((p) => isPositionOnSanctuary(pos, p)) || platforms[0] || { x: pos.x, z: pos.z };
    } else if (Array.isArray(platforms) && platforms.length > 0) {
        for (const p of platforms) {
            if (isPositionOnSanctuary(pos, p)) {
                sanctuaryPlat = p;
                break;
            }
        }
    }

    if (sanctuaryPlat) {
        return {
            isResting: true,
            reason: 'sanctuary',
            platform: sanctuaryPlat,
            inShop: false,
            isAnchored: isExplicitlyAnchored || isSpeedStationary,
        };
    }

    // 3. Harbor City Shop check
    // zShop can be a number (e.g. -200) or an object with { minZ, maxZ, minX, maxX }
    let inShopZone = Boolean(human.isShopping || human.inShop || human.shopping);
    if (!inShopZone && typeof zShop === 'number') {
        // Harbor shop band usually spans 40-50m around zShop
        const dzShop = Math.abs((pos.z ?? 0) - zShop);
        if (dzShop <= 25.0 && ((pos.x ?? 0) >= 8.0 || isSpeedStationary)) {
            inShopZone = true;
        }
    } else if (!inShopZone && zShop && typeof zShop === 'object') {
        const minZ = zShop.minZ ?? -250;
        const maxZ = zShop.maxZ ?? -150;
        const minX = zShop.minX ?? 8.0;
        if (pos.z >= minZ && pos.z <= maxZ && (pos.x >= minX || isSpeedStationary)) {
            inShopZone = true;
        }
    }

    if (inShopZone) {
        return {
            isResting: true,
            reason: 'shop',
            platform: null,
            inShop: true,
            isAnchored: isExplicitlyAnchored || isSpeedStationary,
        };
    }

    // 4. Dropped anchor on open river
    if (isExplicitlyAnchored || (isSpeedStationary && human.inputs && !human.inputs.w && !human.inputs.forward)) {
        return {
            isResting: true,
            reason: 'anchored',
            platform: null,
            inShop: false,
            isAnchored: true,
        };
    }

    return {
        isResting: false,
        reason: 'cruising',
        platform: null,
        inShop: false,
        isAnchored: false,
    };
}

/**
 * Calculates deterministic flank position slot for a bot relative to a lead human.
 * Enforces dynamic formation within 8m-14m distance.
 *
 * @param {object} humanPos - Lead human position {x, y, z}.
 * @param {number} botIndex - Index of bot (0, 1, 2, ...).
 * @param {number} riverHalfWidth - Channel boundary limit.
 * @returns {object} Target world coordinate {x, z, distance}.
 */
export function computeFlankPosition(humanPos, botIndex = 0, riverHalfWidth = 13.5) {
    const hx = humanPos.x ?? 0;
    const hz = humanPos.z ?? 0;

    // Alternating flank: even indices on port (-X), odd on starboard (+X)
    const isPort = botIndex % 2 === 0;
    const tier = Math.floor(botIndex / 2);

    // Lateral offset: staggered between 8m and 12m, clamped to stay safely off river walls
    const lateralDist = clamp(
        COMPANION_AI_CONFIG.formation.lateralFlankX + tier * 2.0,
        COMPANION_AI_CONFIG.formation.minFlankDistance * 0.7,
        COMPANION_AI_CONFIG.formation.maxFlankDistance * 0.9
    );

    let targetX = isPort ? hx - lateralDist : hx + lateralDist;

    // If target exceeds river corridor, flip or clamp within boundary
    if (targetX < -riverHalfWidth + 1.5) {
        targetX = -riverHalfWidth + 1.5;
    } else if (targetX > riverHalfWidth - 1.5) {
        targetX = riverHalfWidth - 1.5;
    }

    // Trailing Z: Bots must never sail downriver ahead of the human (in our coordinate system, downriver is negative Z).
    // Therefore, bot target Z must be >= human Z (i.e. at or trailing behind the human in positive Z direction).
    const trailingZ = clamp(
        COMPANION_AI_CONFIG.formation.rearTrailingZ + tier * 2.5,
        4.0,
        10.0
    );
    const targetZ = hz + trailingZ;

    const actualDist = Math.hypot(targetX - hx, targetZ - hz);

    return {
        x: Number(targetX.toFixed(3)),
        z: Number(targetZ.toFixed(3)),
        distance: Number(actualDist.toFixed(3)),
    };
}

/**
 * Finds the most urgent threat approaching the human or resting perimeter.
 *
 * @param {object} guardOrigin - Center of guard zone (human position or sanctuary mooring).
 * @param {Array<object>|object} enemies - Active enemies collection.
 * @param {number} guardRadius - Engagement radius.
 * @returns {object|null} Threat object with enemy and distance, or null.
 */
export function findGuardThreat(guardOrigin, enemies = [], guardRadius = COMPANION_AI_CONFIG.waiting.guardRadius) {
    if (!guardOrigin || !enemies) return null;
    const enemyList = Array.isArray(enemies) ? enemies : Object.values(enemies);

    let closestEnemy = null;
    let minDistance = Infinity;

    for (let i = 0; i < enemyList.length; i++) {
        const e = enemyList[i];
        if (!e || e.isDead || (e.health !== undefined && e.health <= 0)) continue;
        const ePos = e.position || e;
        const d = distXZ(guardOrigin, ePos);
        if (d <= guardRadius && d < minDistance) {
            minDistance = d;
            closestEnemy = e;
        }
    }

    if (!closestEnemy) return null;
    return {
        enemy: closestEnemy,
        distance: minDistance,
        position: closestEnemy.position || closestEnemy,
    };
}

/**
 * Computes the intelligent intent directive for an AI Companion Bot.
 *
 * @param {object} params
 * @param {object} params.bot - AI companion bot entity { id, position, velocity, upgrades, botIndex }.
 * @param {Array<object>} params.humanPlayers - Array or object of active human players.
 * @param {Array<object>} [params.platforms=[]] - Array of sanctuary platforms / rest zones.
 * @param {Array<object>|object} [params.enemies=[]] - Collection of river monsters / threats.
 * @param {number} [params.riverWidth=30] - Total river width in meters.
 * @param {number|object} [params.zShop=-200] - Harbor shop Z location or bounding box.
 * @returns {object} Companion bot intent containing { state, steer, throttle, brake, attack, target, guarding, humanLeader }.
 */
export function computeCompanionBotIntent({
    bot,
    humanPlayers = [],
    platforms = [],
    enemies = [],
    riverWidth = COMPANION_AI_CONFIG.defaultRiverWidth,
    zShop = COMPANION_AI_CONFIG.defaultZShop,
} = {}) {
    // 1. Guard against dead, inactive, or invalid bot
    if (!bot || bot.isDead || (bot.health !== undefined && bot.health <= 0)) {
        return {
            state: 'dead',
            steer: 0,
            throttle: 0,
            brake: true,
            attack: false,
            jump: false,
            target: null,
            guarding: false,
            threatTarget: null,
            reason: 'bot-dead',
        };
    }

    const botPos = bot.position || { x: 0, y: 0.25, z: 0 };
    const botIndex = Number.isInteger(bot.botIndex) ? bot.botIndex : 0;
    const riverHalfWidth = (riverWidth || 30) * 0.5;

    // 2. Identify active human leader
    const humanList = Array.isArray(humanPlayers) ? humanPlayers : Object.values(humanPlayers || {});
    const activeHumans = humanList.filter((p) => p && !p.isBot && !p.isDead && (p.health === undefined || p.health > 0));

    // Fallback if no human player is alive or in game
    if (activeHumans.length === 0) {
        return {
            state: 'solo_drift',
            steer: 0,
            throttle: 0.4,
            brake: false,
            attack: false,
            jump: false,
            target: { x: botPos.x, z: botPos.z - 10 },
            guarding: false,
            threatTarget: null,
            reason: 'no-human-leader',
        };
    }

    // Select the leading human downriver (smallest Z)
    const humanLeader = activeHumans.reduce((lead, curr) => {
        const leadZ = lead.position?.z ?? lead.z ?? 0;
        const currZ = curr.position?.z ?? curr.z ?? 0;
        return currZ < leadZ ? curr : lead;
    }, activeHumans[0]);

    const humanPos = humanLeader.position || humanLeader;

    // 3. Evaluate human resting / waiting state (Shop, Sanctuary Platform, or Anchored)
    const restState = evaluateHumanRestState(humanLeader, platforms, zShop);

    // 4. Check for threatening enemies to guard against
    const guardThreat = findGuardThreat(humanPos, enemies, COMPANION_AI_CONFIG.waiting.guardRadius);

    // =========================================================================
    // BRANCH A: HUMAN IS RESTING (HARBOR SHOP, SANCTUARY PLATFORM, OR ANCHORED)
    // =========================================================================
    if (restState.isResting) {
        // If an enemy approaches the resting human, companion immediately guards and fights!
        if (guardThreat) {
            const threatPos = guardThreat.position;
            const dxThreat = threatPos.x - botPos.x;
            const dzThreat = threatPos.z - botPos.z;
            const distToThreat = Math.hypot(dxThreat, dzThreat);

            const steer = clamp(dxThreat * 0.35, -1.0, 1.0);
            const inAttackRange = distToThreat <= COMPANION_AI_CONFIG.waiting.attackRange;

            return {
                state: 'guard_intercept',
                steer: Number(steer.toFixed(3)),
                throttle: inAttackRange ? 0.0 : 0.65,
                brake: inAttackRange,
                attack: inAttackRange,
                jump: false,
                target: { x: threatPos.x, z: threatPos.z },
                guarding: true,
                threatTarget: guardThreat.enemy,
                restReason: restState.reason,
                distanceToHuman: Number(distXZ(botPos, humanPos).toFixed(2)),
                reason: `guarding-human-${restState.reason}`,
            };
        }

        // No imminent threat: Mooring & Waiting Formation around human / platform / shop
        let dockTarget;
        if (restState.reason === 'sanctuary' && restState.platform) {
            // Anchor alongside the sanctuary platform perimeter
            const plat = restState.platform;
            const platX = plat.x ?? plat.position?.x ?? 0;
            const platZ = plat.z ?? plat.position?.z ?? 0;
            const platW = (plat.width || 12) * 0.5;
            // Slot beside the platform
            const offsetSide = (botIndex % 2 === 0) ? -platW - 2.5 : platW + 2.5;
            dockTarget = {
                x: clamp(platX + offsetSide, -riverHalfWidth + 2.0, riverHalfWidth - 2.0),
                z: platZ + (botIndex * 3.0),
            };
        } else if (restState.reason === 'shop') {
            // Dock alongside harbor city shop zone
            const shopTargetZ = typeof zShop === 'number' ? zShop : ((zShop?.minZ + zShop?.maxZ) * 0.5 || -200);
            dockTarget = {
                x: clamp(humanPos.x + (botIndex % 2 === 0 ? -4.0 : 4.0), -riverHalfWidth + 2.0, riverHalfWidth - 2.0),
                z: shopTargetZ + (botIndex * 3.5),
            };
        } else {
            // Anchored: Form defensive circle/perimeter around the anchored raft
            const angle = (botIndex * (Math.PI / 2)) + Math.PI * 0.25;
            const orbitR = 6.0;
            dockTarget = {
                x: clamp(humanPos.x + Math.sin(angle) * orbitR, -riverHalfWidth + 2.0, riverHalfWidth - 2.0),
                z: humanPos.z + Math.cos(angle) * orbitR,
            };
        }

        const dxDock = dockTarget.x - botPos.x;
        const dzDock = dockTarget.z - botPos.z;
        const distToDock = Math.hypot(dxDock, dzDock);

        // If close to docking spot, apply full brakes and hold position
        const arrived = distToDock < 3.0;
        const steer = arrived ? 0 : clamp(dxDock * 0.4, -1.0, 1.0);

        return {
            state: arrived ? 'waiting_docked' : 'docking_approach',
            steer: Number(steer.toFixed(3)),
            throttle: arrived ? 0.0 : clamp(distToDock / 10.0, 0.2, 0.6),
            brake: arrived,
            attack: false,
            jump: false,
            target: dockTarget,
            guarding: true,
            threatTarget: null,
            restReason: restState.reason,
            distanceToHuman: Number(distXZ(botPos, humanPos).toFixed(2)),
            reason: `holding-at-${restState.reason}`,
        };
    }

    // =========================================================================
    // BRANCH B: CRUISING FORMATION (DOWNRIVER FLANK FORMATION 8m-14m)
    // =========================================================================
    // If an enemy is in close combat range while cruising, companion defends!
    if (guardThreat && guardThreat.distance <= 12.0) {
        const threatPos = guardThreat.position;
        const dx = threatPos.x - botPos.x;
        const inAttackRange = guardThreat.distance <= COMPANION_AI_CONFIG.waiting.attackRange;

        return {
            state: 'combat_defend',
            steer: Number(clamp(dx * 0.4, -1.0, 1.0).toFixed(3)),
            throttle: inAttackRange ? 0.3 : 0.8,
            brake: false,
            attack: inAttackRange,
            jump: false,
            target: { x: threatPos.x, z: threatPos.z },
            guarding: true,
            threatTarget: guardThreat.enemy,
            distanceToHuman: Number(distXZ(botPos, humanPos).toFixed(2)),
            reason: 'engaging-flank-threat',
        };
    }

    // Cruising Flank Slot Calculation (8m-14m envelope)
    const flankSlot = computeFlankPosition(humanPos, botIndex, riverHalfWidth);
    const targetX = flankSlot.x;
    let targetZ = flankSlot.z;

    // Hard Rule: Companion bots must NEVER blindly race downriver ahead of human player!
    // Downriver direction is negative Z.
    // If bot position Z is ahead of human player (botPos.z < humanPos.z - aheadClampToleranceZ),
    // companion must immediately brake and wait for the human to catch up.
    const isRacingAhead = botPos.z < (humanPos.z - COMPANION_AI_CONFIG.formation.aheadClampToleranceZ);

    if (isRacingAhead) {
        // Clamp downriver target to match human position Z or trail behind it
        targetZ = humanPos.z + COMPANION_AI_CONFIG.formation.rearTrailingZ;
        const dx = targetX - botPos.x;

        return {
            state: 'tether_brake',
            steer: Number(clamp(dx * 0.3, -1.0, 1.0).toFixed(3)),
            throttle: 0.0,
            brake: true, // Emergency brake to prevent surging ahead of human
            attack: false,
            jump: false,
            target: { x: targetX, z: targetZ },
            guarding: false,
            threatTarget: null,
            distanceToHuman: Number(distXZ(botPos, humanPos).toFixed(2)),
            racingAheadBlocked: true,
            reason: 'braking-lead-clamped',
        };
    }

    // Standard Cruising: steer toward flank slot
    const dx = targetX - botPos.x;
    const dz = targetZ - botPos.z;
    const distToSlot = Math.hypot(dx, dz);

    const steer = clamp(dx * 0.35, -1.0, 1.0);
    // Smooth throttle matching distance to slot
    const throttle = clamp(distToSlot / 8.0, 0.4, 1.0);

    return {
        state: 'flank_cruise',
        steer: Number(steer.toFixed(3)),
        throttle: Number(throttle.toFixed(3)),
        brake: false,
        attack: false,
        jump: false,
        target: { x: targetX, z: targetZ },
        guarding: false,
        threatTarget: null,
        distanceToHuman: Number(distXZ(botPos, humanPos).toFixed(2)),
        flankDistance: flankSlot.distance,
        reason: 'cruising-flank-formation',
    };
}
