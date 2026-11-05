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
    const state = createGameState({ seed });
    const handlers = new Map();
    let interval = null;

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
        id, state, offline: true, connected: false,
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
        connect() {
            if (socket.connected) return socket;
            socket.connected = true;
            deliver(addPlayer(state, id, { name: 'You' }));
            for (let i = 0; i < bots; i++) deliver(addPlayer(state, `bot-${i + 1}`, { isBot: true }));
            deliver([{ event: 'connect', data: null }]);
            if (realtime) interval = timers.setInterval(() => socket.step(), tickMs);
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
