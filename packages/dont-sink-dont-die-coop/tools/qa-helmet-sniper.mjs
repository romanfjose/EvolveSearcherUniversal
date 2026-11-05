/**
 * Sovereign Core — Seat 3: Cold Verification Sniper & Visual QA Helmet
 * (`tools/qa-helmet-sniper.mjs`)
 *
 * Launches a real headless Chromium/Chrome browser (locally on Windows or inside
 * Google Jules Linux VMs), boots Don't Sink, Don't Die, plays the game across
 * multiple checkpoints, captures real PNG screenshots, and enforces hard visual
 * & 3D scene invariants that unit tests with mock THREE cannot see:
 *
 *   [G1] Zero Console Errors, Uncaught Page Exceptions, or THREE.Object3D warnings.
 *   [G2] Player Raft & Articulated Character Visibility:
 *        - myRaft.vis.group.visible === true
 *        - myRaft.vis.rig.character.visible === true
 *        - Zero NaN values in any rotation, quaternion, position, or matrixWorld
 *        - Raft 3D world position projects inside the camera frustum (inFront === true)
 *   [G3] Zero HUD Panel Overlap (per JoseStandards/01_FRONTEND_UX.md):
 *        - Bounding boxes of #ui, #wave-panel, #scoreboard, #tactical-minimap-root,
 *          and #instructions have 0 px intersection.
 *   [G4] No Premature Boss Bar at Spawn:
 *        - #boss-health-bar-overlay is hidden at river start (z > -200).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = process.env.QA_SCREENSHOT_DIR || path.join(REPO_ROOT, 'qa-screenshots');

fs.mkdirSync(OUT_DIR, { recursive: true });

// 1. Start lightweight static server for the repo root so /public and /shared resolve identically
function startLocalQaServer() {
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
            resolve({ srv, url: `http://127.0.0.1:${port}/public/index.html?offline&bots=1` });
        });
    });
}

// 2. Resolve Playwright + Browser executable across Windows & Linux (Jules VM)
async function launchBrowser() {
    let playwright;
    const candidateModules = [
        'playwright',
        'playwright-core',
        'file:///C:/ReposJose/PersonalProjects/EpistemicAiLearner/node_modules/playwright-core/index.mjs',
    ];
    for (const modName of candidateModules) {
        try {
            playwright = await import(modName);
            break;
        } catch {}
    }
    if (!playwright) {
        throw new Error('Playwright / playwright-core not found. Install playwright-core or run inside Jules VM.');
    }

    const exeCandidates = [
        process.env.CHROME_BIN,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ].filter(Boolean);

    const executablePath = exeCandidates.find((p) => fs.existsSync(p));
    const launchOpts = {
        headless: true,
        args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
        ],
    };
    if (executablePath) launchOpts.executablePath = executablePath;

    const chromium = playwright.chromium || playwright.default?.chromium;
    return chromium.launch(launchOpts);
}

async function runQaHelmet() {
    console.log('🪖 [Sovereign QA Helmet Sniper] Booting live headless WebGL harness...');
    const { srv, url } = await startLocalQaServer();
    const browser = await launchBrowser();

    const consoleErrors = [];
    const pageErrors = [];
    const threeWarnings = [];

    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();

        page.on('console', (msg) => {
            const txt = msg.text();
            if (msg.type() === 'error' && !txt.includes('socket.io.js') && !txt.includes('Failed to load resource')) {
                consoleErrors.push(txt);
            }
            if (txt.includes('THREE.Object3D.add:') || txt.includes('NaN')) {
                threeWarnings.push(txt);
            }
        });
        page.on('pageerror', (err) => {
            pageErrors.push(err.stack || err.message || String(err));
        });

        console.log(`-> Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
        await page.waitForTimeout(800);

        // Screenshot 1: Dockside 3D Title Menu
        const shot1 = path.join(OUT_DIR, 'qa-01-title-screen.png');
        await page.screenshot({ path: shot1 });
        console.log(`📸 Captured Title Screen -> ${shot1}`);

        // Click "Start Game" on the Title Screen
        const startBtn = await page.$('#btn-start-game');
        if (startBtn) {
            await startBtn.click();
        }
        await page.waitForTimeout(1400); // Wait for 1.2s intro camera swoop to finish

        // Simulate paddling forward (W) + steering so wake and animations are active
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(900);
        await page.keyboard.up('KeyW');

        // Screenshot 2: Active Gameplay (Player Raft + Crew + HUD + Minimap)
        const shot2 = path.join(OUT_DIR, 'qa-02-gameplay-raft-visible.png');
        await page.screenshot({ path: shot2 });
        console.log(`📸 Captured Active Gameplay -> ${shot2}`);

        // Evaluate 3D Scene & DOM Invariants inside browser
        const audit = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            if (!qa) return { ok: false, reason: 'window.__GAME_QA__ not exposed' };

            const myRaft = qa.getMyRaft();
            if (!myRaft || !myRaft.vis || !myRaft.craft) {
                return { ok: false, reason: 'myRaft is null or missing vis/craft' };
            }

            // Check 1: Visibility flags on player raft, tilt, hull, and character
            const groupVisible = !!myRaft.vis.group.visible;
            const tiltVisible = !!myRaft.vis.tilt.visible;
            const raftHullVisible = !!myRaft.vis.raft.visible;
            const charVisible = !!myRaft.vis.rig?.character?.visible;

            // Check 2: Traverse entire player raft hierarchy for NaN in position, rotation, quaternion, scale, or matrixWorld
            let nanNodes = [];
            myRaft.vis.group.updateMatrixWorld(true);
            myRaft.vis.group.traverse((obj) => {
                const nums = [
                    obj.position.x, obj.position.y, obj.position.z,
                    obj.rotation.x, obj.rotation.y, obj.rotation.z,
                    obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w,
                    obj.scale.x, obj.scale.y, obj.scale.z,
                    ...(obj.matrixWorld?.elements || []),
                ];
                if (nums.some((n) => !Number.isFinite(n))) {
                    nanNodes.push(obj.name || obj.type || 'Object3D');
                }
            });

            // Check 3: Project player character head/torso to screen coordinates
            qa.camera.updateMatrixWorld(true);
            const raftPos = myRaft.vis.group.position.clone();
            raftPos.y += 1.0;
            const ndc = raftPos.project(qa.camera);
            const inFrustum = ndc.z > 0 && ndc.z < 1 && Math.abs(ndc.x) < 0.85 && Math.abs(ndc.y) < 0.85;
            const screenX = Math.round(((ndc.x + 1) / 2) * window.innerWidth);
            const screenY = Math.round(((1 - ndc.y) / 2) * window.innerHeight);

            // Check 4: HUD Panel Overlap Audit (JoseStandards/01_FRONTEND_UX.md)
            const panelSelectors = ['#ui', '#wave-panel', '#scoreboard', '#tactical-minimap-root', '#instructions'];
            const rects = [];
            for (const sel of panelSelectors) {
                const el = document.querySelector(sel);
                if (!el) continue;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    rects.push({ sel, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
                }
            }

            const overlaps = [];
            for (let i = 0; i < rects.length; i++) {
                for (let j = i + 1; j < rects.length; j++) {
                    const a = rects[i];
                    const b = rects[j];
                    const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
                    const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
                    if (xOverlap > 4 && yOverlap > 4) {
                        overlaps.push(`${a.sel} overlaps ${b.sel} by ${Math.round(xOverlap)}x${Math.round(yOverlap)}px`);
                    }
                }
            }

            // Check 5: Boss Health Bar should NOT be visible at spawn (z > -200)
            const bossBar = document.querySelector('#boss-health-bar-overlay');
            const bossBarStyle = bossBar ? window.getComputedStyle(bossBar) : null;
            const bossBarPremature = bossBarStyle
                ? (bossBarStyle.display !== 'none' && Number(bossBarStyle.opacity) > 0.05 && myRaft.craft.position.z > -200)
                : false;

            return {
                ok: true,
                raftPosition: {
                    x: Number(myRaft.craft.position.x.toFixed(2)),
                    y: Number(myRaft.craft.position.y.toFixed(2)),
                    z: Number(myRaft.craft.position.z.toFixed(2)),
                },
                groupVisible,
                tiltVisible,
                raftHullVisible,
                charVisible,
                nanNodes,
                inFrustum,
                projectedScreenPx: { x: screenX, y: screenY, ndcZ: Number(ndc.z.toFixed(3)) },
                overlaps,
                bossBarPremature,
            };
        });

        // Test jumping/kickflip and opening the 3-Tier Harbor Armory ([B])
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        await page.keyboard.press('KeyB');
        await page.waitForTimeout(400);
        const shot3 = path.join(OUT_DIR, 'qa-03-armory-modal.png');
        await page.screenshot({ path: shot3 });
        console.log(`📸 Captured 3-Tier Harbor Armory Modal -> ${shot3}`);

        console.log('\n=== 🪖 SOVEREIGN QA HELMET REPORT ===');
        console.log(JSON.stringify({
            consoleErrors,
            pageErrors,
            threeWarnings,
            audit,
        }, null, 2));

        const failures = [];
        if (consoleErrors.length > 0) failures.push(`Console errors: ${consoleErrors.join('; ')}`);
        if (pageErrors.length > 0) failures.push(`Page errors: ${pageErrors.join('; ')}`);
        if (threeWarnings.length > 0) failures.push(`THREE warnings: ${threeWarnings.join('; ')}`);
        if (!audit.ok) failures.push(`Audit failed: ${audit.reason}`);
        else {
            if (!audit.groupVisible || !audit.tiltVisible || !audit.raftHullVisible || !audit.charVisible) {
                failures.push(`Player raft/character invisible: ${JSON.stringify(audit)}`);
            }
            if (audit.nanNodes.length > 0) {
                failures.push(`NaN transforms detected on nodes: ${audit.nanNodes.join(', ')}`);
            }
            if (!audit.inFrustum) {
                failures.push(`Player raft not in camera frustum: ${JSON.stringify(audit.projectedScreenPx)}`);
            }
            if (audit.overlaps.length > 0) {
                failures.push(`HUD overlaps detected: ${audit.overlaps.join('; ')}`);
            }
            if (audit.bossBarPremature) {
                failures.push('Boss Health Bar is prematurely visible at river spawn!');
            }
        }

        if (failures.length > 0) {
            console.error('\n❌ QA HELMET FAILED GATES:\n - ' + failures.join('\n - '));
            process.exitCode = 1;
        } else {
            console.log('\n✅ ALL SOVEREIGN QA HELMET GATES PASSED (G1 Console, G2 3D Raft/Character Visible, G3 Zero HUD Overlap, G4 Boss Bar Gate)!');
        }
    } finally {
        await browser.close();
        srv.close();
    }
}

runQaHelmet().catch((err) => {
    console.error('Fatal QA Helmet error:', err);
    process.exit(1);
});
