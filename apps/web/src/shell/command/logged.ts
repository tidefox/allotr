import type {
  AccountView,
  CategoryView,
  TransactionView,
} from '@allotr/shared';
import { ledgerRows } from '@/features/ledger/rows';
import type { LoggedEntry } from './store.ts';

/**
 * The result line's entry for a transaction the server just created. Every
 * figure and name is read from the server's entry (its postings), never
 * built from what was typed. Null for kinds the result line does not show.
 */
export function loggedFromTransaction(
  entry: TransactionView,
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): LoggedEntry | null {
  if (
    entry.kind !== 'expense' &&
    entry.kind !== 'income' &&
    entry.kind !== 'transfer'
  )
    return null;
  const [row] = ledgerRows([entry], accounts, categories);
  if (row?.amount == null) return null;
  return {
    id: entry.id,
    amount: row.amount,
    kind: entry.kind,
    accountName: row.accounts.join(' → '),
    categoryLabel: row.title,
  };
}
