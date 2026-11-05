/**
 * Don't Sink, Don't Die — Fixed-Timestep Accumulator & Spiral-of-Death Guard
 * (`shared/physics-substepper.js`)
 *
 * Helmet 02 (The RTS Flight Engineer) & Helmet 03 (QA Breaker):
 * - Hardens the 60Hz fixed physics loop against browser tab switches, GC pauses,
 *   and high-refresh displays (144Hz, 240Hz, 360Hz monitors).
 * - Implements a strict Spiral-of-Death Guard:
 *     * Clamps maximum incoming raw frame delta to 100ms (0.1s).
 *     * Enforces a hard upper bound of at most 4 substeps per frame.
 *     * Discards / clamps excess time past the maximum allowable substeps to prevent
 *       infinite catch-up loops (where simulating frames takes longer than frame budget).
 * - Computes exact alpha interpolation weights (0.0 to 1.0) for buttery visual rendering:
 *     * `alpha = accumulator / fixedDt`
 *     * Provides deterministic interpolation helpers for scalar, vector3, and angular yaw values.
 * - Pure and deterministic ES module with zero external dependencies.
 * - Safe for headless Node.js unit tests, server simulations, and browser client rendering.
 */

export const SUBSTEPPER_DEFAULTS = Object.freeze({
    FIXED_HZ: 60,
    FIXED_DT: 1.0 / 60.0, // ~0.016666666666666666s
    MAX_FRAME_DELTA: 0.1,  // 100ms clamp for tab switch / sleep / GC pauses
    MAX_SUBSTEPS: 4,       // Run at most 4 substeps per frame
    MIN_FRAME_DELTA: 0.0,  // Discard negative or zero delta time
});

/**
 * Sanitizes and clamps raw delta time.
 * - Replaces non-finite numbers (NaN, Infinity, -Infinity) or negative values with 0.
 * - Clamps upper bound to `maxFrameDelta` (default 0.1s / 100ms).
 *
 * @param {number} rawDelta - Incoming delta time in seconds
 * @param {number} [maxFrameDelta=0.1] - Upper clamp threshold in seconds
 * @returns {number} Sanitized and clamped delta time in seconds
 */
export function sanitizeFrameDelta(rawDelta, maxFrameDelta = SUBSTEPPER_DEFAULTS.MAX_FRAME_DELTA) {
    if (typeof rawDelta !== 'number' || !Number.isFinite(rawDelta) || rawDelta <= 0) {
        return 0;
    }
    const maxClamp = (typeof maxFrameDelta === 'number' && Number.isFinite(maxFrameDelta) && maxFrameDelta > 0)
        ? maxFrameDelta
        : SUBSTEPPER_DEFAULTS.MAX_FRAME_DELTA;
    return Math.min(rawDelta, maxClamp);
}

/**
 * Linearly interpolates between two scalar values.
 *
 * @param {number} prev - State value at previous physics tick
 * @param {number} curr - State value at current physics tick
 * @param {number} alpha - Blend factor in [0.0, 1.0]
 * @returns {number} Interpolated value
 */
export function lerpScalar(prev, curr, alpha) {
    const a = Math.max(0.0, Math.min(1.0, Number.isFinite(alpha) ? alpha : 0.0));
    const p = Number.isFinite(prev) ? prev : 0.0;
    const c = Number.isFinite(curr) ? curr : 0.0;
    return p + (c - p) * a;
}

/**
 * Linearly interpolates between two 3D vectors { x, y, z }.
 *
 * @param {{x: number, y: number, z: number}} prevVec
 * @param {{x: number, y: number, z: number}} currVec
 * @param {number} alpha - Blend factor in [0.0, 1.0]
 * @param {{x: number, y: number, z: number}} [target] - Optional target object to mutate
 * @returns {{x: number, y: number, z: number}} Interpolated 3D vector
 */
export function lerpVector3(prevVec, currVec, alpha, target = null) {
    const out = target || { x: 0, y: 0, z: 0 };
    const a = Math.max(0.0, Math.min(1.0, Number.isFinite(alpha) ? alpha : 0.0));

    const px = prevVec && Number.isFinite(prevVec.x) ? prevVec.x : 0;
    const py = prevVec && Number.isFinite(prevVec.y) ? prevVec.y : 0;
    const pz = prevVec && Number.isFinite(prevVec.z) ? prevVec.z : 0;

    const cx = currVec && Number.isFinite(currVec.x) ? currVec.x : 0;
    const cy = currVec && Number.isFinite(currVec.y) ? currVec.y : 0;
    const cz = currVec && Number.isFinite(currVec.z) ? currVec.z : 0;

    out.x = px + (cx - px) * a;
    out.y = py + (cy - py) * a;
    out.z = pz + (cz - pz) * a;
    return out;
}

/**
 * Shortest-arc angular interpolation for yaw / rotation angles (in radians).
 * Handles -PI to +PI wrapping seamlessly.
 *
 * @param {number} prevAngle - Previous angle in radians
 * @param {number} currAngle - Current angle in radians
 * @param {number} alpha - Blend factor in [0.0, 1.0]
 * @returns {number} Interpolated angle in radians
 */
export function lerpAngle(prevAngle, currAngle, alpha) {
    const a = Math.max(0.0, Math.min(1.0, Number.isFinite(alpha) ? alpha : 0.0));
    const p = Number.isFinite(prevAngle) ? prevAngle : 0.0;
    const c = Number.isFinite(currAngle) ? currAngle : 0.0;

    let diff = (c - p) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    return p + diff * a;
}

/**
 * Interpolates full kinematic state (position {x,y,z}, velocity {x,y,z}, yaw).
 *
 * @param {object} prevState
 * @param {object} currState
 * @param {number} alpha
 * @param {object} [target]
 * @returns {object}
 */
export function interpolateKinematicState(prevState, currState, alpha, target = null) {
    const out = target || {
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
    };

    if (!out.position) out.position = { x: 0, y: 0, z: 0 };
    if (!out.velocity) out.velocity = { x: 0, y: 0, z: 0 };

    lerpVector3(prevState?.position, currState?.position, alpha, out.position);
    lerpVector3(prevState?.velocity, currState?.velocity, alpha, out.velocity);
    out.yaw = lerpAngle(prevState?.yaw ?? 0, currState?.yaw ?? 0, alpha);

    return out;
}

/**
 * Fixed-Timestep Physics Substepper and Spiral-of-Death Guard.
 *
 * Tracks accumulated variable time across rendering animation frames,
 * clamps huge spikes caused by background tabs or GC stalls,
 * dispatches fixed simulation ticks, and exposes precise interpolation alpha.
 */
export class PhysicsSubstepper {
    /**
     * @param {object} [options]
     * @param {number} [options.fixedDt=1/60] - Physics timestep duration in seconds
     * @param {number} [options.maxFrameDelta=0.1] - Max delta time allowed per frame (100ms)
     * @param {number} [options.maxSubsteps=4] - Max substeps executed in a single frame
     * @param {boolean} [options.drainExcess=true] - Whether to drop excess time over maxSubsteps
     */
    constructor(options = {}) {
        this.fixedDt = (typeof options.fixedDt === 'number' && Number.isFinite(options.fixedDt) && options.fixedDt > 0)
            ? options.fixedDt
            : SUBSTEPPER_DEFAULTS.FIXED_DT;

        this.maxFrameDelta = (typeof options.maxFrameDelta === 'number' && Number.isFinite(options.maxFrameDelta) && options.maxFrameDelta > 0)
            ? options.maxFrameDelta
            : SUBSTEPPER_DEFAULTS.MAX_FRAME_DELTA;

        this.maxSubsteps = (typeof options.maxSubsteps === 'number' && Number.isFinite(options.maxSubsteps) && options.maxSubsteps >= 1)
            ? Math.floor(options.maxSubsteps)
            : SUBSTEPPER_DEFAULTS.MAX_SUBSTEPS;

        this.drainExcess = options.drainExcess !== false;

        // Internal State
        this.accumulator = 0.0;
        this.simulatedTime = 0.0;
        this.totalStepsExecuted = 0;
        this.totalFramesProcessed = 0;

        // Spiral of Death Metrics
        this.spiralGuardTrips = 0;
        this.discardedTime = 0.0;
        this.clampedDeltaCount = 0;

        // Latest frame report
        this.lastStepCount = 0;
        this.lastAlpha = 0.0;
        this.lastClampedDelta = 0.0;
    }

    /**
     * Resets accumulator and timing counters to initial pristine state.
     */
    reset() {
        this.accumulator = 0.0;
        this.simulatedTime = 0.0;
        this.totalStepsExecuted = 0;
        this.totalFramesProcessed = 0;
        this.spiralGuardTrips = 0;
        this.discardedTime = 0.0;
        this.clampedDeltaCount = 0;
        this.lastStepCount = 0;
        this.lastAlpha = 0.0;
        this.lastClampedDelta = 0.0;
    }

    /**
     * Drains the accumulator completely.
     * Useful when pausing the simulation, resetting the world, or switching scenes.
     */
    drain() {
        const drained = this.accumulator;
        this.accumulator = 0.0;
        this.lastAlpha = 0.0;
        return drained;
    }

    /**
     * Gets current interpolation alpha (0.0 to 1.0).
     * Represents the fractional progress between the previous physics state and the next physics state.
     * @returns {number}
     */
    getAlpha() {
        if (this.fixedDt <= 0) return 0.0;
        const rawAlpha = this.accumulator / this.fixedDt;
        return Math.max(0.0, Math.min(1.0, rawAlpha));
    }

    /**
     * Steps the accumulator with a variable frame delta time.
     * Invokes `onStep(fixedDt, currentSubstep, totalSubstepsThisFrame)` for each substep.
     *
     * @param {number} rawDelta - Elapsed frame time in seconds
     * @param {function(number, number, number): void} [onStep] - Callback executed for each fixed substep
     * @returns {{
     *   substeps: number,
     *   alpha: number,
     *   rawDelta: number,
     *   clampedDelta: number,
     *   accumulator: number,
     *   spiralGuardTripped: boolean,
     *   discardedTime: number
     * }} Detailed frame telemetry report
     */
    step(rawDelta, onStep = null) {
        this.totalFramesProcessed++;

        // 1. Sanitize & clamp raw delta time (guards against tab switches, sleep, GC freezes > 100ms)
        const isSpike = typeof rawDelta === 'number' && Number.isFinite(rawDelta) && rawDelta > this.maxFrameDelta;
        if (isSpike) {
            this.clampedDeltaCount++;
        }
        const delta = sanitizeFrameDelta(rawDelta, this.maxFrameDelta);
        this.lastClampedDelta = delta;

        // 2. Add clamped delta to accumulator
        this.accumulator += delta;

        // 3. Spiral-of-Death Guard: Check max allowed substeps
        // Max capacity accumulator is allowed to hold is maxSubsteps * fixedDt
        const maxAllowedTime = this.maxSubsteps * this.fixedDt;
        let spiralGuardTripped = false;
        let frameDiscardedTime = 0.0;

        if (this.accumulator > maxAllowedTime) {
            if (this.drainExcess) {
                frameDiscardedTime = this.accumulator - maxAllowedTime;
                this.accumulator = maxAllowedTime;
                this.discardedTime += frameDiscardedTime;
                this.spiralGuardTrips++;
                spiralGuardTripped = true;
            }
        }

        // 4. Calculate how many substeps to execute this frame
        let substepsThisFrame = 0;

        // Run fixed ticks while accumulator >= fixedDt (with small epsilon for floating-point inaccuracies, bounded strictly by maxSubsteps)
        const stepThreshold = this.fixedDt - 1e-9;
        while (this.accumulator >= stepThreshold && substepsThisFrame < this.maxSubsteps) {
            if (typeof onStep === 'function') {
                onStep(this.fixedDt, substepsThisFrame + 1, this.maxSubsteps);
            }
            this.accumulator = Math.max(0.0, this.accumulator - this.fixedDt);
            this.simulatedTime += this.fixedDt;
            this.totalStepsExecuted++;
            substepsThisFrame++;
        }

        // Defensive safety: If floating-point epsilon left accumulator slightly negligible, clamp to 0
        if (this.accumulator < 1e-9) {
            this.accumulator = 0.0;
        }

        // 5. Compute exact alpha interpolation factor [0.0, 1.0]
        const alpha = this.getAlpha();

        this.lastStepCount = substepsThisFrame;
        this.lastAlpha = alpha;

        return {
            substeps: substepsThisFrame,
            alpha,
            rawDelta: Number.isFinite(rawDelta) ? rawDelta : 0,
            clampedDelta: delta,
            accumulator: this.accumulator,
            spiralGuardTripped,
            discardedTime: frameDiscardedTime,
        };
    }

    /**
     * Returns a snapshot of substepper diagnostics and telemetry.
     */
    getDiagnostics() {
        return {
            fixedDt: this.fixedDt,
            maxFrameDelta: this.maxFrameDelta,
            maxSubsteps: this.maxSubsteps,
            accumulator: this.accumulator,
            simulatedTime: this.simulatedTime,
            totalStepsExecuted: this.totalStepsExecuted,
            totalFramesProcessed: this.totalFramesProcessed,
            clampedDeltaCount: this.clampedDeltaCount,
            spiralGuardTrips: this.spiralGuardTrips,
            totalDiscardedTime: this.discardedTime,
            lastStepCount: this.lastStepCount,
            lastAlpha: this.lastAlpha,
            lastClampedDelta: this.lastClampedDelta,
        };
    }
}

/**
 * Functional factory helper for creating a substepper instance.
 *
 * @param {object} [options]
 * @returns {PhysicsSubstepper}
 */
export function createPhysicsSubstepper(options = {}) {
    return new PhysicsSubstepper(options);
}
