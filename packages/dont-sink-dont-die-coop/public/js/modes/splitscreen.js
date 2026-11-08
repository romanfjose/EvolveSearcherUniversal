/**
 * Don't Sink, Don't Die — 2-Player Local Split-Screen Co-Op Mode
 * ES module managing dual-viewport rendering (WebGLRenderer.setViewport / setScissor),
 * independent spring-damped chase cameras, separated input management
 * (P1: WASD + Space + F/G or Gamepad 1, P2: Arrows + Right-Shift/Enter or Gamepad 2),
 * and dynamic UI divider & viewport layout calculations.
 *
 * Designed to run in headless node:test suites (with injected mock THREE & renderer)
 * and in live browser sessions without modifying existing files.
 */

export const SPLIT_MODES = {
    VERTICAL: 'vertical',     // Left | Right (side-by-side)
    HORIZONTAL: 'horizontal', // Top / Bottom
};

export const DEFAULT_SPLITSCREEN_CONFIG = {
    mode: SPLIT_MODES.VERTICAL,
    dividerWidth: 4,
    dividerColor: '#ffd84a', // Bright yellow/gold divider line
    p1Color: 0xff4444,       // Red raft for P1
    p2Color: 0x4488ff,       // Cyan/Blue raft for P2
    fov: 72,
    near: 0.1,
    far: 1400,
    camDistance: 10.5,
    camPitch: 0.25,
    minPitch: 0.14,
    maxPitch: 0.65,
    camStiffness: 11,
    camFollow: 5.5,
};

/**
 * P1 and P2 Keyboard Controls Specification
 * Player 1: WASD + Space (Jump) + F (Attack) + G / Left-Shift (Block) + E (Shop)
 * Player 2: Arrow Keys + Enter / Numpad0 (Jump) + Right-Shift / KeyK (Attack) + Slash / KeyL (Block) + Backslash / KeyO (Shop)
 */
export const DEFAULT_P1_KEYMAP = {
    forward: ['KeyW'],
    backward: ['KeyS'],
    turnLeft: ['KeyA'],
    turnRight: ['KeyD'],
    jump: ['Space'],
    attack: ['KeyF'],
    block: ['KeyG', 'ShiftLeft'],
    shop: ['KeyE'],
};

export const DEFAULT_P2_KEYMAP = {
    forward: ['ArrowUp'],
    backward: ['ArrowDown'],
    turnLeft: ['ArrowLeft'],
    turnRight: ['ArrowRight'],
    jump: ['Enter', 'NumpadEnter', 'Numpad0'],
    attack: ['ShiftRight', 'KeyK', 'KeyZ'],
    block: ['Slash', 'Backslash', 'KeyL', 'KeyX'],
    shop: ['Period', 'KeyO'],
};

/**
 * Clamp helper.
 */
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Wrap angle to [-PI, PI].
 */
export function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Computes viewport & scissor rectangles for both players.
 * Returns {
 *   p1: { x, y, width, height, aspect },
 *   p2: { x, y, width, height, aspect },
 *   divider: { x, y, width, height, orientation }
 * }
 */
export function calculateSplitViewports(windowWidth, windowHeight, mode = SPLIT_MODES.VERTICAL, dividerWidth = 4) {
    const rawW = Math.max(1, Math.floor(windowWidth));
    const rawH = Math.max(1, Math.floor(windowHeight));
    const dW = Math.max(0, Math.floor(dividerWidth));

    if (mode === SPLIT_MODES.HORIZONTAL) {
        // Horizontal split: Top (P1) and Bottom (P2)
        const availableH = Math.max(2, rawH - dW);
        const halfHeight = Math.max(1, Math.floor(availableH / 2));
        const p2Height = Math.max(1, rawH - dW - halfHeight);

        // In WebGL coordinate space, y=0 is bottom:
        // P2 is at the bottom: y=0, height=p2Height
        // Divider is at y=p2Height, height=dW
        // P1 is at the top: y=p2Height + dW, height=halfHeight
        return {
            mode: SPLIT_MODES.HORIZONTAL,
            p1: {
                x: 0,
                y: p2Height + dW,
                width: rawW,
                height: halfHeight,
                aspect: rawW / halfHeight,
            },
            p2: {
                x: 0,
                y: 0,
                width: rawW,
                height: p2Height,
                aspect: rawW / p2Height,
            },
            divider: {
                x: 0,
                y: p2Height,
                width: rawW,
                height: dW,
                orientation: 'horizontal',
            },
        };
    }

    // Default: Vertical split: Left (P1) and Right (P2)
    const availableW = Math.max(2, rawW - dW);
    const halfWidth = Math.max(1, Math.floor(availableW / 2));
    const p2Width = Math.max(1, rawW - dW - halfWidth);

    return {
        mode: SPLIT_MODES.VERTICAL,
        p1: {
            x: 0,
            y: 0,
            width: halfWidth,
            height: rawH,
            aspect: halfWidth / rawH,
        },
        p2: {
            x: halfWidth + dW,
            y: 0,
            width: p2Width,
            height: rawH,
            aspect: p2Width / rawH,
        },
        divider: {
            x: halfWidth,
            y: 0,
            width: dW,
            height: rawH,
            orientation: 'vertical',
        },
    };
}

/**
 * Maps raw keyboard/gamepad inputs for Player 1 and Player 2 separately.
 */
export function normalizePlayerInput(keyStates, keymap, gamepadSnapshot = null) {
    const isDown = (action) => {
        const codes = keymap[action] || [];
        for (let i = 0; i < codes.length; i++) {
            if (keyStates[codes[i]]) return true;
        }
        return false;
    };

    const forward = isDown('forward') || Boolean(gamepadSnapshot?.forward);
    const backward = isDown('backward') || Boolean(gamepadSnapshot?.backward);
    const left = isDown('turnLeft') || Boolean(gamepadSnapshot?.left);
    const right = isDown('turnRight') || Boolean(gamepadSnapshot?.right);
    const space = isDown('jump') || Boolean(gamepadSnapshot?.jump);
    const attacking = isDown('attack') || Boolean(gamepadSnapshot?.attack);
    const blocking = isDown('block') || Boolean(gamepadSnapshot?.block);
    const shop = isDown('shop') || Boolean(gamepadSnapshot?.shop);

    return {
        w: forward,
        s: backward,
        a: left,
        d: right,
        space,
        attacking,
        blocking,
        shop,
        steering: gamepadSnapshot?.leftStick?.x ?? (right ? 1 : left ? -1 : 0),
        throttle: -(gamepadSnapshot?.leftStick?.y ?? (forward ? -1 : backward ? 1 : 0)),
    };
}

/**
 * Creates independent chase camera state and step calculation.
 */
export function createChaseCameraState(config = {}) {
    return {
        yaw: 0,
        orbit: 0,
        pitch: config.camPitch ?? DEFAULT_SPLITSCREEN_CONFIG.camPitch,
        distance: config.camDistance ?? DEFAULT_SPLITSCREEN_CONFIG.camDistance,
        vel: { x: 0, y: 0, z: 0 },
        pos: { x: 0, y: 5, z: 10 },
        look: { x: 0, y: 1.2, z: 0 },
        live: false,
    };
}

/**
 * Pure chase camera positioning math for a single player viewport.
 */
export function stepChaseCamera(camState, targetPos, targetYaw, speed, dt, options = {}) {
    const stiffness = options.camStiffness ?? DEFAULT_SPLITSCREEN_CONFIG.camStiffness;
    const follow = options.camFollow ?? DEFAULT_SPLITSCREEN_CONFIG.camFollow;
    const dist = (camState.distance || 11) + speed * 0.22;

    // Follow raft yaw smoothly
    camState.yaw += wrapAngle(targetYaw - camState.yaw) * (1 - Math.exp(-follow * dt));
    const yaw = camState.yaw + (camState.orbit || 0);
    const pitch = camState.pitch;

    const desiredX = targetPos.x + dist * Math.cos(pitch) * Math.sin(yaw);
    const desiredY = Math.max(0.8, targetPos.y + 1.85 + dist * Math.sin(pitch));
    const desiredZ = targetPos.z + dist * Math.cos(pitch) * Math.cos(yaw);

    const fwdX = -Math.sin(targetYaw);
    const fwdZ = -Math.cos(targetYaw);
    const lookX = targetPos.x + fwdX * 15;
    const lookY = targetPos.y + 1.15;
    const lookZ = targetPos.z + fwdZ * 15;

    const distToDesired = Math.hypot(
        desiredX - camState.pos.x,
        desiredY - camState.pos.y,
        desiredZ - camState.pos.z
    );
    if (!camState.live || !Number.isFinite(distToDesired) || distToDesired > 55) {
        camState.pos.x = desiredX;
        camState.pos.y = desiredY;
        camState.pos.z = desiredZ;
        camState.vel.x = 0;
        camState.vel.y = 0;
        camState.vel.z = 0;
        camState.look.x = lookX;
        camState.look.y = lookY;
        camState.look.z = lookZ;
        camState.live = true;
        return camState;
    }

    // Substepped spring damping (120Hz substeps prevent Euler blowup when dt > 1 / stiffness)
    const safeDt = Math.min(Math.max(0, dt || 0), 0.25);
    for (let left = safeDt; left > 1e-6; left -= 1 / 120) {
        const h = Math.min(left, 1 / 120);
        const ax = stiffness * stiffness * (desiredX - camState.pos.x) - 2 * stiffness * camState.vel.x;
        const ay = stiffness * stiffness * (desiredY - camState.pos.y) - 2 * stiffness * camState.vel.y;
        const az = stiffness * stiffness * (desiredZ - camState.pos.z) - 2 * stiffness * camState.vel.z;

        camState.vel.x += ax * h;
        camState.vel.y += ay * h;
        camState.vel.z += az * h;

        camState.pos.x += camState.vel.x * h;
        camState.pos.y += camState.vel.y * h;
        camState.pos.z += camState.vel.z * h;
    }
    camState.pos.y = Math.max(0.8, camState.pos.y);

    // Smooth look target
    const easeLook = 1 - Math.exp(-12 * safeDt);
    camState.look.x += (lookX - camState.look.x) * easeLook;
    camState.look.y += (lookY - camState.look.y) * easeLook;
    camState.look.z += (lookZ - camState.look.z) * easeLook;

    return camState;
}

/**
 * Creates and initializes the 2-Player Local Split-Screen Co-Op Manager.
 */
export function createSplitScreenManager(THREE, renderer, scene, options = {}) {
    const config = {
        ...DEFAULT_SPLITSCREEN_CONFIG,
        ...options,
    };

    let width = options.width || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    let height = options.height || (typeof window !== 'undefined' ? window.innerHeight : 720);
    let splitMode = config.mode || SPLIT_MODES.VERTICAL;
    let dividerWidth = config.dividerWidth ?? 4;

    // Viewport bounds
    let viewports = calculateSplitViewports(width, height, splitMode, dividerWidth);

    // Dual Perspective Cameras
    const camera1 = new THREE.PerspectiveCamera(config.fov, viewports.p1.aspect, config.near, config.far);
    const camera2 = new THREE.PerspectiveCamera(config.fov, viewports.p2.aspect, config.near, config.far);

    // Chase camera math states
    const camState1 = createChaseCameraState(config);
    const camState2 = createChaseCameraState(config);

    // Keyboard state tracking
    const keyStates = {};
    const p1Keymap = structuredClone(options.p1Keymap || DEFAULT_P1_KEYMAP);
    const p2Keymap = structuredClone(options.p2Keymap || DEFAULT_P2_KEYMAP);

    // Player inputs
    let p1Input = normalizePlayerInput(keyStates, p1Keymap, null);
    let p2Input = normalizePlayerInput(keyStates, p2Keymap, null);

    // Raft Craft simulation states for local 2-player
    const player1 = {
        id: 'player_1',
        name: 'Player 1',
        color: config.p1Color,
        craft: {
            position: { x: -3, y: 0.25, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            angularVelocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
        },
        health: 100,
        maxHealth: 100,
        coins: 50,
        upgrades: [],
        isDead: false,
        mesh: options.p1Mesh || null,
    };

    const player2 = {
        id: 'player_2',
        name: 'Player 2',
        color: config.p2Color,
        craft: {
            position: { x: 3, y: 0.25, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            angularVelocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
        },
        health: 100,
        maxHealth: 100,
        coins: 50,
        upgrades: [],
        isDead: false,
        mesh: options.p2Mesh || null,
    };

    // DOM Divider Overlay (if in browser)
    let dividerElement = null;
    let overlayContainer = null;

    function setupDOMOverlay() {
        if (typeof document === 'undefined') return;

        overlayContainer = document.createElement('div');
        overlayContainer.id = 'splitscreen-overlay';
        overlayContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 100;
        `;

        dividerElement = document.createElement('div');
        dividerElement.id = 'splitscreen-divider';
        dividerElement.style.cssText = `
            position: absolute;
            background: ${config.dividerColor};
            box-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
            pointer-events: none;
        `;
        overlayContainer.appendChild(dividerElement);

        // Player Labels in their respective viewports (bottom-aligned inside each viewport to avoid overlapping top HUD panels)
        const p1Badge = document.createElement('div');
        p1Badge.id = 'p1-badge';
        p1Badge.innerText = 'P1 · WASD + F (Attack) + SPACE (Jump)';
        p1Badge.style.cssText = `
            position: absolute;
            bottom: 58px;
            left: 16px;
            color: #ff9999;
            font-family: system-ui, sans-serif;
            font-weight: 800;
            font-size: 13px;
            letter-spacing: 0.04em;
            background: rgba(8, 15, 28, 0.78);
            padding: 5px 10px;
            border-radius: 6px;
            border-left: 3px solid #ff4444;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
        `;
        overlayContainer.appendChild(p1Badge);

        const p2Badge = document.createElement('div');
        p2Badge.id = 'p2-badge';
        p2Badge.innerText = 'P2 · ARROWS + R-SHIFT/K (Attack) + ENTER (Jump)';
        p2Badge.style.cssText = `
            position: absolute;
            bottom: 58px;
            right: 16px;
            color: #7dd3fc;
            font-family: system-ui, sans-serif;
            font-weight: 800;
            font-size: 13px;
            letter-spacing: 0.04em;
            background: rgba(8, 15, 28, 0.78);
            padding: 5px 10px;
            border-radius: 6px;
            border-right: 3px solid #38bdf8;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
        `;
        overlayContainer.appendChild(p2Badge);

        (options.container || document.body).appendChild(overlayContainer);
        updateDividerDOM();
    }

    function updateDividerDOM() {
        if (!dividerElement) return;
        const div = viewports.divider;
        if (div.orientation === 'vertical') {
            dividerElement.style.left = `${div.x}px`;
            dividerElement.style.top = '0px';
            dividerElement.style.width = `${div.width}px`;
            dividerElement.style.height = '100%';
        } else {
            // Note: DOM top is inverted from WebGL bottom-left
            dividerElement.style.left = '0px';
            dividerElement.style.top = `${height - div.y - div.height}px`;
            dividerElement.style.width = '100%';
            dividerElement.style.height = `${div.height}px`;
        }
    }

    // Keyboard event listeners
    function onKeyDown(e) {
        keyStates[e.code] = true;
    }
    function onKeyUp(e) {
        keyStates[e.code] = false;
    }
    function onBlur() {
        for (const k in keyStates) keyStates[k] = false;
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        setupDOMOverlay();
    }

    /**
     * Poll Gamepads: Gamepad 0 for P1, Gamepad 1 for P2 (or fallback if only one connected).
     */
    function pollGamepads() {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) {
            return { gp1: null, gp2: null };
        }
        const gamepads = navigator.getGamepads() || [];
        const connected = [];
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i] && gamepads[i].connected) {
                connected.push(gamepads[i]);
            }
        }
        const gp1 = connected[0] || null;
        const gp2 = connected[1] || null;
        return { gp1, gp2 };
    }

    /**
     * Converts raw Gamepad API object to simple normalized snapshot.
     */
    function parseGamepad(gp) {
        if (!gp) return null;
        const axes = gp.axes || [];
        const btns = gp.buttons || [];
        const getB = (idx) => {
            const b = btns[idx];
            if (!b) return false;
            if (typeof b === 'object') return Boolean(b.pressed) || (b.value || 0) > 0.25;
            return Boolean(b);
        };
        const lx = axes[0] || 0;
        const ly = axes[1] || 0;
        const mag = Math.hypot(lx, ly);
        const deadzone = 0.15;
        const active = mag > deadzone;

        return {
            connected: true,
            forward: getB(12) || (active && ly < -0.35),
            backward: getB(13) || (active && ly > 0.35),
            left: getB(14) || (active && lx < -0.35),
            right: getB(15) || (active && lx > 0.35),
            jump: getB(0),           // A button
            attack: getB(2) || getB(7), // X or RT
            block: getB(6) || getB(4) || getB(5), // LT or LB or RB
            shop: getB(3),           // Y button
            leftStick: { x: active ? lx : 0, y: active ? ly : 0, magnitude: active ? mag : 0 },
        };
    }

    /**
     * Update method to be called each simulation tick / animation frame.
     */
    function update(dt = 1 / 60) {
        // Poll Gamepads
        const { gp1, gp2 } = pollGamepads();
        const snap1 = parseGamepad(gp1);
        const snap2 = parseGamepad(gp2);

        // Compute Player Inputs
        p1Input = normalizePlayerInput(keyStates, p1Keymap, snap1);
        p2Input = normalizePlayerInput(keyStates, p2Keymap, snap2);

        // Update Chase Cameras
        const speed1 = Math.hypot(player1.craft.velocity.x, player1.craft.velocity.z);
        stepChaseCamera(camState1, player1.craft.position, player1.craft.yaw, speed1, dt, config);

        camera1.position.set(camState1.pos.x, camState1.pos.y, camState1.pos.z);
        if (typeof camera1.lookAt === 'function') {
            camera1.lookAt(camState1.look.x, camState1.look.y, camState1.look.z);
        }

        const speed2 = Math.hypot(player2.craft.velocity.x, player2.craft.velocity.z);
        stepChaseCamera(camState2, player2.craft.position, player2.craft.yaw, speed2, dt, config);

        camera2.position.set(camState2.pos.x, camState2.pos.y, camState2.pos.z);
        if (typeof camera2.lookAt === 'function') {
            camera2.lookAt(camState2.look.x, camState2.look.y, camState2.look.z);
        }

        return { p1Input, p2Input };
    }

    /**
     * Renders dual split-screen views via WebGLRenderer.setViewport & setScissor.
     */
    function render() {
        if (!renderer || typeof renderer.render !== 'function') return;

        // Enable scissor test so clearing and rendering is strictly clipped to each viewport
        if (typeof renderer.setScissorTest === 'function') {
            renderer.setScissorTest(true);
        }

        // --- Render Player 1 Viewport ---
        const v1 = viewports.p1;
        if (typeof renderer.setViewport === 'function') {
            renderer.setViewport(v1.x, v1.y, v1.width, v1.height);
        }
        if (typeof renderer.setScissor === 'function') {
            renderer.setScissor(v1.x, v1.y, v1.width, v1.height);
        }
        renderer.render(scene, camera1);

        // --- Render Player 2 Viewport ---
        const v2 = viewports.p2;
        if (typeof renderer.setViewport === 'function') {
            renderer.setViewport(v2.x, v2.y, v2.width, v2.height);
        }
        if (typeof renderer.setScissor === 'function') {
            renderer.setScissor(v2.x, v2.y, v2.width, v2.height);
        }
        renderer.render(scene, camera2);
    }

    /**
     * Handles window or canvas resize event.
     */
    function setSize(newWidth, newHeight) {
        width = Math.max(1, Math.floor(newWidth));
        height = Math.max(1, Math.floor(newHeight));
        viewports = calculateSplitViewports(width, height, splitMode, dividerWidth);

        camera1.aspect = viewports.p1.aspect;
        if (typeof camera1.updateProjectionMatrix === 'function') {
            camera1.updateProjectionMatrix();
        }

        camera2.aspect = viewports.p2.aspect;
        if (typeof camera2.updateProjectionMatrix === 'function') {
            camera2.updateProjectionMatrix();
        }

        updateDividerDOM();
    }

    /**
     * Switch split mode between 'vertical' and 'horizontal'.
     */
    function setMode(mode) {
        if (mode === SPLIT_MODES.VERTICAL || mode === SPLIT_MODES.HORIZONTAL) {
            splitMode = mode;
            setSize(width, height);
        }
    }

    /**
     * Cleanup event listeners and DOM elements.
     */
    function dispose() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        }
        if (overlayContainer?.parentNode) {
            overlayContainer.parentNode.removeChild(overlayContainer);
        }
        if (typeof renderer?.setScissorTest === 'function') {
            renderer.setScissorTest(false);
        }
        overlayContainer = null;
        dividerElement = null;
    }

    return {
        camera1,
        camera2,
        camState1,
        camState2,
        player1,
        player2,
        getViewports: () => viewports,
        getP1Input: () => p1Input,
        getP2Input: () => p2Input,
        getKeyStates: () => keyStates,
        update,
        render,
        setSize,
        setMode,
        dispose,
    };
}
