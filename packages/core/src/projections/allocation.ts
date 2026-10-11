import {
  addDays,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { accountBalances } from '../ledger/balances.ts';
import { cycleOn, cyclesOf } from './cycles.ts';
import {
  add,
  availableSums,
  billPaymentEntries,
  onBudgetSums,
  owedSums,
  spentSums,
  toFigure,
  type Sums,
} from './daily.ts';
import { cycleSnapshot } from './snapshot.ts';
import { groupsOn } from './pools.ts';
import { basisPointShares } from './shares.ts';
import type { Cycle, LedgerView } from './types.ts';

// How the open cycle's on-budget money divides (docs/domain.md "Cycle
// allocation", docs/ui.md §8). Sums stay per currency; each part is
// converted once to the default currency (ADR 0010), and `start` is the
// sum of the converted parts so the six always add up exactly.

export type CycleAllocation = Readonly<{
  /**
   * What the open cycle had to work with: on-budget money at the end of the
   * day before it opened (accounts opened during it counted from the start),
   * plus the income recorded since. Always exactly the sum of the six parts.
   */
  start: Money;
  /** Linked bill payments this cycle, less their undos. */
  paidBills: Money;
  /**
   * Money actually moved to savings this cycle: transfers from on-budget
   * accounts into off-budget (savings pool) accounts, and the balance of
   * accounts moved into a savings pool. Negative when more came back than
   * went.
   */
  savings: Money;
  /** Spending this cycle other than linked bill payments, less undos. */
  spent: Money;
  /** Unpaid bills reserved, and what the user owes people, now. */
  reserved: Money;
  /** On-budget money less `reserved`, now: the `available` figure. */
  free: Money;
  /**
   * What `start` is left with after the other five: money lent, income
   * that is not a paycheck, adjustments and anything else that changed the
   * on-budget total. Zero when everything is explained; may be negative.
   */
  other: Money;
  /**
   * Each part's share of `start` in basis points (10 000 is all of it): 0
   * for a part that is not positive, and for every part when `start` is not
   * positive. Largest-remainder rounding, so the shares add up to 10 000
   * whenever no part is negative.
   */
  shareBp: AllocationShares;
  /** Currencies without a rate to the default one, left out. */
  missingRates: readonly CurrencyCode[];
}>;

export type AllocationShares = Readonly<
  Record<
    'paidBills' | 'savings' | 'spent' | 'reserved' | 'free' | 'other',
    number
  >
>;

/**
 * Money moved into savings during `cycle` up to `today`, per currency: for
 * each day, what on-budget accounts gave to transfers that reach an
 * off-budget account (entries touching Expenses or Income are spending or
 * income, not savings), plus the balance of accounts that joined a savings
 * pool, less that of accounts that left one.
 */
function movedToSavings(
  view: LedgerView,
  cycle: Cycle,
  today: LocalDate,
): Sums {
  const moved: Sums = new Map();
  const balances = new Map(
    accountBalances(view.ledger, addDays(cycle.openedOn, -1)),
  );
  const byDay = new Map<LocalDate, (typeof view.ledger)[number][]>();
  for (const t of view.ledger) {
    if (t.occurredOn < cycle.openedOn || t.occurredOn > today) continue;
    byDay.set(t.occurredOn, [...(byDay.get(t.occurredOn) ?? []), t]);
  }
  let before = groupsOn(view, addDays(cycle.openedOn, -1));
  for (let date = cycle.openedOn; date <= today; date = addDays(date, 1)) {
    const groups = groupsOn(view, date);
    for (const [id, group] of groups) {
      const was = before.get(id);
      const held = balances.get(id);
      if (held === undefined || was === group) continue;
      const amount = BigInt(held.amountMinor);
      if (group === 'off') add(moved, held.currency, amount);
      else add(moved, held.currency, -amount);
    }
    for (const t of byDay.get(date) ?? []) {
      let toSavings = false;
      let plain = true;
      const onSide: Sums = new Map();
      for (const p of t.postings) {
        const role = view.chart.get(p.accountId)?.systemRole;
        if (role === 'expenses' || role === 'income') plain = false;
        const group = groups.get(p.accountId);
        if (group === 'off') toSavings = true;
        if (group === 'on') {
          add(onSide, p.amount.currency, -BigInt(p.amount.amountMinor));
        }
      }
      if (toSavings && plain) {
        for (const [currency, amount] of onSide) add(moved, currency, amount);
      }
      for (const p of t.postings) {
        const held = balances.get(p.accountId);
        balances.set(
          p.accountId,
          money(
            (held?.amountMinor ?? 0) + p.amount.amountMinor,
            p.amount.currency,
          ),
        );
      }
    }
    before = groups;
  }
  return moved;
}

/**
 * The unpaid reserve split into bills and what the user owes people
 * (ADR 0024). `bills` is `reserved − ious`, so the two always add up to the
 * `reserved` figure of the daily numbers.
 */
export function reservedParts(
  view: LedgerView,
  today: LocalDate,
): Readonly<{
  bills: Money;
  ious: Money;
  missingRates: readonly CurrencyCode[];
}> {
  const cycles = cyclesOf(view, today);
  const onBudget = toFigure(view, onBudgetSums(view, today), today);
  const free = toFigure(view, availableSums(view, cycles, today), today);
  const ious = toFigure(view, owedSums(view, today), today);
  const reserved = onBudget.amount.amountMinor - free.amount.amountMinor;
  return {
    bills: money(
      reserved - ious.amount.amountMinor,
      view.settings.defaultCurrency,
    ),
    ious: ious.amount,
    missingRates: [
      ...new Set([
        ...onBudget.missingRates,
        ...free.missingRates,
        ...ious.missingRates,
      ]),
    ].sort(),
  };
}

/** The allocation of the cycle holding `today`. */
export function cycleAllocation(
  view: LedgerView,
  today: LocalDate,
): CycleAllocation {
  const cycles = cyclesOf(view, today);
  const cycle = cycleOn(cycles, today);

  const startNative: Sums = new Map();
  const snapshot = cycleSnapshot(view, cycle, today, cycles);
  for (const [currency, amount] of snapshot.opening.on) {
    add(startNative, currency, BigInt(amount.amountMinor));
  }
  for (const { amount } of snapshot.income) {
    add(startNative, amount.currency, BigInt(amount.amountMinor));
  }

  const onBudget = onBudgetSums(view, today);
  const free = availableSums(view, cycles, today);
  const reserved: Sums = new Map(onBudget);
  for (const [currency, amount] of free) add(reserved, currency, -amount);

  const { spent: all, kept: spent } = spentSums(
    view,
    cycle.openedOn,
    today,
    billPaymentEntries(view),
  );
  const paid: Sums = new Map(all);
  for (const [currency, amount] of spent) add(paid, currency, -amount);

  // Whatever the other parts do not explain is `other`, so the parts add up
  // per currency by construction.
  const savings = movedToSavings(view, cycle, today);
  const other: Sums = new Map(startNative);
  for (const parts of [paid, savings, spent, reserved, free]) {
    for (const [currency, amount] of parts) add(other, currency, -amount);
  }

  const figures = {
    paidBills: toFigure(view, paid, today),
    savings: toFigure(view, savings, today),
    spent: toFigure(view, spent, today),
    reserved: toFigure(view, reserved, today),
    free: toFigure(view, free, today),
    other: toFigure(view, other, today),
  };
  const total = Object.values(figures).reduce(
    (sum, figure) => sum + figure.amount.amountMinor,
    0,
  );
  const [sPaid, sSavings, sSpent, sReserved, sFree, sOther] = basisPointShares(
    [
      figures.paidBills.amount.amountMinor,
      figures.savings.amount.amountMinor,
      figures.spent.amount.amountMinor,
      figures.reserved.amount.amountMinor,
      figures.free.amount.amountMinor,
      figures.other.amount.amountMinor,
    ],
    total,
  );
  return {
    start: money(total, view.settings.defaultCurrency),
    paidBills: figures.paidBills.amount,
    savings: figures.savings.amount,
    spent: figures.spent.amount,
    reserved: figures.reserved.amount,
    free: figures.free.amount,
    other: figures.other.amount,
    shareBp: {
      paidBills: sPaid ?? 0,
      savings: sSavings ?? 0,
      spent: sSpent ?? 0,
      reserved: sReserved ?? 0,
      free: sFree ?? 0,
      other: sOther ?? 0,
    },
    missingRates: [
      ...new Set(Object.values(figures).flatMap((f) => f.missingRates)),
    ].sort(),
  };
}
