import { describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from './base64url.ts';

// Cursors issued before the helper existed must keep working, so these
// strings are pinned (they are what Buffer's base64url produced).
const pinned: readonly (readonly [string, string])[] = [
  ['', ''],
  ['f', 'Zg'],
  ['fo', 'Zm8'],
  ['foo', 'Zm9v'],
  [
    '["2025-03-14","0000000001","3f2a9c1e-7b64-4d2e-9a10-5c8e6d4b2f71"]',
    'WyIyMDI1LTAzLTE0IiwiMDAwMDAwMDAwMSIsIjNmMmE5YzFlLTdiNjQtNGQyZS05YTEwLTVjOGU2ZDRiMmY3MSJd',
  ],
  ['["~~~???>>>"]', 'WyJ-fn4_Pz8-Pj4iXQ'],
];

describe('base64url', () => {
  it.each(pinned)('encodes %j to the pinned string', (text, encoded) => {
    expect(encodeBase64Url(text)).toBe(encoded);
    expect(decodeBase64Url(encoded)).toBe(text);
  });

  it('matches Buffer for multi-byte text', () => {
    for (const text of ['฿100', 'é', '日本語', '😀 x']) {
      expect(encodeBase64Url(text)).toBe(
        Buffer.from(text).toString('base64url'),
      );
      expect(decodeBase64Url(encodeBase64Url(text))).toBe(text);
    }
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => decodeBase64Url('a+b/')).toThrow();
  });
});
