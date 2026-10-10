import { describe, expect, it } from 'vitest';
import type { BudgetView, CycleSummaryView } from '@allotr/shared';
import { budgetRows, rateColumns } from './plan-model.ts';

const usd = (amountMinor: number) =>
  ({ amountMinor, currency: 'USD' }) as BudgetView['left'];

function budget(
  id: string,
  spent: number,
  left: number,
  overflow = 0,
): BudgetView {
  return {
    id,
    name: id,
    planned: usd(spent + left),
    spent: usd(spent),
    left: usd(left),
    overflow: usd(overflow),
  } as BudgetView;
}

describe('budgetRows', () => {
  it('sizes each bar from spent against what it had', () => {
    const rows = budgetRows([
      budget('food', 25_000, 75_000),
      budget('fun', 12_000, -2_000, 2_000),
      budget('idle', 0, 5_000),
    ]);
    expect(rows.map((r) => r.fraction)).toEqual([0.25, 1, 0]);
    expect(rows.map((r) => r.over)).toEqual([false, true, false]);
    expect(rows[0]?.budget.spent).toEqual(usd(25_000));
  });
});

describe('rateColumns', () => {
  it('shows the server rate and no bar without income', () => {
    const cycles = [
      { openedOn: '2026-08-01', savingsRate: 2000 },
      { openedOn: '2026-09-01', savingsRate: 500 },
      { openedOn: '2026-10-01', savingsRate: null },
      { openedOn: '2026-11-01', savingsRate: -300 },
    ] as CycleSummaryView[];
    const cols = rateColumns(cycles, 'en');
    expect(cols.map((c) => c.valueLabel)).toEqual(['20%', '5%', '–', '-3%']);
    expect(cols.map((c) => c.fraction)).toEqual([1, 0.25, 0, 0]);
  });
});
