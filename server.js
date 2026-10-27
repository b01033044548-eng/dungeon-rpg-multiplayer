const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const players = new Map();

app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, players: players.size }));

io.on('connection', socket => {
  socket.emit('players:init', [...players.entries()].map(([id, presence]) => ({ id, presence })));
  players.set(socket.id, null);
  io.emit('player:update', { id: socket.id, presence: null });

  socket.on('player:presence', (presence, ack) => {
    // Only accept the small set of fields used by the game's player display.
    if (!presence || typeof presence !== 'object') { if (typeof ack === 'function') ack(false); return; }
    const clean = {
      n: String(presence.n || '모험가').slice(0, 20),
      x: Number(presence.x) || 0, y: Number(presence.y) || 0,
      f: Number(presence.f) || 1, a: String(presence.a || 'village').slice(0, 24),
      s: Number(presence.s) || 1, j: String(presence.j || '모험가').slice(0, 24),
      l: Math.max(1, Number(presence.l) || 1), h: Math.max(0, Number(presence.h) || 0),
      m: Math.max(1, Number(presence.m) || 1)
    };
    players.set(socket.id, clean);
    io.emit('player:update', { id: socket.id, presence: clean });
    if (typeof ack === 'function') ack(true);
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('player:left', socket.id);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => console.log(`Dungeon RPG server listening on ${port}`));
