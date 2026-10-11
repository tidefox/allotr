import type {
  AccountView,
  CategoryColour,
  CategoryIcon,
  Money,
  PoolView,
} from '@allotr/shared';
import type { SeriesColor } from '@/components/bars';
import { poolLooks } from '@/lib/pool-style';
import { barFraction } from '@/shell/summary-math';

// View model for the Budget · pools sub-tab. Every figure is the server's;
// this only groups accounts under their pool and sizes the "left of" bar.

export type PoolTile = Readonly<{
  id: string;
  name: string;
  kind: PoolView['kind'];
  balance: Money;
  /** The stored colour, else the series at the pool's place. */
  color: SeriesColor;
  /** The stored icon; null shows the pool kind's own. */
  icon: CategoryIcon | null;
  /** What the user stored, null for Auto, for the style sheet. */
  storedColour: CategoryColour | null;
  storedIcon: CategoryIcon | null;
  /** The pool's own daily switch. */
  checked: boolean;
  /** The Budget pool always counts; the server refuses to switch it off. */
  fixed: boolean;
  accounts: readonly AccountView[];
  /** On-budget pools only; the bar is full when `left` passes `start`. */
  cycle: Readonly<{ start: Money; left: Money; fraction: number }> | null;
}>;

export function poolTiles(
  pools: readonly PoolView[],
  accounts: readonly AccountView[],
): PoolTile[] {
  const looks = poolLooks(pools);
  return pools
    .filter((pool) => !pool.archived)
    .map((pool) => ({
      id: pool.id,
      color: looks.get(pool.id)?.colour ?? 'series-1',
      icon: looks.get(pool.id)?.icon ?? null,
      storedColour: pool.colour,
      storedIcon: pool.icon,
      name: pool.name,
      kind: pool.kind,
      balance: pool.balance.amount,
      checked: pool.countsTowardDaily,
      fixed: pool.defaultFor === 'on',
      accounts: accounts.filter(
        (account) => !account.archived && account.poolId === pool.id,
      ),
      cycle:
        pool.cycle === null
          ? null
          : {
              start: pool.cycle.start.amount,
              left: pool.cycle.left.amount,
              fraction: barFraction(
                pool.cycle.left.amount.amountMinor,
                pool.cycle.start.amount.amountMinor,
              ),
            },
    }));
}
