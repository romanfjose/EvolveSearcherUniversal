// Pure coordinate projector and threat radar mathematics for Don't Sink, Don't Die.
// Zero external dependencies, fully deterministic, safe for both Node.js unit tests and browser Canvas/SVG rendering.

import { RIVER, FINISH_Z, CHECKPOINTS, SHOP_ZONE, clamp } from './game-core.js';

export const RADAR_CONFIG = {
    defaultRadarRadius: 100, // World units (meters) around the player covered by circular radar
    maxOffscreenIndicatorDist: 250, // Beyond this distance, threats are out of sensor range
    radarUiRadius: 80, // Default pixel radius of the radar circle on canvas
    channelHalfWidth: RIVER?.channelHalfWidth ?? 15,
    finishZ: FINISH_Z ?? -1500,
    checkpoints: CHECKPOINTS ?? [-150, -300, -450, -600, -750, -900, -1050, -1200],
    shopZone: SHOP_ZONE ?? { minX: 10, minZ: -250, maxZ: -150 },
};

/**
 * Projects a world Z coordinate along the river into a normalized [0, 1] river progress value.
 * 0 = river start (z = 0), 1 = river finish mouth (z = finishZ).
 * Extensible past finishZ (can exceed 1 if clampToFinish is false).
 */
export function projectRiverProgress(z, finishZ = RADAR_CONFIG.finishZ, clampToFinish = true) {
    if (finishZ === 0) return 0;
    const progress = z / finishZ;
    return clampToFinish ? clamp(progress, 0, 1) : progress;
}

/**
 * Converts a normalized river progress [0, 1] to vertical minimap progress pixel coordinate.
 * top-down: y = 0 is start, y = height is finish; or flipped if inverted = true (bottom is start, top is finish).
 */
export function riverProgressToPixel(progress, trackHeight, inverted = true) {
    const p = clamp(progress, 0, 1);
    return inverted ? (1 - p) * trackHeight : p * trackHeight;
}

/**
 * Projects a world position (x, z) to a 2D vertical progress map coordinate {x, y}.
 * channelWidth: river width in world coordinates.
 * mapWidth, mapHeight: UI dimensions of the vertical progress bar.
 * inverted: if true (default), start (z=0) is at the bottom, finish (z=finishZ) is at top.
 */
export function projectToVerticalMap(worldPos, mapWidth, mapHeight, {
    channelHalfWidth = RADAR_CONFIG.channelHalfWidth,
    finishZ = RADAR_CONFIG.finishZ,
    inverted = true,
} = {}) {
    const xRatio = (worldPos.x + channelHalfWidth) / (2 * channelHalfWidth);
    const clampedXRatio = clamp(xRatio, 0, 1);
    const uiX = clampedXRatio * mapWidth;

    const progress = projectRiverProgress(worldPos.z, finishZ, false);
    const uiY = riverProgressToPixel(progress, mapHeight, inverted);

    return {
        x: uiX,
        y: uiY,
        progress,
        isWithinBounds: xRatio >= 0 && xRatio <= 1 && progress >= 0 && progress <= 1,
    };
}

/**
 * Computes the relative displacement vector and distance from the player to a target entity.
 * Positive dx: entity is to the right of the player (in world space).
 * Positive dz: entity is upriver (behind the player in downriver travel).
 */
export function getRelativeVector(playerPos, targetPos) {
    const dx = targetPos.x - playerPos.x;
    const dz = targetPos.z - playerPos.z;
    const distance = Math.hypot(dx, dz);
    return { dx, dz, distance };
}

/**
 * Transforms a world-relative offset (dx, dz) into player heading-relative radar space.
 * In radar space:
 *   +Y is forward (in the direction of the raft heading).
 *   +X is starboard (to the right of the raft heading).
 * playerYaw: raft yaw in radians (0 = downriver along world -z).
 */
export function transformToRadarCoords(dx, dz, playerYaw = 0) {
    // Raft forward is world -z: heading vector is (-sin(yaw), -cos(yaw)).
    // Forward component: -dx * sin(yaw) - dz * cos(yaw)
    // Starboard (right) component: dx * cos(yaw) - dz * sin(yaw)
    const cosY = Math.cos(playerYaw);
    const sinY = Math.sin(playerYaw);

    const relRight = dx * cosY - dz * sinY;
    const relForward = -dx * sinY - dz * cosY;

    return {
        x: relRight,     // + right
        y: relForward,   // + forward (ahead of raft)
    };
}

/**
 * Projects a target world position onto the tactical circular radar display.
 * Returns radar Cartesian coords {x, y} scaled to radarUiRadius,
 * polar coords {angle, distance, normalizedDist}, and whether it's within radar boundary.
 */
export function projectToRadar(playerPos, targetPos, playerYaw = 0, {
    worldRadarRadius = RADAR_CONFIG.defaultRadarRadius,
    uiRadius = RADAR_CONFIG.radarUiRadius,
} = {}) {
    const { dx, dz, distance } = getRelativeVector(playerPos, targetPos);
    const radarPos = transformToRadarCoords(dx, dz, playerYaw);

    const scale = uiRadius / worldRadarRadius;
    const uiX = radarPos.x * scale;
    // On screen/canvas, screen +Y is downwards, so forward (+radarPos.y) is screen -Y:
    const uiY = -radarPos.y * scale;

    const isInside = distance <= worldRadarRadius;
    // Screen angle where 0 is up (-Y), PI/2 is right (+X), PI is down (+Y), -PI/2 is left (-X):
    const angle = Math.atan2(uiX, -uiY);

    return {
        x: uiX,
        y: uiY,
        worldDistance: distance,
        normalizedDist: distance / worldRadarRadius,
        isInside,
        angle,
    };
}

/**
 * Calculates off-screen threat indicator parameters.
 * When a threat is beyond worldRadarRadius (or off-screen), an indicator arrow/wedge
 * is clamped to the outer rim of the radar circle (or rectangular boundary).
 */
export function calculateOffscreenArrow(playerPos, targetPos, playerYaw = 0, {
    worldRadarRadius = RADAR_CONFIG.defaultRadarRadius,
    maxDetectionDist = RADAR_CONFIG.maxOffscreenIndicatorDist,
    uiRadius = RADAR_CONFIG.radarUiRadius,
    rimPadding = 4,
} = {}) {
    const radar = projectToRadar(playerPos, targetPos, playerYaw, { worldRadarRadius, uiRadius });
    const clampedUiRadius = uiRadius - rimPadding;

    // Angle on screen: 0 is straight ahead (up), PI is behind (down)
    const angle = radar.angle;

    // Position along the circular perimeter
    const edgeX = Math.sin(angle) * clampedUiRadius;
    const edgeY = -Math.cos(angle) * clampedUiRadius;

    // Threat proximity ratio: 0 (at radar edge) to 1 (at player / immediate danger)
    // or from edge outwards to maxDetectionDist:
    const threatRange = Math.max(1, maxDetectionDist - worldRadarRadius);
    const excessDist = Math.max(0, radar.worldDistance - worldRadarRadius);
    const fadeRatio = clamp(1 - excessDist / threatRange, 0, 1);

    // Is it a rear threat (behind the raft)?
    // In radar coords, radar.y < 0 means behind the player.
    const isBehind = Math.cos(angle) < 0;

    return {
        isOffscreen: !radar.isInside,
        angle, // angle in radians pointing towards threat
        edgeX,
        edgeY,
        distance: radar.worldDistance,
        fadeRatio,
        isBehind,
        inDetectionRange: radar.worldDistance <= maxDetectionDist,
    };
}

/**
 * Categorizes a threat entity and determines radar color, priority, and icon badge.
 */
export const THREAT_PROFILES = {
    whiteGuy: {
        id: 'whiteGuy',
        name: 'River Wizard',
        icon: 'wizard',
        color: '#38bdf8', // Arcane Cyan
        priority: 2,
        isRearThreat: true,
    },
    mudAlien: {
        id: 'mudAlien',
        name: 'Mud Alien',
        icon: 'mud-alien',
        color: '#a3e635', // Sludge Lime
        priority: 2,
        isRearThreat: true,
    },
    longWorm: {
        id: 'longWorm',
        name: 'Abyssal Leviathan',
        icon: 'worm',
        color: '#f87171', // Danger Crimson
        priority: 3,
        isRearThreat: true,
    },
    kraken: {
        id: 'kraken',
        name: 'Dread Kraken',
        icon: 'kraken',
        color: '#c084fc', // Abyssal Purple
        priority: 4,
        isRearThreat: false,
    },
    police: {
        id: 'police',
        name: 'Harbor Police',
        icon: 'police',
        color: '#3b82f6', // Cobalt
        priority: 1,
        isRearThreat: false,
    },
    default: {
        id: 'unknown',
        name: 'Unknown Threat',
        icon: 'hazard',
        color: '#f59e0b', // Amber
        priority: 1,
        isRearThreat: false,
    },
};

export function getThreatProfile(type) {
    return THREAT_PROFILES[type] || THREAT_PROFILES.default;
}

/**
 * Calculates vector strike trajectory lines for the Long Worm (or any charging threat).
 * Returns the start and end point in radar UI coordinates.
 */
export function calculateChargingVector(playerPos, wormPos, targetPos, playerYaw = 0, {
    worldRadarRadius = RADAR_CONFIG.defaultRadarRadius,
    uiRadius = RADAR_CONFIG.radarUiRadius,
} = {}) {
    if (!targetPos) return null;

    const startRadar = projectToRadar(playerPos, wormPos, playerYaw, { worldRadarRadius, uiRadius });
    const endRadar = projectToRadar(playerPos, targetPos, playerYaw, { worldRadarRadius, uiRadius });

    // Strike direction angle
    const strikeDx = targetPos.x - wormPos.x;
    const strikeDz = targetPos.z - wormPos.z;
    const strikeDist = Math.hypot(strikeDx, strikeDz);

    return {
        startX: startRadar.x,
        startY: startRadar.y,
        endX: endRadar.x,
        endY: endRadar.y,
        strikeDist,
        startInside: startRadar.isInside,
        endInside: endRadar.isInside,
    };
}

/**
 * Multi-phase Boss Health Bar calculations.
 * For boss encounters with phase divisions (e.g. 3 phases at 100%..66%..33%..0%).
 */
export function calculateBossHealthPhases(health, maxHealth, {
    phases = 3,
    enrageThreshold = 0.25,
} = {}) {
    const totalMax = Math.max(1, maxHealth);
    const curHp = clamp(health, 0, totalMax);
    const healthRatio = curHp / totalMax;
    const healthPercent = healthRatio * 100;

    // Phase dividers as fractional positions across the bar [0, 1]
    const dividers = [];
    for (let i = 1; i < phases; i++) {
        dividers.push(i / phases);
    }

    // Determine current phase (1 is first phase at full HP, `phases` is final phase)
    // e.g. 3 phases: >0.666 = phase 1; >0.333 = phase 2; <=0.333 = phase 3
    let currentPhase = 1;
    for (let i = phases; i >= 1; i--) {
        const lowerBound = (i - 1) / phases;
        if (healthRatio > lowerBound || (i === 1 && healthRatio === 0)) {
            currentPhase = (phases - i + 1);
            break;
        }
    }

    // Calculate segment fill for each individual phase segment
    const segmentWidth = 1 / phases;
    const segmentFills = [];
    for (let p = 0; p < phases; p++) {
        const segStart = p * segmentWidth;
        const segEnd = (p + 1) * segmentWidth;
        if (healthRatio >= segEnd) {
            segmentFills.push(1);
        } else if (healthRatio <= segStart) {
            segmentFills.push(0);
        } else {
            segmentFills.push((healthRatio - segStart) / segmentWidth);
        }
    }

    const isEnraged = healthRatio > 0 && healthRatio <= enrageThreshold;
    const isDefeated = curHp <= 0;

    return {
        health: curHp,
        maxHealth: totalMax,
        healthRatio,
        healthPercent,
        currentPhase,
        totalPhases: phases,
        dividers,
        segmentFills,
        isEnraged,
        isDefeated,
    };
}

/**
 * Filter and query landmark features (checkpoints, shop, crates) visible along the canyon track
 * or within radar distance.
 */
export function getLandmarksInView(playerZ, viewDistanceZ = 400, {
    checkpoints = RADAR_CONFIG.checkpoints,
    shopZone = RADAR_CONFIG.shopZone,
    finishZ = RADAR_CONFIG.finishZ,
} = {}) {
    // Checkpoints within view distance (ahead downriver: z < playerZ, or just crossed: z > playerZ)
    const activeCheckpoints = checkpoints
        .filter((cpZ) => Math.abs(cpZ - playerZ) <= viewDistanceZ)
        .map((cpZ, idx) => ({
            index: idx + 1,
            z: cpZ,
            distance: cpZ - playerZ, // negative is ahead downriver
            passed: playerZ <= cpZ,
        }));

    // Harbor shop zone overlap
    const inShop = playerZ <= shopZone.maxZ && playerZ >= shopZone.minZ;
    const approachingShop = playerZ > shopZone.maxZ && (shopZone.maxZ - playerZ) >= -viewDistanceZ;

    // Finish line
    const finishDistance = finishZ - playerZ;
    const nearFinish = Math.abs(finishDistance) <= viewDistanceZ;

    return {
        checkpoints: activeCheckpoints,
        shop: {
            inZone: inShop,
            approaching: approachingShop,
            minZ: shopZone.minZ,
            maxZ: shopZone.maxZ,
        },
        finish: {
            z: finishZ,
            distance: finishDistance,
            near: nearFinish,
        },
    };
}
