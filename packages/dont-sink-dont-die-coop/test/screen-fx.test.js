import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    FX_CONFIG,
    clamp,
    lerp,
    smoothstep,
    calculateSpeedLineIntensity,
    computeSpeedLineStreak,
    calculateDamagePulse,
    calculateLeviathanRoarPulse,
    createLensDroplet,
    generateLandingSplashDroplets,
    updateLensDroplets,
    calculateDropletRefraction,
    calculateLetterboxFraction,
    smoothLetterboxTransition,
} from '../shared/screen-fx-math.js';

import {
    SCREEN_FX_SHADERS,
    createScreenFxSystem,
} from '../public/js/vfx/screen-fx.js';

describe('Screen-Space FX: Math Basics & Config', () => {
    it('defines expected default constants in FX_CONFIG', () => {
        assert.equal(FX_CONFIG.SPEED_LINE_MIN_SPEED, 14.0);
        assert.equal(FX_CONFIG.SPEED_LINE_MAX_SPEED, 28.0);
        assert.equal(FX_CONFIG.SPEED_LINE_RAPIDS_BONUS, 0.35);
        assert.equal(FX_CONFIG.MAX_DROPLETS, 32);
        assert.equal(FX_CONFIG.DEFAULT_LETTERBOX_ASPECT, 2.39);
    });

    it('clamp correctly bounds input values', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-2, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
    });

    it('lerp interpolates values linearly and clamps factor to [0, 1]', () => {
        assert.equal(lerp(0, 100, 0.5), 50);
        assert.equal(lerp(10, 20, 0), 10);
        assert.equal(lerp(10, 20, 1), 20);
        assert.equal(lerp(10, 20, 1.5), 20);
        assert.equal(lerp(10, 20, -0.5), 10);
    });

    it('smoothstep yields hermite cubic S-curve transitions', () => {
        assert.equal(smoothstep(0, 10, -5), 0);
        assert.equal(smoothstep(0, 10, 15), 1);
        assert.equal(smoothstep(0, 10, 0), 0);
        assert.equal(smoothstep(0, 10, 10), 1);
        assert.equal(smoothstep(0, 10, 5), 0.5);
    });
});

describe('Screen-Space FX: Speed-Line Shader Math', () => {
    it('returns 0 intensity when speed is below 14 m/s without rapids boost', () => {
        assert.equal(calculateSpeedLineIntensity(0), 0);
        assert.equal(calculateSpeedLineIntensity(10.0), 0);
        assert.equal(calculateSpeedLineIntensity(14.0), 0);
    });

    it('smoothly scales speed line intensity between 14 m/s and 28 m/s', () => {
        const mid = calculateSpeedLineIntensity(21.0);
        assert.ok(mid > 0.4 && mid < 0.6, `Midpoint intensity should be ~0.5, got ${mid}`);

        const max = calculateSpeedLineIntensity(28.0);
        assert.equal(max, 1.0);

        const extreme = calculateSpeedLineIntensity(40.0);
        assert.equal(extreme, 1.0);
    });

    it('applies rapids boost bonus even at low speeds', () => {
        const boostedLow = calculateSpeedLineIntensity(8.0, true);
        assert.ok(boostedLow >= FX_CONFIG.SPEED_LINE_RAPIDS_BONUS);

        const boostedHigh = calculateSpeedLineIntensity(24.0, true);
        const unboostedHigh = calculateSpeedLineIntensity(24.0, false);
        assert.ok(boostedHigh > unboostedHigh);
    });

    it('computeSpeedLineStreak masks out inner focal area', () => {
        // Inner radius < 0.35 must have 0 streak
        const inner = computeSpeedLineStreak(0.5, 0.2, 1.0);
        assert.equal(inner, 0.0);
        const innerEdge = computeSpeedLineStreak(0.5, 0.34, 1.0);
        assert.equal(innerEdge, 0.0);
    });

    it('computeSpeedLineStreak produces deterministic streak values', () => {
        const val1 = computeSpeedLineStreak(1.2, 0.7, 5.0);
        const val2 = computeSpeedLineStreak(1.2, 0.7, 5.0);
        assert.equal(val1, val2);
        assert.ok(val1 >= 0 && val1 <= 1);
    });
});

describe('Screen-Space FX: Damage Pulse & Leviathan Roar Math', () => {
    it('calculateDamagePulse returns zero values before strike or after duration', () => {
        const pre = calculateDamagePulse(-0.1, 30);
        assert.deepEqual(pre, { vignette: 0, aberration: 0, redout: 0 });

        const post = calculateDamagePulse(0.8, 30, 0.65);
        assert.deepEqual(post, { vignette: 0, aberration: 0, redout: 0 });
    });

    it('calculateDamagePulse exhibits strong peak and decaying tail', () => {
        const peak = calculateDamagePulse(0.065, 40, 0.65);
        assert.ok(peak.vignette > 0.5, `Peak vignette expected > 0.5, got ${peak.vignette}`);
        assert.ok(peak.aberration > 0.015, `Peak aberration expected > 0.015, got ${peak.aberration}`);
        assert.ok(peak.redout > 0.3, `Peak redout expected > 0.3, got ${peak.redout}`);

        const tail = calculateDamagePulse(0.5, 40, 0.65);
        assert.ok(tail.vignette < peak.vignette);
        assert.ok(tail.aberration < peak.aberration);
        assert.ok(tail.redout < peak.redout);
    });

    it('calculateDamagePulse scales with damage amount', () => {
        const light = calculateDamagePulse(0.065, 15, 0.65);
        const heavy = calculateDamagePulse(0.065, 50, 0.65);
        assert.ok(heavy.vignette > light.vignette);
        assert.ok(heavy.aberration > light.aberration);
    });

    it('calculateLeviathanRoarPulse returns zero outside duration', () => {
        const pre = calculateLeviathanRoarPulse(-0.1);
        assert.deepEqual(pre, { vignette: 0, aberration: 0, rumble: 0 });

        const post = calculateLeviathanRoarPulse(1.5, 1.4);
        assert.deepEqual(post, { vignette: 0, aberration: 0, rumble: 0 });
    });

    it('calculateLeviathanRoarPulse exhibits swell, sustain, and sub-bass rumble oscillation', () => {
        const early = calculateLeviathanRoarPulse(0.1, 1.4);
        const mid = calculateLeviathanRoarPulse(0.5, 1.4);
        assert.ok(mid.vignette > early.vignette);
        assert.ok(mid.aberration > early.aberration);
        assert.notEqual(mid.rumble, 0.0);
    });
});

describe('Screen-Space FX: Lens Droplet Simulation & Refraction', () => {
    it('createLensDroplet initializes droplet with valid coordinates and lifetime', () => {
        const drop = createLensDroplet(0.5, 0.4, 0.02, 2.0);
        assert.equal(drop.x, 0.5);
        assert.equal(drop.y, 0.4);
        assert.equal(drop.radius, 0.02);
        assert.equal(drop.life, 2.0);
        assert.equal(drop.maxLife, 2.0);
        assert.ok(drop.vy > 0);
    });

    it('generateLandingSplashDroplets returns empty array on small impacts (< 3 m/s)', () => {
        const emptyLow = generateLandingSplashDroplets(1.5);
        assert.equal(emptyLow.length, 0);
        const emptyBound = generateLandingSplashDroplets(2.99);
        assert.equal(emptyBound.length, 0);
    });

    it('generateLandingSplashDroplets spawns droplets scaling with impact velocity', () => {
        const mild = generateLandingSplashDroplets(5.0, 16, 123);
        const heavy = generateLandingSplashDroplets(15.0, 16, 123);
        assert.ok(mild.length > 0);
        assert.ok(heavy.length >= mild.length);
        assert.ok(heavy.length <= FX_CONFIG.MAX_DROPLETS);

        // Deterministic generation
        const heavy2 = generateLandingSplashDroplets(15.0, 16, 123);
        assert.deepEqual(heavy, heavy2);
    });

    it('updateLensDroplets simulates gravity drip and removes expired droplets', () => {
        const d1 = createLensDroplet(0.5, 0.3, 0.02, 1.0);
        const d2 = createLensDroplet(0.5, 0.3, 0.02, 0.1);

        const surviving = updateLensDroplets([d1, d2], 0.2);
        assert.equal(surviving.length, 1);
        assert.equal(surviving[0], d1);
        assert.ok(d1.y > 0.3, 'Droplet should drip downward (+Y)');
    });

    it('calculateDropletRefraction calculates UV displacement within radius and zero outside', () => {
        const d = createLensDroplet(0.5, 0.5, 0.1, 2.0);

        // Outside radius
        const outside = calculateDropletRefraction(0.7, 0.7, d);
        assert.equal(outside.dx, 0);
        assert.equal(outside.dy, 0);
        assert.equal(outside.alpha, 0);

        // Inside radius
        const inside = calculateDropletRefraction(0.52, 0.52, d);
        assert.ok(inside.dx > 0);
        assert.ok(inside.dy > 0);
        assert.ok(inside.alpha > 0);
    });
});

describe('Screen-Space FX: Cinematic Letterbox Calculations', () => {
    it('calculateLetterboxFraction calculates correct bar thickness for 16:9 to 2.39:1', () => {
        const w = 1920;
        const h = 1080; // 16:9 ≈ 1.7778
        const frac = calculateLetterboxFraction(w, h, 2.39);
        // (1 - (1.7778 / 2.39)) * 0.5 ≈ (1 - 0.7438) * 0.5 ≈ 0.128
        assert.ok(frac > 0.12 && frac < 0.14, `Expected ~0.128, got ${frac}`);
    });

    it('calculateLetterboxFraction returns 0 if viewport is already equal or wider than target aspect', () => {
        const ultrawideW = 2560;
        const ultrawideH = 1080; // ~2.37
        const fracSame = calculateLetterboxFraction(2390, 1000, 2.39);
        assert.equal(fracSame, 0);

        const fracWider = calculateLetterboxFraction(3000, 1000, 2.39);
        assert.equal(fracWider, 0);
    });

    it('smoothLetterboxTransition eases current fraction toward target', () => {
        const step1 = smoothLetterboxTransition(0.0, 0.15, 0.1, 4.0);
        assert.ok(step1 > 0.0 && step1 < 0.15);

        const step2 = smoothLetterboxTransition(step1, 0.15, 0.5, 4.0);
        assert.ok(step2 > step1 && step2 <= 0.15);
    });
});

describe('Screen-Space FX: Three.js System & Lifecycle', () => {
    function createMockThree() {
        class MockVector2 {
            constructor(x = 0, y = 0) { this.x = x; this.y = y; }
            set(x, y) { this.x = x; this.y = y; return this; }
        }
        class MockVector4 {
            constructor(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; }
            set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
        }
        class MockPlaneGeometry {
            constructor(w, h) { this.w = w; this.h = h; }
            dispose() {}
        }
        class MockShaderMaterial {
            constructor(opts) {
                this.uniforms = opts.uniforms;
                this.vertexShader = opts.vertexShader;
                this.fragmentShader = opts.fragmentShader;
            }
            dispose() {}
        }
        class MockMesh {
            constructor(geo, mat) {
                this.geometry = geo;
                this.material = mat;
                this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
                this.frustumCulled = true;
            }
        }
        return {
            Vector2: MockVector2,
            Vector4: MockVector4,
            PlaneGeometry: MockPlaneGeometry,
            ShaderMaterial: MockShaderMaterial,
            Mesh: MockMesh,
        };
    }

    function createMockContainer() {
        const children = [];
        return {
            children,
            add(obj) { children.push(obj); },
            remove(obj) {
                const idx = children.indexOf(obj);
                if (idx !== -1) children.splice(idx, 1);
            },
        };
    }

    it('initializes Screen FX system and adds screen quad to camera', () => {
        const THREE = createMockThree();
        const scene = createMockContainer();
        const camera = createMockContainer();

        const fx = createScreenFxSystem(THREE, scene, camera, { width: 1920, height: 1080 });

        assert.ok(camera.children.includes(fx.mesh));
        assert.equal(fx.mesh.frustumCulled, false);
        assert.equal(fx.uniforms.uResolution.value.x, 1920);
        assert.equal(fx.uniforms.uResolution.value.y, 1080);
    });

    it('updates speedline intensity dynamically on high-speed telemetry', () => {
        const THREE = createMockThree();
        const scene = createMockContainer();
        const camera = createMockContainer();
        const fx = createScreenFxSystem(THREE, scene, camera);

        // Low speed (< 14 m/s) -> 0
        fx.update(0.1, { speed: 8.0, isBoostingRapids: false });
        assert.equal(fx.getSpeedIntensity(), 0.0);

        // High speed (22 m/s) -> speeds lines ramp up
        for (let i = 0; i < 10; i++) {
            fx.update(0.1, { speed: 22.0, isBoostingRapids: false });
        }
        assert.ok(fx.getSpeedIntensity() > 0.4);
        assert.ok(fx.uniforms.uSpeedIntensity.value > 0.4);
    });

    it('triggers damage pulse and updates vignette/aberration uniforms', () => {
        const THREE = createMockThree();
        const scene = createMockContainer();
        const camera = createMockContainer();
        const fx = createScreenFxSystem(THREE, scene, camera);

        fx.triggerDamagePulse(35, 0.5);
        fx.update(0.05);

        assert.ok(fx.uniforms.uVignetteIntensity.value > 0.2);
        assert.ok(fx.uniforms.uAberrationOffset.value > 0.005);
        assert.ok(fx.uniforms.uRedout.value > 0.1);

        // Step past duration
        fx.update(0.6);
        assert.equal(fx.uniforms.uVignetteIntensity.value, 0);
        assert.equal(fx.uniforms.uAberrationOffset.value, 0);
    });

    it('triggers Leviathan roar pulse and updates aberration uniforms', () => {
        const THREE = createMockThree();
        const scene = createMockContainer();
        const camera = createMockContainer();
        const fx = createScreenFxSystem(THREE, scene, camera);

        fx.triggerLeviathanRoar(1.2);
        fx.update(0.3);

        assert.ok(fx.uniforms.uAberrationOffset.value > 0.01);
        assert.ok(fx.uniforms.uVignetteIntensity.value > 0.1);
    });

    it('triggers splash landing and populates droplet array uniforms', () => {
        const THREE = createMockThree();
        const scene = createMockContainer();
        const camera = createMockContainer();
        const fx = createScreenFxSystem(THREE, scene, camera);

        fx.triggerSplashLanding(10.0, 8);
        assert.ok(fx.getActiveDroplets().length > 0);

        fx.update(0.016);
        assert.ok(fx.uniforms.uDropletCount.value > 0);
        assert.ok(fx.uniforms.uDroplets.value[0].z > 0); // Radius > 0
    });

    it('controls cinematic letterbox bars during cutscenes', () => {
        const THREE = createMockThree();
        const scene = createMockContainer();
        const camera = createMockContainer();
        const fx = createScreenFxSystem(THREE, scene, camera, { width: 1920, height: 1080 });

        fx.setCinematicLetterbox(true);
        assert.equal(fx.isCinematicActive(), true);

        for (let i = 0; i < 15; i++) {
            fx.update(0.1);
        }

        assert.ok(fx.getLetterboxHeight() > 0.1);
        assert.ok(fx.uniforms.uLetterboxHeight.value > 0.1);

        // Deactivate letterbox
        fx.setCinematicLetterbox(false);
        assert.equal(fx.isCinematicActive(), false);

        for (let i = 0; i < 20; i++) {
            fx.update(0.1);
        }
        assert.equal(fx.getLetterboxHeight(), 0.0);
        assert.equal(fx.uniforms.uLetterboxHeight.value, 0.0);
    });

    it('updates resolution on setSize and cleans up on dispose', () => {
        const THREE = createMockThree();
        const scene = createMockContainer();
        const camera = createMockContainer();
        const fx = createScreenFxSystem(THREE, scene, camera, { width: 1280, height: 720 });

        fx.setSize(2560, 1440);
        assert.equal(fx.uniforms.uResolution.value.x, 2560);
        assert.equal(fx.uniforms.uResolution.value.y, 1440);

        assert.equal(camera.children.length, 1);
        fx.dispose();
        assert.equal(camera.children.length, 0);
    });
});
