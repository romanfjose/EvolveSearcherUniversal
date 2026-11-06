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

// ─── 2. Custom GLSL Gerstner Wave & Per-Pixel Smooth Specular River Surface (Helmet 04: Zero Checkerboard Artifacts) ──────
export function createAAARiverMesh(riverWidth, riverLength, waterTex) {
    const geo = new THREE.PlaneGeometry(riverWidth + 16, riverLength + 200, 96, 480);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uClarity: { value: 0 },
            uMudColor: { value: new THREE.Color(0x1e3846) },
            uClearColor: { value: new THREE.Color(0x0b4f6c) },
            uDeepColor: { value: new THREE.Color(0x062338) },
            uSkyColor: { value: new THREE.Color(0x6290b8) },
            uSunColor: { value: new THREE.Color(0xffdca8) },
            uSunDir: { value: new THREE.Vector3(0.28, 0.55, -0.78).normalize() },
            uHalfWidth: { value: riverWidth * 0.5 },
            uMap: { value: waterTex },
        },
        vertexShader: `
            uniform float uTime;
            varying vec3 vWorldPos;
            varying vec2 vUv;
            varying float vWaveH;

            void main() {
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);

                // Smooth Gerstner-style river swell flowing toward -Z
                float zFlow = wp.z + uTime * 9.5;
                float w1 = sin(wp.x * 0.32 + zFlow * 0.18) * 0.07;
                float w2 = cos(wp.x * 0.58 - zFlow * 0.26) * 0.035;
                float h = w1 + w2;

                wp.y += h;
                vWaveH = h;
                vWorldPos = wp.xyz;

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
            varying vec2 vUv;
            varying float vWaveH;

            // Smooth procedural ripple noise (computed per-pixel to eliminate triangle grid checkerboards)
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
                // Per-pixel continuous analytical wave normal (zero vertex-grid Mach bands or diamond checkerboards)
                float zFlow = vWorldPos.z + uTime * 9.5;
                float dx = 0.32 * 0.07 * cos(vWorldPos.x * 0.32 + zFlow * 0.18)
                         - 0.58 * 0.035 * sin(vWorldPos.x * 0.58 - zFlow * 0.26)
                         + 0.025 * sin(vWorldPos.x * 1.4 + zFlow * 0.6);
                float dz = 0.18 * 0.07 * cos(vWorldPos.x * 0.32 + zFlow * 0.18)
                         + 0.26 * 0.035 * sin(vWorldPos.x * 0.58 - zFlow * 0.26);
                vec3 N = normalize(vec3(-dx * 1.35, 1.0, -dz * 1.35));
                vec3 V = normalize(cameraPosition - vWorldPos);

                // Deep readable slate-teal river palette so rafts, planks, and monsters pop in 0.5s squint test
                float downstream = clamp(-vWorldPos.z / 1500.0, 0.0, 1.0);
                float clarity = clamp(mix(downstream, uClarity, 0.5), 0.0, 1.0);
                vec3 shallow = mix(uMudColor, uClearColor, clarity);
                float centerDepth = 1.0 - clamp(abs(vWorldPos.x) / uHalfWidth, 0.0, 1.0);
                vec3 baseCol = mix(shallow, uDeepColor, centerDepth * 0.62);

                // Flowing current streaks & subtle caustics
                vec2 flowUv = vec2(vWorldPos.x * 0.38, vWorldPos.z * 0.15 + uTime * 2.4);
                float n1 = noise(flowUv * 2.2);
                float n2 = noise(flowUv * 4.5 - vec2(0.0, uTime * 1.5));
                float caustic = smoothstep(0.60, 0.88, n1 * 0.6 + n2 * 0.4);
                baseCol += vec3(0.14, 0.28, 0.35) * caustic * (0.22 + 0.35 * clarity);

                // Shore foam along riverbanks
                float bankDist = abs(abs(vWorldPos.x) - uHalfWidth);
                float shoreFoam = smoothstep(2.4, 0.2, bankDist) * (0.45 + 0.55 * n1);

                // Smooth Fresnel sky reflection + soft sunset horizon sheen
                float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.6);
                vec3 col = mix(baseCol, uSkyColor, fresnel * 0.38);

                vec3 H = normalize(uSunDir + V);
                float spec = pow(max(dot(N, H), 0.0), 42.0);
                col += uSunColor * spec * 0.32;

                // Subtle wave crest highlights & bank foam
                col += vec3(0.82, 0.92, 0.98) * smoothstep(0.06, 0.11, vWaveH) * 0.18;
                col = mix(col, vec3(0.90, 0.95, 1.0), clamp(shoreFoam * 0.6, 0.0, 0.75));

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

    // ─── Act I Biome Architecture: Redwood Waterwheel Mills on Outer Banks (z = -55..-445) ───
    const act1Group = new THREE.Group();
    for (const wz of [-55, -110, -310, -390, -445]) {
        const side = wz % 2 === 0 ? 1 : -1;
        const millHouse = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 11), pierWoodMat);
        millHouse.position.set(side * (halfW + 7), 3.8, wz);
        const millRoof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 4, 4), roofTileMat);
        millRoof.rotation.y = Math.PI / 4;
        millRoof.position.set(side * (halfW + 7), 9.2, wz);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.45, 8, 16), pierWoodMat);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(side * (halfW + 1.2), 3.6, wz);
        act1Group.add(millHouse, millRoof, wheel);
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

// ─── 4. Sculpted Obstacles: Safe Wood Planks, Natural Vegetation Borders (`Costado`) & Canyon Trees
export function createAAAObstacleMesh(isPlank, width, height, depth, size, woodMaterial, vegetationMaterial) {
    if (isPlank === 'vegetation') {
        // Natural Vegetation Border on the `costado` (flat-topped mossy grass ledge you can jump onto to be safe from the White Guy!)
        const vegGroup = new THREE.Group();
        const turfMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.85, flatShading: true });
        const mossMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8, flatShading: true });
        const soilMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.92, flatShading: true });

        const soilBase = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, height * 1.6, depth * 0.96), soilMat);
        soilBase.position.y = -height * 0.55;
        vegGroup.add(soilBase);

        const grassTop = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.85, depth), turfMat);
        grassTop.castShadow = true;
        grassTop.receiveShadow = true;
        vegGroup.add(grassTop);

        // Natural reed & bush tufts along the back edge so the flat landing deck stays wide open for jumping
        for (let i = 0; i < 4; i++) {
            const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65 + (i % 2) * 0.2, 0), mossMat);
            const bz = -depth * 0.35 + (i / 3) * (depth * 0.7);
            bush.position.set(0, height * 0.55, bz);
            bush.scale.set(1.2, 0.65, 1.1);
            vegGroup.add(bush);
        }
        return vegGroup;
    }

    if (isPlank) {
        const group = new THREE.Group();
        const plankCount = 5;
        const pDepth = depth / plankCount;
        const beaconGoldMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });

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

// ─── 6. Small 1-Person Bright Colored Plastic Inflatable Raft & Crew ─────
export function createAAARaftAndCrew(color, upgrades, raftSize, woodMaterial, paddleMaterial, hammerMaterial, motorMaterial, propMaterial) {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    group.add(tilt);

    // 6A. Satin PVC 1-Person Plastic Inflatable Dinghy (Helmet 04: Grounded high-contrast watercraft colors, zero neon pink/purple blowout)
    const raft = new THREE.Group();
    const rawHex = typeof color === 'number' ? color : new THREE.Color(color).getHex();
    // Map raw programmer primaries to rich, saturated marine rescue colors that read cleanly under ACES tone mapping
    const marinePaletteMap = {
        0xef4444: 0xc8281e, // Crimson Rescue Red
        0x3b82f6: 0x185adb, // Deep Cobalt Marine Blue
        0x22c55e: 0x1b8a4b, // Emerald Moss Green
        0xeab308: 0xd98218, // Rescue Amber Ochre
    };
    const baseCol = new THREE.Color(marinePaletteMap[rawHex] || color);
    const floorCol = baseCol.clone().multiplyScalar(0.58);
    const highlightCol = baseCol.clone().lerp(new THREE.Color(0xffffff), 0.08);

    const vinylTubeMat = new THREE.MeshStandardMaterial({
        color: highlightCol,
        emissive: baseCol,
        emissiveIntensity: 0.05,
        roughness: 0.36,
        metalness: 0.04,
    });
    const vinylFloorMat = new THREE.MeshStandardMaterial({
        color: floorCol,
        roughness: 0.35,
        metalness: 0.04,
    });
    const patchMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.3 });
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a434e, metalness: 0.75, roughness: 0.32 });

    const tubeR = 0.36;
    const halfW = raftSize.w * 0.48;
    const halfD = raftSize.d * 0.44;

    // Left & Right inflatable side pontoon tubes
    for (const side of [-1, 1]) {
        const sideTube = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, raftSize.d * 0.88, 14), vinylTubeMat);
        sideTube.rotation.x = Math.PI / 2;
        sideTube.position.set(side * halfW, 0.08, 0);
        sideTube.castShadow = true;
        sideTube.receiveShadow = true;
        raft.add(sideTube);

        // Dark rubber seam rings & yellow safety rope patches on the inflatable tubes
        for (const sz of [-halfD * 0.55, 0, halfD * 0.55]) {
            const seam = new THREE.Mesh(new THREE.TorusGeometry(tubeR + 0.012, 0.022, 8, 16), seamMat);
            seam.position.set(side * halfW, 0.08, sz);
            raft.add(seam);
        }
        const grabPatch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.75), patchMat);
        grabPatch.position.set(side * (halfW + tubeR * 0.88), 0.14, 0);
        raft.add(grabPatch);
    }

    // Front (Bow) & Back (Stern) puffy inflatable cross-tubes + rounded corner joints
    for (const end of [-1, 1]) {
        const crossTube = new THREE.Mesh(new THREE.CylinderGeometry(tubeR * 0.96, tubeR * 0.96, raftSize.w * 0.96, 14), vinylTubeMat);
        crossTube.rotation.z = Math.PI / 2;
        crossTube.position.set(0, 0.1, end * halfD);
        crossTube.castShadow = true;
        raft.add(crossTube);

        for (const side of [-1, 1]) {
            const cornerSphere = new THREE.Mesh(new THREE.SphereGeometry(tubeR * 1.02, 12, 12), vinylTubeMat);
            cornerSphere.position.set(side * halfW, 0.09, end * halfD);
            cornerSphere.castShadow = true;
            raft.add(cornerSphere);
        }
    }

    // Ribbed inflatable inner floor cushion
    const floorMatMesh = new THREE.Mesh(new THREE.BoxGeometry(raftSize.w * 0.86, 0.16, raftSize.d * 0.84), vinylFloorMat);
    floorMatMesh.position.set(0, -0.04, 0);
    floorMatMesh.receiveShadow = true;
    raft.add(floorMatMesh);

    for (let r = -2; r <= 2; r++) {
        const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, raftSize.w * 0.78, 8), vinylFloorMat);
        rib.rotation.z = Math.PI / 2;
        rib.position.set(0, 0.04, r * 0.42);
        raft.add(rib);
    }

    // Optional Armor Upgrade: Reinforced Bumper Guards & Bow Shield
    if (upgrades.includes('armor')) {
        for (const side of [-1, 1]) {
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, raftSize.d * 0.88), ironMat);
            plate.position.set(side * (raftSize.w * 0.66), 0.18, 0);
            plate.castShadow = true;
            raft.add(plate);
        }
        const bowShield = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), ironMat);
        bowShield.rotation.x = -Math.PI / 2;
        bowShield.rotation.z = Math.PI / 4;
        bowShield.position.set(0, 0.14, -raftSize.d * 0.62);
        raft.add(bowShield);
    }

    // Optional Twin-Exhaust Outboard Motor Upgrade
    let prop = null;
    if (upgrades.includes('motor')) {
        const motor = new THREE.Group();
        motor.position.set(0, raftSize.h / 2 + 0.22, raftSize.d / 2 + 0.26);

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

    // 6B. Articulated Co-Op Survivor Matching the Inflatable Color (Red, Blue, Green, Yellow)
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf4c29f, roughness: 0.65 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: highlightCol, emissive: baseCol, emissiveIntensity: 0.12, roughness: 0.45 });
    const vestMat = new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.4 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.75 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });

    const character = new THREE.Group();
    character.position.y = raftSize.h / 2;

    // Legs
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.38, 4, 8), pantsMat);
    leftLeg.position.set(-0.22, 0.32, 0.05);
    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.38, 4, 8), pantsMat);
    rightLeg.position.set(0.22, 0.32, -0.05);

    // Torso + Colored Life Jacket
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.82, 0.44), shirtMat);
    torso.position.y = 0.88;
    torso.castShadow = true;
    const lifeVest = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.62, 0.5), vestMat);
    lifeVest.position.y = 0.92;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.1, 0.52), patchMat);
    belt.position.y = 0.82;

    // Head + Colored Cap/Bandana
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

    // 6C. Plastic Oar / Squeaky Mallet Weapon
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
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.85), patchMat);
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

// ─── 7. The 3 Original Dream Entities (White Guy in Wizard Hat, 3-Legged Headless Mud Alien, Nokia-Vector Long Worm) ───
export function createAAAEnemyMeshes(woodMaterial) {
    // 7A. The Annoying White Entity with a Wizard Hat (`whiteGuy`):
    // "a white guy with wizard hat but its not really a wizard, it's just some annoying entity that wants to grab you and your ship and throw you behind"
    const whiteGuyGroup = new THREE.Group();
    const starkWhiteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xe2e8f0,
        emissiveIntensity: 0.28,
        roughness: 0.35,
    });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55 });
    const hatBandMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
    const darkEyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    // Lanky stark-white humanoid torso & legs wading/swimming directly in the river (no boat, no magic staff!)
    const wgTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.35, 6, 12), starkWhiteMat);
    wgTorso.position.y = 1.35;
    wgTorso.castShadow = true;

    const wgLeftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.85, 4, 8), starkWhiteMat);
    wgLeftLeg.position.set(-0.26, 0.35, 0);
    const wgRightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.85, 4, 8), starkWhiteMat);
    wgRightLeg.position.set(0.26, 0.35, 0);

    // Long lanky white grabbing arms reaching out toward your inflatable raft
    const wgLeftArm = new THREE.Group();
    wgLeftArm.position.set(-0.62, 1.85, -0.1);
    const lArmMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.15, 4, 8), starkWhiteMat);
    lArmMesh.rotation.x = Math.PI / 2.2;
    lArmMesh.position.set(0, -0.1, -0.55);
    const lHandMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), starkWhiteMat);
    lHandMesh.position.set(0, -0.15, -1.15);
    wgLeftArm.add(lArmMesh, lHandMesh);

    const wgRightArm = new THREE.Group();
    wgRightArm.position.set(0.62, 1.85, -0.1);
    const rArmMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.15, 4, 8), starkWhiteMat);
    rArmMesh.rotation.x = Math.PI / 2.2;
    rArmMesh.position.set(0, -0.1, -0.55);
    const rHandMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), starkWhiteMat);
    rHandMesh.position.set(0, -0.15, -1.15);
    wgRightArm.add(rArmMesh, rHandMesh);

    // Uncanny blank white head + hollow dark eyes + annoying smirk
    const wgHead = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 12), starkWhiteMat);
    wgHead.position.y = 2.48;
    wgHead.castShadow = true;
    for (const sx of [-0.15, 0.15]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), darkEyeMat);
        eye.position.set(sx, 2.52, -0.41);
        whiteGuyGroup.add(eye);
    }
    const wgMouth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.06), darkEyeMat);
    wgMouth.position.set(0, 2.34, -0.42);
    wgMouth.rotation.z = 0.12;

    // Crooked Wizard Hat ("a white guy with wizard hat but its not really a wizard")
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.08, 14), hatMat);
    hatBrim.position.y = 2.86;
    hatBrim.rotation.z = 0.08;
    const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.56, 0.14, 12), hatBandMat);
    hatBand.position.y = 2.94;
    const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.56, 1.65, 12), hatMat);
    hatCone.position.set(0.06, 3.68, 0.05);
    hatCone.rotation.z = -0.14;
    hatCone.rotation.x = -0.12;

    // Helmet 05 Telegraph Ring: visible 0.85s wind-up ring before the White Guy's grab lunge so players can block/dodge/jump on planks
    const wgTelegraphRing = new THREE.Mesh(
        new THREE.RingGeometry(2.6, 3.1, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })
    );
    wgTelegraphRing.position.y = 0.14;
    wgTelegraphRing.visible = false;

    whiteGuyGroup.add(wgTorso, wgLeftLeg, wgRightLeg, wgLeftArm, wgRightArm, wgHead, wgMouth, hatBrim, hatBand, hatCone, wgTelegraphRing);
    whiteGuyGroup.userData = { wgLeftArm, wgRightArm, wgLeftLeg, wgRightLeg, wgTorso, wgTelegraphRing, windupProgress: 0, staggered: false };

    // 7B. The 3-Legged Headless Mud Alien (`mudAlien`):
    // "brown green... like mud color, doesn't have a form, maybe is three legged no head, like simple, but weird, with a small mouth"
    const mudGroup = new THREE.Group();
    const mudBrownGreenMat = new THREE.MeshStandardMaterial({
        color: 0x5c5335,
        roughness: 0.92,
        metalness: 0.02,
        flatShading: true,
    });
    const mudOliveMat = new THREE.MeshStandardMaterial({
        color: 0x495632,
        roughness: 0.88,
        flatShading: true,
    });
    const smallMouthMat = new THREE.MeshBasicMaterial({ color: 0x14110b });

    // Formless, headless lumpy mud-colored torso blob
    const coreBody = new THREE.Group();
    coreBody.position.y = 2.05;
    const blobMain = new THREE.Mesh(new THREE.DodecahedronGeometry(1.75, 1), mudBrownGreenMat);
    blobMain.scale.set(1.15, 0.92, 1.05);
    blobMain.castShadow = true;
    const blobLump1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.25, 1), mudOliveMat);
    blobLump1.position.set(-0.55, 0.35, 0.25);
    const blobLump2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 1), mudBrownGreenMat);
    blobLump2.position.set(0.6, 0.2, -0.2);

    // Small dark mouth right in the front-center of the headless body (no head, no eyes!)
    const smallMouthRim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 8, 14), mudOliveMat);
    smallMouthRim.position.set(0, 0.05, -1.72);
    const smallMouthHole = new THREE.Mesh(new THREE.CircleGeometry(0.26, 12), smallMouthMat);
    smallMouthHole.position.set(0, 0.05, -1.76);
    smallMouthHole.rotation.y = Math.PI;
    coreBody.add(blobMain, blobLump1, blobLump2, smallMouthRim, smallMouthHole);

    // THREE tripod legs ("maybe is three legged no head, like simple, but weird")
    const tripodLegs = [];
    const legAngles = [-Math.PI * 0.38, Math.PI * 0.38, Math.PI]; // Front-left, Front-right, Rear-center tripod!
    for (let i = 0; i < 3; i++) {
        const legPivot = new THREE.Group();
        const a = legAngles[i];
        legPivot.position.set(Math.sin(a) * 1.15, 1.45, -Math.cos(a) * 1.05);
        const upperLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.25, 5, 8), i === 2 ? mudOliveMat : mudBrownGreenMat);
        upperLeg.position.set(Math.sin(a) * 0.25, -0.65, -Math.cos(a) * 0.25);
        upperLeg.rotation.z = -Math.sin(a) * 0.22;
        upperLeg.rotation.x = Math.cos(a) * 0.18;
        upperLeg.castShadow = true;
        const footPad = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mudOliveMat);
        footPad.position.set(Math.sin(a) * 0.42, -1.35, -Math.cos(a) * 0.42);
        footPad.scale.set(1.2, 0.55, 1.2);
        legPivot.add(upperLeg, footPad);
        mudGroup.add(legPivot);
        tripodLegs.push(legPivot);
    }

    // Subtle muddy AoE slam ring on the ground/water (shows the radius that hits City pedestrians to trigger Police!)
    const auraDisc = new THREE.Mesh(
        new THREE.RingGeometry(4.4, 4.95, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xa3b16b, transparent: true, opacity: 0.35, depthWrite: false })
    );
    auraDisc.position.y = 0.12;

    mudGroup.add(coreBody, auraDisc);
    mudGroup.userData = { tripodLegs, coreBody, auraDisc };

    // 7C. The Long Monstrous Nokia-Vector Worm (`longWorm`):
    // "similar to the second alien too, like a just long like snake, but not snake moving, more like it only has one vector.
    //  And its really long, but only can turn in straight angles... more like that worm game, that one from the phones from long ago,
    //  that type of movement, that you know he is moving but its hard to tell because he is so long, like the only way to see he is moving is to look at his head"
    const wormGroup = new THREE.Group();
    const wormMudMat = new THREE.MeshStandardMaterial({ color: 0x4f4a32, roughness: 0.88, metalness: 0.04, flatShading: true });
    const wormRingMat = new THREE.MeshStandardMaterial({ color: 0x3e472b, roughness: 0.9, flatShading: true });
    const headEyeMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });

    const segments = [];
    const segCount = 26; // Super long (~23m!) uniform Nokia-worm body
    for (let s = 0; s < segCount; s++) {
        const seg = new THREE.Group();
        // Uniform thickness along the body so it's hard to tell it's moving unless you look at the head!
        const radius = s === 0 ? 1.18 : s >= segCount - 2 ? 0.95 : 1.12;
        seg.position.set(0, 0.35, s * 0.88);

        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, 0.92, 10).rotateX(Math.PI / 2),
            s % 2 === 0 ? wormMudMat : wormRingMat
        );
        body.castShadow = true;
        seg.add(body);

        // Distinct Head on Segment 0 so looking at its head tells you where it's striking
        if (s === 0) {
            const headCap = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.02, 10, 10), wormMudMat);
            headCap.position.z = -0.35;
            seg.add(headCap);

            const mouthHole = new THREE.Mesh(new THREE.CircleGeometry(0.48, 10), smallMouthMat);
            mouthHole.position.set(0, 0, -1.42);
            mouthHole.rotation.y = Math.PI;
            seg.add(mouthHole);

            for (const sx of [-0.48, 0.48]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), headEyeMat);
                eye.position.set(sx, 0.48, -1.05);
                seg.add(eye);
            }
        }
        wormGroup.add(seg);
        segments.push(seg);
    }
    wormGroup.userData = { segments, pathHistory: [] };

    return {
        whiteGuy: whiteGuyGroup,
        mudAlien: mudGroup,
        longWorm: wormGroup,
    };
}

export function animateAAAEnemies(enemyMeshes, enemiesData, t) {
    // 1. White Guy in Wizard Hat: wading stride + 0.85s overhead wind-up telegraph before grab + stagger slump on block/dodge
    const wiz = enemyMeshes.whiteGuy;
    if (wiz?.visible && wiz.userData.wgLeftArm) {
        const wp = wiz.userData.windupProgress || 0;
        const stag = wiz.userData.staggered || false;
        if (stag) {
            wiz.userData.wgLeftArm.rotation.x = 0.65;
            wiz.userData.wgRightArm.rotation.x = 0.65;
            wiz.userData.wgTorso.position.y = 1.05;
            if (wiz.userData.wgTelegraphRing) wiz.userData.wgTelegraphRing.visible = false;
        } else if (wp > 0.01) {
            // Unmistakable 0.85s wind-up: raises both stark-white arms high overhead before lunging!
            wiz.userData.wgLeftArm.rotation.x = -1.2 - wp * 1.35;
            wiz.userData.wgRightArm.rotation.x = -1.2 - wp * 1.35;
            wiz.userData.wgLeftArm.rotation.y = -0.35 * wp;
            wiz.userData.wgRightArm.rotation.y = 0.35 * wp;
            wiz.userData.wgTorso.position.y = 1.35 + wp * 0.42;
            if (wiz.userData.wgTelegraphRing) {
                wiz.userData.wgTelegraphRing.visible = true;
                wiz.userData.wgTelegraphRing.scale.setScalar(1.35 - wp * 0.55);
                wiz.userData.wgTelegraphRing.material.opacity = 0.35 + wp * 0.55;
            }
        } else {
            const reach = Math.sin(t * 7.5) * 0.32;
            wiz.userData.wgLeftArm.rotation.x = reach;
            wiz.userData.wgRightArm.rotation.x = -reach;
            wiz.userData.wgLeftArm.rotation.y = Math.cos(t * 5.0) * 0.18;
            wiz.userData.wgRightArm.rotation.y = -Math.cos(t * 5.0) * 0.18;
            wiz.userData.wgLeftLeg.rotation.x = -reach * 1.2;
            wiz.userData.wgRightLeg.rotation.x = reach * 1.2;
            wiz.userData.wgTorso.position.y = 1.35 + Math.abs(Math.sin(t * 7.5)) * 0.12;
            if (wiz.userData.wgTelegraphRing) wiz.userData.wgTelegraphRing.visible = false;
        }
    }

    // 2. 3-Legged Headless Mud Alien: heavy tripod gait + 0.85s rearing slam wind-up telegraph + pulsing mud AoE ring
    const mud = enemyMeshes.mudAlien;
    if (mud?.visible && mud.userData.tripodLegs) {
        const wp = mud.userData.windupProgress || 0;
        const legs = mud.userData.tripodLegs;
        for (let i = 0; i < legs.length; i++) {
            const phase = t * 4.5 + (i * Math.PI * 2) / 3;
            legs[i].rotation.x = wp > 0.01 ? -0.45 * wp : Math.sin(phase) * 0.38;
            legs[i].rotation.z = Math.cos(phase) * 0.18;
        }
        mud.userData.coreBody.position.y = 2.05 + wp * 0.85 + Math.sin(t * 4.5) * 0.14;
        mud.userData.coreBody.rotation.z = Math.cos(t * 2.2) * 0.08;
        if (mud.userData.auraDisc) {
            const pulse = wp > 0.01 ? 1.15 - wp * 0.25 : 1.0 + Math.sin(t * 5.0) * 0.06;
            mud.userData.auraDisc.scale.setScalar(pulse);
            mud.userData.auraDisc.material.opacity = wp > 0.01 ? 0.55 + wp * 0.35 : 0.32;
        }
    }

    // 3. Long Monstrous Worm: True Nokia-Phone Snake Polyline Vector Trail!
    // Every segment slides strictly along the straight-line vector path & sharp-angle turn corners behind the head
    // (ZERO sinusoidal wiggle, so the body stays straight along its vector and you look at the head to see it moving!)
    const worm = enemyMeshes.longWorm;
    if (worm?.visible && worm.userData.segments) {
        const segs = worm.userData.segments;
        const hist = worm.userData.pathHistory;
        const headX = worm.position.x;
        const headZ = worm.position.z;

        // Keep wormGroup rotation neutral in world space so segment offsets trace exact world-space straight lines & sharp corners
        worm.rotation.set(0, 0, 0);

        if (hist.length === 0) {
            for (let i = 0; i < segs.length; i++) {
                hist.push({ x: headX, z: headZ + i * 0.88 });
            }
        } else {
            const dHead = Math.hypot(headX - hist[0].x, headZ - hist[0].z);
            if (dHead > 0.08) {
                hist.unshift({ x: headX, z: headZ });
                if (hist.length > 260) hist.length = 260;
            }
        }

        const spacing = 0.88;
        let pathIdx = 0;
        let accumDist = 0;

        for (let s = 0; s < segs.length; s++) {
            const targetDist = s * spacing;
            while (pathIdx < hist.length - 1) {
                const p0 = hist[pathIdx];
                const p1 = hist[pathIdx + 1];
                const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
                if (accumDist + segLen >= targetDist || segLen < 1e-5) {
                    const frac = segLen > 1e-5 ? (targetDist - accumDist) / segLen : 0;
                    const wx = p0.x + (p1.x - p0.x) * frac;
                    const wz = p0.z + (p1.z - p0.z) * frac;
                    segs[s].position.set(wx - headX, 0.38, wz - headZ);
                    if (s === 0) {
                        const targetPos = enemiesData?.longWorm?.targetPos;
                        if (targetPos) {
                            const angle = Math.atan2(-(targetPos.x - headX), -(targetPos.z - headZ));
                            segs[0].rotation.y = angle;
                        } else if (segLen > 1e-4) {
                            const angle = Math.atan2(-(p0.x - p1.x), -(p0.z - p1.z));
                            segs[0].rotation.y = angle;
                        }
                    } else if (segLen > 1e-4) {
                        const angle = Math.atan2(-(p0.x - p1.x), -(p0.z - p1.z));
                        segs[s].rotation.y = angle;
                    }
                    break;
                }
                accumDist += segLen;
                pathIdx++;
            }
            if (pathIdx >= hist.length - 1) {
                const last = hist[hist.length - 1];
                segs[s].position.set(last.x - headX, 0.38, last.z - headZ);
            }
        }
    }
}

// ─── 8. Articulated Harbor Citizens & Armed Police Officers ─────────────
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

        // Outstretched Police Arm + 3D Handgun + Muzzle Flash
        const gunArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.45, 4, 8), suitMat);
        gunArm.rotation.x = Math.PI / 2;
        gunArm.position.set(0.42, 0.42, -0.35);
        const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.38), darkMat);
        pistol.position.set(0.42, 0.46, -0.68);
        const muzzleFlash = new THREE.Mesh(
            new THREE.ConeGeometry(0.18, 0.45, 8).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        muzzleFlash.position.set(0.42, 0.46, -1.02);
        muzzleFlash.visible = false;

        group.add(cap, badge, gunArm, pistol, muzzleFlash);
        group.userData = { muzzleFlash };
    }

    return group;
}
