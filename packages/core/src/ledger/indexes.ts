import { compareEntries } from './order.ts';
import type { Transaction, TransactionId } from './types.ts';

// Ledger-wide derivations that many projections need and that cost a pass
// (or a sort) over every entry. They are pure functions of the ledger, so the
// result is remembered per ledger array: a request that asks for the same
// figure for many accounts or days derives each of these once, and the
// loaded-ledger cache in the store, which hands out one array until a write,
// shares them between requests.
//
// Safe because ledgers are readonly and append-only (docs/domain.md): nothing
// observable changes, and a ledger that grew since it was remembered (a test
// pushing onto an array it keeps using) is told apart by its length and
// derived again. Results are readonly so no caller can corrupt the memo.

type Memo<T> = WeakMap<
  readonly Transaction[],
  Readonly<{ length: number; value: T }>
>;

function memoised<T>(
  derive: (ledger: readonly Transaction[]) => T,
): (ledger: readonly Transaction[]) => T {
  const memo: Memo<T> = new WeakMap();
  return (ledger) => {
    const known = memo.get(ledger);
    if (known?.length === ledger.length) return known.value;
    const value = derive(ledger);
    memo.set(ledger, { length: ledger.length, value });
    return value;
  };
}

/** The entries that some reversal undoes (the reversals themselves excluded). */
export const reversedIds: (
  ledger: readonly Transaction[],
) => ReadonlySet<TransactionId> = memoised(
  (ledger) =>
    new Set(
      ledger.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])),
    ),
);

/** Every entry, oldest first, in the order of entries within a day. */
export const entriesInOrder: (
  ledger: readonly Transaction[],
) => readonly Transaction[] = memoised((ledger) =>
  [...ledger].sort(compareEntries),
);

/**
 * Budget switches that were not reversed, oldest first, in the order of
 * entries within a day (order.ts).
 */
export const activeSwitches: (
  ledger: readonly Transaction[],
) => readonly Transaction[] = memoised((ledger) => {
  const reversed = reversedIds(ledger);
  return entriesInOrder(ledger).filter(
    (t) => t.budgetSwitch !== null && !reversed.has(t.id),
  );
});
