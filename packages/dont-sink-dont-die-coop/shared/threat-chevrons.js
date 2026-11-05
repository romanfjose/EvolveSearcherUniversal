/**
 * Don't Sink, Don't Die — Center-Reticle Threat & Whirlpool Warning Chevrons
 *
 * Implements Helmet 01's Cockpit Pilot Directives:
 * - Visceral peripheral awareness right in the center reticle (160px diameter circle, 80px radius).
 * - Zero cognitive hunt: pilot tracks flank attacks without moving eyes away from the raft.
 * - Computes screen-space angles and urgency weights (0.0 to 1.0) for:
 *     1. Incoming enemies (river wizards, mud aliens, charging leviathans, kraken tentacles).
 *     2. Wizard fireballs / hostile projectile attacks.
 *     3. Waterfall drops / dangerous drop-offs and ramps.
 *     4. Swirling whirlpools / vortex suction fields.
 * - Filters, prioritizes, and limits output to at most 4 high-signal directional chevrons.
 *
 * Zero external dependencies, pure deterministic math, safe for Node test harnesses and browser runtimes.
 */

export const CHEVRON_CONFIG = {
    MAX_RANGE_METERS: 45.0,              // Threat radar sensory ceiling around the raft (45m)
    CENTER_CIRCLE_DIAMETER_PX: 160.0,   // Reticle circle diameter
    CENTER_CIRCLE_RADIUS_PX: 80.0,      // Reticle circle radius
    MAX_ACTIVE_CHEVRONS: 4,             // Top-K high-signal threats shown simultaneously
    ANGULAR_MERGE_THRESHOLD_RAD: 0.18,  // ~10 degrees: cluster threats coming from the exact same bearing
    DEFAULT_RETICLE_RADIUS: 80.0,
};

/**
 * Visual profiles, priority tiers, and color schemes for cockpit chevrons.
 */
export const CHEVRON_THREAT_TYPES = {
    ENEMY: {
        type: 'enemy',
        name: 'Incoming Enemy',
        color: '#ef4444',        // Crimson Red
        pulseSpeed: 4.0,
        basePriority: 1.0,
        icon: 'skull',
    },
    FIREBALL: {
        type: 'fireball',
        name: 'Wizard Fireball',
        color: '#f97316',        // Incendiary Orange
        pulseSpeed: 7.0,
        basePriority: 1.2,
        icon: 'fire',
    },
    WHIRLPOOL: {
        type: 'whirlpool',
        name: 'Abyssal Whirlpool',
        color: '#a855f7',        // Vortex Purple / Violet
        pulseSpeed: 3.5,
        basePriority: 1.1,
        icon: 'whirlpool',
    },
    WATERFALL: {
        type: 'waterfall',
        name: 'Waterfall Drop',
        color: '#38bdf8',        // Rushing Water Cyan
        pulseSpeed: 2.5,
        basePriority: 0.9,
        icon: 'drop',
    },
};

/**
 * Utility clamp helper.
 */
export function clamp(v, min, max) {
    if (Number.isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
}

/**
 * Computes the relative world offset from observer to target.
 */
export function getRelativeOffset(observerPos, targetPos) {
    const ox = Number(observerPos?.x) || 0;
    const oz = Number(observerPos?.z) || 0;
    const tx = Number(targetPos?.x) || 0;
    const tz = Number(targetPos?.z) || 0;

    const dx = tx - ox;
    const dz = tz - oz;
    const distance = Math.hypot(dx, dz);

    return { dx, dz, distance };
}

/**
 * Transforms world offset (dx, dz) into player heading-relative radar/screen coords.
 * In radar/cockpit space:
 *   Heading (yaw = 0) is downriver along world -z.
 *   +y: forward (ahead of raft)
 *   +x: starboard (right of raft)
 *
 * Screen-space coordinates:
 *   Screen Center is (0, 0).
 *   Screen -Y is Up (ahead), Screen +Y is Down (behind).
 *   Screen +X is Right (starboard), Screen -X is Left (port).
 */
export function transformToHeadingSpace(dx, dz, playerYaw = 0) {
    const yaw = Number(playerYaw) || 0;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    // Forward component along raft nose:
    const forward = -dx * sinY - dz * cosY;
    // Starboard (lateral right) component:
    const right = dx * cosY - dz * sinY;

    return { right, forward };
}

/**
 * Computes screen-space angle (radians and degrees) and unit circle vector from relative offset.
 * angleRad: 0 = straight ahead (top/north), PI/2 = right (starboard), PI/-PI = behind (stern), -PI/2 = left (port).
 */
export function calculateScreenSpaceAngle(dx, dz, playerYaw = 0) {
    const { right, forward } = transformToHeadingSpace(dx, dz, playerYaw);

    // uiX = right
    // uiY = -forward (since top of screen is -Y)
    const uiX = right;
    const uiY = -forward;

    // Angle where 0 is straight ahead (uiX=0, uiY=-1): Math.atan2(uiX, -uiY)
    let angleRad = Math.atan2(uiX, -uiY);
    if (Number.isNaN(angleRad)) angleRad = 0;

    const angleDeg = (angleRad * 180 / Math.PI + 360) % 360;

    return {
        angleRad,
        angleDeg,
        right,
        forward,
        dirX: Math.sin(angleRad),
        dirY: -Math.cos(angleRad),
    };
}

/**
 * Computes urgency weight [0.0, 1.0] for a threat based on distance, threat type,
 * velocity towards raft, and hazard parameters.
 *
 * Urgency increases as:
 *   1. Distance decreases from MAX_RANGE_METERS (45m) down to 0m.
 *   2. Velocity approaches raft (e.g. projectile or charging enemy).
 *   3. Whirlpool vortex radius / suction intensity.
 *   4. Waterfall proximity.
 */
export function computeUrgencyWeight(threat, distance, options = {}) {
    const maxRange = options.maxRangeMeters ?? CHEVRON_CONFIG.MAX_RANGE_METERS;
    if (distance > maxRange || distance < 0 || Number.isNaN(distance)) {
        return 0.0;
    }

    // Distance factor: 0.0 at maxRange, 1.0 at 0m distance.
    const distanceFactor = 1.0 - (distance / maxRange);

    const typeKey = (threat.type || 'enemy').toUpperCase();
    const profile = CHEVRON_THREAT_TYPES[typeKey] || CHEVRON_THREAT_TYPES.ENEMY;
    let urgency = distanceFactor * profile.basePriority;

    // Additional modifiers by threat type:
    if (profile.type === 'fireball') {
        // High urgency projectile: closer than 25m escalates sharply
        if (distance < 25) {
            urgency += 0.25 * (1.0 - distance / 25);
        }
        if (threat.speed && threat.speed > 10) {
            urgency += 0.15;
        }
    } else if (profile.type === 'whirlpool') {
        // Suction danger: if inside or near whirlpool danger radius
        const wpRadius = threat.radius || 15.0;
        if (distance <= wpRadius) {
            urgency += 0.3;
        } else if (distance <= wpRadius * 1.5) {
            urgency += 0.15;
        }
    } else if (profile.type === 'waterfall') {
        // Drop-off danger: sharp spike within 20m
        if (distance < 20) {
            urgency += 0.2;
        }
    } else if (profile.type === 'enemy') {
        // High HP or charging state increases urgency
        if (threat.isCharging) {
            urgency += 0.3;
        }
        if (threat.isBoss) {
            urgency += 0.25;
        }
    }

    return clamp(urgency, 0.0, 1.0);
}

/**
 * Evaluates a single candidate threat relative to raft observer and generates a chevron descriptor.
 * Returns null if threat is outside range (> 45m) or invalid.
 */
export function evaluateThreatChevron(raftPos, threat, playerYaw = 0, options = {}) {
    if (!threat || typeof threat !== 'object') return null;

    const maxRange = options.maxRangeMeters ?? CHEVRON_CONFIG.MAX_RANGE_METERS;
    const radiusPx = options.reticleRadiusPx ?? CHEVRON_CONFIG.CENTER_CIRCLE_RADIUS_PX;

    // Extract position: support threat.position or direct threat.x/z
    const targetPos = threat.position ? threat.position : threat;
    const { dx, dz, distance } = getRelativeOffset(raftPos, targetPos);

    if (distance > maxRange || Number.isNaN(distance)) {
        return null;
    }

    const { angleRad, angleDeg, right, forward, dirX, dirY } = calculateScreenSpaceAngle(dx, dz, playerYaw);
    const urgency = computeUrgencyWeight(threat, distance, { maxRangeMeters: maxRange });

    if (urgency <= 0.0) {
        return null;
    }

    const typeKey = (threat.type || 'enemy').toUpperCase();
    const profile = CHEVRON_THREAT_TYPES[typeKey] || CHEVRON_THREAT_TYPES.ENEMY;

    // Point on the 160px reticle circle (radius 80px):
    const reticleX = dirX * radiusPx;
    const reticleY = dirY * radiusPx;

    // Sanitize -0 to 0
    const cleanNum = (n) => (Object.is(n, -0) ? 0 : n);

    return {
        id: threat.id || `threat_${Math.random().toString(36).slice(2, 7)}`,
        type: profile.type,
        name: threat.name || profile.name,
        color: threat.color || profile.color,
        icon: profile.icon,
        distance: cleanNum(Number(distance.toFixed(1))),
        angleRad: cleanNum(Number(angleRad.toFixed(4))),
        angleDeg: cleanNum(Number(angleDeg.toFixed(1))),
        urgency: cleanNum(Number(urgency.toFixed(3))),
        reticleX: cleanNum(Number(reticleX.toFixed(2))),
        reticleY: cleanNum(Number(reticleY.toFixed(2))),
        radiusPx,
        isBehind: forward < 0,
        isFlank: Math.abs(right) > Math.abs(forward),
        rawThreat: threat,
    };
}

/**
 * Ingests arrays of threats (enemies, fireballs, waterfalls, whirlpools),
 * evaluates screen-space positions and urgency weights, deduplicates close angular clusters,
 * sorts by urgency, and outputs at most 4 high-signal directional chevrons.
 *
 * @param {object} raft - Raft object with position {x, y, z} and optional yaw
 * @param {object} hazards - Container of active river entities
 *   hazards.enemies: Array of enemy objects
 *   hazards.fireballs: Array of projectile / fireball objects
 *   hazards.waterfalls: Array of waterfall drop / ramp objects
 *   hazards.whirlpools: Array of whirlpool objects
 * @param {number} [yawOverride] - Raft yaw heading override in radians
 * @param {object} [options] - Options overrides (maxChevrons, reticleRadiusPx, maxRangeMeters)
 * @returns {Array<object>} Up to 4 directional threat chevron descriptors
 */
export function calculateThreatChevrons(raft, hazards = {}, yawOverride = null, options = {}) {
    if (!raft || !raft.position) {
        return [];
    }

    const maxChevrons = options.maxChevrons ?? CHEVRON_CONFIG.MAX_ACTIVE_CHEVRONS;
    const playerYaw = yawOverride !== null ? yawOverride : (raft.yaw || 0);

    const candidates = [];

    // 1. Process Enemies
    const enemies = hazards.enemies || hazards.threats || [];
    for (let i = 0; i < enemies.length; i++) {
        const item = enemies[i];
        if (!item) continue;
        const threatObj = item.type ? item : { ...item, type: 'enemy' };
        const evaluated = evaluateThreatChevron(raft.position, threatObj, playerYaw, options);
        if (evaluated) candidates.push(evaluated);
    }

    // 2. Process Fireballs / Projectiles
    const fireballs = hazards.fireballs || hazards.projectiles || [];
    for (let i = 0; i < fireballs.length; i++) {
        const item = fireballs[i];
        if (!item) continue;
        const threatObj = { ...item, type: 'fireball' };
        const evaluated = evaluateThreatChevron(raft.position, threatObj, playerYaw, options);
        if (evaluated) candidates.push(evaluated);
    }

    // 3. Process Whirlpools
    const whirlpools = hazards.whirlpools || [];
    for (let i = 0; i < whirlpools.length; i++) {
        const item = whirlpools[i];
        if (!item) continue;
        const threatObj = { ...item, type: 'whirlpool' };
        const evaluated = evaluateThreatChevron(raft.position, threatObj, playerYaw, options);
        if (evaluated) candidates.push(evaluated);
    }

    // 4. Process Waterfalls / Ramps / Drops
    const waterfalls = hazards.waterfalls || hazards.drops || [];
    for (let i = 0; i < waterfalls.length; i++) {
        const item = waterfalls[i];
        if (!item) continue;
        const threatObj = { ...item, type: 'waterfall' };
        const evaluated = evaluateThreatChevron(raft.position, threatObj, playerYaw, options);
        if (evaluated) candidates.push(evaluated);
    }

    if (candidates.length === 0) {
        return [];
    }

    // Sort descending by urgency weight
    candidates.sort((a, b) => b.urgency - a.urgency);

    // Angular deduplication: avoid stacking 2 chevrons within ~10 degrees
    const thresholdRad = options.angularThresholdRad ?? CHEVRON_CONFIG.ANGULAR_MERGE_THRESHOLD_RAD;
    const filtered = [];

    for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        let tooClose = false;

        for (let j = 0; j < filtered.length; j++) {
            const chosen = filtered[j];
            let diff = Math.abs(cand.angleRad - chosen.angleRad);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;

            if (diff < thresholdRad) {
                tooClose = true;
                break;
            }
        }

        if (!tooClose) {
            filtered.push(cand);
            if (filtered.length >= maxChevrons) {
                break;
            }
        }
    }

    return filtered;
}

/**
 * Formats chevron data for immediate Canvas 2D or SVG rendering.
 * Provides normalized SVG path string, scale, and opacity values for high-visibility visual punch.
 */
export function formatChevronRenderSpec(chevron, timestampMs = 0) {
    if (!chevron) return null;

    const pulse = 0.85 + 0.15 * Math.sin((timestampMs / 1000) * 8.0 * chevron.urgency);
    const opacity = clamp(0.4 + 0.6 * chevron.urgency, 0.3, 1.0);
    const scale = clamp(0.8 + 0.4 * chevron.urgency * pulse, 0.8, 1.3);

    // Chevron SVG path centered at (0, 0), pointing up (0 rad):
    // Standard chevron V-shape: M -8,6 L 0,-6 L 8,6 L 0,1 Z
    const path = 'M -9 7 L 0 -7 L 9 7 L 0 1 Z';

    return {
        ...chevron,
        render: {
            svgPath: path,
            opacity: Number(opacity.toFixed(3)),
            scale: Number(scale.toFixed(3)),
            pulse: Number(pulse.toFixed(3)),
            rotationDeg: chevron.angleDeg,
        },
    };
}
