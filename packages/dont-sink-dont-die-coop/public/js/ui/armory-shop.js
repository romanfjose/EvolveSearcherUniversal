/**
 * Interactive 3D Harbor Armory Shop & Crew Loadout UI
 * Multi-tier AAA Armory overlay with:
 * - 3 Upgrade tiers per slot (Motor, Weapon, Armor)
 * - Visual stat comparison bars (Speed, Turn Rate, DPS, Max HP) with projected deltas
 * - Hotkey buy listeners (1: Motor, 2: Weapon, 3: Armor, 4: Quick Auto-Equip)
 * - Crew bot auto-equip status list
 * - Interactive 3D preview inspection capability using Three.js (when available)
 */

import {
    UPGRADE_SLOTS,
    ARMORY_UPGRADE_TREE,
    ALL_UPGRADES,
    getSlotCurrentTier,
    getNextSlotUpgrade,
    calculateCumulativeStats,
    calculateStatComparison,
    canPurchaseArmoryUpgrade,
    resolveArmoryHotkey,
    getCrewBotsAutoEquipSummary,
} from '../../../shared/upgrade-tree.js';

export function createArmoryShopUI({
    containerId = 'armory-overlay',
    socket = null,
    onPurchase = null,
    THREE = null,
} = {}) {
    let isOpen = false;
    let localPlayer = { coins: 50, upgrades: [], isDead: false };
    let crewPlayers = {};
    let hoveredUpgrade = null;
    let threePreview = null;

    // Inject CSS styles if in browser DOM
    if (typeof document !== 'undefined' && !document.getElementById('armory-shop-styles')) {
        const style = document.createElement('style');
        style.id = 'armory-shop-styles';
        style.textContent = `
            .armory-overlay {
                position: fixed;
                inset: 0;
                background: rgba(8, 12, 18, 0.88);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #e6ebf2;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease-out;
            }
            .armory-overlay.open {
                opacity: 1;
                pointer-events: auto;
                cursor: default;
            }
            .armory-modal {
                width: min(980px, 94vw);
                max-height: 90vh;
                background: linear-gradient(175deg, rgba(20, 27, 38, 0.95), rgba(13, 18, 26, 0.98));
                border: 1px solid rgba(94, 234, 212, 0.25);
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6), 0 0 32px rgba(94, 234, 212, 0.1);
                border-radius: 14px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .armory-header {
                padding: 16px 24px;
                background: rgba(14, 20, 29, 0.7);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .armory-title {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 18px;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: #5eead4;
            }
            .armory-title .icon-gem {
                width: 10px;
                height: 10px;
                background: #5eead4;
                transform: rotate(45deg);
                box-shadow: 0 0 10px #5eead4;
            }
            .armory-currency {
                display: flex;
                align-items: center;
                gap: 16px;
                font-family: ui-monospace, monospace;
            }
            .armory-coins-badge {
                background: rgba(251, 191, 36, 0.12);
                border: 1px solid rgba(251, 191, 36, 0.35);
                color: #fbbf24;
                padding: 6px 12px;
                border-radius: 8px;
                font-weight: 700;
                font-size: 15px;
            }
            .armory-close-btn {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.12);
                color: #8d99ab;
                width: 32px;
                height: 32px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                transition: all 0.15s ease;
            }
            .armory-close-btn:hover {
                background: rgba(248, 113, 113, 0.2);
                border-color: rgba(248, 113, 113, 0.4);
                color: #f87171;
            }
            .armory-body {
                display: grid;
                grid-template-columns: 1fr 340px;
                gap: 20px;
                padding: 22px 24px;
                overflow-y: auto;
            }
            @media (max-width: 820px) {
                .armory-body { grid-template-columns: 1fr; }
            }
            .armory-slots-panel {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .armory-slot-card {
                background: rgba(18, 24, 34, 0.65);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                padding: 14px 18px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .armory-slot-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .armory-slot-tag {
                font-family: ui-monospace, monospace;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: #8d99ab;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .armory-hotkey-pill {
                background: #1e293b;
                border: 1px solid #334155;
                color: #5eead4;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 4px;
            }
            .armory-tier-row {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
            }
            .armory-tier-box {
                background: rgba(13, 18, 26, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 8px;
                padding: 10px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                min-height: 100px;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
            }
            .armory-tier-box:hover {
                border-color: rgba(94, 234, 212, 0.4);
                background: rgba(20, 28, 40, 0.85);
            }
            .armory-tier-box.owned {
                border-color: rgba(74, 222, 128, 0.4);
                background: rgba(74, 222, 128, 0.06);
            }
            .armory-tier-box.next-buy {
                border-color: rgba(94, 234, 212, 0.7);
                box-shadow: 0 0 12px rgba(94, 234, 212, 0.15);
            }
            .armory-tier-box.locked {
                opacity: 0.45;
                cursor: not-allowed;
            }
            .armory-tier-name {
                font-weight: 700;
                font-size: 13px;
                margin-bottom: 2px;
            }
            .armory-tier-sub {
                font-size: 10.5px;
                color: #8d99ab;
                line-height: 1.25;
            }
            .armory-tier-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 8px;
            }
            .armory-cost-tag {
                font-family: ui-monospace, monospace;
                font-weight: 700;
                color: #fbbf24;
                font-size: 12px;
            }
            .armory-buy-btn {
                background: #5eead4;
                color: #04201c;
                border: 0;
                border-radius: 5px;
                font-weight: 700;
                font-size: 11px;
                padding: 4px 8px;
                cursor: pointer;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                transition: filter 0.15s ease;
            }
            .armory-buy-btn:hover:not(:disabled) {
                filter: brightness(1.15);
            }
            .armory-buy-btn:disabled {
                background: #252e3d;
                color: #64748b;
                cursor: not-allowed;
            }
            .armory-sidebar {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .armory-stats-card, .armory-bots-card {
                background: rgba(18, 24, 34, 0.75);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            .armory-card-title {
                font-family: ui-monospace, monospace;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: #5eead4;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .armory-stat-group {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .armory-stat-labels {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
            }
            .armory-stat-val {
                font-family: ui-monospace, monospace;
                font-weight: 600;
            }
            .armory-stat-delta {
                font-size: 11px;
                font-weight: 700;
                margin-left: 6px;
            }
            .armory-stat-delta.positive { color: #4ade80; }
            .armory-stat-delta.negative { color: #f87171; }
            .armory-progress-track {
                height: 8px;
                background: rgba(255, 255, 255, 0.07);
                border-radius: 4px;
                position: relative;
                overflow: hidden;
            }
            .armory-progress-bar-current {
                position: absolute;
                top: 0;
                left: 0;
                bottom: 0;
                background: #38bdf8;
                border-radius: 4px;
                transition: width 0.2s ease;
                z-index: 1;
            }
            .armory-progress-bar-delta {
                position: absolute;
                top: 0;
                bottom: 0;
                border-radius: 4px;
                transition: all 0.2s ease;
                z-index: 2;
            }
            .armory-progress-bar-delta.positive {
                background: #4ade80;
                box-shadow: 0 0 6px #4ade80;
            }
            .armory-progress-bar-delta.negative {
                background: #f87171;
            }
            .armory-bots-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .armory-bot-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(13, 18, 26, 0.6);
                border: 1px solid rgba(255, 255, 255, 0.05);
                padding: 8px 10px;
                border-radius: 6px;
                font-size: 12px;
            }
            .armory-bot-name {
                font-weight: 600;
            }
            .armory-bot-status {
                font-family: ui-monospace, monospace;
                font-size: 11px;
                color: #8d99ab;
            }
            .armory-bot-status.ready {
                color: #4ade80;
            }
            .armory-3d-canvas-box {
                height: 120px;
                background: radial-gradient(circle at center, #172436 0%, #0c121a 100%);
                border: 1px solid rgba(94, 234, 212, 0.2);
                border-radius: 8px;
                position: relative;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .armory-3d-label {
                position: absolute;
                top: 6px;
                left: 8px;
                font-family: ui-monospace, monospace;
                font-size: 10px;
                color: #5eead4;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                pointer-events: none;
            }
            .armory-hotkeys-bar {
                padding: 12px 24px;
                background: rgba(14, 20, 29, 0.8);
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                color: #8d99ab;
                font-family: ui-monospace, monospace;
            }
            .armory-hotkey-group {
                display: flex;
                gap: 16px;
            }
            .armory-hotkey-item kbd {
                background: #1e293b;
                color: #5eead4;
                border: 1px solid #334155;
                padding: 2px 6px;
                border-radius: 4px;
                margin-right: 4px;
                font-weight: 700;
            }
        `;
        document.head.appendChild(style);
    }

    // Build or locate modal container
    let rootEl = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    if (typeof document !== 'undefined' && !rootEl) {
        rootEl = document.createElement('div');
        rootEl.id = containerId;
        rootEl.className = 'armory-overlay';
        document.body.appendChild(rootEl);
    }

    // Keyboard listener for hotkeys 1, 2, 3, 4 and Escape
    function handleKeyDown(e) {
        if (!isOpen) return;
        const key = e.key;
        if (key === 'Escape' || key === 'e' || key === 'E') {
            closeShop();
            return;
        }
        if (['1', '2', '3', '4'].includes(key)) {
            const result = resolveArmoryHotkey(key, localPlayer);
            if (result && result.item && (result.ok || result.action === 'auto_equip')) {
                executePurchase(result.item.id);
            }
        }
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown);
    }

    function init3DPreview() {
        if (!THREE || typeof document === 'undefined') return null;
        const canvasContainer = rootEl?.querySelector('#armory-3d-box');
        if (!canvasContainer) return null;

        try {
            const width = canvasContainer.clientWidth || 308;
            const height = canvasContainer.clientHeight || 120;
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
            camera.position.set(0, 1.2, 3.5);
            camera.lookAt(0, 0, 0);

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(width, height);
            canvasContainer.appendChild(renderer.domElement);

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
            scene.add(ambientLight);
            const dirLight = new THREE.DirectionalLight(0x5eead4, 1.2);
            dirLight.position.set(3, 5, 4);
            scene.add(dirLight);

            // Preview rotating showcase mesh
            const geom = new THREE.DodecahedronGeometry(0.8);
            const mat = new THREE.MeshStandardMaterial({
                color: 0x5eead4,
                roughness: 0.3,
                metalness: 0.6,
            });
            const showcaseMesh = new THREE.Mesh(geom, mat);
            scene.add(showcaseMesh);

            let animId = null;
            function renderLoop() {
                if (!isOpen) return;
                showcaseMesh.rotation.y += 0.015;
                showcaseMesh.rotation.x += 0.005;
                renderer.render(scene, camera);
                animId = requestAnimationFrame(renderLoop);
            }
            renderLoop();

            return {
                scene,
                renderer,
                mesh: showcaseMesh,
                dispose() {
                    if (animId) cancelAnimationFrame(animId);
                    renderer.dispose();
                    if (renderer.domElement && renderer.domElement.parentNode) {
                        renderer.domElement.parentNode.removeChild(renderer.domElement);
                    }
                },
                setPreviewColor(hex) {
                    if (showcaseMesh && showcaseMesh.material) {
                        showcaseMesh.material.color.setHex(hex);
                    }
                },
            };
        } catch {
            return null;
        }
    }

    function executePurchase(upgradeId) {
        if (!upgradeId) return;
        const item = ALL_UPGRADES[upgradeId];
        if (!item) return;

        localPlayer.coins = Number.isFinite(Number(localPlayer.coins)) ? Math.max(0, Math.round(Number(localPlayer.coins))) : 50;
        const check = canPurchaseArmoryUpgrade(localPlayer, item);
        if (!check.ok) return;

        // Optimistically apply upgrade locally first so callbacks see updated state
        localPlayer.coins = Math.max(0, localPlayer.coins - item.cost);
        if (!localPlayer.upgrades.includes(item.slot)) localPlayer.upgrades.push(item.slot);
        if (!localPlayer.upgrades.includes(item.id)) localPlayer.upgrades.push(item.id);

        if (socket && typeof socket.emit === 'function') {
            // Emits standard socket buyUpgrade with legacyType / id
            socket.emit('buyUpgrade', item.legacyType || item.id);
        }
        if (typeof onPurchase === 'function') {
            onPurchase(item);
        }

        render();
    }

    function render() {
        if (!rootEl) return;
        localPlayer.coins = Number.isFinite(Number(localPlayer.coins)) ? Math.max(0, Math.round(Number(localPlayer.coins))) : 50;

        const comparison = calculateStatComparison(localPlayer.upgrades, hoveredUpgrade);
        const botsSummary = getCrewBotsAutoEquipSummary(crewPlayers);

        const slotsHtml = Object.values(UPGRADE_SLOTS).map((slotKey, sIdx) => {
            const tiers = ARMORY_UPGRADE_TREE[slotKey];
            const currentTier = getSlotCurrentTier(localPlayer.upgrades, slotKey);
            const hotkeyPill = sIdx < 3 ? `<span class="armory-hotkey-pill">[${sIdx + 1}]</span>` : '';

            const tiersHtml = tiers.map((tierItem) => {
                const isOwned = tierItem.tier <= currentTier;
                const isNext = tierItem.tier === currentTier + 1;
                const isLocked = tierItem.tier > currentTier + 1;
                const canAfford = localPlayer.coins >= tierItem.cost;

                let cardClass = 'armory-tier-box';
                if (isOwned) cardClass += ' owned';
                else if (isNext) cardClass += ' next-buy';
                else if (isLocked) cardClass += ' locked';

                let btnLabel = 'Buy';
                let btnDisabled = false;
                if (isOwned) {
                    btnLabel = 'Owned';
                    btnDisabled = true;
                } else if (isLocked) {
                    btnLabel = 'Locked';
                    btnDisabled = true;
                } else if (!canAfford) {
                    btnLabel = 'Need Coins';
                    btnDisabled = true;
                }

                return `
                    <div class="${cardClass}"
                         data-upgrade-id="${tierItem.id}"
                         tabindex="0">
                        <div>
                            <div class="armory-tier-name">${tierItem.name}</div>
                            <div class="armory-tier-sub">${tierItem.subtitle}</div>
                        </div>
                        <div class="armory-tier-footer">
                            <span class="armory-cost-tag">${tierItem.cost}c</span>
                            <button class="armory-buy-btn"
                                    data-buy-id="${tierItem.id}"
                                    ${btnDisabled ? 'disabled' : ''}>
                                ${btnLabel}
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="armory-slot-card">
                    <div class="armory-slot-header">
                        <span class="armory-slot-tag">${hotkeyPill} Slot: ${slotKey}</span>
                        <span style="font-size:12px;color:#8d99ab;">Tier ${currentTier} / 3</span>
                    </div>
                    <div class="armory-tier-row">
                        ${tiersHtml}
                    </div>
                </div>
            `;
        }).join('');

        // Visual stat comparison bars HTML
        const stats = [
            { key: 'speed', label: 'Speed', unit: 'm/s', cur: comparison.current.speed, d: comparison.deltas.speed, curPct: comparison.currentBars.speedPct, prjPct: comparison.projectedBars.speedPct },
            { key: 'turnRate', label: 'Turn Rate', unit: 'rad/s', cur: comparison.current.turnRate, d: comparison.deltas.turnRate, curPct: comparison.currentBars.turnRatePct, prjPct: comparison.projectedBars.turnRatePct },
            { key: 'dps', label: 'DPS', unit: 'dmg', cur: comparison.current.dps, d: comparison.deltas.dps, curPct: comparison.currentBars.dpsPct, prjPct: comparison.projectedBars.dpsPct },
            { key: 'maxHp', label: 'Max HP', unit: 'hp', cur: comparison.current.maxHp, d: comparison.deltas.maxHp, curPct: comparison.currentBars.maxHpPct, prjPct: comparison.projectedBars.maxHpPct },
        ];

        const statsHtml = stats.map((s) => {
            const hasDelta = s.d !== 0;
            const deltaClass = s.d > 0 ? 'positive' : 'negative';
            const deltaSign = s.d > 0 ? '+' : '';
            const deltaText = hasDelta ? `<span class="armory-stat-delta ${deltaClass}">(${deltaSign}${s.d} ${s.unit})</span>` : '';

            // Compute delta bar positioning
            const left = Math.min(s.curPct, s.prjPct);
            const width = Math.abs(s.prjPct - s.curPct);
            const deltaBarHtml = hasDelta ? `
                <div class="armory-progress-bar-delta ${deltaClass}"
                     style="left: ${left}%; width: ${width}%;"></div>
            ` : '';

            return `
                <div class="armory-stat-group">
                    <div class="armory-stat-labels">
                        <span>${s.label}</span>
                        <div>
                            <span class="armory-stat-val">${s.cur} ${s.unit}</span>
                            ${deltaText}
                        </div>
                    </div>
                    <div class="armory-progress-track">
                        <div class="armory-progress-bar-current" style="width: ${s.curPct}%;"></div>
                        ${deltaBarHtml}
                    </div>
                </div>
            `;
        }).join('');

        // Crew bot auto-equip summary list
        const botsHtml = botsSummary.length ? botsSummary.map((b) => `
            <div class="armory-bot-item">
                <span class="armory-bot-name">🤖 ${b.name || 'Crew'} (${Number.isFinite(Number(b.coins)) ? b.coins : 50}c)</span>
                <span class="armory-bot-status ${b.readyToUpgrade ? 'ready' : ''}">${b.statusLabel}</span>
            </div>
        `).join('') : '<div style="font-size:12px;color:#8d99ab;">Crew sailing in formation</div>';

        rootEl.innerHTML = `
            <div class="armory-modal">
                <div class="armory-header">
                    <div class="armory-title">
                        <i class="icon-gem"></i>
                        Harbor Armory & Crew Loadout
                    </div>
                    <div class="armory-currency">
                        <div class="armory-coins-badge">🪙 <span id="armory-coin-val">${localPlayer.coins}</span>c</div>
                        <button class="armory-close-btn" id="armory-close" title="Close [Esc]">✕</button>
                    </div>
                </div>

                <div class="armory-body">
                    <div class="armory-slots-panel">
                        ${slotsHtml}
                    </div>

                    <div class="armory-sidebar">
                        <div class="armory-stats-card">
                            <div class="armory-card-title">
                                <span>Performance Stats</span>
                                <span style="font-size:10px;color:#8d99ab;">${hoveredUpgrade ? hoveredUpgrade.name : 'Current'}</span>
                            </div>
                            <div class="armory-3d-canvas-box" id="armory-3d-box">
                                <span class="armory-3d-label">${hoveredUpgrade ? hoveredUpgrade.name : 'Craft Rig'}</span>
                            </div>
                            ${statsHtml}
                        </div>

                        <div class="armory-bots-card">
                            <div class="armory-card-title">
                                <span>Crew Bot Auto-Equip</span>
                                <span class="armory-hotkey-pill">[4] Quick Buy</span>
                            </div>
                            <div class="armory-bots-list">
                                ${botsHtml}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="armory-hotkeys-bar">
                    <div class="armory-hotkey-group">
                        <span class="armory-hotkey-item"><kbd>1</kbd> Motor</span>
                        <span class="armory-hotkey-item"><kbd>2</kbd> Weapon</span>
                        <span class="armory-hotkey-item"><kbd>3</kbd> Armor</span>
                        <span class="armory-hotkey-item"><kbd>4</kbd> Crew Bot Auto-Equip</span>
                        <span class="armory-hotkey-item"><kbd>E / Esc</kbd> Close</span>
                    </div>
                    <div>Harbor Dock City • Free Repairs</div>
                </div>
            </div>
        `;

        // Reconnect 3D preview viewport
        if (!threePreview) {
            threePreview = init3DPreview();
        }

        function updateSidebar() {
            const sidebar = rootEl.querySelector('.armory-sidebar');
            if (!sidebar) return;
            const comp = calculateStatComparison(localPlayer.upgrades, hoveredUpgrade);
            const stats = [
                { key: 'speed', label: 'Speed', unit: 'm/s', cur: comp.current.speed, d: comp.deltas.speed, curPct: comp.currentBars.speedPct, prjPct: comp.projectedBars.speedPct },
                { key: 'turnRate', label: 'Turn Rate', unit: 'rad/s', cur: comp.current.turnRate, d: comp.deltas.turnRate, curPct: comp.currentBars.turnRatePct, prjPct: comp.projectedBars.turnRatePct },
                { key: 'dps', label: 'DPS', unit: 'dmg', cur: comp.current.dps, d: comp.deltas.dps, curPct: comp.currentBars.dpsPct, prjPct: comp.projectedBars.dpsPct },
                { key: 'maxHp', label: 'Max HP', unit: 'hp', cur: comp.current.maxHp, d: comp.deltas.maxHp, curPct: comp.currentBars.maxHpPct, prjPct: comp.projectedBars.maxHpPct },
            ];

            const previewLabel = sidebar.querySelector('.armory-3d-label');
            if (previewLabel) previewLabel.textContent = hoveredUpgrade ? hoveredUpgrade.name : 'Craft Rig';

            const cardSub = sidebar.querySelector('.armory-card-title span:last-child');
            if (cardSub) cardSub.textContent = hoveredUpgrade ? hoveredUpgrade.name : 'Current';

            const statGroups = sidebar.querySelectorAll('.armory-stat-group');
            stats.forEach((s, i) => {
                const group = statGroups[i];
                if (!group) return;
                const hasDelta = s.d !== 0;
                const deltaClass = s.d > 0 ? 'positive' : 'negative';
                const deltaSign = s.d > 0 ? '+' : '';
                const deltaHtml = hasDelta ? `<span class="armory-stat-delta ${deltaClass}">(${deltaSign}${s.d} ${s.unit})</span>` : '';

                const valContainer = group.querySelector('.armory-stat-labels div');
                if (valContainer) valContainer.innerHTML = `<span class="armory-stat-val">${s.cur} ${s.unit}</span>${deltaHtml}`;

                const curBar = group.querySelector('.armory-progress-bar-current');
                if (curBar) curBar.style.width = `${s.curPct}%`;

                let deltaBar = group.querySelector('.armory-progress-bar-delta');
                if (hasDelta) {
                    if (!deltaBar) {
                        deltaBar = document.createElement('div');
                        group.querySelector('.armory-progress-track')?.appendChild(deltaBar);
                    }
                    deltaBar.className = `armory-progress-bar-delta ${deltaClass}`;
                    deltaBar.style.left = `${Math.min(s.curPct, s.prjPct)}%`;
                    deltaBar.style.width = `${Math.abs(s.prjPct - s.curPct)}%`;
                } else if (deltaBar) {
                    deltaBar.remove();
                }
            });
        }

        // Attach event listeners to elements
        rootEl.querySelector('#armory-close')?.addEventListener('click', closeShop);

        rootEl.querySelectorAll('[data-buy-id]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                executePurchase(btn.dataset.buyId);
            });
        });

        rootEl.querySelectorAll('[data-upgrade-id]').forEach((card) => {
            const uId = card.dataset.upgradeId;
            card.addEventListener('click', () => {
                executePurchase(uId);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    executePurchase(uId);
                }
            });
            card.addEventListener('mouseenter', () => {
                if (hoveredUpgrade?.id === uId) return;
                hoveredUpgrade = ALL_UPGRADES[uId];
                if (threePreview) {
                    const color = hoveredUpgrade.slot === 'motor' ? 0x38bdf8 : hoveredUpgrade.slot === 'weapon' ? 0xf43f5e : 0x4ade80;
                    threePreview.setPreviewColor(color);
                }
                updateSidebar();
            });
            card.addEventListener('mouseleave', () => {
                if (!hoveredUpgrade) return;
                hoveredUpgrade = null;
                updateSidebar();
            });
        });
    }

    function openShop(playerData = null, allPlayers = null) {
        if (typeof document !== 'undefined') {
            try { document.exitPointerLock?.(); } catch (_e) { /* ignore */ }
            if (document.body) document.body.style.cursor = 'default';
        }
        if (playerData) {
            const safeCoins = Number.isFinite(Number(playerData.coins)) ? Math.max(0, Math.round(Number(playerData.coins))) : 50;
            localPlayer = { ...playerData, coins: safeCoins, upgrades: [...(playerData.upgrades || [])] };
        }
        if (allPlayers) crewPlayers = { ...allPlayers };
        isOpen = true;
        if (rootEl) {
            rootEl.classList.add('open');
            render();
        }
    }

    function closeShop() {
        isOpen = false;
        hoveredUpgrade = null;
        if (rootEl) {
            rootEl.classList.remove('open');
        }
        if (threePreview) {
            threePreview.dispose();
            threePreview = null;
        }
    }

    function toggleShop(playerData = null, allPlayers = null) {
        if (isOpen) closeShop();
        else openShop(playerData, allPlayers);
    }

    function updatePlayerData(p) {
        localPlayer = { ...p };
        if (isOpen) render();
    }

    function updateCrewPlayers(players) {
        crewPlayers = { ...players };
        if (isOpen) render();
    }

    return {
        open: openShop,
        close: closeShop,
        toggle: toggleShop,
        updatePlayerData,
        updateCrewPlayers,
        isOpen: () => isOpen,
        executePurchase,
        dispose() {
            closeShop();
            if (typeof window !== 'undefined') {
                window.removeEventListener('keydown', handleKeyDown);
            }
            if (rootEl && rootEl.parentNode) {
                rootEl.parentNode.removeChild(rootEl);
            }
        },
    };
}
