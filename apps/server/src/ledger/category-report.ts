import {
  categoryGroupsTotal,
  categoryId,
  categorySeries,
  categoryTotalsBetween,
  cyclePeriods,
  dailyAverage,
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
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
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

const view = (groups: CategoryGroup[]) =>
  groups.map((group) => ({
    categoryId: group.categoryId,
    amount: group.amount,
    children: group.children.map((child) => ({
      categoryId: child.categoryId,
      amount: child.amount,
    })),
  }));

// The core result is readonly; the API view is plain arrays.
const seriesView = (series: CategorySeries): CategorySeriesView => ({
  periods: series.periods.map(({ from, to }) => ({ from, to })),
  groups: series.groups.map((g) => ({
    categoryId: g.categoryId,
    points: [...g.points],
  })),
  totals: [...series.totals],
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
  const income = categoryTotalsBetween(
    loaded.view,
    { from, to },
    'income',
    merged,
  );
  const currency = loaded.view.settings.defaultCurrency;
  const spendingGroups = rollUpCategories(spending.totals, parentOf);
  const incomeGroups = rollUpCategories(income.totals, parentOf);
  const spendingTotal = categoryGroupsTotal(spendingGroups, currency);
  const { days, average } = dailyAverage(spendingTotal, { from, to }, today);
  const savings = savedBetween(loaded.view, { from, to });
  return {
    period: query.period,
    from,
    to,
    spending: view(spendingGroups),
    income: view(incomeGroups),
    spendingTotal,
    incomeTotal: categoryGroupsTotal(incomeGroups, currency),
    days,
    dailyAverage: average,
    saved: savings.saved,
    missingRates: [
      ...new Set([
        ...spending.missingRates,
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
