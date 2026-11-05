import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    CompactRingBuffer,
    calculatePercentiles,
    EngineTelemetry,
    engineTelemetry,
    installGlobalDebugBridge,
    TELEMETRY_CONSTANTS,
    SUBSYSTEM_STATUS,
    ENGINE_HEALTH_STATUS,
} from '../shared/engine-telemetry.js';

describe('Sovereign Telemetry & Engine Health Aggregator', () => {

    describe('CompactRingBuffer', () => {
        it('initializes with specified capacity and empty state', () => {
            const ring = new CompactRingBuffer(5);
            assert.equal(ring.capacity, 5);
            assert.equal(ring.size, 0);
            assert.equal(ring.totalSampled, 0);
            assert.deepEqual(ring.toArray(), []);
        });

        it('pushes samples sequentially up to capacity', () => {
            const ring = new CompactRingBuffer(3);
            ring.push(10);
            ring.push(20);
            assert.equal(ring.size, 2);
            assert.equal(ring.totalSampled, 2);
            assert.deepEqual(ring.toArray(), [10, 20]);
        });

        it('overwrites oldest samples in circular FIFO order when capacity is exceeded', () => {
            const ring = new CompactRingBuffer(3);
            ring.push(1);
            ring.push(2);
            ring.push(3);
            assert.deepEqual(ring.toArray(), [1, 2, 3]);

            ring.push(4);
            assert.equal(ring.size, 3);
            assert.equal(ring.totalSampled, 4);
            assert.deepEqual(ring.toArray(), [2, 3, 4]);

            ring.push(5);
            assert.deepEqual(ring.toArray(), [3, 4, 5]);
        });

        it('safely ignores NaN, Infinity, -Infinity, and non-numeric inputs', () => {
            const ring = new CompactRingBuffer(5);
            ring.push(10);
            ring.push(NaN);
            ring.push(Infinity);
            ring.push(-Infinity);
            ring.push('corrupted');
            ring.push(20);

            assert.equal(ring.size, 2);
            assert.deepEqual(ring.toArray(), [10, 20]);
        });

        it('clears all samples cleanly', () => {
            const ring = new CompactRingBuffer(4);
            ring.push(1);
            ring.push(2);
            ring.clear();
            assert.equal(ring.size, 0);
            assert.equal(ring.totalSampled, 0);
            assert.deepEqual(ring.toArray(), []);
        });
    });

    describe('calculatePercentiles', () => {
        it('returns zeroes on empty or invalid inputs', () => {
            assert.deepEqual(calculatePercentiles([]), {
                count: 0,
                min: 0,
                max: 0,
                avg: 0,
                p50: 0,
                p95: 0,
                p99: 0,
            });
            assert.deepEqual(calculatePercentiles(null), {
                count: 0,
                min: 0,
                max: 0,
                avg: 0,
                p50: 0,
                p95: 0,
                p99: 0,
            });
        });

        it('computes accurate min, max, avg, p50, p95, and p99 on standard distribution', () => {
            // Generate 100 samples from 1 to 100
            const samples = Array.from({ length: 100 }, (_, i) => i + 1);
            const stats = calculatePercentiles(samples);

            assert.equal(stats.count, 100);
            assert.equal(stats.min, 1);
            assert.equal(stats.max, 100);
            assert.equal(stats.avg, 50.5);
            assert.equal(stats.p50, 50.5);
            assert.equal(stats.p95, 95.05);
            assert.equal(stats.p99, 99.01);
        });

        it('handles single sample gracefully', () => {
            const stats = calculatePercentiles([16.67]);
            assert.equal(stats.count, 1);
            assert.equal(stats.min, 16.67);
            assert.equal(stats.max, 16.67);
            assert.equal(stats.avg, 16.67);
            assert.equal(stats.p50, 16.67);
            assert.equal(stats.p95, 16.67);
            assert.equal(stats.p99, 16.67);
        });
    });

    describe('EngineTelemetry core functionality', () => {
        let telemetry;

        beforeEach(() => {
            telemetry = new EngineTelemetry({ capacity: 60 });
        });

        it('records frame times and physics step durations correctly', () => {
            telemetry.recordFrameTime(16.6);
            telemetry.recordFrameTime(16.7);
            telemetry.recordFrameTime(16.5);

            telemetry.recordPhysicsStep(8.2);
            telemetry.recordPhysicsStep(8.5);

            telemetry.recordMeshCount(140);
            telemetry.recordMeshCount(145);

            const report = telemetry.getHealthReport();

            assert.equal(report.framerate.samplesCount, 3);
            assert.ok(report.framerate.fps.avg >= 59.0 && report.framerate.fps.avg <= 61.0);
            assert.equal(report.framerate.budgetOk, true);

            assert.equal(report.physics.samplesCount, 2);
            assert.ok(report.physics.stepDurationsMs.avg > 8.0 && report.physics.stepDurationsMs.avg < 8.5);
            assert.equal(report.physics.budgetOk, true);

            assert.equal(report.meshes.samplesCount, 2);
            assert.equal(report.meshes.activeCounts.max, 145);
        });

        it('tracks subsystem breaker states and counts trips', () => {
            telemetry.recordSubsystemState('weather', { status: SUBSYSTEM_STATUS.HEALTHY });
            telemetry.recordSubsystemState('audio', { status: SUBSYSTEM_STATUS.DEGRADED, reason: 'High polyphony' });

            let report = telemetry.getHealthReport();
            assert.equal(report.subsystems.length, 2);

            const audioSub = report.subsystems.find((s) => s.name === 'audio');
            assert.equal(audioSub.status, SUBSYSTEM_STATUS.DEGRADED);
            assert.equal(audioSub.lastTripReason, 'High polyphony');

            // Trip a subsystem
            telemetry.recordSubsystemState('minimap', { tripped: true, reason: 'WebGL context lost' });
            report = telemetry.getHealthReport();

            const minimapSub = report.subsystems.find((s) => s.name === 'minimap');
            assert.equal(minimapSub.status, SUBSYSTEM_STATUS.TRIPPED);
            assert.equal(minimapSub.tripsCount, 1);
            assert.equal(minimapSub.lastTripReason, 'WebGL context lost');
            assert.ok(minimapSub.lastTripTimestamp > 0);
        });

        it('evaluates overall health status dynamically', () => {
            // Pristine 60 FPS -> OPTIMAL
            for (let i = 0; i < 30; i++) {
                telemetry.recordFrameTime(16.67);
            }
            assert.equal(telemetry.evaluateOverallHealth(), ENGINE_HEALTH_STATUS.OPTIMAL);

            // Framerate dips to ~40 FPS (dt = 25ms) -> DEGRADED
            for (let i = 0; i < 30; i++) {
                telemetry.recordFrameTime(25.0);
            }
            assert.equal(telemetry.evaluateOverallHealth(), ENGINE_HEALTH_STATUS.DEGRADED);

            // Breaker trips 2 subsystems -> CRITICAL
            telemetry.recordSubsystemState('subA', { tripped: true, reason: 'Out of memory' });
            telemetry.recordSubsystemState('subB', { tripped: true, reason: 'Render crash' });
            assert.equal(telemetry.evaluateOverallHealth(), ENGINE_HEALTH_STATUS.CRITICAL);
        });

        it('tracks memory watermarks and heap growth', () => {
            telemetry.recordMemoryWatermark(50 * 1024 * 1024); // 50 MB baseline
            telemetry.recordMemoryWatermark(75 * 1024 * 1024); // 75 MB peak
            telemetry.recordMemoryWatermark(60 * 1024 * 1024); // 60 MB current

            const report = telemetry.getHealthReport();
            assert.equal(report.memory.baselineBytes, 50 * 1024 * 1024);
            assert.equal(report.memory.peakBytes, 75 * 1024 * 1024);
            assert.equal(report.memory.currentBytes, 60 * 1024 * 1024);
            assert.equal(report.memory.growthBytes, 10 * 1024 * 1024);
            assert.ok(report.memory.currentFormatted.includes('60.0 MB'));
        });

        it('supports custom debug counters and flags', () => {
            telemetry.setCounter('audioVoices', 8);
            telemetry.incrementCounter('audioVoices', 2);
            telemetry.incrementCounter('droppedFrames');
            telemetry.setFlag('isInvincible', true);

            const report = telemetry.getHealthReport();
            assert.equal(report.customCounters.audioVoices, 10);
            assert.equal(report.customCounters.droppedFrames, 1);
            assert.equal(report.customFlags.isInvincible, true);
        });

        it('resets cleanly without breaking subsequent recordings', () => {
            telemetry.recordFrameTime(20);
            telemetry.recordSubsystemState('vfx', { tripped: true });
            telemetry.reset();

            const report = telemetry.getHealthReport();
            assert.equal(report.framerate.samplesCount, 0);
            assert.equal(report.subsystems.length, 0);
            assert.equal(report.memory.currentBytes, 0);
        });
    });

    describe('Global Debug Bridge (window.__DSDD_DEBUG__)', () => {
        it('installs getHealthReport() and helper bridges onto window or mock target', () => {
            const mockWindow = {};
            const localTelemetry = new EngineTelemetry();

            const bridge = installGlobalDebugBridge(mockWindow, localTelemetry);
            assert.ok(mockWindow.__DSDD_DEBUG__);
            assert.equal(typeof mockWindow.__DSDD_DEBUG__.getHealthReport, 'function');

            mockWindow.__DSDD_DEBUG__.recordFrameTime(16.67);
            mockWindow.__DSDD_DEBUG__.recordPhysicsStep(5.5);
            mockWindow.__DSDD_DEBUG__.recordMeshCount(88);
            mockWindow.__DSDD_DEBUG__.recordSubsystemState('audio-scheduler', { status: SUBSYSTEM_STATUS.HEALTHY });
            mockWindow.__DSDD_DEBUG__.recordMemoryWatermark(32 * 1024 * 1024);

            const health = mockWindow.__DSDD_DEBUG__.getHealthReport();
            assert.equal(health.framerate.samplesCount, 1);
            assert.equal(health.physics.samplesCount, 1);
            assert.equal(health.meshes.samplesCount, 1);
            assert.equal(health.subsystems[0].name, 'audio-scheduler');
            assert.ok(health.summary.includes('[HEALTH:'));
        });

        it('uses default singleton if no custom instance provided', () => {
            const mockWindow = {};
            engineTelemetry.reset();
            installGlobalDebugBridge(mockWindow);

            mockWindow.__DSDD_DEBUG__.recordFrameTime(16.67);
            const report = mockWindow.__DSDD_DEBUG__.getHealthReport();
            assert.equal(report.framerate.samplesCount, 1);
            engineTelemetry.reset();
        });
    });
});
