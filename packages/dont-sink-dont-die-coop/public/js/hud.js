// DOM HUD (health, telemetry, river progress, wave, scoreboard, toasts, damage numbers) and a tiny WebAudio synth.
import { UPGRADES, MAX_WAVE, FINISH_Z, CHECKPOINTS, SHOP_ZONE, canPurchase, clamp } from '../../shared/game-core.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const MS_TO_KNOTS = 3600 / 1852;
const riverPct = (z) => `${(100 * clamp(z / FINISH_Z, 0, 1)).toFixed(2)}%`;

export function createHud() {
    $('wave-pips').innerHTML = '<span></span>'.repeat(MAX_WAVE);
    $('river-track').insertAdjacentHTML('afterbegin',
        `<span class="shop-band" style="left:${riverPct(SHOP_ZONE.maxZ)};width:calc(${riverPct(SHOP_ZONE.minZ)} - ${riverPct(SHOP_ZONE.maxZ)})" title="City shop"></span>`
        + CHECKPOINTS.filter((z) => z > FINISH_Z).map((z) => `<span class="cp" style="left:${riverPct(z)}"></span>`).join('')
        + '<span class="finish" title="River mouth"></span>');
    let toastTimer = null;
    let flashAnim = null;
    const colors = {};
    const crewDots = {};

    return {
        setMode(mode, bots) {
            $('mode').textContent = mode === 'offline' ? `OFFLINE · local server · ${bots} AI bot${bots > 1 ? 's' : ''}`
                : mode === 'online' ? 'ONLINE · multiplayer server' : 'Connecting…';
        },
        setHealth(health, maxHealth) {
            const h = Math.max(0, health);
            $('health').textContent = `${h} / ${maxHealth}`;
            const bar = $('health-bar');
            bar.style.width = `${(100 * h) / maxHealth}%`;
            bar.style.background = h / maxHealth > 0.5 ? 'var(--ok)' : h / maxHealth > 0.25 ? 'var(--warn)' : 'var(--bad)';
        },
        setStatus(text, color) {
            $('status').textContent = text;
            $('status').hidden = !text;
            $('status').style.color = color ?? '';
        },
        setStats(p) {
            const safeCoins = Number.isFinite(Number(p?.coins)) ? Math.max(0, Math.round(Number(p.coins))) : 50;
            if (p) p.coins = safeCoins;
            $('coins').textContent = safeCoins;
            const labelOf = (u) => UPGRADES[u]?.name || String(u).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            const displayUpgrades = (p?.upgrades || []).filter((u) => UPGRADES[u] || /_(1|2|3)$/.test(String(u)));
            $('my-upgrades').innerHTML = displayUpgrades.length
                ? displayUpgrades.map((u) => `<span class="chip">${esc(labelOf(u))}</span>`).join('')
                : '<span class="faint">no upgrades yet</span>';
            for (const btn of document.querySelectorAll('[data-upgrade]')) {
                const type = btn.dataset.upgrade;
                const { ok, reason } = canPurchase({ coins: safeCoins, upgrades: p?.upgrades || [] }, type);
                btn.disabled = !ok;
                btn.textContent = reason === 'owned' ? 'Owned' : 'Buy';
            }
        },
        /** speed m/s, heading ° (0 = downriver, clockwise), z, altitude above the waterline, crew [{id, z}]. */
        setTelemetry({ speed, heading, z, altitude, crew, dead }) {
            $('kpi-kn').textContent = (speed * MS_TO_KNOTS).toFixed(1);
            $('kpi-ms').textContent = speed.toFixed(1);
            $('kpi-hdg').textContent = `${String(Math.round(heading) % 360).padStart(3, '0')}°`;
            $('kpi-alt').textContent = altitude > 0.05 ? `+${altitude.toFixed(1)} m` : 'afloat';
            $('kpi-alt').classList.toggle('air', altitude > 0.05);
            $('me-marker').style.left = riverPct(z);
            $('me-marker').classList.toggle('dead', dead);
            const seen = new Set();
            for (const c of crew) {
                seen.add(c.id);
                const dot = crewDots[c.id] ??= $('river-track').appendChild(Object.assign(document.createElement('i'), { className: 'crew' }));
                dot.style.left = riverPct(c.z);
                if (colors[c.id] !== undefined) dot.style.background = hex(colors[c.id]);
            }
            for (const id in crewDots) if (!seen.has(id)) { crewDots[id].remove(); delete crewDots[id]; }
        },
        renderScoreboard(sb, myId) {
            for (const p of sb.players) colors[p.id] = p.color;
            $('kpi-threats').textContent = sb.enemies.length;
            const lit = Math.min(sb.wave, MAX_WAVE);
            [...$('wave-pips').children].forEach((el, i) => el.classList.toggle('on', i < lit));
            $('wave-label').textContent = sb.gameWon ? 'RIVER ESCAPED' : `WAVE ${sb.wave} / ${sb.maxWave}`;
            $('distance').textContent = `${Math.max(0, Math.round(sb.leadZ - FINISH_Z))} m`;
            $('enemy-bars').innerHTML = sb.enemies.map((e) =>
                `<div><span>${esc(e.id)}</span><div class="bar"><i style="width:${(100 * e.health) / e.maxHealth}%"></i></div></div>`).join('');
            $('score-rows').innerHTML = sb.players.map((p) => `
                <tr class="${p.isDead ? 'dead' : ''} ${p.id === myId ? 'me' : ''}">
                    <td><span class="swatch" style="background:${hex(p.color)}"></span>${p.isBot ? '🤖 ' : ''}${esc(p.name)}${p.isDead ? ' ☠' : ''}</td>
                    <td>${p.kills}</td><td>${p.damageDealt}</td><td>${p.health}/${p.maxHealth}</td><td>${p.score}</td>
                </tr>`).join('');
        },
        toast(text, ms = 1800) {
            const el = $('toast');
            el.textContent = text;
            el.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => el.classList.remove('show'), ms);
        },
        flashDamage(strength = 1) {
            flashAnim?.cancel();
            flashAnim = $('damage-flash').animate([{ opacity: Math.min(1, 0.35 + strength) }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
        },
        /** Floating text at a projected screen position {x, y} in CSS pixels. */
        pop(at, text, color = '#fff') {
            const el = document.createElement('div');
            el.className = 'pop';
            el.textContent = text;
            el.style.left = `${at.x}px`;
            el.style.top = `${at.y}px`;
            el.style.color = color;
            el.addEventListener('animationend', () => el.remove());
            $('fx').appendChild(el);
        },
    };
}

export function createSfx() {
    let ctx = null;
    let muted = false;
    // Helmet 02 (Sound & Atmosphere Engineer):
    // Warm low-pass-filtered (< 850 Hz) physical impacts with pitch randomization (0.88x - 1.12x) — zero harsh square-wave beeps!
    const tone = ({ from, to = from, dur = 0.12, type = 'triangle', gain = 0.12, delay = 0, lpFreq = 780 }) => {
        if (muted || !ctx) return;
        const pitchJitter = 0.9 + Math.random() * 0.2;
        const t = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = type === 'square' || type === 'sawtooth' ? 'triangle' : type;
        osc.frequency.setValueAtTime(Math.max(40, from * pitchJitter), t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(32, to * pitchJitter), t + dur);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(lpFreq, t);
        g.gain.setValueAtTime(Math.min(0.22, gain), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(filter).connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
    };
    return {
        unlock() { ctx ??= new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); },
        toggle() { muted = !muted; return muted; },
        hit(squeaky, volume = 1) {
            if (squeaky) {
                tone({ from: 420, to: 580, dur: 0.08, type: 'sine', gain: 0.09 * volume, lpFreq: 850 });
                tone({ from: 580, to: 380, dur: 0.07, type: 'sine', gain: 0.07 * volume, delay: 0.06, lpFreq: 750 });
            } else {
                tone({ from: 190, to: 68, dur: 0.11, type: 'triangle', gain: 0.18 * volume, lpFreq: 520 });
            }
        },
        hurt(blocked) {
            tone(blocked
                ? { from: 320, to: 180, dur: 0.08, type: 'triangle', gain: 0.12, lpFreq: 620 }
                : { from: 145, to: 48, dur: 0.22, type: 'triangle', gain: 0.16, lpFreq: 420 });
        },
        kill() { [293, 370, 440].forEach((f, i) => tone({ from: f, dur: 0.12, type: 'sine', gain: 0.08, delay: i * 0.07, lpFreq: 720 })); },
        wave() { tone({ from: 130, to: 98, dur: 0.45, type: 'sine', gain: 0.09, lpFreq: 380 }); },
        splash(strength = 1) { tone({ from: 360, to: 95, dur: 0.18, type: 'sine', gain: 0.06 * Math.min(1.4, strength), lpFreq: 540 }); },
        down() { tone({ from: 180, to: 52, dur: 0.55, type: 'triangle', gain: 0.12, lpFreq: 360 }); },
        // Helmet 06: Diegetic wood groan/creak when stepping or landing onto wooden docks/planks (< 420 Hz, subtle pitch jitter)
        creak(volume = 1) {
            tone({ from: 220, to: 140, dur: 0.16, type: 'triangle', gain: 0.11 * Math.min(1.5, volume), lpFreq: 420 });
            tone({ from: 165, to: 90, dur: 0.22, type: 'sine', gain: 0.08 * Math.min(1.5, volume), delay: 0.05, lpFreq: 340 });
        },
    };
}
