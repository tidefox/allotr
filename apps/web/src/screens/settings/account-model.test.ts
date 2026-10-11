import { describe, expect, it } from 'vitest';
import {
  byRecentActivity,
  compactCode,
  deviceName,
  importedCounts,
  kilobytes,
  maxImportBytes,
  parseImportFile,
  secretOf,
} from './account-model.ts';

describe('secretOf', () => {
  it('groups the secret in fours', () => {
    expect(secretOf('otpauth://totp/x?secret=ABCDEFGHIJ&issuer=Y')).toBe(
      'ABCD EFGH IJ',
    );
  });
  it('is empty without a secret', () => {
    expect(secretOf('otpauth://totp/x')).toBe('');
  });
});

describe('deviceName', () => {
  it('names browser and system', () => {
    expect(
      deviceName({
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64; rv:1) Gecko/20100101 Firefox/130.0',
      }),
    ).toBe('Firefox on Linux');
  });
  it('falls back for an unknown agent', () => {
    expect(deviceName({ userAgent: null })).toBe('Unknown device');
  });
});

describe('byRecentActivity', () => {
  it('sorts newest first without mutating', () => {
    const a = { updatedAt: new Date(1000) };
    const b = { updatedAt: new Date(3000) };
    const list = [a, b];
    expect(byRecentActivity(list)).toEqual([b, a]);
    expect(list).toEqual([a, b]);
  });
});

describe('compactCode', () => {
  it('drops whitespace', () => {
    expect(compactCode(' 123 456 ')).toBe('123456');
  });
});

describe('importedCounts', () => {
  it('keeps non-zero counts in display order', () => {
    const rows = importedCounts({
      accounts: 2,
      categoriesCreated: 0,
      categoriesMatched: 1,
      rates: 0,
      tags: 0,
      transactions: 40,
      bills: 0,
      billPayments: 0,
      reconciliations: 0,
      ious: 0,
      pools: 0,
      budgets: 0,
      coverOverrides: 0,
    });
    expect(rows).toEqual([
      { key: 'accounts', count: 2 },
      { key: 'categoriesMatched', count: 1 },
      { key: 'transactions', count: 40 },
    ]);
  });
});

describe('parseImportFile', () => {
  it('parses JSON', () => {
    expect(parseImportFile('{"a":1}', 7)).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });
  it('refuses text that is not JSON', () => {
    expect(parseImportFile('nope', 4)).toEqual({
      ok: false,
      reason: 'notJson',
    });
  });
  it('refuses a file over the limit before parsing', () => {
    expect(parseImportFile('{}', maxImportBytes + 1)).toEqual({
      ok: false,
      reason: 'tooLarge',
    });
  });
});

describe('kilobytes', () => {
  it('rounds and never shows zero', () => {
    expect(kilobytes(10)).toBe(1);
    expect(kilobytes(2048)).toBe(2);
    expect(kilobytes(1536)).toBe(2);
  });
});
