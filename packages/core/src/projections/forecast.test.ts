import { addDays, isoWeekday, localDate, type LocalDate } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { spendingForecast, type SpendingDay } from './forecast.ts';

// 2026-03-02 is a Monday.
const start = localDate('2026-03-02');

function history(spent: readonly number[]): SpendingDay[] {
  return spent.map((amount, i) => ({ date: addDays(start, i), spent: amount }));
}

function next(after: number, count: number): LocalDate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, after + i));
}

describe('spendingForecast', () => {
  it('forecasts nothing new without history', () => {
    expect(spendingForecast([], next(0, 2))).toEqual([
      { mid: 0, low: 0, high: 0 },
      { mid: 0, low: 0, high: 0 },
    ]);
  });

  it('carries a steady rate forward with no range', () => {
    const days = history(Array.from({ length: 14 }, () => 1500));
    expect(spendingForecast(days, next(14, 3))).toEqual([
      { mid: 1500, low: 1500, high: 1500 },
      { mid: 3000, low: 3000, high: 3000 },
      { mid: 4500, low: 4500, high: 4500 },
    ]);
  });

  it('does not let one large purchase set the rate', () => {
    const steady = Array.from({ length: 30 }, () => 1000);
    const spike = [...steady.slice(0, 29), 100000];
    const [plain] = spendingForecast(history(steady), next(30, 1));
    const [withSpike] = spendingForecast(history(spike), next(30, 1));
    // The 95th percentile caps the spike at an ordinary day.
    expect(withSpike?.mid).toBe(plain?.mid);
  });

  it('weighs recent days most', () => {
    const rising = [
      ...Array.from({ length: 21 }, () => 500),
      ...Array.from({ length: 7 }, () => 2000),
    ];
    const [point] = spendingForecast(history(rising), next(28, 1));
    const average = rising.reduce((a, b) => a + b, 0) / rising.length;
    expect(point?.mid).toBeGreaterThan(average);
  });

  it('follows the weekday pattern after four weeks', () => {
    // Spending only on Saturdays, six weeks.
    const days = history(
      Array.from({ length: 42 }, (_, i) =>
        isoWeekday(addDays(start, i)) === 6 ? 7000 : 0,
      ),
    );
    const points = spendingForecast(days, next(42, 7));
    const steps = points.map((p, i) => p.mid - (points[i - 1]?.mid ?? 0));
    // next(42, 7) runs Monday to Sunday; Saturday is index 5.
    expect(steps[5]).toBeGreaterThan(5 * (steps[0] ?? 0));
  });

  it('keeps low ≤ mid ≤ high, all rising, low never below zero', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5000, max: 50000 }), {
          minLength: 1,
          maxLength: 60,
        }),
        fc.integer({ min: 1, max: 35 }),
        (spent, horizon) => {
          const points = spendingForecast(
            history(spent),
            next(spent.length, horizon),
          );
          let before = { mid: 0, low: 0, high: 0 };
          for (const p of points) {
            expect(p.low).toBeGreaterThanOrEqual(0);
            expect(p.low).toBeLessThanOrEqual(p.mid);
            expect(p.mid).toBeLessThanOrEqual(p.high);
            expect(p.mid).toBeGreaterThanOrEqual(before.mid);
            expect(p.low).toBeGreaterThanOrEqual(before.low);
            expect(Number.isInteger(p.mid)).toBe(true);
            before = p;
          }
        },
      ),
    );
  });
});
