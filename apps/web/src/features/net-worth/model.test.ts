import fc from 'fast-check';
import { localDate, money, type LocalDate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  MAX_WORTH_DAYS,
  MIN_WORTH_DAYS,
  netWorthChart,
  worthDays,
} from './model.ts';

const day = (i: number, minor: number) => ({
  date: localDate(`2026-03-${String(i + 1).padStart(2, '0')}`),
  amount: money(minor, 'USD'),
});

describe('netWorthChart', () => {
  it('plots one point per day with the lowest and highest as y ticks', () => {
    const chart = netWorthChart(
      [day(0, 1000), day(1, 400), day(2, 2500), day(3, 2000), day(4, 2200)],
      'en',
    );
    expect(chart.points.map((p) => p.y)).toEqual([1000, 400, 2500, 2000, 2200]);
    expect(chart.yTicks.map((t) => t.value)).toEqual([400, 2500]);
    expect(chart.xTicks.map((t) => t.value)).toEqual([0, 2, 4]);
  });

  it('copes with one point and with none', () => {
    expect(netWorthChart([day(0, 5)], 'en').xTicks).toHaveLength(1);
    expect(netWorthChart([day(0, 5)], 'en').yTicks).toHaveLength(1);
    expect(netWorthChart([], 'en')).toEqual({
      points: [],
      yTicks: [],
      xTicks: [],
    });
  });
});

const isoDay = (s: string) => s as LocalDate;

describe('worthDays', () => {
  it('counts the period start through today', () => {
    expect(worthDays(isoDay('2026-10-01'), isoDay('2026-10-30'))).toBe(30);
    expect(worthDays(isoDay('2026-09-01'), isoDay('2026-10-10'))).toBe(40);
  });
  it('stays within what the API allows', () => {
    expect(worthDays(isoDay('2026-10-10'), isoDay('2026-10-10'))).toBe(
      MIN_WORTH_DAYS,
    );
    expect(worthDays(undefined, isoDay('2026-10-10'))).toBe(MAX_WORTH_DAYS);
    expect(worthDays(isoDay('2000-01-01'), isoDay('2026-10-10'))).toBe(
      MAX_WORTH_DAYS,
    );
  });
  it('is always a valid day count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20_000 }),
        fc.integer({ min: 0, max: 20_000 }),
        (a, b) => {
          const iso = (n: number) =>
            new Date(Date.UTC(2000, 0, 1) + n * 86_400_000)
              .toISOString()
              .slice(0, 10) as LocalDate;
          const n = worthDays(iso(a), iso(b));
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(MIN_WORTH_DAYS);
          expect(n).toBeLessThanOrEqual(MAX_WORTH_DAYS);
        },
      ),
    );
  });
});
