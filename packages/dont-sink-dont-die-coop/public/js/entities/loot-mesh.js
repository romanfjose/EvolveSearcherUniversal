/**
 * Don't Sink, Don't Die — Glowing 3D Loot Pickup Meshes & Rotating Aura Rings
 * Procedural Three.js mesh builder for floating Treasure Chests, Gold Coin Streams,
 * Repair Kits, and Temporary Power-Weapons (Lightning Oar, Explosive Barrel, Frost Warhammer).
 */

import { PICKUP_TYPES, PICKUP_DEFINITIONS } from '../../../shared/loot-pickups.js';

/**
 * Creates a glowing, bobbing 3D pickup mesh with rotating aura rings for the specified pickup type.
 *
 * @param {object} THREE - Three.js library instance.
 * @param {string} pickupType - One of PICKUP_TYPES.
 * @param {object} [customParams={}] - Optional overrides.
 * @returns {THREE.Group} Root Group containing the model, aura ring, glow beacons, and animation metadata.
 */
export function createLootPickupMesh(THREE, pickupType, customParams = {}) {
    const def = PICKUP_DEFINITIONS[pickupType];
    if (!def) {
        throw new Error(`Unsupported pickupType: ${pickupType}`);
    }

    const root = new THREE.Group();
    root.name = `Pickup_${pickupType}`;

    // Core bobbing pivot that holds visual geometry
    const bobGroup = new THREE.Group();
    bobGroup.name = 'BobGroup';
    root.add(bobGroup);

    // Glowing Aura Ring hovering just above water level / plank
    const auraRadius = 1.35;
    const auraGeo = new THREE.TorusGeometry(auraRadius, 0.08, 12, 32);
    const auraMat = new THREE.MeshBasicMaterial({
        color: customParams.auraColor || def.auraColorHex,
        transparent: true,
        opacity: 0.65,
        wireframe: false,
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.name = 'AuraRing';
    auraMesh.rotation.x = Math.PI / 2;
    auraMesh.position.y = 0.05;
    bobGroup.add(auraMesh);

    // Secondary inner counter-rotating energy ring
    const innerRingGeo = new THREE.TorusGeometry(auraRadius * 0.65, 0.04, 8, 24);
    const innerRingMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.name = 'InnerAuraRing';
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.08;
    bobGroup.add(innerRing);

    // Central beacon point light or glowing beacon core
    const beaconGeo = new THREE.SphereGeometry(0.18, 12, 12);
    const beaconMat = new THREE.MeshBasicMaterial({
        color: customParams.color || def.colorHex,
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.name = 'BeaconCore';
    beaconMesh.position.y = 0.85;
    bobGroup.add(beaconMesh);

    // Build unique composite 3D model for the specific pickup type
    let model;
    switch (pickupType) {
        case PICKUP_TYPES.CHEST:
            model = buildTreasureChestModel(THREE);
            break;
        case PICKUP_TYPES.COIN_STREAM:
            model = buildGoldCoinStreamModel(THREE);
            break;
        case PICKUP_TYPES.REPAIR_KIT:
            model = buildRepairKitModel(THREE);
            break;
        case PICKUP_TYPES.WEAPON_LIGHTNING_OAR:
            model = buildLightningOarModel(THREE);
            break;
        case PICKUP_TYPES.WEAPON_EXPLOSIVE_BARREL:
            model = buildExplosiveBarrelModel(THREE);
            break;
        case PICKUP_TYPES.WEAPON_FROST_WARHAMMER:
            model = buildFrostWarhammerModel(THREE);
            break;
        default:
            model = buildDefaultPickupModel(THREE, def);
            break;
    }

    if (model) {
        model.name = 'Model';
        bobGroup.add(model);
    }

    // Attach animation state container
    root.userData = {
        pickupType,
        baseY: 0,
        bobSpeed: 2.4,
        bobHeight: 0.16,
        rotationSpeed: 1.5,
        auraRotationSpeed: 2.2,
        phase: Math.random() * Math.PI * 2,
        isCollected: false,
        collectAnimTime: 0,
    };

    return root;
}

/**
 * 1. Sunken Treasure Chest:
 * Riveted dark-wood coffer, golden metal corners, rounded lid, and shiny golden latch.
 */
function buildTreasureChestModel(THREE) {
    const group = new THREE.Group();

    const woodMat = new THREE.MeshStandardMaterial({
        color: 0x5c3317,
        roughness: 0.8,
        metalness: 0.1,
    });
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.45,
        roughness: 0.25,
        metalness: 0.85,
    });

    // Lower coffer base
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), woodMat);
    base.position.y = 0.3;
    base.castShadow = true;
    group.add(base);

    // Rounded chest lid
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12, 1, false, 0, Math.PI), woodMat);
    lid.rotation.z = Math.PI / 2;
    lid.position.set(0, 0.55, 0);
    lid.castShadow = true;
    group.add(lid);

    // Golden lock / latch
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.1), goldMat);
    latch.position.set(0, 0.42, 0.31);
    group.add(latch);

    // Golden corner bands
    for (const sx of [-0.44, 0.44]) {
        for (const sz of [-0.29, 0.29]) {
            const corner = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.08), goldMat);
            corner.position.set(sx, 0.3, sz);
            group.add(corner);
        }
    }

    // Glowing keyhole gem
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    gem.position.set(0, 0.45, 0.36);
    group.add(gem);

    return group;
}

/**
 * 2. Gold Coin Stream:
 * Triad of spinning gold medallion discs aligned in an arc with glowing sparkles.
 */
function buildGoldCoinStreamModel(THREE) {
    const group = new THREE.Group();

    const goldCoinMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.9,
    });

    const sparkleMat = new THREE.MeshBasicMaterial({
        color: 0xfffbeb,
    });

    // 3 Gold coin discs staggered along stream
    for (let i = -1; i <= 1; i++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 16), goldCoinMat);
        coin.position.set(i * 0.42, 0.38 + Math.abs(i) * 0.12, i * 0.2);
        coin.rotation.x = 0.5 + i * 0.2;
        coin.rotation.z = i * 0.3;
        coin.castShadow = true;
        group.add(coin);

        // Sparkle glint
        const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), sparkleMat);
        glint.position.set(i * 0.42, 0.58 + Math.abs(i) * 0.12, i * 0.2);
        group.add(glint);
    }

    return group;
}

/**
 * 3. Repair Kit:
 * Sturdy buoyant first-aid toolbox with brass latches, red/green cross emblem, and sealant coils.
 */
function buildRepairKitModel(THREE) {
    const group = new THREE.Group();

    const kitMat = new THREE.MeshStandardMaterial({
        color: 0x047857,
        roughness: 0.5,
        metalness: 0.2,
    });
    const crossMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x34d399,
        emissiveIntensity: 0.8,
        roughness: 0.3,
    });
    const brassMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.4,
        metalness: 0.8,
    });

    // Main toolbox body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.5), kitMat);
    body.position.y = 0.32;
    body.castShadow = true;
    group.add(body);

    // Cross emblem on the top face
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.12), crossMat);
    crossH.position.set(0, 0.56, 0);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.35), crossMat);
    crossV.position.set(0, 0.56, 0);
    group.add(crossH, crossV);

    // Toolbox carrying handle
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 12, Math.PI), brassMat);
    handle.position.set(0, 0.58, 0);
    group.add(handle);

    return group;
}

/**
 * 4. Temporary Power Weapon: Lightning Oar
 * Crackling electrified twin-blade paddle with cyan energy coils and lightning sparks.
 */
function buildLightningOarModel(THREE) {
    const group = new THREE.Group();

    const shaftMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.5,
        metalness: 0.7,
    });
    const lightningMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.95,
        roughness: 0.1,
        metalness: 0.8,
    });
    const sparkMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
    });

    // Main shaft standing tilted
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.4, 8), shaftMat);
    shaft.position.set(0, 0.7, 0);
    shaft.rotation.z = -0.35;
    group.add(shaft);

    // Electrified paddle blade top
    const bladeTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.04), lightningMat);
    bladeTop.position.set(-0.22, 1.25, 0);
    bladeTop.rotation.z = -0.35;
    group.add(bladeTop);

    // Electrified paddle blade bottom
    const bladeBottom = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.04), lightningMat);
    bladeBottom.position.set(0.22, 0.15, 0);
    bladeBottom.rotation.z = -0.35;
    group.add(bladeBottom);

    // Lightning coil helix surrounding the center
    for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 12), sparkMat);
        ring.position.set(0, 0.45 + i * 0.16, 0);
        ring.rotation.x = 0.5;
        ring.rotation.y = i * 0.7;
        group.add(ring);
    }

    return group;
}

/**
 * 5. Temporary Power Weapon: Explosive Barrel Toss
 * Volatile red gunpowder keg with steel hoops, glowing danger skull/fuse, and sparks.
 */
function buildExplosiveBarrelModel(THREE) {
    const group = new THREE.Group();

    const barrelMat = new THREE.MeshStandardMaterial({
        color: 0xb91c1c,
        roughness: 0.7,
        metalness: 0.2,
    });
    const hoopMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.4,
        metalness: 0.8,
    });
    const fuseMat = new THREE.MeshStandardMaterial({
        color: 0x78350f,
        roughness: 0.9,
    });
    const sparkMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
    });

    // Barrel bulge body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.85, 12), barrelMat);
    body.position.y = 0.48;
    body.castShadow = true;
    group.add(body);

    // Steel reinforing hoops
    for (const y of [0.22, 0.48, 0.74]) {
        const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.06, 12), hoopMat);
        hoop.position.y = y;
        group.add(hoop);
    }

    // Fuse cord atop barrel
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), fuseMat);
    fuse.position.set(0.08, 0.98, 0);
    fuse.rotation.z = 0.4;
    group.add(fuse);

    // Sizzling spark at fuse tip
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), sparkMat);
    spark.position.set(0.14, 1.08, 0);
    group.add(spark);

    return group;
}

/**
 * 6. Temporary Power Weapon: Frost Warhammer
 * Glacial crystalline war hammer with glowing icy blue spikes and frozen rime.
 */
function buildFrostWarhammerModel(THREE) {
    const group = new THREE.Group();

    const haftMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.6,
        metalness: 0.6,
    });
    const frostMat = new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x0284c7,
        emissiveIntensity: 0.85,
        roughness: 0.15,
        metalness: 0.9,
        transparent: true,
        opacity: 0.92,
    });
    const iceSpikeMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
    });

    // Heavy haft
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.25, 8), haftMat);
    haft.position.set(0, 0.65, 0);
    haft.castShadow = true;
    group.add(haft);

    // Massive glacial hammerhead
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.32), frostMat);
    hammerHead.position.set(0, 1.05, 0);
    hammerHead.castShadow = true;
    group.add(hammerHead);

    // Glacial striking ice spikes on both faces
    for (const sx of [-0.32, 0.32]) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 6), iceSpikeMat);
        spike.position.set(sx, 1.05, 0);
        spike.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(spike);
    }

    return group;
}

/**
 * Fallback generic pickup model
 */
function buildDefaultPickupModel(THREE, def) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
        color: def.colorHex || 0xffffff,
        emissive: def.auraColorHex || 0x888888,
        emissiveIntensity: 0.5,
    });
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 1), mat);
    mesh.position.y = 0.5;
    group.add(mesh);
    return group;
}

/**
 * Updates animations for a loot pickup mesh instance:
 * Handles vertical wave bobbing, slow yaw rotation, aura spin, and collection poof animation.
 *
 * @param {THREE.Group} meshGroup - Root pickup mesh created via createLootPickupMesh.
 * @param {number} delta - Frame delta time in seconds.
 * @param {number} totalTime - Total elapsed time in seconds.
 */
export function animateLootPickupMesh(meshGroup, delta, totalTime) {
    if (!meshGroup || !meshGroup.userData) return;

    const u = meshGroup.userData;
    const bobGroup = meshGroup.getObjectByName('BobGroup');
    if (!bobGroup) return;

    // Handle collection burst animation
    if (u.isCollected) {
        u.collectAnimTime += delta;
        const progress = Math.min(1.0, u.collectAnimTime / 0.35); // 350ms poof

        // Fly upwards and scale down
        bobGroup.position.y += delta * 4.5;
        bobGroup.scale.setScalar(Math.max(0.001, 1.0 - progress));

        if (progress >= 1.0) {
            meshGroup.visible = false;
        }
        return;
    }

    // 1. Smooth harmonic vertical bobbing
    const bobOffset = Math.sin(totalTime * u.bobSpeed + u.phase) * u.bobHeight;
    bobGroup.position.y = (u.baseY || 0) + bobOffset;

    // 2. Slow constant model rotation
    bobGroup.rotation.y += delta * u.rotationSpeed;

    // 3. Aura Ring counter-rotations
    const aura = bobGroup.getObjectByName('AuraRing');
    if (aura) {
        aura.rotation.z += delta * u.auraRotationSpeed;
        // Subtle pulsing scale
        const pulse = 1.0 + Math.sin(totalTime * 3.5 + u.phase) * 0.08;
        aura.scale.set(pulse, pulse, 1.0);
    }

    const innerAura = bobGroup.getObjectByName('InnerAuraRing');
    if (innerAura) {
        innerAura.rotation.z -= delta * (u.auraRotationSpeed * 1.5);
    }

    // 4. Beacon glow pulse
    const beacon = bobGroup.getObjectByName('BeaconCore');
    if (beacon) {
        const beaconPulse = 0.9 + Math.cos(totalTime * 4.0 + u.phase) * 0.15;
        beacon.scale.setScalar(beaconPulse);
    }
}

/**
 * Triggers collection sequence on the mesh group (causes it to burst and despawn).
 */
export function triggerLootPickupCollection(meshGroup) {
    if (!meshGroup || !meshGroup.userData) return;
    meshGroup.userData.isCollected = true;
    meshGroup.userData.collectAnimTime = 0;
}
