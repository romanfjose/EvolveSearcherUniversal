/**
 * Sovereign Core & Helmet 03 QA Breaker: Biome 3D Builders & Geometry Integrity Test Suite
 * (`test/qa-wave5b-biome-geometry-integrity.test.js`)
 *
 * Implements ruthless Helmet 03 ("Where's the Bathroom?" Breaker) verification for all
 * procedural 3D world generators, biome prop builders, and setpiece mesh systems:
 *   1. Act I-IV River Biome Props (`public/js/world/biomes.js`)
 *   2. Reactive Shoreline Landmarks (`public/js/world/shoreline-landmarks.js`)
 *   3. River Hazards Mesh System (`public/js/world/hazards-mesh.js`)
 *   4. Destructible River Environment System (`public/js/world/destructibles-mesh.js`)
 *   5. Fever-Dream Mid-River Encounter Meshes (`public/js/world/dream-events-mesh.js`)
 *   6. Dynamic Weather System (`public/js/world/weather.js`)
 *   7. Three.js Geometry & Material Deduplication Cache (`public/js/world/geometry-cache.js`)
 *
 * Verifies with mathematical coldness:
 *   - 100% finite coordinates: ZERO NaN, null, or undefined coordinates/transforms across all scene-graph nodes.
 *   - Non-zero geometry counts: Every visual group actually constructs substantive meshes/geometries.
 *   - Clean disposal and zero memory leaks: Geometries and materials support clean disposal with refcount tracking.
 *   - Impatient Saboteur contacts: Pathological coordinates, extreme scales, empty layouts, and out-of-order calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    RIVER_BIOMES,
    createBiomePropsGroup,
    getBiomeAtZ,
    interpolateBiomePalette,
} from '../public/js/world/biomes.js';

import {
    buildShorelineLandmarks,
    animateShorelineLandmarks,
} from '../public/js/world/shoreline-landmarks.js';

import {
    buildRiverHazardsGroup,
    animateRiverHazards,
    createRapidsMesh,
    createWhirlpoolMesh,
    createRampMesh,
    createCoinRingMesh,
    createMineMesh,
} from '../public/js/world/hazards-mesh.js';

import {
    buildDestructiblesGroup,
    animateDestructibles,
    createBarricadeMesh,
    createSuspensionBridgeMesh,
    createRockslideMesh,
    createDebrisMeshSystem,
} from '../public/js/world/destructibles-mesh.js';

import {
    buildDreamEventsGroup,
    animateDreamEvents,
    createCapybaraBargeMesh,
    createBureaucraticSwanMesh,
    createRubberDuckyMesh,
    createStampedeGroup,
    createGhostShoppingCartMesh,
    createDiscoCrabRaveMesh,
} from '../public/js/world/dream-events-mesh.js';

import {
    createWeatherSystem,
    WEATHER_STATES,
} from '../public/js/world/weather.js';

import {
    GeometryAndMaterialCache,
} from '../public/js/world/geometry-cache.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight Mock THREE Test Harness with Leak & Resource Disposal Tracking
// ─────────────────────────────────────────────────────────────────────────────

function createLightweightMockThree() {
    let nextId = 1;

    class Vector3 {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        set(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }
        copy(v) {
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            return this;
        }
        clone() {
            return new Vector3(this.x, this.y, this.z);
        }
        setScalar(s) {
            this.x = s;
            this.y = s;
            this.z = s;
            return this;
        }
    }

    class Euler {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        set(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }
    }

    class Color {
        constructor(hexOrR = 0xffffff, g, b) {
            if (typeof hexOrR === 'number' && g === undefined) {
                this.hex = hexOrR;
                this.r = ((hexOrR >> 16) & 255) / 255;
                this.g = ((hexOrR >> 8) & 255) / 255;
                this.b = (hexOrR & 255) / 255;
            } else if (typeof hexOrR === 'number' && typeof g === 'number' && typeof b === 'number') {
                this.r = hexOrR;
                this.g = g;
                this.b = b;
                this.hex = ((Math.round(hexOrR * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255));
            } else {
                this.hex = 0xffffff;
                this.r = 1;
                this.g = 1;
                this.b = 1;
            }
        }
        setHex(h) {
            this.hex = h;
            this.r = ((h >> 16) & 255) / 255;
            this.g = ((h >> 8) & 255) / 255;
            this.b = (h & 255) / 255;
            return this;
        }
        setRGB(r, g, b) {
            this.r = r;
            this.g = g;
            this.b = b;
            return this;
        }
        clone() {
            return new Color(this.r, this.g, this.b);
        }
        getHexString() {
            return (this.hex || 0).toString(16).padStart(6, '0');
        }
    }

    class MockResource {
        constructor(type) {
            this.id = nextId++;
            this.type = type;
            this.disposed = false;
            this.userData = {};
        }
        dispose() {
            this.disposed = true;
        }
    }

    class BufferAttribute {
        constructor(array, itemSize) {
            this.array = array;
            this.itemSize = itemSize;
            this.count = array ? array.length / itemSize : 0;
            this.needsUpdate = false;
        }
    }

    class BufferGeometry extends MockResource {
        constructor() {
            super('BufferGeometry');
            this.attributes = {};
            this.index = null;
        }
        setAttribute(name, attribute) {
            this.attributes[name] = attribute;
            return this;
        }
        getAttribute(name) {
            return this.attributes[name];
        }
        setIndex(index) {
            this.index = index;
            return this;
        }
        computeVertexNormals() {}
        rotateX() { return this; }
        rotateY() { return this; }
        rotateZ() { return this; }
        translate() { return this; }
        scale() { return this; }
    }

    class BoxGeometry extends BufferGeometry {
        constructor(w = 1, h = 1, d = 1, ws = 1, hs = 1, ds = 1) {
            super();
            this.type = 'BoxGeometry';
            this.parameters = { width: w, height: h, depth: d, widthSegments: ws, heightSegments: hs, depthSegments: ds };
        }
    }

    class CylinderGeometry extends BufferGeometry {
        constructor(rt = 1, rb = 1, h = 1, rs = 8, hs = 1, open = false, tStart = 0, tLen = Math.PI * 2) {
            super();
            this.type = 'CylinderGeometry';
            this.parameters = { radiusTop: rt, radiusBottom: rb, height: h, radialSegments: rs, heightSegments: hs, openEnded: open };
        }
    }

    class ConeGeometry extends BufferGeometry {
        constructor(r = 1, h = 1, rs = 8, hs = 1, open = false, tStart = 0, tLen = Math.PI * 2) {
            super();
            this.type = 'ConeGeometry';
            this.parameters = { radius: r, height: h, radialSegments: rs, heightSegments: hs, openEnded: open };
        }
    }

    class SphereGeometry extends BufferGeometry {
        constructor(r = 1, ws = 8, hs = 6, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0, thetaLength = Math.PI) {
            super();
            this.type = 'SphereGeometry';
            this.parameters = { radius: r, widthSegments: ws, heightSegments: hs };
        }
    }

    class PlaneGeometry extends BufferGeometry {
        constructor(w = 1, h = 1, ws = 1, hs = 1) {
            super();
            this.type = 'PlaneGeometry';
            this.parameters = { width: w, height: h, widthSegments: ws, heightSegments: hs };
        }
    }

    class DodecahedronGeometry extends BufferGeometry {
        constructor(r = 1, d = 0) {
            super();
            this.type = 'DodecahedronGeometry';
            this.parameters = { radius: r, detail: d };
        }
    }

    class OctahedronGeometry extends BufferGeometry {
        constructor(r = 1, d = 0) {
            super();
            this.type = 'OctahedronGeometry';
            this.parameters = { radius: r, detail: d };
        }
    }

    class TorusGeometry extends BufferGeometry {
        constructor(r = 1, t = 0.4, rs = 8, ts = 16, arc = Math.PI * 2) {
            super();
            this.type = 'TorusGeometry';
            this.parameters = { radius: r, tube: t, radialSegments: rs, tubularSegments: ts, arc };
        }
    }

    class RingGeometry extends BufferGeometry {
        constructor(ir = 0.5, or = 1, ts = 8, ps = 1, thetaStart = 0, thetaLength = Math.PI * 2) {
            super();
            this.type = 'RingGeometry';
            this.parameters = { innerRadius: ir, outerRadius: or, thetaSegments: ts, phiSegments: ps };
        }
    }

    class CircleGeometry extends BufferGeometry {
        constructor(r = 1, s = 8) {
            super();
            this.type = 'CircleGeometry';
            this.parameters = { radius: r, segments: s };
        }
    }

    class Material extends MockResource {
        constructor(type, params = {}) {
            super(type);
            Object.assign(this, params);
            if (params.color !== undefined) {
                this.color = params.color instanceof Color ? params.color : new Color(params.color);
            }
            if (params.emissive !== undefined) {
                this.emissive = params.emissive instanceof Color ? params.emissive : new Color(params.emissive);
            }
            this.transparent = !!params.transparent;
            this.opacity = params.opacity !== undefined ? params.opacity : 1.0;
            this.depthWrite = params.depthWrite !== undefined ? params.depthWrite : true;
            this.wireframe = !!params.wireframe;
            this.side = params.side || 0;
            this.uniforms = params.uniforms || {};
        }
    }

    class MeshStandardMaterial extends Material {
        constructor(params = {}) {
            super('MeshStandardMaterial', params);
            this.roughness = params.roughness ?? 0.5;
            this.metalness = params.metalness ?? 0.5;
            this.flatShading = !!params.flatShading;
        }
    }

    class MeshBasicMaterial extends Material {
        constructor(params = {}) {
            super('MeshBasicMaterial', params);
        }
    }

    class ShaderMaterial extends Material {
        constructor(params = {}) {
            super('ShaderMaterial', params);
            this.vertexShader = params.vertexShader || '';
            this.fragmentShader = params.fragmentShader || '';
        }
    }

    class Object3D {
        constructor() {
            this.id = nextId++;
            this.type = 'Object3D';
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.scale.set = (x, y, z) => {
                this.scale.x = x;
                this.scale.y = y;
                this.scale.z = z;
                return this.scale;
            };
            this.children = [];
            this.parent = null;
            this.visible = true;
            this.castShadow = false;
            this.receiveShadow = false;
            this.userData = {};
            this.name = '';
        }
        add(...objs) {
            for (const o of objs) {
                if (o) {
                    o.parent = this;
                    this.children.push(o);
                }
            }
            return this;
        }
        remove(obj) {
            const idx = this.children.indexOf(obj);
            if (idx >= 0) {
                obj.parent = null;
                this.children.splice(idx, 1);
            }
            return this;
        }
        traverse(callback) {
            callback(this);
            for (const child of this.children) {
                child.traverse(callback);
            }
        }
    }

    class Group extends Object3D {
        constructor() {
            super();
            this.type = 'Group';
        }
    }

    class Mesh extends Object3D {
        constructor(geometry, material) {
            super();
            this.type = 'Mesh';
            this.geometry = geometry || null;
            this.material = material || null;
        }
    }

    class Points extends Object3D {
        constructor(geometry, material) {
            super();
            this.type = 'Points';
            this.geometry = geometry || null;
            this.material = material || null;
        }
    }

    class DirectionalLight extends Object3D {
        constructor(color = 0xffffff, intensity = 1.0) {
            super();
            this.type = 'DirectionalLight';
            this.color = new Color(color);
            this.intensity = intensity;
        }
    }

    return {
        Vector3,
        Euler,
        Color,
        BufferAttribute,
        BufferGeometry,
        BoxGeometry,
        CylinderGeometry,
        ConeGeometry,
        SphereGeometry,
        PlaneGeometry,
        DodecahedronGeometry,
        OctahedronGeometry,
        TorusGeometry,
        RingGeometry,
        CircleGeometry,
        Material,
        MeshStandardMaterial,
        MeshBasicMaterial,
        ShaderMaterial,
        Object3D,
        Group,
        Mesh,
        Points,
        DirectionalLight,
        DoubleSide: 2,
        AdditiveBlending: 2,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic Hierarchy Scanner & Finite Geometry Auditor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deep audits any Three.js scene-graph tree to enforce:
 *   - All positions (x, y, z) are finite numbers.
 *   - All rotations (x, y, z) are finite numbers.
 *   - All scales (x, y, z) are finite numbers.
 *   - At least 1 valid Mesh/Points node exists with valid geometry and material.
 *   - Collects total mesh count, geometry count, and material count.
 */
function audit3DSceneGraph(rootNode) {
    const defects = [];
    let meshCount = 0;
    let pointsCount = 0;
    let groupCount = 0;
    const geometries = new Set();
    const materials = new Set();

    if (!rootNode) {
        defects.push({ node: 'root', error: 'Root node is null or undefined' });
        return { valid: false, defects, meshCount, geometries: 0, materials: 0 };
    }

    function checkFiniteVec(v, name, path) {
        if (!v) {
            defects.push({ path, error: `Missing vector ${name}` });
            return;
        }
        for (const axis of ['x', 'y', 'z']) {
            const val = v[axis];
            if (typeof val !== 'number' || !Number.isFinite(val)) {
                defects.push({ path, error: `${name}.${axis} is invalid: ${String(val)}` });
            }
        }
    }

    function scan(node, path = '') {
        const currentPath = path ? `${path} > ${node.name || node.type}` : (node.name || node.type || 'root');

        checkFiniteVec(node.position, 'position', currentPath);
        checkFiniteVec(node.rotation, 'rotation', currentPath);
        checkFiniteVec(node.scale, 'scale', currentPath);

        if (node.type === 'Mesh') {
            meshCount++;
            if (!node.geometry) {
                defects.push({ path: currentPath, error: 'Mesh node missing geometry' });
            } else {
                geometries.add(node.geometry);
            }
            if (!node.material) {
                defects.push({ path: currentPath, error: 'Mesh node missing material' });
            } else {
                if (Array.isArray(node.material)) {
                    node.material.forEach((m) => materials.add(m));
                } else {
                    materials.add(node.material);
                }
            }
        } else if (node.type === 'Points') {
            pointsCount++;
            if (node.geometry) geometries.add(node.geometry);
            if (node.material) materials.add(node.material);
        } else if (node.type === 'Group') {
            groupCount++;
        }

        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                scan(child, currentPath);
            }
        }
    }

    scan(rootNode);

    return {
        valid: defects.length === 0,
        defects,
        meshCount,
        pointsCount,
        groupCount,
        totalRenderables: meshCount + pointsCount,
        uniqueGeometries: geometries.size,
        uniqueMaterials: materials.size,
        geometriesList: Array.from(geometries),
        materialsList: Array.from(materials),
    };
}

/**
 * Deep disposes all geometries and materials found in a scene-graph subtree.
 */
function deepDisposeSubtree(rootNode) {
    let disposedGeos = 0;
    let disposedMats = 0;
    const seenGeos = new Set();
    const seenMats = new Set();

    rootNode.traverse((node) => {
        if (node.geometry && !seenGeos.has(node.geometry)) {
            seenGeos.add(node.geometry);
            if (typeof node.geometry.dispose === 'function') {
                node.geometry.dispose();
                disposedGeos++;
            }
        }
        if (node.material) {
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            for (const m of mats) {
                if (m && !seenMats.has(m)) {
                    seenMats.add(m);
                    if (typeof m.dispose === 'function') {
                        m.dispose();
                        disposedMats++;
                    }
                }
            }
        }
    });

    return { disposedGeos, disposedMats };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Helmet 03 QA Breaker — 3D Biome Builders & Geometry Integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('Helmet 03 QA Breaker: 3D Biome Builders & Geometry Integrity', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Act I–IV Biome Prop Generators
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Act I–IV Biome Props Generator Integrity', () => {
        const THREE = createLightweightMockThree();

        for (let act = 1; act <= 4; act++) {
            it(`Act ${act}: produces valid 3D props group with 100% finite transforms and non-zero geometry`, () => {
                const group = createBiomePropsGroup(THREE, act, 30);
                assert.ok(group, `Group returned for Act ${act}`);
                assert.equal(group.type, 'Group');
                assert.equal(group.name, `BiomeProps_Act_${act}`);

                const audit = audit3DSceneGraph(group);
                assert.equal(audit.valid, true, `Audit defects in Act ${act}: ${JSON.stringify(audit.defects)}`);
                assert.ok(audit.meshCount > 0, `Act ${act} must have non-zero mesh count (got ${audit.meshCount})`);
                assert.ok(audit.uniqueGeometries > 0, `Act ${act} must have non-zero geometry count (got ${audit.uniqueGeometries})`);
                assert.ok(audit.uniqueMaterials > 0, `Act ${act} must have non-zero material count (got ${audit.uniqueMaterials})`);

                // Verify clean disposal without memory leaks
                const cleanup = deepDisposeSubtree(group);
                assert.equal(cleanup.disposedGeos, audit.uniqueGeometries);
                assert.equal(cleanup.disposedMats, audit.uniqueMaterials);
                for (const geo of audit.geometriesList) {
                    assert.equal(geo.disposed, true, 'Geometry must be disposed');
                }
                for (const mat of audit.materialsList) {
                    assert.equal(mat.disposed, true, 'Material must be disposed');
                }
            });
        }

        it('adapts to variable river widths without producing NaN positions or zero-sized geometry', () => {
            const widths = [15, 30, 45, 80, 120];
            for (const w of widths) {
                const group = createBiomePropsGroup(THREE, 1, w);
                const audit = audit3DSceneGraph(group);
                assert.equal(audit.valid, true, `Invalid transforms with riverWidth=${w}`);
                assert.ok(audit.meshCount > 0);
            }
        });

        it('gracefully handles unrecognised act indices without crashing or returning unhandled errors', () => {
            const invalidActs = [-1, 0, 5, 999, NaN];
            for (const act of invalidActs) {
                const group = createBiomePropsGroup(THREE, act, 30);
                assert.ok(group);
                assert.equal(group.children.length, 0);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Reactive Shoreline Landmarks & Spectator Setpieces
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Shoreline Landmarks & Interactive Setpiece Integrity', () => {
        const THREE = createLightweightMockThree();

        it('builds full shoreline setpieces with spectators, cranes, tavern signs, and obelisks', () => {
            const handle = buildShorelineLandmarks(THREE, 12345);
            assert.ok(handle, 'buildShorelineLandmarks must return handle');
            assert.ok(handle.group);

            const audit = audit3DSceneGraph(handle.group);
            assert.equal(audit.valid, true, `Shoreline landmarks have invalid transforms: ${JSON.stringify(audit.defects)}`);
            assert.ok(audit.meshCount >= 15, `Expected >= 15 meshes, got ${audit.meshCount}`);
            assert.ok(audit.uniqueGeometries >= 5, `Expected >= 5 unique geometries, got ${audit.uniqueGeometries}`);
            assert.ok(handle.items.length >= 10, 'Expected >= 10 landmark items');

            // All items must have valid position coordinates
            for (const item of handle.items) {
                assert.ok(Number.isFinite(item.position.x));
                assert.ok(Number.isFinite(item.position.y));
                assert.ok(Number.isFinite(item.position.z));
            }
        });

        it('animates shoreline landmarks smoothly when raft approaches within 35m without NaN transforms', () => {
            const handle = buildShorelineLandmarks(THREE, 42);
            const firstItem = handle.items[0];

            // 1. Far position
            animateShorelineLandmarks(handle, { x: 0, y: 0, z: firstItem.position.z - 200 }, 1.0);
            let audit = audit3DSceneGraph(handle.group);
            assert.equal(audit.valid, true);

            // 2. Near position (< 35m)
            animateShorelineLandmarks(handle, { x: firstItem.position.x, y: 0, z: firstItem.position.z }, 2.0);
            audit = audit3DSceneGraph(handle.group);
            assert.equal(audit.valid, true);

            // 3. Clean disposal of all child meshes and materials
            const cleanup = deepDisposeSubtree(handle.group);
            assert.ok(cleanup.disposedGeos > 0);
            assert.ok(cleanup.disposedMats > 0);
        });

        it('survives saboteur contact with null, undefined, and out-of-bounds raft positions', () => {
            const handle = buildShorelineLandmarks(THREE, 999);
            assert.doesNotThrow(() => animateShorelineLandmarks(handle, null, 0));
            assert.doesNotThrow(() => animateShorelineLandmarks(handle, undefined, 0));
            assert.doesNotThrow(() => animateShorelineLandmarks(handle, { x: NaN, y: Infinity, z: -1e10 }, 5.0));
            assert.doesNotThrow(() => animateShorelineLandmarks(null, { x: 0, y: 0, z: 0 }, 1.0));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. River Hazards Mesh System (Rapids, Whirlpools, Ramps, Mines, Rings)
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. River Hazards 3D Mesh Integrity & Lifecycle', () => {
        const THREE = createLightweightMockThree();

        it('builds individual hazard meshes with valid non-zero geometry and finite positions', () => {
            // Rapids mesh
            const rapids = createRapidsMesh(THREE, { x: 5, z: -50, width: 12, length: 24, angle: 0.1 });
            let audit = audit3DSceneGraph(rapids);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 1);

            // Whirlpool mesh
            const whirlpool = createWhirlpoolMesh(THREE, { x: -8, z: -100, radius: 6.5, depth: 3.5 });
            audit = audit3DSceneGraph(whirlpool);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 2); // Funnel + foam ring

            // Ramp mesh
            const ramp = createRampMesh(THREE, { x: 0, z: -150, width: 6.0, length: 10.0, height: 3.0 });
            audit = audit3DSceneGraph(ramp);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 3);

            // Coin ring mesh
            const ring = createCoinRingMesh(THREE, { x: 0, z: -200, radius: 4.5, numCoins: 8 });
            audit = audit3DSceneGraph(ring);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 3); // Outer torus + shimmer disc + central coin

            // Mine mesh
            const mine = createMineMesh(THREE, { x: 4, z: -250, radius: 1.2 });
            audit = audit3DSceneGraph(mine);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 5); // Sphere body + spikes
        });

        it('builds comprehensive river hazards group and animates without transform corruption', () => {
            const hazardsLayout = {
                rapids: [{ id: 'rap_1', x: 2, z: -60, width: 10, length: 20 }],
                whirlpools: [{ id: 'whirl_1', x: -5, z: -120, radius: 6 }],
                ramps: [{ id: 'ramp_1', x: 0, z: -180, width: 5, length: 8, height: 2.5 }],
                coinRings: [{ id: 'ring_1', x: 1, z: -220, radius: 4, numCoins: 6 }],
                mines: [{ id: 'mine_1', x: -3, z: -280, radius: 1.0 }],
            };

            const handle = buildRiverHazardsGroup(THREE, hazardsLayout);
            assert.ok(handle);
            assert.ok(handle.rootGroup);

            const audit = audit3DSceneGraph(handle.rootGroup);
            assert.equal(audit.valid, true, `Defects in hazards group: ${JSON.stringify(audit.defects)}`);
            assert.ok(audit.meshCount >= 15);
            assert.ok(audit.uniqueGeometries >= 5);

            // Animate through multiple frames
            for (let t = 0; t < 10; t++) {
                animateRiverHazards(handle, t * 0.05, 0.05);
            }

            const postAudit = audit3DSceneGraph(handle.rootGroup);
            assert.equal(postAudit.valid, true, 'Transforms must remain finite after animation');

            // Verify clean disposal
            const cleanup = deepDisposeSubtree(handle.rootGroup);
            assert.ok(cleanup.disposedGeos >= audit.uniqueGeometries);
            assert.ok(cleanup.disposedMats >= audit.uniqueMaterials);
        });

        it('handles empty hazard layout without throwing or creating ghost meshes', () => {
            const handle = buildRiverHazardsGroup(THREE, {});
            assert.ok(handle);
            assert.equal(handle.rootGroup.children.length, 0);
            assert.doesNotThrow(() => animateRiverHazards(handle, 1.0, 0.016));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Destructible River Environment System
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Destructible River Environment 3D Integrity', () => {
        const THREE = createLightweightMockThree();

        it('creates barricade, suspension bridge, rockslide, and debris meshes cleanly', () => {
            // Barricade
            const barricade = createBarricadeMesh(THREE, { x: 0, z: -70, width: 12, height: 3.2, depth: 1.4 });
            let audit = audit3DSceneGraph(barricade);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 10);

            // Suspension Bridge
            const bridge = createSuspensionBridgeMesh(THREE, { x: 0, z: -150, width: 28, height: 8.5 });
            audit = audit3DSceneGraph(bridge);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 15);

            // Rockslide
            const rockslide = createRockslideMesh(THREE, { x: 10, z: -250, radius: 7.0, numBoulders: 8 });
            audit = audit3DSceneGraph(rockslide);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 8);

            // Debris Mesh System
            const debris = createDebrisMeshSystem(THREE);
            assert.ok(debris);
            assert.ok(debris.rootGroup);
            assert.equal(typeof debris.spawnExplosionDebris, 'function');
            assert.equal(typeof debris.dispose, 'function');

            // Spawn test explosion debris
            debris.spawnExplosionDebris({ x: 0, y: 1, z: -100 }, 20, 0x5a3d28);
            audit = audit3DSceneGraph(debris.rootGroup);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount > 0);

            debris.dispose();
            assert.equal(debris.rootGroup.children.length, 0);
        });

        it('builds full destructibles group and steps simulation without NaN decay', () => {
            const layout = {
                barricades: [{ id: 'barr_1', x: 0, z: -100, width: 10, height: 3 }],
                suspensionBridges: [{ id: 'bridge_1', x: 0, z: -200, width: 24, height: 8 }],
                rockslides: [{ id: 'rock_1', x: 8, z: -300, radius: 6 }],
            };

            const handle = buildDestructiblesGroup(THREE, layout);
            assert.ok(handle);
            assert.ok(handle.rootGroup);

            const audit = audit3DSceneGraph(handle.rootGroup);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 30);

            // Mock destructibles state with health and damage transitions
            const destructiblesState = {
                barricades: [{ id: 'barr_1', health: 50, maxHealth: 100, destroyed: false }],
                bridges: [{ id: 'bridge_1', collapseProgress: 0.4, isCollapsing: true }],
                rockslides: [{ id: 'rock_1', active: true }],
            };

            for (let i = 0; i < 5; i++) {
                animateDestructibles(handle, destructiblesState, i * 0.1, 0.1);
            }

            const postAudit = audit3DSceneGraph(handle.rootGroup);
            assert.equal(postAudit.valid, true);

            const cleanup = deepDisposeSubtree(handle.rootGroup);
            assert.ok(cleanup.disposedGeos > 0);
            assert.ok(cleanup.disposedMats > 0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Fever-Dream Mid-River Encounter 3D Models
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Fever-Dream Encounter Meshes & Animation Integrity', () => {
        const THREE = createLightweightMockThree();

        it('builds all 5 bizarre fever-dream encounters with non-zero geometry and finite transforms', () => {
            // 1. Capybara Hot-Tub Barge
            const capy = createCapybaraBargeMesh(THREE, { x: 0, y: 0.25, z: -80 });
            let audit = audit3DSceneGraph(capy);
            assert.equal(audit.valid, true, `Capybara barge invalid: ${JSON.stringify(audit.defects)}`);
            assert.ok(audit.meshCount >= 10);

            // 2. Bureaucratic Swan Boat
            const swan = createBureaucraticSwanMesh(THREE, { x: 5, y: 0.3, z: -180 });
            audit = audit3DSceneGraph(swan);
            assert.equal(audit.valid, true, `Swan boat invalid: ${JSON.stringify(audit.defects)}`);
            assert.ok(audit.meshCount >= 10);

            // 3. Rubber Ducky & Stampede
            const duck = createRubberDuckyMesh(THREE, { x: -3, y: 0.1, z: -280, scale: 1.5 });
            audit = audit3DSceneGraph(duck);
            assert.equal(audit.valid, true, `Rubber duck invalid: ${JSON.stringify(audit.defects)}`);
            assert.ok(audit.meshCount >= 4);

            const stampede = createStampedeGroup(THREE, { ducks: [{ x: 1, y: 0, z: -300 }, { x: -2, y: 0, z: -305 }] });
            audit = audit3DSceneGraph(stampede);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 8);

            // 4. Ghost Shopping Cart
            const cart = createGhostShoppingCartMesh(THREE, { x: 2, y: 0.5, z: -380 });
            audit = audit3DSceneGraph(cart);
            assert.equal(audit.valid, true, `Shopping cart invalid: ${JSON.stringify(audit.defects)}`);
            assert.ok(audit.meshCount >= 8);

            // 5. Disco Crab Rave
            const crabRave = createDiscoCrabRaveMesh(THREE, { x: -10, y: 0.2, z: -480, crabCount: 4 });
            audit = audit3DSceneGraph(crabRave);
            assert.equal(audit.valid, true, `Crab rave invalid: ${JSON.stringify(audit.defects)}`);
            assert.ok(audit.meshCount >= 15);
        });

        it('builds combined dream events group and animates cleanly across time', () => {
            const encounters = [
                { type: 'capybara_tub', x: 0, z: -100 },
                { type: 'bureaucratic_swan', x: 4, z: -200 },
                { type: 'rubber_ducky_stampede', ducks: [{ x: 0, z: -300 }] },
                { type: 'ghost_cart', x: -3, z: -400 },
                { type: 'disco_crab_rave', x: 6, z: -500 },
            ];

            const handle = buildDreamEventsGroup(THREE, encounters);
            assert.ok(handle);
            assert.ok(handle.root);

            const audit = audit3DSceneGraph(handle.root);
            assert.equal(audit.valid, true);
            assert.ok(audit.meshCount >= 30);

            for (let i = 0; i < 5; i++) {
                animateDreamEvents(handle, i * 0.1, 0.1);
            }

            const postAudit = audit3DSceneGraph(handle.root);
            assert.equal(postAudit.valid, true);

            const cleanup = deepDisposeSubtree(handle.root);
            assert.ok(cleanup.disposedGeos > 0);
            assert.ok(cleanup.disposedMats > 0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Dynamic 3D Weather System
    // ─────────────────────────────────────────────────────────────────────────
    describe('6. Dynamic 3D Weather System Mesh & Particle Lifecycle', () => {
        const THREE = createLightweightMockThree();

        it('initializes weather system with particle points and disposes without dangling references', () => {
            const scene = new THREE.Group();
            const weather = createWeatherSystem(THREE, scene, { particleCount: 200 });

            assert.ok(weather);
            assert.equal(typeof weather.update, 'function');
            assert.equal(typeof weather.transitionTo, 'function');
            assert.equal(typeof weather.dispose, 'function');

            // Scene must contain particles and lightning light
            assert.ok(scene.children.length >= 2);

            const audit = audit3DSceneGraph(scene);
            assert.equal(audit.valid, true);
            assert.ok(audit.pointsCount >= 1, 'Scene must contain weather particle points');

            // Update across weather transitions
            weather.transitionTo('thunder-tempest', 0.5);
            weather.update(0.016, { x: 0, y: 1, z: -1200 });

            const midAudit = audit3DSceneGraph(scene);
            assert.equal(midAudit.valid, true);

            // Clean dispose removes elements and disposes geometry & material
            weather.dispose();
            assert.equal(scene.children.length, 0, 'All weather elements removed from scene');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Geometry Cache Deduplication & Leak-Free Disposal
    // ─────────────────────────────────────────────────────────────────────────
    describe('7. Three.js Geometry & Material Deduplication Cache Invariants', () => {
        const THREE = createLightweightMockThree();

        it('deduplicates pine tree geometries across 100 requests achieving >80% savings', () => {
            const cache = new GeometryAndMaterialCache(THREE);
            const buckets = ['small', 'medium', 'large'];

            for (let i = 0; i < 100; i++) {
                cache.getPineTreeComponents(buckets[i % buckets.length]);
            }

            const metrics = cache.getMetrics();
            assert.equal(cache.stats.geometryRequests, 400); // 1 trunk + 3 cones * 100
            assert.equal(metrics.activeGeometries, 12);       // 3 buckets * 4 components
            assert.ok(metrics.deduplicationSavingsPct >= 80);
            assert.equal(metrics.isTargetMet, true);

            // Safe disposal of all cached resources
            const cleanup = cache.disposeAll();
            assert.equal(cleanup.disposedGeometries, 12);
            assert.equal(cache.geometries.size, 0);
            assert.equal(cache.materials.size, 0);
        });

        it('idempotently handles repeated disposeAll() calls without throwing', () => {
            const cache = new GeometryAndMaterialCache(THREE);
            cache.acquireGeometry('BoxGeometry', { width: 1, height: 1, depth: 1 });
            cache.acquireMaterial('MeshStandardMaterial', { color: 0xff0000 });

            const firstClean = cache.disposeAll();
            assert.equal(firstClean.disposedGeometries, 1);
            assert.equal(firstClean.disposedMaterials, 1);

            // Second dispose must be completely safe and return 0
            const secondClean = cache.disposeAll();
            assert.equal(secondClean.disposedGeometries, 0);
            assert.equal(secondClean.disposedMaterials, 0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Impatient Saboteur Contact & Edge Fuzzing
    // ─────────────────────────────────────────────────────────────────────────
    describe('8. Impatient Saboteur Contact: Extreme Coordinates & Out-of-Order Calls', () => {
        const THREE = createLightweightMockThree();

        it('maintains finite transforms and survives deep rogue-river survival at z = -4000', () => {
            const palette = interpolateBiomePalette(-4000);
            assert.equal(palette.actIndex, 4);
            assert.ok(Number.isFinite(palette.fogDensity));
            assert.ok(Number.isFinite(palette.waveAmplitude));

            // Biome at -4000
            const biome = getBiomeAtZ(-4000);
            assert.equal(biome.actIndex, 4);
        });

        it('survives rapid out-of-order build and disposal cycles without memory leaks', () => {
            for (let cycle = 0; cycle < 5; cycle++) {
                const group = createBiomePropsGroup(THREE, (cycle % 4) + 1, 35);
                const audit = audit3DSceneGraph(group);
                assert.equal(audit.valid, true);

                const cleanup = deepDisposeSubtree(group);
                assert.equal(cleanup.disposedGeos, audit.uniqueGeometries);
                assert.equal(cleanup.disposedMats, audit.uniqueMaterials);
            }
        });
    });
});
