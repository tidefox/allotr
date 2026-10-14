import {
  checkLink,
  linkValidity,
  transactionId,
  withdrawalLinkId,
  type LinkRefusal,
  type WithdrawalLink,
} from '@allotr/core';
import type {
  Bundle,
  CreateWithdrawalLinkBody,
  EntryNotice,
  LinkRefusalCode,
  WithdrawalLinkView,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import { atPath, RequestProblem } from './domain-errors.ts';
import { newId } from './ids.ts';
import type { DB } from './schema.ts';
import type { Db } from './store.ts';
import { loadView } from './today.ts';
import {
  insertWithdrawalLink,
  loadLinksOf,
  retireWithdrawalLinks,
} from './withdrawal-link-rows.ts';

// Withdrawal links (ADR 0038, docs/domain.md "Withdrawal links"): adding,
// removing and showing them, and carrying them to the entry that replaces
// one in an edit. Core says whether a link fits (`checkLink`); this module
// only stores what core accepts and reports why it refused the rest.

// The shared list of codes must be core's list. Fails to compile when they
// drift, since shared cannot import core.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const linkCodesMatch: Same<LinkRefusal, LinkRefusalCode> = true;

const messages: Record<LinkRefusal, string> = {
  withdrawal_missing: 'There is no such savings withdrawal.',
  withdrawal_undone: 'The withdrawal was undone.',
  withdrawal_not_transfer: 'The withdrawal must be a transfer.',
  withdrawal_not_from_savings:
    'The withdrawal must move money from a savings account to an on-budget account.',
  expense_missing: 'There is no such expense.',
  expense_undone: 'The expense was undone.',
  expense_not_expense: 'The expense must be an expense entry.',
  expense_outside_funded:
    'An expense paid with outside money cannot be linked to savings.',
  expense_bill_payment: 'An expense that pays a bill cannot be linked.',
  expense_not_on_budget: 'The expense must be paid from an on-budget account.',
  amount_not_positive: 'The amount must be greater than zero.',
  currency_mismatch:
    'The amount must be in the currency the withdrawal moved and the expense paid.',
  withdrawal_exceeded:
    'The links on this withdrawal would add up to more than it moved.',
  expense_exceeded:
    'The links on this expense would add up to more than it paid from the budget.',
};

export const refusalMessage = (code: LinkRefusal): string => messages[code];

function refusalStatus(code: LinkRefusal): 404 | 409 | 422 {
  if (code === 'withdrawal_missing' || code === 'expense_missing') return 404;
  if (code === 'withdrawal_exceeded' || code === 'expense_exceeded') return 409;
  return 422;
}

export function linkRefusal(code: LinkRefusal): RequestProblem {
  return new RequestProblem(refusalStatus(code), code, messages[code]);
}

const viewOf = (
  link: WithdrawalLink,
  reason: LinkRefusal | null,
): WithdrawalLinkView => ({
  id: link.id,
  withdrawalId: link.withdrawalId,
  expenseId: link.expenseId,
  amount: link.amount,
  valid: reason === null,
  reason,
});

/**
 * Records a link if core accepts it on top of the links that count now;
 * otherwise refuses with core's reason as the problem code.
 */
export async function createWithdrawalLink(
  db: Kysely<DB>,
  userId: string,
  body: CreateWithdrawalLinkBody,
  now: Date,
): Promise<WithdrawalLinkView> {
  return db.transaction().execute(async (trx) => {
    const { view } = await loadView(trx, userId);
    const link: WithdrawalLink = {
      id: withdrawalLinkId(newId()),
      withdrawalId: transactionId(body.withdrawalId),
      expenseId: transactionId(body.expenseId),
      amount: body.amount,
    };
    const refusal = checkLink(view, link);
    if (refusal !== null) throw linkRefusal(refusal);
    await insertWithdrawalLink(trx, userId, link, now);
    return viewOf(link, null);
  });
}

/** Removes a link; the row stays, marked removed. */
export async function removeWithdrawalLink(
  db: Kysely<DB>,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  const removed = await retireWithdrawalLinks(db, userId, [id], now);
  if (removed === 0) {
    throw new RequestProblem(
      404,
      'withdrawal_link_not_found',
      'There is no such withdrawal link.',
    );
  }
}

/**
 * The active links on each of these entries (as withdrawal or as expense),
 * with whether each counts, by entry id.
 */
export async function linkViewsByEntry(
  db: Db,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, WithdrawalLinkView[]>> {
  const found = await loadLinksOf(db, userId, ids);
  const byEntry = new Map<string, WithdrawalLinkView[]>();
  if (found.length === 0) return byEntry;
  const { view } = await loadView(db, userId);
  const { dropped } = linkValidity(view);
  const why = new Map(dropped.map((d) => [d.link.id, d.reason] as const));
  const wanted = new Set(ids);
  for (const link of found) {
    const shown = viewOf(link, why.get(link.id) ?? null);
    for (const entry of new Set([link.withdrawalId, link.expenseId])) {
      if (!wanted.has(entry)) continue;
      byEntry.set(entry, [...(byEntry.get(entry) ?? []), shown]);
    }
  }
  return byEntry;
}

// A link whose other entry is undone is kept, not dropped: it counts again
// if that entry is restored (ADR 0038). Every other refusal means the
// replacement does not fit.
const dormant = (refusal: LinkRefusal) =>
  refusal === 'withdrawal_undone' || refusal === 'expense_undone';

/**
 * Moves the links of `fromId` to `toId`, the entry that replaces it (an
 * edit, a revert or a restore, which each record a new entry with a new
 * id). Run it after `toId` is stored, in the same transaction. A link
 * moves when core accepts it on the replacement; the others are dropped and
 * reported. The old links are marked removed either way.
 */
export async function carryWithdrawalLinks(
  db: Db,
  userId: string,
  fromId: string,
  toId: string,
  now: Date,
): Promise<EntryNotice[]> {
  const old = await loadLinksOf(db, userId, [fromId]);
  if (old.length === 0) return [];
  const { view } = await loadView(db, userId);
  const notices: EntryNotice[] = [];
  let current = view;
  for (const link of old) {
    const next: WithdrawalLink = {
      id: withdrawalLinkId(newId()),
      withdrawalId: transactionId(
        link.withdrawalId === fromId ? toId : link.withdrawalId,
      ),
      expenseId: transactionId(
        link.expenseId === fromId ? toId : link.expenseId,
      ),
      amount: link.amount,
    };
    const refusal = checkLink(current, next);
    if (refusal === null || dormant(refusal)) {
      await insertWithdrawalLink(db, userId, next, now);
      current = {
        ...current,
        withdrawalLinks: [...(current.withdrawalLinks ?? []), next],
      };
    } else {
      notices.push({
        code: 'withdrawal_link_dropped',
        link: {
          id: link.id,
          withdrawalId: link.withdrawalId,
          expenseId: link.expenseId,
          amount: link.amount,
        },
        reason: refusal,
        message: `A link between a savings withdrawal and an expense was removed because the new version no longer fits it. ${messages[refusal]}`,
      });
    }
  }
  await retireWithdrawalLinks(
    db,
    userId,
    old.map((l) => l.id),
    now,
  );
  return notices;
}

/**
 * Records the links of an import bundle, once its entries and bill payments
 * are in (a bill payment makes an expense ineligible). Core checks each
 * link on top of the ones before it; a refusal points at the bundle item.
 */
export async function importWithdrawalLinks(
  db: Db,
  userId: string,
  bundle: Bundle,
  entryIds: ReadonlyMap<string, string>,
  now: Date,
): Promise<number> {
  if (bundle.withdrawalLinks.length === 0) return 0;
  const { view } = await loadView(db, userId);
  let current = view;
  for (const [index, item] of bundle.withdrawalLinks.entries()) {
    const withdrawalId = entryIds.get(item.withdrawal);
    const expenseId = entryIds.get(item.expense);
    if (withdrawalId === undefined || expenseId === undefined) {
      throw new Error('import: unresolved withdrawal link');
    }
    const link: WithdrawalLink = {
      id: withdrawalLinkId(newId()),
      withdrawalId: transactionId(withdrawalId),
      expenseId: transactionId(expenseId),
      amount: item.amount,
    };
    const refusal = checkLink(current, link);
    if (refusal !== null) {
      throw atPath(linkRefusal(refusal), `/withdrawalLinks/${String(index)}`);
    }
    await insertWithdrawalLink(db, userId, link, now);
    current = {
      ...current,
      withdrawalLinks: [...(current.withdrawalLinks ?? []), link],
    };
  }
  return bundle.withdrawalLinks.length;
}
