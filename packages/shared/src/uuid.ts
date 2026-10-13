// RFC 4122 version 5 (name-based, SHA-1) UUIDs. Writes no person typed use
// ids derived from their content, so concurrent runs on several devices
// produce the same id and dedupe (ADR 0034).
//
// This is synchronous and uses no Node API: WebCrypto's digest is async and
// would force every caller, including the pure reducers, to be async. SHA-1
// is only a mixing function here; nothing relies on it for security.

export type UuidErrorCode = 'uuid.invalid';

export class UuidError extends Error {
  override readonly name = 'UuidError';
  readonly code: UuidErrorCode;

  constructor(code: UuidErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

export function sha1(message: Uint8Array): Uint8Array {
  const padded = new Uint8Array((((message.length + 8) >> 6) << 6) + 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = message.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Array<number>(80).fill(0);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotl(
        (w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0),
        1,
      );
    }
    let [a, b, c, d, e] = h as [number, number, number, number, number];
    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (rotl(a, 5) + f + e + k + (w[i] ?? 0)) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = t;
    }
    h[0] = ((h[0] ?? 0) + a) | 0;
    h[1] = ((h[1] ?? 0) + b) | 0;
    h[2] = ((h[2] ?? 0) + c) | 0;
    h[3] = ((h[3] ?? 0) + d) | 0;
    h[4] = ((h[4] ?? 0) + e) | 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  h.forEach((word, i) => {
    outView.setUint32(i * 4, word >>> 0);
  });
  return out;
}

// UTF-8 by hand: the compile target has no TextEncoder type. A lone
// surrogate becomes U+FFFD, as TextEncoder does.
export function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0) ?? 0xfffd;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function namespaceBytes(namespace: string): Uint8Array {
  if (!isUuid(namespace)) {
    throw new UuidError('uuid.invalid', 'The namespace is not a UUID.');
  }
  const hex = namespace.replaceAll('-', '');
  return Uint8Array.from({ length: 16 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}

/**
 * The version 5 UUID of `name` (UTF-8) in `namespace`, lower case. The same
 * pair always gives the same id, on every device.
 */
export function uuidv5(namespace: string, name: string): string {
  const prefix = namespaceBytes(namespace);
  const text = utf8(name);
  const input = new Uint8Array(prefix.length + text.length);
  input.set(prefix);
  input.set(text, prefix.length);
  const bytes = sha1(input).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
