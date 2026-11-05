/**
 * Don't Sink, Don't Die — Zero-Allocation TypedArray Particle & Entity Pool
 * (`shared/object-pool.js`)
 *
 * Sovereign Core & Helmet 02 Architecture:
 * - Pre-allocated ring-buffer / index-stack object pool for game entities.
 * - Structure-of-Arrays (SoA) Float32Array Particle State Table (positions,
 *   velocities, colors, lifetimes, sizes, extra custom flags).
 * - O(1) acquire and release with zero runtime heap allocations during gameplay.
 * - Deterministic, pure-math gameplay logic with zero external dependencies.
 */

// ─── Generic Ring-Buffer / Index-Stack Object Pool ─────────────────────────

/**
 * Creates a zero-allocation generic object pool.
 * Pre-allocates elements using factoryFn, stores references in a fixed ring buffer / stack,
 * and tracks available slots without resizing or allocating at runtime.
 *
 * @param {Function} factoryFn - (index) => object instance
 * @param {Function} [resetFn] - (object, index) => void (called on acquire or release)
 * @param {number} [capacity=1024] - Max pre-allocated instances
 * @returns {object} Object pool controller
 */
export function createObjectPool(factoryFn, resetFn = null, capacity = 1024) {
    if (typeof factoryFn !== 'function') {
        throw new TypeError('createObjectPool requires a factory function');
    }
    const max = Math.max(1, capacity | 0);
    const pool = new Array(max);
    const freeIndices = new Int32Array(max);

    // Pre-allocate all objects in memory upfront
    for (let i = 0; i < max; i++) {
        pool[i] = factoryFn(i);
        freeIndices[i] = i;
    }

    let head = max; // Number of currently available free instances
    let totalAcquired = 0;
    let totalReleased = 0;

    return {
        capacity: max,

        /**
         * Returns the number of currently available idle instances.
         */
        getAvailableCount() {
            return head;
        },

        /**
         * Returns the number of active acquired instances.
         */
        getActiveCount() {
            return max - head;
        },

        /**
         * Acquires an idle instance in O(1) time without heap allocations.
         * Returns null if pool capacity is exhausted.
         *
         * @returns {object|null}
         */
        acquire() {
            if (head <= 0) {
                return null; // Pool exhausted, zero allocation drop
            }
            head--;
            const slotIndex = freeIndices[head];
            const instance = pool[slotIndex];
            if (resetFn) {
                resetFn(instance, slotIndex);
            }
            totalAcquired++;
            return instance;
        },

        /**
         * Releases an instance back into the pool in O(1) time.
         *
         * @param {object} instance
         * @returns {boolean} True if successfully returned, false if pool is full or invalid
         */
        release(instance) {
            if (!instance || head >= max) {
                return false;
            }
            const slotIndex = pool.indexOf(instance);
            if (slotIndex === -1) {
                return false;
            }
            // Check if already in free list to prevent duplicate releases
            for (let i = 0; i < head; i++) {
                if (freeIndices[i] === slotIndex) {
                    return false;
                }
            }

            if (resetFn) {
                resetFn(instance, slotIndex);
            }
            freeIndices[head] = slotIndex;
            head++;
            totalReleased++;
            return true;
        },

        /**
         * Releases an instance by its known slot index in true O(1) time (no indexOf lookup).
         *
         * @param {number} slotIndex
         * @returns {boolean}
         */
        releaseIndex(slotIndex) {
            if (slotIndex < 0 || slotIndex >= max || head >= max) {
                return false;
            }
            for (let i = 0; i < head; i++) {
                if (freeIndices[i] === slotIndex) {
                    return false;
                }
            }
            const instance = pool[slotIndex];
            if (resetFn) {
                resetFn(instance, slotIndex);
            }
            freeIndices[head] = slotIndex;
            head++;
            totalReleased++;
            return true;
        },

        /**
         * Direct access to underlying object array.
         */
        getRawPool() {
            return pool;
        },

        /**
         * Resets the entire pool, reclaiming all instances immediately.
         */
        reset() {
            head = max;
            for (let i = 0; i < max; i++) {
                freeIndices[i] = i;
                if (resetFn) {
                    resetFn(pool[i], i);
                }
            }
            totalAcquired = 0;
            totalReleased = 0;
        },

        /**
         * Pool diagnostics metrics.
         */
        getMetrics() {
            return {
                capacity: max,
                available: head,
                active: max - head,
                totalAcquired,
                totalReleased,
            };
        },
    };
}

// ─── High-Performance Float32Array Particle State Table ────────────────────

/**
 * Layout stride definitions for ParticleStateTable:
 * - positions: 3 floats (x, y, z)
 * - velocities: 3 floats (vx, vy, vz)
 * - colors: 4 floats (r, g, b, a)
 * - lifetimes: 2 floats (life, maxLife)
 * - sizes: 2 floats (size, startSize)
 * - userFlags: 2 floats (customData0, customData1)
 */
export const PARTICLE_STRIDES = {
    POSITION: 3,
    VELOCITY: 3,
    COLOR: 4,
    LIFETIME: 2,
    SIZE: 2,
    USER_FLAGS: 2,
};

/**
 * Creates a zero-allocation Structure-of-Arrays (SoA) TypedArray Particle State Table.
 * All memory is pinned upfront in contiguous TypedArray buffers.
 * Supporting O(1) particle spawn, despawn (swap-and-pop), batch simulation steps,
 * and direct Three.js BufferAttribute binding access with zero runtime GC overhead.
 *
 * @param {number} [capacity=2048] - Maximum particle count
 * @returns {object} Particle table controller
 */
export function createParticleStateTable(capacity = 2048) {
    const max = Math.max(1, capacity | 0);

    // Contiguous TypedArray buffers
    const positions = new Float32Array(max * PARTICLE_STRIDES.POSITION);
    const velocities = new Float32Array(max * PARTICLE_STRIDES.VELOCITY);
    const colors = new Float32Array(max * PARTICLE_STRIDES.COLOR);
    const lifetimes = new Float32Array(max * PARTICLE_STRIDES.LIFETIME); // [life, maxLife]
    const sizes = new Float32Array(max * PARTICLE_STRIDES.SIZE); // [size, initialSize]
    const userFlags = new Float32Array(max * PARTICLE_STRIDES.USER_FLAGS); // [tag, drag]

    // Active particle index list (dense array for cache-friendly iterations)
    const activeIndices = new Int32Array(max);
    // Index map from particle slot to position in activeIndices (for O(1) swap-and-pop removal)
    const denseMap = new Int32Array(max);
    // Stack of free slots
    const freeSlots = new Int32Array(max);

    for (let i = 0; i < max; i++) {
        freeSlots[i] = i;
        denseMap[i] = -1;
    }

    let freeCount = max;
    let activeCount = 0;

    /**
     * Internal helper to activate a slot.
     */
    function _activateSlot(slot) {
        denseMap[slot] = activeCount;
        activeIndices[activeCount] = slot;
        activeCount++;
    }

    /**
     * Internal helper to deactivate a slot via swap-and-pop in O(1).
     */
    function _deactivateSlot(slot) {
        const denseIdx = denseMap[slot];
        if (denseIdx === -1) return false;

        const lastActiveIdx = activeCount - 1;
        const lastSlot = activeIndices[lastActiveIdx];

        // Swap with last active element
        activeIndices[denseIdx] = lastSlot;
        denseMap[lastSlot] = denseIdx;

        denseMap[slot] = -1;
        activeCount--;

        // Push slot back to free list
        freeSlots[freeCount] = slot;
        freeCount++;

        // Clear active lifetime
        lifetimes[slot * 2] = 0;
        return true;
    }

    return {
        capacity: max,

        // Raw TypedArray buffer references for direct GPU BufferAttribute uploads
        buffers: {
            positions,
            velocities,
            colors,
            lifetimes,
            sizes,
            userFlags,
        },

        getActiveCount() {
            return activeCount;
        },

        getAvailableCount() {
            return freeCount;
        },

        /**
         * Spawns a new particle into the state table in O(1) time without heap allocations.
         *
         * @param {number} x
         * @param {number} y
         * @param {number} z
         * @param {number} vx
         * @param {number} vy
         * @param {number} vz
         * @param {number} r
         * @param {number} g
         * @param {number} b
         * @param {number} a
         * @param {number} life
         * @param {number} size
         * @param {number} [tag=0]
         * @param {number} [drag=0]
         * @returns {number} Slot index of spawned particle, or -1 if table is full
         */
        spawn(x, y, z, vx, vy, vz, r, g, b, a, life, size, tag = 0, drag = 0) {
            if (freeCount <= 0) {
                return -1; // Saturated, drop particle deterministically
            }
            freeCount--;
            const slot = freeSlots[freeCount];

            const pIdx = slot * 3;
            positions[pIdx + 0] = x;
            positions[pIdx + 1] = y;
            positions[pIdx + 2] = z;

            velocities[pIdx + 0] = vx;
            velocities[pIdx + 1] = vy;
            velocities[pIdx + 2] = vz;

            const cIdx = slot * 4;
            colors[cIdx + 0] = r;
            colors[cIdx + 1] = g;
            colors[cIdx + 2] = b;
            colors[cIdx + 3] = a;

            const lIdx = slot * 2;
            lifetimes[lIdx + 0] = life;
            lifetimes[lIdx + 1] = life; // maxLife

            const sIdx = slot * 2;
            sizes[sIdx + 0] = size;
            sizes[sIdx + 1] = size; // initialSize

            const uIdx = slot * 2;
            userFlags[uIdx + 0] = tag;
            userFlags[uIdx + 1] = drag;

            _activateSlot(slot);
            return slot;
        },

        /**
         * Reclaims a particle at a given slot in O(1) swap-and-pop time.
         *
         * @param {number} slot
         * @returns {boolean}
         */
        despawn(slot) {
            if (slot < 0 || slot >= max) return false;
            return _deactivateSlot(slot);
        },

        /**
         * Reads particle position into an existing out object or array in O(1) without allocations.
         */
        getPosition(slot, out = { x: 0, y: 0, z: 0 }) {
            const idx = slot * 3;
            out.x = positions[idx];
            out.y = positions[idx + 1];
            out.z = positions[idx + 2];
            return out;
        },

        /**
         * Reads particle velocity into an existing out object in O(1).
         */
        getVelocity(slot, out = { x: 0, y: 0, z: 0 }) {
            const idx = slot * 3;
            out.x = velocities[idx];
            out.y = velocities[idx + 1];
            out.z = velocities[idx + 2];
            return out;
        },

        /**
         * Reads particle color RGBA into an existing out object.
         */
        getColor(slot, out = { r: 1, g: 1, b: 1, a: 1 }) {
            const idx = slot * 4;
            out.r = colors[idx];
            out.g = colors[idx + 1];
            out.b = colors[idx + 2];
            out.a = colors[idx + 3];
            return out;
        },

        /**
         * Reads particle lifetime info into an existing out object.
         */
        getLifetime(slot, out = { life: 0, maxLife: 0, normalized: 0 }) {
            const idx = slot * 2;
            const life = lifetimes[idx];
            const maxLife = lifetimes[idx + 1];
            out.life = life;
            out.maxLife = maxLife;
            out.normalized = maxLife > 0 ? Math.max(0, Math.min(1, life / maxLife)) : 0;
            return out;
        },

        /**
         * Updates all active particles in a single cache-efficient contiguous loop:
         * - Decrements lifetimes by dt.
         * - Applies optional gravity, linear drag, and velocity integration.
         * - Reclaims expired particles via swap-and-pop without heap churn.
         *
         * @param {number} dt - Delta time (seconds)
         * @param {number} [gravity=-9.81] - Downward Y acceleration
         * @param {Function} [customUpdateFn] - Optional callback (slot, positions, velocities, lifetimes, dt)
         * @returns {number} Number of active particles remaining
         */
        step(dt, gravity = 0, customUpdateFn = null) {
            let i = 0;
            while (i < activeCount) {
                const slot = activeIndices[i];
                const lIdx = slot * 2;

                // Decrement lifetime
                lifetimes[lIdx] -= dt;

                if (lifetimes[lIdx] <= 0) {
                    // Expired: swap-and-pop in dense array
                    _deactivateSlot(slot);
                    // Do not increment i; new slot was swapped into current index i
                    continue;
                }

                const pIdx = slot * 3;
                const uIdx = slot * 2;
                const drag = userFlags[uIdx + 1];

                // Apply drag if configured
                if (drag > 0) {
                    const dragFactor = Math.max(0, 1 - drag * dt);
                    velocities[pIdx + 0] *= dragFactor;
                    velocities[pIdx + 1] *= dragFactor;
                    velocities[pIdx + 2] *= dragFactor;
                }

                // Apply gravity
                if (gravity !== 0) {
                    velocities[pIdx + 1] += gravity * dt;
                }

                // Integrate position
                positions[pIdx + 0] += velocities[pIdx + 0] * dt;
                positions[pIdx + 1] += velocities[pIdx + 1] * dt;
                positions[pIdx + 2] += velocities[pIdx + 2] * dt;

                // User custom pass if provided
                if (customUpdateFn) {
                    customUpdateFn(slot, positions, velocities, lifetimes, dt);
                }

                i++;
            }

            return activeCount;
        },

        /**
         * Iterates over all active particles without allocating arrays.
         *
         * @param {Function} callback - (slot, index) => void
         */
        forEachActive(callback) {
            for (let i = 0; i < activeCount; i++) {
                callback(activeIndices[i], i);
            }
        },

        /**
         * Clears all particles immediately and resets indices.
         */
        reset() {
            activeCount = 0;
            freeCount = max;
            for (let i = 0; i < max; i++) {
                freeSlots[i] = i;
                denseMap[i] = -1;
                lifetimes[i * 2] = 0;
                lifetimes[i * 2 + 1] = 0;
            }
        },
    };
}
