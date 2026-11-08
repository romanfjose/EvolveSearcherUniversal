// In-process stand-in for a Socket.io client connection. It owns an authoritative game state,
// runs the same tick loop as server.js and delivers the routed events to locally registered
// handlers, so the browser client cannot tell it apart from a real server.
import { createGameState, addPlayer, handleClientEvent, tick, TICK_MS } from './game-core.js';

export const LOCAL_PLAYER_ID = 'local-player';

export function createLoopbackSocket({
    bots = 2,
    seed = 1,
    tickMs = TICK_MS,
    realtime = true, // false = drive the clock manually with step() (tests, replays)
    timers = globalThis,
} = {}) {
    const id = LOCAL_PLAYER_ID;
    let state = createGameState({ seed });
    const handlers = new Map();
    let interval = null;
    let paused = false;
    let currentBots = bots;

    const deliver = (events) => {
        for (const e of events) {
            if ((e.to && e.to !== id) || e.except === id) continue;
            const list = handlers.get(e.event);
            if (!list) continue;
            const payload = structuredClone(e.data); // match wire semantics: receivers never alias state
            for (const cb of list) cb(payload);
        }
    };

    const socket = {
        id,
        get state() { return state; },
        offline: true,
        connected: false,
        get paused() { return paused; },
        setPaused(val) {
            paused = Boolean(val);
            return socket;
        },
        on(event, cb) {
            if (!handlers.has(event)) handlers.set(event, []);
            handlers.get(event).push(cb);
            return socket;
        },
        off(event, cb) {
            const list = handlers.get(event);
            if (list) handlers.set(event, list.filter((f) => f !== cb));
            return socket;
        },
        emit(event, data) {
            if (socket.connected) deliver(handleClientEvent(state, id, event, data));
            return socket;
        },
        step(ticks = 1) {
            for (let i = 0; i < ticks; i++) deliver(tick(state, tickMs));
            return socket;
        },
        reconfigure({
            bots: newBots = currentBots,
            seed: newSeed = seed,
            playerName = 'You',
            classId = 'helmsman',
            hatId = 'captain_tricorn',
            mode = 'campaign',
            startCoins = null,
        } = {}) {
            currentBots = Math.min(3, Math.max(0, Number.isFinite(Number(newBots)) ? Math.round(Number(newBots)) : currentBots));
            const cleanSeed = typeof newSeed === 'number' && Number.isFinite(newSeed) ? (newSeed >>> 0) : 1;
            const oldIds = Object.keys(state.players).filter((pid) => pid !== id);
            state = createGameState({ seed: cleanSeed });
            state.mode = mode;
            addPlayer(state, id, { name: playerName || 'You' });
            if (state.players[id]) {
                state.players[id].classId = classId;
                state.players[id].hatId = hatId;
                if (Number.isFinite(startCoins)) {
                    state.players[id].coins = startCoins;
                }
            }
            const botClasses = ['bruiser', 'tinkerer', 'mystic'];
            const botHats = ['viking_horns', 'traffic_cone', 'wizard_beard'];
            for (let i = 0; i < currentBots; i++) {
                const bid = `bot-${i + 1}`;
                addPlayer(state, bid, { isBot: true });
                if (state.players[bid]) {
                    state.players[bid].classId = botClasses[i % botClasses.length];
                    state.players[bid].hatId = botHats[i % botHats.length];
                }
            }
            // Remove any stale bots from previous configuration
            for (const oldId of oldIds) {
                if (!state.players[oldId]) {
                    deliver([{ event: 'playerDisconnected', data: oldId }]);
                }
            }
            if ( mode === 'boss_rush' ) {
                state.gameStarted = true;
            }
            deliver([
                { event: 'currentPlayers', data: state.players, to: id },
                { event: 'enemiesUpdate', data: state.enemies },
                { event: 'npcsUpdate', data: state.npcs },
                { event: 'playerStatsUpdate', data: state.players[id], to: id },
                { event: 'playerHealthUpdate', data: { id, health: state.players[id].health, maxHealth: state.players[id].maxHealth } },
                { event: 'waveChanged', data: { wave: state.wave, maxWave: 10 } },
            ]);
            return socket;
        },
        connect() {
            if (socket.connected) return socket;
            socket.connected = true;
            deliver(addPlayer(state, id, { name: 'You' }));
            const botClasses = ['bruiser', 'tinkerer', 'mystic'];
            const botHats = ['viking_horns', 'traffic_cone', 'wizard_beard'];
            for (let i = 0; i < currentBots; i++) {
                const bid = `bot-${i + 1}`;
                const evs = addPlayer(state, bid, { isBot: true });
                if (state.players[bid]) {
                    state.players[bid].classId = botClasses[i % botClasses.length];
                    state.players[bid].hatId = botHats[i % botHats.length];
                }
                deliver(evs);
            }
            deliver([{ event: 'connect', data: null }]);
            if (realtime) interval = timers.setInterval(() => { if (!paused) socket.step(); }, tickMs);
            return socket;
        },
        disconnect() {
            if (interval !== null) timers.clearInterval(interval);
            interval = null;
            socket.connected = false;
            return socket;
        },
    };
    return socket;
}
