import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    SPLIT_MODES,
    DEFAULT_SPLITSCREEN_CONFIG,
    DEFAULT_P1_KEYMAP,
    DEFAULT_P2_KEYMAP,
    clamp,
    wrapAngle,
    calculateSplitViewports,
    normalizePlayerInput,
    createChaseCameraState,
    stepChaseCamera,
    createSplitScreenManager,
} from '../public/js/modes/splitscreen.js';

describe('Split-Screen: Math & Helper Functions', () => {
    it('clamp restricts values to min and max', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-2, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
    });

    it('wrapAngle keeps angles wrapped within [-PI, PI]', () => {
        assert.ok(Math.abs(wrapAngle(0)) < 1e-6);
        assert.ok(Math.abs(wrapAngle(Math.PI) - Math.PI) < 1e-6 || Math.abs(wrapAngle(Math.PI) + Math.PI) < 1e-6);
        assert.ok(Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < 1e-6 || Math.abs(wrapAngle(3 * Math.PI) + Math.PI) < 1e-6);
        assert.ok(Math.abs(wrapAngle(-3 * Math.PI) - Math.PI) < 1e-6 || Math.abs(wrapAngle(-3 * Math.PI) + Math.PI) < 1e-6);
    });

    it('defines standard default configuration values in DEFAULT_SPLITSCREEN_CONFIG', () => {
        assert.equal(DEFAULT_SPLITSCREEN_CONFIG.mode, SPLIT_MODES.VERTICAL);
        assert.equal(DEFAULT_SPLITSCREEN_CONFIG.dividerWidth, 4);
        assert.equal(DEFAULT_SPLITSCREEN_CONFIG.fov, 72);
        assert.equal(DEFAULT_SPLITSCREEN_CONFIG.near, 0.1);
        assert.equal(DEFAULT_SPLITSCREEN_CONFIG.far, 1400);
    });
});

describe('Split-Screen: Viewport & Scissor Calculations (calculateSplitViewports)', () => {
    it('calculates vertical split (side-by-side) for 1920x1080 with 4px divider', () => {
        const vp = calculateSplitViewports(1920, 1080, SPLIT_MODES.VERTICAL, 4);
        assert.equal(vp.mode, SPLIT_MODES.VERTICAL);

        // (1920 - 4) / 2 = 958
        assert.equal(vp.p1.x, 0);
        assert.equal(vp.p1.y, 0);
        assert.equal(vp.p1.width, 958);
        assert.equal(vp.p1.height, 1080);
        assert.ok(Math.abs(vp.p1.aspect - 958 / 1080) < 1e-6);

        // Divider
        assert.equal(vp.divider.x, 958);
        assert.equal(vp.divider.y, 0);
        assert.equal(vp.divider.width, 4);
        assert.equal(vp.divider.height, 1080);
        assert.equal(vp.divider.orientation, 'vertical');

        // P2: x = 958 + 4 = 962
        assert.equal(vp.p2.x, 962);
        assert.equal(vp.p2.y, 0);
        assert.equal(vp.p2.width, 958);
        assert.equal(vp.p2.height, 1080);
        assert.ok(Math.abs(vp.p2.aspect - 958 / 1080) < 1e-6);

        // Verify total width spans exactly 1920
        assert.equal(vp.p1.width + vp.divider.width + vp.p2.width, 1920);
    });

    it('calculates horizontal split (top/bottom) for 1920x1080 with 4px divider', () => {
        const vp = calculateSplitViewports(1920, 1080, SPLIT_MODES.HORIZONTAL, 4);
        assert.equal(vp.mode, SPLIT_MODES.HORIZONTAL);

        // (1080 - 4) / 2 = 538
        assert.equal(vp.p2.x, 0);
        assert.equal(vp.p2.y, 0);
        assert.equal(vp.p2.width, 1920);
        assert.equal(vp.p2.height, 538);

        // Divider in WebGL coords: y = 538
        assert.equal(vp.divider.x, 0);
        assert.equal(vp.divider.y, 538);
        assert.equal(vp.divider.width, 1920);
        assert.equal(vp.divider.height, 4);
        assert.equal(vp.divider.orientation, 'horizontal');

        // P1 on top: y = 538 + 4 = 542
        assert.equal(vp.p1.x, 0);
        assert.equal(vp.p1.y, 542);
        assert.equal(vp.p1.width, 1920);
        assert.equal(vp.p1.height, 538);

        assert.equal(vp.p2.height + vp.divider.height + vp.p1.height, 1080);
    });

    it('handles zero or odd width/height gracefully with non-zero dimensions', () => {
        const vp = calculateSplitViewports(0, 0, SPLIT_MODES.VERTICAL, 0);
        assert.ok(vp.p1.width >= 0);
        assert.ok(vp.p1.height >= 1);
        assert.ok(vp.p1.aspect > 0);

        // Odd width (1921 with 4px divider -> 1917 -> half 958, p2 959)
        const vpOdd = calculateSplitViewports(1921, 1080, SPLIT_MODES.VERTICAL, 4);
        assert.equal(vpOdd.p1.width + vpOdd.divider.width + vpOdd.p2.width, 1921);
    });
});

describe('Split-Screen: Player 1 & Player 2 Input Mapping', () => {
    it('maps Player 1 keyboard inputs (WASD + Space + F + G)', () => {
        const keyStates = {
            KeyW: true,
            KeyA: true,
            Space: true,
            KeyF: true,
            KeyG: true,
        };

        const input = normalizePlayerInput(keyStates, DEFAULT_P1_KEYMAP, null);
        assert.equal(input.w, true);
        assert.equal(input.a, true);
        assert.equal(input.s, false);
        assert.equal(input.d, false);
        assert.equal(input.space, true);
        assert.equal(input.attacking, true);
        assert.equal(input.blocking, true);
        assert.equal(input.steering, -1);
        assert.equal(input.throttle, 1);
    });

    it('maps Player 2 keyboard inputs (Arrow Keys + Enter + ShiftRight + Slash)', () => {
        const keyStates = {
            ArrowDown: true,
            ArrowRight: true,
            Enter: true,
            ShiftRight: true,
            Slash: true,
        };

        const input = normalizePlayerInput(keyStates, DEFAULT_P2_KEYMAP, null);
        assert.equal(input.w, false);
        assert.equal(input.s, true);
        assert.equal(input.a, false);
        assert.equal(input.d, true);
        assert.equal(input.space, true);
        assert.equal(input.attacking, true);
        assert.equal(input.blocking, true);
        assert.equal(input.steering, 1);
        assert.equal(input.throttle, -1);
    });

    it('maps Gamepad snapshot into player input with analog steering and throttle', () => {
        const keyStates = {};
        const gamepadSnapshot = {
            forward: true,
            backward: false,
            left: false,
            right: true,
            jump: true,
            attack: true,
            block: false,
            shop: false,
            leftStick: { x: 0.8, y: -0.9, magnitude: 0.95 },
        };

        const input = normalizePlayerInput(keyStates, DEFAULT_P1_KEYMAP, gamepadSnapshot);
        assert.equal(input.w, true);
        assert.equal(input.d, true);
        assert.equal(input.space, true);
        assert.equal(input.attacking, true);
        assert.equal(input.blocking, false);
        assert.ok(input.steering > 0.7);
        assert.ok(input.throttle > 0.8);
    });

    it('isolates Player 1 and Player 2 keypresses without cross-talk', () => {
        // P1 presses WASD, P2 shouldn't react
        const p1Keys = { KeyW: true, KeyD: true, Space: true };
        const p1Out = normalizePlayerInput(p1Keys, DEFAULT_P1_KEYMAP, null);
        const p2Out = normalizePlayerInput(p1Keys, DEFAULT_P2_KEYMAP, null);

        assert.equal(p1Out.w, true);
        assert.equal(p1Out.d, true);
        assert.equal(p1Out.space, true);

        assert.equal(p2Out.w, false);
        assert.equal(p2Out.d, false);
        assert.equal(p2Out.space, false);

        // P2 presses ArrowUp, P1 shouldn't react
        const p2Keys = { ArrowUp: true, ShiftRight: true };
        const p1Out2 = normalizePlayerInput(p2Keys, DEFAULT_P1_KEYMAP, null);
        const p2Out2 = normalizePlayerInput(p2Keys, DEFAULT_P2_KEYMAP, null);

        assert.equal(p1Out2.w, false);
        assert.equal(p1Out2.attacking, false);

        assert.equal(p2Out2.w, true);
        assert.equal(p2Out2.attacking, true);
    });
});

describe('Split-Screen: Chase Camera Math (stepChaseCamera)', () => {
    it('initializes chase camera state at target position on first step', () => {
        const camState = createChaseCameraState();
        assert.equal(camState.live, false);

        const targetPos = { x: -5, y: 0.25, z: -100 };
        stepChaseCamera(camState, targetPos, 0, 0, 0.016);

        assert.equal(camState.live, true);
        assert.ok(camState.pos.z > targetPos.z);
        assert.ok(camState.pos.y > targetPos.y);
        assert.ok(camState.look.z < targetPos.z);
    });

    it('spring-damps camera position smoothly following target motion', () => {
        const camState = createChaseCameraState();
        const targetPos = { x: 0, y: 0.25, z: 0 };
        stepChaseCamera(camState, targetPos, 0, 0, 0.016);

        const initialZ = camState.pos.z;

        // Raft travels downriver (-Z)
        targetPos.z = -50;
        for (let i = 0; i < 20; i++) {
            stepChaseCamera(camState, targetPos, 0, 10, 0.05);
        }

        assert.ok(camState.pos.z < initialZ, 'Camera should follow target downriver');
        assert.ok(camState.look.z < 0, 'Camera look target should look ahead downriver');
    });

    it('camera eases smoothly behind raft yaw heading', () => {
        const camState = createChaseCameraState();
        const targetPos = { x: 0, y: 0.25, z: 0 };
        stepChaseCamera(camState, targetPos, 0, 0, 0.016);

        // Raft turns 90 degrees left (yaw = PI / 2)
        const targetYaw = Math.PI / 2;
        for (let i = 0; i < 30; i++) {
            stepChaseCamera(camState, targetPos, targetYaw, 5, 0.05);
        }

        assert.ok(camState.yaw > 0.5, 'Camera yaw should ease towards target yaw');
    });
});

describe('Split-Screen: Manager Lifecycle & Dual WebGL Viewport Rendering', () => {
    function createMockThree() {
        class MockPerspectiveCamera {
            constructor(fov, aspect, near, far) {
                this.fov = fov;
                this.aspect = aspect;
                this.near = near;
                this.far = far;
                this.position = {
                    x: 0, y: 0, z: 0,
                    set(x, y, z) { this.x = x; this.y = y; this.z = z; }
                };
                this.lookTarget = { x: 0, y: 0, z: 0 };
                this.projectionsUpdated = 0;
            }
            lookAt(x, y, z) {
                this.lookTarget = { x, y, z };
            }
            updateProjectionMatrix() {
                this.projectionsUpdated++;
            }
        }
        return {
            PerspectiveCamera: MockPerspectiveCamera,
        };
    }

    function createMockRenderer() {
        const calls = [];
        return {
            calls,
            scissorTest: false,
            currentViewport: null,
            currentScissor: null,
            renderedCameras: [],
            setScissorTest(enabled) {
                this.scissorTest = enabled;
                calls.push({ type: 'setScissorTest', enabled });
            },
            setViewport(x, y, width, height) {
                this.currentViewport = { x, y, width, height };
                calls.push({ type: 'setViewport', x, y, width, height });
            },
            setScissor(x, y, width, height) {
                this.currentScissor = { x, y, width, height };
                calls.push({ type: 'setScissor', x, y, width, height });
            },
            render(scene, camera) {
                this.renderedCameras.push(camera);
                calls.push({ type: 'render', camera, viewport: this.currentViewport });
            },
        };
    }

    it('initializes dual cameras with correct split viewports', () => {
        const THREE = createMockThree();
        const renderer = createMockRenderer();
        const scene = { children: [] };

        const mgr = createSplitScreenManager(THREE, renderer, scene, {
            width: 1920,
            height: 1080,
            mode: SPLIT_MODES.VERTICAL,
            dividerWidth: 4,
        });

        assert.ok(mgr.camera1);
        assert.ok(mgr.camera2);
        assert.ok(mgr.player1);
        assert.ok(mgr.player2);

        const vps = mgr.getViewports();
        assert.equal(vps.p1.width, 958);
        assert.equal(vps.p2.width, 958);
        assert.equal(mgr.camera1.aspect, vps.p1.aspect);
        assert.equal(mgr.camera2.aspect, vps.p2.aspect);
    });

    it('updates inputs and camera positions on update()', () => {
        const THREE = createMockThree();
        const renderer = createMockRenderer();
        const scene = { children: [] };

        const mgr = createSplitScreenManager(THREE, renderer, scene, {
            width: 1280,
            height: 720,
        });

        // Set simulated key presses
        const keys = mgr.getKeyStates();
        keys.KeyW = true;
        keys.ArrowDown = true;

        const { p1Input, p2Input } = mgr.update(0.016);
        assert.equal(p1Input.w, true);
        assert.equal(p1Input.s, false);
        assert.equal(p2Input.w, false);
        assert.equal(p2Input.s, true);

        // Check camera positions moved
        assert.ok(mgr.camera1.position.z > mgr.player1.craft.position.z);
        assert.ok(mgr.camera2.position.z > mgr.player2.craft.position.z);
    });

    it('renders dual viewports with setScissorTest, setViewport, and setScissor', () => {
        const THREE = createMockThree();
        const renderer = createMockRenderer();
        const scene = { children: [] };

        const mgr = createSplitScreenManager(THREE, renderer, scene, {
            width: 1920,
            height: 1080,
            mode: SPLIT_MODES.VERTICAL,
            dividerWidth: 4,
        });

        mgr.render();

        assert.equal(renderer.scissorTest, true);
        assert.equal(renderer.renderedCameras.length, 2);
        assert.equal(renderer.renderedCameras[0], mgr.camera1);
        assert.equal(renderer.renderedCameras[1], mgr.camera2);

        // Check setViewport calls
        const vpCalls = renderer.calls.filter((c) => c.type === 'setViewport');
        assert.equal(vpCalls.length, 2);
        assert.equal(vpCalls[0].x, 0);
        assert.equal(vpCalls[0].width, 958);
        assert.equal(vpCalls[1].x, 962);
        assert.equal(vpCalls[1].width, 958);
    });

    it('updates camera aspects and viewports on resize', () => {
        const THREE = createMockThree();
        const renderer = createMockRenderer();
        const scene = { children: [] };

        const mgr = createSplitScreenManager(THREE, renderer, scene, {
            width: 1920,
            height: 1080,
        });

        mgr.setSize(1280, 720);
        const vps = mgr.getViewports();
        // (1280 - 4) / 2 = 638
        assert.equal(vps.p1.width, 638);
        assert.equal(vps.p2.width, 638);
        assert.equal(vps.p1.height, 720);

        assert.ok(mgr.camera1.projectionsUpdated > 0);
        assert.ok(mgr.camera2.projectionsUpdated > 0);
    });

    it('dynamically toggles split mode between vertical and horizontal', () => {
        const THREE = createMockThree();
        const renderer = createMockRenderer();
        const scene = { children: [] };

        const mgr = createSplitScreenManager(THREE, renderer, scene, {
            width: 1000,
            height: 1000,
            dividerWidth: 0,
        });

        assert.equal(mgr.getViewports().mode, SPLIT_MODES.VERTICAL);
        assert.equal(mgr.getViewports().p1.width, 500);

        mgr.setMode(SPLIT_MODES.HORIZONTAL);
        assert.equal(mgr.getViewports().mode, SPLIT_MODES.HORIZONTAL);
        assert.equal(mgr.getViewports().p1.height, 500);
        assert.equal(mgr.getViewports().p1.width, 1000);
    });

    it('disables scissor test and cleans up on dispose', () => {
        const THREE = createMockThree();
        const renderer = createMockRenderer();
        const scene = { children: [] };

        const mgr = createSplitScreenManager(THREE, renderer, scene);
        mgr.render();
        assert.equal(renderer.scissorTest, true);

        mgr.dispose();
        assert.equal(renderer.scissorTest, false);
    });

    it('getP1Input and getP2Input return latest normalized snapshots', () => {
        const THREE = createMockThree();
        const renderer = createMockRenderer();
        const scene = { children: [] };

        const mgr = createSplitScreenManager(THREE, renderer, scene);
        assert.equal(typeof mgr.getP1Input(), 'object');
        assert.equal(typeof mgr.getP2Input(), 'object');
        assert.equal(mgr.getP1Input().w, false);
        assert.equal(mgr.getP2Input().w, false);

        mgr.getKeyStates().KeyW = true;
        mgr.getKeyStates().ArrowUp = true;
        mgr.update(0.016);

        assert.equal(mgr.getP1Input().w, true);
        assert.equal(mgr.getP2Input().w, true);
    });

    it('supports custom player keymaps and colors in manager options', () => {
        const THREE = createMockThree();
        const renderer = createMockRenderer();
        const scene = { children: [] };

        const customP1Keymap = {
            forward: ['KeyI'],
            backward: ['KeyK'],
            turnLeft: ['KeyJ'],
            turnRight: ['KeyL'],
            jump: ['Space'],
            attack: ['KeyU'],
            block: ['KeyO'],
            shop: ['KeyP'],
        };

        const mgr = createSplitScreenManager(THREE, renderer, scene, {
            p1Color: 0x00ff00,
            p2Color: 0xff00ff,
            p1Keymap: customP1Keymap,
        });

        assert.equal(mgr.player1.color, 0x00ff00);
        assert.equal(mgr.player2.color, 0xff00ff);

        mgr.getKeyStates().KeyI = true;
        mgr.update(0.016);
        assert.equal(mgr.getP1Input().w, true);
    });
});
