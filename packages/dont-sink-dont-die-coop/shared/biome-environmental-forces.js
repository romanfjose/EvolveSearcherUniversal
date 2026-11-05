/**
 * Don't Sink, Don't Die — Interactive Biome Environmental Forces
 * (`shared/biome-environmental-forces.js`)
 *
 * Sovereign Core & Helmet 01/02 Directives:
 * - Pure, deterministic environmental physics and force calculations across the 4 River Biome Acts.
 * - Zero timers, zero I/O, zero global leaks (window/document/Three.js), zero external dependencies.
 * - Distinct physical gameplay for each biome:
 *     (1) Act 1 (Amber Canyon): Waterwheel millrace side-currents (transverse jet flows near river banks)
 *     (2) Act 2 (Neon Harbor): Calm canal locks (sheltered eddies with reduced downriver current & zero lateral turbulence)
 *     (3) Act 3 (Bioluminescent Abyss): Crystal anti-gravity buoyancy domes (upward lift + jump height boost to reach high sanctuary shrines)
 *     (4) Act 4 (Tempest Maelstrom): Thermal updraft vents (pulsing hydrothermal / volcanic geysers launching rafts airborne)
 */

export const BIOME_FORCE_CONFIG = Object.freeze({
    // Act 1: Waterwheel Millraces
    ACT1_WATERWHEELS: [
        { id: 'waterwheel-flume-left-1', x: -16, z: -80, radius: 14, sideSign: 1, strength: 18.0, streamWidth: 8.0 },
        { id: 'waterwheel-flume-right-1', x: 16, z: -150, radius: 14, sideSign: -1, strength: 20.0, streamWidth: 8.0 },
        { id: 'waterwheel-flume-left-2', x: -17, z: -240, radius: 15, sideSign: 1, strength: 22.0, streamWidth: 9.0 },
        { id: 'waterwheel-flume-right-2', x: 17, z: -320, radius: 15, sideSign: -1, strength: 24.0, streamWidth: 9.0 },
    ],

    // Act 2: Calm Canal Locks
    ACT2_CANAL_LOCKS: [
        { id: 'canal-lock-basin-1', x: 0, z: -430, width: 22, length: 50, currentDamping: 0.85, lateralCalm: 0.95 },
        { id: 'canal-lock-basin-2', x: -4, z: -550, width: 24, length: 65, currentDamping: 0.90, lateralCalm: 0.95 },
        { id: 'canal-lock-basin-3', x: 4, z: -670, width: 22, length: 55, currentDamping: 0.88, lateralCalm: 0.95 },
    ],

    // Act 3: Crystal Anti-Gravity Buoyancy Domes
    ACT3_BUOYANCY_DOMES: [
        { id: 'crystal-dome-1', x: -6, z: -820, radius: 12, liftForce: 24.0, jumpBoost: 2.2, maxAltitude: 14.0 },
        { id: 'crystal-dome-2', x: 8, z: -920, radius: 14, liftForce: 28.0, jumpBoost: 2.5, maxAltitude: 16.0 },
        { id: 'crystal-dome-3', x: 0, z: -1030, radius: 16, liftForce: 32.0, jumpBoost: 2.8, maxAltitude: 18.0 },
    ],

    // Act 4: Thermal Updraft Geyser Vents
    ACT4_THERMAL_VENTS: [
        { id: 'thermal-vent-1', x: -8, z: -1180, radius: 7.5, surgePeriod: 3.0, eruptionDuration: 1.2, maxUpdraft: 36.0, lateralDispersal: 10.0 },
        { id: 'thermal-vent-2', x: 7, z: -1270, radius: 8.0, surgePeriod: 3.5, eruptionDuration: 1.4, maxUpdraft: 40.0, lateralDispersal: 12.0 },
        { id: 'thermal-vent-3', x: -5, z: -1360, radius: 8.5, surgePeriod: 2.8, eruptionDuration: 1.1, maxUpdraft: 42.0, lateralDispersal: 14.0 },
        { id: 'thermal-vent-4', x: 4, z: -1450, radius: 9.0, surgePeriod: 3.2, eruptionDuration: 1.3, maxUpdraft: 45.0, lateralDispersal: 15.0 },
    ],
});

/**
 * Resolves the canonical Act index (1 to 4) from a river Z coordinate.
 * Act 1: 0 to -375
 * Act 2: -375 to -750
 * Act 3: -750 to -1125
 * Act 4: -1125 to -1500 (and beyond)
 *
 * @param {number} z - World Z coordinate
 * @returns {number} Act index (1, 2, 3, or 4)
 */
export function resolveActIndexFromZ(z) {
    if (!Number.isFinite(z) || z > -375) return 1;
    if (z > -750) return 2;
    if (z > -1125) return 3;
    return 4;
}

/**
 * Computes environmental forces and status effects for a given point and biome.
 *
 * @param {object} params
 * @param {number} params.x - Raft / object X coordinate
 * @param {number} params.z - Raft / object Z coordinate
 * @param {number} [params.y=0] - Raft / object Y coordinate (altitude)
 * @param {number} [params.actIndex] - Optional explicit act index (1-4). If omitted, inferred from z.
 * @param {number} [params.time=0] - Elapsed game time in seconds (for periodic thermal vents & wheel rotation)
 * @param {number} [params.craftMass=1.0] - Optional craft mass for force/acceleration scaling
 * @returns {object} Environmental force state
 */
export function computeBiomeForceAt({ x = 0, z = 0, y = 0, actIndex, time = 0, craftMass = 1.0 } = {}) {
    // Sanitize inputs
    const safeX = Number.isFinite(x) ? x : 0;
    const safeZ = Number.isFinite(z) ? z : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
    const safeMass = Number.isFinite(craftMass) && craftMass > 0 ? craftMass : 1.0;

    const resolvedAct = Number.isInteger(actIndex) && actIndex >= 1 && actIndex <= 4
        ? actIndex
        : resolveActIndexFromZ(safeZ);

    const force = { x: 0, y: 0, z: 0 };
    const torque = { x: 0, y: 0, z: 0 };
    let jumpBoostMultiplier = 1.0;
    let currentDampingFactor = 0.0; // 0 = no damping, 1.0 = fully arrested current
    let activeFeatureType = null;
    let activeFeatureId = null;
    let intensity = 0; // Normalized 0..1 indicator of force strength

    switch (resolvedAct) {
        case 1: {
            // Act 1: Waterwheel Millrace Side-Currents
            // Wheels churn water along the canyon shores, pushing rafts outward/transversely into the channel
            // or accelerating water along the flume chute.
            for (const wheel of BIOME_FORCE_CONFIG.ACT1_WATERWHEELS) {
                const dx = safeX - wheel.x;
                const dz = safeZ - wheel.z;
                const distSq = dx * dx + dz * dz;
                const r = wheel.radius;

                if (distSq < r * r) {
                    const dist = Math.sqrt(distSq);
                    const falloff = 1.0 - (dist / r);
                    // Pulsing millrace surge matching paddle rhythm
                    const surge = 0.85 + 0.15 * Math.sin(safeTime * 3.5 + wheel.z * 0.05);
                    const forceMag = wheel.strength * falloff * surge * safeMass;

                    // Push outward across river channel (sideSign: +1 pushes +x, -1 pushes -x)
                    // and forward downriver (-z) along the mill discharge chute
                    const lateralPush = wheel.sideSign * forceMag * 0.75;
                    const downriverSurge = -forceMag * 0.65;

                    force.x += lateralPush;
                    force.z += downriverSurge;
                    torque.y += wheel.sideSign * 0.35 * falloff;

                    if (falloff > intensity) {
                        intensity = falloff;
                        activeFeatureType = 'waterwheel_millrace';
                        activeFeatureId = wheel.id;
                    }
                }
            }
            break;
        }

        case 2: {
            // Act 2: Calm Canal Locks
            // Stone canal lock basins provide protected waters with suppressed river drag,
            // perfect for peaceful docking, repair, and precision navigation.
            for (const lock of BIOME_FORCE_CONFIG.ACT2_CANAL_LOCKS) {
                const halfW = lock.width * 0.5;
                const halfL = lock.length * 0.5;
                const dx = Math.abs(safeX - lock.x);
                const dz = Math.abs(safeZ - lock.z);

                if (dx <= halfW && dz <= halfL) {
                    const edgeFactorX = 1.0 - (dx / halfW);
                    const edgeFactorZ = 1.0 - (dz / halfL);
                    const lockFactor = Math.min(edgeFactorX, edgeFactorZ);

                    // Calm canal dampens downstream flow and stabilizes lateral drift
                    const damping = lock.currentDamping * (0.6 + 0.4 * lockFactor);
                    if (damping > currentDampingFactor) {
                        currentDampingFactor = damping;
                    }

                    // Gentle centering drift toward the lock center canal line
                    const centerDriftX = (lock.x - safeX) * 1.5 * lockFactor * safeMass;
                    force.x += centerDriftX;

                    if (lockFactor > intensity) {
                        intensity = lockFactor;
                        activeFeatureType = 'canal_lock_basin';
                        activeFeatureId = lock.id;
                    }
                }
            }
            break;
        }

        case 3: {
            // Act 3: Crystal Anti-Gravity Buoyancy Domes
            // Ancient abyssal crystal monoliths project spherical anti-gravity fields on the water.
            // When rafts enter, buoyant upward lift raises them out of the water, and jump height is multiplied.
            for (const dome of BIOME_FORCE_CONFIG.ACT3_BUOYANCY_DOMES) {
                const dx = safeX - dome.x;
                const dz = safeZ - dome.z;
                const distHorizontalSq = dx * dx + dz * dz;
                const r = dome.radius;

                if (distHorizontalSq < r * r) {
                    const distH = Math.sqrt(distHorizontalSq);
                    const horizontalFactor = 1.0 - (distH / r);

                    // Vertical boundary attenuation
                    const altitude = Math.max(0, safeY);
                    const altFactor = Math.max(0, 1.0 - (altitude / dome.maxAltitude));
                    const fieldStrength = horizontalFactor * altFactor;

                    if (fieldStrength > 0) {
                        // Upward anti-gravity buoyant force
                        const upwardForce = dome.liftForce * fieldStrength * safeMass;
                        force.y += upwardForce;

                        // Jump multiplier scales with field strength
                        const effectiveJumpBoost = 1.0 + (dome.jumpBoost - 1.0) * fieldStrength;
                        if (effectiveJumpBoost > jumpBoostMultiplier) {
                            jumpBoostMultiplier = effectiveJumpBoost;
                        }

                        // Gentle radial stabilization towards crystal core
                        const corePullX = (dome.x - safeX) * 0.5 * fieldStrength * safeMass;
                        const corePullZ = (dome.z - safeZ) * 0.5 * fieldStrength * safeMass;
                        force.x += corePullX;
                        force.z += corePullZ;

                        if (fieldStrength > intensity) {
                            intensity = fieldStrength;
                            activeFeatureType = 'crystal_buoyancy_dome';
                            activeFeatureId = dome.id;
                        }
                    }
                }
            }
            break;
        }

        case 4: {
            // Act 4: Thermal Updraft Geyser Vents
            // Volcanic hydrothermal vents cycle between rumbling buildup and explosive steam eruptions.
            // Eruptions launch rafts airborne with immense vertical updraft and lateral dispersal.
            for (const vent of BIOME_FORCE_CONFIG.ACT4_THERMAL_VENTS) {
                const dx = safeX - vent.x;
                const dz = safeZ - vent.z;
                const distSq = dx * dx + dz * dz;
                const r = vent.radius;

                if (distSq < r * r) {
                    const dist = Math.sqrt(distSq);
                    const proximity = 1.0 - (dist / r);

                    // Cyclic eruption timing: (time % period)
                    const cyclePos = (safeTime + (vent.x * 0.3)) % vent.surgePeriod;
                    const isErupting = cyclePos < vent.eruptionDuration;

                    if (isErupting) {
                        // Bell-curve eruption profile: peaks at middle of duration
                        const eruptProgress = cyclePos / vent.eruptionDuration;
                        const surgeCurve = Math.sin(eruptProgress * Math.PI);

                        const updraftMag = vent.maxUpdraft * proximity * surgeCurve * safeMass;
                        force.y += updraftMag;

                        // Radial outward blast dispersal away from vent epicenter
                        if (dist > 0.05) {
                            const unitX = dx / dist;
                            const unitZ = dz / dist;
                            const pushMag = vent.lateralDispersal * proximity * surgeCurve * safeMass;
                            force.x += unitX * pushMag;
                            force.z += unitZ * pushMag;
                        }

                        const currentIntensity = proximity * surgeCurve;
                        if (currentIntensity > intensity) {
                            intensity = currentIntensity;
                            activeFeatureType = 'thermal_updraft_vent';
                            activeFeatureId = vent.id;
                        }
                    } else {
                        // Pre-eruption bubbling rumble: slight thermal warmth lift & vibration
                        const rumbleTime = vent.surgePeriod - cyclePos;
                        if (rumbleTime < 0.6) {
                            const rumbleFactor = (0.6 - rumbleTime) / 0.6;
                            force.y += 2.5 * proximity * rumbleFactor * safeMass;
                            force.x += (Math.sin(safeTime * 25.0) * 1.5) * proximity * safeMass;
                        }
                    }
                }
            }
            break;
        }
    }

    return {
        actIndex: resolvedAct,
        active: intensity > 0.001,
        activeFeatureType,
        activeFeatureId,
        intensity: Math.min(1.0, Math.max(0.0, intensity)),
        force,
        torque,
        jumpBoostMultiplier,
        currentDampingFactor: Math.min(1.0, Math.max(0.0, currentDampingFactor)),
    };
}

/**
 * Convenience integrator to step a physical craft's velocity using environmental biome forces.
 *
 * @param {object} craft - Watercraft object { position: {x, y, z}, velocity: {x, y, z}, mass?: number }
 * @param {number} dt - Fixed delta time in seconds
 * @param {object} options - Optional parameters { time, actIndex }
 * @returns {object} Environmental force result and updated velocities
 */
export function stepCraftBiomeEnvironmentalForces(craft, dt = 1 / 60, options = {}) {
    if (!craft || !craft.position || !craft.velocity) {
        return { applied: false, environmentalResult: null };
    }

    const mass = Number.isFinite(craft.mass) && craft.mass > 0 ? craft.mass : 1.0;
    const envResult = computeBiomeForceAt({
        x: craft.position.x,
        y: craft.position.y,
        z: craft.position.z,
        time: options.time ?? 0,
        actIndex: options.actIndex,
        craftMass: mass,
    });

    if (envResult.active) {
        // a = F / m -> dv = a * dt
        const ax = envResult.force.x / mass;
        const ay = envResult.force.y / mass;
        const az = envResult.force.z / mass;

        craft.velocity.x += ax * dt;
        craft.velocity.y += ay * dt;
        craft.velocity.z += az * dt;

        // Apply canal lock current damping if inside lock
        if (envResult.currentDampingFactor > 0) {
            const dampFactor = Math.exp(-envResult.currentDampingFactor * 2.5 * dt);
            craft.velocity.x *= dampFactor;
        }

        // Apply angular torque if craft has angularVelocity
        if (craft.angularVelocity && Number.isFinite(craft.angularVelocity.y)) {
            craft.angularVelocity.y += envResult.torque.y * dt;
        }
    }

    return {
        applied: envResult.active,
        environmentalResult: envResult,
    };
}
