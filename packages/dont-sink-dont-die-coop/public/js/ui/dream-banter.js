/**
 * Don't Sink, Don't Die — 3D Speech Bubble & Fever-Dream Banter Director
 *
 * Requirements fulfilled:
 * 1. Projects comedic speech bubbles dynamically anchored to 3D world positions:
 *    - Elevation-Blind Wizard: "Where did he go?! He was literally just in the water!", "Must have been the wind...", "Curse my vertical neck brace!"
 *    - Harbor Pedestrians: "Bro is getting swamp sludge on my new shoes! OFFICER!!", "Call the Harbor Police, the meatball is back!"
 *    - Harbor Police: "STOP RESISTING, SLUDGE BOY!", "WE HAVE YOU SURROUNDED BY WATER!"
 *    - AI Crewmates (Capitán Mateo, Tía Marta, El Pibe): reactions to buying Squeaky Hammer, getting yeeted by Wizard, reviving at checkpoints, spotting Long Worm.
 * 2. Visual presentation: Fever-dream aesthetic, comic speech bubble tails, character avatars, comic fonts, pop animations, jitter/wobble effects, priority stacking, screen edge clamping.
 * 3. Rate-limiting & cooldown handling with bilingual EN/ES spice support.
 *
 * Zero external runtime dependencies. Headless test friendly.
 */

import {
    BANTER_CHARACTERS,
    BANTER_TRIGGERS,
    BANTER_PRIORITIES,
    TRIGGER_CONFIGS,
    BanterCooldownManager,
    evaluateBanterRules,
    getBanterLine,
    projectWorldToScreen,
    clampBubbleToViewport,
} from '../../../shared/banter-rules.js';

// ─── DOM CSS Injector ────────────────────────────────────────────────────────

const BANTER_STYLES_ID = 'dream-banter-styles';

function injectBanterStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(BANTER_STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = BANTER_STYLES_ID;
    style.textContent = `
        .banter-bubble-container {
            position: absolute;
            transform: translate(-50%, -100%);
            pointer-events: none;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            transition: opacity 0.25s ease-out, transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            font-family: 'Bangers', Impact, 'Comic Sans MS', -apple-system, sans-serif;
            user-select: none;
        }

        .banter-bubble-box {
            position: relative;
            max-width: 320px;
            padding: 10px 16px;
            border-radius: 18px;
            border: 3px solid #000;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.25);
            display: flex;
            align-items: center;
            gap: 12px;
            color: #ffffff;
            font-size: 14.5px;
            font-weight: 700;
            line-height: 1.25;
            letter-spacing: 0.02em;
            text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
            animation: banter-pop 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .banter-avatar {
            font-size: 28px;
            line-height: 1;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
            flex-shrink: 0;
        }

        .banter-content {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .banter-speaker-name {
            font-size: 10.5px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            opacity: 0.9;
        }

        .banter-text {
            font-size: 14px;
        }

        /* Comic speech bubble tail */
        .banter-tail {
            width: 0;
            height: 0;
            border-left: 12px solid transparent;
            border-right: 12px solid transparent;
            border-top: 14px solid;
            filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));
            margin-top: -1px;
        }

        /* Fever-dream comic jitter */
        @keyframes banter-pop {
            0% { transform: scale(0.3) rotate(-6deg); opacity: 0; }
            70% { transform: scale(1.08) rotate(2deg); opacity: 1; }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes banter-wobble {
            0%, 100% { transform: translate(-50%, -100%) rotate(0deg); }
            25% { transform: translate(-50%, -100%) rotate(-1.5deg) scale(1.01); }
            75% { transform: translate(-50%, -100%) rotate(1.5deg) scale(0.99); }
        }

        .banter-wobble-active {
            animation: banter-wobble 2s infinite ease-in-out;
        }
    `;
    document.head.appendChild(style);
}

// ─── Dream Banter Director System ───────────────────────────────────────────

/**
 * Creates and manages active 3D projected comedic speech bubbles.
 *
 * @param {object} [options]
 * @param {object} [options.camera] - Three.js PerspectiveCamera
 * @param {Function} [options.getViewProjMatrix] - Function returning 16-element Float32Array
 * @param {Function} [options.onBanterSound] - Optional callback for comic chirp/SFX
 * @param {string} [options.language] - 'bilingual' | 'en' | 'es'
 * @param {number} [options.maxActiveBubbles] - Max concurrent bubbles (default 3)
 */
export function createDreamBanterDirector({
    camera = null,
    getViewProjMatrix = null,
    onBanterSound = null,
    language = 'bilingual',
    maxActiveBubbles = 3,
} = {}) {
    let bubbles = [];
    const cooldownManager = new BanterCooldownManager();

    // Setup DOM root container if in browser environment
    let rootEl = null;
    if (typeof document !== 'undefined') {
        injectBanterStyles();
        rootEl = document.getElementById('banter-overlay-root');
        if (!rootEl) {
            rootEl = document.createElement('div');
            rootEl.id = 'banter-overlay-root';
            rootEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
            document.body.appendChild(rootEl);
        }
    }

    /**
     * Resolves current 16-element view-projection matrix from Three.js camera.
     */
    function resolveViewProjMatrix() {
        if (typeof getViewProjMatrix === 'function') {
            return getViewProjMatrix();
        }
        if (camera && camera.matrixWorldInverse && camera.projectionMatrix) {
            // viewProjection = projectionMatrix * matrixWorldInverse
            const p = camera.projectionMatrix.elements;
            const v = camera.matrixWorldInverse.elements;
            const vp = new Float32Array(16);

            // Column-major multiplication
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    let sum = 0;
                    for (let k = 0; k < 4; k++) {
                        sum += p[j + k * 4] * v[k + i * 4];
                    }
                    vp[j + i * 4] = sum;
                }
            }
            return vp;
        }
        // Fallback identity matrix for testing
        return [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ];
    }

    /**
     * Spawns a new speech bubble at a 3D world coordinate.
     */
    function spawnBubble({
        character,
        text,
        worldPosition,
        durationMs = 3500,
        priority = BANTER_PRIORITIES.MEDIUM,
        extra = {},
    }) {
        // Enforce max active bubbles by evicting lowest priority or oldest
        if (bubbles.length >= maxActiveBubbles) {
            let victimIdx = 0;
            let lowestPriority = Infinity;
            let oldestAge = -1;

            bubbles.forEach((b, i) => {
                if (b.priority < lowestPriority || (b.priority === lowestPriority && b.elapsed > oldestAge)) {
                    lowestPriority = b.priority;
                    oldestAge = b.elapsed;
                    victimIdx = i;
                }
            });

            removeBubble(victimIdx);
        }

        const charMeta = character || BANTER_CHARACTERS.MATEO;
        const bubble = {
            id: `bubble_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            character: charMeta,
            text,
            worldPosition: { ...worldPosition },
            durationMs,
            priority,
            elapsed: 0,
            opacity: 1,
            screenX: -9999,
            screenY: -9999,
            visible: false,
            domElement: null,
            extra,
        };

        // Create DOM elements if available
        if (rootEl && typeof document !== 'undefined') {
            const el = document.createElement('div');
            el.className = 'banter-bubble-container banter-wobble-active';

            const box = document.createElement('div');
            box.className = 'banter-bubble-box';
            box.style.backgroundColor = charMeta.bgColor || 'rgba(15, 23, 42, 0.95)';
            box.style.borderColor = charMeta.borderColor || '#38bdf8';

            const avatar = document.createElement('div');
            avatar.className = 'banter-avatar';
            avatar.textContent = charMeta.portrait || '💬';

            const content = document.createElement('div');
            content.className = 'banter-content';

            const speaker = document.createElement('div');
            speaker.className = 'banter-speaker-name';
            speaker.style.color = charMeta.color || '#38bdf8';
            speaker.textContent = charMeta.displayName || charMeta.id;

            const textEl = document.createElement('div');
            textEl.className = 'banter-text';
            textEl.textContent = text;

            content.appendChild(speaker);
            content.appendChild(textEl);
            box.appendChild(avatar);
            box.appendChild(content);

            const tail = document.createElement('div');
            tail.className = 'banter-tail';
            tail.style.borderTopColor = charMeta.borderColor || '#38bdf8';

            el.appendChild(box);
            el.appendChild(tail);
            rootEl.appendChild(el);

            bubble.domElement = el;
        }

        // Trigger comic SFX chirp if handler provided
        if (typeof onBanterSound === 'function') {
            try {
                onBanterSound({
                    character: charMeta,
                    pitch: charMeta.voicePitch || 1.0,
                    text,
                });
            } catch (_) {}
        }

        bubbles.push(bubble);
        return bubble;
    }

    /**
     * Removes an active bubble and unmounts DOM element.
     */
    function removeBubble(index) {
        if (index < 0 || index >= bubbles.length) return;
        const b = bubbles[index];
        if (b.domElement) {
            b.domElement.remove();
            b.domElement = null;
        }
        bubbles.splice(index, 1);
    }

    /**
     * Evaluates game state and processes any context events to trigger speech bubbles.
     */
    function evaluateAndTrigger(gameState, contextEvent = null, nowMs = 0) {
        const events = evaluateBanterRules(
            gameState,
            contextEvent,
            nowMs,
            cooldownManager,
            { language }
        );

        const spawned = [];
        for (const ev of events) {
            const b = spawnBubble({
                character: ev.character,
                text: ev.text,
                worldPosition: ev.worldPosition,
                durationMs: ev.durationMs,
                priority: ev.priority,
                extra: ev.extra,
            });
            spawned.push(b);
        }

        return spawned;
    }

    /**
     * Updates positions, screen projections, and lifetimes every frame.
     *
     * @param {number} dt - delta time in seconds
     * @param {number} [screenWidth] - Viewport width
     * @param {number} [screenHeight] - Viewport height
     */
    function update(dt, screenWidth = 1280, screenHeight = 720) {
        const vpMatrix = resolveViewProjMatrix();
        const sw = (typeof window !== 'undefined' ? window.innerWidth : null) || screenWidth;
        const sh = (typeof window !== 'undefined' ? window.innerHeight : null) || screenHeight;

        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            b.elapsed += dt * 1000;

            if (b.elapsed >= b.durationMs) {
                removeBubble(i);
                continue;
            }

            // Fade out during last 400ms
            const remaining = b.durationMs - b.elapsed;
            if (remaining < 400) {
                b.opacity = Math.max(0, remaining / 400);
            } else {
                b.opacity = 1;
            }

            // Project 3D position to 2D screen coordinates
            const proj = projectWorldToScreen(b.worldPosition, vpMatrix, sw, sh);

            if (proj.inFront) {
                const clamped = clampBubbleToViewport(proj.x, proj.y, 280, 80, sw, sh, 20);
                b.screenX = clamped.x;
                b.screenY = clamped.y;
                b.visible = true;

                if (b.domElement) {
                    b.domElement.style.display = 'flex';
                    b.domElement.style.left = `${b.screenX}px`;
                    b.domElement.style.top = `${b.screenY}px`;
                    b.domElement.style.opacity = `${b.opacity}`;
                }
            } else {
                b.visible = false;
                if (b.domElement) {
                    b.domElement.style.display = 'none';
                }
            }
        }
    }

    /**
     * Cleans up all bubbles and DOM elements.
     */
    function dispose() {
        while (bubbles.length > 0) {
            removeBubble(0);
        }
        if (rootEl) {
            rootEl.remove();
            rootEl = null;
        }
        cooldownManager.reset();
    }

    return {
        getActiveBubbles: () => [...bubbles],
        spawnBubble,
        evaluateAndTrigger,
        update,
        dispose,
        cooldownManager,
        setLanguage: (lang) => { language = lang; },
        getLanguage: () => language,
    };
}
