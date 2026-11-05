/**
 * Three.js Procedural Meshes & Animation Director for
 * Bizarre Fever-Dream Mid-River Encounters:
 * 1. Capybara Hot-Tub Barge (Steaming cedar tub, 3 capybaras with tangerines, warm steam particles/mesh)
 * 2. Bureaucratic Swan Boat (Pedal-swan with armored toll booth, stamping desk, audit pinata)
 * 3. Rubber Ducky Stampede (30 giant bright-yellow rubber ducks with beaks and bobbing animations)
 * 4. Ghost Shopping Cart (Glowing neon wireframe trolley, firework rockets, exhaust aura)
 * 5. Disco Crab Rave Island (Sandbar, palm tree, mirror ball, 8 neon dancing crabs with snapping pincers)
 *
 * Polished, living aesthetic with procedural textures and composite 3D models.
 * Zero external dependencies. Accepts injected `THREE`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Capybara Hot-Tub Barge Mesh
// ─────────────────────────────────────────────────────────────────────────────

export function createCapybaraBargeMesh(THREE, config) {
    const group = new THREE.Group();
    group.position.set(config.x, config.y ?? 0.25, config.z);

    // Cedar Wood Materials
    const cedarMat = new THREE.MeshStandardMaterial({
        color: 0x8b5a2b,
        roughness: 0.75,
        metalness: 0.1,
    });
    const ironBandMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.5,
        metalness: 0.8,
    });
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x22a6b3,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
    });

    // A. Cedar Barge Platform & Tub Base
    const platform = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 7.2), cedarMat);
    platform.position.y = 0.1;
    group.add(platform);

    // Round Tub Walls & Iron Hoops
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.2, 24, 1, true), cedarMat);
    tub.position.y = 0.8;
    const hoopTop = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.05, 8, 24), ironBandMat);
    hoopTop.rotation.x = Math.PI / 2;
    hoopTop.position.y = 1.1;
    const hoopBottom = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.05, 8, 24), ironBandMat);
    hoopBottom.rotation.x = Math.PI / 2;
    hoopBottom.position.y = 0.5;
    group.add(tub, hoopTop, hoopBottom);

    // Hot Steaming Water Disc
    const waterDisc = new THREE.Mesh(new THREE.CircleGeometry(2.25, 24), waterMat);
    waterDisc.rotation.x = -Math.PI / 2;
    waterDisc.position.y = 1.15;
    group.add(waterDisc);

    // B. Three Chill Capybaras with Tangerines on Head
    const capyBrownMat = new THREE.MeshStandardMaterial({
        color: 0x795548,
        roughness: 0.9,
    });
    const muzzleMat = new THREE.MeshStandardMaterial({
        color: 0x5d4037,
        roughness: 0.9,
    });
    const noseMat = new THREE.MeshBasicMaterial({ color: 0x1f1f1f });
    const tangerineMat = new THREE.MeshStandardMaterial({
        color: 0xff8c00,
        roughness: 0.4,
    });
    const stemMat = new THREE.MeshBasicMaterial({ color: 0x2e7d32 });

    const capybaraModels = [];
    const positions = (config.capybaras && config.capybaras.length > 0)
        ? config.capybaras
        : [
            { relX: -1.0, relZ: 0.8 },
            { relX: 0.9, relZ: 0.6 },
            { relX: 0.0, relZ: -0.9 },
        ];

    positions.forEach((capyData, index) => {
        const capy = new THREE.Group();
        capy.position.set(capyData.relX, 1.15, capyData.relZ);

        // Body (submerged slightly in tub)
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), capyBrownMat);
        body.scale.set(1.1, 0.9, 1.3);
        body.position.y = 0.2;

        // Head (chill blocky snout)
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.6), capyBrownMat);
        head.position.set(0, 0.55, 0.35);

        // Muzzle
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.35), muzzleMat);
        snout.position.set(0, 0.45, 0.62);

        // Nostrils / Nose
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.05), noseMat);
        nose.position.set(0, 0.52, 0.8);

        // Tangerine sitting on head!
        const tangerine = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), tangerineMat);
        tangerine.position.set(0, 0.85, 0.35);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6), stemMat);
        stem.position.set(0, 0.98, 0.35);

        // Zen sleepy eyes (thin slit)
        const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), noseMat);
        eyeLeft.position.set(-0.2, 0.62, 0.55);
        const eyeRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), noseMat);
        eyeRight.position.set(0.2, 0.62, 0.55);

        capy.add(body, head, snout, nose, tangerine, stem, eyeLeft, eyeRight);
        group.add(capy);
        capybaraModels.push({ model: capy, initialY: capy.position.y, index });
    });

    // C. Calming Aura Glow Disc & Steam
    const auraMat = new THREE.MeshBasicMaterial({
        color: 0x80ffdb,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
    });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(6.6, 7.0, 32), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.05;
    group.add(auraRing);

    group.userData = {
        type: 'capybaraBarge',
        config,
        capybaraModels,
        auraRing,
    };

    return group;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bureaucratic Swan Boat Mesh
// ─────────────────────────────────────────────────────────────────────────────

export function createBureaucraticSwanMesh(THREE, config) {
    const group = new THREE.Group();
    group.position.set(config.x, config.y ?? 0.25, config.z);

    // Materials
    const swanWhiteMat = new THREE.MeshStandardMaterial({
        color: 0xfafafa,
        roughness: 0.3,
        metalness: 0.1,
    });
    const beakOrangeMat = new THREE.MeshStandardMaterial({
        color: 0xff6b35,
        roughness: 0.5,
    });
    const armorPlateMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.4,
        metalness: 0.8,
    });
    const pinataMat = new THREE.MeshStandardMaterial({
        color: 0xff007f,
        roughness: 0.6,
    });
    const goldCoinMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.85,
        roughness: 0.2,
    });

    // A. Pedal Swan Hull
    const hull = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4.2, 16), swanWhiteMat);
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1.0, 1.4, 0.7);
    hull.position.y = 0.3;
    group.add(hull);

    // Swan Elegant Curved Neck & Head
    const neckGeo = new THREE.CylinderGeometry(0.24, 0.32, 2.2, 12);
    const neck = new THREE.Mesh(neckGeo, swanWhiteMat);
    neck.position.set(0, 1.4, -1.5);
    neck.rotation.x = 0.35;
    group.add(neck);

    const swanHead = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), swanWhiteMat);
    swanHead.position.set(0, 2.45, -1.85);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 8), beakOrangeMat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, 2.38, -2.3);

    // Bureaucrat Spectacles
    const glassesMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 6, 12), glassesMat);
    glasses.position.set(0, 2.5, -2.15);
    group.add(swanHead, beak, glasses);

    // B. Armored Toll Booth & Stamping Desk
    const booth = new THREE.Group();
    booth.position.set(0, 0.9, 0.4);

    const boothFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.6), armorPlateMat);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 4), armorPlateMat);
    roof.position.y = 1.2;
    roof.rotation.y = Math.PI / 4;

    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.6), swanWhiteMat);
    desk.position.set(0, 0.0, -0.6);

    booth.add(boothFrame, roof, desk);
    group.add(booth);

    // C. 25-Coin Audit Pinata (hanging behind the booth)
    const pinataGroup = new THREE.Group();
    pinataGroup.position.set(0, 1.5, 1.8);
    const pinataBody = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55), pinataMat);
    const starConeGeo = new THREE.ConeGeometry(0.18, 0.4, 6);
    starConeGeo.rotateX(Math.PI / 2);
    for (let s = 0; s < 4; s++) {
        const star = new THREE.Mesh(starConeGeo, goldCoinMat);
        const a = (s * Math.PI) / 2;
        star.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
        star.rotation.y = -a;
        pinataBody.add(star);
    }
    pinataGroup.add(pinataBody);
    group.add(pinataGroup);

    group.userData = {
        type: 'bureaucraticSwan',
        config,
        booth,
        pinataGroup,
        neck,
    };

    return group;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Rubber Ducky Stampede Mesh
// ─────────────────────────────────────────────────────────────────────────────

export function createRubberDuckyMesh(THREE, duckData) {
    const group = new THREE.Group();
    group.position.set(duckData.x, duckData.y ?? 0.3, duckData.z);
    const scale = duckData.scale || 1.0;
    group.scale.set(scale, scale, scale);

    const duckYellowMat = new THREE.MeshStandardMaterial({
        color: 0xffe600,
        roughness: 0.3,
        metalness: 0.05,
    });
    const beakOrangeMat = new THREE.MeshStandardMaterial({
        color: 0xff5e00,
        roughness: 0.4,
    });
    const eyeBlackMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const springMat = new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        metalness: 0.8,
        roughness: 0.2,
    });

    // Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 16), duckYellowMat);
    body.scale.set(1.0, 0.8, 1.3);
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 14), duckYellowMat);
    head.position.set(0, 0.75, -0.55);
    group.add(head);

    // Beak
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.38), beakOrangeMat);
    beak.position.set(0, 0.68, -1.02);
    group.add(beak);

    // Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeBlackMat);
    eyeL.position.set(-0.25, 0.9, -0.85);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeBlackMat);
    eyeR.position.set(0.25, 0.9, -0.85);
    group.add(eyeL, eyeR);

    // Tail feather tuft
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 6), duckYellowMat);
    tail.rotation.x = 0.8;
    tail.position.set(0, 0.45, 0.95);
    group.add(tail);

    // Springboard Pad on Top (indicating jumpable platform)
    const springPad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 16), springMat);
    springPad.position.set(0, 0.72, 0.1);
    group.add(springPad);

    group.userData = {
        type: 'rubberDucky',
        duckData,
        baseY: duckData.y ?? 0.3,
    };

    return group;
}

export function createStampedeGroup(THREE, stampedeConfig) {
    const root = new THREE.Group();
    root.name = 'rubberDuckyStampede';
    const duckMeshes = [];

    for (const d of stampedeConfig.ducks) {
        const mesh = createRubberDuckyMesh(THREE, d);
        root.add(mesh);
        duckMeshes.push(mesh);
    }

    root.userData = {
        type: 'stampedeGroup',
        config: stampedeConfig,
        duckMeshes,
    };

    return root;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Ghost Shopping Cart Mesh
// ─────────────────────────────────────────────────────────────────────────────

export function createGhostShoppingCartMesh(THREE, config) {
    const group = new THREE.Group();
    group.position.set(config.x, config.y ?? 0.3, config.z);

    // Glowing Neon Wireframe Materials
    const neonGhostMat = new THREE.MeshBasicMaterial({
        color: 0x39ff14, // glowing radioactive green / ethereal ghost
        wireframe: true,
    });
    const solidGhostMat = new THREE.MeshStandardMaterial({
        color: 0x00f5d4,
        transparent: true,
        opacity: 0.65,
        roughness: 0.2,
    });
    const rocketMat = new THREE.MeshStandardMaterial({
        color: 0xff0055,
        metalness: 0.6,
        roughness: 0.3,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.5,
    });

    // Trolley Basket Wireframe
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.8), neonGhostMat);
    basket.position.y = 1.0;
    group.add(basket);

    // Trolley Chassis & Wheel Legs
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.7), solidGhostMat);
    chassis.position.y = 0.45;
    group.add(chassis);

    // 4 Trolley Wheels
    for (const wx of [-0.6, 0.6]) {
        for (const wz of [-0.75, 0.75]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10), wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(wx, 0.2, wz);
            group.add(wheel);
        }
    }

    // Handlebar
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), solidGhostMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, 1.5, 0.95);
    group.add(handle);

    // Fireworks Rocket Tubes Inside Basket
    const rockets = [];
    for (let r = 0; r < 5; r++) {
        const rocket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8), rocketMat);
        rocket.position.set((r - 2) * 0.25, 1.3, (r % 2 === 0 ? 0.2 : -0.2));
        rocket.rotation.x = -0.3; // aimed for thrust
        group.add(rocket);
        rockets.push(rocket);
    }

    // Rocket Thruster Cone at the back
    const boosterCone = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 12), rocketMat);
    boosterCone.rotation.x = -Math.PI / 2;
    boosterCone.position.set(0, 0.6, 1.1);
    group.add(boosterCone);

    group.userData = {
        type: 'ghostShoppingCart',
        config,
        basket,
        boosterCone,
        rockets,
    };

    return group;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Disco Crab Rave Island Mesh
// ─────────────────────────────────────────────────────────────────────────────

export function createDiscoCrabRaveMesh(THREE, config) {
    const group = new THREE.Group();
    group.position.set(config.x, config.y ?? 0.1, config.z);

    // Materials
    const sandMat = new THREE.MeshStandardMaterial({
        color: 0xf4d06f,
        roughness: 0.9,
    });
    const mirrorBallMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.95,
        roughness: 0.1,
    });
    const palmWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
    const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.5 });

    // A. Sandbar Island
    const sandbar = new THREE.Mesh(new THREE.CylinderGeometry(6.0, 6.8, 0.6, 24), sandMat);
    sandbar.position.y = 0.15;
    group.add(sandbar);

    // B. Tropical Palm Tree with Curved Trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 4.5, 8), palmWoodMat);
    trunk.position.set(-1.8, 2.3, -1.2);
    trunk.rotation.z = -0.15;
    group.add(trunk);

    // Palm Fronds
    for (let f = 0; f < 5; f++) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.6), palmLeafMat);
        const a = (f * Math.PI * 2) / 5;
        leaf.position.set(-1.8 + Math.cos(a) * 1.2, 4.4, -1.2 + Math.sin(a) * 1.2);
        leaf.rotation.y = a;
        leaf.rotation.z = -0.4;
        group.add(leaf);
    }

    // C. Hanging Spinning Disco Mirror Ball
    const discoBall = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 16), mirrorBallMat);
    discoBall.position.set(0, 4.2, 0);
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 6), palmWoodMat);
    hanger.position.set(0, 5.2, 0);
    group.add(discoBall, hanger);

    // D. 8 Neon Dancing Crabs
    const neonColors = [0x00f0ff, 0xff007f, 0x39ff14, 0xffe600];
    const crabMeshes = [];

    const crabs = (config.crabs && config.crabs.length > 0)
        ? config.crabs
        : Array.from({ length: 8 }, (_, i) => ({
            relX: Math.cos((i / 8) * Math.PI * 2) * 2.8,
            relZ: Math.sin((i / 8) * Math.PI * 2) * 2.8,
            neonColorIndex: i % 4,
            groovePhase: i * 0.4,
        }));

    crabs.forEach((crabData, i) => {
        const crabGroup = new THREE.Group();
        crabGroup.position.set(crabData.relX, 0.5, crabData.relZ);

        const neonMat = new THREE.MeshStandardMaterial({
            color: neonColors[crabData.neonColorIndex % neonColors.length],
            roughness: 0.3,
            metalness: 0.4,
            emissive: new THREE.Color(neonColors[crabData.neonColorIndex % neonColors.length]),
            emissiveIntensity: 0.35,
        });

        // Crab Carapace
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), neonMat);
        shell.scale.set(1.4, 0.6, 1.0);
        crabGroup.add(shell);

        // Left & Right Claws / Pincers
        const pincerL = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), neonMat);
        pincerL.scale.set(1.5, 0.8, 0.8);
        pincerL.position.set(-0.65, 0.25, 0.4);
        const pincerR = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), neonMat);
        pincerR.scale.set(1.5, 0.8, 0.8);
        pincerR.position.set(0.65, 0.25, 0.4);
        crabGroup.add(pincerL, pincerR);

        // Eyestalks
        const eyeL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6), neonMat);
        eyeL.position.set(-0.2, 0.3, 0.3);
        const eyeR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6), neonMat);
        eyeR.position.set(0.2, 0.3, 0.3);
        crabGroup.add(eyeL, eyeR);

        group.add(crabGroup);
        crabMeshes.push({
            group: crabGroup,
            pincerL,
            pincerR,
            phase: crabData.groovePhase || i * 0.4,
        });
    });

    group.userData = {
        type: 'discoCrabRave',
        config,
        discoBall,
        crabMeshes,
    };

    return group;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Dream Events Scene Assembler & Animation Director
// ─────────────────────────────────────────────────────────────────────────────

export function buildDreamEventsGroup(THREE, encounters) {
    const root = new THREE.Group();
    root.name = 'dreamEvents';

    const capybaraMeshes = [];
    const swanMeshes = [];
    const stampedeMeshes = [];
    const cartMeshes = [];
    const crabMeshes = [];

    for (const enc of encounters) {
        switch (enc.type) {
            case 'capybara-hottub-barge':
            case 'capybara_tub': {
                const m = createCapybaraBargeMesh(THREE, enc);
                root.add(m);
                capybaraMeshes.push(m);
                break;
            }
            case 'bureaucratic-swan-boat':
            case 'bureaucratic_swan': {
                const m = createBureaucraticSwanMesh(THREE, enc);
                root.add(m);
                swanMeshes.push(m);
                break;
            }
            case 'rubber-ducky-stampede':
            case 'rubber_ducky_stampede': {
                const m = createStampedeGroup(THREE, enc);
                root.add(m);
                stampedeMeshes.push(m);
                break;
            }
            case 'ghost-shopping-cart':
            case 'ghost_cart': {
                const m = createGhostShoppingCartMesh(THREE, enc);
                root.add(m);
                cartMeshes.push(m);
                break;
            }
            case 'disco-crab-rave-island':
            case 'disco_crab_rave': {
                const m = createDiscoCrabRaveMesh(THREE, enc);
                root.add(m);
                crabMeshes.push(m);
                break;
            }
            default:
                break;
        }
    }

    return {
        root,
        capybaraMeshes,
        swanMeshes,
        stampedeMeshes,
        cartMeshes,
        crabMeshes,
    };
}

export function animateDreamEvents(handle, timeSec = 0, dt = 0.016) {
    if (!handle) return;

    // 1. Animate Capybaras (gentle soaking bob and rotating aura)
    for (const bMesh of handle.capybaraMeshes || []) {
        for (const capy of bMesh.userData.capybaraModels || []) {
            capy.model.position.y = capy.initialY + Math.sin(timeSec * 2.0 + capy.index) * 0.04;
            capy.model.rotation.y = Math.sin(timeSec * 0.8 + capy.index) * 0.15;
        }
        if (bMesh.userData.auraRing) {
            bMesh.userData.auraRing.rotation.z = timeSec * 0.5;
        }
    }

    // 2. Animate Swan Boat (pedal bob and neck sway)
    for (const sMesh of handle.swanMeshes || []) {
        sMesh.position.y = 0.25 + Math.sin(timeSec * 3.0) * 0.05;
        sMesh.rotation.z = Math.sin(timeSec * 2.2) * 0.03;
        if (sMesh.userData.neck) {
            sMesh.userData.neck.rotation.x = 0.35 + Math.sin(timeSec * 4.0) * 0.08;
        }
        if (sMesh.userData.config?.state === 'smashed') {
            if (sMesh.userData.booth) sMesh.userData.booth.visible = false;
            if (sMesh.userData.pinataGroup) sMesh.userData.pinataGroup.visible = false;
        }
    }

    // 3. Animate Stampede Ducks (bobbing on rapids)
    for (const stGroup of handle.stampedeMeshes || []) {
        for (const dMesh of stGroup.userData.duckMeshes || []) {
            const d = dMesh.userData.duckData;
            if (d) {
                dMesh.position.z = d.z ?? 0;
                dMesh.position.y = d.y ?? 0.3;
                dMesh.rotation.x = Math.sin(timeSec * (d.bobSpeed || 3.0)) * 0.12;
            }
        }
    }

    // 4. Animate Ghost Shopping Cart (ethereal glow wobble, spin wheels)
    for (const cMesh of handle.cartMeshes || []) {
        const cfg = cMesh.userData.config;
        if (cfg?.exploded) {
            cMesh.visible = false;
            continue;
        }
        cMesh.rotation.y = Math.sin(timeSec * 5.0) * 0.05;
        cMesh.position.y = 0.3 + Math.sin(timeSec * 6.0) * 0.06;
    }

    // 5. Animate Disco Crab Rave (spinning mirror ball, crabs rave dancing side-to-side)
    for (const crMesh of handle.crabMeshes || []) {
        if (crMesh.userData.discoBall) {
            crMesh.userData.discoBall.rotation.y = timeSec * 2.5;
        }
        for (const crab of crMesh.userData.crabMeshes || []) {
            // Side-to-side crab dance step
            const dance = Math.sin(timeSec * 8.0 + crab.phase);
            crab.group.position.y = 0.5 + Math.abs(dance) * 0.12;
            crab.group.rotation.y = dance * 0.3;
            // Snapping pincers
            if (crab.pincerL && crab.pincerR) {
                crab.pincerL.position.y = 0.25 + dance * 0.08;
                crab.pincerR.position.y = 0.25 - dance * 0.08;
            }
        }
    }
}
