/**
 * 3D Sanctuary Platform & Safe Haven Mesh Builder
 *
 * Implements architectural safe haven islands / river platforms for "Don't Sink, Don't Die":
 * - Heavy timber pilings driven into the riverbed with iron stabilizing cross-braces
 * - Weathered wooden deck with staggered plank gaps and edge curbing
 * - 4 Corner mooring bollards wrapped with coiled hemp ropes
 * - Warm glowing campfire/brazier at the center (stone fire ring, burning charcoal embers, dancing flame cones)
 * - Inclined boarding ramp on the upriver edge (+Z lip) facilitating smooth raft docking
 * - Subtle emerald protective ward ring on the water surface that brightens and pulses when crewmates dock
 *
 * Polished living aesthetic with composite 3D models and zero external runtime dependencies.
 * Injected THREE-compatible.
 */

/**
 * Builds a complete 3D Sanctuary Platform mesh group.
 *
 * @param {object} THREE - Injected Three.js library instance
 * @param {object} [platformSpec={}] - Configuration options for the sanctuary platform
 * @returns {object} THREE.Group instance populated with meshes and animation metadata in userData
 */
export function buildSanctuaryPlatformMesh(THREE, platformSpec = {}) {
    if (!THREE) {
        throw new Error('buildSanctuaryPlatformMesh requires a valid THREE instance');
    }

    const {
        id = 'sanctuary_0',
        x = 0,
        y = 0.15,
        z = 0,
        width = 12.0,
        length = 16.0,
        deckThickness = 0.35,
        pilingDepth = 5.0,
        rampLength = 4.0,
        wardRadius = 9.5,
        rotationY = 0,
    } = platformSpec;

    const group = new THREE.Group();
    group.name = `SanctuaryPlatform_${id}`;
    group.position.set(x, y, z);
    if (rotationY) {
        group.rotation.y = rotationY;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Materials Palette
    // ─────────────────────────────────────────────────────────────────────────
    const timberDarkMat = new THREE.MeshStandardMaterial({
        color: 0x3d271d, // Heavy treated dark timber
        roughness: 0.9,
        metalness: 0.05,
    });

    const deckPlankMat = new THREE.MeshStandardMaterial({
        color: 0x6e472e, // Weathered oak planking
        roughness: 0.8,
        metalness: 0.08,
    });

    const ironHardwareMat = new THREE.MeshStandardMaterial({
        color: 0x24282f, // Cast iron fittings and bands
        roughness: 0.45,
        metalness: 0.85,
    });

    const ropeMat = new THREE.MeshStandardMaterial({
        color: 0xa88f62, // Coiled hemp rope
        roughness: 0.95,
        metalness: 0.0,
    });

    const stoneMat = new THREE.MeshStandardMaterial({
        color: 0x57534e, // Slate river stones
        roughness: 0.85,
        metalness: 0.1,
    });

    const emberMat = new THREE.MeshStandardMaterial({
        color: 0xff3b00, // Glowing charcoal embers
        roughness: 0.6,
        metalness: 0.1,
        emissive: new THREE.Color ? new THREE.Color(0xff4500) : { hex: 0xff4500 },
        emissiveIntensity: 0.9,
    });

    const flameMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00, // Core fire flame
        transparent: true,
        opacity: 0.88,
    });

    const innerFlameMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, // Hot flame core
        transparent: true,
        opacity: 0.92,
    });

    const wardMat = new THREE.MeshBasicMaterial({
        color: 0x10b981, // Emerald safe haven protective ward
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Heavy Timber Pilings & Cross-Braces Driven into Riverbed
    // ─────────────────────────────────────────────────────────────────────────
    const pilingsGroup = new THREE.Group();
    pilingsGroup.name = 'PilingsGroup';

    const pilingRadius = 0.32;
    const pilingPoles = [];
    const colCount = Math.max(3, Math.round(width / 3.5));
    const rowCount = Math.max(3, Math.round(length / 4.0));

    const halfW = width * 0.5;
    const halfL = length * 0.5;

    for (let r = 0; r < rowCount; r++) {
        const pz = -halfL + (r / (rowCount - 1)) * length;
        for (let c = 0; c < colCount; c++) {
            const px = -halfW + (c / (colCount - 1)) * width;

            // Piling cylinder
            const pilingGeo = new THREE.CylinderGeometry(pilingRadius * 0.9, pilingRadius, pilingDepth, 10);
            const piling = new THREE.Mesh(pilingGeo, timberDarkMat);
            piling.position.set(px, -pilingDepth * 0.5 + deckThickness * 0.5, pz);
            pilingsGroup.add(piling);
            pilingPoles.push(piling);

            // Iron band collar near the top waterline
            const bandGeo = new THREE.CylinderGeometry(pilingRadius * 1.05, pilingRadius * 1.05, 0.15, 10);
            const band = new THREE.Mesh(bandGeo, ironHardwareMat);
            band.position.set(px, 0.05, pz);
            pilingsGroup.add(band);
        }
    }

    // Heavy cross-beam timber girders supporting deck underside
    for (let c = 0; c < colCount; c++) {
        const px = -halfW + (c / (colCount - 1)) * width;
        const girderGeo = new THREE.BoxGeometry(0.35, 0.45, length * 1.02);
        const girder = new THREE.Mesh(girderGeo, timberDarkMat);
        girder.position.set(px, -0.25, 0);
        pilingsGroup.add(girder);
    }

    group.add(pilingsGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Boarded Deck Planks with Curbing
    // ─────────────────────────────────────────────────────────────────────────
    const deckGroup = new THREE.Group();
    deckGroup.name = 'DeckPlanksGroup';

    const plankCount = Math.max(8, Math.round(length / 0.7));
    const plankWidth = length / plankCount;
    const planks = [];

    for (let i = 0; i < plankCount; i++) {
        const pz = -halfL + (i + 0.5) * plankWidth;
        const plankGap = 0.04;
        const plankMesh = new THREE.Mesh(
            new THREE.BoxGeometry(width * 0.98, deckThickness, plankWidth - plankGap),
            deckPlankMat
        );
        // Slight subtle height/rotation variation for weathered rustic planks
        const slightStagger = ((i % 3) - 1) * 0.008;
        plankMesh.position.set(0, slightStagger, pz);
        deckGroup.add(plankMesh);
        planks.push(plankMesh);
    }

    // Raised outer curb timber beams around deck edges
    const curbHeight = 0.22;
    const curbThickness = 0.25;

    // Left and right curbs
    for (const side of [-1, 1]) {
        const sideCurb = new THREE.Mesh(
            new THREE.BoxGeometry(curbThickness, curbHeight, length),
            timberDarkMat
        );
        sideCurb.position.set(side * (halfW - curbThickness * 0.5), deckThickness * 0.5 + curbHeight * 0.5, 0);
        deckGroup.add(sideCurb);
    }
    // Downriver end curb (-Z)
    const backCurb = new THREE.Mesh(
        new THREE.BoxGeometry(width - curbThickness * 2, curbHeight, curbThickness),
        timberDarkMat
    );
    backCurb.position.set(0, deckThickness * 0.5 + curbHeight * 0.5, -halfL + curbThickness * 0.5);
    deckGroup.add(backCurb);

    group.add(deckGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Corner Mooring Bollards with Coiled Rope
    // ─────────────────────────────────────────────────────────────────────────
    const bollardsGroup = new THREE.Group();
    bollardsGroup.name = 'MooringBollardsGroup';

    const bollards = [];
    const cornerOffsets = [
        { x: -halfW + 0.7, z: -halfL + 0.7 }, // SW
        { x: halfW - 0.7, z: -halfL + 0.7 },  // SE
        { x: -halfW + 0.7, z: halfL - 0.7 },  // NW
        { x: halfW - 0.7, z: halfL - 0.7 },   // NE
    ];

    cornerOffsets.forEach((pos, idx) => {
        const bollardSubGroup = new THREE.Group();
        bollardSubGroup.position.set(pos.x, deckThickness * 0.5, pos.z);

        // Heavy vertical iron/wood post
        const postGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.85, 12);
        const post = new THREE.Mesh(postGeo, ironHardwareMat);
        post.position.y = 0.42;

        // Mushroom cap top
        const capGeo = new THREE.CylinderGeometry(0.28, 0.2, 0.14, 12);
        const cap = new THREE.Mesh(capGeo, ironHardwareMat);
        cap.position.y = 0.88;

        // Coiled rope rings around base
        const ropeCoils = [];
        for (let c = 0; c < 3; c++) {
            const ropeGeo = new THREE.TorusGeometry(0.26 + c * 0.05, 0.06, 8, 16);
            const coil = new THREE.Mesh(ropeGeo, ropeMat);
            coil.rotation.x = Math.PI * 0.5;
            coil.position.y = 0.12 + c * 0.1;
            bollardSubGroup.add(coil);
            ropeCoils.push(coil);
        }

        bollardSubGroup.add(post, cap);
        bollardsGroup.add(bollardSubGroup);
        bollards.push({ group: bollardSubGroup, post, cap, ropeCoils, index: idx });
    });

    group.add(bollardsGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Central Warm Glowing Campfire / Brazier
    // ─────────────────────────────────────────────────────────────────────────
    const fireGroup = new THREE.Group();
    fireGroup.name = 'CampfireBrazierGroup';
    fireGroup.position.set(0, deckThickness * 0.5, 0);

    // A. Slate Fire Ring (Circular ring of cobblestone / slate rocks)
    const stoneRingCount = 10;
    const stoneRingRadius = 1.35;
    for (let s = 0; s < stoneRingCount; s++) {
        const angle = (s / stoneRingCount) * Math.PI * 2;
        const stoneGeo = new THREE.SphereGeometry(0.28, 7, 7);
        const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat);
        stoneMesh.scale.set(1.1, 0.7, 0.9);
        stoneMesh.position.set(
            Math.cos(angle) * stoneRingRadius,
            0.12,
            Math.sin(angle) * stoneRingRadius
        );
        fireGroup.add(stoneMesh);
    }

    // B. Cast Iron Brazier Basin
    const basinGeo = new THREE.CylinderGeometry(1.05, 0.65, 0.35, 16);
    const basin = new THREE.Mesh(basinGeo, ironHardwareMat);
    basin.position.y = 0.22;
    fireGroup.add(basin);

    // C. Glowing Bed of Embers & Charcoal
    const emberMoundGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.15, 12);
    const emberMound = new THREE.Mesh(emberMoundGeo, emberMat);
    emberMound.position.y = 0.35;
    fireGroup.add(emberMound);

    // D. Burning Timber Logs Arranged in Teepee
    const logGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.1, 8);
    for (let l = 0; l < 4; l++) {
        const log = new THREE.Mesh(logGeo, timberDarkMat);
        const logAngle = (l / 4) * Math.PI * 2;
        log.position.set(Math.cos(logAngle) * 0.35, 0.55, Math.sin(logAngle) * 0.35);
        log.rotation.x = 0.55 * Math.sin(logAngle);
        log.rotation.z = -0.55 * Math.cos(logAngle);
        fireGroup.add(log);
    }

    // E. Composite Flame Cones (outer orange, inner warm yellow/white)
    const flameCount = 3;
    const flameMeshes = [];
    for (let f = 0; f < flameCount; f++) {
        const outerFlameGeo = new THREE.ConeGeometry(0.38 - f * 0.05, 1.25 - f * 0.15, 8);
        const outerFlame = new THREE.Mesh(outerFlameGeo, flameMat);
        outerFlame.position.set(
            (f === 1 ? -0.18 : f === 2 ? 0.16 : 0.0),
            0.95,
            (f === 1 ? 0.12 : f === 2 ? -0.12 : 0.0)
        );

        const innerFlameGeo = new THREE.ConeGeometry(0.2 - f * 0.03, 0.85 - f * 0.1, 8);
        const innerFlame = new THREE.Mesh(innerFlameGeo, innerFlameMat);
        innerFlame.position.y = -0.15;
        outerFlame.add(innerFlame);

        fireGroup.add(outerFlame);
        flameMeshes.push({ outer: outerFlame, inner: innerFlame, index: f });
    }

    group.add(fireGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Boarding Ramps on the Upriver Edge (+Z lip)
    // ─────────────────────────────────────────────────────────────────────────
    const rampGroup = new THREE.Group();
    rampGroup.name = 'BoardingRampsGroup';

    // Angled boarding ramp descending from deck level down toward river surface
    const rampWidth = width * 0.72;
    const rampSlopeAngle = Math.atan2(deckThickness + 0.1, rampLength);

    const rampDeckGeo = new THREE.BoxGeometry(rampWidth, deckThickness * 0.75, rampLength);
    const rampDeck = new THREE.Mesh(rampDeckGeo, deckPlankMat);
    // Position lip directly adjoining upriver deck (+Z)
    rampDeck.position.set(0, -deckThickness * 0.25, halfL + rampLength * 0.5);
    rampDeck.rotation.x = rampSlopeAngle;
    rampGroup.add(rampDeck);

    // Anti-slip wooden grip slats across ramp face
    const slatCount = Math.max(3, Math.round(rampLength / 0.8));
    const slats = [];
    for (let s = 0; s < slatCount; s++) {
        const slatGeo = new THREE.BoxGeometry(rampWidth * 0.94, 0.08, 0.12);
        const slat = new THREE.Mesh(slatGeo, timberDarkMat);
        const relZ = ((s + 0.5) / slatCount - 0.5) * rampLength;
        const relY = -relZ * Math.tan(rampSlopeAngle);
        slat.position.set(0, rampDeck.position.y + relY + 0.15, halfL + rampLength * 0.5 + relZ);
        slat.rotation.x = rampSlopeAngle;
        rampGroup.add(slat);
        slats.push(slat);
    }

    group.add(rampGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Emerald Protective Ward Ring on Water Surface
    // ─────────────────────────────────────────────────────────────────────────
    const wardRingGroup = new THREE.Group();
    wardRingGroup.name = 'ProtectiveWardGroup';

    // Primary outer glowing ward ring
    const wardRingGeo = new THREE.RingGeometry(wardRadius * 0.94, wardRadius, 48);
    const wardRing = new THREE.Mesh(wardRingGeo, wardMat);
    wardRing.rotation.x = -Math.PI * 0.5;
    wardRing.position.y = -y + 0.04; // Sits just above water level
    wardRingGroup.add(wardRing);

    // Inner concentric faint harmonic ring
    const innerWardGeo = new THREE.RingGeometry(wardRadius * 0.74, wardRadius * 0.77, 36);
    const innerWardMat = new THREE.MeshBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
    });
    const innerWardRing = new THREE.Mesh(innerWardGeo, innerWardMat);
    innerWardRing.rotation.x = -Math.PI * 0.5;
    innerWardRing.position.y = -y + 0.035;
    wardRingGroup.add(innerWardRing);

    group.add(wardRingGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // Attach Metadata & Animation Controller References
    // ─────────────────────────────────────────────────────────────────────────
    group.userData = {
        type: 'sanctuaryPlatform',
        id,
        spec: platformSpec,
        dimensions: { width, length, deckThickness, rampLength, wardRadius },
        materials: {
            timberDarkMat,
            deckPlankMat,
            ironHardwareMat,
            ropeMat,
            stoneMat,
            emberMat,
            flameMat,
            innerFlameMat,
            wardMat,
            innerWardMat,
        },
        components: {
            pilingsGroup,
            pilingPoles,
            deckGroup,
            planks,
            bollardsGroup,
            bollards,
            fireGroup,
            flameMeshes,
            basin,
            emberMound,
            rampGroup,
            rampDeck,
            slats,
            wardRingGroup,
            wardRing,
            innerWardRing,
        },
    };

    return group;
}

/**
 * Updates animations and dynamic visual reactions of the sanctuary platform:
 * - Campfire flickering, scaling, and ember pulse
 * - Emerald ward ring shimmer and brightening when crewmates are docked
 * - Bollard mooring line gentle bob/shimmer
 *
 * @param {object} meshGroup - Sanctuary platform THREE.Group returned by buildSanctuaryPlatformMesh
 * @param {object} [state={}] - Dynamic runtime state (e.g. { isDocked: boolean, crewCount: number, alertLevel: number })
 * @param {number} [time=0] - Current simulation or game time in seconds
 */
export function updateSanctuaryPlatformMesh(meshGroup, state = {}, time = 0) {
    if (!meshGroup || !meshGroup.userData || meshGroup.userData.type !== 'sanctuaryPlatform') {
        return;
    }

    const { materials, components } = meshGroup.userData;
    if (!materials || !components) return;

    const isDocked = Boolean(state?.isDocked || (state?.crewCount && state.crewCount > 0));
    const safeTime = typeof time === 'number' && !Number.isNaN(time) ? time : 0;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Campfire Flame & Ember Animation
    // ─────────────────────────────────────────────────────────────────────────
    const flameMeshes = components.flameMeshes || [];
    flameMeshes.forEach((flame, idx) => {
        const offset = idx * 1.35;
        // Natural chaotic flicker via composite sine waves
        const flicker = Math.sin(safeTime * 9.0 + offset) * 0.15 + Math.sin(safeTime * 14.2 + offset * 2.0) * 0.08;
        const scaleY = 1.0 + flicker;
        const scaleXZ = 1.0 - flicker * 0.5;

        if (flame.outer && flame.outer.scale) {
            flame.outer.scale.set(scaleXZ, Math.max(0.65, scaleY), scaleXZ);
            // Gentle wind / thermal sway
            flame.outer.rotation.z = Math.sin(safeTime * 4.5 + offset) * 0.08;
            flame.outer.rotation.x = Math.cos(safeTime * 3.8 + offset) * 0.06;
        }
    });

    // Ember glow pulsing
    if (materials.emberMat) {
        const baseIntensity = isDocked ? 1.25 : 0.85;
        const emberPulse = Math.sin(safeTime * 5.0) * 0.25;
        materials.emberMat.emissiveIntensity = Math.max(0.4, baseIntensity + emberPulse);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Emerald Protective Ward Ring Brightening & Shimmer
    // ─────────────────────────────────────────────────────────────────────────
    if (materials.wardMat) {
        // Brighten up substantially when crewmates are docked
        const targetOpacity = isDocked ? 0.65 : 0.22;
        const ringPulse = Math.sin(safeTime * 3.0) * 0.08;
        materials.wardMat.opacity = Math.max(0.1, targetOpacity + ringPulse);
    }

    if (materials.innerWardMat) {
        const targetInner = isDocked ? 0.45 : 0.14;
        const innerPulse = Math.sin(safeTime * 4.2) * 0.05;
        materials.innerWardMat.opacity = Math.max(0.08, targetInner + innerPulse);
    }

    // Gentle slow counter-rotation of concentric ward rings
    if (components.wardRing && components.wardRing.rotation) {
        components.wardRing.rotation.z = safeTime * 0.12;
    }
    if (components.innerWardRing && components.innerWardRing.rotation) {
        components.innerWardRing.rotation.z = -safeTime * 0.18;
    }
}
