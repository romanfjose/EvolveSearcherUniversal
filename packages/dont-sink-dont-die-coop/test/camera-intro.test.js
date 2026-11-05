import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    CAMERA_INTRO_CONFIG,
    clamp,
    lerp,
    cubicBezier1D,
    solveCubicBezier,
    computeCameraSwoop,
    calculateIntroFov,
    isAutostartRequested,
    isInstantActionKey,
    createCameraIntroDirector,
} from '../public/js/vfx/camera-intro.js';

function createMockCamera(initialPos = { x: 0, y: 0, z: 0 }, initialFov = 75) {
    return {
        position: {
            x: initialPos.x,
            y: initialPos.y,
            z: initialPos.z,
            set(x, y, z) {
                this.x = x;
                this.y = y;
                this.z = z;
                return this;
            },
        },
        lookAtTarget: { x: 0, y: 0, z: 0 },
        lookAt(x, y, z) {
            this.lookAtTarget = { x, y, z };
        },
        fov: initialFov,
        projectionMatrixUpdated: 0,
        updateProjectionMatrix() {
            this.projectionMatrixUpdated++;
        },
    };
}

describe('Camera Intro: Configuration & Constants', () => {
    it('defines standard 1.4-second duration and sky-dive coordinate bounds', () => {
        assert.equal(CAMERA_INTRO_CONFIG.DURATION_SEC, 1.4);
        assert.ok(CAMERA_INTRO_CONFIG.INSTANT_DROP_DELAY_SEC < 0.3, 'Instant drop delay must be <0.3s');
        assert.deepEqual(CAMERA_INTRO_CONFIG.START_POSITION, { x: 0, y: 38, z: 28 });
        assert.deepEqual(CAMERA_INTRO_CONFIG.END_POSITION, { x: 0, y: 9.5, z: 13.5 });
        assert.equal(CAMERA_INTRO_CONFIG.START_FOV, 78);
        assert.equal(CAMERA_INTRO_CONFIG.END_FOV, 60);
    });
});

describe('Camera Intro: Pure Math & Cubic-Bezier Interpolation', () => {
    it('clamp correctly bounds numbers', () => {
        assert.equal(clamp(-5, 0, 1), 0);
        assert.equal(clamp(0.5, 0, 1), 0.5);
        assert.equal(clamp(1.5, 0, 1), 1);
    });

    it('lerp interpolates cleanly between boundaries', () => {
        assert.equal(lerp(10, 20, 0), 10);
        assert.equal(lerp(10, 20, 0.5), 15);
        assert.equal(lerp(10, 20, 1), 20);
        assert.equal(lerp(10, 20, -1), 10);
        assert.equal(lerp(10, 20, 2), 20);
    });

    it('cubicBezier1D computes polynomial values at 0, 0.5, and 1', () => {
        assert.equal(cubicBezier1D(0, 0, 0.5, 0.5, 1), 0);
        assert.equal(cubicBezier1D(1, 0, 0.5, 0.5, 1), 1);
        const mid = cubicBezier1D(0.5, 0, 0.5, 0.5, 1);
        assert.ok(Math.abs(mid - 0.5) < 1e-4);
    });

    it('solveCubicBezier returns 0 at 0 and 1 at 1', () => {
        assert.equal(solveCubicBezier(0), 0);
        assert.equal(solveCubicBezier(1), 1);
        assert.equal(solveCubicBezier(-0.5), 0);
        assert.equal(solveCubicBezier(1.5), 1);
    });

    it('solveCubicBezier produces monotonically increasing progression', () => {
        let prev = -0.0001;
        for (let t = 0; t <= 1.0; t += 0.05) {
            const val = solveCubicBezier(t);
            assert.ok(val >= prev - 1e-5, `Value at t=${t} (${val}) must be >= previous (${prev})`);
            prev = val;
        }
    });

    it('computeCameraSwoop smoothly swoops from canyon sky to behind Viking raft', () => {
        const atStart = computeCameraSwoop(0);
        assert.equal(atStart.progress, 0);
        assert.equal(atStart.position.x, 0);
        assert.equal(atStart.position.y, 38);
        assert.equal(atStart.position.z, 28);
        assert.equal(atStart.fov, 78);

        const atEnd = computeCameraSwoop(1);
        assert.equal(atEnd.progress, 1);
        assert.equal(atEnd.position.x, 0);
        assert.equal(atEnd.position.y, 9.5);
        assert.equal(atEnd.position.z, 13.5);
        assert.equal(atEnd.fov, 60);

        const atMid = computeCameraSwoop(0.5);
        assert.ok(atMid.position.y < 38 && atMid.position.y > 9.5);
        assert.ok(atMid.position.z < 28 && atMid.position.z > 13.5);
        assert.ok(atMid.fov < 78 && atMid.fov > 60);
    });

    it('calculateIntroFov punches FOV from 78 to 60 degrees', () => {
        assert.equal(calculateIntroFov(0), 78);
        assert.equal(calculateIntroFov(1), 60);
        const mid = calculateIntroFov(0.5);
        assert.ok(mid > 60 && mid < 78);
    });
});

describe('Camera Intro: Instant Action Triggers & Autostart Detection', () => {
    it('detects ?autostart=1, ?autostart=true, and ?autostart query flags', () => {
        assert.equal(isAutostartRequested('?autostart=1'), true);
        assert.equal(isAutostartRequested('?autostart=true'), true);
        assert.equal(isAutostartRequested('?autostart'), true);
        assert.equal(isAutostartRequested('?mode=campaign&autostart=1&seed=XYZ'), true);
        assert.equal(isAutostartRequested('?autostart=0'), false);
        assert.equal(isAutostartRequested('?autostart=false'), false);
        assert.equal(isAutostartRequested('?mode=campaign'), false);
        assert.equal(isAutostartRequested(''), false);
        assert.equal(isAutostartRequested(null), false);
    });

    it('identifies Space and Enter as instant action launch keys', () => {
        assert.equal(isInstantActionKey('Space'), true);
        assert.equal(isInstantActionKey('space'), true);
        assert.equal(isInstantActionKey(' '), true);
        assert.equal(isInstantActionKey('Enter'), true);
        assert.equal(isInstantActionKey('enter'), true);
        assert.equal(isInstantActionKey({ key: ' ' }), true);
        assert.equal(isInstantActionKey({ key: 'Enter' }), true);
        assert.equal(isInstantActionKey({ code: 'Space' }), true);
        assert.equal(isInstantActionKey({ code: 'Enter' }), true);
        assert.equal(isInstantActionKey({ keyCode: 32 }), true);
        assert.equal(isInstantActionKey({ keyCode: 13 }), true);

        // Disallowed keys
        assert.equal(isInstantActionKey('ArrowUp'), false);
        assert.equal(isInstantActionKey({ key: 'Escape' }), false);
        assert.equal(isInstantActionKey({ keyCode: 27 }), false);
        assert.equal(isInstantActionKey(null), false);
    });
});

describe('Camera Intro: Director Controller Lifecycle & Animation', () => {
    it('initializes camera position to sky coordinates upon creation', () => {
        const camera = createMockCamera();
        createCameraIntroDirector({
            camera,
            autoBindKeys: false,
        });

        assert.equal(camera.position.y, 38);
        assert.equal(camera.position.z, 28);
        assert.equal(camera.fov, 78);
        assert.ok(camera.projectionMatrixUpdated > 0);
    });

    it('advances swoop along 1.4-second timeline to completion', () => {
        const camera = createMockCamera();
        let completed = false;

        const director = createCameraIntroDirector({
            camera,
            autoBindKeys: false,
            onComplete: () => {
                completed = true;
            },
        });

        assert.equal(director.getState(), 'idle');
        director.play();
        assert.equal(director.getState(), 'playing');
        assert.equal(director.isPlaying(), true);

        // Step by 0.7s (halfway)
        director.update(0.7);
        assert.ok(director.getProgress() > 0.45 && director.getProgress() < 0.55);
        assert.ok(camera.position.y < 38 && camera.position.y > 9.5);
        assert.equal(completed, false);

        // Step past 1.4s (complete)
        director.update(0.8);
        assert.equal(director.getProgress(), 1.0);
        assert.equal(director.isCompleted(), true);
        assert.equal(completed, true);
        assert.equal(camera.position.y, 9.5);
        assert.equal(camera.position.z, 13.5);
        assert.equal(camera.fov, 60);
    });

    it('triggers instant launch (<0.3s) on triggerInstantLaunch', () => {
        const camera = createMockCamera();
        let launched = false;
        let completed = false;

        const director = createCameraIntroDirector({
            camera,
            autoBindKeys: false,
            onActionLaunch: () => {
                launched = true;
            },
            onComplete: () => {
                completed = true;
            },
        });

        director.triggerInstantLaunch(false);
        assert.equal(launched, true);
        assert.equal(director.isInstantLaunching(), true);

        // Step by 0.26s (which is > 0.25s instant drop delay, < 0.3s)
        director.update(0.26);
        assert.equal(director.isCompleted(), true);
        assert.equal(completed, true);
        assert.equal(camera.position.y, 9.5);
        assert.equal(camera.position.z, 13.5);
        assert.equal(camera.fov, 60);
    });

    it('supports immediate skip() directly to final raft view', () => {
        const camera = createMockCamera();
        let completed = false;

        const director = createCameraIntroDirector({
            camera,
            autoBindKeys: false,
            onComplete: () => {
                completed = true;
            },
        });

        director.skip();
        assert.equal(director.isCompleted(), true);
        assert.equal(completed, true);
        assert.equal(camera.position.y, 9.5);
        assert.equal(camera.position.z, 13.5);
        assert.equal(camera.fov, 60);
    });

    it('automatically launches when searchString has autostart=1', () => {
        const camera = createMockCamera();
        let launched = false;

        const director = createCameraIntroDirector({
            camera,
            searchString: '?autostart=1',
            autoBindKeys: false,
            onActionLaunch: () => {
                launched = true;
            },
        });

        assert.equal(launched, true);
        assert.equal(director.isInstantLaunching(), true);
    });

    it('resets cleanly back to starting state', () => {
        const camera = createMockCamera();
        const director = createCameraIntroDirector({
            camera,
            autoBindKeys: false,
        });

        director.play();
        director.update(1.5);
        assert.equal(director.isCompleted(), true);

        director.reset();
        assert.equal(director.getState(), 'idle');
        assert.equal(director.getProgress(), 0);
        assert.equal(camera.position.y, 38);
        assert.equal(camera.position.z, 28);
        assert.equal(camera.fov, 78);
    });

    it('cleans up resources cleanly on dispose()', () => {
        const director = createCameraIntroDirector({
            autoBindKeys: false,
        });
        assert.doesNotThrow(() => {
            director.dispose();
        });
    });
});
