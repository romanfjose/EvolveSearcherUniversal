/**
 * Don't Sink, Don't Die — Sovereign Telemetry & Engine Health Aggregator
 * (`shared/engine-telemetry.js`)
 *
 * Adheres to Helmet 02 (Synthetic José RTS Flight Engineer & Architecture):
 * - "Never DDOS the Pilot (Silent Stalls & Dead Loops)": Flight health status visible in 1 glance.
 * - "Attention Is the Only Non-Renewable Fuel": Macro-machine runs, routes around limits,
 *   and exposes telemetry without noise or idle allocations.
 * - Tracks real-time p50/p95/p99 frame times, physics step durations, active 3D mesh counts,
 *   subsystem breaker states, and memory watermarks.
 * - Compact Float64Array ring buffer with zero runtime heap churn.
 * - Exposes telemetry via window.__DSDD_DEBUG__.getHealthReport() in browser / test environments.
 * - Pure ES module with zero external dependencies, headless and browser safe.
 */

export const TELEMETRY_CONSTANTS = Object.freeze({
    DEFAULT_BUFFER_SIZE: 120, // 2 seconds of 60Hz samples
    TARGET_FPS: 60.0,
    TARGET_FRAME_TIME_MS: 16.67,
    TARGET_PHYSICS_STEP_MS: 16.67,
    WARNING_FRAME_TIME_MS: 22.0, // < 45 FPS
    CRITICAL_FRAME_TIME_MS: 33.33, // < 30 FPS
});

export const SUBSYSTEM_STATUS = Object.freeze({
    HEALTHY: 'HEALTHY',
    DEGRADED: 'DEGRADED',
    TRIPPED: 'TRIPPED',
    BYPASSED: 'BYPASSED',
    UNKNOWN: 'UNKNOWN',
});

export const ENGINE_HEALTH_STATUS = Object.freeze({
    OPTIMAL: 'OPTIMAL',
    NOMINAL: 'NOMINAL',
    DEGRADED: 'DEGRADED',
    CRITICAL: 'CRITICAL',
});

/**
 * Compact circular ring buffer backed by Float64Array for bounded zero-alloc sample tracking.
 */
export class CompactRingBuffer {
    /**
     * @param {number} capacity - Fixed capacity of the ring buffer
     */
    constructor(capacity = TELEMETRY_CONSTANTS.DEFAULT_BUFFER_SIZE) {
        this.capacity = Math.max(1, Math.floor(capacity));
        this.buffer = new Float64Array(this.capacity);
        this.head = 0;
        this.size = 0;
        this.totalSampled = 0;
    }

    /**
     * Pushes a sample into the circular buffer.
     * @param {number} value
     */
    push(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return;

        this.buffer[this.head] = num;
        this.head = (this.head + 1) % this.capacity;
        if (this.size < this.capacity) {
            this.size++;
        }
        this.totalSampled++;
    }

    /**
     * Returns all valid recorded samples as a standard array in chronological order.
     * @returns {number[]}
     */
    toArray() {
        const res = new Array(this.size);
        if (this.size === 0) return res;

        let start = (this.head - this.size + this.capacity) % this.capacity;
        for (let i = 0; i < this.size; i++) {
            res[i] = this.buffer[(start + i) % this.capacity];
        }
        return res;
    }

    /**
     * Clears all samples.
     */
    clear() {
        this.head = 0;
        this.size = 0;
        this.totalSampled = 0;
    }
}

/**
 * Calculates statistical distribution from an array of numbers:
 * min, max, avg, p50, p95, p99.
 *
 * @param {number[]} values
 * @returns {{ count: number, min: number, max: number, avg: number, p50: number, p95: number, p99: number }}
 */
export function calculatePercentiles(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return {
            count: 0,
            min: 0,
            max: 0,
            avg: 0,
            p50: 0,
            p95: 0,
            p99: 0,
        };
    }

    const sorted = values
        .filter((v) => typeof v === 'number' && Number.isFinite(v))
        .sort((a, b) => a - b);

    const count = sorted.length;
    if (count === 0) {
        return {
            count: 0,
            min: 0,
            max: 0,
            avg: 0,
            p50: 0,
            p95: 0,
            p99: 0,
        };
    }

    let sum = 0;
    for (let i = 0; i < count; i++) {
        sum += sorted[i];
    }
    const avg = sum / count;

    function getPercentile(p) {
        if (count === 1) return sorted[0];
        const rank = (p / 100) * (count - 1);
        const lower = Math.floor(rank);
        const upper = Math.ceil(rank);
        const weight = rank - lower;
        if (upper >= count) return sorted[count - 1];
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }

    return {
        count,
        min: Number(sorted[0].toFixed(2)),
        max: Number(sorted[count - 1].toFixed(2)),
        avg: Number(avg.toFixed(2)),
        p50: Number(getPercentile(50).toFixed(2)),
        p95: Number(getPercentile(95).toFixed(2)),
        p99: Number(getPercentile(99).toFixed(2)),
    };
}

/**
 * Sovereign Telemetry & Engine Health Aggregator.
 */
export class EngineTelemetry {
    constructor(options = {}) {
        this.capacity = options.capacity || TELEMETRY_CONSTANTS.DEFAULT_BUFFER_SIZE;
        this.frameTimeBuffer = new CompactRingBuffer(this.capacity);
        this.physicsStepBuffer = new CompactRingBuffer(this.capacity);
        this.meshCountBuffer = new CompactRingBuffer(this.capacity);

        // Subsystem breakers registry: name -> { status, tripsCount, lastTripReason, lastTripTimestamp }
        this.subsystems = new Map();

        // Memory watermarks in bytes
        this.memoryWatermarks = {
            baselineBytes: 0,
            peakBytes: 0,
            currentBytes: 0,
            lowBytes: Infinity,
            lastCheckedAt: 0,
        };

        this.customCounters = new Map();
        this.customFlags = new Map();
        this.createdAt = Date.now();
    }

    /**
     * Record a rendered frame duration in milliseconds (dt).
     * @param {number} frameTimeMs
     */
    recordFrameTime(frameTimeMs) {
        this.frameTimeBuffer.push(frameTimeMs);
    }

    /**
     * Record a physics fixed/variable step duration in milliseconds.
     * @param {number} physicsDurationMs
     */
    recordPhysicsStep(physicsDurationMs) {
        this.physicsStepBuffer.push(physicsDurationMs);
    }

    /**
     * Record active 3D meshes / visible nodes currently evaluated or rendered.
     * @param {number} count
     */
    recordMeshCount(count) {
        this.meshCountBuffer.push(count);
    }

    /**
     * Updates or registers the status of an engine subsystem circuit breaker.
     * @param {string} subsystemName
     * @param {object} breakerState - { status, tripped, tripCount, lastError, reason }
     */
    recordSubsystemState(subsystemName, breakerState = {}) {
        if (!subsystemName) return;

        let existing = this.subsystems.get(subsystemName);
        if (!existing) {
            existing = {
                name: subsystemName,
                status: SUBSYSTEM_STATUS.HEALTHY,
                tripsCount: 0,
                lastTripReason: null,
                lastTripTimestamp: null,
                updatedAt: Date.now(),
            };
            this.subsystems.set(subsystemName, existing);
        }

        existing.updatedAt = Date.now();

        if (breakerState.tripped === true || breakerState.status === SUBSYSTEM_STATUS.TRIPPED) {
            existing.status = SUBSYSTEM_STATUS.TRIPPED;
            existing.tripsCount = (breakerState.tripCount ?? existing.tripsCount + 1);
            existing.lastTripReason = breakerState.reason || breakerState.lastError || 'Fault threshold exceeded';
            existing.lastTripTimestamp = Date.now();
        } else if (breakerState.status) {
            existing.status = breakerState.status;
            if (breakerState.tripCount !== undefined) {
                existing.tripsCount = breakerState.tripCount;
            }
            if (breakerState.reason) {
                existing.lastTripReason = breakerState.reason;
            }
        } else if (breakerState.tripped === false) {
            existing.status = SUBSYSTEM_STATUS.HEALTHY;
        }
    }

    /**
     * Ingest or sample memory watermark (heap or process memory).
     * Supports manual injection or reading performance.memory / process.memoryUsage().
     *
     * @param {number} [bytes] - Optional explicit memory footprint in bytes
     * @returns {object} Updated watermarks
     */
    recordMemoryWatermark(bytes = null) {
        let memBytes = bytes;

        if (memBytes === null || memBytes === undefined) {
            if (typeof performance !== 'undefined' && performance.memory && typeof performance.memory.usedJSHeapSize === 'number') {
                memBytes = performance.memory.usedJSHeapSize;
            } else if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
                const usage = process.memoryUsage();
                memBytes = usage.heapUsed;
            }
        }

        if (typeof memBytes === 'number' && Number.isFinite(memBytes) && memBytes >= 0) {
            this.memoryWatermarks.currentBytes = memBytes;
            this.memoryWatermarks.lastCheckedAt = Date.now();

            if (this.memoryWatermarks.baselineBytes === 0) {
                this.memoryWatermarks.baselineBytes = memBytes;
            }
            if (memBytes > this.memoryWatermarks.peakBytes) {
                this.memoryWatermarks.peakBytes = memBytes;
            }
            if (memBytes < this.memoryWatermarks.lowBytes) {
                this.memoryWatermarks.lowBytes = memBytes;
            }
        }

        return { ...this.memoryWatermarks };
    }

    /**
     * Increments or sets custom debug counter (e.g., audioVoices, droppedPackets).
     */
    setCounter(name, value) {
        this.customCounters.set(name, Number(value) || 0);
    }

    incrementCounter(name, delta = 1) {
        const curr = this.customCounters.get(name) || 0;
        this.customCounters.set(name, curr + delta);
    }

    /**
     * Sets custom debug flag.
     */
    setFlag(name, val) {
        this.customFlags.set(name, Boolean(val));
    }

    /**
     * Evaluates global engine health status based on frametime percentiles and breaker trips.
     * @returns {string} One of ENGINE_HEALTH_STATUS (OPTIMAL, NOMINAL, DEGRADED, CRITICAL)
     */
    evaluateOverallHealth() {
        const frameStats = calculatePercentiles(this.frameTimeBuffer.toArray());
        let trippedCount = 0;
        for (const sub of this.subsystems.values()) {
            if (sub.status === SUBSYSTEM_STATUS.TRIPPED) {
                trippedCount++;
            }
        }

        if (frameStats.p95 >= TELEMETRY_CONSTANTS.CRITICAL_FRAME_TIME_MS || trippedCount >= 2) {
            return ENGINE_HEALTH_STATUS.CRITICAL;
        }
        if (frameStats.p95 >= TELEMETRY_CONSTANTS.WARNING_FRAME_TIME_MS || trippedCount >= 1) {
            return ENGINE_HEALTH_STATUS.DEGRADED;
        }
        if (frameStats.avg > 0 && frameStats.p95 <= TELEMETRY_CONSTANTS.TARGET_FRAME_TIME_MS + 2.0) {
            return ENGINE_HEALTH_STATUS.OPTIMAL;
        }
        return ENGINE_HEALTH_STATUS.NOMINAL;
    }

    /**
     * Generates a comprehensive, human- and machine-readable health report.
     * Suitable for export via window.__DSDD_DEBUG__.getHealthReport().
     *
     * @returns {object} Health report object
     */
    getHealthReport() {
        const frameTimes = this.frameTimeBuffer.toArray();
        const physicsTimes = this.physicsStepBuffer.toArray();
        const meshCounts = this.meshCountBuffer.toArray();

        const frameStats = calculatePercentiles(frameTimes);
        const physicsStats = calculatePercentiles(physicsTimes);
        const meshStats = calculatePercentiles(meshCounts);

        // Convert frame time stats to estimated instantaneous FPS
        const fps = {
            avg: frameStats.avg > 0 ? Number((1000 / frameStats.avg).toFixed(1)) : 60.0,
            p50: frameStats.p50 > 0 ? Number((1000 / frameStats.p50).toFixed(1)) : 60.0,
            p95: frameStats.p95 > 0 ? Number((1000 / frameStats.p95).toFixed(1)) : 60.0,
            p99: frameStats.p99 > 0 ? Number((1000 / frameStats.p99).toFixed(1)) : 60.0,
            min: frameStats.max > 0 ? Number((1000 / frameStats.max).toFixed(1)) : 60.0,
            max: frameStats.min > 0 ? Number((1000 / frameStats.min).toFixed(1)) : 60.0,
        };

        const subsystemsArray = Array.from(this.subsystems.values());
        const overallStatus = this.evaluateOverallHealth();

        const formatBytes = (b) => {
            if (!Number.isFinite(b) || b <= 0) return '0 MB';
            return `${(b / (1024 * 1024)).toFixed(1)} MB`;
        };

        const memoryReport = {
            currentBytes: this.memoryWatermarks.currentBytes,
            currentFormatted: formatBytes(this.memoryWatermarks.currentBytes),
            peakBytes: this.memoryWatermarks.peakBytes,
            peakFormatted: formatBytes(this.memoryWatermarks.peakBytes),
            baselineBytes: this.memoryWatermarks.baselineBytes,
            baselineFormatted: formatBytes(this.memoryWatermarks.baselineBytes),
            growthBytes: Math.max(0, this.memoryWatermarks.currentBytes - this.memoryWatermarks.baselineBytes),
            growthFormatted: formatBytes(Math.max(0, this.memoryWatermarks.currentBytes - this.memoryWatermarks.baselineBytes)),
        };

        const customCountersObj = Object.fromEntries(this.customCounters.entries());
        const customFlagsObj = Object.fromEntries(this.customFlags.entries());

        const summaryLine = `[HEALTH: ${overallStatus}] FPS: ${fps.avg} (p50: ${fps.p50}, p95: ${fps.p95}) | Physics: ${physicsStats.avg}ms | Meshes: ${meshStats.p50} | Breakers Tripped: ${subsystemsArray.filter((s) => s.status === SUBSYSTEM_STATUS.TRIPPED).length} | Heap: ${memoryReport.currentFormatted}`;

        return {
            timestamp: new Date().toISOString(),
            uptimeSeconds: Number(((Date.now() - this.createdAt) / 1000).toFixed(1)),
            overallStatus,
            summary: summaryLine,
            framerate: {
                fps,
                frameTimesMs: frameStats,
                samplesCount: frameStats.count,
                budgetOk: frameStats.p95 <= TELEMETRY_CONSTANTS.WARNING_FRAME_TIME_MS,
            },
            physics: {
                stepDurationsMs: physicsStats,
                samplesCount: physicsStats.count,
                budgetOk: physicsStats.p95 <= TELEMETRY_CONSTANTS.TARGET_PHYSICS_STEP_MS,
            },
            meshes: {
                activeCounts: meshStats,
                samplesCount: meshStats.count,
            },
            subsystems: subsystemsArray,
            memory: memoryReport,
            customCounters: customCountersObj,
            customFlags: customFlagsObj,
        };
    }

    /**
     * Resets all internal buffers and counters.
     */
    reset() {
        this.frameTimeBuffer.clear();
        this.physicsStepBuffer.clear();
        this.meshCountBuffer.clear();
        this.subsystems.clear();
        this.customCounters.clear();
        this.customFlags.clear();
        this.memoryWatermarks = {
            baselineBytes: 0,
            peakBytes: 0,
            currentBytes: 0,
            lowBytes: Infinity,
            lastCheckedAt: 0,
        };
        this.createdAt = Date.now();
    }
}

// Global singleton instance
export const engineTelemetry = new EngineTelemetry();

/**
 * Installs the window.__DSDD_DEBUG__.getHealthReport() hook in browser or mock environments.
 * @param {object} [targetWindow] - Target global/window object (defaults to globalThis or window)
 * @param {EngineTelemetry} [telemetryInstance] - Telemetry instance to hook (defaults to singleton)
 * @returns {object} The installed __DSDD_DEBUG__ object
 */
export function installGlobalDebugBridge(targetWindow = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null)), telemetryInstance = engineTelemetry) {
    if (!targetWindow) return null;

    if (!targetWindow.__DSDD_DEBUG__) {
        targetWindow.__DSDD_DEBUG__ = {};
    }

    targetWindow.__DSDD_DEBUG__.telemetry = telemetryInstance;
    targetWindow.__DSDD_DEBUG__.getHealthReport = () => telemetryInstance.getHealthReport();
    targetWindow.__DSDD_DEBUG__.recordFrameTime = (ms) => telemetryInstance.recordFrameTime(ms);
    targetWindow.__DSDD_DEBUG__.recordPhysicsStep = (ms) => telemetryInstance.recordPhysicsStep(ms);
    targetWindow.__DSDD_DEBUG__.recordMeshCount = (cnt) => telemetryInstance.recordMeshCount(cnt);
    targetWindow.__DSDD_DEBUG__.recordSubsystemState = (name, state) => telemetryInstance.recordSubsystemState(name, state);
    targetWindow.__DSDD_DEBUG__.recordMemoryWatermark = (bytes) => telemetryInstance.recordMemoryWatermark(bytes);

    return targetWindow.__DSDD_DEBUG__;
}

// Auto-install on module import if window is defined
if (typeof window !== 'undefined') {
    installGlobalDebugBridge(window, engineTelemetry);
}
