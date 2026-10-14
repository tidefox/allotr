import {
  linkRefusalCodes,
  type CreateWithdrawalLinkBody,
  type LinkRefusalCode,
  type TransactionView,
  type WithdrawalLinkView,
} from '@allotr/shared';

// What the entry detail and the list show of withdrawal links (ADR 0038).
// Pure: every figure and every validity is the server's.

/** Which end of a link an entry is: the expense or the savings withdrawal. */
export type LinkRole = 'expense' | 'withdrawal';

/** The role an entry plays in the links it already has; null for none. */
export function linkRoleOf(
  entry: Pick<TransactionView, 'id' | 'withdrawalLinks'>,
  onlyValid = false,
): LinkRole | null {
  for (const link of entry.withdrawalLinks) {
    if (onlyValid && !link.valid) continue;
    if (link.expenseId === entry.id) return 'expense';
    if (link.withdrawalId === entry.id) return 'withdrawal';
  }
  return null;
}

/** The entry at the other end of a link. */
export function otherEntryId(link: WithdrawalLinkView, entryId: string) {
  return link.expenseId === entryId ? link.withdrawalId : link.expenseId;
}

/**
 * Only an entry still in effect can take a link, and only an expense or a
 * transfer can: the server decides which of those it is (candidates).
 */
export function canTakeLinks(
  entry: Pick<TransactionView, 'kind' | 'reversedById' | 'replacedById'>,
): boolean {
  return (
    entry.reversedById === null &&
    entry.replacedById === null &&
    (entry.kind === 'expense' || entry.kind === 'transfer')
  );
}

/** Does the section show: links to list, or a role with a way to add one? */
export function showsLinks(
  entry: Pick<TransactionView, 'withdrawalLinks'>,
  candidateRole: 'expense' | 'withdrawal' | 'none' | undefined,
): boolean {
  return (
    entry.withdrawalLinks.length > 0 ||
    (candidateRole !== undefined && candidateRole !== 'none')
  );
}

/** The role the section is written for: the server's, else from the links. */
export function sectionRole(
  entry: Pick<TransactionView, 'id' | 'withdrawalLinks'>,
  candidateRole: 'expense' | 'withdrawal' | 'none' | undefined,
): LinkRole {
  if (candidateRole === 'expense' || candidateRole === 'withdrawal')
    return candidateRole;
  return linkRoleOf(entry) ?? 'expense';
}

/** Is `code` one of the refusals the server names? */
export function isLinkRefusal(code: string): code is LinkRefusalCode {
  return (linkRefusalCodes as readonly string[]).includes(code);
}

/** `Note · From → To`: what a candidate is called in the picker. */
export function candidateTitle(
  row: { note: string | null; accounts: readonly string[] },
  fallback: string,
): string {
  const accounts = row.accounts.join(' → ');
  const parts = [row.note, accounts].filter(
    (part): part is string => part !== null && part !== '',
  );
  return parts.length === 0 ? fallback : parts.join(' · ');
}

/** The request body for linking `entryId` to `otherId`, whichever end it is. */
export function linkBody(
  role: LinkRole,
  entryId: string,
  otherId: string,
  amount: CreateWithdrawalLinkBody['amount'],
): CreateWithdrawalLinkBody {
  return role === 'expense'
    ? { withdrawalId: otherId, expenseId: entryId, amount }
    : { withdrawalId: entryId, expenseId: otherId, amount };
}
