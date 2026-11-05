/**
 * Don't Sink, Don't Die — Pointer-Lock Guard & Shop Keyboard/Mouse Navigator
 *
 * Architectural Why (Helmet 02 & Sovereign Core):
 * When players enter the Harbor Armory, Checkpoint Shop, or any modal overlay during intense
 * river combat, 3D pointer-lock or hidden mouse cursor states must never trap or blind the pilot.
 * This module enforces:
 * 1. Immediate exit from pointer-lock (document.exitPointerLock) whenever any shop or modal opens,
 *    restoring explicit visible cursors (cursor: default on container/body, cursor: pointer on buttons/items).
 * 2. Complete hands-on-keyboard or mouse armory navigation:
 *    - Cycle shop items seamlessly via Arrow Keys (Left/Right/Up/Down), A-D, and Tab / Shift+Tab.
 *    - Instant purchase execution via Enter, Space, or hotkeys [1]-[4].
 *    - Immediate modal dismissal on Escape via onClose callback.
 *    - Direct mouse interaction support (click/hover) kept in 1:1 synchronization with keyboard focus.
 * 3. Zero external dependencies, pure ES module, and 100% resilient to headless/test execution.
 */

export const HOTKEY_SLOT_MAP = Object.freeze({
    '1': { slotIndex: 0, slotKey: 'motor', label: 'Motor' },
    '2': { slotIndex: 1, slotKey: 'weapon', label: 'Weapon' },
    '3': { slotIndex: 2, slotKey: 'armor', label: 'Armor' },
    '4': { slotIndex: 3, slotKey: 'auto_equip', label: 'Crew Bot Auto-Equip' },
});

export const NAV_ACTIONS = Object.freeze({
    PREV: 'prev',
    NEXT: 'next',
    SELECT: 'select',
    CLOSE: 'close',
    HOTKEY: 'hotkey',
});

/**
 * Ensures the system mouse cursor is fully visible, releasing any active 3D pointer-lock.
 *
 * @param {Document|object} [doc] - Target document (defaults to global document if present).
 * @param {HTMLElement|object} [container] - Optional modal/shop container element to apply cursor style.
 * @returns {boolean} True if pointer lock was released or cursor was restored.
 */
export function ensureVisibleMouseCursor(doc = (typeof document !== 'undefined' ? document : null), container = null) {
    if (!doc) return false;

    try {
        const hasPointerLock = Boolean(
            doc.pointerLockElement ||
            doc.mozPointerLockElement ||
            doc.webkitPointerLockElement
        );

        if (hasPointerLock && typeof doc.exitPointerLock === 'function') {
            doc.exitPointerLock();
        } else if (typeof doc.exitPointerLock === 'function' && !doc.pointerLockElement) {
            try {
                doc.exitPointerLock();
            } catch {
                // Ignore DOMException if no pointer lock is currently engaged
            }
        }
    } catch {
        // Defensive against browser security restrictions or mock limitations
    }

    try {
        if (doc.body && doc.body.style) {
            doc.body.style.cursor = 'default';
        }
        if (doc.documentElement && doc.documentElement.style) {
            doc.documentElement.style.cursor = 'default';
        }
    } catch {
        // Safe fallback in restricted environments
    }

    if (container && container.style) {
        try {
            container.style.cursor = 'default';
            if (typeof container.querySelectorAll === 'function') {
                const clickableElements = container.querySelectorAll(
                    'button, [role="button"], [data-upgrade-id], [data-buy-id], .armory-tier-box, .clickable, a'
                );
                if (clickableElements && clickableElements.forEach) {
                    clickableElements.forEach((el) => {
                        if (el && el.style && !el.disabled && !el.classList?.contains('locked')) {
                            el.style.cursor = 'pointer';
                        }
                    });
                }
            }
        } catch {
            // Safe fallback
        }
    }

    return true;
}

/**
 * Creates a keyboard and mouse navigation controller for armory/shop item lists.
 */
export function createShopKeyboardNavigator({
    items = [],
    initialIndex = 0,
    onSelectIndex = null,
    onPurchaseItem = null,
    onClose = null,
    wrap = true,
    targetWindow = (typeof window !== 'undefined' ? window : null),
} = {}) {
    let currentItems = Array.isArray(items) ? [...items] : [];
    let selectedIndex = clampIndex(initialIndex, currentItems.length);
    let isActive = true;
    let boundKeyHandler = null;

    function clampIndex(idx, len) {
        if (!Number.isFinite(idx) || len <= 0) return 0;
        if (wrap) {
            return ((idx % len) + len) % len;
        }
        return Math.max(0, Math.min(idx, len - 1));
    }

    function notifySelect(idx) {
        if (typeof onSelectIndex === 'function') {
            const item = currentItems[idx] || null;
            onSelectIndex(idx, item);
        }
    }

    function selectIndex(newIndex) {
        if (!isActive || currentItems.length === 0) return selectedIndex;
        const target = clampIndex(newIndex, currentItems.length);
        if (target !== selectedIndex) {
            selectedIndex = target;
            notifySelect(selectedIndex);
        }
        return selectedIndex;
    }

    function nextItem() {
        if (currentItems.length <= 1) return selectedIndex;
        return selectIndex(selectedIndex + 1);
    }

    function previousItem() {
        if (currentItems.length <= 1) return selectedIndex;
        return selectIndex(selectedIndex - 1);
    }

    function purchaseCurrent() {
        if (!isActive || currentItems.length === 0) return null;
        const item = currentItems[selectedIndex] || null;
        if (typeof onPurchaseItem === 'function') {
            onPurchaseItem(selectedIndex, item, null);
        }
        return item;
    }

    function purchaseBySlot(slotNumber) {
        if (!isActive) return null;
        const targetIdx = slotNumber - 1;
        if (targetIdx >= 0 && targetIdx < currentItems.length) {
            const item = currentItems[targetIdx];
            selectedIndex = targetIdx;
            notifySelect(selectedIndex);
            if (typeof onPurchaseItem === 'function') {
                onPurchaseItem(targetIdx, item, slotNumber);
            }
            return item;
        }
        if (typeof onPurchaseItem === 'function') {
            onPurchaseItem(-1, null, slotNumber);
        }
        return null;
    }

    function handleKeyDown(e) {
        if (!isActive || !e) return;
        const key = e.key;
        const code = e.code;

        if (key === 'Escape') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof onClose === 'function') {
                onClose();
            }
            return;
        }

        if (['1', '2', '3', '4'].includes(key)) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            const slot = parseInt(key, 10);
            purchaseBySlot(slot);
            return;
        }

        if (
            key === 'ArrowRight' ||
            key === 'ArrowDown' ||
            key === 'd' ||
            key === 'D' ||
            code === 'KeyD' ||
            (key === 'Tab' && !e.shiftKey)
        ) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            nextItem();
            return;
        }

        if (
            key === 'ArrowLeft' ||
            key === 'ArrowUp' ||
            key === 'a' ||
            key === 'A' ||
            code === 'KeyA' ||
            (key === 'Tab' && e.shiftKey)
        ) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            previousItem();
            return;
        }

        if (key === 'Enter' || key === ' ' || code === 'Space') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            purchaseCurrent();
            return;
        }
    }

    if (targetWindow && typeof targetWindow.addEventListener === 'function') {
        boundKeyHandler = (e) => handleKeyDown(e);
        targetWindow.addEventListener('keydown', boundKeyHandler);
    }

    if (currentItems.length > 0) {
        notifySelect(selectedIndex);
    }

    return {
        getSelectedIndex: () => selectedIndex,
        getSelectedItem: () => currentItems[selectedIndex] || null,
        getItems: () => [...currentItems],
        selectIndex,
        nextItem,
        previousItem,
        purchaseCurrent,
        purchaseBySlot,
        handleKeyDown,
        setItems(newItems) {
            currentItems = Array.isArray(newItems) ? [...newItems] : [];
            selectedIndex = clampIndex(selectedIndex, currentItems.length);
            notifySelect(selectedIndex);
        },
        setActive(active) {
            isActive = Boolean(active);
        },
        isActive: () => isActive,
        dispose() {
            isActive = false;
            if (targetWindow && boundKeyHandler && typeof targetWindow.removeEventListener === 'function') {
                targetWindow.removeEventListener('keydown', boundKeyHandler);
                boundKeyHandler = null;
            }
        },
    };
}
