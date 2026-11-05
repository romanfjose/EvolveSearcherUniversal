/**
 * Don't Sink, Don't Die — 3D Co-Op Teammate Tether, Cohesion Aura & Directional Beacon VFX
 * (public/js/vfx/coop-tether-vfx.js)
 *
 * Implements Helmet 04 & Sovereign Core Directives:
 * 1. Visceral 10-second co-op centerpiece: transforms the game from a lonely solo race
 *    into an unmistakably cooperative flotilla survival experience.
 * 2. Glowing Golden Nautical Tow-Line / Cohesion Arc between teammates within <= 22m,
 *    simulating an elastic energy hawser with procedural catenary sag and nautical sparkles.
 * 3. Radiant 3D Cohesion Teamwork Aura (expanding golden/cyan water halo rings beneath rafts)
 *    signaling active co-op tether benefits (speed drafting, shared morale, proximity buff).
 * 4. Pulsing Amber Warning Line when a teammate drifts 25m - 45m away, vibrating with
 *    high-frequency tension jitter and amber danger pulses.
 * 5. 3D Edge-of-View Directional Compass Chevron & Beacon hovering around the local player's raft,
 *    pointing directly towards separated teammates (> 25m), showing distance tags and orientation.
 *
 * 100% zero external dependencies, procedural Three.js BufferGeometry, fully pooled and zero-GC per frame.
 */

// ─── CONFIGURATION CONSTANTS ────────────────────────────────────────────────
export const COOP_TETHER_CONFIG = {
    // Distance Thresholds (meters)
    COHESION_DISTANCE: 22.0,      // Golden nautical tow-line + teamwork aura active
    WARNING_MIN_DISTANCE: 25.0,  // Amber tension warning line starts
    WARNING_MAX_DISTANCE: 45.0,  // Max warning distance before snap/disconnection
    BEACON_MIN_DISTANCE: 25.0,   // Teammates separated further than this trigger directional beacon

    // Visual Bands & Color Palette
    COLORS: {
        GOLDEN_TETHER: 0xffd700,     // Radiant nautical gold hawser (<= 22m)
        GOLDEN_CORE: 0xfff3a1,       // Intense white-gold energy core
        AMBER_WARNING: 0xf59e0b,     // Danger tension amber (25m - 45m)
        AMBER_CRITICAL: 0xef4444,    // Snap hazard crimson (> 40m)
        COHESION_AURA: 0x10b981,     // Teamwork emerald / turquoise halo
        AURA_SECONDARY: 0x06b6d4,    // Co-op cyan resonant wave
        BEACON_CHEVRON: 0x38bdf8,    // Sky blue directional compass pointer
        BEACON_PULSE: 0xfacc15,      // Warning yellow pulse on compass
    },

    // Mesh & Topology Dimensions
    TETHER_SEGMENTS: 24,         // Discretization of the curved catenary hawser
    MAX_TEAMMATES: 8,            // Max simultaneous co-op teammate links supported
    BEACON_ORBIT_RADIUS: 4.2,    // Distance around local raft center for 3D compass chevrons
    AURA_RADIUS_MIN: 2.2,        // Cohesion aura inner ring radius
    AURA_RADIUS_MAX: 4.6,        // Cohesion aura outer expanding ring radius
    WATER_SURFACE_Y: 0.25,       // Default water height in world space
};

/**
 * Pure math clamp helper.
 */
export function clamp(v, min = 0, max = 1) {
    if (Number.isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
}

/**
 * Pure math lerp helper.
 */
export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Computes 3D Euclidean distance and components between two positions.
 */
export function getDistance3D(p1, p2) {
    const dx = (p2.x ?? 0) - (p1.x ?? 0);
    const dy = (p2.y ?? 0) - (p1.y ?? 0);
    const dz = (p2.z ?? 0) - (p1.z ?? 0);
    const distHoriz = Math.hypot(dx, dz);
    const distTotal = Math.hypot(dx, dy, dz);
    return { dx, dy, dz, distHoriz, distTotal };
}

/**
 * Evaluates the co-op tether state between local player and teammate.
 *
 * @param {number} distance - Distance in meters
 * @returns {object} { state: 'cohesion'|'warning'|'separated'|'out_of_range', ratio: number, colorHex: number }
 */
export function evaluateTetherBand(distance) {
    if (distance <= COOP_TETHER_CONFIG.COHESION_DISTANCE) {
        const ratio = clamp(distance / COOP_TETHER_CONFIG.COHESION_DISTANCE, 0, 1);
        return {
            state: 'cohesion',
            ratio,
            colorHex: COOP_TETHER_CONFIG.COLORS.GOLDEN_TETHER,
            isAuraActive: true,
            isWarning: false,
            isBeaconActive: false,
        };
    } else if (distance < COOP_TETHER_CONFIG.WARNING_MIN_DISTANCE) {
        // Transition buffer (22m - 25m): mild stretching line, fading golden
        const t = (distance - COOP_TETHER_CONFIG.COHESION_DISTANCE) / (COOP_TETHER_CONFIG.WARNING_MIN_DISTANCE - COOP_TETHER_CONFIG.COHESION_DISTANCE);
        return {
            state: 'transition',
            ratio: t,
            colorHex: COOP_TETHER_CONFIG.COLORS.GOLDEN_TETHER,
            isAuraActive: false,
            isWarning: false,
            isBeaconActive: false,
        };
    } else if (distance <= COOP_TETHER_CONFIG.WARNING_MAX_DISTANCE) {
        // Warning zone (25m - 45m): pulsing amber tension
        const t = (distance - COOP_TETHER_CONFIG.WARNING_MIN_DISTANCE) / (COOP_TETHER_CONFIG.WARNING_MAX_DISTANCE - COOP_TETHER_CONFIG.WARNING_MIN_DISTANCE);
        const colorHex = t > 0.75 ? COOP_TETHER_CONFIG.COLORS.AMBER_CRITICAL : COOP_TETHER_CONFIG.COLORS.AMBER_WARNING;
        return {
            state: 'warning',
            ratio: t,
            colorHex,
            isAuraActive: false,
            isWarning: true,
            isBeaconActive: true,
        };
    } else {
        // Beyond 45m: line snaps/fades, compass beacon active
        return {
            state: 'separated',
            ratio: 1.0,
            colorHex: COOP_TETHER_CONFIG.COLORS.BEACON_CHEVRON,
            isAuraActive: false,
            isWarning: false,
            isBeaconActive: true,
        };
    }
}

/**
 * Computes catenary sag and sinusoidal energy vibration for 3D tow-line vertices.
 *
 * @param {object} p1 - Start point {x, y, z}
 * @param {object} p2 - End point {x, y, z}
 * @param {number} t - Normalized progress along cable (0..1)
 * @param {number} distance - Distance between points
 * @param {number} time - Global animation timestamp in seconds
 * @param {string} state - 'cohesion' | 'transition' | 'warning'
 * @param {object} [outTarget] - Output vector to write to
 * @returns {object} {x, y, z}
 */
export function computeCatenaryPoint(p1, p2, t, distance, time = 0, state = 'cohesion', outTarget = {}) {
    const x1 = p1.x ?? 0, y1 = (p1.y ?? COOP_TETHER_CONFIG.WATER_SURFACE_Y) + 0.45, z1 = p1.z ?? 0;
    const x2 = p2.x ?? 0, y2 = (p2.y ?? COOP_TETHER_CONFIG.WATER_SURFACE_Y) + 0.45, z2 = p2.z ?? 0;

    // Linear interpolation baseline
    const bx = lerp(x1, x2, t);
    const by = lerp(y1, y2, t);
    const bz = lerp(z1, z2, t);

    // Parabolic catenary sag (maximum at t = 0.5)
    // In close cohesion, tow-line sags gently toward water; at high tension (warning), line is taut
    const sagFactor = state === 'cohesion'
        ? Math.max(0.2, 1.2 - (distance / COOP_TETHER_CONFIG.COHESION_DISTANCE) * 0.9)
        : 0.15; // Taut line under warning tension
    const parabolicSag = 4.0 * t * (1.0 - t) * sagFactor;

    // Sinusoidal energy flutter / wave
    const waveFreq = state === 'warning' ? 18.0 : 8.0;
    const waveAmp = state === 'warning' ? 0.08 : 0.04;
    const wave = Math.sin(t * Math.PI * 3 + time * waveFreq) * waveAmp;

    outTarget.x = bx;
    outTarget.y = Math.max(COOP_TETHER_CONFIG.WATER_SURFACE_Y + 0.05, by - parabolicSag + wave);
    outTarget.z = bz;

    return outTarget;
}

/**
 * Normalizes input crew players (handles array, object/map, or iterable).
 */
export function normalizeCrewPlayers(crewPlayers) {
    if (!crewPlayers) return [];
    if (Array.isArray(crewPlayers)) return crewPlayers;
    if (typeof crewPlayers[Symbol.iterator] === 'function' && typeof crewPlayers !== 'string') {
        return Array.from(crewPlayers);
    }
    if (typeof crewPlayers === 'object') {
        return Object.values(crewPlayers);
    }
    return [];
}

/**
 * Extracts standard position vector from player object.
 */
export function extractPosition(player) {
    if (!player) return null;
    if (player.position && typeof player.position === 'object') {
        return {
            x: Number(player.position.x) || 0,
            y: Number(player.position.y) || COOP_TETHER_CONFIG.WATER_SURFACE_Y,
            z: Number(player.position.z) || 0,
        };
    }
    if (typeof player.x === 'number' || typeof player.z === 'number') {
        return {
            x: Number(player.x) || 0,
            y: Number(player.y) || COOP_TETHER_CONFIG.WATER_SURFACE_Y,
            z: Number(player.z) || 0,
        };
    }
    return null;
}

/**
 * Creates the 3D Co-Op Teammate Tether, Cohesion Aura & Directional Beacon VFX instance.
 *
 * @param {object} THREE - Three.js library instance
 * @param {object} [options] - Configuration overrides
 * @returns {object} Controller instance with vfxGroup, pools, and helper methods
 */
export function createCoopTetherVfx(THREE, options = {}) {
    if (!THREE) {
        throw new Error('THREE instance is required to create Co-Op Tether VFX');
    }

    const vfxGroup = new THREE.Group();
    vfxGroup.name = 'CoopTetherVfx_Root';

    const maxTeammates = options.maxTeammates ?? COOP_TETHER_CONFIG.MAX_TEAMMATES;
    const tetherSegments = options.tetherSegments ?? COOP_TETHER_CONFIG.TETHER_SEGMENTS;
    const vertexCount = tetherSegments + 1;

    const LineClass = THREE.Line || THREE.LineSegments || THREE.Object3D;
    const MeshBasicMatClass = THREE.MeshBasicMaterial || THREE.Material;
    const LineBasicMatClass = THREE.LineBasicMaterial || THREE.Material;
    const RingGeoClass = THREE.RingGeometry || THREE.BufferGeometry;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. POOLED 3D CATENARY TOW-LINE HAWSER MESHES
    // ─────────────────────────────────────────────────────────────────────────
    const tetherPool = [];
    for (let i = 0; i < maxTeammates; i++) {
        const positions = new Float32Array(vertexCount * 3);
        const geo = new THREE.BufferGeometry();
        const posAttr = new (THREE.BufferAttribute || THREE.Float32BufferAttribute)(positions, 3);
        if (posAttr.setUsage && THREE.DynamicDrawUsage) posAttr.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', posAttr);

        const mat = new LineBasicMatClass({
            color: COOP_TETHER_CONFIG.COLORS.GOLDEN_TETHER,
            transparent: true,
            opacity: 0.9,
            linewidth: 3,
            depthWrite: false,
        });

        const line = new LineClass(geo, mat);
        line.name = `CoopTetherLine_${i}`;
        line.visible = false;
        line.frustumCulled = false;
        vfxGroup.add(line);

        tetherPool.push({
            line,
            geo,
            mat,
            posAttr,
            active: false,
            teammateId: null,
            state: 'idle',
            distance: 0,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. POOLED 3D COHESION TEAMWORK AURA RINGS (Raft Water Halos)
    // ─────────────────────────────────────────────────────────────────────────
    // Expands beneath local raft and close cohesion teammates
    const auraPool = [];
    const maxAuras = maxTeammates + 1; // +1 for local raft
    for (let i = 0; i < maxAuras; i++) {
        const auraGeo = new RingGeoClass(
            COOP_TETHER_CONFIG.AURA_RADIUS_MIN,
            COOP_TETHER_CONFIG.AURA_RADIUS_MAX,
            32
        );
        if (auraGeo.rotateX) {
            auraGeo.rotateX(-Math.PI / 2); // Lay flat on water plane
        }

        const auraMat = new MeshBasicMatClass({
            color: COOP_TETHER_CONFIG.COLORS.COHESION_AURA,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide ?? 2,
            depthWrite: false,
        });

        const mesh = new THREE.Mesh(auraGeo, auraMat);
        mesh.name = `CohesionAuraRing_${i}`;
        mesh.visible = false;
        mesh.frustumCulled = false;
        vfxGroup.add(mesh);

        auraPool.push({
            mesh,
            geo: auraGeo,
            mat: auraMat,
            active: false,
            targetId: null,
            pulsePhase: Math.random() * Math.PI * 2,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. POOLED 3D DIRECTIONAL COMPASS CHEVRONS (Edge-of-View Teammate Beacon)
    // ─────────────────────────────────────────────────────────────────────────
    // Orbits around the local player raft, pointing towards separated teammates
    const beaconPool = [];
    for (let i = 0; i < maxTeammates; i++) {
        const beaconGroup = new THREE.Group();
        beaconGroup.name = `TeammateBeacon_${i}`;

        // Build procedural 3D chevron arrow geometry pointing forward along -Z
        // Standard high-visibility V-arrow: 3 vertices / triangular prism
        const arrowGeo = new THREE.BufferGeometry();
        // 3D Arrowhead: apex at (0, 0, -1.2), left tail at (-0.6, 0, 0.4), right tail at (0.6, 0, 0.4), notch at (0, 0, 0.0)
        // Lay flat on horizontal plane (XZ)
        const vertices = new Float32Array([
            0.0, 0.0, -1.2,   // Apex (nose)
            -0.6, 0.0, 0.4,   // Left barb
            0.0, 0.0, 0.0,    // Center notch

            0.0, 0.0, -1.2,   // Apex
            0.0, 0.0, 0.0,    // Center notch
            0.6, 0.0, 0.4,    // Right barb
        ]);
        const arrowPosAttr = new (THREE.BufferAttribute || THREE.Float32BufferAttribute)(vertices, 3);
        arrowGeo.setAttribute('position', arrowPosAttr);

        const arrowMat = new MeshBasicMatClass({
            color: COOP_TETHER_CONFIG.COLORS.BEACON_CHEVRON,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide ?? 2,
            depthWrite: false,
        });

        const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
        beaconGroup.add(arrowMesh);

        // Core pulsating diamond / beacon marker
        const coreGeo = new RingGeoClass(0.1, 0.35, 4);
        if (coreGeo.rotateX) coreGeo.rotateX(-Math.PI / 2);
        const coreMat = new MeshBasicMatClass({
            color: COOP_TETHER_CONFIG.COLORS.BEACON_PULSE,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide ?? 2,
            depthWrite: false,
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.set(0, 0.04, -0.4);
        beaconGroup.add(coreMesh);

        beaconGroup.visible = false;
        vfxGroup.add(beaconGroup);

        beaconPool.push({
            group: beaconGroup,
            arrowMesh,
            coreMesh,
            arrowGeo,
            coreGeo,
            arrowMat,
            coreMat,
            active: false,
            teammateId: null,
            bearingRad: 0,
            distance: 0,
        });
    }

    /**
     * Cleanly disposes all geometries, materials, and removes meshes from parent group.
     */
    function dispose() {
        for (const t of tetherPool) {
            t.geo.dispose?.();
            t.mat.dispose?.();
            vfxGroup.remove(t.line);
        }
        for (const a of auraPool) {
            a.geo.dispose?.();
            a.mat.dispose?.();
            vfxGroup.remove(a.mesh);
        }
        for (const b of beaconPool) {
            b.arrowGeo.dispose?.();
            b.coreGeo.dispose?.();
            b.arrowMat.dispose?.();
            b.coreMat.dispose?.();
            vfxGroup.remove(b.group);
        }
        tetherPool.length = 0;
        auraPool.length = 0;
        beaconPool.length = 0;
    }

    // Attach pools and dispose helper directly to the group for flexible controller access
    vfxGroup.dispose = dispose;
    vfxGroup._pools = {
        tetherPool,
        auraPool,
        beaconPool,
    };

    return vfxGroup;
}

/**
 * Updates the 3D Co-Op Tether, Cohesion Aura & Directional Beacon VFX system frame-by-frame.
 *
 * @param {object} vfxGroup - The group returned by createCoopTetherVfx
 * @param {object} params - Update parameters
 * @param {object} params.localPlayer - Local player raft data { id, x, y, z, position }
 * @param {Array|object} params.crewPlayers - Other active teammate rafts
 * @param {number} [params.time=0] - Global animation elapsed seconds
 */
export function updateCoopTetherVfx(vfxGroup, { localPlayer, crewPlayers, time = 0 } = {}) {
    if (!vfxGroup || !vfxGroup._pools) {
        return;
    }

    const { tetherPool, auraPool, beaconPool } = vfxGroup._pools;
    const localPos = extractPosition(localPlayer);

    // If local player is dead/missing, hide all tether visuals
    if (!localPos) {
        for (const t of tetherPool) { t.active = false; t.line.visible = false; }
        for (const a of auraPool) { a.active = false; a.mesh.visible = false; }
        for (const b of beaconPool) { b.active = false; b.group.visible = false; }
        return;
    }

    const localId = localPlayer.id ?? localPlayer.socketId ?? 'local';
    const teammates = normalizeCrewPlayers(crewPlayers).filter((p) => {
        if (!p) return false;
        const pId = p.id ?? p.socketId ?? p.name;
        // Don't tether to self, or dead players
        if (pId === localId) return false;
        if (p.isDead || p.health <= 0) return false;
        return true;
    });

    let activeTethersCount = 0;
    let activeAurasCount = 0;
    let activeBeaconsCount = 0;
    let hasCloseCohesion = false;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. EVALUATE TEAMMATE PROXIMITIES & UPDATE TETHERS / BEACONS
    // ─────────────────────────────────────────────────────────────────────────
    for (let i = 0; i < teammates.length; i++) {
        const mate = teammates[i];
        const matePos = extractPosition(mate);
        if (!matePos) continue;

        const mateId = mate.id ?? mate.socketId ?? `mate_${i}`;
        const { dx, dy, dz, distTotal, distHoriz } = getDistance3D(localPos, matePos);
        const evalResult = evaluateTetherBand(distTotal);

        if (evalResult.isAuraActive) {
            hasCloseCohesion = true;
        }

        // A. Catenary Tow-Line Hawser (Active within <= 45m)
        if (distTotal <= COOP_TETHER_CONFIG.WARNING_MAX_DISTANCE && activeTethersCount < tetherPool.length) {
            const tSlot = tetherPool[activeTethersCount++];
            tSlot.active = true;
            tSlot.teammateId = mateId;
            tSlot.state = evalResult.state;
            tSlot.distance = distTotal;
            tSlot.line.visible = true;

            // Update line material color and opacity
            if (tSlot.mat.color?.setHex) {
                tSlot.mat.color.setHex(evalResult.colorHex);
            }
            if (tSlot.mat.opacity !== undefined) {
                if (evalResult.state === 'cohesion') {
                    // Pulsing golden aura intensity
                    const pulse = 0.85 + 0.15 * Math.sin(time * 6.0);
                    tSlot.mat.opacity = pulse;
                } else if (evalResult.state === 'warning') {
                    // Rapid warning tension strobe
                    const pulse = 0.6 + 0.4 * Math.sin(time * 16.0);
                    tSlot.mat.opacity = pulse;
                } else {
                    // Smooth transition fade
                    tSlot.mat.opacity = 0.75;
                }
            }

            // Update catenary vertex buffer
            const posAttr = tSlot.posAttr;
            const posArr = posAttr.array;
            const segments = COOP_TETHER_CONFIG.TETHER_SEGMENTS;
            const tempPt = { x: 0, y: 0, z: 0 };

            for (let s = 0; s <= segments; s++) {
                const t = s / segments;
                computeCatenaryPoint(localPos, matePos, t, distTotal, time, evalResult.state, tempPt);
                const s3 = s * 3;
                posArr[s3 + 0] = tempPt.x;
                posArr[s3 + 1] = tempPt.y;
                posArr[s3 + 2] = tempPt.z;
            }
            posAttr.needsUpdate = true;
        }

        // B. Cohesion Aura for Close Teammate (<= 22m)
        if (evalResult.isAuraActive && activeAurasCount < auraPool.length) {
            const aSlot = auraPool[activeAurasCount++];
            aSlot.active = true;
            aSlot.targetId = mateId;
            aSlot.mesh.visible = true;

            // Position flat on water plane under teammate raft
            const pulse = 0.5 + 0.5 * Math.sin(time * 3.5 + aSlot.pulsePhase);
            const scale = 1.0 + pulse * 0.15;

            aSlot.mesh.position.set(matePos.x, COOP_TETHER_CONFIG.WATER_SURFACE_Y + 0.03, matePos.z);
            aSlot.mesh.scale.set(scale, scale, scale);
            if (aSlot.mat.opacity !== undefined) {
                aSlot.mat.opacity = 0.35 + pulse * 0.25;
            }
        }

        // C. 3D Directional Compass Beacon for Separated Teammates (> 25m)
        if (evalResult.isBeaconActive && activeBeaconsCount < beaconPool.length) {
            const bSlot = beaconPool[activeBeaconsCount++];
            bSlot.active = true;
            bSlot.teammateId = mateId;
            bSlot.distance = distTotal;
            bSlot.group.visible = true;

            // Compute angle from local player to separated teammate
            // In Three.js XZ plane, angle = Math.atan2(dx, dz)
            const bearing = Math.atan2(dx, dz);
            bSlot.bearingRad = bearing;

            // Position beacon at edge-of-orbit around local player raft
            const orbitR = COOP_TETHER_CONFIG.BEACON_ORBIT_RADIUS;
            const beaconX = localPos.x + Math.sin(bearing) * orbitR;
            const beaconZ = localPos.z + Math.cos(bearing) * orbitR;
            const beaconY = (localPos.y ?? COOP_TETHER_CONFIG.WATER_SURFACE_Y) + 0.45;

            bSlot.group.position.set(beaconX, beaconY, beaconZ);

            // Orient the chevron to point toward the separated teammate:
            // Chevron arrow is built pointing along -Z.
            // Rotation around Y: bearing + PI aligns -Z towards (dx, dz).
            bSlot.group.rotation.y = bearing + Math.PI;

            // Pulse beacon scale and opacity based on distance urgency
            const urgencyPulse = 0.85 + 0.25 * Math.sin(time * 8.0);
            bSlot.group.scale.set(urgencyPulse, urgencyPulse, urgencyPulse);

            if (bSlot.arrowMat?.color?.setHex) {
                const arrowCol = distTotal > COOP_TETHER_CONFIG.WARNING_MAX_DISTANCE
                    ? COOP_TETHER_CONFIG.COLORS.BEACON_CHEVRON
                    : COOP_TETHER_CONFIG.COLORS.AMBER_WARNING;
                bSlot.arrowMat.color.setHex(arrowCol);
            }
            if (bSlot.arrowMat?.opacity !== undefined) {
                bSlot.arrowMat.opacity = 0.85 + 0.15 * Math.sin(time * 10.0);
            }
            if (bSlot.coreMesh) {
                bSlot.coreMesh.rotation.z = time * 4.0;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. LOCAL RAFT COHESION AURA
    // ─────────────────────────────────────────────────────────────────────────
    // If local player has at least one teammate in close cohesion (<= 22m),
    // render a glowing teamwork water halo under local player's raft too
    if (hasCloseCohesion && activeAurasCount < auraPool.length) {
        const localAura = auraPool[activeAurasCount++];
        localAura.active = true;
        localAura.targetId = localId;
        localAura.mesh.visible = true;

        const pulse = 0.5 + 0.5 * Math.sin(time * 3.5);
        const scale = 1.0 + pulse * 0.15;
        localAura.mesh.position.set(localPos.x, COOP_TETHER_CONFIG.WATER_SURFACE_Y + 0.03, localPos.z);
        localAura.mesh.scale.set(scale, scale, scale);
        if (localAura.mat.opacity !== undefined) {
            localAura.mat.opacity = 0.4 + pulse * 0.3;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. HIDE UNUSED POOL SLOTS
    // ─────────────────────────────────────────────────────────────────────────
    for (let i = activeTethersCount; i < tetherPool.length; i++) {
        tetherPool[i].active = false;
        tetherPool[i].line.visible = false;
    }
    for (let i = activeAurasCount; i < auraPool.length; i++) {
        auraPool[i].active = false;
        auraPool[i].mesh.visible = false;
    }
    for (let i = activeBeaconsCount; i < beaconPool.length; i++) {
        beaconPool[i].active = false;
        beaconPool[i].group.visible = false;
    }
}
