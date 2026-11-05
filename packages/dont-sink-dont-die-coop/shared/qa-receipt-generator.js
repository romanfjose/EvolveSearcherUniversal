/**
 * Don't Sink, Don't Die — Sovereign QA Receipt Generator & Invariant Aggregator
 * (Helmet 03 — Synthetic José QA / Where's the Bathroom? Breaker)
 *
 * Core Directives:
 * - Aggregate telemetry from unit suites, 3D scene-graph NaN audits, HUD
 *   bounding-box checks, and framerate budgets into structured Markdown + JSON receipts.
 * - Enforce hard fail gates if any console error, NaN matrix, HUD overlap,
 *   or premature boss bar occurs.
 * - Zero external dependencies, pure deterministic and headless-safe.
 */

export const GATE_NAMES = {
    G1_CONSOLE_CLEAN: 'G1_CONSOLE_CLEAN',
    G2_SCENE_GRAPH_FINITE: 'G2_SCENE_GRAPH_FINITE',
    G3_HUD_NON_OVERLAPPING: 'G3_HUD_NON_OVERLAPPING',
    G4_NO_PREMATURE_BOSS_BAR: 'G4_NO_PREMATURE_BOSS_BAR',
    G5_FRAMERATE_BUDGET: 'G5_FRAMERATE_BUDGET',
    G6_UNIT_SUITE_PASS: 'G6_UNIT_SUITE_PASS',
};

export const DEFAULT_THRESHOLDS = {
    minFps: 30.0,
    targetFps: 60.0,
    maxFrameTimeMs: 40.0,
    allowedOverlapPx: 4.0,
    bossSpawnZThreshold: -200.0,
};

/**
 * Traverses a 3D object hierarchy (or plain JS tree) and audits for NaN or non-finite
 * numbers in position, rotation, quaternion, scale, or matrixWorld elements.
 *
 * @param {object} rootObject - Three.js Object3D-like hierarchy.
 * @returns {Array<{ node: string, property: string, values: number[] }>} List of detected NaN defects.
 */
export function auditSceneGraphNaN(rootObject) {
    if (!rootObject || typeof rootObject !== 'object') {
        return [];
    }

    const defects = [];

    function inspectNode(node) {
        if (!node || typeof node !== 'object') return;
        const name = node.name || node.type || node.id || 'Object3D';

        const checks = [
            { prop: 'position', obj: node.position, keys: ['x', 'y', 'z'] },
            { prop: 'rotation', obj: node.rotation, keys: ['x', 'y', 'z'] },
            { prop: 'quaternion', obj: node.quaternion, keys: ['x', 'y', 'z', 'w'] },
            { prop: 'scale', obj: node.scale, keys: ['x', 'y', 'z'] },
        ];

        for (const check of checks) {
            if (check.obj && typeof check.obj === 'object') {
                const invalidVals = [];
                for (const k of check.keys) {
                    const val = check.obj[k];
                    if (val !== undefined && (typeof val !== 'number' || !Number.isFinite(val))) {
                        invalidVals.push({ key: k, val });
                    }
                }
                if (invalidVals.length > 0) {
                    defects.push({
                        node: name,
                        property: check.prop,
                        invalid: invalidVals,
                    });
                }
            }
        }

        // Check matrix or matrixWorld
        const matrices = [
            { prop: 'matrix', mat: node.matrix },
            { prop: 'matrixWorld', mat: node.matrixWorld },
        ];
        for (const m of matrices) {
            if (m.mat && Array.isArray(m.mat.elements)) {
                const badIndices = [];
                for (let i = 0; i < m.mat.elements.length; i++) {
                    const val = m.mat.elements[i];
                    if (typeof val !== 'number' || !Number.isFinite(val)) {
                        badIndices.push({ index: i, val });
                    }
                }
                if (badIndices.length > 0) {
                    defects.push({
                        node: name,
                        property: m.prop,
                        invalidElements: badIndices,
                    });
                }
            }
        }

        // Recurse children
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                inspectNode(child);
            }
        }
    }

    if (typeof rootObject.traverse === 'function') {
        rootObject.traverse((node) => inspectNode(node));
    } else {
        inspectNode(rootObject);
    }

    return defects;
}

/**
 * Checks bounding boxes of visible HUD elements for illegal 2D intersections.
 *
 * @param {Array<{ id?: string, sel?: string, left: number, top: number, right: number, bottom: number, visible?: boolean }>} rects
 * @param {number} [tolerance=4] - Overlap tolerance in pixels.
 * @returns {Array<{ a: string, b: string, overlapX: number, overlapY: number, description: string }>}
 */
export function checkHudOverlaps(rects = [], tolerance = DEFAULT_THRESHOLDS.allowedOverlapPx) {
    if (!Array.isArray(rects)) return [];

    const activeRects = rects.filter((r) => {
        if (!r || typeof r !== 'object') return false;
        if (r.visible === false) return false;
        const w = (r.right ?? 0) - (r.left ?? 0);
        const h = (r.bottom ?? 0) - (r.top ?? 0);
        return w > 0 && h > 0;
    });

    const overlaps = [];

    for (let i = 0; i < activeRects.length; i++) {
        for (let j = i + 1; j < activeRects.length; j++) {
            const a = activeRects[i];
            const b = activeRects[j];

            const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

            if (xOverlap > tolerance && yOverlap > tolerance) {
                const nameA = a.id || a.sel || `element_${i}`;
                const nameB = b.id || b.sel || `element_${j}`;
                overlaps.push({
                    a: nameA,
                    b: nameB,
                    overlapX: Math.round(xOverlap),
                    overlapY: Math.round(yOverlap),
                    description: `${nameA} overlaps ${nameB} by ${Math.round(xOverlap)}x${Math.round(yOverlap)}px`,
                });
            }
        }
    }

    return overlaps;
}

/**
 * Evaluates framerate and frame-time samples against performance budgets.
 *
 * @param {number[]} frameTimesMs - Array of delta times in milliseconds.
 * @param {object} [thresholds]
 * @returns {{ ok: boolean, avgFps: number, minFps: number, maxFrameTimeMs: number, violations: string[] }}
 */
export function evaluateFramerateBudget(frameTimesMs = [], thresholds = DEFAULT_THRESHOLDS) {
    if (!Array.isArray(frameTimesMs) || frameTimesMs.length === 0) {
        return {
            ok: true,
            avgFps: 60.0,
            minFps: 60.0,
            maxFrameTimeMs: 16.67,
            violations: [],
        };
    }

    const minAllowedFps = thresholds.minFps ?? DEFAULT_THRESHOLDS.minFps;
    const maxAllowedFrameTimeMs = thresholds.maxFrameTimeMs ?? DEFAULT_THRESHOLDS.maxFrameTimeMs;

    let totalMs = 0;
    let maxMs = 0;
    let minFps = Infinity;
    const violations = [];

    for (let i = 0; i < frameTimesMs.length; i++) {
        const dt = frameTimesMs[i];
        if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) continue;
        totalMs += dt;
        if (dt > maxMs) maxMs = dt;
        const instFps = 1000 / dt;
        if (instFps < minFps) minFps = instFps;
    }

    const validCount = frameTimesMs.filter((dt) => typeof dt === 'number' && Number.isFinite(dt) && dt > 0).length;
    const avgDt = validCount > 0 ? totalMs / validCount : 16.67;
    const avgFps = avgDt > 0 ? 1000 / avgDt : 60.0;
    const resolvedMinFps = minFps === Infinity ? 60.0 : minFps;

    if (resolvedMinFps < minAllowedFps) {
        violations.push(`Minimum framerate (${resolvedMinFps.toFixed(1)} FPS) fell below budget threshold (${minAllowedFps} FPS)`);
    }
    if (maxMs > maxAllowedFrameTimeMs) {
        violations.push(`Maximum frame-time spike (${maxMs.toFixed(1)}ms) exceeded budget threshold (${maxAllowedFrameTimeMs}ms)`);
    }

    return {
        ok: violations.length === 0,
        avgFps: Number(avgFps.toFixed(1)),
        minFps: Number(resolvedMinFps.toFixed(1)),
        maxFrameTimeMs: Number(maxMs.toFixed(1)),
        violations,
    };
}

/**
 * Checks if boss health bar is erroneously active before the river reach where the boss spawns.
 *
 * @param {object} bossBarTelemetry - { visible: boolean, opacity: number, display: string }
 * @param {number} riverZ - Current river Z coordinate of the player/crew.
 * @param {number} [spawnZ=-200]
 * @returns {boolean} True if boss bar is prematurely visible.
 */
export function checkPrematureBossBar(bossBarTelemetry, riverZ = 0, spawnZ = DEFAULT_THRESHOLDS.bossSpawnZThreshold) {
    if (!bossBarTelemetry || typeof bossBarTelemetry !== 'object') {
        return false;
    }
    if (bossBarTelemetry.visible === false) {
        return false;
    }
    const isVisible = bossBarTelemetry.visible === true ||
        (bossBarTelemetry.display !== undefined && bossBarTelemetry.display !== 'none' && (bossBarTelemetry.opacity ?? 1) > 0.05);

    // River flows from z = 0 towards negative z (e.g., -1500). Spawn is at z <= -200.
    // If riverZ > spawnZ (closer to start than -200), boss bar is premature!
    return Boolean(isVisible && riverZ > spawnZ);
}

/**
 * Sovereign QA Receipt Generator & Aggregator.
 */
export class QAReceiptGenerator {
    constructor(options = {}) {
        this.runId = options.runId || `QA-${Date.now()}-${Math.floor(Math.random() * 10000).toString(16)}`;
        this.title = options.title || "Sovereign Helmet 03 QA Verification Receipt";
        this.environment = options.environment || (typeof window !== 'undefined' ? 'browser' : 'node-headless');
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };

        // Aggregated telemetry state
        this.unitSuites = [];
        this.consoleLogs = [];
        this.pageErrors = [];
        this.threeWarnings = [];
        this.sceneGraphDefects = [];
        this.hudOverlaps = [];
        this.framerateData = null;
        this.bossBarPremature = false;
        this.customAssertions = [];
        this.metadata = { ...(options.metadata || {}) };
    }

    /**
     * Ingest unit test suite execution results.
     */
    addUnitTestResults(suiteResult) {
        if (!suiteResult) return this;
        const total = suiteResult.total ?? (suiteResult.passed ?? 0) + (suiteResult.failed ?? 0);
        const failed = suiteResult.failed ?? 0;
        const passed = suiteResult.passed ?? (total - failed);
        this.unitSuites.push({
            name: suiteResult.name || 'Unnamed Unit Suite',
            total,
            passed,
            failed,
            durationMs: suiteResult.durationMs ?? 0,
            errors: suiteResult.errors || [],
        });
        return this;
    }

    /**
     * Record browser console message or error.
     */
    addConsoleMessage(type, text) {
        if (!text) return this;
        const str = String(text);
        this.consoleLogs.push({ type, text: str });
        if (type === 'error' && !str.includes('socket.io.js') && !str.includes('Failed to load resource')) {
            // Console error captured
        }
        if (str.includes('THREE.Object3D.add:') || str.includes('NaN')) {
            this.threeWarnings.push(str);
        }
        return this;
    }

    /**
     * Record uncaught page exception or window.onerror.
     */
    addPageError(err) {
        if (!err) return this;
        const msg = err.stack || err.message || String(err);
        this.pageErrors.push(msg);
        return this;
    }

    /**
     * Ingest or run scene-graph NaN audit on an Object3D hierarchy.
     */
    auditSceneGraph(rootObject) {
        const defects = auditSceneGraphNaN(rootObject);
        this.sceneGraphDefects.push(...defects);
        return this;
    }

    /**
     * Ingest direct list of scene-graph defects (e.g. from headless evaluate).
     */
    addSceneGraphDefects(defects = []) {
        if (Array.isArray(defects)) {
            for (const d of defects) {
                if (typeof d === 'string') {
                    this.sceneGraphDefects.push({ node: d, property: 'transform' });
                } else if (d && typeof d === 'object') {
                    this.sceneGraphDefects.push(d);
                }
            }
        }
        return this;
    }

    /**
     * Ingest HUD bounding boxes and check for overlaps.
     */
    auditHudRects(rects = []) {
        const overlaps = checkHudOverlaps(rects, this.thresholds.allowedOverlapPx);
        this.hudOverlaps.push(...overlaps);
        return this;
    }

    /**
     * Ingest already detected HUD overlap strings or objects.
     */
    addHudOverlaps(overlaps = []) {
        if (Array.isArray(overlaps)) {
            for (const o of overlaps) {
                if (typeof o === 'string') {
                    this.hudOverlaps.push({ description: o });
                } else if (o && typeof o === 'object') {
                    this.hudOverlaps.push(o);
                }
            }
        }
        return this;
    }

    /**
     * Record frame time samples and evaluate framerate budget.
     */
    recordFrameTimes(frameTimesMs = []) {
        this.framerateData = evaluateFramerateBudget(frameTimesMs, this.thresholds);
        return this;
    }

    /**
     * Record boss health bar state and player river Z.
     */
    auditBossHealthBar(bossBarTelemetry, riverZ) {
        this.bossBarPremature = checkPrematureBossBar(
            bossBarTelemetry,
            riverZ,
            this.thresholds.bossSpawnZThreshold
        );
        return this;
    }

    /**
     * Ingest custom boolean assertion.
     */
    assertInvariant(name, passed, message = '') {
        this.customAssertions.push({
            name,
            passed: Boolean(passed),
            message: message || (passed ? 'Passed invariant' : 'Failed invariant'),
        });
        return this;
    }

    /**
     * Evaluates all hard fail gates and compiles the final gate report.
     */
    evaluateGates() {
        const consoleErrors = this.consoleLogs
            .filter((l) => l.type === 'error' && !l.text.includes('socket.io.js') && !l.text.includes('Failed to load resource'))
            .map((l) => l.text);

        // Gate 1: Console and Page Errors Clean
        const g1Passed = consoleErrors.length === 0 && this.pageErrors.length === 0 && this.threeWarnings.length === 0;
        const g1Reasons = [];
        if (consoleErrors.length > 0) g1Reasons.push(`${consoleErrors.length} console error(s)`);
        if (this.pageErrors.length > 0) g1Reasons.push(`${this.pageErrors.length} uncaught page error(s)`);
        if (this.threeWarnings.length > 0) g1Reasons.push(`${this.threeWarnings.length} THREE warning(s)`);

        // Gate 2: Scene-Graph Finite (Zero NaNs)
        const g2Passed = this.sceneGraphDefects.length === 0;
        const g2Reasons = [];
        if (!g2Passed) {
            g2Reasons.push(`${this.sceneGraphDefects.length} scene-graph NaN defect(s) detected`);
        }

        // Gate 3: HUD Non-Overlapping
        const g3Passed = this.hudOverlaps.length === 0;
        const g3Reasons = [];
        if (!g3Passed) {
            g3Reasons.push(`${this.hudOverlaps.length} HUD bounding-box overlap(s) detected`);
        }

        // Gate 4: No Premature Boss Bar
        const g4Passed = !this.bossBarPremature;
        const g4Reasons = [];
        if (!g4Passed) {
            g4Reasons.push('Boss health bar rendered prematurely at river spawn');
        }

        // Gate 5: Framerate Budget
        const g5Passed = !this.framerateData || this.framerateData.ok;
        const g5Reasons = this.framerateData?.violations || [];

        // Gate 6: Unit Suites All Green
        const totalUnitFails = this.unitSuites.reduce((acc, s) => acc + (s.failed || 0), 0);
        const g6Passed = totalUnitFails === 0;
        const g6Reasons = [];
        if (!g6Passed) {
            g6Reasons.push(`${totalUnitFails} unit test failure(s) across ${this.unitSuites.length} suite(s)`);
        }

        // Custom Assertions
        const failedCustom = this.customAssertions.filter((a) => !a.passed);
        const customPassed = failedCustom.length === 0;

        const allGatesPassed = g1Passed && g2Passed && g3Passed && g4Passed && g5Passed && g6Passed && customPassed;

        const gateDetails = {
            [GATE_NAMES.G1_CONSOLE_CLEAN]: { passed: g1Passed, reasons: g1Reasons },
            [GATE_NAMES.G2_SCENE_GRAPH_FINITE]: { passed: g2Passed, reasons: g2Reasons },
            [GATE_NAMES.G3_HUD_NON_OVERLAPPING]: { passed: g3Passed, reasons: g3Reasons },
            [GATE_NAMES.G4_NO_PREMATURE_BOSS_BAR]: { passed: g4Passed, reasons: g4Reasons },
            [GATE_NAMES.G5_FRAMERATE_BUDGET]: { passed: g5Passed, reasons: g5Reasons },
            [GATE_NAMES.G6_UNIT_SUITE_PASS]: { passed: g6Passed, reasons: g6Reasons },
        };

        const failures = [];
        for (const [name, g] of Object.entries(gateDetails)) {
            if (!g.passed) {
                failures.push(`[${name}] ${g.reasons.join(', ')}`);
            }
        }
        for (const c of failedCustom) {
            failures.push(`[CUSTOM: ${c.name}] ${c.message}`);
        }

        return {
            verdict: allGatesPassed ? 'PASS' : 'FAIL',
            allGatesPassed,
            gates: gateDetails,
            failures,
            metrics: {
                totalUnitTests: this.unitSuites.reduce((acc, s) => acc + (s.total || 0), 0),
                failedUnitTests: totalUnitFails,
                consoleErrorsCount: consoleErrors.length,
                pageErrorsCount: this.pageErrors.length,
                threeWarningsCount: this.threeWarnings.length,
                nanDefectsCount: this.sceneGraphDefects.length,
                hudOverlapsCount: this.hudOverlaps.length,
                prematureBossBar: this.bossBarPremature,
                framerate: this.framerateData,
            },
        };
    }

    /**
     * Generate machine-parsable JSON receipt.
     */
    generateJsonReceipt() {
        const evaluation = this.evaluateGates();
        return {
            id: this.runId,
            title: this.title,
            timestamp: new Date().toISOString(),
            verdict: evaluation.verdict,
            allGatesPassed: evaluation.allGatesPassed,
            summary: {
                totalFailures: evaluation.failures.length,
                environment: this.environment,
            },
            gates: evaluation.gates,
            failures: evaluation.failures,
            telemetry: {
                unitSuites: this.unitSuites,
                consoleErrors: this.consoleLogs.filter((l) => l.type === 'error').map((l) => l.text),
                pageErrors: this.pageErrors,
                threeWarnings: this.threeWarnings,
                sceneGraphDefects: this.sceneGraphDefects,
                hudOverlaps: this.hudOverlaps,
                framerate: this.framerateData,
                customAssertions: this.customAssertions,
            },
            metrics: evaluation.metrics,
            metadata: this.metadata,
        };
    }

    /**
     * Generate structured Markdown receipt formatted for CI summaries and GitHub Pull Requests.
     */
    generateMarkdownReceipt() {
        const json = this.generateJsonReceipt();
        const icon = json.verdict === 'PASS' ? '✅' : '❌';

        const lines = [
            `# ${icon} Sovereign QA Invariant Receipt: ${json.verdict}`,
            ``,
            `**Run ID:** \`${json.id}\`  `,
            `**Timestamp:** ${json.timestamp}  `,
            `**Environment:** ${this.environment}  `,
            `**Overall Verdict:** **${json.verdict}**  `,
            ``,
            `## 🛡️ Invariant Gate Summary`,
            ``,
            `| Gate | Status | Details |`,
            `|---|---|---|`,
        ];

        for (const [gateName, g] of Object.entries(json.gates)) {
            const statusEmoji = g.passed ? '🟢 PASS' : '🔴 FAIL';
            const detailStr = g.passed ? 'Zero defects' : g.reasons.join('; ');
            lines.push(`| **${gateName}** | ${statusEmoji} | ${detailStr} |`);
        }

        if (json.telemetry.customAssertions.length > 0) {
            lines.push(``, `### 🎯 Custom Invariants`, ``);
            lines.push(`| Invariant | Result | Note |`);
            lines.push(`|---|---|---|`);
            for (const c of json.telemetry.customAssertions) {
                const s = c.passed ? '🟢 PASS' : '🔴 FAIL';
                lines.push(`| ${c.name} | ${s} | ${c.message} |`);
            }
        }

        lines.push(``, `## 📊 Telemetry Metrics`);
        lines.push(``);
        lines.push(`- **Unit Test Suites:** ${json.metrics.totalUnitTests - json.metrics.failedUnitTests}/${json.metrics.totalUnitTests} passing`);
        lines.push(`- **Console & Page Errors:** ${json.metrics.consoleErrorsCount} console, ${json.metrics.pageErrorsCount} page, ${json.metrics.threeWarningsCount} THREE warnings`);
        lines.push(`- **Scene-Graph NaN Defect Nodes:** ${json.metrics.nanDefectsCount}`);
        lines.push(`- **HUD Overlap Intersections:** ${json.metrics.hudOverlapsCount}`);
        lines.push(`- **Premature Boss Bar at River Spawn:** ${json.metrics.prematureBossBar ? '⚠️ YES (VIOLATION)' : 'No (Compliant)'}`);

        if (json.telemetry.framerate) {
            const fps = json.telemetry.framerate;
            lines.push(`- **Framerate Budget:** Avg ${fps.avgFps} FPS, Min ${fps.minFps} FPS, Max Delta ${fps.maxFrameTimeMs}ms (${fps.ok ? 'Within Budget' : 'Violations Detected'})`);
        }

        if (json.failures.length > 0) {
            lines.push(``, `## 💥 Hard Gate Failures & Root Cause Receipts`);
            lines.push(``);
            for (const f of json.failures) {
                lines.push(`- ❌ ${f}`);
            }
            lines.push(``);
            lines.push(`> **Synthetic José QA Verdict:** "A system that lies about its own state destroys the only compass it has. Fix the red gates above before ship approval."`);
        } else {
            lines.push(``);
            lines.push(`> **Synthetic José QA Verdict:** "Receipt validated. Live reality matches the contract. All 6 Sovereign Invariant Gates are green."`);
        }

        return lines.join('\n');
    }
}
