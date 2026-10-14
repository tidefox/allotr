import { z } from 'zod';
import { moneySchema } from './money/schemas.ts';

// Withdrawal links (ADR 0038, docs/domain.md "Withdrawal links"): the part
// of a savings withdrawal that paid for an expense. The fields shown on
// entries live here, apart from the request schemas, because the entry
// schema in ledger.ts includes them.

const idSchema = z.string().min(1).max(64);

/**
 * Why a link is refused or does not count. These are core's `LinkRefusal`
 * codes; the store checks at compile time that the two lists are equal.
 */
export const linkRefusalCodes = [
  'withdrawal_missing',
  'withdrawal_undone',
  'withdrawal_not_transfer',
  'withdrawal_not_from_savings',
  'expense_missing',
  'expense_undone',
  'expense_not_expense',
  'expense_outside_funded',
  'expense_bill_payment',
  'expense_not_on_budget',
  'amount_not_positive',
  'currency_mismatch',
  'withdrawal_exceeded',
  'expense_exceeded',
] as const;
export const linkRefusalSchema = z.enum(linkRefusalCodes);
export type LinkRefusalCode = z.infer<typeof linkRefusalSchema>;

/** A link as shown on each of the two entries it ties together. */
export const withdrawalLinkSchema = z.object({
  id: idSchema,
  /** The savings withdrawal (a transfer from off budget to on budget). */
  withdrawalId: idSchema,
  /** The expense it paid for. */
  expenseId: idSchema,
  /** Positive, in the currency of the withdrawal's inbound side. */
  amount: moneySchema,
  /**
   * Whether the link counts in the budget figures. It is false while an
   * entry is undone, or when the entries no longer fit it (an edit changed
   * an amount, say); `reason` then says why.
   */
  valid: z.boolean(),
  /** Why the link does not count; null when `valid`. */
  reason: linkRefusalSchema.nullable(),
});
export type WithdrawalLinkView = z.infer<typeof withdrawalLinkSchema>;

/** Said when an edit or revert could not carry a link to the new entry. */
export const entryNoticeSchema = z.object({
  code: z.literal('withdrawal_link_dropped'),
  /** The link as it was on the entry that was replaced. */
  link: withdrawalLinkSchema.omit({ valid: true, reason: true }),
  /** Why it does not fit the replacement. */
  reason: linkRefusalSchema,
  message: z.string(),
});
export type EntryNotice = z.infer<typeof entryNoticeSchema>;
