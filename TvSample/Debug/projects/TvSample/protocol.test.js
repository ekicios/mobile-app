// Run: node tv-test/protocol.test.js
const assert = require('node:assert');
const { toBase64, connectUrl, buildCommand, parseMessage } = require('../remoteProtocol');

assert.strictEqual(toBase64('RN Remote'), 'Uk4gUmVtb3Rl');
assert.strictEqual(toBase64('a'), 'YQ==');
assert.strictEqual(toBase64('ab'), 'YWI=');
assert.strictEqual(toBase64('ağ'), 'YcSf'); // UTF-8, not latin1

assert.deepStrictEqual(buildCommand('UP').params.DataOfCmd, 'KEY_UP');
assert.deepStrictEqual(buildCommand('OK').params.DataOfCmd, 'KEY_ENTER');
assert.strictEqual(buildCommand('NOPE'), null);
assert.strictEqual(buildCommand('TEXT', 'hi').params.TypeOfRemote, 'SendInputString');

assert.ok(connectUrl('10.0.0.5', 8001, '').startsWith('ws://10.0.0.5:8001/api/v2/channels/samsung.remote.control?name='));
assert.ok(connectUrl('10.0.0.5', 8001, 'tok').endsWith('&token=tok'));

assert.strictEqual(parseMessage('{bad'), null);
assert.strictEqual(parseMessage('{"event":"ms.channel.connect"}').event, 'ms.channel.connect');

console.log('protocol checks passed');
