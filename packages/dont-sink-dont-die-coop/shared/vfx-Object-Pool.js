/**
 * Don't Sink, Don't Die — Zero-Allocation Twin-Oar Splash Pool & Ring-Buffer Caps
 * (`shared/vfx-Object-Pool.js`)
 *
 * Sovereign Core & Helmet 06 (Synthetic José Pragmatic Performance & Smoothness Engineer):
 * - Zero object/array allocation inside hot 60Hz / requestAnimationFrame loops.
 * - O(1) ring-buffer slot acquisition for paired port (`leftPaddle`) and starboard (`rightPaddle`) oar splashes.
 * - In-place lifetime advancement and compaction so running for 8 hours uses the exact same RAM as 2 minutes.
 */

export const DEFAULT_OAR_SPLASH_POOL_CAPACITY = 128;

/**
 * Creates a pre-warmed, fixed-capacity ring-buffer pool for twin-oar water splashes.
 *
 * @param {number} [capacity=128]
 * @returns {object} Pool instance with pre-allocated slots
 */
export function createTwinOarSplashPool(capacity = DEFAULT_OAR_SPLASH_POOL_CAPACITY) {
    const cap = Number.isFinite(capacity) && capacity >= 2 ? Math.floor(capacity) : DEFAULT_OAR_SPLASH_POOL_CAPACITY;
    const slots = new Array(cap);
    for (let i = 0; i < cap; i++) {
        slots[i] = {
            index: i,
            active: false,
            side: i % 2 === 0 ? 'left' : 'right',
            x: 0,
            y: 0,
            z: 0,
            vx: 0,
            vy: 0,
            vz: 0,
            age: 0,
            maxLife: 0.55,
            scale: 0.22,
        };
    }
    return {
        capacity: cap,
        cursor: 0,
        activeCount: 0,
        slots,
        // Pre-allocated pair return holder so callers never allocate a 2-element array per frame
        _pairResult: { left: slots[0], right: slots[1] },
    };
}

function acquireSlotInPlace(pool, side, x, y, z, vx, vy, vz, maxLife = 0.55, scale = 0.22) {
    const cap = pool.capacity;
    const slot = pool.slots[pool.cursor];
    pool.cursor = (pool.cursor + 1) % cap;
    if (!slot.active) {
        pool.activeCount++;
    }
    slot.active = true;
    slot.side = side;
    slot.x = Number.isFinite(x) ? x : 0;
    slot.y = Number.isFinite(y) ? y : 0;
    slot.z = Number.isFinite(z) ? z : 0;
    slot.vx = Number.isFinite(vx) ? vx : 0;
    slot.vy = Number.isFinite(vy) ? vy : 0;
    slot.vz = Number.isFinite(vz) ? vz : 0;
    slot.age = 0;
    slot.maxLife = Number.isFinite(maxLife) && maxLife > 0 ? maxLife : 0.55;
    slot.scale = Number.isFinite(scale) && scale > 0 ? scale : 0.22;
    return slot;
}

/**
 * Acquires two pre-allocated particle slots (port `left` and starboard `right`) in O(1) time
 * with zero heap allocations.
 */
export function acquirePairedOarSplashes(
    pool,
    leftX,
    leftZ,
    rightX,
    rightZ,
    vx = 0,
    vy = 1.0,
    vz = 0,
    y = 0.29,
    maxLife = 0.55,
    scale = 0.22
) {
    if (!pool || !Array.isArray(pool.slots) || pool.capacity < 2) {
        return null;
    }
    const leftSlot = acquireSlotInPlace(pool, 'left', leftX, y, leftZ, vx, vy, vz, maxLife, scale);
    const rightSlot = acquireSlotInPlace(pool, 'right', rightX, y, rightZ, vx, vy, vz, maxLife, scale);
    pool._pairResult.left = leftSlot;
    pool._pairResult.right = rightSlot;
    return pool._pairResult;
}

/**
 * Advances all active particles in-place and recycles expired slots with zero allocations.
 *
 * @param {object} pool
 * @param {number} dt
 * @param {number} [gravity=9.8]
 * @returns {number} Current number of active slots
 */
export function stepAndCompactPoolInPlace(pool, dt, gravity = 9.8) {
    if (!pool || !Array.isArray(pool.slots)) return 0;
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    if (safeDt === 0) return pool.activeCount;

    const slots = pool.slots;
    const len = slots.length;
    let active = 0;
    for (let i = 0; i < len; i++) {
        const s = slots[i];
        if (!s.active) continue;
        s.age += safeDt;
        if (s.age >= s.maxLife) {
            s.active = false;
            continue;
        }
        s.x += s.vx * safeDt;
        s.y += s.vy * safeDt;
        s.z += s.vz * safeDt;
        s.vy -= gravity * safeDt;
        active++;
    }
    pool.activeCount = active;
    return active;
}
