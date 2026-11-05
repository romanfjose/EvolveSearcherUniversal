import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    QUANT_CONSTANTS,
    DELTA_FLAGS,
    INPUT_MASKS,
    ENTITY_FLAGS,
    quantizeCoord,
    dequantizeCoord,
    quantizeAngle,
    dequantizeAngle,
    quantizePosition,
    dequantizePosition,
    quantizeVelocity,
    dequantizeVelocity,
    eulerToQuaternion,
    quaternionToYawTilt,
    packInputs,
    unpackInputs,
    packEntityFlags,
    unpackEntityFlags,
    BinaryStateCodec,
    hermiteSpline1D,
    hermiteSplineDerivative1D,
    interpolateShortestAngle,
    HermiteRemoteInterpolator,
    NetStateCodec,
} from '../shared/net-codec.js';

describe('Multiplayer State Quantizer & Delta-Compression Codec Suite', () => {

    describe('1. Quantization Precision & Reversibility', () => {
        test('quantizes raft positions with centimeter precision (0.01m tolerance)', () => {
            const rawCoords = [0, 1.2345, -45.6789, 1250.999, -1500.001, 0.004, 0.006];
            for (const val of rawCoords) {
                const quantized = quantizeCoord(val);
                const recovered = dequantizeCoord(quantized);
                const error = Math.abs(recovered - val);
                assert.ok(error <= 0.01, `Position error ${error} exceeds centimeter precision for ${val}`);
            }
        });

        test('quantizes 3D position vector {x, y, z} within 1cm across all axes', () => {
            const pos = { x: 14.328, y: 0.254, z: -749.882 };
            const qPos = quantizePosition(pos);
            const recovered = dequantizePosition(qPos);
            assert.ok(Math.abs(recovered.x - pos.x) <= 0.01);
            assert.ok(Math.abs(recovered.y - pos.y) <= 0.01);
            assert.ok(Math.abs(recovered.z - pos.z) <= 0.01);
        });

        test('quantizes yaw and tilt angles with 0.1 degree precision', () => {
            // Radians corresponding to specific degree values
            const anglesDeg = [0, 45.15, -90.22, 179.95, -179.95, 360, 725.3];
            for (const deg of anglesDeg) {
                const rad = deg * (Math.PI / 180);
                const quantized = quantizeAngle(rad);
                const recoveredRad = dequantizeAngle(quantized);
                const recoveredDeg = recoveredRad * (180 / Math.PI);

                // Normalize deg to [-180, 180]
                let normalizedDeg = deg % 360;
                if (normalizedDeg > 180) normalizedDeg -= 360;
                if (normalizedDeg < -180) normalizedDeg += 360;

                const degError = Math.abs(recoveredDeg - normalizedDeg);
                assert.ok(degError <= 0.15, `Angle error ${degError} exceeds 0.1 deg precision for ${deg} deg`);
            }
        });

        test('quantizes velocities with cm/s (0.01 m/s) precision', () => {
            const vel = { x: 5.4321, y: -0.1234, z: -15.8765 };
            const qv = quantizeVelocity(vel);
            const recovered = dequantizeVelocity(qv);
            assert.ok(Math.abs(recovered.x - vel.x) <= 0.01);
            assert.ok(Math.abs(recovered.y - vel.y) <= 0.01);
            assert.ok(Math.abs(recovered.z - vel.z) <= 0.01);
        });

        test('handles NaN, Infinity, and missing values safely by falling back to zero', () => {
            assert.equal(quantizeCoord(NaN), 0);
            assert.equal(quantizeCoord(Infinity), 0);
            assert.equal(quantizeAngle(null), 0);
            assert.deepEqual(quantizePosition(null), { x: 0, y: 0, z: 0 });
            assert.deepEqual(quantizeVelocity(undefined), { x: 0, y: 0, z: 0 });
        });
    });

    describe('2. Input & Entity Flag Bitfield Packing', () => {
        test('packs and unpacks boolean inputs into a single compact byte', () => {
            const inputs = { w: true, a: false, s: false, d: true, space: true, attack: true, block: false, boost: false };
            const byte = packInputs(inputs);
            assert.ok(byte > 0 && byte <= 255);
            const unpacked = unpackInputs(byte);
            assert.deepEqual(unpacked, inputs);
        });

        test('packs and unpacks entity status flags into a single compact byte', () => {
            const flags = { isDead: false, airborne: true, blocking: true, attacking: false, feverMode: true };
            const byte = packEntityFlags(flags);
            assert.ok(byte > 0 && byte <= 255);
            const unpacked = unpackEntityFlags(byte);
            assert.deepEqual(unpacked, flags);
        });
    });

    describe('3. Binary Keyframe & Delta Frame Serialization', () => {
        const codec = new BinaryStateCodec();

        test('encodes and decodes full keyframe correctly', () => {
            const state = {
                seq: 101,
                time: 12500,
                position: { x: 8.75, y: 0.25, z: -350.20 },
                yaw: 1.25,
                tilt: -0.05,
                velocity: { x: 3.5, y: 0.0, z: -14.2 },
                health: 95,
                maxHealth: 100,
                inputs: { w: true, a: false, s: false, d: false, space: false, attack: false, block: false, boost: false },
                flags: { isDead: false, airborne: false, blocking: false, attacking: false, feverMode: true },
            };

            const encoded = codec.encodeFrame(state);
            assert.ok(encoded instanceof Uint8Array);
            assert.ok(encoded.byteLength <= 35, `Keyframe length ${encoded.byteLength} should be compact`);

            const decoded = codec.decodeFrame(encoded);
            assert.equal(decoded.isKeyframe, true);
            assert.equal(decoded.seq, state.seq);
            assert.ok(Math.abs(decoded.position.x - state.position.x) <= 0.01);
            assert.ok(Math.abs(decoded.position.y - state.position.y) <= 0.01);
            assert.ok(Math.abs(decoded.position.z - state.position.z) <= 0.01);
            assert.ok(Math.abs(decoded.yaw - state.yaw) <= 0.005);
            assert.ok(Math.abs(decoded.tilt - state.tilt) <= 0.005);
            assert.ok(Math.abs(decoded.velocity.x - state.velocity.x) <= 0.01);
            assert.ok(Math.abs(decoded.velocity.z - state.velocity.z) <= 0.01);
            assert.equal(decoded.health, state.health);
            assert.equal(decoded.maxHealth, state.maxHealth);
            assert.equal(decoded.inputs.w, true);
            assert.equal(decoded.flags.feverMode, true);
        });

        test('encodes and decodes delta frame against baseline with reduced byte size', () => {
            const baseline = {
                seq: 101,
                time: 12500,
                position: { x: 8.75, y: 0.25, z: -350.20 },
                yaw: 1.25,
                tilt: -0.05,
                velocity: { x: 3.5, y: 0.0, z: -14.2 },
                health: 95,
                maxHealth: 100,
            };

            const nextState = {
                seq: 102,
                time: 12550,
                position: { x: 8.92, y: 0.25, z: -350.91 }, // Small delta dx=+0.17, dz=-0.71
                yaw: 1.26,
                tilt: -0.05,
                velocity: { x: 3.4, y: 0.0, z: -14.2 },
                health: 95,
                maxHealth: 100,
            };

            const keyframeBytes = codec.encodeFrame(baseline);
            const deltaBytes = codec.encodeFrame(nextState, baseline);

            assert.ok(deltaBytes.byteLength < keyframeBytes.byteLength, 'Delta frame must be smaller than keyframe');

            const decodedDelta = codec.decodeFrame(deltaBytes, baseline);
            assert.equal(decodedDelta.isKeyframe, false);
            assert.equal(decodedDelta.seq, 102);
            assert.ok(Math.abs(decodedDelta.position.x - nextState.position.x) <= 0.01);
            assert.ok(Math.abs(decodedDelta.position.z - nextState.position.z) <= 0.01);
        });

        test('throws informative error on corrupted or truncated byte buffer', () => {
            assert.throws(() => codec.decodeFrame(new Uint8Array(1)), /truncated/);
            assert.throws(() => codec.decodeFrame(null), /invalid buffer/);
        });
    });

    describe('4. Socket.io Payload Compression Ratio (>65% Reduction Requirement)', () => {
        test('delivers >65% payload byte reduction across sustained player telemetry', () => {
            const session = new NetStateCodec();
            const playerId = 'player-viking-42';

            // Simulate 60 ticks (2 seconds at 30Hz) of active river paddling
            let x = 0;
            let y = 0.25;
            let z = 0;
            let yaw = 0;

            for (let i = 0; i < 60; i++) {
                z -= 0.5; // moving downriver at 15 m/s
                x += Math.sin(i * 0.1) * 0.05;
                yaw += 0.01;

                const state = {
                    seq: i + 1,
                    time: 1000 + i * 33,
                    position: { x, y, z },
                    quaternion: eulerToQuaternion(yaw, 0.02),
                    velocity: { x: 0.1, y: 0, z: -15.0 },
                    health: 100,
                    maxHealth: 100,
                    inputs: { w: true, a: false, s: false, d: false, space: false, attack: false, block: false },
                };

                const compressed = session.encodePlayerState(playerId, state);
                assert.ok(compressed.byteLength <= 32);

                const decoded = session.decodePlayerState(playerId, compressed);
                assert.ok(Math.abs(decoded.position.z - z) <= 0.01);
            }

            const reductionPercent = session.getCompressionReductionRatio();
            assert.ok(
                reductionPercent > 65.0,
                `Payload reduction (${reductionPercent.toFixed(2)}%) failed the >65% requirement!`
            );
            assert.ok(
                reductionPercent > 75.0,
                `Exceeds sovereign benchmark: achieved ${reductionPercent.toFixed(2)}% reduction!`
            );
        });

        test('supports base64 serialization for websocket string channels seamlessly', () => {
            const session = new NetStateCodec();
            const state = {
                seq: 1,
                time: 500,
                position: { x: -3.5, y: 1.2, z: -120.0 },
                yaw: -0.8,
                tilt: 0.1,
                velocity: { x: 0, y: -2.0, z: -10.0 },
            };

            const base64Str = session.encodePlayerState('p2', state, { asBase64: true });
            assert.equal(typeof base64Str, 'string');
            assert.ok(base64Str.length < 50);

            const decoded = session.decodePlayerState('p2', base64Str);
            assert.ok(Math.abs(decoded.position.x - state.position.x) <= 0.01);
            assert.ok(Math.abs(decoded.position.z - state.position.z) <= 0.01);
        });
    });

    describe('5. Cubic Hermite Spline Remote Player Interpolator', () => {
        test('hermiteSpline1D matches exact endpoints and computes smooth midpoints', () => {
            const p0 = 0.0;
            const v0 = 10.0; // m/s
            const p1 = 10.0;
            const v1 = 10.0; // m/s
            const dtSec = 1.0;

            // At t = 0 -> p = p0
            assert.equal(hermiteSpline1D(p0, v0, p1, v1, 0.0, dtSec), 0.0);
            // At t = 1 -> p = p1
            assert.equal(hermiteSpline1D(p0, v0, p1, v1, 1.0, dtSec), 10.0);
            // At t = 0.5 with constant velocity -> midpoint is exactly 5.0
            assert.equal(hermiteSpline1D(p0, v0, p1, v1, 0.5, dtSec), 5.0);

            // Derivative at endpoints matches velocities
            assert.ok(Math.abs(hermiteSplineDerivative1D(p0, v0, p1, v1, 0.0, dtSec) - 10.0) < 1e-4);
            assert.ok(Math.abs(hermiteSplineDerivative1D(p0, v0, p1, v1, 1.0, dtSec) - 10.0) < 1e-4);
        });

        test('interpolates remote player snapshots smoothly across time without rubber-banding', () => {
            const interpolator = new HermiteRemoteInterpolator({ interpolationDelayMs: 100 });

            // Feed 3 consecutive snapshots spaced 50ms apart
            interpolator.pushSnapshot({
                time: 1000,
                position: { x: 0, y: 0.25, z: 0 },
                velocity: { x: 0, y: 0, z: -10 },
                yaw: 0,
                tilt: 0,
            });
            interpolator.pushSnapshot({
                time: 1050,
                position: { x: 0, y: 0.25, z: -0.5 },
                velocity: { x: 0, y: 0, z: -10 },
                yaw: 0.1,
                tilt: 0,
            });
            interpolator.pushSnapshot({
                time: 1100,
                position: { x: 0, y: 0.25, z: -1.0 },
                velocity: { x: 0, y: 0, z: -10 },
                yaw: 0.2,
                tilt: 0,
            });

            // Target render time at 1125ms -> with 100ms delay, target time is 1025ms (halfway between s0 and s1)
            const evalHalf = interpolator.evaluate(1125);
            assert.ok(evalHalf !== null);
            assert.ok(Math.abs(evalHalf.position.z - (-0.25)) < 0.02, `Position z ${evalHalf.position.z} should be near -0.25`);
            assert.ok(Math.abs(evalHalf.velocity.z - (-10)) < 0.1, 'Velocity tangent preserved');
            assert.ok(Math.abs(evalHalf.yaw - 0.05) < 0.02, 'Yaw smoothly interpolated');
        });

        test('shortest-arc angular interpolation avoids 360-degree spin flips', () => {
            const angle0 = 3.10; // ~177.6 deg
            const angle1 = -3.10; // ~ -177.6 deg (only 0.08 rad diff across boundary)
            const mid = interpolateShortestAngle(angle0, angle1, 0.5);

            // Shortest arc passes through PI / -PI, not all the way through 0
            assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 0.15, 'Interpolated through wrap boundary cleanly');
        });

        test('gracefully handles empty buffer and extrapolates when network stalls', () => {
            const interpolator = new HermiteRemoteInterpolator({ interpolationDelayMs: 50 });
            assert.equal(interpolator.evaluate(1000), null);

            interpolator.pushSnapshot({
                time: 1000,
                position: { x: 10, y: 0.25, z: -50 },
                velocity: { x: 0, y: 0, z: -10 },
                yaw: 0,
                tilt: 0,
            });

            // Far into future beyond snapshot -> smoothly damped extrapolation without crashing
            const future = interpolator.evaluate(1500);
            assert.ok(future !== null);
            assert.ok(future.position.z < -50, 'Moved forward in direction of velocity');
            assert.ok(Number.isFinite(future.position.z));
            assert.ok(Number.isFinite(future.velocity.z));
        });
    });

    describe('6. Multi-Entity Coordination & Reset Lifecycle', () => {
        test('isolates baselines and interpolators per entity ID', () => {
            const codec = new NetStateCodec();
            const p1 = { seq: 1, position: { x: 1, y: 0, z: -10 }, velocity: { x: 0, y: 0, z: 0 } };
            const p2 = { seq: 1, position: { x: -5, y: 0, z: -20 }, velocity: { x: 0, y: 0, z: 0 } };

            codec.encodePlayerState('p1', p1);
            codec.encodePlayerState('p2', p2);

            assert.equal(codec.txBaselines.get('p1').position.x, 1);
            assert.equal(codec.txBaselines.get('p2').position.x, -5);

            codec.reset();
            assert.equal(codec.txBaselines.size, 0);
            assert.equal(codec.rxBaselines.size, 0);
            assert.equal(codec.interpolators.size, 0);
            assert.equal(codec.metrics.totalFramesEncoded, 0);
        });
    });

});
