import type { CreateWithdrawalLinkBody } from '@allotr/shared';
import { queryOptions, skipToken } from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

// Withdrawal links (ADR 0038): the part of a savings withdrawal that paid
// for an expense. A link changes the budget figures (today, budgets, pools,
// reports) and what both entries show, so a change refreshes what any new
// entry does: `entryQueryKeys` in ledger.ts.

/**
 * The entries a link could join to this one, and whether this one is the
 * expense or the withdrawal. Waits until `enabled`: only a live expense or
 * transfer can have candidates. Under `transactions`, so a new entry or a
 * link refreshes it.
 */
export function linkCandidatesQuery(id: string, enabled: boolean) {
  return queryOptions({
    queryKey: ['transactions', 'entry', id, 'link-candidates'],
    queryFn: enabled
      ? () => call(endpoints.withdrawalLinkCandidates, { params: { id } })
      : skipToken,
  });
}

export function createWithdrawalLink(body: CreateWithdrawalLinkBody) {
  return call(endpoints.createWithdrawalLink, { body });
}

export function deleteWithdrawalLink(id: string) {
  return call(endpoints.deleteWithdrawalLink, { params: { id } });
}
