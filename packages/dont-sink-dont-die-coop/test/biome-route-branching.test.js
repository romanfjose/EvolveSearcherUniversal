/**
 * Unit Test Suite for Mid-River Split-Route Archipelago Generator & Channel Routing
 * (`test/biome-route-branching.test.js`)
 *
 * Verifies:
 *   1. Procedural split-route island generation determinism, act span, and dimension bounds.
 *   2. Dual-channel assignment (Tactical Calm vs High-Risk Rapids) with repair crates & gold rings.
 *   3. Spatial channel route sampling (getChannelRouteAt): speeds, turbulence, obstacle grounding.
 *   4. Three.js composite 3D mesh building, beacon and collectible hierarchy, and clean leak-free disposal.
 *   5. Robustness against degenerate options, extreme seeds, and boundary coordinates.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ROUTE_BRANCH_CONFIG,
    createBranchingRng,
    generateSplitRouteIslands,
    getChannelRouteAt,
    buildIsland3DMesh,
} from '../shared/biome-route-branching.js';

// ─── Lightweight Mock Three.js Factory ─────────────────────────────────────
function createMockThree() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }

    class Euler {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    }

    class BufferGeometry {
        constructor() {
            this.disposed = false;
        }
        scale(x, y, z) {
            this.scaled = { x, y, z };
            return this;
        }
        dispose() {
            this.disposed = true;
        }
    }

    class CylinderGeometry extends BufferGeometry {}
    class ConeGeometry extends BufferGeometry {}
    class BoxGeometry extends BufferGeometry {}
    class TorusGeometry extends BufferGeometry {}

    class Material {
        constructor(params = {}) {
            this.params = params;
            this.color = params.color;
            this.disposed = false;
        }
        dispose() {
            this.disposed = true;
        }
    }

    class MeshBasicMaterial extends Material {}
    class MeshStandardMaterial extends Material {}

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.children = [];
            this.parent = null;
            this.name = '';
            this.userData = {};
        }
        add(child) {
            child.parent = this;
            this.children.push(child);
            return this;
        }
        remove(child) {
            const idx = this.children.indexOf(child);
            if (idx !== -1) {
                this.children.splice(idx, 1);
                child.parent = null;
            }
            return this;
        }
    }

    class Group extends Object3D {}
    class Mesh extends Object3D {
        constructor(geometry, material) {
            super();
            this.geometry = geometry;
            this.material = material;
        }
    }

    return {
        Vector3,
        Euler,
        BufferGeometry,
        CylinderGeometry,
        ConeGeometry,
        BoxGeometry,
        TorusGeometry,
        Material,
        MeshBasicMaterial,
        MeshStandardMaterial,
        Group,
        Mesh,
    };
}

describe('Mid-River Split-Route Archipelago Generator', () => {
    describe('Deterministic PRNG (createBranchingRng)', () => {
        it('produces identical deterministic float sequence for identical seed', () => {
            const rngA = createBranchingRng(42);
            const rngB = createBranchingRng(42);

            for (let i = 0; i < 20; i++) {
                assert.equal(rngA(), rngB());
            }
        });

        it('handles non-positive or zero seeds gracefully', () => {
            const rngZero = createBranchingRng(0);
            const val = rngZero();
            assert.ok(val >= 0 && val < 1);
        });
    });

    describe('generateSplitRouteIslands() layout generation', () => {
        it('generates multiple spaced islands spanning from z = -120 to finishZ', () => {
            const islands = generateSplitRouteIslands({
                seed: 2024,
                riverWidth: 80,
                finishZ: -1500,
            });

            assert.ok(Array.isArray(islands));
            assert.ok(islands.length >= 4, `Expected at least 4 islands, got ${islands.length}`);

            // First island near FIRST_ISLAND_Z
            assert.equal(islands[0].z, ROUTE_BRANCH_CONFIG.FIRST_ISLAND_Z);

            // Strictly ordered downriver in descending Z
            for (let i = 1; i < islands.length; i++) {
                assert.ok(islands[i].z < islands[i - 1].z, `Island ${i} should have lower Z than ${i - 1}`);
                assert.ok(islands[i].z > -1500);
            }
        });

        it('enforces island width and length limits within river width bounds', () => {
            const riverWidth = 80;
            const islands = generateSplitRouteIslands({
                seed: 777,
                riverWidth,
                finishZ: -1500,
            });

            for (const isl of islands) {
                assert.ok(isl.length >= ROUTE_BRANCH_CONFIG.MIN_ISLAND_LENGTH);
                assert.ok(isl.length <= ROUTE_BRANCH_CONFIG.MAX_ISLAND_LENGTH);
                assert.ok(isl.width >= ROUTE_BRANCH_CONFIG.MIN_ISLAND_WIDTH);
                assert.ok(isl.width <= ROUTE_BRANCH_CONFIG.MAX_ISLAND_WIDTH);

                // Both left and right navigable channels must have positive clear navigable width
                assert.ok(isl.leftChannel.width >= 12.0, `Left channel width ${isl.leftChannel.width} too narrow`);
                assert.ok(isl.rightChannel.width >= 12.0, `Right channel width ${isl.rightChannel.width} too narrow`);
            }
        });

        it('assigns complementary Calm and Rapids channels to opposite sides', () => {
            const islands = generateSplitRouteIslands({ seed: 555, riverWidth: 80 });

            for (const isl of islands) {
                const types = [isl.leftChannel.type, isl.rightChannel.type];
                assert.ok(types.includes('calm'), 'Must have a calm channel');
                assert.ok(types.includes('rapids'), 'Must have a rapids channel');
                assert.notEqual(isl.leftChannel.type, isl.rightChannel.type);

                // Calm channel gets slower current multiplier; rapids gets speed boost
                if (isl.leftChannel.type === 'calm') {
                    assert.equal(isl.leftChannel.currentMultiplier, ROUTE_BRANCH_CONFIG.CALM_CHANNEL.CURRENT_MULTIPLIER);
                    assert.equal(isl.rightChannel.currentMultiplier, ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.CURRENT_MULTIPLIER);
                } else {
                    assert.equal(isl.leftChannel.currentMultiplier, ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.CURRENT_MULTIPLIER);
                    assert.equal(isl.rightChannel.currentMultiplier, ROUTE_BRANCH_CONFIG.CALM_CHANNEL.CURRENT_MULTIPLIER);
                }
            }
        });

        it('spawns repair crates on the calm channel and gold rings on the rapids channel', () => {
            const islands = generateSplitRouteIslands({ seed: 333 });

            for (const isl of islands) {
                assert.equal(isl.repairCrates.length, ROUTE_BRANCH_CONFIG.CALM_CHANNEL.REPAIR_CRATES_PER_ISLAND);
                assert.equal(isl.goldRings.length, ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.GOLD_RINGS_PER_ISLAND);

                // Verify repair crate properties
                for (const crate of isl.repairCrates) {
                    assert.equal(crate.hpRecover, ROUTE_BRANCH_CONFIG.CALM_CHANNEL.REPAIR_HP_VALUE);
                    assert.equal(crate.collected, false);
                    assert.ok(crate.z <= isl.zStart && crate.z >= isl.zEnd);
                }

                // Verify gold ring properties
                for (const ring of isl.goldRings) {
                    assert.equal(ring.value, ROUTE_BRANCH_CONFIG.RAPIDS_CHANNEL.GOLD_RING_VALUE);
                    assert.equal(ring.collected, false);
                    assert.ok(ring.z <= isl.zStart && ring.z >= isl.zEnd);
                }
            }
        });

        it('adapts biomeTheme based on Z coordinate', () => {
            const islands = generateSplitRouteIslands({ seed: 101, finishZ: -1500 });

            const themes = islands.map((i) => i.biomeTheme);
            assert.ok(themes.includes('canyon'), 'Should include canyon in Act 1');
            assert.ok(themes.includes('harbor'), 'Should include harbor in Act 2');
        });
    });

    describe('getChannelRouteAt() spatial channel evaluation', () => {
        const islands = generateSplitRouteIslands({ seed: 101, riverWidth: 80, finishZ: -1500 });
        const island = islands[0]; // z = -120

        it('returns open river defaults when far away from any island', () => {
            const query = getChannelRouteAt(0, 0, islands, 80);
            assert.equal(query.channelType, 'open');
            assert.equal(query.currentMultiplier, 1.0);
            assert.equal(query.inIslandBounds, false);
            assert.equal(query.activeIsland, null);
            assert.equal(query.recommendedAction, 'cruise');
        });

        it('detects collision when coordinate is directly on island ground', () => {
            // Center of first island
            const query = getChannelRouteAt(island.x, island.z, islands, 80);
            assert.equal(query.channelType, 'island');
            assert.equal(query.inIslandBounds, true);
            assert.equal(query.currentMultiplier, 0.0);
            assert.equal(query.recommendedAction, 'steer_clear_grounding');
        });

        it('correctly classifies left channel and returns side-specific metrics', () => {
            const leftX = island.minX - 5.0; // In left channel
            const query = getChannelRouteAt(leftX, island.z, islands, 80);

            assert.equal(query.channelType, island.leftChannel.type);
            assert.equal(query.channelSide, 'left');
            assert.equal(query.inIslandBounds, false);
            assert.equal(query.activeIsland.id, island.id);
            assert.equal(query.currentMultiplier, island.leftChannel.currentMultiplier);
            assert.ok(query.distanceToIsland > 0);
        });

        it('correctly classifies right channel and returns side-specific metrics', () => {
            const rightX = island.maxX + 5.0; // In right channel
            const query = getChannelRouteAt(rightX, island.z, islands, 80);

            assert.equal(query.channelType, island.rightChannel.type);
            assert.equal(query.channelSide, 'right');
            assert.equal(query.inIslandBounds, false);
            assert.equal(query.activeIsland.id, island.id);
            assert.equal(query.currentMultiplier, island.rightChannel.currentMultiplier);
            assert.ok(query.distanceToIsland > 0);
        });

        it('handles null/empty islands array gracefully', () => {
            const query = getChannelRouteAt(0, -100, null, 80);
            assert.equal(query.channelType, 'open');
            assert.equal(query.currentMultiplier, 1.0);
        });
    });

    describe('buildIsland3DMesh() procedural 3D model construction', () => {
        const THREE = createMockThree();
        const islands = generateSplitRouteIslands({ seed: 101, riverWidth: 80 });
        const island = islands[0];

        it('throws error if THREE is missing', () => {
            assert.throws(() => {
                buildIsland3DMesh(null, island);
            }, /requires THREE injected/);
        });

        it('constructs composite mesh hierarchy with beach, cliff, foliage, beacons, and collectibles', () => {
            const islandObj = buildIsland3DMesh(THREE, island);

            assert.ok(islandObj.rootGroup);
            assert.equal(islandObj.rootGroup.name, island.id);
            assert.equal(islandObj.rootGroup.position.x, island.x);
            assert.equal(islandObj.rootGroup.position.z, island.z);

            // Inspect children groups
            const childNames = islandObj.rootGroup.children.map((c) => c.name);
            assert.ok(childNames.includes('IslandFoliage'));
            assert.ok(childNames.includes('IslandCollectibles'));

            // Verify collectibles
            const collectibles = islandObj.rootGroup.children.find((c) => c.name === 'IslandCollectibles');
            assert.ok(collectibles);
            assert.equal(
                collectibles.children.length,
                island.repairCrates.length + island.goldRings.length
            );
        });

        it('animates spinning gold rings during update()', () => {
            const islandObj = buildIsland3DMesh(THREE, island);
            const collectibles = islandObj.rootGroup.children.find((c) => c.name === 'IslandCollectibles');
            const ringMesh = collectibles.children.find((c) => c.userData.type === 'gold_ring');

            if (ringMesh) {
                const initRotY = ringMesh.rotation.y;
                islandObj.update(0.05, 1.0);
                assert.notEqual(ringMesh.rotation.y, initRotY, 'Ring mesh rotation.y should advance during update');
            }
        });

        it('cleanly disposes all geometries and materials without throwing', () => {
            const islandObj = buildIsland3DMesh(THREE, island);
            assert.ok(islandObj.disposedResources.geometries.length > 0);
            assert.ok(islandObj.disposedResources.materials.length > 0);

            assert.doesNotThrow(() => {
                islandObj.dispose();
            });

            // Check that dispose was called
            assert.equal(islandObj.disposedResources.geometries.length, 0);
            assert.equal(islandObj.disposedResources.materials.length, 0);
        });
    });
});
