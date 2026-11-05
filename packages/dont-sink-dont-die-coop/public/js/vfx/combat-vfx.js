/**
 * Don't Sink, Don't Die — AAA 3D Combat Visual Effects Library
 *
 * Fully pooled, zero-GC Three.js visual effects for:
 * 1. Melee Oar/War-Mallet Crescent Slash Ribbons (glowing trail mesh following the swing arc)
 * 2. Golden Block Parry Shield Hexagon Dome + spark burst when blocking enemy hits
 * 3. Wizard Arcane Bolt projectiles & telekinetic throw tether beam
 * 4. Police Cruiser Muzzle Flash & tracer lines when harbor police fire on the Mud Alien
 * 5. Floating 3D coin burst fountain when an enemy is KO'd
 *
 * Zero external asset dependencies (100% procedural WebGL & BufferGeometry).
 */

import {
    computeSlashArcPoint,
    generateSlashRibbonMesh,
    checkMeleeArcHit,
    computeHexagonCellVertices,
    checkParryInterception,
    calculateSparkVelocity,
    stepArcaneBoltTrajectory,
    generateTetherBeamPoints,
    calculateMuzzleFlashState,
    calculateTracerLine,
    calculateCoinBurstInitialVelocity,
    stepCoinPhysics,
    clamp,
    lerp,
} from '../../../shared/combat-vfx-math.js';

// ─── POOL CONFIGURATION LIMITS ─────────────────────────────────────────────
const MAX_SLASH_RIBBONS = 8;
const SLASH_RIBBON_SEGMENTS = 18;

const MAX_PARRY_DOMES = 4;
const MAX_PARRY_SPARKS = 120; // 30 sparks per burst * 4 concurrent

const MAX_ARCANE_BOLTS = 16;
const MAX_BOLT_TRAIL_PARTICLES = 160;

const MAX_TETHERS = 4;
const TETHER_SEGMENTS = 28;

const MAX_MUZZLE_FLASHES = 8;
const MAX_TRACERS = 16;

const MAX_COIN_BURSTS = 8;
const COINS_PER_BURST = 14;
const MAX_COINS = MAX_COIN_BURSTS * COINS_PER_BURST; // 112 coins total in pool

/**
 * Creates the Combat VFX System and adds its pooled meshes to the scene.
 *
 * @param {object} THREE - The Three.js instance
 * @param {object} scene - Three.js Scene
 * @param {object} [options] - Configuration overrides
 */
export function createCombatVFXSystem(THREE, scene, options = {}) {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'CombatVFX_Root';
    scene.add(rootGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. MELEE CRESCENT SLASH RIBBONS
    // ─────────────────────────────────────────────────────────────────────────
    const slashPool = [];
    const ribbonVertexCount = (SLASH_RIBBON_SEGMENTS + 1) * 2;
    const ribbonIndexCount = SLASH_RIBBON_SEGMENTS * 6;

    for (let i = 0; i < MAX_SLASH_RIBBONS; i++) {
        const positions = new Float32Array(ribbonVertexCount * 3);
        const uvs = new Float32Array(ribbonVertexCount * 2);
        const indices = new Uint16Array(ribbonIndexCount);

        // Pre-build topology index buffer once
        let idx = 0;
        for (let s = 0; s < SLASH_RIBBON_SEGMENTS; s++) {
            const v0 = s * 2;
            const v1 = s * 2 + 1;
            const v2 = (s + 1) * 2;
            const v3 = (s + 1) * 2 + 1;
            indices[idx++] = v0;
            indices[idx++] = v1;
            indices[idx++] = v2;
            indices[idx++] = v2;
            indices[idx++] = v1;
            indices[idx++] = v3;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setIndex(new THREE.BufferAttribute(indices, 1));

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0xffd54f) },
                uProgress: { value: 0 },
                uOpacity: { value: 1.0 },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uProgress;
                uniform float uOpacity;
                varying vec2 vUv;

                void main() {
                    // Crescent energy gradient along arc length and width
                    float arcFade = smoothstep(0.0, 0.25, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x));
                    float edgeGlow = sin(vUv.y * 3.14159265);
                    float alpha = arcFade * pow(edgeGlow, 0.8) * uOpacity;
                    if (alpha < 0.01) discard;

                    // Intense hot-white core and colored glow edge
                    vec3 col = mix(uColor, vec3(1.0, 1.0, 1.0), pow(edgeGlow, 2.5) * 0.85);
                    gl_FragColor = vec4(col, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        rootGroup.add(mesh);

        slashPool.push({
            mesh,
            geo,
            mat,
            active: false,
            elapsed: 0,
            duration: 0.28,
            origin: { x: 0, y: 0, z: 0 },
            yaw: 0,
            startAngle: -Math.PI * 0.45,
            endAngle: Math.PI * 0.45,
            innerRadius: 1.2,
            outerRadius: 3.8,
            color: 0xffd54f,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. GOLDEN BLOCK PARRY SHIELD HEXAGON DOME + SPARKS
    // ─────────────────────────────────────────────────────────────────────────
    const parryDomePool = [];
    for (let i = 0; i < MAX_PARRY_DOMES; i++) {
        // Build hemisphere hexagon dome
        const domeGeo = new THREE.SphereGeometry(2.3, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.48);
        const domeMat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0xffb703) },
                uEdgeColor: { value: new THREE.Color(0xfff3b0) },
                uIntensity: { value: 0 },
                uTime: { value: 0 },
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                varying vec2 vUv;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vUv = uv;
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xyz;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform vec3 uEdgeColor;
                uniform float uIntensity;
                uniform float uTime;
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                varying vec2 vUv;

                // Procedural hexagonal grid pattern
                float hexDist(vec2 p) {
                    p = abs(p);
                    float c = dot(p, normalize(vec2(1.0, 1.7320508)));
                    c = max(c, p.x);
                    return c;
                }

                void main() {
                    vec3 V = normalize(cameraPosition - vWorldPos);
                    float fresnel = pow(1.0 - max(dot(vNormal, V), 0.0), 2.2);

                    // Procedural hex honeycomb grid
                    vec2 gridUv = vUv * vec2(24.0, 16.0);
                    vec2 g = fract(gridUv) - 0.5;
                    float h = hexDist(g);
                    float wire = smoothstep(0.42, 0.48, h);

                    float alpha = (fresnel * 0.75 + wire * 0.45) * uIntensity;
                    if (alpha < 0.01) discard;

                    vec3 col = mix(uColor, uEdgeColor, fresnel + wire * 0.5);
                    gl_FragColor = vec4(col, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });

        const domeMesh = new THREE.Mesh(domeGeo, domeMat);
        domeMesh.visible = false;
        domeMesh.frustumCulled = false;
        rootGroup.add(domeMesh);

        parryDomePool.push({
            mesh: domeMesh,
            mat: domeMat,
            active: false,
            elapsed: 0,
            duration: 0.38,
        });
    }

    // Pooled spark particles
    const sparkPositions = new Float32Array(MAX_PARRY_SPARKS * 3);
    const sparkVelocities = new Float32Array(MAX_PARRY_SPARKS * 3);
    const sparkColors = new Float32Array(MAX_PARRY_SPARKS * 3);
    const sparkAges = new Float32Array(MAX_PARRY_SPARKS);
    const sparkLifespans = new Float32Array(MAX_PARRY_SPARKS);
    const sparkActive = new Uint8Array(MAX_PARRY_SPARKS);

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));

    const sparkMat = new THREE.PointsMaterial({
        size: 0.45,
        vertexColors: true,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    sparkPoints.frustumCulled = false;
    rootGroup.add(sparkPoints);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. WIZARD ARCANE BOLT PROJECTILES & TELEKINETIC TETHER BEAM
    // ─────────────────────────────────────────────────────────────────────────
    const boltPool = [];
    const boltCoreGeo = new THREE.SphereGeometry(0.35, 10, 8);
    const boltCoreMat = new THREE.MeshBasicMaterial({ color: 0x48f0ff, transparent: true, opacity: 0.95 });
    const boltAuraGeo = new THREE.OctahedronGeometry(0.65, 1);
    const boltAuraMat = new THREE.MeshBasicMaterial({
        color: 0x00c8ff,
        wireframe: true,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < MAX_ARCANE_BOLTS; i++) {
        const boltGroup = new THREE.Group();
        const core = new THREE.Mesh(boltCoreGeo, boltCoreMat);
        const aura = new THREE.Mesh(boltAuraGeo, boltAuraMat);
        boltGroup.add(core, aura);
        boltGroup.visible = false;
        boltGroup.frustumCulled = false;
        rootGroup.add(boltGroup);

        boltPool.push({
            group: boltGroup,
            core,
            aura,
            active: false,
            pos: { x: 0, y: 0, z: 0 },
            vel: { x: 0, y: 0, z: 0 },
            targetPos: { x: 0, y: 0, z: 0 },
            elapsed: 0,
            maxLife: 3.5,
            wobbleFreq: 14.0,
            wobbleAmp: 1.2,
            homing: 16.0,
            onHit: null,
        });
    }

    // Telekinetic tether beam pool
    const tetherPool = [];
    const tetherPointsCount = TETHER_SEGMENTS + 1;

    for (let i = 0; i < MAX_TETHERS; i++) {
        const positions = new Float32Array(tetherPointsCount * 3);
        const tGeo = new THREE.BufferGeometry();
        tGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const tMat = new THREE.LineBasicMaterial({
            color: 0x7df9ff,
            linewidth: 3,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
        });

        // Use Line or LineSegments depending on Three.js support
        const LineClass = THREE.Line || THREE.LineSegments;
        const line = new LineClass(tGeo, tMat);
        line.visible = false;
        line.frustumCulled = false;
        rootGroup.add(line);

        tetherPool.push({
            line,
            geo: tGeo,
            mat: tMat,
            active: false,
            startPos: { x: 0, y: 0, z: 0 },
            endPos: { x: 0, y: 0, z: 0 },
            elapsed: 0,
            duration: 1.2,
            color: 0x7df9ff,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. POLICE CRUISER MUZZLE FLASH & TRACER LINES
    // ─────────────────────────────────────────────────────────────────────────
    const muzzlePool = [];
    const muzzleGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const muzzleMat = new THREE.MeshBasicMaterial({
        color: 0xffea75,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < MAX_MUZZLE_FLASHES; i++) {
        const mesh = new THREE.Mesh(muzzleGeo, muzzleMat.clone());
        mesh.visible = false;
        rootGroup.add(mesh);

        muzzlePool.push({
            mesh,
            mat: mesh.material,
            active: false,
            elapsed: 0,
            duration: 0.08,
        });
    }

    // Supersonic tracer line segments
    const tracerPool = [];
    const TracerLineClass = THREE.Line || THREE.LineSegments;

    for (let i = 0; i < MAX_TRACERS; i++) {
        const tPositions = new Float32Array(6); // 2 vertices * 3 coords (tail, head)
        const tGeo = new THREE.BufferGeometry();
        tGeo.setAttribute('position', new THREE.BufferAttribute(tPositions, 3));

        const tMat = new THREE.LineBasicMaterial({
            color: 0x60a5fa,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
        });

        const tLine = new TracerLineClass(tGeo, tMat);
        tLine.visible = false;
        rootGroup.add(tLine);

        tracerPool.push({
            line: tLine,
            geo: tGeo,
            mat: tMat,
            active: false,
            origin: { x: 0, y: 0, z: 0 },
            target: { x: 0, y: 0, z: 0 },
            speed: 160.0,
            length: 4.8,
            elapsed: 0,
            onImpact: null,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. FLOATING 3D COIN BURST FOUNTAIN
    // ─────────────────────────────────────────────────────────────────────────
    const coinPool = [];
    const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.09, 10);
    const coinMat = new THREE.MeshStandardMaterial({
        color: 0xffc72c,
        metalness: 0.85,
        roughness: 0.22,
        flatShading: true,
    });

    for (let i = 0; i < MAX_COINS; i++) {
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        mesh.visible = false;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        rootGroup.add(mesh);

        coinPool.push({
            mesh,
            active: false,
            pos: { x: 0, y: 0, z: 0 },
            vel: { x: 0, y: 0, z: 0 },
            rotSpeed: { x: 0, y: 0, z: 0 },
            elapsed: 0,
            life: 6.0,
            magnetPlayerId: null,
        });
    }

    // ─── PUBLIC EMISSION & TRIGGER APIs ──────────────────────────────────────

    /**
     * Triggers a crescent melee slash ribbon trail along weapon arc.
     *
     * @param {object} origin - Raft position {x, y, z}
     * @param {number} yaw - Heading angle in radians
     * @param {object} [opts] - Optional overrides (color, reach, isHammer)
     */
    function triggerSlash(origin, yaw, opts = {}) {
        const slot = slashPool.find((s) => !s.active);
        if (!slot) return null;

        const isHammer = opts.isHammer || false;
        slot.active = true;
        slot.elapsed = 0;
        slot.duration = opts.duration || (isHammer ? 0.32 : 0.24);
        slot.origin.x = origin.x;
        slot.origin.y = origin.y + (opts.yOffset || 0.35);
        slot.origin.z = origin.z;
        slot.yaw = yaw;
        slot.startAngle = opts.startAngle ?? -Math.PI * 0.48;
        slot.endAngle = opts.endAngle ?? Math.PI * 0.48;
        slot.innerRadius = opts.innerRadius || (isHammer ? 1.4 : 1.1);
        slot.outerRadius = opts.outerRadius || (isHammer ? 4.5 : 3.6);
        slot.color = opts.color || (isHammer ? 0xff4d6d : 0xffd54f);

        slot.mat.uniforms.uColor.value.setHex(slot.color);
        slot.mat.uniforms.uProgress.value = 0;
        slot.mat.uniforms.uOpacity.value = 1.0;
        slot.mesh.visible = true;

        // Build initial ribbon mesh
        updateSlashMesh(slot, 0.0);
        return slot;
    }

    function updateSlashMesh(slot, progress) {
        const posAttr = slot.geo.attributes.position;
        const uvAttr = slot.geo.attributes.uv;
        const posArr = posAttr.array;
        const uvArr = uvAttr.array;

        const tempInner = { x: 0, y: 0, z: 0 };
        const tempOuter = { x: 0, y: 0, z: 0 };

        const currentStart = slot.startAngle + (slot.endAngle - slot.startAngle) * Math.max(0, progress - 0.4);
        const currentEnd = slot.startAngle + (slot.endAngle - slot.startAngle) * Math.min(1.0, progress * 1.5);

        for (let i = 0; i <= SLASH_RIBBON_SEGMENTS; i++) {
            const t = i / SLASH_RIBBON_SEGMENTS;
            const angle = currentStart + (currentEnd - currentStart) * t;

            const taper = Math.sin(t * Math.PI);
            const dynamicInner = slot.innerRadius + (slot.outerRadius - slot.innerRadius) * 0.15 * (1 - taper);
            const dynamicOuter = slot.outerRadius * (0.85 + 0.15 * taper);

            computeSlashArcPoint(slot.origin, angle, slot.yaw, dynamicInner, 0.18, tempInner);
            computeSlashArcPoint(slot.origin, angle, slot.yaw, dynamicOuter, 0.18, tempOuter);

            const v0 = i * 2;
            const v1 = i * 2 + 1;

            posArr[v0 * 3 + 0] = tempInner.x;
            posArr[v0 * 3 + 1] = tempInner.y;
            posArr[v0 * 3 + 2] = tempInner.z;

            posArr[v1 * 3 + 0] = tempOuter.x;
            posArr[v1 * 3 + 1] = tempOuter.y;
            posArr[v1 * 3 + 2] = tempOuter.z;

            uvArr[v0 * 2 + 0] = t;
            uvArr[v0 * 2 + 1] = 0.0;
            uvArr[v1 * 2 + 0] = t;
            uvArr[v1 * 2 + 1] = 1.0;
        }

        posAttr.needsUpdate = true;
        uvAttr.needsUpdate = true;
    }

    /**
     * Triggers golden block parry hexagon dome and radiant spark burst.
     *
     * @param {object} contactPos - Impact point {x, y, z}
     * @param {object} sparkNormal - Shield reflection normal {x, y, z}
     * @param {object} [opts] - Color and duration overrides
     */
    function triggerParryShield(contactPos, sparkNormal, opts = {}) {
        // 1. Activate shield dome
        const domeSlot = parryDomePool.find((d) => !d.active);
        if (domeSlot) {
            domeSlot.active = true;
            domeSlot.elapsed = 0;
            domeSlot.duration = opts.duration || 0.38;
            domeSlot.mesh.position.set(contactPos.x, contactPos.y, contactPos.z);
            domeSlot.mat.uniforms.uIntensity.value = 1.0;
            domeSlot.mat.uniforms.uColor.value.setHex(opts.domeColor || 0xffb703);
            domeSlot.mesh.visible = true;
        }

        // 2. Spawn spark particles
        const sparkCount = opts.sparkCount || 24;
        let emitted = 0;
        for (let i = 0; i < MAX_PARRY_SPARKS && emitted < sparkCount; i++) {
            if (sparkActive[i] === 0) {
                sparkActive[i] = 1;
                sparkAges[i] = 0;
                sparkLifespans[i] = 0.35 + Math.random() * 0.25;

                const i3 = i * 3;
                sparkPositions[i3 + 0] = contactPos.x + (Math.random() - 0.5) * 0.2;
                sparkPositions[i3 + 1] = contactPos.y + (Math.random() - 0.5) * 0.2;
                sparkPositions[i3 + 2] = contactPos.z + (Math.random() - 0.5) * 0.2;

                const vel = calculateSparkVelocity(sparkNormal, emitted, sparkCount, opts.sparkSpeed || 14.0);
                sparkVelocities[i3 + 0] = vel.vx;
                sparkVelocities[i3 + 1] = vel.vy;
                sparkVelocities[i3 + 2] = vel.vz;

                sparkColors[i3 + 0] = 1.0;
                sparkColors[i3 + 1] = 0.85;
                sparkColors[i3 + 2] = 0.25;

                emitted++;
            }
        }
        sparkGeo.attributes.position.needsUpdate = true;
        sparkGeo.attributes.color.needsUpdate = true;
    }

    /**
     * Spawns a homing/ballistic Arcane Bolt projectile from the River Wizard.
     *
     * @param {object} origin - Wizard staff position {x, y, z}
     * @param {object} targetPos - Target raft position {x, y, z}
     * @param {Function} [onHit] - Callback when bolt reaches target or expires
     */
    function spawnArcaneBolt(origin, targetPos, onHit = null) {
        const slot = boltPool.find((b) => !b.active);
        if (!slot) return null;

        slot.active = true;
        slot.elapsed = 0;
        slot.pos = { ...origin };
        slot.targetPos = { ...targetPos };
        slot.onHit = onHit;

        // Initial launch velocity toward target
        const dx = targetPos.x - origin.x;
        const dy = targetPos.y - origin.y;
        const dz = targetPos.z - origin.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        const launchSpeed = 22.0;

        slot.vel = {
            x: (dx / dist) * launchSpeed,
            y: (dy / dist) * launchSpeed + 2.0,
            z: (dz / dist) * launchSpeed,
        };

        slot.group.position.set(origin.x, origin.y, origin.z);
        slot.group.visible = true;
        return slot;
    }

    /**
     * Triggers a telekinetic throw electric tether beam connecting wizard to target raft.
     *
     * @param {object} startPos - Wizard staff orb
     * @param {object} endPos - Raft center
     * @param {number} [duration] - Beam active seconds
     */
    function triggerTelekineticTether(startPos, endPos, duration = 1.0) {
        const slot = tetherPool.find((t) => !t.active);
        if (!slot) return null;

        slot.active = true;
        slot.elapsed = 0;
        slot.duration = duration;
        slot.startPos = { ...startPos };
        slot.endPos = { ...endPos };
        slot.mat.opacity = 0.95;
        slot.line.visible = true;

        updateTetherGeometry(slot, 0);
        return slot;
    }

    function updateTetherGeometry(slot, globalTime) {
        const pts = generateTetherBeamPoints(slot.startPos, slot.endPos, TETHER_SEGMENTS, globalTime, 0.7);
        const posAttr = slot.geo.attributes.position;
        posAttr.array.set(pts);
        posAttr.needsUpdate = true;
    }

    /**
     * Fires police cruiser muzzle flash and supersonic blue tracer beam at target.
     *
     * @param {object} muzzlePos - Officer gun position
     * @param {object} targetPos - Alien/target position
     * @param {Function} [onImpact] - Callback when tracer arrives
     */
    function triggerPoliceGunshot(muzzlePos, targetPos, onImpact = null) {
        // 1. Muzzle flash
        const mSlot = muzzlePool.find((m) => !m.active);
        if (mSlot) {
            mSlot.active = true;
            mSlot.elapsed = 0;
            mSlot.mesh.position.set(muzzlePos.x, muzzlePos.y, muzzlePos.z);
            mSlot.mat.opacity = 1.0;
            mSlot.mesh.scale.setScalar(1.0);
            mSlot.mesh.visible = true;
        }

        // 2. Tracer beam
        const tSlot = tracerPool.find((t) => !t.active);
        if (tSlot) {
            tSlot.active = true;
            tSlot.elapsed = 0;
            tSlot.origin = { ...muzzlePos };
            tSlot.target = { ...targetPos };
            tSlot.speed = 180.0;
            tSlot.onImpact = onImpact;
            tSlot.line.visible = true;

            const posArr = tSlot.geo.attributes.position.array;
            posArr[0] = muzzlePos.x;
            posArr[1] = muzzlePos.y;
            posArr[2] = muzzlePos.z;
            posArr[3] = muzzlePos.x;
            posArr[4] = muzzlePos.y;
            posArr[5] = muzzlePos.z;
            tSlot.geo.attributes.position.needsUpdate = true;
        }
    }

    /**
     * Spawns a floating 3D golden coin burst fountain at defeat position.
     *
     * @param {object} enemyPos - Defeated enemy position {x, y, z}
     * @param {number} [count] - Number of coins (default 12)
     * @param {string} [magnetTargetId] - Optional player ID to pull coins towards
     */
    function triggerCoinBurst(enemyPos, count = 12, magnetTargetId = null) {
        const coinsToSpawn = Math.min(count, COINS_PER_BURST);
        let spawned = 0;

        for (let i = 0; i < MAX_COINS && spawned < coinsToSpawn; i++) {
            const slot = coinPool[i];
            if (!slot.active) {
                slot.active = true;
                slot.elapsed = 0;
                slot.life = 5.5 + Math.random() * 1.5;
                slot.pos = {
                    x: enemyPos.x + (Math.random() - 0.5) * 0.4,
                    y: enemyPos.y + 0.8,
                    z: enemyPos.z + (Math.random() - 0.5) * 0.4,
                };

                const vel = calculateCoinBurstInitialVelocity(spawned, coinsToSpawn, 10.0, 5.5);
                slot.vel = { x: vel.vx, y: vel.vy, z: vel.vz };
                slot.rotSpeed = vel.rotSpeed;
                slot.magnetPlayerId = magnetTargetId;

                slot.mesh.position.set(slot.pos.x, slot.pos.y, slot.pos.z);
                slot.mesh.visible = true;
                spawned++;
            }
        }
    }

    /**
     * Main update loop for all combat VFX.
     * Advances physics, updates vertex buffers, and recycles expired effects.
     *
     * @param {number} dt - Frame delta time
     * @param {number} [globalTime] - Total elapsed game time
     * @param {object} [playerPositions] - Map of player positions for coin magnet attraction
     */
    function update(dt, globalTime = 0, playerPositions = {}) {
        // 1. Update Slash Ribbons
        for (const slot of slashPool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            const progress = slot.elapsed / slot.duration;
            if (progress >= 1.0) {
                slot.active = false;
                slot.mesh.visible = false;
            } else {
                slot.mat.uniforms.uProgress.value = progress;
                slot.mat.uniforms.uOpacity.value = 1.0 - progress * progress;
                updateSlashMesh(slot, progress);
            }
        }

        // 2. Update Parry Shield Domes & Sparks
        for (const dome of parryDomePool) {
            if (!dome.active) continue;
            dome.elapsed += dt;
            const p = dome.elapsed / dome.duration;
            if (p >= 1.0) {
                dome.active = false;
                dome.mesh.visible = false;
            } else {
                dome.mat.uniforms.uIntensity.value = (1.0 - p) * (1.0 + Math.sin(p * Math.PI * 3) * 0.25);
                dome.mat.uniforms.uTime.value = globalTime;
            }
        }

        // Spark physics
        let sparksActiveCount = 0;
        const sPosArr = sparkGeo.attributes.position.array;
        const sColArr = sparkGeo.attributes.color.array;

        for (let i = 0; i < MAX_PARRY_SPARKS; i++) {
            if (sparkActive[i] === 0) continue;
            sparkAges[i] += dt;
            const p = sparkAges[i] / sparkLifespans[i];
            if (p >= 1.0) {
                sparkActive[i] = 0;
                sPosArr[i * 3 + 1] = -9999;
            } else {
                sparksActiveCount++;
                const i3 = i * 3;
                sparkVelocities[i3 + 1] -= 22.0 * dt; // Gravity
                sPosArr[i3 + 0] += sparkVelocities[i3 + 0] * dt;
                sPosArr[i3 + 1] += sparkVelocities[i3 + 1] * dt;
                sPosArr[i3 + 2] += sparkVelocities[i3 + 2] * dt;

                // Color fades from white-gold to red-orange
                const fade = 1.0 - p;
                sColArr[i3 + 0] = 1.0 * fade;
                sColArr[i3 + 1] = (0.75 * (1.0 - p * 0.6)) * fade;
                sColArr[i3 + 2] = (0.15 * (1.0 - p)) * fade;
            }
        }
        if (sparksActiveCount > 0) {
            sparkGeo.attributes.position.needsUpdate = true;
            sparkGeo.attributes.color.needsUpdate = true;
        }

        // 3. Update Arcane Bolts
        for (const slot of boltPool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            if (slot.elapsed >= slot.maxLife) {
                slot.active = false;
                slot.group.visible = false;
                if (typeof slot.onHit === 'function') slot.onHit(slot.pos, false);
                continue;
            }

            const step = stepArcaneBoltTrajectory(
                slot.pos,
                slot.vel,
                slot.targetPos,
                dt,
                slot.homing,
                26.0,
                slot.wobbleFreq,
                slot.wobbleAmp,
                slot.elapsed
            );
            slot.pos = step.pos;
            slot.vel = step.vel;
            slot.group.position.set(slot.pos.x, slot.pos.y, slot.pos.z);
            slot.aura.rotation.x += dt * 8.0;
            slot.aura.rotation.y += dt * 10.0;

            if (step.distanceToTarget < 1.4) {
                slot.active = false;
                slot.group.visible = false;
                if (typeof slot.onHit === 'function') slot.onHit(slot.pos, true);
            }
        }

        // Update Tethers
        for (const slot of tetherPool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            const p = slot.elapsed / slot.duration;
            if (p >= 1.0) {
                slot.active = false;
                slot.line.visible = false;
            } else {
                slot.mat.opacity = (1.0 - p) * 0.95;
                updateTetherGeometry(slot, globalTime);
            }
        }

        // 4. Update Muzzle Flashes & Tracers
        for (const slot of muzzlePool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            const flash = calculateMuzzleFlashState(slot.elapsed, slot.duration);
            if (flash.intensity <= 0) {
                slot.active = false;
                slot.mesh.visible = false;
            } else {
                slot.mat.opacity = flash.intensity;
                slot.mesh.scale.setScalar(flash.scale);
            }
        }

        for (const slot of tracerPool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            const line = calculateTracerLine(slot.origin, slot.target, slot.elapsed, slot.speed, slot.length);
            if (!line.active) {
                slot.active = false;
                slot.line.visible = false;
                if (typeof slot.onImpact === 'function') slot.onImpact(slot.target);
            } else {
                const posArr = slot.geo.attributes.position.array;
                posArr[0] = line.tail.x;
                posArr[1] = line.tail.y;
                posArr[2] = line.tail.z;
                posArr[3] = line.head.x;
                posArr[4] = line.head.y;
                posArr[5] = line.head.z;
                slot.geo.attributes.position.needsUpdate = true;
            }
        }

        // 5. Update Coins (Physics, Water Bouncing, Magnetism)
        for (const slot of coinPool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            if (slot.elapsed >= slot.life) {
                slot.active = false;
                slot.mesh.visible = false;
                continue;
            }

            // Magnet target attraction
            let magnetPos = null;
            if (slot.magnetPlayerId && playerPositions[slot.magnetPlayerId]) {
                magnetPos = playerPositions[slot.magnetPlayerId];
            } else {
                // Find closest player if any exist
                let closestDist = 12.0;
                for (const pId in playerPositions) {
                    const pPos = playerPositions[pId];
                    const d = Math.hypot(pPos.x - slot.pos.x, pPos.z - slot.pos.z);
                    if (d < closestDist) {
                        closestDist = d;
                        magnetPos = pPos;
                    }
                }
            }

            const coinStep = stepCoinPhysics(slot.pos, slot.vel, dt, magnetPos, 0.25);
            slot.pos = coinStep.pos;
            slot.vel = coinStep.vel;

            if (coinStep.collected) {
                slot.active = false;
                slot.mesh.visible = false;
                continue;
            }

            slot.mesh.position.set(slot.pos.x, slot.pos.y, slot.pos.z);
            slot.mesh.rotation.x += slot.rotSpeed.x * dt;
            slot.mesh.rotation.y += slot.rotSpeed.y * dt;
            slot.mesh.rotation.z += slot.rotSpeed.z * dt;
        }
    }

    /**
     * Cleanly disposes all pooled geometries and materials.
     */
    function dispose() {
        scene.remove(rootGroup);

        for (const s of slashPool) {
            s.geo.dispose();
            s.mat.dispose();
        }
        for (const d of parryDomePool) {
            d.mesh.geometry.dispose();
            d.mat.dispose();
        }
        sparkGeo.dispose();
        sparkMat.dispose();

        boltCoreGeo.dispose();
        boltCoreMat.dispose();
        boltAuraGeo.dispose();
        boltAuraMat.dispose();

        for (const t of tetherPool) {
            t.geo.dispose();
            t.mat.dispose();
        }
        muzzleGeo.dispose();
        muzzleMat.dispose();

        for (const t of tracerPool) {
            t.geo.dispose();
            t.mat.dispose();
        }
        coinGeo.dispose();
        coinMat.dispose();
    }

    return {
        rootGroup,
        triggerSlash,
        triggerParryShield,
        spawnArcaneBolt,
        triggerTelekineticTether,
        triggerPoliceGunshot,
        triggerCoinBurst,
        update,
        dispose,
        // Expose pools for testing
        _pools: {
            slashPool,
            parryDomePool,
            sparkPositions,
            sparkActive,
            boltPool,
            tetherPool,
            muzzlePool,
            tracerPool,
            coinPool,
        },
    };
}
