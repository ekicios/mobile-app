// webosProtocol.js — SSAP (webOS Simple Service Access Protocol) yardımcıları.
// CommonJS: hem Metro (RN) hem Node mock'ta yüklenebilir.
// Referans: ConnectSDK WebOSTVServiceSocketClient + hobbyquaker/lgtv2 pairing.json.

const REGISTER_URI = 'ssap://com.webos.service.secondscreen.gateway/app2app/register';

// ponytail: tek kopya manifest; yeni izin gerekirse buraya ekle.
function manifest() {
  return {
    manifestVersion: 1,
    appVersion: '1.0',
    permissions: [
      'LAUNCH',
      'LAUNCH_WEBAPP',
      'APP_TO_APP',
      'CLOSE',
      'CONTROL_INPUT_TEXT',
      'CONTROL_MOUSE_AND_KEYBOARD',
    ],
  };
}

function buildRegister(clientKey) {
  const payload = { manifest: manifest() };
  if (clientKey) payload['client-key'] = clientKey;
  return { type: 'register', payload };
}

function buildRequest(id, uri, payload) {
  return { id, type: 'request', uri, payload };
}

// subscription isteği. TV, abone olduğun kaynağı her güncellediğinde
// aynı id ile yeni "response" mesajları gönderir.
function buildSubscribe(id, uri, payload) {
  return { id, type: 'subscribe', uri, payload };
}

// p2p app-to-app mesajı. `to` = connectToApp'tan dönen fullAppId.
function buildP2P(fullAppId, payload) {
  return { type: 'p2p', to: fullAppId, payload };
}

function parseMessage(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { REGISTER_URI, manifest, buildRegister, buildRequest, buildSubscribe, buildP2P, parseMessage };
