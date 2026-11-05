import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    createCockpitThemeApplicator,
    THEME_PALETTES,
    COLORBLIND_MODES,
    MIN_UI_SCALE,
    MAX_UI_SCALE,
    clamp,
    normalizeColorblindMode,
    clampUiScale,
} from '../public/js/ui/cockpit-theme.js';

// ── Headless DOM and Three.js Mocks ──────────────────────────────────────────

function createMockElement() {
    const styleProperties = {};
    const attributes = {};

    return {
        style: {
            setProperty(key, val) {
                styleProperties[key] = String(val);
            },
            getPropertyValue(key) {
                return styleProperties[key];
            },
            _properties: styleProperties,
        },
        setAttribute(attr, val) {
            attributes[attr] = String(val);
        },
        getAttribute(attr) {
            return attributes[attr];
        },
        _attributes: attributes,
    };
}

function createMockThree() {
    class Color {
        constructor(hex = 0) {
            this.hex = hex;
        }
        setHex(hex) {
            this.hex = hex;
            return this;
        }
        set(hex) {
            this.hex = hex;
            return this;
        }
    }

    class Material {
        constructor(opts = {}) {
            this.color = opts.color !== undefined ? new Color(opts.color) : new Color(0xffffff);
        }
    }

    class Object3D {
        constructor() {
            this.children = [];
            this.material = null;
            this.userData = {};
            this.name = '';
        }
        add(...objs) {
            this.children.push(...objs);
            return this;
        }
        traverse(cb) {
            cb(this);
            for (const child of this.children) {
                if (child.traverse) child.traverse(cb);
            }
        }
    }

    class Mesh extends Object3D {
        constructor(geo, mat) {
            super();
            this.material = mat;
        }
    }

    return {
        Color,
        Material,
        Mesh,
        Object3D,
    };
}

describe('Cockpit Live Theme & Accessibility Applicator', () => {
    describe('Palettes & Utility Helpers', () => {
        it('exports all 4 required colorblind mode palettes', () => {
            assert.deepEqual(COLORBLIND_MODES, ['default', 'deuteranopia', 'tritanopia', 'high-contrast']);
            for (const mode of COLORBLIND_MODES) {
                const palette = THEME_PALETTES[mode];
                assert.ok(palette, `Palette for ${mode} should exist`);
                assert.equal(palette.id, mode);
                assert.ok(palette.cssVars, 'CSS variables defined');
                assert.ok(palette.threeMaterials, 'Three.js materials defined');

                // Check crucial CSS vars
                assert.ok(palette.cssVars['--bg']);
                assert.ok(palette.cssVars['--panel']);
                assert.ok(palette.cssVars['--ink']);
                assert.ok(palette.cssVars['--accent']);
                assert.ok(palette.cssVars['--ok']);
                assert.ok(palette.cssVars['--warn']);
                assert.ok(palette.cssVars['--bad']);

                // Check Three.js material definitions
                assert.ok(typeof palette.threeMaterials.dangerCrimson === 'number');
                assert.ok(typeof palette.threeMaterials.weakpointEmerald === 'number');
                assert.ok(typeof palette.threeMaterials.mineBeacon === 'number');
                assert.ok(typeof palette.threeMaterials.rapidsColor === 'number');
                assert.ok(typeof palette.threeMaterials.whirlpoolDeep === 'number');
            }
        });

        it('normalizes invalid or unknown colorblind modes to default', () => {
            assert.equal(normalizeColorblindMode('default'), 'default');
            assert.equal(normalizeColorblindMode('DEUTERANOPIA'), 'deuteranopia');
            assert.equal(normalizeColorblindMode('  tritanopia  '), 'tritanopia');
            assert.equal(normalizeColorblindMode('high-contrast'), 'high-contrast');
            assert.equal(normalizeColorblindMode('unknown_mode'), 'default');
            assert.equal(normalizeColorblindMode(null), 'default');
            assert.equal(normalizeColorblindMode(undefined), 'default');
            assert.equal(normalizeColorblindMode(123), 'default');
        });

        it('clamps UI scale strictly within 0.85x to 1.25x', () => {
            assert.equal(clampUiScale(1.0), 1.0);
            assert.equal(clampUiScale(0.85), 0.85);
            assert.equal(clampUiScale(1.25), 1.25);
            assert.equal(clampUiScale(0.5), 0.85); // Below min
            assert.equal(clampUiScale(2.0), 1.25); // Above max
            assert.equal(clampUiScale(NaN), 1.0);  // Invalid
            assert.equal(clampUiScale('invalid'), 1.0);
        });

        it('clamp utility handles edge cases and finite check', () => {
            assert.equal(clamp(5, 0, 10), 5);
            assert.equal(clamp(-5, 0, 10), 0);
            assert.equal(clamp(15, 0, 10), 10);
            assert.equal(clamp(NaN, 2, 8), 2);
        });
    });

    describe('DOM & CSS Variables Theme Application', () => {
        it('applies default theme CSS vars and attributes to target element on init', () => {
            const el = createMockElement();
            const applicator = createCockpitThemeApplicator({
                targetElement: el,
                initialConfig: {
                    colorblindMode: 'default',
                    uiScale: 1.0,
                    reducedMotion: false,
                },
            });

            const state = applicator.getState();
            assert.equal(state.colorblindMode, 'default');
            assert.equal(state.uiScale, 1.0);
            assert.equal(state.reducedMotion, false);

            assert.equal(el.style.getPropertyValue('--bg'), '#0b0e13');
            assert.equal(el.style.getPropertyValue('--accent'), '#5eead4');
            assert.equal(el.style.getPropertyValue('--ui-scale'), '1');
            assert.equal(el.getAttribute('data-colorblind'), 'default');
            assert.equal(el.getAttribute('data-ui-scale'), '1');
            assert.equal(el.getAttribute('data-reduced-motion'), 'false');
        });

        it('switches to deuteranopia, tritanopia, and high-contrast in real time', () => {
            const el = createMockElement();
            const applicator = createCockpitThemeApplicator({ targetElement: el });

            // 1. Deuteranopia
            applicator.applyLiveSettings({ colorblindMode: 'deuteranopia' });
            assert.equal(applicator.getState().colorblindMode, 'deuteranopia');
            assert.equal(el.style.getPropertyValue('--accent'), '#38bdf8');
            assert.equal(el.style.getPropertyValue('--bad'), '#f97316'); // Orange vermilion
            assert.equal(el.getAttribute('data-colorblind'), 'deuteranopia');

            // 2. Tritanopia
            applicator.applyLiveSettings({ colorblindMode: 'tritanopia' });
            assert.equal(applicator.getState().colorblindMode, 'tritanopia');
            assert.equal(el.style.getPropertyValue('--accent'), '#2dd4bf');
            assert.equal(el.style.getPropertyValue('--warn'), '#f43f5e'); // Rose
            assert.equal(el.getAttribute('data-colorblind'), 'tritanopia');

            // 3. High Contrast
            applicator.applyLiveSettings({ colorblindMode: 'high-contrast' });
            assert.equal(applicator.getState().colorblindMode, 'high-contrast');
            assert.equal(el.style.getPropertyValue('--bg'), '#000000');
            assert.equal(el.style.getPropertyValue('--accent'), '#00ffff');
            assert.equal(el.style.getPropertyValue('--ok'), '#00ff66');
            assert.equal(el.style.getPropertyValue('--line'), '#ffffff');
            assert.equal(el.getAttribute('data-colorblind'), 'high-contrast');
        });

        it('updates UI scale and reduced-motion attributes dynamically', () => {
            const el = createMockElement();
            const applicator = createCockpitThemeApplicator({ targetElement: el });

            applicator.applyLiveSettings({ uiScale: 1.2, reducedMotion: true });
            assert.equal(applicator.getState().uiScale, 1.2);
            assert.equal(applicator.getState().reducedMotion, true);

            assert.equal(el.style.getPropertyValue('--ui-scale'), '1.2');
            assert.equal(el.getAttribute('data-ui-scale'), '1.2');
            assert.equal(el.getAttribute('data-reduced-motion'), 'true');

            // Clamp check during live update
            applicator.applyLiveSettings({ uiScale: 1.99 });
            assert.equal(applicator.getState().uiScale, 1.25);
            assert.equal(el.style.getPropertyValue('--ui-scale'), '1.25');

            applicator.applyLiveSettings({ uiScale: 0.1 });
            assert.equal(applicator.getState().uiScale, 0.85);
            assert.equal(el.style.getPropertyValue('--ui-scale'), '0.85');
        });
    });

    describe('Three.js Hazard & Boss Telegraph Real-Time Material Sync', () => {
        it('syncs boss telegraph danger rings and weakpoints when colorblind mode changes', () => {
            const THREE = createMockThree();
            const el = createMockElement();

            // Mock Boss Telegraph VFX structure
            const mockVfx = {
                dangerRingPool: [
                    { outerMat: new THREE.Material({ color: 0xff1744 }), innerMat: new THREE.Material({ color: 0xff5252 }) },
                    { outerMat: new THREE.Material({ color: 0xff1744 }), innerMat: new THREE.Material({ color: 0xff5252 }) },
                ],
                weakpointPool: [
                    {
                        outerMat: new THREE.Material({ color: 0x00ff88 }),
                        innerMat: new THREE.Material({ color: 0x69f0ae }),
                        tickMat: new THREE.Material({ color: 0x00e5ff }),
                    },
                ],
            };

            const applicator = createCockpitThemeApplicator({
                targetElement: el,
                threeContext: { THREE, bossTelegraphVFX: mockVfx },
            });

            // Initial (default)
            assert.equal(mockVfx.dangerRingPool[0].outerMat.color.hex, THEME_PALETTES.default.threeMaterials.dangerCrimson);
            assert.equal(mockVfx.weakpointPool[0].outerMat.color.hex, THEME_PALETTES.default.threeMaterials.weakpointEmerald);

            // Change to Deuteranopia: Danger rings should become vermilion/orange and weakpoints blue
            applicator.applyLiveSettings({ colorblindMode: 'deuteranopia' });
            assert.equal(mockVfx.dangerRingPool[0].outerMat.color.hex, THEME_PALETTES.deuteranopia.threeMaterials.dangerCrimson);
            assert.equal(mockVfx.weakpointPool[0].outerMat.color.hex, THEME_PALETTES.deuteranopia.threeMaterials.weakpointEmerald);
            assert.equal(mockVfx.weakpointPool[0].tickMat.color.hex, THEME_PALETTES.deuteranopia.threeMaterials.weakpointCyan);

            // Change to Tritanopia
            applicator.applyLiveSettings({ colorblindMode: 'tritanopia' });
            assert.equal(mockVfx.dangerRingPool[0].outerMat.color.hex, THEME_PALETTES.tritanopia.threeMaterials.dangerCrimson);
            assert.equal(mockVfx.weakpointPool[0].outerMat.color.hex, THEME_PALETTES.tritanopia.threeMaterials.weakpointEmerald);

            // Change to High Contrast
            applicator.applyLiveSettings({ colorblindMode: 'high-contrast' });
            assert.equal(mockVfx.dangerRingPool[0].outerMat.color.hex, THEME_PALETTES['high-contrast'].threeMaterials.dangerCrimson);
            assert.equal(mockVfx.weakpointPool[0].outerMat.color.hex, THEME_PALETTES['high-contrast'].threeMaterials.weakpointEmerald);
        });

        it('syncs river hazards (rapids, whirlpools, mines, ramps, coin rings)', () => {
            const THREE = createMockThree();
            const el = createMockElement();

            // Mock River Hazards structure
            const mockRapids = new THREE.Object3D();
            mockRapids.userData = {
                shaderMat: {
                    uniforms: {
                        uColor: { value: new THREE.Color(0x7df9ff) },
                    },
                },
                chevronArrows: [
                    new THREE.Mesh(null, new THREE.Material({ color: 0x38f2ff })),
                ],
            };

            const mockWhirlpool = new THREE.Object3D();
            mockWhirlpool.userData = {
                shaderMat: {
                    uniforms: {
                        uDeepColor: { value: new THREE.Color(0x021727) },
                        uMidColor: { value: new THREE.Color(0x09597c) },
                        uFoamColor: { value: new THREE.Color(0x9bf5ff) },
                    },
                },
            };

            const mockMine = new THREE.Object3D();
            mockMine.userData = {
                beaconMat: new THREE.Material({ color: 0xff2222 }),
                auraMat: new THREE.Material({ color: 0xff3333 }),
            };

            const mockCoinRing = new THREE.Object3D();
            mockCoinRing.userData = {
                torusMesh: new THREE.Mesh(null, new THREE.Material({ color: 0xffd700 })),
            };

            const mockHazardsHandle = {
                rapidsMeshes: [mockRapids],
                whirlpoolMeshes: [mockWhirlpool],
                mineMeshes: [mockMine],
                coinRingMeshes: [mockCoinRing],
                rampMeshes: [],
            };

            const applicator = createCockpitThemeApplicator({
                targetElement: el,
                threeContext: { THREE, hazardsHandle: mockHazardsHandle },
            });

            // Switch to Deuteranopia
            applicator.applyLiveSettings({ colorblindMode: 'deuteranopia' });
            const dPalette = THEME_PALETTES.deuteranopia.threeMaterials;

            assert.equal(mockRapids.userData.shaderMat.uniforms.uColor.value.hex, dPalette.rapidsColor);
            assert.equal(mockRapids.userData.chevronArrows[0].material.color.hex, dPalette.rapidsChevron);
            assert.equal(mockWhirlpool.userData.shaderMat.uniforms.uDeepColor.value.hex, dPalette.whirlpoolDeep);
            assert.equal(mockWhirlpool.userData.shaderMat.uniforms.uMidColor.value.hex, dPalette.whirlpoolMid);
            assert.equal(mockWhirlpool.userData.shaderMat.uniforms.uFoamColor.value.hex, dPalette.whirlpoolFoam);
            assert.equal(mockMine.userData.beaconMat.color.hex, dPalette.mineBeacon);
            assert.equal(mockMine.userData.auraMat.color.hex, dPalette.mineAura);
            assert.equal(mockCoinRing.userData.torusMesh.material.color.hex, dPalette.coinRingGold);

            // Switch to High Contrast
            applicator.applyLiveSettings({ colorblindMode: 'high-contrast' });
            const hcPalette = THEME_PALETTES['high-contrast'].threeMaterials;
            assert.equal(mockMine.userData.beaconMat.color.hex, hcPalette.mineBeacon);
            assert.equal(mockCoinRing.userData.torusMesh.material.color.hex, hcPalette.coinRingGold);
        });

        it('supports late binding of Three.js context via setThreeContext', () => {
            const THREE = createMockThree();
            const el = createMockElement();

            const applicator = createCockpitThemeApplicator({
                targetElement: el,
                initialConfig: { colorblindMode: 'tritanopia' },
            });

            const mockMine = new THREE.Object3D();
            mockMine.userData = {
                beaconMat: new THREE.Material({ color: 0xff2222 }),
                auraMat: new THREE.Material({ color: 0xff3333 }),
            };

            // Bind after creation
            applicator.setThreeContext({
                THREE,
                hazardsHandle: { mineMeshes: [mockMine] },
            });

            const tPalette = THEME_PALETTES.tritanopia.threeMaterials;
            assert.equal(mockMine.userData.beaconMat.color.hex, tPalette.mineBeacon);
            assert.equal(mockMine.userData.auraMat.color.hex, tPalette.mineAura);
        });

        it('disposes cleanly without throwing', () => {
            const applicator = createCockpitThemeApplicator();
            assert.doesNotThrow(() => applicator.dispose());
        });
    });
});
