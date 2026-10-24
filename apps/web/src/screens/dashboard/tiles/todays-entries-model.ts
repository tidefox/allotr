import type {
  AccountView,
  CategoryView,
  TransactionView,
} from '@allotr/shared';
import { entryRows, type EntryRow } from '@/features/today/entries';
import { t } from '@/messages/t';
import type { AmountKind } from '@/components/amount';

// Today's entries for the dashboard tile, in the order the server sent
// them, each with the time of day it was given.

export interface DashboardEntry extends EntryRow {
  /** `HH:MM`, or null when the entry has no time of day. */
  time: string | null;
  /** The note, else the category, else what kind of entry it is. */
  payee: string;
  /** The category, only when the payee column is not already showing it. */
  category: string | null;
}

export function dashboardEntries(
  transactions: readonly TransactionView[],
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): DashboardEntry[] {
  const times = new Map(transactions.map((e) => [e.id, e.occurredTime]));
  return entryRows(transactions, accounts, categories).map((row) => {
    const payee = row.note ?? row.title ?? t(`ledger.kinds.${row.kind}`);
    return {
      ...row,
      time: times.get(row.id)?.slice(0, 5) ?? null,
      payee,
      category: row.title === payee ? null : row.title,
    };
  });
}

/**
 * How an entry's amount is drawn: a move between the user's own accounts
 * has no direction, anything else is out or in. This is the ledger's rule
 * too, so an entry reads the same on the dashboard and in the list.
 */
export function entryAmountKind(
  row: Pick<EntryRow, 'moves' | 'amount'>,
): AmountKind {
  if (row.moves) return 'transfer';
  return (row.amount?.amountMinor ?? 0) < 0 ? 'expense' : 'income';
}
