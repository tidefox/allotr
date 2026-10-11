import { daysBetween, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { creditAvailable, creditNextDue } from './credit.ts';
import { day } from './testing.ts';

describe('creditAvailable', () => {
  it('is the limit less what is owed, a debt being a negative balance', () => {
    expect(
      creditAvailable(money(200_000, 'USD'), money(-40_000, 'USD')),
    ).toEqual(money(160_000, 'USD'));
    expect(creditAvailable(money(200_000, 'USD'), money(0, 'USD'))).toEqual(
      money(200_000, 'USD'),
    );
  });

  it('is not clamped: negative past the limit, above it when in credit', () => {
    expect(
      creditAvailable(money(200_000, 'USD'), money(-250_000, 'USD')),
    ).toEqual(money(-50_000, 'USD'));
    expect(
      creditAvailable(money(200_000, 'USD'), money(15_000, 'USD')),
    ).toEqual(money(215_000, 'USD'));
  });

  it('keeps the currency, whatever its minor digits', () => {
    expect(
      creditAvailable(money(500_000, 'JPY'), money(-120_000, 'JPY')),
    ).toEqual(money(380_000, 'JPY'));
    expect(
      creditAvailable(money(2_000_000, 'KWD'), money(-1_500, 'KWD')),
    ).toEqual(money(1_998_500, 'KWD'));
  });

  it('refuses a balance in another currency', () => {
    expect(() =>
      creditAvailable(money(100, 'USD'), money(-10, 'EUR')),
    ).toThrow();
  });

  it('adds back exactly what was owed (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: -2_000_000_000, max: 1_000_000 }),
        (limit, balance) => {
          const free = creditAvailable(
            money(limit, 'USD'),
            money(balance, 'USD'),
          );
          expect(free.currency).toBe('USD');
          expect(free.amountMinor - limit).toBe(balance);
        },
      ),
    );
  });
});

describe('creditNextDue', () => {
  it('is this month when the day has not passed yet', () => {
    expect(creditNextDue(22, day('2026-10-11'))).toBe('2026-10-22');
  });

  it('is next month once the day has passed', () => {
    expect(creditNextDue(5, day('2026-10-11'))).toBe('2026-11-05');
  });

  it('is today when today is the due day', () => {
    expect(creditNextDue(11, day('2026-10-11'))).toBe('2026-10-11');
  });

  it('uses the last day of a shorter month', () => {
    expect(creditNextDue(30, day('2026-01-31'))).toBe('2026-02-28');
    expect(creditNextDue(30, day('2026-02-15'))).toBe('2026-02-28');
    expect(creditNextDue(30, day('2026-02-28'))).toBe('2026-02-28');
    expect(creditNextDue(31, day('2028-02-10'))).toBe('2028-02-29');
    expect(creditNextDue(31, day('2026-04-30'))).toBe('2026-04-30');
  });

  it('rolls into the next year', () => {
    expect(creditNextDue(31, day('2026-12-31'))).toBe('2026-12-31');
    expect(creditNextDue(10, day('2026-12-11'))).toBe('2027-01-10');
    expect(creditNextDue(31, day('2027-01-01'))).toBe('2027-01-31');
  });

  it('falls on the due day, or the month end, within a month of today (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 0, max: 366 * 8 }),
        (dueDay, offset) => {
          const today = day(
            new Date(Date.UTC(2024, 0, 1 + offset)).toISOString().slice(0, 10),
          );
          const due = creditNextDue(dueDay, today);
          const [year, month, dayOfMonth] = due.split('-').map(Number) as [
            number,
            number,
            number,
          ];
          const monthLength = new Date(Date.UTC(year, month, 0)).getUTCDate();
          expect(due >= today).toBe(true);
          expect(daysBetween(today, due)).toBeLessThanOrEqual(31);
          expect(dayOfMonth).toBe(Math.min(dueDay, monthLength));
          // The earliest such date: the day before is not one.
          if (daysBetween(today, due) > 0) {
            expect(creditNextDue(dueDay, due)).toBe(due);
          }
        },
      ),
    );
  });
});
