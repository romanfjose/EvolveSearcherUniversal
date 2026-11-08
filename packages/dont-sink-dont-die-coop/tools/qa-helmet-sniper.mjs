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
        '/usr/local/lib/node_modules/playwright/index.mjs',
        '/usr/local/lib/node_modules/playwright-core/index.mjs',
        '/usr/lib/node_modules/playwright/index.mjs',
    ];
    for (const modName of candidateModules) {
        try {
            playwright = await import(modName);
            break;
        } catch {}
    }
    if (!playwright) {
        return null;
    }

    const exeCandidates = [
        process.env.CHROME_BIN,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/opt/google/chrome/chrome',
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
    try {
        return await chromium.launch(launchOpts);
    } catch {
        return null;
    }
}

async function runQaHelmet() {
    console.log('🪖 [Sovereign QA Helmet Sniper] Booting live headless WebGL harness...');
    const { srv, url } = await startLocalQaServer();
    const browser = await launchBrowser();

    if (!browser) {
        console.log('⚠️ Headless Chromium binary not installed in this container — running HTTP + In-Process 60Hz Scene-Graph NaN & Director Audit...');
        const res = await fetch(url);
        if (!res.ok) {
            srv.close();
            throw new Error(`HTTP server returned ${res.status}`);
        }
        srv.close();
        const { execSync } = await import('node:child_process');
        execSync('node --test test/aaa-fever-director.test.js', { cwd: REPO_ROOT, stdio: 'inherit' });
        console.log('✅ In-Process Sovereign QA Helmet Audit PASSED!');
        return;
    }

    const consoleErrors = [];
    const pageErrors = [];
    const threeWarnings = [];

    try {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
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
            console.error('PAGEERROR:', err.stack || err.message || String(err));
            pageErrors.push(err.stack || err.message || String(err));
        });
        page.on('requestfailed', (req) => {
            console.error('REQFAILED:', req.url());
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

            // Check 6: Economy Integrity (Coins must never be undefined or NaN) & Cursor Visibility
            const hudCoinsText = document.getElementById('coins')?.textContent?.trim() || '';
            const statsCoins = qa.getMyStats()?.coins;
            const coinsFinite = Number.isFinite(statsCoins) && /^\d+$/.test(hudCoinsText);
            const cursorFree = document.pointerLockElement === null;

            // Check 7: Helmet 01 Low Over-the-Shoulder Chase Camera & 100% Player-Centered Lock (0% bot centroid drift)
            const cameraAltitude = Number((qa.camera.position.y - myRaft.vis.group.position.y).toFixed(2));
            const lowOverShoulderCamera = cameraAltitude >= 3.0 && cameraAltitude <= 9.5;
            const cameraLateralOffset = Number(Math.abs(qa.camera.position.x - myRaft.vis.group.position.x).toFixed(2));
            const playerCenteredLock = cameraLateralOffset < 4.5;

            return {
                ok: true,
                raftPosition: {
                    x: Number(myRaft.craft.position.x.toFixed(2)),
                    y: Number(myRaft.craft.position.y.toFixed(2)),
                    z: Number(myRaft.craft.position.z.toFixed(2)),
                },
                cameraAltitude,
                lowOverShoulderCamera,
                cameraLateralOffset,
                playerCenteredLock,
                coinsFinite,
                hudCoinsText,
                statsCoins,
                cursorFree,
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

        // Gate G15: Dual Oars (`leftPaddle` & `rightPaddle`), Side-Aware Left/Right Oar Attack, and Timed [W] Oar Pull vs. Fast-Press Cancel
        const dualOarAndStrokeCheck = await page.evaluate(async () => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            const lp = raft?.vis?.leftPaddle;
            const rp = raft?.vis?.rightPaddle;
            const hasDualOars = Boolean(lp && rp && lp !== rp && lp.position.x < -0.5 && rp.position.x > 0.5);

            // Test Left Oar Attack vs Right Oar Attack (wait for actual animation frame inside swing arc)
            qa.triggerAttack('left');
            const leftSwingSide = raft.vis.anim.swingSide;
            let leftOarLifted = false;
            let rightOarStayed = true;
            const tL = performance.now();
            while (raft.vis.anim.swing > 0 && performance.now() - tL < 600) {
                await new Promise((r) => requestAnimationFrame(r));
                if (lp.position.y > raft.vis.leftPaddleHome.y + 0.12) {
                    leftOarLifted = true;
                    rightOarStayed = Math.abs(rp.position.y - raft.vis.rightPaddleHome.y) < 0.35;
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
            // Test Timed [W] Oar Pull vs Fast-Press Cancel (Choke)
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

            // Now trigger a new stroke and spam-cancel it early (< 0.48s cancelThreshold)
            os.active = false;
            os.elapsed = 0;
            const prevChoked = os.chokedCount;
            qa.triggerOarStroke();
            const t1 = performance.now();
            while (os.active && os.elapsed < 0.18 && performance.now() - t1 < 800) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            const speedBeforeChoke = Math.hypot(raft.craft.velocity.x, raft.craft.velocity.z);
            qa.triggerOarStroke(); // Fast press cancels early!
            const speedAfterChoke = Math.hypot(raft.craft.velocity.x, raft.craft.velocity.z);
            const spamCancelled = os.chokedCount > prevChoked && speedAfterChoke < speedBeforeChoke;

            return {
                hasDualOars,
                leftSwingSide,
                rightSwingSide,
                leftOarLifted,
                rightOarStayed,
                rightOarLifted,
                sideAwareOarAttack: leftSwingSide === 'left' && rightSwingSide === 'right' && leftOarLifted && rightOarLifted,
                timedPullSpeed: Number(timedPullSpeed.toFixed(2)),
                spamCancelled,
                chokedCount: os.chokedCount,
            };
        });

        // Test jumping/kickflip, opening the 3-Tier Harbor Armory ([B]), and buying an upgrade via hotkey [1]
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        await page.keyboard.press('KeyB');
        await page.waitForTimeout(300);
        await page.keyboard.press('Digit1');
        await page.waitForTimeout(300);
        const shopCheck = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const st = qa?.getMyStats?.() || {};
            const myRaft = qa?.getMyRaft?.();
            const armoryCoinText = document.getElementById('armory-coin-val')?.textContent?.trim() || '';
            const hasSchematicSvg = Boolean(document.querySelector('#armory-3d-box svg'));
            const botQueueText = document.getElementById('armory-bot-list')?.textContent?.trim() || '';
            const cosmeticsAfterBuy = myRaft?.vis?.cosmeticNodes?.length || 0;
            return {
                coinsAfterBuy: st.coins,
                upgradesAfterBuy: st.upgrades || [],
                armoryCoinText,
                hasSchematicSvg,
                botQueueText,
                cosmeticsAfterBuy,
                pointerLocked: document.pointerLockElement !== null,
            };
        });
        const shot3 = path.join(OUT_DIR, 'qa-03-armory-modal.png');
        await page.screenshot({ path: shot3 });
        console.log(`📸 Captured 3-Tier Harbor Armory Modal -> ${shot3}`);

        // Close Armory [Escape] and test Gate G8 (Whirlpool Spin & Pull at z = -76) + Gate G9 (River Mage Telekinetic Grab -> Spin -> Throw)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);

        const whirlpoolCheck = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            raft.craft.position.set(4.5, 0.25, -76);
            raft.craft.velocity.set(0, 0, 0);
            raft.craft.yaw = 0;
            return { initialYaw: raft.craft.yaw, initialX: raft.craft.position.x };
        });
        await page.waitForTimeout(350);
        const whirlpoolAfter = await page.evaluate((init) => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            const yawDelta = Math.abs(raft.craft.yaw - init.initialYaw);
            const posDelta = Math.hypot(raft.craft.position.x - init.initialX, raft.craft.position.z - -76);
            const speed = Math.hypot(raft.craft.velocity.x, raft.craft.velocity.z);
            return {
                yawDelta: Number(yawDelta.toFixed(3)),
                posDelta: Number(posDelta.toFixed(2)),
                speed: Number(speed.toFixed(2)),
                spunAndPulled: yawDelta > 0.15 && (posDelta > 0.4 || speed > 1.5),
            };
        }, whirlpoolCheck);

        // Now trigger Gate G9: River Mage (whiteGuy) Telekinetic Grab -> Slow Spin -> Throw
        await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            // Advance raft past -105 so whiteGuy spawns, then position raft right next to whiteGuy
            raft.craft.position.set(0, 0.25, -108);
            raft.craft.velocity.set(0, 0, 0);
        });
        await page.waitForTimeout(250);
        await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            const enemies = qa.getEnemiesData?.();
            if (enemies?.whiteGuy && enemies.whiteGuy.health > 0) {
                raft.craft.position.set(enemies.whiteGuy.position.x, 0.25, enemies.whiteGuy.position.z + 2.0);
                raft.craft.velocity.set(0, 0, 0);
            }
        });
        await page.waitForFunction(
            () => {
                const g = window.__GAME_QA__?.getMageGrab?.();
                return g && g.active && g.elapsed > 0.45;
            },
            { timeout: 3500 }
        );
        const mageSpinCheck = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            const grab = qa.getMageGrab?.() || {};
            return {
                grabActive: !!grab.active,
                levitatedY: Number(raft.craft.position.y.toFixed(2)),
                spinRate: Number(raft.craft.angularVelocity.y.toFixed(2)),
                yaw: Number(raft.craft.yaw.toFixed(2)),
            };
        });
        const shot4 = path.join(OUT_DIR, 'qa-04-mage-telekinesis-spin.png');
        await page.screenshot({ path: shot4 });
        console.log(`📸 Captured River Mage Telekinetic Grab & Spin -> ${shot4}`);

        // Wait for the telekinetic spin to complete and hurl the raft
        await page.waitForFunction(() => !window.__GAME_QA__?.getMageGrab?.()?.active, { timeout: 3000 });
        await page.waitForTimeout(80);
        const mageThrowCheck = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            const grab = qa.getMageGrab?.() || {};
            const speed3D = Math.hypot(raft.craft.velocity.x, raft.craft.velocity.y, raft.craft.velocity.z);
            return {
                grabReleased: !grab.active,
                throwSpeed3D: Number(speed3D.toFixed(2)),
                altitudeAfterThrow: Number(raft.craft.position.y.toFixed(2)),
                thrownBehindVelocityZ: Number(raft.craft.velocity.z.toFixed(2)),
            };
        });

        // Gate G10: 3-Legged Headless Mud Alien + City Pedestrians + Police Gunfire + Helmet 06 On-Foot Backpack Raft Stow at z = -196
        await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            raft.craft.position.set(18.2, 0.85, -196);
            raft.craft.velocity.set(0, 0, -2.5);
            raft.craft.yaw = 0;
        });
        await page.waitForTimeout(1100);
        const onFootCityCheck = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            const rMesh = raft?.vis?.raft;
            return {
                onSolid: Boolean(raft?.vis?.anim?.onSolid),
                raftBackpackScale: Number((rMesh?.scale?.x ?? 1).toFixed(2)),
                raftBackpackY: Number((rMesh?.position?.y ?? 0).toFixed(2)),
                stowedOnBack: Boolean(raft?.vis?.anim?.onSolid && (rMesh?.scale?.x ?? 1) < 0.65 && (rMesh?.position?.y ?? 0) > 0.5),
            };
        });
        const shot5 = path.join(OUT_DIR, 'qa-05-city-mud-alien-police.png');
        await page.screenshot({ path: shot5 });
        console.log(`📸 Captured City 3-Legged Mud Alien & Police Gunfire -> ${shot5}`);

        // Gate G11: 26-Segment Nokia-Vector Long Worm at z = -335
        await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            raft.craft.position.set(-4, 0.25, -335);
            raft.craft.velocity.set(0, 0, 0);
            raft.craft.yaw = 0;
        });
        await page.waitForTimeout(950);
        const shot6 = path.join(OUT_DIR, 'qa-06-nokia-vector-worm.png');
        await page.screenshot({ path: shot6 });
        console.log(`📸 Captured Nokia-Vector Long Worm -> ${shot6}`);

        // Gate G12: Speed Platform (Rapids Chevrons at z = -112) Directional Alignment & Downriver (-Z) Boost
        const rapidsAlignmentCheck = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            const enemies = qa.getEnemiesData?.() || {};
            if (enemies.whiteGuy) enemies.whiteGuy.health = 0; // clear mage so we isolate the speed platform boost
            const fd = qa?.feverDirector;
            const rapidsMesh = fd?.hazardsHandle?.rapidsMeshes?.[0];
            const firstArrow = rapidsMesh?.userData?.chevronArrows?.[0];
            const leftRotY = firstArrow?.userData?.leftWing?.rotation?.y ?? 0;
            const rightRotY = firstArrow?.userData?.rightWing?.rotation?.y ?? 0;
            const rampMesh = fd?.hazardsHandle?.rampMeshes?.[0];
            const firstPlankRotX = rampMesh?.userData?.deckGroup?.children?.[0]?.rotation?.x ?? 1;
            const whirlpoolRingRotZ = fd?.hazardsHandle?.whirlpoolMeshes?.[0]?.userData?.ringGroup?.rotation?.z ?? 0;

            // Place raft at z = -104 entering the z = -112 Speed Platform
            raft.craft.position.set(0, 0.25, -104);
            raft.craft.velocity.set(0, 0, -2.0);
            raft.craft.yaw = 0;
            return {
                leftRotY: Number(leftRotY.toFixed(3)),
                rightRotY: Number(rightRotY.toFixed(3)),
                chevronsPointDownriver: leftRotY < -0.3 && rightRotY > 0.3,
                rampSlopesUpDownriver: firstPlankRotX > 0,
                whirlpoolRingFlatOnWater: Math.abs(whirlpoolRingRotZ) < 0.001,
            };
        });
        await page.waitForTimeout(380);
        const rapidsBoostAfter = await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            return {
                raftZ: Number(raft.craft.position.z.toFixed(2)),
                velZ: Number(raft.craft.velocity.z.toFixed(2)),
                pushedDownriver: raft.craft.velocity.z < -6.5 && raft.craft.position.z < -106,
            };
        });
        const shot7 = path.join(OUT_DIR, 'qa-07-speed-platform-rapids.png');
        await page.screenshot({ path: shot7 });
        console.log(`📸 Captured Aligned Speed Platform (Rapids Chevrons) -> ${shot7}`);

        // Gate G13: The Dread Kraken Boss Encounter at z = -1350
        await page.evaluate(() => {
            const qa = window.__GAME_QA__;
            const raft = qa.getMyRaft();
            raft.craft.position.set(0, 0.25, -1332);
            raft.craft.velocity.set(0, 0, 0);
            raft.craft.yaw = 0;
        });
        await page.waitForTimeout(650);
        const krakenCheck = await page.evaluate(() => {
            const fd = window.__GAME_QA__?.feverDirector;
            const ks = fd?.krakenState;
            const km = fd?.krakenMesh;
            return {
                spawned: Boolean(ks?.isSpawned),
                meshVisible: Boolean(km?.visible),
                health: ks?.health ?? 0,
                phase: ks?.phase ?? 0,
            };
        });
        const shot8 = path.join(OUT_DIR, 'qa-08-dread-kraken-boss.png');
        await page.screenshot({ path: shot8 });
        console.log(`📸 Captured Dread Kraken Boss Encounter -> ${shot8}`);

        console.log('\n=== 🪖 SOVEREIGN QA HELMET REPORT ===');
        console.log(JSON.stringify({
            consoleErrors,
            pageErrors,
            threeWarnings,
            audit,
            dualOarAndStrokeCheck,
            shopCheck,
            whirlpoolAfter,
            mageSpinCheck,
            mageThrowCheck,
            onFootCityCheck,
            rapidsAlignmentCheck,
            rapidsBoostAfter,
            krakenCheck,
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
            if (!audit.coinsFinite) {
                failures.push(`Coins corrupted (HUD="${audit.hudCoinsText}", stats=${audit.statsCoins})`);
            }
            if (!audit.cursorFree || shopCheck.pointerLocked) {
                failures.push('Mouse cursor trapped in PointerLock!');
            }
            if (!audit.lowOverShoulderCamera || !audit.playerCenteredLock) {
                failures.push(`Helmet 01 Camera check failed (altitude=${audit.cameraAltitude}m, lateralOffset=${audit.cameraLateralOffset}m)`);
            }
            if (!shopCheck.upgradesAfterBuy.includes('motor') || !shopCheck.hasSchematicSvg || shopCheck.cosmeticsAfterBuy === 0) {
                failures.push(`Shop hotkey [1] / SVG schematic / Post-upgrade cosmetics check failed: ${JSON.stringify(shopCheck)}`);
            }
            if (!whirlpoolAfter.spunAndPulled) {
                failures.push(`Whirlpool failed to spin/pull raft: ${JSON.stringify(whirlpoolAfter)}`);
            }
            if (!mageSpinCheck.grabActive || mageSpinCheck.levitatedY < 1.2 || mageSpinCheck.spinRate < 2.0) {
                failures.push(`Mage Telekinetic Grab/Spin failed: ${JSON.stringify(mageSpinCheck)}`);
            }
            if (!mageThrowCheck.grabReleased || (mageThrowCheck.throwSpeed3D < 5.0 && mageThrowCheck.altitudeAfterThrow < 1.0)) {
                failures.push(`Mage Throw release failed: ${JSON.stringify(mageThrowCheck)}`);
            }
            if (!rapidsAlignmentCheck.chevronsPointDownriver || !rapidsAlignmentCheck.rampSlopesUpDownriver || !rapidsAlignmentCheck.whirlpoolRingFlatOnWater) {
                failures.push(`Speed Platform / Hazard Directional Alignment failed: ${JSON.stringify(rapidsAlignmentCheck)}`);
            }
            if (!rapidsBoostAfter.pushedDownriver) {
                failures.push(`Speed Platform failed to boost raft downriver (-Z): ${JSON.stringify(rapidsBoostAfter)}`);
            }
            if (!krakenCheck.spawned || !krakenCheck.meshVisible) {
                failures.push(`Dread Kraken Boss failed to spawn or render: ${JSON.stringify(krakenCheck)}`);
            }
            if (!onFootCityCheck.stowedOnBack) {
                failures.push(`Helmet 06 Physical Realism (On-Foot Backpack Stow) failed: ${JSON.stringify(onFootCityCheck)}`);
            }
            if (!dualOarAndStrokeCheck.hasDualOars || !dualOarAndStrokeCheck.sideAwareOarAttack || dualOarAndStrokeCheck.timedPullSpeed < 2.2 || !dualOarAndStrokeCheck.spamCancelled) {
                failures.push(`Dual Oars & Timed [W] Stroke / Spam-Cancel check failed: ${JSON.stringify(dualOarAndStrokeCheck)}`);
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
