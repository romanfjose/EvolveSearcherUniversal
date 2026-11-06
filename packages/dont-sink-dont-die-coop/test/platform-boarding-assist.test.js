import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    computeBoardingAssistForce,
    normalizePlatform,
    isPositionOnDeck,
    findTargetPlatform,
    getActiveInputMagnitude,
    BOARDING_ASSIST_CONFIG,
} from '../shared/platform-boarding-assist.js';

describe('Platform Boarding Assist & Soft-Docking Magnetism (shared/platform-boarding-assist.js)', () => {
    const mockPlatform = {
        id: 'plat_alpha',
        x: 0,
        y: 0.75,
        z: -200,
        width: 14,
        length: 20,
        // bounds: x: [-7, 7], z: [-210, -190]
        // ramp: z in [-190, -184]
    };

    describe('Platform Normalization & Geometry Queries', () => {
        it('normalizes raw platform specifications and sets defaults', () => {
            const raw = { x: 5, z: -100 };
            const plat = normalizePlatform(raw);

            assert.equal(plat.x, 5);
            assert.equal(plat.z, -100);
            assert.equal(plat.width, 12.0);
            assert.equal(plat.length, 16.0);
            assert.equal(plat.halfW, 6.0);
            assert.equal(plat.halfL, 8.0);
            assert.equal(plat.bounds.minX, -1.0);
            assert.equal(plat.bounds.maxX, 11.0);
            assert.equal(plat.bounds.minZ, -108.0);
            assert.equal(plat.bounds.maxZ, -92.0);
            assert.ok(plat.ramp);
        });

        it('detects when position is on platform deck', () => {
            const centerPos = { x: 0, y: 0.75, z: -200 };
            const edgePos = { x: 6.5, y: 0.75, z: -195 };
            const outsidePos = { x: 10, y: 0.75, z: -200 };

            assert.equal(isPositionOnDeck(centerPos, mockPlatform), true);
            assert.equal(isPositionOnDeck(edgePos, mockPlatform), true);
            assert.equal(isPositionOnDeck(outsidePos, mockPlatform), false);
            // Margin test
            assert.equal(isPositionOnDeck(edgePos, mockPlatform, 1.0), false);
        });

        it('finds the nearest target platform within search radius', () => {
            const platforms = [
                { id: 'p1', x: 0, z: -50 },
                { id: 'p2', x: 0, z: -150 },
                { id: 'p3', x: 0, z: -500 },
            ];

            const targetNearP2 = findTargetPlatform({ x: 1, z: -148 }, platforms, 20);
            assert.ok(targetNearP2);
            assert.equal(targetNearP2.id, 'p2');

            const targetOutOfRange = findTargetPlatform({ x: 0, z: -300 }, platforms, 20);
            assert.equal(targetOutOfRange, null);
        });
    });

    describe('Pilot Input Magnitude Evaluation', () => {
        it('computes magnitude for key inputs and analog sticks', () => {
            assert.equal(getActiveInputMagnitude(null), 0);
            assert.equal(getActiveInputMagnitude({}), 0);
            assert.equal(getActiveInputMagnitude({ w: true }), 1.0);
            assert.equal(getActiveInputMagnitude({ s: true }), 0.8);
            assert.equal(getActiveInputMagnitude({ a: true }), 0.5);
            assert.equal(getActiveInputMagnitude({ forward: 0.6 }), 0.6);
            assert.equal(getActiveInputMagnitude({ w: true, d: true }), 1.0);
        });
    });

    describe('computeBoardingAssistForce', () => {
        it('returns zero force when player is null, dead, or out of range', () => {
            const deadPlayer = { position: { x: 0, y: 0.75, z: -200 }, isDead: true };
            const resDead = computeBoardingAssistForce(deadPlayer, [mockPlatform]);
            assert.equal(resDead.assistActive, false);
            assert.equal(resDead.force.x, 0);

            const farPlayer = { position: { x: 100, y: 0.75, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
            const resFar = computeBoardingAssistForce(farPlayer, [mockPlatform]);
            assert.equal(resFar.assistActive, false);
            assert.equal(resFar.targetPlatform, null);
        });

        it('funnels coasting raft towards boarding ramp when entering upriver approach zone', () => {
            // Platform center z = -200, length = 20, maxZ = -190.
            // Raft is at z = -185 (ahead of ramp), x = 2.5 (slight lateral misalignment), moving downriver (vz = -5)
            const approachingPlayer = {
                position: { x: 2.5, y: 0, z: -185 },
                velocity: { x: 0.5, y: 0, z: -5.0 },
            };

            const res = computeBoardingAssistForce(approachingPlayer, [mockPlatform]);
            assert.equal(res.assistActive, true);
            assert.equal(res.state, 'ramp-guide');
            assert.equal(res.docked, false);

            // Should push towards center x = 0 (so negative fx.x) and pull downriver towards platform deck (negative fx.z)
            assert.ok(res.force.x < 0, `Expected negative fx.x to align laterally, got ${res.force.x}`);
            assert.ok(res.force.z < 0, `Expected negative fx.z downriver guidance, got ${res.force.z}`);
        });

        it('guides jumping airborne raft onto platform deck center (jump-assist)', () => {
            // Raft is airborne (y = 2.5) above water, jumping towards platform from z = -188, x = 3.0
            const jumpingPlayer = {
                position: { x: 3.0, y: 2.5, z: -188 },
                velocity: { x: 1.0, y: -2.0, z: -6.0 },
            };

            const res = computeBoardingAssistForce(jumpingPlayer, [mockPlatform]);
            assert.equal(res.assistActive, true);
            assert.equal(res.state, 'jump-assist');
            assert.equal(res.docked, false);

            // Force pulls toward platform center (x=0, z=-200)
            assert.ok(res.force.x < 0, `Airborne jump assist should bias x towards center, got ${res.force.x}`);
            assert.ok(res.force.z < 0, `Airborne jump assist should bias z towards center, got ${res.force.z}`);
        });

        it('holds raft steady on center of deck with soft-docking damping (deck-docking)', () => {
            // Raft has landed on deck near center (x = 0.5, z = -200.5) with slight residual sliding velocity
            const dockedPlayer = {
                position: { x: 0.5, y: 0.75, z: -200.5 },
                velocity: { x: 2.0, y: 0, z: -1.5 },
            };

            const res = computeBoardingAssistForce(dockedPlayer, [mockPlatform]);
            assert.equal(res.assistActive, true);
            assert.equal(res.state, 'deck-docking');
            assert.equal(res.docked, true);
            assert.ok(res.centeringRatio > 0.8, `Expected high centering ratio, got ${res.centeringRatio}`);

            // Damping must push opposite to velocity:
            // vel.x > 0 -> fx.x < 0
            // vel.z < 0 -> fx.z > 0
            assert.ok(res.force.x < 0, `Damping should oppose positive x velocity, got ${res.force.x}`);
            assert.ok(res.force.z > 0, `Damping should oppose negative z velocity, got ${res.force.z}`);
        });

        it('applies edge-guard repulsion when raft nears deck boundary to prevent slipping off', () => {
            // Deck x bounds: [-7, 7]. Raft is at x = 6.4 (very close to right edge), z = -200
            const slippingPlayer = {
                position: { x: 6.4, y: 0.75, z: -200 },
                velocity: { x: 1.2, y: 0, z: 0 },
            };

            const res = computeBoardingAssistForce(slippingPlayer, [mockPlatform]);
            assert.equal(res.assistActive, true);
            assert.equal(res.state, 'edge-guard');
            assert.equal(res.docked, true);

            // Repulsion must push inward toward -x away from edge
            assert.ok(res.force.x < -10, `Edge guard should push strongly inward, got ${res.force.x}`);
        });

        it('suppresses docking hold when pilot provides active input to disembark', () => {
            const dockedPlayer = {
                position: { x: 0, y: 0.75, z: -200 },
                velocity: { x: 0, y: 0, z: 0 },
            };

            // Player paddling forward with 'W' key
            const inputActive = { w: true };
            const inputIdle = {};

            // Offset slightly so spring force is non-zero
            dockedPlayer.position.x = 2.0;

            const resIdle = computeBoardingAssistForce(dockedPlayer, [mockPlatform], inputIdle);
            const resActive = computeBoardingAssistForce(dockedPlayer, [mockPlatform], inputActive);

            assert.equal(resIdle.state, 'deck-docking');
            assert.equal(resActive.state, 'deck-docking');
            // Active input should scale down the assist force so the pilot has agency
            assert.ok(Math.abs(resActive.force.x) < Math.abs(resIdle.force.x),
                `Active input should suppress hold force (${resActive.force.x} vs ${resIdle.force.x})`);
        });

        it('respects configuration overrides cleanly', () => {
            const customPlayer = {
                position: { x: 0, y: 0.75, z: -200 },
                velocity: { x: 1, y: 0, z: 1 },
            };

            const customConfig = {
                DECK_DOCKING_DAMPING: 20.0,
            };

            const res = computeBoardingAssistForce(customPlayer, [mockPlatform], {}, customConfig);
            // Damping force = -vel * 20 = -20
            assert.ok(Math.abs(res.force.x + 20) < 1.0, `Expected custom damping ~ -20, got ${res.force.x}`);
        });
    });
});
