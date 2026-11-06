import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    DIORAMA_ACT_Z_BOUNDS,
    DIORAMA_BIOME_PRESETS,
    DEFAULT_DIORAMA_CAMERA,
    computeDioramaLightingState,
    resolveBiomeBlendKeys,
    computeCameraPerspectiveModifiers,
    clamp,
    lerp,
    rgbToHex,
    lerpColor,
    normalizeVector3,
    lerpVector3,
} from '../shared/diorama-lighting-director.js';

describe('Diorama Lighting Director: Constants & Pure Math Helpers', () => {
    test('DIORAMA_ACT_Z_BOUNDS defines canonical Act boundaries downriver', () => {
        assert.equal(DIORAMA_ACT_Z_BOUNDS.ACT1_START, 0);
        assert.equal(DIORAMA_ACT_Z_BOUNDS.ACT1_END, -375);
        assert.equal(DIORAMA_ACT_Z_BOUNDS.ACT2_END, -750);
        assert.equal(DIORAMA_ACT_Z_BOUNDS.ACT3_END, -1125);
        assert.equal(DIORAMA_ACT_Z_BOUNDS.ACT4_END, -1500);
    });

    test('DIORAMA_BIOME_PRESETS covers all 4 Acts with fog.far >= 260m', () => {
        const presets = Object.values(DIORAMA_BIOME_PRESETS);
        assert.equal(presets.length, 4);

        for (const p of presets) {
            assert.ok(p.fog.far >= 260, `${p.id} base fog far plane must be >= 260m, got ${p.fog.far}`);
            assert.ok(p.fog.near > 0 && p.fog.near < p.fog.far);
            assert.ok(p.fog.density > 0 && p.fog.density < 0.02);
            assert.ok(p.hemiLight.intensity > 0.5);
            assert.ok(p.sunLight.intensity > 0.5);
            assert.ok(p.waterSpecular.specularPower >= 64);
            assert.ok(p.waterSpecular.specularIntensity >= 1.0);
        }
    });

    test('clamp restricts numbers to valid min/max intervals and guards NaNs', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-5, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
        assert.equal(clamp(NaN, 0, 10), 0);
        assert.equal(clamp('invalid', 2, 8), 2);
    });

    test('lerp performs bounded linear interpolation', () => {
        assert.equal(lerp(10, 20, 0), 10);
        assert.equal(lerp(10, 20, 0.5), 15);
        assert.equal(lerp(10, 20, 1), 20);
        assert.equal(lerp(10, 20, 1.5), 20);
        assert.equal(lerp(10, 20, -0.5), 10);
    });

    test('rgbToHex converts normalized [0, 1] RGB floats to 24-bit hex', () => {
        assert.equal(rgbToHex(1, 1, 1), 0xffffff);
        assert.equal(rgbToHex(0, 0, 0), 0x000000);
        assert.equal(rgbToHex(1, 0, 0), 0xff0000);
        assert.equal(rgbToHex(0, 1, 0), 0x00ff00);
        assert.equal(rgbToHex(0, 0, 1), 0x0000ff);
    });

    test('lerpColor smoothly blends RGB objects with hexadecimal calculation', () => {
        const c1 = { r: 0.0, g: 0.0, b: 0.0 };
        const c2 = { r: 1.0, g: 1.0, b: 1.0 };

        const mid = lerpColor(c1, c2, 0.5);
        assert.equal(mid.r, 0.5);
        assert.equal(mid.g, 0.5);
        assert.equal(mid.b, 0.5);
        assert.equal(mid.hex, 0x808080);
    });

    test('normalizeVector3 returns unit-length vector', () => {
        const v = normalizeVector3({ x: 3, y: 0, z: 4 });
        assert.equal(v.x, 0.6);
        assert.equal(v.y, 0.0);
        assert.equal(v.z, 0.8);
        assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1.0) < 1e-3);
    });

    test('lerpVector3 produces normalized blended direction', () => {
        const v1 = { x: 0, y: 1, z: 0 };
        const v2 = { x: 1, y: 0, z: 0 };
        const mid = lerpVector3(v1, v2, 0.5);
        assert.ok(Math.abs(mid.x - mid.y) < 1e-3);
        assert.ok(Math.abs(Math.hypot(mid.x, mid.y, mid.z) - 1.0) < 1e-3);
    });
});

describe('Biome Resolution & Transitions: resolveBiomeBlendKeys', () => {
    test('resolves pure Act 1 at river start z >= 0 to -300', () => {
        const r0 = resolveBiomeBlendKeys(50);
        assert.equal(r0.fromKey, 'amber-canyon');
        assert.equal(r0.toKey, 'amber-canyon');
        assert.equal(r0.factor, 0);
        assert.equal(r0.actIndex, 1);

        const r1 = resolveBiomeBlendKeys(-150);
        assert.equal(r1.fromKey, 'amber-canyon');
        assert.equal(r1.toKey, 'amber-canyon');
        assert.equal(r1.factor, 0);
        assert.equal(r1.actIndex, 1);
    });

    test('resolves transition between Act 1 and Act 2 across z = -375', () => {
        // -375 is midpoint
        const mid = resolveBiomeBlendKeys(-375);
        assert.equal(mid.fromKey, 'amber-canyon');
        assert.equal(mid.toKey, 'neon-harbor');
        assert.ok(Math.abs(mid.factor - 0.5) < 1e-4);

        // Before midpoint (-350)
        const early = resolveBiomeBlendKeys(-350);
        assert.equal(early.fromKey, 'amber-canyon');
        assert.equal(early.toKey, 'neon-harbor');
        assert.ok(early.factor < 0.5);
        assert.equal(early.actIndex, 1);

        // Past midpoint (-400)
        const late = resolveBiomeBlendKeys(-400);
        assert.equal(late.fromKey, 'amber-canyon');
        assert.equal(late.toKey, 'neon-harbor');
        assert.ok(late.factor > 0.5);
        assert.equal(late.actIndex, 2);
    });

    test('resolves pure Act 2 in mid-harbor (-550)', () => {
        const r = resolveBiomeBlendKeys(-550);
        assert.equal(r.fromKey, 'neon-harbor');
        assert.equal(r.toKey, 'neon-harbor');
        assert.equal(r.factor, 0);
        assert.equal(r.actIndex, 2);
    });

    test('resolves transition between Act 2 and Act 3 at z = -750', () => {
        const mid = resolveBiomeBlendKeys(-750);
        assert.equal(mid.fromKey, 'neon-harbor');
        assert.equal(mid.toKey, 'bioluminescent-gorge');
        assert.ok(Math.abs(mid.factor - 0.5) < 1e-4);
    });

    test('resolves transition between Act 3 and Act 4 at z = -1125', () => {
        const mid = resolveBiomeBlendKeys(-1125);
        assert.equal(mid.fromKey, 'bioluminescent-gorge');
        assert.equal(mid.toKey, 'tempest-maelstrom');
        assert.ok(Math.abs(mid.factor - 0.5) < 1e-4);
    });

    test('resolves pure Act 4 past -1200 down to deep endless sectors (-3000)', () => {
        const r1 = resolveBiomeBlendKeys(-1300);
        assert.equal(r1.fromKey, 'tempest-maelstrom');
        assert.equal(r1.toKey, 'tempest-maelstrom');
        assert.equal(r1.factor, 0);
        assert.equal(r1.actIndex, 4);

        const r2 = resolveBiomeBlendKeys(-3500);
        assert.equal(r2.fromKey, 'tempest-maelstrom');
        assert.equal(r2.actIndex, 4);
    });
});

describe('Perspective Modifiers: computeCameraPerspectiveModifiers', () => {
    test('high pitch (~0.82 rad) expands fog far distance and boosts fill light', () => {
        const low = computeCameraPerspectiveModifiers(0.25, 30);
        const high = computeCameraPerspectiveModifiers(0.82, 30);

        assert.ok(high.fogFarExtensionMeters > low.fogFarExtensionMeters);
        assert.ok(high.hemiIntensityMultiplier > low.hemiIntensityMultiplier);
        assert.ok(high.specularIntensityMultiplier > low.specularIntensityMultiplier);
        assert.ok(high.fogDensityMultiplier < low.fogDensityMultiplier, 'High angle should reduce vertical fog density');
    });

    test('greater camera distance pushes fog distance further to preserve horizon', () => {
        const close = computeCameraPerspectiveModifiers(0.80, 20);
        const far = computeCameraPerspectiveModifiers(0.80, 55);

        assert.ok(far.fogFarExtensionMeters > close.fogFarExtensionMeters);
    });

    test('safely clamps extreme pitch and distance inputs', () => {
        const crazyNegative = computeCameraPerspectiveModifiers(-10, -50);
        assert.ok(crazyNegative.safePitch >= 0.05);
        assert.ok(crazyNegative.safeDistance >= 8.0);

        const crazyHuge = computeCameraPerspectiveModifiers(100, 500);
        assert.ok(crazyHuge.safePitch <= Math.PI * 0.49);
        assert.ok(crazyHuge.safeDistance <= 120.0);
    });
});

describe('Core Controller: computeDioramaLightingState', () => {
    test('returns complete authoritative state with fog far-plane >= 260m', () => {
        const state = computeDioramaLightingState({
            zPos: -100,
            cameraPitch: 0.82,
            cameraDistance: 35,
        });

        assert.equal(state.actIndex, 1);
        assert.equal(state.primaryBiomeId, 'amber-canyon');
        assert.ok(state.fog.far >= 260.0, `Fog far plane must be >= 260m, was ${state.fog.far}`);
        assert.equal(state.fog.isFarPlaneClamped, true);
        assert.ok(state.fog.near > 10.0 && state.fog.near < state.fog.far);
        assert.ok(state.fog.density > 0);

        // Sky dome color channels in [0, 1]
        for (const [key, color] of Object.entries(state.skyDome)) {
            assert.ok(color.r >= 0 && color.r <= 1, `${key}.r out of bounds`);
            assert.ok(color.g >= 0 && color.g <= 1, `${key}.g out of bounds`);
            assert.ok(color.b >= 0 && color.b <= 1, `${key}.b out of bounds`);
            assert.ok(color.hex !== undefined);
        }

        // Hemisphere light
        assert.ok(state.hemiLight.intensity > 0.5);
        assert.ok(state.hemiLight.skyColor.hex !== undefined);
        assert.ok(state.hemiLight.groundColor.hex !== undefined);

        // Directional Sun light
        assert.ok(state.sunLight.intensity > 0.5);
        assert.ok(state.sunLight.direction.y > 0, 'Sun must point downwards towards scene');

        // Water Specular Contrast
        assert.ok(state.waterSpecular.specularPower >= 64);
        assert.ok(state.waterSpecular.specularIntensity >= 1.0);
        assert.ok(state.waterSpecular.clarity >= 0.0 && state.waterSpecular.clarity <= 1.0);
    });

    test('guarantees fog far-plane >= 260m across all acts and boundary transitions', () => {
        const sampleZ = [50, 0, -200, -375, -500, -750, -900, -1125, -1300, -1800, -3000];

        for (const z of sampleZ) {
            const state = computeDioramaLightingState({ zPos: z });
            assert.ok(state.fog.far >= 260.0, `Act at z=${z} must maintain fog far-plane >= 260m, got ${state.fog.far}`);
            assert.ok(state.fog.near < state.fog.far);
            assert.ok(state.fog.density > 0 && state.fog.density < 0.01);
            assert.ok(state.hemiLight.intensity >= 0.6);
            assert.ok(state.waterSpecular.specularIntensity >= 1.0);
        }
    });

    test('smoothly interpolates all lighting and specular parameters at act boundaries', () => {
        const stateStart = computeDioramaLightingState({ zPos: -300 }); // Before Act 1 -> 2
        const stateMid = computeDioramaLightingState({ zPos: -375 });   // Midpoint
        const stateEnd = computeDioramaLightingState({ zPos: -500 });   // Pure Act 2

        assert.equal(stateStart.primaryBiomeId, 'amber-canyon');
        assert.equal(stateEnd.primaryBiomeId, 'neon-harbor');
        assert.ok(stateMid.blendFactor > 0.45 && stateMid.blendFactor < 0.55);

        // Fog color should blend between warm amber canyon (0x283c54) and neon harbor (0x191e38)
        assert.notEqual(stateMid.fog.color.hex, stateStart.fog.color.hex);
        assert.notEqual(stateMid.fog.color.hex, stateEnd.fog.color.hex);

        // Water clarity increases as river progresses downriver
        assert.ok(stateEnd.waterSpecular.clarity > stateStart.waterSpecular.clarity);
    });

    test('handles missing or invalid parameters with graceful defaults', () => {
        const fallbackState = computeDioramaLightingState();
        assert.equal(fallbackState.zPos, 0);
        assert.equal(fallbackState.actIndex, 1);
        assert.ok(fallbackState.fog.far >= 260);

        const nanState = computeDioramaLightingState({
            zPos: NaN,
            cameraPitch: undefined,
            cameraDistance: null,
        });
        assert.equal(nanState.actIndex, 1);
        assert.ok(nanState.fog.far >= 260);
        assert.ok(!Number.isNaN(nanState.camera.pitch));
        assert.ok(!Number.isNaN(nanState.camera.distance));
    });

    test('supports custom minFogFarMeters override for extreme high-altitude shots', () => {
        const customState = computeDioramaLightingState(
            { zPos: -500, cameraPitch: 0.85, cameraDistance: 50 },
            { minFogFarMeters: 400 }
        );
        assert.ok(customState.fog.far >= 400, `Expected custom far >= 400, got ${customState.fog.far}`);
    });
});
