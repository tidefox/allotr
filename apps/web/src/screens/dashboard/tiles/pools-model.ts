import type { Money, PoolListItemView } from '@allotr/shared';
import type { SeriesColor } from '@/components/bars';
import { barFraction } from '@/shell/summary-math';

// View model for the pools tile. Fractions only place bars; every figure on
// screen is a server amount (docs/ui.md §4).

const COLORS: readonly SeriesColor[] = [
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'series-6',
  'series-7',
  'series-8',
];

export type PoolRow = Readonly<{
  id: string;
  name: string;
  balance: Money;
  /** The pool's own daily switch. */
  checked: boolean;
  /** The Budget pool always counts; the server refuses to switch it off. */
  fixed: boolean;
  color: SeriesColor;
  /** Its balance's share of the pools' positive balances, from the server. */
  shareBp: number;
  /** On-budget pools only; the bar is full when `left` passes `start`. */
  cycle: Readonly<{ start: Money; left: Money; fraction: number }> | null;
}>;

export function poolRows(pools: readonly PoolListItemView[]): PoolRow[] {
  const open = pools.filter((p) => !p.archived);
  return open.map((p, index) => ({
    id: p.id,
    name: p.name,
    balance: p.balance.amount,
    checked: p.countsTowardDaily,
    fixed: p.defaultFor === 'on',
    color: COLORS[index % COLORS.length] ?? 'series-1',
    shareBp: p.shareBp,
    cycle:
      p.cycle === null
        ? null
        : {
            start: p.cycle.start.amount,
            left: p.cycle.left.amount,
            fraction: barFraction(
              p.cycle.left.amount.amountMinor,
              p.cycle.start.amount.amountMinor,
            ),
          },
  }));
}
