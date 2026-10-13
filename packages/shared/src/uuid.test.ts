import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isUuid, sha1, utf8, UuidError, uuidv5 } from './uuid.ts';

const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const URL_NS = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const text = utf8;

describe('sha1', () => {
  it('matches the FIPS 180 vectors', () => {
    expect(hex(sha1(text('')))).toBe(
      'da39a3ee5e6b4b0d3255bfef95601890afd80709',
    );
    expect(hex(sha1(text('abc')))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    );
    expect(
      hex(
        sha1(text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
      ),
    ).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1');
    expect(hex(sha1(text('a'.repeat(1_000_000))))).toBe(
      '34aa973cd4c4daa4f61eeb2bdbad27316534016f',
    );
  });

  it('handles every padding boundary', () => {
    for (const length of [54, 55, 56, 57, 63, 64, 65, 119, 120]) {
      expect(sha1(text('x'.repeat(length)))).toHaveLength(20);
    }
  });
});

describe('utf8', () => {
  it('encodes one to four bytes and replaces lone surrogates', () => {
    expect(Array.from(utf8('a\u00e9\u20ac\u{1f600}'))).toEqual([
      0x61, 0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80,
    ]);
    expect(Array.from(utf8('\ud800'))).toEqual([0xef, 0xbf, 0xbd]);
  });
});

describe('uuidv5', () => {
  it('matches well-known vectors', () => {
    expect(uuidv5(DNS, 'www.example.com')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
    expect(uuidv5(DNS, 'python.org')).toBe(
      '886313e1-3b8a-5372-9b90-0c9aee199e5d',
    );
    expect(uuidv5(URL_NS, 'http://www.example.com/')).toBe(
      'fcde3c85-2270-590f-9e7c-ee003d65e0e2',
    );
  });

  it('encodes names as UTF-8 and is case-insensitive about the namespace', () => {
    expect(uuidv5(DNS.toUpperCase(), 'www.example.com')).toBe(
      uuidv5(DNS, 'www.example.com'),
    );
    expect(uuidv5(DNS, 'café')).not.toBe(uuidv5(DNS, 'cafe'));
  });

  it('refuses a namespace that is not a UUID', () => {
    expect(() => uuidv5('ledger', 'x')).toThrow(UuidError);
  });

  it('is stable, versioned and varies with the namespace and the name', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), fc.string(), (a, b, name) => {
        const id = uuidv5(a, name);
        expect(id).toBe(uuidv5(a, name));
        expect(isUuid(id)).toBe(true);
        expect(id[14]).toBe('5');
        expect('89ab').toContain(id[19]);
        if (a.toLowerCase() !== b.toLowerCase()) {
          expect(uuidv5(b, name)).not.toBe(id);
        }
      }),
    );
  });
});
