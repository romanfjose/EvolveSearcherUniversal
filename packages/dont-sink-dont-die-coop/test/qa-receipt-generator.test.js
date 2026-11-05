import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    QAReceiptGenerator,
    GATE_NAMES,
    DEFAULT_THRESHOLDS,
    auditSceneGraphNaN,
    checkHudOverlaps,
    evaluateFramerateBudget,
    checkPrematureBossBar,
} from '../shared/qa-receipt-generator.js';

describe('Sovereign QA Receipt Generator & Invariant Aggregator', () => {

    describe('auditSceneGraphNaN', () => {
        it('returns empty array when root is null or invalid', () => {
            assert.deepEqual(auditSceneGraphNaN(null), []);
            assert.deepEqual(auditSceneGraphNaN(undefined), []);
            assert.deepEqual(auditSceneGraphNaN('not an object'), []);
        });

        it('passes clean object hierarchies without NaN', () => {
            const cleanNode = {
                name: 'CleanRaft',
                position: { x: 0, y: 1, z: -10 },
                rotation: { x: 0, y: 0, z: 0 },
                quaternion: { x: 0, y: 0, z: 0, w: 1 },
                scale: { x: 1, y: 1, z: 1 },
                matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, -10, 1] },
                children: [
                    {
                        name: 'CleanPaddle',
                        position: { x: 1, y: 0, z: 0 },
                        children: [],
                    },
                ],
            };

            const defects = auditSceneGraphNaN(cleanNode);
            assert.equal(defects.length, 0);
        });

        it('detects NaN in position, quaternion, scale, and matrixWorld', () => {
            const dirtyNode = {
                name: 'CorruptedRaft',
                position: { x: NaN, y: 1, z: -10 },
                rotation: { x: 0, y: 0, z: 0 },
                quaternion: { x: 0, y: NaN, z: 0, w: 1 },
                scale: { x: 1, y: 1, z: Infinity },
                matrixWorld: { elements: [1, 0, NaN, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
                children: [
                    {
                        name: 'BrokenChild',
                        position: { x: 0, y: -Infinity, z: 0 },
                    },
                ],
            };

            const defects = auditSceneGraphNaN(dirtyNode);
            assert.ok(defects.length >= 4);

            const nodeNames = defects.map((d) => d.node);
            assert.ok(nodeNames.includes('CorruptedRaft'));
            assert.ok(nodeNames.includes('BrokenChild'));
        });

        it('supports Three.js traverse method if available', () => {
            const traversed = [];
            const mockThreeGroup = {
                name: 'MockGroup',
                position: { x: 0, y: 0, z: 0 },
                traverse(cb) {
                    cb(this);
                    cb({ name: 'LeafObj', position: { x: NaN, y: 0, z: 0 } });
                },
            };

            const defects = auditSceneGraphNaN(mockThreeGroup);
            assert.equal(defects.length, 1);
            assert.equal(defects[0].node, 'LeafObj');
            assert.equal(defects[0].property, 'position');
        });
    });

    describe('checkHudOverlaps', () => {
        it('returns empty array when no rects or invalid inputs provided', () => {
            assert.deepEqual(checkHudOverlaps([]), []);
            assert.deepEqual(checkHudOverlaps(null), []);
            assert.deepEqual(checkHudOverlaps([null, undefined]), []);
        });

        it('ignores invisible or zero-dimension elements', () => {
            const rects = [
                { id: 'hudA', left: 0, top: 0, right: 100, bottom: 100, visible: false },
                { id: 'hudB', left: 50, top: 50, right: 150, bottom: 150, visible: true },
                { id: 'hudZero', left: 50, top: 50, right: 50, bottom: 50, visible: true },
            ];
            const overlaps = checkHudOverlaps(rects);
            assert.equal(overlaps.length, 0);
        });

        it('allows non-intersecting or touching-within-tolerance bounding boxes', () => {
            const rects = [
                { id: 'topPanel', left: 10, top: 10, right: 200, bottom: 50 },
                { id: 'bottomPanel', left: 10, top: 52, right: 200, bottom: 100 }, // 0px x, 0px y
                { id: 'sidePanel', left: 202, top: 10, right: 300, bottom: 50 },   // touches within 2px tolerance
            ];
            const overlaps = checkHudOverlaps(rects);
            assert.equal(overlaps.length, 0);
        });

        it('detects intersecting HUD panels that violate tolerance', () => {
            const rects = [
                { id: 'wavePanel', left: 100, top: 20, right: 300, bottom: 80 },
                { id: 'minimap', left: 250, top: 40, right: 400, bottom: 180 }, // overlaps 50x40 px
            ];
            const overlaps = checkHudOverlaps(rects, 4);
            assert.equal(overlaps.length, 1);
            assert.equal(overlaps[0].a, 'wavePanel');
            assert.equal(overlaps[0].b, 'minimap');
            assert.equal(overlaps[0].overlapX, 50);
            assert.equal(overlaps[0].overlapY, 40);
        });
    });

    describe('evaluateFramerateBudget', () => {
        it('returns default 60 FPS pass on empty frame samples', () => {
            const result = evaluateFramerateBudget([]);
            assert.equal(result.ok, true);
            assert.equal(result.avgFps, 60);
            assert.equal(result.violations.length, 0);
        });

        it('evaluates smooth 60 FPS frame times', () => {
            const times = new Array(60).fill(16.666);
            const result = evaluateFramerateBudget(times);
            assert.equal(result.ok, true);
            assert.ok(result.avgFps >= 59.9 && result.avgFps <= 60.1);
            assert.ok(result.minFps >= 59.9);
            assert.equal(result.violations.length, 0);
        });

        it('flags violations if framerate drops below min threshold or spikes frame time', () => {
            // Delta times: 16.6ms standard, with a 50ms spike (20 FPS)
            const times = [16.6, 16.6, 50.0, 16.6];
            const result = evaluateFramerateBudget(times, { minFps: 30, maxFrameTimeMs: 40 });
            assert.equal(result.ok, false);
            assert.equal(result.minFps, 20);
            assert.equal(result.maxFrameTimeMs, 50);
            assert.equal(result.violations.length, 2);
        });
    });

    describe('checkPrematureBossBar', () => {
        it('returns false when boss bar is not visible or hidden', () => {
            assert.equal(checkPrematureBossBar(null, 0), false);
            assert.equal(checkPrematureBossBar({ visible: false }, 0), false);
            assert.equal(checkPrematureBossBar({ display: 'none', opacity: 1 }, 0), false);
            assert.equal(checkPrematureBossBar({ display: 'block', opacity: 0.01 }, 0), false);
        });

        it('flags true if boss bar is visible at river start (z > -200)', () => {
            // Player is at z = -50 (close to spawn), boss bar is active
            assert.equal(checkPrematureBossBar({ visible: true, opacity: 1 }, -50, -200), true);
            assert.equal(checkPrematureBossBar({ display: 'block', opacity: 0.8 }, 0, -200), true);
        });

        it('returns false if boss bar is visible in legitimate boss territory (z <= -200)', () => {
            // Player reached boss zone at z = -250 or -1400
            assert.equal(checkPrematureBossBar({ visible: true, opacity: 1 }, -250, -200), false);
            assert.equal(checkPrematureBossBar({ visible: true, opacity: 1 }, -1450, -200), false);
        });
    });

    describe('QAReceiptGenerator Aggregate Engine', () => {
        it('produces 100% green PASS receipt on pristine run', () => {
            const gen = new QAReceiptGenerator({ runId: 'TEST-GREEN-01' });

            gen.addUnitTestResults({ name: 'game-core.test.js', total: 77, passed: 77, failed: 0 });
            gen.addUnitTestResults({ name: 'boss-kraken.test.js', total: 20, passed: 20, failed: 0 });

            // Zero console errors, only normal logs
            gen.addConsoleMessage('log', 'Game initialized');
            gen.addConsoleMessage('info', 'Connecting to loopback');

            // Pristine 3D Scene Graph
            gen.auditSceneGraph({
                name: 'Raft',
                position: { x: 0, y: 0.25, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                quaternion: { x: 0, y: 0, z: 0, w: 1 },
                scale: { x: 1, y: 1, z: 1 },
                children: [],
            });

            // Pristine HUD panels (no overlaps)
            gen.auditHudRects([
                { id: 'topBar', left: 0, top: 0, right: 300, bottom: 40 },
                { id: 'minimap', left: 700, top: 0, right: 900, bottom: 200 },
            ]);

            // Boss bar hidden at spawn
            gen.auditBossHealthBar({ visible: false, opacity: 0 }, 0);

            // 60 FPS performance
            gen.recordFrameTimes([16.6, 16.7, 16.5, 16.6]);

            const evaluation = gen.evaluateGates();
            assert.equal(evaluation.verdict, 'PASS');
            assert.equal(evaluation.allGatesPassed, true);
            assert.equal(evaluation.failures.length, 0);

            for (const gate of Object.values(evaluation.gates)) {
                assert.equal(gate.passed, true);
            }

            const json = gen.generateJsonReceipt();
            assert.equal(json.id, 'TEST-GREEN-01');
            assert.equal(json.verdict, 'PASS');
            assert.equal(json.metrics.failedUnitTests, 0);

            const md = gen.generateMarkdownReceipt();
            assert.ok(md.includes('# ✅ Sovereign QA Invariant Receipt: PASS'));
            assert.ok(md.includes('🟢 PASS'));
            assert.ok(md.includes('Zero defects'));
        });

        it('enforces hard fail gate if console error occurs', () => {
            const gen = new QAReceiptGenerator();
            gen.addConsoleMessage('error', 'Uncaught ReferenceError: foo is not defined');

            const evalReport = gen.evaluateGates();
            assert.equal(evalReport.verdict, 'FAIL');
            assert.equal(evalReport.gates[GATE_NAMES.G1_CONSOLE_CLEAN].passed, false);
            assert.ok(evalReport.failures.some((f) => f.includes(GATE_NAMES.G1_CONSOLE_CLEAN)));

            const md = gen.generateMarkdownReceipt();
            assert.ok(md.includes('# ❌ Sovereign QA Invariant Receipt: FAIL'));
            assert.ok(md.includes('🔴 FAIL'));
        });

        it('enforces hard fail gate if THREE warning occurs', () => {
            const gen = new QAReceiptGenerator();
            gen.addConsoleMessage('warn', 'THREE.Object3D.add: object already has a parent');

            const evalReport = gen.evaluateGates();
            assert.equal(evalReport.verdict, 'FAIL');
            assert.equal(evalReport.gates[GATE_NAMES.G1_CONSOLE_CLEAN].passed, false);
        });

        it('enforces hard fail gate if scene-graph NaN is detected', () => {
            const gen = new QAReceiptGenerator();
            gen.auditSceneGraph({
                name: 'VikingRig',
                position: { x: 0, y: NaN, z: 0 },
            });

            const evalReport = gen.evaluateGates();
            assert.equal(evalReport.verdict, 'FAIL');
            assert.equal(evalReport.gates[GATE_NAMES.G2_SCENE_GRAPH_FINITE].passed, false);
            assert.equal(evalReport.metrics.nanDefectsCount, 1);
        });

        it('enforces hard fail gate if HUD overlaps occur', () => {
            const gen = new QAReceiptGenerator();
            gen.auditHudRects([
                { id: '#wave-panel', left: 10, top: 10, right: 100, bottom: 50 },
                { id: '#scoreboard', left: 50, top: 20, right: 150, bottom: 80 },
            ]);

            const evalReport = gen.evaluateGates();
            assert.equal(evalReport.verdict, 'FAIL');
            assert.equal(evalReport.gates[GATE_NAMES.G3_HUD_NON_OVERLAPPING].passed, false);
            assert.equal(evalReport.metrics.hudOverlapsCount, 1);
        });

        it('enforces hard fail gate if premature boss bar occurs', () => {
            const gen = new QAReceiptGenerator();
            gen.auditBossHealthBar({ visible: true, opacity: 1 }, 0); // river spawn

            const evalReport = gen.evaluateGates();
            assert.equal(evalReport.verdict, 'FAIL');
            assert.equal(evalReport.gates[GATE_NAMES.G4_NO_PREMATURE_BOSS_BAR].passed, false);
            assert.equal(evalReport.metrics.prematureBossBar, true);
        });

        it('enforces hard fail gate if unit tests fail', () => {
            const gen = new QAReceiptGenerator();
            gen.addUnitTestResults({ name: 'broken.test.js', total: 5, passed: 4, failed: 1 });

            const evalReport = gen.evaluateGates();
            assert.equal(evalReport.verdict, 'FAIL');
            assert.equal(evalReport.gates[GATE_NAMES.G6_UNIT_SUITE_PASS].passed, false);
            assert.equal(evalReport.metrics.failedUnitTests, 1);
        });

        it('supports direct ingestion of defects via addSceneGraphDefects & addHudOverlaps', () => {
            const gen = new QAReceiptGenerator();
            gen.addSceneGraphDefects(['RaftMesh', 'OarJoint']);
            gen.addHudOverlaps(['#ui overlaps #minimap by 10x10px']);

            const evalReport = gen.evaluateGates();
            assert.equal(evalReport.verdict, 'FAIL');
            assert.equal(evalReport.metrics.nanDefectsCount, 2);
            assert.equal(evalReport.metrics.hudOverlapsCount, 1);
        });

        it('supports custom assertInvariant checks', () => {
            const gen = new QAReceiptGenerator();
            gen.assertInvariant('FrustumVisibility', true, 'Player raft in front of camera');
            gen.assertInvariant('ShaderCompilation', false, 'Water shader threw uniform mismatch');

            const evalReport = gen.evaluateGates();
            assert.equal(evalReport.verdict, 'FAIL');
            assert.ok(evalReport.failures.some((f) => f.includes('Water shader threw uniform mismatch')));

            const md = gen.generateMarkdownReceipt();
            assert.ok(md.includes('FrustumVisibility'));
            assert.ok(md.includes('ShaderCompilation'));
        });
    });
});
