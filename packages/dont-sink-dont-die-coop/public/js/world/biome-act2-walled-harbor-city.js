/**
 * Don't Sink, Don't Die — Act II: Walled Harbor City & Canal District 3D Biome
 * (`public/js/world/biome-act2-walled-harbor-city.js`)
 *
 * Implements a true 3D architectural biome environment for Act II:
 * 1. Grand Stone Harbor Sea-Wall & Bastions with Twin Rotating Beacon Lighthouses at entrance (z = -150).
 * 2. Wide Recessed Calm-Water Marina Bays on both sides (z = -160 to -260):
 *    - Timber docks, piers & pilings.
 *    - Heavy timber crane gantries with pulleys and hanging cargo net crates.
 *    - Merchant market stalls with vibrant striped canvas awnings.
 *    - Stone arch bridges spanning the marina canal inlets.
 *    - Moored cargo barges bobbing and rocking gently in the calm-water basin.
 * 3. Physical Multi-Story Canal Townhouses (2 to 4 stories) with stepped/gabled roofs,
 *    chimneys, and warm glowing lit windows flanking the banks down to zEnd (-700).
 * 4. Smooth 60Hz step animation lifecycle (`stepWalledHarborCityBiome(group, dt, time)`).
 *
 * Zero-dependency pure ES module compatible with Three.js and headless unit test runners.
 */

/**
 * Deterministic pseudo-random number generator (LCG).
 */
function createPrng(seed = 1337) {
    let s = (Math.abs(seed) || 1337) % 2147483647;
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
// 1. Grand Harbor Sea-Wall & Twin Beacon Lighthouses (z = -150)
// ─────────────────────────────────────────────────────────────────────────────

function buildSeaWallAndLighthouses(THREE, options, biomeData) {
    const seaWallGroup = new THREE.Group();
    seaWallGroup.name = 'HarborSeaWallAndBastions';
    const halfWidth = options.riverWidth * 0.5;
    const gateZ = -150;

    const stoneWallMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3b4252,
        roughness: 0.85,
        metalness: 0.15,
    });
    const stoneTrimMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x2e3440,
        roughness: 0.75,
        metalness: 0.2,
    });
    const beaconHousingMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xd08770,
        roughness: 0.4,
        metalness: 0.6,
    });
    const beaconGlassMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x88c0d0,
        emissive: new THREE.Color(0x88c0d0),
        emissiveIntensity: 0.8,
        roughness: 0.1,
    });
    const beamMat = createMat(THREE, 'MeshBasicMaterial', {
        color: 0xeceff4,
        transparent: true,
        opacity: 0.35,
    });

    const lighthouses = [];

    // Twin sea-wall barriers extending outwards from river banks
    const wallHeight = 8.5;
    const wallLength = 70.0;
    const wallThickness = 7.0;

    for (const side of [-1, 1]) {
        const wallX = side * (halfWidth + wallLength * 0.5 + 4.0);
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(wallLength, wallHeight, wallThickness),
            stoneWallMat
        );
        wall.position.set(wallX, wallHeight * 0.5, gateZ);
        wall.castShadow = true;
        wall.receiveShadow = true;
        seaWallGroup.add(wall);

        // Crenellations / parapet battlements along top of wall
        const crenelCount = 8;
        for (let c = 0; c < crenelCount; c++) {
            const cx = wallX - wallLength * 0.45 + (c / (crenelCount - 1)) * (wallLength * 0.9);
            const battlement = new THREE.Mesh(
                new THREE.BoxGeometry(3.2, 1.4, wallThickness * 1.05),
                stoneTrimMat
            );
            battlement.position.set(cx, wallHeight + 0.7, gateZ);
            seaWallGroup.add(battlement);
        }

        // Grand Lighthouse Bastion Tower flanking the entrance channel
        const towerX = side * (halfWidth + 4.5);
        const towerGroup = new THREE.Group();
        towerGroup.name = `HarborLighthouse_${side < 0 ? 'Port' : 'Starboard'}`;
        towerGroup.position.set(towerX, 0, gateZ);

        // Base bastion
        const towerBase = new THREE.Mesh(
            new THREE.CylinderGeometry(4.2, 5.0, 4.0, 12),
            stoneTrimMat
        );
        towerBase.position.y = 2.0;
        towerGroup.add(towerBase);

        // Main cylindrical masonry shaft
        const towerShaft = new THREE.Mesh(
            new THREE.CylinderGeometry(3.2, 3.8, 16.0, 12),
            stoneWallMat
        );
        towerShaft.position.y = 12.0;
        towerGroup.add(towerShaft);

        // Gallery observation platform
        const gallery = new THREE.Mesh(
            new THREE.CylinderGeometry(4.0, 3.4, 1.2, 12),
            stoneTrimMat
        );
        gallery.position.y = 20.6;
        towerGroup.add(gallery);

        // Lantern room housing
        const lanternRoom = new THREE.Mesh(
            new THREE.CylinderGeometry(2.4, 2.4, 2.5, 8),
            beaconHousingMat
        );
        lanternRoom.position.y = 22.45;
        towerGroup.add(lanternRoom);

        // Glowing core lens
        const lens = new THREE.Mesh(
            new THREE.CylinderGeometry(1.4, 1.4, 1.8, 8),
            beaconGlassMat
        );
        lens.position.y = 22.45;
        towerGroup.add(lens);

        // Conical cupola roof
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(2.8, 2.6, 8),
            beaconHousingMat
        );
        roof.position.y = 24.9;
        towerGroup.add(roof);

        // Rotating Beacon Searchlight Rig
        const beamPivot = new THREE.Group();
        beamPivot.name = 'BeaconBeamPivot';
        beamPivot.position.set(0, 22.45, 0);

        // Long volumetric cone searchlight projecting out across the water
        const beamMesh = new THREE.Mesh(
            new THREE.ConeGeometry(5.0, 42.0, 12, 1, true),
            beamMat
        );
        beamMesh.rotation.x = Math.PI * 0.5;
        beamMesh.position.set(0, 0, 21.0);
        beamPivot.add(beamMesh);

        towerGroup.add(beamPivot);
        seaWallGroup.add(towerGroup);

        lighthouses.push({
            side,
            towerGroup,
            beamPivot,
            rotationSpeed: 0.75 * (side < 0 ? 1 : -1),
        });
    }

    biomeData.lighthouses = lighthouses;
    return seaWallGroup;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Marina Bay Basin, Docks, Barges & Market Stalls (z = -160 to -260)
// ─────────────────────────────────────────────────────────────────────────────

function buildMarinaBays(THREE, options, prng, biomeData) {
    const marinaRoot = new THREE.Group();
    marinaRoot.name = 'MarinaBaysAndCanalInlets';
    const halfWidth = options.riverWidth * 0.5;

    const timberMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x4c3221,
        roughness: 0.85,
        metalness: 0.1,
    });
    const dockBoardMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x6d4c33,
        roughness: 0.9,
    });
    const stoneArchMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x434c5e,
        roughness: 0.8,
        metalness: 0.2,
    });
    const craneSteelMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xbf616a,
        roughness: 0.5,
        metalness: 0.7,
    });
    const cargoCrateMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x81a1c1,
        roughness: 0.7,
    });
    const awningColors = [0xbf616a, 0xd08770, 0xebcb8b, 0xa3be8c, 0xb48ead, 0x88c0d0];

    const mooredBarges = [];
    const craneGantries = [];

    // Marina bays flank both sides from z = -160 to z = -260
    for (const side of [-1, 1]) {
        const sideGroup = new THREE.Group();
        sideGroup.name = `MarinaBay_${side < 0 ? 'Port' : 'Starboard'}`;

        const bayCenterX = side * (halfWidth + 24.0);
        const bayWidth = 36.0;
        const bayLength = 100.0;
        const bayCenterZ = -210.0;

        // Wooden Boardwalk Quayside
        const quayPlatform = new THREE.Mesh(
            new THREE.BoxGeometry(bayWidth, 1.2, bayLength),
            dockBoardMat
        );
        quayPlatform.position.set(bayCenterX, 0.6, bayCenterZ);
        quayPlatform.receiveShadow = true;
        sideGroup.add(quayPlatform);

        // Submerged Wooden Pilings along the marina water edge
        const pilingCount = 14;
        for (let p = 0; p < pilingCount; p++) {
            const pz = -165.0 - p * 7.0;
            const px = side * (halfWidth + 6.0);
            const piling = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.45, 4.5, 8),
                timberMat
            );
            piling.position.set(px, 0.5, pz);
            sideGroup.add(piling);
        }

        // Stone Arch Bridges spanning over marina canal inlets (at z = -180 and z = -240)
        for (const bridgeZ of [-180, -240]) {
            const bridgeGroup = new THREE.Group();
            bridgeGroup.position.set(bayCenterX, 0, bridgeZ);

            // Arch span
            const archSpan = new THREE.Mesh(
                new THREE.BoxGeometry(bayWidth * 0.9, 1.6, 5.0),
                stoneArchMat
            );
            archSpan.position.y = 3.6;
            bridgeGroup.add(archSpan);

            // Parapet railings
            for (const rz of [-2.2, 2.2]) {
                const parapet = new THREE.Mesh(
                    new THREE.BoxGeometry(bayWidth * 0.9, 0.8, 0.4),
                    stoneArchMat
                );
                parapet.position.set(0, 4.8, rz);
                bridgeGroup.add(parapet);
            }

            // Arch Keystone/Pillars on each end
            for (const bx of [-bayWidth * 0.4, bayWidth * 0.4]) {
                const abutment = new THREE.Mesh(
                    new THREE.BoxGeometry(3.0, 4.5, 5.4),
                    stoneArchMat
                );
                abutment.position.set(bx, 2.25, 0);
                bridgeGroup.add(abutment);
            }

            sideGroup.add(bridgeGroup);
        }

        // Heavy Timber & Steel Crane Gantries on the quayside
        for (const craneZ of [-195, -225]) {
            const craneGroup = new THREE.Group();
            const craneX = side * (halfWidth + 10.0);
            craneGroup.position.set(craneX, 1.2, craneZ);

            // A-frame vertical gantry legs
            const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9.0, 0.6), craneSteelMat);
            leftLeg.position.set(0, 4.5, -1.8);
            leftLeg.rotation.z = side * -0.08;
            craneGroup.add(leftLeg);

            const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9.0, 0.6), craneSteelMat);
            rightLeg.position.set(0, 4.5, 1.8);
            rightLeg.rotation.z = side * -0.08;
            craneGroup.add(rightLeg);

            // Horizontal Overhanging Boom projecting towards the water
            const boom = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.8, 1.2), craneSteelMat);
            boom.position.set(side < 0 ? 3.5 : -3.5, 9.0, 0);
            craneGroup.add(boom);

            // Suspended Cargo Winch & Hanging Crate
            const winchCable = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 4.5, 6),
                timberMat
            );
            const hookX = side < 0 ? 6.5 : -6.5;
            winchCable.position.set(hookX, 6.5, 0);
            craneGroup.add(winchCable);

            const cargoCrate = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 1.8, 2.4),
                cargoCrateMat
            );
            cargoCrate.position.set(hookX, 3.6, 0);
            craneGroup.add(cargoCrate);

            sideGroup.add(craneGroup);
            craneGantries.push({ craneGroup, cargoCrate, baseY: 3.6, speed: 1.2 + prng() * 0.6 });
        }

        // Merchant Market Stalls with Striped Canvas Awnings along the Boardwalk
        for (let s = 0; s < 5; s++) {
            const stallZ = -170.0 - s * 18.0 + (prng() - 0.5) * 4.0;
            const stallX = side * (halfWidth + 18.0 + (s % 2) * 5.0);

            const stallGroup = new THREE.Group();
            stallGroup.position.set(stallX, 1.2, stallZ);
            stallGroup.rotation.y = side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

            // Wooden Counter / Trestle Table
            const counter = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.0, 1.6), timberMat);
            counter.position.y = 0.5;
            stallGroup.add(counter);

            // Wooden Canopy Corner Posts
            for (const px of [-1.6, 1.6]) {
                for (const pz of [-0.7, 0.7]) {
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), timberMat);
                    post.position.set(px, 1.4, pz);
                    stallGroup.add(post);
                }
            }

            // Slanted Canvas Awning (Vibrant merchant colors)
            const awningColor = awningColors[(s + (side < 0 ? 0 : 3)) % awningColors.length];
            const awningMat = createMat(THREE, 'MeshStandardMaterial', {
                color: awningColor,
                roughness: 0.6,
            });
            const awning = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 2.0), awningMat);
            awning.position.set(0, 2.7, 0);
            awning.rotation.x = 0.18; // Slant forward
            stallGroup.add(awning);

            sideGroup.add(stallGroup);
        }

        // Moored Cargo Barges Bobbing in the Calm-Water Basin (2 per side)
        for (let b = 0; b < 2; b++) {
            const bargeZ = -175.0 - b * 45.0;
            const bargeX = side * (halfWidth + 3.5);

            const bargeGroup = new THREE.Group();
            bargeGroup.name = `MooredBarge_${side < 0 ? 'P' : 'S'}_${b}`;
            bargeGroup.position.set(bargeX, 0.2, bargeZ);

            // Wooden flat-bottomed barge hull
            const hullMat = createMat(THREE, 'MeshStandardMaterial', {
                color: 0x3d271d,
                roughness: 0.85,
            });
            const bargeHull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 14.0), hullMat);
            bargeHull.position.y = 0.7;
            bargeGroup.add(bargeHull);

            // Cargo stack on deck (tarps, barrels, timber)
            const tarpColor = awningColors[(b * 2) % awningColors.length];
            const tarpMat = createMat(THREE, 'MeshStandardMaterial', { color: tarpColor, roughness: 0.7 });
            const cargoStack = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 8.0), tarpMat);
            cargoStack.position.set(0, 2.0, 0);
            bargeGroup.add(cargoStack);

            // Mooring Rope to quayside
            const ropeMat = createMat(THREE, 'MeshBasicMaterial', { color: 0x2e3440 });
            const mooringRope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.5, 6), ropeMat);
            mooringRope.rotation.z = side * 0.9;
            mooringRope.position.set(side * 1.5, 1.0, 4.0);
            bargeGroup.add(mooringRope);

            sideGroup.add(bargeGroup);

            mooredBarges.push({
                group: bargeGroup,
                baseY: 0.2,
                bobPhase: (b * 2.3 + side * 1.5),
                bobSpeed: 1.5 + prng() * 0.5,
                rollAmp: 0.04 + prng() * 0.03,
            });
        }

        marinaRoot.add(sideGroup);
    }

    biomeData.barges = mooredBarges;
    biomeData.cranes = craneGantries;
    return marinaRoot;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Multi-Story Canal Townhouses with Gabled Roofs & Lit Windows
// ─────────────────────────────────────────────────────────────────────────────

function buildCanalTownhouses(THREE, options, prng, biomeData) {
    const townhouseRoot = new THREE.Group();
    townhouseRoot.name = 'CanalTownhousesWaterfront';
    const halfWidth = options.riverWidth * 0.5;

    // Palette of historic canal townhouse stucco & brick facades
    const facadeColors = [
        0xd08770, // Terra cotta
        0xebcb8b, // Ochre gold
        0xa3be8c, // Sage green
        0x88c0d0, // Nordic slate cyan
        0x4c566a, // Charcoal slate
        0xb48ead, // Dusty plum
        0xd8dee9, // Weathered limestone
    ];

    const roofColors = [
        0x2e3440, // Dark slate tile
        0xbf616a, // Red ceramic tile
        0x3b4252, // Blue-grey timber shingle
    ];

    const windowGlowMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0xffd166,
        emissive: new THREE.Color(0xffaa00),
        emissiveIntensity: 1.4,
        roughness: 0.2,
    });
    const stoneFoundationMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x3b4252,
        roughness: 0.95,
    });
    const woodTrimMat = createMat(THREE, 'MeshStandardMaterial', {
        color: 0x2b1d14,
        roughness: 0.8,
    });

    const townhouses = [];
    const windowMaterials = [windowGlowMat];

    // Distribute canal townhouses along both riverbanks from zStart (-140) down to zEnd (-700)
    // Stride of ~16m down the river length
    const zStep = 18.0;
    const zSpan = Math.abs(options.zEnd - options.zStart);
    const numRows = Math.floor(zSpan / zStep);

    for (let i = 0; i < numRows; i++) {
        const curZ = options.zStart - (i * zStep) + (prng() - 0.5) * 4.0;

        for (const side of [-1, 1]) {
            // Set back outside the river canal + marina reach
            // During marina stretch (-160 to -260), push houses further back behind docks
            const isInMarina = curZ <= -155 && curZ >= -265;
            const lateralOffset = isInMarina ? (halfWidth + 42.0) : (halfWidth + 8.0);
            const houseX = side * (lateralOffset + (prng() - 0.5) * 4.0);

            const houseGroup = new THREE.Group();
            houseGroup.name = `Townhouse_${side < 0 ? 'L' : 'R'}_${i}`;
            houseGroup.position.set(houseX, 0, curZ);
            // Face inward towards the canal
            houseGroup.rotation.y = side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

            // 2 to 4 stories high
            const stories = 2 + Math.floor(prng() * 3);
            const storyHeight = 3.4;
            const totalBuildingHeight = stories * storyHeight;
            const facadeWidth = 9.0 + (prng() - 0.5) * 2.0;
            const buildingDepth = 10.0 + (prng() - 0.5) * 2.0;

            const facadeColor = facadeColors[(i * 3 + (side < 0 ? 0 : 2)) % facadeColors.length];
            const houseMat = createMat(THREE, 'MeshStandardMaterial', {
                color: facadeColor,
                roughness: 0.75,
                metalness: 0.1,
            });
            const roofColor = roofColors[(i + (side < 0 ? 1 : 0)) % roofColors.length];
            const roofMat = createMat(THREE, 'MeshStandardMaterial', {
                color: roofColor,
                roughness: 0.8,
                metalness: 0.2,
            });

            // 1. Heavy Stone Quayside Foundation
            const foundationHeight = 1.6;
            const foundation = new THREE.Mesh(
                new THREE.BoxGeometry(facadeWidth * 1.05, foundationHeight, buildingDepth * 1.05),
                stoneFoundationMat
            );
            foundation.position.y = foundationHeight * 0.5;
            foundation.castShadow = true;
            foundation.receiveShadow = true;
            houseGroup.add(foundation);

            // 2. Main Multi-Story House Body
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(facadeWidth, totalBuildingHeight, buildingDepth),
                houseMat
            );
            body.position.y = foundationHeight + totalBuildingHeight * 0.5;
            body.castShadow = true;
            body.receiveShadow = true;
            houseGroup.add(body);

            // 3. Steep Dutch/Hanseatic Gabled Roof
            const roofHeight = 4.5 + prng() * 1.5;
            const roof = new THREE.Mesh(
                new THREE.ConeGeometry(facadeWidth * 0.72, roofHeight, 4),
                roofMat
            );
            roof.position.y = foundationHeight + totalBuildingHeight + roofHeight * 0.5;
            roof.rotation.y = Math.PI * 0.25; // 4-corner diamond alignment creates sharp front/rear gable
            roof.scale.set(1.0, 1.0, buildingDepth / facadeWidth);
            roof.castShadow = true;
            houseGroup.add(roof);

            // 4. Brick Chimney Stack
            const chimney = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, roofHeight + 1.2, 0.8),
                stoneFoundationMat
            );
            chimney.position.set(
                (prng() - 0.5) * (facadeWidth * 0.4),
                foundationHeight + totalBuildingHeight + roofHeight * 0.6,
                (prng() - 0.5) * (buildingDepth * 0.4)
            );
            houseGroup.add(chimney);

            // 5. Lit Windows on the Waterfront Facade
            // Windows arranged symmetrically across each story
            const windowsPerStory = 3;
            for (let s = 0; s < stories; s++) {
                const wy = foundationHeight + (s + 0.6) * storyHeight;
                for (let w = 0; w < windowsPerStory; w++) {
                    const wx = -facadeWidth * 0.32 + (w / (windowsPerStory - 1)) * (facadeWidth * 0.64);
                    // Place window on the front-facing canal side (+Z in local group coords)
                    const winMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(0.85, 1.3, 0.15),
                        windowGlowMat
                    );
                    winMesh.position.set(wx, wy, buildingDepth * 0.5 + 0.08);

                    // Wooden window frame sill
                    const sill = new THREE.Mesh(
                        new THREE.BoxGeometry(1.05, 0.12, 0.25),
                        woodTrimMat
                    );
                    sill.position.set(wx, wy - 0.65, buildingDepth * 0.5 + 0.12);
                    houseGroup.add(sill);

                    houseGroup.add(winMesh);
                }
            }

            townhouseRoot.add(houseGroup);
            townhouses.push({
                group: houseGroup,
                stories,
                x: houseX,
                z: curZ,
                side,
            });
        }
    }

    biomeData.townhouses = townhouses;
    biomeData.windowMaterials = windowMaterials;
    return townhouseRoot;
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary Export: buildWalledHarborCityBiome & stepWalledHarborCityBiome
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the comprehensive 3D architectural biome environment for Act II.
 *
 * @param {object} THREE - Three.js namespace or mock.
 * @param {object} [options] - Configuration overrides.
 * @param {number} [options.riverWidth=80] - River width.
 * @param {number} [options.zStart=-140] - Starting Z coordinate.
 * @param {number} [options.zEnd=-700] - Ending Z coordinate.
 * @param {number} [options.seed=1337] - Seed for deterministic building generation.
 * @returns {THREE.Group} Root biome group containing all architecture and animations metadata.
 */
export function buildWalledHarborCityBiome(THREE, options = {}) {
    if (!THREE) {
        throw new Error('buildWalledHarborCityBiome requires a valid THREE instance');
    }

    const opts = {
        riverWidth: options.riverWidth ?? 80,
        zStart: options.zStart ?? -140,
        zEnd: options.zEnd ?? -700,
        seed: options.seed ?? 1337,
    };

    const prng = createPrng(opts.seed);
    const rootGroup = new THREE.Group();
    rootGroup.name = 'Act2WalledHarborCityBiome';

    // Metadata bucket for simulation & animation loops
    const biomeData = {
        riverWidth: opts.riverWidth,
        zStart: opts.zStart,
        zEnd: opts.zEnd,
        lighthouses: [],
        barges: [],
        cranes: [],
        townhouses: [],
        windowMaterials: [],
        time: 0,
    };
    rootGroup.userData = biomeData;

    // 1. Grand Harbor Sea-Wall & Bastions with Twin Rotating Lighthouses (z = -150)
    const seaWall = buildSeaWallAndLighthouses(THREE, opts, biomeData);
    rootGroup.add(seaWall);

    // 2. Marina Bay Basin, Docks, Barges, Cranes & Market Stalls (z = -160 to -260)
    const marina = buildMarinaBays(THREE, opts, prng, biomeData);
    rootGroup.add(marina);

    // 3. Multi-story canal townhouses flanking banks from zStart down to zEnd
    const townhouses = buildCanalTownhouses(THREE, opts, prng, biomeData);
    rootGroup.add(townhouses);

    return rootGroup;
}

/**
 * Steps the 60Hz dynamic animation lifecycle for the harbor city biome:
 * - Rotates twin lighthouse beacon searchlights at entrance (z = -150).
 * - Bobs and rocks moored cargo barges in the marina calm water.
 * - Gently sways hoisted crane cargo crates.
 * - Subtle warm pulse on glowing townhouse windows.
 *
 * @param {THREE.Group} group - Root group returned from `buildWalledHarborCityBiome`.
 * @param {number} [dt=0.016] - Delta time in seconds.
 * @param {number} [time=0] - Total elapsed game time in seconds.
 */
export function stepWalledHarborCityBiome(group, dt = 0.016, time = 0) {
    if (!group || !group.userData) return;
    const data = group.userData;
    data.time = (typeof time === 'number' && !Number.isNaN(time)) ? time : ((data.time || 0) + (dt || 0.016));
    const t = data.time;

    // 1. Rotate Lighthouse Beacons
    if (Array.isArray(data.lighthouses)) {
        for (const lh of data.lighthouses) {
            if (lh.beamPivot && lh.beamPivot.rotation) {
                lh.beamPivot.rotation.y += (lh.rotationSpeed || 0.8) * (dt || 0.016);
            }
        }
    }

    // 2. Bob & Rock Moored Cargo Barges
    if (Array.isArray(data.barges)) {
        for (const barge of data.barges) {
            if (barge.group && barge.group.position && barge.group.rotation) {
                const phase = t * (barge.bobSpeed || 1.5) + (barge.bobPhase || 0);
                // Vertical water heave
                barge.group.position.y = (barge.baseY || 0.2) + Math.sin(phase) * 0.08;
                // Gentle roll rocking
                barge.group.rotation.z = Math.cos(phase * 0.8) * (barge.rollAmp || 0.04);
                barge.group.rotation.x = Math.sin(phase * 0.5) * 0.02;
            }
        }
    }

    // 3. Sway Crane Cargo
    if (Array.isArray(data.cranes)) {
        for (const crane of data.cranes) {
            if (crane.cargoCrate && crane.cargoCrate.position) {
                const sway = Math.sin(t * (crane.speed || 1.2)) * 0.15;
                crane.cargoCrate.position.y = (crane.baseY || 3.6) + Math.cos(t * 1.8) * 0.06;
                crane.cargoCrate.rotation.z = sway * 0.3;
            }
        }
    }

    // 4. Subtle Window Emissive Atmosphere
    if (Array.isArray(data.windowMaterials)) {
        const pulse = 1.35 + Math.sin(t * 1.2) * 0.15;
        for (const mat of data.windowMaterials) {
            if (mat && typeof mat.emissiveIntensity === 'number') {
                mat.emissiveIntensity = pulse;
            }
        }
    }
}
