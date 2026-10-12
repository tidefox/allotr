import type { TransactionId } from '../ledger/types.ts';
import type { LedgerView } from './types.ts';

// Outside-funded expenses are paid with money that was never the user's to
// budget, such as a gift spent on a purchase. Reports and pace leave them
// out of a cycle's spending; balances, net worth, available and the daily
// number never read the flag (money is money).

/**
 * The entries flagged as outside-funded and their undos. An undo is a
 * reversal and carries no flag of its own, so it follows the entry it
 * undoes; undoing one never moves a report.
 */
export function outsideEntries(view: LedgerView): Set<TransactionId> {
  const outside = new Set<TransactionId>(view.outsideFunded ?? []);
  if (outside.size === 0) return outside;
  for (const t of view.ledger) {
    if (t.reversesId !== null && outside.has(t.reversesId)) outside.add(t.id);
  }
  return outside;
}
