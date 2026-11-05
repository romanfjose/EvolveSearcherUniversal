/**
 * Don't Sink, Don't Die — Dream Tarot Rogue-Lite Blessing Draft HUD Overlay
 *
 * Sleek 3-Card Glassmorphic HUD overlay presented every 2nd checkpoint crossed.
 * Features:
 * - 3 seeded cards with tarot arcana headings, icons, stats, and lore.
 * - Key selection via [1], [2], [3] (or mouse / touch click).
 * - Animated 6.0s countdown timer bar that auto-picks if the player does not choose.
 * - Smooth entrance and card selection pulse animations.
 * - Safe fallback in non-browser / headless test environments.
 * Zero external dependencies.
 */

import {
    AUTO_PICK_TIMEOUT_MS,
    createTarotDraftSession,
    updateDraftTimer,
    selectDraftCard,
} from '../../../shared/dream-tarot.js';

/**
 * Creates and initializes the sleek 3-card Dream Tarot Draft HUD director.
 *
 * @param {object} [options]
 * @param {HTMLElement} [options.container] - Optional parent container (defaults to document.body).
 * @param {Function} [options.onSelect] - Callback (card, session) => void when a blessing is picked.
 * @param {Function} [options.onOpen] - Callback (session) => void when modal opens.
 * @param {Function} [options.onClose] - Callback () => void when modal closes.
 * @returns {object} Tarot draft HUD instance.
 */
export function createTarotDraftHUD({
    container = null,
    onSelect = () => {},
    onOpen = () => {},
    onClose = () => {},
} = {}) {
    let currentSession = null;
    let isVisible = false;
    let rafId = null;
    let keydownHandler = null;

    // Check if running in a browser environment with DOM support
    const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
    const parent = container || (hasDOM ? document.body : null);

    let dom = null;
    if (hasDOM && parent) {
        dom = buildTarotDraftDOM();
        parent.appendChild(dom.root);
        setupDOMEvents();
    }

    /**
     * Binds keyboard [1], [2], [3] and click listeners.
     */
    function setupDOMEvents() {
        if (!hasDOM) return;

        keydownHandler = (e) => {
            if (!isVisible || !currentSession || !currentSession.active) return;
            const key = e.key;
            if (key === '1' || key === '2' || key === '3') {
                e.preventDefault();
                pickOption(key);
            }
        };

        window.addEventListener('keydown', keydownHandler);
    }

    /**
     * Displays the 3-Card Dream Tarot draft modal for a given checkpoint.
     *
     * @param {object} params
     * @param {number} params.checkpointIndex - Checkpoint number (2, 4, 6...).
     * @param {number} [params.seed=1337] - Seed for random dealing.
     * @param {Array<string>} [params.currentBlessings=[]] - Current player cards to avoid dupes.
     * @param {number} [params.startTimeMs=Date.now()] - Timestamp.
     * @param {number} [params.durationMs=AUTO_PICK_TIMEOUT_MS] - Countdown duration.
     * @returns {object} Created draft session.
     */
    function showDraft({
        checkpointIndex = 2,
        seed = 1337,
        currentBlessings = [],
        startTimeMs = Date.now(),
        durationMs = AUTO_PICK_TIMEOUT_MS,
    } = {}) {
        currentSession = createTarotDraftSession({
            checkpointIndex,
            seed,
            startTimeMs,
            currentBlessings,
            autoPickDurationMs: durationMs,
        });

        isVisible = true;

        if (dom) {
            renderCards(currentSession.cards);
            dom.checkpointBadge.textContent = `Checkpoint #${checkpointIndex} Reached`;
            dom.root.style.display = 'flex';
            dom.timerBar.style.width = '100%';
            dom.timerText.textContent = `${(durationMs / 1000).toFixed(1)}s`;
        }

        startTimerLoop();
        onOpen(currentSession);
        return currentSession;
    }

    /**
     * Picks a card by key ('1', '2', '3') or index (0, 1, 2).
     */
    function pickOption(choice) {
        if (!currentSession || !currentSession.active) return null;

        const outcome = selectDraftCard(currentSession, choice, Date.now());
        if (outcome.success) {
            finishSelection(outcome.card, outcome.selectedIndex, outcome.autoPicked);
        }
        return outcome;
    }

    /**
     * Renders the 3 cards in the DOM modal.
     */
    function renderCards(cards) {
        if (!dom) return;
        dom.cardsContainer.innerHTML = '';

        cards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'tarot-card';
            cardEl.dataset.index = index;
            cardEl.dataset.key = index + 1;

            cardEl.style.cssText = `
                flex: 1; min-width: 210px; max-width: 260px;
                background: linear-gradient(165deg, rgba(30, 41, 59, 0.92) 0%, rgba(15, 23, 42, 0.96) 100%);
                border: 2px solid ${card.accentColor || '#64748b'};
                border-radius: 16px; padding: 22px 18px;
                display: flex; flex-direction: column; align-items: center; text-align: center;
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                cursor: pointer; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, border-color 0.2s ease;
                position: relative; overflow: hidden; user-select: none;
            `;

            cardEl.innerHTML = `
                <!-- Arcana Header -->
                <div style="display: flex; justify-content: space-between; width: 100%; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${card.accentColor || '#38bdf8'}; opacity: 0.9;">
                    <span>${card.romanNumeral || 'I'}</span>
                    <span>${card.arcana || 'Dream Tarot'}</span>
                    <span>${card.romanNumeral || 'I'}</span>
                </div>

                <!-- Big Center Icon -->
                <div style="font-size: 48px; margin: 16px 0 10px; filter: drop-shadow(0 4px 12px ${card.accentColor || '#38bdf8'});">
                    ${card.icon || '✨'}
                </div>

                <!-- Card Name & Tagline -->
                <div style="font-size: 18px; font-weight: 800; color: #f8fafc; letter-spacing: -0.01em; margin-bottom: 4px;">
                    ${card.name}
                </div>
                <div style="font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: ${card.accentColor || '#94a3b8'}; margin-bottom: 12px;">
                    ${card.tagline}
                </div>

                <!-- Card Description -->
                <div style="font-size: 12.5px; line-height: 1.45; color: #cbd5e1; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px; width: 100%; box-sizing: border-box; min-height: 58px; display: flex; align-items: center; justify-content: center;">
                    ${card.description}
                </div>

                <!-- Lore Quote -->
                <div style="font-size: 10.5px; font-style: italic; color: #64748b; margin-top: 10px; line-height: 1.35; padding: 0 4px;">
                    "${card.lore}"
                </div>

                <!-- Key Hint Badge -->
                <div style="margin-top: auto; padding-top: 14px;">
                    <div style="
                        display: inline-flex; align-items: center; gap: 6px;
                        background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2);
                        padding: 5px 12px; border-radius: 20px; font-size: 11.5px; font-weight: 700; color: #f1f5f9;
                    ">
                        Press <kbd style="background: #0284c7; color: #fff; padding: 2px 7px; border-radius: 4px; font-family: monospace; font-size: 11px;">[${index + 1}]</kbd>
                    </div>
                </div>
            `;

            // Hover effects
            cardEl.addEventListener('mouseenter', () => {
                cardEl.style.transform = 'translateY(-8px) scale(1.03)';
                cardEl.style.boxShadow = `0 24px 48px rgba(0, 0, 0, 0.8), 0 0 20px ${card.accentColor || '#38bdf8'}`;
            });
            cardEl.addEventListener('mouseleave', () => {
                cardEl.style.transform = 'none';
                cardEl.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
            });

            // Click listener
            cardEl.addEventListener('click', () => {
                pickOption(index);
            });

            dom.cardsContainer.appendChild(cardEl);
        });
    }

    /**
     * Ticks the 6-second auto-pick timer.
     */
    function startTimerLoop() {
        if (!hasDOM) return;

        function tick() {
            if (!isVisible || !currentSession || !currentSession.active) return;

            const res = updateDraftTimer(currentSession, Date.now());

            if (dom) {
                const fraction = Math.max(0, currentSession.remainingMs / currentSession.durationMs);
                dom.timerBar.style.width = `${(fraction * 100).toFixed(1)}%`;
                dom.timerText.textContent = `${(currentSession.remainingMs / 1000).toFixed(1)}s`;

                // Warning colors as time runs low
                if (fraction < 0.25) {
                    dom.timerBar.style.background = '#ef4444'; // Red
                } else if (fraction < 0.5) {
                    dom.timerBar.style.background = '#f59e0b'; // Amber
                } else {
                    dom.timerBar.style.background = 'linear-gradient(90deg, #38bdf8, #818cf8)';
                }
            }

            if (res.autoSelected) {
                finishSelection(res.selectedCard, res.selectedIndex, true);
                return;
            }

            rafId = requestAnimationFrame(tick);
        }

        rafId = requestAnimationFrame(tick);
    }

    /**
     * Completes card draft selection and triggers callbacks.
     */
    function finishSelection(card, index, autoPicked) {
        if (rafId && hasDOM) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        // Card celebration pulse in DOM if available
        if (dom && dom.cardsContainer && dom.cardsContainer.children[index]) {
            const cardEl = dom.cardsContainer.children[index];
            cardEl.style.transform = 'scale(1.08)';
            cardEl.style.borderColor = '#10b981';
            cardEl.style.boxShadow = '0 0 35px #10b981';
        }

        setTimeout(() => {
            hideDraft();
            onSelect(card, currentSession);
        }, 350);
    }

    /**
     * Hides the Tarot Draft UI modal.
     */
    function hideDraft() {
        isVisible = false;
        if (rafId && hasDOM) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (dom) {
            dom.root.style.display = 'none';
        }
        onClose();
    }

    /**
     * Removes DOM elements and keyboard listeners.
     */
    function dispose() {
        hideDraft();
        if (keydownHandler && hasDOM) {
            window.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }
        if (dom && dom.root) {
            dom.root.remove();
        }
    }

    return {
        showDraft,
        pickOption,
        hideDraft,
        updateTimer: (nowMs) => updateDraftTimer(currentSession, nowMs),
        getSession: () => currentSession,
        isVisible: () => isVisible,
        dispose,
    };
}

/**
 * Builds the HTML DOM structure for the 3-Card Tarot Draft Modal.
 */
function buildTarotDraftDOM() {
    const root = document.createElement('div');
    root.id = 'dream-tarot-overlay';
    root.style.cssText = `
        position: fixed; inset: 0; background: rgba(7, 10, 19, 0.88); z-index: 10005;
        display: none; justify-content: center; align-items: center;
        backdrop-filter: blur(14px); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        color: #f8fafc; padding: 20px; box-sizing: border-box;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: radial-gradient(circle at 50% 0%, #1e293b 0%, #0f172a 100%);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 24px;
        width: min(860px, 96vw); padding: 32px 28px 24px;
        box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.85);
        display: flex; flex-direction: column; align-items: center; gap: 20px;
        position: relative;
    `;

    modal.innerHTML = `
        <!-- Title & Subtitle Header -->
        <div style="text-align: center;">
            <div id="tarot-checkpoint-badge" style="
                display: inline-block; font-size: 11px; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.15em; color: #38bdf8; background: rgba(56, 189, 248, 0.12);
                border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 20px; padding: 4px 14px; margin-bottom: 8px;
            ">Checkpoint #2 Reached</div>
            <div style="font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: #fff;">
                🔮 Dream Tarot Blessing Draft
            </div>
            <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">
                Choose 1 rogue-lite arcana card to augment your crew downriver
            </div>
        </div>

        <!-- 3-Cards Flex Row -->
        <div id="tarot-cards-container" style="
            display: flex; gap: 16px; justify-content: center; width: 100%; flex-wrap: wrap; margin-top: 4px;
        "></div>

        <!-- Timer / Auto-Pick Bar Footer -->
        <div style="width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 6px;">
            <div style="display: flex; justify-content: space-between; width: 100%; font-size: 11.5px; font-weight: 600; color: #94a3b8;">
                <span>⏳ Auto-draft in:</span>
                <span id="tarot-timer-text" style="font-family: monospace; font-weight: 700; color: #f1f5f9;">6.0s</span>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 6px; overflow: hidden;">
                <div id="tarot-timer-bar" style="
                    height: 100%; width: 100%;
                    background: linear-gradient(90deg, #38bdf8, #818cf8);
                    border-radius: 6px; transition: width 0.1s linear, background 0.3s ease;
                "></div>
            </div>
        </div>
    `;

    root.appendChild(modal);

    return {
        root,
        checkpointBadge: modal.querySelector('#tarot-checkpoint-badge'),
        cardsContainer: modal.querySelector('#tarot-cards-container'),
        timerBar: modal.querySelector('#tarot-timer-bar'),
        timerText: modal.querySelector('#tarot-timer-text'),
    };
}
