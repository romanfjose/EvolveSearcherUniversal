import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    CUT_DURATION_SEC,
    TOTAL_SHOWCASE_DURATION_SEC,
    SHOWCASE_CUT_IDS,
    ATTRACT_CUTS,
    isAttractDemoRequested,
    calculateCameraOrbit,
    evaluateCutActionTriggers,
    createAttractShowcaseDirector,
    clamp,
    smoothstep,
} from '../shared/attract-showcase.js';

describe('Attract-Mode Showcase Cut Definitions & Constants', () => {
    it('defines 4 high-voltage action cuts matching requirements', () => {
        assert.equal(ATTRACT_CUTS.length, 4);
        assert.equal(CUT_DURATION_SEC, 6.0);
        assert.equal(TOTAL_SHOWCASE_DURATION_SEC, 24.0);

        const cut0 = ATTRACT_CUTS[0];
        assert.equal(cut0.id, SHOWCASE_CUT_IDS.WATERFALL_KICKFLIP);
        assert.equal(cut0.act, 1);
        assert.equal(cut0.biomeName, 'Sunset Canyon');
        assert.equal(cut0.durationSec, 6.0);
        assert.ok(cut0.title.includes('Waterfall Kickflip'));
        assert.ok(cut0.title.includes('Sunset Canyon'));

        const cut1 = ATTRACT_CUTS[1];
        assert.equal(cut1.id, SHOWCASE_CUT_IDS.WAR_MALLET_SMASH);
        assert.equal(cut1.act, 2);
        assert.equal(cut1.biomeName, 'Drowned Harbor');
        assert.equal(cut1.durationSec, 6.0);
        assert.ok(cut1.title.includes('War Mallet Double-Smash'));
        assert.ok(cut1.title.includes('Drowned Harbor'));

        const cut2 = ATTRACT_CUTS[2];
        assert.equal(cut2.id, SHOWCASE_CUT_IDS.DISCO_CRAB_RAVE);
        assert.equal(cut2.act, 3);
        assert.equal(cut2.biomeName, 'Bioluminescent Cavern');
        assert.equal(cut2.durationSec, 6.0);
        assert.ok(cut2.title.includes('Disco Crab Rave'));
        assert.ok(cut2.title.includes('Bioluminescent Cavern'));

        const cut3 = ATTRACT_CUTS[3];
        assert.equal(cut3.id, SHOWCASE_CUT_IDS.KRAKEN_PARRY);
        assert.equal(cut3.act, 4);
        assert.equal(cut3.biomeName, 'Maelstrom Mouth');
        assert.equal(cut3.durationSec, 6.0);
        assert.ok(cut3.title.includes('Dread Kraken Tentacle Parry'));
        assert.ok(cut3.title.includes('Maelstrom Mouth'));
    });

    it('each cut defines camera profile and AI action triggers', () => {
        for (const cut of ATTRACT_CUTS) {
            assert.ok(cut.cameraProfile, `Cut ${cut.id} must define cameraProfile`);
            assert.ok(Number.isFinite(cut.cameraProfile.baseFov));
            assert.ok(Number.isFinite(cut.cameraProfile.targetFov));
            assert.ok(Number.isFinite(cut.cameraProfile.orbitRadius));
            assert.ok(Number.isFinite(cut.riverZ));
            assert.ok(Array.isArray(cut.actionTriggers), `Cut ${cut.id} must define actionTriggers`);
            assert.ok(cut.actionTriggers.length >= 3, `Cut ${cut.id} should have multiple triggers`);
            for (const t of cut.actionTriggers) {
                assert.ok(t.timeSec >= 0 && t.timeSec <= cut.durationSec);
                assert.ok(typeof t.action === 'string');
                assert.ok(typeof t.payload === 'object');
            }
        }
    });
});

describe('Attract Mode Query Param Detection (isAttractDemoRequested)', () => {
    it('returns true for ?demo=1, ?demo=true, ?demo=yes, ?demo', () => {
        assert.equal(isAttractDemoRequested('?demo=1'), true);
        assert.equal(isAttractDemoRequested('https://dontsink.io/?demo=1'), true);
        assert.equal(isAttractDemoRequested('?demo=true'), true);
        assert.equal(isAttractDemoRequested('?demo=yes'), true);
        assert.equal(isAttractDemoRequested('?demo'), true);
    });

    it('returns true for ?attract=1 or ?attract=true', () => {
        assert.equal(isAttractDemoRequested('?attract=1'), true);
        assert.equal(isAttractDemoRequested('?seed=123&attract=true'), true);
    });

    it('returns true for location or URL object inputs', () => {
        assert.equal(isAttractDemoRequested({ search: '?demo=1' }), true);
        assert.equal(isAttractDemoRequested(new URL('http://localhost:3000/?demo=1')), true);
    });

    it('returns false when neither demo nor attract is present', () => {
        assert.equal(isAttractDemoRequested(''), false);
        assert.equal(isAttractDemoRequested('?seed=42'), false);
        assert.equal(isAttractDemoRequested('?demo=0'), false);
        assert.equal(isAttractDemoRequested('?demo=false'), false);
        assert.equal(isAttractDemoRequested(null), false);
        assert.equal(isAttractDemoRequested(undefined), false);
    });
});

describe('Camera Orbit Trajectory Computation', () => {
    it('clamp and smoothstep helper math produce valid bounds', () => {
        assert.equal(clamp(-5, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
        assert.equal(clamp(5, 0, 10), 5);

        assert.equal(smoothstep(0, 1, 0), 0);
        assert.equal(smoothstep(0, 1, 1), 1);
        assert.equal(smoothstep(0, 1, 0.5), 0.5);
    });

    it('calculates smooth, finite 3D orbit trajectory across time for all 4 cuts', () => {
        for (const cut of ATTRACT_CUTS) {
            for (let t = 0; t <= CUT_DURATION_SEC; t += 0.5) {
                const cam = calculateCameraOrbit(cut, t);
                assert.ok(Number.isFinite(cam.eye.x), `eye.x finite for ${cut.id} at t=${t}`);
                assert.ok(Number.isFinite(cam.eye.y), `eye.y finite for ${cut.id} at t=${t}`);
                assert.ok(Number.isFinite(cam.eye.z), `eye.z finite for ${cut.id} at t=${t}`);
                assert.ok(Number.isFinite(cam.target.x), `target.x finite for ${cut.id} at t=${t}`);
                assert.ok(Number.isFinite(cam.target.y), `target.y finite for ${cut.id} at t=${t}`);
                assert.ok(Number.isFinite(cam.target.z), `target.z finite for ${cut.id} at t=${t}`);
                assert.ok(Number.isFinite(cam.fov), `fov finite for ${cut.id} at t=${t}`);
                assert.ok(Number.isFinite(cam.roll), `roll finite for ${cut.id} at t=${t}`);
                assert.ok(cam.fov >= 45 && cam.fov <= 85, `FOV within standard camera bounds: ${cam.fov}`);
                assert.ok(cam.progress >= 0 && cam.progress <= 1);
            }
        }
    });

    it('camera orbit moves position and fov from start to end of cut', () => {
        const cut = ATTRACT_CUTS[0]; // Waterfall Kickflip
        const start = calculateCameraOrbit(cut, 0);
        const mid = calculateCameraOrbit(cut, 3.0);
        const end = calculateCameraOrbit(cut, 6.0);

        assert.notDeepEqual(start.eye, end.eye);
        assert.equal(start.fov, cut.cameraProfile.baseFov);
        assert.equal(end.fov, cut.cameraProfile.targetFov);
        assert.ok(mid.roll !== 0, 'Mid-kickflip has dynamic roll angle');
    });

    it('supports custom base anchor position override', () => {
        const cut = ATTRACT_CUTS[3]; // Kraken Parry
        const defaultCam = calculateCameraOrbit(cut, 2.0);
        const customAnchor = { x: 5, y: 1.0, z: -1300 };
        const cam = calculateCameraOrbit(cut, 2.0, customAnchor);

        assert.ok(Math.abs(cam.eye.x - (defaultCam.eye.x + customAnchor.x)) < 1e-3);
        assert.ok(Math.abs(cam.eye.y - (defaultCam.eye.y + (customAnchor.y - 0.25))) < 1e-3);
        assert.ok(Math.abs(cam.eye.z - (defaultCam.eye.z + (customAnchor.z - cut.riverZ))) < 1e-3);
        assert.ok(cam.eye.z > -1300);
    });
});

describe('AI Action Triggers Evaluation', () => {
    it('evaluates action triggers within a time window exactly once', () => {
        const cut = ATTRACT_CUTS[0]; // Waterfall Kickflip
        // Triggers: 0.8s, 1.4s, 3.2s, 4.5s

        const triggers1 = evaluateCutActionTriggers(cut, 0, 1.0);
        assert.equal(triggers1.length, 1);
        assert.equal(triggers1[0].action, 'hit-waterfall-ramp');
        assert.equal(triggers1[0].timeSec, 0.8);

        const triggers2 = evaluateCutActionTriggers(cut, 1.0, 2.0);
        assert.equal(triggers2.length, 1);
        assert.equal(triggers2[0].action, 'trigger-kickflip');

        const triggersEmpty = evaluateCutActionTriggers(cut, 2.0, 2.5);
        assert.equal(triggersEmpty.length, 0);

        const triggers3 = evaluateCutActionTriggers(cut, 2.5, 5.0);
        assert.equal(triggers3.length, 2);
        assert.equal(triggers3[0].action, 'water-landing-splash');
        assert.equal(triggers3[1].action, 'nitro-boost');
    });

    it('returns empty array if cut or actionTriggers is missing', () => {
        assert.deepEqual(evaluateCutActionTriggers(null, 0, 1), []);
        assert.deepEqual(evaluateCutActionTriggers({}, 0, 1), []);
    });
});

describe('createAttractShowcaseDirector Lifecycle & State Machine', () => {
    it('initializes director in running state starting at cut 0', () => {
        const director = createAttractShowcaseDirector();
        assert.equal(director.isRunning, true);
        assert.equal(director.cutIndex, 0);
        assert.equal(director.elapsedInCurrentCut, 0);
        assert.equal(director.totalElapsedShowcase, 0);
        assert.equal(director.cycleCount, 0);

        const snap = director.getSnapshot();
        assert.equal(snap.currentCut.id, SHOWCASE_CUT_IDS.WATERFALL_KICKFLIP);
        assert.ok(snap.camera);
    });

    it('steps through 6-second cut, firing scheduled AI action triggers', () => {
        const fired = [];
        const director = createAttractShowcaseDirector({
            onActionTrigger: (trig) => fired.push(trig),
        });

        // Step 1.0s (should trigger hit-waterfall-ramp at 0.8s)
        const s1 = director.step(1.0);
        assert.equal(s1.cutIndex, 0);
        assert.equal(s1.elapsedInCurrentCut, 1.0);
        assert.equal(s1.firedTriggers.length, 1);
        assert.equal(s1.firedTriggers[0].action, 'hit-waterfall-ramp');
        assert.equal(fired.length, 1);

        // Step 1.0s more (to 2.0s, should trigger trigger-kickflip at 1.4s)
        const s2 = director.step(1.0);
        assert.equal(s2.firedTriggers.length, 1);
        assert.equal(s2.firedTriggers[0].action, 'trigger-kickflip');
        assert.equal(fired.length, 2);
    });

    it('transitions to next cut at 6.0s boundary and invokes onCutChange', () => {
        let changed = null;
        const director = createAttractShowcaseDirector({
            onCutChange: (cut, prev) => { changed = { cut, prev }; },
        });

        director.step(5.0);
        assert.equal(director.cutIndex, 0);
        assert.equal(changed, null);

        // Advance past 6.0s into Cut 1 (War Mallet Double-Smash)
        const stepRes = director.step(1.5);
        assert.equal(director.cutIndex, 1);
        assert.equal(stepRes.cutChanged, true);
        assert.equal(stepRes.currentCut.id, SHOWCASE_CUT_IDS.WAR_MALLET_SMASH);
        assert.ok(Math.abs(director.elapsedInCurrentCut - 0.5) < 1e-4);
        assert.ok(changed);
        assert.equal(changed.cut.id, SHOWCASE_CUT_IDS.WAR_MALLET_SMASH);
        assert.equal(changed.prev.id, SHOWCASE_CUT_IDS.WATERFALL_KICKFLIP);
    });

    it('cycles through all 4 cuts and loops back to Cut 0 after 24 seconds', () => {
        const cutsVisited = [];
        const director = createAttractShowcaseDirector({
            onCutChange: (cut) => cutsVisited.push(cut.id),
        });

        // Step 6s each to visit each cut
        director.step(6.0); // Cut 0 -> Cut 1
        assert.equal(director.cutIndex, 1);
        assert.equal(director.getCurrentCut().id, SHOWCASE_CUT_IDS.WAR_MALLET_SMASH);

        director.step(6.0); // Cut 1 -> Cut 2
        assert.equal(director.cutIndex, 2);
        assert.equal(director.getCurrentCut().id, SHOWCASE_CUT_IDS.DISCO_CRAB_RAVE);

        director.step(6.0); // Cut 2 -> Cut 3
        assert.equal(director.cutIndex, 3);
        assert.equal(director.getCurrentCut().id, SHOWCASE_CUT_IDS.KRAKEN_PARRY);

        director.step(6.0); // Cut 3 -> Loop back to Cut 0
        assert.equal(director.cutIndex, 0);
        assert.equal(director.getCurrentCut().id, SHOWCASE_CUT_IDS.WATERFALL_KICKFLIP);
        assert.equal(director.cycleCount, 1);

        assert.deepEqual(cutsVisited, [
            SHOWCASE_CUT_IDS.WAR_MALLET_SMASH,
            SHOWCASE_CUT_IDS.DISCO_CRAB_RAVE,
            SHOWCASE_CUT_IDS.KRAKEN_PARRY,
            SHOWCASE_CUT_IDS.WATERFALL_KICKFLIP,
        ]);
    });

    it('supports pause, resume, reset, and setCut', () => {
        const director = createAttractShowcaseDirector();
        director.step(2.0);
        assert.equal(director.elapsedInCurrentCut, 2.0);

        director.pause();
        assert.equal(director.isRunning, false);
        director.step(1.0);
        assert.equal(director.elapsedInCurrentCut, 2.0, 'Does not advance while paused');

        director.resume();
        assert.equal(director.isRunning, true);
        director.step(1.0);
        assert.equal(director.elapsedInCurrentCut, 3.0);

        // setCut to Cut 3 (Kraken)
        const cut3 = director.setCut(3);
        assert.equal(cut3.id, SHOWCASE_CUT_IDS.KRAKEN_PARRY);
        assert.equal(director.cutIndex, 3);
        assert.equal(director.elapsedInCurrentCut, 0);

        // Reset
        director.reset();
        assert.equal(director.cutIndex, 0);
        assert.equal(director.elapsedInCurrentCut, 0);
        assert.equal(director.cycleCount, 0);
        assert.equal(director.isRunning, true);
    });

    it('stops at end of cut 3 when loop is false', () => {
        const director = createAttractShowcaseDirector({ loop: false });
        director.setCut(3);
        director.step(6.5);
        assert.equal(director.cutIndex, 3);
        assert.equal(director.isRunning, false);
    });
});
