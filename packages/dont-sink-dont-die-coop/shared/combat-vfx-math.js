/**
 * Don't Sink, Don't Die — AAA Combat VFX & Deterministic Hitbox Math
 * Shared pure-math engine for combat effects, ray/sweep hitboxes,
 * projectile kinematics, spark physics, and coin fountain ballistics.
 * Zero external dependencies.
 */

// ─── Basic Vector 3D & Easing Math Helpers ─────────────────────────────────

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

export function vec3(x = 0, y = 0, z = 0) {
    return { x, y, z };
}

export function vec3Add(a, b, out = { x: 0, y: 0, z: 0 }) {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
    return out;
}

export function vec3Sub(a, b, out = { x: 0, y: 0, z: 0 }) {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    out.z = a.z - b.z;
    return out;
}

export function vec3Scale(v, s, out = { x: 0, y: 0, z: 0 }) {
    out.x = v.x * s;
    out.y = v.y * s;
    out.z = v.z * s;
    return out;
}

export function vec3LengthSq(v) {
    return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vec3Length(v) {
    return Math.hypot(v.x, v.y, v.z);
}

export function vec3Distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function vec3Normalize(v, out = { x: 0, y: 0, z: 0 }) {
    const len = vec3Length(v);
    if (len > 1e-8) {
        out.x = v.x / len;
        out.y = v.y / len;
        out.z = v.z / len;
    } else {
        out.x = 0;
        out.y = 0;
        out.z = 0;
    }
    return out;
}

export function vec3Dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3Cross(a, b, out = { x: 0, y: 0, z: 0 }) {
    const ax = a.x, ay = a.y, az = a.z;
    const bx = b.x, by = b.y, bz = b.z;
    out.x = ay * bz - az * by;
    out.y = az * bx - ax * bz;
    out.z = ax * by - ay * bx;
    return out;
}

export function vec3Lerp(a, b, t, out = { x: 0, y: 0, z: 0 }) {
    const ct = clamp(t, 0, 1);
    out.x = a.x + (b.x - a.x) * ct;
    out.y = a.y + (b.y - a.y) * ct;
    out.z = a.z + (b.z - a.z) * ct;
    return out;
}

/**
 * Smooth quadratic ease-out curve.
 */
export function easeOutQuad(t) {
    const ct = clamp(t, 0, 1);
    return ct * (2 - ct);
}

/**
 * Smooth cubic ease-in curve.
 */
export function easeInCubic(t) {
    const ct = clamp(t, 0, 1);
    return ct * ct * ct;
}

/**
 * Linear color interpolation for 24-bit hex colors.
 */
export function lerpColorHex(c1, c2, t) {
    const ct = clamp(t, 0, 1);
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;

    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;

    const r = Math.round(r1 + (r2 - r1) * ct);
    const g = Math.round(g1 + (g2 - g1) * ct);
    const b = Math.round(b1 + (b2 - b1) * ct);

    return (r << 16) | (g << 8) | b;
}

// ─── 1. Melee Crescent Slash Ribbon Math ───────────────────────────────────

/**
 * Calculates a point along a circular slash ribbon arc given origin, swing angle,
 * yaw, pitch tilt, inner and outer radii.
 *
 * @param {object} origin - Center point {x, y, z}
 * @param {number} angle - Arc angle in radians (e.g. -Math.PI*0.4 to +Math.PI*0.4)
 * @param {number} yaw - Player/raft heading in radians
 * @param {number} radius - Distance from origin
 * @param {number} tiltPitch - Vertical tilt of the swing plane
 * @param {object} [out] - Output point
 * @return {object} Computed 3D vertex
 */
export function computeSlashArcPoint(origin, angle, yaw, radius, tiltPitch = 0.25, out = { x: 0, y: 0, z: 0 }) {
    // In local space: forward is -Z, right is +X.
    // Angle 0 is straight forward (-Z). Positive angle sweeps from right to left.
    const lx = Math.sin(angle) * radius;
    const lz = -Math.cos(angle) * radius;
    const ly = Math.sin(angle) * tiltPitch * radius;

    // Rotate local vector by yaw around Y axis:
    // x' = lx * cos(yaw) + lz * sin(yaw)
    // z' = -lx * sin(yaw) + lz * cos(yaw)
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const rx = lx * cosY + lz * sinY;
    const rz = -lx * sinY + lz * cosY;

    out.x = origin.x + rx;
    out.y = origin.y + ly;
    out.z = origin.z + rz;
    return out;
}

/**
 * Generates triangle quad ribbon vertices for a crescent slash ribbon.
 * A ribbon segment connects an inner radius edge and an outer radius edge.
 *
 * @param {object} origin - Raft/player origin {x,y,z}
 * @param {number} yaw - Heading angle
 * @param {number} startAngle - Start of the ribbon arc in radians
 * @param {number} endAngle - End of the ribbon arc in radians
 * @param {number} segments - Number of ribbon subdivisions
 * @param {number} innerRadius - Inner ribbon edge radius
 * @param {number} outerRadius - Outer tip ribbon edge radius
 * @param {number} tiltPitch - Plane tilt
 * @return {{ positions: Float32Array, uvs: Float32Array, indices: Uint16Array }}
 */
export function generateSlashRibbonMesh(origin, yaw, startAngle, endAngle, segments = 16, innerRadius = 1.2, outerRadius = 3.6, tiltPitch = 0.2) {
    const vertexCount = (segments + 1) * 2;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint16Array(segments * 6);

    const tempInner = { x: 0, y: 0, z: 0 };
    const tempOuter = { x: 0, y: 0, z: 0 };

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + (endAngle - startAngle) * t;

        // Taper ribbon at tips (crescent profile: width is maximum in middle)
        const taper = Math.sin(t * Math.PI);
        const dynamicInner = innerRadius + (outerRadius - innerRadius) * 0.2 * (1 - taper);
        const dynamicOuter = outerRadius * (0.8 + 0.2 * taper);

        computeSlashArcPoint(origin, angle, yaw, dynamicInner, tiltPitch, tempInner);
        computeSlashArcPoint(origin, angle, yaw, dynamicOuter, tiltPitch, tempOuter);

        const v0 = i * 2;
        const v1 = i * 2 + 1;

        positions[v0 * 3 + 0] = tempInner.x;
        positions[v0 * 3 + 1] = tempInner.y;
        positions[v0 * 3 + 2] = tempInner.z;

        positions[v1 * 3 + 0] = tempOuter.x;
        positions[v1 * 3 + 1] = tempOuter.y;
        positions[v1 * 3 + 2] = tempOuter.z;

        uvs[v0 * 2 + 0] = t;
        uvs[v0 * 2 + 1] = 0.0;
        uvs[v1 * 2 + 0] = t;
        uvs[v1 * 2 + 1] = 1.0;
    }

    let idx = 0;
    for (let i = 0; i < segments; i++) {
        const v0 = i * 2;
        const v1 = i * 2 + 1;
        const v2 = (i + 1) * 2;
        const v3 = (i + 1) * 2 + 1;

        // Triangle 1
        indices[idx++] = v0;
        indices[idx++] = v1;
        indices[idx++] = v2;

        // Triangle 2
        indices[idx++] = v2;
        indices[idx++] = v1;
        indices[idx++] = v3;
    }

    return { positions, uvs, indices };
}

/**
 * Deterministic swept-arc vs circle hitbox check.
 * Checks whether an enemy at targetPos with targetRadius is struck by a melee swing
 * sweeping from [currentYaw - arcHalf] to [currentYaw + arcHalf] within [minRadius, maxRadius].
 *
 * @param {object} attackerPos - {x, y, z}
 * @param {number} attackerYaw - Heading in radians
 * @param {object} targetPos - {x, y, z}
 * @param {number} targetRadius - Enemy collision radius
 * @param {number} arcSpread - Total arc sweep angle in radians (e.g. Math.PI * 0.75)
 * @param {number} maxReach - Maximum weapon range
 * @param {number} minReach - Minimum inner guard distance
 * @return {{ hit: boolean, distance: number, angleDiff: number }}
 */
export function checkMeleeArcHit(attackerPos, attackerYaw, targetPos, targetRadius = 1.5, arcSpread = Math.PI * 0.75, maxReach = 4.2, minReach = 0.5) {
    const dx = targetPos.x - attackerPos.x;
    const dz = targetPos.z - attackerPos.z;
    const distXZ = Math.hypot(dx, dz);

    // Check reach distance (taking target radius into account)
    if (distXZ + targetRadius < minReach || distXZ - targetRadius > maxReach) {
        return { hit: false, distance: distXZ, angleDiff: Math.PI };
    }

    // Direction vector of attacker forward is (-sin(yaw), -cos(yaw))
    const forwardX = -Math.sin(attackerYaw);
    const forwardZ = -Math.cos(attackerYaw);

    // Angle to target relative to forward
    const toTargetX = dx / (distXZ || 1);
    const toTargetZ = dz / (distXZ || 1);
    const dot = clamp(forwardX * toTargetX + forwardZ * toTargetZ, -1, 1);
    const angleDiff = Math.acos(dot);

    // If target has radius, angular allowance is increased by asin(targetRadius / distXZ)
    const angularAllowance = distXZ > targetRadius ? Math.asin(targetRadius / distXZ) : Math.PI;
    const hit = angleDiff <= (arcSpread * 0.5 + angularAllowance);

    return { hit, distance: distXZ, angleDiff };
}

// ─── 2. Golden Block Parry Hexagon Dome Math ───────────────────────────────

/**
 * Computes vertices of a regular hexagon on a 3D dome surface at given polar angle and azimuth.
 *
 * @param {number} radius - Dome radius
 * @param {number} polarAngle - Theta from top pole in radians (0 = top apex, PI/2 = equator)
 * @param {number} azimuthAngle - Phi around Y axis
 * @param {number} hexSize - Hexagon cell radius
 * @return {Array<{x: number, y: number, z: number}>} 6 perimeter vertices + 1 center
 */
export function computeHexagonCellVertices(radius, polarAngle, azimuthAngle, hexSize = 0.4) {
    // Center point on sphere dome surface
    const cx = radius * Math.sin(polarAngle) * Math.sin(azimuthAngle);
    const cy = radius * Math.cos(polarAngle);
    const cz = -radius * Math.sin(polarAngle) * Math.cos(azimuthAngle);
    const center = { x: cx, y: cy, z: cz };

    // Radial normal vector at center
    const normal = vec3Normalize(center);

    // Compute two orthonormal tangent vectors on surface
    const up = Math.abs(normal.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const tangentU = vec3Normalize(vec3Cross(up, normal));
    const tangentV = vec3Normalize(vec3Cross(normal, tangentU));

    const vertices = [center];
    for (let i = 0; i < 6; i++) {
        const rad = (i * Math.PI) / 3;
        const cosR = Math.cos(rad) * hexSize;
        const sinR = Math.sin(rad) * hexSize;
        vertices.push({
            x: center.x + tangentU.x * cosR + tangentV.x * sinR,
            y: center.y + tangentU.y * cosR + tangentV.y * sinR,
            z: center.z + tangentU.z * cosR + tangentV.z * sinR,
        });
    }

    return vertices;
}

/**
 * Checks whether an incoming enemy strike intersects the player's parry shield dome.
 *
 * @param {object} playerPos - Center of the raft/player
 * @param {number} playerYaw - Player heading
 * @param {object} hitPos - Position where attack occurs
 * @param {number} shieldRadius - Dome radius (e.g. 2.4)
 * @param {number} shieldAngleCoverage - Max forward protection angle (e.g. 140 deg = ~2.44 rad)
 * @return {{ parried: boolean, contactPoint: object, sparkNormal: object }}
 */
export function checkParryInterception(playerPos, playerYaw, hitPos, shieldRadius = 2.4, shieldAngleCoverage = 2.44) {
    const toHit = vec3Sub(hitPos, playerPos);
    const dist = vec3Length(toHit);

    // Must be near or entering shield boundary
    if (dist > shieldRadius + 1.2 || dist < 0.2) {
        return { parried: false, contactPoint: hitPos, sparkNormal: { x: 0, y: 1, z: 0 } };
    }

    // Raft forward vector
    const fwd = { x: -Math.sin(playerYaw), y: 0, z: -Math.cos(playerYaw) };
    const normXZ = Math.hypot(toHit.x, toHit.z) || 1;
    const dotFwd = clamp((toHit.x / normXZ) * fwd.x + (toHit.z / normXZ) * fwd.z, -1, 1);
    const angleFromForward = Math.acos(dotFwd);

    const withinCoverage = angleFromForward <= shieldAngleCoverage * 0.5;
    const contactNormal = vec3Normalize(toHit);
    const contactPoint = {
        x: playerPos.x + contactNormal.x * shieldRadius,
        y: playerPos.y + contactNormal.y * shieldRadius,
        z: playerPos.z + contactNormal.z * shieldRadius,
    };

    return {
        parried: withinCoverage,
        contactPoint,
        sparkNormal: contactNormal,
    };
}

/**
 * Computes deterministic dispersion velocity for a parry spark burst particle.
 *
 * @param {object} sparkNormal - Normal vector of impact
 * @param {number} index - Particle index (0..count-1)
 * @param {number} totalCount - Total particles in burst
 * @param {number} baseSpeed - Base ejection speed
 * @param {number} spreadAngle - Spread cone angle in radians
 * @return {{ vx: number, vy: number, vz: number }}
 */
export function calculateSparkVelocity(sparkNormal, index, totalCount = 20, baseSpeed = 12, spreadAngle = Math.PI * 0.45) {
    // Deterministic distribution on a spherical cap around sparkNormal using Fibonacci hemisphere
    const phi = (index * 2.39996322972865332) % (Math.PI * 2); // Golden ratio angle
    const cosTheta = 1 - (index / totalCount) * (1 - Math.cos(spreadAngle));
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));

    // Normal-aligned basis
    const n = vec3Normalize(sparkNormal);
    const up = Math.abs(n.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const u = vec3Normalize(vec3Cross(up, n));
    const v = vec3Normalize(vec3Cross(n, u));

    const localX = sinTheta * Math.cos(phi);
    const localY = sinTheta * Math.sin(phi);
    const localZ = cosTheta;

    // Jitter speed deterministically per particle
    const speed = baseSpeed * (0.65 + ((index * 37) % 100) / 100 * 0.7);

    return {
        vx: (u.x * localX + v.x * localY + n.x * localZ) * speed,
        vy: (u.y * localX + v.y * localY + n.y * localZ) * speed + 1.5, // slight upward bounce
        vz: (u.z * localX + v.z * localY + n.z * localZ) * speed,
    };
}

// ─── 3. Wizard Arcane Bolt Projectiles & Tether Beam Math ─────────────────

/**
 * Calculates deterministic ballistic/homing trajectory step for an Arcane Bolt.
 *
 * @param {object} pos - Current position {x,y,z}
 * @param {object} vel - Current velocity {x,y,z}
 * @param {object} targetPos - Target position {x,y,z}
 * @param {number} dt - Step delta time
 * @param {number} homingStrength - Turning acceleration toward target
 * @param {number} maxSpeed - Maximum bolt speed
 * @param {number} wobbleFreq - Frequency of spiral wobble
 * @param {number} wobbleAmp - Amplitude of spiral wobble
 * @param {number} timeAlive - Total seconds alive
 * @return {{ pos: object, vel: object }}
 */
export function stepArcaneBoltTrajectory(pos, vel, targetPos, dt, homingStrength = 18.0, maxSpeed = 26.0, wobbleFreq = 14.0, wobbleAmp = 1.2, timeAlive = 0) {
    const toTarget = vec3Sub(targetPos, pos);
    const dist = vec3Length(toTarget);

    const dir = vec3Normalize(toTarget);
    const currentSpeed = vec3Length(vel) || 0.1;
    const currentDir = vec3Normalize(vel);

    // Steer velocity toward target direction
    const steer = vec3Sub(dir, currentDir);
    const steerAcc = vec3Scale(steer, homingStrength * dt);

    const newVel = vec3Add(vel, steerAcc);
    const clampedVel = vec3Scale(vec3Normalize(newVel), Math.min(maxSpeed, currentSpeed + dt * 10));

    // Add spiral vortex wobble offset orthogonal to trajectory
    const up = Math.abs(clampedVel.y / maxSpeed) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const right = vec3Normalize(vec3Cross(up, clampedVel));
    const normalY = vec3Normalize(vec3Cross(clampedVel, right));

    const wobbleX = Math.sin(timeAlive * wobbleFreq) * wobbleAmp;
    const wobbleY = Math.cos(timeAlive * wobbleFreq) * wobbleAmp;

    const newPos = {
        x: pos.x + clampedVel.x * dt + right.x * wobbleX * dt,
        y: pos.y + clampedVel.y * dt + normalY.y * wobbleY * dt,
        z: pos.z + clampedVel.z * dt + right.z * wobbleX * dt,
    };

    return { pos: newPos, vel: clampedVel, distanceToTarget: dist };
}

/**
 * Computes vertices along an electric/telekinetic throw tether beam with Catmull-Rom harmonic jitter.
 *
 * @param {object} startPos - Staff orb origin {x,y,z}
 * @param {object} endPos - Raft target position {x,y,z}
 * @param {number} segments - Number of segments along the beam (e.g. 24)
 * @param {number} t - Global time for animated electric jitter
 * @param {number} jitterAmp - Amplitude of lightning arcs
 * @return {Float32Array} Array of segment vertices (length = (segments + 1) * 3)
 */
export function generateTetherBeamPoints(startPos, endPos, segments = 24, t = 0, jitterAmp = 0.6) {
    const count = segments + 1;
    const points = new Float32Array(count * 3);

    const beamVec = vec3Sub(endPos, startPos);
    const len = vec3Length(beamVec) || 1;
    const beamDir = vec3Normalize(beamVec);

    const up = Math.abs(beamDir.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const right = vec3Normalize(vec3Cross(up, beamDir));
    const orthoUp = vec3Normalize(vec3Cross(beamDir, right));

    for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        // Tether envelope: jitter is zero at ends (staff & raft) and peaks in middle
        const envelope = Math.sin(u * Math.PI);

        // Multi-frequency harmonic chaotic electric arc jitter
        const j1 = Math.sin(u * 16.0 - t * 24.0) * Math.cos(u * 8.0 + t * 12.0);
        const j2 = Math.cos(u * 28.0 + t * 32.0) * 0.5;
        const j3 = Math.sin(u * 44.0 - t * 18.0) * 0.25;
        const totalJitter = (j1 + j2 + j3) * jitterAmp * envelope;

        const jSide = Math.cos(u * 14.0 + t * 20.0) * jitterAmp * envelope * 0.8;

        const px = startPos.x + beamVec.x * u + right.x * jSide + orthoUp.x * totalJitter;
        const py = startPos.y + beamVec.y * u + right.y * jSide + orthoUp.y * totalJitter;
        const pz = startPos.z + beamVec.z * u + right.z * jSide + orthoUp.z * totalJitter;

        const idx = i * 3;
        points[idx + 0] = px;
        points[idx + 1] = py;
        points[idx + 2] = pz;
    }

    return points;
}

/**
 * Checks intersection of a ray/projectile path with a target bounding sphere.
 *
 * @param {object} rayOrigin - Start of segment
 * @param {object} rayDir - Normalized direction
 * @param {number} rayLength - Segment length
 * @param {object} sphereCenter - Target position
 * @param {number} sphereRadius - Target collision radius
 * @return {{ hit: boolean, t: number, hitPoint: object }}
 */
export function intersectRaySphere(rayOrigin, rayDir, rayLength, sphereCenter, sphereRadius) {
    const oc = vec3Sub(rayOrigin, sphereCenter);
    const b = vec3Dot(oc, rayDir);
    const c = vec3Dot(oc, oc) - sphereRadius * sphereRadius;
    const discriminant = b * b - c;

    if (discriminant < 0) {
        return { hit: false, t: -1, hitPoint: null };
    }

    const sqrtDisc = Math.sqrt(discriminant);
    let t = -b - sqrtDisc;

    if (t < 0) {
        t = -b + sqrtDisc;
    }

    if (t < 0 || t > rayLength) {
        return { hit: false, t: -1, hitPoint: null };
    }

    const hitPoint = {
        x: rayOrigin.x + rayDir.x * t,
        y: rayOrigin.y + rayDir.y * t,
        z: rayOrigin.z + rayDir.z * t,
    };

    return { hit: true, t, hitPoint };
}

// ─── 4. Police Muzzle Flash & Tracer Beam Math ─────────────────────────────

/**
 * Evaluates muzzle flash brightness and cone scaling over time.
 * Flash snaps instantly to 1.0 and decays exponentially within ~0.08s.
 *
 * @param {number} elapsed - Seconds since shot trigger
 * @param {number} duration - Total flash duration in seconds (default 0.08s)
 * @return {{ intensity: number, scale: number }}
 */
export function calculateMuzzleFlashState(elapsed, duration = 0.08) {
    if (elapsed < 0 || elapsed >= duration) {
        return { intensity: 0, scale: 0 };
    }

    const t = elapsed / duration;
    const intensity = Math.exp(-t * 6.0);
    const scale = 0.6 + 0.4 * (1.0 - t);

    return { intensity: clamp(intensity, 0, 1), scale };
}

/**
 * Computes head and tail world positions for a high-speed police tracer beam.
 * Tracer travels from origin to target at supersonic speed with fixed visual length.
 *
 * @param {object} origin - Gun muzzle position {x,y,z}
 * @param {object} target - Target hit position {x,y,z}
 * @param {number} elapsed - Seconds elapsed since firing
 * @param {number} speed - Tracer speed in m/s (e.g. 140 m/s)
 * @param {number} tracerLength - Visible line length in meters (e.g. 4.5 m)
 * @return {{ active: boolean, head: object, tail: object, arrived: boolean }}
 */
export function calculateTracerLine(origin, target, elapsed, speed = 140.0, tracerLength = 4.5) {
    const dVec = vec3Sub(target, origin);
    const totalDist = vec3Length(dVec);
    const dir = vec3Normalize(dVec);

    const headDist = elapsed * speed;
    const tailDist = Math.max(0, headDist - tracerLength);

    if (tailDist >= totalDist) {
        return {
            active: false,
            head: { ...target },
            tail: { ...target },
            arrived: true,
        };
    }

    const clampedHead = Math.min(totalDist, headDist);
    const head = {
        x: origin.x + dir.x * clampedHead,
        y: origin.y + dir.y * clampedHead,
        z: origin.z + dir.z * clampedHead,
    };

    const tail = {
        x: origin.x + dir.x * tailDist,
        y: origin.y + dir.y * tailDist,
        z: origin.z + dir.z * tailDist,
    };

    return {
        active: true,
        head,
        tail,
        arrived: headDist >= totalDist,
    };
}

// ─── 5. Floating 3D Coin Burst Fountain Math ───────────────────────────────

/**
 * Computes deterministic initial ejection velocity for a coin in a fountain burst.
 * Distributes coins in an upward blooming cone.
 *
 * @param {number} index - Coin index (0..count-1)
 * @param {number} totalCount - Total coins in burst
 * @param {number} baseUpwardSpeed - Initial vertical launch speed (m/s)
 * @param {number} spreadRadius - Radial explosion velocity (m/s)
 * @return {{ vx: number, vy: number, vz: number, rotSpeed: { x: number, y: number, z: number } }}
 */
export function calculateCoinBurstInitialVelocity(index, totalCount = 12, baseUpwardSpeed = 9.5, spreadRadius = 5.5) {
    const angle = (index / totalCount) * Math.PI * 2 + ((index * 7) % 11) * 0.15;
    const jitter = 0.8 + ((index * 31) % 50) / 100;
    const radial = spreadRadius * jitter;

    return {
        vx: Math.cos(angle) * radial,
        vy: baseUpwardSpeed * (0.85 + ((index * 19) % 40) / 100),
        vz: Math.sin(angle) * radial,
        rotSpeed: {
            x: 6.0 + ((index * 13) % 20),
            y: 8.0 + ((index * 29) % 25),
            z: 4.0 + ((index * 17) % 15),
        },
    };
}

/**
 * Steps physics for a floating coin:
 * - Gravity acceleration
 * - Hydrodynamic water bounce & float dampening at river surface (y = 0.25)
 * - Magnet attraction towards closest player if within magnetRadius
 *
 * @param {object} pos - Current coin position {x,y,z}
 * @param {object} vel - Current coin velocity {x,y,z}
 * @param {number} dt - Step delta time
 * @param {object} [magnetTarget] - Optional player position attracting the coin
 * @param {number} waterSurfaceY - River surface height (PLAYER.restY = 0.25)
 * @param {number} gravity - Gravity acceleration (default 26 m/s^2)
 * @param {number} waterRestitution - Bounce damping when hitting water (0.35)
 * @param {number} magnetRadius - Attraction range (10 m)
 * @param {number} magnetSpeed - Attraction pull acceleration (35 m/s^2)
 * @return {{ pos: object, vel: object, collected: boolean, onWater: boolean }}
 */
export function stepCoinPhysics(
    pos,
    vel,
    dt,
    magnetTarget = null,
    waterSurfaceY = 0.25,
    gravity = 26.0,
    waterRestitution = 0.35,
    magnetRadius = 10.0,
    magnetSpeed = 45.0
) {
    let collected = false;
    const newPos = { ...pos };
    const newVel = { ...vel };

    // 1. Magnetism towards player raft
    if (magnetTarget) {
        const toTarget = vec3Sub(magnetTarget, newPos);
        const dist = vec3Length(toTarget);
        if (dist < 1.4) {
            collected = true;
        } else if (dist < magnetRadius) {
            const pullDir = vec3Normalize(toTarget);
            const pullForce = (1.0 - dist / magnetRadius) * magnetSpeed;
            newVel.x += pullDir.x * pullForce * dt;
            newVel.y += pullDir.y * pullForce * dt;
            newVel.z += pullDir.z * pullForce * dt;
        }
    }

    // 2. Ballistic trajectory and gravity
    if (newPos.y > waterSurfaceY || newVel.y > 0) {
        newVel.y -= gravity * dt;
    }

    // Air and water drag
    const drag = Math.exp(-1.4 * dt);
    newVel.x *= drag;
    newVel.z *= drag;

    newPos.x += newVel.x * dt;
    newPos.y += newVel.y * dt;
    newPos.z += newVel.z * dt;

    // 3. Water surface bounce & floating bob
    let onWater = false;
    if (newPos.y <= waterSurfaceY) {
        onWater = true;
        if (newVel.y < -1.5) {
            // Bounce
            newVel.y = -newVel.y * waterRestitution;
            newPos.y = waterSurfaceY;
        } else {
            // Settle on water
            newVel.y = 0;
            newPos.y = waterSurfaceY;
        }
    }

    return { pos: newPos, vel: newVel, collected, onWater };
}
