// Samsung Tizen remote-control protocol (samsung.remote.control v2, port 8001).
// Verified against Toxblh/samsung-tv-remote (src/helpers.ts, src/samsung.ts).
// CommonJS on purpose: the phone app (Metro) and the node test/mock both load it.

const APP_NAME = 'RN Remote';

const KEY_BY_ACTION = {
  UP: 'KEY_UP',
  DOWN: 'KEY_DOWN',
  LEFT: 'KEY_LEFT',
  RIGHT: 'KEY_RIGHT',
  OK: 'KEY_ENTER',
  ENTER: 'KEY_ENTER',
  BACK: 'KEY_RETURN',
  PLAY: 'KEY_PLAY',
  PAUSE: 'KEY_PAUSE',
  STOP: 'KEY_STOP',
  VOL_UP: 'KEY_VOLUP',
  VOL_DOWN: 'KEY_VOLDOWN',
  MUTE: 'KEY_MUTE',
  HOME: 'KEY_HOME',
  POWER: 'KEY_POWER',
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// UTF-8 safe base64. RN/Hermes has no Buffer; btoa availability is not guaranteed.
function toBase64(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | (b2 >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

function connectUrl(ip, port, token) {
  const name = encodeURIComponent(toBase64(APP_NAME));
  return `ws://${ip}:${port}/api/v2/channels/samsung.remote.control?name=${name}${token ? `&token=${token}` : ''}`;
}

// Returns null for unknown actions so callers can no-op instead of sending garbage.
function buildCommand(action, payload) {
  if (action === 'TEXT') {
    return {
      method: 'ms.remote.control',
      params: {
        Cmd: toBase64(payload == null ? '' : String(payload)),
        DataOfCmd: 'base64',
        TypeOfRemote: 'SendInputString',
      },
    };
  }
  const key = KEY_BY_ACTION[action];
  if (!key) return null;
  return {
    method: 'ms.remote.control',
    params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  };
}

function parseMessage(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { APP_NAME, KEY_BY_ACTION, toBase64, connectUrl, buildCommand, parseMessage };
