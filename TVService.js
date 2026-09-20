import { connectUrl, buildCommand, parseMessage } from './remoteProtocol';

// ponytail: 8002/wss only (this TV rejects 8001 with ms.channel.unauthorized).
// Needs a TLS bypass for the TV's self-signed cert — see native notes.
const PORT = 8002;
const CONNECT_TIMEOUT_MS = 10000;

// Same public shape as the old WebRTCService: connect(ip, statusCb, messageCb),
// sendCommand({ action, payload }), disconnect(). No WebRTC, no signaling server.
class TVService {
  constructor() {
    this.ws = null;
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
    this.ws = new WebSocket(url);

    this.ws.onopen = () => console.log('[TVService] socket open');

    this.connectTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        this.onStatusChange('ERROR');
        this.disconnect();
      }
    }, CONNECT_TIMEOUT_MS);

    this.ws.onmessage = (event) => {
      console.log('[TVService] message:', event.data);
      const msg = parseMessage(event.data);
      if (!msg) return;
      if (msg.event === 'ms.channel.unauthorized' || msg.event === 'ms.service.unauthorized') {
        clearTimeout(this.connectTimer);
        this.onStatusChange('UNAUTHORIZED');
      } else if (msg.event === 'ms.channel.connect') {
        clearTimeout(this.connectTimer);
        // ponytail: treated as CONNECTED even without a token; keys fail until the TV Allow dialog is accepted.
        if (msg.data && msg.data.token) this.token = msg.data.token;
        this.onStatusChange('CONNECTED');
      }
      this.onMessage(msg);
    };

    this.ws.onerror = (e) => {
      console.log('[TVService] error event:', JSON.stringify(e));
      clearTimeout(this.connectTimer);
      this.onStatusChange('ERROR');
    };

    this.ws.onclose = (e) => {
      console.log('[TVService] close:', e && e.code, e && e.reason);
      clearTimeout(this.connectTimer);
      this.onStatusChange('DISCONNECTED');
    };
  }

  sendCommand(command) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = buildCommand(command && command.action, command && command.payload);
    if (payload) this.ws.send(JSON.stringify(payload));
  }

  disconnect() {
    clearTimeout(this.connectTimer);
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

export default new TVService();
