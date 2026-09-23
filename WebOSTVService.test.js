// WebOSTVService.test.js — node WebOSTVService.test.js
// Mock webOS TV'ye karşı SSAP el sıkışma + launch/connect/sendJSON akışını doğrular.
// Servise `ws` tabanlı bir socket adapter enjekte edilir (RN'de self-signed WS kullanılır).
const assert = require('assert');
const { createMockServer } = require('./tv-test/webos-mock');
const { wsAdapter } = require('./tv-test/ws-adapter');
const { WebOSTVService } = require('./WebOSTVService');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const logs = [];
  const server = createMockServer({ port: 3002, log: (l) => logs.push(l) });
  await new Promise((r) => server.on('listening', r));

  const svc = new WebOSTVService(wsAdapter);
  const statuses = [];
  const inbound = [];

  svc.connect('ws://localhost:3002', (s) => statuses.push(s), (m) => inbound.push(m));

  await wait(300);
  assert.ok(statuses.includes('CONNECTING'), 'CONNECTING beklenir');
  assert.ok(statuses.includes('CONNECTED'), 'CONNECTED beklenir (client-key alındı)');

  // launchWebApp
  let launched = null;
  svc.launchWebApp('com.myapp.hosted', (err, res) => { launched = res; });
  await wait(150);
  assert.ok(launched && launched.sessionId, 'launchWebApp response beklenir');

  // connectToApp -> fullAppId
  let connected = null;
  svc.connectToApp('com.myapp.hosted', (err, res) => { connected = res; });
  await wait(150);
  assert.strictEqual(connected.state, 'CONNECTED');
  assert.strictEqual(svc.fullAppId, 'com.myapp.hosted');

  // sendJSON -> mock p2p almalı
  svc.sendJSON({ type: 'OPEN_PAGE', page: 'home' });
  await wait(150);
  assert.ok(
    logs.some((l) => l.includes('P2P -> {"type":"OPEN_PAGE","page":"home"}')),
    'mock p2p mesajını almalı'
  );

  // TV -> mobil geri mesaj (inbound p2p)
  await wait(150);
  assert.ok(
    inbound.some((m) => m && m.ack === true),
    'mobil TV geri mesajını almalı (p2p inbound)'
  );

  svc.disconnect();

  server.close();
  console.log('WebOSTVService.test.js OK');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
