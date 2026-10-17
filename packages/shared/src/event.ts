import { z } from 'zod';
import { isUuid } from './uuid.ts';

// The envelope every event shares (ADR 0033, ADR 0035), so HTTP bodies,
// log files and tests agree on one shape. Payloads belong to each event
// type and are checked by that type's own schema.

/** Characters and length of an author id, which is also the clock's node. */
const NODE = /^[0-9A-Za-z_-]{1,64}$/;

/**
 * A hybrid logical clock reading as text: 12 hex digits of milliseconds,
 * 4 of counter and the node, joined by `-`. Fixed-width, so strings compare
 * with `<` in clock order (the logic is in `@allotr/core`, docs/domain.md
 * "Events").
 */
const HLC = /^[0-9a-f]{12}-[0-9a-f]{4}-[0-9A-Za-z_-]{1,64}$/;

export const authorSchema = z
  .string()
  .regex(NODE, { error: 'Not an author id' });
export const hlcSchema = z
  .string()
  .regex(HLC, { error: 'Not a clock reading' });
const uuidSchema = z.string().refine(isUuid, { error: 'Not a UUID' });

export const eventEnvelopeSchema = z.object({
  ledgerId: uuidSchema,
  eventId: uuidSchema,
  author: authorSchema,
  /** Gapless per author, from 1. */
  seq: z.int().min(1),
  hlc: hlcSchema,
  /** The version of the event type's payload shape (ADR 0035). */
  schema: z.int().min(1),
  /** Reserved for encryption (ADR 0036); always null for now. */
  enc: z.null(),
  type: z
    .string()
    .regex(/^[a-z][a-z0-9_.]{0,63}$/, { error: 'Not an event type' }),
  payload: z.json(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
