import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    SANCTUARY_BEACON_CONFIG,
    isPositionInsidePlatform,
    isPlayerAtSanctuary,
    canRecallFallenCrewmate,
    computeRecallPositions,
    executeSanctuaryRecall,
} from '../shared/sanctuary-respawn-beacon.js';

describe('Sanctuary Shrine Teammate Respawn & Recall Beacon', () => {
    describe('Platform Inclusion & Docking Detection', () => {
        it('accurately tests circular/radial platform bounds', () => {
            const platform = { x: 10, z: -200, radius: 15 };
            assert.equal(isPositionInsidePlatform({ x: 10, z: -200 }, platform), true);
            assert.equal(isPositionInsidePlatform({ x: 20, z: -200 }, platform), true);
            assert.equal(isPositionInsidePlatform({ x: 25.1, z: -200 }, platform), false);
            assert.equal(isPositionInsidePlatform(null, platform), false);
            assert.equal(isPositionInsidePlatform({ x: 0, z: 0 }, null), false);
        });

        it('accurately tests rectangular / AABB platform bounds', () => {
            const platformAabb = { minX: -20, maxX: -5, minZ: -100, maxZ: -80 };
            assert.equal(isPositionInsidePlatform({ x: -10, z: -90 }, platformAabb), true);
            assert.equal(isPositionInsidePlatform({ x: -4, z: -90 }, platformAabb), false);

            const platformWidthDepth = { x: 0, z: -500, width: 20, length: 30 };
            assert.equal(isPositionInsidePlatform({ x: 5, z: -500 }, platformWidthDepth), true);
            assert.equal(isPositionInsidePlatform({ x: 11, z: -500 }, platformWidthDepth), false);
        });

        it('checks player docking state including Y tolerance and dead state', () => {
            const platform = { position: { x: 0, y: 1.0, z: -150 }, radius: 10 };
            const aliveRaftOnPlatform = {
                id: 'p1',
                isDead: false,
                position: { x: 2, y: 1.2, z: -152 },
            };
            assert.equal(isPlayerAtSanctuary(aliveRaftOnPlatform, platform), true);

            const deadRaft = { ...aliveRaftOnPlatform, isDead: true };
            assert.equal(isPlayerAtSanctuary(deadRaft, platform), false);

            const highAirborneRaft = {
                id: 'p1',
                isDead: false,
                position: { x: 2, y: 15.0, z: -152 },
            };
            assert.equal(isPlayerAtSanctuary(highAirborneRaft, platform), false);

            const explicitDockedFlag = {
                id: 'p1',
                isDead: false,
                isDocked: true,
                position: { x: 999, y: 999, z: 999 },
            };
            assert.equal(isPlayerAtSanctuary(explicitDockedFlag, platform), true);
        });
    });

    describe('canRecallFallenCrewmate eligibility checks', () => {
        const platform = { id: 'shrine_1', x: 0, z: -300, radius: 14 };

        it('returns true when an alive player is docked at an active platform', () => {
            const player = { id: 'p1', isDead: false, position: { x: 0, z: -300 } };
            assert.equal(canRecallFallenCrewmate(player, platform), true);
        });

        it('returns false if player is dead or far from platform', () => {
            const deadPlayer = { id: 'p1', isDead: true, position: { x: 0, z: -300 } };
            assert.equal(canRecallFallenCrewmate(deadPlayer, platform), false);

            const farPlayer = { id: 'p1', isDead: false, position: { x: 50, z: -300 } };
            assert.equal(canRecallFallenCrewmate(farPlayer, platform), false);
        });

        it('returns false if platform is depleted or inactive', () => {
            const player = { id: 'p1', isDead: false, position: { x: 0, z: -300 } };
            assert.equal(canRecallFallenCrewmate(player, { ...platform, isDepleted: true }), false);
            assert.equal(canRecallFallenCrewmate(player, { ...platform, active: false }), false);
        });

        it('enforces cooldown if configured', () => {
            const player = { id: 'p1', isDead: false, position: { x: 0, z: -300 } };
            const cooledPlatform = { ...platform, recallCooldownMs: 5000, lastRecallTime: 10000 };
            assert.equal(canRecallFallenCrewmate(player, cooledPlatform, { currentTime: 12000 }), false);
            assert.equal(canRecallFallenCrewmate(player, cooledPlatform, { currentTime: 16000 }), true);
        });
    });

    describe('computeRecallPositions raft placement', () => {
        it('returns safe, staggered, non-overlapping coordinates flanking the host', () => {
            const host = {
                id: 'p1',
                position: { x: 0, y: 0.5, z: -300 },
                yaw: 0, // facing north/downriver
            };

            const slots = computeRecallPositions(host, 3, { spacing: 3.5 });
            assert.equal(slots.length, 3);

            // Host is at x: 0. With yaw = 0, right vector is (+1, 0, 0)
            // Slot 0 (left): side = -1, tier = 1 => x = -3.5
            // Slot 1 (right): side = 1, tier = 1 => x = +3.5
            // Slot 2 (left): side = -1, tier = 2 => x = -7.0
            assert.equal(slots[0].x, -3.5);
            assert.equal(slots[1].x, 3.5);
            assert.equal(slots[2].x, -7.0);

            // None of the slots should share the exact same coordinates
            const coords = slots.map((s) => `${s.x},${s.z}`);
            assert.equal(new Set(coords).size, 3);
        });

        it('returns empty array when count <= 0', () => {
            assert.deepEqual(computeRecallPositions({ position: { x: 0, z: 0 } }, 0), []);
            assert.deepEqual(computeRecallPositions(null, -1), []);
        });
    });

    describe('executeSanctuaryRecall co-op respawn & regroup', () => {
        it('revives dead teammates directly beside the host raft with full health', () => {
            const platform = { id: 'shrine_act1', x: 0, z: -300, radius: 15 };
            const hostPlayer = {
                id: 'p1',
                isDead: false,
                health: 90,
                maxHealth: 100,
                position: { x: 0, y: 0.5, z: -300 },
                yaw: 0,
            };
            const deadTeammate = {
                id: 'p2',
                isDead: true,
                health: 0,
                maxHealth: 120,
                position: { x: 10, y: 0, z: -100 },
                velocity: { x: 5, y: 0, z: -15 },
            };

            const result = executeSanctuaryRecall([hostPlayer, deadTeammate], platform);

            assert.equal(result.success, true);
            assert.equal(result.revivedCount, 1);
            assert.equal(result.recalledCount, 0);

            // Teammate is revived and restored
            assert.equal(deadTeammate.isDead, false);
            assert.equal(deadTeammate.health, 120); // 100% of maxHealth
            assert.equal(deadTeammate.velocity.x, 0);
            assert.equal(deadTeammate.velocity.z, 0);

            // Teammate positioned beside host
            assert.ok(Math.abs(deadTeammate.position.z - hostPlayer.position.z) <= 5);
            assert.ok(Math.abs(deadTeammate.position.x - hostPlayer.position.x) > 0);

            // Check events
            const eventNames = result.events.map((e) => e.event);
            assert.ok(eventNames.includes('sanctuaryBeaconActivated'));
            assert.ok(eventNames.includes('playerRevived'));
            assert.ok(eventNames.includes('sanctuaryTeammateRespawned'));
        });

        it('regroups far separated alive teammates and heals them', () => {
            const platform = { id: 'shrine_act2', x: 0, z: -500, radius: 20 };
            const hostPlayer = {
                id: 'p1',
                isDead: false,
                health: 100,
                maxHealth: 100,
                position: { x: 0, y: 0.5, z: -500 },
            };
            const separatedTeammate = {
                id: 'p2',
                isDead: false,
                health: 40,
                maxHealth: 100,
                position: { x: 0, y: 0.5, z: -400 }, // 100m away
                velocity: { x: 0, y: 0, z: -10 },
            };
            const nearbyTeammate = {
                id: 'p3',
                isDead: false,
                health: 80,
                maxHealth: 100,
                position: { x: 4, y: 0.5, z: -502 }, // 4m away
            };

            const result = executeSanctuaryRecall(
                { p1: hostPlayer, p2: separatedTeammate, p3: nearbyTeammate },
                platform,
                { separationThreshold: 30.0 }
            );

            assert.equal(result.success, true);
            assert.equal(result.revivedCount, 0);
            assert.equal(result.recalledCount, 1);
            assert.equal(result.recalledPlayers[0].id, 'p2');

            // p2 received flat heal (+25)
            assert.equal(separatedTeammate.health, 65);
            assert.equal(separatedTeammate.velocity.z, 0);

            // p3 was nearby so untouched
            assert.equal(nearbyTeammate.health, 80);
            assert.equal(nearbyTeammate.position.z, -502);
        });

        it('handles simultaneously dead and separated teammates', () => {
            const platform = { id: 'shrine_act3', x: 0, z: -800, radius: 20 };
            const host = {
                id: 'p1',
                isDead: false,
                health: 100,
                maxHealth: 100,
                position: { x: 0, y: 0.5, z: -800 },
            };
            const deadPlayer = {
                id: 'p2',
                isDead: true,
                health: -20,
                maxHealth: 100,
                position: { x: 0, y: 0, z: -600 },
            };
            const lostPlayer = {
                id: 'p3',
                isDead: false,
                health: 50,
                maxHealth: 100,
                position: { x: -35, y: 0.5, z: -720 }, // >80m away
            };

            const result = executeSanctuaryRecall([host, deadPlayer, lostPlayer], platform);

            assert.equal(result.success, true);
            assert.equal(result.revivedCount, 1);
            assert.equal(result.recalledCount, 1);
            assert.equal(deadPlayer.isDead, false);
            assert.equal(deadPlayer.health, 100);
            assert.equal(lostPlayer.health, 75); // 50 + 25
        });

        it('returns failure gracefully when no player is at the sanctuary', () => {
            const platform = { id: 'shrine_act1', x: 0, z: -300, radius: 10 };
            const farPlayer1 = { id: 'p1', isDead: false, position: { x: 50, z: -100 } };
            const farPlayer2 = { id: 'p2', isDead: true, position: { x: 50, z: -100 } };

            const result = executeSanctuaryRecall([farPlayer1, farPlayer2], platform);
            assert.equal(result.success, false);
            assert.equal(result.revivedCount, 0);
            assert.equal(result.recalledCount, 0);
            assert.equal(result.events.length, 0);
        });

        it('handles null, undefined, and empty player inputs without throwing', () => {
            assert.equal(executeSanctuaryRecall(null, {}).success, false);
            assert.equal(executeSanctuaryRecall([], null).success, false);
            assert.equal(executeSanctuaryRecall({}, {}).success, false);
        });
    });
});
