/**
 * Don't Sink, Don't Die — Deterministic Best-of-N Patch Tournament Scorer
 * (Helmet 02 — Synthetic José RTS Flight Engineer / Wave Orchestrator)
 *
 * Architectural Intent & Sovereign Core Directive:
 * - Parallel Jules cloud sessions generate N candidate patches for a task.
 * - This module coldly, deterministically scores and ranks candidates without human bias or fake tests:
 *   1. Test Pass Rate: Ratio of passed tests / total tests executed (must be >= 1.0 for top tier).
 *   2. QA Helmet Sniper Gate Pass: Binary or proportional pass of Sovereign QA gates (G1-G6).
 *   3. Zero Collateral File Modifications: Strict penalty or hard disqualification if files outside
 *      the task's declared scoped paths are modified.
 *   4. Test Assertion Density: Assesses test rigor by measuring assertion density
 *      (assert.*, expect, etc.) per added test line, penalizing vacuous/mock-only tests.
 *   5. Diff Economy / Compactness: Rewards tight, high-leverage solutions over bloated diffs.
 * - Pure, zero external dependencies, headless-safe, and 100% deterministic.
 */

export const DEFAULT_TOURNAMENT_WEIGHTS = {
    testPassWeight: 400.0,       // Max 400 pts for 100% test pass
    qaHelmetWeight: 300.0,       // Max 300 pts for QA Helmet Sniper pass
    scopeComplianceWeight: 200.0,// Max 200 pts for zero collateral modifications
    assertionDensityWeight: 100.0,// Max 100 pts for high test assertion density
    diffEconomyBonusMax: 20.0,   // Up to +20 pts for compact, focused diffs
    outOfScopePenaltyPerFile: 150.0, // Heavy penalty per collateral file modified
};

/**
 * Standard assertion regex patterns for JavaScript/Node.js/Playwright testing.
 */
const ASSERTION_PATTERNS = [
    /\bassert\s*\./,
    /\bassert\s*\(/,
    /\bexpect\s*\(/,
    /\btoBe\s*\(/,
    /\btoEqual\s*\(/,
    /\btoStrictEqual\s*\(/,
    /\bassert\.(equal|strictEqual|deepEqual|deepStrictEqual|ok|match|throws|rejects|notEqual|doesNotThrow)\b/,
    /\btest\.(ok|equal|same)\b/,
];

/**
 * Parses a standard unified git diff into structured file entries.
 *
 * @param {string} diffText - Raw git diff string.
 * @returns {Array<{
 *   oldPath: string|null,
 *   newPath: string|null,
 *   isNew: boolean,
 *   isDeleted: boolean,
 *   additions: number,
 *   deletions: number,
 *   addedLines: string[],
 *   deletedLines: string[],
 *   isTestFile: boolean
 * }>}
 */
export function parseGitDiff(diffText = '') {
    if (typeof diffText !== 'string' || !diffText.trim()) {
        return [];
    }

    const files = [];
    const lines = diffText.split(/\r?\n/);
    let currentFile = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('diff --git ')) {
            if (currentFile) {
                files.push(finalizeDiffFile(currentFile));
            }
            const parts = line.split(' ');
            const rawA = parts[2] ? parts[2].replace(/^a\//, '') : null;
            const rawB = parts[3] ? parts[3].replace(/^b\//, '') : null;
            currentFile = {
                oldPath: rawA,
                newPath: rawB,
                isNew: false,
                isDeleted: false,
                additions: 0,
                deletions: 0,
                addedLines: [],
                deletedLines: [],
            };
            continue;
        }

        if (!currentFile) continue;

        if (line.startsWith('new file mode ')) {
            currentFile.isNew = true;
        } else if (line.startsWith('deleted file mode ')) {
            currentFile.isDeleted = true;
        } else if (line.startsWith('--- ')) {
            const p = line.slice(4).trim().replace(/^a\//, '');
            if (p !== '/dev/null') currentFile.oldPath = p;
            else currentFile.isNew = true;
        } else if (line.startsWith('+++ ')) {
            const p = line.slice(4).trim().replace(/^b\//, '');
            if (p !== '/dev/null') currentFile.newPath = p;
            else currentFile.isDeleted = true;
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
            currentFile.additions++;
            currentFile.addedLines.push(line.slice(1));
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            currentFile.deletions++;
            currentFile.deletedLines.push(line.slice(1));
        }
    }

    if (currentFile) {
        files.push(finalizeDiffFile(currentFile));
    }

    return files;
}

function finalizeDiffFile(fileEntry) {
    const filePath = fileEntry.newPath || fileEntry.oldPath || '';
    const isTestFile = /(^|\/)test\/|\.test\.[a-z]+$|\.spec\.[a-z]+$/i.test(filePath);
    return {
        ...fileEntry,
        path: filePath,
        isTestFile,
    };
}

/**
 * Checks path matching against allowed scope patterns or paths.
 * Supports exact paths, directory prefixes, and glob wildcards (*, **).
 *
 * @param {string} filePath - Path from diff.
 * @param {string[]} scopedPaths - Array of scoped path patterns.
 * @returns {boolean} True if filePath falls within scopedPaths.
 */
export function isPathInScope(filePath, scopedPaths = []) {
    if (!scopedPaths || scopedPaths.length === 0) {
        // If no scoped paths defined, everything is considered in scope
        return true;
    }

    const normTarget = filePath.replace(/\\/g, '/').replace(/^\.\//, '');

    for (const pattern of scopedPaths) {
        const normPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '');

        if (normTarget === normPattern) {
            return true;
        }

        // Directory match: pattern ends with / or is a dir prefix
        if (normPattern.endsWith('/')) {
            if (normTarget.startsWith(normPattern)) return true;
        } else if (normTarget.startsWith(normPattern + '/')) {
            return true;
        }

        // Glob matching: convert simple wildcard to regex
        if (normPattern.includes('*')) {
            const regexStr = '^' + normPattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '.*')
                .replace(/(?<!\.)\*/g, '[^/]*') + '$';
            try {
                if (new RegExp(regexStr).test(normTarget)) {
                    return true;
                }
            } catch {}
        }
    }

    return false;
}

/**
 * Audits modified files in diff against scoped paths.
 *
 * @param {Array<{ path: string }>} diffFiles
 * @param {string[]} scopedPaths
 * @returns {{ inScopeFiles: string[], outOfScopeFiles: string[], isCompliant: boolean }}
 */
export function auditScopeViolations(diffFiles = [], scopedPaths = []) {
    const inScopeFiles = [];
    const outOfScopeFiles = [];

    for (const f of diffFiles) {
        const p = f.path;
        if (!p) continue;
        if (isPathInScope(p, scopedPaths)) {
            inScopeFiles.push(p);
        } else {
            outOfScopeFiles.push(p);
        }
    }

    return {
        inScopeFiles,
        outOfScopeFiles,
        isCompliant: outOfScopeFiles.length === 0,
    };
}

/**
 * Measures test assertion density across all modified test files in a patch.
 *
 * @param {Array<{ path: string, isTestFile: boolean, addedLines: string[] }>} diffFiles
 * @returns {{
 *   totalTestAdditions: number,
 *   totalAssertions: number,
 *   assertionDensity: number,
 *   testFilesCount: number
 * }}
 */
export function computeAssertionDensity(diffFiles = []) {
    let totalTestAdditions = 0;
    let totalAssertions = 0;
    let testFilesCount = 0;

    for (const f of diffFiles) {
        if (!f.isTestFile) continue;
        testFilesCount++;

        for (const line of f.addedLines || []) {
            const trimmed = line.trim();
            // Skip empty lines or pure comments
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                continue;
            }
            totalTestAdditions++;

            for (const pattern of ASSERTION_PATTERNS) {
                if (pattern.test(line)) {
                    totalAssertions++;
                    break;
                }
            }
        }
    }

    const assertionDensity = totalTestAdditions > 0
        ? Number((totalAssertions / totalTestAdditions).toFixed(4))
        : 0;

    return {
        totalTestAdditions,
        totalAssertions,
        assertionDensity,
        testFilesCount,
    };
}

/**
 * Scores an individual Jules patch candidate based on the tournament rubrics.
 *
 * @param {object} candidate - Patch candidate object:
 *   - id: string
 *   - sessionId?: string
 *   - diff: string
 *   - testResults?: { total: number, passed: number, failed: number, crashed?: boolean }
 *   - qaHelmetResult?: { passed: boolean, gates?: object, score?: number }
 * @param {object} context - Tournament context:
 *   - scopedPaths?: string[]
 *   - weights?: object
 *   - strictScopeDisqualification?: boolean
 * @returns {object} Scored candidate details.
 */
export function scorePatchCandidate(candidate = {}, context = {}) {
    const candidateId = candidate.id || candidate.sessionId || 'anonymous-candidate';
    const rawDiff = candidate.diff || '';
    const scopedPaths = context.scopedPaths || [];
    const weights = { ...DEFAULT_TOURNAMENT_WEIGHTS, ...(context.weights || {}) };
    const strictDisqualify = context.strictScopeDisqualification ?? false;

    // 1. Parse diff
    const parsedFiles = parseGitDiff(rawDiff);
    const totalAdditions = parsedFiles.reduce((acc, f) => acc + (f.additions || 0), 0);
    const totalDeletions = parsedFiles.reduce((acc, f) => acc + (f.deletions || 0), 0);
    const totalLinesChanged = totalAdditions + totalDeletions;

    // 2. Audit Scope Violations (Collateral Modifications)
    const scopeAudit = auditScopeViolations(parsedFiles, scopedPaths);
    const outOfScopeCount = scopeAudit.outOfScopeFiles.length;
    let scopeScore = 0;
    let disqualified = false;
    let disqualificationReason = null;

    if (strictDisqualify && !scopeAudit.isCompliant) {
        disqualified = true;
        disqualificationReason = `Modified ${outOfScopeCount} collateral out-of-scope file(s): ${scopeAudit.outOfScopeFiles.join(', ')}`;
    } else {
        const rawScopeScore = weights.scopeComplianceWeight - (outOfScopeCount * weights.outOfScopePenaltyPerFile);
        scopeScore = Math.max(0, rawScopeScore);
    }

    // 3. Test Pass Rate Evaluation
    const testRes = candidate.testResults || { total: 0, passed: 0, failed: 0 };
    const totalTests = testRes.total || (testRes.passed || 0) + (testRes.failed || 0);
    const passedTests = testRes.passed || 0;
    const testCrashed = Boolean(testRes.crashed || testRes.failed > 0 && totalTests === 0);

    let testPassRate = 0;
    if (!testCrashed && totalTests > 0) {
        testPassRate = Math.min(1.0, Math.max(0, passedTests / totalTests));
    }
    const testScore = testPassRate * weights.testPassWeight;

    // 4. QA Helmet Sniper Gate Pass Evaluation
    const helmetRes = candidate.qaHelmetResult;
    let qaHelmetPassed = false;
    let helmetPassRatio = 0;

    if (helmetRes) {
        if (typeof helmetRes === 'boolean') {
            qaHelmetPassed = helmetRes;
            helmetPassRatio = helmetRes ? 1.0 : 0.0;
        } else if (typeof helmetRes === 'object') {
            qaHelmetPassed = Boolean(helmetRes.passed);
            if (helmetRes.passed) {
                helmetPassRatio = 1.0;
            } else if (helmetRes.gates && typeof helmetRes.gates === 'object') {
                const gateKeys = Object.keys(helmetRes.gates);
                if (gateKeys.length > 0) {
                    const passedCount = gateKeys.filter((k) => helmetRes.gates[k]?.passed).length;
                    helmetPassRatio = passedCount / gateKeys.length;
                }
            } else if (typeof helmetRes.score === 'number') {
                helmetPassRatio = Math.max(0, Math.min(1, helmetRes.score));
            }
        }
    }
    const helmetScore = helmetPassRatio * weights.qaHelmetWeight;

    // 5. Test Assertion Density Evaluation
    const densityStats = computeAssertionDensity(parsedFiles);
    // Ideal density is around 0.15 - 0.50 (1 assertion per 2 to 6 lines of test code)
    // Scale density from 0 to 1 with cap at 0.40
    const densityFactor = densityStats.totalAssertions > 0
        ? Math.min(1.0, densityStats.assertionDensity / 0.35)
        : 0;
    const assertionScore = densityFactor * weights.assertionDensityWeight;

    // 6. Diff Economy & Compactness Bonus
    // Compact diff with high test coverage receives up to diffEconomyBonusMax
    let economyBonus = 0;
    if (totalLinesChanged > 0 && testPassRate >= 1.0 && qaHelmetPassed) {
        // Between 20 and 500 lines is optimal
        if (totalLinesChanged >= 15 && totalLinesChanged <= 600) {
            economyBonus = weights.diffEconomyBonusMax * (1 - (totalLinesChanged / 1200));
        } else if (totalLinesChanged > 600) {
            economyBonus = Math.max(0, weights.diffEconomyBonusMax * 0.2);
        }
    }
    economyBonus = Number(Math.max(0, economyBonus).toFixed(2));

    // Total Score Computation
    let totalScore = 0;
    if (!disqualified) {
        totalScore = Number((testScore + helmetScore + scopeScore + assertionScore + economyBonus).toFixed(2));
    }

    return {
        id: candidateId,
        sessionId: candidate.sessionId || null,
        totalScore,
        disqualified,
        disqualificationReason,
        metrics: {
            testPassRate: Number(testPassRate.toFixed(4)),
            totalTests,
            passedTests,
            qaHelmetPassed,
            helmetPassRatio: Number(helmetPassRatio.toFixed(4)),
            isScopeCompliant: scopeAudit.isCompliant,
            outOfScopeFilesCount: outOfScopeCount,
            assertionDensity: densityStats.assertionDensity,
            totalAssertions: densityStats.totalAssertions,
            totalTestAdditions: densityStats.totalTestAdditions,
            totalLinesChanged,
            totalAdditions,
            totalDeletions,
        },
        scores: {
            testScore: Number(testScore.toFixed(2)),
            helmetScore: Number(helmetScore.toFixed(2)),
            scopeScore: Number(scopeScore.toFixed(2)),
            assertionScore: Number(assertionScore.toFixed(2)),
            economyBonus,
        },
        scopeAudit,
        parsedFiles,
    };
}

/**
 * Runs a deterministic Best-of-N patch tournament across an array of candidate diffs.
 *
 * @param {Array<object>} candidates - Array of patch candidates.
 * @param {object} context - Tournament context:
 *   - taskId?: string
 *   - scopedPaths?: string[]
 *   - weights?: object
 *   - strictScopeDisqualification?: boolean
 * @returns {{
 *   taskId: string,
 *   winner: object|null,
 *   rankedCandidates: object[],
 *   totalCandidates: number,
 *   qualifiedCount: number,
 *   summaryMarkdown: string
 * }}
 */
export function runPatchTournament(candidates = [], context = {}) {
    const taskId = context.taskId || 'tournament-task';
    const list = Array.isArray(candidates) ? candidates : [];

    const scoredList = list.map((cand) => scorePatchCandidate(cand, context));

    // Deterministic sorting with strict tie-breaking:
    // 1. Non-disqualified over disqualified
    // 2. Highest totalScore
    // 3. Highest testPassRate
    // 4. QA Helmet Passed (true > false)
    // 5. Zero out-of-scope files
    // 6. Higher assertion density
    // 7. Lower totalLinesChanged (more economical diff)
    // 8. Deterministic string id comparison
    scoredList.sort((a, b) => {
        if (a.disqualified !== b.disqualified) {
            return a.disqualified ? 1 : -1;
        }
        if (b.totalScore !== a.totalScore) {
            return b.totalScore - a.totalScore;
        }
        if (b.metrics.testPassRate !== a.metrics.testPassRate) {
            return b.metrics.testPassRate - a.metrics.testPassRate;
        }
        if (a.metrics.qaHelmetPassed !== b.metrics.qaHelmetPassed) {
            return a.metrics.qaHelmetPassed ? -1 : 1;
        }
        if (a.metrics.outOfScopeFilesCount !== b.metrics.outOfScopeFilesCount) {
            return a.metrics.outOfScopeFilesCount - b.metrics.outOfScopeFilesCount;
        }
        if (b.metrics.assertionDensity !== a.metrics.assertionDensity) {
            return b.metrics.assertionDensity - a.metrics.assertionDensity;
        }
        if (a.metrics.totalLinesChanged !== b.metrics.totalLinesChanged) {
            return a.metrics.totalLinesChanged - b.metrics.totalLinesChanged;
        }
        return String(a.id).localeCompare(String(b.id));
    });

    // Assign final ranks
    const rankedCandidates = scoredList.map((cand, idx) => ({
        rank: idx + 1,
        ...cand,
    }));

    const qualified = rankedCandidates.filter((c) => !c.disqualified);
    const winner = qualified.length > 0 ? qualified[0] : (rankedCandidates[0] || null);

    const summaryMarkdown = formatTournamentSummary({
        taskId,
        winner,
        rankedCandidates,
        totalCandidates: list.length,
        qualifiedCount: qualified.length,
    });

    return {
        taskId,
        winner,
        rankedCandidates,
        totalCandidates: list.length,
        qualifiedCount: qualified.length,
        summaryMarkdown,
    };
}

/**
 * Formats a clean Markdown receipt summary of the patch tournament for logs/PRs.
 */
export function formatTournamentSummary(result) {
    const lines = [
        `# 🏆 Sovereign Patch Tournament Receipt: ${result.taskId}`,
        ``,
        `**Total Candidates:** ${result.totalCandidates} | **Qualified:** ${result.qualifiedCount}`,
        result.winner
            ? `**Winning Candidate:** \`${result.winner.id}\` (Score: ${result.winner.totalScore} pts, Rank #1)`
            : `**Winning Candidate:** None`,
        ``,
        `## 📊 Candidate Leaderboard`,
        ``,
        `| Rank | Candidate ID | Score | Test Pass | QA Helmet | Scope Clean | Assertions | Diff (+/-) | Status |`,
        `|---|---|---|---|---|---|---|---|---|`,
    ];

    for (const c of result.rankedCandidates) {
        const testPassPct = `${(c.metrics.testPassRate * 100).toFixed(0)}% (${c.metrics.passedTests}/${c.metrics.totalTests})`;
        const helmetEmoji = c.metrics.qaHelmetPassed ? '🟢 PASS' : '🔴 FAIL';
        const scopeEmoji = c.metrics.isScopeCompliant ? '🟢 0 Violations' : `🔴 ${c.metrics.outOfScopeFilesCount} collateral`;
        const diffSummary = `+${c.metrics.totalAdditions}/-${c.metrics.totalDeletions}`;
        const status = c.disqualified ? `❌ Disqualified (${c.disqualificationReason})` : '✅ Qualified';

        lines.push(
            `| #${c.rank} | \`${c.id}\` | **${c.totalScore}** | ${testPassPct} | ${helmetEmoji} | ${scopeEmoji} | ${c.metrics.totalAssertions} (${c.metrics.assertionDensity}) | ${diffSummary} | ${status} |`
        );
    }

    lines.push(``);
    lines.push(`> **Synthetic José RTS Commander Verdict:** "Tournament selection locked deterministically. No fake tests or silent stalls."`);

    return lines.join('\n');
}

/**
 * PatchTournamentScorer class wrapper for stateful or workflow integration.
 */
export class PatchTournamentScorer {
    constructor(options = {}) {
        this.taskId = options.taskId || 'default-tournament';
        this.scopedPaths = options.scopedPaths || [];
        this.weights = { ...DEFAULT_TOURNAMENT_WEIGHTS, ...(options.weights || {}) };
        this.strictScopeDisqualification = options.strictScopeDisqualification ?? false;
        this.candidates = [];
    }

    addCandidate(candidate) {
        if (candidate && typeof candidate === 'object') {
            this.candidates.push(candidate);
        }
        return this;
    }

    addCandidates(candidateList) {
        if (Array.isArray(candidateList)) {
            for (const c of candidateList) this.addCandidate(c);
        }
        return this;
    }

    setScopedPaths(paths) {
        this.scopedPaths = Array.isArray(paths) ? paths : [];
        return this;
    }

    evaluate() {
        return runPatchTournament(this.candidates, {
            taskId: this.taskId,
            scopedPaths: this.scopedPaths,
            weights: this.weights,
            strictScopeDisqualification: this.strictScopeDisqualification,
        });
    }
}
