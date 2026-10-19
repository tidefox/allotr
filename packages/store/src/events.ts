import { formatHlc, hlcStart, parseHlc, tick } from '@allotr/core';
import {
  eventEnvelopeSchema,
  factPayloadSchemas,
  factSchemaVersion,
  type EventEnvelope,
  type FactEventType,
} from '@allotr/shared';
import type { Db } from './store.ts';

// The event log in the database (ADR 0032, ADR 0033). Write paths call
// `appendFactEvent` inside the transaction that writes the rows, so a fact
// and its event commit together or not at all.
//
// The three choices below are the server's side of the event model, which
// the ADRs leave open. They sit here so a different answer changes one file:
//
// - author: one fixed id. The server is the only writer of a ledger.
// - seq: the largest stored for (ledger, author) plus one, read inside the
//   writing transaction. SQLite runs one write transaction at a time and
//   the unique key rejects a repeat, so numbers stay gapless.
// - clock: nothing is kept in memory. The next reading is `tick` after the
//   largest reading stored for the ledger, so it survives restarts and sits
//   after every event the ledger has already seen, whoever wrote it.

/** The author id of events the server writes. */
export const SERVER_AUTHOR = 'server';

export class EventLogError extends Error {
  override readonly name = 'EventLogError';
}

async function ledgerOf(db: Db, userId: string): Promise<string> {
  const row = await db
    .selectFrom('users')
    .select('ledger_id')
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  if (row.ledger_id === '') {
    throw new EventLogError(
      'This user has no ledger id, so it cannot log events.',
    );
  }
  return row.ledger_id;
}

async function nextPosition(db: Db, ledgerId: string, now: Date) {
  const last = await db
    .selectFrom('events')
    .select(['hlc'])
    .where('ledger_id', '=', ledgerId)
    .orderBy('hlc', 'desc')
    .limit(1)
    .executeTakeFirst();
  const lastSeq = await db
    .selectFrom('events')
    .select(({ fn }) => fn.max('seq').as('seq'))
    .where('ledger_id', '=', ledgerId)
    .where('author', '=', SERVER_AUTHOR)
    .executeTakeFirst();
  const hlc =
    last === undefined
      ? hlcStart(SERVER_AUTHOR, now.getTime())
      : tick({ ...parseHlc(last.hlc), node: SERVER_AUTHOR }, now.getTime());
  return { hlc: formatHlc(hlc), seq: (lastSeq?.seq ?? 0) + 1 };
}

/**
 * Appends one fact event for the user's ledger. The payload is checked by
 * its type's schema first, so a write path cannot log what the fold would
 * refuse. Call it inside the transaction that writes the rows.
 */
export async function appendFactEvent(
  db: Db,
  userId: string,
  type: FactEventType,
  payload: unknown,
  now: Date,
): Promise<void> {
  const ledgerId = await ledgerOf(db, userId);
  const checked: unknown = factPayloadSchemas[type].parse(payload);
  const { hlc, seq } = await nextPosition(db, ledgerId, now);
  const envelope = eventEnvelopeSchema.parse({
    ledgerId,
    eventId: globalThis.crypto.randomUUID(),
    author: SERVER_AUTHOR,
    seq,
    hlc,
    schema: factSchemaVersion,
    enc: null,
    type,
    payload: checked,
  });
  await db
    .insertInto('events')
    .values({
      event_id: envelope.eventId,
      user_id: userId,
      ledger_id: envelope.ledgerId,
      author: envelope.author,
      seq: envelope.seq,
      hlc: envelope.hlc,
      schema: envelope.schema,
      enc: null,
      type: envelope.type,
      payload: JSON.stringify(envelope.payload),
    })
    .execute();
}

/** Every event of the user's ledger, in the fold's order. */
export async function readEvents(
  db: Db,
  userId: string,
): Promise<EventEnvelope[]> {
  const rows = await db
    .selectFrom('events')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('hlc')
    .orderBy('author')
    .orderBy('seq')
    .execute();
  return rows.map((row) =>
    eventEnvelopeSchema.parse({
      ledgerId: row.ledger_id,
      eventId: row.event_id,
      author: row.author,
      seq: row.seq,
      hlc: row.hlc,
      schema: row.schema,
      enc: row.enc,
      type: row.type,
      payload: JSON.parse(row.payload) as unknown,
    }),
  );
}

/**
 * Runs `work` in a database transaction: the caller's, or a new one when
 * `db` is not in one, so rows and their event are never half written.
 */
export function atomically<T>(
  db: Db,
  work: (trx: Db) => Promise<T>,
): Promise<T> {
  return db.isTransaction ? work(db) : db.transaction().execute(work);
}
