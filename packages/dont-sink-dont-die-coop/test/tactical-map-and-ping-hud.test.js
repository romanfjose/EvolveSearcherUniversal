import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    TACTICAL_MAP_CONFIG,
    PING_TYPES,
    clamp,
    projectWorldToTacticalMap,
    computeCrewSeparation,
    computeTacticalMapMarkers,
    createTacticalRiverMapHud,
} from '../public/js/ui/tactical-map-and-ping-hud.js';

describe('Expanded Tactical River Map & Crew Separation Radar HUD', () => {

    describe('Configurations and Pure Constants', () => {
        it('exports correct 80m corridor dimensions and river bounds', () => {
            assert.equal(TACTICAL_MAP_CONFIG.CORRIDOR_WIDTH_METERS, 80);
            assert.equal(TACTICAL_MAP_CONFIG.CORRIDOR_HALF_WIDTH, 40);
            assert.equal(TACTICAL_MAP_CONFIG.RIVER_START_Z, 0);
            assert.equal(TACTICAL_MAP_CONFIG.RIVER_FINISH_Z, -1500);
            assert.equal(TACTICAL_MAP_CONFIG.TETHER_DISTANCE_SAFE, 15);
            assert.equal(TACTICAL_MAP_CONFIG.TETHER_DISTANCE_WARN, 40);
        });

        it('defines all 4 tactical ping types with icons, colors, and priorities', () => {
            const keys = ['DANGER', 'ASSIST', 'LOOT', 'GATHER'];
            for (const k of keys) {
                const pt = PING_TYPES[k];
                assert.ok(pt, `Missing ping type ${k}`);
                assert.ok(typeof pt.id === 'string');
                assert.ok(typeof pt.color === 'string');
                assert.ok(typeof pt.icon === 'string');
                assert.ok(pt.priority > 0);
            }
        });

        it('clamp handles normal numbers, edge cases, and NaN gracefully', () => {
            assert.equal(clamp(5, 0, 10), 5);
            assert.equal(clamp(-10, 0, 10), 0);
            assert.equal(clamp(15, 0, 10), 10);
            assert.equal(clamp(NaN, 0, 10), 0);
            assert.equal(clamp(null, 5, 20), 5);
        });
    });

    describe('Coordinate Projector (projectWorldToTacticalMap)', () => {
        it('projects lateral position across the 80m corridor (-40 to +40)', () => {
            const mapWidth = 200;
            const mapHeight = 300;

            // Left rock wall (x = -40) -> normX = 0, uiX = 0
            const left = projectWorldToTacticalMap({ x: -40, z: -100 }, { mapWidth, mapHeight });
            assert.equal(left.normX, 0);
            assert.equal(left.uiX, 0);
            assert.equal(left.inCorridor, true);

            // Center river channel (x = 0) -> normX = 0.5, uiX = 100
            const center = projectWorldToTacticalMap({ x: 0, z: -100 }, { mapWidth, mapHeight });
            assert.equal(center.normX, 0.5);
            assert.equal(center.uiX, 100);
            assert.equal(center.inCorridor, true);

            // Right rock wall (x = +40) -> normX = 1.0, uiX = 200
            const right = projectWorldToTacticalMap({ x: 40, z: -100 }, { mapWidth, mapHeight });
            assert.equal(right.normX, 1.0);
            assert.equal(right.uiX, 200);
            assert.equal(right.inCorridor, true);

            // Outside corridor
            const outside = projectWorldToTacticalMap({ x: 60, z: -100 }, { mapWidth, mapHeight });
            assert.equal(outside.normX, 1.0);
            assert.equal(outside.uiX, 200);
            assert.equal(outside.inCorridor, false);
        });

        it('projects longitudinal position in relative scrolling mode', () => {
            const anchorZ = -200; // Local player at -200m
            const lookahead = 160; // Top is -360m
            const lookbehind = 40; // Bottom is -160m
            const mapHeight = 200;

            // Player position (-200m) is 40m from bottom of a 200m window (80% from top, 20% from bottom)
            const playerProj = projectWorldToTacticalMap({ x: 0, z: -200 }, {
                anchorZ,
                lookahead,
                lookbehind,
                mapHeight,
                viewMode: 'relative',
            });
            assert.equal(playerProj.isVisible, true);
            // window = top (-360) to bottom (-160). z = -200 is at y = 160px (80% down)
            assert.equal(playerProj.uiY, 160);

            // Object ahead at z = -360m (at lookahead edge, top of screen -> uiY = 0)
            const aheadProj = projectWorldToTacticalMap({ x: 0, z: -360 }, {
                anchorZ,
                lookahead,
                lookbehind,
                mapHeight,
                viewMode: 'relative',
            });
            assert.equal(aheadProj.isVisible, true);
            assert.equal(aheadProj.uiY, 0);

            // Object behind at z = -160m (at lookbehind edge, bottom of screen -> uiY = 200)
            const behindProj = projectWorldToTacticalMap({ x: 0, z: -160 }, {
                anchorZ,
                lookahead,
                lookbehind,
                mapHeight,
                viewMode: 'relative',
            });
            assert.equal(behindProj.isVisible, true);
            assert.equal(behindProj.uiY, 200);

            // Object beyond lookahead (z = -400m) is marked isVisible = false
            const farAhead = projectWorldToTacticalMap({ x: 0, z: -400 }, {
                anchorZ,
                lookahead,
                lookbehind,
                mapHeight,
                viewMode: 'relative',
            });
            assert.equal(farAhead.isVisible, false);
        });

        it('projects longitudinal position in global course mode (0 to -1500m)', () => {
            const mapHeight = 300;
            const startProj = projectWorldToTacticalMap({ x: 0, z: 0 }, {
                viewMode: 'global',
                finishZ: -1500,
                mapHeight,
            });
            assert.equal(startProj.normY, 1.0); // bottom
            assert.equal(startProj.uiY, 300);

            const finishProj = projectWorldToTacticalMap({ x: 0, z: -1500 }, {
                viewMode: 'global',
                finishZ: -1500,
                mapHeight,
            });
            assert.equal(finishProj.normY, 0.0); // top
            assert.equal(finishProj.uiY, 0);

            const midProj = projectWorldToTacticalMap({ x: 0, z: -750 }, {
                viewMode: 'global',
                finishZ: -1500,
                mapHeight,
            });
            assert.equal(midProj.normY, 0.5);
            assert.equal(midProj.uiY, 150);
        });
    });

    describe('Crew Separation Radar (computeCrewSeparation)', () => {
        it('classifies nearby teammate within 15m as tethered (emerald)', () => {
            const local = { x: 0, z: -100 };
            const mate = { x: 8, z: -106 }; // dx = 8, dz = -6, dist = 10m ahead
            const sep = computeCrewSeparation(local, mate);

            assert.equal(sep.distance, 10);
            assert.equal(sep.status, 'tethered');
            assert.equal(sep.badgeText, 'TETHERED');
            assert.equal(sep.color, '#34d399');
            assert.equal(sep.direction, 'AHEAD');
            assert.equal(sep.calloutText, '10m AHEAD');
        });

        it('classifies teammate 15m-40m away as dispersed (amber)', () => {
            const local = { x: 0, z: -100 };
            const mate = { x: 15, z: -75 }; // dx = 15, dz = 25, dist = ~29.15m behind
            const sep = computeCrewSeparation(local, mate);

            assert.equal(sep.status, 'dispersed');
            assert.equal(sep.badgeText, 'DISPERSED');
            assert.equal(sep.color, '#fbbf24');
            assert.equal(sep.direction, 'BEHIND');
            assert.equal(sep.calloutText, '29m BEHIND');
        });

        it('classifies teammate beyond 40m as estranged (crimson)', () => {
            const local = { x: 0, z: -100 };
            const mate = { x: -30, z: -140 }; // dx = -30, dz = -40, dist = 50m ahead
            const sep = computeCrewSeparation(local, mate);

            assert.equal(sep.distance, 50);
            assert.equal(sep.status, 'estranged');
            assert.equal(sep.badgeText, 'ESTRANGED');
            assert.equal(sep.color, '#ef4444');
            assert.equal(sep.direction, 'AHEAD');
            assert.equal(sep.calloutText, '50m AHEAD');
        });

        it('handles level positions (dz = 0)', () => {
            const local = { x: 0, z: -100 };
            const mate = { x: 12, z: -100 };
            const sep = computeCrewSeparation(local, mate);

            assert.equal(sep.distance, 12);
            assert.equal(sep.direction, 'LEVEL');
            assert.equal(sep.calloutText, '12m LEVEL');
        });
    });

    describe('computeTacticalMapMarkers Evaluation', () => {
        it('evaluates all landmarks, teammates, and platforms properly', () => {
            const localPlayer = {
                id: 'p1',
                name: 'Captain Joe',
                position: { x: 0, z: -200 },
                yaw: 0.1,
                color: '#38bdf8',
            };

            const crewPlayers = [
                { id: 'p2', name: 'Bot Viking', position: { x: 10, z: -190 }, color: '#4ade80' },
                { id: 'p3', name: 'Bot Plague', position: { x: -20, z: -300 }, color: '#f43f5e' },
                { id: 'p4_dead', name: 'Ghost', position: { x: 0, z: -210 }, isDead: true },
            ];

            const platforms = [
                { id: 'plat1', x: 15, z: -260, width: 14, length: 18, name: 'Sanctuary Dock 1', isOccupied: false },
            ];

            const islands = [
                { id: 'island1', x: 0, z: -280, radius: 10, leftChannelWidth: 25, rightChannelWidth: 25 },
            ];

            const harborBounds = { minX: -35, maxX: 35, minZ: -250, maxZ: -150, name: 'Citadel Basin' };

            const pings = [
                { id: 'ping1', type: 'danger', x: 5, z: -220, timestamp: 1000, senderId: 'p1' },
            ];

            const markers = computeTacticalMapMarkers({
                localPlayer,
                crewPlayers,
                platforms,
                islands,
                harborBounds,
                pings,
                now: 1500, // age 500ms
            });

            // Local marker
            assert.equal(markers.local.id, 'p1');
            assert.equal(markers.local.isLocal, true);

            // Crew markers: dead player ignored
            assert.equal(markers.crew.length, 2);
            assert.equal(markers.crew[0].id, 'p2');
            assert.equal(markers.crew[0].separation.status, 'tethered');

            assert.equal(markers.crew[1].id, 'p3');
            assert.equal(markers.crew[1].separation.status, 'estranged');

            // Platforms
            assert.equal(markers.platforms.length, 1);
            assert.equal(markers.platforms[0].id, 'plat1');
            assert.equal(markers.platforms[0].isSafeZone, true);

            // Islands
            assert.equal(markers.islands.length, 1);
            assert.equal(markers.islands[0].id, 'island1');
            assert.equal(markers.islands[0].radius, 10);

            // Harbor calm basin
            assert.ok(markers.harbor);
            assert.equal(markers.harbor.name, 'Citadel Basin');
            assert.equal(markers.harbor.inBasin, true); // Local player at (0, -200) is inside [-250, -150]

            // Pings
            assert.equal(markers.pings.length, 1);
            assert.equal(markers.pings[0].type, 'danger');
            assert.ok(markers.pings[0].alpha > 0);
            assert.ok(markers.pings[0].pulseScale > 1);
        });

        it('discards expired pings older than PING_DURATION_MS', () => {
            const localPlayer = { position: { x: 0, z: 0 } };
            const pings = [
                { id: 'expired_ping', type: 'loot', x: 0, z: -50, timestamp: 1000 },
            ];

            const markers = computeTacticalMapMarkers({
                localPlayer,
                pings,
                now: 6000, // 5000ms later (> 4000ms duration)
            });

            assert.equal(markers.pings.length, 0);
        });
    });

    describe('Component Lifecycle & UI Controller (createTacticalRiverMapHud)', () => {
        it('instantiates controller cleanly in headless environment', () => {
            const hud = createTacticalRiverMapHud();
            assert.equal(typeof hud.update, 'function');
            assert.equal(typeof hud.spawnPing, 'function');
            assert.equal(typeof hud.setSelectedPingType, 'function');
            assert.equal(typeof hud.getSelectedPingType, 'function');
            assert.equal(typeof hud.setVisible, 'function');
            assert.equal(typeof hud.isVisible, 'function');
            assert.equal(typeof hud.dispose, 'function');

            assert.equal(hud.isVisible(), true);
            hud.setVisible(false);
            assert.equal(hud.isVisible(), false);

            hud.dispose();
        });

        it('spawns pings and triggers onPing callback', () => {
            let capturedPing = null;
            const hud = createTacticalRiverMapHud({
                options: {
                    onPing: (p) => {
                        capturedPing = p;
                    },
                },
            });

            const spawned = hud.spawnPing({
                type: 'assist',
                x: 12,
                z: -140,
                senderId: 'hero_1',
            });

            assert.ok(spawned);
            assert.equal(spawned.type, 'assist');
            assert.equal(spawned.x, 12);
            assert.equal(spawned.z, -140);

            assert.ok(capturedPing);
            assert.equal(capturedPing.id, spawned.id);

            hud.dispose();
        });

        it('updates tactical state and retains latest markers', () => {
            const hud = createTacticalRiverMapHud();

            const markers = hud.update({
                localPlayer: { position: { x: -5, z: -350 } },
                crewPlayers: [{ id: 'teammate_1', position: { x: 5, z: -340 } }],
            });

            assert.ok(markers);
            assert.equal(markers.local.x, -5);
            assert.equal(markers.local.z, -350);
            assert.equal(markers.crew.length, 1);

            assert.equal(hud.getMarkers(), markers);
            hud.dispose();
        });

        it('changes selected ping type cleanly', () => {
            const hud = createTacticalRiverMapHud();
            assert.equal(hud.getSelectedPingType(), 'danger');

            hud.setSelectedPingType('loot');
            assert.equal(hud.getSelectedPingType(), 'loot');

            hud.dispose();
        });
    });

});
