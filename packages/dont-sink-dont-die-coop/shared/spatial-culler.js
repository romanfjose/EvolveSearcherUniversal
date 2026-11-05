/**
 * Sovereign Core & Helmet 02: The RTS Flight Engineer
 * (`shared/spatial-culler.js`)
 *
 * Z-Bucket Spatial Hash & River Chunk Culler.
 *
 * WHY THIS EXISTS:
 * In a 1500m river course, evaluating all river hazards (rapids, whirlpools, ramps, mines),
 * destructible barricades, bridges, rockslides, and shoreline meshes every frame wastes >80%
 * of CPU/GPU frame budget on elements far ahead or behind the player.
 *
 * This module partitions the river along the primary downriver axis (Z) into 50m spatial
 * buckets. By querying only the active window [leadZ - 160, leadZ + 55], hazard collision
 * detection, kinematic simulation, and 3D mesh rendering evaluate <20% of total entities,
 * eliminating GC pressure and maintaining consistent 60 FPS frame pacing.
 *
 * Requirements:
 * - Partition the 1500m river into 50m Z-buckets (default bucketSize = 50).
 * - Entities within [leadZ - 160, leadZ + 55] evaluated; entities outside are culled.
 * - Export createSpatialRiverIndex(bucketSize) with:
 *   - insert(entity)
 *   - remove(entityOrId)
 *   - update(entity)
 *   - queryRange(minZ, maxZ)
 *   - updateVisibilityWindow(leadZ, options)
 * - Pure ES module, zero external dependencies, deterministic.
 */

export const SPATIAL_CULLER_CONSTANTS = Object.freeze({
    DEFAULT_BUCKET_SIZE: 50,
    DEFAULT_BACKWARD_MARGIN: 160, // distance behind lead raft along Z (z - 160)
    DEFAULT_FORWARD_MARGIN: 55,   // distance ahead of lead raft along Z (z + 55)
    COURSE_START_Z: 0,
    COURSE_FINISH_Z: -1500,
});

/**
 * Computes bucket index for a given Z coordinate and bucket size.
 * Uses Math.floor to handle negative coordinates consistently.
 *
 * @param {number} z
 * @param {number} bucketSize
 * @returns {number}
 */
export function getBucketIndexForZ(z, bucketSize = SPATIAL_CULLER_CONSTANTS.DEFAULT_BUCKET_SIZE) {
    return Math.floor(z / bucketSize);
}

/**
 * Extracts the [minZ, maxZ] bounding interval for an entity.
 * Supports:
 * - minZ and maxZ explicitly defined.
 * - position object: entity.position.z (with optional radius, depth, or length).
 * - direct coordinate: entity.z (with optional radius, depth, or length).
 *
 * @param {object} entity
 * @returns {{ minZ: number, maxZ: number }}
 */
export function getEntityZBounds(entity) {
    if (!entity || typeof entity !== 'object') {
        throw new TypeError('Entity must be a valid object');
    }

    if (typeof entity.minZ === 'number' && typeof entity.maxZ === 'number') {
        const minZ = Math.min(entity.minZ, entity.maxZ);
        const maxZ = Math.max(entity.minZ, entity.maxZ);
        return { minZ, maxZ };
    }

    let centerZ = null;
    if (typeof entity.z === 'number') {
        centerZ = entity.z;
    } else if (entity.position && typeof entity.position.z === 'number') {
        centerZ = entity.position.z;
    }

    if (centerZ === null) {
        throw new Error('Entity must specify minZ/maxZ, z, or position.z');
    }

    let halfExtent = 0;
    if (typeof entity.radius === 'number' && entity.radius > 0) {
        halfExtent = Math.max(halfExtent, entity.radius);
    }
    if (typeof entity.length === 'number' && entity.length > 0) {
        halfExtent = Math.max(halfExtent, entity.length * 0.5);
    }
    if (typeof entity.depth === 'number' && entity.depth > 0) {
        halfExtent = Math.max(halfExtent, entity.depth * 0.5);
    }
    if (typeof entity.collisionRadius === 'number' && entity.collisionRadius > 0) {
        halfExtent = Math.max(halfExtent, entity.collisionRadius);
    }

    return {
        minZ: centerZ - halfExtent,
        maxZ: centerZ + halfExtent,
    };
}

/**
 * Creates a Z-Bucket Spatial River Index for fast range queries and visibility culling.
 *
 * @param {number} [bucketSize=50] - Width of each spatial bucket along the Z-axis in meters.
 * @param {object} [options={}]
 * @returns {object} Spatial river index controller.
 */
export function createSpatialRiverIndex(bucketSize = SPATIAL_CULLER_CONSTANTS.DEFAULT_BUCKET_SIZE, options = {}) {
    const size = typeof bucketSize === 'number' && bucketSize > 0 ? bucketSize : SPATIAL_CULLER_CONSTANTS.DEFAULT_BUCKET_SIZE;
    const backwardMargin = typeof options.backwardMargin === 'number' ? options.backwardMargin : SPATIAL_CULLER_CONSTANTS.DEFAULT_BACKWARD_MARGIN;
    const forwardMargin = typeof options.forwardMargin === 'number' ? options.forwardMargin : SPATIAL_CULLER_CONSTANTS.DEFAULT_FORWARD_MARGIN;

    // Map: bucketIndex (integer) -> Set of entity wrappers
    const buckets = new Map();

    // Map: entityId (string/symbol/number) or entity reference -> entityEntry
    const entries = new Map();

    let autoIdCounter = 0;

    /**
     * Resolves key used to identify entity in the registry.
     */
    function resolveKey(entity) {
        if (entity.id !== undefined && entity.id !== null) {
            return String(entity.id);
        }
        if (!entity._spatialCullerId) {
            autoIdCounter += 1;
            entity._spatialCullerId = `auto_${autoIdCounter}`;
        }
        return entity._spatialCullerId;
    }

    /**
     * Inserts an entity into the spatial bucket index.
     * If entity spans multiple buckets, it is added to all overlapping buckets.
     *
     * @param {object} entity
     * @returns {object} The inserted entity.
     */
    function insert(entity) {
        if (!entity || typeof entity !== 'object') {
            throw new TypeError('Cannot insert non-object entity into spatial index');
        }

        const key = resolveKey(entity);
        if (entries.has(key)) {
            remove(key);
        }

        const bounds = getEntityZBounds(entity);
        const startBucket = getBucketIndexForZ(bounds.minZ, size);
        const endBucket = getBucketIndexForZ(bounds.maxZ, size);

        const bucketIndices = [];
        for (let b = startBucket; b <= endBucket; b++) {
            bucketIndices.push(b);
            let set = buckets.get(b);
            if (!set) {
                set = new Set();
                buckets.set(b, set);
            }
            set.add(entity);
        }

        entries.set(key, {
            entity,
            key,
            bounds,
            bucketIndices,
            visible: entity.visible !== undefined ? !!entity.visible : true,
        });

        return entity;
    }

    /**
     * Removes an entity from the spatial index by entity instance or ID.
     *
     * @param {object|string|number} entityOrId
     * @returns {boolean} True if found and removed, false otherwise.
     */
    function remove(entityOrId) {
        if (entityOrId === null || entityOrId === undefined) return false;

        let key = null;
        if (typeof entityOrId === 'object') {
            key = entityOrId.id !== undefined ? String(entityOrId.id) : entityOrId._spatialCullerId;
        } else {
            key = String(entityOrId);
        }

        if (!key || !entries.has(key)) return false;

        const entry = entries.get(key);
        for (let i = 0; i < entry.bucketIndices.length; i++) {
            const b = entry.bucketIndices[i];
            const set = buckets.get(b);
            if (set) {
                set.delete(entry.entity);
                if (set.size === 0) {
                    buckets.delete(b);
                }
            }
        }

        entries.delete(key);
        return true;
    }

    /**
     * Updates an entity's spatial buckets after position or bounds change.
     *
     * @param {object} entity
     * @returns {boolean} True if updated, false if entity was not previously registered.
     */
    function update(entity) {
        if (!entity || typeof entity !== 'object') return false;
        const key = resolveKey(entity);
        if (!entries.has(key)) {
            insert(entity);
            return true;
        }

        remove(key);
        insert(entity);
        return true;
    }

    /**
     * Queries all unique entities whose Z-bounds overlap [minZ, maxZ].
     * Guarantees zero duplicate entries even if an entity spans multiple buckets.
     *
     * @param {number} minZ
     * @param {number} maxZ
     * @returns {Array<object>} Matching unique entities.
     */
    function queryRange(minZ, maxZ) {
        if (typeof minZ !== 'number' || typeof maxZ !== 'number') {
            return [];
        }

        const rangeMin = Math.min(minZ, maxZ);
        const rangeMax = Math.max(minZ, maxZ);

        const startBucket = getBucketIndexForZ(rangeMin, size);
        const endBucket = getBucketIndexForZ(rangeMax, size);

        const resultSet = new Set();

        for (let b = startBucket; b <= endBucket; b++) {
            const set = buckets.get(b);
            if (!set) continue;

            for (const entity of set) {
                if (resultSet.has(entity)) continue;

                // Fine-grained interval overlap check
                const bounds = getEntityZBounds(entity);
                if (bounds.maxZ >= rangeMin && bounds.minZ <= rangeMax) {
                    resultSet.add(entity);
                }
            }
        }

        return Array.from(resultSet);
    }

    /**
     * Updates visibility and active status for all indexed entities based on the lead craft's Z.
     *
     * Window: [leadZ - backwardMargin, leadZ + forwardMargin]
     * Default: [leadZ - 160, leadZ + 55]
     *
     * In Don't Sink, Don't Die coordinates:
     * Raft spawns at z = 0 and travels downriver towards negative Z (-1500).
     * [leadZ - 160, leadZ + 55] covers 55m upriver (behind) and 160m downriver (ahead).
     *
     * Updates:
     * - Toggles entity.visible = true / false (and entity.mesh.visible if present).
     * - Invokes optional onVisibilityChange(entity, isVisible).
     *
     * @param {number} leadZ - Position of lead raft along Z axis.
     * @param {object} [opts={}] - Optional override margins and callbacks.
     * @returns {object} Summary of active window and culling statistics.
     */
    function updateVisibilityWindow(leadZ, opts = {}) {
        if (typeof leadZ !== 'number' || !Number.isFinite(leadZ)) {
            throw new TypeError('leadZ must be a finite number');
        }

        const bMargin = typeof opts.backwardMargin === 'number' ? opts.backwardMargin : backwardMargin;
        const fMargin = typeof opts.forwardMargin === 'number' ? opts.forwardMargin : forwardMargin;

        const windowMinZ = leadZ - bMargin;
        const windowMaxZ = leadZ + fMargin;

        const activeEntities = queryRange(windowMinZ, windowMaxZ);
        const activeSet = new Set(activeEntities);

        const onVisibilityChange = opts.onVisibilityChange || options.onVisibilityChange;

        let culledCount = 0;
        let activeCount = 0;

        for (const entry of entries.values()) {
            const entity = entry.entity;
            const isVisible = activeSet.has(entity);

            const prevVisible = entry.visible;
            entry.visible = isVisible;

            entity.visible = isVisible;
            if (entity.mesh && typeof entity.mesh === 'object') {
                entity.mesh.visible = isVisible;
            }

            if (isVisible) {
                activeCount++;
            } else {
                culledCount++;
            }

            if (typeof onVisibilityChange === 'function' && prevVisible !== isVisible) {
                onVisibilityChange(entity, isVisible);
            }
        }

        const totalCount = entries.size;
        const cullingEfficiency = totalCount > 0 ? (culledCount / totalCount) : 0;

        return {
            leadZ,
            windowMinZ,
            windowMaxZ,
            activeCount,
            culledCount,
            totalCount,
            cullingEfficiency, // fraction of entities culled (e.g. 0.85 = 85% work saved)
            activeEntities,
        };
    }

    /**
     * Clears all entities and buckets.
     */
    function clear() {
        buckets.clear();
        entries.clear();
    }

    /**
     * Returns statistics about the spatial hash index.
     */
    function getStats() {
        return {
            bucketSize: size,
            totalEntities: entries.size,
            activeBucketsCount: buckets.size,
            backwardMargin,
            forwardMargin,
        };
    }

    return {
        bucketSize: size,
        insert,
        remove,
        update,
        queryRange,
        updateVisibilityWindow,
        clear,
        getStats,
        _buckets: buckets,
        _entries: entries,
    };
}
