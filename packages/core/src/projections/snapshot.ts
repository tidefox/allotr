import {
  addDays,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { budgetView } from './withdrawal-links.ts';
import {
  accountBalances,
  budgetGroupBalances,
  type GroupBalances,
} from '../ledger/balances.ts';
import { groupsOn } from './pools.ts';
import type { AccountId, CategoryId, Transaction } from '../ledger/types.ts';
import { outsideEntries } from './funding.ts';
import { cycleSpan, cyclesOf, type CycleSpan } from './cycles.ts';
import { totalOn } from './rates.ts';
import { lessReserved, onBudgetSums, owedSums, policiesOf } from './daily.ts';
import type { Settlement } from './policies.ts';
import type { Cycle, LedgerView } from './types.ts';

// A cycle's snapshot (FR-C1) is computed, never stored: a back-dated entry
// into a closed cycle changes it the next time it is read (FR-C6).

export type CategoryTotal = Readonly<{
  categoryId: CategoryId | null;
  amount: Money;
}>;

export type Leftover = Settlement & Readonly<{ leftover: Money }>;

export type CycleSnapshot = Readonly<{
  cycle: Cycle;
  /**
   * The last day it covers: the day it closed (its closing paycheck's day,
   * which it covers only up to that paycheck), or today.
   */
  lastDay: LocalDate;
  /**
   * Just before its opening paycheck (the end of the day before it opened
   * for the first cycle), plus accounts opened during it, so an opening
   * balance is never counted as saved.
   */
  opening: GroupBalances;
  /** Just before its closing paycheck, or at the end of today. */
  closing: GroupBalances;
  income: readonly CategoryTotal[];
  /** Expense legs of the user's own money; outside-funded ones are apart. */
  spending: readonly CategoryTotal[];
  /** Expense legs of outside-funded entries and their undos. */
  outsideSpending: readonly CategoryTotal[];
  /** Available budget at the end, per currency, and what the policy does with it. */
  leftover: readonly Leftover[];
  savingsNetChange: readonly Money[];
}>;

export function byCategory(
  entries: Iterable<readonly [CategoryId | null, Money]>,
): CategoryTotal[] {
  const sums = new Map<
    string,
    { categoryId: CategoryId | null; currency: CurrencyCode; sum: bigint }
  >();
  for (const [categoryId, amount] of entries) {
    const key = `${categoryId ?? ''}\u0000${amount.currency}`;
    const entry = sums.get(key);
    if (entry === undefined) {
      sums.set(key, {
        categoryId,
        currency: amount.currency,
        sum: BigInt(amount.amountMinor),
      });
    } else {
      entry.sum += BigInt(amount.amountMinor);
    }
  }
  return [...sums]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, { categoryId, currency, sum }]) =>
      sum === 0n ? [] : [{ categoryId, amount: money(Number(sum), currency) }],
    );
}

/**
 * The budget-group balances before the period's first entry and after its
 * last. An account opened during the period brings money that was already
 * there, not income or savings: its opening entry (and any undo of it)
 * counts toward the opening balances.
 */
function periodBalances(
  view: LedgerView,
  span: CycleSpan,
  /** The day the opening balances are read on. */
  openingDay: LocalDate,
  lastDay: LocalDate,
): Readonly<{ opening: GroupBalances; closing: GroupBalances }> {
  const openings = new Set(
    view.ledger
      .filter((t) => t.kind === 'opening' && span.has(t))
      .map((t) => t.id),
  );
  const opening = budgetGroupBalances(
    view.chart,
    view.ledger.flatMap((t) => {
      if (span.before(t)) return [t];
      const opens =
        openings.has(t.id) ||
        (t.reversesId !== null && openings.has(t.reversesId));
      return opens && span.notAfter(t)
        ? [{ ...t, occurredOn: openingDay }]
        : [];
    }),
    undefined,
    groupsOn(view, openingDay),
  );
  const closing = budgetGroupBalances(
    view.chart,
    view.ledger.filter(span.notAfter),
    undefined,
    groupsOn(view, lastDay),
  );
  return { opening, closing };
}

// A span of whole days, for periods that are not cycles.
function daysSpan(from: LocalDate, to: LocalDate): CycleSpan {
  const before = (t: Transaction) => t.occurredOn < from;
  const notAfter = (t: Transaction) => t.occurredOn <= to;
  return { before, notAfter, has: (t) => !before(t) && notAfter(t) };
}

/**
 * What the period added to the off-budget accounts, in the default
 * currency at the rate on `to` (the net change, so withdrawals count
 * against it; an account opened in the period adds nothing). Currencies
 * without a rate are left out and named.
 */
export function savedBetween(
  input: LedgerView,
  range: Readonly<{ from: LocalDate; to: LocalDate }>,
  /** The entries the range covers, for a cycle cut at its paycheck. */
  span: CycleSpan = daysSpan(range.from, range.to),
): Readonly<{ saved: Money; missingRates: readonly CurrencyCode[] }> {
  const view = budgetView(input);
  const { opening, closing } = periodBalances(
    view,
    span,
    addDays(range.from, -1),
    range.to,
  );
  const currencies = [
    ...new Set([...opening.off.keys(), ...closing.off.keys()]),
  ];
  const figure = totalOn(
    view.rates,
    currencies.map((currency) =>
      money(
        (closing.off.get(currency)?.amountMinor ?? 0) -
          (opening.off.get(currency)?.amountMinor ?? 0),
        currency,
      ),
    ),
    view.settings.defaultCurrency,
    range.to,
  );
  return { saved: figure.amount, missingRates: figure.missingRates };
}

export function cycleSnapshot(
  view: LedgerView,
  cycle: Cycle,
  today: LocalDate,
  /** `cyclesOf(view, today)`, when the caller already has it. */
  cycles: readonly Cycle[] = cyclesOf(view, today),
): CycleSnapshot {
  const lastDay = cycle.closedOn ?? today;
  const span = cycleSpan(view.ledger, cycles, cycle, today);
  const inCycle = view.ledger.filter(span.has);
  // The first cycle reads its opening at the end of the day before it
  // opened; the others, just before their paycheck on its day.
  const openingDay =
    cycle.cut === null ? addDays(cycle.openedOn, -1) : cycle.openedOn;
  const roleOf = (id: AccountId) => view.chart.get(id)?.systemRole ?? null;
  const outside = outsideEntries(view);
  const legs = (
    role: 'income' | 'expenses',
    sign: number,
    entries: readonly Transaction[] = inCycle,
  ) =>
    byCategory(
      entries.flatMap((t) =>
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

  const { opening, closing } = periodBalances(view, span, openingDay, lastDay);
  // What the cycle saved is a budget figure: a linked withdrawal is not
  // money taken from savings. The balances shown stay the real ones.
  const budget = budgetView(view);
  const savedFrom =
    budget === view
      ? { opening, closing }
      : periodBalances(budget, span, openingDay, lastDay);
  const policies = policiesOf(view);
  // Free money just before the closing paycheck, against this cycle's bills.
  const closed = budgetView({
    ...view,
    ledger: view.ledger.filter(span.notAfter),
  });
  const balances = accountBalances(closed.ledger);
  const leftover = [
    ...lessReserved(
      closed,
      cycles,
      // A bill paid on payday, after the paycheck, is the next cycle's.
      cycle.closedOn === null ? today : addDays(cycle.closedOn, -1),
      onBudgetSums(closed, lastDay, balances),
      owedSums(closed, lastDay, balances),
      cycle,
    ),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, sum]): Leftover => {
      const amount = money(Number(sum), currency);
      const settled =
        sum < 0n
          ? policies.overspend.atPayday(amount)
          : policies.leftover.atPayday(amount);
      return { leftover: amount, ...settled };
    });
  const currencies = [
    ...new Set([
      ...savedFrom.opening.off.keys(),
      ...savedFrom.closing.off.keys(),
    ]),
  ].sort();
  const savingsNetChange = currencies.map((currency) =>
    money(
      (savedFrom.closing.off.get(currency)?.amountMinor ?? 0) -
        (savedFrom.opening.off.get(currency)?.amountMinor ?? 0),
      currency,
    ),
  );

  return {
    cycle,
    lastDay,
    opening,
    closing,
    income: legs('income', -1),
    spending: legs(
      'expenses',
      1,
      inCycle.filter((t) => !outside.has(t.id)),
    ),
    outsideSpending: legs(
      'expenses',
      1,
      inCycle.filter((t) => outside.has(t.id)),
    ),
    leftover,
    savingsNetChange,
  };
}
