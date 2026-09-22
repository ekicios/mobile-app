// Minimal SSDP (UPnP M-SEARCH) scanner to find Samsung TVs on the LAN.
// ponytail: returns IPs only; friendly names need http://IP:8001/api/v2/ (ATS) — add if needed.
import dgram from 'react-native-udp';

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const SAMSUNG = /urn:samsung\.com:device/i;
const SEARCH = [
  'M-SEARCH * HTTP/1.1',
  `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
  'MAN: "ssdp:discover"',
  'MX: 1',
  'ST: ssdp:all',
  '',
  '',
].join('\r\n');

export function discoverTVs(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const ips = new Set();
    let socket;
    const finish = () => {
      try { socket && socket.close(); } catch (e) {}
      resolve([...ips]);
    };
    try {
      socket = dgram.createSocket({ type: 'udp4' });
    } catch (e) {
      resolve([]);
      return;
    }
    socket.on('error', finish);
    socket.on('message', (msg, rinfo) => {
      if (SAMSUNG.test(msg.toString())) ips.add(rinfo.address);
    });
    socket.bind(0, () => {
      try {
        socket.send(SEARCH, 0, SEARCH.length, SSDP_PORT, SSDP_ADDR, () => {});
      } catch (e) {}
    });
    setTimeout(finish, timeoutMs);
  });
}
