/**
 * Don't Sink, Don't Die — AAA Screen-Space Post-Processing & Camera FX Director
 * Lightweight, zero-CDN-dependency Three.js post-processing overlay:
 *  - Radial Anime/AAA Speed-Line shader overlay (>14 m/s planing or rapids boost)
 *  - Vignette & Chromatic Aberration pulse on heavy damage / Leviathan charge roar
 *  - Underwater / Splash lens droplet distortion when landing from high jumps
 *  - Cinematic Letterbox bars during intro swoops and Boss intro cutscenes
 */

import {
    FX_CONFIG,
    calculateSpeedLineIntensity,
    calculateDamagePulse,
    calculateLeviathanRoarPulse,
    generateLandingSplashDroplets,
    updateLensDroplets,
    calculateLetterboxFraction,
    smoothLetterboxTransition,
} from '../../../shared/screen-fx-math.js';

export const SCREEN_FX_SHADERS = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }
    `,
    fragmentShader: `
        precision highp float;
        varying vec2 vUv;

        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uSpeedIntensity;
        uniform float uVignetteIntensity;
        uniform float uAberrationOffset;
        uniform float uRedout;
        uniform float uLetterboxHeight;
        uniform vec4 uDroplets[16]; // (x, y, radius, alpha)
        uniform int uDropletCount;

        // Hash for speed-line streaks
        float hash(float n) {
            return fract(sin(n) * 43758.5453123);
        }

        void main() {
            vec2 uv = vUv;

            // 1. Cinematic Letterbox Bars
            if (uv.y < uLetterboxHeight || uv.y > (1.0 - uLetterboxHeight)) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }

            // Aspect ratio correction for radial effects
            float aspect = uResolution.x / max(1.0, uResolution.y);
            vec2 centered = uv - vec2(0.5);
            vec2 aspectCentered = vec2(centered.x * aspect, centered.y);
            float dist = length(aspectCentered);
            float angle = atan(aspectCentered.y, aspectCentered.x);

            // Accumulator color & alpha
            vec4 finalColor = vec4(0.0);

            // 2. Lens Droplet Distortions & Highlights
            float dropletHighlight = 0.0;
            float dropletBorder = 0.0;
            for (int i = 0; i < 16; i++) {
                if (i >= uDropletCount) break;
                vec4 d = uDroplets[i];
                vec2 dropPos = vec2(d.x, d.y);
                vec2 diff = (uv - dropPos) * vec2(aspect, 1.0);
                float r = length(diff);
                if (r < d.z && d.w > 0.01) {
                    float normR = r / d.z;
                    // Fresnel edge ring for droplet
                    float edge = smoothstep(0.7, 1.0, normR) * (1.0 - smoothstep(1.0, 1.05, normR));
                    dropletBorder += edge * d.w * 0.7;

                    // Specular highlight spot (upper-left of droplet)
                    vec2 specDiff = diff + vec2(d.z * 0.28, -d.z * 0.28);
                    float specDist = length(specDiff);
                    float spec = pow(max(0.0, 1.0 - specDist / (d.z * 0.45)), 3.0);
                    dropletHighlight += spec * d.w * 0.8;
                }
            }

            // Blend water droplets
            if (dropletBorder > 0.0 || dropletHighlight > 0.0) {
                vec3 waterTint = vec3(0.85, 0.95, 1.0);
                finalColor.rgb = mix(finalColor.rgb, waterTint, clamp(dropletBorder * 0.5 + dropletHighlight, 0.0, 1.0));
                finalColor.a = max(finalColor.a, clamp(dropletBorder * 0.6 + dropletHighlight, 0.0, 0.9));
            }

            // 3. Radial Anime / AAA Speed Lines
            if (uSpeedIntensity > 0.01) {
                float innerCutoff = 0.22;
                if (dist > innerCutoff) {
                    float radialMask = smoothstep(innerCutoff, 0.75, dist);
                    
                    // Discretize angle into line sectors
                    float numSectors = 64.0;
                    float normAngle = (angle + 3.14159265) / 6.2831853;
                    float sector = floor(normAngle * numSectors);
                    
                    // Streak appearance modulated by pseudo-random seed and rapid time phase
                    float lineSeed = sector * 12.9898 + floor(uTime * 36.0) * 78.233;
                    float streakRand = hash(lineSeed);
                    
                    if (streakRand > 0.52) {
                        float subAngle = fract(normAngle * numSectors);
                        float lineShape = sin(subAngle * 3.14159265);
                        lineShape = pow(lineShape, 6.0);
                        
                        float speedAlpha = lineShape * radialMask * uSpeedIntensity * 0.85;
                        vec3 speedLineColor = vec3(0.92, 0.96, 1.0);
                        
                        finalColor.rgb = mix(finalColor.rgb, speedLineColor, speedAlpha);
                        finalColor.a = max(finalColor.a, speedAlpha);
                    }
                }
            }

            // 4. Heavy Damage Vignette / Redout & Roar Darkening
            if (uVignetteIntensity > 0.01 || uRedout > 0.01) {
                float vigRadius = dist * 1.35;
                float vigFactor = smoothstep(0.35, 1.1, vigRadius) * uVignetteIntensity;
                
                // Color shift: dark red edges on damage, dark charcoal on monster roar
                vec3 vigColor = mix(vec3(0.04, 0.04, 0.06), vec3(0.72, 0.05, 0.05), uRedout);
                
                finalColor.rgb = mix(finalColor.rgb, vigColor, vigFactor);
                finalColor.a = max(finalColor.a, vigFactor * 0.85);
            }

            // 5. Chromatic Aberration Fringe Accent
            if (uAberrationOffset > 0.001) {
                // Color fringing at screen edges
                float fringeAlpha = smoothstep(0.35, 0.9, dist) * (uAberrationOffset * 25.0);
                vec3 fringeColor = vec3(0.2, 0.8, 1.0); // Cyan/Electric fringe
                finalColor.rgb = mix(finalColor.rgb, fringeColor, fringeAlpha * 0.4);
                finalColor.a = max(finalColor.a, fringeAlpha * 0.35);
            }

            gl_FragColor = finalColor;
        }
    `,
};

/**
 * Creates the Screen Space Post-Processing & FX Director.
 *
 * @param {object} THREE - The Three.js instance.
 * @param {object} scene - Three.js Scene.
 * @param {object} camera - Three.js Camera.
 * @param {object} [options] - Configuration and initial settings.
 */
export function createScreenFxSystem(THREE, scene, camera, options = {}) {
    let width = options.width || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    let height = options.height || (typeof window !== 'undefined' ? window.innerHeight : 720);

    // Dynamic effect state
    let speedIntensity = 0.0;
    let targetSpeedIntensity = 0.0;

    let damageElapsed = 999.0;
    let damageDuration = 0.65;
    let damageAmount = 0.0;

    let roarElapsed = 999.0;
    let roarDuration = 1.4;

    let droplets = [];

    let letterboxTarget = 0.0;
    let letterboxCurrent = 0.0;
    let isCinematicActive = false;

    // Uniform values structure
    const dropletUniformArray = [];
    for (let i = 0; i < 16; i++) {
        dropletUniformArray.push(new THREE.Vector4(0, 0, 0, 0));
    }

    const uniforms = {
        uTime: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uSpeedIntensity: { value: 0.0 },
        uVignetteIntensity: { value: 0.0 },
        uAberrationOffset: { value: 0.0 },
        uRedout: { value: 0.0 },
        uLetterboxHeight: { value: 0.0 },
        uDroplets: { value: dropletUniformArray },
        uDropletCount: { value: 0 },
    };

    const fxMaterial = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: SCREEN_FX_SHADERS.vertexShader,
        fragmentShader: SCREEN_FX_SHADERS.fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false,
    });

    // Screen quad attached to camera or scene
    // A unit quad in orthographic NDC [-1, 1]
    const fxGeometry = new THREE.PlaneGeometry(2, 2);
    const fxMesh = new THREE.Mesh(fxGeometry, fxMaterial);
    fxMesh.frustumCulled = false;

    // Direct scene or camera overlay configuration
    if (camera && typeof camera.add === 'function') {
        // Child of camera for 3D perspective scenes
        fxMesh.position.set(0, 0, -1);
        camera.add(fxMesh);
    } else if (scene && typeof scene.add === 'function') {
        scene.add(fxMesh);
    }

    let totalTime = 0.0;

    /**
     * Triggers heavy damage screen pulse (red vignette & chromatic aberration shockwave).
     */
    function triggerDamagePulse(amount = 25, duration = 0.65) {
        damageAmount = amount;
        damageDuration = duration;
        damageElapsed = 0.0;
    }

    /**
     * Triggers Leviathan Charge Roar pulse (deep rumble aberration & dark vignette).
     */
    function triggerLeviathanRoar(duration = 1.4) {
        roarDuration = duration;
        roarElapsed = 0.0;
    }

    /**
     * Triggers lens droplet splash when landing from a high jump.
     */
    function triggerSplashLanding(impactVelocity = 12.0, count = 16) {
        const newDroplets = generateLandingSplashDroplets(impactVelocity, count);
        droplets = droplets.concat(newDroplets);
        if (droplets.length > FX_CONFIG.MAX_DROPLETS) {
            droplets = droplets.slice(droplets.length - FX_CONFIG.MAX_DROPLETS);
        }
    }

    /**
     * Controls cinematic letterbox state.
     * @param {boolean} active - Enable or disable bars.
     * @param {number} [targetAspect] - Target cinematic aspect ratio.
     */
    function setCinematicLetterbox(active, targetAspect = FX_CONFIG.DEFAULT_LETTERBOX_ASPECT) {
        isCinematicActive = active;
        if (active) {
            letterboxTarget = calculateLetterboxFraction(width, height, targetAspect);
        } else {
            letterboxTarget = 0.0;
        }
    }

    /**
     * Sets resolution when viewport resizes.
     */
    function setSize(w, h) {
        width = w;
        height = h;
        uniforms.uResolution.value.set(w, h);
        if (isCinematicActive) {
            letterboxTarget = calculateLetterboxFraction(width, height);
        }
    }

    /**
     * Per-frame update loop for all screen effects.
     *
     * @param {number} dt - Frame delta in seconds.
     * @param {object} [telemetry] - Player raft telemetry { speed, isBoostingRapids }.
     */
    function update(dt, telemetry = {}) {
        totalTime += dt;
        uniforms.uTime.value = totalTime;

        // 1. Speed Lines
        const speed = telemetry.speed || 0.0;
        const isBoosting = !!telemetry.isBoostingRapids;
        targetSpeedIntensity = calculateSpeedLineIntensity(speed, isBoosting);
        // Smooth speedline attack and release
        const attackReleaseSpeed = targetSpeedIntensity > speedIntensity ? 6.0 : 3.5;
        speedIntensity += (targetSpeedIntensity - speedIntensity) * (1.0 - Math.exp(-attackReleaseSpeed * dt));
        uniforms.uSpeedIntensity.value = speedIntensity;

        // 2. Damage Pulse
        let dmgVignette = 0.0;
        let dmgAberration = 0.0;
        let dmgRedout = 0.0;
        if (damageElapsed < damageDuration) {
            damageElapsed += dt;
            const dmg = calculateDamagePulse(damageElapsed, damageAmount, damageDuration);
            dmgVignette = dmg.vignette;
            dmgAberration = dmg.aberration;
            dmgRedout = dmg.redout;
        }

        // 3. Leviathan Roar Pulse
        let roarVignette = 0.0;
        let roarAberration = 0.0;
        if (roarElapsed < roarDuration) {
            roarElapsed += dt;
            const roar = calculateLeviathanRoarPulse(roarElapsed, roarDuration);
            roarVignette = roar.vignette;
            roarAberration = roar.aberration;
        }

        // Combine damage & roar pulses
        const combinedVignette = Math.max(dmgVignette, roarVignette);
        const combinedAberration = Math.max(dmgAberration, roarAberration);

        uniforms.uVignetteIntensity.value = combinedVignette;
        uniforms.uAberrationOffset.value = combinedAberration;
        uniforms.uRedout.value = dmgRedout;

        // 4. Lens Droplets Physics
        droplets = updateLensDroplets(droplets, dt);
        const activeCount = Math.min(16, droplets.length);
        uniforms.uDropletCount.value = activeCount;
        for (let i = 0; i < 16; i++) {
            if (i < activeCount) {
                const d = droplets[i];
                uniforms.uDroplets.value[i].set(d.x, d.y, d.radius, d.life / d.maxLife);
            } else {
                uniforms.uDroplets.value[i].set(0, 0, 0, 0);
            }
        }

        // 5. Cinematic Letterbox Transition
        letterboxCurrent = smoothLetterboxTransition(letterboxCurrent, letterboxTarget, dt, 4.5);
        // Zero-snap threshold to avoid permanent micro-render
        if (Math.abs(letterboxCurrent - letterboxTarget) < 0.001) {
            letterboxCurrent = letterboxTarget;
        }
        uniforms.uLetterboxHeight.value = letterboxCurrent;
    }

    /**
     * Cleans up geometry, materials, and scene links.
     */
    function dispose() {
        if (camera && typeof camera.remove === 'function') {
            camera.remove(fxMesh);
        } else if (scene && typeof scene.remove === 'function') {
            scene.remove(fxMesh);
        }
        fxGeometry.dispose();
        fxMaterial.dispose();
    }

    return {
        mesh: fxMesh,
        geometry: fxGeometry,
        material: fxMaterial,
        uniforms,
        update,
        setSize,
        triggerDamagePulse,
        triggerLeviathanRoar,
        triggerSplashLanding,
        setCinematicLetterbox,
        getSpeedIntensity: () => speedIntensity,
        getLetterboxHeight: () => letterboxCurrent,
        getActiveDroplets: () => [...droplets],
        isCinematicActive: () => isCinematicActive,
        dispose,
    };
}
