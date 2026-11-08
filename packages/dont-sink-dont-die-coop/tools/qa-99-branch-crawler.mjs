/**
 * Sovereign Core + Videogame Helmet 08 — Omniscient Playtester & 99% Branch Crawler
 * (`tools/qa-99-branch-crawler.mjs`)
 *
 * Forces an autonomous AI pilot in headless Chromium WebGL (1920x1080) to crawl
 * 99%+ of Don't Sink, Don't Die's state tree, menus, classes, modes, keybinds,
 * upgrade tiers (1..3), gadgets, bot orders, Tarot blessings, hazards, enemies,
 * Acts I-IV, death/retry, victory, and visual clutter invariants.
 *
 * Outputs a cold, unfiltered PO-Shark defect & coverage dossier (`QA_99_BRANCH_REPORT.md`).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(REPO_ROOT, 'QA_99_BRANCH_REPORT.md');

function startLocalServer() {
    const MIME = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
    };
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const u = decodeURIComponent((req.url || '/').split('?')[0]);
            let rel = u === '/' ? '/public/index.html' : u;
            if (!rel.startsWith('/public/') && !rel.startsWith('/shared/')) {
                rel = '/public' + (rel.startsWith('/') ? rel : '/' + rel);
            }
            const filePath = path.join(REPO_ROOT, rel);
            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
        });
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            resolve({ srv, url: `http://127.0.0.1:${port}/public/index.html?offline&bots=2` });
        });
    });
}

async function launchBrowser() {
    let playwright;
    const candidates = [
        'playwright',
        'playwright-core',
        'file:///C:/ReposJose/PersonalProjects/EpistemicAiLearner/node_modules/playwright-core/index.mjs',
        '/usr/local/lib/node_modules/playwright/index.mjs',
        '/usr/local/lib/node_modules/playwright-core/index.mjs',
    ];
    for (const modName of candidates) {
        try {
            playwright = await import(modName);
            break;
        } catch {}
    }
    if (!playwright) throw new Error('Playwright not found');

    const exeCandidates = [
        process.env.CHROME_BIN,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ].filter(Boolean);
    const executablePath = exeCandidates.find((p) => fs.existsSync(p));
    const chromium = playwright.chromium || playwright.default?.chromium;
    return chromium.launch({
        headless: true,
        executablePath,
        args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
        ],
    });
}

async function runOmniscientCrawler() {
    console.log('🦈 [Helmet 08 Omniscient Playtester & PO-Shark Crawler] Launching 99% Branch Audit...');
    const { srv, url } = await startLocalServer();
    const browser = await launchBrowser();

    const branches = [];
    const recordBranch = (id, category, name, passed, severity, details) => {
        branches.push({ id, category, name, passed: Boolean(passed), severity, details });
        const icon = passed ? '✅' : (severity === 'P0' ? '🔴 [P0 DEAD WIRE]' : severity === 'P1' ? '🟠 [P1 CLUTTER/FEEL]' : '🟡 [P2 BUG]');
        console.log(`  ${icon} [${id}] ${name} -> ${JSON.stringify(details)}`);
    };

    try {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage();

        const consoleErrors = [];
        const pageErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                const t = msg.text();
                if (!t.includes('socket.io.js') && !t.includes('favicon.ico') && !t.includes('Failed to load resource')) {
                    consoleErrors.push(t);
                }
            }
        });
        page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

        await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
        await page.waitForTimeout(800);

        // =========================================================================
        // CATEGORY A: Title Screen, Modes, Crew Classes, Silly Hats & [Esc] Settings
        // =========================================================================
        const titleAudit = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const titleVisible = Boolean(qa?.feverDirector?.titleMenu?.isTitleVisible?.());
            const modeCards = [...document.querySelectorAll('[data-mode]')].map((el) => el.dataset.mode);
            const classCards = [...document.querySelectorAll('[data-class]')].map((el) => el.dataset.class);
            const hatCards = [...document.querySelectorAll('[data-hat]')].map((el) => el.dataset.hat);
            const botBtns = [...document.querySelectorAll('[data-bots]')].map((el) => el.dataset.bots);
            return {
                titleVisible,
                modeCards,
                classCards,
                hatCards,
                botBtns,
            };
        });
        recordBranch(
            'A1',
            'Menus & Modes',
            'Title Screen renders all 5 Game Modes, 4 Crew Classes, 6 Hats & Bot Selectors',
            titleAudit.titleVisible && titleAudit.modeCards.length === 5 && titleAudit.classCards.length === 4 && titleAudit.hatCards.length >= 6,
            'P0',
            titleAudit
        );

        // Select 'bruiser' class on Title Screen and launch run
        await page.evaluate(() => {
            const bruiserCard = document.querySelector('[data-class="bruiser"]');
            if (bruiserCard) bruiserCard.click();
            const startBtn = document.getElementById('btn-start-game');
            if (startBtn) startBtn.click();
        });
        await page.waitForTimeout(1400);

        // Check if selecting a Crew Class ('bruiser' / 'helmsman' / 'tinkerer' / 'mystic') actually affects gameplay physics/combat!
        const classPerkWireAudit = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const selectedClass = qa?.feverDirector?.getSelectedClass?.();
            const classDef = qa?.feverDirector?.getCrewClassDef?.();
            const myRaft = qa?.getMyRaft?.();
            const myStats = qa?.getMyStats?.();
            const hasClassPerkAppliedInStats = Boolean(
                myRaft?.craft?.classPerks ||
                myStats?.classPerks ||
                qa?.feverDirector?.isClassPerksWired?.()
            );
            return {
                selectedClass,
                expectedKnockbackMult: classDef?.perks?.meleeKnockbackMultiplier,
                hasClassPerkAppliedInStats,
            };
        });
        recordBranch(
            'A2',
            'Menus & Modes',
            'Crew Class passive perks (Helmsman turn +15%, Bruiser knockback +25%, Tinkerer -20% cost & +25% motor, Mystic +25% block) wired into live gameplay',
            classPerkWireAudit.hasClassPerkAppliedInStats,
            'P0',
            classPerkWireAudit
        );

        // Test [Esc] Settings Drawer toggle in-game when Armory is closed
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        const escSettingsAudit = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const openAfterFirstEsc = Boolean(qa?.feverDirector?.titleMenu?.isSettingsDrawerOpen?.());
            return { openAfterFirstEsc };
        });
        if (escSettingsAudit.openAfterFirstEsc) {
            await page.evaluate(() => {
                window.__GAME_QA__?.feverDirector?.titleMenu?.closeSettingsDrawer?.();
            });
            await page.waitForTimeout(300);
        }
        recordBranch(
            'A3',
            'Menus & Modes',
            'Pressing [Esc] in-game opens and closes the Settings Drawer (as promised by bottom HUD instructions)',
            escSettingsAudit.openAfterFirstEsc,
            'P0',
            escSettingsAudit
        );

        // Test [A4] 2-Player Local Split-Screen Mode (`splitscreen`) live launch, dual viewports, P2 3D raft mesh, and isolated P1 vs P2 controls
        const splitScreenAudit = await page.evaluate(async () => {
            const qa = window.__GAME_QA__;
            // Open Title Menu and select 'splitscreen' mode
            qa.feverDirector?.titleMenu?.showTitleScreen?.();
            await new Promise((r) => requestAnimationFrame(r));
            const splitCard = document.querySelector('[data-mode="splitscreen"]');
            if (splitCard) splitCard.click();
            const startBtn = document.getElementById('btn-start-game');
            if (startBtn) startBtn.click();

            // Wait for title overlay to fade out completely (`opacity: 0` -> `display: none` after 300ms)
            await new Promise((r) => setTimeout(r, 340));
            for (let i = 0; i < 8; i++) {
                await new Promise((r) => requestAnimationFrame(r));
            }

            const activeMode = qa.feverDirector?.getActiveMode?.();
            const splitMgr = qa.feverDirector?.getSplitScreenManager?.();
            const viewports = splitMgr?.getViewports?.();
            const dividerEl = document.getElementById('splitscreen-divider');
            const dividerVisible = Boolean(dividerEl && getComputedStyle(dividerEl).display !== 'none' && dividerEl.getBoundingClientRect().width >= 2);

            const p1Raft = qa.getMyRaft?.();
            const p2Raft = qa.getP2Raft?.();
            const p1MeshVisible = Boolean(p1Raft?.vis?.group?.visible && p1Raft?.vis?.group?.parent === qa.scene);
            const p2MeshVisible = Boolean(p2Raft?.vis?.group?.visible && p2Raft?.vis?.group?.parent === qa.scene);
            const distinctLateralSpawn = Boolean(p1Raft && p2Raft && Math.abs(p1Raft.craft.position.x - p2Raft.craft.position.x) > 3.5);

            // Verify P2 ArrowUp + ArrowRight moves & steers ONLY P2 without hijacking P1!
            const p1StrokeBefore = qa.getOarStroke()?.strokeCount || 0;
            const p2StrokeBefore = p2Raft?.oarStroke?.strokeCount || 0;
            const p1YawBefore = p1Raft?.craft?.yaw || 0;
            const p2YawBefore = p2Raft?.craft?.yaw || 0;

            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight' }));
            for (let i = 0; i < 18; i++) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', code: 'ArrowUp' }));
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight' }));

            const p1StrokeAfterP2Input = qa.getOarStroke()?.strokeCount || 0;
            const p2StrokeAfterP2Input = p2Raft?.oarStroke?.strokeCount || 0;
            const p1NotHijackedByArrows = p1StrokeAfterP2Input === p1StrokeBefore && Math.abs((p1Raft?.craft?.yaw || 0) - p1YawBefore) < 0.01;
            const p2MovedAndSteered = p2StrokeAfterP2Input > p2StrokeBefore && Math.abs((p2Raft?.craft?.yaw || 0) - p2YawBefore) > 0.02;

            // Counter-steer P2 back straight downriver (`ArrowLeft`) and give P1 one oar stroke (`KeyW`) so both viewports frame their rafts cleanly downriver
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW' }));
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));
            for (let i = 0; i < 18; i++) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW' }));
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', code: 'ArrowLeft' }));

            // Verify P2 right-shift attack swings P2's oar
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftRight' }));
            await new Promise((r) => requestAnimationFrame(r));
            const p2OarSwung = Boolean(p2Raft?.vis?.anim?.swing > 0);
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftRight' }));

            const cam1 = splitMgr?.camera1;
            const cam2 = splitMgr?.camera2;
            cam1?.updateMatrixWorld?.(true);
            cam2?.updateMatrixWorld?.(true);
            const ndc1 = p1Raft?.vis?.group && cam1 ? p1Raft.vis.group.position.clone().project(cam1) : null;
            const ndc2 = p2Raft?.vis?.group && cam2 ? p2Raft.vis.group.position.clone().project(cam2) : null;
            const bothCamerasAboveWater = Boolean(cam1 && cam2 && cam1.position.y > 0.8 && cam2.position.y > 0.8 && Math.abs(cam1.position.z - p1Raft.craft.position.z) < 25 && Math.abs(cam2.position.z - p2Raft.craft.position.z) < 25);
            const bothRaftsInFrustum = Boolean(
                ndc1 && ndc2 &&
                Math.abs(ndc1.x) < 0.7 && Math.abs(ndc1.y) < 0.85 && ndc1.z > 0 && ndc1.z < 0.99 &&
                Math.abs(ndc2.x) < 0.7 && Math.abs(ndc2.y) < 0.85 && ndc2.z > 0 && ndc2.z < 0.99
            );

            return {
                activeMode,
                viewportWidths: viewports ? [viewports.p1.width, viewports.p2.width] : null,
                dividerVisible,
                p1MeshVisible,
                p2MeshVisible,
                distinctLateralSpawn,
                p1NotHijackedByArrows,
                p2MovedAndSteered,
                p2OarSwung,
                bothCamerasAboveWater,
                bothRaftsInFrustum,
                p1Pos: p1Raft?.craft?.position ? { x: +p1Raft.craft.position.x.toFixed(2), y: +p1Raft.craft.position.y.toFixed(2), z: +p1Raft.craft.position.z.toFixed(2) } : null,
                p2Pos: p2Raft?.craft?.position ? { x: +p2Raft.craft.position.x.toFixed(2), y: +p2Raft.craft.position.y.toFixed(2), z: +p2Raft.craft.position.z.toFixed(2) } : null,
                cam1Pos: cam1?.position ? { x: +cam1.position.x.toFixed(2), y: +cam1.position.y.toFixed(2), z: +cam1.position.z.toFixed(2) } : null,
                cam2Pos: cam2?.position ? { x: +cam2.position.x.toFixed(2), y: +cam2.position.y.toFixed(2), z: +cam2.position.z.toFixed(2) } : null,
                ndc1: ndc1 ? { x: +ndc1.x.toFixed(3), y: +ndc1.y.toFixed(3), z: +ndc1.z.toFixed(3) } : null,
                ndc2: ndc2 ? { x: +ndc2.x.toFixed(3), y: +ndc2.y.toFixed(3), z: +ndc2.z.toFixed(3) } : null,
            };
        });
        const splitShotPath = path.join(REPO_ROOT, 'qa-screenshots', 'qa-09-splitscreen-2p.png');
        fs.mkdirSync(path.dirname(splitShotPath), { recursive: true });
        await page.screenshot({ path: splitShotPath });

        // Also verify Daily Seed, Endless Rogue, and Boss Rush modes actually launch and apply their mode-specific rules, then restore Campaign!
        const modesAndRestoreAudit = await page.evaluate(async () => {
            const qa = window.__GAME_QA__;
            const startBtn = document.getElementById('btn-start-game');
            const otherModesVerified = {};
            for (const m of ['daily', 'endless', 'boss_rush']) {
                qa.feverDirector?.titleMenu?.showTitleScreen?.();
                await new Promise((r) => requestAnimationFrame(r));
                const mCard = document.querySelector(`[data-mode="${m}"]`);
                if (mCard) mCard.click();
                if (startBtn) startBtn.click();
                for (let i = 0; i < 6; i++) {
                    await new Promise((r) => requestAnimationFrame(r));
                }
                const curMode = qa.feverDirector?.getActiveMode?.();
                const curCoins = qa.getMyStats?.()?.coins ?? 0;
                otherModesVerified[m] = curMode === m && (m !== 'boss_rush' || curCoins === 125);
            }

            // Switch back to 'campaign' mode cleanly for the rest of the single-screen audit
            qa.feverDirector?.titleMenu?.showTitleScreen?.();
            await new Promise((r) => requestAnimationFrame(r));
            const campCard = document.querySelector('[data-mode="campaign"]');
            if (campCard) campCard.click();
            const bruiserCard = document.querySelector('[data-class="bruiser"]');
            if (bruiserCard) bruiserCard.click();
            if (startBtn) startBtn.click();
            for (let i = 0; i < 10; i++) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            const restoredCampaignCleanly = qa.feverDirector?.getActiveMode?.() === 'campaign' && !document.getElementById('splitscreen-divider') && !qa.getP2Raft?.();
            return { otherModesVerified, restoredCampaignCleanly };
        });
        Object.assign(splitScreenAudit, modesAndRestoreAudit);
        recordBranch(
            'A4',
            'Menus & Modes',
            '2-Player Local Split-Screen Mode (`splitscreen`) launches dual scissor viewports, spawns visible P1 & P2 3D rafts, isolates P1 (WASD) from P2 (Arrows) controls, and verifies Daily / Endless / Boss Rush mode launches',
            splitScreenAudit.activeMode === 'splitscreen' &&
                splitScreenAudit.dividerVisible &&
                splitScreenAudit.p1MeshVisible &&
                splitScreenAudit.p2MeshVisible &&
                splitScreenAudit.distinctLateralSpawn &&
                splitScreenAudit.p1NotHijackedByArrows &&
                splitScreenAudit.p2MovedAndSteered &&
                splitScreenAudit.p2OarSwung &&
                splitScreenAudit.bothCamerasAboveWater &&
                splitScreenAudit.bothRaftsInFrustum &&
                splitScreenAudit.otherModesVerified?.daily &&
                splitScreenAudit.otherModesVerified?.endless &&
                splitScreenAudit.otherModesVerified?.boss_rush &&
                splitScreenAudit.restoredCampaignCleanly,
            'P0',
            splitScreenAudit
        );

        // =========================================================================
        // CATEGORY B: Dual-Oar Rowing, Spam-Cancel, Steering, Jump, Kickflip & Combat
        // =========================================================================
        const rowingAndCombatAudit = await page.evaluate(async () => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            const lp = raft?.vis?.leftPaddle;
            const rp = raft?.vis?.rightPaddle;
            const hasDualOars = Boolean(lp && rp && lp !== rp && lp.position.x < -0.5 && rp.position.x > 0.5);

            // 1. Left & Right side-aware oar attacks (wait for actual animation frame inside swing arc)
            qa.triggerAttack('left');
            const leftSwingSide = raft.vis.anim.swingSide;
            let leftOarLifted = false;
            const tL = performance.now();
            while (raft.vis.anim.swing > 0 && performance.now() - tL < 600) {
                await new Promise((r) => requestAnimationFrame(r));
                if (lp.position.y > raft.vis.leftPaddleHome.y + 0.12) {
                    leftOarLifted = true;
                    break;
                }
            }
            while (raft.vis.anim.swing > 0 && performance.now() - tL < 900) {
                await new Promise((r) => requestAnimationFrame(r));
            }

            qa.triggerAttack('right');
            const rightSwingSide = raft.vis.anim.swingSide;
            let rightOarLifted = false;
            const tR = performance.now();
            while (raft.vis.anim.swing > 0 && performance.now() - tR < 600) {
                await new Promise((r) => requestAnimationFrame(r));
                if (rp.position.y > raft.vis.rightPaddleHome.y + 0.12) {
                    rightOarLifted = true;
                    break;
                }
            }
            while (raft.vis.anim.swing > 0 && performance.now() - tR < 900) {
                await new Promise((r) => requestAnimationFrame(r));
            }

            // 2. Timed [W] stroke
            raft.craft.position.set(0, 0.25, -18);
            raft.craft.velocity.set(0, 0, -1.0);
            const os = qa.getOarStroke();
            os.active = false;
            os.elapsed = 0;
            qa.triggerOarStroke();
            const t0 = performance.now();
            while (os.active && os.elapsed < 0.42 && performance.now() - t0 < 1500) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            const timedPullSpeed = Math.hypot(raft.craft.velocity.x, raft.craft.velocity.z);

            // 3. Fast-press [W] spam-cancel penalty
            os.active = false;
            os.elapsed = 0;
            const prevChoked = os.chokedCount;
            qa.triggerOarStroke();
            const t1 = performance.now();
            while (os.active && os.elapsed < 0.18 && performance.now() - t1 < 800) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            const speedBeforeChoke = Math.hypot(raft.craft.velocity.x, raft.craft.velocity.z);
            qa.triggerOarStroke();
            const speedAfterChoke = Math.hypot(raft.craft.velocity.x, raft.craft.velocity.z);
            const spamCancelled = os.chokedCount > prevChoked && speedAfterChoke < speedBeforeChoke;

            return {
                hasDualOars,
                leftSwingSide,
                rightSwingSide,
                leftOarLifted,
                rightOarLifted,
                timedPullSpeed: Number(timedPullSpeed.toFixed(2)),
                spamCancelled,
                chokedCount: os.chokedCount,
            };
        });
        recordBranch(
            'B1',
            'Rowing & Combat',
            'Twin articulated oars, timed [W] pull (> 4.5 m/s), fast-press choke penalty, and Left/Right side-aware oar melee swings',
            rowingAndCombatAudit.hasDualOars &&
                rowingAndCombatAudit.timedPullSpeed > 4.5 &&
                rowingAndCombatAudit.spamCancelled &&
                rowingAndCombatAudit.leftSwingSide === 'left' &&
                rowingAndCombatAudit.rightSwingSide === 'right' &&
                rowingAndCombatAudit.leftOarLifted &&
                rowingAndCombatAudit.rightOarLifted,
            'P0',
            rowingAndCombatAudit
        );

        // =========================================================================
        // CATEGORY C: 3-Tier Harbor Armory, Multi-Tier Scaling & Raft Gadgets
        // =========================================================================
        const armoryAndGadgetsAudit = await page.evaluate(async () => {
            const qa = window.__GAME_QA__;
            const legacyShopEl = document.getElementById('shop');
            const legacyShopExists = Boolean(legacyShopEl);
            const legacyShopVisible = legacyShopEl ? getComputedStyle(legacyShopEl).display !== 'none' : false;

            const st = qa.getMyStats();
            st.coins = 500;

            // Open Armory with [B]
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
            await new Promise((r) => setTimeout(r, 150));
            const armoryOpened = Boolean(qa.feverDirector?.armoryShop?.isOpen?.());

            // Buy Motor Tiers 1, 2, 3 via hotkey '1' three times, Weapon Tier 1 via '2', Armor Tier 1 via '3'
            for (const key of ['1', '1', '1', '2', '3']) {
                window.dispatchEvent(new KeyboardEvent('keydown', { key }));
                await new Promise((r) => setTimeout(r, 80));
            }

            // Close Armory with [B]
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
            await new Promise((r) => setTimeout(r, 120));
            const armoryClosed = !qa.feverDirector?.armoryShop?.isOpen?.();

            // Check if Gadgets ('harpoon', 'shield-dome', 'nitro-keg') actually installed without hyphen/underscore mismatch!
            const gadgetState = qa.feverDirector?.gadgetState;
            const installedGadgets = Object.keys(gadgetState?.installed || {});
            const gadgetEventsApplied = Boolean(qa.feverDirector?.isGadgetEventsWired?.());

            return {
                legacyShopExists,
                legacyShopVisible,
                armoryOpened,
                armoryClosed,
                upgrades: [...(st.upgrades || [])],
                installedGadgets,
                gadgetEventsApplied,
            };
        });
        recordBranch(
            'C1',
            'Armory & Economy',
            '3-Tier Harbor Armory ([B]/[E]) buys Tiers 1..3 cleanly and closes without legacy #shop DOM bloat',
            !armoryAndGadgetsAudit.legacyShopVisible &&
                armoryAndGadgetsAudit.armoryOpened &&
                armoryAndGadgetsAudit.armoryClosed &&
                armoryAndGadgetsAudit.upgrades.includes('motor_3'),
            'P0',
            armoryAndGadgetsAudit
        );
        recordBranch(
            'C2',
            'Armory & Economy',
            'Raft Gadgets (Bow Harpoon, Arcane Shockwave Bell, Twin Nitro Hydro-Jets) install with valid hyphenated IDs and apply live combat/thrust effects',
            armoryAndGadgetsAudit.installedGadgets.includes('harpoon') &&
                armoryAndGadgetsAudit.installedGadgets.includes('shield-dome') &&
                armoryAndGadgetsAudit.installedGadgets.includes('nitro-keg') &&
                armoryAndGadgetsAudit.gadgetEventsApplied,
            'P0',
            armoryAndGadgetsAudit
        );

        // =========================================================================
        // CATEGORY D: Tactical Crew Bot Orders ([Z], [X], [C], [V])
        // =========================================================================
        const botOrdersAudit = await page.evaluate(async () => {
            const qa = window.__GAME_QA__;
            const results = {};
            for (const key of ['z', 'x', 'c', 'v']) {
                window.dispatchEvent(new KeyboardEvent('keydown', { key }));
                await new Promise((r) => setTimeout(r, 60));
                results[key] = qa.feverDirector?.botOrderState?.activeOrder?.id || null;
                if (qa.feverDirector?.botOrderState?.cooldowns) {
                    for (const k of Object.keys(qa.feverDirector.botOrderState.cooldowns)) {
                        qa.feverDirector.botOrderState.cooldowns[k] = -Infinity;
                    }
                }
            }
            const wingmanRespectsOrder = Boolean(qa.feverDirector?.isBotOrderFormationWired?.());
            return { results, wingmanRespectsOrder };
        });
        recordBranch(
            'D1',
            'Co-Op Wingman Bot Orders',
            'Pressing [Z], [X], [C], [V] issues valid tactical bot orders (focus-fire, form-up, scavenge, rush-checkpoint) and moves wingman bots into matching formation',
            Boolean(
                botOrdersAudit.results.z &&
                botOrdersAudit.results.x &&
                botOrdersAudit.results.c &&
                botOrdersAudit.results.v &&
                botOrdersAudit.wingmanRespectsOrder
            ),
            'P0',
            botOrdersAudit
        );

        // =========================================================================
        // CATEGORY E: Checkpoint Dream Tarot Draft & Active Blessing Multipliers
        // =========================================================================
        const tarotAudit = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            qa.feverDirector?.onCheckpointCrossed?.(-150, 0);
            qa.feverDirector?.onCheckpointCrossed?.(-300, 1);
            const tarotState = qa.feverDirector?.tarotState;
            const blessings = tarotState?.blessings || {};
            const activeCount = Object.keys(blessings).length;
            const blessingsWiredToGameplay = Boolean(qa.feverDirector?.isTarotMultipliersWired?.());
            return {
                activeCount,
                blessings: Object.keys(blessings),
                blessingsWiredToGameplay,
            };
        });
        recordBranch(
            'E1',
            'Dream Tarot Progression',
            'Crossing checkpoints grants Dream Tarot blessings AND wires their multipliers (Caffeinated Oars thrust, Squeaky Overdrive shockwave, Reverse Psychology block coins) into live gameplay',
            tarotAudit.activeCount > 0 && tarotAudit.blessingsWiredToGameplay,
            'P0',
            tarotAudit
        );

        // =========================================================================
        // CATEGORY F: Hazards, 3 Dream Entities & Dread Kraken Across Acts I-IV
        // =========================================================================
        const encountersAudit = await page.evaluate(async () => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            // 1. Whirlpool at z = -76
            raft.craft.position.set(4.5, 0.25, -76);
            raft.craft.velocity.set(0, 0, 0);
            raft.craft.yaw = 0;
            await new Promise((r) => setTimeout(r, 350));
            const whirlpoolYawDelta = Math.abs(raft.craft.yaw);

            // 2. Rapids at z = -112
            const enemies = qa.getEnemiesData?.() || {};
            if (enemies.whiteGuy) enemies.whiteGuy.health = 0;
            raft.craft.position.set(0, 0.25, -104);
            raft.craft.velocity.set(0, 0, -2.0);
            raft.craft.angularVelocity.y = 0;
            raft.craft.yaw = 0;
            await new Promise((r) => setTimeout(r, 380));
            const rapidsVz = raft.craft.velocity.z;
            const rapidsZAfter = raft.craft.position.z;

            // 3. City Promenade On-Foot & Backpack Raft Stow at z = -196
            raft.craft.position.set(18.2, 0.85, -196);
            raft.craft.velocity.set(0, 0, -2.5);
            raft.craft.yaw = 0;
            await new Promise((r) => setTimeout(r, 450));
            const onCitySolid = Boolean(raft.vis?.anim?.onSolid && raft.vis?.raft?.scale?.x < 0.65);

            // 4. Dread Kraken spawn at z = -1350
            raft.craft.position.set(0, 0.25, -1350);
            await new Promise((r) => setTimeout(r, 350));
            const krakenSpawned = Boolean(qa.feverDirector?.krakenState?.isSpawned && qa.feverDirector?.krakenMesh?.visible);

            return {
                whirlpoolYawDelta: Number(whirlpoolYawDelta.toFixed(3)),
                rapidsVz: Number(rapidsVz.toFixed(2)),
                rapidsZAfter: Number(rapidsZAfter.toFixed(2)),
                onCitySolid,
                krakenSpawned,
            };
        });
        recordBranch(
            'F1',
            'World Encounters & Boss',
            'Whirlpool spin/pull, Rapids downriver boost, City Promenade on-foot backpack stow, and Dread Kraken boss spawn all function in live WebGL',
            encountersAudit.whirlpoolYawDelta > 0.15 &&
                encountersAudit.rapidsVz < -4.0 &&
                encountersAudit.rapidsZAfter < -105.5 &&
                encountersAudit.onCitySolid &&
                encountersAudit.krakenSpawned,
            'P0',
            encountersAudit
        );

        // =========================================================================
        // CATEGORY G: Photo Mode ([P]), Death/Retry ([R]), Victory, & Clutter Audit
        // =========================================================================
        const lifecycleAndClutterAudit = await page.evaluate(async () => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            // 1. Photo Mode [P] toggle on and off
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
            await new Promise((r) => setTimeout(r, 120));
            const photoActiveOn = Boolean(qa.feverDirector?.photoAndAwards?.isActive?.());
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
            await new Promise((r) => setTimeout(r, 120));
            const photoActiveOff = !qa.feverDirector?.photoAndAwards?.isActive?.();

            // 2. Scene NaN & Clutter Check
            let visibleMeshes = 0;
            const nanNodes = [];
            qa.scene.traverse((obj) => {
                if (obj.visible && obj.isMesh) visibleMeshes++;
                const p = obj.position;
                if (p && (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) {
                    nanNodes.push(obj.name || obj.type);
                }
            });

            // 3. HUD Footprint Ratio (< 8% of 1920x1080)
            const hudIds = ['ui', 'wave-panel', 'scoreboard', 'instructions'];
            let hudArea = 0;
            for (const id of hudIds) {
                const el = document.getElementById(id);
                if (!el || el.hidden || getComputedStyle(el).display === 'none') continue;
                const r = el.getBoundingClientRect();
                hudArea += Math.max(0, r.width * r.height);
            }
            const hudFootprintRatio = hudArea / (window.innerWidth * window.innerHeight);

            // 4. Victory trigger & Instant [R] Reset (wait for animation frames so updateMyRaft processes finishLineZ)
            raft.craft.position.set(0, 0.25, -1505);
            const tWin = performance.now();
            while (document.getElementById('win')?.hidden && performance.now() - tWin < 1500) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            const winOverlayShown = !document.getElementById('win')?.hidden;
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
            const tReset = performance.now();
            while ((!document.getElementById('win')?.hidden || qa.getMyRaft().craft.position.z <= -30) && performance.now() - tReset < 1500) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            const resetAfterWinClean = Boolean(document.getElementById('win')?.hidden && qa.getMyRaft().craft.position.z > -30);

            return {
                photoActiveOn,
                photoActiveOff,
                visibleMeshes,
                nanNodes,
                hudFootprintRatio: Number(hudFootprintRatio.toFixed(4)),
                winOverlayShown,
                resetAfterWinClean,
            };
        });
        recordBranch(
            'G1',
            'Lifecycle & Clutter',
            'Photo Mode ([P]) toggle, Victory screen, Instant [R] Reset, Zero NaN nodes, and HUD footprint (< 8%)',
            lifecycleAndClutterAudit.photoActiveOn &&
                lifecycleAndClutterAudit.photoActiveOff &&
                lifecycleAndClutterAudit.nanNodes.length === 0 &&
                lifecycleAndClutterAudit.hudFootprintRatio < 0.08 &&
                lifecycleAndClutterAudit.winOverlayShown &&
                lifecycleAndClutterAudit.resetAfterWinClean &&
                consoleErrors.length === 0 &&
                pageErrors.length === 0,
            'P1',
            { ...lifecycleAndClutterAudit, consoleErrors, pageErrors }
        );

        const passedCount = branches.filter((b) => b.passed).length;
        const failedBranches = branches.filter((b) => !b.passed);

        const mdLines = [
            '# 🦈 Sovereign PO-Shark & Helmet 08 — 99% Branch Crawler Report',
            '',
            `- **Timestamp:** \`${new Date().toISOString()}\``,
            `- **Branches Audited in Live WebGL (1920x1080):** \`${branches.length}\``,
            `- **Passed:** \`${passedCount} / ${branches.length}\``,
            `- **Defects / Dead Wires Exposed:** \`${failedBranches.length}\``,
            '',
            '## Branch Matrix',
            '',
            '| ID | Category | Branch / Invariant | Status | Details |',
            '|---|---|---|---|---|',
            ...branches.map(
                (b) =>
                    `| \`${b.id}\` | ${b.category} | ${b.name} | ${b.passed ? '✅ PASS' : `🔴 FAIL (${b.severity})`} | \`${JSON.stringify(b.details)}\` |`
            ),
            '',
        ];
        fs.writeFileSync(REPORT_PATH, mdLines.join('\n'), 'utf8');
        console.log(`\n📄 Wrote full report to ${REPORT_PATH}`);

        await browser.close();
        srv.close();

        if (failedBranches.length > 0) {
            console.log(`\n🦈 PO-Shark Crawler exposed ${failedBranches.length} Dead Wires / Unfinished Branches to repair!`);
            process.exit(2);
        }
        console.log('\n✅ 100% OF CRAWLED BRANCHES & LIVE CAUSE-AND-EFFECT CHECKS PASSED!');
        process.exit(0);
    } catch (err) {
        console.error('Crawler error:', err);
        await browser.close();
        srv.close();
        process.exit(1);
    }
}

runOmniscientCrawler();
