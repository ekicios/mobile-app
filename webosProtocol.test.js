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
