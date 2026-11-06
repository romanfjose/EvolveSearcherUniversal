import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    createTwinOarSplashPool,
    acquirePairedOarSplashes,
    stepAndCompactPoolInPlace,
} from '../shared/vfx-Object-Pool.js';

describe('Helmet 06 Pragmatic Performance — Zero-Alloc Twin-Oar Splash Pool', () => {
    test('acquires paired left and right oar splash slots in O(1) without allocating new slot objects', () => {
        const pool = createTwinOarSplashPool(16);
        const slotRefs = pool.slots.slice();

        const pair = acquirePairedOarSplashes(pool, -1.35, -10, 1.35, -10, 0, 1.2, 2.0);
        assert.ok(pair);
        assert.equal(pair.left.side, 'left');
        assert.equal(pair.right.side, 'right');
        assert.equal(pair.left.x, -1.35);
        assert.equal(pair.right.x, 1.35);
        assert.equal(pool.activeCount, 2);

        for (let i = 0; i < pool.capacity; i++) {
            assert.strictEqual(pool.slots[i], slotRefs[i]);
        }
    });

    test('maintains bounded ring-buffer capacity and zero object growth across 10,000 simulated 60Hz frames', () => {
        const pool = createTwinOarSplashPool(64);
        const initialSlots = pool.slots.slice();
        const dt = 1 / 60;

        for (let frame = 0; frame < 10000; frame++) {
            if (frame % 3 === 0) {
                acquirePairedOarSplashes(pool, -1.35, -frame * 0.05, 1.35, -frame * 0.05, 0.2, 1.1, 1.8);
            }
            const active = stepAndCompactPoolInPlace(pool, dt);
            assert.ok(active <= pool.capacity, `Active count ${active} exceeded cap ${pool.capacity}`);
        }

        assert.equal(pool.slots.length, 64);
        for (let i = 0; i < 64; i++) {
            assert.strictEqual(pool.slots[i], initialSlots[i]);
            assert.ok(Number.isFinite(pool.slots[i].x));
            assert.ok(Number.isFinite(pool.slots[i].y));
            assert.ok(Number.isFinite(pool.slots[i].z));
        }
    });
});
