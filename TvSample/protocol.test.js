// Run: node tv-test/protocol.test.js
const assert = require('node:assert');
const { toBase64, connectUrl, buildCommands, parseMessage } = require('../remoteProtocol');

assert.strictEqual(toBase64('RN Remote'), 'Uk4gUmVtb3Rl');
assert.strictEqual(toBase64('a'), 'YQ==');
assert.strictEqual(toBase64('ab'), 'YWI=');
assert.strictEqual(toBase64('ağ'), 'YcSf'); // UTF-8, not latin1

assert.strictEqual(buildCommands('UP')[0].method, 'ms.channel.emit');
assert.strictEqual(buildCommands('UP')[0].params.event, 'say');
assert.strictEqual(buildCommands('UP')[0].params.to, 'host');
assert.deepStrictEqual(JSON.parse(buildCommands('UP')[0].params.data), { type: 'key', value: 'UP' });
assert.strictEqual(buildCommands('NOPE').length, 0);
assert.deepStrictEqual(JSON.parse(buildCommands('TEXT', 'hi')[0].params.data), { type: 'text', value: 'hi' });

assert.ok(connectUrl('10.0.0.5', 8001, '').startsWith('ws://10.0.0.5:8001/api/v2/channels/com.samsung.multiscreen.rnremote?name='));
assert.ok(connectUrl('10.0.0.5', 8002, '').startsWith('wss://10.0.0.5:8002/api/v2/channels/com.samsung.multiscreen.rnremote?name='));
assert.ok(connectUrl('10.0.0.5', 8001, 'tok').endsWith('&token=tok'));

assert.strictEqual(parseMessage('{bad'), null);
assert.strictEqual(parseMessage('{"event":"ms.channel.connect"}').event, 'ms.channel.connect');

console.log('protocol checks passed');
