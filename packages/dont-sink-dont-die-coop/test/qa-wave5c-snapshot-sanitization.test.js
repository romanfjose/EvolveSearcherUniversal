import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    SNAPSHOT_SANITIZER_LIMITS,
    sanitizeCoins,
    sanitizeHealth,
    sanitizeUpgrades,
    sanitizePosition,
    sanitizeVelocity,
    sanitizeQuaternion,
    sanitizePlayerSnapshot,
    sanitizeNetworkSnapshot,
    auditSnapshotIntegrity,
    applySanitizedSnapshotToHUD,
    applySanitizedSnapshotToThreeObject,
} from '../shared/qa-snapshot-sanitizer.js';

import {
    sanitizeObject3DTree,
    findCorruptedKeys,
} from '../shared/scene-watchdog.js';

describe('Helmet 02 QA Breaker: Multiplayer Snapshot Sanitization & Defensive Invariant Shield', () => {

    describe('1. Coin Sanitization & Currency Corruption Shield', () => {
        it('safely sanitizes undefined and null coins to 0 fallback', () => {
            assert.equal(sanitizeCoins(undefined), 0);
            assert.equal(sanitizeCoins(null), 0);
            assert.equal(sanitizeCoins(undefined, 50), 50);
            assert.equal(sanitizeCoins(null, 25), 25);
        });

        it('safely sanitizes NaN, Infinity, -Infinity, and invalid string coins', () => {
            assert.equal(sanitizeCoins(NaN), 0);
            assert.equal(sanitizeCoins(Infinity), 0);
            assert.equal(sanitizeCoins(-Infinity), 0);
            assert.equal(sanitizeCoins('corrupted_coin_string'), 0);
            assert.equal(sanitizeCoins({}), 0);
            assert.equal(sanitizeCoins([100]), 100); // coerced array of single number
            assert.equal(sanitizeCoins(['bad']), 0);
        });

        it('clamps negative coins strictly to zero floor', () => {
            assert.equal(sanitizeCoins(-1), 0);
            assert.equal(sanitizeCoins(-99999), 0);
            assert.equal(sanitizeCoins(-0.5), 0);
        });

        it('floors fractional float coins to deterministic integer values', () => {
            assert.equal(sanitizeCoins(42.99), 42);
            assert.equal(sanitizeCoins('88.4'), 88);
            assert.equal(sanitizeCoins(0.0001), 0);
        });

        it('clamps runaway overflow coins to MAX_COINS boundary', () => {
            assert.equal(sanitizeCoins(10000000), SNAPSHOT_SANITIZER_LIMITS.MAX_COINS);
            assert.equal(sanitizeCoins(SNAPSHOT_SANITIZER_LIMITS.MAX_COINS), SNAPSHOT_SANITIZER_LIMITS.MAX_COINS);
        });
    });

    describe('2. Health & Hull Integrity Sanitization', () => {
        it('heals undefined, NaN, and corrupt maxHealth to default baseline', () => {
            const h1 = sanitizeHealth(undefined, undefined);
            assert.equal(h1.health, 100);
            assert.equal(h1.maxHealth, 100);

            const h2 = sanitizeHealth(NaN, NaN);
            assert.equal(h2.health, 100);
            assert.equal(h2.maxHealth, 100);
        });

        it('clamps current health between 0 and maxHealth', () => {
            const low = sanitizeHealth(-50, 150);
            assert.equal(low.health, 0);
            assert.equal(low.maxHealth, 150);

            const high = sanitizeHealth(999, 150);
            assert.equal(high.health, 150);
            assert.equal(high.maxHealth, 150);
        });

        it('clamps absurd maxHealth values to MAX_HEALTH limit', () => {
            const maxed = sanitizeHealth(100000, 100000);
            assert.equal(maxed.health, SNAPSHOT_SANITIZER_LIMITS.MAX_HEALTH);
            assert.equal(maxed.maxHealth, SNAPSHOT_SANITIZER_LIMITS.MAX_HEALTH);
        });
    });

    describe('3. Transform, Kinematic & 3D Coordinate Sanitization', () => {
        it('heals NaN, Infinity, and null position coordinates to safe defaults', () => {
            const badPos = { x: NaN, y: Infinity, z: -Infinity };
            const clean = sanitizePosition(badPos);

            assert.equal(clean.x, SNAPSHOT_SANITIZER_LIMITS.DEFAULT_POS_X);
            assert.equal(clean.y, SNAPSHOT_SANITIZER_LIMITS.DEFAULT_POS_Y);
            assert.equal(clean.z, SNAPSHOT_SANITIZER_LIMITS.DEFAULT_POS_Z);
            assert.equal(Number.isFinite(clean.x), true);
            assert.equal(Number.isFinite(clean.y), true);
            assert.equal(Number.isFinite(clean.z), true);
        });

        it('clamps wild runaway positions to river boundaries', () => {
            const extremePos = { x: 500, y: 1500, z: -100000 };
            const clamped = sanitizePosition(extremePos);

            assert.ok(Math.abs(clamped.x) <= SNAPSHOT_SANITIZER_LIMITS.CORRIDOR_HALF_WIDTH * 1.5);
            assert.ok(clamped.y <= SNAPSHOT_SANITIZER_LIMITS.MAX_Y);
            assert.ok(clamped.z >= SNAPSHOT_SANITIZER_LIMITS.MIN_Z);
        });

        it('heals non-finite velocity components to zero and clamps extreme speeds', () => {
            const badVel = { x: NaN, y: -Infinity, z: 99999 };
            const cleanVel = sanitizeVelocity(badVel);

            assert.equal(cleanVel.x, 0);
            assert.equal(cleanVel.y, 0);
            assert.equal(cleanVel.z, SNAPSHOT_SANITIZER_LIMITS.MAX_VELOCITY);
        });

        it('heals corrupted or zero-length quaternions to identity orientation', () => {
            const zeroQuat = { x: 0, y: 0, z: 0, w: 0 };
            const cleanQuat = sanitizeQuaternion(zeroQuat);

            assert.equal(cleanQuat.x, 0);
            assert.equal(cleanQuat.y, 0);
            assert.equal(cleanQuat.z, 0);
            assert.equal(cleanQuat.w, 1);

            const nanQuat = { x: NaN, y: 1, z: 0, w: 0 };
            const cleanNan = sanitizeQuaternion(nanQuat);
            assert.equal(Number.isFinite(cleanNan.x), true);
            assert.equal(Number.isFinite(cleanNan.y), true);
            assert.equal(Number.isFinite(cleanNan.z), true);
            assert.equal(Number.isFinite(cleanNan.w), true);
        });
    });

    describe('4. Harbor Armory Upgrades & Security Injection Defense', () => {
        it('rejects prototype pollution attempts inside upgrades list', () => {
            const maliciousUpgrades = ['__proto__', 'constructor', 'prototype', 'motor', 'weapon'];
            const safe = sanitizeUpgrades(maliciousUpgrades);

            assert.equal(safe.includes('__proto__'), false);
            assert.equal(safe.includes('constructor'), false);
            assert.equal(safe.includes('prototype'), false);
            assert.equal(safe.includes('motor'), true);
            assert.equal(safe.includes('weapon'), true);
        });

        it('filters unknown, non-string, or fabricated upgrade identifiers', () => {
            const garbageUpgrades = ['god_mode_cheat', 1234, null, undefined, {}, 'armor', 'motor_2'];
            const safe = sanitizeUpgrades(garbageUpgrades);

            assert.deepEqual(safe, ['armor', 'motor_2']);
        });

        it('deduplicates identical upgrade items in array', () => {
            const dupes = ['motor', 'motor', 'weapon', 'weapon', 'weapon'];
            const safe = sanitizeUpgrades(dupes);

            assert.deepEqual(safe, ['motor', 'weapon']);
        });

        it('returns empty array when input is not an array', () => {
            assert.deepEqual(sanitizeUpgrades(null), []);
            assert.deepEqual(sanitizeUpgrades(undefined), []);
            assert.deepEqual(sanitizeUpgrades('motor'), []);
            assert.deepEqual(sanitizeUpgrades({ motor: true }), []);
        });
    });

    describe('5. Complete Player & Network Snapshot Sanitization', () => {
        it('sanitizes a completely malformed player record safely', () => {
            const malformedPlayer = {
                id: 'player_bad',
                coins: undefined,
                health: 'corrupt',
                maxHealth: -10,
                position: { x: NaN, y: 'sky', z: null },
                velocity: null,
                upgrades: 'not-an-array',
                isDead: 0,
            };

            const clean = sanitizePlayerSnapshot('player_bad', malformedPlayer);

            assert.equal(clean.id, 'player_bad');
            assert.equal(clean.coins, 0);
            assert.equal(clean.health, 100);
            assert.equal(clean.maxHealth, 100);
            assert.equal(clean.isDead, false);
            assert.deepEqual(clean.upgrades, []);
            assert.equal(Number.isFinite(clean.position.x), true);
            assert.equal(Number.isFinite(clean.position.y), true);
            assert.equal(Number.isFinite(clean.position.z), true);
            assert.equal(clean.velocity.x, 0);
            assert.equal(clean.velocity.y, 0);
            assert.equal(clean.velocity.z, 0);
        });

        it('sanitizes an entire network snapshot including enemies, kraken, and players', () => {
            const rawPacket = {
                version: 1,
                now: 123456,
                wave: '3',
                checkpointZ: -375,
                players: {
                    p1: {
                        coins: undefined,
                        health: 75,
                        maxHealth: 100,
                        position: { x: 2, y: 0.25, z: -370 },
                        upgrades: ['motor_1', 'bad_item'],
                    },
                    p2: {
                        coins: NaN,
                        health: -20,
                        position: { x: NaN, y: NaN, z: NaN },
                    },
                },
                enemies: {
                    e1: {
                        id: 'e1',
                        health: 200,
                        position: { x: null, y: 0, z: -400 },
                    },
                },
                kraken: {
                    health: NaN,
                    maxHealth: 1500,
                    position: { x: 0, y: -2, z: -1350 },
                },
            };

            const cleanSnapshot = sanitizeNetworkSnapshot(rawPacket);

            assert.equal(cleanSnapshot.sanitized, true);
            assert.equal(cleanSnapshot.wave, 3);
            assert.equal(cleanSnapshot.checkpointZ, -375);

            // Check Player 1
            assert.equal(cleanSnapshot.players.p1.coins, 0);
            assert.deepEqual(cleanSnapshot.players.p1.upgrades, ['motor_1']);

            // Check Player 2
            assert.equal(cleanSnapshot.players.p2.coins, 0);
            assert.equal(cleanSnapshot.players.p2.health, 0);
            assert.equal(cleanSnapshot.players.p2.isDead, true);
            assert.equal(Number.isFinite(cleanSnapshot.players.p2.position.x), true);

            // Check Enemy
            assert.equal(cleanSnapshot.enemies.e1.position.x, 0);

            // Check Kraken
            assert.equal(cleanSnapshot.kraken.health, 1500);
            assert.equal(cleanSnapshot.kraken.position.z, -1350);
        });

        it('audits snapshot integrity and detects all corrupt fields accurately', () => {
            const badSnapshot = {
                players: {
                    p1: {
                        coins: undefined,
                        position: { x: NaN, y: 0, z: -10 },
                        upgrades: 'string_error',
                    },
                },
            };

            const audit = auditSnapshotIntegrity(badSnapshot);
            assert.equal(audit.passed, false);
            assert.ok(audit.violations.length >= 3);
            assert.ok(audit.violations.some((v) => v.includes('coins is undefined')));
            assert.ok(audit.violations.some((v) => v.includes('contains NaN')));
            assert.ok(audit.violations.some((v) => v.includes('upgrades is not an array')));
        });
    });

    describe('6. Defensive Handover to HUD & UI Models', () => {
        it('prevents NaN text, corrupt badges, and exceptions in DOM HUD', () => {
            const mockDom = {
                elements: {
                    coins: { textContent: '' },
                    health: { textContent: '' },
                },
                getElementById(id) {
                    return this.elements[id] || null;
                },
            };

            const corruptPayload = {
                coins: undefined,
                health: NaN,
                maxHealth: null,
                upgrades: ['fake_mod', '__proto__', 'motor'],
                isDead: false,
            };

            const viewModel = applySanitizedSnapshotToHUD(mockDom, corruptPayload);

            assert.equal(viewModel.coinsText, '0');
            assert.equal(viewModel.healthText, '100 / 100');
            assert.equal(viewModel.healthPercent, 100);
            assert.equal(viewModel.upgradesCount, 1);
            assert.equal(viewModel.upgradesBadges[0], 'Motor');

            // Verify DOM element text values
            assert.equal(mockDom.elements.coins.textContent, '0');
            assert.equal(mockDom.elements.health.textContent, '100 / 100');
            assert.equal(mockDom.elements.coins.textContent.includes('NaN'), false);
            assert.equal(mockDom.elements.health.textContent.includes('undefined'), false);
        });
    });

    describe('7. Defensive Handover to Three.js Object3D Scene-Graph', () => {
        it('prevents NaN injection into Three.js transforms and passes scene watchdog', () => {
            const mockThreeMesh = {
                name: 'PlayerRaft',
                position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
                rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
                quaternion: { x: 0, y: 0, z: 0, w: 1, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; } },
                scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
                matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], identity() {} },
                children: [],
                updateMatrixWorldCalled: 0,
                updateMatrixWorld() { this.updateMatrixWorldCalled++; },
            };

            const hostilePayload = {
                position: { x: NaN, y: Infinity, z: -Infinity },
                quaternion: { x: NaN, y: NaN, z: NaN, w: 0 },
            };

            const applied = applySanitizedSnapshotToThreeObject(mockThreeMesh, hostilePayload);
            assert.equal(applied, true);

            // Audit with scene watchdog to verify zero NaN/Infinity leaks
            assert.equal(findCorruptedKeys(mockThreeMesh.position).length, 0);
            assert.equal(findCorruptedKeys(mockThreeMesh.quaternion, ['x', 'y', 'z', 'w']).length, 0);

            const watchdogReport = sanitizeObject3DTree(mockThreeMesh);
            assert.equal(watchdogReport.checkedCount, 1);
            assert.equal(watchdogReport.healedCount, 0); // Already clean, 0 corruptions detected!
            assert.equal(mockThreeMesh.position.x, 0);
            assert.equal(mockThreeMesh.position.y, SNAPSHOT_SANITIZER_LIMITS.DEFAULT_POS_Y);
            assert.equal(mockThreeMesh.position.z, 0);
        });
    });

    describe('8. Adversarial Network Fuzzing Stress Test', () => {
        it('survives a barrage of 200 random corrupted snapshots without crashing', () => {
            const types = [null, undefined, NaN, Infinity, -1, {}, 'broken', [NaN]];

            for (let i = 0; i < 200; i++) {
                const randomCorruptSnapshot = {
                    version: types[i % types.length],
                    wave: types[(i + 1) % types.length],
                    players: {
                        p1: {
                            coins: types[(i + 2) % types.length],
                            health: types[(i + 3) % types.length],
                            maxHealth: types[(i + 4) % types.length],
                            position: {
                                x: types[(i + 5) % types.length],
                                y: types[(i + 6) % types.length],
                                z: types[(i + 7) % types.length],
                            },
                            upgrades: types[i % types.length],
                        },
                    },
                };

                const sanitized = sanitizeNetworkSnapshot(randomCorruptSnapshot);
                assert.equal(sanitized.sanitized, true);
                assert.equal(typeof sanitized.players.p1.coins, 'number');
                assert.equal(Number.isFinite(sanitized.players.p1.coins), true);
                assert.equal(Number.isFinite(sanitized.players.p1.health), true);
                assert.equal(Number.isFinite(sanitized.players.p1.position.x), true);
                assert.equal(Array.isArray(sanitized.players.p1.upgrades), true);
            }
        });
    });
});
