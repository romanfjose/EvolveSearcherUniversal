import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    BREAKER_STATE,
    DEFAULT_BREAKER_CONFIG,
    STANDARD_NON_CRITICAL_SUBSYSTEMS,
    formatBreakerDiagnostic,
    SubsystemCircuitBreaker,
    SubsystemBreakerRegistry,
    createSubsystemBreakerRegistry,
} from '../shared/subsystem-breaker.js';

describe('Subsystem Fault-Isolation Breaker — Constants & Diagnostics', () => {
    test('exposes canonical breaker states: CLOSED, OPEN, HALF_OPEN', () => {
        assert.equal(BREAKER_STATE.CLOSED, 'CLOSED');
        assert.equal(BREAKER_STATE.OPEN, 'OPEN');
        assert.equal(BREAKER_STATE.HALF_OPEN, 'HALF_OPEN');
    });

    test('default configuration matches Helmet 02 requirements (threshold=3)', () => {
        assert.equal(DEFAULT_BREAKER_CONFIG.failureThreshold, 3);
        assert.ok(DEFAULT_BREAKER_CONFIG.cooldownMs > 0);
        assert.equal(DEFAULT_BREAKER_CONFIG.successThreshold, 1);
        assert.ok(DEFAULT_BREAKER_CONFIG.maxHistorySize >= 5);
    });

    test('contains standard non-critical subsystems (weather, banter, minimap, ghost_replay, vfx)', () => {
        const expected = ['weather', 'banter', 'minimap', 'ghost_replay', 'vfx'];
        for (const sub of expected) {
            assert.ok(STANDARD_NON_CRITICAL_SUBSYSTEMS.includes(sub), `Missing expected subsystem: ${sub}`);
        }
    });

    test('formats crisp 1-line diagnostic with root cause and zero newlines', () => {
        const error = new TypeError("Cannot read properties of undefined (reading 'particles')\n    at WeatherSystem.update");
        const line = formatBreakerDiagnostic({
            subsystem: 'weather',
            state: BREAKER_STATE.OPEN,
            consecutiveFailures: 3,
            error,
        });

        assert.ok(!line.includes('\n'), 'Diagnostic must be strictly 1 single line');
        assert.ok(!line.includes('\r'), 'Diagnostic must not contain carriage returns');
        assert.ok(line.includes('[CIRCUIT_BREAKER][weather]'));
        assert.ok(line.includes('#3 (TRIPPED OPEN)'));
        assert.ok(line.includes('TypeError'));
        assert.ok(line.includes("Cannot read properties of undefined (reading 'particles')"));
    });

    test('formats diagnostic for non-Error throwables gracefully', () => {
        const line = formatBreakerDiagnostic({
            subsystem: 'banter',
            state: BREAKER_STATE.CLOSED,
            consecutiveFailures: 1,
            error: 'Database connection dropped abruptly',
        });

        assert.ok(line.includes('[CIRCUIT_BREAKER][banter]'));
        assert.ok(line.includes('Database connection dropped abruptly'));
    });
});

describe('SubsystemCircuitBreaker — State Transitions & Fault Isolation', () => {
    test('initial state is CLOSED with zero failures and passes execution through', () => {
        const breaker = new SubsystemCircuitBreaker('minimap');
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);
        assert.equal(breaker.consecutiveFailures, 0);

        let executed = false;
        const res = breaker.execute(() => {
            executed = true;
            return 42;
        });

        assert.equal(executed, true);
        assert.equal(res.ok, true);
        assert.equal(res.result, 42);
        assert.equal(res.bypassed, false);
        assert.equal(res.error, null);
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);
    });

    test('trips OPEN after exactly 3 consecutive faults (Helmet 02 rule)', () => {
        const breaker = new SubsystemCircuitBreaker('weather', { failureThreshold: 3 });

        const explode = () => {
            throw new Error('WebGL shader compile fault');
        };

        // Fault 1
        const res1 = breaker.execute(explode);
        assert.equal(res1.ok, false);
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);
        assert.equal(breaker.consecutiveFailures, 1);

        // Fault 2
        const res2 = breaker.execute(explode);
        assert.equal(res2.ok, false);
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);
        assert.equal(breaker.consecutiveFailures, 2);

        // Fault 3 -> Trips OPEN!
        const res3 = breaker.execute(explode);
        assert.equal(res3.ok, false);
        assert.equal(breaker.state, BREAKER_STATE.OPEN);
        assert.equal(breaker.consecutiveFailures, 3);
        assert.equal(breaker.getStatus().isOperational, false);

        // Call 4 -> Bypassed immediately without calling explode
        let reached = false;
        const res4 = breaker.execute(() => {
            reached = true;
        });
        assert.equal(reached, false);
        assert.equal(res4.ok, false);
        assert.equal(res4.bypassed, true);
        assert.equal(res4.state, BREAKER_STATE.OPEN);
        assert.equal(breaker.totalBypasses, 1);
    });

    test('successful execution in CLOSED state resets consecutive failure counter', () => {
        const breaker = new SubsystemCircuitBreaker('banter', { failureThreshold: 3 });

        // 2 failures
        breaker.execute(() => { throw new Error('Banter audio voice unavailable'); });
        breaker.execute(() => { throw new Error('Banter audio voice unavailable'); });
        assert.equal(breaker.consecutiveFailures, 2);
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);

        // 1 success resets counter back to 0
        const successRes = breaker.execute(() => 'Oars up, captain!');
        assert.equal(successRes.ok, true);
        assert.equal(breaker.consecutiveFailures, 0);
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);

        // Needs 3 fresh consecutive failures to trip
        breaker.execute(() => { throw new Error('Fault 1'); });
        breaker.execute(() => { throw new Error('Fault 2'); });
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);
        breaker.execute(() => { throw new Error('Fault 3'); });
        assert.equal(breaker.state, BREAKER_STATE.OPEN);
    });

    test('transitions from OPEN to HALF_OPEN after cooldown period', () => {
        let simulatedTime = 1000;
        const breaker = new SubsystemCircuitBreaker('vfx', {
            failureThreshold: 3,
            cooldownMs: 2000,
            nowFn: () => simulatedTime,
        });

        // Cause 3 failures at t = 1000
        for (let i = 0; i < 3; i++) {
            breaker.execute(() => { throw new Error('VFX particle buffer full'); });
        }
        assert.equal(breaker.state, BREAKER_STATE.OPEN);

        // Advance time by 1000ms (t = 2000): cooldown not elapsed yet (needs 2000ms)
        simulatedTime = 2000;
        breaker.checkCooldown();
        assert.equal(breaker.state, BREAKER_STATE.OPEN);

        // Advance time to t = 3000 (elapsed 2000ms >= cooldownMs): transitions to HALF_OPEN
        simulatedTime = 3000;
        breaker.checkCooldown();
        assert.equal(breaker.state, BREAKER_STATE.HALF_OPEN);
    });

    test('canary probe in HALF_OPEN heals breaker back to CLOSED on success', () => {
        let simulatedTime = 1000;
        const breaker = new SubsystemCircuitBreaker('ghost_replay', {
            failureThreshold: 3,
            cooldownMs: 1500,
            successThreshold: 1,
            nowFn: () => simulatedTime,
        });

        // Trip OPEN
        for (let i = 0; i < 3; i++) {
            breaker.execute(() => { throw new Error('Ghost serialization corrupted'); });
        }
        assert.equal(breaker.state, BREAKER_STATE.OPEN);

        // Elapse cooldown
        simulatedTime += 2000;
        // Canary probe executes and succeeds
        const res = breaker.execute(() => 'ghost position updated');
        assert.equal(res.ok, true);
        assert.equal(res.result, 'ghost position updated');
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);
        assert.equal(breaker.consecutiveFailures, 0);
    });

    test('canary probe in HALF_OPEN trips immediately back to OPEN on failure', () => {
        let simulatedTime = 1000;
        const breaker = new SubsystemCircuitBreaker('minimap', {
            failureThreshold: 3,
            cooldownMs: 1000,
            nowFn: () => simulatedTime,
        });

        // Trip OPEN
        for (let i = 0; i < 3; i++) {
            breaker.execute(() => { throw new Error('Canvas context lost'); });
        }
        assert.equal(breaker.state, BREAKER_STATE.OPEN);

        // Advance cooldown to enter HALF_OPEN
        simulatedTime += 1500;
        // Canary probe fails
        const res = breaker.execute(() => { throw new Error('Canvas context still null'); });
        assert.equal(res.ok, false);
        assert.equal(breaker.state, BREAKER_STATE.OPEN);

        // Next call is bypassed
        const next = breaker.execute(() => 'never reached');
        assert.equal(next.bypassed, true);
    });
});

describe('SubsystemCircuitBreaker — Fallback, Wrap Decorator & Event Subscriptions', () => {
    test('invokes fallback when circuit is OPEN or throws', () => {
        const breaker = new SubsystemCircuitBreaker('weather', {
            failureThreshold: 2,
            fallback: (dt) => ({ particlesActive: 0, fog: 'default_clear', dt }),
        });

        // 2 failures to trip open
        breaker.execute(() => { throw new Error('Boom 1'); }, [0.016]);
        const res2 = breaker.execute(() => { throw new Error('Boom 2'); }, [0.016]);

        assert.equal(res2.ok, false);
        assert.deepEqual(res2.result, { particlesActive: 0, fog: 'default_clear', dt: 0.016 });
        assert.equal(breaker.state, BREAKER_STATE.OPEN);

        // When open, fallback is cleanly returned
        const res3 = breaker.execute(() => 'original', [0.033]);
        assert.equal(res3.bypassed, true);
        assert.deepEqual(res3.result, { particlesActive: 0, fog: 'default_clear', dt: 0.033 });
    });

    test('wrap() returns a safe decorated function with zero thrown exceptions', () => {
        const breaker = new SubsystemCircuitBreaker('banter', {
            failureThreshold: 2,
            fallback: () => 'fallback_silence',
        });

        const dangerousFn = (shouldFail) => {
            if (shouldFail) throw new Error('Banter script syntax error');
            return 'Yo-ho-ho!';
        };

        const safeBanter = breaker.wrap(dangerousFn);

        assert.equal(safeBanter(false), 'Yo-ho-ho!');
        assert.equal(safeBanter(true), 'fallback_silence');
        assert.equal(safeBanter(true), 'fallback_silence'); // Trips open
        assert.equal(breaker.state, BREAKER_STATE.OPEN);
        assert.equal(safeBanter(false), 'fallback_silence'); // Bypassed
    });

    test('wrapAsync() safely catches async errors and rejections', async () => {
        const breaker = new SubsystemCircuitBreaker('ghost_replay', { failureThreshold: 2 });

        const asyncTask = async (fail) => {
            if (fail) throw new Error('Async network fetch timed out');
            return { ghostLoaded: true };
        };

        const safeAsync = breaker.wrapAsync(asyncTask);

        const r1 = await safeAsync(false);
        assert.deepEqual(r1, { ghostLoaded: true });

        const r2 = await safeAsync(true);
        assert.equal(r2, undefined);

        const r3 = await safeAsync(true);
        assert.equal(r3, undefined);
        assert.equal(breaker.state, BREAKER_STATE.OPEN);
    });

    test('manual trip() and reset() functions work predictably', () => {
        const breaker = new SubsystemCircuitBreaker('vfx');
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);

        breaker.trip('Emergency manual disable');
        assert.equal(breaker.state, BREAKER_STATE.OPEN);
        assert.equal(breaker.execute(() => 'test').bypassed, true);

        breaker.reset('Player resumed settings');
        assert.equal(breaker.state, BREAKER_STATE.CLOSED);
        assert.equal(breaker.execute(() => 'restored').ok, true);
    });

    test('subscribes to state change and fault notifications', () => {
        const breaker = new SubsystemCircuitBreaker('minimap', { failureThreshold: 2 });
        const events = [];
        const unsub = breaker.subscribe((ev) => events.push(ev));

        breaker.execute(() => { throw new Error('Minimap render glitch'); });
        breaker.execute(() => { throw new Error('Minimap render glitch'); });

        assert.equal(events.length, 3); // fault 1, fault 2, state_change
        assert.equal(events[0].event, 'fault');
        assert.equal(events[1].event, 'fault');
        assert.equal(events[2].event, 'state_change');
        assert.equal(events[2].nextState, BREAKER_STATE.OPEN);

        unsub();
        breaker.reset();
        assert.equal(events.length, 3, 'Unsubscribed listener must receive no new events');
    });
});

describe('SubsystemBreakerRegistry & Supervisor', () => {
    test('creates registry with 5 standard non-critical subsystems pre-registered', () => {
        const registry = createSubsystemBreakerRegistry();
        for (const name of STANDARD_NON_CRITICAL_SUBSYSTEMS) {
            assert.ok(registry.has(name), `Registry should contain ${name}`);
            const breaker = registry.get(name);
            assert.equal(breaker.name, name);
            assert.equal(breaker.state, BREAKER_STATE.CLOSED);
        }
    });

    test('dynamically registers and protects new custom subsystems on the fly', () => {
        const registry = createSubsystemBreakerRegistry();
        assert.equal(registry.has('holographic_fish'), false);

        const res = registry.step('holographic_fish', () => 'swimming');
        assert.equal(res.ok, true);
        assert.equal(res.result, 'swimming');
        assert.equal(registry.has('holographic_fish'), true);
    });

    test('stepAll executes multiple subsystems and captures individual fault statuses', () => {
        const registry = createSubsystemBreakerRegistry();

        const stepResults = registry.stepAll({
            weather: () => 'weather_updated',
            banter: () => { throw new Error('Audio sample corrupted'); },
            minimap: () => 'minimap_rendered',
            ghost_replay: () => { throw new Error('Ghost buffer underrun'); },
            vfx: () => 'particles_stepped',
        });

        assert.equal(stepResults.weather.ok, true);
        assert.equal(stepResults.banter.ok, false);
        assert.equal(stepResults.minimap.ok, true);
        assert.equal(stepResults.ghost_replay.ok, false);
        assert.equal(stepResults.vfx.ok, true);

        const health = registry.getHealthReport();
        assert.equal(health.subsystemCount >= 5, true);
        assert.equal(health.totalFailures, 2);
        assert.equal(health.subsystems.banter.consecutiveFailures, 1);
        assert.equal(health.subsystems.weather.consecutiveFailures, 0);
    });

    test('health report aggregates status, openCount, and diagnostic lines', () => {
        const registry = createSubsystemBreakerRegistry({ failureThreshold: 2 });

        // Trip banter open
        registry.step('banter', () => { throw new Error('Banter voice missing'); });
        registry.step('banter', () => { throw new Error('Banter voice missing'); });

        const health = registry.getHealthReport();
        assert.equal(health.allOperational, false);
        assert.equal(health.openCount, 1);
        assert.equal(health.subsystems.banter.state, BREAKER_STATE.OPEN);
        assert.ok(health.latestDiagnostics.length > 0);
        assert.ok(health.latestDiagnostics.some((d) => d.includes('banter')));

        // Global reset restores all
        registry.resetAll();
        const resetHealth = registry.getHealthReport();
        assert.equal(resetHealth.allOperational, true);
        assert.equal(resetHealth.openCount, 0);
    });
});

describe('60 FPS Raft Physics & Subsystem Chaos Isolation (Helmet 02 Law)', () => {
    test('core raft physics and rendering maintain 60 FPS while non-critical subsystems explode', () => {
        const registry = createSubsystemBreakerRegistry({ failureThreshold: 3 });

        // Simulated core raft state
        const raft = {
            position: { x: 0, y: 0.25, z: 0 },
            velocity: { x: 0, y: 0, z: -15 }, // 15 m/s downriver
            dt: 1 / 60,
            framesRendered: 0,
        };

        // Core physics simulation step (must never fail)
        const stepCorePhysics = (dt) => {
            raft.position.z += raft.velocity.z * dt;
            raft.framesRendered++;
            return { ...raft.position };
        };

        // Chaos simulator: subsystems fail erratically
        let frame = 0;
        const totalFrames = 120; // 2 seconds of 60 FPS gameplay

        for (frame = 0; frame < totalFrames; frame++) {
            // 1. Step non-critical subsystems wrapped in breakers
            registry.stepAll({
                weather: () => {
                    // Weather explodes on frame 10, 11, 12, then stays open
                    if (frame >= 10) throw new TypeError('Particle point cloud buffer invalid');
                    return 'weather_ok';
                },
                banter: () => {
                    // Banter throws random errors
                    if (frame % 3 === 0) throw new Error('Speech synthesis disconnected');
                    return 'banter_ok';
                },
                minimap: () => {
                    // Minimap throws on frame 25, 26, 27
                    if (frame >= 25 && frame < 50) throw new RangeError('Minimap radar coordinates out of range');
                    return 'minimap_ok';
                },
                ghost_replay: () => {
                    return 'ghost_ok';
                },
                vfx: () => {
                    if (frame === 5) throw new Error('Sparks shader compilation failed');
                    return 'vfx_ok';
                },
            });

            // 2. Core raft physics MUST ALWAYS STEP unimpeded
            stepCorePhysics(raft.dt);

            // Assert core raft kinematics are finite and sane at every frame
            assert.ok(Number.isFinite(raft.position.z), 'Raft Z coordinate must remain finite');
            assert.ok(raft.position.z < 0, 'Raft must continue advancing downriver');
        }

        // Verify simulation completed all 120 frames with zero dropped physics steps
        assert.equal(raft.framesRendered, totalFrames);
        assert.ok(raft.position.z <= -29.9 && raft.position.z >= -30.1);

        // Check subsystem breaker states
        const health = registry.getHealthReport();
        assert.equal(health.subsystems.weather.state, BREAKER_STATE.OPEN, 'Weather should have tripped OPEN');
        assert.ok(health.subsystems.weather.totalBypasses > 100, 'Subsequent weather calls must be bypassed');
        assert.equal(health.subsystems.ghost_replay.state, BREAKER_STATE.CLOSED, 'Ghost replay had 0 faults');
    });
});
