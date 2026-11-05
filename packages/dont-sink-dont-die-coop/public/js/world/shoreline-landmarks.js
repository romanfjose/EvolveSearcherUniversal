/**
 * Reactive Shoreline Spectators, Dock Cranes & Neon Harbor Landmarks
 * (`public/js/world/shoreline-landmarks.js`)
 *
 * Populates riverbanks with interactive low-poly setpieces that react dynamically
 * when the player raft sails within 35 meters:
 *   1. Cheering Harbor Spectators: Jumping low-poly crowd waving arms, signs & foam hands.
 *   2. Swinging Cargo Cranes: Industrial cranes with swiveling booms, winches & hoisted containers.
 *   3. Glowing Neon Dockside Tavern Signs: Multi-colored neon tubing, mugs & anchors that pulse and flicker.
 *   4. Ancient Cavern Crystal Obelisks: Monolith crystal pillars with floating orbiting energy shards.
 *
 * Clean, zero-external-dependency ES module. Compatible with Three.js or headless mocks.
 */

/**
 * Linear congruential generator (LCG) for deterministic procedural placement.
 */
function createPrng(seed = 42) {
    let s = (Math.abs(seed) || 42) % 2147483647;
    if (s === 0) s = 1;
    return function next() {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Safe material creator fallback supporting mock and standard Three.js materials.
 */
function createMat(THREE, type, params) {
    const MatClass = THREE[type] || THREE.MeshStandardMaterial || THREE.Material;
    return new MatClass(params);
}

// ─────────────────────────────────────────────────────────────────────────────
// Landmark 1: Cheering Harbor Spectators
// ─────────────────────────────────────────────────────────────────────────────

function createSpectatorMesh(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `SpectatorGroup_${config.id}`;
    group.position.set(config.x, config.y || 0.4, config.z);
    group.rotation.y = config.rotationY || 0;

    // Small pier platform / grandstand wooden deck
    const dockDeckMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x5a3d28,
        roughness: 0.85,
    });
    const dockDeck = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.4, 3.6), dockDeckMat);
    dockDeck.position.set(0, 0, 0);
    group.add(dockDeck);

    // Dock railing
    const railMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x8c6d46,
        roughness: 0.6,
    });
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.1, 0.12), railMat);
    railTop.position.set(0, 0.9, -1.6);
    group.add(railTop);

    // 4 to 6 low-poly spectator characters
    const spectators = [];
    const count = 4 + Math.floor(prng() * 3);
    const shirtColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899];
    const skinMat = createMat(THREE, 'MeshStandardMaterial', { color: 0xffdbac, roughness: 0.7 });

    for (let i = 0; i < count; i++) {
        const spec = new THREE.Group();
        const offsetX = -2.2 + (i / Math.max(1, count - 1)) * 4.4 + (prng() - 0.5) * 0.3;
        const offsetZ = -0.8 + (prng() - 0.5) * 0.6;
        spec.position.set(offsetX, 0.2, offsetZ);

        const bodyMat = createMat(THREE, 'MeshStandardMaterial', {
            color: shirtColors[Math.floor(prng() * shirtColors.length)],
            roughness: 0.8,
        });

        // Legs / Pants
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.28), createMat(THREE, 'MeshStandardMaterial', { color: 0x1e293b }));
        legs.position.set(0, 0.24, 0);
        spec.add(legs);

        // Torso / Shirt
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.3), bodyMat);
        torso.position.set(0, 0.68, 0);
        spec.add(torso);

        // Head & Hat
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
        head.position.set(0, 1.08, 0);
        spec.add(head);

        // Arms (for waving/cheering)
        const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), skinMat);
        leftArm.position.set(-0.28, 0.76, 0);
        spec.add(leftArm);

        const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), skinMat);
        rightArm.position.set(0.28, 0.76, 0);
        spec.add(rightArm);

        // Cheering accessory: Foam hand or mini pennant banner
        if (i % 2 === 0) {
            const foamHandMat = createMat(THREE, 'MeshStandardMaterial', { color: 0xfacc15, roughness: 0.4 });
            const foamHand = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.06), foamHandMat);
            foamHand.position.set(0, 0.25, 0);
            rightArm.add(foamHand);
        }

        group.add(spec);
        spectators.push({
            group: spec,
            leftArm,
            rightArm,
            baseY: spec.position.y,
            phase: prng() * Math.PI * 2,
            jumpFreq: 4.0 + prng() * 2.0,
        });
    }

    return {
        type: 'spectators',
        id: config.id,
        group,
        position: group.position,
        spectators,
        reactionLevel: 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Landmark 2: Swinging Industrial Cargo Cranes
// ─────────────────────────────────────────────────────────────────────────────

function createCraneMesh(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `CargoCrane_${config.id}`;
    group.position.set(config.x, config.y || 0.5, config.z);

    const metalMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xd97706, // Industrial safety orange
        roughness: 0.5,
        metalness: 0.6,
    });
    const darkMetalMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x334155,
        roughness: 0.6,
        metalness: 0.8,
    });
    const cableMat = createMat(THREE, 'MeshBasicMaterial', { color: 0x111827 });
    const beaconMat = createMat(THREE, 'MeshBasicMaterial', { color: 0xef4444 });

    // Crane Tower Base
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9.0, 2.4), metalMat);
    tower.position.set(0, 4.5, 0);
    group.add(tower);

    // Operator Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.8), darkMetalMat);
    cabin.position.set(0.6, 8.8, 0);
    group.add(cabin);

    // Warning beacon light on top
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), beaconMat);
    beacon.position.set(0, 9.4, 0);
    group.add(beacon);

    // Rotating Jib Arm Pivot Group
    const jibPivot = new THREE.Group();
    jibPivot.position.set(0, 8.9, 0);
    group.add(jibPivot);

    // Long horizontal boom
    const boom = new THREE.Mesh(new THREE.BoxGeometry(12.0, 0.6, 0.8), metalMat);
    boom.position.set(4.0, 0, 0); // Extended towards river
    jibPivot.add(boom);

    // Counterweight
    const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 1.2), darkMetalMat);
    counterWeight.position.set(-2.2, 0.2, 0);
    jibPivot.add(counterWeight);

    // Winch Cable
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.0, 6), cableMat);
    cable.position.set(8.5, -2.5, 0);
    jibPivot.add(cable);

    // Hoisted Cargo Container / Shipping Crate
    const cargoMat = createMat(THREE, 'MeshStandardMaterial', {
        color: config.side < 0 ? 0x0284c7 : 0x16a34a,
        roughness: 0.5,
        metalness: 0.4,
    });
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 3.4), cargoMat);
    cargo.position.set(8.5, -5.2, 0);
    jibPivot.add(cargo);

    return {
        type: 'crane',
        id: config.id,
        group,
        position: group.position,
        jibPivot,
        cargo,
        beacon,
        cable,
        baseAngle: (config.side < 0 ? 1 : -1) * (Math.PI * 0.15),
        swingSpeed: 0.8 + prng() * 0.4,
        reactionLevel: 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Landmark 3: Glowing Neon Dockside Tavern Signs
// ─────────────────────────────────────────────────────────────────────────────

function createNeonTavernSignMesh(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `NeonTavernSign_${config.id}`;
    group.position.set(config.x, config.y || 0.3, config.z);
    group.rotation.y = config.rotationY || 0;

    // Dockside Tavern Facade / Shack
    const woodWallMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3e2723,
        roughness: 0.9,
    });
    const roofMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x263238,
        roughness: 0.7,
    });

    const tavernBuilding = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4.5, 4.0), woodWallMat);
    tavernBuilding.position.set(0, 2.25, 0);
    group.add(tavernBuilding);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.0, 1.8, 4), roofMat);
    roof.position.set(0, 5.2, 0);
    roof.rotation.y = Math.PI * 0.25;
    group.add(roof);

    // Overhanging Signboard Backing
    const signBoardMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x111827,
        roughness: 0.5,
    });
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.8, 0.25), signBoardMat);
    signBoard.position.set(0, 3.2, 2.15);
    group.add(signBoard);

    // Glowing Neon Tubing (Beer Mug / Nautical Anchor & Title Bar)
    const neonPinkMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xff007f,
        emissive: new THREE.Color(0xff007f),
        emissiveIntensity: 1.2,
        roughness: 0.2,
    });
    const neonCyanMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x00f0ff,
        emissive: new THREE.Color(0x00f0ff),
        emissiveIntensity: 1.5,
        roughness: 0.2,
    });
    const neonGoldMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xffd700,
        emissive: new THREE.Color(0xffd700),
        emissiveIntensity: 1.4,
        roughness: 0.2,
    });

    // Outer neon border
    const neonBorder = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.08, 8, 24), neonCyanMat);
    neonBorder.position.set(0, 3.2, 2.3);
    group.add(neonBorder);

    // Neon Anchor / Symbol
    const anchorRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 16), neonGoldMat);
    anchorRing.position.set(0, 3.7, 2.32);
    group.add(anchorRing);

    const anchorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), neonPinkMat);
    anchorStem.position.set(0, 3.1, 2.32);
    group.add(anchorStem);

    const anchorCross = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), neonPinkMat);
    anchorCross.rotation.z = Math.PI * 0.5;
    anchorCross.position.set(0, 3.3, 2.32);
    group.add(anchorCross);

    // Warm ambient dock lantern
    const lanternMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xffe082,
        emissive: new THREE.Color(0xffa726),
        emissiveIntensity: 1.0,
    });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), lanternMat);
    lantern.position.set(1.6, 2.2, 2.2);
    group.add(lantern);

    return {
        type: 'tavernSign',
        id: config.id,
        group,
        position: group.position,
        signMaterials: [neonPinkMat, neonCyanMat, neonGoldMat, lanternMat],
        baseEmissives: [1.2, 1.5, 1.4, 1.0],
        reactionLevel: 0,
        flickerSeed: prng() * 100,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Landmark 4: Ancient Cavern Crystal Obelisks
// ─────────────────────────────────────────────────────────────────────────────

function createCrystalObeliskMesh(THREE, config, prng) {
    const group = new THREE.Group();
    group.name = `CrystalObelisk_${config.id}`;
    group.position.set(config.x, config.y || 0.0, config.z);

    // Ancient Ruin Stone Pedestal
    const stoneMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x1f2937,
        roughness: 0.85,
        metalness: 0.2,
    });
    const runeStoneMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x111827,
        roughness: 0.7,
        metalness: 0.4,
    });

    const pedestalBase = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.4, 1.2, 8), stoneMat);
    pedestalBase.position.set(0, 0.6, 0);
    group.add(pedestalBase);

    const pedestalRune = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.4, 0.8, 8), runeStoneMat);
    pedestalRune.position.set(0, 1.5, 0);
    group.add(pedestalRune);

    // Central Glowing Crystal Monolith (Octahedron / Prism)
    const crystalMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x06b6d4, // Cyan / Emerald / Amethyst glow
        emissive: new THREE.Color(0x0891b2),
        emissiveIntensity: 1.2,
        roughness: 0.15,
        metalness: 0.8,
        transparent: true,
        opacity: 0.9,
    });

    const crystalCore = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), crystalMat);
    crystalCore.scale.set(1.0, 2.8, 1.0);
    crystalCore.position.set(0, 4.8, 0);
    group.add(crystalCore);

    // Orbiting levitating crystal shards
    const shards = [];
    const shardCount = 4;
    const shardMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x22d3ee,
        emissive: new THREE.Color(0x06b6d4),
        emissiveIntensity: 1.8,
        roughness: 0.1,
    });

    for (let i = 0; i < shardCount; i++) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), shardMat);
        shard.scale.set(0.6, 1.6, 0.6);
        group.add(shard);
        shards.push({
            mesh: shard,
            orbitRadius: 2.8 + (i % 2) * 0.7,
            speed: (i % 2 === 0 ? 1 : -1) * (1.2 + prng() * 0.6),
            phase: (i / shardCount) * Math.PI * 2,
            baseY: 4.2 + (i - 1.5) * 0.8,
        });
    }

    // Glowing energy ring around base
    const ringMat = createMat(THREE, 'MeshBasicMaterial', {
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.7,
    });
    const energyRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 8, 24), ringMat);
    energyRing.rotation.x = Math.PI * 0.5;
    energyRing.position.set(0, 2.0, 0);
    group.add(energyRing);

    return {
        type: 'crystalObelisk',
        id: config.id,
        group,
        position: group.position,
        crystalCore,
        crystalMat,
        shards,
        energyRing,
        reactionLevel: 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Landmark Factory & Placement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds and returns all reactive shoreline landmarks along the river channel.
 *
 * @param {object} THREE - Three.js namespace or mock.
 * @param {number} [seed=42] - Seed for procedural placement.
 * @returns {object} Shoreline landmarks handle containing the scene group and animation items.
 */
export function buildShorelineLandmarks(THREE, seed = 42) {
    const prng = createPrng(seed);
    const rootGroup = new THREE.Group();
    rootGroup.name = 'ShorelineLandmarksRoot';

    const items = [];
    const riverWidth = 30.0;
    const halfWidth = riverWidth * 0.5;

    // Distribute setpieces evenly along both riverbanks from z = -80 down to z = -1450
    // Every 60-80 meters, alternate bank sides
    const landmarkConfigs = [
        // Act I: Spectators & Tavern Sign
        { type: 'spectators', side: -1, z: -90, dist: halfWidth + 4.0 },
        { type: 'tavernSign', side: 1, z: -150, dist: halfWidth + 5.5 },
        { type: 'spectators', side: 1, z: -230, dist: halfWidth + 4.2 },
        // Act II: Industrial Harbor Cargo Cranes & Spectators
        { type: 'crane', side: -1, z: -320, dist: halfWidth + 6.0 },
        { type: 'tavernSign', side: -1, z: -410, dist: halfWidth + 5.0 },
        { type: 'crane', side: 1, z: -490, dist: halfWidth + 6.2 },
        { type: 'spectators', side: -1, z: -570, dist: halfWidth + 4.5 },
        { type: 'crane', side: -1, z: -660, dist: halfWidth + 6.0 },
        // Act III: Ancient Cavern Crystal Obelisks & Mystic Taverns
        { type: 'crystalObelisk', side: 1, z: -760, dist: halfWidth + 5.0 },
        { type: 'tavernSign', side: -1, z: -850, dist: halfWidth + 5.2 },
        { type: 'crystalObelisk', side: -1, z: -940, dist: halfWidth + 4.8 },
        { type: 'spectators', side: 1, z: -1030, dist: halfWidth + 4.2 },
        // Act IV: Tempest Ancient Obelisks & Titan Cranes
        { type: 'crystalObelisk', side: 1, z: -1130, dist: halfWidth + 5.5 },
        { type: 'crane', side: -1, z: -1220, dist: halfWidth + 6.0 },
        { type: 'crystalObelisk', side: -1, z: -1330, dist: halfWidth + 5.0 },
        { type: 'spectators', side: 1, z: -1420, dist: halfWidth + 4.0 },
    ];

    let idCounter = 1;
    for (const cfg of landmarkConfigs) {
        const xPos = cfg.side * (cfg.dist + (prng() - 0.5) * 1.5);
        const zPos = cfg.z + (prng() - 0.5) * 10;
        // Face inward toward the river channel
        const rotY = cfg.side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

        const config = {
            id: idCounter++,
            x: xPos,
            z: zPos,
            side: cfg.side,
            rotationY: rotY,
        };

        let landmark = null;
        if (cfg.type === 'spectators') {
            landmark = createSpectatorMesh(THREE, config, prng);
        } else if (cfg.type === 'crane') {
            landmark = createCraneMesh(THREE, config, prng);
        } else if (cfg.type === 'tavernSign') {
            landmark = createNeonTavernSignMesh(THREE, config, prng);
        } else if (cfg.type === 'crystalObelisk') {
            landmark = createCrystalObeliskMesh(THREE, config, prng);
        }

        if (landmark) {
            rootGroup.add(landmark.group);
            items.push(landmark);
        }
    }

    return {
        group: rootGroup,
        items,
        proximities: new Map(),
        reactionThreshold: 35.0, // Active reaction radius within 35 meters
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Animation & Reaction Director
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Animates all shoreline landmarks and triggers reactions when the raft sails within 35m.
 *
 * @param {object} handle - Return object from `buildShorelineLandmarks`.
 * @param {object} raftPos - Position of player raft ({ x, y, z } or Vector3).
 * @param {number} elapsedSec - Total elapsed game time in seconds.
 */
export function animateShorelineLandmarks(handle, raftPos, elapsedSec = 0) {
    if (!handle || !Array.isArray(handle.items)) return;

    const threshold = handle.reactionThreshold || 35.0;
    const rx = raftPos ? (raftPos.x ?? 0) : 0;
    const rz = raftPos ? (raftPos.z ?? 0) : 0;

    for (const item of handle.items) {
        const dx = item.position.x - rx;
        const dz = item.position.z - rz;
        const dist = Math.hypot(dx, dz);
        const isNear = raftPos != null && dist <= threshold;

        // Smooth reaction lerp (0.0 = calm/idle, 1.0 = full excitation)
        const targetReaction = isNear ? Math.max(0.2, 1.0 - dist / threshold) : 0.0;
        item.reactionLevel += (targetReaction - item.reactionLevel) * 0.15;
        if (Math.abs(item.reactionLevel) < 0.001) item.reactionLevel = 0.0;

        handle.proximities?.set(item.id, { dist, isNear, reactionLevel: item.reactionLevel });

        // 1. Cheering Spectators Animation
        if (item.type === 'spectators') {
            const cheerBoost = 1.0 + item.reactionLevel * 2.5;
            for (const spec of item.spectators) {
                const t = elapsedSec * spec.jumpFreq * cheerBoost + spec.phase;
                // Vertical jump bounce
                const jump = Math.max(0, Math.sin(t));
                spec.group.position.y = spec.baseY + jump * (0.15 + item.reactionLevel * 0.5);

                // Arm waving & cheering rotation
                if (spec.leftArm && spec.rightArm) {
                    const wave = Math.sin(t * 1.5);
                    spec.leftArm.rotation.x = -Math.PI * 0.8 + wave * (0.4 + item.reactionLevel * 0.6);
                    spec.rightArm.rotation.x = -Math.PI * 0.8 - wave * (0.4 + item.reactionLevel * 0.6);
                }
            }
        }

        // 2. Cargo Crane Animation
        else if (item.type === 'crane') {
            const speed = item.swingSpeed * (1.0 + item.reactionLevel * 1.8);
            const swingAmplitude = 0.35 + item.reactionLevel * 0.45;
            if (item.jibPivot) {
                item.jibPivot.rotation.y = item.baseAngle + Math.sin(elapsedSec * speed) * swingAmplitude;
            }
            if (item.cargo) {
                // Hoisted cargo bobbing & swinging slightly on the cable
                item.cargo.position.y = -5.2 + Math.sin(elapsedSec * speed * 2.0) * (0.2 + item.reactionLevel * 0.6);
                item.cargo.rotation.z = Math.cos(elapsedSec * speed) * (0.05 + item.reactionLevel * 0.15);
            }
        }

        // 3. Neon Tavern Sign Animation
        else if (item.type === 'tavernSign') {
            // Pulse & flicker neon emissive intensities
            const flicker = Math.sin(elapsedSec * 12.0 + item.flickerSeed) * 0.15;
            const boost = 1.0 + item.reactionLevel * 1.5;
            for (let i = 0; i < item.signMaterials.length; i++) {
                const mat = item.signMaterials[i];
                if (mat) {
                    const base = item.baseEmissives[i] || 1.0;
                    mat.emissiveIntensity = Math.max(0.2, (base + flicker) * boost);
                }
            }
        }

        // 4. Ancient Crystal Obelisk Animation
        else if (item.type === 'crystalObelisk') {
            const rotSpeed = 0.6 + item.reactionLevel * 2.0;
            if (item.crystalCore) {
                item.crystalCore.rotation.y = elapsedSec * rotSpeed;
                // Levitation bob
                item.crystalCore.position.y = 4.8 + Math.sin(elapsedSec * 2.0) * (0.2 + item.reactionLevel * 0.4);
            }
            if (item.crystalMat) {
                item.crystalMat.emissiveIntensity = 1.2 + Math.sin(elapsedSec * 4.0) * 0.3 + item.reactionLevel * 2.0;
            }
            // Animate orbiting crystal shards
            if (item.shards) {
                const orbitSpeedMult = 1.0 + item.reactionLevel * 2.5;
                for (const shard of item.shards) {
                    const angle = elapsedSec * shard.speed * orbitSpeedMult + shard.phase;
                    shard.mesh.position.x = Math.cos(angle) * shard.orbitRadius;
                    shard.mesh.position.z = Math.sin(angle) * shard.orbitRadius;
                    shard.mesh.position.y = shard.baseY + Math.sin(elapsedSec * 3.0 + shard.phase) * (0.25 + item.reactionLevel * 0.3);
                    shard.mesh.rotation.y = angle * 2.0;
                    shard.mesh.rotation.x = Math.sin(angle);
                }
            }
            if (item.energyRing) {
                item.energyRing.rotation.z = elapsedSec * 1.5;
                item.energyRing.scale.set(
                    1.0 + item.reactionLevel * 0.3,
                    1.0 + item.reactionLevel * 0.3,
                    1.0 + item.reactionLevel * 0.3
                );
            }
        }
    }
}
