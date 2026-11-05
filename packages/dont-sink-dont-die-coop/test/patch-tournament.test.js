import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseGitDiff,
    isPathInScope,
    auditScopeViolations,
    computeAssertionDensity,
    scorePatchCandidate,
    runPatchTournament,
    formatTournamentSummary,
    PatchTournamentScorer,
    DEFAULT_TOURNAMENT_WEIGHTS,
} from '../shared/patch-tournament.js';

describe('Deterministic Best-of-N Patch Tournament Scorer (shared/patch-tournament.js)', () => {

    describe('parseGitDiff', () => {
        it('handles empty, null, or malformed diff strings gracefully', () => {
            assert.deepEqual(parseGitDiff(''), []);
            assert.deepEqual(parseGitDiff(null), []);
            assert.deepEqual(parseGitDiff(undefined), []);
            assert.deepEqual(parseGitDiff('   \n  \n'), []);
            assert.deepEqual(parseGitDiff('Random non-diff text'), []);
        });

        it('parses single-file diff with additions and deletions', () => {
            const sampleDiff = `diff --git a/shared/test-module.js b/shared/test-module.js
index 1234567..89abcdef 100644
--- a/shared/test-module.js
+++ b/shared/test-module.js
@@ -10,3 +10,4 @@
 export function computeRaft() {
-  return 42;
+  const x = 42;
+  return x * 2;
 }`;
            const files = parseGitDiff(sampleDiff);
            assert.equal(files.length, 1);
            const f = files[0];
            assert.equal(f.path, 'shared/test-module.js');
            assert.equal(f.oldPath, 'shared/test-module.js');
            assert.equal(f.newPath, 'shared/test-module.js');
            assert.equal(f.isNew, false);
            assert.equal(f.isDeleted, false);
            assert.equal(f.isTestFile, false);
            assert.equal(f.additions, 2);
            assert.equal(f.deletions, 1);
            assert.deepEqual(f.addedLines, ['  const x = 42;', '  return x * 2;']);
            assert.deepEqual(f.deletedLines, ['  return 42;']);
        });

        it('parses multiple files including new test files and deletions', () => {
            const multiDiff = `diff --git a/shared/new-file.js b/shared/new-file.js
new file mode 100644
--- /dev/null
+++ b/shared/new-file.js
@@ -0,0 +1,2 @@
+export const K = 100;
+export function getK() { return K; }
diff --git a/test/new-file.test.js b/test/new-file.test.js
new file mode 100644
--- /dev/null
+++ b/test/new-file.test.js
@@ -0,0 +1,3 @@
+import assert from 'node:assert/strict';
+import { getK } from '../shared/new-file.js';
+assert.equal(getK(), 100);
diff --git a/legacy.js b/legacy.js
deleted file mode 100644
--- a/legacy.js
+++ /dev/null
@@ -1,2 +0,0 @@
-const old = 1;
-module.exports = old;`;

            const files = parseGitDiff(multiDiff);
            assert.equal(files.length, 3);

            assert.equal(files[0].path, 'shared/new-file.js');
            assert.equal(files[0].isNew, true);
            assert.equal(files[0].isTestFile, false);
            assert.equal(files[0].additions, 2);

            assert.equal(files[1].path, 'test/new-file.test.js');
            assert.equal(files[1].isNew, true);
            assert.equal(files[1].isTestFile, true);
            assert.equal(files[1].additions, 3);

            assert.equal(files[2].path, 'legacy.js');
            assert.equal(files[2].isDeleted, true);
            assert.equal(files[2].deletions, 2);
        });
    });

    describe('isPathInScope & auditScopeViolations', () => {
        it('accepts all files when scopedPaths is empty', () => {
            assert.equal(isPathInScope('anything.js', []), true);
            const audit = auditScopeViolations([{ path: 'a.js' }, { path: 'b.js' }], []);
            assert.equal(audit.isCompliant, true);
            assert.equal(audit.inScopeFiles.length, 2);
            assert.equal(audit.outOfScopeFiles.length, 0);
        });

        it('accurately matches exact paths, directory wildcards, and globs', () => {
            const scoped = [
                'shared/patch-tournament.js',
                'test/patch-tournament.test.js',
                'public/js/vfx/*',
                'docs/**',
            ];

            assert.equal(isPathInScope('shared/patch-tournament.js', scoped), true);
            assert.equal(isPathInScope('./shared/patch-tournament.js', scoped), true);
            assert.equal(isPathInScope('test/patch-tournament.test.js', scoped), true);
            assert.equal(isPathInScope('public/js/vfx/flames.js', scoped), true);
            assert.equal(isPathInScope('docs/architecture/spec.md', scoped), true);

            // Out-of-scope files
            assert.equal(isPathInScope('server.js', scoped), false);
            assert.equal(isPathInScope('shared/scene-watchdog.js', scoped), false);
            assert.equal(isPathInScope('package.json', scoped), false);
        });

        it('audits scope violations and segregates compliant vs collateral files', () => {
            const diffFiles = [
                { path: 'shared/patch-tournament.js' },
                { path: 'test/patch-tournament.test.js' },
                { path: 'server.js' },
                { path: 'public/index.html' },
            ];
            const scoped = ['shared/patch-tournament.js', 'test/patch-tournament.test.js'];

            const audit = auditScopeViolations(diffFiles, scoped);
            assert.equal(audit.isCompliant, false);
            assert.deepEqual(audit.inScopeFiles, ['shared/patch-tournament.js', 'test/patch-tournament.test.js']);
            assert.deepEqual(audit.outOfScopeFiles, ['server.js', 'public/index.html']);
        });
    });

    describe('computeAssertionDensity', () => {
        it('returns zero density when no test files are touched', () => {
            const diffFiles = [
                { path: 'shared/math.js', isTestFile: false, addedLines: ['assert.equal(1, 1)'] },
            ];
            const stats = computeAssertionDensity(diffFiles);
            assert.equal(stats.testFilesCount, 0);
            assert.equal(stats.totalAssertions, 0);
            assert.equal(stats.assertionDensity, 0);
        });

        it('detects multiple assertion styles and computes assertion density', () => {
            const diffFiles = [
                {
                    path: 'test/component.test.js',
                    isTestFile: true,
                    addedLines: [
                        'import assert from "node:assert/strict";', // non-assertion code
                        '// comment line to skip',
                        '/* multi-line comment */',
                        'describe("component", () => {',
                        '  it("verifies state", () => {',
                        '    assert.equal(state.ok, true);',           // assertion 1
                        '    assert.strictEqual(state.count, 5);',     // assertion 2
                        '    assert.deepEqual(state.items, [1, 2]);',  // assertion 3
                        '    expect(result).toBe(true);',              // assertion 4
                        '    assert(result !== null);',                // assertion 5
                        '  });',
                        '});',
                    ],
                },
            ];

            const stats = computeAssertionDensity(diffFiles);
            assert.equal(stats.testFilesCount, 1);
            assert.equal(stats.totalAssertions, 5);
            // Added test lines excluding empty/comment lines:
            // "import...", "describe...", "it...", 5 assertions, "});", "});" = 10 lines
            assert.equal(stats.totalTestAdditions, 10);
            assert.equal(stats.assertionDensity, 0.5);
        });
    });

    describe('scorePatchCandidate', () => {
        const sampleCleanDiff = `diff --git a/shared/patch-tournament.js b/shared/patch-tournament.js
new file mode 100644
--- /dev/null
+++ b/shared/patch-tournament.js
@@ -0,0 +1,10 @@
+export function tournament() { return 1; }
diff --git a/test/patch-tournament.test.js b/test/patch-tournament.test.js
new file mode 100644
--- /dev/null
+++ b/test/patch-tournament.test.js
@@ -0,0 +1,6 @@
+import assert from 'node:assert/strict';
+import { tournament } from '../shared/patch-tournament.js';
+assert.equal(tournament(), 1);
+assert.strictEqual(typeof tournament, 'function');
+assert.ok(true);
+assert.deepEqual([1], [1]);
+`;

        it('scores a pristine candidate with 100% test pass, QA sniper pass, and scope compliance', () => {
            const candidate = {
                id: 'jules-session-alpha',
                sessionId: '1001',
                diff: sampleCleanDiff,
                testResults: { total: 20, passed: 20, failed: 0 },
                qaHelmetResult: { passed: true },
            };

            const scopedPaths = ['shared/patch-tournament.js', 'test/patch-tournament.test.js'];
            const res = scorePatchCandidate(candidate, { scopedPaths });

            assert.equal(res.id, 'jules-session-alpha');
            assert.equal(res.disqualified, false);
            assert.equal(res.metrics.testPassRate, 1.0);
            assert.equal(res.metrics.qaHelmetPassed, true);
            assert.equal(res.metrics.isScopeCompliant, true);
            assert.equal(res.metrics.outOfScopeFilesCount, 0);
            assert.ok(res.scores.testScore === 400);
            assert.ok(res.scores.helmetScore === 300);
            assert.ok(res.scores.scopeScore === 200);
            assert.ok(res.scores.assertionScore > 0);
            assert.ok(res.totalScore >= 900);
        });

        it('penalizes out-of-scope modifications without strict disqualification', () => {
            const dirtyDiff = sampleCleanDiff + `\ndiff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -1,1 +1,2 @@
+// collateral modification
`;
            const candidate = {
                id: 'jules-session-beta',
                diff: dirtyDiff,
                testResults: { total: 10, passed: 10, failed: 0 },
                qaHelmetResult: true,
            };

            const scopedPaths = ['shared/patch-tournament.js', 'test/patch-tournament.test.js'];
            const res = scorePatchCandidate(candidate, { scopedPaths, strictScopeDisqualification: false });

            assert.equal(res.disqualified, false);
            assert.equal(res.metrics.isScopeCompliant, false);
            assert.equal(res.metrics.outOfScopeFilesCount, 1);
            // Scope score reduced by 150 penalty
            assert.equal(res.scores.scopeScore, 50); // 200 - 150 = 50
        });

        it('strictly disqualifies candidate if strictScopeDisqualification is true and collateral files modified', () => {
            const dirtyDiff = sampleCleanDiff + `\ndiff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -1,1 +1,2 @@
+// rogue change
`;
            const candidate = {
                id: 'jules-session-gamma',
                diff: dirtyDiff,
                testResults: { total: 10, passed: 10, failed: 0 },
                qaHelmetResult: true,
            };

            const scopedPaths = ['shared/patch-tournament.js', 'test/patch-tournament.test.js'];
            const res = scorePatchCandidate(candidate, { scopedPaths, strictScopeDisqualification: true });

            assert.equal(res.disqualified, true);
            assert.equal(res.totalScore, 0);
            assert.ok(res.disqualificationReason.includes('server.js'));
        });

        it('handles failing tests and crashing test suites', () => {
            const candidateA = {
                id: 'failing-candidate',
                diff: sampleCleanDiff,
                testResults: { total: 10, passed: 5, failed: 5 },
                qaHelmetResult: false,
            };
            const resA = scorePatchCandidate(candidateA);
            assert.equal(resA.metrics.testPassRate, 0.5);
            assert.equal(resA.scores.testScore, 200); // 0.5 * 400

            const candidateCrashed = {
                id: 'crashed-candidate',
                diff: sampleCleanDiff,
                testResults: { total: 0, passed: 0, failed: 1, crashed: true },
                qaHelmetResult: false,
            };
            const resCrash = scorePatchCandidate(candidateCrashed);
            assert.equal(resCrash.metrics.testPassRate, 0.0);
            assert.equal(resCrash.scores.testScore, 0);
        });

        it('handles gate object representation in qaHelmetResult', () => {
            const candidate = {
                id: 'partial-qa-candidate',
                diff: sampleCleanDiff,
                testResults: { total: 10, passed: 10, failed: 0 },
                qaHelmetResult: {
                    passed: false,
                    gates: {
                        G1: { passed: true },
                        G2: { passed: true },
                        G3: { passed: false },
                        G4: { passed: true },
                    },
                },
            };
            const res = scorePatchCandidate(candidate);
            assert.equal(res.metrics.qaHelmetPassed, false);
            assert.equal(res.metrics.helmetPassRatio, 0.75);
            assert.equal(res.scores.helmetScore, 225); // 0.75 * 300
        });
    });

    describe('runPatchTournament & PatchTournamentScorer', () => {
        it('ranks candidates deterministically and picks the superior patch as winner', () => {
            const scopedPaths = ['shared/feature.js', 'test/feature.test.js'];

            const candSuperior = {
                id: 'candidate-superior',
                diff: `diff --git a/shared/feature.js b/shared/feature.js
new file mode 100644
+++ b/shared/feature.js
@@ -0,0 +1,5 @@
+export const run = () => true;
diff --git a/test/feature.test.js b/test/feature.test.js
new file mode 100644
+++ b/test/feature.test.js
@@ -0,0 +1,5 @@
+import assert from 'node:assert/strict';
+assert.ok(true);
+assert.equal(1, 1);
+`,
                testResults: { total: 50, passed: 50, failed: 0 },
                qaHelmetResult: { passed: true },
            };

            const candFlaky = {
                id: 'candidate-flaky',
                diff: `diff --git a/shared/feature.js b/shared/feature.js
new file mode 100644
+++ b/shared/feature.js
@@ -0,0 +1,5 @@
+export const run = () => false;
diff --git a/test/feature.test.js b/test/feature.test.js
new file mode 100644
+++ b/test/feature.test.js
@@ -0,0 +1,3 @@
+import assert from 'node:assert/strict';
+assert.ok(true);
+`,
                testResults: { total: 50, passed: 45, failed: 5 },
                qaHelmetResult: { passed: false },
            };

            const candCollateral = {
                id: 'candidate-collateral',
                diff: `diff --git a/shared/feature.js b/shared/feature.js
new file mode 100644
+++ b/shared/feature.js
@@ -0,0 +1,2 @@
+export const x = 1;
diff --git a/unrelated-leak.js b/unrelated-leak.js
new file mode 100644
+++ b/unrelated-leak.js
@@ -0,0 +1,10 @@
+// collateral junk
+`,
                testResults: { total: 50, passed: 50, failed: 0 },
                qaHelmetResult: { passed: true },
            };

            const tournament = runPatchTournament([candFlaky, candSuperior, candCollateral], {
                taskId: 'engineer-11-automated-jules-wave-orchestrator',
                scopedPaths,
            });

            assert.equal(tournament.totalCandidates, 3);
            assert.equal(tournament.winner.id, 'candidate-superior');
            assert.equal(tournament.rankedCandidates[0].id, 'candidate-superior');
            assert.equal(tournament.rankedCandidates[0].rank, 1);

            // Collateral has out of scope file penalty, flaky has failed tests
            assert.ok(tournament.rankedCandidates[0].totalScore > tournament.rankedCandidates[1].totalScore);
            assert.ok(tournament.summaryMarkdown.includes('🏆 Sovereign Patch Tournament Receipt'));
            assert.ok(tournament.summaryMarkdown.includes('candidate-superior'));
        });

        it('breaks exact score ties deterministically by test pass rate, QA helmet, scope, and lines changed', () => {
            const diffA = `diff --git a/shared/f.js b/shared/f.js
new file mode 100644
+++ b/shared/f.js
@@ -0,0 +1,1 @@
+x
diff --git a/test/f.test.js b/test/f.test.js
new file mode 100644
+++ b/test/f.test.js
@@ -0,0 +1,2 @@
+assert.ok(1);
+`;
            const diffB = diffA + '+ extra line\n';

            const candA = {
                id: 'cand-A',
                diff: diffA,
                testResults: { total: 10, passed: 10, failed: 0 },
                qaHelmetResult: true,
            };
            const candB = {
                id: 'cand-B',
                diff: diffB,
                testResults: { total: 10, passed: 10, failed: 0 },
                qaHelmetResult: true,
            };

            const res = runPatchTournament([candB, candA], { scopedPaths: ['shared/f.js', 'test/f.test.js'] });
            // candA is more economical (fewer lines changed)
            assert.equal(res.winner.id, 'cand-A');
        });

        it('operates via PatchTournamentScorer class wrapper', () => {
            const scorer = new PatchTournamentScorer({
                taskId: 'class-test',
                scopedPaths: ['shared/target.js'],
                strictScopeDisqualification: true,
            });

            scorer.addCandidate({
                id: 'cand-clean',
                diff: `diff --git a/shared/target.js b/shared/target.js
new file mode 100644
+++ b/shared/target.js
@@ -0,0 +1,1 @@
+export const v = 1;
`,
                testResults: { total: 5, passed: 5, failed: 0 },
                qaHelmetResult: true,
            });

            scorer.addCandidate({
                id: 'cand-dirty',
                diff: `diff --git a/unauthorized.js b/unauthorized.js
new file mode 100644
+++ b/unauthorized.js
@@ -0,0 +1,1 @@
+leak
`,
                testResults: { total: 5, passed: 5, failed: 0 },
                qaHelmetResult: true,
            });

            const results = scorer.evaluate();
            assert.equal(results.totalCandidates, 2);
            assert.equal(results.winner.id, 'cand-clean');
            assert.equal(results.rankedCandidates[1].disqualified, true);
        });

        it('handles tournament with zero candidates gracefully', () => {
            const res = runPatchTournament([], { taskId: 'empty-test' });
            assert.equal(res.totalCandidates, 0);
            assert.equal(res.winner, null);
            assert.deepEqual(res.rankedCandidates, []);
            assert.ok(res.summaryMarkdown.includes('None'));
        });
    });
});
