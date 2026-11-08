import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLUTTER_BUDGET_LIMITS,
    evaluateSceneClutterBudget,
} from '../shared/frustum-clutter-budget.js';

describe('Sovereign Core & Helmet 04: Frustum Clutter Budget', () => {
    describe('CLUTTER_BUDGET_LIMITS', () => {
        it('exports exact hard caps as specified by Helmet 04', () => {
            assert.equal(CLUTTER_BUDGET_LIMITS.maxVisibleMeshes, 2400);
            assert.equal(CLUTTER_BUDGET_LIMITS.maxActiveParticles, 120);
            assert.equal(CLUTTER_BUDGET_LIMITS.maxSimultaneousPopups, 3);
            assert.equal(CLUTTER_BUDGET_LIMITS.maxHudFootprintRatio, 0.08);
        });

        it('is frozen to prevent runtime mutation', () => {
            assert.ok(Object.isFrozen(CLUTTER_BUDGET_LIMITS));
        });
    });

    describe('evaluateSceneClutterBudget() defaults and baseline', () => {
        it('returns withinBudget: true and full scale factors with empty arguments', () => {
            const result = evaluateSceneClutterBudget();
            assert.deepEqual(result, {
                withinBudget: true,
                meshScaleFactor: 1.0,
                particleThrottleRatio: 1.0,
                allowNewPopup: true,
            });
        });

        it('returns withinBudget: true when parameters are comfortably within limits', () => {
            const result = evaluateSceneClutterBudget({
                visibleMeshes: 1200,
                activeParticles: 60,
                activePopups: 2,
                hudFootprintRatio: 0.05,
            });
            assert.equal(result.withinBudget, true);
            assert.equal(result.meshScaleFactor, 1.0);
            assert.equal(result.particleThrottleRatio, 1.0);
            assert.equal(result.allowNewPopup, true);
        });

        it('handles exact boundary values at maximum limits', () => {
            const result = evaluateSceneClutterBudget({
                visibleMeshes: 2400,
                activeParticles: 120,
                activePopups: 3,
                hudFootprintRatio: 0.08,
            });
            assert.equal(result.withinBudget, true);
            assert.equal(result.meshScaleFactor, 1.0);
            assert.equal(result.particleThrottleRatio, 1.0);
            // activePopups === 3 reaches limit, so allowNewPopup should be false
            assert.equal(result.allowNewPopup, false);
        });
    });

    describe('Mesh Clutter Over-Budget & Throttling', () => {
        it('scales mesh factor down proportionally when visibleMeshes exceeds 2400', () => {
            const result = evaluateSceneClutterBudget({
                visibleMeshes: 4800, // 2x budget
                activeParticles: 50,
                activePopups: 1,
                hudFootprintRatio: 0.02,
            });
            assert.equal(result.withinBudget, false);
            assert.equal(result.meshScaleFactor, 0.5);
            assert.equal(result.particleThrottleRatio, 1.0);
            assert.equal(result.allowNewPopup, true);
        });

        it('clamps meshScaleFactor appropriately under extreme mesh counts', () => {
            const result = evaluateSceneClutterBudget({
                visibleMeshes: 24000, // 10x budget
            });
            assert.equal(result.withinBudget, false);
            assert.equal(result.meshScaleFactor, 0.1);
        });
    });

    describe('Particle VFX Over-Budget & Throttling', () => {
        it('throttles particle ratio proportionally when activeParticles exceeds 120', () => {
            const result = evaluateSceneClutterBudget({
                visibleMeshes: 500,
                activeParticles: 240, // 2x budget
                activePopups: 1,
                hudFootprintRatio: 0.04,
            });
            assert.equal(result.withinBudget, false);
            assert.equal(result.particleThrottleRatio, 0.5);
            assert.equal(result.meshScaleFactor, 1.0);
            assert.equal(result.allowNewPopup, true);
        });

        it('throttles particle ratio under extreme particle storms', () => {
            const result = evaluateSceneClutterBudget({
                activeParticles: 1200, // 10x budget
            });
            assert.equal(result.withinBudget, false);
            assert.equal(result.particleThrottleRatio, 0.1);
        });
    });

    describe('Popup & HUD Footprint Occlusion Suppression', () => {
        it('disallows new popups when activePopups >= 3', () => {
            const result = evaluateSceneClutterBudget({
                activePopups: 3,
                hudFootprintRatio: 0.04,
            });
            assert.equal(result.withinBudget, true);
            assert.equal(result.allowNewPopup, false);
        });

        it('marks withinBudget: false when activePopups > 3', () => {
            const result = evaluateSceneClutterBudget({
                activePopups: 4,
            });
            assert.equal(result.withinBudget, false);
            assert.equal(result.allowNewPopup, false);
        });

        it('disallows new popups when hudFootprintRatio >= 0.08', () => {
            const result = evaluateSceneClutterBudget({
                activePopups: 1,
                hudFootprintRatio: 0.08,
            });
            assert.equal(result.withinBudget, true);
            assert.equal(result.allowNewPopup, false);
        });

        it('marks withinBudget: false when hudFootprintRatio exceeds 0.08', () => {
            const result = evaluateSceneClutterBudget({
                activePopups: 1,
                hudFootprintRatio: 0.12,
            });
            assert.equal(result.withinBudget, false);
            assert.equal(result.allowNewPopup, false);
        });
    });

    describe('Input Resilience & Defensive Edge Cases', () => {
        it('handles negative or NaN values safely without crashing or returning NaN', () => {
            const result = evaluateSceneClutterBudget({
                visibleMeshes: -50,
                activeParticles: NaN,
                activePopups: null,
                hudFootprintRatio: undefined,
            });
            assert.equal(result.withinBudget, true);
            assert.equal(result.meshScaleFactor, 1.0);
            assert.equal(result.particleThrottleRatio, 1.0);
            assert.equal(result.allowNewPopup, true);
            assert.ok(!Number.isNaN(result.meshScaleFactor));
            assert.ok(!Number.isNaN(result.particleThrottleRatio));
        });

        it('handles simultaneous multi-parameter breach cleanly', () => {
            const result = evaluateSceneClutterBudget({
                visibleMeshes: 4800,
                activeParticles: 240,
                activePopups: 5,
                hudFootprintRatio: 0.15,
            });
            assert.equal(result.withinBudget, false);
            assert.equal(result.meshScaleFactor, 0.5);
            assert.equal(result.particleThrottleRatio, 0.5);
            assert.equal(result.allowNewPopup, false);
        });
    });
});
