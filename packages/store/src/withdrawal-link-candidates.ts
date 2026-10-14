import { linkRoom, transactionId, type Transaction } from '@allotr/core';
import {
  addDays,
  daysBetween,
  money,
  type CurrencyCode,
  type WithdrawalLinkCandidatesView,
} from '@allotr/shared';
import { RequestProblem } from './domain-errors.ts';
import type { Db } from './store.ts';
import { loadView } from './today.ts';
import { viewsByIds } from './transactions.ts';

// The entries a withdrawal link could tie to a given entry (ADR 0038), for
// the pickers: "Paid from savings" on an expense lists withdrawals,
// "Paid for" on a withdrawal lists expenses. Core says what fits and how
// much room is left; this only picks the nearby entries to ask about.

/** How many days either side of the entry a candidate may be. */
export const candidateWindowDays = 14;

const currenciesOf = (entry: Transaction): CurrencyCode[] => [
  ...new Set(entry.postings.map((p) => p.amount.currency)),
];

export async function linkCandidates(
  db: Db,
  userId: string,
  id: string,
): Promise<WithdrawalLinkCandidatesView> {
  const { view } = await loadView(db, userId);
  const focus = view.ledger.find((t) => t.id === id);
  if (focus === undefined) {
    throw new RequestProblem(
      404,
      'transaction_not_found',
      'There is no such entry.',
    );
  }
  // An expense looks for transfers, a transfer for expenses. Whether the
  // transfer really is a withdrawal is core's call, through the room.
  const role =
    focus.kind === 'expense'
      ? 'expense'
      : focus.kind === 'transfer'
        ? 'withdrawal'
        : 'none';
  if (role === 'none') return { transactionId: id, role, candidates: [] };

  const from = addDays(focus.occurredOn, -candidateWindowDays);
  const to = addDays(focus.occurredOn, candidateWindowDays);
  const currencies = currenciesOf(focus);
  const found: { entry: Transaction; room: number; currency: CurrencyCode }[] =
    [];
  for (const entry of view.ledger) {
    if (
      entry.kind !== (role === 'expense' ? 'transfer' : 'expense') ||
      entry.occurredOn < from ||
      entry.occurredOn > to
    ) {
      continue;
    }
    for (const currency of currencies) {
      const room = linkRoom(
        view,
        transactionId(role === 'expense' ? entry.id : focus.id),
        transactionId(role === 'expense' ? focus.id : entry.id),
        currency,
      );
      if (room > 0) {
        found.push({ entry, room, currency });
        break;
      }
    }
  }
  const distance = (t: Transaction) =>
    Math.abs(daysBetween(focus.occurredOn, t.occurredOn));
  found.sort(
    (a, b) =>
      distance(a.entry) - distance(b.entry) ||
      (a.entry.occurredOn < b.entry.occurredOn ? -1 : 1) ||
      (a.entry.id < b.entry.id ? -1 : 1),
  );
  const views = await viewsByIds(
    db,
    userId,
    found.map((f) => f.entry.id),
  );
  const byId = new Map(views.map((v) => [v.id, v]));
  return {
    transactionId: id,
    role,
    candidates: found.flatMap((f) => {
      const transaction = byId.get(f.entry.id);
      return transaction === undefined
        ? []
        : [{ transaction, room: money(f.room, f.currency) }];
    }),
  };
}
