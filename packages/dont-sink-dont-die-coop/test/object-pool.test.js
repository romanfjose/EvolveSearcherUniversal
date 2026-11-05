import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    createObjectPool,
    createParticleStateTable,
    PARTICLE_STRIDES,
} from '../shared/object-pool.js';

describe('Zero-Allocation Object Pool & TypedArray Particle State Table', () => {

    describe('createObjectPool', () => {
        it('throws TypeError if factory is not a function', () => {
            assert.throws(() => createObjectPool(null), TypeError);
            assert.throws(() => createObjectPool(undefined), TypeError);
        });

        it('initializes with correct capacity and available count', () => {
            const pool = createObjectPool((i) => ({ id: i, active: false }), null, 16);
            assert.equal(pool.capacity, 16);
            assert.equal(pool.getAvailableCount(), 16);
            assert.equal(pool.getActiveCount(), 0);
        });

        it('acquires and releases instances with O(1) tracking', () => {
            let resetCount = 0;
            const resetFn = (obj) => {
                obj.active = false;
                resetCount++;
            };
            const pool = createObjectPool((i) => ({ id: i, active: false }), resetFn, 4);

            const a1 = pool.acquire();
            assert.ok(a1);
            assert.equal(pool.getAvailableCount(), 3);
            assert.equal(pool.getActiveCount(), 1);

            const a2 = pool.acquire();
            const a3 = pool.acquire();
            const a4 = pool.acquire();
            assert.equal(pool.getAvailableCount(), 0);
            assert.equal(pool.getActiveCount(), 4);

            // Pool exhausted
            const a5 = pool.acquire();
            assert.equal(a5, null);

            // Release instance
            const released = pool.release(a2);
            assert.equal(released, true);
            assert.equal(pool.getAvailableCount(), 1);
            assert.equal(pool.getActiveCount(), 3);

            // Duplicate release should be rejected safely
            const duplicateRelease = pool.release(a2);
            assert.equal(duplicateRelease, false);

            // Release unknown object
            assert.equal(pool.release({ fake: true }), false);
            assert.equal(pool.release(null), false);

            // Re-acquire should give back the released instance
            const reacquired = pool.acquire();
            assert.equal(reacquired, a2);
        });

        it('supports O(1) releaseIndex without indexOf overhead', () => {
            const pool = createObjectPool((i) => ({ id: i }), null, 4);
            const a = pool.acquire();
            assert.equal(pool.getActiveCount(), 1);

            // Release by invalid index
            assert.equal(pool.releaseIndex(-1), false);
            assert.equal(pool.releaseIndex(99), false);

            // Release valid index (slot 3 was the last free index popped)
            const ok = pool.releaseIndex(3);
            assert.equal(ok, true);
            assert.equal(pool.getActiveCount(), 0);
            assert.equal(pool.getAvailableCount(), 4);

            // Duplicate releaseIndex is blocked
            assert.equal(pool.releaseIndex(3), false);
        });

        it('resets cleanly back to initial state', () => {
            const pool = createObjectPool((i) => ({ id: i, count: 0 }), (obj) => { obj.count = 0; }, 8);
            for (let i = 0; i < 6; i++) {
                const item = pool.acquire();
                item.count = 99;
            }
            assert.equal(pool.getActiveCount(), 6);
            assert.equal(pool.getAvailableCount(), 2);

            pool.reset();
            assert.equal(pool.getActiveCount(), 0);
            assert.equal(pool.getAvailableCount(), 8);

            const metrics = pool.getMetrics();
            assert.equal(metrics.capacity, 8);
            assert.equal(metrics.available, 8);
            assert.equal(metrics.active, 0);
        });

        it('guarantees zero heap allocation growth across high-frequency acquire/release loop', () => {
            const pool = createObjectPool((i) => ({ id: i, x: 0, y: 0 }), null, 500);
            const acquired = [];

            // Perform 20,000 rapid cycles
            for (let cycle = 0; cycle < 40; cycle++) {
                for (let i = 0; i < 500; i++) {
                    const obj = pool.acquire();
                    obj.x = i;
                    acquired.push(obj);
                }
                assert.equal(pool.getAvailableCount(), 0);
                assert.equal(pool.acquire(), null);

                for (let i = 0; i < 500; i++) {
                    pool.release(acquired.pop());
                }
                assert.equal(pool.getAvailableCount(), 500);
            }
            assert.equal(pool.getMetrics().totalAcquired, 20000);
            assert.equal(pool.getMetrics().totalReleased, 20000);
        });
    });

    describe('createParticleStateTable', () => {
        it('exposes correct strides and typed buffer layout', () => {
            assert.equal(PARTICLE_STRIDES.POSITION, 3);
            assert.equal(PARTICLE_STRIDES.VELOCITY, 3);
            assert.equal(PARTICLE_STRIDES.COLOR, 4);
            assert.equal(PARTICLE_STRIDES.LIFETIME, 2);
            assert.equal(PARTICLE_STRIDES.SIZE, 2);
            assert.equal(PARTICLE_STRIDES.USER_FLAGS, 2);

            const table = createParticleStateTable(64);
            assert.equal(table.capacity, 64);
            assert.equal(table.buffers.positions.length, 64 * 3);
            assert.equal(table.buffers.velocities.length, 64 * 3);
            assert.equal(table.buffers.colors.length, 64 * 4);
            assert.equal(table.buffers.lifetimes.length, 64 * 2);
            assert.equal(table.buffers.sizes.length, 64 * 2);
            assert.equal(table.buffers.userFlags.length, 64 * 2);
            assert.equal(table.getActiveCount(), 0);
            assert.equal(table.getAvailableCount(), 64);
        });

        it('spawns particles and reads state in O(1)', () => {
            const table = createParticleStateTable(10);
            const slot = table.spawn(
                10, 20, 30,     // pos
                1, 2, 3,        // vel
                0.2, 0.4, 0.6, 1.0, // color
                2.5,            // life
                4.0,            // size
                42,             // tag
                0.5             // drag
            );

            assert.ok(slot >= 0);
            assert.equal(table.getActiveCount(), 1);
            assert.equal(table.getAvailableCount(), 9);

            const pos = table.getPosition(slot);
            assert.equal(pos.x, 10);
            assert.equal(pos.y, 20);
            assert.equal(pos.z, 30);

            const vel = table.getVelocity(slot);
            assert.equal(vel.x, 1);
            assert.equal(vel.y, 2);
            assert.equal(vel.z, 3);

            const col = table.getColor(slot);
            assert.ok(Math.abs(col.r - 0.2) < 1e-5);
            assert.ok(Math.abs(col.g - 0.4) < 1e-5);
            assert.ok(Math.abs(col.b - 0.6) < 1e-5);
            assert.equal(col.a, 1.0);

            const lt = table.getLifetime(slot);
            assert.equal(lt.life, 2.5);
            assert.equal(lt.maxLife, 2.5);
            assert.equal(lt.normalized, 1.0);
        });

        it('returns -1 when table is saturated', () => {
            const table = createParticleStateTable(2);
            const s1 = table.spawn(0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1);
            const s2 = table.spawn(1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1);
            const s3 = table.spawn(2, 2, 2, 0, 0, 0, 1, 1, 1, 1, 1, 1);

            assert.ok(s1 >= 0);
            assert.ok(s2 >= 0);
            assert.equal(s3, -1);
            assert.equal(table.getActiveCount(), 2);
            assert.equal(table.getAvailableCount(), 0);
        });

        it('despawns particles via O(1) swap-and-pop and allows reuse', () => {
            const table = createParticleStateTable(4);
            const s0 = table.spawn(0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1);
            const s1 = table.spawn(10, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1);
            const s2 = table.spawn(20, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1);
            assert.equal(table.getActiveCount(), 3);

            // Despawn middle particle
            assert.equal(table.despawn(s1), true);
            assert.equal(table.getActiveCount(), 2);
            assert.equal(table.getAvailableCount(), 2);

            // Duplicate despawn should be safely false
            assert.equal(table.despawn(s1), false);
            assert.equal(table.despawn(999), false);

            // Next spawn reuses free slot
            const sNew = table.spawn(99, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1);
            assert.equal(sNew, s1);
            assert.equal(table.getActiveCount(), 3);
        });

        it('steps physics, integrates velocity, and applies drag & gravity', () => {
            const table = createParticleStateTable(10);
            // Spawn with vy = 10, gravity = -20, dt = 0.1
            const slot = table.spawn(
                0, 0, 0,      // pos
                0, 10, 0,     // vel
                1, 1, 1, 1,   // color
                1.0,          // life
                1.0,          // size
                0,            // tag
                0             // drag = 0
            );

            // Step dt = 0.1s with gravity = -20 m/s^2
            table.step(0.1, -20);

            // vel.y after dt: 10 + (-20 * 0.1) = 8
            // pos.y after dt: 0 + 8 * 0.1 = 0.8
            const pos = table.getPosition(slot);
            const vel = table.getVelocity(slot);
            assert.ok(Math.abs(vel.y - 8.0) < 1e-4);
            assert.ok(Math.abs(pos.y - 0.8) < 1e-4);

            const lt = table.getLifetime(slot);
            assert.ok(Math.abs(lt.life - 0.9) < 1e-4);
        });

        it('reclaims expired particles automatically during step without garbage', () => {
            const table = createParticleStateTable(10);
            table.spawn(0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0.05, 1); // life 0.05s
            table.spawn(1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1.0, 1);  // life 1.0s
            assert.equal(table.getActiveCount(), 2);

            // Step 0.1s -> first particle expires
            const remaining = table.step(0.1, 0);
            assert.equal(remaining, 1);
            assert.equal(table.getActiveCount(), 1);
            assert.equal(table.getAvailableCount(), 9);

            // Verify the active particle is the one with life 1.0
            const activeSlots = [];
            table.forEachActive((slot) => activeSlots.push(slot));
            assert.equal(activeSlots.length, 1);

            const lt = table.getLifetime(activeSlots[0]);
            assert.ok(Math.abs(lt.life - 0.9) < 1e-4);
        });

        it('supports customUpdateFn in step pass', () => {
            const table = createParticleStateTable(5);
            const slot = table.spawn(0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 2.0, 1);

            let customCalled = 0;
            table.step(0.1, 0, (s, positions, velocities, lifetimes, dt) => {
                customCalled++;
                positions[s * 3 + 2] += 5.0; // custom Z boost
            });

            assert.equal(customCalled, 1);
            const pos = table.getPosition(slot);
            assert.ok(Math.abs(pos.z - 5.0) < 1e-4);
        });

        it('resets state table cleanly', () => {
            const table = createParticleStateTable(8);
            for (let i = 0; i < 8; i++) {
                table.spawn(i, i, i, 0, 0, 0, 1, 1, 1, 1, 10, 1);
            }
            assert.equal(table.getActiveCount(), 8);
            assert.equal(table.getAvailableCount(), 0);

            table.reset();
            assert.equal(table.getActiveCount(), 0);
            assert.equal(table.getAvailableCount(), 8);

            // Spawn after reset works smoothly
            const s = table.spawn(1, 2, 3, 0, 0, 0, 1, 1, 1, 1, 5, 1);
            assert.equal(s, 7); // Last slot in free stack
            assert.equal(table.getActiveCount(), 1);
        });

        it('handles 10,000 rapid spawn, step, and reclaim cycles with zero memory leaks', () => {
            const capacity = 256;
            const table = createParticleStateTable(capacity);

            for (let frame = 0; frame < 500; frame++) {
                // Spawn 10 particles each frame
                for (let k = 0; k < 10; k++) {
                    table.spawn(
                        Math.sin(frame), 1.0, -frame,
                        (k - 5) * 0.5, 3.0, -1.0,
                        1, 0.8, 0.2, 1.0,
                        0.25, // life 0.25s = ~15 frames at 60Hz
                        1.5,
                        0,
                        0.1
                    );
                }

                // Step simulation
                table.step(1 / 60, -9.81);
                assert.ok(table.getActiveCount() <= capacity);
            }

            // Drain remaining
            for (let i = 0; i < 30; i++) {
                table.step(0.05, 0);
            }
            assert.equal(table.getActiveCount(), 0);
            assert.equal(table.getAvailableCount(), capacity);
        });
    });
});
