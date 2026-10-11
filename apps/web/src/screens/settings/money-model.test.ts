import { describe, expect, it } from 'vitest';
import {
  parsePaydayOverride,
  paydayDays,
  toRateBody,
  usesPaydayDay,
} from './money-model.ts';

describe('payday', () => {
  it('offers days 1 to 31', () => {
    expect(paydayDays[0]).toBe(1);
    expect(paydayDays).toHaveLength(31);
  });

  it('skips the day for the last working day only', () => {
    expect(usesPaydayDay('fixed')).toBe(true);
    expect(usesPaydayDay('manual')).toBe(true);
    expect(usesPaydayDay('last-working-day')).toBe(false);
  });

  it('reads the override as a date, a clear, or invalid', () => {
    expect(parsePaydayOverride('2026-03-27')).toBe('2026-03-27');
    expect(parsePaydayOverride('  ')).toBeNull();
    expect(parsePaydayOverride('27/03/2026')).toBe('invalid');
    expect(parsePaydayOverride('2026-02-30')).toBe('invalid');
  });
});

describe('toRateBody', () => {
  const ok = { base: 'EUR', quote: 'USD', rate: '1,0856', asOf: '2026-03-01' };

  it('builds the request', () => {
    expect(toRateBody(ok)).toEqual({
      body: { base: 'EUR', quote: 'USD', rate: '1.0856', asOf: '2026-03-01' },
    });
  });

  it('leaves the day out when empty', () => {
    expect(toRateBody({ ...ok, asOf: '' })).toEqual({
      body: { base: 'EUR', quote: 'USD', rate: '1.0856' },
    });
  });

  it('names every wrong field', () => {
    expect(
      toRateBody({ base: '', quote: 'USD', rate: '0', asOf: 'soon' }),
    ).toEqual({ errors: { base: 'base', rate: 'rate', asOf: 'asOf' } });
    expect(toRateBody({ ...ok, quote: 'EUR' })).toEqual({
      errors: { quote: 'same' },
    });
  });
});
