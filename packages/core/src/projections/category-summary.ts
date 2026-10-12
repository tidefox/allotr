import {
  daysBetween,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { AccountId, CategoryId } from '../ledger/types.ts';
import { perDay } from './daily.ts';
import { outsideEntries } from './funding.ts';
import { totalOn } from './rates.ts';
import { byCategory, type CategoryTotal } from './snapshot.ts';
import type { LedgerView } from './types.ts';

// Category summaries (FR-W2): what a period spent or earned per category,
// with a subcategory counted in its parent. Computed, never stored; the web
// app only shows the figures (architecture §4).

/** One category, or the entries without one (`categoryId` null). */
export type SummaryCategoryNode = CategoryTotal;

/** A top-level category with everything under it, largest first. */
export type CategoryGroup = Readonly<{
  categoryId: CategoryId | null;
  /** The sum of `children`. */
  amount: Money;
  /**
   * The subcategories with figures. Entries booked directly on the parent
   * appear as a child with the parent's own id.
   */
  children: readonly SummaryCategoryNode[];
}>;

const bigger = (a: SummaryCategoryNode, b: SummaryCategoryNode) =>
  b.amount.amountMinor - a.amount.amountMinor ||
  (a.categoryId ?? '').localeCompare(b.categoryId ?? '');

/**
 * Rolls category totals up to their top-level parents. Every total is in
 * one currency. `parentOf` maps a subcategory to its parent; a category
 * absent from it, or mapped to null, is top level.
 */
export function rollUpCategories(
  totals: readonly SummaryCategoryNode[],
  parentOf: ReadonlyMap<CategoryId, CategoryId | null>,
): CategoryGroup[] {
  const groups = new Map<CategoryId | null, SummaryCategoryNode[]>();
  for (const total of totals) {
    const top =
      total.categoryId === null
        ? null
        : (parentOf.get(total.categoryId) ?? total.categoryId);
    groups.set(top, [...(groups.get(top) ?? []), total]);
  }
  return [...groups]
    .map(([categoryId, nodes]) => {
      const currency = nodes[0]?.amount.currency;
      const sum = nodes.reduce((acc, n) => acc + n.amount.amountMinor, 0);
      return {
        categoryId,
        amount: money(sum, currency ?? 'USD'),
        // A top-level category with no children is its own only node.
        children: (categoryId === null ? [] : [...nodes]).sort(bigger),
      };
    })
    .sort(bigger);
}

/**
 * Spending (`expenses`) or income per category for entries dated from
 * `from` to `to`, in the default currency at the rate of `to`. A merged
 * category counts as the one it merged into. Currencies without a rate are
 * left out and named. Entries paid with outside money (docs/domain.md
 * "Funding") are apart: `own`, the default, leaves them out and `outside`
 * is only them.
 */
export function categoryTotalsBetween(
  view: LedgerView,
  range: Readonly<{ from: LocalDate; to: LocalDate }>,
  role: 'expenses' | 'income',
  mergedInto: ReadonlyMap<CategoryId, CategoryId> = new Map(),
  funding: 'own' | 'outside' = 'own',
): Readonly<{ totals: SummaryCategoryNode[]; missingRates: CurrencyCode[] }> {
  const outside = outsideEntries(view);
  const roleOf = (id: AccountId) => view.chart.get(id)?.systemRole ?? null;
  const sign = role === 'expenses' ? 1 : -1;
  const native = byCategory(
    view.ledger
      .filter(
        (t) =>
          t.occurredOn >= range.from &&
          t.occurredOn <= range.to &&
          outside.has(t.id) === (funding === 'outside'),
      )
      .flatMap((t) =>
        t.postings
          .filter((p) => roleOf(p.accountId) === role)
          .map(
            (p) =>
              [
                p.categoryId,
                money(sign * p.amount.amountMinor, p.amount.currency),
              ] as const,
          ),
      ),
  );
  const target = view.settings.defaultCurrency;
  const missing = new Set<CurrencyCode>();
  const merged = new Map<CategoryId | null, Money[]>();
  for (const { categoryId, amount } of native) {
    const key =
      categoryId === null ? null : (mergedInto.get(categoryId) ?? categoryId);
    merged.set(key, [...(merged.get(key) ?? []), amount]);
  }
  const totals = [...merged]
    .map(([categoryId, amounts]) => {
      const result = totalOn(view.rates, amounts, target, range.to);
      for (const currency of result.missingRates) missing.add(currency);
      return { categoryId, amount: result.amount };
    })
    .filter(({ amount }) => amount.amountMinor !== 0)
    .sort(bigger);
  return { totals, missingRates: [...missing].sort() };
}

/** The sum of the groups' amounts, in `currency` (zero when there are none). */
export function categoryGroupsTotal(
  groups: readonly CategoryGroup[],
  currency: CurrencyCode,
): Money {
  return money(
    groups.reduce((sum, group) => sum + group.amount.amountMinor, 0),
    currency,
  );
}

/**
 * A period's average per day: `total` over the days of the period so far,
 * from `range.from` to the earlier of `range.to` and `today`, counting both
 * ends (at least one). Rounds down, as the daily number does, so it never
 * promises more than there is; the spare minor units are in the total.
 */
export function dailyAverage(
  total: Money,
  range: Readonly<{ from: LocalDate; to: LocalDate }>,
  today: LocalDate,
): Readonly<{ days: number; average: Money }> {
  const last = range.to < today ? range.to : today;
  const days = Math.max(1, daysBetween(range.from, last) + 1);
  return { days, average: perDay(total, days) };
}
