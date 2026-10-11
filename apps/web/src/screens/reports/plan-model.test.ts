import { describe, expect, it } from 'vitest';
import type { CycleSummaryView, NetWorthView } from '@allotr/shared';
import { rateColumns, worthChart } from './plan-model.ts';

const day = (date: string, amountMinor: number) => ({
  date,
  amount: { amountMinor, currency: 'USD' },
});

describe('worthChart', () => {
  it('puts a gridline on round steps that cover the line', () => {
    const series = [
      day('2026-10-01', 7_800_00),
      day('2026-10-04', 9_120_00),
      day('2026-10-07', 9_900_00),
      day('2026-10-10', 10_509_60),
    ] as NetWorthView['series'];
    const chart = worthChart(series, 'en');
    const values = chart.yTicks.map((t) => t.value);
    expect(Math.min(...values)).toBeLessThanOrEqual(7_800_00);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(10_509_60);
    expect(chart.xTicks.map((t) => t.label)).toEqual([
      'oct 01',
      'oct 04',
      'oct 07',
      'oct 10',
    ]);
  });

  it('has no ticks without days', () => {
    expect(worthChart([], 'en')).toEqual({
      points: [],
      yTicks: [],
      xTicks: [],
    });
  });
});

describe('rateColumns', () => {
  it('shows the server rate and no bar without income', () => {
    const cycles = [
      { openedOn: '2026-08-01', closedOn: '2026-09-01', savingsRate: 2000 },
      { openedOn: '2026-09-01', closedOn: '2026-10-01', savingsRate: 500 },
      { openedOn: '2026-10-01', closedOn: '2026-11-01', savingsRate: null },
      { openedOn: '2026-11-01', closedOn: null, savingsRate: -300 },
    ] as CycleSummaryView[];
    const cols = rateColumns(cycles, 'en');
    expect(cols.map((c) => c.valueLabel)).toEqual(['20%', '5%', '–', '-3%']);
    expect(cols.map((c) => c.fraction)).toEqual([1, 0.25, 0, 0]);
    expect(cols.map((c) => c.color)).toEqual([
      'positive',
      'positive',
      'positive',
      'primary',
    ]);
  });
});
