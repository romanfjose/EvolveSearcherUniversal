/**
 * Don't Sink, Don't Die — High-Angle Tactical Co-Op Diorama Camera & Teammate Tether Controller
 * (`shared/coop-camera-and-tether.js`)
 *
 * Sovereign Core & Helmet 01/02/03/04 Directive:
 * - Replaces the claustrophobic bumper chase camera with a wide, high-angle three-quarter
 *   near-top-down tactical diorama camera (~47° / 0.82 rad pitch).
 * - Tracks the weighted centroid between the local player (65%) and active crewmates (35%).
 * - Dynamic zoom & multi-aspect framing across Ultrawide (21:9, 32:9), Standard 16:9, and Mobile Portrait (9:16).
 * - Pure, deterministic, zero-dependency ES module safe for headless testing and 60Hz runtime.
 */

export const DEFAULT_COOP_CAMERA_CONFIG = Object.freeze({
    // Camera Angles & Distance
    defaultPitch: 0.82,
    pitch: 0.8203,
    minPitch: 0.35,
    maxPitch: 1.25,
    baseDistance: 28.0,
    maxDistance: 44.0,
    minDistance: 20.0,
    separationZoomGain: 0.45,
    speedZoomGain: 0.25,

    // Weighting & Framing
    localPlayerWeight: 0.65,
    crewWeight: 0.35,
    crewmateWeight: 0.35,
    riverSpanReference: 80.0,
    riverWidth: 80.0,
    bankSafetyMargin: 4.0,
    targetNdcMargin: 0.82,
    referenceAspect: 16 / 9,
    lookAheadDownriverZ: 6.0,
    lookElevationY: 1.2,
    cameraHeightOffset: 2.0,

    // Smoothing & Dynamics
    positionStiffness: 8.0,
    lookAtStiffness: 10.0,
    zoomStiffness: 6.0,
    baseFov: 65.0,
    aspectBaseFov: 60.0,
    minFov: 45.0,
    maxFov: 78.0,
    aspectMaxFov: 95.0,
    speedFovScale: 0.35,

    // Teammate Tether Constraints
    maxCohesionDist: 40.0,
    warningCohesionDist: 28.0,
    criticalCohesionDist: 36.0,
    tetherSafeDistance: 15.0,
    tetherWarningDistance: 22.0,
    tetherCriticalDistance: 35.0,
    tetherMaxBreakDistance: 50.0,

    // Near & far planes
    near: 0.1,
    far: 1400,
});

export function isFiniteNumber(val) {
    return typeof val === 'number' && Number.isFinite(val);
}

export function clamp(val, min, max) {
    if (Number.isNaN(val)) return min;
    return val < min ? min : val > max ? max : val;
}

export function distXZ(a, b) {
    const dx = (a?.x ?? 0) - (b?.x ?? 0);
    const dz = (a?.z ?? 0) - (b?.z ?? 0);
    return Math.hypot(dx, dz);
}

export function extractActiveCrew(crewPlayers) {
    if (!crewPlayers) return [];

    let list = [];
    if (Array.isArray(crewPlayers)) {
        list = crewPlayers;
    } else if (crewPlayers instanceof Map) {
        list = Array.from(crewPlayers.values());
    } else if (typeof crewPlayers === 'object') {
        list = Object.values(crewPlayers);
    }

    return list.filter((p) => {
        if (!p || typeof p !== 'object') return false;
        const isDead = p.isDead === true || p.health <= 0 || p.alive === false;
        if (isDead) return false;

        const x = p.x ?? p.position?.x;
        const z = p.z ?? p.position?.z;
        return Number.isFinite(x) && Number.isFinite(z);
    }).map((p) => ({
        id: p.id || p.odId || 'crewmate',
        x: p.x ?? p.position?.x ?? 0,
        y: p.y ?? p.position?.y ?? 0,
        z: p.z ?? p.position?.z ?? 0,
        vx: p.vx ?? p.velocity?.x ?? 0,
        vz: p.vz ?? p.velocity?.z ?? 0,
        health: p.health ?? 100,
        name: p.name || 'Crewmate',
    }));
}

/**
 * Supports both:
 *   computeCoopCentroid({ localPlayer, crewPlayers, config })
 * and:
 *   computeCoopCentroid(localPos, teammates, config)
 */
export function computeCoopCentroid(arg1, arg2 = [], arg3 = DEFAULT_COOP_CAMERA_CONFIG) {
    const isOptionsObject = arg1 && typeof arg1 === 'object' && ('localPlayer' in arg1 || 'crewPlayers' in arg1 || 'config' in arg1);
    const localPlayer = isOptionsObject ? arg1.localPlayer : arg1;
    const crewPlayers = isOptionsObject ? (arg1.crewPlayers ?? []) : arg2;
    const config = isOptionsObject ? (arg1.config ?? DEFAULT_COOP_CAMERA_CONFIG) : (arg3 ?? DEFAULT_COOP_CAMERA_CONFIG);

    const lx = isFiniteNumber(localPlayer?.x) ? localPlayer.x : (isFiniteNumber(localPlayer?.position?.x) ? localPlayer.position.x : 0);
    const ly = isFiniteNumber(localPlayer?.y) ? localPlayer.y : (isFiniteNumber(localPlayer?.position?.y) ? localPlayer.position.y : 0);
    const lz = isFiniteNumber(localPlayer?.z) ? localPlayer.z : (isFiniteNumber(localPlayer?.position?.z) ? localPlayer.position.z : 0);

    const crew = extractActiveCrew(crewPlayers);

    if (crew.length === 0) {
        return {
            x: lx,
            y: ly,
            z: lz,
            spreadRadius: 0,
            maxSpreadSpan: 0,
            activeCrewCount: 0,
            localWeight: 1.0,
            crewWeight: 0.0,
            separation: 0,
            teammateCount: 0,
        };
    }

    let crewSumX = 0;
    let crewSumY = 0;
    let crewSumZ = 0;
    let maxDistFromLocal = 0;

    for (const c of crew) {
        crewSumX += c.x;
        crewSumY += isFiniteNumber(c.y) ? c.y : ly;
        crewSumZ += c.z;
        const d = Math.hypot(c.x - lx, c.z - lz);
        if (d > maxDistFromLocal) maxDistFromLocal = d;
    }

    const avgCrewX = crewSumX / crew.length;
    const avgCrewY = crewSumY / crew.length;
    const avgCrewZ = crewSumZ / crew.length;

    const wLocal = config.localPlayerWeight ?? DEFAULT_COOP_CAMERA_CONFIG.localPlayerWeight;
    const wCrew = config.crewWeight ?? (1.0 - wLocal);
    const totalWeight = wLocal + wCrew;

    const normLocalWeight = totalWeight > 0 ? wLocal / totalWeight : 1.0;
    const normCrewWeight = totalWeight > 0 ? wCrew / totalWeight : 0.0;

    const centroidX = lx * normLocalWeight + avgCrewX * normCrewWeight;
    const centroidY = ly * normLocalWeight + avgCrewY * normCrewWeight;
    const centroidZ = lz * normLocalWeight + avgCrewZ * normCrewWeight;

    const allParticipants = [{ x: lx, y: ly, z: lz }, ...crew];
    let maxSpreadSpan = 0;
    let maxDistFromCentroid = 0;

    for (let i = 0; i < allParticipants.length; i++) {
        const p1 = allParticipants[i];
        const distToCenter = Math.hypot(p1.x - centroidX, p1.z - centroidZ);
        if (distToCenter > maxDistFromCentroid) {
            maxDistFromCentroid = distToCenter;
        }
        for (let j = i + 1; j < allParticipants.length; j++) {
            const p2 = allParticipants[j];
            const d = Math.hypot(p1.x - p2.x, p1.z - p2.z);
            if (d > maxSpreadSpan) {
                maxSpreadSpan = d;
            }
        }
    }

    return {
        x: centroidX,
        y: centroidY,
        z: centroidZ,
        spreadRadius: maxDistFromCentroid,
        maxSpreadSpan,
        activeCrewCount: crew.length,
        localWeight: normLocalWeight,
        crewWeight: normCrewWeight,
        separation: maxDistFromLocal,
        teammateCount: crew.length,
    };
}

export function computeDynamicCameraDistance(spreadSpan, config = DEFAULT_COOP_CAMERA_CONFIG) {
    const baseDist = config.baseDistance ?? DEFAULT_COOP_CAMERA_CONFIG.baseDistance;
    const maxDist = config.maxDistance ?? DEFAULT_COOP_CAMERA_CONFIG.maxDistance;
    const riverSpan = config.riverSpanReference ?? DEFAULT_COOP_CAMERA_CONFIG.riverSpanReference;

    const zoomRatio = clamp(spreadSpan / riverSpan, 0.0, 1.0);
    const easedZoom = zoomRatio * (2 - zoomRatio);
    const distance = baseDist + (maxDist - baseDist) * easedZoom;

    return {
        distance: clamp(distance, config.minDistance ?? baseDist, maxDist),
        zoomRatio,
    };
}

export function computeAspectFramingFactor(aspect, config = DEFAULT_COOP_CAMERA_CONFIG) {
    const safeAspect = isFiniteNumber(aspect) && aspect > 0 ? aspect : (16 / 9);
    const refAspect = config.referenceAspect ?? (16 / 9);
    const baseFov = config.aspectBaseFov ?? 60;
    const minFov = config.minFov ?? 45;
    const maxFov = config.aspectMaxFov ?? 95;

    const isPortrait = safeAspect < 1.0;
    const isUltrawide = safeAspect >= 2.3;

    let distanceMultiplier = 1.0;
    let adaptiveFov = baseFov;

    if (safeAspect < refAspect) {
        const aspectDeficit = refAspect / safeAspect;
        distanceMultiplier = 1.0 + (aspectDeficit - 1.0) * 0.72;
        const fovBonus = Math.min(20, (aspectDeficit - 1.0) * 6.5);
        adaptiveFov = clamp(baseFov + fovBonus, minFov, maxFov);
    } else if (isUltrawide) {
        distanceMultiplier = Math.max(0.88, 1.0 - (safeAspect - refAspect) * 0.08);
        adaptiveFov = baseFov;
    }

    return {
        distanceMultiplier,
        adaptiveFov,
        isPortrait,
        isUltrawide,
    };
}

export function projectWorldPoint(point, camPos, lookAt, fovYDeg, aspect, viewport = { width: 1920, height: 1080 }, near = 0.1, far = 1400) {
    if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y) || !isFiniteNumber(point.z)) {
        return { inFront: false, inFrustum: false, ndc: { x: NaN, y: NaN, z: NaN }, screenPx: null, depth: 0 };
    }

    let fx = lookAt.x - camPos.x;
    let fy = lookAt.y - camPos.y;
    let fz = lookAt.z - camPos.z;
    const fLen = Math.hypot(fx, fy, fz);
    if (fLen < 1e-6) return { inFront: false, inFrustum: false, ndc: { x: 0, y: 0, z: 0 }, screenPx: null, depth: 0 };
    fx /= fLen; fy /= fLen; fz /= fLen;

    let rx = -fz;
    let rz = fx;
    const rLen = Math.hypot(rx, rz);
    if (rLen < 1e-6) {
        rx = 1;
        rz = 0;
    } else {
        rx /= rLen;
        rz /= rLen;
    }

    const ux = -rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy;

    const dx = point.x - camPos.x;
    const dy = point.y - camPos.y;
    const dz = point.z - camPos.z;

    const xCam = dx * rx + dz * rz;
    const yCam = dx * ux + dy * uy + dz * uz;
    const forwardDist = dx * fx + dy * fy + dz * fz;

    if (forwardDist <= near) {
        return {
            inFront: false,
            inFrustum: false,
            ndc: { x: NaN, y: NaN, z: -1 },
            screenPx: null,
            depth: forwardDist,
        };
    }

    const fovRad = (fovYDeg * Math.PI) / 180;
    const f = 1.0 / Math.tan(fovRad * 0.5);

    const ndcX = (xCam * (f / aspect)) / forwardDist;
    const ndcY = (yCam * f) / forwardDist;
    const ndcZ = ((far + near) / (near - far) * (-forwardDist) + (2 * far * near) / (near - far)) / forwardDist;

    const inFront = forwardDist > 0 && forwardDist < far;
    const inFrustum = inFront && Math.abs(ndcX) <= 1.0 && Math.abs(ndcY) <= 1.0;

    const w = viewport?.width || 1920;
    const h = viewport?.height || 1080;
    const screenX = Math.round(((ndcX + 1) / 2) * w);
    const screenY = Math.round(((1 - ndcY) / 2) * h);

    return {
        inFront,
        inFrustum,
        ndc: { x: ndcX, y: ndcY, z: ndcZ },
        screenPx: (isFiniteNumber(screenX) && isFiniteNumber(screenY)) ? { x: screenX, y: screenY } : null,
        depth: forwardDist,
    };
}

/**
 * Supports both:
 *   computeTeammateTetherState({ localPlayer, crewPlayers, maxCohesionDist })
 * and:
 *   computeTeammateTetherState(separationDistance, config)
 */
export function computeTeammateTetherState(arg1, config = DEFAULT_COOP_CAMERA_CONFIG) {
    if (typeof arg1 === 'number' || arg1 === undefined || arg1 === null || !('localPlayer' in (arg1 || {}))) {
        if (typeof arg1 === 'object' && arg1 !== null && ('crewPlayers' in arg1 || 'maxCohesionDist' in arg1)) {
            // Fall through to object mode
        } else {
            const dist = isFiniteNumber(arg1) ? Math.max(0, arg1) : 0;
            const safeDist = config.tetherSafeDistance ?? 15.0;
            const warnDist = config.tetherWarningDistance ?? 22.0;
            const critDist = config.tetherCriticalDistance ?? 35.0;
            const breakDist = config.tetherMaxBreakDistance ?? 50.0;

            let state = 'TETHERED';
            let tension = 0.0;
            let isAlert = false;
            let message = 'In Formation';

            if (dist <= safeDist) {
                state = 'TETHERED';
                tension = (dist / safeDist) * 0.25;
                isAlert = false;
                message = 'In Formation (+25% Gold Cohesion)';
            } else if (dist <= warnDist) {
                state = 'EXTENDED';
                tension = 0.25 + ((dist - safeDist) / (warnDist - safeDist)) * 0.35;
                isAlert = false;
                message = 'Tether Extended';
            } else if (dist <= critDist) {
                state = 'WARNING';
                tension = 0.60 + ((dist - warnDist) / (critDist - warnDist)) * 0.30;
                isAlert = true;
                message = 'Crewmate Falling Behind — Drop Anchor [S]';
            } else if (dist <= breakDist) {
                state = 'CRITICAL';
                tension = 0.90 + ((dist - critDist) / (breakDist - critDist)) * 0.10;
                isAlert = true;
                message = 'Tether Strain Critical — Regroup Immediately!';
            } else {
                state = 'SEVERED';
                tension = 1.0;
                isAlert = true;
                message = 'Crew Separated — Regroup Required';
            }

            return {
                state,
                distance: dist,
                tension: clamp(tension, 0.0, 1.0),
                isAlert,
                message,
            };
        }
    }

    const {
        localPlayer,
        crewPlayers = [],
        maxCohesionDist = DEFAULT_COOP_CAMERA_CONFIG.maxCohesionDist,
    } = arg1 || {};

    const lx = localPlayer?.x ?? localPlayer?.position?.x ?? 0;
    const lz = localPlayer?.z ?? localPlayer?.position?.z ?? 0;

    const crew = extractActiveCrew(crewPlayers);
    const maxLimit = Math.max(1.0, maxCohesionDist ?? DEFAULT_COOP_CAMERA_CONFIG.maxCohesionDist);
    const warnLimit = maxLimit * 0.70;
    const critLimit = maxLimit * 0.90;

    if (crew.length === 0) {
        return {
            inCohesion: true,
            maxDistanceToTeammate: 0,
            avgDistanceToTeammates: 0,
            maxTension: 0,
            teammates: [],
            warningCount: 0,
            criticalCount: 0,
        };
    }

    let maxDist = 0;
    let sumDist = 0;
    let warningCount = 0;
    let criticalCount = 0;

    const teammates = crew.map((teammate) => {
        const dx = teammate.x - lx;
        const dz = teammate.z - lz;
        const d = Math.hypot(dx, dz);

        if (d > maxDist) maxDist = d;
        sumDist += d;

        const tensionRatio = clamp(d / maxLimit, 0.0, 2.0);
        const isCritical = d >= critLimit;
        const isWarning = d >= warnLimit && !isCritical;

        if (isWarning) warningCount++;
        if (isCritical) criticalCount++;

        const invD = d > 0.0001 ? 1.0 / d : 0;
        const nx = dx * invD;
        const nz = dz * invD;

        const isAhead = dz < -0.5;
        const isBehind = dz > 0.5;

        return {
            id: teammate.id,
            name: teammate.name,
            distance: d,
            tensionRatio,
            isWarning,
            isCritical,
            directionX: nx,
            directionZ: nz,
            isAhead,
            isBehind,
            health: teammate.health,
        };
    });

    const avgDist = crew.length > 0 ? sumDist / crew.length : 0;
    const maxTension = maxLimit > 0 ? clamp(maxDist / maxLimit, 0.0, 2.0) : 0;
    const inCohesion = maxDist <= maxLimit;

    return {
        inCohesion,
        maxDistanceToTeammate: maxDist,
        avgDistanceToTeammates: avgDist,
        maxTension,
        teammates,
        warningCount,
        criticalCount,
    };
}

/**
 * Supports both:
 *   computeCoopCameraFrame({ localPlayer, crewPlayers, cameraConfig, dt, previousState })
 * and:
 *   computeCoopCameraFrame({ localRaft, teammates, aspect, viewport, config })
 */
export function computeCoopCameraFrame(params = {}) {
    if ('localRaft' in params || 'teammates' in params || 'aspect' in params || 'viewport' in params) {
        const {
            localRaft,
            teammates = [],
            aspect = 16 / 9,
            viewport = { width: 1920, height: 1080 },
            config = DEFAULT_COOP_CAMERA_CONFIG,
        } = params;

        const activeConfig = { ...DEFAULT_COOP_CAMERA_CONFIG, ...config };
        const safeAspect = (isFiniteNumber(aspect) && aspect > 0)
            ? aspect
            : (viewport?.width && viewport?.height ? viewport.width / viewport.height : 16 / 9);

        const localPos = localRaft?.position || { x: 0, y: 0.25, z: 0 };
        const localVel = localRaft?.velocity || { x: 0, y: 0, z: -10 };
        const speed = Math.hypot(
            isFiniteNumber(localVel.x) ? localVel.x : 0,
            isFiniteNumber(localVel.z) ? localVel.z : 0
        );

        const centroid = computeCoopCentroid(localPos, teammates, activeConfig);
        const aspectFraming = computeAspectFramingFactor(safeAspect, activeConfig);

        const sepGain = activeConfig.separationZoomGain * centroid.separation;
        const spdGain = activeConfig.speedZoomGain * Math.max(0, speed - 8.0);
        const unscaledDist = clamp(
            32.0 + sepGain + spdGain,
            24.0,
            48.0
        );
        const finalDistance = unscaledDist * aspectFraming.distanceMultiplier;
        const finalFov = aspectFraming.adaptiveFov;
        const pitch = activeConfig.pitch;

        const lookAt = {
            x: centroid.x,
            y: Math.max(0, centroid.y),
            z: centroid.z - 4.0,
        };

        const camPos = {
            x: centroid.x,
            y: lookAt.y + finalDistance * Math.sin(pitch),
            z: lookAt.z + finalDistance * Math.cos(pitch),
        };

        const tether = computeTeammateTetherState(centroid.separation, activeConfig);

        const riverHalfWidth = (activeConfig.riverWidth || 80.0) * 0.5;
        const leftBankPoint = { x: -riverHalfWidth, y: 0, z: centroid.z };
        const rightBankPoint = { x: riverHalfWidth, y: 0, z: centroid.z };
        const localRaftPoint = {
            x: isFiniteNumber(localPos.x) ? localPos.x : 0,
            y: isFiniteNumber(localPos.y) ? localPos.y : 0.25,
            z: isFiniteNumber(localPos.z) ? localPos.z : 0,
        };

        const leftBankProj = projectWorldPoint(leftBankPoint, camPos, lookAt, finalFov, safeAspect, viewport, activeConfig.near, activeConfig.far);
        const rightBankProj = projectWorldPoint(rightBankPoint, camPos, lookAt, finalFov, safeAspect, viewport, activeConfig.near, activeConfig.far);
        const localRaftProj = projectWorldPoint(localRaftPoint, camPos, lookAt, finalFov, safeAspect, viewport, activeConfig.near, activeConfig.far);

        const raftInFrustum = localRaftProj.inFrustum && Math.abs(localRaftProj.ndc.x) <= 0.85 && Math.abs(localRaftProj.ndc.y) <= 0.85;

        return {
            position: camPos,
            cameraPosition: camPos,
            lookAt,
            pitch,
            distance: finalDistance,
            fov: finalFov,
            aspect: safeAspect,
            centroid,
            tether,
            framing: {
                isPortrait: aspectFraming.isPortrait,
                isUltrawide: aspectFraming.isUltrawide,
                distanceMultiplier: aspectFraming.distanceMultiplier,
                leftBankNdcX: leftBankProj.ndc.x,
                rightBankNdcX: rightBankProj.ndc.x,
                localRaftNdc: localRaftProj.ndc,
                localRaftScreenPx: localRaftProj.screenPx,
                raftInFrustum,
                corridorVisible: leftBankProj.inFront && rightBankProj.inFront,
            },
        };
    }

    const {
        localPlayer,
        crewPlayers = [],
        cameraConfig = DEFAULT_COOP_CAMERA_CONFIG,
        dt = 1 / 60,
        previousState = null,
    } = params;

    const cfg = { ...DEFAULT_COOP_CAMERA_CONFIG, ...cameraConfig };
    const centroid = computeCoopCentroid({ localPlayer, crewPlayers, config: cfg });
    const { distance: targetDistance, zoomRatio } = computeDynamicCameraDistance(centroid.maxSpreadSpan, cfg);
    const pitch = clamp(cfg.defaultPitch, cfg.minPitch, cfg.maxPitch);

    const targetLookAt = {
        x: centroid.x,
        y: centroid.y + cfg.lookElevationY,
        z: centroid.z - cfg.lookAheadDownriverZ,
    };

    const horizontalOffset = targetDistance * Math.cos(pitch);
    const verticalElevation = targetDistance * Math.sin(pitch);

    const targetPosition = {
        x: centroid.x,
        y: centroid.y + verticalElevation + cfg.cameraHeightOffset,
        z: centroid.z + horizontalOffset,
    };

    const localVx = localPlayer?.vx ?? localPlayer?.velocity?.x ?? 0;
    const localVz = localPlayer?.vz ?? localPlayer?.velocity?.z ?? 0;
    const localSpeed = Math.hypot(localVx, localVz);

    const speedBonusFov = clamp(localSpeed * cfg.speedFovScale, 0, (cfg.maxFov - cfg.baseFov) * 0.5);
    const spreadBonusFov = zoomRatio * ((cfg.maxFov - cfg.baseFov) * 0.5);
    const targetFov = clamp(cfg.baseFov + speedBonusFov + spreadBonusFov, cfg.baseFov, cfg.maxFov);

    let position = { ...targetPosition };
    let lookAt = { ...targetLookAt };
    let fov = targetFov;
    let distance = targetDistance;

    if (previousState && typeof previousState === 'object') {
        const safeDt = Math.max(0.0001, Math.min(dt, 0.2));
        const kPos = 1.0 - Math.exp(-cfg.positionStiffness * safeDt);
        position.x = previousState.position.x + (targetPosition.x - previousState.position.x) * kPos;
        position.y = previousState.position.y + (targetPosition.y - previousState.position.y) * kPos;
        position.z = previousState.position.z + (targetPosition.z - previousState.position.z) * kPos;

        const kLook = 1.0 - Math.exp(-cfg.lookAtStiffness * safeDt);
        lookAt.x = previousState.lookAt.x + (targetLookAt.x - previousState.lookAt.x) * kLook;
        lookAt.y = previousState.lookAt.y + (targetLookAt.y - previousState.lookAt.y) * kLook;
        lookAt.z = previousState.lookAt.z + (targetLookAt.z - previousState.lookAt.z) * kLook;

        const kZoom = 1.0 - Math.exp(-cfg.zoomStiffness * safeDt);
        distance = (previousState.distance ?? targetDistance) + (targetDistance - (previousState.distance ?? targetDistance)) * kZoom;
        fov = (previousState.fov ?? targetFov) + (targetFov - (previousState.fov ?? targetFov)) * kZoom;
    }

    return {
        position,
        cameraPosition: position,
        lookAt,
        fov,
        pitch,
        distance,
        zoomRatio,
        targetPosition,
        targetLookAt,
        centroid,
    };
}
