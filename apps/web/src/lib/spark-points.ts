import type { Money } from '@allotr/shared';

/** An account's end-of-day balances as chart positions, oldest first. */
export function sparkPoints(
  points: readonly { balance: Money }[],
): { x: number; y: number }[] {
  return points.map((p, x) => ({ x, y: p.balance.amountMinor }));
}
