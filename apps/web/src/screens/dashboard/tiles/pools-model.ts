import type {
  CategoryIcon,
  Money,
  PoolKind,
  PoolListItemView,
} from '@allotr/shared';
import type { SeriesColor } from '@/components/bars';
import { poolLooks } from '@/lib/pool-style';
import { barFraction } from '@/shell/summary-math';

// View model for the pools tile. Fractions only place bars; every figure on
// screen is a server amount (docs/ui.md §4).

export type PoolRow = Readonly<{
  id: string;
  name: string;
  kind: PoolKind;
  balance: Money;
  /** The pool's own daily switch. */
  checked: boolean;
  /** The Budget pool always counts; the server refuses to switch it off. */
  fixed: boolean;
  /** The stored colour, else the series at the pool's place. */
  color: SeriesColor;
  /** The stored icon; null shows the pool kind's own. */
  icon: CategoryIcon | null;
  /** Its balance's share of the pools' positive balances, from the server. */
  shareBp: number;
  /** On-budget pools only; the bar is full when `left` passes `start`. */
  cycle: Readonly<{ start: Money; left: Money; fraction: number }> | null;
}>;

export function poolRows(pools: readonly PoolListItemView[]): PoolRow[] {
  const looks = poolLooks(pools);
  const open = pools.filter((p) => !p.archived);
  return open.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    balance: p.balance.amount,
    checked: p.countsTowardDaily,
    fixed: p.defaultFor === 'on',
    color: looks.get(p.id)?.colour ?? 'series-1',
    icon: looks.get(p.id)?.icon ?? null,
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
