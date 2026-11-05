/**
 * Don't Sink, Don't Die — 1-Click Dockside Crew Class & Hat Carousel Switcher
 * (shared/crew-quick-picker.js)
 *
 * Implements Helmet 01 (Cockpit Pilot) Requirements:
 * - Pre-bake the player's loadout to v0.8 on the title screen for instant launch.
 * - Allow cycling Crew Class (Bureaucrat, Viking, Plague Doctor, Capybara) and Cosmetic Hat
 *   with a single Q/E keypress, direct click on the 3D character preview, or carousel buttons.
 * - Compute stat preview deltas (+knockback, +turn responsiveness, shop discount, aura radius, etc.)
 *   and comedic class taglines.
 * - Persist choices seamlessly in localStorage with fallback.
 * - Pure ES module with zero external dependencies, running in Node.js headless and browser environments.
 */

import {
    SILLY_HATS,
    SILLY_HAT_IDS,
    normalizeSillyHat,
} from './game-settings.js';

import {
    CREW_CLASSES,
    CREW_CLASS_IDS,
} from './crew-classes.js';

export const STORAGE_KEY_CREW_LOADOUT = 'dont_sink_dont_die_quick_loadout_v1';

/**
 * 4 Canonical Quick-Picker Crew Classes with comedic personas, stat profiles,
 * and mapping to underlying rigs/perks.
 */
export const QUICK_PICKER_CLASSES = {
    bureaucrat: {
        id: 'bureaucrat',
        name: 'Bureaucrat',
        title: 'Master of Red Tape',
        icon: '📋',
        tagline: 'Performs tax audits on river monsters; discounts harbor shop permits by 20%.',
        underlyingClassId: 'tinkerer',
        hatStyle: 'spectacles_and_ledger',
        baseStats: {
            turnResponsiveness: 1.0,
            meleeKnockback: 1.0,
            shopDiscount: 0.20,
            reviveAura: 1.0,
            motorBoost: 1.25,
            calmAura: 0.0,
        },
        deltas: [
            { stat: 'Shop Upgrade Cost', deltaText: '-20%', isPositive: true, rawValue: -0.20 },
            { stat: 'Outboard Motor Speed', deltaText: '+25%', isPositive: true, rawValue: 0.25 },
            { stat: 'Audit Resistance', deltaText: '+100%', isPositive: true, rawValue: 1.0 },
            { stat: 'Physical Combat', deltaText: '0% (Filing only)', isPositive: false, rawValue: 0.0 },
        ],
    },
    viking: {
        id: 'viking',
        name: 'Viking',
        title: 'Berserker River Raider',
        icon: '🪓',
        tagline: 'Row fast, smash hard, ask questions when the kraken is turned into calamari.',
        underlyingClassId: 'bruiser',
        hatStyle: 'viking_horned_helm',
        baseStats: {
            turnResponsiveness: 1.0,
            meleeKnockback: 1.25,
            shopDiscount: 0.0,
            reviveAura: 1.0,
            motorBoost: 1.0,
            calmAura: 0.0,
        },
        deltas: [
            { stat: 'Melee Knockback', deltaText: '+25%', isPositive: true, rawValue: 0.25 },
            { stat: 'Swing Arc Width', deltaText: '+25%', isPositive: true, rawValue: 0.25 },
            { stat: 'Bloodlust Fury', deltaText: '+50%', isPositive: true, rawValue: 0.50 },
            { stat: 'Diplomacy', deltaText: '-90%', isPositive: false, rawValue: -0.90 },
        ],
    },
    plague_doctor: {
        id: 'plague_doctor',
        name: 'Plague Doctor',
        title: 'Alchemical Mystic',
        icon: '🩺',
        tagline: 'Prescribes leeches for river rapids; shields against miasma and spreads revive auras.',
        underlyingClassId: 'mystic',
        hatStyle: 'beak_mask_and_cowl',
        baseStats: {
            turnResponsiveness: 1.0,
            meleeKnockback: 1.0,
            shopDiscount: 0.0,
            reviveAura: 1.25,
            motorBoost: 1.0,
            calmAura: 0.15,
        },
        deltas: [
            { stat: 'Block Damage Absorbed', deltaText: '+25%', isPositive: true, rawValue: 0.25 },
            { stat: 'Revive Aura Radius', deltaText: '+25%', isPositive: true, rawValue: 0.25 },
            { stat: 'Leech Healing Factor', deltaText: '+15%', isPositive: true, rawValue: 0.15 },
            { stat: 'Bedside Manner', deltaText: '-50%', isPositive: false, rawValue: -0.50 },
        ],
    },
    capybara: {
        id: 'capybara',
        name: 'Capybara',
        title: 'Zen River Ambassador',
        icon: '🍊',
        tagline: 'Completely unbothered by waterfalls or krakens; balances tangerines on its head for +15% turn zen.',
        underlyingClassId: 'helmsman',
        hatStyle: 'tangerine_crown',
        baseStats: {
            turnResponsiveness: 1.15,
            meleeKnockback: 1.0,
            shopDiscount: 0.05,
            reviveAura: 1.15,
            motorBoost: 1.0,
            calmAura: 0.30,
        },
        deltas: [
            { stat: 'Turn Responsiveness', deltaText: '+15%', isPositive: true, rawValue: 0.15 },
            { stat: 'Current Telemetry Zen', deltaText: '+100%', isPositive: true, rawValue: 1.0 },
            { stat: 'Chill Soaking Aura', deltaText: '+30%', isPositive: true, rawValue: 0.30 },
            { stat: 'Stress Level', deltaText: '-100%', isPositive: true, rawValue: -1.0 },
        ],
    },
};

export const QUICK_PICKER_CLASS_IDS = Object.keys(QUICK_PICKER_CLASSES);

// Standard hats carousel
export const QUICK_PICKER_HATS = SILLY_HATS;
export const QUICK_PICKER_HAT_IDS = SILLY_HAT_IDS.length > 0
    ? SILLY_HAT_IDS
    : ['captain_tricorn', 'viking_horns', 'traffic_cone', 'giant_frog_hat', 'wizard_beard', 'disco_afro'];

// Baseline v0.8 Pre-Baked Loadout: Ready to launch immediately with high-synergy default
export const PRE_BAKED_V08_LOADOUT = Object.freeze({
    classId: 'capybara',
    hatId: 'traffic_cone',
    version: '0.8',
    isReady: true,
});

/**
 * Normalizes an arbitrary class string or id to one of the 4 canonical classes.
 */
export function normalizeQuickClassId(input, fallback = 'viking') {
    if (!input || typeof input !== 'string') return fallback;
    const clean = input.trim().toLowerCase().replace(/[\s-]+/g, '_');

    if (Object.hasOwn(QUICK_PICKER_CLASSES, clean)) {
        return clean;
    }

    // Aliases & legacy class mappings
    if (clean === 'helmsman' || clean === 'navigator' || clean === 'captain') return 'capybara';
    if (clean === 'bruiser' || clean === 'berserker' || clean === 'warrior') return 'viking';
    if (clean === 'tinkerer' || clean === 'artificer' || clean === 'clerk') return 'bureaucrat';
    if (clean === 'mystic' || clean === 'shaman' || clean === 'doctor' || clean === 'plague') return 'plague_doctor';

    return fallback;
}

/**
 * Normalizes hat id using game-settings fallback.
 */
export function normalizeQuickHatId(input, fallback = 'captain_tricorn') {
    return normalizeSillyHat(input, fallback);
}

/**
 * Returns class definition by id or name.
 */
export function getQuickPickerClass(idOrName, fallback = 'viking') {
    const id = normalizeQuickClassId(idOrName, fallback);
    return QUICK_PICKER_CLASSES[id] || QUICK_PICKER_CLASSES.viking;
}

/**
 * Returns hat definition by id or name.
 */
export function getQuickPickerHat(idOrName, fallback = 'captain_tricorn') {
    const id = normalizeQuickHatId(idOrName, fallback);
    return QUICK_PICKER_HATS[id] || QUICK_PICKER_HATS.captain_tricorn;
}

/**
 * Computes comedic tagline for any class or id.
 */
export function getComedicClassTagline(classId) {
    const cls = getQuickPickerClass(classId);
    return cls.tagline;
}

/**
 * Computes stat preview deltas for a class compared to baseline stats.
 * Returns structured array of { stat, deltaText, isPositive, rawValue }.
 */
export function computeStatPreviewDeltas(classId) {
    const cls = getQuickPickerClass(classId);
    return cls.deltas ? [...cls.deltas] : [];
}

/**
 * Safely loads persisted loadout from localStorage with v0.8 pre-baked fallback.
 */
export function loadPersistedLoadout(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    if (!storage) return { ...PRE_BAKED_V08_LOADOUT };
    try {
        const raw = storage.getItem(STORAGE_KEY_CREW_LOADOUT);
        if (!raw) return { ...PRE_BAKED_V08_LOADOUT };
        const parsed = JSON.parse(raw);
        return {
            classId: normalizeQuickClassId(parsed.classId, PRE_BAKED_V08_LOADOUT.classId),
            hatId: normalizeQuickHatId(parsed.hatId, PRE_BAKED_V08_LOADOUT.hatId),
            version: '0.8',
            isReady: true,
        };
    } catch {
        return { ...PRE_BAKED_V08_LOADOUT };
    }
}

/**
 * Saves current loadout to localStorage.
 */
export function savePersistedLoadout(loadout, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    const payload = {
        classId: normalizeQuickClassId(loadout?.classId, PRE_BAKED_V08_LOADOUT.classId),
        hatId: normalizeQuickHatId(loadout?.hatId, PRE_BAKED_V08_LOADOUT.hatId),
        version: '0.8',
        isReady: true,
        timestamp: Date.now(),
    };

    if (storage) {
        try {
            storage.setItem(STORAGE_KEY_CREW_LOADOUT, JSON.stringify(payload));
        } catch (e) {
            console.warn('Unable to persist crew quick-picker loadout:', e);
        }
    }
    return payload;
}

/**
 * Cycles to next or previous class index in the carousel array.
 * Direction: +1 (next) or -1 (prev).
 */
export function cycleClassId(currentClassId, direction = 1) {
    const curr = normalizeQuickClassId(currentClassId, QUICK_PICKER_CLASS_IDS[0]);
    const idx = QUICK_PICKER_CLASS_IDS.indexOf(curr);
    const count = QUICK_PICKER_CLASS_IDS.length;
    const nextIdx = (idx + direction + count) % count;
    return QUICK_PICKER_CLASS_IDS[nextIdx];
}

/**
 * Cycles to next or previous hat index in the carousel array.
 * Direction: +1 (next) or -1 (prev).
 */
export function cycleHatId(currentHatId, direction = 1) {
    const curr = normalizeQuickHatId(currentHatId, QUICK_PICKER_HAT_IDS[0]);
    const idx = QUICK_PICKER_HAT_IDS.indexOf(curr);
    const count = QUICK_PICKER_HAT_IDS.length;
    const nextIdx = (idx + direction + count) % count;
    return QUICK_PICKER_HAT_IDS[nextIdx];
}

/**
 * Core State Machine for Crew Quick Picker.
 * Manages active class, hat, persistence, listeners, and Q/E keybindings.
 */
export function createCrewQuickPickerState(options = {}) {
    const storage = options.storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    const initial = options.initialLoadout || loadPersistedLoadout(storage);

    let activeClassId = normalizeQuickClassId(initial.classId, PRE_BAKED_V08_LOADOUT.classId);
    let activeHatId = normalizeQuickHatId(initial.hatId, PRE_BAKED_V08_LOADOUT.hatId);
    const listeners = new Set();

    function notify() {
        const snapshot = getLoadout();
        for (const fn of listeners) {
            try {
                fn(snapshot);
            } catch (err) {
                console.error('QuickPicker listener error:', err);
            }
        }
    }

    function persist() {
        savePersistedLoadout({ classId: activeClassId, hatId: activeHatId }, storage);
    }

    function setClass(classId) {
        const next = normalizeQuickClassId(classId, activeClassId);
        if (next !== activeClassId) {
            activeClassId = next;
            persist();
            notify();
        }
        return activeClassId;
    }

    function setHat(hatId) {
        const next = normalizeQuickHatId(hatId, activeHatId);
        if (next !== activeHatId) {
            activeHatId = next;
            persist();
            notify();
        }
        return activeHatId;
    }

    function cycleClass(direction = 1) {
        return setClass(cycleClassId(activeClassId, direction));
    }

    function cycleHat(direction = 1) {
        return setHat(cycleHatId(activeHatId, direction));
    }

    /**
     * Handles keyboard events (Q / E / Arrow keys)
     * - 'q' / 'Q' or ArrowLeft: Cycles Class backwards
     * - 'e' / 'E' or ArrowRight: Cycles Class forwards
     * - Shift + Q / ArrowUp: Cycles Hat backwards
     * - Shift + E / ArrowDown: Cycles Hat forwards
     * Returns true if event was handled.
     */
    function handleKeyDown(event) {
        if (!event || typeof event.key !== 'string') return false;
        // Ignore input when user is typing in form fields
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return false;
        }

        const key = event.key.toLowerCase();
        const isShift = !!event.shiftKey;

        if (key === 'q') {
            if (isShift) {
                cycleHat(-1);
            } else {
                cycleClass(-1);
            }
            if (typeof event.preventDefault === 'function') event.preventDefault();
            return true;
        }

        if (key === 'e') {
            if (isShift) {
                cycleHat(1);
            } else {
                cycleClass(1);
            }
            if (typeof event.preventDefault === 'function') event.preventDefault();
            return true;
        }

        if (key === 'arrowleft') {
            cycleClass(-1);
            if (typeof event.preventDefault === 'function') event.preventDefault();
            return true;
        }

        if (key === 'arrowright') {
            cycleClass(1);
            if (typeof event.preventDefault === 'function') event.preventDefault();
            return true;
        }

        if (key === 'arrowup') {
            cycleHat(-1);
            if (typeof event.preventDefault === 'function') event.preventDefault();
            return true;
        }

        if (key === 'arrowdown') {
            cycleHat(1);
            if (typeof event.preventDefault === 'function') event.preventDefault();
            return true;
        }

        return false;
    }

    /**
     * Handles a direct 1-click on the 3D character preview or carousel card.
     * Click on character cycles to next class; clicking with Alt/Ctrl/Shift cycles hat.
     */
    function handlePreviewClick(event = {}) {
        if (event.shiftKey || event.altKey) {
            cycleHat(1);
        } else {
            cycleClass(1);
        }
        return getLoadout();
    }

    function getLoadout() {
        const cls = getQuickPickerClass(activeClassId);
        const hat = getQuickPickerHat(activeHatId);
        const deltas = computeStatPreviewDeltas(activeClassId);

        return {
            classId: activeClassId,
            hatId: activeHatId,
            className: cls.name,
            classTitle: cls.title,
            classIcon: cls.icon,
            tagline: cls.tagline,
            hatName: hat.name,
            hatIcon: hat.icon,
            deltas,
            underlyingClassId: cls.underlyingClassId,
            version: '0.8',
            isPreBaked: true,
        };
    }

    function subscribe(fn) {
        if (typeof fn === 'function') {
            listeners.add(fn);
            // Immediate dispatch with current state
            fn(getLoadout());
        }
        return () => listeners.delete(fn);
    }

    function reset() {
        activeClassId = PRE_BAKED_V08_LOADOUT.classId;
        activeHatId = PRE_BAKED_V08_LOADOUT.hatId;
        persist();
        notify();
        return getLoadout();
    }

    return {
        getClass: () => activeClassId,
        getHat: () => activeHatId,
        setClass,
        setHat,
        cycleClass,
        cycleHat,
        handleKeyDown,
        handlePreviewClick,
        getLoadout,
        subscribe,
        reset,
    };
}

/**
 * Creates and mounts a 1-click Carousel Switcher DOM Widget onto the Title Screen / Cockpit.
 * Designed to fit seamlessly into title-menu or standalone 3D dock preview.
 */
export function mountQuickPickerCarouselUI({
    container,
    pickerState,
    onNavigate,
    documentRef = (typeof document !== 'undefined' ? document : null),
} = {}) {
    if (!container || !documentRef) {
        return null;
    }

    const state = pickerState || createCrewQuickPickerState();

    const root = documentRef.createElement('div');
    root.id = 'dockside-crew-quick-picker';
    root.style.cssText = `
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(56, 189, 248, 0.3);
        border-radius: 12px;
        padding: 14px 18px;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        color: #f8fafc;
        max-width: 440px;
        box-sizing: border-box;
    `;

    // Carousel Header
    const header = documentRef.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 8px;
    `;
    header.innerHTML = `
        <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
            <span>⚡</span> 1-Click Crew Switcher <kbd style="font-family: monospace; font-size: 10px; background: rgba(56,189,248,0.2); border: 1px solid rgba(56,189,248,0.4); border-radius: 4px; padding: 1px 5px; color: #7dd3fc;">[Q / E]</kbd>
        </div>
        <div style="font-size: 11px; color: #94a3b8; font-weight: 600;">v0.8 Pre-Baked</div>
    `;
    root.appendChild(header);

    // Interactive Class Carousel Row
    const classRow = documentRef.createElement('div');
    classRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        padding: 8px 12px;
    `;

    const prevClassBtn = documentRef.createElement('button');
    prevClassBtn.id = 'quick-picker-prev-class';
    prevClassBtn.setAttribute('title', 'Previous Crew Class [Q]');
    prevClassBtn.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
    `;
    prevClassBtn.textContent = '◀';

    const classCenter = documentRef.createElement('div');
    classCenter.id = 'quick-picker-class-card';
    classCenter.style.cssText = `
        flex: 1;
        text-align: center;
        cursor: pointer;
        user-select: none;
    `;

    const nextClassBtn = documentRef.createElement('button');
    nextClassBtn.id = 'quick-picker-next-class';
    nextClassBtn.setAttribute('title', 'Next Crew Class [E]');
    nextClassBtn.style.cssText = prevClassBtn.style.cssText;
    nextClassBtn.textContent = '▶';

    classRow.appendChild(prevClassBtn);
    classRow.appendChild(classCenter);
    classRow.appendChild(nextClassBtn);
    root.appendChild(classRow);

    // Interactive Hat Carousel Row
    const hatRow = documentRef.createElement('div');
    hatRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        padding: 8px 12px;
    `;

    const prevHatBtn = documentRef.createElement('button');
    prevHatBtn.id = 'quick-picker-prev-hat';
    prevHatBtn.setAttribute('title', 'Previous Hat [Shift+Q]');
    prevHatBtn.style.cssText = prevClassBtn.style.cssText;
    prevHatBtn.textContent = '◀';

    const hatCenter = documentRef.createElement('div');
    hatCenter.id = 'quick-picker-hat-card';
    hatCenter.style.cssText = `
        flex: 1;
        text-align: center;
        cursor: pointer;
        user-select: none;
    `;

    const nextHatBtn = documentRef.createElement('button');
    nextHatBtn.id = 'quick-picker-next-hat';
    nextHatBtn.setAttribute('title', 'Next Hat [Shift+E]');
    nextHatBtn.style.cssText = prevClassBtn.style.cssText;
    nextHatBtn.textContent = '▶';

    hatRow.appendChild(prevHatBtn);
    hatRow.appendChild(hatCenter);
    hatRow.appendChild(nextHatBtn);
    root.appendChild(hatRow);

    // Tagline & Stat Preview Block
    const detailsBlock = documentRef.createElement('div');
    detailsBlock.id = 'quick-picker-details';
    detailsBlock.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: rgba(15, 23, 42, 0.6);
        border-radius: 8px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.06);
    `;
    root.appendChild(detailsBlock);

    function updateUI(loadout) {
        // Class View
        classCenter.innerHTML = `
            <div style="font-size: 20px; line-height: 1;">${loadout.classIcon}</div>
            <div style="font-weight: 800; font-size: 14px; color: #fff; margin-top: 2px;">${loadout.className}</div>
            <div style="font-size: 10.5px; color: #94a3b8;">${loadout.classTitle}</div>
        `;

        // Hat View
        hatCenter.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span style="font-size: 18px;">${loadout.hatIcon}</span>
                <span style="font-weight: 700; font-size: 13px; color: #38bdf8;">${loadout.hatName}</span>
            </div>
            <div style="font-size: 10px; color: #cbd5e1; margin-top: 2px;">1-Click Cosmetic</div>
        `;

        // Tagline & Stat Deltas
        const deltasHtml = loadout.deltas.map(d => `
            <div style="display: flex; justify-content: space-between; font-size: 11px;">
                <span style="color: #94a3b8;">${d.stat}</span>
                <span style="font-weight: 700; font-family: monospace; color: ${d.isPositive ? '#4ade80' : '#f87171'};">
                    ${d.deltaText}
                </span>
            </div>
        `).join('');

        detailsBlock.innerHTML = `
            <div style="font-size: 11.5px; font-style: italic; color: #e2e8f0; line-height: 1.35; border-left: 2px solid #38bdf8; padding-left: 8px;">
                "${loadout.tagline}"
            </div>
            <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 3px;">
                ${deltasHtml}
            </div>
        `;

        if (typeof onNavigate === 'function') {
            onNavigate(loadout);
        }
    }

    // Event listeners
    prevClassBtn.addEventListener('click', () => state.cycleClass(-1));
    nextClassBtn.addEventListener('click', () => state.cycleClass(1));
    classCenter.addEventListener('click', () => state.cycleClass(1));

    prevHatBtn.addEventListener('click', () => state.cycleHat(-1));
    nextHatBtn.addEventListener('click', () => state.cycleHat(1));
    hatCenter.addEventListener('click', () => state.cycleHat(1));

    const unsubscribe = state.subscribe(updateUI);

    container.appendChild(root);

    return {
        root,
        state,
        dispose: () => {
            unsubscribe();
            root.remove();
        },
    };
}
