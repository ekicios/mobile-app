// WebOSTVService.js — LG webOS SSAP WebSocket client.
// Samsung TVService.js'den bağımsızdır. CommonJS: hem Metro (RN) hem Node testi yükler.
// Referans: ConnectSDK WebOSWebAppSession + hobbyquaker/lgtv2.
//
// Protokol: wss://IP:3001 -> register -> registered(client-key) -> launchWebApp
//           -> connectToApp(fullAppId) -> p2p JSON.

const { buildRegister, buildRequest, buildSubscribe, buildP2P, parseMessage } = require('./webosProtocol');

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
    this.lastSessionId = null; // launchWebApp'in dondurdugu sessionId
    this.nextId = 1;
    this.pending = {};
    this.connectTimer = null;
    this.onStatusChange = () => {};
    this.onMessage = () => {};
  }

  _send(obj) {
    if (this.ws) {
      console.log('[SSAP] >>', JSON.stringify(obj));
      this.ws.send(JSON.stringify(obj));
    }
  }

  _request(uri, payload, onSuccess, onError) {
    const id = this.nextId++;
    this.pending[id] = { onSuccess, onError, once: true };
    this._send(buildRequest(id, uri, payload));
  }

  // Abonelik: onSuccess birden fazla kez cagrilabilir (her push'ta).
  // `once:false` sayesinde basarili yanit sonrasi pending kaydi kalir.
  _subscribe(uri, payload, onSuccess, onError) {
    const id = this.nextId++;
    this.pending[id] = { onSuccess, onError, once: false };
    this._send(buildSubscribe(id, uri, payload));
    return id;
  }

  _settle(id, err, payload) {
    const entry = this.pending[id];
    if (!entry) return false;
    if (entry.once !== false) delete this.pending[id]; // tek seferlikler silinir
    if (err) {
      if (entry.onError) entry.onError(err);
      if (entry.once === false) delete this.pending[id]; // hata sonrasi abonelik kapanir
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
      console.log('[SSAP] <<', typeof data === 'string' ? data : String(data));
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
        // Register reply: TV asks for pairing approval on screen.
        // Shape: {type:"response", id:<registerId>, payload:{pairingType:"PROMPT", returnValue:true}}
        const p = msg.payload || {};
        if (p.pairingType === 'PROMPT' || p.pairingType === 'PIN') {
          console.log('[SSAP] pairing requested:', p.pairingType);
          this._clearConnectTimer(); // kullanici onayi bekleniyor, timeout'u durdur
          this.onStatusChange('PAIRING');
          return;
        }
        if (p.returnValue === false) {
          const err = new Error((p.errorText && (p.errorCode ? p.errorCode + ' ' : '') + p.errorText) || 'request failed');
          err.payload = p;
          if (!this._settle(msg.id, err)) {
            this.onStatusChange('ERROR');
          }
        } else {
          this._settle(msg.id, null, p);
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
    // Once webapp servisini dene; 500 verirse system.launcher/launch'a dus.
    // webOS surumleri arasinda launch yolu farkli olabiliyor.
    const onOk = (payload) => {
      if (payload && payload.sessionId) this.lastSessionId = payload.sessionId;
      if (cb) cb(null, payload);
    };
    this._request(
      'ssap://webapp/launchWebApp',
      { webAppId },
      onOk,
      () => {
        this._request(
          'ssap://system.launcher/launch',
          { id: webAppId },
          onOk,
          (e2) => {
            // son care: system.launcher/launch webAppId ile
            this._request(
              'ssap://system.launcher/launch',
              { webAppId },
              onOk,
              (e3) => { if (cb) cb(e3); }
            );
          }
        );
      }
    );
  }

  // connectToApp bir SUBSCRIPTION'dir; TV app erisilebilir olunca
  // {state:"CONNECTED", appId:<fullAppId>} push eder.
  // Denenecek parametre varyantlari: sessionId, webAppId, appId.
  connectToApp(webAppId, cb, sessionId) {
    if (!this.connected) {
      if (cb) cb(new Error('not connected'));
      return;
    }
    let done = false;
    const variants = [];
    if (sessionId) variants.push({ sessionId });
    variants.push({ webAppId });
    variants.push({ appId: webAppId });

    const tryNext = (i, lastErr) => {
      if (done) return;
      if (i >= variants.length) {
        if (cb) cb(lastErr || new Error('connectToApp failed'));
        return;
      }
      const payload = variants[i];
      console.log('[SSAP] connectToApp try', JSON.stringify(payload));
      // Her varyanti ayri abonelik olarak ac; ilk CONNECTED kazanir.
      this._subscribe(
        'ssap://webapp/connectToApp',
        payload,
        (p) => {
          const state = (p && p.state) || 'unknown';
          if (p && p.state === 'CONNECTED') {
            this.fullAppId = p.appId || webAppId;
            if (!done) { done = true; if (cb) cb(null, p); }
          } else {
            console.log('[SSAP] connectToApp state:', state, 'for', JSON.stringify(payload));
          }
        },
        (err) => { tryNext(i + 1, err); }
      );
    };
    tryNext(0);
  }

  sendJSON(payload, fallbackAppId) {
    if (!this.connected) return;
    const to = this.fullAppId || fallbackAppId;
    if (!payload) return; // boş payload TV tarafında düşer
    // p2p hedef formati netlesene kadar birkac varyant gonder.
    if (to) this._send({ type: 'p2p', to, payload });
    // ayrica `to`suz ve `id`li varyantlar (hangi TV formati kabul ediyor diye)
    this._send({ type: 'p2p', payload });
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
