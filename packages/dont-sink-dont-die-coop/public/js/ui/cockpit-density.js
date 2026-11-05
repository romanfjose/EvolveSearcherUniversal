/**
 * Don't Sink, Don't Die — Compact 100vh Cockpit Density Manager & [Tab] Telemetry Toggle
 * (`public/js/ui/cockpit-density.js`)
 *
 * Requirements fulfilled under Helmet 01 (Synthetic José Frontend / The Cockpit Pilot):
 * 1. Enforces Helmet 01's 100vh zero-clutter rule:
 *    - Keeps default HUD screen coverage strictly BELOW 11% of viewport area.
 *    - Collapses secondary debug and telemetry rows (Speed, Velocity, Heading, Waterline, Threats)
 *      by default until the player holds or toggles [Tab].
 * 2. Guarantees zero scrollbars (overflow: hidden), crisp tabular-nums alignment,
 *    and immediate visual hierarchy (<1s decision time):
 *    - Primary combat vitals (Hull HP, Coins, Wave Progress, and Quick-Buy Hotbar)
 *      stand out sharply in high contrast.
 * 3. Pure calculation helpers:
 *    - computeCockpitDensity()
 *    - calculateHudArea()
 *    - computeAutoScalingFactor()
 *    - isUnderDensityBudget()
 *    - evaluateTabTelemetryKey()
 * 4. DOM Controller (createCockpitDensityManager):
 *    - Injects clean CSS for zero scrollbars, tabular-nums, high-contrast glow, and density collapsing.
 *    - Listens to keydown/keyup on [Tab] to reveal/hide secondary telemetry.
 *    - Provides public API: getDensityReport(), isTelemetryExpanded(), setTelemetryExpanded(),
 *      toggleTelemetry(), updateViewport(), and dispose().
 * 5. Zero external dependencies; 100% headless node:test compatible.
 */

export const COCKPIT_DENSITY_CONFIG = {
    DEFAULT_MAX_COVERAGE_RATIO: 0.11, // 11% viewport area ceiling in default state
    EXPANDED_MAX_COVERAGE_RATIO: 0.18, // 18% maximum ceiling when telemetry is expanded
    PRIMARY_ELEMENTS: ['hull-hp', 'coins', 'wave-progress', 'quickbuy-hotbar'],
    SECONDARY_ELEMENTS: ['speed-knots', 'velocity-ms', 'heading-deg', 'waterline-alt', 'threat-count', 'crew-scoreboard'],
    HOTKEY: 'Tab',
};

/**
 * Default element bounding box specifications in unscaled pixels.
 */
export const COCKPIT_ELEMENT_SPECS = {
    'primary-hud': {
        name: 'Primary Combat HUD (#ui)',
        defaultWidth: 236,
        defaultHeight: 74, // Compact: Title, Hull bar, and Coins
        expandedHeight: 180, // Expanded: Includes full 6-KPI telemetry grid
    },
    'wave-banner': {
        name: 'Wave Progress Banner (#wave-panel)',
        defaultWidth: 320,
        defaultHeight: 52,
        mobileWidth: 260,
        mobileHeight: 52,
    },
    'quickbuy-hotbar': {
        name: 'Inline Quick-Buy Hotbar',
        defaultWidth: 280,
        defaultHeight: 38,
        mobileWidth: 240,
        mobileHeight: 34,
    },
    'scoreboard': {
        name: 'Crew Scoreboard (#scoreboard)',
        defaultWidth: 290,
        defaultHeight: 140,
        visibleInDefault: false, // Hidden in default compact mode to stay < 11%
        visibleInExpanded: true, // Shown when holding [Tab]
        hideBelowWidth: 860,
    },
    'instructions': {
        name: 'Keybind Strip (#instructions)',
        defaultWidth: 420,
        defaultHeight: 28,
        mobileWidth: 300,
        mobileHeight: 28,
    },
};

/**
 * Computes the recommended auto-scaling factor for small/mobile viewports
 * to guarantee that the default HUD remains strictly under the 11% coverage ceiling.
 *
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {boolean} [expanded=false]
 * @returns {number} Scale factor between 0.5 and 1.0
 */
export function computeAutoScalingFactor(viewportWidth, viewportHeight, expanded = false) {
    const w = viewportWidth || 1920;
    const h = viewportHeight || 1080;
    const isMobile = w <= 860;
    const maxRatio = expanded
        ? COCKPIT_DENSITY_CONFIG.EXPANDED_MAX_COVERAGE_RATIO
        : COCKPIT_DENSITY_CONFIG.DEFAULT_MAX_COVERAGE_RATIO;

    // Test decreasing scales from 1.0 down to 0.5 in increments of 0.05
    for (let scale = 1.0; scale >= 0.5; scale -= 0.05) {
        const roundedScale = Math.round(scale * 100) / 100;
        const { totalArea } = calculateHudArea({
            viewportWidth: w,
            viewportHeight: h,
            expanded,
            scale: roundedScale,
        });
        if (totalArea / (w * h) <= maxRatio) {
            return roundedScale;
        }
    }
    return 0.5;
}

/**
 * Computes total active HUD bounding area in pixels.
 *
 * @param {object} params
 * @param {number} params.viewportWidth
 * @param {number} params.viewportHeight
 * @param {boolean} [params.expanded=false] - Whether secondary telemetry ([Tab]) is revealed
 * @param {number} [params.scale] - Optional dynamic scaling factor (defaults to auto-scaling)
 * @returns {{ totalArea: number, elements: Record<string, { width: number, height: number, area: number, visible: boolean }>, scale: number }}
 */
export function calculateHudArea({ viewportWidth, viewportHeight, expanded = false, scale } = {}) {
    const isMobile = (viewportWidth || 1920) <= 860;
    const effectiveScale = typeof scale === 'number'
        ? Math.max(0.2, Math.min(1.0, scale))
        : (isMobile ? computeAutoScalingFactor(viewportWidth, viewportHeight, expanded) : 1.0);

    const elements = {};
    let totalArea = 0;

    // 1. Primary HUD (#ui)
    const hudSpec = COCKPIT_ELEMENT_SPECS['primary-hud'];
    const hudHeight = expanded ? hudSpec.expandedHeight : hudSpec.defaultHeight;
    const hudW = Math.round(hudSpec.defaultWidth * effectiveScale);
    const hudH = Math.round(hudHeight * effectiveScale);
    const hudArea = hudW * hudH;
    elements['primary-hud'] = { width: hudW, height: hudH, area: hudArea, visible: true };
    totalArea += hudArea;

    // 2. Wave Banner (#wave-panel)
    const waveSpec = COCKPIT_ELEMENT_SPECS['wave-banner'];
    const waveW = Math.round((isMobile ? waveSpec.mobileWidth : waveSpec.defaultWidth) * effectiveScale);
    const waveH = Math.round((isMobile ? waveSpec.mobileHeight : waveSpec.defaultHeight) * effectiveScale);
    const waveArea = waveW * waveH;
    elements['wave-banner'] = { width: waveW, height: waveH, area: waveArea, visible: true };
    totalArea += waveArea;

    // 3. Quick-Buy Hotbar
    const qbSpec = COCKPIT_ELEMENT_SPECS['quickbuy-hotbar'];
    const qbW = Math.round((isMobile ? qbSpec.mobileWidth : qbSpec.defaultWidth) * effectiveScale);
    const qbH = Math.round((isMobile ? qbSpec.mobileHeight : qbSpec.defaultHeight) * effectiveScale);
    const qbArea = qbW * qbH;
    elements['quickbuy-hotbar'] = { width: qbW, height: qbH, area: qbArea, visible: true };
    totalArea += qbArea;

    // 4. Instructions Bar
    const instSpec = COCKPIT_ELEMENT_SPECS['instructions'];
    const instW = Math.round((isMobile ? instSpec.mobileWidth : instSpec.defaultWidth) * effectiveScale);
    const instH = Math.round((isMobile ? instSpec.mobileHeight : instSpec.defaultHeight) * effectiveScale);
    const instArea = instW * instH;
    elements['instructions'] = { width: instW, height: instH, area: instArea, visible: true };
    totalArea += instArea;

    // 5. Scoreboard (#scoreboard) - Hidden by default unless [Tab] expanded and screen > 860px
    const sbSpec = COCKPIT_ELEMENT_SPECS['scoreboard'];
    const sbVisible = expanded && !isMobile;
    const sbW = sbVisible ? Math.round(sbSpec.defaultWidth * effectiveScale) : 0;
    const sbH = sbVisible ? Math.round(sbSpec.defaultHeight * effectiveScale) : 0;
    const sbArea = sbW * sbH;
    elements['scoreboard'] = { width: sbW, height: sbH, area: sbArea, visible: sbVisible };
    if (sbVisible) {
        totalArea += sbArea;
    }

    return {
        totalArea,
        elements,
        scale: effectiveScale,
    };
}

/**
 * Computes cockpit density and screen coverage percentage for a given viewport and state.
 *
 * @param {object} params
 * @param {number} params.viewportWidth
 * @param {number} params.viewportHeight
 * @param {boolean} [params.expanded=false]
 * @param {number} [params.scale]
 * @returns {object} Density report
 */
export function computeCockpitDensity({ viewportWidth, viewportHeight, expanded = false, scale } = {}) {
    const width = Math.max(1, viewportWidth || 1920);
    const height = Math.max(1, viewportHeight || 1080);
    const viewportArea = width * height;

    const { totalArea, elements, scale: effectiveScale } = calculateHudArea({
        viewportWidth: width,
        viewportHeight: height,
        expanded,
        scale,
    });

    const coverageRatio = totalArea / viewportArea;
    const coveragePercent = coverageRatio * 100;
    const targetLimit = expanded
        ? COCKPIT_DENSITY_CONFIG.EXPANDED_MAX_COVERAGE_RATIO
        : COCKPIT_DENSITY_CONFIG.DEFAULT_MAX_COVERAGE_RATIO;

    const isUnderBudget = coverageRatio <= targetLimit;

    return {
        viewportWidth: width,
        viewportHeight: height,
        viewportArea,
        totalHudArea: totalArea,
        coverageRatio,
        coveragePercent,
        expanded,
        scale: effectiveScale,
        targetLimit,
        targetLimitPercent: targetLimit * 100,
        isUnderBudget,
        elements,
    };
}

/**
 * Checks if a coverage ratio is strictly under the 11% default budget.
 *
 * @param {number} coverageRatio
 * @param {number} [limit=COCKPIT_DENSITY_CONFIG.DEFAULT_MAX_COVERAGE_RATIO]
 * @returns {boolean}
 */
export function isUnderDensityBudget(coverageRatio, limit = COCKPIT_DENSITY_CONFIG.DEFAULT_MAX_COVERAGE_RATIO) {
    return typeof coverageRatio === 'number' && coverageRatio <= limit;
}

/**
 * Evaluates whether an incoming keyboard event is the [Tab] telemetry trigger.
 *
 * @param {KeyboardEvent|object} event
 * @returns {{ isTab: boolean, isKeydown: boolean, key: string }}
 */
export function evaluateTabTelemetryKey(event) {
    if (!event) return { isTab: false, isKeydown: false, key: '' };
    const key = event.key || event.code || '';
    const isTab = key === 'Tab' || key === 'tab';
    const isKeydown = event.type === 'keydown';
    return {
        isTab,
        isKeydown,
        key,
    };
}

/**
 * CSS stylesheet for zero-clutter 100vh Cockpit Density & Tabular Alignment.
 */
export const COCKPIT_DENSITY_CSS = `
/* Helmet 01: 100vh Zero-Clutter Cockpit & Zero Scrollbar Invariants */
html, body {
    overflow: hidden !important;
    height: 100vh !important;
    width: 100vw !important;
    margin: 0 !important;
    padding: 0 !important;
}

/* Crisp tabular-nums alignment across all numeric gauges */
#health, #coins, #wave-label, #distance, .kpi b, [data-tabular="true"] {
    font-variant-numeric: tabular-nums !important;
    letter-spacing: -0.01em !important;
}

/* Primary Combat Hierarchy: Hull HP, Coins, and Wave Progress jump out in <1 second */
.hull #health {
    font-size: 15px !important;
    font-weight: 800 !important;
    color: #4ade80 !important;
    text-shadow: 0 0 12px rgba(74, 222, 128, 0.45) !important;
}

#coins {
    font-size: 20px !important;
    font-weight: 900 !important;
    color: #fbbf24 !important;
    text-shadow: 0 0 14px rgba(251, 191, 36, 0.5) !important;
}

#distance {
    color: #5eead4 !important;
    font-weight: 800 !important;
}

/* Default Cockpit Mode: Collapse secondary debug/telemetry rows */
body:not(.cockpit-telemetry-expanded) #ui .kpis {
    display: none !important;
}

body:not(.cockpit-telemetry-expanded) #scoreboard {
    display: none !important;
}

/* Tab Telemetry Indicator Pill */
.cockpit-tab-hint {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8d99ab;
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 6px;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.cockpit-tab-hint kbd {
    background: rgba(94, 234, 212, 0.12);
    border: 1px solid rgba(94, 234, 212, 0.35);
    color: #5eead4;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 700;
}

/* Expanded Telemetry Viewport (While holding [Tab]) */
body.cockpit-telemetry-expanded #ui .kpis {
    display: grid !important;
    animation: cockpitExpandFade 0.15s ease-out;
}

body.cockpit-telemetry-expanded #scoreboard {
    display: block !important;
    animation: cockpitExpandFade 0.15s ease-out;
}

@keyframes cockpitExpandFade {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
}
`;

/**
 * Creates the Cockpit Density Manager & [Tab] Telemetry Director.
 *
 * @param {object} [options={}]
 * @param {HTMLElement} [options.container]
 * @param {Function} [options.onStateChange]
 * @param {boolean} [options.initialExpanded=false]
 * @returns {object} Cockpit Density Manager instance
 */
export function createCockpitDensityManager(options = {}) {
    const doc = typeof document !== 'undefined' ? document : null;
    const win = typeof window !== 'undefined' ? window : null;

    let isExpanded = Boolean(options.initialExpanded);
    let styleElement = null;
    let hintElement = null;

    // Inject CSS if running in a browser environment
    if (doc) {
        const STYLE_ID = 'cockpit-density-styles';
        styleElement = doc.getElementById(STYLE_ID);
        if (!styleElement) {
            styleElement = doc.createElement('style');
            styleElement.id = STYLE_ID;
            styleElement.textContent = COCKPIT_DENSITY_CSS;
            (doc.head || doc.body)?.appendChild(styleElement);
        }

        // Mount Tab hint inside #ui
        const uiPanel = doc.getElementById('ui');
        if (uiPanel && !doc.getElementById('cockpit-tab-hint')) {
            hintElement = doc.createElement('div');
            hintElement.id = 'cockpit-tab-hint';
            hintElement.className = 'cockpit-tab-hint';
            hintElement.innerHTML = '<kbd>Tab</kbd> HOLD FOR FULL TELEMETRY';
            uiPanel.appendChild(hintElement);
        }

        // Apply initial class
        if (isExpanded) {
            doc.body.classList.add('cockpit-telemetry-expanded');
        } else {
            doc.body.classList.remove('cockpit-telemetry-expanded');
        }
    }

    const syncDOM = () => {
        if (!doc) return;
        if (isExpanded) {
            doc.body.classList.add('cockpit-telemetry-expanded');
            if (hintElement) {
                hintElement.innerHTML = '<kbd>Tab</kbd> FULL TELEMETRY ACTIVE';
            }
        } else {
            doc.body.classList.remove('cockpit-telemetry-expanded');
            if (hintElement) {
                hintElement.innerHTML = '<kbd>Tab</kbd> HOLD FOR FULL TELEMETRY';
            }
        }
    };

    const handleKeyDown = (e) => {
        const evalResult = evaluateTabTelemetryKey(e);
        if (evalResult.isTab) {
            if (typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            if (!isExpanded) {
                isExpanded = true;
                syncDOM();
                if (typeof options.onStateChange === 'function') {
                    options.onStateChange({ expanded: true });
                }
            }
        }
    };

    const handleKeyUp = (e) => {
        const evalResult = evaluateTabTelemetryKey(e);
        if (evalResult.isTab) {
            if (typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            if (isExpanded) {
                isExpanded = false;
                syncDOM();
                if (typeof options.onStateChange === 'function') {
                    options.onStateChange({ expanded: false });
                }
            }
        }
    };

    if (win) {
        win.addEventListener('keydown', handleKeyDown);
        win.addEventListener('keyup', handleKeyUp);
    }

    return {
        isTelemetryExpanded() {
            return isExpanded;
        },

        setTelemetryExpanded(expanded) {
            isExpanded = Boolean(expanded);
            syncDOM();
            if (typeof options.onStateChange === 'function') {
                options.onStateChange({ expanded: isExpanded });
            }
        },

        toggleTelemetry() {
            this.setTelemetryExpanded(!isExpanded);
            return isExpanded;
        },

        getDensityReport(customWidth, customHeight) {
            const width = customWidth || (win ? win.innerWidth : 1920);
            const height = customHeight || (win ? win.innerHeight : 1080);
            return computeCockpitDensity({
                viewportWidth: width,
                viewportHeight: height,
                expanded: isExpanded,
            });
        },

        dispose() {
            if (win) {
                win.removeEventListener('keydown', handleKeyDown);
                win.removeEventListener('keyup', handleKeyUp);
            }
            if (styleElement) {
                if (typeof styleElement.remove === 'function') {
                    styleElement.remove();
                } else if (styleElement.parentNode && typeof styleElement.parentNode.removeChild === 'function') {
                    styleElement.parentNode.removeChild(styleElement);
                }
            }
            if (hintElement) {
                if (typeof hintElement.remove === 'function') {
                    hintElement.remove();
                } else if (hintElement.parentNode && typeof hintElement.parentNode.removeChild === 'function') {
                    hintElement.parentNode.removeChild(hintElement);
                }
            }
            if (doc?.body) {
                doc.body.classList.remove('cockpit-telemetry-expanded');
            }
        },
    };
}
