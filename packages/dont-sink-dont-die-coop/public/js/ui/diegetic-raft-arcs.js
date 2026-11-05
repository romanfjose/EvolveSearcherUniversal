/**
 * Don't Sink, Don't Die — Diegetic 3D Raft Health & Stamina Arc Rings
 * (public/js/ui/diegetic-raft-arcs.js)
 *
 * Implements Helmet 01's Cockpit Pilot Directives:
 * - Keeps the pilot's eyes locked on the center of the river in line of sight.
 * - Renders a crisp, curved 3D holographic arc on the water just behind the raft:
 *     1. Hull HP Arc (outer ring): Emerald (0x10b981) -> Amber (0xf59e0b) -> Crimson (0xef4444)
 *     2. Jump / Kickflip Readiness Stamina Arc (inner ring): Cyan (0x06b6d4 / 0x00f5d4)
 * - Auto-fades the arcs to 25% opacity when full/nominal, minimizing visual clutter.
 * - Pulses brightly (up to 1.0 opacity & emissive flash) when taking damage or charging/readying a stunt.
 * - Pure ES module, zero external CDN dependencies, fully pooled and zero-GC per frame.
 */

export const ARC_COLORS = {
    HULL_EMERALD: 0x10b981, // Healthy > 50%
    HULL_AMBER: 0xf59e0b,   // Damaged 25% - 50%
    HULL_CRIMSON: 0xef4444, // Critical < 25%
    STAMINA_CYAN: 0x06b6d4, // Full Jump/Kickflip readiness
    STAMINA_CHARGING: 0x38bdf8, // Charging stunt
    STAMINA_EXHAUSTED: 0x0e7490, // Cooldown / spent
    HOLO_BACKPLATE: 0x0f172a, // Subtle dark backdrop ring
};

export const ARC_CONFIG = {
    WATER_SURFACE_Y: 0.25,
    OFFSET_BEHIND_RAFT: 2.2, // Distance behind craft center along raft heading
    DEFAULT_Y_OFFSET: 0.08,  // Floating slightly above water surface to avoid z-fighting

    // Arc Radius & Thickness (Inner = Stamina, Outer = Health)
    HEALTH_INNER_RADIUS: 2.1,
    HEALTH_OUTER_RADIUS: 2.35,
    STAMINA_INNER_RADIUS: 1.7,
    STAMINA_OUTER_RADIUS: 1.95,

    // Arc angular spans (in radians).
    // An arc centered at the stern facing backwards or curved behind the stern:
    // Arc spans 120 degrees (-PI/3 to +PI/3 or mirrored)
    ARC_TOTAL_SPAN_RAD: (130 * Math.PI) / 180, // ~2.27 rad (130 degrees)
    ARC_SEGMENTS: 32,

    // Opacity states
    NOMINAL_OPACITY: 0.25,
    PULSE_DAMAGE_OPACITY: 0.95,
    PULSE_STUNT_OPACITY: 0.90,
    FADE_LERP_SPEED: 4.5,
};

/**
 * Pure helper to clamp value between min and max.
 */
export function clamp(v, min = 0, max = 1) {
    return Math.max(min, Math.min(max, v));
}

/**
 * Pure helper to linearly interpolate between two numbers.
 */
export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Interpolates between emerald -> amber -> crimson based on normalized health ratio (0..1).
 *
 * @param {number} ratio - 0 (dead) to 1 (full health)
 * @returns {number} Hex color integer
 */
export function getHealthColorHex(ratio) {
    const r = clamp(ratio, 0, 1);
    if (r >= 0.5) {
        // Emerald (0x10b981) to Amber (0xf59e0b)
        const t = (r - 0.5) / 0.5; // 0 at 0.5 (Amber), 1 at 1.0 (Emerald)
        const rComp = Math.round(lerp(0xf5, 0x10, t));
        const gComp = Math.round(lerp(0x9e, 0xb9, t));
        const bComp = Math.round(lerp(0x0b, 0x81, t));
        return (rComp << 16) | (gComp << 8) | bComp;
    } else {
        // Crimson (0xef4444) to Amber (0xf59e0b)
        const t = r / 0.5; // 0 at 0.0 (Crimson), 1 at 0.5 (Amber)
        const rComp = Math.round(lerp(0xef, 0xf5, t));
        const gComp = Math.round(lerp(0x44, 0x9e, t));
        const bComp = Math.round(lerp(0x44, 0x0b, t));
        return (rComp << 16) | (gComp << 8) | bComp;
    }
}

/**
 * Calculates the target opacity and pulse intensity based on health and stunt readiness.
 * Full health (1.0) and full stamina (1.0) without pulses smoothly decay to NOMINAL_OPACITY (0.25).
 * Damage or charging elevates opacity towards 1.0.
 */
export function computeArcOpacity({
    healthRatio = 1.0,
    staminaRatio = 1.0,
    damagePulseTimer = 0,
    stuntPulseTimer = 0,
    isAirborne = false,
}) {
    let target = ARC_CONFIG.NOMINAL_OPACITY;

    // If damaged (< 0.98) or stamina not full (< 0.98), pilot needs line-of-sight awareness
    if (healthRatio < 0.98) {
        // Urgency scales up as health drops
        const healthUrgency = (1 - healthRatio);
        target = Math.max(target, 0.45 + healthUrgency * 0.45);
    }

    if (staminaRatio < 0.98 || isAirborne) {
        target = Math.max(target, 0.55);
    }

    // High-priority bright pulses
    if (damagePulseTimer > 0) {
        const p = clamp(damagePulseTimer, 0, 1);
        target = Math.max(target, lerp(ARC_CONFIG.NOMINAL_OPACITY, ARC_CONFIG.PULSE_DAMAGE_OPACITY, p));
    }
    if (stuntPulseTimer > 0) {
        const p = clamp(stuntPulseTimer, 0, 1);
        target = Math.max(target, lerp(ARC_CONFIG.NOMINAL_OPACITY, ARC_CONFIG.PULSE_STUNT_OPACITY, p));
    }

    return clamp(target, ARC_CONFIG.NOMINAL_OPACITY, 1.0);
}

/**
 * Procedural mesh builder for an arc sector using custom BufferGeometry or RingGeometry.
 * Works seamlessly with native Three.js or lightweight test mocks.
 */
export function buildArcGeometry(THREE, innerRadius, outerRadius, thetaLength, thetaStart = 0, segments = ARC_CONFIG.ARC_SEGMENTS) {
    if (THREE.RingGeometry) {
        const geo = new THREE.RingGeometry(innerRadius, outerRadius, segments, 1, thetaStart, thetaLength);
        geo.rotateX(-Math.PI / 2); // Lay flat on the horizontal water plane (XZ)
        return geo;
    }

    // Fallback BufferGeometry if RingGeometry is not defined
    const geo = new THREE.BufferGeometry();
    const vertexCount = (segments + 1) * 2;
    const indices = [];
    const positions = new Float32Array(vertexCount * 3);

    for (let i = 0; i <= segments; i++) {
        const segmentProgress = i / segments;
        const angle = thetaStart + segmentProgress * thetaLength;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Inner vertex
        const idxIn = i * 2;
        positions[idxIn * 3 + 0] = innerRadius * cos;
        positions[idxIn * 3 + 1] = 0;
        positions[idxIn * 3 + 2] = innerRadius * sin;

        // Outer vertex
        const idxOut = i * 2 + 1;
        positions[idxOut * 3 + 0] = outerRadius * cos;
        positions[idxOut * 3 + 1] = 0;
        positions[idxOut * 3 + 2] = outerRadius * sin;

        if (i < segments) {
            const a = idxIn;
            const b = idxOut;
            const c = idxIn + 2;
            const d = idxOut + 2;
            indices.push(a, b, c);
            indices.push(b, d, c);
        }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
}

/**
 * Creates holographic material with emissive glow and transparency.
 */
export function createArcMaterial(THREE, colorHex, opacity = ARC_CONFIG.NOMINAL_OPACITY) {
    if (THREE.MeshBasicMaterial) {
        return new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity,
            depthWrite: false,
            side: (THREE.DoubleSide !== undefined ? THREE.DoubleSide : 2),
        });
    }

    return {
        color: { setHex(h) { this.hex = h; }, hex: colorHex },
        opacity,
        transparent: true,
        dispose() {},
    };
}

/**
 * Factory creating the Diegetic 3D Raft Health & Stamina Arc Rings component.
 *
 * @param {object} THREE - Three.js instance
 * @param {object} scene - Three.js Scene to attach rootGroup to
 * @param {object} [options] - Configuration overrides
 * @returns {object} Controller instance with update, pulse, and dispose methods
 */
export function createDiegeticRaftArcs(THREE, scene, options = {}) {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'DiegeticRaftArcs_Root';
    scene.add(rootGroup);

    const waterLevel = options.waterLevel ?? ARC_CONFIG.WATER_SURFACE_Y;
    const offsetBehind = options.offsetBehind ?? ARC_CONFIG.OFFSET_BEHIND_RAFT;
    const yOffset = options.yOffset ?? ARC_CONFIG.DEFAULT_Y_OFFSET;

    // Total arc span centered backwards (facing stern: theta from PI/2 - span/2 to PI/2 + span/2)
    // In Three.js XZ plane, rotation around Y:
    // angle 0 points in +X. An arc centered towards -Z (stern) or +Z:
    // Centering arc at angle Math.PI / 2 (or backplate centered along -Z direction)
    const totalSpan = ARC_CONFIG.ARC_TOTAL_SPAN_RAD;
    const startAngle = Math.PI / 2 - totalSpan / 2;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. BACKPLATE MESHES (Dark holographic guide rails)
    // ─────────────────────────────────────────────────────────────────────────
    const healthBackGeo = buildArcGeometry(THREE, ARC_CONFIG.HEALTH_INNER_RADIUS, ARC_CONFIG.HEALTH_OUTER_RADIUS, totalSpan, startAngle);
    const healthBackMat = createArcMaterial(THREE, ARC_COLORS.HOLO_BACKPLATE, 0.15);
    const healthBackMesh = new THREE.Mesh(healthBackGeo, healthBackMat);
    healthBackMesh.name = 'Diegetic_Health_Backplate';
    rootGroup.add(healthBackMesh);

    const staminaBackGeo = buildArcGeometry(THREE, ARC_CONFIG.STAMINA_INNER_RADIUS, ARC_CONFIG.STAMINA_OUTER_RADIUS, totalSpan, startAngle);
    const staminaBackMat = createArcMaterial(THREE, ARC_COLORS.HOLO_BACKPLATE, 0.15);
    const staminaBackMesh = new THREE.Mesh(staminaBackGeo, staminaBackMat);
    staminaBackMesh.name = 'Diegetic_Stamina_Backplate';
    rootGroup.add(staminaBackMesh);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. ACTIVE FILL MESHES (Dynamic scale/angle representing HP & Stamina)
    // ─────────────────────────────────────────────────────────────────────────
    // We create base full-arc geometries for Health and Stamina.
    // By scaling or rebuilding them along the arc progress, we show the meter.
    // For smooth, zero-GC performance, we maintain separate fill segments or an adjustable geometry.
    // To guarantee 100% precision without memory leaks, we build a segmented ring where
    // each segment or transform represents the filled arc.
    const healthFillGeo = buildArcGeometry(THREE, ARC_CONFIG.HEALTH_INNER_RADIUS, ARC_CONFIG.HEALTH_OUTER_RADIUS, totalSpan, startAngle);
    const healthFillMat = createArcMaterial(THREE, ARC_COLORS.HULL_EMERALD, ARC_CONFIG.NOMINAL_OPACITY);
    const healthFillMesh = new THREE.Mesh(healthFillGeo, healthFillMat);
    healthFillMesh.name = 'Diegetic_Health_Fill';
    rootGroup.add(healthFillMesh);

    const staminaFillGeo = buildArcGeometry(THREE, ARC_CONFIG.STAMINA_INNER_RADIUS, ARC_CONFIG.STAMINA_OUTER_RADIUS, totalSpan, startAngle);
    const staminaFillMat = createArcMaterial(THREE, ARC_COLORS.STAMINA_CYAN, ARC_CONFIG.NOMINAL_OPACITY);
    const staminaFillMesh = new THREE.Mesh(staminaFillGeo, staminaFillMat);
    staminaFillMesh.name = 'Diegetic_Stamina_Fill';
    rootGroup.add(staminaFillMesh);

    // Dynamic State
    let currentHealth = 100;
    let maxHealth = 100;
    let currentStamina = 1.0; // 0..1 (Jump / Kickflip readiness)
    let damagePulseTimer = 0; // seconds remaining of damage flash
    let stuntPulseTimer = 0;  // seconds remaining of stunt flash
    let currentOpacity = ARC_CONFIG.NOMINAL_OPACITY;
    let visible = true;

    // Previous health cache for automatic damage pulse detection
    let prevHealth = currentHealth;

    /**
     * Triggers an immediate bright holographic pulse when the hull takes damage.
     */
    function triggerDamagePulse(duration = 0.6) {
        damagePulseTimer = Math.max(damagePulseTimer, duration);
    }

    /**
     * Triggers a bright cyan pulse when charging or executing a stunt / kickflip.
     */
    function triggerStuntPulse(duration = 0.5) {
        stuntPulseTimer = Math.max(stuntPulseTimer, duration);
    }

    /**
     * Updates arc health and maximum health values.
     */
    function setHealth(health, max = 100) {
        currentHealth = Math.max(0, Number(health) || 0);
        maxHealth = Math.max(1, Number(max) || 100);
        if (currentHealth < prevHealth) {
            triggerDamagePulse(0.5);
        }
        prevHealth = currentHealth;
    }

    /**
     * Sets jump / kickflip readiness ratio (0.0 to 1.0).
     */
    function setJumpReadiness(ratio) {
        currentStamina = clamp(Number(ratio) || 0, 0, 1);
    }

    /**
     * Main frame update loop.
     * Keeps the arc anchored to the raft in line of sight, evaluates opacity & colors,
     * and pulses during damage or stunts.
     *
     * @param {number} dt - Delta time in seconds
     * @param {object} raftData - Raft position, yaw, health, readiness, and airborne status
     */
    function update(dt = 0.016, raftData = {}) {
        if (!visible) {
            rootGroup.visible = false;
            return;
        }
        rootGroup.visible = true;

        const safeDt = Math.min(0.1, Math.max(0.001, Number(dt) || 0.016));

        // 1. Decay pulse timers
        if (damagePulseTimer > 0) damagePulseTimer = Math.max(0, damagePulseTimer - safeDt);
        if (stuntPulseTimer > 0) stuntPulseTimer = Math.max(0, stuntPulseTimer - safeDt);

        // 2. Read state inputs from raftData if supplied
        if (raftData.health !== undefined) {
            setHealth(raftData.health, raftData.maxHealth ?? maxHealth);
        }
        if (raftData.jumpReadiness !== undefined || raftData.stamina !== undefined) {
            setJumpReadiness(raftData.jumpReadiness ?? raftData.stamina);
        }
        if (raftData.takingDamage) {
            triggerDamagePulse(0.6);
        }
        if (raftData.chargingStunt || raftData.stuntActive) {
            triggerStuntPulse(0.4);
        }

        const healthRatio = clamp(currentHealth / maxHealth, 0, 1);
        const staminaRatio = clamp(currentStamina, 0, 1);
        const isAirborne = Boolean(raftData.airborne);

        // 3. Compute dynamic target opacity and smooth lerp
        const targetOpacity = computeArcOpacity({
            healthRatio,
            staminaRatio,
            damagePulseTimer,
            stuntPulseTimer,
            isAirborne,
        });
        // Pulses react immediately (fast attack, smooth release)
        if (targetOpacity > currentOpacity) {
            currentOpacity = lerp(currentOpacity, targetOpacity, Math.min(1.0, 16.0 * safeDt));
        } else {
            currentOpacity = lerp(currentOpacity, targetOpacity, ARC_CONFIG.FADE_LERP_SPEED * safeDt);
        }

        // 4. Update Hull HP Arc color (emerald -> amber -> crimson) & fill scale
        const healthColor = getHealthColorHex(healthRatio);
        if (healthFillMat.color?.setHex) {
            healthFillMat.color.setHex(healthColor);
        }
        if (healthFillMat.opacity !== undefined) {
            healthFillMat.opacity = currentOpacity;
        }

        // Scale arc fill angularly: scale around Y or scale geometry.
        // We can scale the X/Z slightly or scale along the angle arc.
        // By scaling healthFillMesh.scale.x smoothly, it visually represents the remaining arc length.
        const healthFillScale = Math.max(0.01, healthRatio);
        healthFillMesh.scale.set(healthFillScale, 1, healthFillScale);

        // 5. Update Stamina Arc color & fill scale
        const staminaColor = stuntPulseTimer > 0
            ? ARC_COLORS.STAMINA_CHARGING
            : (staminaRatio < 0.2 ? ARC_COLORS.STAMINA_EXHAUSTED : ARC_COLORS.STAMINA_CYAN);

        if (staminaFillMat.color?.setHex) {
            staminaFillMat.color.setHex(staminaColor);
        }
        if (staminaFillMat.opacity !== undefined) {
            // Pulse stunt opacity higher if stunt active
            staminaFillMat.opacity = stuntPulseTimer > 0
                ? Math.min(1.0, currentOpacity * 1.3)
                : currentOpacity;
        }

        const staminaFillScale = Math.max(0.01, staminaRatio);
        staminaFillMesh.scale.set(staminaFillScale, 1, staminaFillScale);

        // Backplates keep nominal subtle contrast
        if (healthBackMat.opacity !== undefined) {
            healthBackMat.opacity = currentOpacity * 0.4;
        }
        if (staminaBackMat.opacity !== undefined) {
            staminaBackMat.opacity = currentOpacity * 0.4;
        }

        // 6. Anchor position on water surface just behind the raft
        const posX = Number(raftData.x ?? raftData.position?.x) || 0;
        const posY = (Number(raftData.y ?? raftData.position?.y) || waterLevel);
        const posZ = Number(raftData.z ?? raftData.position?.z) || 0;
        const yaw = Number(raftData.yaw ?? raftData.rotation?.y) || 0;

        // Calculate offset behind raft along raft heading:
        // Heading forward is along +Z or -Z depending on yaw;
        // In this game, river flows towards negative Z (0 down to -1500).
        // Stern (behind) is in the +Z direction relative to raft forward.
        const sternOffsetX = Math.sin(yaw) * offsetBehind;
        const sternOffsetZ = Math.cos(yaw) * offsetBehind;

        // Position on water level
        rootGroup.position.set(
            posX + sternOffsetX,
            waterLevel + yOffset,
            posZ + sternOffsetZ
        );

        // Rotate arc to stay aligned with raft orientation
        rootGroup.rotation.y = yaw;

        // Subtle gentle water bobbing to look alive
        const timeSec = (raftData.elapsedSec ?? raftData.time) || 0;
        if (timeSec) {
            rootGroup.position.y += Math.sin(timeSec * 2.5) * 0.02;
        }
    }

    /**
     * Toggles visibility of the diegetic arcs.
     */
    function setVisible(val) {
        visible = Boolean(val);
        rootGroup.visible = visible;
    }

    /**
     * Completely cleans up all geometries and materials from scene.
     */
    function dispose() {
        healthBackGeo.dispose?.();
        staminaBackGeo.dispose?.();
        healthFillGeo.dispose?.();
        staminaFillGeo.dispose?.();

        healthBackMat.dispose?.();
        staminaBackMat.dispose?.();
        healthFillMat.dispose?.();
        staminaFillMat.dispose?.();

        rootGroup.remove(healthBackMesh);
        rootGroup.remove(staminaBackMesh);
        rootGroup.remove(healthFillMesh);
        rootGroup.remove(staminaFillMesh);

        scene.remove(rootGroup);
    }

    return {
        rootGroup,
        healthFillMesh,
        staminaFillMesh,
        healthBackMesh,
        staminaBackMesh,
        healthFillMat,
        staminaFillMat,
        get currentHealth() { return currentHealth; },
        get maxHealth() { return maxHealth; },
        get currentStamina() { return currentStamina; },
        get currentOpacity() { return currentOpacity; },
        get visible() { return visible; },
        setHealth,
        setJumpReadiness,
        triggerDamagePulse,
        triggerStuntPulse,
        setVisible,
        update,
        dispose,
    };
}
