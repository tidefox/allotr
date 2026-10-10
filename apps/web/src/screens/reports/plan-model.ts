import type { BudgetView, CycleSummaryView, LocalDate } from '@allotr/shared';
import type { ColumnDatum } from '@/charts/columns';
import { formatDay } from '@/features/today/format';
import { spentShare } from '@/features/budget/share';
import { t } from '@/messages/t';
import { formatRate, fractionsOf } from './cycles-model.ts';

// What the plan tab shows: budgets against what was spent, the savings rate
// per cycle. All amounts are the
// server's; fractions only size bars.

export type BudgetRow = Readonly<{
  key: string;
  name: string;
  budget: BudgetView;
  /** The bar's fill, 0..1. */
  fraction: number;
  over: boolean;
}>;

/** One row per budget, in the order the server sent. */
export function budgetRows(budgets: readonly BudgetView[]): BudgetRow[] {
  return budgets.map((budget) => ({
    key: budget.id,
    name: budget.name,
    budget,
    fraction: spentShare(budget.spent, budget.left) / 100,
    over: budget.overflow.amountMinor > 0,
  }));
}

function rateText(cycle: CycleSummaryView): string {
  return cycle.savingsRate === null
    ? t('reportsPlan.rate.none')
    : formatRate(cycle.savingsRate);
}

/** One column per cycle: the server's savings rate. A loss has no bar. */
export function rateColumns(
  cycles: readonly CycleSummaryView[],
  locale: string,
): ColumnDatum[] {
  const fractions = fractionsOf(cycles.map((c) => c.savingsRate ?? 0));
  return cycles.map((cycle, i) => ({
    id: cycle.openedOn,
    fraction: fractions[i] ?? 0,
    valueLabel: rateText(cycle),
    xLabel: formatDay(cycle.openedOn, locale),
    color: 'series-3',
  }));
}
