import { z } from 'zod';
import { localDateSchema, localTimeSchema } from './dates.ts';
import { fundingSchema } from './ledger.ts';
import { currencyCodeSchema, rateSchema } from './money/schemas.ts';

// Payloads of the append-only facts (ADR 0033): an entry with its postings,
// the reversal of an entry, the replacement an edit records and the tags on
// an entry. Each carries the whole fact, postings included, and nothing is
// recomputed on read. Field names are the table columns in camelCase
// (docs/domain.md "Events" lists what is left out and why).

export const factSchemaVersion = 1;

export const factEventTypes = {
  /** An entry that is not a reversal. */
  recorded: 'transaction.recorded',
  /** The undo of an entry; its `reversesId` is set. */
  reversed: 'transaction.reversed',
  /** An edit took one entry's place with another. */
  replaced: 'transaction.replaced',
  /** The tags an entry was created with. */
  tagged: 'transaction.tagged',
} as const;

export type FactEventType =
  (typeof factEventTypes)[keyof typeof factEventTypes];

const idSchema = z.string().min(1).max(64);
const instantSchema = z.string().min(1).max(40);

export const factPostingSchema = z.object({
  id: idSchema,
  accountId: idSchema,
  /** Signed integer in the currency's minor unit; never zero. */
  amountMinor: z.int().refine((value) => value !== 0, {
    error: 'A posting is never zero',
  }),
  currency: currencyCodeSchema,
  categoryId: idSchema.nullable(),
});

export const factTransactionSchema = z.object({
  id: idSchema,
  kind: z.enum([
    'expense',
    'income',
    'transfer',
    'opening',
    'write_off',
    'budget_switch',
    'reversal',
  ]),
  occurredOn: localDateSchema,
  occurredTime: localTimeSchema.nullable(),
  /** The instant it was recorded, as an ISO 8601 string in UTC. */
  createdAt: instantSchema,
  source: z.enum(['api', 'import', 'system']),
  client: z.enum(['web', 'chat']).nullable(),
  categoryId: idSchema.nullable(),
  note: z.string().nullable(),
  funding: fundingSchema,
  reversesId: idSchema.nullable(),
  idempotencyKey: z.string().nullable(),
  /** Exact decimal: units of the received currency per unit sent. */
  impliedRate: rateSchema.nullable(),
  switchAccountId: idSchema.nullable(),
  switchBudgetGroup: z.enum(['on', 'off']).nullable(),
  /** In posting order; a posting's position is its index. */
  postings: z.array(factPostingSchema).max(1000),
});

export type FactPosting = z.infer<typeof factPostingSchema>;
export type FactTransaction = z.infer<typeof factTransactionSchema>;

export const reversedPayloadSchema = factTransactionSchema.refine(
  (value) => value.kind === 'reversal' && value.reversesId !== null,
  { error: 'A reversal says which entry it undoes' },
);

export const recordedPayloadSchema = factTransactionSchema.refine(
  (value) => value.kind !== 'reversal' && value.reversesId === null,
  { error: 'Only a reversal event carries a reversal' },
);

export const replacedPayloadSchema = z.object({
  originalId: idSchema,
  replacementId: idSchema,
  /**
   * The reversal written in the same edit, so a merge that holds that
   * reversal back holds this replacement back with it (ADR 0033). Not a
   * table column.
   */
  reversalId: idSchema,
});

export const taggedPayloadSchema = z.object({
  transactionId: idSchema,
  tagIds: z.array(idSchema).min(1).max(100),
});

export type RecordedPayload = z.infer<typeof recordedPayloadSchema>;
export type ReplacedPayload = z.infer<typeof replacedPayloadSchema>;
export type TaggedPayload = z.infer<typeof taggedPayloadSchema>;

export const factPayloadSchemas = {
  [factEventTypes.recorded]: recordedPayloadSchema,
  [factEventTypes.reversed]: reversedPayloadSchema,
  [factEventTypes.replaced]: replacedPayloadSchema,
  [factEventTypes.tagged]: taggedPayloadSchema,
} as const;
