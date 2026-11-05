/**
 * Don't Sink, Don't Die — Velocity-Reactive 3D Water Wake Ribbon & Landing Splash Ring System
 * (public/js/vfx/water-wake-ribbons.js)
 *
 * Fully pooled, zero-GC Three.js visual effects system delivering:
 * 1. Dynamic V-shaped bow foam wake ribbons that widen and brighten as raft speed increases.
 * 2. Automatic wake emission suspension & smooth trail dissipation when airborne.
 * 3. Expanding concentric 3D turquoise/white splash rings upon landing from waterfall jumps or kickflips.
 * 4. Zero external runtime dependencies, 100% pure procedural Three.js BufferGeometry & pooling.
 */

// ─── CONFIGURATION CONSTANTS ────────────────────────────────────────────────
const WATER_SURFACE_Y = 0.25;
const RIBBON_SEGMENTS = 36;          // Number of quads along each wake ribbon
const MAX_SPLASH_RINGS = 18;         // Pooled concentric splash ring meshes
const DEFAULT_RAFT_HALF_WIDTH = 1.05; // Lateral offset from center for dual bow ribbons
const MIN_WAKE_SPEED = 0.6;          // Speed threshold to begin shedding bow foam
const MAX_SPEED_CAP = 25.0;          // Reference top speed for max ribbon width & brightness

// Concentric ring colors: alternating turquoise & brilliant white foam
const SPLASH_RING_COLORS = [
    0xffffff, // Inner white crest
    0x00f5d4, // Vivid turquoise shockwave
    0x48cae4, // Deep cyan secondary ring
];

/**
 * Creates the Velocity-Reactive 3D Water Wake Ribbon & Landing Splash Ring system.
 *
 * @param {object} THREE - The Three.js library instance
 * @param {object} scene - Three.js Scene to attach visual groups to
 * @param {object} [options] - Configuration overrides
 * @returns {object} Controller instance with update, dispose, triggerLandingSplash, etc.
 */
export function createWaterWakeSystem(THREE, scene, options = {}) {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'WaterWakeSystem_Root';
    scene.add(rootGroup);

    const waterLevel = options.waterLevel ?? WATER_SURFACE_Y;
    const raftHalfWidth = options.raftHalfWidth ?? DEFAULT_RAFT_HALF_WIDTH;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. DUAL V-SHAPED BOW FOAM RIBBON MESHES (LEFT & RIGHT)
    // ─────────────────────────────────────────────────────────────────────────
    // Each ribbon has (RIBBON_SEGMENTS + 1) * 2 vertices and RIBBON_SEGMENTS * 6 indices
    const vertexCount = (RIBBON_SEGMENTS + 1) * 2;
    const indexCount = RIBBON_SEGMENTS * 6;

    function buildRibbonMeshTopology(colorHex = 0xffffff) {
        const positions = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);
        const colors = new Float32Array(vertexCount * 3);
        const indices = new Uint16Array(indexCount);

        let idx = 0;
        for (let s = 0; s < RIBBON_SEGMENTS; s++) {
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
        const posAttr = new (THREE.BufferAttribute || THREE.Float32BufferAttribute)(positions, 3);
        const uvAttr = new (THREE.BufferAttribute || THREE.Float32BufferAttribute)(uvs, 2);
        const colAttr = new (THREE.BufferAttribute || THREE.Float32BufferAttribute)(colors, 3);
        if (posAttr.setUsage && THREE.DynamicDrawUsage) posAttr.setUsage(THREE.DynamicDrawUsage);
        if (colAttr.setUsage && THREE.DynamicDrawUsage) colAttr.setUsage(THREE.DynamicDrawUsage);

        geo.setAttribute('position', posAttr);
        geo.setAttribute('uv', uvAttr);
        geo.setAttribute('color', colAttr);
        if (geo.setIndex) geo.setIndex(new (THREE.BufferAttribute || THREE.Uint16BufferAttribute)(indices, 1));

        // Initialize UVs once
        for (let s = 0; s <= RIBBON_SEGMENTS; s++) {
            const u = s / RIBBON_SEGMENTS;
            uvs[s * 4 + 0] = u;
            uvs[s * 4 + 1] = 0.0;
            uvs[s * 4 + 2] = u;
            uvs[s * 4 + 3] = 1.0;
        }

        // Material with additive or transparent foam blending
        const mat = new (THREE.MeshBasicMaterial || THREE.Material)({
            color: colorHex,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide ?? 2,
            depthWrite: false,
            blending: THREE.NormalBlending ?? 1,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        rootGroup.add(mesh);

        // Pre-allocate segment history points
        const points = [];
        for (let i = 0; i <= RIBBON_SEGMENTS; i++) {
            points.push({
                x: 0,
                y: waterLevel + 0.02,
                z: 0,
                dirX: 0,
                dirZ: -1,
                normX: 1,
                normZ: 0,
                width: 0.2,
                alpha: 0,
                brightness: 0,
                active: false,
            });
        }

        return { mesh, geo, mat, points, positions, colors };
    }

    const leftRibbon = buildRibbonMeshTopology(0xffffff);
    const rightRibbon = buildRibbonMeshTopology(0xffffff);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CONCENTRIC 3D TURQUOISE & WHITE SPLASH RING POOL
    // ─────────────────────────────────────────────────────────────────────────
    const splashRings = [];
    const ringGeo = new (THREE.RingGeometry || THREE.TorusGeometry || THREE.BufferGeometry)(
        0.6,
        1.0,
        36,
        1
    );
    if (ringGeo.rotateX) {
        ringGeo.rotateX(-Math.PI / 2); // Lay flat on horizontal water surface
    }

    for (let i = 0; i < MAX_SPLASH_RINGS; i++) {
        const mat = new (THREE.MeshBasicMaterial || THREE.Material)({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide ?? 2,
            depthWrite: false,
        });

        const mesh = new THREE.Mesh(ringGeo, mat);
        if (mesh.rotation && mesh.rotation.set && !ringGeo.rotateX) {
            mesh.rotation.set(-Math.PI / 2, 0, 0);
        }
        mesh.visible = false;
        mesh.frustumCulled = false;
        rootGroup.add(mesh);

        splashRings.push({
            mesh,
            mat,
            active: false,
            elapsed: 0,
            delay: 0,
            duration: 0.85,
            startRadius: 0.8,
            maxRadius: 6.0,
            initialOpacity: 0.9,
            color: 0xffffff,
            origin: { x: 0, y: waterLevel + 0.03, z: 0 },
        });
    }

    // ─── INTERNAL WAKE SIMULATION HELPERS ────────────────────────────────────

    let lastRaftX = null;
    let lastRaftZ = null;
    let emissionAccumulator = 0;
    let prevAirborne = false;

    /**
     * Triggers concentric 3D turquoise/white splash rings at impact position.
     *
     * @param {object} pos - Landing world coordinate { x, y, z }
     * @param {object} [opts] - Overrides for impact intensity
     */
    function triggerLandingSplash(pos, opts = {}) {
        const impactStrength = Math.min(opts.strength ?? 1.0, 2.5);
        const ringCount = opts.ringCount ?? 3;
        const baseRadius = 1.2 * impactStrength;
        const maxRadius = (4.5 + impactStrength * 3.0);
        const duration = 0.75 + impactStrength * 0.25;

        const centerX = pos.x ?? 0;
        const centerY = (pos.y ?? waterLevel) + 0.02;
        const centerZ = pos.z ?? 0;

        let activated = 0;
        for (let i = 0; i < MAX_SPLASH_RINGS && activated < ringCount; i++) {
            const slot = splashRings[i];
            if (!slot.active) {
                const colorHex = SPLASH_RING_COLORS[activated % SPLASH_RING_COLORS.length];
                const delay = activated * 0.07; // Concentric wave delay

                slot.active = true;
                slot.elapsed = -delay; // Negative elapsed represents countdown delay
                slot.delay = delay;
                slot.duration = duration;
                slot.startRadius = baseRadius * (0.8 + activated * 0.35);
                slot.maxRadius = maxRadius * (0.85 + activated * 0.3);
                slot.initialOpacity = Math.min(1.0, 0.85 + impactStrength * 0.15);
                slot.color = colorHex;
                slot.origin.x = centerX;
                slot.origin.y = centerY;
                slot.origin.z = centerZ;

                if (slot.mat.color && slot.mat.color.setHex) {
                    slot.mat.color.setHex(colorHex);
                }
                slot.mat.opacity = 0;
                slot.mesh.position.set(centerX, centerY, centerZ);
                slot.mesh.scale.set(0.1, 0.1, 0.1);
                slot.mesh.visible = false;

                activated++;
            }
        }
        return activated;
    }

    /**
     * Advances the position history and geometry of a wake ribbon.
     */
    function stepRibbon(ribbon, newSample, dt) {
        const { points, positions, colors, geo } = ribbon;

        // Shift existing history backwards
        for (let s = RIBBON_SEGMENTS; s > 0; s--) {
            const prev = points[s - 1];
            const curr = points[s];

            curr.x = prev.x;
            curr.y = prev.y;
            curr.z = prev.z;
            curr.dirX = prev.dirX;
            curr.dirZ = prev.dirZ;
            curr.normX = prev.normX;
            curr.normZ = prev.normZ;
            curr.width = prev.width;
            curr.alpha = prev.alpha;
            curr.brightness = prev.brightness;
            curr.active = prev.active;

            // Lateral dispersion & width expansion as wake ages
            if (curr.active) {
                curr.width += dt * (0.6 + curr.brightness * 1.2);
                // V-shaped wake expands outward along normal vector
                curr.x += curr.normX * dt * (0.8 + curr.brightness * 1.5);
                curr.z += curr.normZ * dt * (0.8 + curr.brightness * 1.5);
                curr.alpha = Math.max(0, curr.alpha - dt * 1.1);
                if (curr.alpha <= 0.01) {
                    curr.active = false;
                }
            }
        }

        // Insert new head point
        const head = points[0];
        if (newSample && newSample.active) {
            head.x = newSample.x;
            head.y = newSample.y;
            head.z = newSample.z;
            head.dirX = newSample.dirX;
            head.dirZ = newSample.dirZ;
            head.normX = newSample.normX;
            head.normZ = newSample.normZ;
            head.width = newSample.width;
            head.alpha = newSample.alpha;
            head.brightness = newSample.brightness;
            head.active = true;
        } else {
            head.active = false;
            head.alpha = 0;
        }

        // Recompute vertex buffer positions and colors
        for (let s = 0; s <= RIBBON_SEGMENTS; s++) {
            const p = points[s];
            const vInner = s * 2;
            const vOuter = s * 2 + 1;

            if (!p.active || p.alpha <= 0) {
                positions[vInner * 3 + 0] = 0;
                positions[vInner * 3 + 1] = -9999;
                positions[vInner * 3 + 2] = 0;

                positions[vOuter * 3 + 0] = 0;
                positions[vOuter * 3 + 1] = -9999;
                positions[vOuter * 3 + 2] = 0;

                colors[vInner * 3 + 0] = 0;
                colors[vInner * 3 + 1] = 0;
                colors[vInner * 3 + 2] = 0;

                colors[vOuter * 3 + 0] = 0;
                colors[vOuter * 3 + 1] = 0;
                colors[vOuter * 3 + 2] = 0;
                continue;
            }

            // Normal offset for ribbon width
            const halfW = p.width * 0.5;
            const nx = p.normX;
            const nz = p.normZ;

            // Inner vertex (closest to keel line)
            positions[vInner * 3 + 0] = p.x - nx * halfW * 0.2;
            positions[vInner * 3 + 1] = p.y;
            positions[vInner * 3 + 2] = p.z - nz * halfW * 0.2;

            // Outer vertex (spreading out into river)
            positions[vOuter * 3 + 0] = p.x + nx * halfW * 1.8;
            positions[vOuter * 3 + 1] = p.y;
            positions[vOuter * 3 + 2] = p.z + nz * halfW * 1.8;

            // Color gradient: pure white crest at high brightness, soft turquoise at lower speeds
            // Turquoise base: (0.15, 0.90, 0.95), White peak: (1.0, 1.0, 1.0)
            const bright = Math.min(1.0, Math.max(0.0, p.brightness));
            const r = (0.2 + 0.8 * bright) * p.alpha;
            const g = (0.85 + 0.15 * bright) * p.alpha;
            const b = (0.95 + 0.05 * bright) * p.alpha;

            colors[vInner * 3 + 0] = r;
            colors[vInner * 3 + 1] = g;
            colors[vInner * 3 + 2] = b;

            colors[vOuter * 3 + 0] = r * 0.8;
            colors[vOuter * 3 + 1] = g * 0.85;
            colors[vOuter * 3 + 2] = b * 0.9;
        }

        if (geo.attributes.position) geo.attributes.position.needsUpdate = true;
        if (geo.attributes.color) geo.attributes.color.needsUpdate = true;
    }

    /**
     * Frame-by-frame update step advancing wake ribbons and expanding splash rings.
     *
     * @param {number} dt - Delta time in seconds
     * @param {object} raftPos - Raft center position { x, y, z }
     * @param {object|number} velocity - Linear velocity vector { x, y, z } or scalar speed
     * @param {boolean} isAirborne - True if raft is currently airborne
     * @param {boolean} justLanded - True if raft touched down on water this frame
     */
    function update(dt = 1 / 60, raftPos = { x: 0, y: waterLevel, z: 0 }, velocity = 0, isAirborne = false, justLanded = false) {
        if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;

        const px = raftPos.x ?? 0;
        const py = raftPos.y ?? waterLevel;
        const pz = raftPos.z ?? 0;

        // Calculate speed & heading direction
        let vx = 0;
        let vz = 0;
        let speed = 0;

        if (typeof velocity === 'number') {
            speed = Math.abs(velocity);
            if (lastRaftX !== null && lastRaftZ !== null) {
                const dx = px - lastRaftX;
                const dz = pz - lastRaftZ;
                const d = Math.hypot(dx, dz);
                if (d > 0.001) {
                    vx = dx / dt;
                    vz = dz / dt;
                } else {
                    vx = 0;
                    vz = -speed;
                }
            } else {
                vx = 0;
                vz = -speed;
            }
        } else if (velocity && typeof velocity === 'object') {
            vx = velocity.x ?? 0;
            vz = velocity.z ?? 0;
            speed = Math.hypot(vx, vz);
        }

        lastRaftX = px;
        lastRaftZ = pz;

        // Check landing condition (either parameter or airborne state transition)
        const landedThisFrame = Boolean(justLanded || (prevAirborne && !isAirborne));
        prevAirborne = isAirborne;

        if (landedThisFrame) {
            triggerLandingSplash({ x: px, y: py, z: pz }, {
                strength: Math.min(2.5, Math.max(1.0, speed / 8.0)),
                ringCount: 3,
            });
        }

        // 1. Compute Bow Wake Ribbons emission
        const speedRatio = Math.min(1.0, Math.max(0.0, speed / MAX_SPEED_CAP));
        const canEmitWake = !isAirborne && speed >= MIN_WAKE_SPEED && py <= (waterLevel + 0.35);

        let leftSample = null;
        let rightSample = null;

        if (canEmitWake) {
            // Heading vector (normalized)
            const forwardLen = Math.hypot(vx, vz) || 1;
            const fx = vx / forwardLen;
            const fz = vz / forwardLen;

            // Lateral normal vector (perpendicular to heading)
            // Forward is (fx, fz). In 3D (X right, Z back), heading downriver is -Z.
            // Port (left) is -X, Starboard (right) is +X.
            // Left normal: (fz, -fx) which for forward=(0, -1) gives (-1, 0).
            // Right normal: (-fz, fx) which for forward=(0, -1) gives (1, 0).
            const lx = fz;
            const lz = -fx;
            const rx = -fz;
            const rz = fx;

            // Dynamic ribbon width & brightness/opacity scale with speed
            const ribbonWidth = 0.35 + speedRatio * 1.45; // Widen as raft speed increases (up to ~1.8m)
            const ribbonBrightness = 0.25 + speedRatio * 0.75; // Brighten up to 1.0 (pure white foam)
            const ribbonAlpha = 0.45 + speedRatio * 0.55;

            // Bow offset: wake originates slightly forward along raft hull
            const bowX = px + fx * 0.6;
            const bowZ = pz + fz * 0.6;

            leftSample = {
                active: true,
                x: bowX + lx * raftHalfWidth,
                y: waterLevel + 0.02,
                z: bowZ + lz * raftHalfWidth,
                dirX: fx,
                dirZ: fz,
                normX: lx,
                normZ: lz,
                width: ribbonWidth,
                alpha: ribbonAlpha,
                brightness: ribbonBrightness,
            };

            rightSample = {
                active: true,
                x: bowX + rx * raftHalfWidth,
                y: waterLevel + 0.02,
                z: bowZ + rz * raftHalfWidth,
                dirX: fx,
                dirZ: fz,
                normX: rx,
                normZ: rz,
                width: ribbonWidth,
                alpha: ribbonAlpha,
                brightness: ribbonBrightness,
            };

            // Dynamic material opacity modulation with speed
            leftRibbon.mat.opacity = Math.min(1.0, 0.45 + speedRatio * 0.55);
            rightRibbon.mat.opacity = Math.min(1.0, 0.45 + speedRatio * 0.55);
        } else {
            // When airborne or stopped, no new wake is added; existing segments decay smoothly
            leftRibbon.mat.opacity = Math.max(0.0, leftRibbon.mat.opacity - dt * 1.5);
            rightRibbon.mat.opacity = Math.max(0.0, rightRibbon.mat.opacity - dt * 1.5);
        }

        stepRibbon(leftRibbon, leftSample, dt);
        stepRibbon(rightRibbon, rightSample, dt);

        // 2. Update Concentric 3D Splash Rings
        for (const ring of splashRings) {
            if (!ring.active) continue;

            ring.elapsed += dt;

            // Still in countdown delay before expanding
            if (ring.elapsed < 0) {
                ring.mesh.visible = false;
                continue;
            }

            const progress = ring.elapsed / ring.duration;
            if (progress >= 1.0) {
                ring.active = false;
                ring.mesh.visible = false;
                continue;
            }

            // Expanding radius with ease-out quadratic deceleration
            const easeOut = 1.0 - Math.pow(1.0 - progress, 2);
            const currentRadius = ring.startRadius + (ring.maxRadius - ring.startRadius) * easeOut;

            ring.mesh.scale.set(currentRadius, currentRadius, currentRadius);
            ring.mesh.position.set(ring.origin.x, ring.origin.y, ring.origin.z);

            // Opacity fades smoothly over lifespan
            const fade = Math.max(0, 1.0 - progress);
            ring.mat.opacity = ring.initialOpacity * Math.pow(fade, 1.4);
            ring.mesh.visible = true;
        }
    }

    /**
     * Cleanly disposes all geometries, materials, and removes meshes from scene.
     */
    function dispose() {
        scene.remove(rootGroup);

        leftRibbon.geo.dispose?.();
        leftRibbon.mat.dispose?.();

        rightRibbon.geo.dispose?.();
        rightRibbon.mat.dispose?.();

        ringGeo.dispose?.();
        for (const ring of splashRings) {
            ring.mat.dispose?.();
        }

        splashRings.length = 0;
        leftRibbon.points.length = 0;
        rightRibbon.points.length = 0;
    }

    return {
        rootGroup,
        update,
        triggerLandingSplash,
        dispose,
        _pools: {
            splashRings,
            leftRibbon,
            rightRibbon,
        },
    };
}
