import {
  addDays,
  money,
  nextDayOfMonth,
  type LocalDate,
  type Money,
} from '@allotr/shared';

// A credit (liability) account's limit and due day (docs/domain.md "Credit
// limit and due day"). Both are shown, never acted on, so these are plain
// functions of the account's balance, its limit and today.

/**
 * What is still free on a card: the limit plus the balance. A debt is a
 * negative balance, so owing 400 on a 2 000 limit leaves 1 600. Not clamped:
 * past the limit it is negative, and an overpaid card (a positive balance)
 * leaves more than the limit. Both amounts are in the account's currency.
 */
export function creditAvailable(limit: Money, balance: Money): Money {
  if (limit.currency !== balance.currency) {
    throw new Error(
      `A limit in ${limit.currency} cannot be set against a balance in ${balance.currency}.`,
    );
  }
  return money(limit.amountMinor + balance.amountMinor, limit.currency);
}

/**
 * The next date on or after `today` that falls on `dueDay`. A month shorter
 * than the day uses its last day, so day 31 is 28 February (29 in a leap
 * year), and a due day that is today is due today.
 */
export function creditNextDue(dueDay: number, today: LocalDate): LocalDate {
  return nextDayOfMonth(addDays(today, -1), dueDay);
}
