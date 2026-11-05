// Picks the transport: a real Socket.io server when one answers, otherwise the in-browser
// loopback (static hosting, file servers, or ?offline). Handlers registered on the facade are
// replayed onto whichever transport wins, so main.js stays transport-agnostic.
import { createLoopbackSocket } from '../../shared/loopback.js';

export function createNetSocket({ timeoutMs = 2500 } = {}) {
    const params = new URLSearchParams(location.search);
    const bots = Math.min(3, Math.max(1, Number.parseInt(params.get('bots') ?? '2', 10) || 2));
    const seed = Number.parseInt(params.get('seed') ?? '', 10) || (Date.now() >>> 0);
    const listeners = [];
    const modeListeners = [];
    let impl = null;

    const facade = {
        mode: 'connecting', bots, seed,
        get id() { return impl?.id; },
        on(event, cb) { listeners.push([event, cb]); impl?.on(event, cb); return facade; },
        emit(event, data) { impl?.emit(event, data); return facade; },
        onMode(cb) { modeListeners.push(cb); cb(facade.mode); return facade; },
    };
    const setMode = (mode) => { facade.mode = mode; for (const cb of modeListeners) cb(mode); };

    const goOffline = () => {
        impl = createLoopbackSocket({ bots, seed });
        for (const [event, cb] of listeners) impl.on(event, cb);
        setMode('offline');
        impl.connect();
    };

    if (params.has('offline') || typeof window.io !== 'function') {
        setTimeout(goOffline, 0); // after main.js has registered its handlers
    } else {
        const s = window.io({ reconnection: false, timeout: timeoutMs });
        impl = s;
        s.on('connect', () => setMode('online'));
        s.once('connect_error', () => { s.close(); goOffline(); });
    }
    return facade;
}
