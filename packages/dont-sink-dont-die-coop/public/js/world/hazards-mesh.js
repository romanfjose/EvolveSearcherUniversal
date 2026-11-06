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
    group.position.set(rapidsConfig.x || 0, 0.28, rapidsConfig.z || 0);
    const dirAngle = rapidsConfig.angle !== undefined
        ? rapidsConfig.angle
        : (rapidsConfig.direction ? Math.atan2(-(rapidsConfig.direction.x || 0), -(rapidsConfig.direction.z ?? -1)) : 0);
    if (dirAngle) {
        group.rotation.y = dirAngle;
    }

    // A. Base Foam Surge Plane with Custom Shader (V-chevrons point & scroll toward -Z downriver)
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
                // Moving chevron stripes pointing & scrolling downriver toward -Z (vUv.y -> 1.0)
                float flow = vUv.y * 6.0 - uTime * 4.5;
                float chevron = abs(vUv.x - 0.5) * 2.2;
                float wave = sin((flow + chevron) * 3.14159);
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

    // B. Procedural 3D Chevron Arrow Markers (pointing strictly toward -Z downriver matching boost vector)
    const chevronCount = 5;
    const chevronMat = new THREE.MeshBasicMaterial({
        color: 0x38f2ff,
        transparent: true,
        opacity: 0.85,
    });
    const boostedChevronMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
    });

    const chevronArrows = [];
    for (let i = 0; i < chevronCount; i++) {
        const arrowGroup = new THREE.Group();
        const halfSpan = width * 0.38;
        const armLength = halfSpan * 1.1;

        // Left and right angled chevron wings meeting at a V-tip at -Z (downriver)
        const armGeo = new THREE.BoxGeometry(0.35, 0.08, armLength);
        const leftWing = new THREE.Mesh(armGeo, chevronMat);
        leftWing.position.set(-halfSpan * 0.45, 0.04, -armLength * 0.25);
        leftWing.rotation.y = -0.65;

        const rightWing = new THREE.Mesh(armGeo, chevronMat);
        rightWing.position.set(halfSpan * 0.45, 0.04, -armLength * 0.25);
        rightWing.rotation.y = 0.65;

        arrowGroup.add(leftWing, rightWing);
        // Order i = 0 at +Z (entry) through i = chevronCount - 1 at -Z (exit)
        const zOffset = ((chevronCount - 1) * 0.5 - i) * (length / chevronCount);
        arrowGroup.position.set(0, 0.04, zOffset);
        arrowGroup.userData = { leftWing, rightWing, baseZ: zOffset, directionZ: -1 };
        group.add(arrowGroup);
        chevronArrows.push(arrowGroup);
    }

    group.userData = {
        type: 'rapids',
        shaderMat: planeMat,
        chevronArrows,
        chevronMat,
        boostedChevronMat,
        config: rapidsConfig,
        boostDirectionZ: -1,
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
    group.position.set(whirlpoolConfig.x || 0, 0.28, whirlpoolConfig.z || 0);

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
    const ringCount = 4;
    const ringGroup = new THREE.Group();
    for (let r = 0; r < ringCount; r++) {
        const ringRadius = radius * (0.32 + r * 0.22);
        const ringGeo = new THREE.TorusGeometry(ringRadius, 0.14, 8, 36);
        const ringMat = new THREE.MeshBasicMaterial({
            color: r === 0 ? 0xffffff : 0x5eead4,
            transparent: true,
            opacity: 0.72 - r * 0.12,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.position.y = 0.03 + r * 0.015;
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
        // Slanted angle matching ramp slope (positive rotation.x tilts -Z launch lip UP and +Z entry DOWN)
        const slopeAngle = Math.atan2(height, length);
        plank.rotation.x = slopeAngle;
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
        deckGroup,
        launchDirectionZ: -1,
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

    // Expanding Burst Shockwave Ring (revealed on collection)
    const burstMat = new THREE.MeshBasicMaterial({
        color: 0xffea00,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
    });
    const burstRingGeo = new THREE.RingGeometry(radius * 0.9, radius * 1.15, 32);
    const burstRing = new THREE.Mesh(burstRingGeo, burstMat);
    burstRing.visible = false;
    group.add(burstRing);

    // Radial sparkle fragments
    const sparkles = [];
    const sparkleMat = new THREE.MeshBasicMaterial({ color: 0xfffae6 });
    for (let s = 0; s < 8; s++) {
        const ang = (s / 8) * Math.PI * 2;
        const spMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), sparkleMat);
        spMesh.position.set(Math.cos(ang) * radius * 0.5, Math.sin(ang) * radius * 0.5, 0);
        spMesh.visible = false;
        group.add(spMesh);
        sparkles.push(spMesh);
    }

    group.userData = {
        type: 'coinRing',
        coinData,
        torusMesh,
        discMesh,
        coinMesh,
        burstRing,
        burstMat,
        sparkles,
        burstProgress: 0,
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

    // F. Detonation Shockwave Ring (revealed when detonated)
    const shockwaveMat = new THREE.MeshBasicMaterial({
        color: 0xff5511,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
    });
    const shockwaveRing = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 1.8, 32),
        shockwaveMat
    );
    shockwaveRing.rotation.x = -Math.PI / 2;
    shockwaveRing.position.y = 0.08;
    shockwaveRing.visible = false;
    group.add(shockwaveRing);

    // G. Vertical Water & Smoke Explosion Plume
    const plumeMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.8,
    });
    const plumeMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 2.2, 5.0, 12),
        plumeMat
    );
    plumeMesh.position.y = 2.5;
    plumeMesh.visible = false;
    group.add(plumeMesh);

    // H. Shrapnel debris chunks
    const shrapnelPieces = [];
    const shrapnelMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    for (let s = 0; s < 6; s++) {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), shrapnelMat);
        sh.visible = false;
        group.add(sh);
        shrapnelPieces.push(sh);
    }

    group.userData = {
        type: 'mine',
        mineConfig,
        beaconLight,
        beaconMat,
        auraRing,
        auraMat,
        shockwaveRing,
        shockwaveMat,
        plumeMesh,
        plumeMat,
        shrapnelPieces,
        barrelBody,
        stripe,
        antennaStem,
        detonationProgress: 0,
        baseY: mineConfig.y ?? 0.25,
    };
    return group;
}

// ─── 5. River Log Jam & Hydrothermal Geyser Mesh Builders ────────────────
/**
 * Creates a rustic river log jam obstacle with jagged angled timber logs,
 * splinter debris chunks, and shudder displacement pivot.
 */
export function createLogJamMesh(THREE, logJamConfig) {
    const width = logJamConfig.width || 12.0;
    const depth = logJamConfig.depth || 3.0;

    const group = new THREE.Group();
    group.position.set(logJamConfig.x || 0, logJamConfig.y ?? 0.4, logJamConfig.z || 0);

    const timberMat = new THREE.MeshStandardMaterial({
        color: 0x4a2e1b,
        roughness: 0.9,
        metalness: 0.1,
    });
    const splinterMat = new THREE.MeshStandardMaterial({
        color: 0x78350f,
        roughness: 0.8,
        metalness: 0.1,
    });

    const logsGroup = new THREE.Group();
    const logMeshes = [];
    const logCount = 6;
    for (let i = 0; i < logCount; i++) {
        const lx = -width * 0.4 + (i / (logCount - 1)) * (width * 0.8);
        const lz = ((i % 3) - 1) * 0.8;
        const log = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.45, 4.5, 8),
            timberMat
        );
        log.position.set(lx, 0.2, lz);
        log.rotation.z = Math.PI * 0.5 + ((i % 2) - 0.5) * 0.25;
        log.rotation.y = ((i * 1.3) % 0.8) - 0.4;
        log.castShadow = true;
        log.receiveShadow = true;
        logsGroup.add(log);
        logMeshes.push(log);
    }
    group.add(logsGroup);

    // Splinter debris pool
    const splinterMeshes = [];
    for (let s = 0; s < 8; s++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.8), splinterMat);
        sp.visible = false;
        group.add(sp);
        splinterMeshes.push(sp);
    }

    group.userData = {
        type: 'logJam',
        config: logJamConfig,
        logsGroup,
        logMeshes,
        splinterMeshes,
        shudderTimerS: 0,
        splinterProgress: 0,
    };
    return group;
}

/**
 * Creates a hydrothermal river geyser with pressurized boiling water dome
 * and towering vertical steam eruption plume.
 */
export function createGeyserMesh(THREE, geyserConfig) {
    const radius = geyserConfig.radius || 7.5;

    const group = new THREE.Group();
    group.position.set(geyserConfig.x || 0, geyserConfig.y ?? 0.2, geyserConfig.z || 0);

    // Vent vent stone ring
    const stoneMat = new THREE.MeshStandardMaterial({
        color: 0x27272a,
        roughness: 0.95,
        metalness: 0.1,
    });
    const ventRing = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.7, radius * 1.05, 24),
        stoneMat
    );
    ventRing.rotation.x = -Math.PI / 2;
    ventRing.position.y = 0.04;
    group.add(ventRing);

    // Pressurized boiling water dome (telegraph)
    const boilingDomeMat = new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
    });
    const boilingDome = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.65, 16, 12),
        boilingDomeMat
    );
    boilingDome.scale.set(1.0, 0.05, 1.0);
    boilingDome.position.y = 0.1;
    boilingDome.visible = false;
    group.add(boilingDome);

    // Towering vertical steam eruption plume
    const plumeMat = new THREE.MeshBasicMaterial({
        color: 0xf0fdfa,
        transparent: true,
        opacity: 0.85,
    });
    const eruptionPlume = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.35, radius * 0.75, 12.0, 16),
        plumeMat
    );
    eruptionPlume.position.y = 6.0;
    eruptionPlume.scale.set(0.01, 0.01, 0.01);
    eruptionPlume.visible = false;
    group.add(eruptionPlume);

    group.userData = {
        type: 'geyser',
        config: geyserConfig,
        boilingDome,
        boilingDomeMat,
        eruptionPlume,
        plumeMat,
        radius,
    };
    return group;
}

// ─── 6. Unified Hazards Scene Builder & Animation System ─────────────────
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

    const logJamMeshes = [];
    for (const ljData of (hazardsLayout.logJams || [])) {
        const m = createLogJamMesh(THREE, ljData);
        rootGroup.add(m);
        logJamMeshes.push(m);
    }

    const geyserMeshes = [];
    for (const gData of (hazardsLayout.geysers || [])) {
        const m = createGeyserMesh(THREE, gData);
        rootGroup.add(m);
        geyserMeshes.push(m);
    }

    return {
        rootGroup,
        rapidsMeshes,
        whirlpoolMeshes,
        rampMeshes,
        coinRingMeshes,
        mineMeshes,
        logJamMeshes,
        geyserMeshes,
    };
}

/**
 * Animates all hazards: pulses shaders, spins vortexes, bobs mines, rotates coin rings.
 */
export function animateRiverHazards(hazardsGroupHandle, time, dt = 0.016, playerZ = null) {
    if (!hazardsGroupHandle) return;
    const hasCullZ = Number.isFinite(playerZ);
    const MAX_CULL_DIST = 240;

    // 1. Animate Rapids
    for (const rMesh of hazardsGroupHandle.rapidsMeshes || []) {
        if (hasCullZ && Math.abs(rMesh.position.z - playerZ) > MAX_CULL_DIST) continue;
        if (rMesh.userData.shaderMat) {
            rMesh.userData.shaderMat.uniforms.uTime.value = time;
        }
        const cfg = rMesh.userData.config;
        const isBoosting = Boolean(cfg?.isBoostingRaft || cfg?.boostPulseTimerS > 0);
        if (cfg?.boostPulseTimerS > 0) {
            cfg.boostPulseTimerS = Math.max(0, cfg.boostPulseTimerS - dt);
            if (cfg.boostPulseTimerS === 0) cfg.isBoostingRaft = false;
        }

        // Chevron arrows pulse sequentially from +Z (entry, i=0) toward -Z (exit, i=4)
        // Point strictly toward -Z (downriver) and pulse intensely when boosting a raft
        const arrows = rMesh.userData.chevronArrows || [];
        for (let i = 0; i < arrows.length; i++) {
            const arr = arrows[i];
            const phase = ((time * (isBoosting ? 6.5 : 3.0) - i * 0.25) % 1.0 + 1.0) % 1.0;
            const boostScale = isBoosting ? 1.35 : 1.0;
            arr.scale.setScalar((0.95 + 0.18 * Math.sin(phase * Math.PI)) * boostScale);
            if (arr.userData.leftWing && arr.userData.rightWing) {
                const targetMat = isBoosting ? rMesh.userData.boostedChevronMat : rMesh.userData.chevronMat;
                if (targetMat) {
                    arr.userData.leftWing.material = targetMat;
                    arr.userData.rightWing.material = targetMat;
                }
            }
        }
    }

    // 2. Animate Whirlpools
    for (const wMesh of hazardsGroupHandle.whirlpoolMeshes || []) {
        if (hasCullZ && Math.abs(wMesh.position.z - playerZ) > MAX_CULL_DIST) continue;
        if (wMesh.userData.shaderMat) {
            wMesh.userData.shaderMat.uniforms.uTime.value = time;
        }
        if (wMesh.userData.ringGroup) {
            const dir = wMesh.userData.clockwise ? 1 : -1;
            // Spin horizontally around Y axis on the water surface (never tilt around Z!)
            wMesh.userData.ringGroup.rotation.y = -time * 2.2 * dir;
        }
    }

    // 3. Animate Coin Rings (burst with golden radial ring expansion when collected mid-air)
    for (const cMesh of hazardsGroupHandle.coinRingMeshes || []) {
        const coinData = cMesh.userData.coinData;
        if (coinData?.collected) {
            // Check if radial burst expansion is still active
            if (cMesh.userData.burstProgress < 1.0) {
                cMesh.userData.burstProgress = Math.min(1.0, cMesh.userData.burstProgress + dt * 2.2);
                const p = cMesh.userData.burstProgress;

                // Hide core coin and torus
                if (cMesh.userData.torusMesh) cMesh.userData.torusMesh.visible = false;
                if (cMesh.userData.discMesh) cMesh.userData.discMesh.visible = false;
                if (cMesh.userData.coinMesh) cMesh.userData.coinMesh.visible = false;

                // Expand radial burst ring
                if (cMesh.userData.burstRing) {
                    cMesh.userData.burstRing.visible = true;
                    const burstScale = 1.0 + p * 2.6;
                    cMesh.userData.burstRing.scale.set(burstScale, burstScale, burstScale);
                    if (cMesh.userData.burstMat) {
                        cMesh.userData.burstMat.opacity = Math.max(0, 1.0 - p);
                    }
                }

                // Scatter radial sparkles
                const sparkles = cMesh.userData.sparkles || [];
                for (let s = 0; s < sparkles.length; s++) {
                    const sp = sparkles[s];
                    sp.visible = true;
                    const ang = (s / sparkles.length) * Math.PI * 2;
                    const rad = (coinData.radius || 1.5) * (1.0 + p * 2.2);
                    sp.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, (s % 2 === 0 ? 1 : -1) * p * 1.5);
                    sp.scale.setScalar(Math.max(0.1, 1.0 - p));
                }
            } else {
                cMesh.visible = false;
            }
            continue;
        }

        if (hasCullZ && Math.abs(cMesh.position.z - playerZ) > MAX_CULL_DIST) continue;
        // Keep hoop facing the river lane (+Z/-Z) with gentle yaw sway while spinning inner gold coin
        cMesh.rotation.y = Math.sin(time * 1.6) * 0.18;
        if (cMesh.userData.coinMesh) {
            cMesh.userData.coinMesh.rotation.z = time * 3.5;
        }
    }

    // 4. Animate Mines (detonate with expanding shockwave ring and flying shrapnel/water plume)
    for (const mMesh of hazardsGroupHandle.mineMeshes || []) {
        const cfg = mMesh.userData.mineConfig;
        if (cfg?.state === 'detonated') {
            // Animate detonation reaction rather than silently vanishing
            if (mMesh.userData.detonationProgress < 1.0) {
                mMesh.userData.detonationProgress = Math.min(1.0, mMesh.userData.detonationProgress + dt * 1.4);
                const p = mMesh.userData.detonationProgress;

                // Hide mine barrel body
                if (mMesh.userData.barrelBody) mMesh.userData.barrelBody.visible = false;
                if (mMesh.userData.stripe) mMesh.userData.stripe.visible = false;
                if (mMesh.userData.antennaStem) mMesh.userData.antennaStem.visible = false;
                if (mMesh.userData.beaconLight) mMesh.userData.beaconLight.visible = false;
                if (mMesh.userData.auraRing) mMesh.userData.auraRing.visible = false;

                // Expand shockwave ring on water
                if (mMesh.userData.shockwaveRing) {
                    mMesh.userData.shockwaveRing.visible = true;
                    const swScale = 1.0 + p * 8.5;
                    mMesh.userData.shockwaveRing.scale.set(swScale, swScale, swScale);
                    if (mMesh.userData.shockwaveMat) {
                        mMesh.userData.shockwaveMat.opacity = Math.max(0, 1.0 - p * 1.2);
                    }
                }

                // Vertical water & smoke plume eruption
                if (mMesh.userData.plumeMesh) {
                    mMesh.userData.plumeMesh.visible = true;
                    const plumeH = Math.sin(p * Math.PI) * 1.6;
                    mMesh.userData.plumeMesh.scale.set(1.0 + p * 2.0, plumeH, 1.0 + p * 2.0);
                    mMesh.userData.plumeMesh.position.y = plumeH * 2.5;
                    if (mMesh.userData.plumeMat) {
                        mMesh.userData.plumeMat.opacity = Math.max(0, 0.85 * (1.0 - p));
                    }
                }

                // Shrapnel pieces flying outward
                const shrapnel = mMesh.userData.shrapnelPieces || [];
                for (let s = 0; s < shrapnel.length; s++) {
                    const sh = shrapnel[s];
                    sh.visible = true;
                    const ang = (s / shrapnel.length) * Math.PI * 2;
                    const dist = p * 9.0;
                    sh.position.set(Math.cos(ang) * dist, Math.sin(p * Math.PI) * 3.5, Math.sin(ang) * dist);
                    sh.rotation.x += dt * 8.0;
                    sh.rotation.y += dt * 6.0;
                }
            } else {
                mMesh.visible = false;
            }
            continue;
        }

        if (hasCullZ && Math.abs(mMesh.position.z - playerZ) > MAX_CULL_DIST) continue;

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

    // 5. Animate River Log Jams (shudder and splinter visibly on impact)
    for (const ljMesh of hazardsGroupHandle.logJamMeshes || []) {
        const cfg = ljMesh.userData.config;
        if (hasCullZ && Math.abs(ljMesh.position.z - playerZ) > MAX_CULL_DIST) continue;

        if (cfg?.state === 'splintered') {
            // Shattered barricade debris
            if (ljMesh.userData.splinterProgress < 1.0) {
                ljMesh.userData.splinterProgress = Math.min(1.0, ljMesh.userData.splinterProgress + dt * 1.5);
                const p = ljMesh.userData.splinterProgress;
                for (let s = 0; s < (ljMesh.userData.splinterMeshes || []).length; s++) {
                    const sp = ljMesh.userData.splinterMeshes[s];
                    sp.visible = true;
                    const ang = (s / 8) * Math.PI * 2;
                    sp.position.set(Math.cos(ang) * p * 5.0, Math.sin(p * Math.PI) * 2.5, Math.sin(ang) * p * 4.0);
                    sp.rotation.x += dt * 5.0;
                }
                if (ljMesh.userData.logsGroup) {
                    ljMesh.userData.logsGroup.scale.setScalar(Math.max(0.1, 1.0 - p));
                }
            } else {
                ljMesh.visible = false;
            }
        } else if (cfg?.state === 'shuddering' || cfg?.shudderTimerS > 0) {
            // Visibly shudder and vibrate
            const shudderAmount = Math.sin(time * 45.0) * 0.12;
            ljMesh.position.x = (cfg.x || 0) + shudderAmount;
            ljMesh.position.y = (cfg.y || 0.4) + Math.abs(shudderAmount) * 0.5;
        } else {
            ljMesh.position.x = cfg?.x || 0;
            ljMesh.position.y = cfg?.y || 0.4;
        }
    }

    // 6. Animate Hydrothermal River Geysers (pressurized boiling dome telegraph before steam eruption)
    for (const gMesh of hazardsGroupHandle.geyserMeshes || []) {
        const cfg = gMesh.userData.config;
        if (hasCullZ && Math.abs(gMesh.position.z - playerZ) > MAX_CULL_DIST) continue;

        const period = (cfg?.boilDurationS || 1.2) + (cfg?.eruptDurationS || 1.4) + (cfg?.restDurationS || 2.5);
        const cycleTime = ((time + Math.abs(gMesh.position.x) * 0.4) % period + period) % period;
        const boilDuration = cfg?.boilDurationS || 1.2;
        const eruptDuration = cfg?.eruptDurationS || 1.4;

        if (cycleTime < boilDuration) {
            // Telegraph: pressurized boiling water dome
            const progress = cycleTime / boilDuration;
            if (gMesh.userData.boilingDome) {
                gMesh.userData.boilingDome.visible = true;
                const domeScaleY = 0.1 + Math.sin(progress * Math.PI * 0.5) * (0.8 + Math.sin(time * 25.0) * 0.08);
                const domeScaleXZ = 0.8 + progress * 0.4;
                gMesh.userData.boilingDome.scale.set(domeScaleXZ, domeScaleY, domeScaleXZ);
            }
            if (gMesh.userData.eruptionPlume) {
                gMesh.userData.eruptionPlume.visible = false;
            }
        } else if (cycleTime < boilDuration + eruptDuration) {
            // Erupting: towering steam plume and splash
            const progress = (cycleTime - boilDuration) / eruptDuration;
            const eruptCurve = Math.sin(progress * Math.PI);
            if (gMesh.userData.boilingDome) {
                gMesh.userData.boilingDome.visible = false;
            }
            if (gMesh.userData.eruptionPlume) {
                gMesh.userData.eruptionPlume.visible = true;
                const plumeH = Math.max(0.01, eruptCurve);
                gMesh.userData.eruptionPlume.scale.set(1.0 + eruptCurve * 0.5, plumeH, 1.0 + eruptCurve * 0.5);
                gMesh.userData.eruptionPlume.position.y = plumeH * 6.0;
                if (gMesh.userData.plumeMat) {
                    gMesh.userData.plumeMat.opacity = Math.max(0, 0.9 * eruptCurve);
                }
            }
        } else {
            // Dormant
            if (gMesh.userData.boilingDome) gMesh.userData.boilingDome.visible = false;
            if (gMesh.userData.eruptionPlume) gMesh.userData.eruptionPlume.visible = false;
        }
    }
}
