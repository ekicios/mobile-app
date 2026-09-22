// sendToTV.js — uygulama seviyesi basit API.
// Connect SDK / SSAP detayları WebOSTVService altında gizlenir.
// Bağlantı önce WebOSTV.connect(ip, ...) ile kurulur (Samsung akışı gibi).
import WebOSTV from './WebOSTVService';

const WEB_APP_ID = 'com.myapp.hosted'; // TODO: gerçek hosted app appinfo.json `id` ile aynı olmalı.

let sessionReady = false;

function ensureSession() {
  return new Promise((resolve, reject) => {
    if (sessionReady) return resolve();
    WebOSTV.launchWebApp(WEB_APP_ID, (err) => {
      if (err) return reject(err);
      WebOSTV.connectToApp(WEB_APP_ID, (e) => {
        if (e) return reject(e);
        sessionReady = true;
        resolve();
      });
    });
  });
}

// sendToTV({ type: "OPEN_PAGE", page: "home" })
export async function sendToTV(json) {
  await ensureSession();
  WebOSTV.sendJSON(json);
}

export function resetWebOSSession() {
  sessionReady = false;
}
