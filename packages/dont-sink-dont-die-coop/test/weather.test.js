import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    WEATHER_STATES,
    WEATHER_SEQUENCE,
    getWeatherStateAtZ,
    clamp,
    lerp,
    lerpColorHex,
    computeWindVector,
    calculateLightningFlash,
    interpolateWeatherParameters,
    wrapParticleCoordinate,
    createWeatherSystem,
} from '../public/js/world/weather.js';

describe('weather states and configuration', () => {
    it('defines all 4 required weather states', () => {
        const required = ['clear-sunset', 'harbor-mist', 'toxic-spore-fog', 'thunder-tempest'];
        for (const name of required) {
            assert.ok(WEATHER_STATES[name], `Missing weather state: ${name}`);
            assert.equal(WEATHER_STATES[name].name, name);
        }
        assert.deepEqual(WEATHER_SEQUENCE, required);
    });

    it('each state defines valid particle modes and positive particle counts up to 3000', () => {
        for (const [name, state] of Object.entries(WEATHER_STATES)) {
            assert.ok(['dust', 'mist', 'spore', 'rain'].includes(state.particleMode));
            assert.ok(state.particleCount > 0 && state.particleCount <= 3000);
            assert.ok(state.particleSize > 0);
            assert.ok(state.particleSpeed > 0);
            assert.ok(state.particleOpacity >= 0 && state.particleOpacity <= 1.0);
        }
    });

    it('each state specifies valid fog, lighting and sky parameters', () => {
        for (const [name, state] of Object.entries(WEATHER_STATES)) {
            assert.equal(typeof state.fogColor, 'number');
            assert.ok(state.fogDensity > 0);
            assert.equal(typeof state.ambientColor, 'number');
            assert.ok(state.ambientIntensity > 0);
            assert.equal(typeof state.sunColor, 'number');
            assert.ok(state.sunIntensity > 0);
            assert.equal(typeof state.skyTopColor, 'number');
            assert.equal(typeof state.skyMidColor, 'number');
            assert.equal(typeof state.skyHorizonColor, 'number');
        }
    });

    it('only thunder-tempest enables lightning by default', () => {
        assert.equal(WEATHER_STATES['clear-sunset'].lightningChance, 0);
        assert.equal(WEATHER_STATES['harbor-mist'].lightningChance, 0);
        assert.equal(WEATHER_STATES['toxic-spore-fog'].lightningChance, 0);
        assert.ok(WEATHER_STATES['thunder-tempest'].lightningChance > 0);
    });
});

describe('river z-coordinate mapping (getWeatherStateAtZ)', () => {
    it('maps Act I (0 to -375) to clear-sunset', () => {
        assert.equal(getWeatherStateAtZ(0), 'clear-sunset');
        assert.equal(getWeatherStateAtZ(-100), 'clear-sunset');
        assert.equal(getWeatherStateAtZ(-374), 'clear-sunset');
    });

    it('maps Act II (-375 to -750) to harbor-mist', () => {
        assert.equal(getWeatherStateAtZ(-375), 'harbor-mist');
        assert.equal(getWeatherStateAtZ(-500), 'harbor-mist');
        assert.equal(getWeatherStateAtZ(-749), 'harbor-mist');
    });

    it('maps Act III (-750 to -1125) to toxic-spore-fog', () => {
        assert.equal(getWeatherStateAtZ(-750), 'toxic-spore-fog');
        assert.equal(getWeatherStateAtZ(-900), 'toxic-spore-fog');
        assert.equal(getWeatherStateAtZ(-1124), 'toxic-spore-fog');
    });

    it('maps Act IV (-1125 to -1500 and beyond) to thunder-tempest', () => {
        assert.equal(getWeatherStateAtZ(-1125), 'thunder-tempest');
        assert.equal(getWeatherStateAtZ(-1350), 'thunder-tempest');
        assert.equal(getWeatherStateAtZ(-1500), 'thunder-tempest');
        assert.equal(getWeatherStateAtZ(-3000), 'thunder-tempest');
    });
});

describe('pure math helpers (clamp, lerp, lerpColorHex)', () => {
    it('clamp restricts values to min and max', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-2, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
    });

    it('lerp interpolates linearly with clamping to [0, 1]', () => {
        assert.equal(lerp(10, 20, 0), 10);
        assert.equal(lerp(10, 20, 0.5), 15);
        assert.equal(lerp(10, 20, 1), 20);
        assert.equal(lerp(10, 20, -0.5), 10);
        assert.equal(lerp(10, 20, 1.5), 20);
    });

    it('lerpColorHex blends RGB components correctly', () => {
        const black = 0x000000;
        const white = 0xffffff;
        assert.equal(lerpColorHex(black, white, 0), 0x000000);
        assert.equal(lerpColorHex(black, white, 1), 0xffffff);
        const mid = lerpColorHex(black, white, 0.5);
        // Expect roughly 0x808080 (128, 128, 128)
        assert.equal((mid >> 16) & 0xff, 128);
        assert.equal((mid >> 8) & 0xff, 128);
        assert.equal(mid & 0xff, 128);
    });
});

describe('wind vector computation', () => {
    it('produces deterministic 3D wind vectors for any time t', () => {
        const w1 = computeWindVector('clear-sunset', 10.5);
        const w2 = computeWindVector('clear-sunset', 10.5);
        assert.deepEqual(w1, w2);
        assert.ok(Number.isFinite(w1.x));
        assert.ok(Number.isFinite(w1.y));
        assert.ok(Number.isFinite(w1.z));
    });

    it('thunder-tempest produces stronger wind gusts than clear-sunset', () => {
        const storm = computeWindVector('thunder-tempest', 2.0);
        const calm = computeWindVector('clear-sunset', 2.0);
        const stormSpeed = Math.hypot(storm.x, storm.y, storm.z);
        const calmSpeed = Math.hypot(calm.x, calm.y, calm.z);
        assert.ok(stormSpeed > calmSpeed * 2);
    });
});

describe('lightning flash curve (calculateLightningFlash)', () => {
    it('returns 0 before strike or after duration', () => {
        assert.equal(calculateLightningFlash(-0.1), 0);
        assert.equal(calculateLightningFlash(0.5, 0.4), 0);
    });

    it('peaks sharply during the primary strike phase', () => {
        const peak = calculateLightningFlash(0.06, 0.42);
        assert.ok(peak > 0.8, `Peak intensity was ${peak}`);
    });

    it('exhibits secondary flash bump and decay tail', () => {
        const secondary = calculateLightningFlash(0.2, 0.42);
        assert.ok(secondary > 0.1 && secondary < 0.6);
        const tail = calculateLightningFlash(0.35, 0.42);
        assert.ok(tail > 0 && tail < secondary);
    });
});

describe('weather state interpolation (interpolateWeatherParameters)', () => {
    it('returns exact start state at progress 0', () => {
        const blended = interpolateWeatherParameters('clear-sunset', 'thunder-tempest', 0);
        assert.equal(blended.fogColor, WEATHER_STATES['clear-sunset'].fogColor);
        assert.equal(blended.fogDensity, WEATHER_STATES['clear-sunset'].fogDensity);
        assert.equal(blended.sunIntensity, WEATHER_STATES['clear-sunset'].sunIntensity);
    });

    it('returns exact end state at progress 1', () => {
        const blended = interpolateWeatherParameters('clear-sunset', 'thunder-tempest', 1);
        assert.equal(blended.fogColor, WEATHER_STATES['thunder-tempest'].fogColor);
        assert.equal(blended.fogDensity, WEATHER_STATES['thunder-tempest'].fogDensity);
        assert.equal(blended.sunIntensity, WEATHER_STATES['thunder-tempest'].sunIntensity);
    });

    it('smoothly blends values at progress 0.5', () => {
        const s1 = WEATHER_STATES['clear-sunset'];
        const s2 = WEATHER_STATES['thunder-tempest'];
        const blended = interpolateWeatherParameters('clear-sunset', 'thunder-tempest', 0.5);

        assert.ok(blended.fogDensity > s1.fogDensity && blended.fogDensity < s2.fogDensity);
        assert.ok(blended.sunIntensity < s1.sunIntensity && blended.sunIntensity > s2.sunIntensity);
        assert.equal(blended.particleMode, s2.particleMode);
    });
});

describe('camera-relative particle wrapping (wrapParticleCoordinate)', () => {
    it('leaves points within bounds unchanged', () => {
        const camPos = 100;
        const halfExtent = 50;
        assert.equal(wrapParticleCoordinate(120, camPos, halfExtent), 120);
        assert.equal(wrapParticleCoordinate(80, camPos, halfExtent), 80);
    });

    it('wraps points that drift ahead to behind the camera', () => {
        const camPos = 0;
        const halfExtent = 50; // extent = 100 [-50, 50]
        const wrapped = wrapParticleCoordinate(60, camPos, halfExtent);
        assert.equal(wrapped, -40);
    });

    it('wraps points that drift behind to ahead of the camera', () => {
        const camPos = 0;
        const halfExtent = 50;
        const wrapped = wrapParticleCoordinate(-60, camPos, halfExtent);
        assert.equal(wrapped, 40);
    });
});

describe('Three.js weather system mock & director lifecycle', () => {
    function createMockThree() {
        class MockVector3 {
            constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
            set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        }
        class MockColor {
            constructor(hex = 0) { this.hex = hex; }
            setHex(hex) { this.hex = hex; return this; }
            lerp(other, alpha) { return this; }
        }
        class MockAttribute {
            constructor(array, itemSize) {
                this.array = array;
                this.itemSize = itemSize;
                this.needsUpdate = false;
            }
        }
        class MockBufferGeometry {
            constructor() {
                this.attributes = {};
            }
            setAttribute(name, attr) {
                this.attributes[name] = attr;
            }
            dispose() {}
        }
        class MockShaderMaterial {
            constructor(opts) {
                this.uniforms = opts.uniforms || {};
                this.transparent = opts.transparent;
                this.depthWrite = opts.depthWrite;
            }
            dispose() {}
        }
        class MockPoints {
            constructor(geo, mat) {
                this.geometry = geo;
                this.material = mat;
                this.frustumCulled = true;
            }
        }
        class MockDirectionalLight {
            constructor(color, intensity) {
                this.color = new MockColor(color);
                this.intensity = intensity;
                this.position = new MockVector3();
            }
        }

        return {
            Vector3: MockVector3,
            Color: MockColor,
            BufferAttribute: MockAttribute,
            BufferGeometry: MockBufferGeometry,
            ShaderMaterial: MockShaderMaterial,
            Points: MockPoints,
            DirectionalLight: MockDirectionalLight,
            AdditiveBlending: 2,
        };
    }

    function createMockScene() {
        const children = [];
        return {
            children,
            add(obj) { children.push(obj); },
            remove(obj) {
                const idx = children.indexOf(obj);
                if (idx !== -1) children.splice(idx, 1);
            },
            fog: {
                color: { setHex(h) { this.hex = h; }, lerp() {} },
                density: 0.005,
            },
        };
    }

    it('initializes weather system and adds particlePoints and lightning light to scene', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const weather = createWeatherSystem(THREE, scene, { initialState: 'clear-sunset' });

        assert.equal(weather.getCurrentState(), 'clear-sunset');
        assert.ok(scene.children.includes(weather.particlePoints));
        assert.ok(scene.children.includes(weather.lightningLight));
        assert.equal(weather.particleGeo.attributes.position.array.length, 3000 * 3);
    });

    it('smoothly transitions states and triggers thunder callback on lightning', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        let thunderFired = false;

        const weather = createWeatherSystem(THREE, scene, {
            initialState: 'clear-sunset',
            onThunder: (data) => {
                thunderFired = true;
                assert.ok(data.duration > 0);
            },
        });

        // Trigger transition to thunder-tempest
        weather.setWeatherState('thunder-tempest', false);
        assert.equal(weather.getTargetState(), 'thunder-tempest');

        // Step simulation
        for (let i = 0; i < 30; i++) {
            weather.update(0.1, { x: 0, y: 5, z: -200 });
        }

        assert.equal(weather.getCurrentState(), 'thunder-tempest');

        // Trigger manual lightning
        weather.triggerLightning(0.4);
        assert.equal(thunderFired, true);
        assert.equal(weather.isFlashing(), true);

        // Advance past flash duration
        weather.update(0.5, { x: 0, y: 5, z: -200 });
        assert.equal(weather.isFlashing(), false);
        assert.equal(weather.getFlashIntensity(), 0);
    });

    it('automatically transitions based on river Z position when passed to update', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const weather = createWeatherSystem(THREE, scene, { initialState: 'clear-sunset' });

        weather.update(0.1, { x: 0, y: 5, z: -800 }, -800);
        assert.equal(weather.getTargetState(), 'toxic-spore-fog');

        weather.update(0.1, { x: 0, y: 5, z: -1300 }, -1300);
        assert.equal(weather.getTargetState(), 'thunder-tempest');
    });

    it('cleans up scene elements on dispose()', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const weather = createWeatherSystem(THREE, scene);

        assert.equal(scene.children.length, 2);
        weather.dispose();
        assert.equal(scene.children.length, 0);
    });
});
