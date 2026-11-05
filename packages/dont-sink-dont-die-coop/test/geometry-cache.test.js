import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    GeometryAndMaterialCache,
    generateGeometryKey,
    generateMaterialKey,
    sharedGeometryCache,
} from '../public/js/world/geometry-cache.js';

// Headless Three.js mock matching the project's mock standards
function createMockThree() {
    class MockResource {
        constructor() {
            this.disposed = false;
            this.userData = {};
        }
        dispose() {
            this.disposed = true;
        }
    }

    class BoxGeometry extends MockResource {
        constructor(w, h, d) {
            super();
            this.type = 'BoxGeometry';
            this.parameters = { width: w, height: h, depth: d };
        }
    }
    class CylinderGeometry extends MockResource {
        constructor(rt, rb, h, rs) {
            super();
            this.type = 'CylinderGeometry';
            this.parameters = { radiusTop: rt, radiusBottom: rb, height: h, radialSegments: rs };
        }
    }
    class ConeGeometry extends MockResource {
        constructor(r, h, rs) {
            super();
            this.type = 'ConeGeometry';
            this.parameters = { radius: r, height: h, radialSegments: rs };
        }
    }
    class SphereGeometry extends MockResource {
        constructor(r, ws, hs) {
            super();
            this.type = 'SphereGeometry';
            this.parameters = { radius: r, widthSegments: ws, heightSegments: hs };
        }
    }
    class PlaneGeometry extends MockResource {
        constructor(w, h, ws, hs) {
            super();
            this.type = 'PlaneGeometry';
            this.parameters = { width: w, height: h, widthSegments: ws, heightSegments: hs };
        }
    }
    class DodecahedronGeometry extends MockResource {
        constructor(r, d) {
            super();
            this.type = 'DodecahedronGeometry';
            this.parameters = { radius: r, detail: d };
        }
    }
    class OctahedronGeometry extends MockResource {
        constructor(r, d) {
            super();
            this.type = 'OctahedronGeometry';
            this.parameters = { radius: r, detail: d };
        }
    }
    class TorusGeometry extends MockResource {
        constructor(r, t, rs, ts) {
            super();
            this.type = 'TorusGeometry';
            this.parameters = { radius: r, tube: t, radialSegments: rs, tubularSegments: ts };
        }
    }
    class RingGeometry extends MockResource {
        constructor(ir, or, ts) {
            super();
            this.type = 'RingGeometry';
            this.parameters = { innerRadius: ir, outerRadius: or, thetaSegments: ts };
        }
    }

    class MeshStandardMaterial extends MockResource {
        constructor(params = {}) {
            super();
            this.type = 'MeshStandardMaterial';
            this.color = params.color;
            this.roughness = params.roughness;
            this.metalness = params.metalness;
            this.flatShading = params.flatShading;
        }
    }
    class MeshBasicMaterial extends MockResource {
        constructor(params = {}) {
            super();
            this.type = 'MeshBasicMaterial';
            this.color = params.color;
        }
    }

    class Mesh {
        constructor(geometry, material) {
            this.geometry = geometry;
            this.material = material;
            this.userData = {};
        }
    }

    return {
        BoxGeometry,
        CylinderGeometry,
        ConeGeometry,
        SphereGeometry,
        PlaneGeometry,
        DodecahedronGeometry,
        OctahedronGeometry,
        TorusGeometry,
        RingGeometry,
        MeshStandardMaterial,
        MeshBasicMaterial,
        Mesh,
    };
}

describe('Geometry and Material Deduplication Cache', () => {
    let mockThree;
    let cache;

    beforeEach(() => {
        mockThree = createMockThree();
        cache = new GeometryAndMaterialCache(mockThree);
    });

    test('deterministic key generation', () => {
        const key1 = generateGeometryKey('CylinderGeometry', { radiusTop: 0.32, height: 2.5 });
        const key2 = generateGeometryKey('CylinderGeometry', { height: 2.5, radiusTop: 0.32 });
        assert.equal(key1, key2, 'Keys with different property ordering must be identical');

        const matKey1 = generateMaterialKey('MeshStandardMaterial', { color: 0xffd700, roughness: 0.3 });
        const matKey2 = generateMaterialKey('MeshStandardMaterial', { roughness: 0.3, color: 0xffd700 });
        assert.equal(matKey1, matKey2, 'Material keys with different ordering must be identical');
    });

    test('geometry deduplication and instance reuse', () => {
        const geo1 = cache.acquireGeometry('CylinderGeometry', { radiusTop: 0.5, radiusBottom: 0.5, height: 2.0 });
        const geo2 = cache.acquireGeometry('CylinderGeometry', { radiusTop: 0.5, radiusBottom: 0.5, height: 2.0 });

        assert.equal(geo1, geo2, 'Subsequent acquisitions with same params must return the same instance');
        assert.equal(cache.geometries.size, 1);
        assert.equal(cache.stats.geometryRequests, 2);
        assert.equal(cache.stats.geometryHits, 1);
    });

    test('material deduplication and instance reuse', () => {
        const mat1 = cache.acquireMaterial('MeshStandardMaterial', { color: 0x4a2e1b, roughness: 0.85 });
        const mat2 = cache.acquireMaterial('MeshStandardMaterial', { color: 0x4a2e1b, roughness: 0.85 });

        assert.equal(mat1, mat2, 'Identical material definitions must share instance');
        assert.equal(cache.materials.size, 1);
        assert.equal(cache.stats.materialRequests, 2);
        assert.equal(cache.stats.materialHits, 1);
    });

    test('reference counting and safe automatic disposal', () => {
        const geo = cache.acquireGeometry('BoxGeometry', { width: 2, height: 2, depth: 2 });
        assert.equal(geo.disposed, false);

        // refCount is 1. Another acquisition makes it 2
        cache.acquireGeometry('BoxGeometry', { width: 2, height: 2, depth: 2 });
        const entry = cache.geometries.get(geo.userData._geoCacheKey);
        assert.equal(entry.refCount, 2);

        // First release: refCount becomes 1, not disposed
        const firstRelease = cache.releaseGeometry(geo);
        assert.equal(firstRelease, false);
        assert.equal(geo.disposed, false);
        assert.equal(cache.geometries.size, 1);

        // Second release: refCount reaches 0, disposed and removed
        const secondRelease = cache.releaseGeometry(geo);
        assert.equal(secondRelease, true);
        assert.equal(geo.disposed, true);
        assert.equal(cache.geometries.size, 0);
        assert.equal(cache.stats.disposedGeometries, 1);
    });

    test('composite cached mesh acquisition and release', () => {
        const mesh = cache.createCachedMesh(
            { type: 'SphereGeometry', params: { radius: 1.5 } },
            { type: 'MeshStandardMaterial', params: { color: 0x00ff00, roughness: 0.5 } }
        );

        assert.ok(mesh);
        assert.ok(mesh.geometry);
        assert.ok(mesh.material);
        assert.equal(mesh.userData._cachedGeoKey, mesh.geometry.userData._geoCacheKey);
        assert.equal(mesh.userData._cachedMatKey, mesh.material.userData._matCacheKey);

        // Release mesh cleans up both
        cache.releaseMesh(mesh);
        assert.equal(mesh.geometry.disposed, true);
        assert.equal(mesh.material.disposed, true);
    });

    test('river segment preset geometry caching', () => {
        const riverGeo1 = cache.getRiverSegmentGeometry(30, 100, 16, 40);
        const riverGeo2 = cache.getRiverSegmentGeometry(30, 100, 16, 40);
        assert.equal(riverGeo1, riverGeo2);
        assert.equal(cache.stats.geometryHits, 1);
    });

    test('pine tree presets deduplicate across large obstacle populations (>80% savings)', () => {
        // In the game, 300 obstacles are spawned (many pine trees)
        const treeMeshes = [];
        const treeCount = 100;
        const buckets = ['small', 'medium', 'large'];

        for (let i = 0; i < treeCount; i++) {
            const bucket = buckets[i % buckets.length];
            const treeComps = cache.getPineTreeComponents(bucket);
            treeMeshes.push(treeComps);
        }

        // 100 trees with 4 geometries each (1 trunk + 3 cones) = 400 geometry requests
        // With 3 buckets, only 3 trunks + 9 cones = 12 unique geometries are created!
        const metrics = cache.getMetrics();
        assert.equal(cache.stats.geometryRequests, 400);
        assert.equal(metrics.activeGeometries, 12);
        assert.equal(cache.materials.size, 2); // 1 woodMat + 1 foliageMat

        // Memory & draw call reduction should far exceed 50%
        assert.ok(metrics.deduplicationSavingsPct > 80, `Expected >80% savings, got ${metrics.deduplicationSavingsPct}%`);
        assert.equal(metrics.isTargetMet, true);
    });

    test('coin presets deduplicate across pickups, pools and bonus rings', () => {
        const coinMeshes = [];
        for (let i = 0; i < 50; i++) {
            const coin = cache.getCoinComponents('standard');
            coinMeshes.push(coin);
        }

        assert.equal(cache.geometries.size, 1, 'Only 1 canonical coin geometry created');
        assert.equal(cache.materials.size, 1, 'Only 1 canonical gold material created');
        assert.equal(cache.stats.geometryHits, 49);
        assert.equal(cache.stats.materialHits, 49);

        const metrics = cache.getMetrics();
        assert.ok(metrics.deduplicationSavingsPct >= 90);
    });

    test('enemy rig presets cache canonical geometries across wizard, mudAlien, and worm', () => {
        const wizard1 = cache.getEnemyRigComponents('wizard');
        const wizard2 = cache.getEnemyRigComponents('whiteGuy');
        assert.equal(wizard1.skiffGeo, wizard2.skiffGeo);
        assert.equal(wizard1.robeGeo, wizard2.robeGeo);
        assert.equal(wizard1.headGeo, wizard2.headGeo);

        const mud1 = cache.getEnemyRigComponents('mudAlien');
        const mud2 = cache.getEnemyRigComponents('behemoth');
        assert.equal(mud1.bodyGeo, mud2.bodyGeo);
        assert.equal(mud1.fistGeo, mud2.fistGeo);

        const worm1 = cache.getEnemyRigComponents('longWorm');
        const worm2 = cache.getEnemyRigComponents('worm');
        assert.equal(worm1.segmentGeo, worm2.segmentGeo);
        assert.equal(worm1.dorsalSpineGeo, worm2.dorsalSpineGeo);
    });

    test('disposeAll safely cleans up all GPU resources and resets cache', () => {
        const geo1 = cache.acquireGeometry('BoxGeometry', { width: 1 });
        const geo2 = cache.acquireGeometry('SphereGeometry', { radius: 2 });
        const mat1 = cache.acquireMaterial('MeshStandardMaterial', { color: 0x112233 });
        const mat2 = cache.acquireMaterial('MeshBasicMaterial', { color: 0x445566 });

        assert.equal(cache.geometries.size, 2);
        assert.equal(cache.materials.size, 2);
        assert.equal(geo1.disposed, false);
        assert.equal(geo2.disposed, false);
        assert.equal(mat1.disposed, false);
        assert.equal(mat2.disposed, false);

        const result = cache.disposeAll();
        assert.equal(result.disposedGeometries, 2);
        assert.equal(result.disposedMaterials, 2);
        assert.equal(cache.geometries.size, 0);
        assert.equal(cache.materials.size, 0);

        assert.equal(geo1.disposed, true);
        assert.equal(geo2.disposed, true);
        assert.equal(mat1.disposed, true);
        assert.equal(mat2.disposed, true);
    });

    test('sharedGeometryCache singleton is available and functional', () => {
        assert.ok(sharedGeometryCache);
        sharedGeometryCache.setThree(mockThree);
        const geo = sharedGeometryCache.acquireGeometry('BoxGeometry', { width: 5 });
        assert.ok(geo);
        sharedGeometryCache.disposeAll();
    });
});
