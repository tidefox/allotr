import { addDays, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { food } from '../ledger/testing.ts';
import { categoryId } from '../ledger/types.ts';
import {
  averageOf,
  categorySeries,
  cyclePeriods,
  monthPeriods,
} from './category-series.ts';
import { categoryTotalsBetween, rollUpCategories } from './category-summary.ts';
import { cyclesOf } from './cycles.ts';
import { day, paycheck, spend, view } from './testing.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const fun = categoryId('fun');
const groceries = categoryId('groceries');
const parents = new Map([[groceries, food]]);

describe('monthPeriods', () => {
  it('lists calendar months oldest first, across a year end and leap day', () => {
    expect(monthPeriods('2028-01', 3)).toEqual([
      { from: '2027-11-01', to: '2027-11-30' },
      { from: '2027-12-01', to: '2027-12-31' },
      { from: '2028-01-01', to: '2028-01-31' },
    ]);
    expect(monthPeriods('2028-03', 2)[0]).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });
});

describe('cyclePeriods', () => {
  const ledger = [
    paycheck('2026-03-01', 300000),
    paycheck('2026-04-01', 300000),
    paycheck('2026-05-01', 300000),
  ];
  const today = day('2026-05-10');
  const cycles = cyclesOf(view(ledger), today);

  it('ends the open cycle today and closed ones the day before the next', () => {
    const periods = cyclePeriods(
      cycles,
      cycles.at(-1)?.openedOn ?? today,
      2,
      today,
    );
    expect(periods).toEqual([
      { from: '2026-04-01', to: '2026-04-30' },
      { from: '2026-05-01', to: '2026-05-10' },
    ]);
  });

  it('returns fewer when history is short and nothing for an unknown cycle', () => {
    expect(
      cyclePeriods(cycles, cycles[0]?.openedOn ?? today, 5, today),
    ).toHaveLength(1);
    expect(cyclePeriods(cycles, day('2020-01-01'), 3, today)).toEqual([]);
  });
});

describe('categorySeries', () => {
  const ledger = [
    paycheck('2026-03-01', 300000),
    spend('2026-03-03', 4000, groceries),
    spend('2026-03-04', 1000, food),
    spend('2026-03-20', 6000, fun),
    spend('2026-04-02', 2500, fun),
    paycheck('2026-04-01', 300000),
  ];

  it('gives one point per period with zeros, parents including children', () => {
    const series = categorySeries(
      view(ledger),
      monthPeriods('2026-04', 3),
      parents,
    );
    expect(series.groups).toEqual([
      {
        categoryId: fun,
        points: [usd(0), usd(6000), usd(2500)],
        average: usd(2833),
      },
      {
        categoryId: food,
        points: [usd(0), usd(5000), usd(0)],
        average: usd(1666),
      },
    ]);
    expect(series.totals).toEqual([usd(0), usd(11000), usd(2500)]);
    // 13 500 over 3 periods, zero periods and all.
    expect(series.totalAverage).toEqual(usd(4500));
  });

  it('property: points match the single-period summary and add up', () => {
    const entry = fc.record({
      offset: fc.integer({ min: 0, max: 120 }),
      amount: fc.integer({ min: 1, max: 100_000 }),
      category: fc.constantFrom(food, fun, groceries),
    });
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 30 }), (entries) => {
        const start = day('2026-02-18');
        const ledger = [
          paycheck('2026-03-01', 300000),
          paycheck('2026-04-01', 300000),
          ...entries.map((e) =>
            spend(addDays(start, e.offset), e.amount, e.category),
          ),
        ];
        const today = addDays(start, 120);
        const v = view(ledger);
        const cycles = cyclesOf(v, today);
        const open = cycles.at(-1)?.openedOn ?? today;
        const periods = cyclePeriods(cycles, open, cycles.length, today);
        // Contiguous, ordered, no overlap.
        periods.forEach((p, i) => {
          expect(p.from <= p.to).toBe(true);
          const next = periods[i + 1];
          if (next !== undefined) expect(addDays(p.to, 1)).toBe(next.from);
        });
        const series = categorySeries(v, periods, parents);
        series.periods.forEach((period, i) => {
          const single = rollUpCategories(
            categoryTotalsBetween(v, period, 'expenses').totals,
            parents,
          );
          const total = single.reduce(
            (acc, g) => acc + g.amount.amountMinor,
            0,
          );
          expect(series.totals[i]?.amountMinor).toBe(total);
          for (const g of single) {
            const found = series.groups.find(
              (s) => s.categoryId === g.categoryId,
            );
            expect(found?.points[i]).toEqual(g.amount);
          }
        });
        for (const g of series.groups) {
          expect(g.points).toHaveLength(periods.length);
          expect(g.average).toEqual(averageOf(g.points, usd(0).currency));
        }
        expect(series.totalAverage).toEqual(
          averageOf(series.totals, usd(0).currency),
        );
      }),
    );
  });
});

describe('averageOf', () => {
  it('rounds down, counts zero periods and is zero with no points', () => {
    expect(averageOf([usd(100), usd(0), usd(1)], 'USD')).toEqual(usd(33));
    expect(averageOf([usd(-1), usd(0)], 'USD')).toEqual(usd(-1));
    expect(averageOf([], 'USD')).toEqual(usd(0));
  });

  it('keeps whole minor units in 0 and 3 digit currencies', () => {
    expect(averageOf([money(5, 'JPY'), money(0, 'JPY')], 'JPY')).toEqual(
      money(2, 'JPY'),
    );
    expect(averageOf([money(2_001, 'KWD'), money(0, 'KWD')], 'KWD')).toEqual(
      money(1_000, 'KWD'),
    );
  });

  it('property: stays between the smallest and largest point, and rounds down', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), {
          minLength: 1,
          maxLength: 24,
        }),
        (values) => {
          const avg = averageOf(
            values.map((v) => usd(v)),
            'USD',
          ).amountMinor;
          const sum = values.reduce((a, b) => a + b, 0);
          expect(avg).toBeGreaterThanOrEqual(Math.min(...values));
          expect(avg).toBeLessThanOrEqual(Math.max(...values));
          expect(avg * values.length).toBeLessThanOrEqual(sum);
          expect((avg + 1) * values.length).toBeGreaterThan(sum);
        },
      ),
    );
  });
});
