/**
 * Don't Sink, Don't Die — Articulated Three.js Crew Class Character & Cosmetic Rig Builder
 * Builds procedural AAA-style character rigs with custom cosmetics for the 4 playable crew classes:
 * - Helmsman: Captain tricorn hat, naval trenchcoat, compass & current gauge, cravat
 * - Bruiser: Viking horned helmet, dual shoulder pauldrons, spiked bracers, broader heavy frame
 * - Tinkerer: Steampunk brass welding goggles, articulated backpack crane & boiler, utility toolbelt
 * - Mystic: Shadow monk cowl / hood, glowing rune talisman / amulet, spirit lantern, monastic sash
 */

import { getCrewClass } from '../../../shared/crew-classes.js';

/**
 * Creates an articulated character mesh rig configured for a specific crew class.
 *
 * @param {object} THREE - Three.js namespace / mock object.
 * @param {string} classId - Class identifier ('helmsman', 'bruiser', 'tinkerer', 'mystic').
 * @param {object} [options] - Customization options.
 * @param {number} [options.playerColor] - Optional base player shirt/team color override.
 * @param {number} [options.scale=1.0] - Overall rig scale factor.
 * @returns {object} Rig containing root group, body parts, cosmetics, and update methods.
 */
export function createCrewClassMesh(THREE, classId = 'helmsman', options = {}) {
    const cls = getCrewClass(classId);
    const outfit = cls.outfit;

    const root = new THREE.Group();
    root.name = `CrewClassRig_${cls.id}`;

    // Base materials (using Standard or Basic depending on what's available)
    const createMaterial = (params, basicOnly = false) => {
        if (!basicOnly && THREE.MeshStandardMaterial) {
            return new THREE.MeshStandardMaterial(params);
        }
        return new THREE.MeshBasicMaterial ? new THREE.MeshBasicMaterial(params) : params;
    };

    const skinMat = createMaterial({ color: 0xf4c29f, roughness: 0.65 });
    const primaryMat = createMaterial({
        color: options.playerColor ?? outfit.primaryColor,
        roughness: 0.55,
    });
    const secondaryMat = createMaterial({
        color: outfit.secondaryColor,
        roughness: 0.45,
        metalness: 0.35,
    });
    const accentMat = createMaterial({
        color: outfit.accentColor,
        roughness: 0.4,
    });
    const leatherMat = createMaterial({
        color: outfit.leatherColor,
        roughness: 0.8,
    });
    const darkMat = createMaterial({
        color: 0x1f2937,
        roughness: 0.7,
    });
    const glowMat = createMaterial({
        color: outfit.secondaryColor,
        transparent: true,
        opacity: 0.9,
    }, true);

    // Dynamic sizing based on class morphology
    const isBruiser = cls.id === 'bruiser';
    const isTinkerer = cls.id === 'tinkerer';
    const isMystic = cls.id === 'mystic';
    const isHelmsman = cls.id === 'helmsman';

    const torsoWidth = isBruiser ? 0.92 : 0.74;
    const torsoHeight = isBruiser ? 0.88 : 0.82;
    const torsoDepth = isBruiser ? 0.54 : 0.44;
    const armRadius = isBruiser ? 0.14 : 0.11;

    // --- Core Articulated Skeletal Hierarchy ---
    const pelvis = new THREE.Group();
    pelvis.name = 'pelvis';
    pelvis.position.y = 0.5;
    root.add(pelvis);

    // Legs
    const leftLeg = new THREE.Group();
    leftLeg.name = 'leftLeg';
    leftLeg.position.set(isBruiser ? -0.28 : -0.22, 0, 0);
    const rightLeg = new THREE.Group();
    rightLeg.name = 'rightLeg';
    rightLeg.position.set(isBruiser ? 0.28 : 0.22, 0, 0);

    const legGeo = new THREE.CapsuleGeometry
        ? new THREE.CapsuleGeometry(isBruiser ? 0.16 : 0.14, 0.42, 4, 8)
        : new THREE.CylinderGeometry(isBruiser ? 0.16 : 0.14, isBruiser ? 0.16 : 0.14, 0.42, 8);
    const leftLegMesh = new THREE.Mesh(legGeo, darkMat);
    leftLegMesh.position.y = -0.21;
    leftLeg.add(leftLegMesh);

    const rightLegMesh = new THREE.Mesh(legGeo, darkMat);
    rightLegMesh.position.y = -0.21;
    rightLeg.add(rightLegMesh);

    // Boots
    const bootGeo = new THREE.BoxGeometry(0.18, 0.18, 0.28);
    const leftBoot = new THREE.Mesh(bootGeo, leatherMat);
    leftBoot.position.set(0, -0.42, 0.05);
    leftLeg.add(leftBoot);

    const rightBoot = new THREE.Mesh(bootGeo, leatherMat);
    rightBoot.position.set(0, -0.42, 0.05);
    rightLeg.add(rightBoot);

    pelvis.add(leftLeg, rightLeg);

    // Spine / Torso
    const spine = new THREE.Group();
    spine.name = 'spine';
    spine.position.y = 0.1;
    pelvis.add(spine);

    const torsoMesh = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth),
        primaryMat
    );
    torsoMesh.position.y = torsoHeight * 0.5;
    torsoMesh.castShadow = true;
    spine.add(torsoMesh);

    // Belt / Sash
    const beltMesh = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth * 1.05, 0.12, torsoDepth * 1.08),
        leatherMat
    );
    beltMesh.position.y = 0.06;
    spine.add(beltMesh);

    // Chest & Shoulders
    const chest = new THREE.Group();
    chest.name = 'chest';
    chest.position.y = torsoHeight;
    spine.add(chest);

    // Neck & Head
    const neck = new THREE.Group();
    neck.name = 'neck';
    neck.position.y = 0.05;
    chest.add(neck);

    const headGroup = new THREE.Group();
    headGroup.name = 'headGroup';
    headGroup.position.y = 0.32;
    neck.add(headGroup);

    const headMesh = new THREE.Mesh(
        new THREE.SphereGeometry(isBruiser ? 0.35 : 0.32, 12, 12),
        skinMat
    );
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Arms
    const armGeo = new THREE.CapsuleGeometry
        ? new THREE.CapsuleGeometry(armRadius, 0.50, 4, 8)
        : new THREE.CylinderGeometry(armRadius, armRadius, 0.50, 8);

    const leftArm = new THREE.Group();
    leftArm.name = 'leftArm';
    leftArm.position.set(-(torsoWidth * 0.5 + armRadius + 0.05), -0.05, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, primaryMat);
    leftArmMesh.position.y = -0.25;
    leftArm.add(leftArmMesh);
    chest.add(leftArm);

    const rightArm = new THREE.Group();
    rightArm.name = 'rightArm';
    rightArm.position.set(torsoWidth * 0.5 + armRadius + 0.05, -0.05, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, primaryMat);
    rightArmMesh.position.y = -0.25;
    rightArm.add(rightArmMesh);
    chest.add(rightArm);

    // Hands
    const handGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const leftHand = new THREE.Mesh(handGeo, skinMat);
    leftHand.position.y = -0.52;
    leftArm.add(leftHand);

    const rightHand = new THREE.Mesh(handGeo, skinMat);
    rightHand.position.y = -0.52;
    rightArm.add(rightHand);

    // --- Class-Specific Cosmetic Rigging ---
    const cosmeticParts = {};

    if (isHelmsman) {
        // 1. Captain Tricorn Hat
        const hatGroup = new THREE.Group();
        hatGroup.name = 'captainTricorn';
        hatGroup.position.set(0, 0.28, 0);

        // Crown
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.22, 10), primaryMat);
        hatGroup.add(crown);

        // 3-cornered curved brim (approximated with triangular/prism angled pieces)
        const brimMat = primaryMat;
        const trimMat = secondaryMat; // Gold captain braid
        const brimBase = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 12), brimMat);
        hatGroup.add(brimBase);

        for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2) / 3;
            const flap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.06), brimMat);
            flap.position.set(Math.sin(angle) * 0.36, 0.12, Math.cos(angle) * 0.36);
            flap.rotation.y = angle;
            flap.rotation.x = -0.35;
            hatGroup.add(flap);

            // Gold trim line
            const trim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.07), trimMat);
            trim.position.set(Math.sin(angle) * 0.38, 0.24, Math.cos(angle) * 0.38);
            trim.rotation.y = angle;
            trim.rotation.x = -0.35;
            hatGroup.add(trim);
        }

        // Feather plume
        const plume = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), accentMat);
        plume.position.set(-0.25, 0.26, 0.1);
        plume.rotation.z = -0.4;
        hatGroup.add(plume);
        headGroup.add(hatGroup);
        cosmeticParts.hat = hatGroup;

        // 2. Naval Trenchcoat (skirt / flaps extending down from torso)
        const coatGroup = new THREE.Group();
        coatGroup.name = 'navalTrenchcoat';
        const coatFlapLeft = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.65, 0.48), primaryMat);
        coatFlapLeft.position.set(-0.22, -0.32, 0);
        const coatFlapRight = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.65, 0.48), primaryMat);
        coatFlapRight.position.set(0.22, -0.32, 0);
        const coatBack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.70, 0.12), primaryMat);
        coatBack.position.set(0, -0.34, 0.24);

        // Gold naval buttons
        for (let b = 0; b < 3; b++) {
            const btnLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), secondaryMat);
            btnLeft.rotation.x = Math.PI / 2;
            btnLeft.position.set(-0.14, 0.25 + b * 0.18, -torsoDepth * 0.5 - 0.02);
            const btnRight = btnLeft.clone ? btnLeft.clone() : new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), secondaryMat);
            btnRight.position.set(0.14, 0.25 + b * 0.18, -torsoDepth * 0.5 - 0.02);
            spine.add(btnLeft, btnRight);
        }

        coatGroup.add(coatFlapLeft, coatFlapRight, coatBack);
        spine.add(coatGroup);
        cosmeticParts.coat = coatGroup;

        // 3. Cravat & Shoulder Epaulets
        const cravat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.30, 0.08), accentMat);
        cravat.position.set(0, torsoHeight * 0.85, -torsoDepth * 0.52);
        spine.add(cravat);

        for (const sx of [-1, 1]) {
            const epaulet = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.26), secondaryMat);
            epaulet.position.set(sx * (torsoWidth * 0.5), torsoHeight + 0.02, 0);
            chest.add(epaulet);
        }

        // 4. Brass Nautical Compass / Current Gauge on hip
        const compass = new THREE.Group();
        compass.name = 'compassGauge';
        const compassCasing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10), secondaryMat);
        compassCasing.rotation.z = Math.PI / 2;
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 8), accentMat);
        dial.rotation.z = Math.PI / 2;
        compass.add(compassCasing, dial);
        compass.position.set(torsoWidth * 0.54, 0.08, -0.05);
        spine.add(compass);
        cosmeticParts.accessory = compass;
    }

    if (isBruiser) {
        // 1. Viking Horned Helmet
        const helmGroup = new THREE.Group();
        helmGroup.name = 'vikingHornedHelm';
        helmGroup.position.set(0, 0.24, 0);

        const capDome = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), secondaryMat);
        capDome.scale.set(1.0, 0.85, 1.05);
        helmGroup.add(capDome);

        const browBand = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.09, 12), leatherMat);
        browBand.position.y = -0.08;
        helmGroup.add(browBand);

        // Nose guard
        const noseGuard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.06), secondaryMat);
        noseGuard.position.set(0, -0.16, -0.38);
        helmGroup.add(noseGuard);

        // Left & Right Curved Horns
        for (const side of [-1, 1]) {
            const hornGroup = new THREE.Group();
            hornGroup.position.set(side * 0.36, 0.05, 0);

            const hornBase = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 8), accentMat);
            hornBase.rotation.z = side * -0.7;
            hornBase.rotation.x = -0.2;
            hornBase.position.set(side * 0.12, 0.14, 0);

            const hornTip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 6), accentMat);
            hornTip.rotation.z = side * -1.25;
            hornTip.rotation.x = -0.35;
            hornTip.position.set(side * 0.32, 0.32, 0.05);

            hornGroup.add(hornBase, hornTip);
            helmGroup.add(hornGroup);
        }
        headGroup.add(helmGroup);
        cosmeticParts.hat = helmGroup;

        // 2. Heavy Forged Iron Shoulder Pauldrons
        const pauldronLeft = new THREE.Group();
        pauldronLeft.name = 'pauldronLeft';
        pauldronLeft.position.set(-(torsoWidth * 0.5 + 0.12), torsoHeight + 0.05, 0);

        const pDomeL = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), secondaryMat);
        pDomeL.scale.set(1.1, 0.8, 1.2);
        const pSpikeL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 6), secondaryMat);
        pSpikeL.position.set(0, 0.22, 0);
        pauldronLeft.add(pDomeL, pSpikeL);
        chest.add(pauldronLeft);

        const pauldronRight = new THREE.Group();
        pauldronRight.name = 'pauldronRight';
        pauldronRight.position.set(torsoWidth * 0.5 + 0.12, torsoHeight + 0.05, 0);

        const pDomeR = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), secondaryMat);
        pDomeR.scale.set(1.1, 0.8, 1.2);
        const pSpikeR = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 6), secondaryMat);
        pSpikeR.position.set(0, 0.22, 0);
        pauldronRight.add(pDomeR, pSpikeR);
        chest.add(pauldronRight);

        cosmeticParts.pauldrons = [pauldronLeft, pauldronRight];

        // 3. Spiked Bracers on Forearms
        const bracerGeo = new THREE.CylinderGeometry(0.18, 0.19, 0.22, 8);
        const bracerL = new THREE.Mesh(bracerGeo, leatherMat);
        bracerL.position.y = -0.35;
        leftArm.add(bracerL);

        const bracerR = new THREE.Mesh(bracerGeo, leatherMat);
        bracerR.position.y = -0.35;
        rightArm.add(bracerR);

        // 4. Fur Trim Mantle
        const furMantle = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.12, 6, 12), accentMat);
        furMantle.rotation.x = Math.PI / 2;
        furMantle.position.y = torsoHeight - 0.02;
        spine.add(furMantle);
        cosmeticParts.coat = furMantle;
    }

    if (isTinkerer) {
        // 1. Brass Steampunk Welding Goggles
        const gogglesGroup = new THREE.Group();
        gogglesGroup.name = 'steampunkBrassGoggles';
        gogglesGroup.position.set(0, 0.04, -0.28);

        const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12), leatherMat);
        strap.position.set(0, 0, 0.24);
        gogglesGroup.add(strap);

        for (const side of [-1, 1]) {
            const eyeCup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.16, 10), secondaryMat);
            eyeCup.rotation.x = Math.PI / 2;
            eyeCup.position.set(side * 0.16, 0, 0);

            const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 8), accentMat);
            lens.rotation.x = Math.PI / 2;
            lens.position.set(side * 0.16, 0, 0.01);

            gogglesGroup.add(eyeCup, lens);
        }
        headGroup.add(gogglesGroup);
        cosmeticParts.hat = gogglesGroup;

        // 2. Articulated Backpack Crane & Steam Boiler
        const packGroup = new THREE.Group();
        packGroup.name = 'backpackCrane';
        packGroup.position.set(0, torsoHeight * 0.55, torsoDepth * 0.5 + 0.16);

        // Boiler Tank
        const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.65, 10), secondaryMat);
        packGroup.add(boiler);

        // Exhaust pipe
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.38, 6), darkMat);
        exhaust.position.set(0.14, 0.42, 0);
        packGroup.add(exhaust);

        // Articulated Crane Arm
        const craneBase = new THREE.Group();
        craneBase.position.set(-0.14, 0.32, 0);

        const boom1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), secondaryMat);
        boom1.position.y = 0.26;
        boom1.rotation.z = -0.3;
        craneBase.add(boom1);

        const boom2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), secondaryMat);
        boom2.position.set(-0.16, 0.52, -0.15);
        boom2.rotation.x = -0.55;
        craneBase.add(boom2);

        // Winch hook / cable
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 8), darkMat);
        hook.position.set(-0.16, 0.28, -0.32);
        craneBase.add(hook);

        packGroup.add(craneBase);
        spine.add(packGroup);
        cosmeticParts.backpack = packGroup;
        cosmeticParts.craneBase = craneBase;

        // 3. Work Apron & Toolbelt with Wrench
        const apron = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.06), leatherMat);
        apron.position.set(0, torsoHeight * 0.42, -torsoDepth * 0.5 - 0.03);
        spine.add(apron);

        const tool = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.08), secondaryMat);
        tool.position.set(-torsoWidth * 0.52, 0.15, 0);
        tool.rotation.z = 0.3;
        spine.add(tool);
        cosmeticParts.accessory = tool;
    }

    if (isMystic) {
        // 1. Monk Hood / Cowl
        const cowlGroup = new THREE.Group();
        cowlGroup.name = 'shadowMonkCowl';
        cowlGroup.position.set(0, 0.18, 0);

        const hoodMain = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), primaryMat);
        hoodMain.scale.set(1.05, 1.15, 1.18);
        cowlGroup.add(hoodMain);

        // Dark shadowy face opening
        const cowlInterior = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8), darkMat);
        cowlInterior.position.set(0, -0.06, -0.15);
        cowlGroup.add(cowlInterior);

        // Glowing spiritual eyes inside hood
        for (const sx of [-0.10, 0.10]) {
            const eyeMote = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), secondaryMat);
            eyeMote.position.set(sx, -0.04, -0.32);
            cowlGroup.add(eyeMote);
        }

        headGroup.add(cowlGroup);
        cosmeticParts.hat = cowlGroup;

        // 2. Flowing Monastic Vestments / Cloak Mantle
        const robeMantle = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.55, 10), primaryMat);
        robeMantle.position.y = torsoHeight * 0.72;
        spine.add(robeMantle);

        const robeSkirt = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.85, 10), primaryMat);
        robeSkirt.position.y = -0.35;
        pelvis.add(robeSkirt);
        cosmeticParts.coat = robeSkirt;

        // 3. Glowing Emerald Rune Talisman / Amulet
        const talismanGroup = new THREE.Group();
        talismanGroup.name = 'runeTalisman';
        talismanGroup.position.set(0, torsoHeight * 0.68, -torsoDepth * 0.55);

        const cord = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 12), leatherMat);
        cord.rotation.x = 0.4;
        talismanGroup.add(cord);

        const amuletGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), secondaryMat);
        amuletGem.position.y = -0.16;
        talismanGroup.add(amuletGem);

        spine.add(talismanGroup);
        cosmeticParts.talisman = talismanGroup;

        // 4. Dangling Spirit Lantern at hip
        const lanternGroup = new THREE.Group();
        lanternGroup.name = 'spiritLantern';
        lanternGroup.position.set(torsoWidth * 0.56, 0.05, 0);

        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), darkMat);
        chain.position.y = 0.08;
        lanternGroup.add(chain);

        const lanternBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.18), darkMat);
        lanternBody.position.y = -0.12;
        lanternGroup.add(lanternBody);

        const lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), secondaryMat);
        lanternCore.position.y = -0.12;
        lanternGroup.add(lanternCore);

        spine.add(lanternGroup);
        cosmeticParts.accessory = lanternGroup;
    }

    // Apply scaling if requested
    if (options.scale && options.scale !== 1.0) {
        root.scale.set(options.scale, options.scale, options.scale);
    }

    // --- Dynamic Animation & Rig State Manager ---
    const rigState = {
        classId: cls.id,
        isRowing: false,
        isSwinging: false,
        isBlocking: false,
        isJumping: false,
        rowPhase: 0,
        swingPhase: 0,
        time: 0,
    };

    /**
     * Updates rig posture, limbs, and cosmetic props during runtime.
     *
     * @param {number} dt - Frame delta time in seconds.
     * @param {object} animState - Controller state ({ speed, turn, airborne, swing, block, etc. }).
     */
    function update(dt = 0.016, animState = {}) {
        rigState.time += dt;
        const t = rigState.time;

        const isAirborne = !!animState.airborne;
        const isBlocking = !!animState.block;
        const swing = animState.swing || 0;
        const speed = animState.speed || 0;
        const turn = animState.turn || 0;

        // Reset base transforms
        leftArm.rotation.set(0, 0, 0);
        rightArm.rotation.set(0, 0, 0);
        leftLeg.rotation.set(0, 0, 0);
        rightLeg.rotation.set(0, 0, 0);
        spine.rotation.set(0, 0, 0);
        headGroup.rotation.set(0, 0, 0);

        if (isBlocking) {
            // Guard stance: cross arms in front of chest
            leftArm.rotation.x = 1.35;
            leftArm.rotation.y = 0.65;
            leftArm.rotation.z = 0.45;

            rightArm.rotation.x = 1.35;
            rightArm.rotation.y = -0.65;
            rightArm.rotation.z = -0.45;

            spine.position.y = 0.04;
            spine.rotation.x = 0.15;
            headGroup.rotation.x = -0.1;
        } else if (swing > 0.01) {
            // Melee attack: forward lunge & weapon swing
            const swingArc = cls.perks.swingArcMultiplier;
            const swingProgress = Math.sin(swing * Math.PI);

            rightArm.rotation.x = -0.8 + swingProgress * 2.2 * swingArc;
            rightArm.rotation.y = -0.4 + swingProgress * 0.8;
            leftArm.rotation.x = 0.4 - swingProgress * 0.8;

            spine.rotation.y = -swingProgress * 0.6 * swingArc;
            spine.rotation.x = swingProgress * 0.2;
        } else if (isAirborne) {
            // Jump tuck pose
            leftLeg.rotation.x = -0.7;
            rightLeg.rotation.x = -0.7;
            leftArm.rotation.x = -0.5;
            leftArm.rotation.z = 0.6;
            rightArm.rotation.x = -0.5;
            rightArm.rotation.z = -0.6;
        } else {
            // Idle / paddling rowing cycle
            const paddleFreq = Math.max(2.0, speed * 0.4);
            const rowPhase = (animState.rowPhase ?? t * paddleFreq);
            const rowStroke = Math.sin(rowPhase);

            leftArm.rotation.x = 0.35 + rowStroke * 0.4;
            rightArm.rotation.x = 0.45 - rowStroke * 0.4;

            // Subtle body sway with turn rate & paddle stroke
            spine.rotation.z = -turn * 0.12;
            spine.rotation.y = rowStroke * 0.08;
            headGroup.rotation.y = turn * 0.18;
        }

        // Cosmetic props dynamic idle oscillation
        if (isTinkerer && cosmeticParts.craneBase) {
            cosmeticParts.craneBase.rotation.y = Math.sin(t * 1.5) * 0.15;
        }
        if (isMystic && cosmeticParts.talisman) {
            cosmeticParts.talisman.position.y = (torsoHeight * 0.68) + Math.sin(t * 3.0) * 0.03;
        }
        if (isMystic && cosmeticParts.accessory) {
            cosmeticParts.accessory.rotation.z = Math.sin(t * 2.5) * 0.12;
        }
        if (isHelmsman && cosmeticParts.accessory) {
            cosmeticParts.accessory.rotation.x = Math.sin(t * 1.2) * 0.08;
        }
    }

    return {
        root,
        classId: cls.id,
        className: cls.name,
        outfit,
        perks: cls.perks,
        bones: {
            pelvis,
            spine,
            chest,
            neck,
            headGroup,
            leftArm,
            rightArm,
            leftLeg,
            rightLeg,
        },
        cosmetics: cosmeticParts,
        materials: {
            skin: skinMat,
            primary: primaryMat,
            secondary: secondaryMat,
            accent: accentMat,
            leather: leatherMat,
            dark: darkMat,
            glow: glowMat,
        },
        update,
        state: rigState,
    };
}

/**
 * Builds a distinct 3D procedural Silly Hat mesh for the 6 selectable lobby hats:
 * - 'captain_tricorn'
 * - 'viking_horns'
 * - 'traffic_cone'
 * - 'giant_frog_hat'
 * - 'wizard_beard'
 * - 'disco_afro'
 */
export function createSillyHatMesh(THREE, hatId = 'captain_tricorn') {
    const cleanId = (hatId || 'captain_tricorn').toLowerCase().trim();
    const mkMat = (params) => (THREE.MeshStandardMaterial ? new THREE.MeshStandardMaterial(params) : new THREE.MeshBasicMaterial(params));

    const group = new THREE.Group();
    group.name = `SillyHat_${cleanId}`;
    group.position.set(0, 0.26, 0);

    if (cleanId === 'traffic_cone') {
        const orangeMat = mkMat({ color: 0xf97316, roughness: 0.45 });
        const whiteMat = mkMat({ color: 0xffffff, emissive: 0xe2e8f0, emissiveIntensity: 0.25, roughness: 0.3 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.68), orangeMat);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.78, 12), orangeMat);
        cone.position.y = 0.42;
        const stripe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 12), whiteMat);
        stripe1.position.y = 0.32;
        const stripe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 0.10, 12), whiteMat);
        stripe2.position.y = 0.56;
        group.add(base, cone, stripe1, stripe2);
        return group;
    }

    if (cleanId === 'giant_frog_hat') {
        const frogGreen = mkMat({ color: 0x22c55e, roughness: 0.5 });
        const bellyYellow = mkMat({ color: 0xfef08a, roughness: 0.6 });
        const whiteEye = mkMat({ color: 0xffffff, roughness: 0.2 });
        const pupilDark = mkMat({ color: 0x0f172a, roughness: 0.2 });

        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), frogGreen);
        dome.scale.set(1.15, 0.78, 1.12);
        dome.position.y = 0.06;
        const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.42, 0.08, 12), bellyYellow);
        lip.position.y = -0.06;
        group.add(dome, lip);

        for (const sx of [-0.22, 0.22]) {
            const eyeStalk = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), frogGreen);
            eyeStalk.position.set(sx, 0.30, -0.10);
            const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), whiteEye);
            eyeball.position.set(sx, 0.32, -0.20);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), pupilDark);
            pupil.position.set(sx, 0.32, -0.29);
            group.add(eyeStalk, eyeball, pupil);
        }
        return group;
    }

    if (cleanId === 'wizard_beard') {
        const indigoMat = mkMat({ color: 0x4338ca, roughness: 0.5 });
        const goldStarMat = mkMat({ color: 0xfacc15, emissive: 0xd97706, emissiveIntensity: 0.3, roughness: 0.3 });
        const silverBeardMat = mkMat({ color: 0xe2e8f0, roughness: 0.75 });

        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 14), indigoMat);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.09, 12), goldStarMat);
        band.position.y = 0.06;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 12), indigoMat);
        cone.position.set(0, 0.48, 0.04);
        cone.rotation.x = -0.15;

        const beardTop = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 8), silverBeardMat);
        beardTop.rotation.x = Math.PI;
        beardTop.position.set(0, -0.46, -0.28);
        const mustacheL = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.05, 0.22, 4, 6) : new THREE.BoxGeometry(0.24, 0.08, 0.08), silverBeardMat);
        mustacheL.position.set(-0.12, -0.24, -0.32);
        mustacheL.rotation.z = 0.35;
        const mustacheR = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.05, 0.22, 4, 6) : new THREE.BoxGeometry(0.24, 0.08, 0.08), silverBeardMat);
        mustacheR.position.set(0.12, -0.24, -0.32);
        mustacheR.rotation.z = -0.35;

        group.add(brim, band, cone, beardTop, mustacheL, mustacheR);
        return group;
    }

    if (cleanId === 'disco_afro') {
        const afroMat = mkMat({ color: 0x18181b, roughness: 0.85 });
        const goldPickMat = mkMat({ color: 0xfacc15, metalness: 0.7, roughness: 0.25 });
        const mainPuff = new THREE.Mesh(new THREE.SphereGeometry(0.54, 14, 12), afroMat);
        mainPuff.position.set(0, 0.16, 0.02);
        group.add(mainPuff);

        const offsets = [
            [-0.28, 0.18, 0], [0.28, 0.18, 0], [0, 0.34, 0], [0, 0.16, 0.26],
        ];
        for (const [ox, oy, oz] of offsets) {
            const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), afroMat);
            lobe.position.set(ox, oy, oz);
            group.add(lobe);
        }
        const pickHandle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.04), goldPickMat);
        pickHandle.position.set(0.48, 0.36, 0);
        pickHandle.rotation.z = -0.45;
        group.add(pickHandle);
        return group;
    }

    if (cleanId === 'viking_horns') {
        const bruiserRig = createCrewClassMesh(THREE, 'bruiser');
        if (bruiserRig.cosmetics.hat) {
            bruiserRig.cosmetics.hat.parent?.remove(bruiserRig.cosmetics.hat);
            return bruiserRig.cosmetics.hat;
        }
    }

    const helmsmanRig = createCrewClassMesh(THREE, 'helmsman');
    if (helmsmanRig.cosmetics.hat) {
        helmsmanRig.cosmetics.hat.parent?.remove(helmsmanRig.cosmetics.hat);
        return helmsmanRig.cosmetics.hat;
    }
    return group;
}
