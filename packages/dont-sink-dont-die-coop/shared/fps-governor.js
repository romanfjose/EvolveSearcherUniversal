/**
 * Sovereign Core & Helmet 02 — Self-Healing Frame-Budget & Dynamic LOD Governor
 * (`shared/fps-governor.js`)
 *
 * Flight Engineer & Autonomous RTS Avionics for Don't Sink, Don't Die:
 * - Monitors a rolling 30-frame window of delta frame times (dt in seconds or ms).
 * - Detects frame drops: when rolling average FPS falls below 54 FPS (avg frame time > 18.52ms),
 *   automatically steps down graphic fidelity tiers (LOD).
 * - Self-heals & recovers: when consecutive frame times stay comfortably under 12ms
 *   (i.e. > 83.3 FPS headroom), smoothly steps back up without thrashing or stutter.
 * - Dynamically scales three core fidelity knobs:
 *     1. Weather particle density (multiplier / count)
 *     2. Wake ribbon segments (resolution / quads)
 *     3. Distant tree draw distance (meters)
 *
 * Pure, zero-dependency ES module. Headless-safe, deterministic, resilient to NaN/Infinity dt glitches.
 */

/**
 * Standard LOD Tiers for Don't Sink, Don't Die.
 * Tier 0: Ultra (Default / Full Fidelity)
 * Tier 1: High
 * Tier 2: Medium
 * Tier 3: Low (Maximum Survival / Battery Saver)
 */
export const LOD_TIERS = Object.freeze([
    Object.freeze({
        tier: 0,
        name: 'ultra',
        weatherParticleDensity: 1.0,   // Full particle count (e.g., 3000 in tempest)
        wakeRibbonSegments: 36,        // Canonical 36 quads per ribbon
        distantTreeDrawDistance: 320,  // Far foliage visibility (meters)
        shadowsEnabled: true,
    }),
    Object.freeze({
        tier: 1,
        name: 'high',
        weatherParticleDensity: 0.75,  // 75% particle density
        wakeRibbonSegments: 24,        // 24 quads per ribbon
        distantTreeDrawDistance: 240,  // 240m draw distance
        shadowsEnabled: true,
    }),
    Object.freeze({
        tier: 2,
        name: 'medium',
        weatherParticleDensity: 0.50,  // 50% particle density
        wakeRibbonSegments: 16,        // 16 quads per ribbon
        distantTreeDrawDistance: 160,  // 160m draw distance
        shadowsEnabled: true,
    }),
    Object.freeze({
        tier: 3,
        name: 'low',
        weatherParticleDensity: 0.25,  // 25% particle density
        wakeRibbonSegments: 10,        // 10 quads per ribbon (minimum smooth wake)
        distantTreeDrawDistance: 90,   // 90m draw distance
        shadowsEnabled: false,
    }),
]);

export const DEFAULT_GOVERNOR_CONFIG = Object.freeze({
    windowSize: 30,             // Rolling window frame count
    fpsDropThreshold: 54.0,     // Step down when rolling average FPS < 54.0 FPS
    frameTimeDropThresholdMs: 1000 / 54.0, // ~18.5185ms
    recoveryThresholdMs: 12.0,  // Step up when frame time stays under 12.0ms (~83.3 FPS)
    recoveryFrameRequirement: 30, // Number of consecutive frames under recoveryThresholdMs required to step up
    stepDownCooldownFrames: 15, // Minimum frames between successive step-downs to prevent over-correcting
    initialTier: 0,             // Start at Tier 0 (Ultra)
    minTier: 0,
    maxTier: LOD_TIERS.length - 1, // 3
    smoothingAlpha: 0.15,       // Smooth interpolation factor for continuous parameters
});

/**
 * Creates an autonomous, self-healing Frame-Budget & Dynamic LOD Governor.
 *
 * @param {Partial<typeof DEFAULT_GOVERNOR_CONFIG>} [options={}]
 * @returns {FpsGovernor}
 */
export function createFpsGovernor(options = {}) {
    const config = {
        ...DEFAULT_GOVERNOR_CONFIG,
        ...options,
    };

    const windowSize = Math.max(3, Math.floor(config.windowSize));
    const recoveryFramesTarget = Math.max(1, Math.floor(config.recoveryFrameRequirement));
    const maxTier = Math.min(LOD_TIERS.length - 1, Math.max(0, config.maxTier));
    const minTier = Math.max(0, Math.min(maxTier, config.minTier));

    // Rolling circular buffer storing frame times in milliseconds
    const samples = new Float64Array(windowSize);
    let sampleCount = 0;
    let writeIndex = 0;
    let sumMs = 0;

    let currentTier = Math.min(maxTier, Math.max(minTier, config.initialTier));
    let framesSinceStepDown = config.stepDownCooldownFrames;
    let consecutiveRecoveryFrames = 0;
    let totalFramesRecorded = 0;

    // Smoothed continuous values for stutter-free interpolation
    const initialSpec = LOD_TIERS[currentTier];
    let smoothedParticleDensity = initialSpec.weatherParticleDensity;
    let smoothedWakeSegments = initialSpec.wakeRibbonSegments;
    let smoothedTreeDrawDistance = initialSpec.distantTreeDrawDistance;

    const listeners = new Set();

    /**
     * Sanitizes dt to a safe, positive milliseconds value.
     * Supports both seconds (e.g. 0.0166) and milliseconds (e.g. 16.6).
     * @param {number} dt
     * @returns {number} frame time in ms
     */
    function normalizeDtToMs(dt) {
        if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
            return 1000 / 60; // Fallback to safe 16.666ms on NaN / negative / zero
        }
        // If dt < 1.0, assume it was provided in seconds (standard requestAnimationFrame delta)
        const ms = dt < 1.0 ? dt * 1000 : dt;
        // Clamp absurd hitches (e.g. tab paused for 10s) to 500ms to prevent infinite rolling average skew
        return Math.min(ms, 500);
    }

    /**
     * Records a new frame delta time and updates the governor state.
     *
     * @param {number} dt - Delta time in seconds (e.g. 0.0167) or milliseconds (e.g. 16.7)
     * @returns {GovernorStatus} Current frame budget telemetry and LOD settings
     */
    function recordFrame(dt) {
        const dtMs = normalizeDtToMs(dt);
        totalFramesRecorded++;
        framesSinceStepDown++;

        // Circular buffer management
        if (sampleCount < windowSize) {
            samples[writeIndex] = dtMs;
            sumMs += dtMs;
            sampleCount++;
        } else {
            sumMs -= samples[writeIndex];
            samples[writeIndex] = dtMs;
            sumMs += dtMs;
        }
        writeIndex = (writeIndex + 1) % windowSize;

        const avgDtMs = sumMs / sampleCount;
        const rollingFps = avgDtMs > 0 ? 1000 / avgDtMs : 60;

        // Recovery tracker: checks if frame time is under recovery budget
        if (dtMs <= config.recoveryThresholdMs) {
            consecutiveRecoveryFrames++;
        } else {
            consecutiveRecoveryFrames = 0;
        }

        let tierChanged = false;
        const oldTier = currentTier;

        // Step-down check: only when we have at least half a window of samples to avoid initial flicker
        if (sampleCount >= Math.min(10, windowSize)) {
            const isFpsDropping = rollingFps < config.fpsDropThreshold || avgDtMs > config.frameTimeDropThresholdMs;
            if (isFpsDropping && currentTier < maxTier && framesSinceStepDown >= config.stepDownCooldownFrames) {
                currentTier++;
                tierChanged = true;
                framesSinceStepDown = 0;
                consecutiveRecoveryFrames = 0;
            }
        }

        // Step-up recovery check: requires steady performance under 12ms and rolling FPS >= 60
        if (!tierChanged && currentTier > minTier) {
            const sustainedRecovery = consecutiveRecoveryFrames >= recoveryFramesTarget;
            const rollingIsComfortable = rollingFps >= 65.0; // Extra guard so we don't oscillate
            if (sustainedRecovery && rollingIsComfortable) {
                currentTier--;
                tierChanged = true;
                consecutiveRecoveryFrames = 0;
            }
        }

        // Smooth continuous values toward target tier settings
        const targetSpec = LOD_TIERS[currentTier];
        const alpha = Math.max(0.01, Math.min(1.0, config.smoothingAlpha));
        smoothedParticleDensity += (targetSpec.weatherParticleDensity - smoothedParticleDensity) * alpha;
        smoothedWakeSegments += (targetSpec.wakeRibbonSegments - smoothedWakeSegments) * alpha;
        smoothedTreeDrawDistance += (targetSpec.distantTreeDrawDistance - smoothedTreeDrawDistance) * alpha;

        const status = getStatus();

        if (tierChanged) {
            for (const listener of listeners) {
                try {
                    listener(status, { oldTier, newTier: currentTier, reason: currentTier > oldTier ? 'fps-drop' : 'recovery' });
                } catch (err) {
                    console.error('[fps-governor] Listener error:', err);
                }
            }
        }

        return status;
    }

    /**
     * Manually overrides or pins the current LOD tier.
     *
     * @param {number} tier
     */
    function setTier(tier) {
        const clamped = Math.min(maxTier, Math.max(minTier, Math.floor(tier)));
        if (clamped !== currentTier) {
            const oldTier = currentTier;
            currentTier = clamped;
            consecutiveRecoveryFrames = 0;
            framesSinceStepDown = config.stepDownCooldownFrames;
            const status = getStatus();
            for (const listener of listeners) {
                try {
                    listener(status, { oldTier, newTier: currentTier, reason: 'manual-override' });
                } catch {}
            }
        }
    }

    /**
     * Snaps smoothed values directly to current tier targets (disables lerping lag).
     */
    function snapToCurrentTier() {
        const spec = LOD_TIERS[currentTier];
        smoothedParticleDensity = spec.weatherParticleDensity;
        smoothedWakeSegments = spec.wakeRibbonSegments;
        smoothedTreeDrawDistance = spec.distantTreeDrawDistance;
    }

    /**
     * Returns the current comprehensive telemetry and active LOD configuration.
     *
     * @returns {GovernorStatus}
     */
    function getStatus() {
        const avgDtMs = sampleCount > 0 ? sumMs / sampleCount : 1000 / 60;
        const rollingFps = avgDtMs > 0 ? 1000 / avgDtMs : 60;
        const activeSpec = LOD_TIERS[currentTier];

        return {
            tier: currentTier,
            tierName: activeSpec.name,
            rollingFps: Number(rollingFps.toFixed(2)),
            avgFrameTimeMs: Number(avgDtMs.toFixed(3)),
            sampleCount,
            totalFramesRecorded,
            consecutiveRecoveryFrames,
            weatherParticleDensity: Number(smoothedParticleDensity.toFixed(3)),
            targetWeatherParticleDensity: activeSpec.weatherParticleDensity,
            wakeRibbonSegments: Math.round(smoothedWakeSegments),
            targetWakeRibbonSegments: activeSpec.wakeRibbonSegments,
            distantTreeDrawDistance: Number(smoothedTreeDrawDistance.toFixed(1)),
            targetDistantTreeDrawDistance: activeSpec.distantTreeDrawDistance,
            shadowsEnabled: activeSpec.shadowsEnabled,
            isUnderBudget: avgDtMs <= config.recoveryThresholdMs,
            isDropping: rollingFps < config.fpsDropThreshold,
        };
    }

    /**
     * Resets rolling buffers and restores initial tier.
     */
    function reset() {
        samples.fill(0);
        sampleCount = 0;
        writeIndex = 0;
        sumMs = 0;
        currentTier = Math.min(maxTier, Math.max(minTier, config.initialTier));
        framesSinceStepDown = config.stepDownCooldownFrames;
        consecutiveRecoveryFrames = 0;
        totalFramesRecorded = 0;
        snapToCurrentTier();
    }

    /**
     * Subscribes to tier change events.
     *
     * @param {function(GovernorStatus, { oldTier: number, newTier: number, reason: string }): void} listener
     * @returns {function(): void} Unsubscribe callback
     */
    function onTierChange(listener) {
        if (typeof listener === 'function') {
            listeners.add(listener);
        }
        return () => listeners.delete(listener);
    }

    return {
        recordFrame,
        update: recordFrame, // Alias for standard game loop tick
        getStatus,
        setTier,
        reset,
        snapToCurrentTier,
        onTierChange,
        getConfig: () => ({ ...config }),
        getTierSpec: (tier = currentTier) => LOD_TIERS[tier] || LOD_TIERS[0],
    };
}
