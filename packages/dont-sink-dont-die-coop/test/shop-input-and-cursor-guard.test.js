import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ensureVisibleMouseCursor,
    createShopKeyboardNavigator,
} from '../public/js/ui/shop-input-and-cursor-guard.js';

describe('Pointer-Lock Guard (ensureVisibleMouseCursor)', () => {
    it('returns false when document is null or undefined', () => {
        assert.equal(ensureVisibleMouseCursor(null), false);
        assert.equal(ensureVisibleMouseCursor(undefined), false);
    });

    it('invokes exitPointerLock if pointerLockElement is active and sets body cursor', () => {
        let exitCalled = false;
        const mockDoc = {
            pointerLockElement: {},
            exitPointerLock: () => {
                exitCalled = true;
                mockDoc.pointerLockElement = null;
            },
            body: {
                style: {
                    cursor: 'none',
                },
            },
            documentElement: {
                style: {
                    cursor: 'none',
                },
            },
        };

        const result = ensureVisibleMouseCursor(mockDoc);
        assert.equal(result, true);
        assert.equal(exitCalled, true);
        assert.equal(mockDoc.body.style.cursor, 'default');
        assert.equal(mockDoc.documentElement.style.cursor, 'default');
    });

    it('handles mozPointerLockElement and webkitPointerLockElement vendor prefixes', () => {
        let exitCalled = false;
        const mockDoc = {
            mozPointerLockElement: {},
            exitPointerLock: () => {
                exitCalled = true;
            },
            body: { style: {} },
        };

        const result = ensureVisibleMouseCursor(mockDoc);
        assert.equal(result, true);
        assert.equal(exitCalled, true);
        assert.equal(mockDoc.body.style.cursor, 'default');
    });

    it('defensively calls exitPointerLock even if pointerLockElement is not set, catching errors safely', () => {
        let exitCalled = false;
        const mockDoc = {
            pointerLockElement: null,
            exitPointerLock: () => {
                exitCalled = true;
                throw new Error('Not locked');
            },
            body: { style: {} },
        };

        const result = ensureVisibleMouseCursor(mockDoc);
        assert.equal(result, true);
        assert.equal(exitCalled, true);
        assert.equal(mockDoc.body.style.cursor, 'default');
    });

    it('updates container style and sets pointer cursor on interactive elements', () => {
        const mockButtons = [
            { style: { cursor: 'auto' }, disabled: false, classList: { contains: () => false } },
            { style: { cursor: 'auto' }, disabled: true, classList: { contains: () => false } },
            { style: { cursor: 'auto' }, disabled: false, classList: { contains: (cls) => cls === 'locked' } },
        ];

        const mockContainer = {
            style: { cursor: 'none' },
            querySelectorAll: (selector) => {
                assert.ok(selector.includes('button'));
                return mockButtons;
            },
        };

        const mockDoc = {
            body: { style: {} },
        };

        ensureVisibleMouseCursor(mockDoc, mockContainer);

        assert.equal(mockContainer.style.cursor, 'default');
        assert.equal(mockButtons[0].style.cursor, 'pointer');
        // Disabled button unchanged
        assert.equal(mockButtons[1].style.cursor, 'auto');
        // Locked item unchanged
        assert.equal(mockButtons[2].style.cursor, 'auto');
    });
});

describe('Shop Keyboard & Mouse Navigator (createShopKeyboardNavigator)', () => {
    const sampleItems = [
        { id: 'motor_1', name: 'Motor Mk I', cost: 10, slot: 'motor' },
        { id: 'weapon_1', name: 'Squeaky Mallet', cost: 15, slot: 'weapon' },
        { id: 'armor_1', name: 'Hull Armor', cost: 20, slot: 'armor' },
        { id: 'patch_1', name: 'Patch Kit', cost: 15, slot: 'repair' },
    ];

    it('initializes with default state, clamping initial index and notifying listener', () => {
        let selectedIdx = null;
        let selectedItem = null;

        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            initialIndex: 1,
            onSelectIndex: (idx, item) => {
                selectedIdx = idx;
                selectedItem = item;
            },
        });

        assert.equal(nav.getSelectedIndex(), 1);
        assert.equal(nav.getSelectedItem()?.id, 'weapon_1');
        assert.equal(selectedIdx, 1);
        assert.equal(selectedItem?.id, 'weapon_1');
        assert.equal(nav.getItems().length, 4);
        assert.equal(nav.isActive(), true);
        nav.dispose();
    });

    it('cycles forward on ArrowRight, ArrowDown, "d", "D", and Tab', () => {
        const selections = [];
        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            initialIndex: 0,
            onSelectIndex: (idx) => selections.push(idx),
        });

        // 0 -> 1 via ArrowRight
        nav.handleKeyDown({ key: 'ArrowRight', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 1);

        // 1 -> 2 via ArrowDown
        nav.handleKeyDown({ key: 'ArrowDown', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 2);

        // 2 -> 3 via 'd'
        nav.handleKeyDown({ key: 'd', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 3);

        // 3 -> 0 via Tab (wraps)
        nav.handleKeyDown({ key: 'Tab', shiftKey: false, preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 0);

        // 0 -> 1 via 'D' (uppercase)
        nav.handleKeyDown({ key: 'D', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 1);

        // 0 -> 1 via code KeyD
        nav.handleKeyDown({ code: 'KeyD', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 2);

        nav.dispose();
    });

    it('cycles backward on ArrowLeft, ArrowUp, "a", "A", and Shift+Tab', () => {
        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            initialIndex: 0,
        });

        // 0 -> 3 (wraps backward)
        nav.handleKeyDown({ key: 'ArrowLeft', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 3);

        // 3 -> 2 via ArrowUp
        nav.handleKeyDown({ key: 'ArrowUp', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 2);

        // 2 -> 1 via 'a'
        nav.handleKeyDown({ key: 'a', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 1);

        // 1 -> 0 via Shift+Tab
        nav.handleKeyDown({ key: 'Tab', shiftKey: true, preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 0);

        // 0 -> 3 via 'A'
        nav.handleKeyDown({ key: 'A', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 3);

        // 3 -> 2 via code KeyA
        nav.handleKeyDown({ code: 'KeyA', preventDefault: () => {} });
        assert.equal(nav.getSelectedIndex(), 2);

        nav.dispose();
    });

    it('respects wrap=false flag and clamps at boundaries', () => {
        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            initialIndex: 0,
            wrap: false,
        });

        nav.previousItem();
        assert.equal(nav.getSelectedIndex(), 0); // Doesn't wrap below 0

        nav.selectIndex(3);
        assert.equal(nav.getSelectedIndex(), 3);

        nav.nextItem();
        assert.equal(nav.getSelectedIndex(), 3); // Doesn't wrap above 3

        nav.dispose();
    });

    it('triggers purchaseCurrent on Enter, Space, and Space code', () => {
        let purchased = null;
        let purchasedIndex = null;

        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            initialIndex: 2,
            onPurchaseItem: (idx, item) => {
                purchasedIndex = idx;
                purchased = item;
            },
        });

        // Test Enter
        nav.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
        assert.equal(purchasedIndex, 2);
        assert.equal(purchased?.id, 'armor_1');

        purchased = null;
        // Test Space
        nav.handleKeyDown({ key: ' ', preventDefault: () => {} });
        assert.equal(purchasedIndex, 2);
        assert.equal(purchased?.id, 'armor_1');

        purchased = null;
        // Test code Space
        nav.handleKeyDown({ code: 'Space', preventDefault: () => {} });
        assert.equal(purchasedIndex, 2);
        assert.equal(purchased?.id, 'armor_1');

        nav.dispose();
    });

    it('triggers direct purchase on hotkeys [1]-[4]', () => {
        let purchased = null;
        let purchasedSlot = null;

        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            initialIndex: 0,
            onPurchaseItem: (idx, item, slot) => {
                purchased = item;
                purchasedSlot = slot;
            },
        });

        // Key '1' buys slot 1 (motor_1)
        nav.handleKeyDown({ key: '1', preventDefault: () => {} });
        assert.equal(purchasedSlot, 1);
        assert.equal(purchased?.id, 'motor_1');
        assert.equal(nav.getSelectedIndex(), 0);

        // Key '3' buys slot 3 (armor_1) and moves selected index to 2
        nav.handleKeyDown({ key: '3', preventDefault: () => {} });
        assert.equal(purchasedSlot, 3);
        assert.equal(purchased?.id, 'armor_1');
        assert.equal(nav.getSelectedIndex(), 2);

        // Key '4' buys slot 4 (patch_1)
        nav.handleKeyDown({ key: '4', preventDefault: () => {} });
        assert.equal(purchasedSlot, 4);
        assert.equal(purchased?.id, 'patch_1');
        assert.equal(nav.getSelectedIndex(), 3);

        nav.dispose();
    });

    it('calls onClose callback on Escape', () => {
        let closed = false;
        let defaultPrevented = false;

        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            onClose: () => {
                closed = true;
            },
        });

        nav.handleKeyDown({
            key: 'Escape',
            preventDefault: () => {
                defaultPrevented = true;
            },
        });

        assert.equal(closed, true);
        assert.equal(defaultPrevented, true);
        nav.dispose();
    });

    it('supports direct mouse selection and manual purchase execution', () => {
        let selected = null;
        let purchased = null;

        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            onSelectIndex: (idx, item) => {
                selected = item;
            },
            onPurchaseItem: (idx, item) => {
                purchased = item;
            },
        });

        nav.selectIndex(1);
        assert.equal(selected?.id, 'weapon_1');
        assert.equal(nav.getSelectedIndex(), 1);

        const buyRes = nav.purchaseCurrent();
        assert.equal(buyRes?.id, 'weapon_1');
        assert.equal(purchased?.id, 'weapon_1');

        nav.dispose();
    });

    it('allows updating items dynamically via setItems', () => {
        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            initialIndex: 3,
        });

        assert.equal(nav.getSelectedIndex(), 3);

        const newItems = [
            { id: 'motor_2', name: 'Motor Mk II' },
            { id: 'weapon_2', name: 'Thunder Gavel' },
        ];

        nav.setItems(newItems);
        assert.equal(nav.getItems().length, 2);
        // Index 3 was clamped to 1 (newItems.length - 1)
        assert.equal(nav.getSelectedIndex(), 1);
        assert.equal(nav.getSelectedItem()?.id, 'weapon_2');

        nav.dispose();
    });

    it('handles empty item list gracefully without crashing or throwing', () => {
        let notified = false;
        const nav = createShopKeyboardNavigator({
            items: [],
            onSelectIndex: () => { notified = true; },
            onPurchaseItem: () => { notified = true; },
        });

        assert.equal(nav.getSelectedIndex(), 0);
        assert.equal(nav.getSelectedItem(), null);
        assert.equal(nav.nextItem(), 0);
        assert.equal(nav.previousItem(), 0);
        assert.equal(nav.purchaseCurrent(), null);

        nav.handleKeyDown({ key: 'ArrowRight', preventDefault: () => {} });
        nav.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
        nav.dispose();
    });

    it('disables input when setActive(false) or after dispose()', () => {
        let buyCount = 0;
        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            onPurchaseItem: () => { buyCount++; },
        });

        nav.setActive(false);
        assert.equal(nav.isActive(), false);
        nav.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
        assert.equal(buyCount, 0);

        nav.setActive(true);
        nav.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
        assert.equal(buyCount, 1);

        nav.dispose();
        assert.equal(nav.isActive(), false);
        nav.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
        assert.equal(buyCount, 1);
    });

    it('attaches and detaches window event listener cleanly', () => {
        let attachedListener = null;
        let removedListener = null;

        const mockWindow = {
            addEventListener: (type, handler) => {
                if (type === 'keydown') attachedListener = handler;
            },
            removeEventListener: (type, handler) => {
                if (type === 'keydown') removedListener = handler;
            },
        };

        const nav = createShopKeyboardNavigator({
            items: sampleItems,
            targetWindow: mockWindow,
        });

        assert.ok(attachedListener, 'keydown listener should be attached');
        nav.dispose();
        assert.equal(attachedListener, removedListener, 'keydown listener should be removed on dispose');
    });
});
