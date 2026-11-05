import express from 'express';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createGameState, addPlayer, removePlayer, handleClientEvent, tick, TICK_MS } from './shared/game-core.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(`${root}public`));
app.use('/shared', express.static(`${root}shared`));

const state = createGameState({ seed: Number(process.env.SEED) || Date.now() });

function dispatch(events) {
    for (const { event, data, to, except } of events) {
        if (to) io.to(to).emit(event, data);
        else if (except) io.except(except).emit(event, data);
        else io.emit(event, data);
    }
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    dispatch(addPlayer(state, socket.id));
    socket.onAny((event, data) => dispatch(handleClientEvent(state, socket.id, event, data)));
    socket.on('disconnect', () => dispatch(removePlayer(state, socket.id)));
});

setInterval(() => dispatch(tick(state, TICK_MS)), TICK_MS);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
