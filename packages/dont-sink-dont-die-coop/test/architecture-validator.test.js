import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ARCHITECTURAL_LAYERS,
    LAYER_CONSTRAINTS,
    classifyModuleLayer,
    extractIntentHeader,
    parseModuleDependencies,
    auditGlobalLeaks,
    resolveModulePath,
    buildDependencyGraph,
    findCircularDependencies,
    validateLayerBoundaries,
    validateArchitecture,
    generateModuleBoundaryMap,
} from '../shared/architecture-validator.js';

describe('Sovereign Architecture Map & Intent Boundary Validator (Helmet 02)', () => {
    describe('Architectural Layer Classification', () => {
        it('classifies shared/ modules as SHARED_CORE', () => {
            assert.equal(classifyModuleLayer('shared/game-core.js'), ARCHITECTURAL_LAYERS.SHARED_CORE);
            assert.equal(classifyModuleLayer('shared/river-hazards.js'), ARCHITECTURAL_LAYERS.SHARED_CORE);
            assert.equal(classifyModuleLayer('shared\\scene-watchdog.js'), ARCHITECTURAL_LAYERS.SHARED_CORE);
        });

        it('classifies public subdirectories accurately', () => {
            assert.equal(classifyModuleLayer('public/js/ui/hud.js'), ARCHITECTURAL_LAYERS.PUBLIC_UI);
            assert.equal(classifyModuleLayer('public/js/vfx/water-wake-ribbons.js'), ARCHITECTURAL_LAYERS.PUBLIC_VFX);
            assert.equal(classifyModuleLayer('public/js/world/weather.js'), ARCHITECTURAL_LAYERS.PUBLIC_WORLD);
            assert.equal(classifyModuleLayer('public/js/entities/boss-kraken-mesh.js'), ARCHITECTURAL_LAYERS.PUBLIC_ENTITIES);
            assert.equal(classifyModuleLayer('public/js/audio/music-engine.js'), ARCHITECTURAL_LAYERS.PUBLIC_AUDIO);
            assert.equal(classifyModuleLayer('public/js/controls/input-manager.js'), ARCHITECTURAL_LAYERS.PUBLIC_CONTROLS);
            assert.equal(classifyModuleLayer('public/js/modes/splitscreen.js'), ARCHITECTURAL_LAYERS.PUBLIC_MODES);
            assert.equal(classifyModuleLayer('public/js/main.js'), ARCHITECTURAL_LAYERS.PUBLIC_CORE);
        });
    });

    describe('Intent Header Extraction ("Why this exists")', () => {
        it('extracts JSDoc block headers and trims asterisks', () => {
            const sampleCode = `/**
 * Sovereign Core — Seat 3: Runtime 3D Scene-Graph NaN Watchdog
 * Heals corrupted transforms back to safe identity defaults.
 *
 * @module scene-watchdog
 */
export function sanitize() {}`;

            const res = extractIntentHeader(sampleCode);
            assert.equal(res.hasIntentHeader, true);
            assert.ok(res.intentSummary.includes('Runtime 3D Scene-Graph NaN Watchdog'));
            assert.ok(res.intentSummary.includes('Heals corrupted transforms'));
            assert.ok(!res.intentSummary.includes('@module'));
        });

        it('extracts leading line comments if no JSDoc block exists', () => {
            const sampleCode = `// Authoritative game logic shared by server.js and client loopback socket.
// Pure and deterministic: no timers, no I/O, no Math.random.
export const TICK_MS = 50;`;

            const res = extractIntentHeader(sampleCode);
            assert.equal(res.hasIntentHeader, true);
            assert.ok(res.intentSummary.includes('Authoritative game logic shared'));
            assert.ok(res.intentSummary.includes('Pure and deterministic'));
        });

        it('flags missing headers cleanly', () => {
            const res = extractIntentHeader(`const a = 1; export default a;`);
            assert.equal(res.hasIntentHeader, false);
            assert.ok(res.intentSummary.includes('Missing architectural intent header'));
        });
    });

    describe('Module Dependency Parsing (Static, Dynamic, Re-exports)', () => {
        it('parses static default, named, and namespace imports', () => {
            const code = `
                import * as THREE from 'three';
                import { TICK_MS, RIVER } from './game-core.js';
                import defaultEngine from './engine.js';
                import './polyfill.js';
            `;

            const deps = parseModuleDependencies(code);
            const specifiers = deps.map((d) => d.specifier);
            assert.ok(specifiers.includes('three'));
            assert.ok(specifiers.includes('./game-core.js'));
            assert.ok(specifiers.includes('./engine.js'));
            assert.ok(specifiers.includes('./polyfill.js'));
            assert.equal(deps.filter((d) => d.type === 'static').length, 4);
        });

        it('parses re-exports and dynamic imports', () => {
            const code = `
                export { foo } from './foo.js';
                export * from './bar.js';
                const mod = await import('./dynamic-chunk.js');
            `;

            const deps = parseModuleDependencies(code);
            const reexports = deps.filter((d) => d.type === 'reexport').map((d) => d.specifier);
            const dynamics = deps.filter((d) => d.type === 'dynamic').map((d) => d.specifier);

            assert.ok(reexports.includes('./foo.js'));
            assert.ok(reexports.includes('./bar.js'));
            assert.ok(dynamics.includes('./dynamic-chunk.js'));
        });

        it('ignores imports inside comments', () => {
            const code = `
                // import { fake } from './fake.js';
                /*
                 * import * as bogus from './bogus.js';
                 */
                import { real } from './real.js';
            `;

            const deps = parseModuleDependencies(code);
            assert.equal(deps.length, 1);
            assert.equal(deps[0].specifier, './real.js');
        });
    });

    describe('Global Leak Auditor (window, document, THREE)', () => {
        it('detects un-guarded window and document accesses in pure shared code', () => {
            const dirtyCode = `
                export function getWidth() {
                    return window.innerWidth;
                }
                export function makeDiv() {
                    return document.createElement('div');
                }
            `;

            const leaks = auditGlobalLeaks(dirtyCode);
            assert.equal(leaks.length, 2);
            assert.equal(leaks[0].globalName, 'window');
            assert.equal(leaks[1].globalName, 'document');
        });

        it('permits guarded window/document accesses with typeof checks', () => {
            const cleanCode = `
                export function getStorage() {
                    return (typeof window !== 'undefined' ? window.localStorage : null);
                }
                export function createCanvas() {
                    if (typeof document !== 'undefined') {
                        return document.createElement('canvas');
                    }
                    return null;
                }
            `;

            const leaks = auditGlobalLeaks(cleanCode);
            assert.equal(leaks.length, 0);
        });

        it('detects un-injected THREE access while allowing dependency-injected THREE parameter', () => {
            const bareThreeCode = `
                export function createMesh() {
                    return new THREE.Mesh();
                }
            `;
            const leaksBare = auditGlobalLeaks(bareThreeCode);
            assert.equal(leaksBare.length, 1);
            assert.equal(leaksBare[0].globalName, 'THREE');

            const injectedThreeCode = `
                export function createMesh(THREE, geometry, material) {
                    return new THREE.Mesh(geometry, material);
                }
            `;
            const leaksInjected = auditGlobalLeaks(injectedThreeCode);
            assert.equal(leaksInjected.length, 0);
        });

        it('ignores mentions of target keywords in string literals or comments', () => {
            const sample = `
                // This comment explains window.location
                export const KEY = 'document-title';
                const regex = /window/;
            `;
            const leaks = auditGlobalLeaks(sample);
            assert.equal(leaks.length, 0);
        });
    });

    describe('Circular Dependency Detection', () => {
        it('detects simple 2-node circular dependency (A -> B -> A)', () => {
            const inMemoryFiles = {
                'shared/moduleA.js': `import { b } from './moduleB.js'; export const a = 1;`,
                'shared/moduleB.js': `import { a } from './moduleA.js'; export const b = 2;`,
            };

            const graph = buildDependencyGraph({ inMemoryFiles });
            const cycles = findCircularDependencies(graph);

            assert.equal(cycles.length, 1);
            const cycle = cycles[0];
            assert.ok(cycle.includes('shared/moduleA.js'));
            assert.ok(cycle.includes('shared/moduleB.js'));
        });

        it('detects 3-node cycle (A -> B -> C -> A) and reports zero cycles for DAG', () => {
            const cycleFiles = {
                'shared/node1.js': `import './node2.js';`,
                'shared/node2.js': `import './node3.js';`,
                'shared/node3.js': `import './node1.js';`,
            };

            const cycleGraph = buildDependencyGraph({ inMemoryFiles: cycleFiles });
            const cycles = findCircularDependencies(cycleGraph);
            assert.equal(cycles.length, 1);

            const dagFiles = {
                'shared/leaf.js': `export const leaf = true;`,
                'shared/mid.js': `import './leaf.js';`,
                'shared/root.js': `import './mid.js'; import './leaf.js';`,
            };

            const dagGraph = buildDependencyGraph({ inMemoryFiles: dagFiles });
            const dagCycles = findCircularDependencies(dagGraph);
            assert.equal(dagCycles.length, 0);
        });
    });

    describe('Layer Boundary Constraint Enforcement', () => {
        it('flags boundary violation when shared module imports public UI', () => {
            const inMemoryFiles = {
                'shared/bad-logic.js': `import { hud } from '../public/js/ui/hud.js';`,
                'public/js/ui/hud.js': `export const hud = {};`,
            };

            const graph = buildDependencyGraph({ inMemoryFiles });
            const violations = validateLayerBoundaries(graph);

            assert.equal(violations.length, 1);
            assert.equal(violations[0].from, 'shared/bad-logic.js');
            assert.equal(violations[0].to, 'public/js/ui/hud.js');
        });

        it('allows public UI to import shared core logic cleanly', () => {
            const inMemoryFiles = {
                'shared/game-core.js': `export const TICK_MS = 50;`,
                'public/js/ui/hud.js': `import { TICK_MS } from '../../../shared/game-core.js';`,
            };

            const graph = buildDependencyGraph({ inMemoryFiles });
            const violations = validateLayerBoundaries(graph);
            assert.equal(violations.length, 0);
        });
    });

    describe('Live Repository Architectural Validation & Receipt', () => {
        it('validates entire live repo with 0 circular cycles and 0 un-guarded global leaks', () => {
            const report = validateArchitecture();

            assert.equal(report.verdict, 'PASS');
            assert.equal(report.isGreen, true);
            assert.equal(report.circularCycles.length, 0, `Expected 0 cycles, found: ${JSON.stringify(report.circularCycles)}`);
            assert.equal(report.globalLeaks.length, 0, `Expected 0 global leaks, found: ${JSON.stringify(report.globalLeaks)}`);
            assert.equal(report.boundaryViolations.length, 0);

            assert.ok(report.summary.totalModules >= 75);
            assert.ok(report.summary.sharedModules >= 40);
            assert.ok(report.summary.publicModules >= 30);
        });

        it('generates a comprehensive Markdown module boundary map', () => {
            const report = validateArchitecture();
            const md = generateModuleBoundaryMap(report);

            assert.ok(typeof md === 'string');
            assert.ok(md.includes('# Sovereign Architectural Module Boundary Map (Helmet 02)'));
            assert.ok(md.includes('shared_core'));
            assert.ok(md.includes('public_ui'));
            assert.ok(md.includes('public_vfx'));
            assert.ok(md.includes('Partition the fog of war'));

            // Check that major load-bearing modules appear in the boundary map
            assert.ok(md.includes('shared/game-core.js'));
            assert.ok(md.includes('shared/scene-watchdog.js'));
            assert.ok(md.includes('shared/style-rank.js'));
            assert.ok(md.includes('shared/architecture-validator.js'));
        });
    });
});
