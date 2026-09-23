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
  sendPrompt = false, // register cevabindan once pairingType:PROMPT gonder
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
        if (sendPrompt) {
          // Gerçek TV: once pairing istegi, sonra (kullanici onayi yerine) registered.
          ws.send(JSON.stringify({ id: m.id, type: 'response', payload: { pairingType: 'PROMPT', returnValue: true } }));
        }
        // Gerçek SSAP: register -> type:"registered" (onay sonrasi).
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

      // launchWebApp: request, parametre `id`.
      if (m.type === 'request' && m.uri === 'ssap://webapp/launchWebApp') {
        log('[webos-mock] launchWebApp ' + m.payload.webAppId);
        if (!m.payload.webAppId) {
          ws.send(JSON.stringify({ id: m.id, type: 'error', error: '500 missing or invalid required property webAppId' }));
        } else if (errorOnLaunch) {
          ws.send(JSON.stringify({ id: m.id, type: 'error', error: '403 unauthorized' }));
        } else if (failLaunch) {
          reply(ws, m.id, { returnValue: false, errorText: 'launch failed' });
        } else {
          reply(ws, m.id, { sessionId: 'session-1', appId: m.payload.webAppId });
        }
        return;
      }

      // connectToApp: SUBSCRIPTION. request gelirse gercek TV gibi reddet.
      if (m.uri === 'ssap://webapp/connectToApp') {
        if (m.type === 'request') {
          reply(ws, m.id, { returnValue: false, errorCode: -1000, errorText: 'Expected subscription' });
          return;
        }
        log('[webos-mock] connectToApp (subscribe) ' + (m.payload.webAppId || m.payload.appId));
        if (!m.payload.webAppId && !m.payload.appId) {
          reply(ws, m.id, { returnValue: false, errorCode: -1000, errorText: 'Expected property appId or webAppId' });
          return;
        }
        reply(ws, m.id, { state: connectState, appId: FULL_APP_ID });
        return;
      }

      log('[webos-mock] unknown uri ' + m.uri);
      reply(ws, m.id, { returnValue: false, errorText: 'unknown uri' });
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
