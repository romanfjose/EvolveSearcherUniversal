import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    COCKPIT_DENSITY_CONFIG,
    COCKPIT_ELEMENT_SPECS,
    COCKPIT_DENSITY_CSS,
    computeAutoScalingFactor,
    calculateHudArea,
    computeCockpitDensity,
    isUnderDensityBudget,
    evaluateTabTelemetryKey,
    createCockpitDensityManager,
} from '../public/js/ui/cockpit-density.js';

describe('Cockpit Density Manager & [Tab] Telemetry Toggle (Helmet 01)', () => {
    describe('Configuration and Specs', () => {
        it('enforces Helmet 01 11% default and 18% expanded HUD coverage ceilings', () => {
            assert.equal(COCKPIT_DENSITY_CONFIG.DEFAULT_MAX_COVERAGE_RATIO, 0.11);
            assert.equal(COCKPIT_DENSITY_CONFIG.EXPANDED_MAX_COVERAGE_RATIO, 0.18);
            assert.equal(COCKPIT_DENSITY_CONFIG.HOTKEY, 'Tab');
        });

        it('defines primary vitals that jump out in <1 second', () => {
            assert.deepEqual(COCKPIT_DENSITY_CONFIG.PRIMARY_ELEMENTS, [
                'hull-hp',
                'coins',
                'wave-progress',
                'quickbuy-hotbar',
            ]);
        });

        it('defines secondary telemetry and debug elements hidden by default', () => {
            assert.ok(COCKPIT_DENSITY_CONFIG.SECONDARY_ELEMENTS.includes('speed-knots'));
            assert.ok(COCKPIT_DENSITY_CONFIG.SECONDARY_ELEMENTS.includes('velocity-ms'));
            assert.ok(COCKPIT_DENSITY_CONFIG.SECONDARY_ELEMENTS.includes('heading-deg'));
            assert.ok(COCKPIT_DENSITY_CONFIG.SECONDARY_ELEMENTS.includes('waterline-alt'));
            assert.ok(COCKPIT_DENSITY_CONFIG.SECONDARY_ELEMENTS.includes('threat-count'));
            assert.ok(COCKPIT_DENSITY_CONFIG.SECONDARY_ELEMENTS.includes('crew-scoreboard'));
        });

        it('specifies element dimensions with compact default and expanded states', () => {
            const hud = COCKPIT_ELEMENT_SPECS['primary-hud'];
            assert.ok(hud.defaultHeight < hud.expandedHeight);
            assert.equal(COCKPIT_ELEMENT_SPECS['scoreboard'].visibleInDefault, false);
            assert.equal(COCKPIT_ELEMENT_SPECS['scoreboard'].visibleInExpanded, true);
        });
    });

    describe('Pure Area and Density Calculations', () => {
        const canonicalViewports = [
            { name: 'desktop-fhd', width: 1920, height: 1080 },
            { name: 'desktop-wxga-plus', width: 1440, height: 900 },
            { name: 'desktop-fwxga', width: 1366, height: 768 },
            { name: 'desktop-hd', width: 1280, height: 720 },
            { name: 'mobile-landscape', width: 844, height: 390 },
            { name: 'mobile-portrait', width: 390, height: 844 },
        ];

        it('guarantees default HUD coverage stays below 11% across ALL canonical viewports', () => {
            for (const vp of canonicalViewports) {
                const report = computeCockpitDensity({
                    viewportWidth: vp.width,
                    viewportHeight: vp.height,
                    expanded: false,
                });

                assert.ok(
                    report.isUnderBudget,
                    `Expected default coverage for ${vp.name} (${report.coveragePercent.toFixed(2)}%) to be <= 11%`
                );
                assert.ok(report.coverageRatio <= 0.11);
                assert.equal(report.expanded, false);
                assert.equal(report.targetLimit, 0.11);
            }
        });

        it('guarantees expanded HUD coverage stays below 18% across ALL canonical viewports', () => {
            for (const vp of canonicalViewports) {
                const report = computeCockpitDensity({
                    viewportWidth: vp.width,
                    viewportHeight: vp.height,
                    expanded: true,
                });

                assert.ok(
                    report.isUnderBudget,
                    `Expected expanded coverage for ${vp.name} (${report.coveragePercent.toFixed(2)}%) to be <= 18%`
                );
                assert.ok(report.coverageRatio <= 0.18);
                assert.equal(report.expanded, true);
                assert.equal(report.targetLimit, 0.18);
            }
        });

        it('computeAutoScalingFactor computes appropriate scale factor for small screens', () => {
            const desktopScale = computeAutoScalingFactor(1920, 1080, false);
            assert.equal(desktopScale, 1.0);

            const mobileScale = computeAutoScalingFactor(844, 390, false);
            assert.ok(mobileScale > 0.5 && mobileScale <= 1.0);
            assert.ok(mobileScale <= 0.85);
        });

        it('isUnderDensityBudget correctly validates boundaries', () => {
            assert.equal(isUnderDensityBudget(0.10, 0.11), true);
            assert.equal(isUnderDensityBudget(0.11, 0.11), true);
            assert.equal(isUnderDensityBudget(0.1101, 0.11), false);
            assert.equal(isUnderDensityBudget(0.15, 0.18), true);
            assert.equal(isUnderDensityBudget(0.19, 0.18), false);
            assert.equal(isUnderDensityBudget(null), false);
        });
    });

    describe('Keyboard Event Evaluation ([Tab] hotkey)', () => {
        it('detects Tab keydown and keyup events', () => {
            const tabDown = evaluateTabTelemetryKey({ key: 'Tab', type: 'keydown' });
            assert.equal(tabDown.isTab, true);
            assert.equal(tabDown.isKeydown, true);

            const tabUp = evaluateTabTelemetryKey({ key: 'Tab', type: 'keyup' });
            assert.equal(tabUp.isTab, true);
            assert.equal(tabUp.isKeydown, false);
        });

        it('detects Tab event when code is Tab', () => {
            const ev = evaluateTabTelemetryKey({ code: 'Tab', type: 'keydown' });
            assert.equal(ev.isTab, true);
        });

        it('ignores other keys like Space, Enter, Escape, or W', () => {
            assert.equal(evaluateTabTelemetryKey({ key: 'Space', type: 'keydown' }).isTab, false);
            assert.equal(evaluateTabTelemetryKey({ key: 'Escape', type: 'keydown' }).isTab, false);
            assert.equal(evaluateTabTelemetryKey({ key: 'w', type: 'keydown' }).isTab, false);
            assert.equal(evaluateTabTelemetryKey(null).isTab, false);
        });
    });

    describe('CSS and Visual Hierarchy Rules', () => {
        it('includes zero scrollbar (overflow: hidden, 100vh) styling', () => {
            assert.ok(COCKPIT_DENSITY_CSS.includes('overflow: hidden !important'));
            assert.ok(COCKPIT_DENSITY_CSS.includes('height: 100vh !important'));
            assert.ok(COCKPIT_DENSITY_CSS.includes('width: 100vw !important'));
        });

        it('includes tabular-nums font-variant alignment rule', () => {
            assert.ok(COCKPIT_DENSITY_CSS.includes('font-variant-numeric: tabular-nums !important'));
        });

        it('includes high-contrast styles for Hull HP and Coins', () => {
            assert.ok(COCKPIT_DENSITY_CSS.includes('#health'));
            assert.ok(COCKPIT_DENSITY_CSS.includes('#coins'));
            assert.ok(COCKPIT_DENSITY_CSS.includes('#distance'));
        });

        it('hides secondary telemetry and scoreboard in default mode', () => {
            assert.ok(COCKPIT_DENSITY_CSS.includes('body:not(.cockpit-telemetry-expanded) #ui .kpis'));
            assert.ok(COCKPIT_DENSITY_CSS.includes('display: none !important'));
            assert.ok(COCKPIT_DENSITY_CSS.includes('body.cockpit-telemetry-expanded #ui .kpis'));
        });
    });

    describe('DOM Controller Lifecycle & Mock Harness', () => {
        let fakeDoc, fakeWin;

        beforeEach(() => {
            const listeners = {};
            const classList = new Set();
            const elements = {};

            fakeDoc = {
                getElementById: (id) => elements[id] || null,
                createElement: (tag) => {
                    const el = {
                        tagName: tag.toUpperCase(),
                        id: '',
                        className: '',
                        innerHTML: '',
                        textContent: '',
                        style: {},
                        parentNode: null,
                        children: [],
                        appendChild(child) {
                            child.parentNode = this;
                            this.children.push(child);
                            if (child.id) elements[child.id] = child;
                            return child;
                        },
                        removeChild(child) {
                            const idx = this.children.indexOf(child);
                            if (idx >= 0) this.children.splice(idx, 1);
                            child.parentNode = null;
                            if (child.id) delete elements[child.id];
                            return child;
                        },
                        remove() {
                            if (this.parentNode && typeof this.parentNode.removeChild === 'function') {
                                this.parentNode.removeChild(this);
                            }
                        },
                    };
                    return el;
                },
                head: {
                    appendChild(c) { c.parentNode = this; },
                    removeChild(c) { c.parentNode = null; },
                },
                body: {
                    classList: {
                        add: (c) => classList.add(c),
                        remove: (c) => classList.delete(c),
                        contains: (c) => classList.has(c),
                    },
                    appendChild(c) { c.parentNode = this; },
                    removeChild(c) { c.parentNode = null; },
                },
            };

            const uiPanel = fakeDoc.createElement('div');
            uiPanel.id = 'ui';
            fakeDoc.body.appendChild(uiPanel);
            elements['ui'] = uiPanel;

            fakeWin = {
                innerWidth: 1920,
                innerHeight: 1080,
                addEventListener: (type, cb) => {
                    listeners[type] = listeners[type] || [];
                    listeners[type].push(cb);
                },
                removeEventListener: (type, cb) => {
                    if (!listeners[type]) return;
                    listeners[type] = listeners[type].filter((l) => l !== cb);
                },
                dispatchKeyEvent: (type, key) => {
                    const handlers = listeners[type] || [];
                    let prevented = false;
                    for (const h of handlers) {
                        h({
                            type,
                            key,
                            preventDefault: () => { prevented = true; },
                        });
                    }
                    return prevented;
                },
            };

            globalThis.document = fakeDoc;
            globalThis.window = fakeWin;
        });

        afterEach(() => {
            delete globalThis.document;
            delete globalThis.window;
        });

        it('initializes in compact default mode (<11% coverage) without expanded class', () => {
            const manager = createCockpitDensityManager();
            assert.equal(manager.isTelemetryExpanded(), false);
            assert.equal(fakeDoc.body.classList.contains('cockpit-telemetry-expanded'), false);

            const report = manager.getDensityReport();
            assert.ok(report.isUnderBudget);
            assert.ok(report.coveragePercent <= 11.0);
            manager.dispose();
        });

        it('expands telemetry when holding [Tab] and restores on release', () => {
            let stateChanges = [];
            const manager = createCockpitDensityManager({
                onStateChange: (state) => stateChanges.push(state.expanded),
            });

            // Keydown Tab
            const preventedDown = fakeWin.dispatchKeyEvent('keydown', 'Tab');
            assert.equal(preventedDown, true);
            assert.equal(manager.isTelemetryExpanded(), true);
            assert.equal(fakeDoc.body.classList.contains('cockpit-telemetry-expanded'), true);
            assert.deepEqual(stateChanges, [true]);

            // Keyup Tab
            const preventedUp = fakeWin.dispatchKeyEvent('keyup', 'Tab');
            assert.equal(preventedUp, true);
            assert.equal(manager.isTelemetryExpanded(), false);
            assert.equal(fakeDoc.body.classList.contains('cockpit-telemetry-expanded'), false);
            assert.deepEqual(stateChanges, [true, false]);

            manager.dispose();
        });

        it('allows programmatic toggling and explicit setTelemetryExpanded', () => {
            const manager = createCockpitDensityManager();
            manager.toggleTelemetry();
            assert.equal(manager.isTelemetryExpanded(), true);

            manager.setTelemetryExpanded(false);
            assert.equal(manager.isTelemetryExpanded(), false);

            manager.dispose();
        });

        it('cleanly disposes DOM elements and event listeners', () => {
            const manager = createCockpitDensityManager();
            manager.dispose();

            // Dispatching Tab after dispose should not affect body class
            fakeWin.dispatchKeyEvent('keydown', 'Tab');
            assert.equal(fakeDoc.body.classList.contains('cockpit-telemetry-expanded'), false);
        });
    });
});
