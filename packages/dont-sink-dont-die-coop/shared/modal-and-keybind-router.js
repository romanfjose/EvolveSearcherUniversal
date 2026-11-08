/**
 * Helmet 01 + Sovereign Core: Single-Dispatch Keybind & Modal State Router
 * (`shared/modal-and-keybind-router.js`)
 *
 * Requirements fulfilled:
 * 1. Cleanly solves the double-listener Photo Mode (`[P]`) bug and `[Esc]` priority hierarchy:
 *    - Priority 1: If `isArmoryOpen`, returns `{ action: 'close_armory' }`.
 *    - Priority 2: If `isPhotoModeActive`, returns `{ action: 'exit_photo_mode' }`.
 *    - Priority 3: If `isSettingsOpen`, returns `{ action: 'close_settings' }`.
 *    - Priority 4: Otherwise returns `{ action: 'open_settings' }`.
 * 2. `createSingleDispatchKeyGuard(debounceMs = 80)`:
 *    - Returns `{ shouldProcess(key, nowMs) }` that prevents duplicate `window.addEventListener('keydown')`
 *      handlers from toggling the same modal ON and immediately OFF in the same frame (e.g., `[P]` Photo Mode or `[B]` Armory).
 *
 * Pure, deterministic ES module — zero external dependencies.
 */

/**
 * Standard Escape Key Action identifiers.
 */
export const ESCAPE_ACTIONS = {
    CLOSE_ARMORY: 'close_armory',
    EXIT_PHOTO_MODE: 'exit_photo_mode',
    CLOSE_SETTINGS: 'close_settings',
    OPEN_SETTINGS: 'open_settings',
};

/**
 * Resolves the deterministic single action to execute when [Escape] is pressed,
 * enforcing the 4-tier cockpit modal hierarchy.
 *
 * @param {object} [modalStates={}]
 * @param {boolean} [modalStates.isArmoryOpen=false]
 * @param {boolean} [modalStates.isPhotoModeActive=false]
 * @param {boolean} [modalStates.isTitleVisible=false]
 * @param {boolean} [modalStates.isSettingsOpen=false]
 * @returns {{ action: string }}
 */
export function resolveEscapeKeyAction({
    isArmoryOpen = false,
    isPhotoModeActive = false,
    isTitleVisible = false,
    isSettingsOpen = false,
} = {}) {
    // Priority 1: Armory / Shop Modal
    if (Boolean(isArmoryOpen)) {
        return { action: ESCAPE_ACTIONS.CLOSE_ARMORY };
    }

    // Priority 2: Freecam Photo Mode
    if (Boolean(isPhotoModeActive)) {
        return { action: ESCAPE_ACTIONS.EXIT_PHOTO_MODE };
    }

    // Priority 3: Settings Drawer / Modal
    if (Boolean(isSettingsOpen)) {
        return { action: ESCAPE_ACTIONS.CLOSE_SETTINGS };
    }

    // Priority 4: Default fallback
    return { action: ESCAPE_ACTIONS.OPEN_SETTINGS };
}

/**
 * Creates a single-dispatch key guard to prevent duplicate event listeners
 * (e.g. across multiple decoupled director modules) or key repeat bursts
 * from toggling modal state ON and immediately OFF in the same frame.
 *
 * @param {number} [debounceMs=80] - Minimum milliseconds required between processing the same key
 * @returns {{
 *   shouldProcess: (key: string, nowMs?: number) => boolean,
 *   resetKey: (key: string) => void,
 *   resetAll: () => void,
 *   getLastDispatched: (key: string) => number,
 *   getDebounceMs: () => number
 * }}
 */
export function createSingleDispatchKeyGuard(debounceMs = 80) {
    const validDebounceMs = Number.isFinite(debounceMs) && debounceMs >= 0 ? debounceMs : 80;
    const lastDispatched = new Map();

    function normalizeKey(key) {
        if (typeof key !== 'string') return '';
        return key.trim().toLowerCase();
    }

    function shouldProcess(key, nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
        const normKey = normalizeKey(key);
        if (!normKey) return false;

        const currentNow = Number.isFinite(nowMs)
            ? nowMs
            : (typeof performance !== 'undefined' ? performance.now() : Date.now());

        const lastTime = lastDispatched.get(normKey);

        if (lastTime !== undefined && currentNow - lastTime < validDebounceMs) {
            return false;
        }

        lastDispatched.set(normKey, currentNow);
        return true;
    }

    function resetKey(key) {
        const normKey = normalizeKey(key);
        if (normKey) {
            lastDispatched.delete(normKey);
        }
    }

    function resetAll() {
        lastDispatched.clear();
    }

    function getLastDispatched(key) {
        const normKey = normalizeKey(key);
        return lastDispatched.get(normKey) ?? -1;
    }

    function getDebounceMs() {
        return validDebounceMs;
    }

    return {
        shouldProcess,
        resetKey,
        resetAll,
        getLastDispatched,
        getDebounceMs,
    };
}
