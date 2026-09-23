// sendToTV.js — uygulama seviyesi basit API.
// Connect SDK / SSAP detayları WebOSTVService altında gizlenir.
// Bağlantı önce WebOSTV.connect(ip, ...) ile kurulur (Samsung akışı gibi).
import WebOSTV from './WebOSTVService';

const WEB_APP_ID = 'com.myapp.hosted'; // TODO: gerçek hosted app appinfo.json `id` ile aynı olmalı.

let sessionReady = false;
let sessionPending = null;

// Brings the hosted webOS app to the foreground and connects to its channel.
// Order: launchWebApp -> connectToApp -> p2p.
// Idempotent: concurrent callers share one in-flight handshake.
function ensureSession() {
  if (sessionReady) return Promise.resolve();
  if (sessionPending) return sessionPending;

  sessionPending = new Promise((resolve) => {
    console.log('[session] launchWebApp', WEB_APP_ID);
    // launchWebApp'i dene ama basarisiz olsa da devam et (app elle acik olabilir).
    WebOSTV.launchWebApp(WEB_APP_ID, (launchErr, launchRes) => {
      if (launchErr) console.log('[session] launchWebApp err (ignored):', launchErr.message);
      else console.log('[session] launchWebApp ok:', JSON.stringify(launchRes));

      console.log('[session] connectToApp (subscribe)', WEB_APP_ID);
      let settled = false;
      const finish = (why) => {
        if (settled) return;
        settled = true;
        console.log('[session] connectToApp', why);
        sessionReady = true;
        resolve();
      };

      WebOSTV.connectToApp(WEB_APP_ID, (e, res) => {
        if (e) console.log('[session] connectToApp err:', e.message);
        else console.log('[session] connectToApp ok:', JSON.stringify(res));
        finish(e ? 'settled after error' : 'CONNECTED');
      }, WebOSTV.lastSessionId);

      // CONNECTED push'u gecikebilir; p2p'yi denemek icin makul bir sure sonra devam et.
      setTimeout(() => finish('timeout (continuing anyway)'), 3000);
    });
  }).finally(() => {
    sessionPending = null;
  });

  return sessionPending;
}

// sendToTV({ type: "OPEN_PAGE", page: "home" })
export async function sendToTV(json) {
  await ensureSession();
  // fullAppId connectToApp'ten gelmediyse dogrudan WEB_APP_ID'ye gonder.
  WebOSTV.sendJSON(json, WEB_APP_ID);
}

export function resetWebOSSession() {
  sessionReady = false;
}
