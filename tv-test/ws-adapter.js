// Test yardımcısı: react-native-websocket-self-signed ile aynı arayüzü `ws` ile sağlar.
// onOpen/onMessage/onError/onClose/connect/send/close
const WebSocket = require('ws');

function wsAdapter(url) {
  const sock = new WebSocket(url);
  const handlers = { open: [], message: [], error: [], close: [] };
  sock.on('open', () => handlers.open.forEach((f) => f()));
  sock.on('message', (d) => handlers.message.forEach((f) => f(d.toString())));
  sock.on('error', (e) => handlers.error.forEach((f) => f(e)));
  sock.on('close', () => handlers.close.forEach((f) => f()));
  return {
    onOpen: (f) => handlers.open.push(f),
    onMessage: (f) => handlers.message.push(f),
    onError: (f) => handlers.error.push(f),
    onClose: (f) => handlers.close.push(f),
    connect: () => Promise.resolve(),
    send: (s) => sock.send(s),
    close: () => sock.close(),
  };
}

module.exports = { wsAdapter };
