import { entryBudgetLines, transactionId } from '@allotr/core';
import type { TransactionDetailView } from '@allotr/shared';
import { userToday, type Db } from './store.ts';
import { loadView } from './today.ts';
import { getTransaction } from './transactions.ts';

// One entry with how the budgets stood for it (ADR 0021), in whatever
// period it falls in: folded from the same ledger as the budget view, so
// the figures agree with it.

export async function getTransactionDetail(
  db: Db,
  userId: string,
  id: string,
  now: Date,
): Promise<TransactionDetailView> {
  const entry = await getTransaction(db, userId, id);
  const { view } = await loadView(db, userId);
  const today = await userToday(db, userId, now);
  const names = new Map(
    (view.budgets?.budgets ?? []).map((budget) => [budget.id, budget.name]),
  );
  const lines = entryBudgetLines(view, today, transactionId(id));
  const first = lines[0];
  return {
    ...entry,
    budget:
      first === undefined
        ? null
        : {
            period: first.period,
            lines: lines.map((line) => ({
              budgetId: line.budgetId,
              budgetName:
                line.budgetId === null
                  ? null
                  : (names.get(line.budgetId) ?? ''),
              loan: line.loan,
              amount: line.amount,
              own: line.own,
              covers: line.covers.map((cover) => ({
                source: cover.source,
                name:
                  cover.source === 'free'
                    ? 'Free money'
                    : (names.get(cover.source) ?? ''),
                amount: cover.amount,
              })),
              uncovered: line.uncovered,
              overridden: line.overridden,
              leftAfter: line.leftAfter,
            })),
          },
  };
}
