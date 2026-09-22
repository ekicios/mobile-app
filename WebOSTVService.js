// WebOSTVService.js — LG webOS SSAP WebSocket client.
// Samsung TVService.js'den bağımsızdır. CommonJS: hem Metro (RN) hem Node testi yükler.
// Referans: ConnectSDK WebOSWebAppSession + hobbyquaker/lgtv2.
//
// Protokol: wss://IP:3001 -> register -> registered(client-key) -> launchWebApp
//           -> connectToApp(fullAppId) -> p2p JSON.

const { buildRegister, buildRequest, buildP2P, parseMessage } = require('./webosProtocol');

const DEFAULT_PORT = 3001;
const CONNECT_TIMEOUT_MS = 10000;

// Varsayılan transport: RN'de self-signed TLS WebSocket. Node testinde factory enjekte edilir.
function defaultSocketFactory(url) {
  const mod = require('react-native-websocket-self-signed');
  const WS = mod && mod.default ? mod.default : mod;
  return WS.getInstance(url);
}

function toUrl(hostOrUrl) {
  if (hostOrUrl.includes('://')) return hostOrUrl;
  return `wss://${hostOrUrl}:${DEFAULT_PORT}`;
}

class WebOSTVService {
  constructor(socketFactory, options = {}) {
    this.socketFactory = socketFactory || defaultSocketFactory;
    this.connectTimeoutMs = options.connectTimeoutMs || CONNECT_TIMEOUT_MS;
    this.ws = null;
    this.connected = false;
    this.gotRegistered = false;
    this.clientKey = null;
    this.fullAppId = null;
    this.nextId = 1;
    this.pending = {};
    this.connectTimer = null;
    this.onStatusChange = () => {};
    this.onMessage = () => {};
  }

  _send(obj) {
    if (this.ws) this.ws.send(JSON.stringify(obj));
  }

  _request(uri, payload, onSuccess, onError) {
    const id = this.nextId++;
    this.pending[id] = { onSuccess, onError };
    this._send(buildRequest(id, uri, payload));
  }

  _settle(id, err, payload) {
    const entry = this.pending[id];
    if (!entry) return false;
    delete this.pending[id];
    if (err) {
      if (entry.onError) entry.onError(err);
    } else if (entry.onSuccess) {
      entry.onSuccess(payload);
    }
    return true;
  }

  _failAllPending(reason) {
    const ids = Object.keys(this.pending);
    for (const id of ids) this._settle(id, new Error(reason));
  }

  _clearConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  connect(hostOrUrl, statusCb, messageCb) {
    if (this.ws) this.disconnect();
    this.onStatusChange = statusCb || (() => {});
    this.onMessage = messageCb || (() => {});
    this.gotRegistered = false;
    this.onStatusChange('CONNECTING');

    const ws = this.socketFactory(toUrl(hostOrUrl));
    this.ws = ws;

    this.connectTimer = setTimeout(() => {
      if (!this.gotRegistered) {
        this.onStatusChange('ERROR');
        this.disconnect();
      }
    }, this.connectTimeoutMs);

    ws.onOpen(() => this._send({ id: this.nextId++, ...buildRegister(this.clientKey) }));

    ws.onMessage((data) => {
      const msg = parseMessage(data);
      if (!msg) return;

      if (msg.type === 'registered') {
        this.gotRegistered = true;
        this._clearConnectTimer();
        const key = msg.payload && msg.payload['client-key'];
        if (key) {
          this.clientKey = key;
          this.connected = true;
          this.onStatusChange('CONNECTED');
        } else {
          // TV onayı bekleniyor (ekranda PROMPT); kullanıcı onaylayınca
          // TV client-key ile ikinci bir "registered" gönderir.
          this.onStatusChange('PAIRING');
        }
        return;
      }

      if (msg.type === 'response') {
        if (msg.payload && msg.payload.returnValue === false) {
          const err = new Error(msg.payload.errorText || 'request failed');
          if (!this._settle(msg.id, err)) {
            this.onStatusChange('ERROR');
          }
        } else {
          this._settle(msg.id, null, msg.payload);
        }
        return;
      }

      if (msg.type === 'error') {
        const text = msg.error || 'unknown error';
        // İlgili bir istek varsa onu düşür; yoksa genel durum hatası.
        if (!this._settle(msg.id, new Error(text))) {
          if (/403|unauthorized|blacklist/i.test(text)) this.onStatusChange('UNAUTHORIZED');
          else this.onStatusChange('ERROR');
        }
        return;
      }

      // p2p geri mesaj (TV -> mobil).
      if (msg.type === 'p2p') {
        this.onMessage(msg.payload);
      }
    });

    ws.onError(() => {
      this._clearConnectTimer();
      this.onStatusChange('ERROR');
    });
    ws.onClose(() => {
      this._clearConnectTimer();
      this.connected = false;
      this._failAllPending('connection closed');
      this.onStatusChange('DISCONNECTED');
    });

    const p = ws.connect();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        this._clearConnectTimer();
        this.onStatusChange('ERROR');
      });
    }
  }

  launchWebApp(webAppId, cb) {
    if (!this.connected) {
      if (cb) cb(new Error('not connected'));
      return;
    }
    this._request(
      'ssap://webapp/launchWebApp',
      { webAppId },
      (payload) => { if (cb) cb(null, payload); },
      (err) => { if (cb) cb(err); }
    );
  }

  connectToApp(webAppId, cb) {
    if (!this.connected) {
      if (cb) cb(new Error('not connected'));
      return;
    }
    this._request(
      'ssap://webapp/connectToApp',
      { webAppId },
      (payload) => {
        if (payload && payload.state === 'CONNECTED') {
          this.fullAppId = payload.appId || webAppId;
          if (cb) cb(null, payload);
        } else {
          // WAITING_FOR_APP vb. — uygulama hazır değil.
          const state = (payload && payload.state) || 'unknown';
          if (cb) cb(new Error('web app not connected: ' + state));
        }
      },
      (err) => { if (cb) cb(err); }
    );
  }

  sendJSON(payload) {
    if (!this.connected) return;
    if (!this.fullAppId) return; // launch+connect henüz bitmedi
    if (!payload) return; // boş payload TV tarafında düşer
    this._send(buildP2P(this.fullAppId, payload));
  }

  disconnect() {
    this._clearConnectTimer();
    this.connected = false;
    this.fullAppId = null;
    this._failAllPending('disconnected');
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  }
}

// Varsayılan export = paylaşılan singleton (Samsung TVService.js kalıbı).
// Sınıf da named export olarak verilir (testte taze instance için).
const instance = new WebOSTVService();
module.exports = instance;
module.exports.WebOSTVService = WebOSTVService;
module.exports.default = instance;
