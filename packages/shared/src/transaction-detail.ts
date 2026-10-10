import { z } from 'zod';
import { coverSourceSchema } from './budgets.ts';
import { localDateSchema } from './dates.ts';
import { idSchema, transactionSchema } from './ledger.ts';
import { moneySchema } from './money/schemas.ts';

// One entry with the budget figures it had when it was recorded
// (ADR 0021), for the entry's detail view.

export const entryBudgetLineSchema = z.object({
  /** The budget that counted this line; null when none did. */
  budgetId: idSchema.nullable(),
  /** The budget's name; null with `budgetId`. */
  budgetName: z.string().nullable(),
  /** Money lent to people (ADR 0024): covered like spending, but not spent. */
  loan: z.boolean(),
  /** The line's amount, in the default currency. */
  amount: moneySchema,
  /** What its own budget paid. */
  own: moneySchema,
  /** Who covered the part past that. */
  covers: z.array(
    z.object({
      source: coverSourceSchema,
      name: z.string(),
      amount: moneySchema,
    }),
  ),
  /** What nothing covered: it lowered the daily number. */
  uncovered: moneySchema,
  /** The user chose this split. */
  overridden: z.boolean(),
  /**
   * What its budget had left right after this line, with the cover of
   * earlier lines already out of it; later refunds do not change it. Null
   * when no budget counted the line.
   */
  leftAfter: moneySchema.nullable(),
});
export type EntryBudgetLineView = z.infer<typeof entryBudgetLineSchema>;

export const entryBudgetSchema = z.object({
  /** The budget period the entry's date falls in. */
  period: z.object({ from: localDateSchema, to: localDateSchema }),
  /** One per expense line that was counted (a split has several). */
  lines: z.array(entryBudgetLineSchema).min(1),
});
export type EntryBudgetView = z.infer<typeof entryBudgetSchema>;

export const transactionDetailSchema = transactionSchema.extend({
  /**
   * How the budgets stood for this entry, in whatever period it falls
   * (not only the current one): the budget's amount left after it, and the
   * cover it needed. Null when no budget counted it: an income, a transfer,
   * spending from a savings account, an undone entry, or no budgets set up.
   */
  budget: entryBudgetSchema.nullable(),
});
export type TransactionDetailView = z.infer<typeof transactionDetailSchema>;
