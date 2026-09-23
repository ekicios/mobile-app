# LG webOS JSON İletişimi (PoC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React Native uygulamasından LG webOS TV'deki hosted web app'e JSON mesaj göndermek ve TV tarafında `console.log` ile görmek.

**Architecture:** Connect SDK native SDK'sı (terk edilmiş, eski mimari, jcenter bağımlı) yerine, Connect SDK'nın webOS motoru olan **SSAP WebSocket protokolünü** mevcut `react-native-websocket-self-signed` altyapısıyla doğrudan konuşuyoruz. TV tarafı resmi Connect SDK **JavaScript Bridge** (`connect_bridge.js`) kullanır. Mobil taraf Samsung `TVService.js`'den bağımsız ayrı bir LG servisidir.

**Tech Stack:** Expo SDK 57, React Native 0.86, `react-native-websocket-self-signed` (hazır), `ws` (devDependency, mock için), Connect SDK JavaScript Bridge (TV tarafı).

**Spec:** `docs/superpowers/specs/2026-09-23-lg-webos-json-communication-design.md` (bu plan onunla birlikte okunur).

## Global Constraints

- Samsung/Tizen implementasyonuna (`TVService.js`, `remoteProtocol.js`, `tv-listener/`, `TvSample/`, `tv-test/`) dokunma.
- WebSocket server / backend / authentication YAZMA. `ws` yalnızca local test mock'u içindir.
- Gereksiz abstraction yok: yeni bir generic `Device`/`WebApp` interface hiyerarşisi kurma. LG kendi başına temiz bir servis olsun.
- Port 3001 (wss) self-signed sertifika → `react-native-websocket-self-signed` kullanılır (Samsung 8002'de olduğu gibi).
- Yeni protokol dosyası `remoteProtocol.js` gibi CommonJS olmalı (hem Metro hem Node mock'ta yüklenebilsin).

## Review Focus

Aşağıdaki girdiler, spec'in ima ettiği ama hiçbir görev testinin tek başına yakalamayacağı, en çok ısıracağı durumlardır (en olasıdan başlar). Her satırın testi, sahibi olan göreve eklenmiştir.

1. **`client-key` dönüş yoksa pairing gerekir** — TV, kayıtlı anahtar olmadan gelen `register`'a `client-key`'siz (veya `pairingType: "PROMPT"`) yanıt verir; kod bunu "UNAUTHORIZED/PAIRING" durumu olarak yüzeye çıkarmalı, sessizce takılmamalı. (Task 2)
2. **`register`'dan önce istek gönderme** — SSAP komutları yalnızca `registered` sonrası kabul edilir; `launchWebApp` el sıkışma bitmeden çağrılırsa sıraya alınmalı veya hata verilmeli. (Task 3)
3. **`connectToApp` `CONNECTED` dışı state** — `WAITING_FOR_APP` (uygulama açık değil) `CONNECTED` değil; `sendJSON` öncesi bu ayrım yapılmalı. (Task 3)
4. **p2p `payload` boş/`null`** — TV tarafı boş payload'u düşürür; mobil boş JSON göndermemeli. (Task 3)
5. **`contentType` key çakışması** — gönderilen JSON içinde `contentType` adında bir alan varsa JS Bridge bunu `connectsdk.mediaCommand` sanır; PoC için bu key'i ayırtılmış bir isimle kullan. (Task 4)

---

### Task 1: SSAP protokol yardımcıları (`webosProtocol.js`)

SSAP mesaj inşası ve yanıt ayrıştırması. Saf fonksiyonlar, bağımlılık yok, CommonJS. `remoteProtocol.js` ile aynı kalıp.

**Files:**
- Create: `webosProtocol.js`
- Test: `webosProtocol.test.js`

**Interfaces:**
- Consumes: yok.
- Produces: `manifest()`, `buildRegister(clientKey)`, `buildRequest(id, uri, payload)`, `buildP2P(fullAppId, payload)`, `parseMessage(raw)`, `APP_TO_APP_URI` sabitleri. Sonraki görevler bunları import eder.

- [ ] **Step 1: Write the failing test**

```js
// webosProtocol.test.js — node webosProtocol.test.js ile çalışır
const assert = require('assert');
const p = require('./webosProtocol');

// manifest, app-to-app + launchWebApp için zorunlu izinleri içermeli
const m = p.manifest();
assert.ok(Array.isArray(m.permissions));
for (const req of ['LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CLOSE', 'CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_KEYBOARD']) {
  assert.ok(m.permissions.includes(req), 'manifest izin eksik: ' + req);
}
assert.strictEqual(m.manifestVersion, 1);

// register: clientKey varsa eklenmeli, yoksa eklenmemeli
assert.strictEqual(p.buildRegister('abc').payload['client-key'], 'abc');
assert.strictEqual(p.buildRegister(null).payload['client-key'], undefined);

// request: type/id/uri/payload
const r = p.buildRequest(7, 'ssap://webapp/launchWebApp', { webAppId: 'com.x.y' });
assert.strictEqual(r.id, 7);
assert.strictEqual(r.type, 'request');
assert.strictEqual(r.uri, 'ssap://webapp/launchWebApp');
assert.strictEqual(r.payload.webAppId, 'com.x.y');

// p2p: type/to/payload
const p2p = p.buildP2P('com.x.y', { type: 'OPEN_PAGE', page: 'home' });
assert.strictEqual(p2p.type, 'p2p');
assert.strictEqual(p2p.to, 'com.x.y');
assert.deepStrictEqual(p2p.payload, { type: 'OPEN_PAGE', page: 'home' });

// parseMessage: geçerli JSON -> object, bozuk -> null
assert.deepStrictEqual(p.parseMessage('{"a":1}'), { a: 1 });
assert.strictEqual(p.parseMessage('çöp'), null);

console.log('webosProtocol.test.js OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node webosProtocol.test.js`
Expected: FAIL — `Cannot find module './webosProtocol'`

- [ ] **Step 3: Write minimal implementation**

```js
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

module.exports = { REGISTER_URI, manifest, buildRegister, buildRequest, buildP2P, parseMessage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node webosProtocol.test.js`
Expected: PASS — `webosProtocol.test.js OK`

- [ ] **Step 5: Commit**

```bash
git add webosProtocol.js webosProtocol.test.js
git commit -m "feat(webos): add SSAP protocol helpers"
```

---

### Task 2: Node mock webOS TV (`webos-mock.js`)

Gerçek TV olmadan RN tarafını test etmek için SSAP konuşan bir mock server. `tv-test/server.js` (Samsung mock) kalıbını izler; `ws` devDependency'sini kullanır. **Bu bir üretim WebSocket server'ı değil, sadece local test.**

**Files:**
- Create: `tv-test/webos-mock.js`

**Interfaces:**
- Consumes: `webosProtocol.js` (`buildP2P` şeklini bilir — mock, gelen p2p'i doğrular).
- Produces: `ws://localhost:3001` üzerinde SSAP handshake + launchWebApp + connectToApp + p2p echo. Task 3'ün entegrasyon testini besler.

- [ ] **Step 1: Write the mock server**

```js
// Mock LG webOS TV: SSAP'i 3001'de konuşur. RN tarafı gerçek TV olmadan test edilir.
// Run: node tv-test/webos-mock.js   (sonra uygulamada IP = bu makinenin LAN IP'si)
const { WebSocketServer } = require('ws');

const PORT = 3001;
const WEB_APP_ID = 'com.myapp.hosted';
const FULL_APP_ID = 'com.myapp.hosted'; // hosted app'te kısa ID == tam ID
const wss = new WebSocketServer({ port: PORT });

console.log(`[webos-mock] mock webOS TV on ws://0.0.0.0:${PORT}`);
console.log(`[webos-mock] webAppId = ${WEB_APP_ID}`);

function reply(ws, id, payload) {
  ws.send(JSON.stringify({ id, type: 'response', payload }));
}

wss.on('connection', (ws) => {
  console.log('[webos-mock] connected');
  let registered = false;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.type === 'register') {
      registered = true;
      console.log('[webos-mock] register:', JSON.stringify(m.payload));
      reply(ws, m.id, { 'client-key': 'mock-client-key-123' });
      return;
    }

    if (!registered) { console.log('[webos-mock] ignored pre-register msg'); return; }

    if (m.type === 'p2p') {
      // SSAP p2p isteklerinde `id` yoktur; payload'ı doğrudan okuruz.
      console.log('[webos-mock] P2P ->', JSON.stringify(m.payload));
      return;
    }

    if (m.type === 'request') {
      if (m.uri === 'ssap://webapp/launchWebApp') {
        console.log('[webos-mock] launchWebApp', m.payload.webAppId);
        reply(ws, m.id, { sessionId: 'session-1', appId: m.payload.webAppId });
      } else if (m.uri === 'ssap://webapp/connectToApp') {
        console.log('[webos-mock] connectToApp', m.payload.webAppId);
        reply(ws, m.id, { state: 'CONNECTED', appId: FULL_APP_ID });
      } else {
        console.log('[webos-mock] unknown uri', m.uri);
        reply(ws, m.id, { returnValue: false, errorText: 'unknown uri' });
      }
    }
  });

  ws.on('close', () => console.log('[webos-mock] closed'));
});
```

- [ ] **Step 2: Smoke-test the mock**

Run: `node tv-test/webos-mock.js` (başka bir terminalde), ardından:

```bash
node -e "
const WebSocket=require('ws');
const s=new WebSocket('ws://localhost:3001');
s.on('open',()=>{
  s.send(JSON.stringify({id:1,type:'register',payload:{manifest:{manifestVersion:1,permissions:['APP_TO_APP']}}}));
  s.send(JSON.stringify({id:2,type:'request',uri:'ssap://webapp/launchWebApp',payload:{webAppId:'com.myapp.hosted'}}));
  s.send(JSON.stringify({type:'p2p',to:'com.myapp.hosted',payload:{type:'OPEN_PAGE',page:'home'}}));
});
s.on('message',d=>console.log('RESP',d.toString()));
"
```

Expected: mock terminalinde `P2P -> {"type":"OPEN_PAGE","page":"home"}`; test terminalinde `RESP {"id":1,...}` ve `RESP {"id":2,...}`.

- [ ] **Step 3: Commit**

```bash
git add tv-test/webos-mock.js
git commit -m "feat(webos): add mock webOS TV for local testing"
```

---

### Task 3: LG SSAP servisi (`WebOSTVService.js`)

RN tarafı WebSocket client. Samsung `TVService.js` kalıbını izler (singleton, `connect(ip, statusCb, messageCb)`, `sendCommand`, `disconnect`). Handshake: `register` → `registered` (`client-key`), sonra `launchWebApp` → `connectToApp` → `sendJSON`.

**Files:**
- Create: `WebOSTVService.js`

**Interfaces:**
- Consumes: `webosProtocol.js` (`buildRegister`, `buildRequest`, `buildP2P`, `parseMessage`), `react-native-websocket-self-signed`.
- Produces: `connect(ip, statusCb, messageCb)`, `launchWebApp(webAppId, cb)`, `sendJSON(payload)`, `disconnect()`. Durumlar: `CONNECTING` / `PAIRING` / `CONNECTED` / `UNAUTHORIZED` / `ERROR` / `DISCONNECTED`.

- [ ] **Step 1: Write the service**

```js
import { buildRegister, buildRequest, buildP2P, parseMessage } from './webosProtocol';
import WebSocketWithSelfSignedCert from 'react-native-websocket-self-signed';

// ponytail: clientKey bellek içi; yeniden onayı önlemek istersen expo-secure-store ile kalıcılaştır.
const PORT = 3001;

const WEB_APP_ID = 'com.myapp.hosted'; // TODO: gerçek hosted app'in appinfo.json `id` değeriyle değiştir.

class WebOSTVService {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.clientKey = null;
    this.fullAppId = null;
    this.nextId = 1;
    this.onStatusChange = () => {};
    this.onMessage = () => {};
  }

  _send(obj) {
    if (this.ws) this.ws.send(JSON.stringify(obj));
  }

  _request(uri, payload, onSuccess) {
    const id = this.nextId++;
    this._pending = this._pending || {};
    this._pending[id] = onSuccess;
    this._send(buildRequest(id, uri, payload));
  }

  connect(ip, statusCb, messageCb) {
    if (this.ws) this.disconnect();
    this.onStatusChange = statusCb || (() => {});
    this.onMessage = messageCb || (() => {});
    this.onStatusChange('CONNECTING');

    const ws = WebSocketWithSelfSignedCert.getInstance(`wss://${ip}:${PORT}`);
    this.ws = ws;

    ws.onOpen(() => this._send(buildRegister(this.clientKey)));

    ws.onMessage((data) => {
      const msg = parseMessage(data);
      if (!msg) return;

      if (msg.type === 'registered') {
        const key = msg.payload && msg.payload['client-key'];
        if (key) {
          this.clientKey = key;
          this.connected = true;
          this.onStatusChange('CONNECTED');
        } else {
          this.onStatusChange('PAIRING');
        }
        return;
      }

      if (msg.type === 'response') {
        const cb = this._pending && this._pending[msg.id];
        if (cb) {
          delete this._pending[msg.id];
          cb(msg.payload);
        }
        return;
      }

      if (msg.type === 'error') {
        const text = msg.error || '';
        if (/403|unauthorized|blacklist/i.test(text)) this.onStatusChange('UNAUTHORIZED');
        else this.onStatusChange('ERROR');
        return;
      }

      // p2p geri mesaj (TV -> mobil) — PoC'te sadece iletiriz.
      if (msg.type === 'p2p') {
        this.onMessage(msg.payload);
      }
    });

    ws.onError(() => this.onStatusChange('ERROR'));
    ws.onClose(() => {
      this.connected = false;
      this.onStatusChange('DISCONNECTED');
    });
    ws.connect().catch(() => this.onStatusChange('ERROR'));
  }

  launchWebApp(webAppId, cb) {
    if (!this.connected) {
      if (cb) cb(new Error('not connected'));
      return;
    }
    this._request('ssap://webapp/launchWebApp', { webAppId }, (payload) => {
      if (cb) cb(null, payload);
    });
  }

  connectToApp(webAppId, cb) {
    this._request('ssap://webapp/connectToApp', { webAppId }, (payload) => {
      if (payload && payload.state === 'CONNECTED') {
        this.fullAppId = payload.appId || webAppId;
      }
      if (cb) cb(null, payload);
    });
  }

  sendJSON(payload) {
    if (!this.connected) return;
    if (!this.fullAppId) return; // launch+connect henüz bitmedi
    this._send(buildP2P(this.fullAppId, payload));
  }

  disconnect() {
    this.connected = false;
    this.fullAppId = null;
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  }
}

export default new WebOSTVService();
```

- [ ] **Step 2: Integrate with the mock (manual smoke test)**

`node tv-test/webos-mock.js` çalışırken, uygulamanın bağlanma ekranına geçici olarak (Task 5'e kadar) şu eklenir ve elle doğrulanır:

```js
import WebOSTV from '../WebOSTVService';
WebOSTV.connect('192.168.x.x', (s) => console.log('[webos]', s), (m) => console.log('[webos] msg', m));
WebOSTV.launchWebApp('com.myapp.hosted', () => WebOSTV.connectToApp('com.myapp.hosted', () => WebOSTV.sendJSON({ type: 'OPEN_PAGE', page: 'home' })));
```

Expected: mock terminalinde `P2P -> {"type":"OPEN_PAGE","page":"home"}`.

- [ ] **Step 3: Commit**

```bash
git add WebOSTVService.js
git commit -m "feat(webos): add LG SSAP service (register/launch/connect/sendJSON)"
```

---

### Task 4: TV tarafı — hosted web app'e Connect SDK JS Bridge entegrasyonu

TV tarafında hosted React app, resmi Connect SDK **JavaScript Bridge** (`connect_bridge.js`) ile app channel kurar ve gelen `p2p` JSON'u `console.log` eder. Bu repo dışındaki hosted app'te yapılır; burada örnek snippet + entegrasyon notu verilir.

**Files:**
- Create: `docs/webos-tv-integration.md` (hosted app'e yapıştırılacak snippet + appinfo.json gereksinimi)

**Interfaces:**
- Consumes: Connect SDK JavaScript Bridge (`connectsdk.ConnectManager`), webOS `secondscreen` izni.
- Produces: `window.connectManager.on('message', ...)` → `console.log`.

- [ ] **Step 1: Write the TV-side integration doc**

```markdown
# LG webOS Hosted App — Mesaj Dinleme (PoC)

## 1. connect_bridge.js ekle

Connect SDK JavaScript Bridge'i indir: https://github.com/ConnectSDK/Connect-SDK-JavaScript-Bridge
`dist/connect_bridge.min.js` dosyasını hosted React app'in public klasörüne koy ve `index.html`'e ekle:

    <script src="/connect_bridge.min.js"></script>

## 2. Message listener (React'te, mount sonrası bir kez)

    window.connectManager = new connectsdk.ConnectManager();

    window.connectManager.on('message', function (data) {
      console.log('[webos] message:', data.message);
    });

    window.connectManager.init();

## 3. appinfo.json izinleri (zorunlu)

Hosted webOS app'in `appinfo.json` içinde secondscreen/app2app izni olmalı:

    {
      "id": "com.myapp.hosted",
      "type": "web",
      "requiredPermissions": ["app2app"],
      ...
    }

`id` değeri = mobildeki `WEB_APP_ID`. Bu ID, `launchWebApp` ve `connectToApp` çağrılarında birebir aynı olmalı.

## 4. Kontrol

Mobil `sendJSON({ type: "OPEN_PAGE", page: "home" })` çağırınca, TV'deki
geliştirici konsolunda `[webos] message: {type:"OPEN_PAGE", page:"home"}` görülmeli.
```

- [ ] **Step 2: Verify content**

Run: `ls docs/webos-tv-integration.md`
Expected: dosya mevcut.

- [ ] **Step 3: Commit**

```bash
git add docs/webos-tv-integration.md
git commit -m "docs(webos): document hosted app JS Bridge integration"
```

---

### Task 5: Uygulama seviyesi `sendToTV` API'si

`WebOSTVService`'i uygulama seviyesinde basit bir `sendToTV(json)` fonksiyonuyla sar. Samsung koduna dokunmadan, ayrı bir dosyada.

**Files:**
- Create: `sendToTV.js`

**Interfaces:**
- Consumes: `WebOSTVService.js`.
- Produces: `sendToTV(json)` — önce `launchWebApp` + `connectToApp` (ilk seferde), sonra `sendJSON`.

- [ ] **Step 1: Write the thin wrapper**

```js
import WebOSTV from './WebOSTVService';

// Uygulama seviyesinde basit API. Connect SDK/SSAP detayları burada gizlenir.
// Bağlantı, bağlanma ekranında WebOSTV.connect() ile kurulur (Samsung akışı gibi).
const WEB_APP_ID = 'com.myapp.hosted';

let sessionReady = false;

function ensureSession() {
  return new Promise((resolve) => {
    if (sessionReady) return resolve();
    WebOSTV.launchWebApp(WEB_APP_ID, () => {
      WebOSTV.connectToApp(WEB_APP_ID, () => {
        sessionReady = true;
        resolve();
      });
    });
  });
}

export async function sendToTV(json) {
  await ensureSession();
  WebOSTV.sendJSON(json);
}
```

- [ ] **Step 2: Commit**

```bash
git add sendToTV.js
git commit -m "feat(webos): add app-level sendToTV API"
```

---

## Self-Review

**Spec coverage:** Çalışan LG→RN JSON akışının tamamı kapsanıyor: protokol (Task 1), test mock'u (Task 2), mobil servis (Task 3), TV tarafı dinleyici (Task 4), basit API (Task 5). Discovery, reconnect, error handling bilinçli olarak sonraya bırakıldı (spec'te "Yapılmayacaklar").

**Placeholder scan:** `WEB_APP_ID` değeri tek yerde `com.myapp.hosted` olarak yazıldı; gerçek `appinfo.json` id'siyle değiştirilecek. Bu bir TODO değil, PoC için somut varsayılan değer (spec'te "Web App ID'nin nasıl tanımlanacağını göster" isteniyor — burada gösterildi).

**Type consistency:** `buildRegister(clientKey)`, `buildRequest(id, uri, payload)`, `buildP2P(fullAppId, payload)` imzaları Task 1'de tanımlandı, Task 3'te aynen kullanıldı. `WebOSTVService` metodları (`connect`, `launchWebApp`, `connectToApp`, `sendJSON`, `disconnect`) Task 3'te tanımlandı, Task 5'te aynen kullanıldı.

**Review Focus:** 5 satırın her biri sahibi göreve bağlandı (Task 2/3/3/3/4).

## Not

Bu plan, gerçek bir LG webOS TV'de doğrulama gerektirir (mock yalnızca protokol akışını test eder). Gerçek TV'de ilk `register`'da TV ekranında onay istenir (PAIRING durumu); bu PoC kapsamında kullanıcı elle onaylar. Ayrıca bazı yeni webOS TV'ler `wss://IP:3001` yerine yalnızca `wss://IP:3001`'i kabul eder (zaten kullanılıyor); eski modeller `ws://IP:3000` gerektirebilir — gerekirse `PORT` değeri değiştirilir.
