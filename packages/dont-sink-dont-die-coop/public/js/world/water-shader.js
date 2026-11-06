/**
 * River Surface Water Shader & Hydrodynamic Wave Elevation Engine
 * (`public/js/world/water-shader.js`)
 *
 * Implements the continuous GLSL Gerstner wave simulation and analytical
 * surface elevation/normals for the 80m river corridor (Videogame Helmet 06:
 * Physical Common-Sense & World-Believability).
 *
 * Guarantees:
 *   1. Zero checkerboard artifacts via per-pixel procedural ripple noise.
 *   2. Analytical surface height `getRiverWaveElevation(x, z, time)` matching GLSL vertex displacement.
 *   3. Analytical normal `getRiverWaveNormal(x, z, time)` for physical pitch/roll torque.
 *   4. Submersion dip and buoyant spring-damper rebound math for impacts.
 */

import * as THREE from 'three';

export const RIVER_SHADER_CONFIG = Object.freeze({
    FLOW_SPEED_Z: 9.5,
    WAVE1_FREQ_X: 0.32,
    WAVE1_FREQ_Z: 0.18,
    WAVE1_AMP: 0.07,
    WAVE2_FREQ_X: 0.58,
    WAVE2_FREQ_Z: 0.26,
    WAVE2_AMP: 0.035,
    RIPPLE_FREQ_X: 1.4,
    RIPPLE_FREQ_Z: 0.6,
    RIPPLE_AMP: 0.025,
    DEFAULT_MUD_COLOR: 0x1e3846,
    DEFAULT_CLEAR_COLOR: 0x0b4f6c,
    DEFAULT_DEEP_COLOR: 0x062338,
    DEFAULT_SKY_COLOR: 0x6290b8,
    DEFAULT_SUN_COLOR: 0xffdca8,
});

/**
 * Calculates the exact analytical river wave elevation at (x, z, time).
 * Matches vertex shader `w1 + w2` displacement.
 *
 * @param {number} x - Lateral position in river (-40 to 40)
 * @param {number} z - Longitudinal river position (0 to -1500)
 * @param {number} time - Elapsed time in seconds
 * @returns {number} Water surface height offset relative to base waterline
 */
export function getRiverWaveElevation(x, z, time = 0) {
    const zFlow = z + time * RIVER_SHADER_CONFIG.FLOW_SPEED_Z;
    const w1 = Math.sin(x * RIVER_SHADER_CONFIG.WAVE1_FREQ_X + zFlow * RIVER_SHADER_CONFIG.WAVE1_FREQ_Z) * RIVER_SHADER_CONFIG.WAVE1_AMP;
    const w2 = Math.cos(x * RIVER_SHADER_CONFIG.WAVE2_FREQ_X - zFlow * RIVER_SHADER_CONFIG.WAVE2_FREQ_Z) * RIVER_SHADER_CONFIG.WAVE2_AMP;
    return w1 + w2;
}

/**
 * Computes the analytical surface normal vector at (x, z, time).
 * Matches fragment shader analytical derivatives.
 *
 * @param {number} x - Lateral position in river
 * @param {number} z - Longitudinal river position
 * @param {number} time - Elapsed time in seconds
 * @returns {{ x: number, y: number, z: number }} Normalized surface normal
 */
export function getRiverWaveNormal(x, z, time = 0) {
    const zFlow = z + time * RIVER_SHADER_CONFIG.FLOW_SPEED_Z;
    const dx = RIVER_SHADER_CONFIG.WAVE1_FREQ_X * RIVER_SHADER_CONFIG.WAVE1_AMP * Math.cos(x * RIVER_SHADER_CONFIG.WAVE1_FREQ_X + zFlow * RIVER_SHADER_CONFIG.WAVE1_FREQ_Z)
             - RIVER_SHADER_CONFIG.WAVE2_FREQ_X * RIVER_SHADER_CONFIG.WAVE2_AMP * Math.sin(x * RIVER_SHADER_CONFIG.WAVE2_FREQ_X - zFlow * RIVER_SHADER_CONFIG.WAVE2_FREQ_Z)
             + RIVER_SHADER_CONFIG.RIPPLE_AMP * Math.sin(x * RIVER_SHADER_FREQ_X + zFlow * RIVER_SHADER_CONFIG.RIPPLE_FREQ_Z);
    const dz = RIVER_SHADER_CONFIG.WAVE1_FREQ_Z * RIVER_SHADER_CONFIG.WAVE1_AMP * Math.cos(x * RIVER_SHADER_CONFIG.WAVE1_FREQ_X + zFlow * RIVER_SHADER_CONFIG.WAVE1_FREQ_Z)
             + RIVER_SHADER_CONFIG.WAVE2_FREQ_Z * RIVER_SHADER_CONFIG.WAVE2_AMP * Math.sin(x * RIVER_SHADER_CONFIG.WAVE2_FREQ_X - zFlow * RIVER_SHADER_CONFIG.WAVE2_FREQ_Z);

    const nx = -dx * 1.35;
    const ny = 1.0;
    const nz = -dz * 1.35;
    const len = Math.hypot(nx, ny, nz) || 1.0;
    return { x: nx / len, y: ny / len, z: nz / len };
}

const RIVER_SHADER_FREQ_X = RIVER_SHADER_CONFIG.RIPPLE_FREQ_X;

/**
 * Computes the buoyant submersion dip and elastic rebound offset.
 *
 * @param {number} dipOffset - Current vertical displacement (< 0 is submerged)
 * @param {number} dipVelocity - Rate of vertical displacement change
 * @param {number} dt - Step delta time (s)
 * @param {object} [params] - Spring and damping tuning
 * @returns {{ offset: number, velocity: number }} Next spring state
 */
export function stepBuoyantRebound(dipOffset, dipVelocity, dt, params = {}) {
    const stiffness = params.stiffness ?? 38.0;
    const damping = params.damping ?? 7.5;
    const springForce = -stiffness * dipOffset;
    const dampingForce = -damping * dipVelocity;
    const nextVelocity = dipVelocity + (springForce + dampingForce) * dt;
    const nextOffset = dipOffset + nextVelocity * dt;
    return {
        offset: Math.abs(nextOffset) < 0.001 && Math.abs(nextVelocity) < 0.01 ? 0 : nextOffset,
        velocity: Math.abs(nextOffset) < 0.001 && Math.abs(nextVelocity) < 0.01 ? 0 : nextVelocity,
    };
}

/**
 * Creates the high-fidelity river mesh with custom GLSL Gerstner wave shader.
 *
 * @param {number} riverWidth - Width of the navigable river corridor
 * @param {number} riverLength - Total river course length
 * @param {THREE.Texture} waterTex - Base river ripple texture
 * @param {object} [options] - Color and shader options
 * @returns {{ mesh: THREE.Mesh, mat: THREE.ShaderMaterial }}
 */
export function createRiverWaterMesh(riverWidth, riverLength, waterTex, options = {}) {
    const geo = new THREE.PlaneGeometry(riverWidth + 16, riverLength + 200, 96, 480);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uClarity: { value: 0 },
            uMudColor: { value: new THREE.Color(options.mudColor || RIVER_SHADER_CONFIG.DEFAULT_MUD_COLOR) },
            uClearColor: { value: new THREE.Color(options.clearColor || RIVER_SHADER_CONFIG.DEFAULT_CLEAR_COLOR) },
            uDeepColor: { value: new THREE.Color(options.deepColor || RIVER_SHADER_CONFIG.DEFAULT_DEEP_COLOR) },
            uSkyColor: { value: new THREE.Color(options.skyColor || RIVER_SHADER_CONFIG.DEFAULT_SKY_COLOR) },
            uSunColor: { value: new THREE.Color(options.sunColor || RIVER_SHADER_CONFIG.DEFAULT_SUN_COLOR) },
            uSunDir: { value: new THREE.Vector3(0.28, 0.55, -0.78).normalize() },
            uHalfWidth: { value: riverWidth * 0.5 },
            uMap: { value: waterTex },
        },
        vertexShader: `
            uniform float uTime;
            varying vec3 vWorldPos;
            varying vec2 vUv;
            varying float vWaveH;

            void main() {
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);

                // Smooth Gerstner-style river swell flowing toward -Z
                float zFlow = wp.z + uTime * ${RIVER_SHADER_CONFIG.FLOW_SPEED_Z.toFixed(1)};
                float w1 = sin(wp.x * ${RIVER_SHADER_CONFIG.WAVE1_FREQ_X.toFixed(2)} + zFlow * ${RIVER_SHADER_CONFIG.WAVE1_FREQ_Z.toFixed(2)}) * ${RIVER_SHADER_CONFIG.WAVE1_AMP.toFixed(3)};
                float w2 = cos(wp.x * ${RIVER_SHADER_CONFIG.WAVE2_FREQ_X.toFixed(2)} - zFlow * ${RIVER_SHADER_CONFIG.WAVE2_FREQ_Z.toFixed(2)}) * ${RIVER_SHADER_CONFIG.WAVE2_AMP.toFixed(3)};
                float h = w1 + w2;

                wp.y += h;
                vWaveH = h;
                vWorldPos = wp.xyz;

                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uClarity;
            uniform vec3 uMudColor;
            uniform vec3 uClearColor;
            uniform vec3 uDeepColor;
            uniform vec3 uSkyColor;
            uniform vec3 uSunColor;
            uniform vec3 uSunDir;
            uniform float uHalfWidth;
            varying vec3 vWorldPos;
            varying vec2 vUv;
            varying float vWaveH;

            // Smooth procedural ripple noise (computed per-pixel to eliminate triangle grid checkerboards)
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                    f.y
                );
            }

            void main() {
                // Per-pixel continuous analytical wave normal (zero vertex-grid Mach bands or diamond checkerboards)
                float zFlow = vWorldPos.z + uTime * ${RIVER_SHADER_CONFIG.FLOW_SPEED_Z.toFixed(1)};
                float dx = 0.32 * 0.07 * cos(vWorldPos.x * 0.32 + zFlow * 0.18)
                         - 0.58 * 0.035 * sin(vWorldPos.x * 0.58 - zFlow * 0.26)
                         + 0.025 * sin(vWorldPos.x * 1.4 + zFlow * 0.6);
                float dz = 0.18 * 0.07 * cos(vWorldPos.x * 0.32 + zFlow * 0.18)
                         + 0.26 * 0.035 * sin(vWorldPos.x * 0.58 - zFlow * 0.26);
                vec3 N = normalize(vec3(-dx * 1.35, 1.0, -dz * 1.35));
                vec3 V = normalize(cameraPosition - vWorldPos);

                // Deep readable slate-teal river palette so rafts, planks, and monsters pop in 0.5s squint test
                float downstream = clamp(-vWorldPos.z / 1500.0, 0.0, 1.0);
                float clarity = clamp(mix(downstream, uClarity, 0.5), 0.0, 1.0);
                vec3 shallow = mix(uMudColor, uClearColor, clarity);
                float centerDepth = 1.0 - clamp(abs(vWorldPos.x) / uHalfWidth, 0.0, 1.0);
                vec3 baseCol = mix(shallow, uDeepColor, centerDepth * 0.62);

                // Flowing current streaks & subtle caustics
                vec2 flowUv = vec2(vWorldPos.x * 0.38, vWorldPos.z * 0.15 + uTime * 2.4);
                float n1 = noise(flowUv * 2.2);
                float n2 = noise(flowUv * 4.5 - vec2(0.0, uTime * 1.5));
                float caustic = smoothstep(0.60, 0.88, n1 * 0.6 + n2 * 0.4);
                baseCol += vec3(0.14, 0.28, 0.35) * caustic * (0.22 + 0.35 * clarity);

                // Shore foam along riverbanks
                float bankDist = abs(abs(vWorldPos.x) - uHalfWidth);
                float shoreFoam = smoothstep(2.4, 0.2, bankDist) * (0.45 + 0.55 * n1);

                // Smooth Fresnel sky reflection + soft sunset horizon sheen
                float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.6);
                vec3 col = mix(baseCol, uSkyColor, fresnel * 0.38);

                vec3 H = normalize(uSunDir + V);
                float spec = pow(max(dot(N, H), 0.0), 42.0);
                col += uSunColor * spec * 0.32;

                // Subtle wave crest highlights & bank foam
                col += vec3(0.82, 0.92, 0.98) * smoothstep(0.06, 0.11, vWaveH) * 0.18;
                col = mix(col, vec3(0.90, 0.95, 1.0), clamp(shoreFoam * 0.6, 0.0, 0.75));

                gl_FragColor = vec4(col, 1.0);
            }
        `,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -riverLength / 2 + 50;
    mesh.receiveShadow = true;
    return { mesh, mat };
}
