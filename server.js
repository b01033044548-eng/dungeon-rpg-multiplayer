
const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { randomUUID } = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const players = new Map();

app.use(express.static(__dirname));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    players: players.size
  });
});

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data) {
  const message = JSON.stringify(data);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (ws) => {
  const id = randomUUID();

  const existingPlayers = [...players.entries()].map(
    ([playerId, presence]) => ({
      id: playerId,
      presence
    })
  );

  players.set(id, {});

  send(ws, {
    t: 'hello',
    id,
    peers: existingPlayers
  });

  ws.on('message', (raw) => {
    if (raw.length > 100000) return;

    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.t !== 'p') return;
    if (!message.presence || typeof message.presence !== 'object') {
      return;
    }

    const oldPresence = players.get(id) || {};
    const patch = message.presence;

    const clean = { ...oldPresence };

    for (const key of [
      'n', 'x', 'y', 'f', 'a', 's',
      'j', 'l', 'h', 'm', 'hit', 'heal'
    ]) {
      if (patch[key] !== undefined) {
        clean[key] = patch[key];
      }
    }

    players.set(id, clean);

    broadcast({
      t: 'p',
      id,
      presence: clean
    });
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ t: 'left', id });
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
});

const port = process.env.PORT || 3000;

server.listen(port, '0.0.0.0', () => {
  console.log(`Dungeon RPG server listening on ${port}`);
});
