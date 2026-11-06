/**
 * Helmet 01 Cockpit Pilot Notification Queue & Line-of-Sight Telemetry Engine
 * (`shared/hud-Notification-Queue.js`)
 *
 * Implements Sovereign Core & Helmet 01 directives:
 * 1. Zero Toast Spam & Screen Unobstruction: Filters out all-caps tutorial paragraphs,
 *    emoji bloat, and repetitive stroke/combat spam so the 3D viewport stays 100% unobstructed.
 * 2. Strict HUD Footprint Budget: Enforces < 8% total screen HUD occlusion for notifications.
 * 3. Line-of-Sight State Mutation: Compact, tabular-numeral stroke readout returning
 *    subtle in-place cockpit feedback (`mode: 'motor' | 'choked' | 'pull' | 'glide' | 'idle'`, `efficiencyPct: 0..100`).
 *
 * Zero external dependencies — pure, deterministic ES module.
 */

/**
 * Priority levels for cockpit notifications.
 * Higher number = higher priority.
 */
export const NOTIFICATION_PRIORITIES = Object.freeze({
    DEBUG: 0,
    HINT: 1,
    INFO: 2,
    GAMEPLAY: 3,
    WARNING: 4,
    CRITICAL: 5,
});

/**
 * Standard configuration for the notification queue and viewport footprint limits.
 */
export const NOTIFICATION_QUEUE_CONFIG = Object.freeze({
    MAX_ACTIVE_NOTIFICATIONS: 3,
    MAX_QUEUE_CAPACITY: 20,
    DEFAULT_DURATION_MS: 2200,
    MIN_DURATION_MS: 800,
    MAX_DURATION_MS: 5000,
    MAX_SCREEN_FOOTPRINT_RATIO: 0.08, // < 8% screen HUD footprint (Helmet 01)
    COCKPIT_NOISE_RATE_LIMIT_MS: 1500, // Cooldown between similar toasts
    MAX_TEXT_LENGTH: 70, // Ban multi-line essay banners
    MAX_EMOJI_COUNT: 1, // Max allowed emojis before considered emoji bloat
});

/**
 * Regex matching common emoji unicode ranges.
 */
const EMOJI_REGEX = /(?:\ud83c[\udf00-\udfff]|\ud83d[\ud000-\ude4f\ude80-\udeff]|\ud83e[\udd00-\udfff]|[\u2600-\u26ff]|[\u2700-\u27bf])/g;

/**
 * Pattern matching repetitive combat or stroke noise keywords.
 */
const REPETITIVE_NOISE_PATTERNS = [
    /\b(stroke|paddle|pull|row|swing|slash|hit|miss|tick)\b/i,
    /\b(press\s+\[?w\]?|press\s+\[?s\]?|tap\s+w|tap\s+s)\b/i,
    /\b(tutorial|how\s+to\s+play|remember\s+to|don'?t\s+forget)\b/i,
];

/**
 * Critical alert patterns that bypass standard noise filters (e.g. fatal boss mechanics, checkpoints).
 */
const CRITICAL_ALERT_PATTERNS = [
    /\b(kraken|boss|peril|sunk|defeated|victory|checkpoint|escape)\b/i,
];

/**
 * In-memory map of recent notification signatures and timestamps for deduplication.
 */
const recentNotificationHistory = new Map();

/**
 * Clears or resets the noise filter history (useful in test teardown or mode reset).
 */
export function resetNoiseFilterHistory() {
    recentNotificationHistory.clear();
}

/**
 * Sanitizes and strips excessive whitespace or formatting from a notification string.
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanNotificationText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Counts emojis present in a given string.
 *
 * @param {string} text
 * @returns {number}
 */
export function countEmojis(text) {
    if (typeof text !== 'string') return 0;
    const matches = text.match(EMOJI_REGEX);
    return matches ? matches.length : 0;
}

/**
 * Evaluates whether a text qualifies as an all-caps paragraph/essay.
 * Returns true if text has > 18 alphabetic characters and > 85% are uppercase,
 * or text exceeds the maximum character threshold with tutorial phrasing.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isAllCapsTutorialParagraph(text) {
    if (typeof text !== 'string') return false;
    const cleaned = cleanNotificationText(text);
    if (cleaned.length === 0) return false;

    // Reject lengthy paragraphs > 70 characters
    if (cleaned.length > NOTIFICATION_QUEUE_CONFIG.MAX_TEXT_LENGTH) {
        return true;
    }

    const letters = cleaned.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= 18) {
        const upperCount = (letters.match(/[A-Z]/g) || []).length;
        if (upperCount / letters.length >= 0.85) {
            // If it's a critical game-over or boss signal, allow it, else reject
            const isCritical = CRITICAL_ALERT_PATTERNS.some((p) => p.test(cleaned));
            if (!isCritical) return true;
        }
    }
    return false;
}

/**
 * Helmet 01 Cockpit Pilot Noise Filter.
 *
 * Filters out all-caps tutorial paragraphs, emoji bloat, and repetitive stroke/combat toasts
 * so the 3D viewport stays 100% unobstructed.
 *
 * @param {Object|string} notification - Notification object or text string
 * @param {number} [nowMs=Date.now()] - Timestamp for rate-limiting
 * @returns {{ allowed: boolean, reason?: string, sanitized?: Object }}
 */
export function filterCockpitNoise(notification, nowMs = Date.now()) {
    if (!notification) {
        return { allowed: false, reason: 'empty_notification' };
    }

    let text = typeof notification === 'string' ? notification : notification.text || notification.message || '';
    text = cleanNotificationText(text);

    if (!text) {
        return { allowed: false, reason: 'empty_text' };
    }

    const priority = typeof notification === 'object' && notification.priority !== undefined
        ? notification.priority
        : NOTIFICATION_PRIORITIES.INFO;

    // Check if this is a critical alert that must bypass standard noise checks
    const isCritical = priority >= NOTIFICATION_PRIORITIES.CRITICAL ||
        CRITICAL_ALERT_PATTERNS.some((p) => p.test(text));

    // 1. Emoji Bloat Filter: Reject if emoji count exceeds allowed threshold
    const emojiCount = countEmojis(text);
    if (emojiCount > NOTIFICATION_QUEUE_CONFIG.MAX_EMOJI_COUNT) {
        return { allowed: false, reason: 'emoji_bloat', emojiCount };
    }

    // 2. All-caps tutorial paragraph filter
    if (isAllCapsTutorialParagraph(text)) {
        return { allowed: false, reason: 'all_caps_tutorial_paragraph' };
    }

    // 3. Repetitive Stroke / Combat Spam Filter
    if (!isCritical) {
        for (const pattern of REPETITIVE_NOISE_PATTERNS) {
            if (pattern.test(text)) {
                return { allowed: false, reason: 'repetitive_stroke_combat_noise' };
            }
        }
    }

    // 4. Rate-limiting & deduplication
    const normalizedKey = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const lastTimestamp = recentNotificationHistory.get(normalizedKey);
    if (!isCritical && lastTimestamp !== undefined && nowMs >= lastTimestamp && nowMs - lastTimestamp < NOTIFICATION_QUEUE_CONFIG.COCKPIT_NOISE_RATE_LIMIT_MS) {
        return { allowed: false, reason: 'rate_limited', lastSeenMs: lastTimestamp };
    }

    // Record timestamp
    recentNotificationHistory.set(normalizedKey, nowMs);

    // Clean up older keys if history map grows large
    if (recentNotificationHistory.size > 100) {
        for (const [k, ts] of recentNotificationHistory.entries()) {
            if (nowMs - ts > 10000) {
                recentNotificationHistory.delete(k);
            }
        }
    }

    const duration = typeof notification === 'object' && notification.duration
        ? Math.min(Math.max(notification.duration, NOTIFICATION_QUEUE_CONFIG.MIN_DURATION_MS), NOTIFICATION_QUEUE_CONFIG.MAX_DURATION_MS)
        : NOTIFICATION_QUEUE_CONFIG.DEFAULT_DURATION_MS;

    return {
        allowed: true,
        sanitized: {
            text,
            priority,
            duration,
            timestamp: nowMs,
        },
    };
}

/**
 * Helmet 01 Line-of-Sight Stroke Readout Formatter.
 *
 * Formats stroke and propulsion telemetry into a compact, tabular-numeral state
 * for subtle in-place line-of-sight cockpit feedback without popups.
 *
 * @param {Object} params
 * @param {boolean} [params.active=false] - Whether an oar stroke pull is currently underway
 * @param {number} [params.elapsed=0] - Elapsed seconds in current stroke cycle
 * @param {number} [params.duration=0.84] - Total duration of oar stroke cycle
 * @param {number} [params.pullStart=0.05] - Time offset where hydrodynamic blade catch begins
 * @param {number} [params.pullEnd=0.62] - Time offset where hydrodynamic thrust completes
 * @param {number} [params.chokedTimer=0] - Timer active when stroke was cancelled / choked
 * @param {boolean} [params.hasMotor=false] - Whether outboard motor propulsion is equipped
 * @param {number} [params.cancelThreshold=0.48] - Threshold below which fast-press triggers cancel
 * @returns {{
 *   mode: 'motor' | 'choked' | 'pull' | 'glide' | 'idle',
 *   efficiencyPct: number,
 *   tabularReadout: string,
 *   glyph: string,
 *   label: string,
 *   inPowerWindow: boolean
 * }}
 */
export function formatLineOfSightStrokeReadout({
    active = false,
    elapsed = 0,
    duration = 0.84,
    pullStart = 0.05,
    pullEnd = 0.62,
    chokedTimer = 0,
    hasMotor = false,
    cancelThreshold = 0.48,
} = {}) {
    // 1. Motor Upgrade Mode: Constant steady outboard propulsion
    if (hasMotor) {
        return {
            mode: 'motor',
            efficiencyPct: 100,
            tabularReadout: 'MTR 100%',
            glyph: '⚡',
            label: 'MOTOR PROPULSION',
            inPowerWindow: true,
        };
    }

    // 2. Choked / Stalled Mode: Rapid double-tap penalty before power stroke finished
    if (chokedTimer > 0) {
        const efficiencyPct = Math.max(0, Math.round((1 - Math.min(chokedTimer / 0.26, 1)) * 40));
        return {
            mode: 'choked',
            efficiencyPct,
            tabularReadout: `CHK ${String(efficiencyPct).padStart(2, '0')}%`,
            glyph: '⚠️',
            label: 'STROKE CHOKED',
            inPowerWindow: false,
        };
    }

    // 3. Active Pull vs Glide Phase
    if (active) {
        const safeDuration = duration > 0 ? duration : 0.84;
        const clampedElapsed = Math.max(0, Math.min(elapsed, safeDuration));

        // Inside power pull window (pullStart .. pullEnd)
        if (clampedElapsed >= pullStart && clampedElapsed <= pullEnd) {
            const pullDuration = Math.max(pullEnd - pullStart, 0.001);
            const u = (clampedElapsed - pullStart) / pullDuration;
            // Sinusoidal impulse curve matching physics engine
            const impulse = Math.sin(u * Math.PI) ** 1.15;
            const efficiencyPct = Math.round(Math.max(0, Math.min(impulse * 100, 100)));

            return {
                mode: 'pull',
                efficiencyPct,
                tabularReadout: `PULL ${String(efficiencyPct).padStart(3, ' ')}%`,
                glyph: '⚓',
                label: 'POWER PULL',
                inPowerWindow: true,
            };
        }

        // Catch or Recovery / Feathering phase of an active stroke
        if (clampedElapsed < pullStart) {
            return {
                mode: 'pull',
                efficiencyPct: 10,
                tabularReadout: 'CATCH 10%',
                glyph: '⚓',
                label: 'BLADE CATCH',
                inPowerWindow: false,
            };
        }

        // Post pullEnd, recovery glide while active
        const recoveryProgress = (safeDuration - clampedElapsed) / Math.max(safeDuration - pullEnd, 0.001);
        const efficiencyPct = Math.round(Math.max(0, Math.min(recoveryProgress * 50, 50)));
        return {
            mode: 'glide',
            efficiencyPct,
            tabularReadout: `GLD ${String(efficiencyPct).padStart(2, '0')}%`,
            glyph: '〰️',
            label: 'RECOVERY GLIDE',
            inPowerWindow: false,
        };
    }

    // 4. Inactive / Coasting Idle
    return {
        mode: 'idle',
        efficiencyPct: 0,
        tabularReadout: 'IDLE --%',
        glyph: '·',
        label: 'NEUTRAL COAST',
        inPowerWindow: false,
    };
}

/**
 * Calculates whether notification HUD layout is under the < 8% screen area budget.
 *
 * @param {number} activeCount - Number of visible notifications
 * @param {number} viewportWidth - Width of screen in px
 * @param {number} viewportHeight - Height of screen in px
 * @param {Object} [boxSpec] - Per-notification box dimensions
 * @returns {{ areaRatio: number, isUnderBudget: boolean, totalArea: number }}
 */
export function calculateNotificationFootprint(
    activeCount,
    viewportWidth = 1440,
    viewportHeight = 900,
    boxSpec = { width: 240, height: 32, margin: 6 }
) {
    const totalScreenArea = Math.max(1, viewportWidth * viewportHeight);
    const itemArea = (boxSpec.width + (boxSpec.margin || 0) * 2) * (boxSpec.height + (boxSpec.margin || 0) * 2);
    const totalArea = Math.max(0, activeCount) * itemArea;
    const areaRatio = totalArea / totalScreenArea;

    return {
        areaRatio,
        isUnderBudget: areaRatio <= NOTIFICATION_QUEUE_CONFIG.MAX_SCREEN_FOOTPRINT_RATIO,
        totalArea,
    };
}

/**
 * Creates an autonomous Notification Queue instance adhering to Helmet 01 constraints.
 *
 * @param {Object} [options]
 * @param {number} [options.maxActive] - Max notifications displayed simultaneously (default 3)
 * @param {number} [options.capacity] - Maximum internal buffer capacity (default 20)
 * @returns {Object} Public queue controller interface
 */
export function createHudNotificationQueue(options = {}) {
    const maxActive = options.maxActive || NOTIFICATION_QUEUE_CONFIG.MAX_ACTIVE_NOTIFICATIONS;
    const capacity = options.capacity || NOTIFICATION_QUEUE_CONFIG.MAX_QUEUE_CAPACITY;

    /** @type {Array<Object>} */
    let queue = [];
    /** @type {Array<Object>} */
    let active = [];
    let nextId = 1;

    /**
     * Enqueues a notification if it passes noise filtration.
     *
     * @param {Object|string} notification
     * @param {number} [nowMs=Date.now()]
     * @returns {Object|null} The enqueued notification or null if filtered out
     */
    function enqueue(notification, nowMs = Date.now()) {
        const filterResult = filterCockpitNoise(notification, nowMs);
        if (!filterResult.allowed) {
            return null;
        }

        const item = {
            id: nextId++,
            ...filterResult.sanitized,
            createdAt: nowMs,
            expiresAt: nowMs + filterResult.sanitized.duration,
        };

        // If high priority, prioritize over lower items
        if (queue.length >= capacity) {
            // Drop lowest priority queued item
            queue.sort((a, b) => a.priority - b.priority);
            if (queue[0].priority < item.priority) {
                queue.shift();
            } else {
                return null; // Queue full of higher/equal priority items
            }
        }

        queue.push(item);
        // Sort queue by priority descending, then createdAt ascending
        queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

        update(nowMs);
        return item;
    }

    /**
     * Updates queue states, expelling expired notifications and promoting pending ones.
     *
     * @param {number} [nowMs=Date.now()]
     * @returns {Array<Object>} Currently active notifications
     */
    function update(nowMs = Date.now()) {
        // Remove expired active notifications
        active = active.filter((item) => item.expiresAt > nowMs);

        // Promote from queue into active slots up to maxActive
        while (active.length < maxActive && queue.length > 0) {
            const promoted = queue.shift();
            // Refresh expiration upon becoming active
            promoted.activatedAt = nowMs;
            promoted.expiresAt = nowMs + promoted.duration;
            active.push(promoted);
        }

        return active;
    }

    /**
     * Dismisses a notification by ID.
     *
     * @param {number} id
     * @returns {boolean} Whether item was found and removed
     */
    function dismiss(id) {
        const initialActiveLen = active.length;
        const initialQueueLen = queue.length;
        active = active.filter((item) => item.id !== id);
        queue = queue.filter((item) => item.id !== id);
        return active.length !== initialActiveLen || queue.length !== initialQueueLen;
    }

    /**
     * Clears all queued and active notifications.
     */
    function clear() {
        queue = [];
        active = [];
    }

    /**
     * Gets read-only snapshot of active notifications.
     *
     * @returns {Array<Object>}
     */
    function getActive() {
        return [...active];
    }

    /**
     * Gets read-only snapshot of queued notifications.
     *
     * @returns {Array<Object>}
     */
    function getQueued() {
        return [...queue];
    }

    return {
        enqueue,
        update,
        dismiss,
        clear,
        getActive,
        getQueued,
        get size() {
            return active.length + queue.length;
        },
    };
}
