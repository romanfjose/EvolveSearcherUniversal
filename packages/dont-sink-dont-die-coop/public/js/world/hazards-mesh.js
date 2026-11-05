/**
 * Three.js Renderer & Animated Shader/Particle Builders for River Hazards
 * (Rapids Chevrons, Spinning Vortex Funnels, Wooden Ramps, Floating Mines, Coin Rings)
 *
 * Designed for "Don't Sink, Don't Die" AAA visuals.
 * Accepts `THREE` injected (or uses standard THREE globals/modules) with zero asset external dependencies.
 */

// ─── 1. Rapids Chevron Mesh & Shader Builder ─────────────────────────────
/**
 * Creates a glowing, animated procedural rapids chevron zone.
 */
export function createRapidsMesh(THREE, rapidsConfig) {
    const width = rapidsConfig.width || 10;
    const length = rapidsConfig.length || 24;

    const group = new THREE.Group();
    group.position.set(rapidsConfig.x || 0, 0.05, rapidsConfig.z || 0);
    if (rapidsConfig.angle) {
        group.rotation.y = rapidsConfig.angle;
    }

    // A. Base Foam Surge Plane with Custom Shader
    const planeGeo = new THREE.PlaneGeometry(width, length, 16, 32);
    const planeMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(0x7df9ff) },
            uFoamColor: { value: new THREE.Color(0xffffff) },
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor;
            uniform vec3 uFoamColor;
            varying vec2 vUv;
            varying vec3 vWorldPos;

            void main() {
                // Moving chevron stripes pointing downriver (uv.y flow)
                float flow = vUv.y * 6.0 + uTime * 4.5;
                float chevron = abs(vUv.x - 0.5) * 2.2;
                float wave = sin((flow - chevron) * 3.14159);
                float sharpChevron = smoothstep(0.4, 0.95, wave);

                // Edge fade along river width & length
                float fadeX = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
                float fadeY = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
                float edgeMask = fadeX * fadeY;

                vec3 col = mix(uColor, uFoamColor, sharpChevron);
                float alpha = (sharpChevron * 0.75 + 0.15) * edgeMask;
                gl_FragColor = vec4(col, alpha);
            }
        `,
    });
    const surgeMesh = new THREE.Mesh(planeGeo, planeMat);
    surgeMesh.rotation.x = -Math.PI / 2;
    group.add(surgeMesh);

    // B. Procedural 3D Chevron Arrow Markers
    const chevronCount = 5;
    const chevronMat = new THREE.MeshBasicMaterial({
        color: 0x38f2ff,
        transparent: true,
        opacity: 0.85,
    });

    const chevronArrows = [];
    for (let i = 0; i < chevronCount; i++) {
        const arrowGroup = new THREE.Group();
        const halfSpan = width * 0.38;
        const armLength = halfSpan * 1.1;

        // Left and right angled chevron wings
        const armGeo = new THREE.BoxGeometry(0.35, 0.08, armLength);
        const leftWing = new THREE.Mesh(armGeo, chevronMat);
        leftWing.position.set(-halfSpan * 0.45, 0.04, armLength * 0.25);
        leftWing.rotation.y = 0.65;

        const rightWing = new THREE.Mesh(armGeo, chevronMat);
        rightWing.position.set(halfSpan * 0.45, 0.04, armLength * 0.25);
        rightWing.rotation.y = -0.65;

        arrowGroup.add(leftWing, rightWing);
        const zOffset = (i - (chevronCount - 1) * 0.5) * (length / chevronCount);
        arrowGroup.position.set(0, 0.04, zOffset);
        group.add(arrowGroup);
        chevronArrows.push(arrowGroup);
    }

    group.userData = {
        type: 'rapids',
        shaderMat: planeMat,
        chevronArrows,
        config: rapidsConfig,
    };
    return group;
}

// ─── 2. Whirlpool Vortex Funnel Mesh & Shader Builder ────────────────────
/**
 * Creates a spinning 3D vortex depression mesh with tangential foam trails.
 */
export function createWhirlpoolMesh(THREE, whirlpoolConfig) {
    const radius = whirlpoolConfig.radius || 9.0;
    const depth = whirlpoolConfig.depth || 1.8;
    const clockwise = whirlpoolConfig.clockwise ?? true;

    const group = new THREE.Group();
    group.position.set(whirlpoolConfig.x || 0, 0.0, whirlpoolConfig.z || 0);

    // A. 3D Vortex Funnel Cylinder/Cone Geometry
    const radialSegments = 40;
    const heightSegments = 16;
    const vortexGeo = new THREE.CylinderGeometry(radius, 0.4, depth, radialSegments, heightSegments, true);
    
    // Deform cylinder into parabolic whirlpool funnel
    const pos = vortexGeo.attributes?.position;
    if (pos && typeof pos.count === 'number') {
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vz = pos.getZ(i);

            const r = Math.hypot(vx, vz);
            const normR = Math.min(1.0, Math.max(0.0, r / radius));
            // Parabolic dip: deepest at core, flat at outer rim
            const funnelY = -depth * Math.pow(Math.max(0.0, 1.0 - normR), 2.2);
            pos.setY(i, funnelY);
        }
    }
    vortexGeo.computeVertexNormals?.();

    const vortexMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: {
            uTime: { value: 0 },
            uDir: { value: clockwise ? 1.0 : -1.0 },
            uDeepColor: { value: new THREE.Color(0x021727) },
            uMidColor: { value: new THREE.Color(0x09597c) },
            uFoamColor: { value: new THREE.Color(0x9bf5ff) },
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uDir;
            uniform vec3 uDeepColor;
            uniform vec3 uMidColor;
            uniform vec3 uFoamColor;
            varying vec2 vUv;
            varying vec3 vWorldPos;

            void main() {
                // Spiral UV coordinates
                float angle = vUv.x * 6.28318;
                float dist = vUv.y; // 0 at top rim, 1 at center bottom
                float swirl = angle * uDir + dist * 14.0 - uTime * 4.2;

                float spiralBand = sin(swirl * 3.0);
                float foam = smoothstep(0.35, 0.9, spiralBand) * (1.0 - smoothstep(0.85, 1.0, dist));

                vec3 col = mix(uDeepColor, uMidColor, dist);
                col = mix(col, uFoamColor, foam * 0.75);

                float alpha = 0.55 + 0.35 * foam;
                // Fade seamlessly into river surface at outer rim
                alpha *= smoothstep(0.0, 0.15, dist);
                gl_FragColor = vec4(col, alpha);
            }
        `,
    });

    const funnelMesh = new THREE.Mesh(vortexGeo, vortexMat);
    group.add(funnelMesh);

    // B. Outer Swirling Foam Particles / Ring
    const ringCount = 3;
    const ringGroup = new THREE.Group();
    for (let r = 0; r < ringCount; r++) {
        const ringRadius = radius * (0.45 + r * 0.25);
        const ringGeo = new THREE.TorusGeometry(ringRadius, 0.08, 6, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x5eead4,
            transparent: true,
            opacity: 0.35 - r * 0.08,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.position.y = -0.05 * (r + 1);
        ringGroup.add(ringMesh);
    }
    group.add(ringGroup);

    group.userData = {
        type: 'whirlpool',
        shaderMat: vortexMat,
        ringGroup,
        clockwise,
        config: whirlpoolConfig,
    };
    return group;
}

// ─── 3. Wooden Stunt Jump Ramp & Coin Rings Builder ───────────────────────
/**
 * Creates a rugged wooden stunt ramp with crossbeams, support pilings,
 * and glowing airborne bonus coin rings.
 */
export function createRampMesh(THREE, rampConfig) {
    const width = rampConfig.width || 6.0;
    const length = rampConfig.length || 8.0;
    const height = rampConfig.height || 2.2;

    const group = new THREE.Group();
    group.position.set(rampConfig.x || 0, 0, rampConfig.z || 0);

    const woodMat = new THREE.MeshStandardMaterial({
        color: 0x5a3d28,
        roughness: 0.85,
        metalness: 0.1,
    });
    const ironMat = new THREE.MeshStandardMaterial({
        color: 0x22262d,
        roughness: 0.45,
        metalness: 0.75,
    });
    const warningYellowMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

    // A. Inclined Timber Deck Planks (slanted toward -z lip)
    const plankCount = 7;
    const plankLength = length / plankCount;
    const deckGroup = new THREE.Group();

    for (let i = 0; i < plankCount; i++) {
        const pz = (plankCount - 1 - i) * plankLength - length * 0.5 + plankLength * 0.5;
        const progress = i / (plankCount - 1);
        const py = progress * height;

        const plank = new THREE.Mesh(
            new THREE.BoxGeometry(width * 0.96, 0.16, plankLength * 0.92),
            woodMat
        );
        // Slanted angle matching ramp slope
        const slopeAngle = Math.atan2(height, length);
        plank.rotation.x = -slopeAngle;
        plank.position.set(0, py + 0.1, pz);
        plank.castShadow = true;
        plank.receiveShadow = true;
        deckGroup.add(plank);
    }
    group.add(deckGroup);

    // B. Ramp Support Pilings & Truss Struts
    for (const sx of [-width * 0.44, width * 0.44]) {
        // High post under the lip
        const lipPillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.24, height + 0.5, 8),
            woodMat
        );
        lipPillar.position.set(sx, (height + 0.5) * 0.5, -length * 0.45);
        lipPillar.castShadow = true;

        // Mid pillar
        const midPillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, height * 0.55 + 0.5, 8),
            woodMat
        );
        midPillar.position.set(sx, (height * 0.55 + 0.5) * 0.5, 0);
        midPillar.castShadow = true;

        // Cross iron brace
        const ironBrace = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.14, length * 0.95),
            ironMat
        );
        ironBrace.position.set(sx, 0.35, 0);

        group.add(lipPillar, midPillar, ironBrace);
    }

    // C. Glowing Warning Arrow Strip at Lip
    const lipStrip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.98, 0.18, 0.2),
        warningYellowMat
    );
    lipStrip.position.set(0, height + 0.08, -length * 0.48);
    group.add(lipStrip);

    group.userData = {
        type: 'ramp',
        config: rampConfig,
    };
    return group;
}

/**
 * Creates glowing airborne 3D coin rings along the ramp stunt trajectory.
 */
export function createCoinRingMesh(THREE, coinData) {
    const group = new THREE.Group();
    group.position.set(coinData.x ?? 0, coinData.y ?? 1.2, coinData.z ?? 0);

    const radius = coinData.radius || 1.5;
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.85,
        roughness: 0.25,
        emissive: new THREE.Color(0xffaa00),
        emissiveIntensity: 0.4,
    });
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
    });

    // Outer Torus Ring
    const torusGeo = new THREE.TorusGeometry(radius, 0.12, 10, 24);
    const torusMesh = new THREE.Mesh(torusGeo, goldMat);
    torusMesh.castShadow = true;
    group.add(torusMesh);

    // Inner Translucent Shimmer Disc
    const discGeo = new THREE.CircleGeometry(radius * 0.92, 24);
    const discMesh = new THREE.Mesh(discGeo, glowMat);
    group.add(discMesh);

    // Floating 3D Coin Model at center
    const coinGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.08, 16);
    coinGeo.rotateX(Math.PI / 2);
    const coinMesh = new THREE.Mesh(coinGeo, goldMat);
    group.add(coinMesh);

    group.userData = {
        type: 'coinRing',
        coinData,
        torusMesh,
        coinMesh,
    };
    return group;
}

// ─── 4. Floating Mine Barrel Mesh Builder ────────────────────────────────
/**
 * Creates a studded naval mine barrel floating on water with blinking antenna.
 */
export function createMineMesh(THREE, mineConfig) {
    const group = new THREE.Group();
    group.position.set(mineConfig.x, mineConfig.y ?? 0.25, mineConfig.z);

    const barrelMat = new THREE.MeshStandardMaterial({
        color: 0x1f242c,
        metalness: 0.85,
        roughness: 0.35,
    });
    const rustStripeMat = new THREE.MeshStandardMaterial({
        color: 0xc43d22,
        metalness: 0.3,
        roughness: 0.6,
    });
    const hornMat = new THREE.MeshStandardMaterial({
        color: 0xd99b26,
        metalness: 0.9,
        roughness: 0.2,
    });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });

    // A. Central Barrel Body (Cylinder with beveled caps)
    const barrelBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 1.4, 16),
        barrelMat
    );
    barrelBody.castShadow = true;
    barrelBody.receiveShadow = true;
    group.add(barrelBody);

    // Red Hazard Stripe
    const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.86, 0.86, 0.32, 16),
        rustStripeMat
    );
    stripe.position.y = 0.05;
    group.add(stripe);

    // B. Protruding Detonator Spikes / Chemical Horns (6 radial + top/bottom)
    const spikeGeo = new THREE.ConeGeometry(0.14, 0.55, 8);
    spikeGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6;
        const spike = new THREE.Mesh(spikeGeo, hornMat);
        spike.position.set(Math.cos(angle) * 0.95, 0, Math.sin(angle) * 0.95);
        spike.rotation.y = -angle + Math.PI / 2;
        group.add(spike);
    }

    // C. Blinking Danger Beacon on Top
    const antennaStem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.65, 6),
        barrelMat
    );
    antennaStem.position.y = 0.95;
    const beaconLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 8),
        beaconMat
    );
    beaconLight.position.y = 1.32;
    group.add(antennaStem, beaconLight);

    // D. Submerged Mooring Cable
    const chainMat = new THREE.MeshBasicMaterial({ color: 0x11161d });
    const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 3.0, 4),
        chainMat
    );
    chain.position.y = -1.8;
    group.add(chain);

    // E. Proximity Warning Aura Ring
    const auraMat = new THREE.MeshBasicMaterial({
        color: 0xff3333,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
    });
    const auraRing = new THREE.Mesh(
        new THREE.RingGeometry(mineConfig.triggerRadius || 3.5, (mineConfig.triggerRadius || 3.5) + 0.15, 32),
        auraMat
    );
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.04;
    group.add(auraRing);

    group.userData = {
        type: 'mine',
        mineConfig,
        beaconLight,
        beaconMat,
        auraRing,
        auraMat,
        baseY: mineConfig.y ?? 0.25,
    };
    return group;
}

// ─── 5. Unified Hazards Scene Builder & Animation System ─────────────────
/**
 * Assembles all hazards and returns an aggregate group ready for the Three.js scene.
 */
export function buildRiverHazardsGroup(THREE, hazardsLayout) {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'riverHazards';

    const rapidsMeshes = [];
    for (const r of (hazardsLayout.rapids || [])) {
        const m = createRapidsMesh(THREE, r);
        rootGroup.add(m);
        rapidsMeshes.push(m);
    }

    const whirlpoolMeshes = [];
    for (const w of (hazardsLayout.whirlpools || [])) {
        const m = createWhirlpoolMesh(THREE, w);
        rootGroup.add(m);
        whirlpoolMeshes.push(m);
    }

    const rampMeshes = [];
    for (const r of (hazardsLayout.ramps || [])) {
        const m = createRampMesh(THREE, r);
        rootGroup.add(m);
        rampMeshes.push(m);
    }

    const coinRingMeshes = [];
    for (const c of (hazardsLayout.coinRings || [])) {
        const m = createCoinRingMesh(THREE, c);
        rootGroup.add(m);
        coinRingMeshes.push(m);
    }

    const mineMeshes = [];
    for (const mData of (hazardsLayout.mines || [])) {
        const m = createMineMesh(THREE, mData);
        rootGroup.add(m);
        mineMeshes.push(m);
    }

    return {
        rootGroup,
        rapidsMeshes,
        whirlpoolMeshes,
        rampMeshes,
        coinRingMeshes,
        mineMeshes,
    };
}

/**
 * Animates all hazards: pulses shaders, spins vortexes, bobs mines, rotates coin rings.
 */
export function animateRiverHazards(hazardsGroupHandle, time, dt = 0.016) {
    if (!hazardsGroupHandle) return;

    // 1. Animate Rapids
    for (const rMesh of hazardsGroupHandle.rapidsMeshes || []) {
        if (rMesh.userData.shaderMat) {
            rMesh.userData.shaderMat.uniforms.uTime.value = time;
        }
        // Chevron arrows pulse forward
        const arrows = rMesh.userData.chevronArrows || [];
        for (let i = 0; i < arrows.length; i++) {
            const arr = arrows[i];
            const pulse = (time * 2.5 + i * 0.4) % 1.0;
            arr.scale.setScalar(0.95 + 0.1 * Math.sin(pulse * Math.PI));
        }
    }

    // 2. Animate Whirlpools
    for (const wMesh of hazardsGroupHandle.whirlpoolMeshes || []) {
        if (wMesh.userData.shaderMat) {
            wMesh.userData.shaderMat.uniforms.uTime.value = time;
        }
        if (wMesh.userData.ringGroup) {
            const dir = wMesh.userData.clockwise ? 1 : -1;
            wMesh.userData.ringGroup.rotation.z = time * 2.0 * dir;
        }
    }

    // 3. Animate Coin Rings
    for (const cMesh of hazardsGroupHandle.coinRingMeshes || []) {
        if (cMesh.userData.coinData?.collected) {
            cMesh.visible = false;
            continue;
        }
        // Spin coin and float ring
        cMesh.rotation.y = time * 2.2;
        if (cMesh.userData.coinMesh) {
            cMesh.userData.coinMesh.rotation.z = time * 3.5;
        }
    }

    // 4. Animate Mines
    for (const mMesh of hazardsGroupHandle.mineMeshes || []) {
        const cfg = mMesh.userData.mineConfig;
        if (cfg?.state === 'detonated') {
            mMesh.visible = false;
            continue;
        }

        // Bob up and down on water
        const baseY = mMesh.userData.baseY || 0.25;
        mMesh.position.y = baseY + Math.sin(time * 2.0 + mMesh.position.x) * 0.12;
        mMesh.rotation.y = time * 0.4;
        mMesh.rotation.z = Math.sin(time * 1.5) * 0.08;

        // Flash beacon light (faster if triggered)
        const flashRate = cfg?.state === 'triggered' ? 12.0 : 3.0;
        const flash = Math.sin(time * flashRate) > 0;
        if (mMesh.userData.beaconMat) {
            mMesh.userData.beaconMat.color.setHex(flash ? 0xff2222 : 0x440000);
        }
        if (mMesh.userData.auraRing) {
            mMesh.userData.auraRing.visible = cfg?.state === 'triggered';
        }
    }
}
