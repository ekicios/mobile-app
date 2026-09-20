import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';

class WebRTCService {
  constructor() {
    this.ws = null;
    this.peerConnection = null;
    this.dataChannel = null;
    this.roomId = null;
    this.onStatusChange = () => { };
    this.onMessage = () => { };

    this.configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  connect(ip, roomId, statusCb, messageCb) {
    this.roomId = roomId;
    this.onStatusChange = statusCb;
    this.onMessage = messageCb;

    // Connect to signaling server
    this.ws = new WebSocket(`ws://${ip}:8080`);

    this.ws.onopen = () => {
      console.log('[mobile] WS open → JOIN', this.roomId);
      this.ws.send(JSON.stringify({ type: 'JOIN', roomId: this.roomId }));
      this.initPeerConnection();
    };

    this.ws.onmessage = async (e) => {
      try {
        let message;

        if (typeof e.data === 'object' && e.data !== null && !(e.data instanceof Blob)) {
          message = e.data;
        } else {
          let raw;
          if (typeof e.data === 'string') {
            raw = e.data;
          } else if (e.data && typeof e.data.text === 'function') {
            raw = await e.data.text();
          } else if (typeof Blob !== 'undefined' && e.data instanceof Blob) {
            raw = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsText(e.data);
            });
          } else {
            raw = String(e.data);
          }
          message = JSON.parse(raw);
        }

        if (message.type === 'answer') {
          console.log('[mobile] Received answer');
          await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(message.answer)
          );
        } else if (message.type === 'ice-candidate') {
          if (this.peerConnection) {
            await this.peerConnection.addIceCandidate(
              new RTCIceCandidate(message.candidate)
            );
          }
        }
      } catch (err) {
        console.error('[mobile] Failed to process signaling message', err);
      }
    };

    this.ws.onerror = (e) => {
      console.error('[mobile] WS Error', e);
      this.onStatusChange('WS_ERROR');
    };

    this.ws.onclose = () => {
      console.log('[mobile] WS Closed');
      this.onStatusChange('WS_CLOSED');
    }
  }

  async initPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.configuration);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[mobile] ICE candidate → generated');
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          roomId: this.roomId,
          candidate: event.candidate
        }));
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[mobile] Connection state:', state);
      
      let normalized;
      if (state === 'connected') {
        normalized = 'CONNECTED';
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        normalized = 'DISCONNECTED';
      } else {
        normalized = state.toUpperCase();
      }
      this.onStatusChange(normalized);
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection.iceConnectionState;
      console.log('[mobile] ICE connection state:', iceState);
      if (iceState === 'connected') {
        this.onStatusChange('CONNECTED');
      } else if (iceState === 'failed' || iceState === 'disconnected' || iceState === 'closed') {
        this.onStatusChange('DISCONNECTED');
      }
    };

    // 1. Önce Data Channel oluşturuluyor (Burası doğru)
    this.dataChannel = this.peerConnection.createDataChannel('tv_commands');

    this.dataChannel.onopen = () => {
      console.log('[mobile] Data Channel OPEN! Artık veri gönderilebilir.');
      this.onStatusChange('CONNECTED');
    };

    this.dataChannel.onclose = () => {
      console.log('[mobile] Data Channel Closed');
      this.onStatusChange('DISCONNECTED');
    };

    this.dataChannel.onmessage = (event) => {
      console.log('[mobile] Data Channel Message received:', event.data);
      this.onMessage(event.data);
    };

    // 2. Data Channel oluşturulduktan sonra Offer yaratılıyor (Burası doğru)
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.ws.send(JSON.stringify({
      type: 'offer',
      roomId: this.roomId,
      offer: this.peerConnection.localDescription
    }));
  }

  sendCommand(command) {
    console.log('[mobile] DataChannel State Check:', this.dataChannel?.readyState);
    
    // DÜZELTİLEN KISIM: 'connecting' yerine 'open' olmalı!
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(command));
      console.log('[mobile] Command sent:', command);
    } else {
      console.warn('[mobile] Data channel not open yet. Current state:', this.dataChannel?.readyState);
    }
  }

  disconnect() {
    if (this.dataChannel) this.dataChannel.close();
    if (this.peerConnection) this.peerConnection.close();
    if (this.ws) this.ws.close();
  }
}

export default new WebRTCService();