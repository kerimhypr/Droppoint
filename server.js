const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.static(__dirname));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const rooms = new Map();
const id = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  const peers = rooms.get(room) || new Set();
  peers.delete(ws);
  ws.room = null;
  if (!peers.size) rooms.delete(room);
}

wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'create') {
      leave(ws);
      let code = id();
      while (rooms.has(code)) code = id();
      rooms.set(code, new Set([ws]));
      ws.room = code;
      ws.send(JSON.stringify({ type: 'created', room: code }));
      return;
    }
    if (msg.type === 'join') {
      leave(ws);
      const code = String(msg.room || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4,10}$/.test(code) || !rooms.has(code)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Oda bulunamadı.' }));
        return;
      }
      const peers = rooms.get(code);
      for (const peer of peers) peer.send(JSON.stringify({ type: 'peer-joined' }));
      peers.add(ws); ws.room = code;
      ws.send(JSON.stringify({ type: 'joined', room: code }));
      return;
    }
    if (['offer','answer','ice'].includes(msg.type) && ws.room) {
      for (const peer of rooms.get(ws.room) || []) {
        if (peer !== ws && peer.readyState === 1) peer.send(JSON.stringify(msg));
      }
    }
  });
  ws.on('close', () => leave(ws));
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => console.log(`Droppoint listening on ${port}`));
