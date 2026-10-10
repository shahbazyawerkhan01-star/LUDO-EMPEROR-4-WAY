import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import dotenv from 'dotenv';
import { createRoomServer } from './rooms.mjs';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

app.use(express.json());
app.use(express.static(publicDir));

const { rooms, getRoomInfo, handleUpgrade } = createRoomServer();

app.get('/api/health', (_, res) => {
  res.json({ ok: true, service: 'ludo-emperor-4-way-multiplayer', time: new Date().toISOString() });
});

app.post('/api/rooms/create', (req, res) => {
  const playerName = String(req.body?.playerName || 'Player').trim() || 'Player';
  const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const room = rooms.get(code) || {
    code,
    players: new Map(),
    gameState: { phase: 'lobby', players: [] },
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  room.players = room.players || new Map();
  room.players.set(`creator_${Date.now()}`, { name: playerName, connected: true, joinedAt: Date.now() });
  room.lastActivity = Date.now();
  rooms.set(code, room);

  res.json({ ok: true, roomCode: code, shareUrl: `/?room=${code}` });
});

app.post('/api/rooms/join', (req, res) => {
  const roomCode = String(req.body?.roomCode || '').toUpperCase();
  const playerName = String(req.body?.playerName || 'Player').trim() || 'Player';

  if (!roomCode) {
    return res.status(400).json({ ok: false, message: 'Room code is required' });
  }

  const room = rooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, message: 'Room not found' });
  }

  room.players = room.players || new Map();
  const allPlayers = Array.from(room.players.values()).map((p) => ({ name: p.name, connected: p.connected }));
  const alreadyExists = allPlayers.some((p) => p.name.toLowerCase() === playerName.toLowerCase());
  if (!alreadyExists) {
    room.players.set(`joiner_${Date.now()}`, { name: playerName, connected: true, joinedAt: Date.now() });
  }

  room.lastActivity = Date.now();

  return res.json({
    ok: true,
    roomCode,
    players: Array.from(room.players.values()).map((p) => ({ name: p.name, connected: p.connected })),
  });
});

app.get('/api/rooms/:code', (req, res) => {
  const roomCode = String(req.params.code || '').toUpperCase();
  const room = getRoomInfo(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, message: 'Room not found' });
  }

  return res.json({ ok: true, ...room, state: room.gameState || { phase: 'lobby', players: [] } });
});

const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/ws') {
    handleUpgrade(req, socket, head);
    return;
  }
  socket.destroy();
});

server.listen(port, () => {
  console.log(`Ludo Emperor multiplayer server running on http://localhost:${port}`);
});
