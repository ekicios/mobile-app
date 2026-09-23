// WebOSTVService.failures.test.js — node WebOSTVService.failures.test.js
// Review Focus'taki hata modlarını doğrular: pairing, pre-register istek,
// CONNECTED dışı state, boş payload, error yanıtı, returnValue:false, connect timeout.
const assert = require('assert');
const { createMockServer } = require('./tv-test/webos-mock');
const { wsAdapter } = require('./tv-test/ws-adapter');
const { WebOSTVService } = require('./WebOSTVService');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (server) => new Promise((r) => server.on('listening', r));

async function withMock(opts, fn) {
  const logs = [];
  const server = createMockServer({ ...opts, log: (l) => logs.push(l) });
  await listen(server);
  try {
    return await fn(logs);
  } finally {
    server.close();
  }
}

(async () => {
  // 1) pairingRequired: client-key yok -> PAIRING, CONNECTED değil
  await withMock({ port: 3003, pairingRequired: true }, async () => {
    const svc = new WebOSTVService(wsAdapter);
    const statuses = [];
    svc.connect('ws://localhost:3003', (s) => statuses.push(s));
    await wait(250);
    assert.ok(statuses.includes('PAIRING'), 'PAIRING beklenir');
    assert.ok(!statuses.includes('CONNECTED'), 'CONNECTED OLMAMALI');
    svc.disconnect();
  });

  // 2) bağlı değilken launchWebApp -> hata callback'i
  await withMock({ port: 3004 }, async () => {
    const svc = new WebOSTVService(wsAdapter);
    let err = null;
    svc.launchWebApp('com.myapp.hosted', (e) => { err = e; });
    assert.ok(err instanceof Error, 'bağlı değilken hata dönmeli');
    svc.disconnect();
  });

  // 3) connectToApp WAITING_FOR_APP -> hata, fullAppId null
  await withMock({ port: 3005, connectState: 'WAITING_FOR_APP' }, async () => {
    const svc = new WebOSTVService(wsAdapter);
    svc.connect('ws://localhost:3005');
    await wait(200);
    let err = null;
    svc.connectToApp('com.myapp.hosted', (e) => { err = e; });
    await wait(150);
    assert.ok(err instanceof Error, 'CONNECTED dışı state hata dönmeli');
    assert.strictEqual(svc.fullAppId, null, 'fullAppId set edilmemeli');
    svc.disconnect();
  });

  // 4) boş payload -> p2p gönderilmez
  await withMock({ port: 3006 }, async (logs) => {
    const svc = new WebOSTVService(wsAdapter);
    svc.connect('ws://localhost:3006');
    await wait(200);
    svc.connectToApp('com.myapp.hosted');
    await wait(150);
    svc.sendJSON(null);
    await wait(100);
    assert.ok(!logs.some((l) => l.includes('P2P ->')), 'boş payload gönderilmemeli');
    svc.disconnect();
  });

  // 5) type:"error" yanıtı -> pending callback hata alır (asılı kalmaz)
  await withMock({ port: 3007, errorOnLaunch: true }, async () => {
    const svc = new WebOSTVService(wsAdapter);
    svc.connect('ws://localhost:3007');
    await wait(200);
    let err = null;
    let done = false;
    svc.launchWebApp('com.myapp.hosted', (e) => { err = e; done = true; });
    await wait(200);
    assert.ok(done, 'error yanıtında callback çağrılmalı (asılı kalmamalı)');
    assert.ok(err instanceof Error, 'hata dönmeli');
    svc.disconnect();
  });

  // 6) returnValue:false -> pending callback hata alır
  await withMock({ port: 3008, failLaunch: true }, async () => {
    const svc = new WebOSTVService(wsAdapter);
    svc.connect('ws://localhost:3008');
    await wait(200);
    let err = null;
    svc.launchWebApp('com.myapp.hosted', (e) => { err = e; });
    await wait(200);
    assert.ok(err instanceof Error, 'returnValue:false hata dönmeli');
    svc.disconnect();
  });

  // 7) register cevapsız -> connect timeout -> ERROR
  await withMock({ port: 3009, silentRegister: true }, async () => {
    const svc = new WebOSTVService(wsAdapter, { connectTimeoutMs: 200 });
    const statuses = [];
    svc.connect('ws://localhost:3009', (s) => statuses.push(s));
    await wait(450);
    assert.ok(statuses.includes('ERROR'), 'timeout sonrası ERROR beklenir');
    svc.disconnect();
  });

  console.log('WebOSTVService.failures.test.js OK');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
