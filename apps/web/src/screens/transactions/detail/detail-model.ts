import {
  type AccountView,
  type CategoryView,
  type EntryBudgetLineView,
  type TransactionView,
} from '@allotr/shared';
import { isEditable } from '@/features/ledger/edit-draft';
import { ledgerRows, type LedgerRow } from '@/features/ledger/rows';
import { categoryTitle } from '@/lib/entry-categories';

export type CoverLine = EntryBudgetLineView;

// What the detail pane shows of one entry, and which actions it offers. Pure:
// every figure is the server's, and nothing here adds or converts money.

export interface EntryDetailModel {
  row: LedgerRow;
  /** The payee is the note (the payee report compares it that way). */
  payee: string | null;
  /** "Parent › Category", or the split's names; null for none. */
  categoryPath: string | null;
  /** Account names: one, or from and to for a transfer. */
  accounts: string[];
  deleted: boolean;
  edited: boolean;
  /** Replaced by a newer version, so this one is history. */
  superseded: boolean;
  canEdit: boolean;
  canSplit: boolean;
  /** A logged expense in a category can be split with people. */
  canIou: boolean;
  canCover: boolean;
  canDelete: boolean;
  canRestore: boolean;
}

/** "Parent › Child" for a single category, else the entry's own title. */
export function categoryPath(
  entry: TransactionView,
  categories: readonly CategoryView[],
): string | null {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const own =
    entry.categoryId === null ? undefined : byId.get(entry.categoryId);
  if (own === undefined) return categoryTitle(entry, names) ?? null;
  const parent = own.parentId === null ? undefined : byId.get(own.parentId);
  return parent === undefined ? own.name : `${parent.name} › ${own.name}`;
}

export function entryDetail(
  entry: TransactionView,
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): EntryDetailModel {
  const [row] = ledgerRows([entry], accounts, categories);
  if (row === undefined) throw new Error('ledgerRows returned no row');
  const deleted = entry.reversedById !== null;
  const superseded = entry.replacedById !== null;
  const live = !deleted && !superseded;
  const real = entry.kind !== 'reversal' && entry.kind !== 'budget_switch';
  const editable = live && isEditable(entry);
  return {
    row,
    payee: entry.note,
    categoryPath: categoryPath(entry, categories),
    accounts: row.accounts,
    deleted,
    edited: entry.replacesId !== null,
    superseded,
    canEdit: editable,
    canSplit: editable && entry.kind !== 'transfer',
    canIou: editable && entry.kind === 'expense' && entry.categoryId !== null,
    canCover: live && entry.kind === 'expense',
    canDelete: live && real,
    // Only an undone entry that was not already brought back.
    canRestore: deleted && real && entry.restoredById === null,
  };
}

/** The covers a line shows: sources that paid, in the cover order. */
export function coverParts(line: CoverLine): CoverLine['covers'] {
  return line.covers.filter((c) => c.amount.amountMinor !== 0);
}

/** Does the line show anything beyond the entry's own budget paying? */
export function isCovered(line: CoverLine): boolean {
  return (
    coverParts(line).length > 0 ||
    line.uncovered.amountMinor !== 0 ||
    line.overridden
  );
}

/** The first line that has cover to look at or change; the sheet edits it. */
export function coverLine(
  lines: readonly CoverLine[] | undefined,
): CoverLine | undefined {
  return lines?.find(isCovered);
}
