import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    AUDITOR_VIEWPORTS,
    DEFAULT_HUD_SPEC,
    checkBoundingBoxIntersection,
    computeHudBoundingBoxes,
    checkHudCollisions,
    computeHudAreaRatio,
    computeCompactScalingFactor,
    auditViewportLayout,
    auditAllViewports,
} from '../shared/hud-layout-auditor.js';

describe('Multi-Resolution 100vh Viewport Matrix & HUD Collision Auditor', () => {
    describe('Canonical Viewport Matrix Specification', () => {
        it('includes all 6 required desktop and mobile viewports', () => {
            const requiredDimensions = [
                { width: 1920, height: 1080 },
                { width: 1440, height: 900 },
                { width: 1366, height: 768 },
                { width: 1280, height: 720 },
                { width: 844, height: 390 },
                { width: 390, height: 844 },
            ];

            for (const req of requiredDimensions) {
                const found = AUDITOR_VIEWPORTS.find((vp) => vp.width === req.width && vp.height === req.height);
                assert.ok(found, `Expected canonical viewport ${req.width}x${req.height} to be registered`);
            }
            assert.equal(AUDITOR_VIEWPORTS.length, 6);
        });

        it('has valid DEFAULT_HUD_SPEC constraints', () => {
            assert.equal(DEFAULT_HUD_SPEC.maxHudAreaRatio, 0.18);
            assert.equal(DEFAULT_HUD_SPEC.scoreboard.hideBelowWidth, 860);
            assert.ok(DEFAULT_HUD_SPEC.hud.baseWidth > 0);
            assert.ok(DEFAULT_HUD_SPEC.waveBanner.baseHeight > 0);
            assert.ok(DEFAULT_HUD_SPEC.minimap.baseHeight > 0);
            assert.ok(DEFAULT_HUD_SPEC.instructions.baseHeight > 0);
        });
    });

    describe('Bounding Box Intersection Mathematics', () => {
        it('detects overlapping axis-aligned bounding boxes', () => {
            const boxA = { left: 10, top: 10, right: 100, bottom: 100 };
            const boxB = { left: 50, top: 50, right: 150, bottom: 150 };

            const res = checkBoundingBoxIntersection(boxA, boxB);
            assert.equal(res.intersects, true);
            assert.equal(res.overlapWidth, 50);
            assert.equal(res.overlapHeight, 50);
        });

        it('returns false for adjacent/touching boxes without penetration', () => {
            const boxA = { left: 0, top: 0, right: 100, bottom: 100 };
            const boxB = { left: 100, top: 0, right: 200, bottom: 100 };

            const res = checkBoundingBoxIntersection(boxA, boxB);
            assert.equal(res.intersects, false);
            assert.equal(res.overlapWidth, 0);
            assert.equal(res.overlapHeight, 0);
        });

        it('returns false for completely disjoint boxes', () => {
            const boxA = { left: 0, top: 0, right: 50, bottom: 50 };
            const boxB = { left: 200, top: 200, right: 300, bottom: 300 };

            const res = checkBoundingBoxIntersection(boxA, boxB);
            assert.equal(res.intersects, false);
        });

        it('handles null or missing boxes gracefully', () => {
            assert.equal(checkBoundingBoxIntersection(null, null).intersects, false);
            assert.equal(checkBoundingBoxIntersection({ left: 0, top: 0, right: 10, bottom: 10 }, null).intersects, false);
        });
    });

    describe('HUD Panel Bounding Boxes Calculation', () => {
        it('computes accurate coordinates for desktop 1920x1080', () => {
            const boxes = computeHudBoundingBoxes(1920, 1080, 1.0);

            // 1. #hud at top-left
            assert.ok(boxes['#hud']);
            assert.equal(boxes['#hud'].left, 12);
            assert.equal(boxes['#hud'].top, 12);
            assert.equal(boxes['#hud'].width, 236);
            assert.equal(boxes['#hud'].height, 180);
            assert.equal(boxes['#hud'].visible, true);

            // 2. #scoreboard at top-right
            assert.ok(boxes['#scoreboard']);
            assert.equal(boxes['#scoreboard'].right, 1920 - 12);
            assert.equal(boxes['#scoreboard'].top, 12);
            assert.equal(boxes['#scoreboard'].width, 290);
            assert.equal(boxes['#scoreboard'].height, 140);
            assert.equal(boxes['#scoreboard'].visible, true);

            // 3. #wave-banner at center top
            assert.ok(boxes['#wave-banner']);
            assert.equal(boxes['#wave-banner'].top, 12);
            assert.equal(boxes['#wave-banner'].width, 400);
            assert.equal(boxes['#wave-banner'].left, (1920 - 400) / 2);

            // 4. #tactical-minimap-root at bottom-right
            assert.ok(boxes['#tactical-minimap-root']);
            assert.equal(boxes['#tactical-minimap-root'].right, 1920 - 16);
            assert.equal(boxes['#tactical-minimap-root'].bottom, 1080 - 54);
            assert.equal(boxes['#tactical-minimap-root'].width, 238);
            assert.equal(boxes['#tactical-minimap-root'].height, 240);

            // 5. #instructions at bottom-center
            assert.ok(boxes['#instructions']);
            assert.equal(boxes['#instructions'].bottom, 1080 - 12);
            assert.equal(boxes['#instructions'].width, 540);
            assert.equal(boxes['#instructions'].left, (1920 - 540) / 2);
        });

        it('hides scoreboard and moves wave-panel to bottom on mobile width <= 860px', () => {
            const boxes = computeHudBoundingBoxes(844, 390, 1.0);

            assert.equal(boxes['#scoreboard'].visible, false);
            assert.equal(boxes['#wave-banner'].left, 12);
            assert.equal(boxes['#wave-banner'].bottom, 390 - 64);
        });
    });

    describe('Zero Collision Invariant across Canonical Viewports', () => {
        for (const vp of AUDITOR_VIEWPORTS) {
            it(`guarantees zero bounding-box collisions under dynamic compact scaling for ${vp.name} (${vp.width}x${vp.height})`, () => {
                const audit = auditViewportLayout(vp);

                assert.ok(audit.passed, `Audit failed for ${vp.name}: hasCollision=${audit.dynamic.hasCollision}, areaPercent=${audit.dynamic.areaPercent.toFixed(2)}%`);
                assert.equal(audit.dynamic.hasCollision, false, `Expected zero HUD collisions on ${vp.name}`);
                assert.equal(audit.dynamic.collisions.length, 0);

                // Verify pairwise between active elements
                const boxes = audit.dynamic.boxes;
                const panelKeys = ['#hud', '#wave-banner', '#tactical-minimap-root', '#instructions'];
                if (boxes['#scoreboard'].visible) panelKeys.push('#scoreboard');

                for (let i = 0; i < panelKeys.length; i++) {
                    for (let j = i + 1; j < panelKeys.length; j++) {
                        const a = boxes[panelKeys[i]];
                        const b = boxes[panelKeys[j]];
                        const inter = checkBoundingBoxIntersection(a, b);
                        assert.equal(
                            inter.intersects,
                            false,
                            `Collision detected between ${panelKeys[i]} and ${panelKeys[j]} in ${vp.name}: ${inter.overlapWidth}x${inter.overlapHeight}px`
                        );
                    }
                }
            });
        }
    });

    describe('HUD Area Budget (< 18% Viewport Area)', () => {
        for (const vp of AUDITOR_VIEWPORTS) {
            it(`guarantees total HUD area stays under 18% for ${vp.name} (${vp.width}x${vp.height})`, () => {
                const audit = auditViewportLayout(vp);

                assert.ok(
                    audit.dynamic.areaRatio <= 0.18,
                    `Expected area ratio <= 0.18 on ${vp.name}, got ${audit.dynamic.areaRatio} (${audit.dynamic.areaPercent.toFixed(2)}%)`
                );
                assert.ok(audit.dynamic.scale > 0 && audit.dynamic.scale <= 1.0);
            });
        }

        it('computeCompactScalingFactor reduces scale when unscaled area exceeds 18%', () => {
            // Mobile landscape 844x390 has total area 329,160px.
            // At scale 1.0, unscaled HUD area would be > 18%
            const res = computeCompactScalingFactor(844, 390, { maxHudAreaRatio: 0.18 });

            assert.equal(res.valid, true);
            assert.ok(res.scale < 1.0, `Expected scale to shrink below 1.0, got ${res.scale}`);
            assert.ok(res.areaRatio <= 0.18);
            assert.equal(res.hasCollision, false);
        });

        it('leaves scale at 1.0 for large desktop FHD 1920x1080', () => {
            const res = computeCompactScalingFactor(1920, 1080, { maxHudAreaRatio: 0.18 });

            assert.equal(res.valid, true);
            assert.equal(res.scale, 1.0);
            assert.ok(res.areaRatio < 0.10);
            assert.equal(res.hasCollision, false);
        });
    });

    describe('Suite Auditor (auditAllViewports)', () => {
        it('runs auditAllViewports and passes all 6 canonical resolutions', () => {
            const result = auditAllViewports();

            assert.equal(result.allPassed, true);
            assert.equal(result.summary.total, 6);
            assert.equal(result.summary.passed, 6);
            assert.equal(result.summary.failed, 0);
            assert.equal(result.reports.length, 6);

            for (const r of result.reports) {
                assert.equal(r.passed, true);
                assert.equal(r.dynamic.hasCollision, false);
                assert.ok(r.dynamic.areaPercent <= 18.0);
            }
        });

        it('detects artificial collision when custom specs force an overlap', () => {
            const collidingSpec = {
                waveBanner: {
                    ...DEFAULT_HUD_SPEC.waveBanner,
                    desktopTop: 12,
                    minWidth: 1600,
                    maxWidth: 1800, // Forces wave banner into #hud and #scoreboard
                },
            };

            const report = auditViewportLayout({ width: 1280, height: 720, name: 'forced-collide' }, { spec: collidingSpec });
            assert.equal(report.unscaled.hasCollision, true);
            assert.ok(report.unscaled.collisions.length > 0);
        });
    });
});
