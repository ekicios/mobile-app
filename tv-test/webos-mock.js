// Mock LG webOS TV: SSAP'i 3001'de konuşur. RN tarafı gerçek TV olmadan test edilir.
// Run: node tv-test/webos-mock.js   (sonra uygulamada IP = bu makinenin LAN IP'si)
const { WebSocketServer } = require('ws');

const DEFAULT_PORT = 3001;
const WEB_APP_ID = 'com.myapp.hosted';
const FULL_APP_ID = 'com.myapp.hosted'; // hosted app'te kısa ID == tam ID

function createMockServer({
  port = DEFAULT_PORT,
  log = console.log,
  pairingRequired = false, // register -> client-key YOK (TV onayı bekleniyor)
  silentRegister = false, // register'a hiç cevap verme (timeout testi)
  errorOnLaunch = false, // launchWebApp -> type:"error"
  failLaunch = false, // launchWebApp -> returnValue:false
  connectState = 'CONNECTED', // connectToApp -> state
} = {}) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    log('[webos-mock] connected');
    let registered = false;

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }

      if (m.type === 'register') {
        registered = true;
        log('[webos-mock] register: ' + JSON.stringify(m.payload));
        if (silentRegister) return;
        // Gerçek SSAP: register -> type:"registered" (response değil).
        const payload = pairingRequired ? {} : { 'client-key': 'mock-client-key-123' };
        ws.send(JSON.stringify({ id: m.id, type: 'registered', payload }));
        return;
      }

      if (!registered) { log('[webos-mock] ignored pre-register msg'); return; }

      if (m.type === 'p2p') {
        // SSAP p2p isteklerinde `id` yoktur; payload'ı doğrudan okuruz.
        log('[webos-mock] P2P -> ' + JSON.stringify(m.payload));
        // TV -> mobil geri mesaj yolu (PoC doğrulaması).
        ws.send(JSON.stringify({ type: 'p2p', payload: { ack: true, echo: m.payload } }));
        return;
      }

      if (m.type === 'request') {
        if (m.uri === 'ssap://webapp/launchWebApp') {
          log('[webos-mock] launchWebApp ' + m.payload.webAppId);
          if (errorOnLaunch) {
            ws.send(JSON.stringify({ id: m.id, type: 'error', error: '403 unauthorized' }));
          } else if (failLaunch) {
            reply(ws, m.id, { returnValue: false, errorText: 'launch failed' });
          } else {
            reply(ws, m.id, { sessionId: 'session-1', appId: m.payload.webAppId });
          }
        } else if (m.uri === 'ssap://webapp/connectToApp') {
          log('[webos-mock] connectToApp ' + m.payload.webAppId);
          reply(ws, m.id, { state: connectState, appId: FULL_APP_ID });
        } else {
          log('[webos-mock] unknown uri ' + m.uri);
          reply(ws, m.id, { returnValue: false, errorText: 'unknown uri' });
        }
      }
    });

    ws.on('close', () => log('[webos-mock] closed'));
  });

  return wss;
}

function reply(ws, id, payload) {
  ws.send(JSON.stringify({ id, type: 'response', payload }));
}

if (require.main === module) {
  const wss = createMockServer();
  console.log(`[webos-mock] mock webOS TV on ws://0.0.0.0:${DEFAULT_PORT}`);
  console.log(`[webos-mock] webAppId = ${WEB_APP_ID}`);
  wss.on('listening', () => console.log('[webos-mock] ready'));
}

module.exports = { createMockServer, WEB_APP_ID, FULL_APP_ID };
