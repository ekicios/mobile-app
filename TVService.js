import { connectUrl, buildCommand, parseMessage } from './remoteProtocol';
import WebSocketWithSelfSignedCert from 'react-native-websocket-self-signed';

// ponytail: 8002/wss only (this TV rejects 8001 with ms.channel.unauthorized).
// The TV cert is self-signed, so we use a WS client that skips TLS validation.
const PORT = 8002;
const CONNECT_TIMEOUT_MS = 10000;

// Public shape kept identical to before: connect(ip, statusCb, messageCb),
// sendCommand({ action, payload }), disconnect().
class TVService {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.token = '';
    this.onStatusChange = () => {};
    this.onMessage = () => {};
    this.connectTimer = null;
  }

  connect(ip, statusCb, messageCb) {
    if (this.ws) this.disconnect();
    this.onStatusChange = statusCb || (() => {});
    this.onMessage = messageCb || (() => {});
    this.onStatusChange('CONNECTING');

    // ponytail: token is memory-only; persist (expo-secure-store) if re-approving on every launch annoys.
    const url = connectUrl(ip, PORT, this.token);
    console.log('[TVService] connecting:', url);

    const ws = WebSocketWithSelfSignedCert.getInstance(url);
    this.ws = ws;

    this.connectTimer = setTimeout(() => {
      if (!this.connected) {
        this.onStatusChange('ERROR');
        this.disconnect();
      }
    }, CONNECT_TIMEOUT_MS);

    ws.onOpen(() => console.log('[TVService] socket open'));

    ws.onMessage((data) => {
      console.log('[TVService] message:', data);
      const msg = parseMessage(data);
      if (!msg) return;
      if (msg.event === 'ms.channel.unauthorized' || msg.event === 'ms.service.unauthorized') {
        clearTimeout(this.connectTimer);
        this.onStatusChange('UNAUTHORIZED');
      } else if (msg.event === 'ms.channel.connect') {
        clearTimeout(this.connectTimer);
        this.connected = true;
        if (msg.data && msg.data.token) this.token = msg.data.token;
        this.onStatusChange('CONNECTED');
      }
      this.onMessage(msg);
    });

    ws.onError((err) => {
      console.log('[TVService] error:', err);
      clearTimeout(this.connectTimer);
      this.onStatusChange('ERROR');
    });

    ws.onClose(() => {
      console.log('[TVService] close');
      clearTimeout(this.connectTimer);
      this.connected = false;
      this.onStatusChange('DISCONNECTED');
    });

    ws.connect().catch((err) => {
      console.log('[TVService] connect failed:', err);
      clearTimeout(this.connectTimer);
      this.onStatusChange('ERROR');
    });
  }

  sendCommand(command) {
    if (!this.ws || !this.connected) return;
    const payload = buildCommand(command && command.action, command && command.payload);
    if (payload) this.ws.send(JSON.stringify(payload));
  }

  disconnect() {
    clearTimeout(this.connectTimer);
    this.connected = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
  }
}

export default new TVService();
