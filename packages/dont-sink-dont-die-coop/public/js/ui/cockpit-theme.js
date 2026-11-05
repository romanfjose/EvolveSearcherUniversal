/**
 * Don't Sink, Don't Die — Live CSS Cockpit Accessibility & Colorblind Theme Applicator
 *
 * Implements Helmet 01 directives for real-time cockpit accessibility:
 * - Colorblind themes: 'default', 'deuteranopia', 'tritanopia', 'high-contrast'.
 * - UI Scale: Clamped smoothly between 0.85x and 1.25x.
 * - Reduced Motion: Instantly suppresses HUD animations, screen-fx wobbles, and smooth transitions.
 * - Real-Time Three.js Hazard & Telegraph Material sync: Mutates material colors and shader uniforms
 *   directly in-place with ZERO page reloads or scene-graph rebuilds.
 *
 * Zero external CDN dependencies, fully headless-friendly for Node test suites.
 */

// ── COLOR THEMES & PALETTES ─────────────────────────────────────────────────

export const THEME_PALETTES = {
    default: {
        id: 'default',
        name: 'Default Synthwave',
        cssVars: {
            '--bg': '#0b0e13',
            '--panel': 'rgba(17, 22, 30, 0.86)',
            '--panel-2': '#161c26',
            '--line': '#232b38',
            '--line-2': '#2f3a4b',
            '--ink': '#e6ebf2',
            '--muted': '#8d99ab',
            '--faint': '#5f6b7d',
            '--accent': '#5eead4',
            '--ok': '#4ade80',
            '--warn': '#fbbf24',
            '--bad': '#f87171',
            '--danger-glow': 'rgba(248, 113, 113, 0.4)',
            '--accent-glow': 'rgba(94, 234, 212, 0.35)',
        },
        threeMaterials: {
            // Telegraphs
            dangerCrimson: 0xff1744,
            dangerCore: 0xff5252,
            weakpointEmerald: 0x00ff88,
            weakpointCore: 0x69f0ae,
            weakpointCyan: 0x00e5ff,
            barnacleAmber: 0xffab00,
            // Hazards
            mineBeacon: 0xff2222,
            mineAura: 0xff3333,
            rapidsColor: 0x7df9ff,
            rapidsChevron: 0x38f2ff,
            whirlpoolDeep: 0x021727,
            whirlpoolMid: 0x09597c,
            whirlpoolFoam: 0x9bf5ff,
            coinRingGold: 0xffd700,
            rampWarning: 0xffcc00,
        },
    },

    deuteranopia: {
        id: 'deuteranopia',
        name: 'Deuteranopia (Red-Green Safe)',
        // Replaces confusing red/green with high-contrast cobalt blue and vibrant gold/amber
        cssVars: {
            '--bg': '#080d16',
            '--panel': 'rgba(14, 21, 33, 0.90)',
            '--panel-2': '#162030',
            '--line': '#243247',
            '--line-2': '#334460',
            '--ink': '#f1f5f9',
            '--muted': '#94a3b8',
            '--faint': '#64748b',
            '--accent': '#38bdf8', // Sky blue
            '--ok': '#38bdf8',     // Clear blue for safe/ok
            '--warn': '#fbbf24',   // Bright amber
            '--bad': '#f97316',    // Warm vermilion / orange
            '--danger-glow': 'rgba(249, 115, 22, 0.45)',
            '--accent-glow': 'rgba(56, 189, 248, 0.4)',
        },
        threeMaterials: {
            dangerCrimson: 0xf97316, // Orange/vermilion instead of red
            dangerCore: 0xfdba74,
            weakpointEmerald: 0x0284c7, // Vibrant cerulean blue instead of green
            weakpointCore: 0x7dd3fc,
            weakpointCyan: 0x38bdf8,
            barnacleAmber: 0xf59e0b,
            mineBeacon: 0xf97316,
            mineAura: 0xfb923c,
            rapidsColor: 0x38bdf8,
            rapidsChevron: 0x0284c7,
            whirlpoolDeep: 0x031526,
            whirlpoolMid: 0x074169,
            whirlpoolFoam: 0xbae6fd,
            coinRingGold: 0xfbbf24,
            rampWarning: 0xf59e0b,
        },
    },

    tritanopia: {
        id: 'tritanopia',
        name: 'Tritanopia (Blue-Yellow Safe)',
        // Replaces blue/yellow with distinct magenta/cyan and clear teal/crimson
        cssVars: {
            '--bg': '#120a16',
            '--panel': 'rgba(26, 16, 32, 0.90)',
            '--panel-2': '#23162b',
            '--line': '#392446',
            '--line-2': '#4c315e',
            '--ink': '#f8fafc',
            '--muted': '#a78bfa',
            '--faint': '#7c3aed',
            '--accent': '#2dd4bf', // Teal
            '--ok': '#2dd4bf',     // Crisp teal
            '--warn': '#f43f5e',   // Vivid rose
            '--bad': '#e11d48',    // Deep ruby
            '--danger-glow': 'rgba(225, 29, 72, 0.45)',
            '--accent-glow': 'rgba(45, 212, 191, 0.4)',
        },
        threeMaterials: {
            dangerCrimson: 0xe11d48, // Ruby/crimson
            dangerCore: 0xf43f5e,
            weakpointEmerald: 0x2dd4bf, // Teal
            weakpointCore: 0x99f6e4,
            weakpointCyan: 0x14b8a6,
            barnacleAmber: 0xd946ef, // Fuchsia instead of yellow
            mineBeacon: 0xe11d48,
            mineAura: 0xf43f5e,
            rapidsColor: 0x2dd4bf,
            rapidsChevron: 0x14b8a6,
            whirlpoolDeep: 0x1c0b24,
            whirlpoolMid: 0x4a1d63,
            whirlpoolFoam: 0x99f6e4,
            coinRingGold: 0xf472b6, // Pinkish-gold
            rampWarning: 0xd946ef,
        },
    },

    'high-contrast': {
        id: 'high-contrast',
        name: 'High Contrast (WCAG AAA Ultra)',
        // Pitch black backgrounds, pure crisp whites, maximum contrast borders and neon indicators
        cssVars: {
            '--bg': '#000000',
            '--panel': 'rgba(0, 0, 0, 0.96)',
            '--panel-2': '#0a0a0a',
            '--line': '#ffffff',
            '--line-2': '#e2e8f0',
            '--ink': '#ffffff',
            '--muted': '#e2e8f0',
            '--faint': '#cbd5e1',
            '--accent': '#00ffff', // Pure cyan
            '--ok': '#00ff66',     // Ultra bright green
            '--warn': '#ffff00',   // Pure yellow
            '--bad': '#ff1744',    // Vivid warning red
            '--danger-glow': 'rgba(255, 23, 68, 0.7)',
            '--accent-glow': 'rgba(0, 255, 255, 0.6)',
        },
        threeMaterials: {
            dangerCrimson: 0xff0044,
            dangerCore: 0xffffff,
            weakpointEmerald: 0x00ff66,
            weakpointCore: 0xffffff,
            weakpointCyan: 0x00ffff,
            barnacleAmber: 0xffff00,
            mineBeacon: 0xff0044,
            mineAura: 0xff0044,
            rapidsColor: 0x00ffff,
            rapidsChevron: 0xffffff,
            whirlpoolDeep: 0x000000,
            whirlpoolMid: 0x002244,
            whirlpoolFoam: 0xffffff,
            coinRingGold: 0xffff00,
            rampWarning: 0xffff00,
        },
    },
};

export const COLORBLIND_MODES = ['default', 'deuteranopia', 'tritanopia', 'high-contrast'];
export const MIN_UI_SCALE = 0.85;
export const MAX_UI_SCALE = 1.25;

export const DEFAULT_THEME_CONFIG = {
    colorblindMode: 'default',
    uiScale: 1.0,
    reducedMotion: false,
};

// ── UTILITIES ───────────────────────────────────────────────────────────────

export function clamp(val, min, max) {
    if (!Number.isFinite(val)) return min;
    return Math.max(min, Math.min(max, val));
}

export function normalizeColorblindMode(mode) {
    if (typeof mode !== 'string') return 'default';
    const key = mode.toLowerCase().trim();
    return COLORBLIND_MODES.includes(key) ? key : 'default';
}

export function clampUiScale(scale) {
    const s = Number(scale);
    if (!Number.isFinite(s)) return 1.0;
    return Number(clamp(s, MIN_UI_SCALE, MAX_UI_SCALE).toFixed(2));
}

// ── LIVE THEME APPLICATOR ───────────────────────────────────────────────────

/**
 * Creates and manages live accessibility theme settings across DOM CSS variables
 * and Three.js scene materials without page reloads.
 *
 * @param {object} [options]
 * @param {HTMLElement|Document} [options.targetElement] - DOM target (default document.documentElement)
 * @param {object} [options.threeContext] - Optional Three.js context / handles:
 *        { hazardsHandle, bossTelegraphVFX, scene, THREE }
 * @param {object} [options.initialConfig] - Initial config settings overrides
 */
export function createCockpitThemeApplicator(options = {}) {
    const target = options.targetElement || (typeof document !== 'undefined' ? document.documentElement : null);
    let threeContext = options.threeContext || {};

    let state = {
        colorblindMode: normalizeColorblindMode(options.initialConfig?.colorblindMode),
        uiScale: clampUiScale(options.initialConfig?.uiScale ?? 1.0),
        reducedMotion: Boolean(options.initialConfig?.reducedMotion),
    };

    // Style element for dynamic reduced motion rules if in DOM
    let dynamicStyleEl = null;
    if (typeof document !== 'undefined' && document.head && document.createElement) {
        dynamicStyleEl = document.getElementById('cockpit-live-theme-styles');
        if (!dynamicStyleEl) {
            dynamicStyleEl = document.createElement('style');
            dynamicStyleEl.id = 'cockpit-live-theme-styles';
            document.head.appendChild(dynamicStyleEl);
        }
    }

    /**
     * Updates root CSS variables and data attributes for current state.
     */
    function applyCssTheme() {
        if (!target) return;

        const palette = THEME_PALETTES[state.colorblindMode] || THEME_PALETTES.default;

        // 1. Apply CSS Variables
        if (target.style && typeof target.style.setProperty === 'function') {
            for (const [varName, varVal] of Object.entries(palette.cssVars)) {
                target.style.setProperty(varName, varVal);
            }
            target.style.setProperty('--ui-scale', String(state.uiScale));
            target.style.setProperty('--cockpit-scale', String(state.uiScale));
        }

        // 2. Set root accessibility attributes
        if (typeof target.setAttribute === 'function') {
            target.setAttribute('data-colorblind', state.colorblindMode);
            target.setAttribute('data-ui-scale', String(state.uiScale));
            target.setAttribute('data-reduced-motion', String(state.reducedMotion));
        }

        // 3. Inject / Update Reduced Motion and UI Scale style rules
        if (dynamicStyleEl) {
            let css = `
                :root {
                    --ui-scale: ${state.uiScale};
                }
                #hud, #ui, #wave-panel, #scoreboard, #tactical-minimap-root, #instructions {
                    transform-origin: top left;
                }
            `;

            if (state.reducedMotion) {
                css += `
                    *, *::before, *::after {
                        animation-duration: 0.001ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.001ms !important;
                        scroll-behavior: auto !important;
                    }
                    .pop { animation: none !important; }
                    #toast { transition: none !important; }
                `;
            }

            dynamicStyleEl.textContent = css;
        }
    }

    /**
     * Updates color values in a Three.js material or color object.
     */
    function updateThreeColor(colorObj, hexVal, THREE) {
        if (!colorObj) return;
        if (typeof colorObj.setHex === 'function') {
            colorObj.setHex(hexVal);
        } else if (typeof colorObj.set === 'function') {
            colorObj.set(hexVal);
        } else if (THREE && THREE.Color) {
            colorObj = new THREE.Color(hexVal);
        }
    }

    /**
     * Syncs Three.js hazard and telegraph materials to match active colorblind palette.
     */
    function applyThreeMaterials(customContext) {
        const ctx = customContext || threeContext;
        if (!ctx) return;

        const palette = THEME_PALETTES[state.colorblindMode] || THEME_PALETTES.default;
        const colors = palette.threeMaterials;
        const THREE = ctx.THREE;

        // 1. Sync Boss Telegraph VFX (Danger Rings, Weakpoint Reticles, Banners)
        const vfx = ctx.bossTelegraphVFX;
        if (vfx) {
            if (vfx.dangerRingPool) {
                for (const ring of vfx.dangerRingPool) {
                    if (ring.outerMat?.color) {
                        updateThreeColor(ring.outerMat.color, colors.dangerCrimson, THREE);
                    }
                    if (ring.innerMat?.color) {
                        updateThreeColor(ring.innerMat.color, colors.dangerCore, THREE);
                    }
                }
            }

            if (vfx.weakpointPool) {
                for (const wp of vfx.weakpointPool) {
                    if (wp.outerMat?.color) {
                        updateThreeColor(wp.outerMat.color, colors.weakpointEmerald, THREE);
                    }
                    if (wp.innerMat?.color) {
                        updateThreeColor(wp.innerMat.color, colors.weakpointCore, THREE);
                    }
                    if (wp.tickMat?.color) {
                        updateThreeColor(wp.tickMat.color, colors.weakpointCyan, THREE);
                    }
                }
            }
        }

        // 2. Sync River Hazards Meshes (Rapids, Whirlpools, Mines, Coin Rings)
        const hazards = ctx.hazardsHandle;
        if (hazards) {
            // Rapids meshes
            for (const rMesh of hazards.rapidsMeshes || []) {
                const u = rMesh.userData?.shaderMat?.uniforms;
                if (u?.uColor?.value) {
                    updateThreeColor(u.uColor.value, colors.rapidsColor, THREE);
                }
                const arrows = rMesh.userData?.chevronArrows || [];
                for (const arr of arrows) {
                    arr.traverse?.((child) => {
                        if (child.material?.color) {
                            updateThreeColor(child.material.color, colors.rapidsChevron, THREE);
                        }
                    });
                }
            }

            // Whirlpool meshes
            for (const wMesh of hazards.whirlpoolMeshes || []) {
                const u = wMesh.userData?.shaderMat?.uniforms;
                if (u?.uDeepColor?.value) {
                    updateThreeColor(u.uDeepColor.value, colors.whirlpoolDeep, THREE);
                }
                if (u?.uMidColor?.value) {
                    updateThreeColor(u.uMidColor.value, colors.whirlpoolMid, THREE);
                }
                if (u?.uFoamColor?.value) {
                    updateThreeColor(u.uFoamColor.value, colors.whirlpoolFoam, THREE);
                }
            }

            // Mine meshes
            for (const mMesh of hazards.mineMeshes || []) {
                if (mMesh.userData?.beaconMat?.color) {
                    updateThreeColor(mMesh.userData.beaconMat.color, colors.mineBeacon, THREE);
                }
                if (mMesh.userData?.auraMat?.color) {
                    updateThreeColor(mMesh.userData.auraMat.color, colors.mineAura, THREE);
                }
            }

            // Ramp warning stripes
            for (const rMesh of hazards.rampMeshes || []) {
                rMesh.traverse?.((child) => {
                    if (child.name === 'lipStrip' || child.userData?.isWarning) {
                        if (child.material?.color) {
                            updateThreeColor(child.material.color, colors.rampWarning, THREE);
                        }
                    }
                });
            }

            // Coin rings
            for (const cMesh of hazards.coinRingMeshes || []) {
                if (cMesh.userData?.torusMesh?.material?.color) {
                    updateThreeColor(cMesh.userData.torusMesh.material.color, colors.coinRingGold, THREE);
                }
            }
        }
    }

    /**
     * Applies all settings live in real time.
     *
     * @param {object} [partialSettings] - Partial or complete accessibility settings
     *        { colorblindMode, uiScale, reducedMotion }
     */
    function applyLiveSettings(partialSettings = {}) {
        if (partialSettings.colorblindMode !== undefined) {
            state.colorblindMode = normalizeColorblindMode(partialSettings.colorblindMode);
        }
        if (partialSettings.uiScale !== undefined) {
            state.uiScale = clampUiScale(partialSettings.uiScale);
        }
        if (partialSettings.reducedMotion !== undefined) {
            state.reducedMotion = Boolean(partialSettings.reducedMotion);
        }

        applyCssTheme();
        applyThreeMaterials();

        return structuredClone(state);
    }

    /**
     * Registers or updates Three.js hazard and telegraph handles.
     */
    function setThreeContext(newContext = {}) {
        threeContext = { ...threeContext, ...newContext };
        applyThreeMaterials();
    }

    /**
     * Cleanup and disposal of injected styles.
     */
    function dispose() {
        if (dynamicStyleEl && dynamicStyleEl.parentNode) {
            dynamicStyleEl.parentNode.removeChild(dynamicStyleEl);
            dynamicStyleEl = null;
        }
    }

    // Run initial apply
    applyCssTheme();
    applyThreeMaterials();

    return {
        getState: () => structuredClone(state),
        getActivePalette: () => structuredClone(THEME_PALETTES[state.colorblindMode] || THEME_PALETTES.default),
        applyLiveSettings,
        setThreeContext,
        applyCssTheme,
        applyThreeMaterials,
        dispose,
    };
}
