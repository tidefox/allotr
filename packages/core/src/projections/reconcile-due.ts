import { daysBetween, type LocalDate } from '@allotr/shared';

/** How many days an account may go without being reconciled. */
export const reconcileEveryDays = 30;

/**
 * Whether an account is due for reconciling on `today`: open, and never
 * reconciled or last reconciled more than 30 days ago (docs/ui.md
 * "Accounts").
 */
export function reconcileDue(
  account: Readonly<{
    archived: boolean;
    lastReconciledOn: LocalDate | null;
  }>,
  today: LocalDate,
): boolean {
  if (account.archived) return false;
  return (
    account.lastReconciledOn === null ||
    daysBetween(account.lastReconciledOn, today) > reconcileEveryDays
  );
}
