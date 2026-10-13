// Portable base64url (RFC 4648 section 5, no padding) for text, so the list
// cursor needs neither `Buffer` nor `btoa` quirks. Byte-identical to
// Node's `Buffer.toString('base64url')` on UTF-8 input.

const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n =
      ((bytes[i] ?? 0) << 16) |
      ((bytes[i + 1] ?? 0) << 8) |
      (bytes[i + 2] ?? 0);
    out += alphabet.charAt((n >> 18) & 63) + alphabet.charAt((n >> 12) & 63);
    if (i + 1 < bytes.length) out += alphabet.charAt((n >> 6) & 63);
    if (i + 2 < bytes.length) out += alphabet.charAt(n & 63);
  }
  return out;
}

/** Decodes to text; throws on characters outside the alphabet. */
export function decodeBase64Url(encoded: string): string {
  const bytes: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const char of encoded) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Not base64url.');
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
