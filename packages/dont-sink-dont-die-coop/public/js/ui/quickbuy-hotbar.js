/**
 * Zero-Modal 1-Click Inline Quick-Buy Hotbar
 *
 * Eliminates multi-click modal bureaucracy during high-stress river combat.
 * Displays a sleek 4-slot quick-buy pill bar:
 *   [1] ⚡ Engine (Motor Mk I -> II -> III)
 *   [2] 🔨 Mallet (Squeaky Mallet -> Thunder Gavel -> Leviathan Breaker)
 *   [3] 🪵 Hull   (Hull Armor -> Riveted Ironclad -> Aegis Plating)
 *   [4] 🩹 Patch  (Emergency Hull Breach Patch: restores +35 HP for 15c)
 *
 * Visual Invariants & UX Directives:
 * - Green light / emerald glow the exact millisecond the player has enough coins.
 * - Single keystroke (1-4) or single click buys and equips with immediate line-of-sight
 *   visual confirmation (badge pulse, temporary checkmark, cost mutation) without
 *   pausing the action or opening the full [B] Armory modal.
 * - Disabled / locked / maxed slots clearly indicate status with zero visual ambiguity.
 */

import {
    UPGRADE_SLOTS,
    ARMORY_UPGRADE_TREE,
    ALL_UPGRADES,
    getSlotCurrentTier,
    getNextSlotUpgrade,
} from '../../../shared/upgrade-tree.js';

export const QUICKBUY_SLOTS = {
    ENGINE: 'engine',
    MALLET: 'mallet',
    HULL: 'hull',
    PATCH: 'patch',
};

export const EMERGENCY_PATCH_CONFIG = {
    id: 'quick_patch',
    name: 'Emergency Patch',
    shortName: 'Patch',
    icon: '🩹',
    cost: 15,
    healAmount: 35,
    description: 'Instantly seals hull breaches and repairs +35 raft HP.',
};

export const HOTBAR_DEFINITIONS = [
    {
        key: '1',
        slot: QUICKBUY_SLOTS.ENGINE,
        upgradeSlot: UPGRADE_SLOTS.MOTOR,
        icon: '⚡',
        label: 'Engine',
        type: 'upgrade',
    },
    {
        key: '2',
        slot: QUICKBUY_SLOTS.MALLET,
        upgradeSlot: UPGRADE_SLOTS.WEAPON,
        icon: '🔨',
        label: 'Mallet',
        type: 'upgrade',
    },
    {
        key: '3',
        slot: QUICKBUY_SLOTS.HULL,
        upgradeSlot: UPGRADE_SLOTS.ARMOR,
        icon: '🪵',
        label: 'Hull',
        type: 'upgrade',
    },
    {
        key: '4',
        slot: QUICKBUY_SLOTS.PATCH,
        upgradeSlot: null,
        icon: '🩹',
        label: 'Patch',
        type: 'repair',
    },
];

/**
 * Pure state evaluation of a single hotbar slot for a given player state.
 *
 * @param {object} slotDef - Slot definition from HOTBAR_DEFINITIONS.
 * @param {object} player - Player state ({ coins, health, maxHealth, upgrades, isDead }).
 * @returns {object} Evaluated slot state.
 */
export function evaluateQuickBuySlot(slotDef, player = {}) {
    const coins = Number.isFinite(player.coins) ? player.coins : 0;
    const upgrades = Array.isArray(player.upgrades) ? player.upgrades : [];
    const health = Number.isFinite(player.health) ? player.health : 100;
    const maxHealth = Number.isFinite(player.maxHealth) ? player.maxHealth : 100;
    const isDead = Boolean(player.isDead);

    if (slotDef.type === 'repair') {
        const cost = EMERGENCY_PATCH_CONFIG.cost;
        const needsRepair = health < maxHealth;
        const canAfford = coins >= cost;
        const canBuy = !isDead && canAfford && needsRepair;

        return {
            key: slotDef.key,
            slot: slotDef.slot,
            type: 'repair',
            icon: slotDef.icon,
            label: slotDef.label,
            actionName: 'Emergency Patch',
            tier: 0,
            maxTier: 1,
            isMaxed: false,
            cost,
            canAfford,
            canBuy,
            needsRepair,
            healAmount: EMERGENCY_PATCH_CONFIG.healAmount,
            status: isDead ? 'dead' : !needsRepair ? 'full_hp' : canAfford ? 'ready' : 'need_coins',
            item: EMERGENCY_PATCH_CONFIG,
        };
    }

    // Upgrade slot (Engine, Mallet, Hull)
    const currentTier = getSlotCurrentTier(upgrades, slotDef.upgradeSlot);
    const nextItem = getNextSlotUpgrade(upgrades, slotDef.upgradeSlot);
    const isMaxed = currentTier >= 3 || !nextItem;
    const cost = nextItem ? nextItem.cost : 0;
    const canAfford = !isMaxed && coins >= cost;
    const canBuy = !isDead && !isMaxed && canAfford;

    return {
        key: slotDef.key,
        slot: slotDef.slot,
        upgradeSlot: slotDef.upgradeSlot,
        type: 'upgrade',
        icon: slotDef.icon,
        label: slotDef.label,
        actionName: nextItem ? nextItem.name : `${slotDef.label} Maxed`,
        tier: currentTier,
        maxTier: 3,
        isMaxed,
        cost,
        canAfford,
        canBuy,
        status: isDead ? 'dead' : isMaxed ? 'maxed' : canAfford ? 'ready' : 'need_coins',
        item: nextItem,
    };
}

/**
 * Pure evaluation for all 4 hotbar slots.
 */
export function evaluateQuickBuySlots(player = {}) {
    return HOTBAR_DEFINITIONS.map((def) => evaluateQuickBuySlot(def, player));
}

/**
 * Validates whether a specific hotkey or slot can be bought right now.
 */
export function canQuickBuySlot(slotOrKey, player = {}) {
    const keyStr = String(slotOrKey).toLowerCase().trim();
    const def = HOTBAR_DEFINITIONS.find((d) => d.key === keyStr || d.slot.toLowerCase() === keyStr);
    if (!def) return { ok: false, reason: 'unknown_slot' };

    const evaluated = evaluateQuickBuySlot(def, player);
    if (!evaluated.canBuy) {
        return {
            ok: false,
            reason: evaluated.status,
            slot: evaluated,
        };
    }
    return {
        ok: true,
        reason: null,
        slot: evaluated,
    };
}

/**
 * Pure execution helper that returns the purchase result payload and state mutation proposal.
 */
export function executeQuickBuy(slotOrKey, player = {}) {
    const check = canQuickBuySlot(slotOrKey, player);
    if (!check.ok) {
        return {
            success: false,
            reason: check.reason,
            slot: check.slot || null,
        };
    }

    const { slot } = check;
    if (slot.type === 'repair') {
        const curHealth = Number.isFinite(player.health) ? player.health : 100;
        const maxHp = Number.isFinite(player.maxHealth) ? player.maxHealth : 100;
        const restored = Math.min(curHealth + slot.healAmount, maxHp) - curHealth;

        return {
            success: true,
            type: 'repair',
            key: slot.key,
            slot: slot.slot,
            cost: slot.cost,
            healAmount: slot.healAmount,
            healthRestored: restored,
            newHealth: curHealth + restored,
            coinsDeducted: slot.cost,
            actionName: slot.actionName,
            item: slot.item,
        };
    }

    // Upgrade type
    const item = slot.item;
    return {
        success: true,
        type: 'upgrade',
        key: slot.key,
        slot: slot.slot,
        upgradeSlot: slot.upgradeSlot,
        upgradeId: item.id,
        legacyType: item.legacyType || item.id,
        cost: item.cost,
        coinsDeducted: item.cost,
        actionName: item.name,
        newTier: slot.tier + 1,
        item,
    };
}

/**
 * Creates and attaches the zero-modal 1-click Quick-Buy Hotbar DOM UI.
 *
 * @param {object} options
 * @param {HTMLElement|string} [options.container] - Parent container or container ID.
 * @param {object} [options.socket] - Socket.io or loopback socket client.
 * @param {Function} [options.onPurchase] - Callback fired on successful purchase.
 * @param {Function} [options.getPlayerData] - Accessor for dynamic player state.
 * @param {boolean} [options.enableHotkeys=true] - Whether to bind global keys 1-4.
 */
export function createQuickBuyHotbar({
    container = null,
    containerId = 'quickbuy-hotbar-root',
    socket = null,
    onPurchase = null,
    getPlayerData = null,
    enableHotkeys = true,
} = {}) {
    let localPlayer = {
        coins: 50,
        health: 100,
        maxHealth: 100,
        upgrades: [],
        isDead: false,
    };

    // Tracks line-of-sight flash animation state per slot
    const slotFlashStates = {
        '1': null,
        '2': null,
        '3': null,
        '4': null,
    };

    // Inject stylesheet once
    if (typeof document !== 'undefined' && !document.getElementById('quickbuy-hotbar-styles')) {
        const style = document.createElement('style');
        style.id = 'quickbuy-hotbar-styles';
        style.textContent = `
            #quickbuy-hotbar-root {
                position: fixed;
                bottom: 54px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 10px;
                background: rgba(13, 18, 26, 0.88);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 999px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                z-index: 100;
                font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
                user-select: none;
                pointer-events: auto;
                transition: transform 0.2s ease, opacity 0.2s ease;
            }
            .qb-slot-pill {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                border-radius: 999px;
                background: rgba(22, 30, 42, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.08);
                color: #94a3b8;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
            }
            .qb-slot-pill:hover:not(.disabled) {
                background: rgba(30, 41, 59, 0.95);
                border-color: rgba(94, 234, 212, 0.4);
                transform: translateY(-1px);
            }
            /* Ready / Affordable: emerald green line-of-sight glow */
            .qb-slot-pill.ready {
                border-color: rgba(74, 222, 128, 0.7);
                background: rgba(20, 83, 45, 0.35);
                color: #f0fdf4;
                box-shadow: 0 0 12px rgba(74, 222, 128, 0.35), inset 0 0 8px rgba(74, 222, 128, 0.15);
            }
            .qb-slot-pill.ready .qb-key-badge {
                background: #22c55e;
                color: #052e16;
                box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
            }
            .qb-slot-pill.ready .qb-cost-tag {
                color: #86efac;
                font-weight: 700;
            }
            /* Disabled / Unaffordable / Maxed */
            .qb-slot-pill.disabled {
                opacity: 0.55;
                cursor: not-allowed;
            }
            .qb-slot-pill.maxed {
                opacity: 0.7;
                border-color: rgba(56, 189, 248, 0.4);
                background: rgba(14, 116, 144, 0.2);
                color: #bae6fd;
                cursor: default;
            }
            /* Line-of-sight Flash on Keypress / Click */
            .qb-slot-pill.flash-success {
                animation: qbPulseSuccess 0.45s ease-out;
            }
            @keyframes qbPulseSuccess {
                0% {
                    transform: scale(1.12);
                    box-shadow: 0 0 24px #4ade80, inset 0 0 16px #86efac;
                    border-color: #86efac;
                }
                100% {
                    transform: scale(1.0);
                }
            }
            .qb-key-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 17px;
                height: 17px;
                border-radius: 4px;
                background: #1e293b;
                color: #94a3b8;
                font-size: 10px;
                font-weight: 800;
                line-height: 1;
                transition: all 0.15s ease;
            }
            .qb-icon {
                font-size: 13px;
                line-height: 1;
            }
            .qb-name {
                font-weight: 700;
                font-size: 11px;
                letter-spacing: 0.02em;
            }
            .qb-cost-tag {
                font-size: 10px;
                color: #fbbf24;
                font-family: ui-monospace, monospace;
            }
            .qb-tier-pips {
                display: flex;
                gap: 2px;
                margin-left: 2px;
            }
            .qb-tier-pip {
                width: 4px;
                height: 4px;
                border-radius: 1px;
                background: rgba(255, 255, 255, 0.2);
            }
            .qb-tier-pip.filled {
                background: #38bdf8;
                box-shadow: 0 0 4px #38bdf8;
            }
            .qb-los-confirm {
                position: absolute;
                inset: 0;
                background: rgba(34, 197, 94, 0.9);
                color: #052e16;
                font-weight: 800;
                font-size: 11px;
                display: flex;
                align-items: center;
                justify-content: center;
                letter-spacing: 0.05em;
                pointer-events: none;
                border-radius: 999px;
                opacity: 0;
                transform: scale(0.9);
                transition: all 0.18s ease;
            }
            .qb-los-confirm.active {
                opacity: 1;
                transform: scale(1);
            }
            @media (max-width: 768px) {
                #quickbuy-hotbar-root {
                    bottom: 46px;
                    padding: 4px 6px;
                    gap: 5px;
                }
                .qb-slot-pill {
                    padding: 3px 7px;
                    font-size: 10px;
                }
                .qb-name {
                    display: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Resolve mount container
    let rootEl = null;
    if (typeof document !== 'undefined') {
        if (container instanceof HTMLElement) {
            rootEl = container;
        } else if (typeof container === 'string') {
            rootEl = document.getElementById(container);
        }
        if (!rootEl) {
            rootEl = document.getElementById(containerId);
            if (!rootEl) {
                rootEl = document.createElement('div');
                rootEl.id = containerId;
                document.body.appendChild(rootEl);
            }
        }
    }

    // Trigger purchase from UI or Hotkey
    function triggerSlotPurchase(keyOrSlot) {
        const curPlayer = typeof getPlayerData === 'function' ? getPlayerData() : localPlayer;
        const result = executeQuickBuy(keyOrSlot, curPlayer);

        if (!result.success) {
            return result;
        }

        // Trigger Line-of-sight visual confirmation
        const k = result.key;
        slotFlashStates[k] = {
            time: Date.now(),
            label: result.type === 'repair' ? '+35 HP' : 'EQUIPPED',
        };

        // Optimistically mutate player state if using internal state
        if (typeof getPlayerData !== 'function') {
            localPlayer.coins = Math.max(0, localPlayer.coins - result.coinsDeducted);
            if (result.type === 'upgrade') {
                localPlayer.upgrades.push(result.upgradeId);
            } else if (result.type === 'repair') {
                localPlayer.health = Math.min(localPlayer.maxHealth || 100, localPlayer.health + result.healAmount);
            }
        }

        // Emit socket events
        if (socket && typeof socket.emit === 'function') {
            if (result.type === 'upgrade') {
                socket.emit('buyUpgrade', result.legacyType || result.upgradeId);
            } else if (result.type === 'repair') {
                socket.emit('repairRaft', { amount: result.healAmount, cost: result.cost });
            }
        }

        // Callback
        if (typeof onPurchase === 'function') {
            onPurchase(result);
        }

        render();

        // Clear line-of-sight confirmation after 700ms
        setTimeout(() => {
            if (slotFlashStates[k]) {
                slotFlashStates[k] = null;
                render();
            }
        }, 700);

        return result;
    }

    // Keyboard listener for 1, 2, 3, 4
    function handleKeyDown(e) {
        if (!enableHotkeys) return;

        // Ignore if user is typing in form field
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

        // Ignore if full Armory modal or Title menu modal is currently open and trapping focus
        const armoryOverlay = document.getElementById('armory-overlay');
        if (armoryOverlay && armoryOverlay.classList.contains('open')) return;
        const titleLobby = document.getElementById('title-lobby-overlay');
        if (titleLobby && window.getComputedStyle(titleLobby).display !== 'none' && window.getComputedStyle(titleLobby).opacity !== '0') return;

        const k = e.key;
        if (['1', '2', '3', '4'].includes(k)) {
            const curPlayer = typeof getPlayerData === 'function' ? getPlayerData() : localPlayer;
            const check = canQuickBuySlot(k, curPlayer);
            if (check.ok) {
                e.preventDefault();
                triggerSlotPurchase(k);
            }
        }
    }

    if (typeof window !== 'undefined' && enableHotkeys) {
        window.addEventListener('keydown', handleKeyDown);
    }

    function render() {
        if (!rootEl) return;
        const curPlayer = typeof getPlayerData === 'function' ? getPlayerData() : localPlayer;
        const slots = evaluateQuickBuySlots(curPlayer);

        const html = slots.map((s) => {
            const isReady = s.canBuy;
            const isMaxed = s.isMaxed;
            const isDisabled = !s.canBuy && !isMaxed;
            const flash = slotFlashStates[s.key];

            let classes = ['qb-slot-pill'];
            if (isReady) classes.push('ready');
            if (isMaxed) classes.push('maxed');
            if (isDisabled) classes.push('disabled');
            if (flash) classes.push('flash-success');

            // Tier pips for upgrade slots
            let tierPipsHtml = '';
            if (s.type === 'upgrade') {
                tierPipsHtml = `
                    <div class="qb-tier-pips" title="Tier ${s.tier}/3">
                        <span class="qb-tier-pip ${s.tier >= 1 ? 'filled' : ''}"></span>
                        <span class="qb-tier-pip ${s.tier >= 2 ? 'filled' : ''}"></span>
                        <span class="qb-tier-pip ${s.tier >= 3 ? 'filled' : ''}"></span>
                    </div>
                `;
            }

            const costDisplay = isMaxed
                ? 'MAX'
                : s.type === 'repair' && !s.needsRepair
                ? 'FULL'
                : `${s.cost}c`;

            const losConfirmHtml = flash
                ? `<div class="qb-los-confirm active">✓ ${flash.label}</div>`
                : '<div class="qb-los-confirm"></div>';

            return `
                <div class="${classes.join(' ')}"
                     data-qb-key="${s.key}"
                     data-qb-slot="${s.slot}"
                     tabindex="${isReady ? '0' : '-1'}"
                     role="button"
                     aria-label="Quick-buy ${s.label} (${s.key})">
                    <span class="qb-key-badge">${s.key}</span>
                    <span class="qb-icon">${s.icon}</span>
                    <span class="qb-name">${s.label}</span>
                    <span class="qb-cost-tag">${costDisplay}</span>
                    ${tierPipsHtml}
                    ${losConfirmHtml}
                </div>
            `;
        }).join('');

        rootEl.innerHTML = html;

        // Attach click handlers to slots
        rootEl.querySelectorAll('[data-qb-key]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = el.getAttribute('data-qb-key');
                triggerSlotPurchase(key);
            });
        });
    }

    // Initial render
    render();

    return {
        updatePlayerData(playerData) {
            if (playerData) {
                localPlayer = { ...localPlayer, ...playerData };
            }
            render();
        },
        triggerPurchase: triggerSlotPurchase,
        getSlots() {
            const curPlayer = typeof getPlayerData === 'function' ? getPlayerData() : localPlayer;
            return evaluateQuickBuySlots(curPlayer);
        },
        render,
        element: rootEl,
        dispose() {
            if (typeof window !== 'undefined' && enableHotkeys) {
                window.removeEventListener('keydown', handleKeyDown);
            }
            if (rootEl && rootEl.parentNode) {
                rootEl.parentNode.removeChild(rootEl);
            }
        },
    };
}
