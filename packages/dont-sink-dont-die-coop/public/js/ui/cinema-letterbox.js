/**
 * Don't Sink, Don't Die — Widescreen Cinema Letterbox & Act Splash Title Card Director
 *
 * Requirements:
 * 1. Slide in sleek 7% top/bottom cinema letterbox bars for 2.4 seconds when entering
 *    each of the 4 Biome Acts or triggering The Dread Kraken.
 * 2. Bold stylized title typography, subtitle lore, and threat hazard icons.
 * 3. Never pause player control (pointer-events: none; player can still move, paddle, steer).
 * 4. Zero overlap with core HUD (anchored in letterbox bars / centered splash zone).
 * 5. Instant dismissal on combat input (attacks, parry, space jump, mallet, etc.).
 * 6. Pure state calculation helpers & clean zero-dependency ES module. Headless node:test friendly.
 */

export const LETTERBOX_CONFIG = {
    BAR_HEIGHT_PERCENT: 7, // 7% top, 7% bottom
    DISPLAY_DURATION_SEC: 2.4, // 2.4s active display duration
    SLIDE_IN_SEC: 0.35, // sleek slide-in transition
    SLIDE_OUT_SEC: 0.45, // sleek fade/slide-out transition
};

/**
 * 4 Biome Acts + Dread Kraken Boss encounter splash cards.
 */
export const CINEMA_SPLASH_CARDS = {
    'act-1': {
        id: 'act-1',
        actNumber: 'ACT I',
        title: 'AMBER CANYON HEADWATERS',
        subtitle: 'Carved crimson cliffs & deceptive sunset calm',
        hazardIcon: '🪨',
        hazardLevel: 'THREAT LEVEL: LOW',
        hazardLore: 'Watch for drifting logs and shallow canyon rapids.',
        accentColor: '#f59e0b', // Amber
        secondaryColor: '#d97706',
        zTrigger: 0,
        zEnd: -375,
    },
    'act-2': {
        id: 'act-2',
        actNumber: 'ACT II',
        title: 'NEON HARBOR & SMUGGLER DOCKS',
        subtitle: 'Industrial cranes, smuggler lanterns & spotlight beacons',
        hazardIcon: '⚓',
        hazardLevel: 'THREAT LEVEL: MODERATE',
        hazardLore: 'Patrol skiffs and floating minefields choke the shipping lanes.',
        accentColor: '#38bdf8', // Neon Sky Cyan
        secondaryColor: '#0284c7',
        zTrigger: -375,
        zEnd: -750,
    },
    'act-3': {
        id: 'act-3',
        actNumber: 'ACT III',
        title: 'BIOLUMINESCENT ABYSSAL GORGE',
        subtitle: 'Toxic spore weeping willows & crystal-lit obsidian caverns',
        hazardIcon: '☣️',
        hazardLevel: 'THREAT LEVEL: HIGH',
        hazardLore: 'Corrosive spore clouds and deep trench vortex currents.',
        accentColor: '#10b981', // Bioluminescent Emerald
        secondaryColor: '#059669',
        zTrigger: -750,
        zEnd: -1125,
    },
    'act-4': {
        id: 'act-4',
        actNumber: 'ACT IV',
        title: 'TEMPEST MAELSTROM & CITADEL MOUTH',
        subtitle: 'Ancient sunken marble pillars & lightning-shrouded ruins',
        hazardIcon: '⚡',
        hazardLevel: 'THREAT LEVEL: EXTREME',
        hazardLore: 'Maelstrom tidal surge pulls all vessels toward the maw.',
        accentColor: '#a855f7', // Tempest Purple
        secondaryColor: '#7c3aed',
        zTrigger: -1125,
        zEnd: -1500,
    },
    'kraken': {
        id: 'kraken',
        actNumber: 'BOSS ENCOUNTER',
        title: 'THE DREAD KRAKEN',
        subtitle: 'Terror of the River Mouth • Scourge of the Sunken Citadel',
        hazardIcon: '🐙',
        hazardLevel: 'THREAT LEVEL: APOCALYPTIC',
        hazardLore: 'Multiphase tentacle slams, ink storm blindness & abyssal suction.',
        accentColor: '#ef4444', // Blood Crimson
        secondaryColor: '#b91c1c',
        zTrigger: -1350,
        isBoss: true,
    },
};

/**
 * Returns which act card matches the river coordinate Z.
 * @param {number} z - Raft river position.
 * @returns {object} Card config.
 */
export function getActCardForZ(z) {
    if (z > -375) return CINEMA_SPLASH_CARDS['act-1'];
    if (z > -750) return CINEMA_SPLASH_CARDS['act-2'];
    if (z > -1125) return CINEMA_SPLASH_CARDS['act-3'];
    return CINEMA_SPLASH_CARDS['act-4'];
}

/**
 * Calculates current letterbox bar animation progress [0..1] and opacity [0..1].
 *
 * @param {number} elapsedSec - Seconds since card was triggered.
 * @param {number} duration - Total display duration in seconds (default: 2.4).
 * @param {boolean} dismissed - Whether card was prematurely dismissed by combat input.
 * @returns {{ barFraction: number, contentOpacity: number, isActive: boolean }}
 */
export function calculateLetterboxState(elapsedSec, duration = LETTERBOX_CONFIG.DISPLAY_DURATION_SEC, dismissed = false) {
    if (dismissed || elapsedSec < 0 || elapsedSec >= duration) {
        return {
            barFraction: 0,
            contentOpacity: 0,
            isActive: false,
        };
    }

    const slideIn = LETTERBOX_CONFIG.SLIDE_IN_SEC;
    const slideOut = LETTERBOX_CONFIG.SLIDE_OUT_SEC;
    const fadeOutStart = duration - slideOut;

    let barFraction = 1.0;
    let contentOpacity = 1.0;

    if (elapsedSec < slideIn) {
        // Smooth easing in
        const t = elapsedSec / slideIn;
        barFraction = t * t * (3 - 2 * t); // smoothstep
        contentOpacity = Math.max(0, (elapsedSec - 0.05) / (slideIn - 0.05));
    } else if (elapsedSec > fadeOutStart) {
        // Smooth easing out
        const t = (elapsedSec - fadeOutStart) / slideOut;
        const fade = 1 - t;
        barFraction = Math.max(0, fade * fade);
        contentOpacity = Math.max(0, fade);
    }

    return {
        barFraction,
        contentOpacity,
        isActive: true,
    };
}

/**
 * Creates the Cinema Letterbox & Act Splash Title Card Director.
 *
 * @param {object} [options]
 * @param {HTMLElement} [options.container] - DOM parent element (defaults to document.body).
 * @param {function} [options.onTrigger] - Optional callback when splash begins.
 * @param {function} [options.onDismiss] - Optional callback when splash ends or is dismissed.
 * @returns {object} Controller instance.
 */
export function createCinemaLetterboxDirector(options = {}) {
    const hasDOM = typeof document !== 'undefined';
    const container = options.container || (hasDOM ? document.body : null);
    const onTrigger = options.onTrigger || null;
    const onDismiss = options.onDismiss || null;

    // State tracking
    let currentCard = null;
    let elapsedSec = 0;
    let isDismissed = false;
    let isActive = false;
    let lastTriggeredAct = null;
    let krakenTriggered = false;

    // DOM Elements
    let dom = null;
    let keydownHandler = null;

    if (hasDOM && container) {
        dom = buildCinemaLetterboxDOM(container);

        // Instant dismissal on combat/action keyboard inputs
        keydownHandler = (e) => {
            if (!isActive) return;
            const combatKeys = [
                'Space',
                'KeyJ',
                'KeyK',
                'KeyE',
                'KeyF',
                'KeyQ',
                'KeyR',
                'Digit1',
                'Digit2',
                'Digit3',
                'Digit4',
                'ControlLeft',
                'ShiftLeft',
            ];
            if (combatKeys.includes(e.code)) {
                dismiss('combat_input_key:' + e.code);
            }
        };
        window.addEventListener('keydown', keydownHandler);
    }

    /**
     * Triggers a specific cinematic card (e.g. 'act-1', 'act-2', 'act-3', 'act-4', 'kraken' or custom card object).
     * @param {string|object} cardOrId - Card ID or custom card definition.
     */
    function trigger(cardOrId) {
        let card = typeof cardOrId === 'string' ? CINEMA_SPLASH_CARDS[cardOrId] : cardOrId;
        if (!card) return false;

        currentCard = card;
        elapsedSec = 0;
        isDismissed = false;
        isActive = true;

        if (card.id.startsWith('act-')) {
            lastTriggeredAct = card.id;
        } else if (card.id === 'kraken') {
            krakenTriggered = true;
        }

        if (dom) {
            renderCardDOM(dom, card);
            dom.root.style.display = 'block';
            applyStyles(dom, 0.05, 0.05, true);
        }

        if (typeof onTrigger === 'function') {
            onTrigger(card);
        }
        return true;
    }

    /**
     * Checks raft river position Z and automatically triggers the corresponding Act or Kraken splash once.
     * @param {number} z - Raft river position.
     * @param {boolean} [krakenAwakened=false] - Whether Dread Kraken boss is newly triggered.
     */
    function checkTriggers(z, krakenAwakened = false) {
        if (krakenAwakened && !krakenTriggered) {
            trigger('kraken');
            return;
        }

        const actCard = getActCardForZ(z);
        if (actCard && actCard.id !== lastTriggeredAct) {
            trigger(actCard.id);
        }
    }

    /**
     * Dismisses the active cinematic letterbox immediately (e.g. upon combat input).
     * @param {string} [reason='dismissed']
     */
    function dismiss(reason = 'dismissed') {
        if (!isActive) return;
        isDismissed = true;
        isActive = false;

        if (dom) {
            dom.root.style.display = 'none';
            dom.topBar.style.transform = 'translateY(-100%)';
            dom.bottomBar.style.transform = 'translateY(100%)';
            dom.splashCenter.style.opacity = '0';
        }

        if (typeof onDismiss === 'function') {
            onDismiss(currentCard, reason);
        }
    }

    /**
     * Per-frame update (delta time in seconds).
     * @param {number} dt - Seconds since last frame.
     */
    function update(dt) {
        if (!isActive || !currentCard) return;

        elapsedSec += dt;
        const state = calculateLetterboxState(elapsedSec, LETTERBOX_CONFIG.DISPLAY_DURATION_SEC, isDismissed);

        if (!state.isActive) {
            dismiss('completed');
            return;
        }

        if (dom) {
            applyStyles(dom, state.barFraction, state.contentOpacity, true);
        }
    }

    /**
     * Cleans up listeners and removes DOM elements.
     */
    function dispose() {
        dismiss('disposed');
        if (hasDOM && keydownHandler) {
            window.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }
        if (dom && dom.root) {
            dom.root.remove();
            dom = null;
        }
    }

    return {
        trigger,
        checkTriggers,
        dismiss,
        update,
        dispose,
        isActive: () => isActive,
        getCurrentCard: () => currentCard,
        getElapsed: () => elapsedSec,
        getLastAct: () => lastTriggeredAct,
        isKrakenTriggered: () => krakenTriggered,
        getDom: () => dom,
    };
}

/**
 * Builds the sleek 7% widescreen top/bottom letterbox DOM and center typography splash card.
 * @param {HTMLElement} parent
 */
function buildCinemaLetterboxDOM(parent) {
    const root = document.createElement('div');
    root.id = 'cinema-letterbox-root';
    root.style.cssText = `
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9998;
        display: none;
        user-select: none;
        overflow: hidden;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // 7% Top Widescreen Letterbox Bar
    const topBar = document.createElement('div');
    topBar.id = 'cinema-bar-top';
    topBar.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: ${LETTERBOX_CONFIG.BAR_HEIGHT_PERCENT}vh;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.98) 0%, rgba(5, 7, 12, 0.94) 80%, rgba(10, 15, 25, 0.75) 100%);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8), inset 0 -1px 0 rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        box-sizing: border-box;
        transform: translateY(-100%);
        transition: transform 0.05s linear;
    `;

    // Top Bar Inner Left: Act Tag / Status
    const topBarLeft = document.createElement('div');
    topBarLeft.id = 'cinema-top-left';
    topBarLeft.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #94a3b8;
    `;
    topBar.appendChild(topBarLeft);

    // Top Bar Inner Right: Threat Level Badge
    const topBarRight = document.createElement('div');
    topBarRight.id = 'cinema-top-right';
    topBarRight.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        padding: 3px 10px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(0, 0, 0, 0.4);
    `;
    topBar.appendChild(topBarRight);

    // 7% Bottom Widescreen Letterbox Bar
    const bottomBar = document.createElement('div');
    bottomBar.id = 'cinema-bar-bottom';
    bottomBar.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: ${LETTERBOX_CONFIG.BAR_HEIGHT_PERCENT}vh;
        background: linear-gradient(0deg, rgba(0, 0, 0, 0.98) 0%, rgba(5, 7, 12, 0.94) 80%, rgba(10, 15, 25, 0.75) 100%);
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        box-sizing: border-box;
        transform: translateY(100%);
        transition: transform 0.05s linear;
    `;

    // Bottom Bar Inner Left: Subtitle lore ticker
    const bottomBarLeft = document.createElement('div');
    bottomBarLeft.id = 'cinema-bottom-lore';
    bottomBarLeft.style.cssText = `
        font-size: 11px;
        font-style: italic;
        color: #cbd5e1;
        letter-spacing: 0.04em;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    bottomBar.appendChild(bottomBarLeft);

    // Bottom Bar Inner Right: Control hint
    const bottomBarRight = document.createElement('div');
    bottomBarRight.style.cssText = `
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #64748b;
    `;
    bottomBarRight.innerHTML = `<span>COMBAT READY • ANY ATTACK DISMISSES</span>`;
    bottomBar.appendChild(bottomBarRight);

    // Center Act Splash Card (anchored at center-top to avoid blocking raft or weapon aim)
    const splashCenter = document.createElement('div');
    splashCenter.id = 'cinema-splash-center';
    splashCenter.style.cssText = `
        position: absolute;
        top: 15%;
        left: 50%;
        transform: translate(-50%, 0);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        opacity: 0;
        transition: opacity 0.1s linear;
        max-width: 90vw;
    `;

    const actBadge = document.createElement('div');
    actBadge.id = 'cinema-act-badge';
    actBadge.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11.5px;
        font-weight: 800;
        letter-spacing: 0.25em;
        text-transform: uppercase;
        padding: 4px 16px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.2);
        margin-bottom: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    `;

    const actTitle = document.createElement('div');
    actTitle.id = 'cinema-act-title';
    actTitle.style.cssText = `
        font-size: clamp(26px, 4.2vw, 46px);
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #ffffff;
        text-shadow: 0 4px 18px rgba(0, 0, 0, 0.95), 0 0 35px rgba(255, 255, 255, 0.3);
        margin: 0;
        line-height: 1.1;
    `;

    const actSubtitle = document.createElement('div');
    actSubtitle.id = 'cinema-act-subtitle';
    actSubtitle.style.cssText = `
        font-size: clamp(12px, 1.5vw, 15px);
        font-weight: 600;
        letter-spacing: 0.08em;
        color: #e2e8f0;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9);
        margin-top: 6px;
        max-width: 700px;
    `;

    splashCenter.appendChild(actBadge);
    splashCenter.appendChild(actTitle);
    splashCenter.appendChild(actSubtitle);

    root.appendChild(topBar);
    root.appendChild(bottomBar);
    root.appendChild(splashCenter);
    parent.appendChild(root);

    return {
        root,
        topBar,
        bottomBar,
        topBarLeft,
        topBarRight,
        bottomBarLeft,
        splashCenter,
        actBadge,
        actTitle,
        actSubtitle,
    };
}

/**
 * Updates DOM inner contents with card data.
 */
function renderCardDOM(dom, card) {
    const accent = card.accentColor || '#38bdf8';

    // Top Bar
    dom.topBarLeft.innerHTML = `
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${accent}; box-shadow:0 0 10px ${accent};"></span>
        <span style="color:#fff;">${card.actNumber || 'BIOME'}</span>
        <span style="opacity:0.4;">|</span>
        <span style="color:${accent};">${card.title}</span>
    `;

    dom.topBarRight.innerHTML = `
        <span style="font-size:14px;">${card.hazardIcon || '⚠️'}</span>
        <span style="color:${accent}; font-weight:800;">${card.hazardLevel || 'HAZARD'}</span>
    `;
    dom.topBarRight.style.borderColor = accent + '44';

    // Bottom Bar
    dom.bottomBarLeft.innerHTML = `
        <span style="color:${accent}; font-weight:700;">LORE:</span>
        <span>${card.hazardLore || card.subtitle}</span>
    `;

    // Center Splash Card
    dom.actBadge.innerHTML = `
        <span>${card.hazardIcon || '⚔️'}</span>
        <span style="color:${accent};">${card.actNumber || 'ACT'}</span>
        <span>•</span>
        <span style="color:#f8fafc;">${card.isBoss ? 'MAJOR THREAT' : 'RIVER SECTOR'}</span>
    `;
    dom.actBadge.style.borderColor = accent + '55';

    dom.actTitle.textContent = card.title;
    dom.actTitle.style.textShadow = `0 4px 20px rgba(0,0,0,0.95), 0 0 35px ${accent}66`;

    dom.actSubtitle.textContent = card.subtitle;
}

/**
 * Applies animated slide and opacity styles to DOM elements.
 */
function applyStyles(dom, barFraction, contentOpacity, isVisible) {
    if (!isVisible || barFraction <= 0.001) {
        dom.root.style.display = 'none';
        return;
    }

    dom.root.style.display = 'block';

    // Slide bars in from top and bottom
    const topTranslate = (-100 * (1 - barFraction)).toFixed(2);
    const bottomTranslate = (100 * (1 - barFraction)).toFixed(2);
    dom.topBar.style.transform = `translateY(${topTranslate}%)`;
    dom.bottomBar.style.transform = `translateY(${bottomTranslate}%)`;

    // Fade center splash card
    dom.splashCenter.style.opacity = contentOpacity.toFixed(3);
    const scale = (0.95 + 0.05 * barFraction).toFixed(3);
    dom.splashCenter.style.transform = `translate(-50%, 0) scale(${scale})`;
}
