import {
  addDays,
  daysBetween,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { budgetView } from './withdrawal-links.ts';
import { accountIn } from '../ledger/chart.ts';
import type { AccountId, Transaction, TransactionId } from '../ledger/types.ts';
import { cycleEndOn, cyclesOf } from './cycles.ts';
import { accountBalances } from '../ledger/balances.ts';
import {
  add,
  lessReserved,
  onBudgetSums,
  owedSums,
  paceExclusions,
  perDay,
  spentSums,
  toFigure,
  type Sums,
} from './daily.ts';
import type { Cycle, LedgerView } from './types.ts';
import { FORECAST_HISTORY, spendingForecast } from './forecast.ts';

// Day-by-day series for charts (ADR 0020). Every figure comes from the same
// functions as today's figures, so a chart and /v1/today never disagree:
// the row for today carries today's allowance and available budget.

export type CycleDay = Readonly<{
  date: LocalDate;
  /** Pace spending dated that day (pace exclusions applied); null after today. */
  spent: Money | null;
  /** Pace spending from the cycle's first day through `date`; null after today. */
  cumulativeSpent: Money | null;
  /** Even-pace cumulative spending by the end of `date`, rounded down. */
  pace: Money;
  /** Available budget at the end of `date`; null after today. */
  availableEnd: Money | null;
  /** That day's allowance as of its start; null after today. */
  allowance: Money | null;
  /**
   * Where cumulative pace spending is heading (`spendingForecast`); null
   * before today. Today's row repeats `cumulativeSpent`, so the line starts
   * on the real one.
   */
  forecast: Money | null;
  /** Lower and upper 80% bounds of `forecast`; null where it is. */
  forecastLow: Money | null;
  forecastHigh: Money | null;
}>;

export type CycleDays = Readonly<{
  days: readonly CycleDay[];
  /**
   * What the pace line spreads over the cycle: pace spending so far plus
   * what is available, both as of today (or the cycle's last day, once it
   * has closed).
   */
  budget: Money;
  /** Currencies without a rate to the default one, left out of the figures. */
  missingRates: readonly CurrencyCode[];
}>;

// Floors toward negative infinity, as allowances do.
function floorDiv(total: bigint, n: bigint): bigint {
  const quotient = total / n;
  return total % n !== 0n && total < 0n ? quotient - 1n : quotient;
}

/**
 * The even-pace cumulative spending by the end of day `at` (0-based) of a
 * cycle of `count` days that spreads `budget` evenly, rounded down.
 */
function evenPace(budget: bigint, at: number, count: number): bigint {
  return floorDiv(budget * BigInt(at + 1), BigInt(count));
}

/**
 * How far spending is from the even pace today (docs/domain.md "Pace
 * difference"): even pace by the end of today less pace spending so far.
 * Positive is under pace, negative over. It uses the closed form of the
 * `pace` and `cumulativeSpent` of today's row in `cycleDays`, so the three
 * figures on screen always agree, without walking the cycle.
 */
export function paceDiff(
  input: Readonly<{
    cycle: Cycle;
    /** `cycleEndOn(cycle, today)`: payday, or the day after today when overdue. */
    cycleEnd: LocalDate;
    today: LocalDate;
    /** Pace spending from the cycle's first day through today. */
    paceSpent: Money;
    /** Available budget now. */
    available: Money;
  }>,
): Money {
  const { cycle, today, paceSpent, available } = input;
  const count = Math.max(1, daysBetween(cycle.openedOn, input.cycleEnd));
  const at = Math.min(count - 1, daysBetween(cycle.openedOn, today));
  const budget = BigInt(paceSpent.amountMinor + available.amountMinor);
  return money(
    Number(evenPace(budget, at, count)) - paceSpent.amountMinor,
    paceSpent.currency,
  );
}

/**
 * One row per day of `cycle`, from the day it opened to the day before
 * payday (through today while payday is overdue, or the day before it
 * closed once it has). Figures are in the default currency at each day's
 * rate.
 */
export function cycleDays(
  input: LedgerView,
  cycle: Cycle,
  today: LocalDate,
): CycleDays {
  const view = budgetView(input);
  const cycles = cyclesOf(view, today);
  const end = cycle.closedOn ?? cycleEndOn(cycle, today);
  const lastDay = addDays(end, -1);
  const asOf = today < lastDay ? today : lastDay;
  const count = Math.max(1, daysBetween(cycle.openedOn, end));
  const excluded = paceExclusions(view);
  const currency = view.settings.defaultCurrency;
  const missing = new Set<CurrencyCode>();
  const figure = (sums: Sums, date: LocalDate) => {
    const result = toFigure(view, sums, date);
    for (const code of result.missingRates) missing.add(code);
    return result.amount;
  };

  const past: {
    date: LocalDate;
    spent: Money;
    cumulativeSpent: Money;
    availableEnd: Money;
    allowance: Money;
  }[] = [];
  const cumulative: Sums = new Map();
  // Balances are folded once: to the day before the cycle, then day by day.
  const balances = new Map(
    accountBalances(view.ledger, addDays(cycle.openedOn, -1)),
  );
  const byDay = new Map<LocalDate, Transaction[]>();
  for (const t of view.ledger) {
    if (t.occurredOn < cycle.openedOn || t.occurredOn > asOf) continue;
    byDay.set(t.occurredOn, [...(byDay.get(t.occurredOn) ?? []), t]);
  }
  for (let at = 0; at < count; at += 1) {
    const date = addDays(cycle.openedOn, at);
    if (date > asOf) break;
    for (const t of byDay.get(date) ?? []) {
      for (const { accountId, amount } of t.postings) {
        const before = balances.get(accountId)?.amountMinor ?? 0;
        balances.set(
          accountId,
          money(before + amount.amountMinor, amount.currency),
        );
      }
    }
    const { spent, kept } = spentSums(view, date, date, excluded);
    for (const [code, amount] of kept) add(cumulative, code, amount);
    const available = lessReserved(
      view,
      cycles,
      date,
      onBudgetSums(view, date, balances),
      owedSums(view, date, balances),
    );
    // The start of the day counts everything dated that day but spending,
    // as today's allowance does.
    const start: Sums = new Map(available);
    for (const [code, amount] of spent) add(start, code, amount);
    const daysLeft = Math.max(1, daysBetween(date, cycleEndOn(cycle, date)));
    past.push({
      date,
      spent: figure(kept, date),
      cumulativeSpent: figure(cumulative, date),
      availableEnd: figure(available, date),
      allowance: perDay(figure(start, date), daysLeft),
    });
  }

  const latest = past.at(-1);
  const budget = BigInt(
    latest === undefined
      ? 0
      : latest.cumulativeSpent.amountMinor + latest.availableEnd.amountMinor,
  );
  const anchor = latest?.cumulativeSpent.amountMinor ?? 0;
  const forecast = spendingForecast(
    spendingHistory(view, cycle, past, excluded),
    Array.from({ length: count - past.length }, (_, i) =>
      addDays(cycle.openedOn, past.length + i),
    ),
  );
  const days = Array.from({ length: count }, (_, at): CycleDay => {
    const pace = money(Number(evenPace(budget, at, count)), currency);
    const row = past[at];
    if (row !== undefined) {
      const start = at === past.length - 1 ? row.cumulativeSpent : null;
      return {
        ...row,
        pace,
        forecast: start,
        forecastLow: start,
        forecastHigh: start,
      };
    }
    const point = forecast[at - past.length];
    const ahead = (offset: number | undefined) =>
      // Nothing to project from before the first day with figures.
      latest === undefined || offset === undefined
        ? null
        : money(anchor + offset, currency);
    return {
      date: addDays(cycle.openedOn, at),
      spent: null,
      cumulativeSpent: null,
      pace,
      availableEnd: null,
      allowance: null,
      forecast: ahead(point?.mid),
      forecastLow: ahead(point?.low),
      forecastHigh: ahead(point?.high),
    };
  });
  return {
    days,
    budget: money(Number(budget), currency),
    missingRates: [...missing].sort(),
  };
}

/**
 * Daily pace spending the forecast learns from: the `FORECAST_HISTORY` full
 * days before the cycle's latest day with figures, reaching back into
 * earlier cycles but not before the ledger's first entry. Today's partial
 * day counts only when there is no full day yet.
 */
function spendingHistory(
  view: LedgerView,
  cycle: Cycle,
  past: readonly { date: LocalDate; spent: Money }[],
  excluded: ReadonlySet<TransactionId>,
): { date: LocalDate; spent: number }[] {
  const latest = past.at(-1);
  if (latest === undefined) return [];
  let first = latest.date;
  for (const t of view.ledger) if (t.occurredOn < first) first = t.occurredOn;
  const from = addDays(latest.date, -FORECAST_HISTORY);
  const before: { date: LocalDate; spent: number }[] = [];
  for (
    let date = from > first ? from : first;
    date < cycle.openedOn;
    date = addDays(date, 1)
  ) {
    const { kept } = spentSums(view, date, date, excluded);
    before.push({ date, spent: toFigure(view, kept, date).amount.amountMinor });
  }
  const full = [
    ...before,
    ...past.slice(0, -1).map((row) => ({
      date: row.date,
      spent: row.spent.amountMinor,
    })),
  ].slice(-FORECAST_HISTORY);
  return full.length > 0
    ? full
    : [{ date: latest.date, spent: latest.spent.amountMinor }];
}

/**
 * An account's balance at the end of each day from `from` through `to`, in
 * its own currency, from one pass over the ledger.
 */
export function balanceHistory(
  view: LedgerView,
  id: AccountId,
  from: LocalDate,
  to: LocalDate,
): { date: LocalDate; balance: Money }[] {
  const account = accountIn(view.chart, id);
  let balance = 0n;
  const byDay = new Map<LocalDate, bigint>();
  for (const t of view.ledger) {
    if (t.occurredOn > to) continue;
    for (const posting of t.postings) {
      if (posting.accountId !== id) continue;
      const amount = BigInt(posting.amount.amountMinor);
      if (t.occurredOn < from) balance += amount;
      else byDay.set(t.occurredOn, (byDay.get(t.occurredOn) ?? 0n) + amount);
    }
  }
  const points: { date: LocalDate; balance: Money }[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    balance += byDay.get(date) ?? 0n;
    points.push({ date, balance: money(Number(balance), account.currency) });
  }
  return points;
}
