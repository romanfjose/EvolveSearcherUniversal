/**
 * Don't Sink, Don't Die — Co-Op Tow-Rope & Teammate Winch Physics
 * (`shared/coop-tow-winch.js`)
 *
 * Helmet 01 (Cockpit Pilot) & Helmet 02 (RTS Flight Engineer):
 * - Authoritative physical tow-line and rescue winch mechanics for co-op play.
 * - Allows a lead raft to hitch a lagging, immobilized, or damaged teammate and
 *   tow them toward safety (Sanctuary Platforms, Harbor City Calm Pier, or checkpoint gates).
 * - Implements dual-ended spring-damper tension dynamics with realistic cable sag/slack,
 *   motorized winch reeling (retract/extend), tension strain limits, and elastic snap protection.
 * - Exports:
 *     * `attachTowRope(leader, follower, options)`
 *     * `stepTowRopePhysics(leader, follower, dt, options)`
 *     * `releaseTowRope(pair)`
 *     * Additional helper utilities: `createTowRopePair`, `setWinchMode`, `getTowRopeStatus`
 * - Zero external dependencies, pure deterministic ES module, NaN-proof, safe for 60Hz loops.
 */

/**
 * Standard configuration constants for tow-rope and rescue winch physics.
 */
export const TOW_WINCH_CONFIG = Object.freeze({
    DEFAULT_REST_LENGTH: 10.0,       // Nominal untensioned cable length in meters
    MIN_REST_LENGTH: 3.5,            // Fully winched-in minimum tether length in meters
    MAX_REST_LENGTH: 28.0,           // Maximum spool unspool length in meters
    BREAKING_STRAIN_LENGTH: 36.0,    // Cable snaps if stretched beyond this length in meters
    MAX_BREAKING_TENSION: 1800.0,    // Maximum tension force (N) before rope snaps
    SPRING_STIFFNESS: 140.0,         // k (N/m): Hooke's law elastic stiffness when taut
    DAMPING_COEFFICIENT: 24.0,       // c (N·s/m): Viscous damping coefficient along cable axis
    WINCH_REEL_SPEED: 4.5,           // Motorized winch retraction/spooling speed (m/s)
    WINCH_PAYOUT_SPEED: 6.0,         // Payout / extension speed (m/s)
    DEFAULT_RAFT_MASS: 5.0,          // Default craft mass (matching PLAYER.mass = 5)
    LEADER_COUNTER_MASS_RATIO: 0.4,  // Fraction of tow reaction force transferred back to leader
    MIN_TENSION_SNAP_THRESHOLD: 0.05,// Tension below this value is considered slack
    WATER_DRAG_COUPLING: 0.15,       // Additional damping transferred through water wake coupling
});

/**
 * Winch motor operating modes.
 */
export const WINCH_MODES = Object.freeze({
    IDLE: 'idle',           // Fixed cable length
    REEL_IN: 'reel_in',     // Motorized winch pulling follower closer
    PAY_OUT: 'pay_out',     // Controlled slack payout to increase distance
    FREE_SPOOL: 'free_spool'// Unresisted extension up to max rest length
});

/**
 * Cable physical tension states.
 */
export const ROPE_STATES = Object.freeze({
    ATTACHED: 'attached',
    SLACK: 'slack',
    TAUT: 'taut',
    WINCHING: 'winching',
    SNAPPED: 'snapped',
    RELEASED: 'released',
});

/**
 * Sanitizes numeric values to prevent NaN / Infinity contamination in the physics engine.
 */
function sanitize(val, fallback = 0) {
    return (typeof val === 'number' && Number.isFinite(val)) ? val : fallback;
}

/**
 * Safe 3D vector length.
 */
function vec3Len(x, y, z) {
    return Math.hypot(x, y, z);
}

/**
 * Resolves standard craft position {x, y, z} from various entity structures.
 */
function extractPosition(craft) {
    if (!craft) return { x: 0, y: 0.25, z: 0 };
    if (craft.craft?.position) {
        return {
            x: sanitize(craft.craft.position.x),
            y: sanitize(craft.craft.position.y, 0.25),
            z: sanitize(craft.craft.position.z),
        };
    }
    if (craft.position) {
        return {
            x: sanitize(craft.position.x),
            y: sanitize(craft.position.y, 0.25),
            z: sanitize(craft.position.z),
        };
    }
    return {
        x: sanitize(craft.x),
        y: sanitize(craft.y, 0.25),
        z: sanitize(craft.z),
    };
}

/**
 * Resolves standard craft velocity {x, y, z}.
 */
function extractVelocity(craft) {
    if (!craft) return { x: 0, y: 0, z: 0 };
    if (craft.craft?.velocity) {
        return {
            x: sanitize(craft.craft.velocity.x),
            y: sanitize(craft.craft.velocity.y),
            z: sanitize(craft.craft.velocity.z),
        };
    }
    if (craft.velocity) {
        return {
            x: sanitize(craft.velocity.x),
            y: sanitize(craft.velocity.y),
            z: sanitize(craft.velocity.z),
        };
    }
    return {
        x: sanitize(craft.vx),
        y: sanitize(craft.vy),
        z: sanitize(craft.vz),
    };
}

/**
 * Applies delta velocity or force directly to craft object.
 */
function applyVelocityDelta(craft, dvx, dvy, dvz) {
    if (!craft) return;
    const v = craft.craft?.velocity || craft.velocity;
    if (v) {
        v.x = sanitize(v.x + dvx);
        v.y = sanitize(v.y + dvy);
        v.z = sanitize(v.z + dvz);
    } else {
        if (typeof craft.vx === 'number') craft.vx = sanitize(craft.vx + dvx);
        if (typeof craft.vy === 'number') craft.vy = sanitize(craft.vy + dvy);
        if (typeof craft.vz === 'number') craft.vz = sanitize(craft.vz + dvz);
    }
}

/**
 * Creates and attaches a high-tensile tow-rope and winch connection between a leader raft and follower raft.
 *
 * @param {object} leader - Lead watercraft (towing vessel)
 * @param {object} follower - Trailing watercraft (being towed/rescued)
 * @param {object} [options={}] - Custom tow/winch configuration
 * @returns {object} Tow-rope pair attachment state descriptor
 */
export function attachTowRope(leader, follower, options = {}) {
    if (!leader || !follower) {
        throw new Error('attachTowRope requires both leader and follower craft objects.');
    }

    const posLeader = extractPosition(leader);
    const posFollower = extractPosition(follower);
    const initialDistance = Math.max(0.1, vec3Len(
        posLeader.x - posFollower.x,
        posLeader.y - posFollower.y,
        posLeader.z - posFollower.z
    ));

    const restLength = Math.max(
        options.minRestLength ?? TOW_WINCH_CONFIG.MIN_REST_LENGTH,
        Math.min(
            options.maxRestLength ?? TOW_WINCH_CONFIG.MAX_REST_LENGTH,
            options.restLength ?? Math.max(initialDistance, TOW_WINCH_CONFIG.DEFAULT_REST_LENGTH)
        )
    );

    const ropePair = {
        id: options.id || `tow_${leader.id || 'lead'}_to_${follower.id || 'lag'}_${Date.now()}`,
        active: true,
        leaderId: leader.id || 'leader',
        followerId: follower.id || 'follower',
        state: ROPE_STATES.ATTACHED,
        winchMode: options.winchMode || WINCH_MODES.IDLE,
        currentLength: initialDistance,
        restLength,
        minRestLength: options.minRestLength ?? TOW_WINCH_CONFIG.MIN_REST_LENGTH,
        maxRestLength: options.maxRestLength ?? TOW_WINCH_CONFIG.MAX_REST_LENGTH,
        breakingLength: options.breakingLength ?? TOW_WINCH_CONFIG.BREAKING_STRAIN_LENGTH,
        maxBreakingTension: options.maxBreakingTension ?? TOW_WINCH_CONFIG.MAX_BREAKING_TENSION,
        springStiffness: options.springStiffness ?? TOW_WINCH_CONFIG.SPRING_STIFFNESS,
        damping: options.damping ?? TOW_WINCH_CONFIG.DAMPING_COEFFICIENT,
        winchSpeed: options.winchSpeed ?? TOW_WINCH_CONFIG.WINCH_REEL_SPEED,
        leaderCounterMassRatio: options.leaderCounterMassRatio ?? TOW_WINCH_CONFIG.LEADER_COUNTER_MASS_RATIO,
        tension: 0,
        strain: 0,           // (currentLength - restLength) / restLength
        tensionForce: { x: 0, y: 0, z: 0 },
        snapReason: null,
        attachedAt: options.now ?? 0,
        lastUpdated: options.now ?? 0,
        totalTowedDistance: 0,
    };

    // Store reference on follower and leader for easy lookup
    follower.towRope = ropePair;
    follower.isBeingTowed = true;
    follower.towedBy = ropePair.leaderId;

    if (!leader.activeTows) leader.activeTows = [];
    if (!leader.activeTows.includes(ropePair)) {
        leader.activeTows.push(ropePair);
    }

    return ropePair;
}

/**
 * Convenience alias for creating a tow-rope pair.
 */
export const createTowRopePair = attachTowRope;

/**
 * Changes active motorized winch mode (REEL_IN, PAY_OUT, IDLE, FREE_SPOOL).
 *
 * @param {object} pair - Active tow rope pair
 * @param {string} mode - Desired mode from WINCH_MODES
 */
export function setWinchMode(pair, mode) {
    if (!pair) return;
    if (Object.values(WINCH_MODES).includes(mode)) {
        pair.winchMode = mode;
        if (mode === WINCH_MODES.REEL_IN) {
            pair.state = ROPE_STATES.WINCHING;
        }
    }
}

/**
 * Releases and detaches an existing tow-rope connection cleanly.
 *
 * @param {object} pair - Tow-rope pair returned by attachTowRope
 * @param {object} [leader] - Optional leader craft reference
 * @param {object} [follower] - Optional follower craft reference
 * @returns {boolean} True if successfully detached
 */
export function releaseTowRope(pair, leader = null, follower = null) {
    if (!pair) return false;

    pair.active = false;
    pair.state = ROPE_STATES.RELEASED;
    pair.tension = 0;
    pair.tensionForce = { x: 0, y: 0, z: 0 };

    if (follower) {
        if (follower.towRope === pair) follower.towRope = null;
        follower.isBeingTowed = false;
        follower.towedBy = null;
    }

    if (leader && Array.isArray(leader.activeTows)) {
        const idx = leader.activeTows.indexOf(pair);
        if (idx !== -1) {
            leader.activeTows.splice(idx, 1);
        }
    }

    return true;
}

/**
 * Evaluates and steps tow-rope physics and winch mechanics over timestep dt.
 *
 * - Updates motorized winch spooling (shortening or extending rest length).
 * - Computes 3D distance, cable vector, and relative stretch delta.
 * - If cable is slack (distance <= restLength): zero tension, cable sags freely.
 * - If cable is taut (distance > restLength): computes restoring spring force and damping
 *   along the line of tension.
 * - Applies Newton's third law: accelerates follower forward toward leader, and applies
 *   a scaled reaction counter-force to the leader raft.
 * - Enforces breaking strain limits: snaps cable if stretched beyond breaking length or max tension.
 *
 * @param {object} leader - Lead towing craft
 * @param {object} follower - Lagging/rescued craft
 * @param {number} dt - Timestep in seconds (e.g. 0.01666 or 0.05)
 * @param {object} [options={}] - Optional simulation overrides
 * @returns {object} Physics step result { active, tension, tensionForce, state, snapped, distance }
 */
export function stepTowRopePhysics(leader, follower, dt, options = {}) {
    if (!leader || !follower) {
        return { active: false, tension: 0, tensionForce: { x: 0, y: 0, z: 0 }, state: ROPE_STATES.RELEASED };
    }

    // Look up or establish pair state
    const pair = follower.towRope || leader.towRope || options.pair;
    if (!pair || !pair.active) {
        return { active: false, tension: 0, tensionForce: { x: 0, y: 0, z: 0 }, state: pair?.state || ROPE_STATES.RELEASED };
    }

    const safeDt = Math.max(0, sanitize(dt));
    if (safeDt <= 0) {
        return {
            active: pair.active,
            tension: pair.tension,
            tensionForce: { ...pair.tensionForce },
            state: pair.state,
            snapped: false,
            distance: pair.currentLength,
        };
    }

    const posLead = extractPosition(leader);
    const posFollow = extractPosition(follower);
    const velLead = extractVelocity(leader);
    const velFollow = extractVelocity(follower);

    // Vector from follower to leader (direction of pull on follower)
    const dx = posLead.x - posFollow.x;
    const dy = posLead.y - posFollow.y;
    const dz = posLead.z - posFollow.z;
    const distance = vec3Len(dx, dy, dz);
    pair.currentLength = distance;

    // 1. Motorized Winch Reeling Integration
    const winchMode = options.winchMode || pair.winchMode;
    const reelSpeed = sanitize(pair.winchSpeed, TOW_WINCH_CONFIG.WINCH_REEL_SPEED);

    if (winchMode === WINCH_MODES.REEL_IN) {
        pair.restLength = Math.max(pair.minRestLength, pair.restLength - reelSpeed * safeDt);
    } else if (winchMode === WINCH_MODES.PAY_OUT) {
        pair.restLength = Math.min(pair.maxRestLength, pair.restLength + TOW_WINCH_CONFIG.WINCH_PAYOUT_SPEED * safeDt);
    } else if (winchMode === WINCH_MODES.FREE_SPOOL) {
        if (distance > pair.restLength) {
            pair.restLength = Math.min(pair.maxRestLength, distance);
        }
    }

    // 2. Breaking Strain & Snap Checks
    if (distance > pair.breakingLength) {
        pair.active = false;
        pair.snapReason = 'length_exceeded';
        pair.tension = 0;
        pair.tensionForce = { x: 0, y: 0, z: 0 };
        releaseTowRope(pair, leader, follower);
        pair.state = ROPE_STATES.SNAPPED;
        return {
            active: false,
            tension: 0,
            tensionForce: { x: 0, y: 0, z: 0 },
            state: ROPE_STATES.SNAPPED,
            snapped: true,
            snapReason: 'length_exceeded',
            distance,
        };
    }

    // 3. Elastic Spring-Damper Tension Evaluation
    if (distance <= pair.restLength || distance < 1e-4) {
        // Cable is slack: zero restoring force
        pair.state = ROPE_STATES.SLACK;
        pair.tension = 0;
        pair.strain = 0;
        pair.tensionForce = { x: 0, y: 0, z: 0 };
        return {
            active: true,
            tension: 0,
            tensionForce: { x: 0, y: 0, z: 0 },
            state: ROPE_STATES.SLACK,
            snapped: false,
            distance,
        };
    }

    // Normalized unit vector along the cable from follower to leader
    const invDist = 1.0 / distance;
    const nx = dx * invDist;
    const ny = dy * invDist;
    const nz = dz * invDist;

    // Relative stretch (extension beyond rest length)
    const stretch = distance - pair.restLength;
    pair.strain = stretch / pair.restLength;

    // Relative velocity along line of sight: (v_leader - v_follower) · n
    const rvx = velLead.x - velFollow.x;
    const rvy = velLead.y - velFollow.y;
    const rvz = velLead.z - velFollow.z;
    const relSpeedAlongRope = rvx * nx + rvy * ny + rvz * nz;

    // Hooke's elastic restoring tension + linear damping
    // Damping resists relative separation velocity (when moving apart, damping adds tension;
    // when follower moves toward leader faster than leader, damping reduces tension).
    const springForce = pair.springStiffness * stretch;
    const dampingForce = pair.damping * relSpeedAlongRope;
    const rawTension = springForce + dampingForce;

    // Tension can only pull, never push (cables cannot push)
    const netTension = Math.max(0, rawTension);

    // Over-tension snap check
    if (netTension > pair.maxBreakingTension) {
        pair.active = false;
        pair.snapReason = 'tension_exceeded';
        pair.tension = 0;
        pair.tensionForce = { x: 0, y: 0, z: 0 };
        releaseTowRope(pair, leader, follower);
        pair.state = ROPE_STATES.SNAPPED;
        return {
            active: false,
            tension: 0,
            tensionForce: { x: 0, y: 0, z: 0 },
            state: ROPE_STATES.SNAPPED,
            snapped: true,
            snapReason: 'tension_exceeded',
            distance,
        };
    }

    pair.tension = netTension;
    pair.tensionForce = {
        x: nx * netTension,
        y: ny * netTension,
        z: nz * netTension,
    };
    pair.state = (winchMode === WINCH_MODES.REEL_IN) ? ROPE_STATES.WINCHING : ROPE_STATES.TAUT;

    // 4. Force Application & Acceleration Integration
    const followerMass = sanitize(follower.mass, TOW_WINCH_CONFIG.DEFAULT_RAFT_MASS);
    const leaderMass = sanitize(leader.mass, TOW_WINCH_CONFIG.DEFAULT_RAFT_MASS);

    // Follower pulls toward leader: a = F_tension / mass
    const fAccelX = (pair.tensionForce.x / followerMass) * safeDt;
    const fAccelY = (pair.tensionForce.y / followerMass) * safeDt;
    const fAccelZ = (pair.tensionForce.z / followerMass) * safeDt;
    applyVelocityDelta(follower, fAccelX, fAccelY, fAccelZ);

    // Leader experiences reaction counter-force pulling back toward follower
    // Counter-mass ratio models leader's motor/hull resistance in water
    const counterRatio = pair.leaderCounterMassRatio;
    const lAccelX = (-pair.tensionForce.x * counterRatio / leaderMass) * safeDt;
    const lAccelY = (-pair.tensionForce.y * counterRatio / leaderMass) * safeDt;
    const lAccelZ = (-pair.tensionForce.z * counterRatio / leaderMass) * safeDt;
    applyVelocityDelta(leader, lAccelX, lAccelY, lAccelZ);

    // Track total distance towed
    if (netTension > TOW_WINCH_CONFIG.MIN_TENSION_SNAP_THRESHOLD) {
        const followSpeed = vec3Len(velFollow.x, velFollow.y, velFollow.z);
        pair.totalTowedDistance += followSpeed * safeDt;
    }

    return {
        active: true,
        tension: netTension,
        tensionForce: { ...pair.tensionForce },
        state: pair.state,
        snapped: false,
        distance,
        restLength: pair.restLength,
    };
}

/**
 * Checks if a follower raft is currently damaged, stalled, or lagging far behind
 * and in critical need of a tow-rope rescue.
 *
 * @param {object} follower - Craft to evaluate
 * @param {object} [leader] - Lead craft
 * @param {number} [dangerThresholdZ=18.0] - Z distance behind leader
 * @returns {{ needsRescue: boolean, reason: string|null, urgency: number }}
 */
export function evaluateRescueAssistance(follower, leader = null, dangerThresholdZ = 18.0) {
    if (!follower) return { needsRescue: false, reason: null, urgency: 0 };

    const fHealth = sanitize(follower.health, 100);
    const fMaxHealth = sanitize(follower.maxHealth, 100);
    const isCriticalHp = fHealth <= fMaxHealth * 0.35;

    let distanceBehind = 0;
    if (leader) {
        const leadPos = extractPosition(leader);
        const followPos = extractPosition(follower);
        // River flows toward negative Z; lag behind means followPos.z > leadPos.z
        distanceBehind = Math.max(0, followPos.z - leadPos.z);
    }

    if (isCriticalHp && distanceBehind > dangerThresholdZ * 0.7) {
        return {
            needsRescue: true,
            reason: 'critical_hull_and_lagging',
            urgency: 1.0,
        };
    }

    if (distanceBehind > dangerThresholdZ) {
        return {
            needsRescue: true,
            reason: 'lagging_behind_lead',
            urgency: Math.min(1.0, distanceBehind / (dangerThresholdZ * 2)),
        };
    }

    if (isCriticalHp) {
        return {
            needsRescue: true,
            reason: 'critical_hull',
            urgency: 0.6,
        };
    }

    return { needsRescue: false, reason: null, urgency: 0 };
}
