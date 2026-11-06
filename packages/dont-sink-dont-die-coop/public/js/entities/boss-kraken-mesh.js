/**
 * Don't Sink, Don't Die — 3D Articulated Kraken Boss Builder
 * Builds a detailed Three.js multi-jointed Kraken head (mantle, glowing abyssal eyes, beak,
 * glowing barnacle weak-points) and 4 procedural 8-joint tentacles with suction cups and
 * telegraph warning rings.
 *
 * Zero external asset dependencies (100% procedural WebGL Three.js geometries & materials).
 * Accepts THREE instance via dependency injection for seamless headless node testing.
 */

export function resolveTHREE(THREE_INSTANCE) {
    if (THREE_INSTANCE) return THREE_INSTANCE;
    if (typeof window !== 'undefined' && window.THREE) return window.THREE;
    if (typeof globalThis !== 'undefined' && globalThis.THREE) return globalThis.THREE;
    return null;
}

/**
 * Creates the complete 3D Kraken boss mesh hierarchy
 */
export function createKrakenMesh(THREE_INSTANCE) {
    const THREE = resolveTHREE(THREE_INSTANCE);
    if (!THREE) {
        throw new Error('Three.js instance is required to build Kraken mesh.');
    }

    const krakenGroup = new THREE.Group();
    krakenGroup.name = 'BossKraken_TheDreadKraken';

    // ─── Materials ──────────────────────────────────────────────────────────
    const skinMat = new THREE.MeshStandardMaterial({
        color: 0x1f1432, // deep abyssal indigo/obsidian
        roughness: 0.35,
        metalness: 0.25,
        bumpScale: 0.08,
    });
    const underbellyMat = new THREE.MeshStandardMaterial({
        color: 0x692055, // fleshy deep magenta
        roughness: 0.5,
        metalness: 0.15,
    });
    const eyeMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc, // glowing bioluminescent cyan
    });
    const pupilMat = new THREE.MeshBasicMaterial({
        color: 0x050d12,
    });
    const beakMat = new THREE.MeshStandardMaterial({
        color: 0x111115,
        roughness: 0.2,
        metalness: 0.8,
    });
    const barnacleBaseMat = new THREE.MeshStandardMaterial({
        color: 0x3d352e, // calcified craggy barnacle rock
        roughness: 0.9,
    });
    const barnacleGlowMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00, // glowing amber/gold weak point
    });
    const suctionMat = new THREE.MeshStandardMaterial({
        color: 0xdf5a8a, // pale fleshy pink suction cups
        roughness: 0.6,
    });
    const telegraphMat = new THREE.MeshBasicMaterial({
        color: 0xff2222,
        wireframe: true,
        transparent: true,
        opacity: 0.75,
    });

    // ─── 1. Articulated Kraken Head & Mantle ────────────────────────────────
    const headGroup = new THREE.Group();
    headGroup.name = 'KrakenHead';

    // Massive bulbous elongated cephalopod mantle
    const mantleGeo = new THREE.SphereGeometry(4.2, 16, 16);
    const mantleMesh = new THREE.Mesh(mantleGeo, skinMat);
    mantleMesh.name = 'Mantle';
    mantleMesh.scale.set(1.15, 1.85, 1.25);
    mantleMesh.position.set(0, 5.0, -1.5);
    mantleMesh.rotation.x = -0.22; // angled back slightly
    headGroup.add(mantleMesh);

    // Lateral Mantle Fins / Hood ridges
    for (const side of [-1, 1]) {
        const finGeo = new THREE.ConeGeometry(1.6, 5.0, 6);
        const fin = new THREE.Mesh(finGeo, underbellyMat);
        fin.scale.set(0.3, 1.0, 0.8);
        fin.position.set(side * 4.6, 5.5, -2.0);
        fin.rotation.z = side * -0.55;
        fin.rotation.x = -0.25;
        headGroup.add(fin);
    }

    // Glowing Abyssal Eyes
    const eyes = [];
    for (const side of [-1, 1]) {
        const eyeSocket = new THREE.Group();
        eyeSocket.name = `EyeSocket_${side > 0 ? 'R' : 'L'}`;
        eyeSocket.position.set(side * 2.8, 2.8, 2.2);

        // Eyeball sphere
        const eyeballGeo = new THREE.SphereGeometry(0.85, 12, 12);
        const eyeballMesh = new THREE.Mesh(eyeballGeo, eyeMat);
        eyeballMesh.name = 'Eyeball';
        eyeSocket.add(eyeballMesh);

        // Slit-pupil
        const pupilGeo = new THREE.BoxGeometry(0.18, 1.1, 0.35);
        const pupilMesh = new THREE.Mesh(pupilGeo, pupilMat);
        pupilMesh.position.z = 0.72;
        eyeSocket.add(pupilMesh);

        headGroup.add(eyeSocket);
        eyes.push({ socket: eyeSocket, mesh: eyeballMesh });
    }

    // Horrific Cephalopod Beak (Upper and Lower mandibles)
    const beakGroup = new THREE.Group();
    beakGroup.name = 'KrakenBeak';
    beakGroup.position.set(0, 0.5, 3.2);

    const upperJawGeo = new THREE.ConeGeometry(0.9, 2.2, 5);
    const upperJaw = new THREE.Mesh(upperJawGeo, beakMat);
    upperJaw.rotation.x = Math.PI * 0.45;
    upperJaw.position.set(0, 0.4, 0);
    beakGroup.add(upperJaw);

    const lowerJawGeo = new THREE.ConeGeometry(0.75, 1.9, 5);
    const lowerJaw = new THREE.Mesh(lowerJawGeo, beakMat);
    lowerJaw.rotation.x = Math.PI * 0.75;
    lowerJaw.position.set(0, -0.4, 0);
    beakGroup.add(lowerJaw);

    headGroup.add(beakGroup);

    // ─── 2. Glowing Barnacle Weak-Points (Phase 2 Targets) ─────────────────
    const barnacleMeshes = [];
    const barnacleOffsets = [
        { name: 'Mantle Crest', x: 0, y: 7.2, z: 0.5 },
        { name: 'Left Temporal', x: -3.4, y: 3.5, z: 0.5 },
        { name: 'Right Temporal', x: 3.4, y: 3.5, z: 0.5 },
        { name: 'Beak Underbelly', x: 0, y: -0.8, z: 3.8 },
    ];

    for (let i = 0; i < barnacleOffsets.length; i++) {
        const off = barnacleOffsets[i];
        const bGroup = new THREE.Group();
        bGroup.name = `BarnacleWeakpoint_${i}`;
        bGroup.position.set(off.x, off.y, off.z);

        // Craggy rocky ring
        const rockGeo = new THREE.CylinderGeometry(0.9, 1.3, 0.65, 7);
        const rockMesh = new THREE.Mesh(rockGeo, barnacleBaseMat);
        rockMesh.rotation.x = Math.PI * 0.3;
        bGroup.add(rockMesh);

        // Glowing core
        const coreGeo = new THREE.SphereGeometry(0.65, 8, 8);
        const coreMesh = new THREE.Mesh(coreGeo, barnacleGlowMat);
        coreMesh.name = 'Core';
        coreMesh.position.set(0, 0.2, 0.2);
        bGroup.add(coreMesh);

        bGroup.visible = false; // initially inactive until Phase 2
        headGroup.add(bGroup);
        barnacleMeshes.push({
            id: `barnacle_${i}`,
            group: bGroup,
            core: coreMesh,
            glowMat: barnacleGlowMat,
        });
    }

    krakenGroup.add(headGroup);

    // ─── 3. 4 Articulated 8-Joint Procedural Tentacles ───────────────────────
    const tentacles = [];
    const tentacleCount = 4;
    const jointCount = 8;

    for (let t = 0; t < tentacleCount; t++) {
        const angle = (t / tentacleCount) * Math.PI * 2 + Math.PI / 4;
        const rootOffsetRadius = 6.5;

        const tentacleRoot = new THREE.Group();
        tentacleRoot.name = `TentacleRoot_${t}`;
        tentacleRoot.position.set(
            Math.cos(angle) * rootOffsetRadius,
            -1.0,
            Math.sin(angle) * rootOffsetRadius
        );
        tentacleRoot.rotation.y = angle;

        let currentParent = tentacleRoot;
        const joints = [];

        for (let j = 0; j < jointCount; j++) {
            const jointGroup = new THREE.Group();
            jointGroup.name = `Tentacle_${t}_Joint_${j}`;

            // Segment length & tapering radius
            const segFraction = j / jointCount;
            const segLength = 2.4 * (1.0 - segFraction * 0.35);
            const baseR = 1.35 * (1.0 - segFraction * 0.75);
            const topR = 1.15 * (1.0 - (segFraction + 1 / jointCount) * 0.75);

            // Arm segment cylinder
            const segGeo = new THREE.CylinderGeometry(Math.max(0.18, topR), Math.max(0.28, baseR), segLength, 8);
            const segMesh = new THREE.Mesh(segGeo, skinMat);
            segMesh.position.y = segLength * 0.5;
            jointGroup.add(segMesh);

            // Suction Cups along the inner belly side of each joint
            const suctionCount = 3;
            for (let s = 0; s < suctionCount; s++) {
                const sY = (s + 0.5) * (segLength / suctionCount);
                const sGeo = new THREE.TorusGeometry(Math.max(0.08, baseR * 0.32), 0.05, 6, 8);
                const sMesh = new THREE.Mesh(sGeo, suctionMat);
                sMesh.rotation.y = Math.PI / 2;
                sMesh.position.set(0, sY, baseR * 0.9);
                jointGroup.add(sMesh);
            }

            if (j > 0) {
                // Attach at the top of the previous joint
                const prevLength = 2.4 * (1.0 - ((j - 1) / jointCount) * 0.35);
                jointGroup.position.y = prevLength;
            }

            currentParent.add(jointGroup);
            joints.push({
                index: j,
                group: jointGroup,
                mesh: segMesh,
                length: segLength,
            });
            currentParent = jointGroup;
        }

        krakenGroup.add(tentacleRoot);
        tentacles.push({
            index: t,
            root: tentacleRoot,
            joints,
            tipJoint: joints[joints.length - 1],
        });
    }

    // ─── 4. Warning Telegraph Rings Pool ────────────────────────────────────
    const telegraphPool = [];
    const maxTelegraphs = 6;
    for (let i = 0; i < maxTelegraphs; i++) {
        const ringGeo = new THREE.RingGeometry(0.4, 5.5, 32);
        const ringMesh = new THREE.Mesh(ringGeo, telegraphMat);
        ringMesh.name = `TelegraphRing_${i}`;
        ringMesh.rotation.x = -Math.PI / 2; // Flat on the water surface
        ringMesh.position.y = 0.12; // Just above water
        ringMesh.visible = false;
        krakenGroup.add(ringMesh);
        telegraphPool.push({ mesh: ringMesh, inUse: false, id: null });
    }

    // Store references in userData for programmatic updates
    krakenGroup.userData = {
        headGroup,
        mantleMesh,
        eyes,
        beakGroup,
        upperJaw,
        lowerJaw,
        barnacleMeshes,
        tentacles,
        telegraphPool,
        materials: {
            skinMat,
            underbellyMat,
            eyeMat,
            pupilMat,
            beakMat,
            barnacleBaseMat,
            barnacleGlowMat,
            suctionMat,
            telegraphMat,
        },
    };

    return krakenGroup;
}

/**
 * Updates the 3D Kraken visual state based on simulation state and elapsed time
 */
export function updateKrakenMesh(krakenMesh, krakenState, dt = 0.016, totalTime = 0) {
    if (!krakenMesh || !krakenMesh.userData || !krakenState) return;
    const { headGroup, eyes, beakGroup, upperJaw, lowerJaw, barnacleMeshes, tentacles, telegraphPool } = krakenMesh.userData;

    const time = totalTime || krakenState.time;

    // 1. Overall Root Position & Menacing Head Tracking toward Lead Raft
    krakenMesh.position.x = krakenState.position.x;
    krakenMesh.position.y = krakenState.position.y + (krakenState.headBobOffset || 0);
    krakenMesh.position.z = krakenState.position.z;
    if (headGroup && krakenState.targetPosition) {
        const dx = krakenState.targetPosition.x - krakenState.position.x;
        const dz = krakenState.targetPosition.z - krakenState.position.z;
        if (Math.hypot(dx, dz) > 0.5) {
            const targetYaw = Math.atan2(dx, dz);
            const safeDt = Math.max(0.001, Math.min(0.1, dt || 0.016));
            headGroup.rotation.y += (targetYaw - headGroup.rotation.y) * Math.min(1.0, safeDt * 4.5);
        }
    }

    // 2. Eye Bioluminescence Pulse
    const eyeIntensity = (krakenState.isStunned ? 0.2 : krakenState.eyeGlow || 1.0);
    for (const e of eyes) {
        if (e.mesh.material && e.mesh.material.color) {
            if (krakenState.isStunned) {
                e.mesh.material.color.setHex(0x334455);
            } else if (krakenState.phase === 3) {
                e.mesh.material.color.setHex(0xff0044); // Angry Crimson in Phase 3
            } else {
                e.mesh.material.color.setHex(0x00ffcc); // Normal Abyssal Cyan
            }
        }
    }

    // 3. Beak Snapping animation
    if (beakGroup && upperJaw && lowerJaw) {
        const snap = Math.sin(time * 6.0) * (krakenState.phase === 3 ? 0.35 : 0.15);
        upperJaw.rotation.x = Math.PI * 0.45 + snap;
        lowerJaw.rotation.x = Math.PI * 0.75 - snap;
    }

    // 4. Barnacle Weak-point Visibility & Glow
    for (let i = 0; i < barnacleMeshes.length; i++) {
        const bMesh = barnacleMeshes[i];
        const bState = krakenState.barnacles ? krakenState.barnacles[i] : null;

        if (bState && bState.active && !bState.destroyed) {
            bMesh.group.visible = true;
            // Pulsing weakpoint glow
            const pulse = 0.7 + Math.sin(time * 8.0 + i) * 0.3;
            bMesh.group.scale.set(1.0 + pulse * 0.1, 1.0 + pulse * 0.1, 1.0 + pulse * 0.1);
        } else {
            bMesh.group.visible = false;
        }
    }

    // 5. Articulated Tentacle Joint Kinematics
    for (let t = 0; t < tentacles.length; t++) {
        const tentacleRig = tentacles[t];
        const tentacleSim = krakenState.tentacles ? krakenState.tentacles[t] : null;
        if (!tentacleSim) continue;

        const joints = tentacleRig.joints;
        const angles = tentacleSim.jointAngles || [];

        for (let j = 0; j < joints.length; j++) {
            const joint = joints[j];
            const simAngle = angles[j] || 0;

            if (tentacleSim.state === 'slamming') {
                // Downward slam arc
                const slamAmt = tentacleSim.slamProgress;
                joint.group.rotation.x = (j === 0 ? 1.2 * slamAmt : 0.25 * slamAmt);
                joint.group.rotation.z = Math.sin(time * 2.0 + j * 0.2) * 0.08;
            } else if (tentacleSim.state === 'sweeping') {
                // Lateral sweeping whip
                joint.group.rotation.y = (j === 0 ? tentacleSim.sweepAngle : 0.2 * Math.sin(time * 5.0 + j));
                joint.group.rotation.x = 0.3 + Math.sin(time * 4.0 + j * 0.3) * 0.2;
            } else if (tentacleSim.state === 'telegraphing') {
                // Raised high above water, coiled to strike
                joint.group.rotation.x = -0.45 + Math.sin(time * 8.0 + j * 0.2) * 0.05;
                joint.group.rotation.z = Math.sin(time * 4.0 + j * 0.4) * 0.15;
            } else {
                // Idle swimming / coiling wave
                joint.group.rotation.x = simAngle * 1.5;
                joint.group.rotation.z = Math.cos(time * 1.5 + j * 0.5 + t) * 0.2;
            }
        }
    }

    // 6. Update Warning Telegraph Rings
    const activeRings = krakenState.telegraphRings || [];
    for (let i = 0; i < telegraphPool.length; i++) {
        const slot = telegraphPool[i];
        if (i < activeRings.length) {
            const rData = activeRings[i];
            slot.mesh.visible = true;
            slot.mesh.position.x = rData.position.x - krakenState.position.x;
            slot.mesh.position.z = rData.position.z - krakenState.position.z;
            const curR = Math.max(0.1, rData.currentRadius || 1.0);
            const scale = curR / 5.5;
            slot.mesh.scale.set(scale, scale, 1.0);
        } else {
            slot.mesh.visible = false;
        }
    }
}
