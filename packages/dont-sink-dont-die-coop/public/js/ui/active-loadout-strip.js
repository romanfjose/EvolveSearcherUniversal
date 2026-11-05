/**
 * Don't Sink, Don't Die — Compact Active Tarot & Gadget Cooldown Strip
 * (`public/js/ui/active-loadout-strip.js`)
 *
 * Requirements (Sovereign Core & Helmet 01 Cockpit Directive):
 * - Render a sleek single-row icon strip below #hud / #ui showing equipped Tarot blessings
 *   and active Raft Gadgets (Auto-Harpoon, Shield Dome, Nitro Keg, Repair Drone).
 * - Radial SVG cooldown sweeps for active abilities/gadgets in cooldown or charging.
 * - 1-line crisp hover tooltips (name + key benefit or status).
 * - Pure calculation helpers with zero dependencies, 100% headless testable.
 * - Glassmorphic high-contrast cockpit styling matching game aesthetic.
 */

import { GADGET_TYPES, GADGET_CONFIGS } from '../../../shared/raft-gadgets.js';
import { TAROT_CARDS, TAROT_CARD_IDS } from '../../../shared/dream-tarot.js';

/**
 * Standard visual & gameplay metadata for active raft gadgets.
 */
export const GADGET_META = {
    [GADGET_TYPES.HARPOON]: {
        id: GADGET_TYPES.HARPOON,
        name: 'Auto-Harpoon',
        fullName: 'Bow Harpoon Ballista',
        slot: 'bow',
        icon: '🏹',
        color: '#38bdf8',
        accentHex: 0x38bdf8,
        tooltip: 'Auto-Harpoon: Fires tethered bolt every 1.8s (28 dmg)',
        getCooldownFraction: (gadgetState, now = 0) => {
            if (!gadgetState?.installed?.[GADGET_TYPES.HARPOON]) return 0;
            const cfg = GADGET_CONFIGS[GADGET_TYPES.HARPOON];
            const last = gadgetState.harpoon?.lastFireTime ?? -Infinity;
            const elapsed = now - last;
            if (elapsed >= cfg.fireIntervalMs || last <= 0) return 0;
            return Math.max(0, Math.min(1, 1 - elapsed / cfg.fireIntervalMs));
        },
        getStatusText: (gadgetState, now = 0) => {
            if (!gadgetState?.installed?.[GADGET_TYPES.HARPOON]) return 'Not Installed';
            const cfg = GADGET_CONFIGS[GADGET_TYPES.HARPOON];
            const last = gadgetState.harpoon?.lastFireTime ?? -Infinity;
            const elapsed = now - last;
            if (elapsed >= cfg.fireIntervalMs || last <= 0) return 'READY';
            const rem = ((cfg.fireIntervalMs - elapsed) / 1000).toFixed(1);
            return `${rem}s`;
        },
    },
    [GADGET_TYPES.SHIELD_DOME]: {
        id: GADGET_TYPES.SHIELD_DOME,
        name: 'Shield Dome',
        fullName: 'Arcane Shockwave Bell',
        slot: 'center',
        icon: '🔔',
        color: '#fbbf24',
        accentHex: 0xfbbf24,
        tooltip: 'Shield Dome: Parries throws & repels foes on cooldown (8s)',
        getCooldownFraction: (gadgetState, now = 0) => {
            if (!gadgetState?.installed?.[GADGET_TYPES.SHIELD_DOME]) return 0;
            const cfg = GADGET_CONFIGS[GADGET_TYPES.SHIELD_DOME];
            const last = gadgetState.shieldDome?.lastActivatedTime ?? -Infinity;
            const elapsed = now - last;
            if (elapsed >= cfg.cooldownMs || last <= 0) return 0;
            return Math.max(0, Math.min(1, 1 - elapsed / cfg.cooldownMs));
        },
        getStatusText: (gadgetState, now = 0) => {
            if (!gadgetState?.installed?.[GADGET_TYPES.SHIELD_DOME]) return 'Not Installed';
            const cfg = GADGET_CONFIGS[GADGET_TYPES.SHIELD_DOME];
            const last = gadgetState.shieldDome?.lastActivatedTime ?? -Infinity;
            const elapsed = now - last;
            if (elapsed >= cfg.cooldownMs || last <= 0) return 'READY';
            const rem = ((cfg.cooldownMs - elapsed) / 1000).toFixed(1);
            return `${rem}s`;
        },
    },
    [GADGET_TYPES.NITRO_KEG]: {
        id: GADGET_TYPES.NITRO_KEG,
        name: 'Nitro Keg',
        fullName: 'Twin Nitro Hydro-Jets',
        slot: 'stern',
        icon: '🚀',
        color: '#f97316',
        accentHex: 0xf97316,
        tooltip: 'Nitro Keg: +220N hydro-jet boost (recharging fuel gauge)',
        getCooldownFraction: (gadgetState) => {
            if (!gadgetState?.installed?.[GADGET_TYPES.NITRO_KEG]) return 0;
            const nitro = gadgetState.nitroKeg;
            const max = GADGET_CONFIGS[GADGET_TYPES.NITRO_KEG].maxFuel;
            const fuel = nitro?.fuel ?? max;
            // Cooldown sweep shows fraction missing (depleted)
            return Math.max(0, Math.min(1, 1 - fuel / max));
        },
        getStatusText: (gadgetState) => {
            if (!gadgetState?.installed?.[GADGET_TYPES.NITRO_KEG]) return 'Not Installed';
            const nitro = gadgetState.nitroKeg;
            const max = GADGET_CONFIGS[GADGET_TYPES.NITRO_KEG].maxFuel;
            const pct = Math.round(((nitro?.fuel ?? max) / max) * 100);
            return `${pct}%`;
        },
    },
    [GADGET_TYPES.REPAIR_DRONE]: {
        id: GADGET_TYPES.REPAIR_DRONE,
        name: 'Repair Drone',
        fullName: 'Clockwork Pelican Lantern',
        slot: 'companion',
        icon: '🕊️',
        color: '#4ade80',
        accentHex: 0x4ade80,
        tooltip: 'Repair Drone: 12m aura passively heals crewmates (4.5 HP/s)',
        getCooldownFraction: (gadgetState, now = 0) => {
            if (!gadgetState?.installed?.[GADGET_TYPES.REPAIR_DRONE]) return 0;
            const cfg = GADGET_CONFIGS[GADGET_TYPES.REPAIR_DRONE];
            const last = gadgetState.repairDrone?.lastHealTick ?? -Infinity;
            const elapsed = now - last;
            if (elapsed >= cfg.healTickIntervalMs || last <= 0) return 0;
            return Math.max(0, Math.min(1, 1 - elapsed / cfg.healTickIntervalMs));
        },
        getStatusText: (gadgetState) => {
            if (!gadgetState?.installed?.[GADGET_TYPES.REPAIR_DRONE]) return 'Not Installed';
            const targets = gadgetState.repairDrone?.beamTargets?.length ?? 0;
            return targets > 0 ? `BEAM (${targets})` : 'ACTIVE';
        },
    },
};

/**
 * 1-line concise tooltip for Tarot cards.
 *
 * @param {string|object} cardOrId
 * @returns {string} Clean single-line description
 */
export function getTarotTooltip(cardOrId) {
    const id = typeof cardOrId === 'string' ? cardOrId : cardOrId?.id;
    const card = TAROT_CARDS[id];
    if (!card) return 'Unknown Blessing';
    return `${card.icon} ${card.name} (${card.arcana}): ${card.description}`;
}

/**
 * 1-line concise tooltip for Raft Gadgets.
 *
 * @param {string} gadgetId
 * @param {object} [gadgetState]
 * @param {number} [now]
 * @returns {string} Clean single-line description
 */
export function getGadgetTooltip(gadgetId, gadgetState = null, now = 0) {
    const meta = GADGET_META[gadgetId];
    if (!meta) return 'Unknown Gadget';
    if (!gadgetState) return meta.tooltip;
    const isInstalled = Boolean(gadgetState.installed?.[gadgetId]);
    if (!isInstalled) return `${meta.name} (Not Installed) — ${meta.tooltip}`;
    const status = meta.getStatusText(gadgetState, now);
    return `${meta.icon} ${meta.fullName} [${status}] — ${meta.tooltip}`;
}

/**
 * Computes SVG stroke-dasharray and stroke-dashoffset for a circle radial cooldown sweep.
 *
 * @param {number} radius - Radius of the circular path
 * @param {number} fraction - Cooldown fraction (0.0 = ready / 0% sweep, 1.0 = fully on cooldown / 100% sweep)
 * @returns {{ circumference: number, strokeDasharray: string, strokeDashoffset: number }}
 */
export function calculateRadialSvgSweep(radius, fraction) {
    const r = Math.max(0.1, radius);
    const clamped = Math.max(0, Math.min(1, fraction || 0));
    const circumference = 2 * Math.PI * r;
    // When fraction = 1 (full cooldown), strokeDashoffset = 0 (full circle stroke visible)
    // When fraction = 0 (ready), strokeDashoffset = circumference (stroke hidden)
    const strokeDashoffset = circumference * (1 - clamped);

    return {
        circumference,
        strokeDasharray: `${circumference.toFixed(2)} ${circumference.toFixed(2)}`,
        strokeDashoffset: Number(strokeDashoffset.toFixed(2)),
    };
}

/**
 * Computes the unified active loadout item list from player tarot state & raft gadget state.
 *
 * @param {object} tarotState - Player tarot state
 * @param {object} gadgetState - Raft gadget state
 * @param {number} [now=0] - Current timestamp in ms
 * @returns {Array<object>} List of active loadout items
 */
export function collectActiveLoadoutItems(tarotState, gadgetState, now = 0) {
    const items = [];

    // 1. Installed Raft Gadgets (Auto-Harpoon, Shield Dome, Nitro Keg, Repair Drone)
    for (const type of Object.values(GADGET_TYPES)) {
        const isInstalled = Boolean(gadgetState?.installed?.[type]);
        const meta = GADGET_META[type];
        if (!meta) continue;

        const fraction = isInstalled ? meta.getCooldownFraction(gadgetState, now) : 0;
        const status = isInstalled ? meta.getStatusText(gadgetState, now) : 'Locked';

        items.push({
            type: 'gadget',
            id: type,
            name: meta.name,
            icon: meta.icon,
            color: meta.color,
            isInstalled,
            cooldownFraction: fraction,
            statusText: status,
            tooltip: getGadgetTooltip(type, gadgetState, now),
        });
    }

    // 2. Equipped Tarot Blessings
    const blessings = tarotState?.blessings || {};
    for (const [cardId, bData] of Object.entries(blessings)) {
        const def = TAROT_CARDS[cardId];
        if (!def) continue;

        items.push({
            type: 'tarot',
            id: cardId,
            name: def.name,
            icon: def.icon,
            count: bData.count || 1,
            color: def.accentColor || '#38bdf8',
            cooldownFraction: 0, // Tarot blessings are permanent passive augments
            statusText: bData.count > 1 ? `x${bData.count}` : 'PASSIVE',
            tooltip: getTarotTooltip(cardId),
        });
    }

    return items;
}

/**
 * Default visual configuration for the Active Loadout Strip component.
 */
export const LOADOUT_STRIP_CONFIG = {
    ROOT_ID: 'active-loadout-strip',
    ICON_SIZE: 36,
    BORDER_RADIUS: 8,
    STROKE_WIDTH: 3,
    GAP: 6,
    Z_INDEX: 120,
    TOP_OFFSET_BELOW_HUD: 202, // Below #hud (baseHeight 180 + margin 12 + 10px buffer)
    LEFT_OFFSET: 12,
};

/**
 * Builds the HTML DOM structure for the Active Loadout Strip.
 */
function buildLoadoutStripDOM() {
    const root = document.createElement('div');
    root.id = LOADOUT_STRIP_CONFIG.ROOT_ID;
    root.style.cssText = `
        position: absolute;
        top: ${LOADOUT_STRIP_CONFIG.TOP_OFFSET_BELOW_HUD}px;
        left: ${LOADOUT_STRIP_CONFIG.LEFT_OFFSET}px;
        display: flex;
        align-items: center;
        gap: ${LOADOUT_STRIP_CONFIG.GAP}px;
        pointer-events: auto;
        z-index: ${LOADOUT_STRIP_CONFIG.Z_INDEX};
        font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
        user-select: none;
    `;

    // Shared 1-line floating hover tooltip
    const tooltip = document.createElement('div');
    tooltip.id = 'loadout-strip-tooltip';
    tooltip.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 6px;
        background: rgba(11, 14, 19, 0.94);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 10.5px;
        color: #e6ebf2;
        white-space: nowrap;
        pointer-events: none;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
        opacity: 0;
        transform: translateY(-2px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        z-index: 10;
    `;
    root.appendChild(tooltip);

    return { root, tooltip };
}

/**
 * Creates the single-row Active Loadout Strip HUD controller.
 *
 * @param {HTMLElement} [container=document.body] - Parent container element.
 * @param {object} [options={}] - Custom configuration options.
 * @returns {object} Controller interface { update, setVisible, isVisible, getItems, getRoot, dispose }
 */
export function createActiveLoadoutStrip(container = null, options = {}) {
    const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
    const parent = container || (hasDOM ? document.body : null);

    let dom = null;
    let visible = true;
    let cachedItems = [];
    let activeTooltipTimer = null;

    if (hasDOM && parent) {
        dom = buildLoadoutStripDOM();
        parent.appendChild(dom.root);
    }

    /**
     * Shows 1-line tooltip for a hovered slot.
     */
    function showTooltip(text, slotLeft) {
        if (!dom?.tooltip) return;
        dom.tooltip.textContent = text;
        dom.tooltip.style.left = `${Math.max(0, slotLeft)}px`;
        dom.tooltip.style.opacity = '1';
        dom.tooltip.style.transform = 'translateY(0px)';
    }

    /**
     * Hides the floating tooltip.
     */
    function hideTooltip() {
        if (!dom?.tooltip) return;
        dom.tooltip.style.opacity = '0';
        dom.tooltip.style.transform = 'translateY(-2px)';
    }

    /**
     * Renders an individual slot element with its radial SVG cooldown sweep.
     */
    function renderSlotElement(item, index) {
        const slot = document.createElement('div');
        slot.className = `loadout-slot loadout-${item.type} ${item.isInstalled === false ? 'uninstalled' : 'active'}`;
        slot.setAttribute('data-id', item.id);
        slot.setAttribute('data-type', item.type);

        const size = LOADOUT_STRIP_CONFIG.ICON_SIZE;
        const radius = 15;
        const center = size / 2;
        const sweep = calculateRadialSvgSweep(radius, item.cooldownFraction);

        slot.style.cssText = `
            position: relative;
            width: ${size}px;
            height: ${size}px;
            border-radius: ${LOADOUT_STRIP_CONFIG.BORDER_RADIUS}px;
            background: ${item.isInstalled === false ? 'rgba(17, 24, 39, 0.45)' : 'rgba(15, 23, 42, 0.85)'};
            border: 1px solid ${item.isInstalled === false ? 'rgba(255, 255, 255, 0.08)' : `${item.color}55`};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 17px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45), inset 0 0 8px ${item.color}15;
            transition: transform 0.12s ease, border-color 0.2s ease;
            box-sizing: border-box;
            opacity: ${item.isInstalled === false ? '0.45' : '1.0'};
        `;

        // Inner icon / emoji
        const iconSpan = document.createElement('span');
        iconSpan.textContent = item.icon;
        iconSpan.style.cssText = `
            pointer-events: none;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8));
            user-select: none;
        `;
        slot.appendChild(iconSpan);

        // Multiple stack badge for tarot cards (e.g. x2)
        if (item.type === 'tarot' && item.count > 1) {
            const countBadge = document.createElement('span');
            countBadge.className = 'tarot-count-badge';
            countBadge.textContent = `${item.count}`;
            countBadge.style.cssText = `
                position: absolute;
                bottom: 1px;
                right: 3px;
                font-size: 9px;
                font-weight: 800;
                color: #fff;
                background: ${item.color};
                padding: 0 3px;
                border-radius: 4px;
                line-height: 12px;
                pointer-events: none;
            `;
            slot.appendChild(countBadge);
        }

        // Radial SVG Cooldown Sweep Overlay
        if (item.type === 'gadget' && item.isInstalled) {
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('width', `${size}`);
            svg.setAttribute('height', `${size}`);
            svg.style.cssText = `
                position: absolute;
                inset: 0;
                pointer-events: none;
                transform: rotate(-90deg);
                border-radius: ${LOADOUT_STRIP_CONFIG.BORDER_RADIUS}px;
            `;

            // Background subtle track ring
            const bgCircle = document.createElementNS(svgNS, 'circle');
            bgCircle.setAttribute('cx', `${center}`);
            bgCircle.setAttribute('cy', `${center}`);
            bgCircle.setAttribute('r', `${radius}`);
            bgCircle.setAttribute('fill', 'none');
            bgCircle.setAttribute('stroke', 'rgba(255, 255, 255, 0.08)');
            bgCircle.setAttribute('stroke-width', `${LOADOUT_STRIP_CONFIG.STROKE_WIDTH}`);
            svg.appendChild(bgCircle);

            // Active radial progress circle
            const progressCircle = document.createElementNS(svgNS, 'circle');
            progressCircle.setAttribute('class', 'cooldown-sweep-circle');
            progressCircle.setAttribute('cx', `${center}`);
            progressCircle.setAttribute('cy', `${center}`);
            progressCircle.setAttribute('r', `${radius}`);
            progressCircle.setAttribute('fill', 'none');
            progressCircle.setAttribute('stroke', item.color);
            progressCircle.setAttribute('stroke-width', `${LOADOUT_STRIP_CONFIG.STROKE_WIDTH}`);
            progressCircle.setAttribute('stroke-linecap', 'round');
            progressCircle.setAttribute('stroke-dasharray', sweep.strokeDasharray);
            progressCircle.setAttribute('stroke-dashoffset', `${sweep.strokeDashoffset}`);
            progressCircle.style.transition = 'stroke-dashoffset 0.08s linear';
            svg.appendChild(progressCircle);

            slot.appendChild(svg);
        }

        // Hover events for 1-line tooltip
        slot.addEventListener('mouseenter', () => {
            slot.style.transform = 'translateY(-2px) scale(1.06)';
            showTooltip(item.tooltip, slot.offsetLeft);
        });
        slot.addEventListener('mouseleave', () => {
            slot.style.transform = 'none';
            hideTooltip();
        });

        return slot;
    }

    /**
     * Updates the strip with latest player tarot state & raft gadget state.
     *
     * @param {object} params
     * @param {object} [params.tarotState]
     * @param {object} [params.gadgetState]
     * @param {number} [params.now]
     */
    function update({ tarotState = null, gadgetState = null, now = 0 } = {}) {
        const items = collectActiveLoadoutItems(tarotState, gadgetState, now);
        cachedItems = items;

        if (!dom?.root) return items;

        // Preserve tooltip element and rebuild slots
        const tooltipEl = dom.tooltip;
        dom.root.innerHTML = '';
        if (tooltipEl) dom.root.appendChild(tooltipEl);

        items.forEach((item, idx) => {
            const slotEl = renderSlotElement(item, idx);
            dom.root.appendChild(slotEl);
        });

        return items;
    }

    /**
     * Controls visibility of the strip.
     */
    function setVisible(val) {
        visible = Boolean(val);
        if (dom?.root) {
            dom.root.style.display = visible ? 'flex' : 'none';
        }
    }

    /**
     * Cleanly disposes DOM nodes and listeners.
     */
    function dispose() {
        if (dom?.root && dom.root.parentNode) {
            dom.root.parentNode.removeChild(dom.root);
        }
        dom = null;
        cachedItems = [];
    }

    return {
        update,
        setVisible,
        isVisible: () => visible,
        getItems: () => cachedItems,
        getRoot: () => dom?.root || null,
        getTooltip: () => dom?.tooltip || null,
        dispose,
    };
}
