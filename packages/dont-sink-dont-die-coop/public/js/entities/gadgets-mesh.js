// Three.js Articulated Raft Gadget & Turret Mesh Builder
// Builds polished, articulated 3D models and procedural animations for:
// - Harpoon Ballista (auto-aiming swivel cradle, bow limbs, winch spool, loaded bolt, tether line)
// - Arcane Shockwave Bell (bronze filigree bell, gantry, swinging clapper, expanding rune dome ring)
// - Twin Nitro Hydro-Jets (copper/brass casks, vector nozzles, pressure gauges, animated flame/hydro exhaust)
// - Clockwork Pelican Lantern (articulated companion bird with flapping wings, nodding beak, and glowing cage lantern)
//
// Zero external asset dependencies.

import { GADGET_TYPES } from '../../../shared/raft-gadgets.js';

/**
 * Creates the Harpoon Ballista mesh hierarchy.
 * Mounted at the bow of the raft.
 */
export function createHarpoonMesh(THREE, customMaterials = {}) {
    const group = new THREE.Group();
    group.name = 'RaftGadget_Harpoon';

    const brassMat = customMaterials.brass || new THREE.MeshStandardMaterial({
        color: 0xc8963e,
        metalness: 0.8,
        roughness: 0.3,
    });
    const ironMat = customMaterials.iron || new THREE.MeshStandardMaterial({
        color: 0x2e3440,
        metalness: 0.7,
        roughness: 0.4,
    });
    const woodMat = customMaterials.wood || new THREE.MeshStandardMaterial({
        color: 0x5c4033,
        roughness: 0.8,
    });
    const glowingMat = customMaterials.glow || new THREE.MeshBasicMaterial({
        color: 0x38f2ff,
    });

    // 1. Pedestal mount fixed to the bow deck
    const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 0.4, 8),
        ironMat
    );
    pedestal.position.y = 0.2;
    group.add(pedestal);

    // 2. Swivel fork (rotates horizontally for auto-aim yaw)
    const swivel = new THREE.Group();
    swivel.position.y = 0.4;
    group.add(swivel);

    const forkBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.2, 0.12, 8),
        ironMat
    );
    swivel.add(forkBase);

    for (const sx of [-0.14, 0.14]) {
        const prong = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.35, 0.08),
            ironMat
        );
        prong.position.set(sx, 0.2, 0);
        swivel.add(prong);
    }

    // 3. Pitch cradle (elevates and holds the stock/limbs)
    const cradle = new THREE.Group();
    cradle.position.y = 0.32;
    swivel.add(cradle);

    // Main ballista stock / rail
    const stock = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.12, 1.2),
        woodMat
    );
    stock.position.z = -0.25;
    cradle.add(stock);

    // Winch spool under stock
    const spool = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10),
        brassMat
    );
    spool.rotation.z = Math.PI / 2;
    spool.position.set(0, -0.1, 0.1);
    cradle.add(spool);

    // Ballista Prods / Bow Limbs (Left and Right)
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.08, 0.02, -0.6);
    const leftLimb = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.06, 0.05),
        ironMat
    );
    leftLimb.position.x = -0.25;
    leftArm.add(leftLimb);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.08, 0.02, -0.6);
    const rightLimb = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.06, 0.05),
        ironMat
    );
    rightLimb.position.x = 0.25;
    rightArm.add(rightLimb);

    cradle.add(leftArm, rightArm);

    // Loaded Tethered Harpoon Bolt
    const boltGroup = new THREE.Group();
    boltGroup.position.set(0, 0.08, -0.3);

    const boltShaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6),
        ironMat
    );
    boltShaft.rotation.x = Math.PI / 2;

    const boltTip = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.28, 4),
        brassMat
    );
    boltTip.rotation.x = -Math.PI / 2;
    boltTip.position.z = -0.55;

    const boltGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        glowingMat
    );
    boltGlow.position.z = -0.42;

    boltGroup.add(boltShaft, boltTip, boltGlow);
    cradle.add(boltGroup);

    // Tether Line (connecting spool to bolt)
    const tether = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4),
        brassMat
    );
    tether.rotation.x = 0.35;
    tether.position.set(0, 0, -0.1);
    cradle.add(tether);

    return {
        group,
        swivel,
        cradle,
        spool,
        leftArm,
        rightArm,
        boltGroup,
        tether,
        recoilOffset: 0,
    };
}

/**
 * Creates the Arcane Shockwave Bell mesh hierarchy.
 * Mounted at the center deck of the raft.
 */
export function createShieldDomeMesh(THREE, customMaterials = {}) {
    const group = new THREE.Group();
    group.name = 'RaftGadget_ShieldDome';

    const bronzeMat = customMaterials.bronze || new THREE.MeshStandardMaterial({
        color: 0x96694c,
        metalness: 0.75,
        roughness: 0.35,
    });
    const woodMat = customMaterials.wood || new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.85,
    });
    const runeMat = customMaterials.rune || new THREE.MeshBasicMaterial({
        color: 0xffcc00,
        transparent: true,
        opacity: 0.8,
    });
    const shockwaveMat = customMaterials.shockwave || new THREE.MeshBasicMaterial({
        color: 0x64d2ff,
        transparent: true,
        opacity: 0.35,
        wireframe: true,
    });

    // 1. Heavy timber gantry frame
    const gantry = new THREE.Group();
    for (const sx of [-0.35, 0.35]) {
        const upright = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 1.3, 0.12),
            woodMat
        );
        upright.position.set(sx, 0.65, 0);
        gantry.add(upright);
    }
    const topBeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.12, 0.16),
        woodMat
    );
    topBeam.position.set(0, 1.25, 0);
    gantry.add(topBeam);
    group.add(gantry);

    // 2. Hanging pivot & Bronze Filigree Bell
    const bellPivot = new THREE.Group();
    bellPivot.position.set(0, 1.15, 0);

    const bellBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.42, 0.65, 12),
        bronzeMat
    );
    bellBody.position.y = -0.32;

    const bellLip = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.05, 8, 16),
        bronzeMat
    );
    bellLip.rotation.x = Math.PI / 2;
    bellLip.position.y = -0.65;

    // Hanging clapper inside bell
    const clapper = new THREE.Group();
    clapper.position.y = -0.15;
    const clapperRod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6),
        bronzeMat
    );
    clapperRod.position.y = -0.27;
    const clapperBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        runeMat
    );
    clapperBall.position.y = -0.55;
    clapper.add(clapperRod, clapperBall);

    bellPivot.add(bellBody, bellLip, clapper);
    group.add(bellPivot);

    // 3. Expanding Arcane Shockwave Dome / Ring
    const shockwaveMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        shockwaveMat
    );
    shockwaveMesh.position.y = 0.1;
    shockwaveMesh.scale.set(0.001, 0.001, 0.001);
    shockwaveMesh.visible = false;
    group.add(shockwaveMesh);

    return {
        group,
        bellPivot,
        clapper,
        shockwaveMesh,
        swingAngle: 0,
    };
}

/**
 * Creates the Twin Nitro Hydro-Jets mesh hierarchy.
 * Mounted at the stern of the raft.
 */
export function createNitroKegMesh(THREE, customMaterials = {}) {
    const group = new THREE.Group();
    group.name = 'RaftGadget_NitroKeg';

    const copperMat = customMaterials.copper || new THREE.MeshStandardMaterial({
        color: 0xbf5b30,
        metalness: 0.7,
        roughness: 0.35,
    });
    const brassMat = customMaterials.brass || new THREE.MeshStandardMaterial({
        color: 0xcca040,
        metalness: 0.8,
        roughness: 0.25,
    });
    const darkMat = customMaterials.dark || new THREE.MeshStandardMaterial({
        color: 0x1f232a,
        roughness: 0.6,
    });
    const flameMat = customMaterials.flame || new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
    });
    const gaugeNeedleMat = customMaterials.needle || new THREE.MeshBasicMaterial({
        color: 0xef4444,
    });

    // Central mounting bracket
    const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.1, 0.3),
        darkMat
    );
    bracket.position.y = 0.15;
    group.add(bracket);

    const nozzles = [];
    const exhaustJets = [];

    // Twin Casks & Hydro-Jet Nozzles (-X and +X)
    for (const sx of [-0.42, 0.42]) {
        const kegGroup = new THREE.Group();
        kegGroup.position.set(sx, 0.35, 0);

        // Cylindrical pressurized fuel cask
        const keg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.24, 0.65, 12),
            copperMat
        );
        keg.rotation.x = Math.PI / 2;

        // Reinforcing brass hoop bands
        for (const bz of [-0.2, 0.2]) {
            const hoop = new THREE.Mesh(
                new THREE.TorusGeometry(0.245, 0.02, 6, 16),
                brassMat
            );
            hoop.position.z = bz;
            kegGroup.add(hoop);
        }

        // Steampunk Pressure Dial Gauge on top of cask
        const gauge = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10),
            brassMat
        );
        gauge.position.set(0, 0.26, -0.05);

        const needle = new THREE.Mesh(
            new THREE.BoxGeometry(0.015, 0.06, 0.01),
            gaugeNeedleMat
        );
        needle.position.set(0, 0.29, -0.05);
        kegGroup.add(gauge, needle);

        // Vectoring hydro nozzle at rear
        const nozzle = new THREE.Mesh(
            new THREE.ConeGeometry(0.14, 0.35, 8),
            darkMat
        );
        nozzle.rotation.x = -Math.PI / 2;
        nozzle.position.set(0, -0.05, 0.45);
        kegGroup.add(nozzle);
        nozzles.push(nozzle);

        // Animated Hydro/Nitro Flame Exhaust Cone
        const exhaust = new THREE.Mesh(
            new THREE.ConeGeometry(0.16, 0.85, 8),
            flameMat
        );
        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(0, -0.05, 0.95);
        exhaust.visible = false;
        kegGroup.add(exhaust);
        exhaustJets.push(exhaust);

        kegGroup.add(keg);
        group.add(kegGroup);
    }

    return {
        group,
        nozzles,
        exhaustJets,
        gaugeNeedleMat,
        fuelRatio: 1,
    };
}

/**
 * Creates the Clockwork Pelican Lantern companion mesh hierarchy.
 * Hovers alongside the raft.
 */
export function createRepairDroneMesh(THREE, customMaterials = {}) {
    const group = new THREE.Group();
    group.name = 'RaftGadget_RepairDrone';

    const brassMat = customMaterials.brass || new THREE.MeshStandardMaterial({
        color: 0xcca040,
        metalness: 0.8,
        roughness: 0.3,
    });
    const copperMat = customMaterials.copper || new THREE.MeshStandardMaterial({
        color: 0xa0522d,
        metalness: 0.6,
        roughness: 0.5,
    });
    const whiteMat = customMaterials.white || new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        roughness: 0.7,
    });
    const lanternGlowMat = customMaterials.lanternGlow || new THREE.MeshBasicMaterial({
        color: 0x4ade80,
    });
    const eyeMat = customMaterials.eye || new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
    });

    // 1. Clockwork Pelican Body & Rig
    const pelican = new THREE.Group();
    group.add(pelican);

    const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 10, 8),
        whiteMat
    );
    body.scale.set(0.9, 0.8, 1.3);
    pelican.add(body);

    // Mechanical gears on flank
    for (const sx of [-0.26, 0.26]) {
        const gear = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8),
            brassMat
        );
        gear.rotation.z = Math.PI / 2;
        gear.position.set(sx, 0.05, 0);
        pelican.add(gear);
    }

    // Articulated Head & Beak
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.2, -0.32);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 8),
        whiteMat
    );

    // Goggles / Glowing optical eyes
    for (const sx of [-0.09, 0.09]) {
        const eye = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 6, 6),
            eyeMat
        );
        eye.position.set(sx, 0.06, -0.12);
        headPivot.add(eye);
    }

    // Pelican Beak & Deep Gular Pouch
    const upperBeak = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.45, 4),
        brassMat
    );
    upperBeak.rotation.x = -Math.PI / 2;
    upperBeak.position.set(0, -0.02, -0.3);

    const pouch = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 6),
        copperMat
    );
    pouch.scale.set(0.7, 1.2, 1.4);
    pouch.position.set(0, -0.12, -0.22);

    headPivot.add(head, upperBeak, pouch);
    pelican.add(headPivot);

    // Articulated Wings (Left & Right)
    const leftWing = new THREE.Group();
    leftWing.position.set(-0.24, 0.12, 0);
    const leftWingFeathers = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.04, 0.28),
        brassMat
    );
    leftWingFeathers.position.x = -0.26;
    leftWing.add(leftWingFeathers);

    const rightWing = new THREE.Group();
    rightWing.position.set(0.24, 0.12, 0);
    const rightWingFeathers = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.04, 0.28),
        brassMat
    );
    rightWingFeathers.position.x = 0.26;
    rightWing.add(rightWingFeathers);

    pelican.add(leftWing, rightWing);

    // 2. Hanging Lantern Cage suspended from the pelican's talons
    const lanternRig = new THREE.Group();
    lanternRig.position.set(0, -0.32, 0.05);

    const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.22, 4),
        brassMat
    );
    chain.position.y = -0.11;

    const lanternCage = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.12, 0.28, 6),
        copperMat
    );
    lanternCage.position.y = -0.32;

    const lanternCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        lanternGlowMat
    );
    lanternCore.position.y = -0.32;

    lanternRig.add(chain, lanternCage, lanternCore);
    pelican.add(lanternRig);

    // Healing Aura Ring underneath
    const auraRing = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 1.4, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
            color: 0x4ade80,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
        })
    );
    auraRing.position.y = -0.85;
    group.add(auraRing);

    return {
        group,
        pelican,
        headPivot,
        leftWing,
        rightWing,
        lanternRig,
        lanternCore,
        auraRing,
    };
}

/**
 * Procedural animation controller for all 4 gadget meshes.
 */
export function animateRaftGadgets({
    meshes = {},
    gadgetState,
    time = 0,
    dt = 0.016,
}) {
    if (!gadgetState || !gadgetState.installed) return;

    // 1. Animate Harpoon Ballista
    if (meshes.harpoon && gadgetState.installed[GADGET_TYPES.HARPOON]) {
        const hMesh = meshes.harpoon;
        const harpoonState = gadgetState.harpoon;

        // Auto-aim swivel tracking target
        if (harpoonState.targetId !== null) {
            hMesh.swivel.rotation.y = harpoonState.aimAngle || 0;
        } else {
            // Gentle idle scanning
            hMesh.swivel.rotation.y = Math.sin(time * 0.8) * 0.25;
        }

        // Recoil recovery
        if (hMesh.recoilOffset > 0) {
            hMesh.recoilOffset = Math.max(0, hMesh.recoilOffset - dt * 2.5);
            hMesh.cradle.position.z = -hMesh.recoilOffset * 0.15;
        }

        // Spool rotation
        hMesh.spool.rotation.x = time * 3.0;
    }

    // 2. Animate Arcane Shockwave Bell
    if (meshes.shieldDome && gadgetState.installed[GADGET_TYPES.SHIELD_DOME]) {
        const bellMesh = meshes.shieldDome;
        const domeState = gadgetState.shieldDome;

        if (domeState.isShockwaveActive) {
            // Active shockwave expansion
            bellMesh.shockwaveMesh.visible = true;
            const radius = domeState.shockwaveProgress * 10;
            bellMesh.shockwaveMesh.scale.set(radius, radius, radius);
            bellMesh.clapper.rotation.z = Math.sin(time * 24.0) * 0.45;
            bellMesh.bellPivot.rotation.z = Math.sin(time * 20.0) * 0.35;
        } else {
            bellMesh.shockwaveMesh.visible = false;
            // Gentle sway
            bellMesh.bellPivot.rotation.z = Math.sin(time * 1.5) * 0.08;
            bellMesh.clapper.rotation.z = Math.sin(time * 1.5 + 0.3) * 0.06;
        }
    }

    // 3. Animate Twin Nitro Hydro-Jets
    if (meshes.nitroKeg && gadgetState.installed[GADGET_TYPES.NITRO_KEG]) {
        const nitroMesh = meshes.nitroKeg;
        const nitroState = gadgetState.nitroKeg;
        const isBoosting = nitroState.isBoosting && nitroState.fuel > 0;

        for (const jet of nitroMesh.exhaustJets) {
            jet.visible = isBoosting;
            if (isBoosting) {
                // Flame pulsation
                const flicker = 0.85 + Math.sin(time * 30.0) * 0.2;
                jet.scale.set(flicker, 1.0 + Math.cos(time * 25.0) * 0.3, flicker);
            }
        }
    }

    // 4. Animate Clockwork Pelican Companion
    if (meshes.repairDrone && gadgetState.installed[GADGET_TYPES.REPAIR_DRONE]) {
        const droneMesh = meshes.repairDrone;
        const droneState = gadgetState.repairDrone;

        // Wing flapping
        const flap = Math.sin(time * 7.5) * 0.45;
        droneMesh.leftWing.rotation.z = flap;
        droneMesh.rightWing.rotation.z = -flap;

        // Head bobbing & looking around
        droneMesh.headPivot.rotation.x = Math.sin(time * 3.0) * 0.15;
        droneMesh.headPivot.rotation.y = Math.cos(time * 1.8) * 0.25;

        // Lantern swing
        droneMesh.lanternRig.rotation.z = Math.sin(time * 2.2) * 0.12;

        // Healing pulse on aura ring
        if (droneState.beamTargets?.length > 0) {
            droneMesh.auraRing.rotation.z = time * 2.5;
            const pulse = 1.0 + Math.sin(time * 8.0) * 0.18;
            droneMesh.auraRing.scale.set(pulse, pulse, pulse);
        }
    }
}

/**
 * Factory helper: builds and attaches all 4 gadget meshes to a parent raft container.
 */
export function buildRaftGadgetMeshes(THREE, parentRaftGroup, raftDimensions = { w: 3, h: 0.6, d: 4 }) {
    const meshes = {};

    // 1. Bow Harpoon Ballista
    const harpoon = createHarpoonMesh(THREE);
    harpoon.group.position.set(0, raftDimensions.h * 0.5 + 0.15, -raftDimensions.d * 0.48);
    parentRaftGroup.add(harpoon.group);
    meshes.harpoon = harpoon;

    // 2. Arcane Shockwave Bell
    const shieldDome = createShieldDomeMesh(THREE);
    shieldDome.group.position.set(0, raftDimensions.h * 0.5 + 0.15, 0);
    parentRaftGroup.add(shieldDome.group);
    meshes.shieldDome = shieldDome;

    // 3. Twin Nitro Hydro-Jets
    const nitroKeg = createNitroKegMesh(THREE);
    nitroKeg.group.position.set(0, raftDimensions.h * 0.5 + 0.15, raftDimensions.d * 0.48);
    parentRaftGroup.add(nitroKeg.group);
    meshes.nitroKeg = nitroKeg;

    // 4. Clockwork Pelican Companion
    const repairDrone = createRepairDroneMesh(THREE);
    repairDrone.group.position.set(raftDimensions.w * 0.75, 2.0, 0);
    parentRaftGroup.add(repairDrone.group);
    meshes.repairDrone = repairDrone;

    return meshes;
}
