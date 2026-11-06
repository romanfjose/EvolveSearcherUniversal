import * as THREE from 'three';

/**
 * AAA Procedural 3D Visuals, Custom GLSL Water/Sky Shaders & Articulated Rigging
 * for "Don't Sink, Don't Die" — Zero external asset dependencies (100% procedural WebGL).
 */

// ─── 1. Renderer & Scene Atmosphere Upgrade ─────────────────────────────
export function upgradeRendererAndAtmosphere(renderer, scene) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Warm golden-hour sky fog tuned for high-angle tactical co-op diorama visibility
    scene.background = new THREE.Color(0x1b2940);
    scene.fog = new THREE.FogExp2(0x283c54, 0.0021);

    // Sky Dome Shader (Sunset Horizon -> Deep Zenith + Sun Disc)
    const skyGeo = new THREE.SphereGeometry(900, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
            topColor: { value: new THREE.Color(0x0d1b35) },
            midColor: { value: new THREE.Color(0x2b4c6f) },
            horizonColor: { value: new THREE.Color(0xd97f54) },
            sunDir: { value: new THREE.Vector3(0.35, 0.28, -0.89).normalize() },
        },
        vertexShader: `
            varying vec3 vWorldPos;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 midColor;
            uniform vec3 horizonColor;
            uniform vec3 sunDir;
            varying vec3 vWorldPos;
            void main() {
                vec3 dir = normalize(vWorldPos);
                float h = clamp(dir.y, 0.0, 1.0);
                vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
                col = mix(col, topColor, smoothstep(0.25, 0.85, h));
                float sunAmt = max(dot(dir, sunDir), 0.0);
                col += vec3(1.0, 0.65, 0.35) * pow(sunAmt, 16.0) * 0.45;
                col += vec3(1.0, 0.92, 0.78) * smoothstep(0.996, 0.9992, sunAmt) * 1.4;
                gl_FragColor = vec4(col, 1.0);
            }
        `,
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.frustumCulled = false;
    scene.add(skyDome);

    // Hemisphere + Dramatic Sun Directional Light
    const hemiLight = new THREE.HemisphereLight(0x9ec5ff, 0x3d2e1e, 0.65);
    scene.add(hemiLight);

    return { skyDome, skyMat, hemiLight };
}

// ─── 2. Custom GLSL Gerstner Wave & Fresnel Specular River Surface ──────
export function createAAARiverMesh(riverWidth, riverLength, waterTex) {
    const geo = new THREE.PlaneGeometry(riverWidth + 16, riverLength + 200, 72, 420);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uClarity: { value: 0 },
            uMudColor: { value: new THREE.Color(0x3a2f25) },
            uClearColor: { value: new THREE.Color(0x094d73) },
            uDeepColor: { value: new THREE.Color(0x041f36) },
            uSkyColor: { value: new THREE.Color(0x7aa8d6) },
            uSunColor: { value: new THREE.Color(0xffe0b2) },
            uSunDir: { value: new THREE.Vector3(0.35, 0.45, -0.82).normalize() },
            uHalfWidth: { value: riverWidth * 0.5 },
            uMap: { value: waterTex },
        },
        vertexShader: `
            uniform float uTime;
            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying vec2 vUv;
            varying float vWaveH;

            void main() {
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);

                // Layered Gerstner-style river waves flowing toward -Z
                float zFlow = wp.z + uTime * 9.0;
                float w1 = sin(wp.x * 0.55 + zFlow * 0.28) * 0.08;
                float w2 = cos(wp.x * 1.15 - zFlow * 0.52) * 0.045;
                float w3 = sin((wp.x + wp.z) * 0.9 + uTime * 3.8) * 0.03;
                float h = w1 + w2 + w3;

                wp.y += h;
                vWaveH = h;
                vWorldPos = wp.xyz;

                // Analytical normal approximation
                float dx = 0.55 * 0.08 * cos(wp.x * 0.55 + zFlow * 0.28)
                         - 1.15 * 0.045 * sin(wp.x * 1.15 - zFlow * 0.52);
                float dz = 0.28 * 0.08 * cos(wp.x * 0.55 + zFlow * 0.28)
                         + 0.52 * 0.045 * sin(wp.x * 1.15 - zFlow * 0.52);
                vNormal = normalize(vec3(-dx * 2.4, 1.0, -dz * 2.4));

                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uClarity;
            uniform vec3 uMudColor;
            uniform vec3 uClearColor;
            uniform vec3 uDeepColor;
            uniform vec3 uSkyColor;
            uniform vec3 uSunColor;
            uniform vec3 uSunDir;
            uniform float uHalfWidth;
            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying vec2 vUv;
            varying float vWaveH;

            // Procedural caustics / ripple hash
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                    f.y
                );
            }

            void main() {
                vec3 N = normalize(vNormal);
                vec3 V = normalize(cameraPosition - vWorldPos);

                // Base water color transitions from muddy headwaters to clear emerald/sapphire downstream
                float downstream = clamp(-vWorldPos.z / 1500.0, 0.0, 1.0);
                float clarity = clamp(mix(downstream, uClarity, 0.5), 0.0, 1.0);
                vec3 shallow = mix(uMudColor, uClearColor, clarity);
                float centerDepth = 1.0 - clamp(abs(vWorldPos.x) / uHalfWidth, 0.0, 1.0);
                vec3 baseCol = mix(shallow, uDeepColor, centerDepth * 0.55);

                // Flowing current streaks & caustics
                vec2 flowUv = vec2(vWorldPos.x * 0.45, vWorldPos.z * 0.18 + uTime * 2.2);
                float n1 = noise(flowUv * 2.5);
                float n2 = noise(flowUv * 5.2 - vec2(0.0, uTime * 1.4));
                float caustic = smoothstep(0.58, 0.88, n1 * 0.6 + n2 * 0.4);
                baseCol += vec3(0.18, 0.32, 0.38) * caustic * (0.25 + 0.45 * clarity);

                // Shore foam along riverbanks
                float bankDist = abs(abs(vWorldPos.x) - uHalfWidth);
                float shoreFoam = smoothstep(2.4, 0.2, bankDist) * (0.45 + 0.55 * n1);

                // Fresnel sky reflection + Sun Blinn-Phong specular glitter
                float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
                vec3 col = mix(baseCol, uSkyColor, fresnel * 0.55);

                vec3 H = normalize(uSunDir + V);
                float spec = pow(max(dot(N, H), 0.0), 96.0);
                col += uSunColor * spec * 0.95;

                // Crest highlights & bank foam
                col += vec3(0.88, 0.95, 1.0) * smoothstep(0.07, 0.13, vWaveH) * 0.25;
                col = mix(col, vec3(0.92, 0.96, 1.0), clamp(shoreFoam * 0.65, 0.0, 0.8));

                gl_FragColor = vec4(col, 1.0);
            }
        `,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -riverLength / 2 + 50;
    mesh.receiveShadow = true;
    return { mesh, mat };
}

// ─── 3. Sculpted Canyon Banks & Neon Harbor City Architecture ───────────
export function createAAACanyonAndCity(scene, riverWidth, riverLength) {
    const bankGroup = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3b3530, roughness: 0.88, metalness: 0.08, flatShading: true });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x2c5234, roughness: 0.82, flatShading: true });
    const sandMat = new THREE.MeshStandardMaterial({ color: 0x6e5a44, roughness: 0.9, flatShading: true });

    // Continuous sculpted riverbanks on both sides
    for (const side of [-1, 1]) {
        const bankGeo = new THREE.BoxGeometry(28, 3.2, riverLength + 200, 4, 2, 80);
        const pos = bankGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vy = pos.getY(i);
            const vz = pos.getZ(i);
            // Slope down toward water edge, rise into rugged cliffs outward
            const innerEdge = side * vx < 0;
            if (vy > 0) {
                const cliff = innerEdge ? -0.9 : 2.5 + Math.sin(vz * 0.04 + side) * 1.8 + Math.cos(vz * 0.11) * 0.9;
                pos.setY(i, vy + cliff);
            }
            pos.setX(i, vx + Math.sin(vz * 0.05 + side * 2) * 0.9);
        }
        bankGeo.computeVertexNormals();
        const bankMesh = new THREE.Mesh(bankGeo, mossMat);
        bankMesh.position.set(side * (riverWidth / 2 + 13.5), 0.2, -riverLength / 2 + 50);
        bankMesh.receiveShadow = true;
        bankGroup.add(bankMesh);

        // Beach / gravel shoreline strip
        const shoreMesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, riverLength + 200), sandMat);
        shoreMesh.position.set(side * (riverWidth / 2 + 1.2), -0.05, -riverLength / 2 + 50);
        shoreMesh.receiveShadow = true;
        bankGroup.add(shoreMesh);
    }

    // Distant canyon rock spires & boulders along the banks (instanced for zero draw-call overhead)
    const spireCount = 140;
    const spireGeo = new THREE.ConeGeometry(4.5, 16, 6);
    const spireInst = new THREE.InstancedMesh(spireGeo, rockMat, spireCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < spireCount; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = -((i * 14.3) % (riverLength - 60)) - 10;
        // Leave room for the Harbor City on the right bank at z = -140..-260
        if (side === 1 && z < -135 && z > -265) {
            dummy.scale.setScalar(0.001);
        } else {
            const scale = 0.7 + ((i * 37) % 100) / 55;
            dummy.position.set(side * (riverWidth / 2 + 16 + ((i * 19) % 18)), 4 * scale, z);
            dummy.rotation.set(0, (i * 1.1) % Math.PI, ((i % 5) - 2) * 0.06);
            dummy.scale.set(scale, scale * (0.9 + (i % 3) * 0.35), scale);
        }
        dummy.updateMatrix();
        spireInst.setMatrixAt(i, dummy.matrix);
    }
    spireInst.castShadow = true;
    spireInst.receiveShadow = true;
    bankGroup.add(spireInst);

    // ─── Act II: Walled Harbor City & Calm Marina Basin (Both Banks, z = -135..-275) ───
    const cityGroup = new THREE.Group();
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x3b424c, roughness: 0.75 });
    const pierWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.85 });
    const roofTileMat = new THREE.MeshStandardMaterial({ color: 0x8c3b2b, roughness: 0.7, flatShading: true });
    const windowGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd27d });
    const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x38f2ff });
    const neonGoldMat = new THREE.MeshBasicMaterial({ color: 0xffb732 });
    const emeraldWardMat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const halfW = riverWidth * 0.5;

    // Harbor promenade deck + broad wooden merchant pier jutting into the calm basin
    const promenade = new THREE.Mesh(new THREE.BoxGeometry(38, 1.6, 128), concreteMat);
    promenade.position.set(halfW + 17, 0.5, -200);
    promenade.receiveShadow = true;
    cityGroup.add(promenade);

    const leftPromenade = new THREE.Mesh(new THREE.BoxGeometry(32, 1.6, 118), concreteMat);
    leftPromenade.position.set(-(halfW + 15), 0.5, -200);
    leftPromenade.receiveShadow = true;
    cityGroup.add(leftPromenade);

    // Wide Sanctuary Harbor Pier (extends from x = 13.5 out to halfW + 4 so rafts can dock anywhere on the right side!)
    const pierSpanW = Math.max(12, halfW - 10);
    const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(pierSpanW, 0.55, 96), pierWoodMat);
    pierDeck.position.set(13.5 + pierSpanW * 0.5 - 1.5, 0.85, -200);
    pierDeck.castShadow = true;
    pierDeck.receiveShadow = true;
    cityGroup.add(pierDeck);

    // Calm Harbor Truce Boundary Buoys & Lantern Bollards
    for (let z = -155; z >= -245; z -= 10) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 3.6, 8), pierWoodMat);
        post.position.set(13.2, 0.7, z);
        cityGroup.add(post);

        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), neonGoldMat);
        lantern.position.set(13.2, 2.65, z);
        cityGroup.add(lantern);
    }

    // Twin Harbor Entrance Lighthouses at z = -142 and z = -262
    for (const side of [-1, 1]) {
        for (const lz of [-142, -262]) {
            const lhGroup = new THREE.Group();
            lhGroup.position.set(side * (halfW - 2), 0, lz);
            const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 4.5, 10), concreteMat);
            base.position.y = 2.25;
            const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 14, 10), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 }));
            tower.position.y = 11.2;
            const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 10), neonGoldMat);
            beacon.position.y = 19.2;
            const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.8, 10), roofTileMat);
            cap.position.y = 21.6;
            lhGroup.add(base, tower, beacon, cap);
            cityGroup.add(lhGroup);
        }
    }

    // Harbor Shop Archway & Neon Beacon at z = -200
    const shopArch = new THREE.Group();
    shopArch.position.set(18, 1.2, -200);
    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6.5, 0.9), pierWoodMat);
    leftPillar.position.set(0, 3.25, -7);
    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6.5, 0.9), pierWoodMat);
    rightPillar.position.set(0, 3.25, 7);
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 15.5), new THREE.MeshStandardMaterial({ color: 0x16202e }));
    signBoard.position.set(0, 6.6, 0);
    const neonTrimTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 15.8), neonCyanMat);
    neonTrimTop.position.set(0, 7.65, 0);
    const neonTrimBot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 15.8), neonGoldMat);
    neonTrimBot.position.set(0, 5.55, 0);
    shopArch.add(leftPillar, rightPillar, signBoard, neonTrimTop, neonTrimBot);
    cityGroup.add(shopArch);

    // Warm harbor point light so the shop dock glows across the water
    const shopLight = new THREE.PointLight(0xffb84d, 3.0, 65, 1.4);
    shopLight.position.set(16, 8.0, -200);
    cityGroup.add(shopLight);

    // Walled Canal Townhouses with Gabled Roofs on both Harbor Banks
    const bldgConfigs = [
        { x: halfW + 16, z: -158, w: 10, h: 16, d: 13, col: 0x283342 },
        { x: halfW + 18, z: -178, w: 11, h: 24, d: 14, col: 0x1f2937 },
        { x: halfW + 15, z: -200, w: 12, h: 20, d: 16, col: 0x2d3748 },
        { x: halfW + 19, z: -222, w: 11, h: 27, d: 14, col: 0x1e2633 },
        { x: halfW + 16, z: -242, w: 10, h: 16, d: 13, col: 0x2b3648 },
        { x: -(halfW + 15), z: -168, w: 10, h: 18, d: 14, col: 0x263244 },
        { x: -(halfW + 17), z: -195, w: 12, h: 22, d: 15, col: 0x1f2937 },
        { x: -(halfW + 15), z: -225, w: 10, h: 17, d: 13, col: 0x2d3748 },
    ];
    for (const b of bldgConfigs) {
        const bMat = new THREE.MeshStandardMaterial({ color: b.col, roughness: 0.65, metalness: 0.2 });
        const bMesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), bMat);
        bMesh.position.set(b.x, 1.2 + b.h / 2, b.z);
        bMesh.castShadow = true;
        bMesh.receiveShadow = true;
        cityGroup.add(bMesh);

        // Pitched gable roof
        const roof = new THREE.Mesh(new THREE.ConeGeometry(b.w * 0.78, 4.5, 4), roofTileMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(b.x, 1.2 + b.h + 2.2, b.z);
        cityGroup.add(roof);

        // Glowing window strips facing the river
        const faceSign = b.x > 0 ? -1 : 1;
        for (let wy = 4; wy < b.h - 1.5; wy += 3.2) {
            const winStrip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, b.d * 0.75), windowGlowMat);
            winStrip.position.set(b.x + faceSign * (b.w / 2 + 0.06), 1.2 + wy, b.z);
            cityGroup.add(winStrip);
        }
    }

    // ─── Act I Biome Architecture: Redwood Waterwheel Mills & Flume Bridges (z = -35..-125 & -290..-460) ───
    const act1Group = new THREE.Group();
    for (const wz of [-55, -110, -310, -390, -445]) {
        const side = wz % 2 === 0 ? 1 : -1;
        const millHouse = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 11), pierWoodMat);
        millHouse.position.set(side * (halfW + 5), 3.8, wz);
        const millRoof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 4, 4), roofTileMat);
        millRoof.rotation.y = Math.PI / 4;
        millRoof.position.set(side * (halfW + 5), 9.2, wz);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.45, 8, 16), pierWoodMat);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(side * (halfW - 0.2), 3.6, wz);
        act1Group.add(millHouse, millRoof, wheel);
    }
    // Overhead wooden log-flume aqueduct bridges spanning the wide river
    for (const bz of [-85, -350]) {
        const bridgeSpan = new THREE.Mesh(new THREE.BoxGeometry(riverWidth + 16, 1.4, 3.6), pierWoodMat);
        bridgeSpan.position.set(0, 13.5, bz);
        act1Group.add(bridgeSpan);
        for (const sx of [-halfW * 0.55, halfW * 0.55]) {
            const trestle = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 14, 8), pierWoodMat);
            trestle.position.set(sx, 6.8, bz);
            act1Group.add(trestle);
        }
    }
    bankGroup.add(act1Group);

    // ─── Act III Biome Architecture: Sunken Crystal Temple Ziggurats & Floating Obelisks (z = -480..-1020) ───
    const act3Group = new THREE.Group();
    const templeStoneMat = new THREE.MeshStandardMaterial({ color: 0x384b5c, roughness: 0.7, flatShading: true });
    const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x0891b2,
        emissiveIntensity: 0.85,
        roughness: 0.2,
        metalness: 0.3,
        flatShading: true,
    });
    for (let z = -510; z >= -990; z -= 65) {
        for (const side of [-1, 1]) {
            // Stepped stone ziggurat on the bank
            const tier1 = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 14), templeStoneMat);
            tier1.position.set(side * (halfW + 8), 2, z);
            const tier2 = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 10), templeStoneMat);
            tier2.position.set(side * (halfW + 8), 6, z);
            const tier3 = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 6), templeStoneMat);
            tier3.position.set(side * (halfW + 8), 9.75, z);
            const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.4, 0), crystalMat);
            crystal.position.set(side * (halfW + 8), 14.5, z);
            act3Group.add(tier1, tier2, tier3, crystal);
        }
    }
    bankGroup.add(act3Group);

    // ─── Act IV Biome Architecture: Volcanic Shipwreck Caldera & Galleon Ribs (z = -1030..-1500) ───
    const act4Group = new THREE.Group();
    const basaltMat = new THREE.MeshStandardMaterial({ color: 0x1e1b24, roughness: 0.9, flatShading: true });
    const magmaMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    for (let z = -1050; z >= -1460; z -= 55) {
        for (const side of [-1, 1]) {
            // Giant curved shipwreck hull rib & basalt magma spire
            const spire = new THREE.Mesh(new THREE.ConeGeometry(5.5, 22, 6), basaltMat);
            spire.position.set(side * (halfW + 6), 10, z);
            const magmaVein = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), magmaMat);
            magmaVein.position.set(side * (halfW + 2), 2.2, z);
            const rib = new THREE.Mesh(new THREE.BoxGeometry(1.2, 16, 1.4), pierWoodMat);
            rib.position.set(side * (halfW - 3), 7.5, z + 15);
            rib.rotation.z = -side * 0.42;
            act4Group.add(spire, magmaVein, rib);
        }
    }
    bankGroup.add(act4Group);

    bankGroup.add(cityGroup);
    scene.add(bankGroup);
    return { bankGroup, cityGroup, act1Group, act3Group, act4Group, emeraldWardMat };
}

// ─── 4. Sculpted Obstacles: Safe Sanctuary Docks & Multi-Tier Pine/Willow Trees
export function createAAAObstacleMesh(isPlank, width, height, depth, size, woodMaterial, vegetationMaterial) {
    if (isPlank) {
        const group = new THREE.Group();
        const plankCount = 5;
        const pDepth = depth / plankCount;
        const darkIronMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.6, roughness: 0.4 });
        const beaconGoldMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
        const sanctuaryRingMat = new THREE.MeshBasicMaterial({
            color: 0x34d399,
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        for (let i = 0; i < plankCount; i++) {
            const board = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.8, pDepth * 0.9), woodMaterial);
            board.position.z = (i - (plankCount - 1) / 2) * pDepth;
            board.castShadow = true;
            board.receiveShadow = true;
            group.add(board);
        }
        // Heavy timber pilings & corner mooring bollards with glowing safe-haven lanterns
        for (const sx of [-width * 0.44, width * 0.44]) {
            for (const sz of [-depth * 0.42, depth * 0.42]) {
                const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.8, 8), woodMaterial);
                piling.position.set(sx, -0.4, sz);
                group.add(piling);
                const bollardCap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), beaconGoldMat);
                bollardCap.position.set(sx, 1.05, sz);
                group.add(bollardCap);
            }
        }
        // Subtle corner lantern glow only (no giant water-surface ring around docks so players never confuse docks with water whirlpools)
        return group;
    }

    // Multi-tier stylized canyon pine/cypress tree with exposed roots
    const treeGroup = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.72, size * 1.15, 8), woodMaterial);
    trunk.position.y = size * 0.55;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
        const r = size * (1.05 - t * 0.24);
        const h = size * (0.95 - t * 0.15);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), vegetationMaterial);
        cone.position.y = size * 0.95 + t * (size * 0.52);
        cone.rotation.y = t * 0.7;
        cone.castShadow = true;
        cone.receiveShadow = true;
        treeGroup.add(cone);
    }
    return treeGroup;
}

// ─── 5. Monumental Stone Checkpoint Gates & Finish Line Citadel Arch ────
export function createAAACheckpointGate(riverWidth, cpZ, index) {
    const group = new THREE.Group();
    group.position.set(0, 0, cpZ);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a525d, roughness: 0.8, flatShading: true });
    const runeMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.85 });
    const curtainMat = new THREE.MeshBasicMaterial({
        color: 0xffd24a,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    for (const side of [-1, 1]) {
        const x = side * (riverWidth / 2 - 0.8);
        const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.8), stoneMat);
        base.position.set(x, 1.1, 0);
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.2, 10.5, 8), stoneMat);
        column.position.set(x, 6.2, 0);
        column.castShadow = true;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 2.4), stoneMat);
        cap.position.set(x, 11.6, 0);
        const brazier = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 10), runeMat);
        brazier.position.set(x, 12.6, 0);
        group.add(base, column, cap, brazier);
    }

    // Overhead cross-beam banner & translucent energy gate
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, riverWidth, 8), stoneMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(0, 11.2, 0);
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(riverWidth - 2.5, 10.5), curtainMat);
    curtain.position.set(0, 5.5, 0);
    group.add(beam, curtain);

    return {
        group,
        curtainMat,
        runeMat,
        markCrossed() {
            curtainMat.color.setHex(0x38ff8e);
            curtainMat.opacity = 0.07;
            runeMat.color.setHex(0x38ff8e);
        },
    };
}

export function createAAAFinishArch(riverWidth, finishZ) {
    const group = new THREE.Group();
    group.position.set(0, 0, finishZ);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.65, roughness: 0.28 });
    const marbleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45 });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x38ff9c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });

    for (const side of [-1, 1]) {
        const x = side * (riverWidth / 2 - 0.5);
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.9, 18, 10), marbleMat);
        tower.position.set(x, 9, 0);
        tower.castShadow = true;
        const spire = new THREE.Mesh(new THREE.ConeGeometry(2.0, 5, 10), goldMat);
        spire.position.set(x, 20.5, 0);
        group.add(tower, spire);
    }

    const topSpan = new THREE.Mesh(new THREE.BoxGeometry(riverWidth + 2, 1.8, 2.2), goldMat);
    topSpan.position.set(0, 17.5, 0);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(riverWidth - 2, 16.5), beaconMat);
    portal.position.set(0, 8.5, 0);
    group.add(topSpan, portal);

    return group;
}

// ─── 6. Articulated Log-Craft Raft & Expedition Crew Character ──────────
export function createAAARaftAndCrew(color, upgrades, raftSize, woodMaterial, paddleMaterial, hammerMaterial, motorMaterial, propMaterial) {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    group.add(tilt);

    // 6A. Multi-Log Lashed Raft Hull
    const raft = new THREE.Group();
    const logCount = 6;
    const logRadius = (raftSize.w / logCount) * 0.54;
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc2a675, roughness: 0.9 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a434e, metalness: 0.75, roughness: 0.32 });

    for (let i = 0; i < logCount; i++) {
        const lx = (i - (logCount - 1) / 2) * (raftSize.w / logCount);
        const lenJitter = (i % 2 === 0 ? 0.08 : -0.06);
        const log = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, raftSize.d + lenJitter, 10), woodMaterial);
        log.rotation.x = Math.PI / 2;
        log.position.set(lx, 0, 0);
        log.castShadow = true;
        log.receiveShadow = true;
        raft.add(log);
    }

    // Crossbeams & Rope Lashings
    for (const bz of [-raftSize.d * 0.34, raftSize.d * 0.34]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(raftSize.w * 1.04, 0.14, 0.22), woodMaterial);
        beam.position.set(0, logRadius * 0.75, bz);
        beam.castShadow = true;
        const rope = new THREE.Mesh(new THREE.BoxGeometry(raftSize.w * 1.06, 0.18, 0.08), ropeMat);
        rope.position.set(0, logRadius * 0.76, bz);
        raft.add(beam, rope);
    }

    // Warm Bow Expedition Lantern
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.85, 6), woodMaterial);
    post.position.set(-raftSize.w * 0.38, 0.45, -raftSize.d * 0.42);
    const lanternGlass = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd479 })
    );
    lanternGlass.position.set(-raftSize.w * 0.38, 0.92, -raftSize.d * 0.42);
    raft.add(post, lanternGlass);

    // Optional Armor Upgrade: Riveted Steel Bulwark Plates & Bow Ram
    if (upgrades.includes('armor')) {
        for (const side of [-1, 1]) {
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, raftSize.d * 0.88), ironMat);
            plate.position.set(side * (raftSize.w * 0.53), 0.18, 0);
            plate.castShadow = true;
            raft.add(plate);
        }
        const bowShield = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), ironMat);
        bowShield.rotation.x = -Math.PI / 2;
        bowShield.rotation.z = Math.PI / 4;
        bowShield.position.set(0, 0.1, -raftSize.d * 0.56);
        raft.add(bowShield);
    }

    // Optional Twin-Exhaust Outboard Motor Upgrade
    let prop = null;
    if (upgrades.includes('motor')) {
        const motor = new THREE.Group();
        motor.position.set(0, raftSize.h / 2 + 0.22, raftSize.d / 2 + 0.18);

        const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.62, 0.72), motorMaterial);
        cowl.position.y = 0.15;
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.74), new THREE.MeshBasicMaterial({ color: 0xff5722 }));
        stripe.position.y = 0.2;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), motorMaterial);
        shaft.position.set(0, -0.55, 0.14);

        prop = new THREE.Group();
        prop.position.set(0, -0.95, 0.34);
        for (let b = 0; b < 3; b++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.55, 0.04), propMaterial);
            blade.position.y = 0.22;
            blade.rotation.y = 0.5;
            const arm = new THREE.Group();
            arm.rotation.z = (b * 2 * Math.PI) / 3;
            arm.add(blade);
            prop.add(arm);
        }
        motor.add(cowl, stripe, shaft, prop);
        raft.add(motor);
    }

    // 6B. Articulated Expedition Crew Member
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf4c29f, roughness: 0.65 });
    const shirtMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const vestMat = new THREE.MeshStandardMaterial({ color: 0xe66817, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.75 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });

    const character = new THREE.Group();
    character.position.y = raftSize.h / 2;

    // Legs
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.38, 4, 8), pantsMat);
    leftLeg.position.set(-0.22, 0.32, 0.05);
    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.38, 4, 8), pantsMat);
    rightLeg.position.set(0.22, 0.32, -0.05);

    // Torso + Life Jacket
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.82, 0.44), shirtMat);
    torso.position.y = 0.88;
    torso.castShadow = true;
    const lifeVest = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.62, 0.5), vestMat);
    lifeVest.position.y = 0.92;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.1, 0.52), darkMat);
    belt.position.y = 0.82;

    // Head + Bandana + Goggles
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.56;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), skinMat);
    head.castShadow = true;
    const bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 12), shirtMat);
    bandana.position.y = 0.1;
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.18), darkMat);
    goggles.position.set(0, 0.05, -0.24);
    headGroup.add(head, bandana, goggles);

    // Articulated Arms
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.48, 4, 8), shirtMat);
    leftArm.position.set(-0.5, 0.95, -0.1);
    leftArm.rotation.z = 0.25;
    leftArm.rotation.x = 0.45;
    const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.48, 4, 8), shirtMat);
    rightArm.position.set(0.5, 0.95, -0.1);
    rightArm.rotation.z = -0.35;
    rightArm.rotation.x = 0.45;

    character.add(leftLeg, rightLeg, torso, lifeVest, belt, headGroup, leftArm, rightArm);

    // 6C. Sculpted Oar / Squeaky War-Mallet Weapon
    const hammer = upgrades.includes('weapon');
    const paddle = new THREE.Group();
    if (hammer) {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.3, 8), woodMaterial);
        handle.rotation.x = Math.PI / 2;
        const malletHead = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.95, 12), hammerMaterial);
        malletHead.rotation.z = Math.PI / 2;
        malletHead.position.z = -0.95;
        const goldCap1 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.6 }));
        goldCap1.rotation.z = Math.PI / 2;
        goldCap1.position.set(-0.46, 0, -0.95);
        const goldCap2 = goldCap1.clone();
        goldCap2.position.x = 0.46;
        paddle.add(handle, malletHead, goldCap1, goldCap2);
    } else {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.5, 8), paddleMaterial);
        shaft.rotation.x = Math.PI / 2;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.85), paddleMaterial);
        blade.position.z = -1.25;
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 6), paddleMaterial);
        grip.rotation.z = Math.PI / 2;
        grip.position.z = 1.25;
        paddle.add(shaft, blade, grip);
    }
    const paddleHome = new THREE.Vector3(0.88, 0.88 + raftSize.h / 2, -0.1);
    paddle.position.copy(paddleHome);

    tilt.add(raft, character, paddle);

    return {
        group,
        tilt,
        raft,
        paddle,
        paddleHome,
        prop,
        hammer,
        rig: { character, headGroup, leftArm, rightArm, leftLeg, rightLeg },
        anim: {
            yaw: 0, speed: 0, turn: 0, thrust: 0, airborne: false,
            rowPhase: 0, bank: 0, pitch: 0, swing: 0, block: false,
            wakeAcc: 0, propAngle: 0,
        },
    };
}

// ─── 7. AAA Boss-Grade Enemy Meshes & Procedural Animations ─────────────
export function createAAAEnemyMeshes(woodMaterial) {
    // 7A. The River Wizard (whiteGuy): Arcane Skiff + Hooded Sorcerer + Glowing Orb Staff
    const wizardGroup = new THREE.Group();
    const skiff = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 0.85, 3.4, 8),
        woodMaterial
    );
    skiff.rotation.x = Math.PI / 2;
    skiff.scale.set(1.0, 1.0, 0.32);
    skiff.castShadow = true;

    const robeMat = new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.55 });
    const cloakMat = new THREE.MeshStandardMaterial({ color: 0x1e2b58, roughness: 0.45, metalness: 0.15 });
    const orbMat = new THREE.MeshBasicMaterial({ color: 0x45f3ff });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7df9ff });

    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.35, 10), robeMat);
    robe.position.y = 1.35;
    robe.castShadow = true;

    const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 0.65, 10), cloakMat);
    shoulders.position.y = 2.05;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), new THREE.MeshStandardMaterial({ color: 0x111625 }));
    head.position.y = 2.55;
    for (const sx of [-0.14, 0.14]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat);
        eye.position.set(sx, 2.58, -0.36);
        wizardGroup.add(eye);
    }

    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 12), cloakMat);
    hatBrim.position.y = 2.86;
    const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.55, 10), cloakMat);
    hatCone.position.set(0, 3.55, 0.08);
    hatCone.rotation.x = -0.18;

    const staffGroup = new THREE.Group();
    staffGroup.position.set(0.75, 1.6, -0.35);
    const staffShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.9, 8), woodMaterial);
    const staffOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 1), orbMat);
    staffOrb.position.y = 1.55;
    const staffRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 16), orbMat);
    staffRing.position.y = 1.55;
    staffGroup.add(staffShaft, staffOrb, staffRing);

    wizardGroup.add(skiff, robe, shoulders, head, hatBrim, hatCone, staffGroup);
    wizardGroup.userData = { staffGroup, staffRing, staffOrb };

    // 7B. The Swamp Behemoth (mudAlien): Multi-Limbed Sludge Golem + Orbiting Debris + Toxic Aura Ring
    const mudGroup = new THREE.Group();
    const sludgeMat = new THREE.MeshStandardMaterial({ color: 0x4b331d, roughness: 0.92, metalness: 0.05, flatShading: true });
    const mossCrustMat = new THREE.MeshStandardMaterial({ color: 0x2f4f28, roughness: 0.85, flatShading: true });
    const toxicMat = new THREE.MeshBasicMaterial({ color: 0xa8ff3e });

    const coreBody = new THREE.Mesh(new THREE.DodecahedronGeometry(2.05, 1), sludgeMat);
    coreBody.position.y = 1.5;
    coreBody.castShadow = true;

    const hump = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 1), mossCrustMat);
    hump.position.set(0, 2.75, 0.35);

    const leftArm = new THREE.Group();
    leftArm.position.set(-2.0, 2.1, -0.2);
    const lFist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 1), sludgeMat);
    lFist.position.set(-0.5, -0.8, -0.6);
    leftArm.add(lFist);

    const rightArm = new THREE.Group();
    rightArm.position.set(2.0, 2.1, -0.2);
    const rFist = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 1), sludgeMat);
    rFist.position.set(0.5, -0.8, -0.6);
    rightArm.add(rFist);

    // Glowing toxic eyes & maw
    for (const sx of [-0.55, 0.55]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), toxicMat);
        eye.position.set(sx, 2.35, -1.75);
        mudGroup.add(eye);
    }

    // Orbiting mud boulders + AoE radius indicator ring
    const orbitRing = new THREE.Group();
    orbitRing.position.y = 1.2;
    for (let i = 0; i < 6; i++) {
        const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), sludgeMat);
        const a = (i * Math.PI * 2) / 6;
        shard.position.set(Math.cos(a) * 3.1, (i % 2) * 0.4, Math.sin(a) * 3.1);
        orbitRing.add(shard);
    }
    const auraDisc = new THREE.Mesh(
        new THREE.RingGeometry(4.4, 4.9, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x76ff33, transparent: true, opacity: 0.28, depthWrite: false })
    );
    auraDisc.position.y = 0.08;

    mudGroup.add(coreBody, hump, leftArm, rightArm, orbitRing, auraDisc);
    mudGroup.userData = { leftArm, rightArm, orbitRing, coreBody };

    // 7C. The Abyssal Leviathan (longWorm): 12-Segment Articulated Sea Serpent with Fanged Maw & Dorsal Spines
    const wormGroup = new THREE.Group();
    const carapaceMat = new THREE.MeshStandardMaterial({ color: 0x5b126b, roughness: 0.4, metalness: 0.35, flatShading: true });
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0xb8338a, roughness: 0.55 });
    const spineMat = new THREE.MeshBasicMaterial({ color: 0xff3df0 });
    const fangMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });

    const segments = [];
    const segCount = 12;
    for (let s = 0; s < segCount; s++) {
        const seg = new THREE.Group();
        const t = s / (segCount - 1);
        const radius = s === 0 ? 1.25 : 1.2 * (1 - t * 0.68);
        // Position along Z from -5 (head) to +5 (tail) so lookAt aligns the head toward target
        seg.position.z = (s - (segCount - 1) / 2) * 0.95;

        const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), carapaceMat);
        body.scale.set(1.0, 0.88, 1.25);
        body.castShadow = true;
        seg.add(body);

        // Dorsal bioluminescent fin spine
        const spine = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.28, radius * 1.1, 5), s % 2 === 0 ? spineMat : bellyMat);
        spine.position.y = radius * 0.95;
        spine.rotation.x = 0.35;
        seg.add(spine);

        // Fanged Leviathan Head on Segment 0
        if (s === 0) {
            for (const sx of [-0.5, 0.5]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffee38 }));
                eye.position.set(sx, 0.45, 0.85);
                seg.add(eye);
            }
            for (let f = 0; f < 6; f++) {
                const angle = (f / 6) * Math.PI * 2;
                const fang = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 5), fangMat);
                fang.rotation.x = Math.PI / 2;
                fang.position.set(Math.cos(angle) * 0.65, Math.sin(angle) * 0.55, 1.25);
                seg.add(fang);
            }
        }
        wormGroup.add(seg);
        segments.push(seg);
    }
    wormGroup.userData = { segments };

    return {
        whiteGuy: wizardGroup,
        mudAlien: mudGroup,
        longWorm: wormGroup,
    };
}

export function animateAAAEnemies(enemyMeshes, enemiesData, t) {
    // Wizard staff & orb pulse
    const wiz = enemyMeshes.whiteGuy;
    if (wiz?.visible && wiz.userData.staffRing) {
        wiz.userData.staffRing.rotation.x = t * 2.4;
        wiz.userData.staffRing.rotation.y = t * 1.7;
        wiz.userData.staffGroup.position.y = 1.6 + Math.sin(t * 3.5) * 0.18;
    }

    // Mud Behemoth arm smash & orbiting boulder vortex
    const mud = enemyMeshes.mudAlien;
    if (mud?.visible && mud.userData.orbitRing) {
        mud.userData.orbitRing.rotation.y = t * 1.6;
        mud.userData.leftArm.rotation.x = Math.sin(t * 2.8) * 0.45;
        mud.userData.rightArm.rotation.x = -Math.sin(t * 2.8) * 0.45;
        mud.userData.coreBody.rotation.y = Math.sin(t * 0.9) * 0.2;
    }

    // Leviathan sinusoidal slither (faster when charging!)
    const worm = enemyMeshes.longWorm;
    if (worm?.visible && worm.userData.segments) {
        const charging = enemiesData?.longWorm?.state === 'charging';
        const freq = charging ? 11.0 : 4.2;
        const amp = charging ? 0.55 : 0.95;
        const segs = worm.userData.segments;
        for (let i = 0; i < segs.length; i++) {
            const phase = t * freq - i * 0.55;
            segs[i].position.x = Math.sin(phase) * amp * (0.35 + (i / segs.length) * 0.65);
            segs[i].position.y = Math.cos(phase * 0.8) * 0.22;
        }
    }
}

// ─── 8. Articulated Harbor Citizens & Police Officers ───────────────────
export function createAAANpcMesh(type) {
    const isPolice = type === 'police';
    const group = new THREE.Group();

    const suitMat = new THREE.MeshStandardMaterial({ color: isPolice ? 0x1d4ed8 : 0x64748b, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.65 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.35), darkMat);
    legs.position.y = -0.55;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.85, 0.42), suitMat);
    torso.position.y = 0.25;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), skinMat);
    head.position.y = 0.92;

    group.add(legs, torso, head);

    if (isPolice) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.16, 10), darkMat);
        cap.position.y = 1.15;
        const badge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0xffd700 }));
        badge.position.set(-0.18, 0.42, -0.22);
        group.add(cap, badge);
    }

    return group;
}
