/**
 * Don't Sink, Don't Die — Post-Run Social Share Postcard & Highlight Reel Generator
 * Zero external dependencies.
 *
 * Requirements fulfilled:
 * 1. Track the 3 funniest/most hype moments of every run (biggest Wizard yeet survived,
 *    longest plank parkour chain, clutch 1-HP checkpoint revive, fastest Boss kill,
 *    most Squeaky Hammer honks).
 * 2. Render a downloadable 1200x630 Canvas Postcard image + 1-click
 *    "Copy Friend Challenge Link (?seed=...&ghost=...)" so players can challenge
 *    their friends to beat their crew's run.
 */

import {
    HIGHLIGHT_DEFINITIONS,
    HIGHLIGHT_TYPES,
    HighlightTracker,
    selectTopHighlights,
    generateChallengeUrl,
    parseChallengeUrl,
} from '../../../shared/highlight-reel.js';

export const POSTCARD_WIDTH = 1200;
export const POSTCARD_HEIGHT = 630;

/**
 * Pure rendering function that draws the 1200x630 Social Postcard onto an HTML5 Canvas context.
 * Can be run in browser Canvas or any standard 2D Context mock.
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context with width=1200, height=630
 * @param {object} postcardData - Run metadata and highlights
 */
export function renderPostcardToCanvas(ctx, postcardData = {}) {
    const {
        title = "DON'T SINK, DON'T DIE",
        subtitle = 'RIVER MOUTH VICTORY DISPATCH',
        crewNames = ['Captain', 'Deckhand'],
        squadRating = 'S+',
        finalTimeFormatted = '04:12.8',
        seed = 1337,
        highlights = [],
        watermark = 'Challenge your friends: ?seed=' + (seed || 1337),
    } = postcardData;

    const w = POSTCARD_WIDTH;
    const h = POSTCARD_HEIGHT;

    // 1. Dark Aquatic Deep-River Gradient Background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(0.45, '#0d192e');
    bgGrad.addColorStop(1, '#05111e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Ambient Canyon Glow Orbs (Procedural Lighting)
    const radGlow1 = ctx.createRadialGradient(200, 100, 10, 200, 100, 400);
    radGlow1.addColorStop(0, 'rgba(56, 189, 248, 0.18)'); // Cyan glow
    radGlow1.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = radGlow1;
    ctx.fillRect(0, 0, w, h);

    const radGlow2 = ctx.createRadialGradient(1050, 520, 10, 1050, 520, 350);
    radGlow2.addColorStop(0, 'rgba(245, 158, 11, 0.16)'); // Amber lantern glow
    radGlow2.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = radGlow2;
    ctx.fillRect(0, 0, w, h);

    // 3. Grid Pattern & River Current Waves (Subtle Geometry)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 40; x < w; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 40; y < h; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    ctx.restore();

    // 4. Stylized Outer Cyber/Nautical Border Frame
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, w - 48, h - 48);

    // Corner Accents
    const cornerSize = 24;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 5;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(24, 24 + cornerSize); ctx.lineTo(24, 24); ctx.lineTo(24 + cornerSize, 24);
    ctx.stroke();
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(w - 24 - cornerSize, 24); ctx.lineTo(w - 24, 24); ctx.lineTo(w - 24, 24 + cornerSize);
    ctx.stroke();
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(24, h - 24 - cornerSize); ctx.lineTo(24, h - 24); ctx.lineTo(24 + cornerSize, h - 24);
    ctx.stroke();
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(w - 24 - cornerSize, h - 24); ctx.lineTo(w - 24, h - 24); ctx.lineTo(w - 24, h - 24 - cornerSize);
    ctx.stroke();
    ctx.restore();

    // 5. Header Section: Title & Subtitle
    ctx.save();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('🌊  ' + subtitle.toUpperCase(), 54, 68);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '-0.5px';
    ctx.fillText(title, 54, 118);

    // Crew line
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 16px system-ui, -apple-system, sans-serif';
    const crewString = Array.isArray(crewNames) ? crewNames.join(' • ') : String(crewNames);
    ctx.fillText(`Crew: ${crewString}`, 54, 146);
    ctx.restore();

    // 6. Header Badges: Squad Rating + Run Time + Seed Pill
    ctx.save();
    // Squad Rating Box
    const badgeX = w - 240;
    const badgeY = 50;
    const badgeW = 186;
    const badgeH = 92;

    const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
    badgeGrad.addColorStop(0, '#10b981');
    badgeGrad.addColorStop(1, '#047857');
    ctx.fillStyle = badgeGrad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 12) : ctx.rect(badgeX, badgeY, badgeW, badgeH);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText('SQUAD RATING', badgeX + 16, badgeY + 28);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 38px system-ui, -apple-system, sans-serif';
    ctx.fillText(squadRating, badgeX + 16, badgeY + 70);

    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(finalTimeFormatted, badgeX + 85, badgeY + 68);
    ctx.restore();

    // 7. Divider Line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(54, 172);
    ctx.lineTo(w - 54, 172);
    ctx.stroke();
    ctx.restore();

    // 8. Highlight Reel Section Title
    ctx.save();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('🏆 TOP RUN HIGHLIGHT REEL & HYPE MOMENTS', 54, 210);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(`SEED #${seed}`, w - 160, 210);
    ctx.restore();

    // 9. Render the 3 Highlight Cards
    const topHighlights = (highlights && highlights.length > 0)
        ? highlights.slice(0, 3)
        : [];

    const cardY = 236;
    const cardH = 300;
    const cardGap = 24;
    const totalAvailW = (w - 108) - (cardGap * 2);
    const cardW = Math.floor(totalAvailW / 3);

    for (let i = 0; i < 3; i++) {
        const hCard = topHighlights[i] || null;
        const cardX = 54 + i * (cardW + cardGap);
        renderHighlightCard(ctx, cardX, cardY, cardW, cardH, hCard, i + 1);
    }

    // 10. Footer Section: Friend Challenge CTA & Watermark
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(54, 560);
    ctx.lineTo(w - 54, 560);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.fillText('⚔️  FRIEND CHALLENGE:', 54, 592);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(watermark, 235, 592);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText("DON'T SINK, DON'T DIE • AAA RIVER SURVIVAL", w - 54, 592);
    ctx.restore();
}

/**
 * Draws a single highlight card on the postcard canvas.
 */
function renderHighlightCard(ctx, x, y, width, height, moment, rank) {
    ctx.save();

    const color = moment?.badgeColor || '#3b82f6';

    // Card Background Box
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, width, height, 16) : ctx.rect(x, y, width, height);
    ctx.fill();

    // Border with category tint
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rank Badge (Top-Right)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x + width - 42, y + 14, 30, 24, 6) : ctx.rect(x + width - 42, y + 14, 30, 24);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`#${rank}`, x + width - 27, y + 31);
    ctx.textAlign = 'left';

    if (moment) {
        // Icon Circle
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.arc(x + 44, y + 46, 26, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '28px system-ui, sans-serif';
        ctx.fillText(moment.icon || '🔥', x + 28, y + 56);

        // Category Tag
        ctx.fillStyle = color;
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.letterSpacing = '1px';
        ctx.fillText((moment.category || 'MOMENT').toUpperCase(), x + 82, y + 40);

        // Score Text
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(moment.scoreText || `${Math.round(moment.score || 0)} Pts`, x + 82, y + 58);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 20px system-ui, -apple-system, sans-serif';
        ctx.fillText(moment.title || 'Epic Play', x + 20, y + 106);

        // Tagline
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'italic 600 13px system-ui, -apple-system, sans-serif';
        ctx.fillText(`"${moment.tagline || ''}"`, x + 20, y + 130);

        // Player credit
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        ctx.fillText(`By: ${moment.playerName || 'Crewmate'}`, x + 20, y + 158);

        // Description / Detail Box
        const descBoxY = y + 175;
        const descBoxH = height - 190;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x + 16, descBoxY, width - 32, descBoxH, 10) : ctx.rect(x + 16, descBoxY, width - 32, descBoxH);
        ctx.fill();

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '500 13px system-ui, -apple-system, sans-serif';
        wrapText(ctx, moment.detail || moment.description || '', x + 26, descBoxY + 28, width - 52, 20);
    } else {
        // Empty State Card
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
        ctx.fillText('Uncharted Stunt', x + 20, y + 60);
        ctx.fillStyle = '#475569';
        ctx.font = '13px system-ui, -apple-system, sans-serif';
        ctx.fillText('No highlight registered in this slot.', x + 20, y + 90);
    }

    ctx.restore();
}

/**
 * Basic word-wrapping helper for Canvas 2D.
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let curY = y;

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line.trim(), x, curY);
            line = words[n] + ' ';
            curY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line.trim(), x, curY);
}

// ─── UI Overlay Component & Lifecycle Manager ──────────────────────────────

/**
 * Creates and manages the Social Share Postcard & Highlight Reel Modal UI.
 *
 * @param {object} params
 * @param {Function} [params.onClose] - Callback when modal is closed
 * @param {string} [params.baseUrl] - Base host URL for challenge links
 */
export function createSharePostcardManager({
    onClose = () => {},
    baseUrl = typeof window !== 'undefined' ? window.location.href : '',
} = {}) {
    const tracker = new HighlightTracker();
    let currentPostcardData = null;
    let canvasEl = null;

    // Build DOM elements if running in browser
    let dom = null;
    if (typeof document !== 'undefined') {
        dom = buildPostcardDOM();
        document.body.appendChild(dom.root);
        canvasEl = dom.canvas;
        setupDOMEvents(dom);
    }

    function setupDOMEvents(domElements) {
        // 1-Click Download Canvas Postcard image
        domElements.downloadBtn.addEventListener('click', () => {
            downloadPostcardImage();
        });

        // 1-Click Copy Friend Challenge Link
        domElements.copyBtn.addEventListener('click', () => {
            copyFriendChallengeLink();
        });

        // Close button
        domElements.closeBtn.addEventListener('click', () => {
            hide();
        });

        // Background backdrop click
        domElements.root.addEventListener('click', (e) => {
            if (e.target === domElements.root) {
                hide();
            }
        });
    }

    /**
     * Prepares and shows the Postcard Modal given run end data.
     */
    function show(runReport = {}) {
        const seed = runReport.seed || 1337;
        const ghost = runReport.ghostBase64 || runReport.ghost || null;
        const timeMs = runReport.finalTimeMs || runReport.timeMs || 0;
        const squadName = runReport.squadName || (runReport.players ? runReport.players.map((p) => p.name).join(' & ') : 'Raft Squad');

        // Extract top 3 highlights
        const highlights = (runReport.highlights && runReport.highlights.length > 0)
            ? runReport.highlights
            : tracker.getTopHighlights(3);

        const challengeUrl = generateChallengeUrl({
            seed,
            ghost,
            squadName,
            timeMs,
            baseUrl,
        });

        // Format final time string
        const minutes = Math.floor(timeMs / 60000);
        const seconds = ((timeMs % 60000) / 1000).toFixed(1).padStart(4, '0');
        const finalTimeFormatted = timeMs > 0 ? `${String(minutes).padStart(2, '0')}:${seconds}` : 'VICTORY';

        currentPostcardData = {
            title: runReport.title || "DON'T SINK, DON'T DIE",
            subtitle: runReport.subtitle || 'RIVER MOUTH VICTORY DISPATCH',
            crewNames: runReport.crewNames || (runReport.players ? runReport.players.map((p) => p.name) : ['Captain Hook', 'Scurvy Dog']),
            squadRating: runReport.squadRating || 'S+',
            finalTimeFormatted,
            finalTimeMs: timeMs,
            seed,
            ghost,
            highlights,
            challengeUrl,
            watermark: challengeUrl,
        };

        if (dom && canvasEl) {
            const ctx = canvasEl.getContext('2d');
            if (ctx) {
                renderPostcardToCanvas(ctx, currentPostcardData);
            }
            dom.linkInput.value = challengeUrl;
            dom.root.style.display = 'flex';
        }

        return currentPostcardData;
    }

    /**
     * Hides the Postcard Modal.
     */
    function hide() {
        if (dom) {
            dom.root.style.display = 'none';
        }
        if (typeof onClose === 'function') {
            onClose();
        }
    }

    /**
     * Downloads the 1200x630 postcard as PNG.
     */
    function downloadPostcardImage(filename) {
        if (!canvasEl) return null;
        try {
            const dataUrl = canvasEl.toDataURL('image/png');
            if (typeof document !== 'undefined') {
                const link = document.createElement('a');
                const outName = filename || `DontSinkDontDie-Postcard-Seed${currentPostcardData?.seed || 1337}.png`;
                link.download = outName;
                link.href = dataUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            return dataUrl;
        } catch (e) {
            console.warn('Canvas export error:', e);
            return null;
        }
    }

    /**
     * Copies the friend challenge link to clipboard and flashes feedback.
     */
    async function copyFriendChallengeLink() {
        if (!currentPostcardData || !currentPostcardData.challengeUrl) return false;
        const link = currentPostcardData.challengeUrl;

        let copied = false;
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(link);
                copied = true;
            } catch {
                copied = false;
            }
        }

        if (!copied && dom && dom.linkInput) {
            try {
                dom.linkInput.select();
                document.execCommand('copy');
                copied = true;
            } catch {
                copied = false;
            }
        }

        if (dom && dom.copyFeedback) {
            dom.copyFeedback.textContent = copied ? 'Link Copied to Clipboard!' : 'Select & Copy URL';
            dom.copyFeedback.style.opacity = '1';
            setTimeout(() => {
                if (dom && dom.copyFeedback) dom.copyFeedback.style.opacity = '0';
            }, 2500);
        }

        return copied;
    }

    return {
        tracker,
        show,
        hide,
        downloadPostcardImage,
        copyFriendChallengeLink,
        getPostcardData: () => currentPostcardData,
        getCanvas: () => canvasEl,
        dispose: () => {
            if (dom && dom.root) {
                dom.root.remove();
            }
        },
    };
}

// ─── DOM Generator ─────────────────────────────────────────────────────────

function buildPostcardDOM() {
    const root = document.createElement('div');
    root.id = 'share-postcard-modal-root';
    root.style.cssText = `
        position: fixed; inset: 0; background: rgba(3, 7, 18, 0.92); z-index: 10002;
        display: none; justify-content: center; align-items: center;
        backdrop-filter: blur(16px); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        color: #f8fafc; padding: 16px; box-sizing: border-box;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
        background: #0b1329; border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 20px; width: min(1040px, 96vw); max-height: 94vh;
        overflow-y: auto; padding: 24px; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8);
        display: flex; flex-direction: column; gap: 18px; align-items: center;
    `;

    // Canvas Preview
    const canvas = document.createElement('canvas');
    canvas.width = POSTCARD_WIDTH;
    canvas.height = POSTCARD_HEIGHT;
    canvas.style.cssText = `
        width: 100%; max-width: 960px; height: auto; aspect-ratio: 1200 / 630;
        border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 12px 32px rgba(0,0,0,0.6);
    `;

    // Action Controls Dock
    const controls = document.createElement('div');
    controls.style.cssText = `
        width: 100%; max-width: 960px; display: flex; flex-wrap: wrap;
        justify-content: space-between; align-items: center; gap: 14px;
        background: rgba(15, 23, 42, 0.65); padding: 16px 20px; border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.08); box-sizing: border-box;
    `;

    controls.innerHTML = `
        <!-- Left: Friend Challenge Link Input & 1-Click Copy -->
        <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 280px;">
            <span style="font-size: 18px;">🔗</span>
            <input id="postcard-link-input" type="text" readonly style="
                flex: 1; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.18);
                color: #38bdf8; font-family: monospace; font-size: 12px; padding: 8px 12px;
                border-radius: 8px; outline: none;
            ">
            <button id="postcard-copy-btn" style="
                background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff;
                border: none; border-radius: 8px; padding: 8px 16px; font-weight: 700;
                font-size: 12.5px; cursor: pointer; white-space: nowrap;
                box-shadow: 0 4px 12px rgba(14, 165, 233, 0.35); transition: opacity 0.2s;
            ">
                📋 Copy Challenge Link
            </button>
            <span id="postcard-copy-feedback" style="
                font-size: 12px; font-weight: 700; color: #10b981; opacity: 0;
                transition: opacity 0.3s; white-space: nowrap;
            ">Copied!</span>
        </div>

        <!-- Right: Download Postcard & Close -->
        <div style="display: flex; align-items: center; gap: 12px;">
            <button id="postcard-download-btn" style="
                background: linear-gradient(135deg, #10b981, #059669); color: #fff;
                border: none; border-radius: 8px; padding: 8px 18px; font-weight: 700;
                font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 6px;
                box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
            ">
                🖼️ Download Postcard (1200x630)
            </button>
            <button id="postcard-close-btn" style="
                background: transparent; color: #94a3b8; border: 1px solid rgba(255,255,255,0.2);
                border-radius: 8px; padding: 8px 14px; font-weight: 600; font-size: 12px; cursor: pointer;
            ">
                Close
            </button>
        </div>
    `;

    container.appendChild(canvas);
    container.appendChild(controls);
    root.appendChild(container);

    return {
        root,
        canvas,
        linkInput: controls.querySelector('#postcard-link-input'),
        copyBtn: controls.querySelector('#postcard-copy-btn'),
        copyFeedback: controls.querySelector('#postcard-copy-feedback'),
        downloadBtn: controls.querySelector('#postcard-download-btn'),
        closeBtn: controls.querySelector('#postcard-close-btn'),
    };
}
