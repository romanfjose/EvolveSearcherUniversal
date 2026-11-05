/**
 * Don't Sink, Don't Die — 3D Iron Anchor Drop, Mooring Line & Braking Wake VFX
 * (`public/js/vfx/raft-anchor-vfx.js`)
 *
 * Implements Helmet 04 & Sovereign Core high-impact physical anchor visuals:
 * 1. Physical 3D Iron Anchor:
 *    - Heavy cast iron shank, cross stock, curved arms, and flukes/crown.
 *    - Articulated interlocking iron chain links lowering from the raft stern/bow
 *      into the water column with realistic catenary sag when anchored.
 * 2. Taut Mooring Lines:
 *    - Weathered hemp mooring ropes stretching from raft mooring cleats to dock
 *      bollards when grounded/docked on solid platforms (`onSolid: true`).
 * 3. Hydrodynamic Braking Wake VFX:
 *    - Violent churn foam, lateral spray wedges, and drag ripples generated
 *      when dropping anchor or braking with forward momentum.
 *
 * Zero external runtime dependencies. 100% procedural Three.js BufferGeometry.
 */

// ─── CONFIGURATION CONSTANTS ────────────────────────────────────────────────
export const ANCHOR_VFX_CONFIG = {
    // Chain kinematics
    CHAIN_LINK_COUNT: 9,
    CHAIN_LINK_LENGTH: 0.28,
    CHAIN_LINK_RADIUS: 0.045,
    CHAIN_LINK_TUBE: 0.016,

    // Anchor physical dimensions
    SHANK_LENGTH: 0.95,
    SHANK_RADIUS: 0.05,
    STOCK_WIDTH: 0.75,
    STOCK_RADIUS: 0.04,
    ARM_SPAN: 0.7,
    FLUKE_SIZE: 0.18,

    // Cable & Rope offsets (relative to raft center)
    HAWSEPIPE_OFFSET: { x: 0, y: 0.18, z: 1.45 }, // Stern/bow mount point
    STOWED_ANCHOR_POS: { x: 0, y: 0.25, z: 1.55 },
    DEPLOYED_ANCHOR_DEPTH: -1.75, // Deep in water column
    DEPLOY_SPEED: 4.5,            // m/s lowering/raising speed

    // Mooring Ropes (port and starboard dock ties)
    MOORING_CLEAT_PORT: { x: -0.95, y: 0.35, z: 0.7 },
    MOORING_CLEAT_STARBOARD: { x: 0.95, y: 0.35, z: 0.7 },
    MOORING_BOLLARD_PORT: { x: -2.3, y: 0.55, z: 1.5 },
    MOORING_BOLLARD_STARBOARD: { x: 2.3, y: 0.55, z: 1.5 },

    // Braking Wake Churn
    BRAKE_FOAM_PARTICLES: 16,
    WATER_SURFACE_Y: 0.25,
};

/**
 * Creates the 3D Iron Anchor Drop, Mooring Line & Braking Wake VFX hierarchy.
 *
 * @param {object} THREE - The Three.js library instance
 * @param {object} [options] - Optional parameter overrides
 * @returns {object} Three.js Group with embedded controller metadata & update handles
 */
export function createRaftAnchorVfx(THREE, options = {}) {
    const root = new THREE.Group();
    root.name = 'RaftAnchorVfx_Root';

    // ─────────────────────────────────────────────────────────────────────────
    // 1. PROCEDURAL SHARED MATERIALS
    // ─────────────────────────────────────────────────────────────────────────
    const ironMaterial = new (THREE.MeshStandardMaterial || THREE.MeshBasicMaterial)({
        color: 0x22262b, // Dark forged iron
        roughness: 0.65,
        metalness: 0.85,
    });

    const chainMaterial = new (THREE.MeshStandardMaterial || THREE.MeshBasicMaterial)({
        color: 0x363b42, // Weathered galvanized steel / iron chain
        roughness: 0.55,
        metalness: 0.8,
    });

    const ropeMaterial = new (THREE.MeshStandardMaterial || THREE.MeshBasicMaterial)({
        color: 0x8b6a47, // Rough fibrous hemp mooring rope
        roughness: 0.9,
        metalness: 0.05,
    });

    const foamMaterial = new (THREE.MeshBasicMaterial || THREE.Material)({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. 3D IRON ANCHOR HEAD ASSEMBLY
    // ─────────────────────────────────────────────────────────────────────────
    const anchorGroup = new THREE.Group();
    anchorGroup.name = 'IronAnchor_Head';

    // (a) Vertical Shank
    const shankGeo = new (THREE.CylinderGeometry || THREE.BoxGeometry)(
        ANCHOR_VFX_CONFIG.SHANK_RADIUS,
        ANCHOR_VFX_CONFIG.SHANK_RADIUS,
        ANCHOR_VFX_CONFIG.SHANK_LENGTH,
        8
    );
    const shankMesh = new THREE.Mesh(shankGeo, ironMaterial);
    shankMesh.position.y = ANCHOR_VFX_CONFIG.SHANK_LENGTH * 0.5;
    shankMesh.castShadow = true;
    anchorGroup.add(shankMesh);

    // (b) Horizontal Cross Stock (wooden/iron crossbar near top ring)
    const stockGeo = new (THREE.CylinderGeometry || THREE.BoxGeometry)(
        ANCHOR_VFX_CONFIG.STOCK_RADIUS,
        ANCHOR_VFX_CONFIG.STOCK_RADIUS,
        ANCHOR_VFX_CONFIG.STOCK_WIDTH,
        8
    );
    if (stockGeo.rotateZ) stockGeo.rotateZ(Math.PI / 2);
    const stockMesh = new THREE.Mesh(stockGeo, ironMaterial);
    stockMesh.position.y = ANCHOR_VFX_CONFIG.SHANK_LENGTH * 0.85;
    anchorGroup.add(stockMesh);

    // (c) Top Shackle / Ring
    const ringGeo = new (THREE.TorusGeometry || THREE.RingGeometry || THREE.CylinderGeometry)(
        0.1,
        0.025,
        8,
        16
    );
    const ringMesh = new THREE.Mesh(ringGeo, ironMaterial);
    ringMesh.position.y = ANCHOR_VFX_CONFIG.SHANK_LENGTH + 0.08;
    anchorGroup.add(ringMesh);

    // (d) Crown & Curved Arms
    const crownGeo = new (THREE.SphereGeometry || THREE.BoxGeometry)(0.12, 8, 8);
    const crownMesh = new THREE.Mesh(crownGeo, ironMaterial);
    crownMesh.position.y = 0;
    anchorGroup.add(crownMesh);

    // Curved arms spanning outwards
    const armGeo = new (THREE.TorusGeometry || THREE.CylinderGeometry)(
        ANCHOR_VFX_CONFIG.ARM_SPAN * 0.5,
        ANCHOR_VFX_CONFIG.SHANK_RADIUS * 0.9,
        8,
        12,
        Math.PI
    );
    if (armGeo.rotateZ) armGeo.rotateZ(Math.PI); // U-shape opening upwards
    const armMesh = new THREE.Mesh(armGeo, ironMaterial);
    armMesh.position.y = ANCHOR_VFX_CONFIG.ARM_SPAN * 0.45;
    anchorGroup.add(armMesh);

    // Triangular Flukes (pointed arrowheads on arm tips)
    const flukeGeo = new (THREE.ConeGeometry || THREE.BoxGeometry)(
        ANCHOR_VFX_CONFIG.FLUKE_SIZE * 0.6,
        ANCHOR_VFX_CONFIG.FLUKE_SIZE,
        4
    );
    const flukeLeft = new THREE.Mesh(flukeGeo, ironMaterial);
    flukeLeft.position.set(-ANCHOR_VFX_CONFIG.ARM_SPAN * 0.5, ANCHOR_VFX_CONFIG.ARM_SPAN * 0.45, 0);
    flukeLeft.rotation.z = Math.PI * 0.25;
    anchorGroup.add(flukeLeft);

    const flukeRight = new THREE.Mesh(flukeGeo, ironMaterial);
    flukeRight.position.set(ANCHOR_VFX_CONFIG.ARM_SPAN * 0.5, ANCHOR_VFX_CONFIG.ARM_SPAN * 0.45, 0);
    flukeRight.rotation.z = -Math.PI * 0.25;
    anchorGroup.add(flukeRight);

    // Initially position anchor in stowed location
    anchorGroup.position.set(
        ANCHOR_VFX_CONFIG.STOWED_ANCHOR_POS.x,
        ANCHOR_VFX_CONFIG.STOWED_ANCHOR_POS.y,
        ANCHOR_VFX_CONFIG.STOWED_ANCHOR_POS.z
    );
    anchorGroup.rotation.x = Math.PI * 0.35; // Tilted back against stern
    root.add(anchorGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. ARTICULATED CHAIN LINKS HIERARCHY
    // ─────────────────────────────────────────────────────────────────────────
    const chainGroup = new THREE.Group();
    chainGroup.name = 'IronAnchor_Chain';
    root.add(chainGroup);

    const chainLinks = [];
    const linkGeo = new (THREE.TorusGeometry || THREE.CylinderGeometry)(
        ANCHOR_VFX_CONFIG.CHAIN_LINK_RADIUS,
        ANCHOR_VFX_CONFIG.CHAIN_LINK_TUBE,
        6,
        12
    );

    for (let i = 0; i < ANCHOR_VFX_CONFIG.CHAIN_LINK_COUNT; i++) {
        const linkMesh = new THREE.Mesh(linkGeo, chainMaterial);
        linkMesh.castShadow = true;
        // Alternating 90 degree link rotations for realistic intertwined chain look
        if (i % 2 === 1) {
            linkMesh.rotation.y = Math.PI / 2;
        }
        linkMesh.visible = false; // Hidden when stowed
        chainGroup.add(linkMesh);
        chainLinks.push(linkMesh);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. TAUT MOORING ROPES (PORT & STARBOARD)
    // ─────────────────────────────────────────────────────────────────────────
    const mooringGroup = new THREE.Group();
    mooringGroup.name = 'RaftAnchor_MooringRopes';
    root.add(mooringGroup);

    function createMooringRopeMesh(name) {
        // A slender elongated cylinder positioned along the vector between cleat and bollard
        const ropeGeo = new (THREE.CylinderGeometry || THREE.BoxGeometry)(0.035, 0.035, 1.0, 6);
        const ropeMesh = new THREE.Mesh(ropeGeo, ropeMaterial);
        ropeMesh.name = name;
        ropeMesh.visible = false;
        mooringGroup.add(ropeMesh);
        return { mesh: ropeMesh, geo: ropeGeo };
    }

    const portRope = createMooringRopeMesh('MooringRope_Port');
    const starboardRope = createMooringRopeMesh('MooringRope_Starboard');

    // ─────────────────────────────────────────────────────────────────────────
    // 5. HYDRODYNAMIC BRAKING FOAM & CHURN PARTICLES
    // ─────────────────────────────────────────────────────────────────────────
    const brakingWakeGroup = new THREE.Group();
    brakingWakeGroup.name = 'RaftAnchor_BrakingWake';
    root.add(brakingWakeGroup);

    const foamMeshes = [];
    const foamGeo = new (THREE.SphereGeometry || THREE.BoxGeometry)(0.25, 6, 6);
    for (let i = 0; i < ANCHOR_VFX_CONFIG.BRAKE_FOAM_PARTICLES; i++) {
        const fMat = foamMaterial.clone ? foamMaterial.clone() : foamMaterial;
        const fMesh = new THREE.Mesh(foamGeo, fMat);
        fMesh.visible = false;
        brakingWakeGroup.add(fMesh);
        foamMeshes.push({
            mesh: fMesh,
            mat: fMat,
            active: false,
            age: 0,
            lifespan: 0.6,
            velocity: { x: 0, y: 0, z: 0 },
            baseScale: 1.0,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTROLLER STATE & DISPOSAL
    // ─────────────────────────────────────────────────────────────────────────
    const state = {
        dropProgress: 0.0, // 0.0 = Stowed, 1.0 = Fully dropped in water
        isAnchored: false,
        isOnSolid: false,
        lastTime: 0,
        materials: [ironMaterial, chainMaterial, ropeMaterial, foamMaterial],
        geometries: [shankGeo, stockGeo, ringGeo, crownGeo, armGeo, flukeGeo, linkGeo, portRope.geo, starboardRope.geo, foamGeo],
    };

    root.userData = {
        state,
        anchorGroup,
        chainLinks,
        portRope,
        starboardRope,
        foamMeshes,
        brakingWakeGroup,
    };

    /**
     * Cleanly disposes all geometries, materials, and children.
     */
    root.dispose = function dispose() {
        for (const geo of state.geometries) {
            geo?.dispose?.();
        }
        for (const mat of state.materials) {
            mat?.dispose?.();
        }
        for (const foam of foamMeshes) {
            foam.mat?.dispose?.();
        }
        while (root.children.length > 0) {
            const child = root.children[0];
            root.remove(child);
        }
    };

    return root;
}

/**
 * Updates the 3D Raft Anchor Drop, Mooring Ropes & Braking Wake visuals per frame.
 *
 * @param {object} group - The Three.js Group returned from createRaftAnchorVfx
 * @param {object} params - Input parameters:
 *    @param {boolean} [params.anchored=false] - True when raft has dropped anchor / is braking
 *    @param {boolean} [params.onSolid=false] - True when raft is docked or on solid platform
 *    @param {object|number} [params.velocity=0] - Raft velocity { x, y, z } or scalar speed
 *    @param {number} [params.time=0] - Game elapsed time in seconds
 */
export function updateRaftAnchorVfx(group, { anchored = false, onSolid = false, velocity = 0, time = 0 } = {}) {
    if (!group || !group.userData || !group.userData.state) return;

    const { state, anchorGroup, chainLinks, portRope, starboardRope, foamMeshes } = group.userData;

    // Delta time computation
    let dt = 1 / 60;
    if (typeof time === 'number' && Number.isFinite(time) && state.lastTime > 0) {
        dt = Math.max(0.001, Math.min(0.1, time - state.lastTime));
    }
    state.lastTime = typeof time === 'number' && Number.isFinite(time) ? time : (state.lastTime + dt);

    state.isAnchored = Boolean(anchored);
    state.isOnSolid = Boolean(onSolid);

    // Compute raft speed and heading
    let speed = 0;
    let vz = 0;
    let vx = 0;
    if (typeof velocity === 'number') {
        speed = Math.abs(velocity);
        vz = -speed;
    } else if (velocity && typeof velocity === 'object') {
        vx = velocity.x ?? 0;
        vz = velocity.z ?? 0;
        speed = Math.hypot(vx, vz);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. ANCHOR DROPPING & RAISING KINEMATICS
    // ─────────────────────────────────────────────────────────────────────────
    const targetDrop = state.isAnchored ? 1.0 : 0.0;
    if (state.dropProgress < targetDrop) {
        state.dropProgress = Math.min(targetDrop, state.dropProgress + dt * ANCHOR_VFX_CONFIG.DEPLOY_SPEED);
    } else if (state.dropProgress > targetDrop) {
        state.dropProgress = Math.max(targetDrop, state.dropProgress - dt * ANCHOR_VFX_CONFIG.DEPLOY_SPEED);
    }

    const t = state.dropProgress;
    const stowed = ANCHOR_VFX_CONFIG.STOWED_ANCHOR_POS;
    const hawse = ANCHOR_VFX_CONFIG.HAWSEPIPE_OFFSET;

    // Cable drag sway and water drag turbulence
    const swayAngle = state.isAnchored
        ? Math.sin(time * 6.0) * 0.08 * (1.0 + Math.min(2.0, speed * 0.2))
        : 0;

    // Deployed position: lowers down into water and trails slightly backwards under raft drag
    const dragZ = state.isAnchored ? (speed * 0.08) : 0;
    const currentAnchorY = stowed.y + (ANCHOR_VFX_CONFIG.DEPLOYED_ANCHOR_DEPTH - stowed.y) * t;
    const currentAnchorZ = stowed.z + (hawse.z + 0.4 + dragZ - stowed.z) * t;
    const currentAnchorX = stowed.x + Math.sin(time * 3.0) * 0.05 * t;

    anchorGroup.position.set(currentAnchorX, currentAnchorY, currentAnchorZ);

    // Rotation: stowed against bulkhead -> upright hanging & dragging in river
    const stowedRotX = Math.PI * 0.35;
    const deployedRotX = (Math.PI * 0.05) + Math.min(0.4, speed * 0.03);
    anchorGroup.rotation.x = stowedRotX + (deployedRotX - stowedRotX) * t;
    anchorGroup.rotation.z = swayAngle;

    // Anchor is visible whenever not fully hidden
    anchorGroup.visible = true;

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CHAIN LINK SEGMENTS CATENARY INTERPOLATION
    // ─────────────────────────────────────────────────────────────────────────
    const linkCount = chainLinks.length;
    const showChain = t > 0.02;

    for (let i = 0; i < linkCount; i++) {
        const link = chainLinks[i];
        if (!showChain) {
            link.visible = false;
            continue;
        }

        // Fraction along chain from hawsepipe (0) to anchor shackle (1)
        const linkFrac = (i + 1) / (linkCount + 1);

        // Chain only extends up to current drop progress
        if (linkFrac > t * 1.05) {
            link.visible = false;
            continue;
        }

        link.visible = true;

        // Catenary sag curve between hawsepipe and anchor
        const lx = hawse.x + (currentAnchorX - hawse.x) * linkFrac;
        const lz = hawse.z + (currentAnchorZ - hawse.z) * linkFrac;
        // Sag parabolic droop in midsection
        const sag = Math.sin(linkFrac * Math.PI) * 0.22 * (1.0 - Math.min(0.8, speed * 0.1));
        const ly = hawse.y + (currentAnchorY + ANCHOR_VFX_CONFIG.SHANK_LENGTH - hawse.y) * linkFrac - sag;

        link.position.set(lx, ly, lz);

        // Orient link along direction to next point
        link.rotation.x = (currentAnchorY < hawse.y ? -0.8 : 0.8) + (i % 2 === 1 ? 0 : 1.57);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TAUT MOORING ROPES (DOCKING / ON SOLID)
    // ─────────────────────────────────────────────────────────────────────────
    function updateMooringRope(ropeObj, cleatPos, bollardPos, active) {
        if (!ropeObj || !ropeObj.mesh) return;
        const mesh = ropeObj.mesh;

        if (!active) {
            mesh.visible = false;
            return;
        }

        mesh.visible = true;

        // Position mesh at midpoint between cleat and bollard
        const midX = (cleatPos.x + bollardPos.x) * 0.5;
        const midY = (cleatPos.y + bollardPos.y) * 0.5;
        const midZ = (cleatPos.z + bollardPos.z) * 0.5;
        mesh.position.set(midX, midY, midZ);

        // Vector between endpoints
        const dx = bollardPos.x - cleatPos.x;
        const dy = bollardPos.y - cleatPos.y;
        const dz = bollardPos.z - cleatPos.z;
        const length = Math.hypot(dx, dy, dz);

        // Scale length along cylinder height (Y axis)
        mesh.scale.set(1.0, length, 1.0);

        // Orient cylinder towards bollard
        mesh.rotation.z = Math.atan2(dx, dy);
        mesh.rotation.x = -Math.atan2(dz, Math.hypot(dx, dy));
    }

    const isMoored = state.isOnSolid;
    // Micro tension twitch in mooring lines when moored
    const ropeTensionJitter = isMoored ? Math.sin(time * 12.0) * 0.015 : 0;
    const portBollard = {
        x: ANCHOR_VFX_CONFIG.MOORING_BOLLARD_PORT.x + ropeTensionJitter,
        y: ANCHOR_VFX_CONFIG.MOORING_BOLLARD_PORT.y,
        z: ANCHOR_VFX_CONFIG.MOORING_BOLLARD_PORT.z,
    };
    const starboardBollard = {
        x: ANCHOR_VFX_CONFIG.MOORING_BOLLARD_STARBOARD.x - ropeTensionJitter,
        y: ANCHOR_VFX_CONFIG.MOORING_BOLLARD_STARBOARD.y,
        z: ANCHOR_VFX_CONFIG.MOORING_BOLLARD_STARBOARD.z,
    };

    updateMooringRope(portRope, ANCHOR_VFX_CONFIG.MOORING_CLEAT_PORT, portBollard, isMoored);
    updateMooringRope(starboardRope, ANCHOR_VFX_CONFIG.MOORING_CLEAT_STARBOARD, starboardBollard, isMoored);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. HYDRODYNAMIC BRAKING FOAM & CHURN
    // ─────────────────────────────────────────────────────────────────────────
    // Braking churn emits when anchor is deployed or dragging with speed > 0.5
    const isBrakingInWater = state.isAnchored && t > 0.25 && speed > 0.4;
    const churnIntensity = isBrakingInWater ? Math.min(2.5, speed * 0.35 + t * 0.5) : 0;

    // Spawn foam particles
    if (isBrakingInWater && Math.random() < 0.6) {
        for (const p of foamMeshes) {
            if (!p.active) {
                p.active = true;
                p.age = 0;
                p.lifespan = 0.4 + Math.random() * 0.35;
                p.baseScale = 0.5 + churnIntensity * 0.6;
                // Emit at anchor entry point on water surface
                p.mesh.position.set(
                    currentAnchorX + (Math.random() - 0.5) * 0.6,
                    ANCHOR_VFX_CONFIG.WATER_SURFACE_Y + (Math.random() - 0.5) * 0.08,
                    currentAnchorZ + (Math.random() - 0.5) * 0.6
                );
                // Backward splash velocity
                p.velocity.x = (Math.random() - 0.5) * 1.5;
                p.velocity.y = 0.4 + Math.random() * 0.8;
                p.velocity.z = 1.0 + Math.random() * 2.5;
                p.mesh.visible = true;
                break;
            }
        }
    }

    // Step existing foam particles
    for (const p of foamMeshes) {
        if (!p.active) continue;

        p.age += dt;
        if (p.age >= p.lifespan) {
            p.active = false;
            p.mesh.visible = false;
            continue;
        }

        const progress = p.age / p.lifespan;
        // Float and expand
        p.mesh.position.x += p.velocity.x * dt;
        p.mesh.position.y += p.velocity.y * dt;
        p.mesh.position.z += p.velocity.z * dt;
        p.velocity.y -= 3.0 * dt; // Gravity pull

        // Expand and fade
        const scale = p.baseScale * (1.0 + progress * 1.8);
        p.mesh.scale.set(scale, scale * 0.6, scale);

        if (p.mat) {
            p.mat.opacity = (1.0 - progress) * 0.85;
        }
    }
}
