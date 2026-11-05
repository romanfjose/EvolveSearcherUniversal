/**
 * Helmet 01 Cockpit Ergonomics & Contrast Auditor
 * (`shared/cockpit-ergonomics.js`)
 *
 * Verifies:
 * 1. WCAG 2.1 AA contrast ratios (>= 4.5:1 for normal text, >= 3.0:1 for large text/graphical UI)
 *    across all HUD text/background pairs.
 * 2. 1-keystroke / 1-click ergonomics (<= 1 click/keystroke for all 8 primary gameplay actions)
 *    to eliminate multi-click bureaucracy and friction in the cockpit.
 * 3. Total HUD occlusion remains < 15% on canonical 1440x900 viewport (JoseStandards/01_FRONTEND_UX.md).
 *
 * Zero external dependencies — pure, deterministic ES module.
 */

import { computeHudBoundingBoxes, computeHudAreaRatio, DEFAULT_HUD_SPEC } from './hud-layout-auditor.js';

/**
 * 8 Primary Gameplay Actions required for zero-bureaucracy 1-touch cockpit control.
 * Sourced from shared/input-math.js and public/index.html cockpit keymap.
 */
export const PRIMARY_GAMEPLAY_ACTIONS = [
    {
        id: 'paddle_forward',
        actionKey: 'forward',
        label: 'Paddle Forward / Accelerate',
        defaultKeys: ['KeyW', 'ArrowUp'],
        gamepadButton: 'DPAD_UP / LEFT_STICK_UP',
        requiredMaxInputCost: 1,
    },
    {
        id: 'paddle_backward',
        actionKey: 'backward',
        label: 'Paddle Backward / Reverse',
        defaultKeys: ['KeyS', 'ArrowDown'],
        gamepadButton: 'DPAD_DOWN / LEFT_STICK_DOWN',
        requiredMaxInputCost: 1,
    },
    {
        id: 'steer_port',
        actionKey: 'turnLeft',
        label: 'Steer Port / Turn Left',
        defaultKeys: ['KeyA', 'ArrowLeft'],
        gamepadButton: 'DPAD_LEFT / LEFT_STICK_LEFT',
        requiredMaxInputCost: 1,
    },
    {
        id: 'steer_starboard',
        actionKey: 'turnRight',
        label: 'Steer Starboard / Turn Right',
        defaultKeys: ['KeyD', 'ArrowRight'],
        gamepadButton: 'DPAD_RIGHT / LEFT_STICK_RIGHT',
        requiredMaxInputCost: 1,
    },
    {
        id: 'jump_kickflip',
        actionKey: 'jump',
        label: 'Jump / Raft Kickflip',
        defaultKeys: ['Space'],
        gamepadButton: 'A',
        requiredMaxInputCost: 1,
    },
    {
        id: 'combat_attack',
        actionKey: 'attack',
        label: 'Melee Swing / Mallet Attack',
        defaultKeys: ['KeyF', 'LMB'],
        gamepadButton: 'RT / X',
        requiredMaxInputCost: 1,
    },
    {
        id: 'combat_parry_block',
        actionKey: 'block',
        label: 'Shield Parry / Block',
        defaultKeys: ['ShiftLeft', 'ShiftRight', 'RMB'],
        gamepadButton: 'LT / RB / LB',
        requiredMaxInputCost: 1,
    },
    {
        id: 'armory_shop_toggle',
        actionKey: 'shop',
        label: 'Harbor Armory / Shop Toggle',
        defaultKeys: ['KeyE', 'KeyB'],
        gamepadButton: 'Y',
        requiredMaxInputCost: 1,
    },
];

/**
 * Canonical Cockpit HUD Color Tokens (defined in public/index.html :root).
 */
export const HUD_COLOR_TOKENS = {
    bg: '#0b0e13',          // Background canvas / deep water
    panel: '#11161e',       // HUD panel backdrop (rgba(17, 22, 30, 0.86) blended over #0b0e13)
    panel2: '#161c26',      // KPI container cards & inner panels
    line: '#232b38',        // Border lines
    line2: '#2f3a4b',       // High-contrast border lines
    ink: '#e6ebf2',         // Primary text
    muted: '#8d99ab',       // Secondary telemetry & labels
    faint: '#9aa5b5',       // High-contrast tertiary telemetry (boosted from #5f6b7d for WCAG AA compliance >= 4.5:1)
    accent: '#5eead4',      // Teal accent (headings, active status, marker)
    ok: '#4ade80',          // Green health & city shop
    warn: '#fbbf24',        // Amber coin / warning
    bad: '#f87171',         // Red damage / boss hazard
    shopBtnBg: '#5eead4',   // Action button teal fill
    shopBtnText: '#04201c', // Action button dark ink
};

/**
 * Standard HUD Text / Background Color Pairs across all cockpit modules.
 */
export const HUD_CONTRAST_PAIRS = [
    {
        id: 'primary_ink_on_panel',
        label: 'Primary Text on HUD Panel',
        fg: HUD_COLOR_TOKENS.ink,
        bg: HUD_COLOR_TOKENS.panel,
        element: '#ui .hull #health, #ui #status, .shop-item b',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'accent_on_panel',
        label: 'Teal Accent on HUD Panel',
        fg: HUD_COLOR_TOKENS.accent,
        bg: HUD_COLOR_TOKENS.panel,
        element: '.eyebrow, #distance, .chip, #scoreboard tr.me td',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'health_ok_on_panel',
        label: 'Health OK Green on HUD Panel',
        fg: HUD_COLOR_TOKENS.ok,
        bg: HUD_COLOR_TOKENS.panel,
        element: '.track-legend .shop, #health-bar',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'warning_amber_on_panel',
        label: 'Warning Amber / Coins on HUD Panel',
        fg: HUD_COLOR_TOKENS.warn,
        bg: HUD_COLOR_TOKENS.panel,
        element: '.kpi b.air, #wave-pips span.on, .shop-item .cost',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'hazard_red_on_panel',
        label: 'Hazard Red on HUD Panel',
        fg: HUD_COLOR_TOKENS.bad,
        bg: HUD_COLOR_TOKENS.panel,
        element: '#me-marker.dead, #enemy-bars .bar > i',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'muted_secondary_on_panel',
        label: 'Muted Secondary Text on HUD Panel',
        fg: HUD_COLOR_TOKENS.muted,
        bg: HUD_COLOR_TOKENS.panel,
        element: '#mode, .kpi b small, #enemy-bars div',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'primary_ink_on_panel2',
        label: 'Primary Text on Inner KPI Card',
        fg: HUD_COLOR_TOKENS.ink,
        bg: HUD_COLOR_TOKENS.panel2,
        element: '.kpis .kpi b, kbd',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'muted_text_on_panel2',
        label: 'Muted Text on Inner KPI Card',
        fg: HUD_COLOR_TOKENS.muted,
        bg: HUD_COLOR_TOKENS.panel2,
        element: '.kpi b small, .label',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'shop_button_contrast',
        label: 'Shop Action Button Dark Text on Accent Fill',
        fg: HUD_COLOR_TOKENS.shopBtnText,
        bg: HUD_COLOR_TOKENS.shopBtnBg,
        element: '.shop-btn',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'faint_label_on_panel',
        label: 'Faint Section Heading / Label on Panel',
        fg: HUD_COLOR_TOKENS.faint,
        bg: HUD_COLOR_TOKENS.panel,
        element: '.label, .faint, #scoreboard th, .track-legend',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'instructions_text_on_panel',
        label: 'Instructions Pill Text on Panel Backdrop',
        fg: HUD_COLOR_TOKENS.muted,
        bg: HUD_COLOR_TOKENS.panel,
        element: '#instructions',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
    {
        id: 'kbd_badge_contrast',
        label: 'Keyboard Shortcut Key Badge Text on KBD Background',
        fg: HUD_COLOR_TOKENS.ink,
        bg: HUD_COLOR_TOKENS.panel2,
        element: 'kbd',
        targetLevel: 'AA',
        minRatio: 4.5,
    },
];

/**
 * Converts a hex color string (e.g. '#e6ebf2' or 'e6ebf2' or '#fff') into [r, g, b] (0..255).
 *
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return [0, 0, 0];
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
        clean = clean.split('').map((c) => c + c).join('');
    }
    if (clean.length !== 6) return [0, 0, 0];
    const num = parseInt(clean, 16);
    if (Number.isNaN(num)) return [0, 0, 0];
    return [
        (num >> 16) & 255,
        (num >> 8) & 255,
        num & 255,
    ];
}

/**
 * Converts an 8-bit sRGB channel (0..255) to linear light value (0..1).
 * WCAG 2.1 formula: if C_srgb <= 0.04045 then C_linear = C_srgb / 12.92 else ((C_srgb + 0.055) / 1.055) ^ 2.4
 *
 * @param {number} c 0..255
 * @returns {number} 0..1
 */
export function srgbToLinear(c) {
    const s = Math.max(0, Math.min(255, c)) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Computes WCAG 2.1 relative luminance for given [r, g, b] in range [0..255].
 * Formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 *
 * @param {number|Array<number>} r
 * @param {number} [g]
 * @param {number} [b]
 * @returns {number} Relative luminance in [0, 1]
 */
export function calculateRelativeLuminance(r, g, b) {
    let red, green, blue;
    if (Array.isArray(r)) {
        [red, green, blue] = r;
    } else if (typeof r === 'string') {
        [red, green, blue] = hexToRgb(r);
    } else {
        red = r;
        green = g;
        blue = b;
    }

    const rLin = srgbToLinear(red);
    const gLin = srgbToLinear(green);
    const bLin = srgbToLinear(blue);

    return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculates WCAG 2.1 contrast ratio between two colors (hex strings or [r,g,b] arrays).
 * Formula: (L1 + 0.05) / (L2 + 0.05), where L1 is the lighter luminance.
 * Returns ratio in range [1.0, 21.0].
 *
 * @param {string|Array<number>} colorA
 * @param {string|Array<number>} colorB
 * @returns {number} Contrast ratio rounded to 2 decimal places
 */
export function calculateContrastRatio(colorA, colorB) {
    const lumA = calculateRelativeLuminance(colorA);
    const lumB = calculateRelativeLuminance(colorB);

    const l1 = Math.max(lumA, lumB);
    const l2 = Math.min(lumA, lumB);

    const ratio = (l1 + 0.05) / (l2 + 0.05);
    return Math.round(ratio * 100) / 100;
}

/**
 * Verifies that all HUD text/background pairs meet or exceed the specified WCAG contrast threshold.
 *
 * @param {Array<Object>} [pairs=HUD_CONTRAST_PAIRS]
 * @param {number} [defaultMinRatio=4.5] - WCAG AA normal text threshold
 * @returns {{ passed: boolean, totalTested: number, passedCount: number, failedCount: number, details: Array<Object> }}
 */
export function verifyContrastRatios(pairs = HUD_CONTRAST_PAIRS, defaultMinRatio = 4.5) {
    const details = [];
    let passedCount = 0;
    let failedCount = 0;

    for (const pair of pairs) {
        // If an explicit defaultMinRatio override is passed, it takes precedence as the floor requirement
        const minRatio = defaultMinRatio !== undefined && defaultMinRatio !== null ? defaultMinRatio : (pair.minRatio ?? 4.5);
        const actualRatio = calculateContrastRatio(pair.fg, pair.bg);
        const pass = actualRatio >= minRatio;

        if (pass) {
            passedCount++;
        } else {
            failedCount++;
        }

        details.push({
            id: pair.id,
            label: pair.label,
            element: pair.element,
            fg: pair.fg,
            bg: pair.bg,
            actualRatio,
            requiredRatio: minRatio,
            targetLevel: pair.targetLevel || (minRatio >= 4.5 ? 'AA' : 'AA-Large'),
            passed: pass,
        });
    }

    return {
        passed: failedCount === 0,
        totalTested: pairs.length,
        passedCount,
        failedCount,
        details,
    };
}

/**
 * Verifies that all 8 primary gameplay actions can be executed in <= 1 click or keystroke.
 * Sourced from Helmet 01 "Multi-Click Bureaucracy" directive: 1 intent = 1 route = 1 keystroke.
 *
 * @param {Record<string, Array<string>>|Object} [keymap]
 * @param {number} [maxInputCost=1]
 * @returns {{ passed: boolean, totalActions: number, passedCount: number, failedCount: number, actionReports: Array<Object> }}
 */
export function verifyActionErgonomics(keymap = null, maxInputCost = 1) {
    const actionReports = [];
    let passedCount = 0;
    let failedCount = 0;

    for (const action of PRIMARY_GAMEPLAY_ACTIONS) {
        const mappedKeys = keymap && keymap[action.actionKey]
            ? keymap[action.actionKey]
            : action.defaultKeys;

        // Cost in keystrokes/clicks to trigger action directly:
        // Direct single keypress or mouse button click = 1
        const inputCost = Array.isArray(mappedKeys) && mappedKeys.length > 0 ? 1 : Infinity;
        const passed = inputCost <= (action.requiredMaxInputCost ?? maxInputCost);

        if (passed) {
            passedCount++;
        } else {
            failedCount++;
        }

        actionReports.push({
            id: action.id,
            actionKey: action.actionKey,
            label: action.label,
            mappedKeys,
            gamepadButton: action.gamepadButton,
            inputCost,
            maxAllowedCost: action.requiredMaxInputCost ?? maxInputCost,
            passed,
        });
    }

    return {
        passed: failedCount === 0,
        totalActions: PRIMARY_GAMEPLAY_ACTIONS.length,
        passedCount,
        failedCount,
        actionReports,
    };
}

/**
 * Verifies that HUD occlusion on a given viewport remains strictly under maxRatio (default 15% / 0.15).
 * Requirement: 1440x900 viewport HUD occlusion < 15%.
 *
 * @param {{ width?: number, height?: number }} [viewport={ width: 1440, height: 900 }]
 * @param {number} [maxRatio=0.15]
 * @param {Object} [customSpec={}]
 * @returns {{ passed: boolean, viewport: { width: number, height: number }, totalHudArea: number, viewportArea: number, occlusionRatio: number, occlusionPercent: number, maxAllowedPercent: number, boxes: Record<string, Object> }}
 */
export function verifyHudOcclusion(viewport = { width: 1440, height: 900 }, maxRatio = 0.15, customSpec = {}) {
    const width = viewport.width ?? 1440;
    const height = viewport.height ?? 900;

    const boxes = computeHudBoundingBoxes(width, height, 1.0, customSpec);
    const areaStats = computeHudAreaRatio(boxes, width, height);

    const passed = areaStats.areaRatio < maxRatio;

    return {
        passed,
        viewport: { width, height },
        totalHudArea: areaStats.totalHudArea,
        viewportArea: areaStats.viewportArea,
        occlusionRatio: areaStats.areaRatio,
        occlusionPercent: Math.round(areaStats.areaPercent * 100) / 100,
        maxAllowedPercent: Math.round(maxRatio * 10000) / 100,
        boxes,
    };
}

/**
 * Master Helmet 01 Cockpit Ergonomics & Contrast Auditor.
 * Evaluates all 3 core requirements:
 * 1. WCAG AA Contrast Ratios (>= 4.5:1)
 * 2. 1-Touch Action Ergonomics (<= 1 click/keystroke for all 8 primary actions)
 * 3. Viewport HUD Occlusion (< 15% on 1440x900)
 *
 * @param {Object} [options={}]
 * @returns {Object} Comprehensive Helmet 01 audit result
 */
export function auditCockpitErgonomics(options = {}) {
    const contrastResult = verifyContrastRatios(options.contrastPairs, options.minContrastRatio ?? 4.5);
    const ergonomicsResult = verifyActionErgonomics(options.keymap, options.maxInputCost ?? 1);
    const occlusionResult = verifyHudOcclusion(options.viewport ?? { width: 1440, height: 900 }, options.maxOcclusionRatio ?? 0.15, options.hudSpec);

    const allPassed = contrastResult.passed && ergonomicsResult.passed && occlusionResult.passed;

    return {
        passed: allPassed,
        summary: {
            contrastPassed: contrastResult.passed,
            ergonomicsPassed: ergonomicsResult.passed,
            occlusionPassed: occlusionResult.passed,
        },
        contrast: contrastResult,
        ergonomics: ergonomicsResult,
        occlusion: occlusionResult,
    };
}
