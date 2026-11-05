/**
 * Don't Sink, Don't Die — Instant Action Launch & Cinematic Sky-Drop Camera Intro
 * Module: public/js/vfx/camera-intro.js
 *
 * Requirements (Helmet 04: The Street-Smart Shark):
 * 1. Optimize for the first 5 seconds of human attention:
 *    - Support ?autostart=1 (or autostart query param) or pressing Space/Enter
 *      on the title screen to drop immediately into active gameplay in <0.3s.
 * 2. Compute a smooth 1.4-second cubic-bezier sky-dive camera swoop:
 *    - From high above the sunset canyon: (x = 0, y = 38, z = +28)
 *    - Right behind the Viking raft: (x = 0, y = 9.5, z = +13.5)
 *    - FOV punch from 78 deg down to 60 deg.
 *    - Look target smoothly tracks from river horizon / canyon vista down to raft center (0, 1.2, 0).
 * 3. Pure math helpers exported for deterministic testing:
 *    - cubicBezier1D(t, p1, p2, p3, p4) & solveCubicBezier(t, x1, y1, x2, y2)
 *    - computeCameraSwoop(progress, config)
 *    - calculateIntroFov(progress, startFov, endFov, easingFn)
 *    - isAutostartRequested(searchString)
 *    - isInstantActionKey(eventOrKeyCode)
 * 4. Zero runtime dependencies, safe in headless Node.js tests and browser runtime.
 */

// ── Default Intro Trajectory Configuration ──────────────────────────────────
export const CAMERA_INTRO_CONFIG = {
    DURATION_SEC: 1.4,
    INSTANT_DROP_DELAY_SEC: 0.25, // < 0.3s quick drop when autostart or skip pressed
    START_POSITION: { x: 0.0, y: 38.0, z: 28.0 },
    END_POSITION: { x: 0.0, y: 9.5, z: 13.5 },
    START_LOOK_AT: { x: 0.0, y: 4.0, z: -120.0 }, // looking forward toward sunset canyon horizon
    END_LOOK_AT: { x: 0.0, y: 1.2, z: 0.0 },      // looking directly at Viking raft deck
    START_FOV: 78.0,
    END_FOV: 60.0,
    // Cubic bezier ease-in-out / sky-dive dive curve (fast dive, punchy settle)
    BEZIER_CONTROL_POINTS: [0.25, 0.1, 0.25, 1.0], // ease-out cubic feel
};

// ── Pure Math Helpers ────────────────────────────────────────────────────────

/**
 * Clamps value x between min and max.
 */
export function clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
}

/**
 * Linear interpolation between a and b by factor t.
 */
export function lerp(a, b, t) {
    const c = clamp(t, 0, 1);
    return a + (b - a) * c;
}

/**
 * Evaluates a 1D cubic Bezier polynomial for 4 control points P0, P1, P2, P3 at parameter t in [0, 1].
 * B(t) = (1-t)^3 * P0 + 3*(1-t)^2*t * P1 + 3*(1-t)*t^2 * P2 + t^3 * P3
 */
export function cubicBezier1D(t, p0, p1, p2, p3) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    return uuu * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + ttt * p3;
}

/**
 * Solves standard CSS-style cubic-bezier(x1, y1, x2, y2) curve at time progress in [0, 1].
 * P0 = (0, 0), P1 = (x1, y1), P2 = (x2, y2), P3 = (1, 1).
 * Uses Newton-Raphson approximation for parameter t given x, then evaluates y(t).
 *
 * @param {number} x - Normalized time [0, 1]
 * @param {number} x1 - Control point 1 X
 * @param {number} y1 - Control point 1 Y
 * @param {number} x2 - Control point 2 X
 * @param {number} y2 - Control point 2 Y
 * @returns {number} Interpolated Y value in [0, 1]
 */
export function solveCubicBezier(x, x1 = 0.25, y1 = 0.1, x2 = 0.25, y2 = 1.0) {
    const clampedX = clamp(x, 0, 1);
    if (clampedX <= 0) return 0;
    if (clampedX >= 1) return 1;

    // Newton-Raphson iteration to find t such that cubicBezier1D(t, 0, x1, x2, 1) == clampedX
    let t = clampedX;
    for (let i = 0; i < 8; i++) {
        const currentX = cubicBezier1D(t, 0, x1, x2, 1);
        const dx = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
        if (Math.abs(currentX - clampedX) < 1e-5 || Math.abs(dx) < 1e-6) {
            break;
        }
        t -= (currentX - clampedX) / dx;
        t = clamp(t, 0, 1);
    }

    return cubicBezier1D(t, 0, y1, y2, 1);
}

/**
 * Computes camera 3D position, look-at target, and FOV at progress [0, 1].
 *
 * @param {number} progress - Transition progress in [0, 1]
 * @param {object} [config] - Trajectory configuration overrides
 * @returns {object} { position: {x, y, z}, lookAt: {x, y, z}, fov: number, progress: number, easeProgress: number }
 */
export function computeCameraSwoop(progress, config = {}) {
    const p = clamp(progress, 0, 1);
    const startPos = config.START_POSITION || CAMERA_INTRO_CONFIG.START_POSITION;
    const endPos = config.END_POSITION || CAMERA_INTRO_CONFIG.END_POSITION;
    const startLook = config.START_LOOK_AT || CAMERA_INTRO_CONFIG.START_LOOK_AT;
    const endLook = config.END_LOOK_AT || CAMERA_INTRO_CONFIG.END_LOOK_AT;
    const startFov = typeof config.START_FOV === 'number' ? config.START_FOV : CAMERA_INTRO_CONFIG.START_FOV;
    const endFov = typeof config.END_FOV === 'number' ? config.END_FOV : CAMERA_INTRO_CONFIG.END_FOV;
    const [x1, y1, x2, y2] = config.BEZIER_CONTROL_POINTS || CAMERA_INTRO_CONFIG.BEZIER_CONTROL_POINTS;

    // Evaluate cubic-bezier easing curve
    const ease = solveCubicBezier(p, x1, y1, x2, y2);

    // Compute interpolated camera world coordinates
    const position = {
        x: lerp(startPos.x, endPos.x, ease),
        y: lerp(startPos.y, endPos.y, ease),
        z: lerp(startPos.z, endPos.z, ease),
    };

    // Compute look-at point
    const lookAt = {
        x: lerp(startLook.x, endLook.x, ease),
        y: lerp(startLook.y, endLook.y, ease),
        z: lerp(startLook.z, endLook.z, ease),
    };

    // Compute FOV punch (78 deg -> 60 deg)
    const fov = lerp(startFov, endFov, ease);

    return {
        position,
        lookAt,
        fov,
        progress: p,
        easeProgress: ease,
    };
}

/**
 * Calculates instantaneous FOV punch.
 *
 * @param {number} progress - Progress in [0, 1]
 * @param {number} [startFov]
 * @param {number} [endFov]
 * @param {Function} [easingFn]
 * @returns {number}
 */
export function calculateIntroFov(
    progress,
    startFov = CAMERA_INTRO_CONFIG.START_FOV,
    endFov = CAMERA_INTRO_CONFIG.END_FOV,
    easingFn = (p) => solveCubicBezier(p, 0.25, 0.1, 0.25, 1.0)
) {
    const p = clamp(progress, 0, 1);
    const ease = typeof easingFn === 'function' ? easingFn(p) : p;
    return lerp(startFov, endFov, ease);
}

/**
 * Checks whether ?autostart=1, ?autostart=true, or ?autostart is present in query string.
 *
 * @param {string} [searchString] - Defaults to window.location.search if in browser
 * @returns {boolean}
 */
export function isAutostartRequested(searchString = null) {
    let query = searchString;
    if (query === null && typeof window !== 'undefined' && window.location?.search) {
        query = window.location.search;
    }
    if (!query) return false;

    try {
        const clean = query.startsWith('?') ? query.slice(1) : query;
        const params = new URLSearchParams(clean);
        if (params.has('autostart')) {
            const val = params.get('autostart');
            return val === '1' || val === 'true' || val === '' || val === null;
        }
    } catch (_e) {
        // Fallback simple regex parsing
        const match = query.match(/(?:[?&])autostart(?:=([^&#]*))?/i);
        if (match) {
            const val = match[1];
            return val === undefined || val === '1' || val.toLowerCase() === 'true' || val === '';
        }
    }
    return false;
}

/**
 * Checks if a keyboard event is an instant action trigger (Space or Enter).
 *
 * @param {KeyboardEvent|object|string} eventOrKey
 * @returns {boolean}
 */
export function isInstantActionKey(eventOrKey) {
    if (!eventOrKey) return false;
    if (typeof eventOrKey === 'string') {
        const k = eventOrKey.toLowerCase();
        return k === ' ' || k === 'space' || k === 'spacebar' || k === 'enter';
    }
    const key = eventOrKey.key || eventOrKey.code;
    if (key) {
        const k = String(key).toLowerCase();
        if (k === ' ' || k === 'space' || k === 'enter' || k === 'spacebar') {
            return true;
        }
    }
    const keyCode = eventOrKey.keyCode || eventOrKey.which;
    if (keyCode === 32 || keyCode === 13) {
        return true;
    }
    return false;
}

// ── Camera Intro Director System ─────────────────────────────────────────────

/**
 * Creates and orchestrates the Sky-Drop Camera Intro & Instant Action Launch Director.
 *
 * @param {object} params
 * @param {object} [params.camera] - Three.js PerspectiveCamera or compatible mock
 * @param {Function} [params.onComplete] - Callback () => void invoked when swooping finishes
 * @param {Function} [params.onActionLaunch] - Callback () => void invoked when player triggers instant launch
 * @param {object} [params.config] - Override settings
 * @param {boolean} [params.autoBindKeys] - Whether to automatically listen for Space/Enter keydown
 * @param {string} [params.searchString] - URL query string for unit tests / autostart check
 * @returns {object} Controller instance
 */
export function createCameraIntroDirector({
    camera = null,
    onComplete = () => {},
    onActionLaunch = () => {},
    config = {},
    autoBindKeys = true,
    searchString = null,
} = {}) {
    const mergedConfig = { ...CAMERA_INTRO_CONFIG, ...config };

    let state = 'idle'; // 'idle' | 'playing' | 'instant_launching' | 'completed'
    let elapsedTime = 0;
    let targetDuration = mergedConfig.DURATION_SEC;
    let hasTriggeredComplete = false;
    let keydownHandler = null;

    // Apply starting camera position immediately if camera is supplied
    if (camera) {
        applyCameraState(mergedConfig.START_POSITION, mergedConfig.START_LOOK_AT, mergedConfig.START_FOV);
    }

    /**
     * Applies position, lookAt, and fov to camera.
     */
    function applyCameraState(pos, look, fov) {
        if (!camera) return;

        if (camera.position && typeof camera.position.set === 'function') {
            camera.position.set(pos.x, pos.y, pos.z);
        } else if (camera.position) {
            camera.position.x = pos.x;
            camera.position.y = pos.y;
            camera.position.z = pos.z;
        }

        if (typeof camera.lookAt === 'function') {
            camera.lookAt(look.x, look.y, look.z);
        }

        if (typeof fov === 'number') {
            camera.fov = fov;
            if (typeof camera.updateProjectionMatrix === 'function') {
                camera.updateProjectionMatrix();
            }
        }
    }

    /**
     * Triggers instant launch into action:
     * Drops in < 0.3s (default 0.25s) or immediately if requested.
     *
     * @param {boolean} [immediate=false] - If true, jumps instantly (0s delay)
     */
    function triggerInstantLaunch(immediate = false) {
        if (state === 'completed') return;

        state = 'instant_launching';
        targetDuration = immediate ? 0 : Math.min(mergedConfig.INSTANT_DROP_DELAY_SEC, targetDuration);

        if (typeof onActionLaunch === 'function') {
            try {
                onActionLaunch();
            } catch (_e) { /* ignore */ }
        }

        if (targetDuration === 0) {
            finalizeCompletion();
        }
    }

    /**
     * Starts normal cinematic camera swoop.
     */
    function play() {
        if (state === 'completed') return;
        state = 'playing';
        elapsedTime = 0;
        targetDuration = mergedConfig.DURATION_SEC;
    }

    /**
     * Finalizes intro completion, sets camera to end position and calls onComplete.
     */
    function finalizeCompletion() {
        state = 'completed';
        elapsedTime = targetDuration;
        applyCameraState(mergedConfig.END_POSITION, mergedConfig.END_LOOK_AT, mergedConfig.END_FOV);

        if (!hasTriggeredComplete) {
            hasTriggeredComplete = true;
            if (typeof onComplete === 'function') {
                try {
                    onComplete();
                } catch (_e) { /* ignore */ }
            }
        }
    }

    /**
     * Updates swoop animation frame by delta time dt (in seconds).
     *
     * @param {number} dt - Frame delta time in seconds
     * @returns {object} Current swoop state snapshot
     */
    function update(dt = 0.016) {
        if (state === 'completed') {
            return computeCameraSwoop(1.0, mergedConfig);
        }

        if (state === 'idle') {
            return computeCameraSwoop(0.0, mergedConfig);
        }

        elapsedTime += Math.max(0, dt);
        const progress = targetDuration > 0 ? clamp(elapsedTime / targetDuration, 0, 1) : 1.0;

        const swoop = computeCameraSwoop(progress, mergedConfig);
        applyCameraState(swoop.position, swoop.lookAt, swoop.fov);

        if (progress >= 1.0) {
            finalizeCompletion();
        }

        return swoop;
    }

    /**
     * Skip to end immediately.
     */
    function skip() {
        triggerInstantLaunch(true);
    }

    /**
     * Reset back to initial state.
     */
    function reset() {
        state = 'idle';
        elapsedTime = 0;
        targetDuration = mergedConfig.DURATION_SEC;
        hasTriggeredComplete = false;
        applyCameraState(mergedConfig.START_POSITION, mergedConfig.START_LOOK_AT, mergedConfig.START_FOV);
    }

    // Bind key events if enabled and in browser environment
    if (autoBindKeys && typeof window !== 'undefined') {
        keydownHandler = (e) => {
            if (isInstantActionKey(e)) {
                triggerInstantLaunch(false);
            }
        };
        window.addEventListener('keydown', keydownHandler);
    }

    // Auto-detect ?autostart=1
    const autostart = isAutostartRequested(searchString);
    if (autostart) {
        triggerInstantLaunch(false);
    }

    return {
        play,
        update,
        skip,
        reset,
        triggerInstantLaunch,
        getState: () => state,
        getProgress: () => (targetDuration > 0 ? clamp(elapsedTime / targetDuration, 0, 1) : 1.0),
        isCompleted: () => state === 'completed',
        isInstantLaunching: () => state === 'instant_launching',
        isPlaying: () => state === 'playing',
        dispose: () => {
            if (keydownHandler && typeof window !== 'undefined') {
                window.removeEventListener('keydown', keydownHandler);
                keydownHandler = null;
            }
        },
    };
}
