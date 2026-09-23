// sendToTV.js — uygulama seviyesi basit API.
// Connect SDK / SSAP detayları WebOSTVService altında gizlenir.
// Bağlantı önce WebOSTV.connect(ip, ...) ile kurulur (Samsung akışı gibi).
import WebOSTV from './WebOSTVService';

const WEB_APP_ID = 'com.myapp.hosted'; // TODO: gerçek hosted app appinfo.json `id` ile aynı olmalı.

let sessionReady = false;
let sessionPending = null;

// Connects to the ALREADY-RUNNING hosted webOS app's channel.
// The app is launched by the user on the TV (app icon), so we do NOT call
// webApp or launchWebApp here — connectToApp attaches to the running app.
// Idempotent: concurrent callers share one in-flight handshake.
function ensureSession() {
  if (sessionReady) return Promise.resolve();
  if (sessionPending) return sessionPending;

  sessionPending = new Promise((resolve, reject) => {
    WebOSTV.connectToApp(WEB_APP_ID, (e) => {
      if (e) return reject(e);
      sessionReady = true;
      resolve();
    });
  }).finally(() => {
    sessionPending = null;
  });

  return sessionPending;
}

// sendToTV({ type: "OPEN_PAGE", page: "home" })
export async function sendToTV(json) {
  await ensureSession();
  WebOSTV.sendJSON(json);
}

export function resetWebOSSession() {
  sessionReady = false;
}
