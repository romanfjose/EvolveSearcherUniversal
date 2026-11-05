/**
 * Subsystem Fault-Isolation Circuit Breaker for "Don't Sink, Don't Die".
 *
 * Enforces Helmet 02 ("Never DDOS the Pilot") & Sovereign Core:
 * - Wraps non-critical subsystems (weather, banter, minimap, ghost replay, VFX, etc.)
 *   in a resilient circuit breaker boundary.
 * - Catches unexpected runtime exceptions (TypeError, RangeError, null reference, etc.).
 * - Generates crisp 1-line diagnostics detailing subsystem, error name, root cause message,
 *   and fail count.
 * - Trips OPEN after 3 consecutive faults (configurable), cleanly suppressing subsequent
 *   invocations to avoid burning frame budget and keep core raft physics & rendering flying at 60 FPS.
 * - Supports cooldown-based HALF_OPEN probing to test if the failing subsystem has self-healed.
 * - Zero external dependencies, pure ES module compatible with Node.js and browser environments.
 */

export const BREAKER_STATE = {
    CLOSED: 'CLOSED',       // Normal operation: executions pass through
    OPEN: 'OPEN',           // Tripped: calls bypassed immediately to prevent frame drops
    HALF_OPEN: 'HALF_OPEN', // Probing: single canary execution allowed to test health
};

export const DEFAULT_BREAKER_CONFIG = {
    failureThreshold: 3,        // Trip OPEN after 3 consecutive errors
    cooldownMs: 5000,           // Time before attempting HALF_OPEN trial probe
    successThreshold: 1,        // Successful probe executions in HALF_OPEN required to transition back to CLOSED
    maxHistorySize: 10,         // Size of circular diagnostic log buffer
};

export const STANDARD_NON_CRITICAL_SUBSYSTEMS = [
    'weather',
    'banter',
    'minimap',
    'ghost_replay',
    'vfx',
];

/**
 * Format a crisp, 1-line diagnostic string with root cause for instant operator triage.
 * Example:
 * [CIRCUIT_BREAKER][weather] FAULT #3 (TRIPPED OPEN) -> TypeError: Cannot read properties of undefined (reading 'particles')
 */
export function formatBreakerDiagnostic({
    subsystem,
    state,
    consecutiveFailures,
    error,
    action = 'FAULT',
    timestamp = Date.now(),
}) {
    const name = subsystem || 'anonymous';
    const errType = error?.name || (error instanceof Error ? 'Error' : typeof error);
    const errMsg = error?.message || String(error || 'Unknown error');
    // Sanitize message to guarantee exactly one line
    const cleanMsg = errMsg.replace(/[\r\n]+/g, ' ').trim();
    const countInfo = consecutiveFailures > 0 ? `#${consecutiveFailures}` : '';
    const stateSuffix = state === BREAKER_STATE.OPEN ? ' (TRIPPED OPEN)' : '';

    return `[CIRCUIT_BREAKER][${name}] ${action} ${countInfo}${stateSuffix} -> ${errType}: ${cleanMsg}`;
}

/**
 * Single Subsystem Circuit Breaker.
 */
export class SubsystemCircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = Math.max(1, options.failureThreshold ?? DEFAULT_BREAKER_CONFIG.failureThreshold);
        this.cooldownMs = Math.max(0, options.cooldownMs ?? DEFAULT_BREAKER_CONFIG.cooldownMs);
        this.successThreshold = Math.max(1, options.successThreshold ?? DEFAULT_BREAKER_CONFIG.successThreshold);
        this.maxHistorySize = Math.max(1, options.maxHistorySize ?? DEFAULT_BREAKER_CONFIG.maxHistorySize);

        // Optional custom logger or fallback handler
        this.logger = typeof options.logger === 'function' ? options.logger : null;
        this.fallback = typeof options.fallback === 'function' ? options.fallback : null;
        this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();

        // Operational state
        this.state = BREAKER_STATE.CLOSED;
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.totalExecutions = 0;
        this.totalFailures = 0;
        this.totalBypasses = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.lastStateChangeTime = this.nowFn();
        this.lastError = null;

        // Circular history buffer of diagnostics
        this.diagnosticHistory = [];
        this.listeners = new Set();
    }

    /**
     * Subscribe to state transition or fault events.
     * @param {Function} listener ({ event, breaker, diagnostic, ... }) => void
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        if (typeof listener === 'function') {
            this.listeners.add(listener);
        }
        return () => this.listeners.delete(listener);
    }

    _notify(payload) {
        for (const listener of this.listeners) {
            try {
                listener(payload);
            } catch {
                // Ignore listener exceptions to avoid cascading failure
            }
        }
    }

    _log(diagnostic) {
        if (this.diagnosticHistory.length >= this.maxHistorySize) {
            this.diagnosticHistory.shift();
        }
        this.diagnosticHistory.push(diagnostic);

        if (this.logger) {
            try {
                this.logger(diagnostic);
            } catch {
                // Suppress logger errors
            }
        }
    }

    /**
     * Check and update breaker state based on elapsed cooldown time.
     * If OPEN and cooldown has elapsed, transitions to HALF_OPEN.
     */
    checkCooldown(now = this.nowFn()) {
        if (this.state === BREAKER_STATE.OPEN) {
            if (this.lastFailureTime !== null && (now - this.lastFailureTime) >= this.cooldownMs) {
                this._transitionTo(BREAKER_STATE.HALF_OPEN, now);
            }
        }
    }

    _transitionTo(nextState, now = this.nowFn(), reason = '') {
        const prevState = this.state;
        if (prevState === nextState) return;

        this.state = nextState;
        this.lastStateChangeTime = now;

        const diag = `[CIRCUIT_BREAKER][${this.name}] STATE_CHANGE -> ${prevState} => ${nextState}${reason ? ` (${reason})` : ''}`;
        this._log(diag);

        this._notify({
            event: 'state_change',
            breaker: this,
            prevState,
            nextState,
            diagnostic: diag,
            timestamp: now,
        });
    }

    /**
     * Record a successful execution.
     */
    _recordSuccess(now = this.nowFn()) {
        this.consecutiveFailures = 0;
        this.lastSuccessTime = now;

        if (this.state === BREAKER_STATE.HALF_OPEN) {
            this.consecutiveSuccesses++;
            if (this.consecutiveSuccesses >= this.successThreshold) {
                this.consecutiveSuccesses = 0;
                this._transitionTo(BREAKER_STATE.CLOSED, now, 'Canary probe succeeded');
            }
        }
    }

    /**
     * Record a failure / exception.
     */
    _recordFailure(error, now = this.nowFn()) {
        this.totalFailures++;
        this.consecutiveFailures++;
        this.lastFailureTime = now;
        this.lastError = error;

        const diag = formatBreakerDiagnostic({
            subsystem: this.name,
            state: this.state,
            consecutiveFailures: this.consecutiveFailures,
            error,
            action: 'FAULT',
            timestamp: now,
        });
        this._log(diag);

        this._notify({
            event: 'fault',
            breaker: this,
            error,
            diagnostic: diag,
            consecutiveFailures: this.consecutiveFailures,
            timestamp: now,
        });

        if (this.state === BREAKER_STATE.HALF_OPEN) {
            // Canary probe failed: immediately trip back OPEN
            this._transitionTo(BREAKER_STATE.OPEN, now, 'Canary probe failed');
        } else if (this.state === BREAKER_STATE.CLOSED) {
            if (this.consecutiveFailures >= this.failureThreshold) {
                this._transitionTo(BREAKER_STATE.OPEN, now, `Failure threshold of ${this.failureThreshold} reached`);
            }
        }
    }

    /**
     * Executes a synchronous subsystem function safely within the circuit boundary.
     *
     * @param {Function} fn - Subsystem logic to run
     * @param {Array} args - Arguments to pass to fn
     * @param {any} context - 'this' binding
     * @returns {object} { ok: boolean, result: any, bypassed: boolean, error: any, state: string }
     */
    execute(fn, args = [], context = null) {
        this.totalExecutions++;
        const now = this.nowFn();
        this.checkCooldown(now);

        // If OPEN, bypass execution immediately without throwing
        if (this.state === BREAKER_STATE.OPEN) {
            this.totalBypasses++;
            let fallbackResult;
            if (this.fallback) {
                try {
                    fallbackResult = this.fallback(...args);
                } catch {
                    // Suppress fallback error
                }
            }
            return {
                ok: false,
                result: fallbackResult,
                bypassed: true,
                error: this.lastError,
                state: this.state,
            };
        }

        // State is CLOSED or HALF_OPEN: execute protected logic
        try {
            const result = fn.apply(context, args);
            this._recordSuccess(now);
            return {
                ok: true,
                result,
                bypassed: false,
                error: null,
                state: this.state,
            };
        } catch (err) {
            this._recordFailure(err, now);
            let fallbackResult;
            if (this.fallback) {
                try {
                    fallbackResult = this.fallback(...args);
                } catch {
                    // Suppress fallback error
                }
            }
            return {
                ok: false,
                result: fallbackResult,
                bypassed: false,
                error: err,
                state: this.state,
            };
        }
    }

    /**
     * Executes an asynchronous subsystem function safely.
     *
     * @param {Function} asyncFn - Async function returning a promise
     * @param {Array} args - Arguments
     * @param {any} context - 'this' binding
     * @returns {Promise<object>} { ok: boolean, result: any, bypassed: boolean, error: any, state: string }
     */
    async executeAsync(asyncFn, args = [], context = null) {
        this.totalExecutions++;
        const now = this.nowFn();
        this.checkCooldown(now);

        if (this.state === BREAKER_STATE.OPEN) {
            this.totalBypasses++;
            let fallbackResult;
            if (this.fallback) {
                try {
                    fallbackResult = await this.fallback(...args);
                } catch {
                    // Suppress fallback error
                }
            }
            return {
                ok: false,
                result: fallbackResult,
                bypassed: true,
                error: this.lastError,
                state: this.state,
            };
        }

        try {
            const result = await asyncFn.apply(context, args);
            this._recordSuccess(now);
            return {
                ok: true,
                result,
                bypassed: false,
                error: null,
                state: this.state,
            };
        } catch (err) {
            this._recordFailure(err, now);
            let fallbackResult;
            if (this.fallback) {
                try {
                    fallbackResult = await this.fallback(...args);
                } catch {
                    // Suppress fallback error
                }
            }
            return {
                ok: false,
                result: fallbackResult,
                bypassed: false,
                error: err,
                state: this.state,
            };
        }
    }

    /**
     * Decorates a subsystem function with this circuit breaker, returning a protected function.
     */
    wrap(fn, context = null) {
        return (...args) => {
            const report = this.execute(fn, args, context);
            return report.result;
        };
    }

    /**
     * Decorates an asynchronous subsystem function with this circuit breaker.
     */
    wrapAsync(asyncFn, context = null) {
        return async (...args) => {
            const report = await this.executeAsync(asyncFn, args, context);
            return report.result;
        };
    }

    /**
     * Manually trip the circuit open.
     */
    trip(reason = 'manual_trip', error = new Error('Circuit manually tripped open')) {
        const now = this.nowFn();
        this.lastError = error;
        this.lastFailureTime = now;
        this._transitionTo(BREAKER_STATE.OPEN, now, reason);
    }

    /**
     * Manually reset the circuit back to CLOSED.
     */
    reset(reason = 'manual_reset') {
        const now = this.nowFn();
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.lastError = null;
        this._transitionTo(BREAKER_STATE.CLOSED, now, reason);
    }

    /**
     * Retrieve current health report for this subsystem.
     */
    getStatus() {
        return {
            name: this.name,
            state: this.state,
            consecutiveFailures: this.consecutiveFailures,
            failureThreshold: this.failureThreshold,
            totalExecutions: this.totalExecutions,
            totalFailures: this.totalFailures,
            totalBypasses: this.totalBypasses,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            lastStateChangeTime: this.lastStateChangeTime,
            isOperational: this.state !== BREAKER_STATE.OPEN,
            latestDiagnostic: this.diagnosticHistory[this.diagnosticHistory.length - 1] || null,
        };
    }
}

/**
 * Subsystem Registry & Supervisor.
 * Manages multiple circuit breakers for the game's non-critical subsystems.
 */
export class SubsystemBreakerRegistry {
    constructor(options = {}) {
        this.defaultOptions = { ...DEFAULT_BREAKER_CONFIG, ...options };
        this.breakers = new Map();
        this.globalDiagnostics = [];
        this.maxGlobalDiagnostics = 50;
        this.onGlobalDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : null;

        // Auto-register standard non-critical subsystems if requested
        if (options.registerStandard !== false) {
            for (const name of STANDARD_NON_CRITICAL_SUBSYSTEMS) {
                this.register(name);
            }
        }
    }

    /**
     * Register a new subsystem or return existing one.
     */
    register(name, customOptions = {}) {
        if (!name || typeof name !== 'string') {
            throw new TypeError('Subsystem name must be a non-empty string');
        }

        if (this.breakers.has(name)) {
            return this.breakers.get(name);
        }

        const breaker = new SubsystemCircuitBreaker(name, {
            ...this.defaultOptions,
            ...customOptions,
            logger: (diag) => {
                this._recordGlobalDiagnostic(diag);
                if (customOptions.logger) {
                    try { customOptions.logger(diag); } catch {}
                }
            },
        });

        this.breakers.set(name, breaker);
        return breaker;
    }

    _recordGlobalDiagnostic(diag) {
        if (this.globalDiagnostics.length >= this.maxGlobalDiagnostics) {
            this.globalDiagnostics.shift();
        }
        this.globalDiagnostics.push(diag);

        if (this.onGlobalDiagnostic) {
            try { this.onGlobalDiagnostic(diag); } catch {}
        }
    }

    get(name) {
        return this.breakers.get(name);
    }

    has(name) {
        return this.breakers.has(name);
    }

    /**
     * Protect and execute a subsystem step function.
     */
    step(name, fn, args = [], context = null) {
        let breaker = this.breakers.get(name);
        if (!breaker) {
            breaker = this.register(name);
        }
        return breaker.execute(fn, args, context);
    }

    /**
     * Protect and execute all registered subsystems in a tick sequence.
     * Takes an object of subsystem actions: { [name]: () => void }.
     * Returns execution summaries.
     */
    stepAll(actions = {}, context = null) {
        const results = {};
        for (const [name, fn] of Object.entries(actions)) {
            if (typeof fn === 'function') {
                results[name] = this.step(name, fn, [], context);
            }
        }
        return results;
    }

    /**
     * Resets all subsystem breakers to CLOSED.
     */
    resetAll(reason = 'global_reset') {
        for (const breaker of this.breakers.values()) {
            breaker.reset(reason);
        }
    }

    /**
     * Produce a consolidated health report for all registered subsystems.
     */
    getHealthReport() {
        const subsystems = {};
        let allOperational = true;
        let openCount = 0;
        let totalExecutions = 0;
        let totalFailures = 0;
        let totalBypasses = 0;

        for (const [name, breaker] of this.breakers) {
            const status = breaker.getStatus();
            subsystems[name] = status;
            totalExecutions += status.totalExecutions;
            totalFailures += status.totalFailures;
            totalBypasses += status.totalBypasses;

            if (status.state === BREAKER_STATE.OPEN) {
                allOperational = false;
                openCount++;
            }
        }

        return {
            allOperational,
            openCount,
            subsystemCount: this.breakers.size,
            totalExecutions,
            totalFailures,
            totalBypasses,
            subsystems,
            latestDiagnostics: [...this.globalDiagnostics].slice(-10),
        };
    }
}

/**
 * Creates an isolated SubsystemBreakerRegistry configured for standard non-critical systems.
 */
export function createSubsystemBreakerRegistry(options = {}) {
    return new SubsystemBreakerRegistry(options);
}
