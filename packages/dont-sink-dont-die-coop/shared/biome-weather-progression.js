/**
 * Sovereign Core — Biome Time-of-Day & Atmospheric Weather Progression Engine
 * (`shared/biome-weather-progression.js`)
 *
 * Coordinates time-of-day progression, celestial motion, weather transitions,
 * volumetric fog, lighting, and ambient particle dynamics seamlessly down the 1.5km river course:
 *
 * - Act 1 (Redwood Flumes, z: 0 to -375):
 *     "Golden Dawn Mist" — Soft amber sunrise, lingering river mist ribbons, gentle morning breezes.
 * - Act 2 (Walled City & Canal District, z: -375 to -750):
 *     "Warm Midday Lantern Harbor" — High noon sun overhead, industrial smoke/lantern haze, bustling river port.
 * - Act 3 (Sunken Crystal Temples, z: -750 to -1125):
 *     "Bioluminescent Twilight" — Deep indigo/cyan twilight, luminescent spores, ancient sunken ruins glow.
 * - Act 4 (Volcanic Shipwreck Caldera, z: -1125 to -1500+):
 *     "Ash-Fall Eclipse" — Solar eclipse blood ring, falling ember/ash flakes, volcanic tempest lightning.
 *
 * Pure, deterministic ES module. Zero external dependencies, zero DOM/window/Three.js leaks.
 * Safe for headless servers, simulation workers, and client render pipelines.
 */

/**
 * River coordinate boundary thresholds for each act.
 */
export const ACT_BOUNDARIES = Object.freeze({
    ACT_1_START: 0,
    ACT_1_END: -375,
    ACT_2_START: -375,
    ACT_2_END: -750,
    ACT_3_START: -750,
    ACT_3_END: -1125,
    ACT_4_START: -1125,
    ACT_4_END: -1500,
});

/**
 * Width of the smooth transition blending zone in meters centered on act boundaries.
 */
export const TRANSITION_ZONE_METERS = 75;

/**
 * Atmospheric & Time-of-Day profiles for each Biome Act.
 */
export const BIOME_ATMOSPHERES = Object.freeze([
    {
        actIndex: 1,
        id: 'redwood-flumes',
        name: 'Redwood Flumes',
        theme: 'Golden Dawn Mist',
        timeOfDay: 'dawn',
        sunAngleDeg: 18.0, // Low dawn sun climbing above the redwood canopy
        sunElevationRad: 0.314, // ~18 deg
        skyColors: {
            zenith: { r: 0.12, g: 0.22, b: 0.38 },   // 0x1f3861 crisp morning blue
            mid: { r: 0.58, g: 0.44, b: 0.32 },      // 0x947052 warm dawn gradient
            horizon: { r: 0.96, g: 0.65, b: 0.38 },  // 0xf5a661 golden sunrise amber
        },
        fog: {
            color: { r: 0.78, g: 0.68, b: 0.54 },   // 0xc7ae8a golden valley mist
            density: 0.0055,                         // Noticeable river mist
            near: 12.0,
            far: 190.0,
        },
        light: {
            sunColor: { r: 1.0, g: 0.86, b: 0.62 },  // 0xffdc9e golden dawn beam
            sunIntensity: 1.25,
            ambientColor: { r: 0.45, g: 0.50, b: 0.60 },
            ambientIntensity: 0.52,
            hemiSky: { r: 0.75, g: 0.82, b: 0.95 },
            hemiGround: { r: 0.35, g: 0.28, b: 0.18 },
        },
        particles: {
            mode: 'mist',                            // 'mist' | 'dust' | 'spore' | 'ash'
            count: 1400,
            color: { r: 1.0, g: 0.92, b: 0.78 },     // Sunlit morning droplets
            size: 0.24,
            speed: 1.4,
            opacity: 0.55,
        },
        wind: {
            base: { x: 1.2, y: -0.15, z: -1.8 },
            gustFreq: 0.4,
            gustAmp: 1.2,
        },
        eclipseFactor: 0.0,
        lightningChance: 0.0,
        lanternGlowFactor: 0.25, // Dim morning lanterns extinguishing
    },
    {
        actIndex: 2,
        id: 'walled-city',
        name: 'Walled City & Canal District',
        theme: 'Warm Midday Lantern Harbor',
        timeOfDay: 'midday',
        sunAngleDeg: 72.0, // High noon sun over bustling canal walls
        sunElevationRad: 1.257, // ~72 deg
        skyColors: {
            zenith: { r: 0.18, g: 0.38, b: 0.68 },   // 0x2e61ad clear maritime azure
            mid: { r: 0.42, g: 0.62, b: 0.82 },      // 0x6b9ed1 bright harbor sky
            horizon: { r: 0.78, g: 0.82, b: 0.88 },  // 0xc7d1e0 bright sea mist haze
        },
        fog: {
            color: { r: 0.55, g: 0.62, b: 0.70 },   // 0x8c9eb3 cool harbor canal haze
            density: 0.0038,                         // Clearer midday sightlines
            near: 18.0,
            far: 240.0,
        },
        light: {
            sunColor: { r: 1.0, g: 0.98, b: 0.90 },  // 0xfffae6 blazing white/warm noon
            sunIntensity: 1.55,
            ambientColor: { r: 0.62, g: 0.68, b: 0.75 },
            ambientIntensity: 0.65,
            hemiSky: { r: 0.85, g: 0.90, b: 1.0 },
            hemiGround: { r: 0.42, g: 0.38, b: 0.32 },
        },
        particles: {
            mode: 'dust',
            count: 1000,
            color: { r: 0.92, g: 0.88, b: 0.80 },    // Warm harbor dust & woodsmoke motes
            size: 0.20,
            speed: 1.1,
            opacity: 0.38,
        },
        wind: {
            base: { x: -1.8, y: -0.3, z: -2.8 },
            gustFreq: 0.6,
            gustAmp: 2.0,
        },
        eclipseFactor: 0.0,
        lightningChance: 0.0,
        lanternGlowFactor: 0.85, // Pier lanterns, market braziers, canal beacons
    },
    {
        actIndex: 3,
        id: 'sunken-crystal-temples',
        name: 'Sunken Crystal Temples',
        theme: 'Bioluminescent Twilight',
        timeOfDay: 'twilight',
        sunAngleDeg: -12.0, // Sun below the gorge horizon, eerie twilight dusk
        sunElevationRad: -0.209,
        skyColors: {
            zenith: { r: 0.04, g: 0.06, b: 0.18 },   // 0x0a0f2e abyssal indigo
            mid: { r: 0.08, g: 0.18, b: 0.32 },      // 0x142e52 sunken temple teal
            horizon: { r: 0.12, g: 0.42, b: 0.48 },  // 0x1f6b7a bioluminescent glow
        },
        fog: {
            color: { r: 0.06, g: 0.20, b: 0.24 },   // 0x0f333d glowing cyan temple mist
            density: 0.0075,                         // Mysterious deep canyon fog
            near: 10.0,
            far: 170.0,
        },
        light: {
            sunColor: { r: 0.25, g: 0.65, b: 0.85 },  // Subdued cyan crystal reflection
            sunIntensity: 0.55,
            ambientColor: { r: 0.15, g: 0.45, b: 0.55 },
            ambientIntensity: 0.48,
            hemiSky: { r: 0.20, g: 0.60, b: 0.80 },
            hemiGround: { r: 0.05, g: 0.22, b: 0.28 },
        },
        particles: {
            mode: 'spore',
            count: 2200,
            color: { r: 0.22, g: 0.95, b: 0.88 },    // Glowing cyan/green bio-spores
            size: 0.32,
            speed: 0.75,
            opacity: 0.75,
        },
        wind: {
            base: { x: 0.6, y: 0.25, z: -1.0 },     // Gentle upward thermal updraft
            gustFreq: 0.3,
            gustAmp: 0.9,
        },
        eclipseFactor: 0.0,
        lightningChance: 0.0,
        lanternGlowFactor: 1.0,  // Maximum crystal fluorescence and rune brilliance
    },
    {
        actIndex: 4,
        id: 'volcanic-caldera',
        name: 'Volcanic Shipwreck Caldera',
        theme: 'Ash-Fall Eclipse',
        timeOfDay: 'eclipse',
        sunAngleDeg: 45.0, // Eclipse apex: darkened blackened solar corona
        sunElevationRad: 0.785,
        skyColors: {
            zenith: { r: 0.02, g: 0.02, b: 0.04 },   // 0x05050a pitch black void
            mid: { r: 0.18, g: 0.05, b: 0.06 },      // 0x2e0d0f blood red rim
            horizon: { r: 0.45, g: 0.12, b: 0.08 },  // 0x731f14 fiery volcanic rim glow
        },
        fog: {
            color: { r: 0.12, g: 0.04, b: 0.05 },   // 0x1f0a0d ash choked caldera air
            density: 0.0110,                         // Dense heavy volcanic smog
            near: 8.0,
            far: 140.0,
        },
        light: {
            sunColor: { r: 0.85, g: 0.22, b: 0.12 },  // 0xd9381e blood-red corona light
            sunIntensity: 0.40,
            ambientColor: { r: 0.22, g: 0.08, b: 0.10 },
            ambientIntensity: 0.32,
            hemiSky: { r: 0.35, g: 0.12, b: 0.14 },
            hemiGround: { r: 0.28, g: 0.04, b: 0.02 },
        },
        particles: {
            mode: 'ash',
            count: 2800,
            color: { r: 0.95, g: 0.42, b: 0.15 },    // Fiery orange/crimson embers & ash
            size: 0.40,
            speed: 3.5,
            opacity: 0.82,
        },
        wind: {
            base: { x: -4.5, y: -1.2, z: -8.5 },    // Violent tempest gale
            gustFreq: 1.4,
            gustAmp: 4.8,
        },
        eclipseFactor: 0.95,     // Near-total celestial blackout
        lightningChance: 0.04,   // Volcanic lightning arcs through ash cloud
        lanternGlowFactor: 0.65, // Flickering storm embers and torchlight
    },
]);

/**
 * Clamps numeric value between min and max.
 */
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Linear interpolation helper.
 */
export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Linearly interpolates RGB color objects with components in [0, 1].
 */
export function lerpColorRgb(c1, c2, t) {
    const k = clamp(t, 0, 1);
    return {
        r: clamp(c1.r + (c2.r - c1.r) * k, 0, 1),
        g: clamp(c1.g + (c2.g - c1.g) * k, 0, 1),
        b: clamp(c1.b + (c2.b - c1.b) * k, 0, 1),
    };
}

/**
 * Converts RGB object { r, g, b } in [0, 1] to integer hex color (e.g. 0xffe4b5).
 */
export function rgbToHex(rgb) {
    const r = Math.round(clamp(rgb.r, 0, 1) * 255);
    const g = Math.round(clamp(rgb.g, 0, 1) * 255);
    const b = Math.round(clamp(rgb.b, 0, 1) * 255);
    return (r << 16) | (g << 8) | b;
}

/**
 * Resolves the primary biome index (1-based: 1, 2, 3, 4) for a given river Z position.
 *
 * @param {number} z - Raft downriver coordinate (negative along river)
 * @returns {number} Act index (1 to 4)
 */
export function resolveActIndex(z) {
    if (z > ACT_BOUNDARIES.ACT_1_END) return 1;
    if (z > ACT_BOUNDARIES.ACT_2_END) return 2;
    if (z > ACT_BOUNDARIES.ACT_3_END) return 3;
    return 4;
}

/**
 * Computes deterministic wind vector at elapsed time t incorporating base vector and harmonic gusts.
 *
 * @param {object} windConfig - { base: {x, y, z}, gustFreq, gustAmp }
 * @param {number} [elapsedSec=0] - Game elapsed seconds
 * @returns {{ x: number, y: number, z: number }} 3D wind velocity vector
 */
export function computeHarmonicWind(windConfig, elapsedSec = 0) {
    const base = windConfig.base || { x: 0, y: 0, z: -1 };
    const f = windConfig.gustFreq || 0.5;
    const amp = windConfig.gustAmp || 1.0;
    const t = elapsedSec;

    const gustX = Math.sin(t * f * 1.3) * amp + Math.cos(t * f * 2.7) * (amp * 0.35);
    const gustY = Math.sin(t * f * 0.8) * (amp * 0.15);
    const gustZ = Math.cos(t * f * 0.95) * (amp * 0.75) + Math.sin(t * f * 3.1) * (amp * 0.25);

    return {
        x: base.x + gustX,
        y: base.y + gustY,
        z: base.z + gustZ,
    };
}

/**
 * Computes the unified Biome Time-of-Day & Atmospheric Weather state for any
 * position along the river and runtime clock.
 *
 * Performs smooth hermite/linear blending between adjacent Acts across the transition
 * corridor (+/- TRANSITION_ZONE_METERS around Act boundaries), and applies deterministic
 * solar/wind time-based modulation.
 *
 * @param {number} zPos - River coordinate (z <= 0 downriver)
 * @param {number} [elapsedSec=0] - Elapsed game time in seconds
 * @returns {BiomeAtmosphereState} Fully computed atmospheric state
 */
export function computeBiomeAtmosphere(zPos, elapsedSec = 0) {
    const z = Number.isFinite(zPos) ? zPos : 0;
    const t = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;

    let b1;
    let b2;
    let blendRatio = 0.0;
    let activeActIndex = 1;

    const tZone = TRANSITION_ZONE_METERS;

    // Check transition boundaries
    // Transition 1: Act 1 -> Act 2 around z = -375
    if (z <= ACT_BOUNDARIES.ACT_1_END + tZone && z >= ACT_BOUNDARIES.ACT_1_END - tZone) {
        b1 = BIOME_ATMOSPHERES[0];
        b2 = BIOME_ATMOSPHERES[1];
        blendRatio = (ACT_BOUNDARIES.ACT_1_END + tZone - z) / (2 * tZone);
        activeActIndex = blendRatio >= 0.5 ? 2 : 1;
    }
    // Transition 2: Act 2 -> Act 3 around z = -750
    else if (z <= ACT_BOUNDARIES.ACT_2_END + tZone && z >= ACT_BOUNDARIES.ACT_2_END - tZone) {
        b1 = BIOME_ATMOSPHERES[1];
        b2 = BIOME_ATMOSPHERES[2];
        blendRatio = (ACT_BOUNDARIES.ACT_2_END + tZone - z) / (2 * tZone);
        activeActIndex = blendRatio >= 0.5 ? 3 : 2;
    }
    // Transition 3: Act 3 -> Act 4 around z = -1125
    else if (z <= ACT_BOUNDARIES.ACT_3_END + tZone && z >= ACT_BOUNDARIES.ACT_3_END - tZone) {
        b1 = BIOME_ATMOSPHERES[2];
        b2 = BIOME_ATMOSPHERES[3];
        blendRatio = (ACT_BOUNDARIES.ACT_3_END + tZone - z) / (2 * tZone);
        activeActIndex = blendRatio >= 0.5 ? 4 : 3;
    }
    // Stable biome zones
    else if (z > ACT_BOUNDARIES.ACT_1_END) {
        b1 = BIOME_ATMOSPHERES[0];
        b2 = BIOME_ATMOSPHERES[0];
        blendRatio = 0.0;
        activeActIndex = 1;
    } else if (z > ACT_BOUNDARIES.ACT_2_END) {
        b1 = BIOME_ATMOSPHERES[1];
        b2 = BIOME_ATMOSPHERES[1];
        blendRatio = 0.0;
        activeActIndex = 2;
    } else if (z > ACT_BOUNDARIES.ACT_3_END) {
        b1 = BIOME_ATMOSPHERES[2];
        b2 = BIOME_ATMOSPHERES[2];
        blendRatio = 0.0;
        activeActIndex = 3;
    } else {
        b1 = BIOME_ATMOSPHERES[3];
        b2 = BIOME_ATMOSPHERES[3];
        blendRatio = 0.0;
        activeActIndex = 4;
    }

    const clampedBlend = clamp(blendRatio, 0, 1);

    // Primary dominant biome
    const primary = clampedBlend >= 0.5 ? b2 : b1;
    const secondary = clampedBlend >= 0.5 ? b1 : b2;

    // Interpolate Sky Colors
    const skyZenith = lerpColorRgb(b1.skyColors.zenith, b2.skyColors.zenith, clampedBlend);
    const skyMid = lerpColorRgb(b1.skyColors.mid, b2.skyColors.mid, clampedBlend);
    const skyHorizon = lerpColorRgb(b1.skyColors.horizon, b2.skyColors.horizon, clampedBlend);

    // Interpolate Fog
    const fogColor = lerpColorRgb(b1.fog.color, b2.fog.color, clampedBlend);
    const fogDensity = lerp(b1.fog.density, b2.fog.density, clampedBlend);
    const fogNear = lerp(b1.fog.near, b2.fog.near, clampedBlend);
    const fogFar = lerp(b1.fog.far, b2.fog.far, clampedBlend);

    // Interpolate Lighting
    const sunColor = lerpColorRgb(b1.light.sunColor, b2.light.sunColor, clampedBlend);
    const sunIntensity = lerp(b1.light.sunIntensity, b2.light.sunIntensity, clampedBlend);
    const ambientColor = lerpColorRgb(b1.light.ambientColor, b2.light.ambientColor, clampedBlend);
    const ambientIntensity = lerp(b1.light.ambientIntensity, b2.light.ambientIntensity, clampedBlend);
    const hemiSky = lerpColorRgb(b1.light.hemiSky, b2.light.hemiSky, clampedBlend);
    const hemiGround = lerpColorRgb(b1.light.hemiGround, b2.light.hemiGround, clampedBlend);

    // Time-of-day & Celestial calculations
    const sunAngleDeg = lerp(b1.sunAngleDeg, b2.sunAngleDeg, clampedBlend);
    const sunElevationRad = lerp(b1.sunElevationRad, b2.sunElevationRad, clampedBlend);
    const eclipseFactor = lerp(b1.eclipseFactor, b2.eclipseFactor, clampedBlend);
    const lanternGlowFactor = lerp(b1.lanternGlowFactor, b2.lanternGlowFactor, clampedBlend);

    // Deterministic solar vector based on sun elevation and angle
    // Raft heads down -Z; sun moves from East (+X) toward West (-X)
    const solarAzimuth = (sunAngleDeg * Math.PI) / 180.0;
    const sunDirection = {
        x: Math.cos(solarAzimuth) * Math.cos(sunElevationRad),
        y: Math.max(0.05, Math.sin(sunElevationRad)),
        z: -Math.sin(solarAzimuth) * Math.cos(sunElevationRad),
    };

    // Normalize sun direction
    const sunLen = Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z) || 1.0;
    sunDirection.x /= sunLen;
    sunDirection.y /= sunLen;
    sunDirection.z /= sunLen;

    // Atmospheric Particles
    const particleColor = lerpColorRgb(b1.particles.color, b2.particles.color, clampedBlend);
    const particleCount = Math.round(lerp(b1.particles.count, b2.particles.count, clampedBlend));
    const particleSize = lerp(b1.particles.size, b2.particles.size, clampedBlend);
    const particleSpeed = lerp(b1.particles.speed, b2.particles.speed, clampedBlend);
    const particleOpacity = lerp(b1.particles.opacity, b2.particles.opacity, clampedBlend);
    const particleMode = primary.particles.mode;

    // Wind Dynamics
    const windBase = {
        x: lerp(b1.wind.base.x, b2.wind.base.x, clampedBlend),
        y: lerp(b1.wind.base.y, b2.wind.base.y, clampedBlend),
        z: lerp(b1.wind.base.z, b2.wind.base.z, clampedBlend),
    };
    const windGustFreq = lerp(b1.wind.gustFreq, b2.wind.gustFreq, clampedBlend);
    const windGustAmp = lerp(b1.wind.gustAmp, b2.wind.gustAmp, clampedBlend);
    const activeWind = computeHarmonicWind({ base: windBase, gustFreq: windGustFreq, gustAmp: windGustAmp }, t);

    // Lightning & Hazard Potential
    const lightningChance = lerp(b1.lightningChance, b2.lightningChance, clampedBlend);

    return {
        z,
        elapsedSec: t,
        actIndex: activeActIndex,
        primaryBiome: primary.id,
        secondaryBiome: secondary.id,
        theme: primary.theme,
        timeOfDay: primary.timeOfDay,
        blendRatio: clampedBlend,
        isTransition: clampedBlend > 0.0 && clampedBlend < 1.0,

        // Celestial & Time-of-Day
        sunAngleDeg,
        sunElevationRad,
        sunDirection,
        eclipseFactor,
        lanternGlowFactor,

        // Sky Dome
        skyColors: {
            zenith: skyZenith,
            mid: skyMid,
            horizon: skyHorizon,
            zenithHex: rgbToHex(skyZenith),
            midHex: rgbToHex(skyMid),
            horizonHex: rgbToHex(skyHorizon),
        },

        // Fog
        fog: {
            color: fogColor,
            colorHex: rgbToHex(fogColor),
            density: fogDensity,
            near: fogNear,
            far: fogFar,
        },

        // Illumination
        light: {
            sunColor,
            sunColorHex: rgbToHex(sunColor),
            sunIntensity,
            ambientColor,
            ambientColorHex: rgbToHex(ambientColor),
            ambientIntensity,
            hemiSky,
            hemiSkyHex: rgbToHex(hemiSky),
            hemiGround,
            hemiGroundHex: rgbToHex(hemiGround),
        },

        // Atmosphere Particles
        particles: {
            mode: particleMode,
            count: particleCount,
            color: particleColor,
            colorHex: rgbToHex(particleColor),
            size: particleSize,
            speed: particleSpeed,
            opacity: particleOpacity,
        },

        // Wind & Meteorology
        wind: activeWind,
        windBase,
        lightningChance,
    };
}
