// Mock Samsung TV: speaks samsung.remote.control on 8001 so the phone can be
// tested without a real TV. Run: node tv-test/server.js
const { WebSocketServer } = require('ws');

const PORT = 8001;
const wss = new WebSocketServer({ port: PORT });

console.log(`[tv] mock Samsung TV on ws://0.0.0.0:${PORT}`);
console.log('[tv] point the app at this machine\'s LAN IP, then press Allow (auto-accepted here)');

wss.on('connection', (ws, req) => {
  console.log('[tv] connected:', req.url);
  ws.send(JSON.stringify({ event: 'ms.channel.connect', data: { token: 'mock-token', clients: [] } }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.log('[tv] non-JSON:', raw.toString());
      return;
    }
    const p = msg.params || {};
    if (msg.method === 'ms.remote.control' && p.TypeOfRemote === 'SendInputString') {
      console.log('[tv] TEXT:', Buffer.from(p.Cmd, 'base64').toString());
    } else if (msg.method === 'ms.remote.control') {
      console.log('[tv] KEY:', p.DataOfCmd);
    } else {
      console.log('[tv]', msg.method);
    }
  });

  ws.on('close', () => console.log('[tv] closed'));
});
