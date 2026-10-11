import { monthsBetween, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { goalMonthlyNeeded } from './goals.ts';
import { day } from './testing.ts';

const today = day('2026-10-11');

describe('goalMonthlyNeeded', () => {
  it('divides what is missing by the calendar months left', () => {
    // October to March is 5 months.
    expect(
      goalMonthlyNeeded(
        { remaining: money(68_000, 'USD'), targetOn: day('2027-03-15') },
        today,
      ),
    ).toEqual(money(13_600, 'USD'));
  });

  it('rounds up to the next minor unit', () => {
    expect(
      goalMonthlyNeeded(
        { remaining: money(10_000, 'USD'), targetOn: day('2027-01-31') },
        today,
      ),
    ).toEqual(money(3_334, 'USD'));
    // 0 and 3 minor digits.
    expect(
      goalMonthlyNeeded(
        { remaining: money(1_000, 'JPY'), targetOn: day('2027-01-31') },
        today,
      ),
    ).toEqual(money(334, 'JPY'));
    expect(
      goalMonthlyNeeded(
        { remaining: money(1_001, 'KWD'), targetOn: day('2026-12-01') },
        today,
      ),
    ).toEqual(money(501, 'KWD'));
  });

  it('asks for everything in one go when the date is this month', () => {
    const remaining = money(5_000, 'USD');
    for (const targetOn of ['2026-10-11', '2026-10-31']) {
      expect(
        goalMonthlyNeeded({ remaining, targetOn: day(targetOn) }, today),
      ).toEqual(remaining);
    }
  });

  it('is null with no date, once reached, or after the date', () => {
    const missing = money(5_000, 'USD');
    expect(
      goalMonthlyNeeded({ remaining: missing, targetOn: null }, today),
    ).toBeNull();
    expect(
      goalMonthlyNeeded(
        { remaining: money(0, 'USD'), targetOn: day('2027-03-01') },
        today,
      ),
    ).toBeNull();
    expect(
      goalMonthlyNeeded(
        { remaining: missing, targetOn: day('2026-10-10') },
        today,
      ),
    ).toBeNull();
  });

  it('never asks for less than what is missing over the months (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 3_000 }),
        (remaining, offset) => {
          const targetOn = day(
            new Date(Date.UTC(2026, 9, 11 + offset)).toISOString().slice(0, 10),
          );
          const needed = goalMonthlyNeeded(
            { remaining: money(remaining, 'USD'), targetOn },
            today,
          );
          const months = Math.max(1, monthsBetween(today, targetOn));
          expect(needed).not.toBeNull();
          const each = needed?.amountMinor ?? 0;
          expect(each * months).toBeGreaterThanOrEqual(remaining);
          expect((each - 1) * months).toBeLessThan(remaining);
          expect(needed?.currency).toBe('USD');
        },
      ),
    );
  });
});
