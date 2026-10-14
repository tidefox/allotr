import {
  transactionId,
  withdrawalLinkId,
  type WithdrawalLink,
} from '@allotr/core';
import { money } from '@allotr/shared';
import type { Db } from './store.ts';

// The rows behind withdrawal links (ADR 0038). A link is a setting on two
// entries, so removing it sets `removed_at` and keeps the row; only rows
// without one count. Whether an active link fits is core's to say.

type Row = {
  id: string;
  withdrawal_id: string;
  expense_id: string;
  amount_minor: number;
  currency: string;
};

const linkOf = (row: Row): WithdrawalLink => ({
  id: withdrawalLinkId(row.id),
  withdrawalId: transactionId(row.withdrawal_id),
  expenseId: transactionId(row.expense_id),
  amount: money(row.amount_minor, row.currency),
});

/** Every active link of the user, oldest first. */
export async function loadWithdrawalLinks(
  db: Db,
  userId: string,
): Promise<WithdrawalLink[]> {
  const rows = await db
    .selectFrom('withdrawal_links')
    .select(['id', 'withdrawal_id', 'expense_id', 'amount_minor', 'currency'])
    .where('user_id', '=', userId)
    .where('removed_at', 'is', null)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map(linkOf);
}

/** The active links that have any of these entries on either side. */
export async function loadLinksOf(
  db: Db,
  userId: string,
  ids: readonly string[],
): Promise<WithdrawalLink[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .selectFrom('withdrawal_links')
    .select(['id', 'withdrawal_id', 'expense_id', 'amount_minor', 'currency'])
    .where('user_id', '=', userId)
    .where('removed_at', 'is', null)
    .where((eb) =>
      eb.or([eb('withdrawal_id', 'in', ids), eb('expense_id', 'in', ids)]),
    )
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map(linkOf);
}

export async function insertWithdrawalLink(
  db: Db,
  userId: string,
  link: WithdrawalLink,
  now: Date,
): Promise<void> {
  await db
    .insertInto('withdrawal_links')
    .values({
      id: link.id,
      user_id: userId,
      withdrawal_id: link.withdrawalId,
      expense_id: link.expenseId,
      amount_minor: link.amount.amountMinor,
      currency: link.amount.currency,
      created_at: now.toISOString(),
    })
    .execute();
}

/** Marks links removed; returns how many were active. */
export async function retireWithdrawalLinks(
  db: Db,
  userId: string,
  ids: readonly string[],
  now: Date,
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db
    .updateTable('withdrawal_links')
    .set({ removed_at: now.toISOString() })
    .where('user_id', '=', userId)
    .where('removed_at', 'is', null)
    .where('id', 'in', ids)
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}
