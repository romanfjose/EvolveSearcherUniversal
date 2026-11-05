/**
 * 3D Nautical Channel Buoy & Safe-Lane Beacon Builder
 * (`public/js/world/nautical-buoy-lanes.js`)
 *
 * Populates the 80m river corridor with bobbing nautical navigation buoys:
 *   1. Starboard Channel Buoys: Vibrant green conical floating spars with blinking green lanterns
 *      and retro-reflective bands marking navigable fairway margins.
 *   2. Port Channel Buoys: Crimson cylindrical floating cans marking opposite fairway boundaries.
 *   3. Emerald Sanctuary Approach Buoys: Glowing emerald-lit pylons flanking safe dock platforms,
 *      guiding low-health or weary crews into sanctuary mooring zones.
 *   4. Harbor City Gateway Beacons: Paired towering floating harbor fairway gates with twin-flash
 *      navigation lanterns demarcating the tranquilAct II calm basin entrance.
 *
 * Hydrodynamics & Optics:
 *   - Simulates floating buoyancy with dual-frequency vertical bobbing and water current tilt.
 *   - Emissive beacon lenses cycle through nautical flash characteristics (Fl G 2.5s, Fl R 2.5s, Fl(2) 5s).
 *
 * Clean, zero-external-dependency ES module. Compatible with Three.js or headless mocks.
 */

/**
 * Creates safe materials supporting mock and standard Three.js materials.
 */
function createMat(THREE, type, params) {
    const MatClass = THREE[type] || THREE.MeshStandardMaterial || THREE.Material;
    return new MatClass(params);
}

/**
 * Default configurations for the 80m river corridor and landmarks.
 */
export const BUOY_CONFIG = {
    DEFAULT_RIVER_WIDTH: 80.0,
    DEFAULT_Z_START: 0,
    DEFAULT_Z_END: -1500,
    CHANNEL_BUOY_INTERVAL: 45.0, // meters between channel markers along Z
    HARBOR_CITY_Z: -145.0,       // Act II Harbor City calm basin entrance
    BUOY_BASE_RADIUS: 0.9,
    BUOY_HEIGHT: 2.2,
};

/**
 * Procedural low-poly 3D Buoy Mesh Builder.
 * Builds a single detailed nautical buoy with hull float, counterweight ballast ring,
 * superstructure cage, reflective band, and illuminated top-mark beacon.
 *
 * @param {object} THREE - Three.js namespace or mock.
 * @param {object} opts - Configuration options for this specific buoy.
 * @returns {object} Object containing THREE.Group and animation hooks.
 */
function createBuoyMesh(THREE, opts) {
    const group = new THREE.Group();
    group.name = `Buoy_${opts.type}_${opts.id}`;
    group.position.set(opts.x, opts.y ?? 0.15, opts.z);

    const isStarboard = opts.type === 'starboard';
    const isPort = opts.type === 'port';
    const isSanctuary = opts.type === 'sanctuary';
    const isHarbor = opts.type === 'harbor';

    // Primary color scheme based on nautical IALA / Sanctuary standards
    let hullColor = 0x10b981; // Green
    let beaconColor = 0x34d399; // Emerald green
    let emissiveColor = 0x059669;

    if (isPort) {
        hullColor = 0xef4444; // Crimson red
        beaconColor = 0xf87171;
        emissiveColor = 0xdc2626;
    } else if (isSanctuary) {
        hullColor = 0x047857; // Deep sanctuary emerald
        beaconColor = 0x10b981; // Bright emerald
        emissiveColor = 0x34d399;
    } else if (isHarbor) {
        hullColor = 0x0284c7; // Deep nautical azure
        beaconColor = 0x38bdf8; // Sky cyan
        emissiveColor = 0x0ea5e9;
    }

    const hullMat = createMat(THREE, 'MeshStandardMaterial', {
        color: hullColor,
        roughness: 0.45,
        metalness: 0.35,
    });

    const ironMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x1e293b,
        roughness: 0.65,
        metalness: 0.75,
    });

    const reflectiveMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.1,
    });

    const beaconMat = createMat(THREE, 'MeshStandardMaterial', {
        color: beaconColor,
        emissive: new THREE.Color(emissiveColor),
        emissiveIntensity: 1.5,
        roughness: 0.15,
        metalness: 0.2,
    });

    // 1. Underwater Counterweight Ballast
    const ballast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, 0.8, 8),
        ironMat
    );
    ballast.position.set(0, -0.6, 0);
    group.add(ballast);

    // 2. Main Buoyant Hull Body (Conical for starboard/sanctuary, Can/Cylindrical for port)
    let bodyMesh;
    if (isPort) {
        bodyMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.75, 0.8, 1.2, 10),
            hullMat
        );
    } else {
        // Conical spar float
        bodyMesh = new THREE.Mesh(
            new THREE.ConeGeometry ? new THREE.ConeGeometry(0.85, 1.4, 10) : new THREE.CylinderGeometry(0.1, 0.85, 1.4, 10),
            hullMat
        );
    }
    bodyMesh.position.set(0, 0.4, 0);
    group.add(bodyMesh);

    // 3. Retro-Reflective Center Waist Band
    const bandMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.76, 0.22, 10),
        reflectiveMat
    );
    bandMesh.position.set(0, 0.45, 0);
    group.add(bandMesh);

    // 4. Lattice Superstructure / Mast Pylons
    const mastHeight = isHarbor ? 1.8 : 1.1;
    const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, mastHeight, 6),
        ironMat
    );
    mast.position.set(0, 1.0 + mastHeight * 0.5, 0);
    group.add(mast);

    // Protective Cage Ring around lantern
    const cageRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.04, 6, 12),
        ironMat
    );
    cageRing.rotation.x = Math.PI * 0.5;
    cageRing.position.set(0, 1.0 + mastHeight, 0);
    group.add(cageRing);

    // 5. High-Intensity Flashing Beacon Lantern
    const lanternGeo = isSanctuary
        ? (THREE.OctahedronGeometry ? new THREE.OctahedronGeometry(0.28, 0) : new THREE.SphereGeometry(0.28, 8, 8))
        : new THREE.SphereGeometry(0.24, 8, 8);
    const lantern = new THREE.Mesh(lanternGeo, beaconMat);
    lantern.position.set(0, 1.0 + mastHeight + 0.15, 0);
    group.add(lantern);

    // 6. Water Surface Foam Splash / Mooring Ring
    const foamMat = createMat(THREE, 'MeshBasicMaterial', {
        color: isSanctuary ? 0x6ee7b7 : (isStarboard ? 0xa7f3d0 : 0xfecaca),
        transparent: true,
        opacity: 0.4,
    });
    const waterRing = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.15, 16),
        foamMat
    );
    waterRing.rotation.x = -Math.PI * 0.5;
    waterRing.position.set(0, -0.05, 0);
    group.add(waterRing);

    const buoyItem = {
        id: opts.id,
        type: opts.type,
        role: opts.role || 'channel',
        group,
        beaconMat,
        waterRing,
        baseY: opts.y ?? 0.15,
        baseX: opts.x,
        baseZ: opts.z,
        phase: opts.phase ?? Math.random() * Math.PI * 2,
        bobSpeed: 1.8 + (Math.sin(opts.id * 1.7) + 1.0) * 0.4,
        flashPeriod: isHarbor ? 3.0 : (isSanctuary ? 2.0 : 2.5),
        flashDutyCycle: isSanctuary ? 0.65 : 0.4, // Sanctuary lanterns stay lit longer
    };

    group.userData = { buoyItem };
    return buoyItem;
}

/**
 * Builds the complete 3D Nautical Buoy & Safe-Lane network.
 * Places starboard, port, safe dock approach, and Harbor City gateway beacons.
 *
 * @param {object} THREE - Three.js namespace or mock.
 * @param {object} [options={}] - World dimensions and platform locations.
 * @param {number} [options.riverWidth=80.0] - Total river corridor width.
 * @param {number} [options.zStart=0] - Starting Z coordinate (downriver navigation).
 * @param {number} [options.zEnd=-1500] - Destination finish line Z coordinate.
 * @param {Array<object>} [options.platforms=[]] - Array of sanctuary platforms to flank with guidance buoys.
 * @returns {object} Root THREE.Group with children buoys, metadata, and buoys array.
 */
export function buildNauticalBuoyLanes(THREE, options = {}) {
    const riverWidth = Number.isFinite(options.riverWidth) && options.riverWidth > 0
        ? options.riverWidth
        : BUOY_CONFIG.DEFAULT_RIVER_WIDTH;

    const zStart = Number.isFinite(options.zStart) ? options.zStart : BUOY_CONFIG.DEFAULT_Z_START;
    const zEnd = Number.isFinite(options.zEnd) ? options.zEnd : BUOY_CONFIG.DEFAULT_Z_END;

    // Default Sanctuary Platform locations if none provided
    const platforms = Array.isArray(options.platforms) && options.platforms.length > 0
        ? options.platforms
        : [
            { id: 'dock-act1', x: -riverWidth * 0.35, z: -280, width: 14, length: 18, name: 'Redwood Haven' },
            { id: 'dock-act2', x: riverWidth * 0.35, z: -580, width: 16, length: 20, name: 'Harbor Drydock' },
            { id: 'dock-act3', x: -riverWidth * 0.32, z: -920, width: 14, length: 18, name: 'Crystal Outpost' },
            { id: 'dock-act4', x: riverWidth * 0.30, z: -1280, width: 15, length: 20, name: 'Tempest Pier' },
        ];

    const rootGroup = new THREE.Group();
    rootGroup.name = 'NauticalBuoyLanes';

    const buoys = [];
    let idCounter = 1;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Starboard & Port Channel Navigation Markers
    // ─────────────────────────────────────────────────────────────────────────
    // Maintain a safe fairway channel in the inner 70% of river corridor
    const starboardX = riverWidth * 0.38; // Right bank margin (+x)
    const portX = -riverWidth * 0.38;      // Left bank margin (-x)

    const interval = BUOY_CONFIG.CHANNEL_BUOY_INTERVAL;
    const totalDist = Math.abs(zEnd - zStart);
    const steps = Math.floor(totalDist / interval);

    for (let i = 1; i <= steps; i++) {
        const z = zStart - i * interval;

        // Skip channel buoys in Harbor City basin entrance (handled by harbor gateway markers)
        if (z < -130 && z > -270) {
            continue;
        }

        // Green Starboard Conical Buoy (+x)
        const stbBuoy = createBuoyMesh(THREE, {
            id: idCounter++,
            type: 'starboard',
            role: 'channel_starboard',
            x: starboardX + Math.sin(z * 0.05) * 1.5,
            z: z + (i % 2 === 0 ? 3.0 : -3.0),
            phase: (i * 0.7) % (Math.PI * 2),
        });
        rootGroup.add(stbBuoy.group);
        buoys.push(stbBuoy);

        // Crimson Port Can Buoy (-x)
        const portBuoy = createBuoyMesh(THREE, {
            id: idCounter++,
            type: 'port',
            role: 'channel_port',
            x: portX - Math.sin(z * 0.05) * 1.5,
            z: z,
            phase: (i * 0.7 + Math.PI) % (Math.PI * 2),
        });
        rootGroup.add(portBuoy.group);
        buoys.push(portBuoy);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Emerald Sanctuary Dock Approach Safe Lanes
    // ─────────────────────────────────────────────────────────────────────────
    // Flank each sanctuary platform with pairs of glowing emerald approach markers
    for (const plat of platforms) {
        const pz = plat.z ?? -300;
        const px = plat.x ?? 0;
        const halfW = (plat.width || 14) * 0.5;
        const halfL = (plat.length || 18) * 0.5;

        // Upriver entrance gate markers (guiding into the dock)
        const approachOffsets = [
            { dx: -halfW - 3.0, dz: halfL + 6.0, label: 'approach_outer' },
            { dx: halfW + 3.0, dz: halfL + 6.0, label: 'approach_inner' },
            { dx: -halfW - 2.5, dz: 0, label: 'berth_flank' },
        ];

        for (const off of approachOffsets) {
            const sancBuoy = createBuoyMesh(THREE, {
                id: idCounter++,
                type: 'sanctuary',
                role: 'dock_sanctuary',
                x: px + off.dx,
                z: pz + off.dz,
                phase: (idCounter * 1.1) % (Math.PI * 2),
            });
            rootGroup.add(sancBuoy.group);
            buoys.push(sancBuoy);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Act II Harbor City Calm Basin Gateway Fairway Markers
    // ─────────────────────────────────────────────────────────────────────────
    // Mark the entrance to the safe harbor basin (z = -140 to -260) on the right bank
    const harborGatewayZ = BUOY_CONFIG.HARBOR_CITY_Z; // -145m
    const harborMarkers = [
        { x: 12.0, z: harborGatewayZ + 10, role: 'harbor_gateway_left' },
        { x: 38.0, z: harborGatewayZ + 10, role: 'harbor_gateway_right' },
        { x: 14.0, z: harborGatewayZ - 20, role: 'harbor_channel_inner' },
        { x: 36.0, z: harborGatewayZ - 20, role: 'harbor_channel_inner' },
        { x: 16.0, z: harborGatewayZ - 60, role: 'harbor_basin_safe' },
    ];

    for (const hm of harborMarkers) {
        const harborBuoy = createBuoyMesh(THREE, {
            id: idCounter++,
            type: 'harbor',
            role: hm.role,
            x: hm.x,
            z: hm.z,
            phase: (idCounter * 1.3) % (Math.PI * 2),
        });
        rootGroup.add(harborBuoy.group);
        buoys.push(harborBuoy);
    }

    rootGroup.userData = {
        riverWidth,
        zStart,
        zEnd,
        buoys,
        platforms,
        buoyCount: buoys.length,
    };

    return rootGroup;
}

/**
 * Updates physics bobbing, hydrodynamic tilt, and flashing beacons for all buoys.
 *
 * @param {object} group - The root THREE.Group returned by `buildNauticalBuoyLanes`.
 * @param {number} time - Elapsed time in seconds.
 */
export function stepNauticalBuoys(group, time = 0) {
    if (!group || !group.userData) return;

    const buoys = group.userData.buoys;
    if (!Array.isArray(buoys)) return;

    for (let i = 0; i < buoys.length; i++) {
        const b = buoys[i];
        const t = time * b.bobSpeed + b.phase;

        // 1. Hydrodynamic Buoyancy Bob (Compound Sine Wave)
        const verticalBob = Math.sin(t) * 0.14 + Math.sin(t * 2.3) * 0.05;
        b.group.position.y = b.baseY + verticalBob;

        // 2. Wave Surface Tilt / Roll
        const tiltRoll = Math.sin(t * 0.8) * 0.12;
        const tiltPitch = Math.cos(t * 1.1) * 0.08;
        b.group.rotation.z = tiltRoll;
        b.group.rotation.x = tiltPitch;

        // 3. Water surface ring pulsing with bobbing
        if (b.waterRing) {
            const scale = 1.0 + Math.sin(t * 1.5) * 0.15;
            b.waterRing.scale.set(scale, scale, 1);
        }

        // 4. Flashing Nautical Beacon Optical Flash Cycle
        if (b.beaconMat) {
            const flashCycle = (time + b.phase) % b.flashPeriod;
            const isLit = flashCycle < (b.flashPeriod * b.flashDutyCycle);

            if (isLit) {
                // Smooth pulse crest
                const pulseT = flashCycle / (b.flashPeriod * b.flashDutyCycle);
                const pulseIntensity = 1.2 + Math.sin(pulseT * Math.PI) * 1.8;
                b.beaconMat.emissiveIntensity = pulseIntensity;
            } else {
                b.beaconMat.emissiveIntensity = 0.15; // Dim standby glow
            }
        }
    }
}
