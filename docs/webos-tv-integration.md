# LG webOS Hosted App — Mesaj Dinleme (PoC)

TV tarafında hosted React app, resmi Connect SDK **JavaScript Bridge** ile app channel
kurar ve gelen `p2p` JSON'u `console.log` eder. Mobildeki `sendToTV({type,page})` çağrısı
burada `data.message` olarak görünür.

## 1. connect_bridge.js ekle

Connect SDK JavaScript Bridge'i indir: https://github.com/ConnectSDK/Connect-SDK-JavaScript-Bridge

`dist/connect_bridge.min.js` dosyasını hosted React app'in `public/` klasörüne koy ve
`index.html`'e ekle:

    <script src="/connect_bridge.min.js"></script>

## 2. Message listener (React'te, mount sonrası bir kez)

    window.connectManager = new connectsdk.ConnectManager();

    window.connectManager.on('message', function (data) {
      console.log('[webos] message:', data.message);
    });

    window.connectManager.init();

`data.message` = mobilin gönderdiği JSON object'in birebir aynısı
(ör. `{type:"OPEN_PAGE", page:"home"}`).

## 3. appinfo.json izinleri (zorunlu)

Hosted webOS app'in `appinfo.json` içinde app2app/secondscreen izni olmalı:

    {
      "id": "com.myapp.hosted",
      "type": "web",
      "requiredPermissions": ["app2app"],
      ...
    }

- `id` değeri = mobildeki `WEB_APP_ID` (`WebOSTVService.js` / `sendToTV.js`).
- Bu ID, `launchWebApp` ve `connectToApp` çağrılarında birebir aynı olmalı.

## 4. Kontrol

Mobil `sendToTV({ type: "OPEN_PAGE", page: "home" })` çağırınca, TV'deki geliştirici
konsolunda şunu görmelisin:

    [webos] message: {type: "OPEN_PAGE", page: "home"}

## Notlar / riskler

- JS Bridge platform algılaması `window.PalmServiceBridge` varlığına bakar. Modern
  webOS'ta `webOS.service.request` kullanılır; hosted app WAM (Web App Manager)
  içinde çalıştığı için `PalmServiceBridge` mevcutsa bridge doğrudan çalışır.
- App channel, `luna://com.webos.service.secondscreen.gateway/app2app/createAppChannel`
  ile kurulur. `app2app` izni yoksa channel oluşmaz ve mesaj gelmez.
- `payload` içinde `contentType` adında bir alan kullanma; JS Bridge bunu
  `connectsdk.mediaCommand` sanıp özel işler.
