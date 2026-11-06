import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    initTreePhysics,
    applyTreeImpulse,
    stepTreePhysics,
    checkTreeEntityBrush,
    TREE_PHYSICS_CONFIG,
} from '../public/js/world/biomes-mesh.js';

import {
    initPlankPhysics,
    triggerPlankDip,
    stepPlankPhysics,
    PLANK_PHYSICS_CONFIG,
} from '../public/js/world/island-mesh.js';

import {
    createAAANpcMesh,
    updateAAANpcDynamics,
} from '../public/js/aaa-visuals.js';

import { createSfx } from '../public/js/hud.js';

describe('Videogame Helmet 06 — Physical World Believability & Immersion', () => {
    describe('biomes-mesh: Riverbank tree & foliage shudder/sway dynamics', () => {
        it('initializes tree physics configuration cleanly', () => {
            const mockTreeGroup = {
                userData: {},
                position: { x: 30, y: 0, z: -100 },
                rotation: { x: 0, y: 0, z: 0 },
            };
            initTreePhysics(mockTreeGroup);
            assert.ok(mockTreeGroup.userData.treePhysics);
            assert.equal(mockTreeGroup.userData.treePhysics.isResting, true);
            assert.equal(mockTreeGroup.userData.treePhysics.config.springStiffness, TREE_PHYSICS_CONFIG.springStiffness);
        });

        it('applies physical impulse in direction of impact and initiates shudder', () => {
            const mockTree = {
                userData: {},
                position: { x: 30, y: 0, z: -100 },
                rotation: { x: 0, y: 0, z: 0 },
            };
            initTreePhysics(mockTree);
            applyTreeImpulse(mockTree, 1.0, 0.0, 1.2, 500);

            const phys = mockTree.userData.treePhysics;
            assert.equal(phys.isResting, false);
            assert.ok(phys.velX > 0, 'Velocity in X should be positive along impulse dir');
            assert.ok(phys.shudderAmp > 0, 'Shudder amplitude should be greater than zero');
            assert.equal(phys.lastImpulseTime, 500);
        });

        it('stepTreePhysics simulates spring-damper restorative oscillation towards rest', () => {
            const mockTree = {
                userData: {},
                position: { x: 30, y: 0, z: -100 },
                rotation: { x: 0, y: 0, z: 0 },
            };
            initTreePhysics(mockTree);
            applyTreeImpulse(mockTree, 0.5, 0.5, 1.0, 0);

            // Step for 1 second of simulation
            for (let i = 0; i < 60; i++) {
                stepTreePhysics(mockTree, 0.016, i * 0.016);
            }

            // Step further until damped to rest
            for (let i = 0; i < 200; i++) {
                stepTreePhysics(mockTree, 0.016, 1.0 + i * 0.016);
            }

            const phys = mockTree.userData.treePhysics;
            assert.equal(phys.isResting, true, 'Tree should settle to rest state after damping');
            assert.equal(phys.shudderAmp, 0);
        });

        it('checkTreeEntityBrush triggers tree reaction on close proximity brush', () => {
            const mockMesh = {
                userData: {},
                position: { x: 25, y: 0, z: -80 },
                rotation: { x: 0, y: 0, z: 0 },
            };
            const treeObstacle = {
                mesh: mockMesh,
                x: 25,
                z: -80,
                radius: 0.85,
            };
            const movingEntity = {
                position: { x: 25.4, z: -80.6 }, // Within brush threshold
                velocity: { x: 2.0, z: -4.0 },
            };

            const brushed = checkTreeEntityBrush(treeObstacle, movingEntity, 1000);
            assert.equal(brushed, true, 'Should detect entity brush and apply impulse');
            assert.equal(mockMesh.userData.treePhysics.isResting, false);
        });
    });

    describe('island-mesh: Wooden dock plank flex, dip & creak audio physics', () => {
        it('initializes plank physics and sets resting state', () => {
            const mockPlank = {
                userData: { baseY: 1.05 },
                position: { x: -12, y: 1.05, z: -42 },
                rotation: { x: 0, y: 0, z: 0 },
            };
            initPlankPhysics(mockPlank);
            assert.ok(mockPlank.userData.plankPhysics);
            assert.equal(mockPlank.userData.plankPhysics.isResting, true);
        });

        it('triggerPlankDip depresses vertical position and triggers wood creak audio', () => {
            const mockPlank = {
                userData: {
                    baseY: 1.05,
                    plankBoards: [
                        { position: { y: 0, z: -2 }, userData: { baseY: 0, localDip: 0 } },
                        { position: { y: 0, z: 0 }, userData: { baseY: 0, localDip: 0 } },
                        { position: { y: 0, z: 2 }, userData: { baseY: 0, localDip: 0 } },
                    ],
                },
                position: { x: -12, y: 1.05, z: -42 },
                rotation: { x: 0, y: 0, z: 0 },
            };
            initPlankPhysics(mockPlank);

            let creakTriggered = false;
            let creakVolume = 0;
            triggerPlankDip(
                mockPlank,
                { relX: 0.5, relZ: 1.2, impactSpeed: 3.5, isMonster: false },
                100,
                (vol) => {
                    creakTriggered = true;
                    creakVolume = vol;
                }
            );

            assert.equal(mockPlank.userData.plankPhysics.isResting, false);
            assert.ok(mockPlank.userData.plankPhysics.velY < 0, 'Downwards vertical dip velocity applied');
            assert.equal(creakTriggered, true, 'Creak audio callback should fire');
            assert.ok(creakVolume >= 0.5, 'Heavy landing should produce audible creak volume');
            assert.ok(mockPlank.userData.plankBoards[2].userData.localDip < 0, 'Nearest board should have local dip');
        });

        it('stepPlankPhysics oscillates and restores equilibrium at baseY', () => {
            const mockPlank = {
                userData: { baseY: 1.05 },
                position: { x: -12, y: 1.05, z: -42 },
                rotation: { x: 0, y: 0, z: 0 },
            };
            initPlankPhysics(mockPlank);
            triggerPlankDip(mockPlank, { relX: 0, relZ: 0, impactSpeed: 2.0 }, 0);

            // Step simulation for 0.05s - position should be lower than baseY
            stepPlankPhysics(mockPlank, 0.05);
            assert.ok(mockPlank.position.y < 1.05, 'Plank should visibly dip below baseline');

            // Step until settled
            for (let i = 0; i < 180; i++) {
                stepPlankPhysics(mockPlank, 0.016);
            }

            assert.equal(mockPlank.userData.plankPhysics.isResting, true);
            assert.equal(mockPlank.position.y, 1.05);
            assert.equal(mockPlank.rotation.x, 0);
            assert.equal(mockPlank.rotation.z, 0);
        });
    });

    describe('Harbor City: Pedestrian flinch/panic & Police recoil dynamics', () => {
        it('createAAANpcMesh sets up articulated rigs for pedestrians and police', () => {
            const ped = createAAANpcMesh('pedestrian');
            assert.equal(ped.userData.type, 'pedestrian');
            assert.ok(ped.userData.leftArm && ped.userData.rightArm, 'Pedestrian has articulated arms');
            assert.ok(ped.userData.head && ped.userData.torso, 'Pedestrian has head and torso');

            const cop = createAAANpcMesh('police');
            assert.equal(cop.userData.type, 'police');
            assert.ok(cop.userData.gunArm && cop.userData.supportArm, 'Police has two-handed gun grip');
            assert.ok(cop.userData.muzzleFlash, 'Police has muzzle flash');
        });

        it('updateAAANpcDynamics causes pedestrians to flinch, duck, and cower during alien panic', () => {
            const ped = createAAANpcMesh('pedestrian');
            const initialHeadY = ped.userData.head.position.y;

            // Update with panic active
            for (let i = 0; i < 30; i++) {
                updateAAANpcDynamics(ped, { type: 'pedestrian', isPanic: true, dt: 0.016, time: i * 0.016 });
            }

            assert.ok(ped.userData.panicLevel > 0.8, 'Panic level should ramp up');
            assert.ok(ped.userData.head.position.y < initialHeadY, 'Head should duck during panic');
            assert.ok(ped.userData.leftArm.rotation.x < -1.0, 'Arms should raise overhead in panic');

            // Update with panic cleared -> returns to neutral
            for (let i = 0; i < 60; i++) {
                updateAAANpcDynamics(ped, { type: 'pedestrian', isPanic: false, dt: 0.016, time: 1.0 + i * 0.016 });
            }

            assert.ok(ped.userData.panicLevel < 0.05, 'Panic should decay to 0');
            assert.equal(ped.userData.head.position.y, initialHeadY);
        });

        it('updateAAANpcDynamics causes police officers to kick back on muzzle-flash recoil', () => {
            const cop = createAAANpcMesh('police');
            const baseRotX = cop.userData.baseGunArmRotX;

            // Trigger recoil
            updateAAANpcDynamics(cop, { type: 'police', recoilTrigger: true, dt: 0.016, time: 0 });
            assert.equal(cop.userData.recoilKick, 1.0);
            assert.ok(cop.userData.gunArm.rotation.x < baseRotX, 'Recoil should kick arm upwards');

            // Recover from recoil
            for (let i = 0; i < 30; i++) {
                updateAAANpcDynamics(cop, { type: 'police', recoilTrigger: false, dt: 0.016, time: i * 0.016 });
            }

            assert.equal(cop.userData.recoilKick, 0);
            assert.equal(cop.userData.gunArm.rotation.x, baseRotX);
        });
    });

    describe('hud: Wood creak audio engine implementation', () => {
        it('createSfx exposes diegetic creak method adhering to audio architecture', () => {
            const sfx = createSfx();
            assert.equal(typeof sfx.creak, 'function');
            // Calling without audio context should safely execute without throws
            assert.doesNotThrow(() => sfx.creak(1.0));
            assert.doesNotThrow(() => sfx.creak(0.5));
        });
    });
});
