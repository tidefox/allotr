import { z } from 'zod';
import { transactionSchema } from './ledger.ts';
import { moneySchema } from './money/schemas.ts';
import { withdrawalLinkSchema } from './withdrawal-links.ts';

const idSchema = z.string().min(1).max(64);

export const createWithdrawalLinkBodySchema = z.object({
  withdrawalId: idSchema,
  expenseId: idSchema,
  /** Positive, in the currency of the withdrawal's inbound side. */
  amount: moneySchema,
});
export type CreateWithdrawalLinkBody = z.infer<
  typeof createWithdrawalLinkBodySchema
>;

/** The stored link, as on the entries, right after it is made. */
export const createdWithdrawalLinkSchema = withdrawalLinkSchema;

export const withdrawalLinkCandidateSchema = z.object({
  /** The entry that can take a link with the one asked about. */
  transaction: transactionSchema,
  /**
   * The most a link between the two may be for: what is left on each side
   * after the other links, the smaller of the two. Always positive. Use it
   * to prefill the amount.
   */
  room: moneySchema,
});
export type WithdrawalLinkCandidateView = z.infer<
  typeof withdrawalLinkCandidateSchema
>;

export const withdrawalLinkCandidatesSchema = z.object({
  /** The entry asked about. */
  transactionId: idSchema,
  /**
   * What the entry is for a link: an `expense` looks for withdrawals that
   * paid for it, a `withdrawal` looks for expenses it paid for. An entry
   * that is neither (or is undone) has no candidates.
   */
  role: z.enum(['expense', 'withdrawal', 'none']),
  /** Within 14 days of the entry, nearest first, then earlier first. */
  candidates: z.array(withdrawalLinkCandidateSchema),
});
export type WithdrawalLinkCandidatesView = z.infer<
  typeof withdrawalLinkCandidatesSchema
>;
