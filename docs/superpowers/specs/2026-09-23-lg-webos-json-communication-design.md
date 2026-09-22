# LG webOS JSON İletişimi — Design

## Amaç

React Native mobil uygulamadan LG webOS TV'de çalışan **hosted web app**'e JSON mesaj göndermek; TV tarafında bu mesajı `console.log` ile görmek. İlk hedef çalışan bir PoC.

## Bağlam

- Mobil uygulama: Expo SDK 57 / RN 0.86.3 (managed workflow).
- Mevcut TV iletişimi Samsung/Tizen üzerine kurulu: `TVService.js` (WebSocket client), `remoteProtocol.js` (MSF protokolü, port 8002), `discoverTVs.js` (SSDP), `tv-listener/` + `TvSample/` (TV tarafı), `tv-test/` (Node mock).
- Hazır bağımlılıklar: `react-native-websocket-self-signed` (self-signed TLS WebSocket), `react-native-udp` (SSDP), `ws` (devDependency).
- TV ile mobil aynı local network'te.
- LG webOS uygulaması hosted app: IPK içindeki HTML yalnızca `location.href = "https://myapp.example.com"` yapar; gerçek uygulama React.
- Backend / kendi WebSocket server kurulmayacak.

## Karar: Connect SDK nasıl kullanılır

`connectsdk-react-native` npm'den **yayından kaldırılmış** (2023-12-03), **eski mimari** (RN 0.70, `NativeModules`), Android tarafı **jcenter** kullanıyor (kapalı), iOS tarafı `ConnectSDK-Lite`/`EventEmitter` podlarına bağımlı (2014 dönemi). Expo 57 / RN 0.86 New Architecture'ta derlenmesi büyük risk ve fork + modernize gerektirir.

Bu yüzden:

- **Mobil taraf:** Connect SDK native SDK'sını kurmak yerine, Connect SDK'nın webOS motoru olan **SSAP WebSocket protokolünü** (`wss://IP:3001`) mevcut `react-native-websocket-self-signed` altyapısıyla doğrudan konuşuruz. Native dependency yok, prebuild yok, jcenter sorunu yok.
- **TV taraf:** Resmi Connect SDK **JavaScript Bridge** (`connect_bridge.js` → `connectsdk.ConnectManager`) kullanılır. Pure JS; hosted web app'te sorunsuz çalışır. Bu, "Connect SDK on TV" gereksinimini karşılar.

Bu tercih, kullanıcının istediği `sendToTV({type, page})` API'sinin altında gizlenir; API şekli değişmez.

## SSAP Protokolü (doğrulanmış)

Kaynaklar: `ConnectSDK/Connect-SDK-Android-Core` (`WebOSTVServiceSocketClient`, `WebOSWebAppSession`), `hobbyquaker/lgtv2`.

Bağlantı: `wss://IP:3001` (self-signed TLS). Eski TV'ler `ws://IP:3000`.

El sıkışma ve akış:

1. `register` → `{type:"register", payload:{manifest:{manifestVersion:1, permissions:[...]}, "client-key":?}}`
2. TV yanıtı `registered` → `payload["client-key"]` (yoksa pairing/onay gerekir).
3. Komut: `{id, type:"request", uri:"ssap://webapp/launchWebApp", payload:{webAppId}}` → `{id, type:"response", payload:{sessionId, appId}}`
4. `{id, type:"request", uri:"ssap://webapp/connectToApp", payload:{webAppId}}` → `{state:"CONNECTED", appId:<fullAppId>}`
5. Mesaj: `{type:"p2p", to:<fullAppId>, payload:<json>}`

TV tarafı JS Bridge, `luna://com.webos.service.secondscreen.gateway/app2app/createAppChannel` (veya `PalmServiceBridge`) ile app channel kurar; gelen `p2p` mesajını `message` event'i olarak yayınlar.

## Web App ID

Web App ID = hosted webOS app'in `appinfo.json` içindeki `id` alanı (ör. `com.myapp.hosted`). Aynı değer:

- mobilde `launchWebApp(webAppId)` ve `connectToApp(webAppId)` çağrılarında,
- `p2p` mesajının `to` alanında (fullAppId) kullanılır.

PoC'te varsayılan `com.myapp.hosted`; gerçek app id ile değiştirilir.

## Mimari

Samsung implementasyonundan tamamen bağımsız, ayrı dosyalar:

- `webosProtocol.js` — SSAP mesaj inşası/ayrıştırma (saf, CommonJS)
- `WebOSTVService.js` — SSAP WebSocket client (singleton, `TVService.js` kalıbı)
- `sendToTV.js` — uygulama seviyesi ince API
- `tv-test/webos-mock.js` — local test mock'u

Samsung dosyalarına dokunulmaz.

## Kapsam dışı (ilk aşama)

WebSocket server, backend, authentication, state management, büyük refactor, Samsung'a müdahale, discovery/reconnect/error-handling prod abstraction'ı.

## Başarı kriteri

Mobil `sendToTV({type:"OPEN_PAGE", page:"home"})` çağırınca TV'deki hosted app konsolunda aynı JSON görülür. TV→mobil geri mesaj mümkündür (`p2p` üzerinden), ancak ilk PoC önüne geçmez.
