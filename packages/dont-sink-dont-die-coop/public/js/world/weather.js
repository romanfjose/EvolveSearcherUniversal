/**
 * Don't Sink, Don't Die — Dynamic Weather & Volumetric Lightning System
 * Zero external dependencies (Three.js passed in as parameter or imported in browser).
 *
 * Supports 4 distinct weather states:
 *   - 'clear-sunset': Golden hour amber skies, gentle warm breeze, ambient dust motes
 *   - 'harbor-mist': Dense sea fog, cool harbor drizzle, low contrast
 *   - 'toxic-spore-fog': Sickly green swamp fog, floating toxic spores, eerie calm
 *   - 'thunder-tempest': Dark maelstrom storm, heavy angled rain, wind gusts, volumetric lightning flashes
 */

// ─── Weather State Configurations ──────────────────────────────────────────
export const WEATHER_STATES = {
    'clear-sunset': {
        name: 'clear-sunset',
        fogColor: 0x283c54,
        fogDensity: 0.0042,
        ambientColor: 0xdbeafe,
        ambientIntensity: 0.55,
        sunColor: 0xffe4b5,
        sunIntensity: 1.45,
        skyTopColor: 0x0d1b35,
        skyMidColor: 0x2b4c6f,
        skyHorizonColor: 0xd97f54,
        particleMode: 'dust', // 'dust' | 'mist' | 'spore' | 'rain'
        particleCount: 1200,
        particleColor: 0xffe2aa,
        particleSize: 0.22,
        particleSpeed: 1.2,
        particleOpacity: 0.45,
        windBase: { x: 1.5, y: -0.2, z: -2.0 },
        windGustFreq: 0.4,
        windGustAmp: 1.5,
        lightningChance: 0.0,
    },
    'harbor-mist': {
        name: 'harbor-mist',
        fogColor: 0x1d2938,
        fogDensity: 0.0095,
        ambientColor: 0x7e9cb8,
        ambientIntensity: 0.42,
        sunColor: 0xb5d4ff,
        sunIntensity: 0.75,
        skyTopColor: 0x091424,
        skyMidColor: 0x182a3e,
        skyHorizonColor: 0x3b5773,
        particleMode: 'mist',
        particleCount: 2200,
        particleColor: 0xbfdbfe,
        particleSize: 0.28,
        particleSpeed: 4.5,
        particleOpacity: 0.55,
        windBase: { x: -2.5, y: -0.5, z: -3.5 },
        windGustFreq: 0.8,
        windGustAmp: 2.8,
        lightningChance: 0.0,
    },
    'toxic-spore-fog': {
        name: 'toxic-spore-fog',
        fogColor: 0x1a2b1f,
        fogDensity: 0.0125,
        ambientColor: 0x4ade80,
        ambientIntensity: 0.38,
        sunColor: 0xa3e635,
        sunIntensity: 0.65,
        skyTopColor: 0x08150d,
        skyMidColor: 0x112b1a,
        skyHorizonColor: 0x245431,
        particleMode: 'spore',
        particleCount: 2500,
        particleColor: 0x86efac,
        particleSize: 0.35,
        particleSpeed: 0.8,
        particleOpacity: 0.7,
        windBase: { x: 0.8, y: 0.1, z: -1.2 },
        windGustFreq: 0.3,
        windGustAmp: 1.2,
        lightningChance: 0.0,
    },
    'thunder-tempest': {
        name: 'thunder-tempest',
        fogColor: 0x0c111a,
        fogDensity: 0.015,
        ambientColor: 0x384556,
        ambientIntensity: 0.28,
        sunColor: 0x7c8da3,
        sunIntensity: 0.4,
        skyTopColor: 0x04070c,
        skyMidColor: 0x0a1019,
        skyHorizonColor: 0x162232,
        particleMode: 'rain',
        particleCount: 3000,
        particleColor: 0x93c5fd,
        particleSize: 0.45,
        particleSpeed: 24.0,
        particleOpacity: 0.85,
        windBase: { x: -6.0, y: -2.0, z: -12.0 },
        windGustFreq: 1.8,
        windGustAmp: 6.5,
        lightningChance: 0.035, // Average interval ~5-8 seconds
    },
};

export const WEATHER_SEQUENCE = ['clear-sunset', 'harbor-mist', 'toxic-spore-fog', 'thunder-tempest'];

// ─── Pure Deterministic Math Helpers ──────────────────────────────────────

/**
 * Maps downstream z distance to an appropriate weather state according to river Acts.
 * Act I   (z: 0..-375): 'clear-sunset'
 * Act II  (z: -375..-750): 'harbor-mist'
 * Act III (z: -750..-1125): 'toxic-spore-fog'
 * Act IV  (z: -1125..-1500+): 'thunder-tempest'
 */
export function getWeatherStateAtZ(z) {
    if (z > -375) return 'clear-sunset';
    if (z > -750) return 'harbor-mist';
    if (z > -1125) return 'toxic-spore-fog';
    return 'thunder-tempest';
}

/**
 * Linear clamp helper.
 */
export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

/**
 * Linear interpolation helper.
 */
export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Interpolates two 24-bit RGB hex colors smoothly.
 */
export function lerpColorHex(c1, c2, t) {
    const clampedT = clamp(t, 0, 1);
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;

    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;

    const r = Math.round(lerp(r1, r2, clampedT));
    const g = Math.round(lerp(g1, g2, clampedT));
    const b = Math.round(lerp(b1, b2, clampedT));

    return (r << 16) | (g << 8) | b;
}

/**
 * Computes deterministic wind gust vector at elapsed time t.
 */
export function computeWindVector(state, t) {
    const cfg = typeof state === 'string' ? WEATHER_STATES[state] : state;
    const base = cfg.windBase;
    const f = cfg.windGustFreq;
    const amp = cfg.windGustAmp;

    // Harmonic wind gust calculation (deterministic)
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
 * Calculates lightning strike illumination intensity at a given time during a strike.
 * Multi-strike fork profile: rapid primary strike + secondary back-flash + exponential decay.
 * @param {number} timeSinceStrike - Seconds elapsed since strike trigger.
 * @param {number} duration - Total strike duration in seconds (typically ~0.4s).
 * @return {number} Multiplier in range [0, 1] representing light flare.
 */
export function calculateLightningFlash(timeSinceStrike, duration = 0.42) {
    if (timeSinceStrike < 0 || timeSinceStrike > duration) return 0;
    const progress = timeSinceStrike / duration;

    // Peak 1: 0.0 - 0.18 of duration (violent primary snap reaching 1.0)
    let flash = 0;
    if (progress < 0.18) {
        flash = Math.sin((progress / 0.18) * (Math.PI / 2));
    } else if (progress < 0.36) {
        // Quick dip and rebound secondary strike (peaks at 0.55)
        const p2 = (progress - 0.18) / 0.18;
        flash = 0.35 + 0.3 * Math.sin(p2 * Math.PI);
    } else {
        // Exponential decay tail
        const tail = (progress - 0.36) / (1 - 0.36);
        flash = 0.35 * Math.exp(-tail * 4.0);
    }

    return clamp(flash, 0, 1);
}

/**
 * Deterministic weather state interpolator.
 * Blends all lighting, fog, and particle parameters between two states.
 */
export function interpolateWeatherParameters(fromState, toState, progress) {
    const s1 = typeof fromState === 'string' ? WEATHER_STATES[fromState] : fromState;
    const s2 = typeof toState === 'string' ? WEATHER_STATES[toState] : toState;
    if (progress <= 0) return { ...s1 };
    if (progress >= 1) return { ...s2 };
    const p = clamp(progress, 0, 1);

    return {
        name: p < 0.5 ? s1.name : s2.name,
        fogColor: lerpColorHex(s1.fogColor, s2.fogColor, p),
        fogDensity: lerp(s1.fogDensity, s2.fogDensity, p),
        ambientColor: lerpColorHex(s1.ambientColor, s2.ambientColor, p),
        ambientIntensity: lerp(s1.ambientIntensity, s2.ambientIntensity, p),
        sunColor: lerpColorHex(s1.sunColor, s2.sunColor, p),
        sunIntensity: lerp(s1.sunIntensity, s2.sunIntensity, p),
        skyTopColor: lerpColorHex(s1.skyTopColor, s2.skyTopColor, p),
        skyMidColor: lerpColorHex(s1.skyMidColor, s2.skyMidColor, p),
        skyHorizonColor: lerpColorHex(s1.skyHorizonColor, s2.skyHorizonColor, p),
        particleColor: lerpColorHex(s1.particleColor, s2.particleColor, p),
        particleSize: lerp(s1.particleSize, s2.particleSize, p),
        particleSpeed: lerp(s1.particleSpeed, s2.particleSpeed, p),
        particleOpacity: lerp(s1.particleOpacity, s2.particleOpacity, p),
        particleMode: p < 0.5 ? s1.particleMode : s2.particleMode,
        windBase: {
            x: lerp(s1.windBase.x, s2.windBase.x, p),
            y: lerp(s1.windBase.y, s2.windBase.y, p),
            z: lerp(s1.windBase.z, s2.windBase.z, p),
        },
        windGustFreq: lerp(s1.windGustFreq, s2.windGustFreq, p),
        windGustAmp: lerp(s1.windGustAmp, s2.windGustAmp, p),
        lightningChance: lerp(s1.lightningChance, s2.lightningChance, p),
    };
}

/**
 * Wraps particle coordinates relative to camera bounding box.
 */
export function wrapParticleCoordinate(pos, camPos, halfExtent) {
    let diff = pos - camPos;
    const extent = halfExtent * 2;
    while (diff > halfExtent) diff -= extent;
    while (diff < -halfExtent) diff += extent;
    return camPos + diff;
}

// ─── Three.js Weather & Lighting Director ──────────────────────────────────

const MAX_PARTICLES = 3000;
const BOUNDS_X = 55;
const BOUNDS_Y = 28;
const BOUNDS_Z = 65;

/**
 * Creates the Three.js weather director with 3,000 GPU-friendly particles,
 * dynamic fog/lighting, volumetric lightning flash scheduler, and wind gusts.
 *
 * @param {object} THREE - The Three.js instance
 * @param {object} scene - Three.js Scene
 * @param {object} [options] - Optional custom lights/sky references and callbacks
 */
export function createWeatherSystem(THREE, scene, options = {}) {
    let currentStateName = options.initialState || 'clear-sunset';
    let targetStateName = currentStateName;
    let transitionProgress = 1.0;
    const transitionSpeed = options.transitionSpeed || 0.45; // seconds^-1 (~2.2s for full transition)

    let currentParams = { ...WEATHER_STATES[currentStateName] };
    let elapsedTime = 0;

    // Lightning state
    let lightningTimer = 0;
    let isFlashing = false;
    let flashElapsed = 0;
    let flashDuration = 0.42;
    let flashIntensity = 0;
    let onThunderCallback = options.onThunder || null;

    // Wind vector exposed for rafts and scene
    const currentWind = { x: 0, y: 0, z: 0 };

    // ── Particle BufferGeometry & Shader Setup ─────────────────────────────
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const velocities = new Float32Array(MAX_PARTICLES * 3);
    const phases = new Float32Array(MAX_PARTICLES); // random phase for wobble/twinkle

    for (let i = 0; i < MAX_PARTICLES; i++) {
        const i3 = i * 3;
        positions[i3 + 0] = (Math.random() - 0.5) * BOUNDS_X * 2;
        positions[i3 + 1] = Math.random() * BOUNDS_Y * 2;
        positions[i3 + 2] = (Math.random() - 0.5) * BOUNDS_Z * 2;

        velocities[i3 + 0] = (Math.random() - 0.5) * 0.4;
        velocities[i3 + 1] = -1.0;
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.4;

        phases[i] = Math.random() * Math.PI * 2;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    particleGeo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    const particleUniforms = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(currentParams.particleColor) },
        uSize: { value: currentParams.particleSize * 22.0 },
        uOpacity: { value: currentParams.particleOpacity },
        uMode: { value: 0.0 }, // 0: dust, 1: mist, 2: spore, 3: rain
    };

    const particleMat = new THREE.ShaderMaterial({
        uniforms: particleUniforms,
        vertexShader: `
            attribute float phase;
            uniform float uTime;
            uniform float uSize;
            uniform float uMode;
            varying float vPhase;
            varying float vMode;

            void main() {
                vPhase = phase;
                vMode = uMode;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Scale points based on distance from camera
                float distScale = 300.0 / -mvPosition.z;
                gl_PointSize = uSize * clamp(distScale, 0.4, 3.5);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uTime;
            varying float vPhase;
            varying float vMode;

            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                if (dist > 0.5) discard;

                float alpha = uOpacity;
                
                // Rain mode: vertical streak sprite
                if (vMode > 2.5) {
                    float streak = smoothstep(0.48, 0.0, abs(coord.x) * 2.2);
                    alpha *= streak * (1.0 - smoothstep(0.0, 0.5, dist));
                }
                // Spore mode: pulsing glow
                else if (vMode > 1.5) {
                    float pulse = 0.65 + 0.35 * sin(uTime * 3.5 + vPhase);
                    alpha *= (1.0 - smoothstep(0.1, 0.5, dist)) * pulse;
                }
                // Mist / Dust mode: soft blurred circle
                else {
                    alpha *= (1.0 - smoothstep(0.0, 0.5, dist));
                }

                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    const particlePoints = new THREE.Points(particleGeo, particleMat);
    particlePoints.frustumCulled = false;
    scene.add(particlePoints);

    // ── Volumetric Lightning Light Source ──────────────────────────────────
    const lightningLight = new THREE.DirectionalLight(0xdbeafe, 0);
    lightningLight.position.set(0, 120, -50);
    scene.add(lightningLight);

    // Track existing scene lights or create fallbacks
    const ambientLight = options.ambientLight || null;
    const directionalLight = options.directionalLight || null;
    const skyDome = options.skyDome || null;

    /**
     * Triggers a lightning strike with procedural multi-fork flash and thunder callback.
     */
    function triggerLightning(customDuration = 0.45) {
        isFlashing = true;
        flashElapsed = 0;
        flashDuration = customDuration;
        if (typeof onThunderCallback === 'function') {
            onThunderCallback({
                intensity: 1.0,
                duration: flashDuration,
                distance: 120 + Math.random() * 250,
            });
        }
    }

    /**
     * Direct setter for instant or smooth weather changes.
     */
    function setWeatherState(stateName, instant = false) {
        if (!WEATHER_STATES[stateName]) return;
        if (instant) {
            currentStateName = stateName;
            targetStateName = stateName;
            transitionProgress = 1.0;
            currentParams = { ...WEATHER_STATES[stateName] };
        } else if (stateName !== targetStateName) {
            currentStateName = targetStateName;
            targetStateName = stateName;
            transitionProgress = 0.0;
        }
    }

    /**
     * Updates particles, wind gusts, fog, lighting and lightning schedule.
     *
     * @param {number} dt - Frame delta time in seconds
     * @param {object} cameraPos - Camera position {x, y, z}
     * @param {string|number} [targetStateOrZ] - Optional weather state name or river Z position
     */
    function update(dt, cameraPos = { x: 0, y: 5, z: 0 }, targetStateOrZ = null) {
        elapsedTime += dt;

        // Auto-detect weather if river z position provided
        if (typeof targetStateOrZ === 'number') {
            const detectedState = getWeatherStateAtZ(targetStateOrZ);
            if (detectedState !== targetStateName) {
                setWeatherState(detectedState, false);
            }
        } else if (typeof targetStateOrZ === 'string' && WEATHER_STATES[targetStateOrZ]) {
            if (targetStateOrZ !== targetStateName) {
                setWeatherState(targetStateOrZ, false);
            }
        }

        // 1. Advance state transition interpolation
        if (transitionProgress < 1.0) {
            transitionProgress = Math.min(1.0, transitionProgress + dt * transitionSpeed);
            currentParams = interpolateWeatherParameters(currentStateName, targetStateName, transitionProgress);
            if (transitionProgress >= 1.0) {
                currentStateName = targetStateName;
            }
        }

        // 2. Wind vector calculation
        const wind = computeWindVector(currentParams, elapsedTime);
        currentWind.x = wind.x;
        currentWind.y = wind.y;
        currentWind.z = wind.z;

        // 3. Lightning Flash Scheduler & volumetric illumination
        if (currentParams.lightningChance > 0 && !isFlashing) {
            lightningTimer += dt;
            // Poisson-like arrival test per second
            if (lightningTimer > 1.2 && Math.random() < currentParams.lightningChance * dt * 4.0) {
                lightningTimer = 0;
                triggerLightning(0.35 + Math.random() * 0.25);
            }
        }

        if (isFlashing) {
            flashElapsed += dt;
            if (flashElapsed >= flashDuration) {
                isFlashing = false;
                flashIntensity = 0;
            } else {
                flashIntensity = calculateLightningFlash(flashElapsed, flashDuration);
            }
        } else {
            flashIntensity = 0;
        }

        // 4. Update Scene Lighting & Fog
        if (scene.fog) {
            scene.fog.color.setHex(currentParams.fogColor);
            scene.fog.density = currentParams.fogDensity;
            if (flashIntensity > 0) {
                // Volumetric lightning brightens fog towards pale electric cyan
                scene.fog.color.lerp(new THREE.Color(0xd0e8ff), flashIntensity * 0.7);
            }
        }

        if (ambientLight) {
            ambientLight.color.setHex(currentParams.ambientColor);
            ambientLight.intensity = currentParams.ambientIntensity + flashIntensity * 0.6;
        }

        if (directionalLight) {
            directionalLight.color.setHex(currentParams.sunColor);
            directionalLight.intensity = currentParams.sunIntensity;
        }

        lightningLight.position.set(cameraPos.x + 20, cameraPos.y + 100, cameraPos.z - 30);
        lightningLight.intensity = flashIntensity * 3.8;

        // Update SkyDome shader uniforms if provided
        if (skyDome && skyDome.material && skyDome.material.uniforms) {
            const u = skyDome.material.uniforms;
            if (u.topColor) u.topColor.value.setHex(currentParams.skyTopColor);
            if (u.midColor) u.midColor.value.setHex(currentParams.skyMidColor);
            if (u.horizonColor) u.horizonColor.value.setHex(currentParams.skyHorizonColor);
            if (flashIntensity > 0 && u.horizonColor) {
                u.horizonColor.value.lerp(new THREE.Color(0xa5c9eb), flashIntensity * 0.85);
            }
        }

        // 5. Update Particle System Positions & Wrapping
        const posAttr = particleGeo.attributes.position;
        const velAttr = particleGeo.attributes.velocity;
        const pArray = posAttr.array;
        const vArray = velAttr.array;

        const modeIndex = currentParams.particleMode === 'dust' ? 0.0 :
                          currentParams.particleMode === 'mist' ? 1.0 :
                          currentParams.particleMode === 'spore' ? 2.0 : 3.0;

        particleUniforms.uTime.value = elapsedTime;
        particleUniforms.uColor.value.setHex(currentParams.particleColor);
        particleUniforms.uSize.value = currentParams.particleSize * (currentParams.particleMode === 'rain' ? 36.0 : 22.0);
        particleUniforms.uOpacity.value = currentParams.particleOpacity;
        particleUniforms.uMode.value = modeIndex;

        const count = Math.min(MAX_PARTICLES, currentParams.particleCount);
        const fallSpeed = currentParams.particleSpeed;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Apply wind drift + gravity / falling speed
            pArray[i3 + 0] += (currentWind.x * 0.25 + vArray[i3 + 0]) * dt * (currentParams.particleMode === 'rain' ? 1.6 : 0.8);
            pArray[i3 + 1] -= (fallSpeed + vArray[i3 + 1]) * dt;
            pArray[i3 + 2] += (currentWind.z * 0.25 + vArray[i3 + 2]) * dt * (currentParams.particleMode === 'rain' ? 1.6 : 0.8);

            // Wrap relative to camera view bounding volume
            pArray[i3 + 0] = wrapParticleCoordinate(pArray[i3 + 0], cameraPos.x, BOUNDS_X);
            pArray[i3 + 1] = wrapParticleCoordinate(pArray[i3 + 1], cameraPos.y + 6, BOUNDS_Y);
            pArray[i3 + 2] = wrapParticleCoordinate(pArray[i3 + 2], cameraPos.z, BOUNDS_Z);
        }

        posAttr.needsUpdate = true;
    }

    /**
     * Cleanly removes weather components from scene when switching modes.
     */
    function dispose() {
        scene.remove(particlePoints);
        scene.remove(lightningLight);
        particleGeo.dispose();
        particleMat.dispose();
    }

    return {
        particlePoints,
        particleGeo,
        particleMat,
        lightningLight,
        getCurrentState: () => currentStateName,
        getTargetState: () => targetStateName,
        getCurrentParams: () => ({ ...currentParams }),
        getWindVector: () => ({ ...currentWind }),
        getFlashIntensity: () => flashIntensity,
        isFlashing: () => isFlashing,
        setWeatherState,
        triggerLightning,
        setOnThunder: (cb) => { onThunderCallback = cb; },
        update,
        dispose,
    };
}
