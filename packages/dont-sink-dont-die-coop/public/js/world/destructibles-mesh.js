/**
 * Three.js Renderer & Animated Mesh Builders for Destructible Environment Systems
 * (Destructible Wooden River Barricades, Falling Suspension Bridges, Rockslides, Floating Physics Debris)
 *
 * Designed for "Don't Sink, Don't Die" AAA visuals.
 * Accepts `THREE` injected (or standard THREE globals) with zero external asset dependencies.
 */

// ─── 1. Wooden River Barricade Mesh Builder ──────────────────────────────
/**
 * Creates a rugged wooden river barricade mesh with spiked timber logs,
 * iron binding bands, cross-braces, and danger markings.
 */
export function createBarricadeMesh(THREE, barricadeConfig) {
    const width = barricadeConfig.width || 12.0;
    const height = barricadeConfig.height || 3.2;
    const depth = barricadeConfig.depth || 1.4;

    const group = new THREE.Group();
    group.position.set(barricadeConfig.x || 0, barricadeConfig.y || 0.8, barricadeConfig.z || 0);

    const woodMat = new THREE.MeshStandardMaterial({
        color: 0x4a2e1b,
        roughness: 0.85,
        metalness: 0.1,
    });
    const ironMat = new THREE.MeshStandardMaterial({
        color: 0x2b303a,
        roughness: 0.4,
        metalness: 0.8,
    });
    const spikeMat = new THREE.MeshStandardMaterial({
        color: 0x78350f,
        roughness: 0.7,
        metalness: 0.2,
    });
    const warningRedMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });

    // A. Vertical Timber Logs with Pointed Spikes
    const logCount = 7;
    const logSpacing = width / (logCount - 1);
    const logMeshes = [];

    for (let i = 0; i < logCount; i++) {
        const lx = -width * 0.5 + i * logSpacing;
        const logGroup = new THREE.Group();
        logGroup.position.set(lx, 0, ((i % 2) - 0.5) * 0.2);

        // Submerged trunk
        const logHeight = height * (0.9 + ((i * 13) % 5) * 0.05);
        const logRadius = 0.35 + ((i * 7) % 3) * 0.04;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(logRadius * 0.9, logRadius, logHeight, 8),
            woodMat
        );
        trunk.position.y = logHeight * 0.5;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        logGroup.add(trunk);

        // Sharpened Defensive River Spike Cap
        const spike = new THREE.Mesh(
            new THREE.ConeGeometry(logRadius * 0.95, 0.9, 8),
            spikeMat
        );
        spike.position.y = logHeight + 0.45;
        spike.castShadow = true;
        logGroup.add(spike);

        // Iron reinforced band collar
        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(logRadius * 1.05, logRadius * 1.05, 0.18, 8),
            ironMat
        );
        band.position.y = logHeight * 0.75;
        logGroup.add(band);

        group.add(logGroup);
        logMeshes.push(logGroup);
    }

    // B. Horizontal Heavy Crossbeams (Top & Mid)
    for (const by of [height * 0.4, height * 0.75]) {
        const beam = new THREE.Mesh(
            new THREE.BoxGeometry(width * 1.04, 0.35, 0.35),
            woodMat
        );
        beam.position.set(0, by, 0.25);
        beam.castShadow = true;
        group.add(beam);

        // Rear crossbeam
        const rearBeam = new THREE.Mesh(
            new THREE.BoxGeometry(width * 1.04, 0.35, 0.35),
            woodMat
        );
        rearBeam.position.set(0, by, -0.25);
        rearBeam.castShadow = true;
        group.add(rearBeam);
    }

    // C. Skulls / Warning Red Hazard Cross Strips
    const hazardStripe = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.6, 0.16, 0.4),
        warningRedMat
    );
    hazardStripe.position.set(0, height * 0.85, 0);
    group.add(hazardStripe);

    group.userData = {
        type: 'barricade',
        config: barricadeConfig,
        logMeshes,
        woodMat,
        ironMat,
        shakeTime: 0,
    };
    return group;
}

// ─── 2. Falling Suspension Bridge Mesh Builder ───────────────────────────
/**
 * Creates a suspension bridge spanning the canyon river gorge with
 * twin stone anchor towers, catenary hemp suspension ropes, and timber deck planks.
 */
export function createSuspensionBridgeMesh(THREE, bridgeConfig) {
    const width = bridgeConfig.width || 32.0;
    const height = bridgeConfig.y || 8.5;
    const depth = bridgeConfig.depth || 4.5;

    const group = new THREE.Group();
    group.position.set(bridgeConfig.x || 0, 0, bridgeConfig.z || 0);

    const stoneMat = new THREE.MeshStandardMaterial({
        color: 0x3d414a,
        roughness: 0.9,
        metalness: 0.1,
    });
    const woodMat = new THREE.MeshStandardMaterial({
        color: 0x593d25,
        roughness: 0.85,
        metalness: 0.15,
    });
    const ropeMat = new THREE.MeshStandardMaterial({
        color: 0x926c48,
        roughness: 0.95,
        metalness: 0.05,
    });

    // A. Stone Cliff Anchor Towers (Left & Right Banks)
    const towerWidth = 3.5;
    const towerHeight = height + 4.0;
    for (const sideX of [-width * 0.5 - 1.0, width * 0.5 + 1.0]) {
        const towerGroup = new THREE.Group();
        towerGroup.position.set(sideX, 0, 0);

        // Main stone pillar
        const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(towerWidth, towerHeight, depth * 1.2),
            stoneMat
        );
        pillar.position.y = towerHeight * 0.5;
        pillar.castShadow = true;
        towerGroup.add(pillar);

        // Wooden cross-arch apex
        const archTop = new THREE.Mesh(
            new THREE.BoxGeometry(towerWidth * 1.1, 0.8, depth * 1.3),
            woodMat
        );
        archTop.position.y = towerHeight + 0.4;
        towerGroup.add(archTop);

        group.add(towerGroup);
    }

    // B. Articulated Falling Deck Group
    const deckGroup = new THREE.Group();
    deckGroup.position.set(0, height, 0);

    const plankCount = 14;
    const plankLength = width / plankCount;
    const plankMeshes = [];

    for (let i = 0; i < plankCount; i++) {
        const px = -width * 0.5 + plankLength * (i + 0.5);
        const plank = new THREE.Mesh(
            new THREE.BoxGeometry(plankLength * 0.94, 0.22, depth * 0.88),
            woodMat
        );
        // Slight natural sag toward bridge middle
        const sag = Math.sin((i / (plankCount - 1)) * Math.PI) * 0.45;
        plank.position.set(px, -sag, 0);
        plank.castShadow = true;
        plank.receiveShadow = true;
        deckGroup.add(plank);
        plankMeshes.push(plank);
    }

    // Guard rails
    for (const zSide of [-depth * 0.42, depth * 0.42]) {
        const rail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, width, 8),
            ropeMat
        );
        rail.rotation.z = Math.PI / 2;
        rail.position.set(0, 0.75, zSide);
        deckGroup.add(rail);
    }

    group.add(deckGroup);

    // C. Catenary Hemp Suspension Ropes
    const ropeGroup = new THREE.Group();
    for (const zSide of [-depth * 0.42, depth * 0.42]) {
        const ropeCount = 18;
        for (let r = 0; r < ropeCount; r++) {
            const rx = -width * 0.5 + (width / ropeCount) * r;
            const normX = (rx / (width * 0.5));
            const ropeY = height + 3.0 * (normX * normX) - 0.4;

            const hanger = new THREE.Mesh(
                new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4),
                ropeMat
            );
            hanger.position.set(rx, ropeY - 0.6, zSide);
            ropeGroup.add(hanger);
        }
    }
    group.add(ropeGroup);

    group.userData = {
        type: 'bridge',
        config: bridgeConfig,
        deckGroup,
        ropeGroup,
        plankMeshes,
        baseY: height,
    };
    return group;
}

// ─── 3. Rockslide Canyon Clifftop & Boulder Mesh Builder ──────────────────
/**
 * Creates a rockslide hazard zone with jagged scree slope boulders on the cliff.
 */
export function createRockslideMesh(THREE, rockslideConfig) {
    const group = new THREE.Group();
    group.position.set(0, 0, rockslideConfig.z || 0);

    const rockMat = new THREE.MeshStandardMaterial({
        color: 0x6e5843,
        roughness: 0.95,
        metalness: 0.05,
    });
    const dustMat = new THREE.MeshBasicMaterial({
        color: 0xa89379,
        transparent: true,
        opacity: 0.35,
    });

    const boulderList = Array.isArray(rockslideConfig.boulders)
        ? rockslideConfig.boulders
        : Array.from({ length: rockslideConfig.numBoulders || 8 }, (_, idx) => ({
            x: (rockslideConfig.x || 0) + (idx - 3.5) * 1.1,
            y: 1.2 + (idx % 3) * 0.6,
            z: (rockslideConfig.z || 0) + (idx % 2) * 1.2,
            radius: 1.1,
            rotSpeed: 2.0,
            state: 'idle',
        }));

    const boulderMeshes = [];
    for (let i = 0; i < boulderList.length; i++) {
        const bData = boulderList[i];
        const r = bData.radius || 1.1;

        // Composite faceted boulder
        const boulderGroup = new THREE.Group();
        boulderGroup.position.set(bData.x, bData.y, bData.z - rockslideConfig.z);

        const core = new THREE.Mesh(
            new THREE.DodecahedronGeometry ? new THREE.DodecahedronGeometry(r, 1) : new THREE.SphereGeometry(r, 8, 6),
            rockMat
        );
        core.scale.set(1.0 + ((i * 5) % 3) * 0.15, 0.85, 1.1 + ((i * 3) % 4) * 0.1);
        core.castShadow = true;
        core.receiveShadow = true;
        boulderGroup.add(core);

        // Trailing dust puff aura
        const dust = new THREE.Mesh(
            new THREE.SphereGeometry(r * 1.5, 6, 6),
            dustMat
        );
        dust.visible = false;
        boulderGroup.add(dust);

        group.add(boulderGroup);
        boulderMeshes.push({ group: boulderGroup, dust, bData });
    }

    group.userData = {
        type: 'rockslide',
        config: rockslideConfig,
        boulderMeshes,
    };
    return group;
}

// ─── 4. Floating Physics Debris Mesh System ───────────────────────────────
/**
 * Manages floating 3D debris chunks (splinters, log chunks, stones) in the river.
 */
export function createDebrisMeshSystem(THREE) {
    const group = new THREE.Group();
    group.name = 'floatingPhysicsDebris';

    const woodMat = new THREE.MeshStandardMaterial({
        color: 0x5a3d28,
        roughness: 0.85,
        metalness: 0.1,
    });
    const plankMat = new THREE.MeshStandardMaterial({
        color: 0x6f4e37,
        roughness: 0.8,
        metalness: 0.15,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
        color: 0x4f4943,
        roughness: 0.95,
        metalness: 0.05,
    });

    // Meshes cache keyed by debris id
    const activeMeshes = new Map();

    function updateDebris(debrisList, time = 0) {
        const currentIds = new Set();

        for (let i = 0; i < debrisList.length; i++) {
            const d = debrisList[i];
            currentIds.add(d.id);

            let mesh = activeMeshes.get(d.id);
            if (!mesh) {
                // Build new debris mesh
                let geo;
                let mat;
                if (d.type === 'wood_chunk') {
                    geo = new THREE.BoxGeometry(0.4 * d.scale, 0.4 * d.scale, 1.2 * d.scale);
                    mat = woodMat;
                } else if (d.type === 'bridge_plank') {
                    geo = new THREE.BoxGeometry(1.8 * d.scale, 0.16 * d.scale, 0.6 * d.scale);
                    mat = plankMat;
                } else {
                    geo = new THREE.DodecahedronGeometry ? new THREE.DodecahedronGeometry(0.5 * d.scale, 0) : new THREE.SphereGeometry(0.5 * d.scale, 6, 4);
                    mat = stoneMat;
                }

                mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                group.add(mesh);
                activeMeshes.set(d.id, mesh);
            }

            // Sync transform from simulation
            mesh.position.set(d.x, d.y, d.z);
            mesh.rotation.set(d.rotation.x, d.rotation.y, d.rotation.z);
        }

        // Cleanup expired debris
        for (const [id, mesh] of activeMeshes.entries()) {
            if (!currentIds.has(id)) {
                group.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose?.();
                activeMeshes.delete(id);
            }
        }
    }

    function clear() {
        for (const [, mesh] of activeMeshes.entries()) {
            group.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose?.();
        }
        activeMeshes.clear();
    }

    function spawnExplosionDebris(pos = { x: 0, y: 1, z: 0 }, count = 12) {
        const synthetic = Array.from({ length: count }, (_, idx) => ({
            id: `debris_${idx}_${Date.now()}`,
            type: idx % 2 === 0 ? 'wood_chunk' : 'bridge_plank',
            scale: 1.0,
            x: (pos.x || 0) + (idx - count * 0.5) * 0.3,
            y: (pos.y || 0.5) + (idx % 3) * 0.2,
            z: (pos.z || 0) + (idx % 4) * 0.3,
            rotation: { x: idx * 0.2, y: idx * 0.3, z: idx * 0.1 },
        }));
        updateDebris(synthetic, 0);
    }

    return {
        group,
        rootGroup: group,
        activeMeshes,
        updateDebris,
        spawnExplosionDebris,
        clear,
        dispose: clear,
    };
}

// ─── 5. Unified Destructibles Scene Group & Animation Lifecycle ───────────
/**
 * Assembles all destructibles into a single Three.js group.
 */
export function buildDestructiblesGroup(THREE, layout) {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'destructibleEnvironment';

    const barricadeMeshes = [];
    for (const b of (layout.barricades || [])) {
        const m = createBarricadeMesh(THREE, b);
        rootGroup.add(m);
        barricadeMeshes.push(m);
    }

    const bridgeMeshes = [];
    for (const br of (layout.bridges || layout.suspensionBridges || [])) {
        const m = createSuspensionBridgeMesh(THREE, br);
        rootGroup.add(m);
        bridgeMeshes.push(m);
    }

    const rockslideMeshes = [];
    for (const rs of (layout.rockslides || [])) {
        const m = createRockslideMesh(THREE, rs);
        rootGroup.add(m);
        rockslideMeshes.push(m);
    }

    const debrisSystem = createDebrisMeshSystem(THREE);
    rootGroup.add(debrisSystem.group);

    return {
        rootGroup,
        barricadeMeshes,
        bridgeMeshes,
        rockslideMeshes,
        debrisSystem,
    };
}

/**
 * Animates and syncs visual states of all destructibles:
 * handles barricade breaking, bridge collapse plunge, rolling boulders, and floating debris.
 */
export function animateDestructibles(destructiblesHandle, destructiblesState, time = 0, dt = 0.016) {
    if (!destructiblesHandle || !destructiblesState) return;

    // 1. Barricades: hide when broken, shake when damaged
    for (const bMesh of destructiblesHandle.barricadeMeshes || []) {
        const cfg = bMesh.userData.config;
        if (cfg.state === 'broken') {
            bMesh.visible = false;
        } else if (cfg.state === 'damaged') {
            bMesh.visible = true;
            bMesh.position.x = cfg.x + Math.sin(time * 30.0) * 0.04;
        } else {
            bMesh.visible = true;
            bMesh.position.x = cfg.x;
        }
    }

    // 2. Suspension Bridges: plunge deck down to water, snap cables
    for (const brMesh of destructiblesHandle.bridgeMeshes || []) {
        const cfg = brMesh.userData.config;
        if (cfg.state === 'collapsing' || cfg.state === 'collapsed') {
            brMesh.userData.deckGroup.position.y = cfg.y;
            brMesh.userData.deckGroup.rotation.z = cfg.tiltAngle || 0;
            // Snap suspension ropes
            if (brMesh.userData.ropeGroup) {
                brMesh.userData.ropeGroup.visible = cfg.state !== 'collapsed';
                brMesh.userData.ropeGroup.scale.y = Math.max(0.1, 1.0 - cfg.collapseProgress);
            }
        }
    }

    // 3. Rockslides: roll boulders and activate dust
    for (const rsMesh of destructiblesHandle.rockslideMeshes || []) {
        for (const bItem of rsMesh.userData.boulderMeshes || []) {
            const b = bItem.bData;
            if (b.state === 'shattered') {
                bItem.group.visible = false;
            } else {
                bItem.group.visible = true;
                bItem.group.position.set(b.x, b.y, b.z - rsMesh.userData.config.z);
                if (b.state === 'rolling') {
                    bItem.group.rotation.x += b.rotSpeed * dt;
                    bItem.group.rotation.z += b.rotSpeed * 0.5 * dt;
                    if (bItem.dust) bItem.dust.visible = true;
                } else {
                    if (bItem.dust) bItem.dust.visible = false;
                }
            }
        }
    }

    // 4. Update Floating Physics Debris Chunks
    if (destructiblesHandle.debrisSystem) {
        destructiblesHandle.debrisSystem.updateDebris(destructiblesState.debris || [], time);
    }
}
