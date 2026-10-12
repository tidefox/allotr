import type { IncomeClass } from '@allotr/shared';
import type { CategoryId } from '../ledger/types.ts';
import type { LedgerView } from './types.ts';

// Earnings are the income a cycle's figures and the savings rate count:
// `earned` and `passive`. A gift or a refund is another inflow, shown apart.
// Balances, net worth and the daily number never read the class (money is
// money); only the reports do. An entry with no category is earned.

/** The class of an income category; one not listed is earned. */
export function incomeClassOf(
  view: LedgerView,
  categoryId: CategoryId | null,
): IncomeClass {
  return categoryId === null
    ? 'earned'
    : (view.incomeClasses?.get(categoryId) ?? 'earned');
}

/** Whether income in this category is earnings (`earned` or `passive`). */
export function isEarnings(
  view: LedgerView,
  categoryId: CategoryId | null,
): boolean {
  const incomeClass = incomeClassOf(view, categoryId);
  return incomeClass === 'earned' || incomeClass === 'passive';
}
