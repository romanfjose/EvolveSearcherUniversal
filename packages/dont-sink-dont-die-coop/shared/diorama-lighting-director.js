/**
 * Sovereign Core & Helmet 04 Directive — High-Angle Diorama Lighting, Sky Dome & Depth-Clarity Controller
 * (`shared/diorama-lighting-director.js`)
 *
 * Why this exists:
 * In high-angle tactical co-op or diorama perspective (camera pitch ~35° to 65°, distance 25m–55m,
 * wide 80m river corridor), traditional ground-level fog and flat lighting drown the playfield in murky haze,
 * wash out water wave specular peaks, or occlude upcoming mid-river split islands, docking platforms, and distant biomes.
 *
 * This pure, zero-dependency controller dynamically tunes:
 *   1. Atmospheric fog far-plane (pushed back to 260m+ across all biomes so the wide river board remains crisp).
 *   2. Linear and exponential fog density, near-plane, and color balancing adapted for steep viewing angles.
 *   3. Hemisphere sky/ground fill light intensities and color balancing to maintain high contrast on top-down surfaces.
 *   4. Directional sun intensity, direction vector, and specular exponent/intensity adjustments for razor-sharp water specular highlights.
 *   5. Seamless 4-Act river progression + Endless sector transitions with smooth interpolation.
 *
 * Zero external dependencies. Headless-safe, deterministic, pure ES module.
 */

/**
 * Standard Act boundaries along the river (z decreases downriver).
 */
export const DIORAMA_ACT_Z_BOUNDS = Object.freeze({
    ACT1_START: 0,
    ACT1_END: -375,
    ACT2_END: -750,
    ACT3_END: -1125,
    ACT4_END: -1500,
});

export const DIORAMA_TRANSITION_METERS = 75;

/**
 * Canonical biome lighting and sky presets for High-Angle Diorama rendering.
 * Fog far distances are calibrated to keep the 80m wide river corridor crisp past 260m.
 */
export const DIORAMA_BIOME_PRESETS = Object.freeze({
    'amber-canyon': Object.freeze({
        actIndex: 1,
        id: 'amber-canyon',
        name: 'Amber Canyon Headwaters',
        skyDome: {
            topColor: { r: 0.05, g: 0.11, b: 0.21, hex: 0x0d1b35 },
            midColor: { r: 0.17, g: 0.30, b: 0.44, hex: 0x2b4c6f },
            horizonColor: { r: 0.85, g: 0.50, b: 0.33, hex: 0xd97f54 },
            sunColor: { r: 1.0, g: 0.88, b: 0.70, hex: 0xffe0b2 },
        },
        fog: {
            color: { r: 0.16, g: 0.24, b: 0.33, hex: 0x283c54 },
            near: 70,
            far: 320,               // Deep canyon clarity far plane >= 260m
            density: 0.0032,
        },
        hemiLight: {
            skyColor: { r: 0.62, g: 0.77, b: 1.0, hex: 0x9ec5ff },
            groundColor: { r: 0.24, g: 0.18, b: 0.12, hex: 0x3d2e1e },
            intensity: 0.72,
        },
        sunLight: {
            color: { r: 1.0, g: 0.88, b: 0.70, hex: 0xffe0b2 },
            intensity: 1.35,
            direction: { x: 0.35, y: 0.52, z: -0.78 },
        },
        waterSpecular: {
            specularPower: 96,
            specularIntensity: 1.15,
            fresnelBias: 0.04,
            fresnelScale: 0.96,
            clarity: 0.25,
            roughnessCompensation: 0.85,
        },
    }),

    'neon-harbor': Object.freeze({
        actIndex: 2,
        id: 'neon-harbor',
        name: 'Neon Harbor & Smuggler Docks',
        skyDome: {
            topColor: { r: 0.04, g: 0.06, b: 0.16, hex: 0x0a1029 },
            midColor: { r: 0.09, g: 0.13, b: 0.27, hex: 0x172145 },
            horizonColor: { r: 0.28, g: 0.18, b: 0.45, hex: 0x472e73 },
            sunColor: { r: 0.45, g: 0.75, b: 1.0, hex: 0x73bfff },
        },
        fog: {
            color: { r: 0.10, g: 0.12, b: 0.22, hex: 0x191e38 },
            near: 55,
            far: 290,               // Harbor sea-fog pushed back to 290m
            density: 0.0038,
        },
        hemiLight: {
            skyColor: { r: 0.35, g: 0.48, b: 0.75, hex: 0x597abf },
            groundColor: { r: 0.12, g: 0.14, b: 0.22, hex: 0x1e2438 },
            intensity: 0.68,
        },
        sunLight: {
            color: { r: 0.45, g: 0.75, b: 1.0, hex: 0x73bfff },
            intensity: 1.05,
            direction: { x: 0.25, y: 0.60, z: -0.76 },
        },
        waterSpecular: {
            specularPower: 80,
            specularIntensity: 1.25,
            fresnelBias: 0.05,
            fresnelScale: 1.05,
            clarity: 0.50,
            roughnessCompensation: 0.90,
        },
    }),

    'bioluminescent-gorge': Object.freeze({
        actIndex: 3,
        id: 'bioluminescent-gorge',
        name: 'Bioluminescent Abyssal Gorge',
        skyDome: {
            topColor: { r: 0.01, g: 0.03, b: 0.08, hex: 0x030814 },
            midColor: { r: 0.04, g: 0.10, b: 0.18, hex: 0x0a1a2e },
            horizonColor: { r: 0.08, g: 0.35, b: 0.42, hex: 0x14596b },
            sunColor: { r: 0.35, g: 0.95, b: 0.85, hex: 0x59f3d9 },
        },
        fog: {
            color: { r: 0.05, g: 0.15, b: 0.20, hex: 0x0d2633 },
            near: 50,
            far: 275,               // Subterranean crystal mist far plane at 275m
            density: 0.0042,
        },
        hemiLight: {
            skyColor: { r: 0.20, g: 0.62, b: 0.70, hex: 0x339eb3 },
            groundColor: { r: 0.08, g: 0.18, b: 0.16, hex: 0x142e29 },
            intensity: 0.75,
        },
        sunLight: {
            color: { r: 0.35, g: 0.95, b: 0.85, hex: 0x59f3d9 },
            intensity: 0.95,
            direction: { x: 0.20, y: 0.65, z: -0.73 },
        },
        waterSpecular: {
            specularPower: 112,
            specularIntensity: 1.40,
            fresnelBias: 0.06,
            fresnelScale: 1.15,
            clarity: 0.80,
            roughnessCompensation: 0.95,
        },
    }),

    'tempest-maelstrom': Object.freeze({
        actIndex: 4,
        id: 'tempest-maelstrom',
        name: 'Tempest Maelstrom & Citadel Mouth',
        skyDome: {
            topColor: { r: 0.03, g: 0.05, b: 0.10, hex: 0x080d1a },
            midColor: { r: 0.11, g: 0.14, b: 0.22, hex: 0x1c2438 },
            horizonColor: { r: 0.22, g: 0.28, b: 0.38, hex: 0x384761 },
            sunColor: { r: 0.75, g: 0.82, b: 0.95, hex: 0xc0d1f2 },
        },
        fog: {
            color: { r: 0.14, g: 0.17, b: 0.24, hex: 0x242b3d },
            near: 45,
            far: 265,               // Tempest storm squall guaranteed >= 260m
            density: 0.0048,
        },
        hemiLight: {
            skyColor: { r: 0.38, g: 0.45, b: 0.62, hex: 0x61739e },
            groundColor: { r: 0.09, g: 0.11, b: 0.15, hex: 0x171c26 },
            intensity: 0.82,
        },
        sunLight: {
            color: { r: 0.75, g: 0.82, b: 0.95, hex: 0xc0d1f2 },
            intensity: 1.20,
            direction: { x: 0.15, y: 0.70, z: -0.70 },
        },
        waterSpecular: {
            specularPower: 72,
            specularIntensity: 1.30,
            fresnelBias: 0.05,
            fresnelScale: 1.10,
            clarity: 1.0,
            roughnessCompensation: 1.0,
        },
    }),
});

/**
 * Default fallback camera parameters.
 * High-angle diorama typically operates at pitch ~0.82 rad (~47°) and distance 32m–40m.
 */
export const DEFAULT_DIORAMA_CAMERA = Object.freeze({
    pitch: 0.8203, // ~47 degrees
    distance: 35.0,
    minFogFarMeters: 260.0,
});

/** Clamps a number between min and max */
export function clamp(v, min, max) {
    if (typeof v !== 'number' || Number.isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
}

/** Linear interpolation between two numbers */
export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

/** Converts RGB channels [0, 1] to a 24-bit hexadecimal integer */
export function rgbToHex(r, g, b) {
    const ir = clamp(Math.round(r * 255), 0, 255);
    const ig = clamp(Math.round(g * 255), 0, 255);
    const ib = clamp(Math.round(b * 255), 0, 255);
    return (ir << 16) | (ig << 8) | ib;
}

/** Linear interpolation between two RGB color objects */
export function lerpColor(c1, c2, t) {
    const factor = clamp(t, 0, 1);
    const r = c1.r + (c2.r - c1.r) * factor;
    const g = c1.g + (c2.g - c1.g) * factor;
    const b = c1.b + (c2.b - c1.b) * factor;
    return {
        r: Number(r.toFixed(4)),
        g: Number(g.toFixed(4)),
        b: Number(b.toFixed(4)),
        hex: rgbToHex(r, g, b),
    };
}

/** Normalizes a 3D vector */
export function normalizeVector3(v) {
    const len = Math.hypot(v.x, v.y, v.z) || 1.0;
    return {
        x: Number((v.x / len).toFixed(4)),
        y: Number((v.y / len).toFixed(4)),
        z: Number((v.z / len).toFixed(4)),
    };
}

/**
 * Interpolates a 3D direction vector and normalizes the outcome.
 */
export function lerpVector3(v1, v2, t) {
    const factor = clamp(t, 0, 1);
    const raw = {
        x: v1.x + (v2.x - v1.x) * factor,
        y: v1.y + (v2.y - v1.y) * factor,
        z: v1.z + (v2.z - v1.z) * factor,
    };
    return normalizeVector3(raw);
}

/**
 * Resolves the primary biome key and transition pair for a river coordinate z.
 * Handles Act 1 (0 to -375), Act 2 (-375 to -750), Act 3 (-750 to -1125), Act 4 (-1125 to -1500+).
 *
 * @param {number} z
 * @param {number} [transitionZone=DIORAMA_TRANSITION_METERS]
 * @returns {{ fromKey: string, toKey: string, factor: number, actIndex: number }}
 */
export function resolveBiomeBlendKeys(z, transitionZone = DIORAMA_TRANSITION_METERS) {
    const zPos = typeof z === 'number' && Number.isFinite(z) ? z : 0;
    const tZone = Math.max(1, transitionZone);

    const act1End = DIORAMA_ACT_Z_BOUNDS.ACT1_END; // -375
    const act2End = DIORAMA_ACT_Z_BOUNDS.ACT2_END; // -750
    const act3End = DIORAMA_ACT_Z_BOUNDS.ACT3_END; // -1125

    // Act I
    if (zPos >= act1End + tZone) {
        return { fromKey: 'amber-canyon', toKey: 'amber-canyon', factor: 0, actIndex: 1 };
    }
    // Transition Act 1 -> Act 2
    if (zPos >= act1End - tZone) {
        const factor = clamp((act1End + tZone - zPos) / (2 * tZone), 0, 1);
        return {
            fromKey: 'amber-canyon',
            toKey: 'neon-harbor',
            factor,
            actIndex: factor < 0.5 ? 1 : 2,
        };
    }
    // Act II
    if (zPos >= act2End + tZone) {
        return { fromKey: 'neon-harbor', toKey: 'neon-harbor', factor: 0, actIndex: 2 };
    }
    // Transition Act 2 -> Act 3
    if (zPos >= act2End - tZone) {
        const factor = clamp((act2End + tZone - zPos) / (2 * tZone), 0, 1);
        return {
            fromKey: 'neon-harbor',
            toKey: 'bioluminescent-gorge',
            factor,
            actIndex: factor < 0.5 ? 2 : 3,
        };
    }
    // Act III
    if (zPos >= act3End + tZone) {
        return { fromKey: 'bioluminescent-gorge', toKey: 'bioluminescent-gorge', factor: 0, actIndex: 3 };
    }
    // Transition Act 3 -> Act 4
    if (zPos >= act3End - tZone) {
        const factor = clamp((act3End + tZone - zPos) / (2 * tZone), 0, 1);
        return {
            fromKey: 'bioluminescent-gorge',
            toKey: 'tempest-maelstrom',
            factor,
            actIndex: factor < 0.5 ? 3 : 4,
        };
    }

    // Pure Act IV and past -1500 (Endless Mode default foundation)
    return { fromKey: 'tempest-maelstrom', toKey: 'tempest-maelstrom', factor: 0, actIndex: 4 };
}

/**
 * Computes camera-perspective compensation factors.
 *
 * High pitch (looking down from above, e.g. 50°-65°) views through a shorter column of atmospheric fog
 * than horizontal horizon skimming, but requires:
 * 1. Pushing the fog far-plane back (>= 260m) so mid-river islands and shoreline landmarks remain crisp.
 * 2. Boosting hemisphere fill light to illuminate top-facing decks, hulls, and water facets.
 * 3. Sharpening water specular exponent & intensity so waves shimmer with high contrast instead of washing out.
 *
 * @param {number} pitch - Camera elevation angle in radians (0 = horizontal, PI/2 = vertical top-down)
 * @param {number} distance - Camera distance from raft center in meters
 * @returns {object} Modifier scalars
 */
export function computeCameraPerspectiveModifiers(pitch, distance) {
    const safePitch = clamp(typeof pitch === 'number' && Number.isFinite(pitch) ? pitch : DEFAULT_DIORAMA_CAMERA.pitch, 0.05, Math.PI * 0.49);
    const safeDistance = clamp(typeof distance === 'number' && Number.isFinite(distance) ? distance : DEFAULT_DIORAMA_CAMERA.distance, 8.0, 120.0);

    // Normalized pitch factor: 0 at horizontal (~0.2 rad), 1 at high-angle (~0.9 rad)
    const pitchRatio = clamp((safePitch - 0.20) / (0.90 - 0.20), 0.0, 1.0);

    // Distance expansion factor: wider distance extends fog far-plane further
    const distRatio = clamp((safeDistance - 15.0) / (60.0 - 15.0), 0.0, 1.0);

    // Fog far distance boost: high angles push fog back up to +60m to prevent edge clipping
    const fogFarExtensionMeters = pitchRatio * 35.0 + distRatio * 35.0;

    // Fog density reduction: high angle looks through top-down vertical column, so density scales down ~18%
    const fogDensityMultiplier = 1.0 - pitchRatio * 0.22;

    // Hemisphere light boost: high-angle camera needs +10% to +25% fill light so vertical faces don't crush to black
    const hemiIntensityMultiplier = 1.0 + pitchRatio * 0.22 + distRatio * 0.08;

    // Water specular contrast boost: steep look-down angle benefits from higher specular intensity
    // and slightly higher exponent to avoid a massive white sheen blob across the 80m river width
    const specularIntensityMultiplier = 1.0 + pitchRatio * 0.35;
    const specularPowerMultiplier = 1.0 + pitchRatio * 0.20;

    return {
        safePitch,
        safeDistance,
        pitchRatio: Number(pitchRatio.toFixed(3)),
        distRatio: Number(distRatio.toFixed(3)),
        fogFarExtensionMeters: Number(fogFarExtensionMeters.toFixed(2)),
        fogDensityMultiplier: Number(fogDensityMultiplier.toFixed(3)),
        hemiIntensityMultiplier: Number(hemiIntensityMultiplier.toFixed(3)),
        specularIntensityMultiplier: Number(specularIntensityMultiplier.toFixed(3)),
        specularPowerMultiplier: Number(specularPowerMultiplier.toFixed(3)),
    };
}

/**
 * Primary Core Export:
 * Computes the complete authoritative High-Angle Diorama Lighting, Sky Dome & Depth-Clarity State.
 *
 * @param {object} params
 * @param {number} params.zPos - River downriver Z position (<= 0).
 * @param {number} [params.cameraPitch] - Camera pitch in radians (default ~0.82 rad).
 * @param {number} [params.cameraDistance] - Camera distance in meters (default 35m).
 * @param {object} [options] - Additional tuning overrides.
 * @returns {DioramaLightingState}
 */
export function computeDioramaLightingState({
    zPos = 0,
    cameraPitch = DEFAULT_DIORAMA_CAMERA.pitch,
    cameraDistance = DEFAULT_DIORAMA_CAMERA.distance,
} = {}, options = {}) {
    // 1. Resolve active biomes and interpolation factor
    const blendInfo = resolveBiomeBlendKeys(zPos, options.transitionZoneMeters);
    const p1 = DIORAMA_BIOME_PRESETS[blendInfo.fromKey] || DIORAMA_BIOME_PRESETS['amber-canyon'];
    const p2 = DIORAMA_BIOME_PRESETS[blendInfo.toKey] || p1;
    const t = blendInfo.factor;

    // 2. Compute camera perspective adaptations
    const camMods = computeCameraPerspectiveModifiers(cameraPitch, cameraDistance);

    // 3. Interpolate Sky Dome
    const skyDome = {
        topColor: lerpColor(p1.skyDome.topColor, p2.skyDome.topColor, t),
        midColor: lerpColor(p1.skyDome.midColor, p2.skyDome.midColor, t),
        horizonColor: lerpColor(p1.skyDome.horizonColor, p2.skyDome.horizonColor, t),
        sunColor: lerpColor(p1.skyDome.sunColor, p2.skyDome.sunColor, t),
    };

    // 4. Interpolate and adapt Fog
    const baseFogFar = lerp(p1.fog.far, p2.fog.far, t);
    const baseFogNear = lerp(p1.fog.near, p2.fog.near, t);
    const baseFogDensity = lerp(p1.fog.density, p2.fog.density, t);

    // Always enforce the mission directive: fog far-plane pushed back to 260m+
    const minFarTarget = options.minFogFarMeters ?? DEFAULT_DIORAMA_CAMERA.minFogFarMeters;
    const rawFogFar = baseFogFar + camMods.fogFarExtensionMeters;
    const fogFar = Math.max(minFarTarget, rawFogFar);

    const fogNear = Math.max(10.0, baseFogNear + camMods.fogFarExtensionMeters * 0.25);
    const fogDensity = Number((baseFogDensity * camMods.fogDensityMultiplier).toFixed(6));
    const fogColor = lerpColor(p1.fog.color, p2.fog.color, t);

    // 5. Interpolate and adapt Hemisphere Fill Light
    const hemiSky = lerpColor(p1.hemiLight.skyColor, p2.hemiLight.skyColor, t);
    const hemiGround = lerpColor(p1.hemiLight.groundColor, p2.hemiLight.groundColor, t);
    const baseHemiIntensity = lerp(p1.hemiLight.intensity, p2.hemiLight.intensity, t);
    const hemiIntensity = Number((baseHemiIntensity * camMods.hemiIntensityMultiplier).toFixed(3));

    // 6. Interpolate and adapt Directional Sun Light
    const sunColor = lerpColor(p1.sunLight.color, p2.sunLight.color, t);
    const sunIntensity = Number(lerp(p1.sunLight.intensity, p2.sunLight.intensity, t).toFixed(3));
    const sunDir = lerpVector3(p1.sunLight.direction, p2.sunLight.direction, t);

    // 7. Water Specular Contrast Tuning
    const baseSpecPower = lerp(p1.waterSpecular.specularPower, p2.waterSpecular.specularPower, t);
    const baseSpecIntensity = lerp(p1.waterSpecular.specularIntensity, p2.waterSpecular.specularIntensity, t);
    const baseClarity = lerp(p1.waterSpecular.clarity, p2.waterSpecular.clarity, t);
    const baseFresnelBias = lerp(p1.waterSpecular.fresnelBias, p2.waterSpecular.fresnelBias, t);
    const baseFresnelScale = lerp(p1.waterSpecular.fresnelScale, p2.waterSpecular.fresnelScale, t);

    const specularPower = Math.round(baseSpecPower * camMods.specularPowerMultiplier);
    const specularIntensity = Number((baseSpecIntensity * camMods.specularIntensityMultiplier).toFixed(3));
    const clarity = Number(baseClarity.toFixed(3));
    const fresnelBias = Number(baseFresnelBias.toFixed(3));
    const fresnelScale = Number(baseFresnelScale.toFixed(3));

    return {
        zPos,
        actIndex: blendInfo.actIndex,
        primaryBiomeId: blendInfo.fromKey,
        nextBiomeId: blendInfo.toKey,
        blendFactor: Number(t.toFixed(4)),
        camera: {
            pitch: camMods.safePitch,
            distance: camMods.safeDistance,
            pitchRatio: camMods.pitchRatio,
        },
        fog: {
            color: fogColor,
            near: Number(fogNear.toFixed(1)),
            far: Number(fogFar.toFixed(1)),
            density: fogDensity,
            isFarPlaneClamped: fogFar >= minFarTarget,
        },
        skyDome,
        hemiLight: {
            skyColor: hemiSky,
            groundColor: hemiGround,
            intensity: hemiIntensity,
        },
        sunLight: {
            color: sunColor,
            intensity: sunIntensity,
            direction: sunDir,
        },
        waterSpecular: {
            specularPower,
            specularIntensity,
            clarity,
            fresnelBias,
            fresnelScale,
        },
    };
}

/**
 * Sovereign Core & Helmet 04 Directive:
 * Computes the 0.5-second squint-test contrast & silhouette readability profile across any river coordinate z.
 *
 * Requirements:
 * 1. Warm sunlit wood contrast for safe `costado` planks:
 *    - High-contrast warm amber/gold radiance against darker river water.
 *    - Boosted when player is grounded/docked (`onSolid = true`).
 * 2. High-visibility oar blade highlight intensity:
 *    - Responsive to stroke active state (`strokeActive`) and swing orientation (`swingSide`).
 *    - Distinct port ('left') vs starboard ('right') directional emphasis.
 * 3. Stark silhouette rim values for the 3 Dream Entities across all river acts:
 *    - White Guy: High-key stark white/cyan rim to pop against dark river water.
 *    - 3-Legged Mud Alien: Bioluminescent swamp-green/olive edge glow & lumpy silhouette contrast.
 *    - Nokia-Vector Worm: Vibrant high-contrast phosphorescent vector trail & segment silhouette.
 * 4. Specular glare and bloom ceiling clamping:
 *    - Caps water specular reflection intensity and bloom threshold so procedural waves
 *      never produce checkerboard artifacts or wash out the raft silhouette.
 *
 * @param {number} z - River downriver coordinate (<= 0).
 * @param {object} [options]
 * @param {boolean} [options.onSolid=false] - True if raft is resting on solid costado plank or sanctuary dock.
 * @param {boolean} [options.strokeActive=false] - True if player or bot is actively paddling/swinging.
 * @param {'left'|'right'|null} [options.swingSide=null] - Directional swing bias ('left', 'right', or null).
 * @returns {SquintTestContrastProfile}
 */
export function computeSquintTestContrastProfile(z = 0, {
    onSolid = false,
    strokeActive = false,
    swingSide = null,
} = {}) {
    const lighting = computeDioramaLightingState({ zPos: z });
    const isSolid = Boolean(onSolid);
    const isStroking = Boolean(strokeActive);
    const side = swingSide === 'left' || swingSide === 'right' ? swingSide : null;
    const act = lighting.actIndex;

    // ─── 1. Warm Sunlit Wood Contrast for Safe Costado Planks ────────────────
    // Planks must pop immediately against dark water so the human eye registers refuge in < 0.5s.
    // When onSolid: true, player is on the plank; we boost perceived luminance & warm ambient fill.
    const basePlankLuminance = act === 1 ? 0.78
        : act === 2 ? 0.72
        : act === 3 ? 0.65
        : 0.60;
    const solidBoost = isSolid ? 0.22 : 0.0;
    const woodContrastRatio = Number(clamp(basePlankLuminance + solidBoost, 0.40, 1.0).toFixed(3));

    const woodPlankProfile = {
        baseColor: { r: 0.82, g: 0.58, b: 0.32, hex: 0xd19452 }, // Warm cedar / weathered pine
        sunlitHighlight: isSolid ? { r: 1.0, g: 0.85, b: 0.62, hex: 0xffd99e } : { r: 0.92, g: 0.72, b: 0.48, hex: 0xebb87a },
        contrastRatio: woodContrastRatio,
        onSolid: isSolid,
        isSafeHavenPop: woodContrastRatio >= 0.70,
    };

    // ─── 2. High-Visibility Oar Blade Highlight Intensity ────────────────────
    // Active strokes/swings flare the paddle edge so the pilot/spectator immediately perceives paddle vector.
    const baseOarIntensity = 0.45;
    const strokeBoost = isStroking ? 0.50 : 0.0;
    const sideBias = isStroking && side ? 0.15 : 0.0;
    const oarIntensity = Number(clamp(baseOarIntensity + strokeBoost + sideBias, 0.20, 1.25).toFixed(3));

    const oarProfile = {
        strokeActive: isStroking,
        swingSide: side,
        bladeHighlightIntensity: oarIntensity,
        leftBladeGlow: Number(clamp(baseOarIntensity + (isStroking && (side === 'left' || !side) ? 0.45 : 0.05), 0.20, 1.20).toFixed(3)),
        rightBladeGlow: Number(clamp(baseOarIntensity + (isStroking && (side === 'right' || !side) ? 0.45 : 0.05), 0.20, 1.20).toFixed(3)),
        flashColor: { r: 1.0, g: 0.92, b: 0.74, hex: 0xffebbc },
    };

    // ─── 3. Stark Silhouette Rim Values for the 3 Dream Entities ─────────────
    // A. White Guy (uncanny white humanoid in wizard hat):
    // Needs stark key/rim contrast to pop against river water and misty canyon backgrounds.
    const whiteGuyRim = Number(clamp(
        act === 1 ? 0.95
        : act === 2 ? 0.88
        : act === 3 ? 0.92
        : 0.98,
        0.5, 1.0
    ).toFixed(3));

    // B. 3-Legged Mud Alien (brown-green lumpy tripod monster):
    // Uses swamp-toxic rim/silhouette contrast so its formless silhouette doesn't drown into dark water.
    const mudAlienRim = Number(clamp(
        act === 1 ? 0.76
        : act === 2 ? 0.82
        : act === 3 ? 0.90
        : 0.84,
        0.5, 1.0
    ).toFixed(3));

    // C. Nokia-Vector Long Worm (26-segment straight-line snake):
    // Crisp phosphor rim vector trail so segments pop like an arcade screen.
    const nokiaWormRim = Number(clamp(
        act === 1 ? 0.85
        : act === 2 ? 0.90
        : act === 3 ? 0.98
        : 0.94,
        0.5, 1.0
    ).toFixed(3));

    const enemySilhouettes = {
        whiteGuy: {
            id: 'whiteGuy',
            name: 'White Guy in Wizard Hat',
            rimIntensity: whiteGuyRim,
            rimColor: { r: 0.95, g: 0.98, b: 1.0, hex: 0xf2faff }, // Stark icy/ethereal white
            minSquintContrast: 0.75,
            passesSquintTest: whiteGuyRim >= 0.75,
        },
        mudAlien: {
            id: 'mudAlien',
            name: '3-Legged Headless Mud Alien',
            rimIntensity: mudAlienRim,
            rimColor: { r: 0.42, g: 0.88, b: 0.38, hex: 0x6be061 }, // Toxic swamp green
            minSquintContrast: 0.70,
            passesSquintTest: mudAlienRim >= 0.70,
        },
        nokiaWorm: {
            id: 'longWorm',
            name: 'Nokia-Vector Long Worm',
            rimIntensity: nokiaWormRim,
            rimColor: { r: 0.32, g: 0.95, b: 0.85, hex: 0x52f3d9 }, // Retro arcade phosphor cyan
            minSquintContrast: 0.80,
            passesSquintTest: nokiaWormRim >= 0.80,
        },
    };

    // ─── 4. Specular Glare & Bloom Clamping (Zero Checkerboard Artifacts) ─────
    // Water reflections must never produce checkerboard artifacts or wash out the raft silhouette.
    const rawSpecular = lighting.waterSpecular.specularIntensity;
    const clampedSpecularGlare = Number(clamp(rawSpecular, 0.40, 1.25).toFixed(3));
    const bloomCeiling = Number(clamp(1.40 - clampedSpecularGlare * 0.25, 0.65, 1.15).toFixed(3));
    const antiCheckerboardSuppression = Number(clamp(1.0 - (rawSpecular > 1.20 ? (rawSpecular - 1.20) * 0.5 : 0), 0.85, 1.0).toFixed(3));
    const raftSilhouetteProtection = Number(clamp(1.0 - clampedSpecularGlare * 0.15, 0.75, 1.0).toFixed(3));

    const waterGlareControl = {
        rawSpecularIntensity: rawSpecular,
        clampedSpecularGlare,
        bloomCeiling,
        antiCheckerboardSuppression,
        raftSilhouetteProtection,
        isCheckerboardSuppressed: antiCheckerboardSuppression >= 0.85,
        isRaftSilhouetteProtected: raftSilhouetteProtection >= 0.75,
    };

    return {
        z,
        actIndex: act,
        primaryBiomeId: lighting.primaryBiomeId,
        woodPlanks: woodPlankProfile,
        oarBlade: oarProfile,
        enemies: enemySilhouettes,
        waterGlareControl,
        squintTestPassed: (
            woodPlankProfile.contrastRatio >= 0.60 &&
            enemySilhouettes.whiteGuy.passesSquintTest &&
            enemySilhouettes.mudAlien.passesSquintTest &&
            enemySilhouettes.nokiaWorm.passesSquintTest &&
            waterGlareControl.isCheckerboardSuppressed &&
            waterGlareControl.isRaftSilhouetteProtected
        ),
    };
}
