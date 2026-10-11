import {
  money,
  type AccountHistoryView,
  type Money,
  type ReconcileResultView,
} from '@allotr/shared';
import type { ChartTick } from '@/charts/chart';
import { niceTicks, type Point } from '@/charts/math';
import { formatTerminalDate } from '@/features/today/format';
import type { ReconcileMode } from '@/features/accounts/reconcile-draft';
import { formatMoneyShort } from '@/lib/format-money';

// The account detail as view models: positions for the chart and the words
// for a reconcile result. Every amount is the server's; the only change made
// to one is its sign, so a debt reads as "owed" and a difference as a size.

export type HistoryChart = Readonly<{
  points: readonly Point[];
  yTicks: readonly ChartTick[];
  xTicks: readonly ChartTick[];
}>;

export function historyChart(
  history: AccountHistoryView['points'],
  locale: string,
): HistoryChart {
  const points = history.map((p, x) => ({ x, y: p.balance.amountMinor }));
  const first = history[0];
  if (first === undefined) return { points, yTicks: [], xTicks: [] };
  const ys = points.map((p) => p.y);
  // Axis positions from zero (or below, for a debt) to the top, as in the
  // mockup's three-step axis; none of them is an amount anyone holds.
  const yTicks = niceTicks(Math.min(0, ...ys), Math.max(0, ...ys), 3).map(
    (value) => ({
      value,
      label: formatMoneyShort(money(value, first.balance.currency), locale),
    }),
  );
  const mid = Math.floor((history.length - 1) / 2);
  const xs = [...new Set([0, mid, history.length - 1])];
  const xTicks = xs.map((value) => ({
    value,
    label: formatTerminalDate(history[value]?.date ?? first.date, locale),
  }));
  return { points, yTicks, xTicks };
}

export const flip = (m: Money): Money => money(-m.amountMinor, m.currency);
const size = (m: Money): Money => money(Math.abs(m.amountMinor), m.currency);

export type ReconcileOutcome =
  | Readonly<{ kind: 'match' }>
  | Readonly<{
      kind: 'difference';
      /** Which sentence says it; `less` and `more` are for balances. */
      says: 'less' | 'more' | 'owedMore' | 'owedLess';
      /** How an adjustment would be recorded. */
      adjust: 'expense' | 'income';
      /** The size of the difference, unsigned. */
      amount: Money;
      /** The two sides as the form asked for them. */
      ledger: Money;
      bank: Money;
    }>;

/** What a compare result means, in the terms of the form the user filled in. */
export function reconcileOutcome(
  result: ReconcileResultView,
  mode: ReconcileMode,
): ReconcileOutcome {
  if (result.reconciled || result.difference.amountMinor === 0)
    return { kind: 'match' };
  const lower = result.difference.amountMinor < 0;
  const owed = mode === 'owed';
  return {
    kind: 'difference',
    says: owed ? (lower ? 'owedMore' : 'owedLess') : lower ? 'less' : 'more',
    adjust: lower ? 'expense' : 'income',
    amount: size(result.difference),
    ledger: owed ? flip(result.ledgerBalance) : result.ledgerBalance,
    bank: owed ? flip(result.stated) : result.stated,
  };
}
