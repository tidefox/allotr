import { describe, expect, it } from 'vitest';
import { parseTagName, parseWhole } from './policies-model.ts';

describe('parseWhole', () => {
  it('accepts whole numbers in range', () => {
    expect(parseWhole('6', 1, 24)).toBe(6);
    expect(parseWhole(' 24 ', 1, 24)).toBe(24);
  });

  it('refuses text, decimals, signs and values out of range', () => {
    for (const text of ['', 'six', '2.5', '-3', '0', '25', '1e2'])
      expect(parseWhole(text, 1, 24)).toBeNull();
  });
});

describe('parseTagName', () => {
  it('trims and bounds the name', () => {
    expect(parseTagName('  trip ')).toBe('trip');
    expect(parseTagName('   ')).toBeNull();
    expect(parseTagName('x'.repeat(101))).toBeNull();
  });
});
