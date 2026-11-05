import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    PRIMARY_GAMEPLAY_ACTIONS,
    HUD_COLOR_TOKENS,
    HUD_CONTRAST_PAIRS,
    hexToRgb,
    srgbToLinear,
    calculateRelativeLuminance,
    calculateContrastRatio,
    verifyContrastRatios,
    verifyActionErgonomics,
    verifyHudOcclusion,
    auditCockpitErgonomics,
} from '../shared/cockpit-ergonomics.js';
import { DEFAULT_KEYMAP } from '../shared/input-math.js';

describe('Helmet 01 — Cockpit Ergonomics & Contrast Auditor', () => {
    describe('WCAG 2.1 Luminance and Contrast Ratio Mathematics', () => {
        it('parses 6-char, 3-char, and unhashed hex strings to RGB correctly', () => {
            assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
            assert.deepEqual(hexToRgb('#000000'), [0, 0, 0]);
            assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
            assert.deepEqual(hexToRgb('5eead4'), [94, 234, 212]);
            assert.deepEqual(hexToRgb('#0b0e13'), [11, 14, 19]);
            assert.deepEqual(hexToRgb(null), [0, 0, 0]);
            assert.deepEqual(hexToRgb('invalid'), [0, 0, 0]);
        });

        it('computes sRGB linear expansion according to WCAG 2.1 piecewise curve', () => {
            assert.equal(srgbToLinear(0), 0);
            assert.equal(srgbToLinear(255), 1);
            // Low threshold check (<= 0.04045):
            const lowVal = srgbToLinear(5);
            assert.ok(lowVal > 0 && lowVal < 0.01);
            // Higher values:
            const midVal = srgbToLinear(128);
            assert.ok(midVal > 0.2 && midVal < 0.25);
        });

        it('calculates accurate relative luminance for pure black, pure white, and pure primaries', () => {
            const lumWhite = calculateRelativeLuminance(255, 255, 255);
            const lumBlack = calculateRelativeLuminance(0, 0, 0);
            assert.equal(lumWhite, 1);
            assert.equal(lumBlack, 0);

            // Accepts arrays and hex strings
            assert.equal(calculateRelativeLuminance([255, 255, 255]), 1);
            assert.equal(calculateRelativeLuminance('#000000'), 0);
        });

        it('computes known WCAG contrast ratios (black on white = 21:1, identical colors = 1:1)', () => {
            const bwContrast = calculateContrastRatio('#ffffff', '#000000');
            assert.equal(bwContrast, 21);

            const sameContrast = calculateContrastRatio('#123456', '#123456');
            assert.equal(sameContrast, 1);
        });
    });

    describe('HUD Color Palette & WCAG AA Contrast Verification (>= 4.5:1)', () => {
        it('verifies all canonical HUD color tokens are defined and valid hex colors', () => {
            for (const [key, color] of Object.entries(HUD_COLOR_TOKENS)) {
                assert.ok(typeof color === 'string', `Token ${key} must be a string`);
                assert.ok(color.startsWith('#'), `Token ${key} must be a hex color string`);
                const [r, g, b] = hexToRgb(color);
                assert.ok(r >= 0 && r <= 255);
                assert.ok(g >= 0 && g <= 255);
                assert.ok(b >= 0 && b <= 255);
            }
        });

        it('verifies all canonical HUD text/background pairs pass WCAG AA (>= 4.5:1)', () => {
            const report = verifyContrastRatios(HUD_CONTRAST_PAIRS, 4.5);

            assert.equal(report.passed, true, `Expected all contrast checks to pass, failed: ${report.failedCount}`);
            assert.equal(report.failedCount, 0);
            assert.ok(report.totalTested >= 10);
            assert.equal(report.passedCount, report.totalTested);

            for (const detail of report.details) {
                assert.ok(
                    detail.actualRatio >= 4.5,
                    `Pair "${detail.label}" failed AA: actual ratio ${detail.actualRatio} < 4.5:1`
                );
                assert.equal(detail.passed, true);
            }
        });

        it('detects low contrast pairs and fails the report when below 4.5:1', () => {
            const failingPairs = [
                {
                    id: 'bad_pair',
                    label: 'Unreadable Dark Gray on Black',
                    fg: '#222222',
                    bg: '#111111',
                    minRatio: 4.5,
                },
            ];

            const report = verifyContrastRatios(failingPairs, 4.5);
            assert.equal(report.passed, false);
            assert.equal(report.failedCount, 1);
            assert.equal(report.passedCount, 0);
            assert.equal(report.details[0].passed, false);
            assert.ok(report.details[0].actualRatio < 4.5);
        });
    });

    describe('1-Touch / Single Keystroke Cockpit Action Ergonomics', () => {
        it('defines all 8 primary gameplay actions', () => {
            assert.equal(PRIMARY_GAMEPLAY_ACTIONS.length, 8);
            const expectedActionKeys = [
                'forward',
                'backward',
                'turnLeft',
                'turnRight',
                'jump',
                'attack',
                'block',
                'shop',
            ];

            for (const expectedKey of expectedActionKeys) {
                const found = PRIMARY_GAMEPLAY_ACTIONS.find((a) => a.actionKey === expectedKey);
                assert.ok(found, `Expected action ${expectedKey} to be present in PRIMARY_GAMEPLAY_ACTIONS`);
                assert.equal(found.requiredMaxInputCost, 1);
            }
        });

        it('asserts <= 1 keystroke / click cost for all 8 primary actions under default keybindings', () => {
            const report = verifyActionErgonomics(DEFAULT_KEYMAP);

            assert.equal(report.passed, true);
            assert.equal(report.totalActions, 8);
            assert.equal(report.passedCount, 8);
            assert.equal(report.failedCount, 0);

            for (const actionReport of report.actionReports) {
                assert.equal(actionReport.inputCost, 1);
                assert.equal(actionReport.passed, true);
                assert.ok(actionReport.mappedKeys.length > 0);
            }
        });

        it('detects unmapped or missing action in keymap and reports failure', () => {
            const brokenKeymap = {
                ...DEFAULT_KEYMAP,
                shop: [], // Unmapped / requires extra steps
            };

            const report = verifyActionErgonomics(brokenKeymap);
            assert.equal(report.passed, false);
            assert.equal(report.failedCount, 1);

            const shopAction = report.actionReports.find((a) => a.actionKey === 'shop');
            assert.ok(shopAction);
            assert.equal(shopAction.passed, false);
            assert.equal(shopAction.inputCost, Infinity);
        });
    });

    describe('Cockpit HUD Occlusion on 1440x900 Viewport (< 15%)', () => {
        it('verifies HUD occlusion on canonical 1440x900 viewport remains strictly < 15%', () => {
            const report = verifyHudOcclusion({ width: 1440, height: 900 }, 0.15);

            assert.equal(report.passed, true);
            assert.ok(
                report.occlusionRatio < 0.15,
                `Expected occlusion ratio < 0.15, got ${report.occlusionRatio} (${report.occlusionPercent}%)`
            );
            assert.equal(report.viewport.width, 1440);
            assert.equal(report.viewport.height, 900);
            assert.ok(report.totalHudArea > 0);
            assert.equal(report.viewportArea, 1440 * 900);
            assert.ok(report.boxes['#hud'].visible);
            assert.ok(report.boxes['#scoreboard'].visible);
            assert.ok(report.boxes['#wave-banner'].visible);
            assert.ok(report.boxes['#tactical-minimap-root'].visible);
            assert.ok(report.boxes['#instructions'].visible);
        });

        it('fails occlusion check if custom spec inflates panels beyond 15%', () => {
            const bloatedSpec = {
                hud: {
                    baseWidth: 600,
                    baseHeight: 500,
                    margin: { top: 12, left: 12 },
                },
            };

            const report = verifyHudOcclusion({ width: 1440, height: 900 }, 0.15, bloatedSpec);
            assert.equal(report.passed, false);
            assert.ok(report.occlusionRatio > 0.15);
        });
    });

    describe('Unified Helmet 01 Cockpit Ergonomics Audit (auditCockpitErgonomics)', () => {
        it('runs complete audit and passes all three Helmet 01 gates', () => {
            const audit = auditCockpitErgonomics();

            assert.equal(audit.passed, true);
            assert.equal(audit.summary.contrastPassed, true);
            assert.equal(audit.summary.ergonomicsPassed, true);
            assert.equal(audit.summary.occlusionPassed, true);

            assert.ok(audit.contrast.details.length >= 10);
            assert.equal(audit.ergonomics.totalActions, 8);
            assert.ok(audit.occlusion.occlusionRatio < 0.15);
        });

        it('fails master audit when contrast threshold is set unrealistically high (e.g. 25:1)', () => {
            const audit = auditCockpitErgonomics({ minContrastRatio: 25.0 });

            assert.equal(audit.passed, false);
            assert.equal(audit.summary.contrastPassed, false);
            assert.equal(audit.summary.ergonomicsPassed, true);
            assert.equal(audit.summary.occlusionPassed, true);
        });

        it('fails master audit when occlusion ceiling is too tight (e.g. 5%)', () => {
            const audit = auditCockpitErgonomics({ maxOcclusionRatio: 0.05 });

            assert.equal(audit.passed, false);
            assert.equal(audit.summary.occlusionPassed, false);
        });
    });
});
