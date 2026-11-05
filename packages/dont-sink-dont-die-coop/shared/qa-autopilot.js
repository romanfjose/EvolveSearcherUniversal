/**
 * Don't Sink, Don't Die — 1500m River Autopilot & Biome Continuity Verifier
 * (shared/qa-autopilot.js)
 *
 * Deterministic AI steering policy, biome continuity auditor, and full-course
 * 1500m river verification simulation.
 * Pure ES module, zero external runtime dependencies, 100% deterministic.
 */

import {
    RIVER_BIOMES,
    TRANSITION_ZONE_METERS,
    getBiomeAtZ,
    interpolateBiomePalette,
} from '../public/js/world/biomes.js';

import {
    HAZARD_CONSTANTS,
    generateRiverHazardsLayout,
    stepCraftWithRiverHazards,
} from './river-hazards.js';

import {
    RIVER,
    PHYSICS,
    CHECKPOINT_SPACING,
} from './game-core.js';

export const AUTOPILOT_CHECKPOINTS = [-375, -750, -1125];

export const AUTOPILOT_CONFIG = {
    riverWidth: RIVER.width || 30,
    halfWidth: (RIVER.width || 30) * 0.5,
    safeCorridorHalfWidth: (RIVER.width || 30) * 0.5 - 3.0,
    centerSteerWeight: 0.8,
    whirlpoolAvoidRadiusBuffer: 6.0,
    whirlpoolAvoidWeight: 2.5,
    rampSeekAheadZ: 45.0,
    rampSeekWeight: 1.8,
    enemyAvoidAheadZ: 25.0,
    enemyAvoidRadius: 6.0,
    enemyAvoidWeight: 1.2,
    paddleForward: true,
};

function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

/**
 * Computes AI steering and action inputs for the raft based on immediate hazards,
 * waterfall stunt ramps, and river corridor bounds.
 *
 * @param {object} raftState - { position: {x, y, z}, velocity: {x, y, z}, yaw?: number }
 * @param {object} [hazards={}] - River hazards layout { whirlpools, ramps, rapids, mines, coinRings }
 * @param {Array} [enemies=[]] - Array of active enemies { id, position: {x, y, z}, ... }
 * @returns {object} Autopilot input object: { steer: number (-1 to 1), paddle: boolean, jump: boolean, attack: boolean, targetAction: string }
 */
export function computeAutopilotInput(raftState, hazards = {}, enemies = []) {
    if (!raftState || !raftState.position) {
        return { steer: 0, paddle: true, jump: false, attack: false, targetAction: 'idle' };
    }

    const pos = raftState.position;
    const vel = raftState.velocity || { x: 0, y: 0, z: 0 };
    const halfW = AUTOPILOT_CONFIG.safeCorridorHalfWidth;

    let steerDelta = 0;
    let targetAction = 'cruise';
    let jump = false;
    let attack = false;

    // 1. Center-seeking baseline: normalize to [-1, 1]
    // If raft is to the right (x > 0), steer left (< 0). If to the left (x < 0), steer right (> 0).
    const centerOffset = pos.x / halfW;
    steerDelta -= centerOffset * AUTOPILOT_CONFIG.centerSteerWeight;

    // 2. High priority: Avoid Whirlpools ahead or in range
    const whirlpools = hazards.whirlpools || [];
    let activeThreatWhirlpool = null;
    let minThreatDist = Infinity;

    for (let i = 0; i < whirlpools.length; i++) {
        const wp = whirlpools[i];
        const dz = wp.z - pos.z; // negative downriver. If wp is ahead, wp.z < pos.z, so dz < 0
        const distZ = Math.abs(dz);
        const radius = wp.radius || HAZARD_CONSTANTS.WHIRLPOOL.DEFAULT_RADIUS;
        const dangerRadius = radius + AUTOPILOT_CONFIG.whirlpoolAvoidRadiusBuffer;

        // Threat window: downstream within 35m or within immediate radius
        if (dz <= 2.0 && dz >= -35.0) {
            const dist = Math.hypot(pos.x - wp.x, dz);
            if (dist < dangerRadius && dist < minThreatDist) {
                minThreatDist = dist;
                activeThreatWhirlpool = wp;
            }
        }
    }

    if (activeThreatWhirlpool) {
        targetAction = 'dodge_whirlpool';
        const dx = pos.x - activeThreatWhirlpool.x;
        // Steer away from whirlpool center along X
        let avoidDir = dx === 0 ? (pos.x >= 0 ? 1 : -1) : Math.sign(dx);
        // If pushing away pushes outside river bank, invert direction
        if (pos.x + avoidDir * 4 > halfW) avoidDir = -1;
        if (pos.x + avoidDir * 4 < -halfW) avoidDir = 1;

        const proximity = clamp(1.0 - (minThreatDist / (activeThreatWhirlpool.radius + AUTOPILOT_CONFIG.whirlpoolAvoidRadiusBuffer)), 0.2, 1.0);
        steerDelta += avoidDir * AUTOPILOT_CONFIG.whirlpoolAvoidWeight * proximity;
    }

    // 3. Medium priority: Seek Waterfall Stunt Ramps (if no imminent whirlpool threat)
    const ramps = hazards.ramps || [];
    let targetRamp = null;
    let minRampDist = Infinity;

    for (let i = 0; i < ramps.length; i++) {
        const ramp = ramps[i];
        const halfL = (ramp.length || HAZARD_CONSTANTS.RAMP.DEFAULT_LENGTH) * 0.5;
        const rampLipZ = ramp.z - halfL;
        // Check if raft is on or approaching the ramp
        const dz = ramp.z - pos.z;
        if (pos.z >= rampLipZ - 2 && pos.z <= ramp.z + halfL + 2) {
            // Right on or crossing ramp
            const dx = Math.abs(pos.x - ramp.x);
            if (dx <= (ramp.width || 6.0) * 0.5 + 1.0) {
                jump = true;
            }
        }

        if (!activeThreatWhirlpool && dz < 0 && dz >= -AUTOPILOT_CONFIG.rampSeekAheadZ) {
            const distZ = Math.abs(dz);
            if (distZ < minRampDist) {
                minRampDist = distZ;
                targetRamp = ramp;
            }
        }
    }

    if (!activeThreatWhirlpool && targetRamp) {
        targetAction = 'align_ramp';
        const dx = targetRamp.x - pos.x;
        const rampHalfW = (targetRamp.width || HAZARD_CONSTANTS.RAMP.DEFAULT_WIDTH) * 0.5;
        if (Math.abs(dx) > rampHalfW * 0.25) {
            const alignDir = Math.sign(dx);
            const alignUrgency = clamp(Math.abs(dx) / rampHalfW, 0.4, 1.0);
            steerDelta += alignDir * AUTOPILOT_CONFIG.rampSeekWeight * alignUrgency;
        }
    }

    // 4. Enemy avoidance / defense
    if (enemies && enemies.length > 0) {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.position || e.health <= 0) continue;
            const edz = e.position.z - pos.z;
            const edx = e.position.x - pos.x;
            const edist = Math.hypot(edx, edz);

            if (edist <= (e.attackRange || 4.5)) {
                attack = true; // In strike range: defend / attack
            }

            // Evade dangerous enemies directly ahead
            if (edz < 0 && Math.abs(edz) <= AUTOPILOT_CONFIG.enemyAvoidAheadZ && edist < AUTOPILOT_CONFIG.enemyAvoidRadius) {
                const avoidX = edx >= 0 ? -1 : 1;
                steerDelta += avoidX * AUTOPILOT_CONFIG.enemyAvoidWeight * (1 - edist / AUTOPILOT_CONFIG.enemyAvoidRadius);
            }
        }
    }

    // Hard corridor clamp: prevent hugging river walls
    if (pos.x > halfW) {
        steerDelta -= 1.5;
    } else if (pos.x < -halfW) {
        steerDelta += 1.5;
    }

    const finalSteer = clamp(steerDelta, -1.0, 1.0);

    return {
        steer: Number(finalSteer.toFixed(4)),
        paddle: AUTOPILOT_CONFIG.paddleForward,
        jump,
        attack,
        targetAction,
    };
}

/**
 * Verifies biome palette continuity and numerical integrity across every interval.
 * Checks that colors, fog, wave amplitude, and clarity are finite and valid.
 *
 * @param {number} [startZ=0]
 * @param {number} [endZ=-1500]
 * @param {number} [stepZ=5]
 * @returns {object} Audit report with samples and error count
 */
export function verifyBiomeContinuity(startZ = 0, endZ = -1500, stepZ = 5) {
    const samples = [];
    const errors = [];

    const numSteps = Math.floor(Math.abs(endZ - startZ) / stepZ);

    for (let i = 0; i <= numSteps; i++) {
        const z = startZ - i * stepZ;
        const biome = getBiomeAtZ(z);
        const palette = interpolateBiomePalette(z);

        // Assert valid biome definition
        if (!biome || !biome.id) {
            errors.push(`Invalid biome definition at z=${z}`);
        }

        // Assert numeric validity of all palette attributes
        const checkFinite = (val, name) => {
            if (!Number.isFinite(val) || Number.isNaN(val)) {
                errors.push(`Non-finite value for ${name} at z=${z}: ${val}`);
            }
        };

        checkFinite(palette.fogDensity, 'fogDensity');
        checkFinite(palette.waveAmplitude, 'waveAmplitude');
        checkFinite(palette.waveSpeed, 'waveSpeed');
        checkFinite(palette.waterColors.clarity, 'waterColors.clarity');
        checkFinite(palette.blendRatio, 'blendRatio');

        const checkColor = (col, name) => {
            if (!col) {
                errors.push(`Missing color object ${name} at z=${z}`);
                return;
            }
            checkFinite(col.r, `${name}.r`);
            checkFinite(col.g, `${name}.g`);
            checkFinite(col.b, `${name}.b`);
            if (col.r < -1e-4 || col.r > 1.0001 || col.g < -1e-4 || col.g > 1.0001 || col.b < -1e-4 || col.b > 1.0001) {
                errors.push(`Out of range [0, 1] color ${name} at z=${z}: (${col.r}, ${col.g}, ${col.b})`);
            }
        };

        checkColor(palette.fogColor, 'fogColor');
        checkColor(palette.skyColors.top, 'skyColors.top');
        checkColor(palette.skyColors.mid, 'skyColors.mid');
        checkColor(palette.skyColors.horizon, 'skyColors.horizon');
        checkColor(palette.waterColors.shallow, 'waterColors.shallow');
        checkColor(palette.waterColors.deep, 'waterColors.deep');
        checkColor(palette.light.sunColor, 'light.sunColor');
        checkColor(palette.light.hemiSky, 'light.hemiSky');
        checkColor(palette.light.hemiGround, 'light.hemiGround');

        if (palette.blendRatio < 0 || palette.blendRatio > 1) {
            errors.push(`blendRatio out of [0, 1] bounds at z=${z}: ${palette.blendRatio}`);
        }

        samples.push({
            z,
            actIndex: palette.actIndex,
            primaryBiome: palette.primaryBiome,
            nextBiome: palette.nextBiome,
            blendRatio: palette.blendRatio,
            fogDensity: palette.fogDensity,
            waveAmplitude: palette.waveAmplitude,
        });
    }

    return {
        ok: errors.length === 0,
        sampleCount: samples.length,
        errors,
        samples,
    };
}

/**
 * Runs a complete deterministic 1500m river autopilot simulation from z = 0 down to z = -1500.
 *
 * @param {object} [options={}] - Simulation options { seed, dt, finishZ, riverWidth, maxTicks }
 * @returns {object} Verification telemetry receipt
 */
export function simulateAutopilotRun(options = {}) {
    const seed = options.seed ?? 42;
    const dt = options.dt ?? 0.05; // 50ms tick
    const finishZ = options.finishZ ?? -1500;
    const riverWidth = options.riverWidth ?? (RIVER.width || 30);
    const maxTicks = options.maxTicks ?? 3000;

    const hazards = options.hazards || generateRiverHazardsLayout(seed, finishZ, riverWidth);
    const checkpointsToCross = [...AUTOPILOT_CHECKPOINTS].sort((a, b) => b - a);
    const crossedCheckpoints = [];

    const raft = {
        id: 'qa-autopilot-raft',
        position: { x: 0, y: 0.25, z: 0 },
        velocity: { x: 0, y: 0, z: -10 }, // moving downriver
        yaw: 0,
        mass: 5,
    };

    const telemetry = {
        totalTicks: 0,
        totalTimeSec: 0,
        startZ: 0,
        endZ: 0,
        rampsHit: 0,
        whirlpoolsEncountered: 0,
        rapidsBoosts: 0,
        coinsEarned: 0,
        nanCoordinatesDetected: 0,
        velocityViolations: 0,
        outOfCorridorViolations: 0,
        biomeAudits: [],
        biomeContinuityValid: true,
        actsVisited: new Set(),
        reachedFinish: false,
    };

    // Continuity audit along the course
    const continuityAudit = verifyBiomeContinuity(0, finishZ, 5);
    telemetry.biomeContinuityValid = continuityAudit.ok;
    telemetry.continuityErrors = continuityAudit.errors;

    let nextAuditZ = 0;
    const auditIntervalZ = 5;

    for (let tick = 0; tick < maxTicks; tick++) {
        telemetry.totalTicks++;
        telemetry.totalTimeSec += dt;

        // 1. Audit palette at 5m river intervals
        if (raft.position.z <= nextAuditZ) {
            const pal = interpolateBiomePalette(raft.position.z);
            telemetry.biomeAudits.push({
                z: raft.position.z,
                actIndex: pal.actIndex,
                fogDensity: pal.fogDensity,
            });
            telemetry.actsVisited.add(pal.actIndex);
            nextAuditZ -= auditIntervalZ;
        }

        // 2. Check Checkpoints
        if (checkpointsToCross.length > 0 && raft.position.z <= checkpointsToCross[0]) {
            crossedCheckpoints.push(checkpointsToCross.shift());
        }

        // 3. Compute Autopilot AI inputs
        const input = computeAutopilotInput(raft, hazards, []);

        // 4. Apply physics & steering
        // Arcade steering dynamics
        const steerForce = input.steer * 28.0;
        raft.velocity.x += steerForce * dt;

        // Forward thrust (paddle + river current)
        const forwardThrust = input.paddle ? 22.0 : 10.0;
        raft.velocity.z -= forwardThrust * dt;

        // Drag settling
        raft.velocity.x *= Math.exp(-6.0 * dt);
        raft.velocity.z *= Math.exp(-1.5 * dt);

        // Clamp lateral speed & forward speed to finite bounds
        const maxForwardSpeed = 65.0; // max speed including rapids
        const maxLateralSpeed = 25.0;
        raft.velocity.x = clamp(raft.velocity.x, -maxLateralSpeed, maxLateralSpeed);
        raft.velocity.z = clamp(raft.velocity.z, -maxForwardSpeed, -2.0);

        // 5. Hazards interaction
        const hazardRes = stepCraftWithRiverHazards(raft, hazards, dt, telemetry.totalTimeSec * 1000);
        if (hazardRes.rampInteraction && hazardRes.rampInteraction.launched) {
            telemetry.rampsHit++;
        }
        if (hazardRes.inWhirlpool) {
            telemetry.whirlpoolsEncountered++;
        }
        if (hazardRes.inRapids) {
            telemetry.rapidsBoosts++;
        }
        if (hazardRes.coinsEarned > 0) {
            telemetry.coinsEarned += hazardRes.coinsEarned;
        }

        // 6. Integrate Position
        raft.position.x += raft.velocity.x * dt;
        raft.position.y += raft.velocity.y * dt;
        raft.position.z += raft.velocity.z * dt;

        // Water surface settling
        if (raft.position.y > 0.25) {
            raft.velocity.y -= (PHYSICS.gravity || 30) * dt;
        } else {
            raft.position.y = 0.25;
            raft.velocity.y = 0;
        }

        // Corridor bounding
        const corridorMaxX = riverWidth * 0.5 - 1.0;
        if (Math.abs(raft.position.x) > corridorMaxX) {
            telemetry.outOfCorridorViolations++;
            raft.position.x = clamp(raft.position.x, -corridorMaxX, corridorMaxX);
            raft.velocity.x = 0;
        }

        // 7. Rigorous NaN & Invariant verification
        const nums = [raft.position.x, raft.position.y, raft.position.z, raft.velocity.x, raft.velocity.y, raft.velocity.z];
        if (nums.some((n) => !Number.isFinite(n) || Number.isNaN(n))) {
            telemetry.nanCoordinatesDetected++;
            break;
        }

        if (Math.abs(raft.velocity.x) > 100 || Math.abs(raft.velocity.z) > 120) {
            telemetry.velocityViolations++;
        }

        // Check completion
        if (raft.position.z <= finishZ) {
            telemetry.reachedFinish = true;
            break;
        }
    }

    telemetry.endZ = raft.position.z;
    telemetry.crossedCheckpoints = crossedCheckpoints;
    telemetry.allCheckpointsCrossed = AUTOPILOT_CHECKPOINTS.every((cp) => crossedCheckpoints.includes(cp));
    telemetry.allActsCovered = [1, 2, 3, 4].every((act) => telemetry.actsVisited.has(act));

    return {
        ok: telemetry.reachedFinish &&
            telemetry.nanCoordinatesDetected === 0 &&
            telemetry.velocityViolations === 0 &&
            telemetry.allCheckpointsCrossed &&
            telemetry.allActsCovered &&
            telemetry.biomeContinuityValid,
        telemetry,
        finalRaftState: raft,
    };
}
