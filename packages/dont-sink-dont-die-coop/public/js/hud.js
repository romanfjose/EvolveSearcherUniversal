// DOM HUD (health, wave, scoreboard, toasts, damage numbers) and a tiny WebAudio synth for hit feedback.
import { UPGRADES, MAX_WAVE, FINISH_Z, canPurchase } from '../../shared/game-core.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function createHud() {
    $('wave-pips').innerHTML = '<span></span>'.repeat(MAX_WAVE);
    let toastTimer = null;
    let flashAnim = null;

    return {
        setMode(mode, bots) {
            $('mode').textContent = mode === 'offline' ? `OFFLINE · local server · ${bots} AI bot${bots > 1 ? 's' : ''}`
                : mode === 'online' ? 'ONLINE · multiplayer server' : 'Connecting…';
        },
        setHealth(health, maxHealth) {
            const h = Math.max(0, health);
            $('health').textContent = `Health: ${h} / ${maxHealth}`;
            const bar = $('health-bar');
            bar.style.width = `${(100 * h) / maxHealth}%`;
            bar.style.background = h / maxHealth > 0.5 ? 'var(--ok)' : h / maxHealth > 0.25 ? 'var(--warn)' : 'var(--bad)';
        },
        setStatus(text, color) {
            $('health').textContent = text;
            $('health').style.color = color ?? '';
        },
        setStats(p) {
            $('coins').textContent = `Coins: ${p.coins}`;
            $('my-upgrades').textContent = p.upgrades.length ? p.upgrades.map((u) => UPGRADES[u].name).join(' · ') : 'No upgrades yet';
            for (const btn of document.querySelectorAll('[data-upgrade]')) {
                const type = btn.dataset.upgrade;
                const { ok, reason } = canPurchase(p, type);
                btn.disabled = !ok;
                btn.textContent = reason === 'owned' ? 'Owned' : 'Buy';
            }
        },
        renderScoreboard(sb, myId) {
            const lit = Math.min(sb.wave, MAX_WAVE);
            [...$('wave-pips').children].forEach((el, i) => el.classList.toggle('on', i < lit));
            $('wave-label').textContent = sb.gameWon ? 'RIVER ESCAPED' : `WAVE ${sb.wave} / ${sb.maxWave}`;
            $('distance').textContent = `${Math.max(0, Math.round(sb.leadZ - FINISH_Z))} m to the river mouth`;
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
    const tone = ({ from, to = from, dur = 0.12, type = 'square', gain = 0.12, delay = 0 }) => {
        if (muted || !ctx) return;
        const t = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        osc.frequency.exponentialRampToValueAtTime(to, t + dur);
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
    };
    return {
        unlock() { ctx ??= new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); },
        toggle() { muted = !muted; return muted; },
        hit(squeaky, volume = 1) {
            if (squeaky) { tone({ from: 900, to: 1700, dur: 0.09, gain: 0.1 * volume }); tone({ from: 1700, to: 1100, dur: 0.07, gain: 0.08 * volume, delay: 0.08 }); }
            else tone({ from: 240, to: 90, dur: 0.12, type: 'triangle', gain: 0.25 * volume });
        },
        hurt(blocked) { tone(blocked ? { from: 600, to: 400, dur: 0.08, gain: 0.1 } : { from: 170, to: 50, dur: 0.25, type: 'sawtooth', gain: 0.18 }); },
        kill() { [523, 659, 784].forEach((f, i) => tone({ from: f, dur: 0.1, gain: 0.1, delay: i * 0.07 })); },
        wave() { tone({ from: 220, to: 330, dur: 0.35, type: 'sawtooth', gain: 0.1 }); tone({ from: 330, to: 440, dur: 0.4, type: 'sawtooth', gain: 0.1, delay: 0.3 }); },
        down() { tone({ from: 400, to: 60, dur: 0.7, type: 'sawtooth', gain: 0.15 }); },
    };
}
