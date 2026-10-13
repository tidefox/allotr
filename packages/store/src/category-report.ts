import {
  categoryGroupsTotal,
  categoryId,
  categorySeries,
  basisPointShares,
  categoryTotalsBetween,
  cyclePeriods,
  dailyAverage,
  isEarnings,
  monthPeriods,
  rollUpCategories,
  savedBetween,
  type CategoryId,
  type CategoryGroup,
  type CategorySeries,
  type SeriesPeriod,
} from '@allotr/core';
import {
  localDateIn,
  type CategorySeriesView,
  type CategorySummaryView,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from './schema.ts';
import { mergeTargets } from './cycles.ts';
import { resolveReportPeriod } from './report-period.ts';
import { loadView } from './today.ts';

// Category summaries (FR-W2): spending and income per top-level category for
// a payday cycle or a calendar month, computed from the ledger on each read,
// with the period's totals, daily average and what it added to savings.

type Query = Readonly<{
  period: 'cycle' | 'month';
  cycle?: LocalDate | undefined;
  month?: string | undefined;
  series?: number | undefined;
}>;

// Shares are of the period's total; a group's children split the group's
// share, so a group and its children always agree.
const view = (groups: CategoryGroup[], total: Money) => {
  const shares = basisPointShares(
    groups.map((g) => g.amount.amountMinor),
    total.amountMinor,
  );
  return groups.map((group, index) => {
    const shareBp = shares[index] ?? 0;
    const childShares = basisPointShares(
      group.children.map((c) => c.amount.amountMinor),
      group.amount.amountMinor,
      shareBp,
    );
    return {
      categoryId: group.categoryId,
      amount: group.amount,
      shareBp,
      children: group.children.map((child, i) => ({
        categoryId: child.categoryId,
        amount: child.amount,
        shareBp: childShares[i] ?? 0,
      })),
    };
  });
};

// The core result is readonly; the API view is plain arrays.
const seriesView = (series: CategorySeries): CategorySeriesView => ({
  periods: series.periods.map(({ from, to }) => ({ from, to })),
  groups: series.groups.map((g) => ({
    categoryId: g.categoryId,
    points: [...g.points],
    average: g.average,
    changeBp: g.changeBp,
  })),
  totals: [...series.totals],
  totalAverage: series.totalAverage,
  missingRates: [...series.missingRates],
});

export async function categorySummary(
  db: Kysely<DB>,
  userId: string,
  query: Query,
  now: Date,
): Promise<CategorySummaryView> {
  const { loaded, merged, parents } = await db
    .transaction()
    .execute(async (trx) => ({
      loaded: await loadView(trx, userId),
      merged: await mergeTargets(trx, userId),
      parents: await trx
        .selectFrom('categories')
        .select(['id', 'parent_id'])
        .where('user_id', '=', userId)
        .execute(),
    }));
  const today = localDateIn(now, loaded.timeZone);
  const range = resolveReportPeriod(loaded.view, today, query);
  const { from, to } = range;
  const periods: SeriesPeriod[] =
    range.kind === 'month'
      ? monthPeriods(range.month, query.series ?? 0)
      : cyclePeriods(
          range.cycles,
          range.cycle.openedOn,
          query.series ?? 0,
          today,
        );
  const parentOf = new Map<CategoryId, CategoryId | null>(
    parents.map((row) => [
      categoryId(row.id),
      row.parent_id === null ? null : categoryId(row.parent_id),
    ]),
  );
  const spending = categoryTotalsBetween(
    loaded.view,
    { from, to },
    'expenses',
    merged,
  );
  const outside = categoryTotalsBetween(
    loaded.view,
    { from, to },
    'expenses',
    merged,
    'outside',
  );
  const income = categoryTotalsBetween(
    loaded.view,
    { from, to },
    'income',
    merged,
  );
  const currency = loaded.view.settings.defaultCurrency;
  const spendingGroups = rollUpCategories(spending.totals, parentOf);
  const outsideGroups = rollUpCategories(outside.totals, parentOf);
  const incomeGroups = rollUpCategories(
    income.totals.filter((total) => isEarnings(loaded.view, total.categoryId)),
    parentOf,
  );
  const otherGroups = rollUpCategories(
    income.totals.filter((total) => !isEarnings(loaded.view, total.categoryId)),
    parentOf,
  );
  const spendingTotal = categoryGroupsTotal(spendingGroups, currency);
  const outsideTotal = categoryGroupsTotal(outsideGroups, currency);
  const incomeTotal = categoryGroupsTotal(incomeGroups, currency);
  const otherInflowsTotal = categoryGroupsTotal(otherGroups, currency);
  const { days, average } = dailyAverage(spendingTotal, { from, to }, today);
  const savings = savedBetween(loaded.view, { from, to });
  return {
    period: query.period,
    from,
    to,
    spending: view(spendingGroups, spendingTotal),
    income: view(incomeGroups, incomeTotal),
    otherInflows: view(otherGroups, otherInflowsTotal),
    outsideSpending: view(outsideGroups, outsideTotal),
    spendingTotal,
    outsideSpendingTotal: outsideTotal,
    incomeTotal,
    otherInflowsTotal,
    days,
    dailyAverage: average,
    saved: savings.saved,
    missingRates: [
      ...new Set([
        ...spending.missingRates,
        ...outside.missingRates,
        ...income.missingRates,
        ...savings.missingRates,
      ]),
    ].sort(),
    ...(query.series === undefined
      ? {}
      : {
          series: seriesView(
            categorySeries(loaded.view, periods, parentOf, merged),
          ),
        }),
  };
}
