/**
 * Automated Module Dependency Graph & Intent Boundary Validator
 * (`shared/architecture-validator.js`)
 *
 * Enforces Helmet 02's "Partition the Fog of War" and Selective Blindness rules:
 *   1. Scans shared/ and public/js/ modules to build an authoritative dependency graph.
 *   2. Verifies shared/ pure modules have ZERO un-guarded DOM/window/document or global Three.js leaks.
 *   3. Verifies ZERO circular dependencies across module dependency trees.
 *   4. Enforces strict layer boundaries: shared/ modules must never import from public/ (except designated test/QA bridges if allowed, with warnings/flags).
 *   5. Validates presence and structure of Architectural Intent Headers ("Why this exists").
 *   6. Generates a crisp, human-readable module boundary map and machine-parsable JSON artifact.
 *
 * Zero external dependencies. Pure, deterministic, headless-safe ES module.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Standard module architectural layers in the Don't Sink, Don't Die codebase.
 */
export const ARCHITECTURAL_LAYERS = Object.freeze({
    SHARED_CORE: 'shared_core',       // Pure math, simulation rules, deterministic logic, zero DOM/Three.js
    PUBLIC_UI: 'public_ui',           // 2D DOM/HUD, menus, overlays, dialogs
    PUBLIC_VFX: 'public_vfx',         // Screen shaders, visual effects, wake ribbons, camera intro
    PUBLIC_WORLD: 'public_world',     // Procedural environment, biomes, landmarks, weather, hazards mesh
    PUBLIC_ENTITIES: 'public_entities', // Raft rigs, enemy meshes, loot models, boss mesh
    PUBLIC_AUDIO: 'public_audio',     // WebAudio engines, music player
    PUBLIC_CONTROLS: 'public_controls', // DOM/Gamepad input management
    PUBLIC_MODES: 'public_modes',     // Mode orchestration (e.g. splitscreen)
    PUBLIC_CORE: 'public_core',       // Client entrypoint (main.js, aaa-visuals, fever-director)
    UNKNOWN: 'unknown',
});

/**
 * Rules and allowed dependencies between layers.
 */
export const LAYER_CONSTRAINTS = Object.freeze({
    // shared_core may only depend on shared_core (strict purity)
    [ARCHITECTURAL_LAYERS.SHARED_CORE]: [ARCHITECTURAL_LAYERS.SHARED_CORE],
});

/**
 * Classifies a file path into its architectural layer.
 *
 * @param {string} relativePath - Relative path with forward slashes (e.g. "shared/game-core.js")
 * @returns {string} Architectural layer key
 */
export function classifyModuleLayer(relativePath) {
    const norm = relativePath.replace(/\\/g, '/');
    if (norm.startsWith('shared/')) {
        return ARCHITECTURAL_LAYERS.SHARED_CORE;
    }
    if (norm.startsWith('public/js/ui/')) return ARCHITECTURAL_LAYERS.PUBLIC_UI;
    if (norm.startsWith('public/js/vfx/')) return ARCHITECTURAL_LAYERS.PUBLIC_VFX;
    if (norm.startsWith('public/js/world/')) return ARCHITECTURAL_LAYERS.PUBLIC_WORLD;
    if (norm.startsWith('public/js/entities/')) return ARCHITECTURAL_LAYERS.PUBLIC_ENTITIES;
    if (norm.startsWith('public/js/audio/')) return ARCHITECTURAL_LAYERS.PUBLIC_AUDIO;
    if (norm.startsWith('public/js/controls/')) return ARCHITECTURAL_LAYERS.PUBLIC_CONTROLS;
    if (norm.startsWith('public/js/modes/')) return ARCHITECTURAL_LAYERS.PUBLIC_MODES;
    if (norm.startsWith('public/js/')) return ARCHITECTURAL_LAYERS.PUBLIC_CORE;
    return ARCHITECTURAL_LAYERS.UNKNOWN;
}

/**
 * Extracts top-level module intent documentation ("Why this exists").
 *
 * @param {string} sourceCode
 * @returns {{ hasIntentHeader: boolean, intentSummary: string, rawHeader: string }}
 */
export function extractIntentHeader(sourceCode) {
    if (!sourceCode || typeof sourceCode !== 'string') {
        return { hasIntentHeader: false, intentSummary: '', rawHeader: '' };
    }

    const trimmed = sourceCode.trimStart();

    // Look for JSDoc or block comment at top: /** ... */ or /* ... */
    const blockMatch = trimmed.match(/^\/\*([\s\S]*?)\*\//);
    if (blockMatch) {
        const rawContent = blockMatch[1].trim();
        // Clean leading asterisks
        const cleanedLines = rawContent
            .split('\n')
            .map((line) => line.trim().replace(/^\*\s?/, '').trim())
            .filter((l) => l.length > 0 && !l.startsWith('@'));

        const intentSummary = cleanedLines.slice(0, 3).join(' ');
        return {
            hasIntentHeader: intentSummary.length > 0,
            intentSummary: intentSummary || 'No descriptive summary found in block header.',
            rawHeader: blockMatch[0],
        };
    }

    // Look for sequential leading line comments: // ...
    const lineMatch = trimmed.match(/^((?:\/\/[^\n]*\n?)+)/);
    if (lineMatch) {
        const lines = lineMatch[1]
            .split('\n')
            .map((l) => l.trim().replace(/^\/\/\s?/, '').trim())
            .filter((l) => l.length > 0);

        const intentSummary = lines.slice(0, 3).join(' ');
        return {
            hasIntentHeader: intentSummary.length > 0,
            intentSummary: intentSummary || 'No descriptive summary found in line comment header.',
            rawHeader: lineMatch[0],
        };
    }

    return {
        hasIntentHeader: false,
        intentSummary: 'Missing architectural intent header.',
        rawHeader: '',
    };
}

/**
 * Parses ES module static imports and exports from JavaScript code without external AST parsers.
 * Handles `import ... from '...'`, `export ... from '...'`, dynamic `import('...')`, and `import '...'`.
 *
 * @param {string} sourceCode
 * @returns {Array<{ specifier: string, type: 'static'|'dynamic'|'reexport', raw: string }>}
 */
export function parseModuleDependencies(sourceCode) {
    if (!sourceCode || typeof sourceCode !== 'string') return [];

    const dependencies = [];
    const seen = new Set();

    // Remove multi-line comments and single-line comments for reliable regex scanning
    const stripped = sourceCode
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');

    // 1. Static imports:
    // import defaultMember from 'module-name';
    // import * as name from 'module-name';
    // import { member } from 'module-name';
    // import 'module-name';
    const staticImportRegex = /(?:^|[\s;{}])import\s+(?:(?:[\w*\s{},]*)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = staticImportRegex.exec(stripped)) !== null) {
        const specifier = match[1].trim();
        const key = `static:${specifier}`;
        if (!seen.has(key)) {
            seen.add(key);
            dependencies.push({ specifier, type: 'static', raw: match[0].trim() });
        }
    }

    // 2. Re-exports:
    // export * from 'module-name';
    // export { member } from 'module-name';
    const reexportRegex = /(?:^|[\s;{}])export\s+(?:(?:[\w*\s{},]*)\s+from\s+)['"]([^'"]+)['"]/g;
    while ((match = reexportRegex.exec(stripped)) !== null) {
        const specifier = match[1].trim();
        const key = `reexport:${specifier}`;
        if (!seen.has(key)) {
            seen.add(key);
            dependencies.push({ specifier, type: 'reexport', raw: match[0].trim() });
        }
    }

    // 3. Dynamic imports:
    // import('module-name')
    const dynamicImportRegex = /(?:^|[\s;({=])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(stripped)) !== null) {
        const specifier = match[1].trim();
        const key = `dynamic:${specifier}`;
        if (!seen.has(key)) {
            seen.add(key);
            dependencies.push({ specifier, type: 'dynamic', raw: match[0].trim() });
        }
    }

    return dependencies;
}

/**
 * Audits module source code for un-guarded global browser DOM, window, document, or Three.js leaks.
 *
 * In pure shared/ modules:
 * - Direct global references like `document.createElement`, `window.localStorage`, `new THREE.Mesh` without
 *   either `typeof window !== 'undefined'` guards or dependency injection parameter (`THREE` / `storage`) are illegal.
 *
 * @param {string} sourceCode
 * @param {object} [options={}]
 * @returns {Array<{ globalName: string, line: number, snippet: string, reason: string }>}
 */
export function auditGlobalLeaks(sourceCode, options = {}) {
    if (!sourceCode || typeof sourceCode !== 'string') return [];

    const leaks = [];

    // Strip comments preserving line numbering
    const codeWithoutComments = sourceCode
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

    // Also blank out string literals and regex literals so internal tokens like /window/ don't trigger false positives
    const sanitizedCode = codeWithoutComments
        .replace(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/(?:[^\/\\]|\\.)+\/[gimsuy]*/g, (m) => m.replace(/[^\n]/g, ' '));

    const lines = sanitizedCode.split('\n');
    const originalLines = sourceCode.split('\n');

    // Targets to inspect
    const targets = [
        { name: 'window', pattern: /(?<!typeof\s+)(?<!\.\s*)\bwindow\b/ },
        { name: 'document', pattern: /(?<!typeof\s+)(?<!\.\s*)\bdocument\b/ },
        { name: 'THREE', pattern: /(?<!typeof\s+)(?<!\.\s*)\bTHREE\b/ },
    ];

    // Check if the file imports THREE or has function parameters named THREE
    // If THREE is passed as an injected parameter (e.g. `function foo(THREE, ...)`), it's clean dependency injection.
    const isThreeInjected = /\bfunction\s*\w*\s*\([^)]*\bTHREE\b/.test(sourceCode) ||
        /\([A-Za-z0-9_,\s]*\bTHREE\b[A-Za-z0-9_,\s]*\)\s*=>/.test(sourceCode);

    // Track if inside a typeof guard block across lines (e.g. if (typeof document !== 'undefined') { ... })
    // We check line by line first
    let guardedBlockDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const rawLine = originalLines[i] || '';

        // Check if an enclosing if guard started
        if (/if\s*\(\s*typeof\s+(?:window|document)\s*!==\s*['"]undefined['"]/.test(rawLine)) {
            if (rawLine.includes('{') && !rawLine.includes('}')) {
                guardedBlockDepth++;
            }
        }

        const hasInlineWindowGuard = /typeof\s+window\s*!==\s*['"]undefined['"]/.test(rawLine) ||
            /typeof\s+window\s*===\s*['"]undefined['"]/.test(rawLine);
        const hasInlineDocGuard = /typeof\s+document\s*!==\s*['"]undefined['"]/.test(rawLine) ||
            /typeof\s+document\s*===\s*['"]undefined['"]/.test(rawLine);

        const isGuarded = guardedBlockDepth > 0;

        for (const target of targets) {
            if (target.name === 'window' && (hasInlineWindowGuard || isGuarded)) continue;
            if (target.name === 'document' && (hasInlineDocGuard || isGuarded)) continue;
            if (target.name === 'THREE' && isThreeInjected) continue;

            if (target.pattern.test(line)) {
                leaks.push({
                    globalName: target.name,
                    line: i + 1,
                    snippet: rawLine.trim(),
                    reason: `Un-guarded global '${target.name}' access violates shared/ pure module isolation.`,
                });
            }
        }

        if (guardedBlockDepth > 0 && rawLine.includes('}')) {
            guardedBlockDepth = Math.max(0, guardedBlockDepth - 1);
        }
    }

    return leaks;
}

/**
 * Resolves a module specifier relative to the importing file's directory.
 *
 * @param {string} importingFile - Relative path of the importer (e.g. "public/js/hud.js")
 * @param {string} specifier - Import specifier (e.g. "../../shared/game-core.js")
 * @returns {string} Normalized relative path (e.g. "shared/game-core.js") or bare module name
 */
export function resolveModulePath(importingFile, specifier) {
    if (!specifier.startsWith('.')) {
        return specifier; // External or bare package import, e.g. 'three', 'node:test'
    }
    const fromDir = path.dirname(importingFile);
    const resolved = path.normalize(path.join(fromDir, specifier));
    return resolved.replace(/\\/g, '/');
}

/**
 * Scans a directory recursively and returns all matching module paths.
 *
 * @param {string} dir - Directory path to scan
 * @param {string} [extension='.js']
 * @param {string} [rootDir='.'] - Base root path for relative paths
 * @returns {string[]} List of relative module paths with forward slashes
 */
export function scanDirectory(dir, extension = '.js', rootDir = '.') {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    function walk(current) {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(extension)) {
                const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                results.push(rel);
            }
        }
    }

    walk(dir);
    return results.sort();
}

/**
 * Builds the complete Module Dependency Graph for a collection of files or repository folders.
 *
 * @param {object} [options={}]
 * @param {string} [options.rootDir='.']
 * @param {string[]} [options.scanDirs=['shared', 'public/js']]
 * @param {Record<string, string>} [options.inMemoryFiles] - Optional in-memory files mapping { path: content } for testing
 * @returns {ModuleDependencyGraph}
 */
export function buildDependencyGraph(options = {}) {
    const rootDir = options.rootDir || '.';
    const scanDirs = options.scanDirs || ['shared', 'public/js'];
    const inMemoryFiles = options.inMemoryFiles || null;

    let filePaths = [];

    if (inMemoryFiles) {
        filePaths = Object.keys(inMemoryFiles).map((p) => p.replace(/\\/g, '/'));
    } else {
        for (const dir of scanDirs) {
            const targetDir = path.join(rootDir, dir);
            filePaths.push(...scanDirectory(targetDir, '.js', rootDir));
        }
    }

    const graph = {
        nodes: new Map(), // filePath -> NodeInfo
        edges: [],        // { from, to, type, specifier }
    };

    // 1. Ingest all nodes
    for (const filePath of filePaths) {
        const normPath = filePath.replace(/\\/g, '/');
        let code = '';
        if (inMemoryFiles) {
            code = inMemoryFiles[filePath] ?? '';
        } else {
            const full = path.join(rootDir, normPath);
            if (fs.existsSync(full)) {
                code = fs.readFileSync(full, 'utf8');
            }
        }

        const layer = classifyModuleLayer(normPath);
        const intent = extractIntentHeader(code);
        const deps = parseModuleDependencies(code);

        const nodeInfo = {
            id: normPath,
            layer,
            hasIntentHeader: intent.hasIntentHeader,
            intentSummary: intent.intentSummary,
            dependencies: deps,
            outgoing: [],
            incoming: [],
            isShared: layer === ARCHITECTURAL_LAYERS.SHARED_CORE,
            lineCount: code ? code.split('\n').length : 0,
        };

        graph.nodes.set(normPath, nodeInfo);
    }

    // 2. Build edges & resolve dependencies
    for (const [normPath, node] of graph.nodes.entries()) {
        for (const dep of node.dependencies) {
            const resolved = resolveModulePath(normPath, dep.specifier);
            const edge = {
                from: normPath,
                to: resolved,
                specifier: dep.specifier,
                type: dep.type,
                isInternal: graph.nodes.has(resolved),
            };

            graph.edges.push(edge);
            node.outgoing.push(resolved);

            if (graph.nodes.has(resolved)) {
                graph.nodes.get(resolved).incoming.push(normPath);
            }
        }
    }

    return graph;
}

/**
 * Finds all circular dependency cycles within the module graph using Tarjan's / DFS cycle detection.
 *
 * @param {ModuleDependencyGraph} graph
 * @returns {Array<string[]>} Array of cycles, each represented as a cycle path of node IDs
 */
export function findCircularDependencies(graph) {
    const cycles = [];
    const visited = new Map(); // 0 = unvisited, 1 = visiting (in stack), 2 = visited
    const pathStack = [];
    const seenCycleSignatures = new Set();

    function normalizeCycleSignature(cycle) {
        // Find lexicographically smallest node to create canonical rotation
        let minIdx = 0;
        for (let i = 1; i < cycle.length; i++) {
            if (cycle[i] < cycle[minIdx]) minIdx = i;
        }
        const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
        return rotated.join(' -> ');
    }

    function dfs(nodeId) {
        visited.set(nodeId, 1);
        pathStack.push(nodeId);

        const node = graph.nodes.get(nodeId);
        if (node) {
            for (const neighborId of node.outgoing) {
                if (!graph.nodes.has(neighborId)) continue; // external or unresolved

                const state = visited.get(neighborId) || 0;
                if (state === 1) {
                    // Cycle detected!
                    const cycleStartIdx = pathStack.indexOf(neighborId);
                    if (cycleStartIdx !== -1) {
                        const rawCycle = pathStack.slice(cycleStartIdx);
                        const sig = normalizeCycleSignature(rawCycle);
                        if (!seenCycleSignatures.has(sig)) {
                            seenCycleSignatures.add(sig);
                            cycles.push([...rawCycle, neighborId]);
                        }
                    }
                } else if (state === 0) {
                    dfs(neighborId);
                }
            }
        }

        pathStack.pop();
        visited.set(nodeId, 2);
    }

    for (const nodeId of graph.nodes.keys()) {
        if (!visited.has(nodeId) || visited.get(nodeId) === 0) {
            dfs(nodeId);
        }
    }

    return cycles;
}

/**
 * Validates layer boundary rules (e.g. shared pure core must not depend on public UI/world).
 *
 * @param {ModuleDependencyGraph} graph
 * @returns {Array<{ from: string, to: string, fromLayer: string, toLayer: string, violation: string }>}
 */
export function validateLayerBoundaries(graph) {
    const boundaryViolations = [];

    for (const edge of graph.edges) {
        if (!edge.isInternal) continue;

        const fromNode = graph.nodes.get(edge.from);
        const toNode = graph.nodes.get(edge.to);
        if (!fromNode || !toNode) continue;

        // Shared Core purity rule: shared/* must never depend on public/*
        if (fromNode.layer === ARCHITECTURAL_LAYERS.SHARED_CORE && toNode.layer !== ARCHITECTURAL_LAYERS.SHARED_CORE) {
            // Note: qa-autopilot.js imports ../public/js/world/biomes.js as a test harness bridge.
            const isQABridge = edge.from.includes('qa-') || edge.from.includes('test');
            boundaryViolations.push({
                from: edge.from,
                to: edge.to,
                fromLayer: fromNode.layer,
                toLayer: toNode.layer,
                isQABridge,
                violation: `Layer boundary breach: pure shared core '${edge.from}' imports from outer layer '${edge.to}' (${toNode.layer}).`,
            });
        }
    }

    return boundaryViolations;
}

/**
 * Complete architecture validation report aggregator.
 *
 * @param {object} [options={}]
 * @returns {ArchitectureValidationReport}
 */
export function validateArchitecture(options = {}) {
    const rootDir = options.rootDir || '.';
    const inMemoryFiles = options.inMemoryFiles || null;
    const graph = buildDependencyGraph(options);
    const circularCycles = findCircularDependencies(graph);
    const boundaryViolations = validateLayerBoundaries(graph);

    // Global leak detection across shared modules
    const globalLeaks = [];
    const missingIntentHeaders = [];

    for (const [filePath, node] of graph.nodes.entries()) {
        if (!node.hasIntentHeader) {
            missingIntentHeaders.push(filePath);
        }

        if (node.isShared) {
            let code = '';
            if (inMemoryFiles) {
                code = inMemoryFiles[filePath] || '';
            } else {
                const full = path.join(rootDir, filePath);
                if (fs.existsSync(full)) {
                    code = fs.readFileSync(full, 'utf8');
                }
            }
            const leaks = auditGlobalLeaks(code);
            for (const leak of leaks) {
                globalLeaks.push({ file: filePath, ...leak });
            }
        }
    }

    // Filter boundary violations: strict violations exclude explicit test/qa bridges if configured
    const allowQABridges = options.allowQABridges ?? true;
    const fatalBoundaryViolations = boundaryViolations.filter((v) => !allowQABridges || !v.isQABridge);

    const isGreen = circularCycles.length === 0 && globalLeaks.length === 0 && fatalBoundaryViolations.length === 0;

    return {
        verdict: isGreen ? 'PASS' : 'FAIL',
        isGreen,
        summary: {
            totalModules: graph.nodes.size,
            sharedModules: [...graph.nodes.values()].filter((n) => n.isShared).length,
            publicModules: [...graph.nodes.values()].filter((n) => !n.isShared).length,
            totalEdges: graph.edges.length,
            circularCyclesCount: circularCycles.length,
            globalLeaksCount: globalLeaks.length,
            boundaryViolationsCount: fatalBoundaryViolations.length,
            missingIntentHeadersCount: missingIntentHeaders.length,
        },
        circularCycles,
        globalLeaks,
        boundaryViolations: fatalBoundaryViolations,
        allBoundaryViolations: boundaryViolations,
        missingIntentHeaders,
        graph,
    };
}

/**
 * Generates a clean, human-readable module boundary map formatted as Markdown.
 *
 * @param {ArchitectureValidationReport|ModuleDependencyGraph} reportOrGraph
 * @returns {string} Markdown module boundary map
 */
export function generateModuleBoundaryMap(reportOrGraph) {
    const graph = reportOrGraph.graph || reportOrGraph;
    const nodes = [...graph.nodes.values()];

    // Group nodes by layer
    const grouped = {};
    for (const node of nodes) {
        if (!grouped[node.layer]) grouped[node.layer] = [];
        grouped[node.layer].push(node);
    }

    const lines = [
        `# Sovereign Architectural Module Boundary Map (Helmet 02)`,
        ``,
        `> "Partition the fog of war. When a unit drops into the repo cold, it must know in 3 seconds which door to open and stay 90% blind to the rest of the building."`,
        ``,
        `## 🏛️ System Layer Summary`,
        ``,
        `| Layer | Module Count | Isolation Level | Primary Role |`,
        `|---|---|---|---|`,
        `| \`${ARCHITECTURAL_LAYERS.SHARED_CORE}\` | ${grouped[ARCHITECTURAL_LAYERS.SHARED_CORE]?.length || 0} | Zero DOM / Pure Deterministic | Authoritative physics, combat, rules, AI, RNG |`,
        `| \`${ARCHITECTURAL_LAYERS.PUBLIC_CORE}\` | ${grouped[ARCHITECTURAL_LAYERS.PUBLIC_CORE]?.length || 0} | Browser / WebGL Orchestration | Game loop, scene directors, visuals |`,
        `| \`${ARCHITECTURAL_LAYERS.PUBLIC_UI}\` | ${grouped[ARCHITECTURAL_LAYERS.PUBLIC_UI]?.length || 0} | DOM / HUD / 2D Cockpit | Cockpit telemetry, shop, menus, dialogs |`,
        `| \`${ARCHITECTURAL_LAYERS.PUBLIC_VFX}\` | ${grouped[ARCHITECTURAL_LAYERS.PUBLIC_VFX]?.length || 0} | Three.js Shaders / Particles | Wake ribbons, combat punch, screen fx |`,
        `| \`${ARCHITECTURAL_LAYERS.PUBLIC_WORLD}\` | ${grouped[ARCHITECTURAL_LAYERS.PUBLIC_WORLD]?.length || 0} | Procedural 3D Environment | Biomes, river course, weather, landmarks |`,
        `| \`${ARCHITECTURAL_LAYERS.PUBLIC_ENTITIES}\` | ${grouped[ARCHITECTURAL_LAYERS.PUBLIC_ENTITIES]?.length || 0} | 3D Meshes & Rigging | Raft meshes, boss Kraken, loot meshes |`,
        `| \`${ARCHITECTURAL_LAYERS.PUBLIC_CONTROLS}\` | ${grouped[ARCHITECTURAL_LAYERS.PUBLIC_CONTROLS]?.length || 0} | DOM Input / Gamepad | Keyboard, mouse, touch input normalization |`,
        `| \`${ARCHITECTURAL_LAYERS.PUBLIC_AUDIO}\` | ${grouped[ARCHITECTURAL_LAYERS.PUBLIC_AUDIO]?.length || 0} | WebAudio Synth | 4-stem music scheduler, sound effects |`,
        `| \`${ARCHITECTURAL_LAYERS.PUBLIC_MODES}\` | ${grouped[ARCHITECTURAL_LAYERS.PUBLIC_MODES]?.length || 0} | Party Game Modes | Splitscreen, coop, daily, endless |`,
        ``,
    ];

    // Detail breakdown per layer
    const layerDisplayOrder = [
        ARCHITECTURAL_LAYERS.SHARED_CORE,
        ARCHITECTURAL_LAYERS.PUBLIC_CORE,
        ARCHITECTURAL_LAYERS.PUBLIC_UI,
        ARCHITECTURAL_LAYERS.PUBLIC_VFX,
        ARCHITECTURAL_LAYERS.PUBLIC_WORLD,
        ARCHITECTURAL_LAYERS.PUBLIC_ENTITIES,
        ARCHITECTURAL_LAYERS.PUBLIC_CONTROLS,
        ARCHITECTURAL_LAYERS.PUBLIC_AUDIO,
        ARCHITECTURAL_LAYERS.PUBLIC_MODES,
    ];

    for (const layerKey of layerDisplayOrder) {
        const layerNodes = grouped[layerKey];
        if (!layerNodes || layerNodes.length === 0) continue;

        lines.push(`### Layer: \`${layerKey}\` (${layerNodes.length} modules)`);
        lines.push(``);
        lines.push(`| Module | Intent ("Why this exists") | Outgoing Dependencies |`);
        lines.push(`|---|---|---|`);

        for (const n of layerNodes.sort((a, b) => a.id.localeCompare(b.id))) {
            const shortDeps = n.outgoing.map((d) => `\`${path.basename(d)}\``).join(', ') || '*(none)*';
            const intentSafe = n.intentSummary.replace(/\|/g, '\\|');
            lines.push(`| **\`${n.id}\`** | ${intentSafe} | ${shortDeps} |`);
        }
        lines.push(``);
    }

    return lines.join('\n');
}
