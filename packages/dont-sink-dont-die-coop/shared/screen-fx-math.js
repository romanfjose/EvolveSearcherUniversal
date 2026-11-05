/**
 * Don't Sink, Don't Die — Screen-Space FX Math Helpers
 * Pure deterministic mathematics for camera VFX:
 *  - Radial Anime/AAA Speed-Lines (velocity thresholds > 14 m/s, rapids boosting)
 *  - Vignette & Chromatic Aberration pulse profiles (damage impacts, Leviathan roar)
 *  - Splash lens water droplet physics and optical distortion fields
 *  - Cinematic letterbox aspect ratios and transition easing
 */

export const FX_CONFIG = {
    SPEED_LINE_MIN_SPEED: 14.0,       // Speed line threshold in m/s
    SPEED_LINE_MAX_SPEED: 28.0,       // Saturation speed
    SPEED_LINE_RAPIDS_BONUS: 0.35,    // Additional boost intensity when riding rapids
    MAX_DROPLETS: 32,                 // Maximum simultaneous lens droplets
    DEFAULT_LETTERBOX_ASPECT: 2.39,   // 21:9 cinematic anamorphic ratio
    STANDARD_ASPECT: 16 / 9,          // 1.777...
};

/**
 * Clamp a number to [min, max].
 */
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Linear interpolation.
 */
export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Smoothstep interpolation (Hermite polynomial).
 */
export function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * Computes speed-line overlay intensity given player speed and rapids boost flag.
 * Speed lines activate only when speed > 14 m/s, scaling to 1.0 at 28 m/s,
 * with an extra punch when boosting through rapids.
 *
 * @param {number} speed - Current horizontal speed in m/s.
 * @param {boolean} isBoostingRapids - Whether raft is currently in a rapids boost zone.
 * @param {object} [config] - Optional configuration overrides.
 * @returns {number} Speed line intensity in [0, 1].
 */
export function calculateSpeedLineIntensity(speed, isBoostingRapids = false, config = FX_CONFIG) {
    const minSpeed = config.SPEED_LINE_MIN_SPEED;
    const maxSpeed = config.SPEED_LINE_MAX_SPEED;

    if (speed <= minSpeed && !isBoostingRapids) {
        return 0.0;
    }

    let base = 0.0;
    if (speed > minSpeed) {
        base = smoothstep(minSpeed, maxSpeed, speed);
    }

    if (isBoostingRapids) {
        // Boost provides immediate baseline excitation and amplifies speed effect
        base = Math.max(base, config.SPEED_LINE_RAPIDS_BONUS) + 0.25 * (1.0 - base);
    }

    return clamp(base, 0.0, 1.0);
}

/**
 * Computes radial streak density and alpha modulation from angular coordinates and time.
 * Pure deterministic pseudo-random hash generator for anime speed-line geometry.
 *
 * @param {number} angle - Radial angle in radians [-PI, PI].
 * @param {number} radius - Normalized radius from center [0, 1].
 * @param {number} time - Elapsed time in seconds.
 * @param {number} lineCount - Density multiplier (default: 48).
 * @returns {number} Streak opacity at given polar coordinate [0, 1].
 */
export function computeSpeedLineStreak(angle, radius, time, lineCount = 48) {
    // Inner clear circle: focus area remains visible without obstruction
    const innerRadius = 0.35;
    if (radius < innerRadius) {
        return 0.0;
    }

    const radialFade = smoothstep(innerRadius, 0.85, radius);

    // Quantized radial sector
    const normalizedAngle = (angle + Math.PI) / (Math.PI * 2);
    const sector = Math.floor(normalizedAngle * lineCount);
    
    // Pseudo-random hash per sector modulated by rapid time phase
    const hash = Math.sin(sector * 127.1 + Math.floor(time * 30.0) * 311.7);
    const streakActive = (hash - Math.floor(hash)) > 0.45;

    if (!streakActive) {
        return 0.0;
    }

    // High frequency streak variation
    const subPhase = Math.sin(normalizedAngle * lineCount * Math.PI * 2);
    const sharpLine = Math.pow(Math.max(0, subPhase), 4.0);

    return sharpLine * radialFade;
}

/**
 * Calculates vignette & chromatic aberration pulse from a damage impact.
 * Sharp initial shock followed by exponential decay.
 *
 * @param {number} elapsed - Seconds elapsed since damage hit.
 * @param {number} damageAmount - Damage dealt (typically 10-60).
 * @param {number} [duration] - Total pulse duration in seconds.
 * @returns {{ vignette: number, aberration: number, redout: number }}
 */
export function calculateDamagePulse(elapsed, damageAmount, duration = 0.65) {
    if (elapsed < 0 || elapsed >= duration) {
        return { vignette: 0, aberration: 0, redout: 0 };
    }

    const norm = elapsed / duration;
    // Scale intensity by damage magnitude (capped at 50 for max punch)
    const scale = clamp(damageAmount / 40.0, 0.25, 1.25);

    // Initial shock spike (peaks at t ≈ 0.04s)
    let envelope = 0;
    if (norm < 0.1) {
        envelope = Math.sin((norm / 0.1) * (Math.PI * 0.5));
    } else {
        envelope = Math.exp(-(norm - 0.1) * 4.5);
    }

    const intensity = envelope * scale;
    return {
        vignette: clamp(intensity * 0.75, 0, 1),
        aberration: clamp(intensity * 0.025, 0, 0.05), // Radial UV offset
        redout: clamp(intensity * 0.45, 0, 1),
    };
}

/**
 * Calculates vignette & chromatic aberration pulse for Leviathan Charge Roar.
 * Oscillatory low-frequency rumble (sub-bass harmonic shake) with heavy aberration.
 *
 * @param {number} elapsed - Seconds elapsed since roar began.
 * @param {number} [duration] - Total roar duration in seconds (default: 1.4s).
 * @returns {{ vignette: number, aberration: number, rumble: number }}
 */
export function calculateLeviathanRoarPulse(elapsed, duration = 1.4) {
    if (elapsed < 0 || elapsed >= duration) {
        return { vignette: 0, aberration: 0, rumble: 0 };
    }

    const t = elapsed / duration;
    // Swell up over 0.25, sustain, then decay
    let swell = 0;
    if (t < 0.2) {
        swell = smoothstep(0, 0.2, t);
    } else if (t < 0.7) {
        swell = 1.0;
    } else {
        swell = 1.0 - smoothstep(0.7, 1.0, t);
    }

    // 18 Hz sub-bass acoustic rumble modulation
    const rumbleOsc = Math.sin(elapsed * 18.0 * Math.PI * 2);
    const subOsc = Math.sin(elapsed * 9.0 * Math.PI * 2);
    const combinedRumble = (rumbleOsc * 0.6 + subOsc * 0.4) * swell;

    return {
        vignette: clamp(swell * 0.55 + Math.abs(combinedRumble) * 0.15, 0, 1),
        aberration: clamp(swell * 0.035 + Math.abs(combinedRumble) * 0.015, 0, 0.06),
        rumble: combinedRumble,
    };
}

/**
 * Lens droplet data structure creation.
 */
export function createLensDroplet(x, y, radius, life = 1.8, rng = Math.random) {
    return {
        x: clamp(x, 0, 1),           // Normalized screen UV [0, 1]
        y: clamp(y, 0, 1),
        radius: Math.max(0.005, radius), // Normalized radius
        life,                            // Seconds remaining
        maxLife: life,
        vy: 0.015 + rng() * 0.025, // Downward gravitational drip speed
        vx: (rng() - 0.5) * 0.005,
        wobblePhase: rng() * Math.PI * 2,
    };
}

/**
 * Generates a deterministic burst of lens droplets when landing from a high jump.
 *
 * @param {number} impactVelocity - Vertical landing impact velocity (m/s).
 * @param {number} count - Target number of droplets to spawn.
 * @param {number} [seed] - Optional RNG seed.
 * @returns {Array<object>} Array of droplet objects.
 */
export function generateLandingSplashDroplets(impactVelocity, count = 16, seed = 42) {
    const droplets = [];
    // Only spawn droplets on noticeable impact (> 3 m/s)
    if (impactVelocity < 3.0) {
        return droplets;
    }

    const intensity = clamp((impactVelocity - 3.0) / 12.0, 0.2, 1.0);
    const actualCount = Math.min(FX_CONFIG.MAX_DROPLETS, Math.round(count * intensity));

    let s = seed;
    const lcg = () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };

    for (let i = 0; i < actualCount; i++) {
        // Bias droplet spawn towards edges and bottom of screen, but some in center
        const angle = lcg() * Math.PI * 2;
        const dist = 0.25 + lcg() * 0.65;
        const x = 0.5 + Math.cos(angle) * dist * 0.65;
        const y = 0.5 + Math.sin(angle) * dist * 0.5;
        const radius = (0.012 + lcg() * 0.035) * (0.8 + 0.4 * intensity);
        const life = 1.2 + lcg() * 1.6;

        droplets.push(createLensDroplet(x, y, radius, life, lcg));
    }

    return droplets;
}

/**
 * Updates physics simulation of lens droplets (gravity drip, surface tension, evaporation).
 *
 * @param {Array<object>} droplets - List of active droplets.
 * @param {number} dt - Delta time in seconds.
 * @returns {Array<object>} Filtered surviving droplets.
 */
export function updateLensDroplets(droplets, dt) {
    const surviving = [];
    for (let i = 0; i < droplets.length; i++) {
        const d = droplets[i];
        d.life -= dt;
        if (d.life <= 0) continue;

        // Downward drip with subtle serpentine wobble from surface tension
        d.wobblePhase += dt * 3.5;
        const wobble = Math.sin(d.wobblePhase) * 0.003;
        d.y += d.vy * dt;
        d.x += (d.vx + wobble) * dt;

        // Evaporation: shrink radius near end of life
        const ageNorm = 1.0 - (d.life / d.maxLife);
        if (ageNorm > 0.7) {
            d.radius *= Math.max(0.1, 1.0 - dt * 2.0);
        }

        // Keep inside screen view
        if (d.y <= 1.05 && d.x >= -0.05 && d.x <= 1.05) {
            surviving.push(d);
        }
    }
    return surviving;
}

/**
 * Calculates optical refraction UV displacement for a single droplet at UV coordinate.
 *
 * @param {number} uvX - Normalized screen X [0, 1].
 * @param {number} uvY - Normalized screen Y [0, 1].
 * @param {object} droplet - Active droplet object.
 * @returns {{ dx: number, dy: number, alpha: number }} Displacement and droplet highlight.
 */
export function calculateDropletRefraction(uvX, uvY, droplet) {
    const dx = uvX - droplet.x;
    const dy = uvY - droplet.y;
    const distSq = dx * dx + dy * dy;
    const rSq = droplet.radius * droplet.radius;

    if (distSq > rSq) {
        return { dx: 0, dy: 0, alpha: 0 };
    }

    const dist = Math.sqrt(distSq);
    const normDist = dist / droplet.radius;

    // Dome lens normal refraction (refracts outwards)
    const factor = Math.sin(normDist * Math.PI) * (1.0 - normDist * 0.5);
    const refrStrength = 0.035;

    // Specular highlight bead near top-left of droplet
    const specDx = dx + droplet.radius * 0.28;
    const specDy = dy - droplet.radius * 0.28;
    const specDist = Math.sqrt(specDx * specDx + specDy * specDy);
    const spec = Math.pow(Math.max(0, 1.0 - specDist / (droplet.radius * 0.45)), 3.0);

    return {
        dx: (dist > 1e-5 ? (dx / dist) : 0) * factor * refrStrength,
        dy: (dist > 1e-5 ? (dy / dist) : 0) * factor * refrStrength,
        alpha: (1.0 - normDist * 0.3) * 0.85 + spec * 0.4,
    };
}

/**
 * Computes letterbox bar thickness (normalized to [0, 0.5]) based on target aspect ratio
 * and current viewport aspect ratio.
 * E.g. Viewport 16:9 (1.777) to 2.39:1 anamorphic -> top and bottom bars occupy ~12.8% of height each.
 *
 * @param {number} viewportWidth - Current viewport width in pixels.
 * @param {number} viewportHeight - Current viewport height in pixels.
 * @param {number} targetAspect - Target cinematic aspect ratio (e.g. 2.39).
 * @returns {number} Normalized bar thickness [0, 0.5].
 */
export function calculateLetterboxFraction(viewportWidth, viewportHeight, targetAspect = FX_CONFIG.DEFAULT_LETTERBOX_ASPECT) {
    if (viewportHeight <= 0 || viewportWidth <= 0 || targetAspect <= 0) {
        return 0.0;
    }
    const currentAspect = viewportWidth / viewportHeight;
    if (currentAspect >= targetAspect) {
        // Viewport is wider than target aspect ratio (pillarbox on sides or no bars)
        return 0.0;
    }
    // Target height that would give targetAspect: hTarget = width / targetAspect
    // Bar height fraction = (viewportHeight - hTarget) / (2 * viewportHeight)
    const fraction = (1.0 - (currentAspect / targetAspect)) * 0.5;
    return clamp(fraction, 0.0, 0.5);
}

/**
 * Interpolates cinematic letterbox transition progress.
 *
 * @param {number} current - Current bar fraction.
 * @param {number} target - Target bar fraction.
 * @param {number} dt - Frame delta time.
 * @param {number} speed - Transition speed factor.
 * @returns {number} Smoothed bar fraction.
 */
export function smoothLetterboxTransition(current, target, dt, speed = 4.0) {
    const factor = 1.0 - Math.exp(-speed * dt);
    return lerp(current, target, factor);
}
