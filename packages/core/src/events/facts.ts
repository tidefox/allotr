import {
  factEventTypes,
  factPayloadSchemas,
  factSchemaVersion,
  type EventEnvelope,
  type FactPosting,
  type FactTransaction,
  type FactEventType,
} from '@allotr/shared';
import { compareEvents } from './hlc.ts';

// The fold of the append-only facts (ADR 0032, ADR 0033): entries with their
// postings, reversals, replacements and entry tags. It is a pure function of
// the set of events: delivery order and duplicates change nothing, because
// events are deduplicated by id and applied in the total order. Postings are
// taken from the events and never recomputed.

export type FactErrorCode = 'event.invalid' | 'event.schema_unsupported';

export class FactError extends Error {
  override readonly name = 'FactError';
  readonly code: FactErrorCode;
  readonly eventId: string;

  constructor(code: FactErrorCode, eventId: string, message: string) {
    super(message);
    this.code = code;
    this.eventId = eventId;
  }
}

/** A `transactions` row without its postings and its owner. */
export type TransactionFact = Omit<FactTransaction, 'postings'>;

/** A `postings` row without its owner; `position` is the index in the event. */
export type PostingFact = FactPosting & {
  transactionId: string;
  position: number;
};

export type TagFact = { transactionId: string; tagId: string };

export type ReplacementFact = { originalId: string; replacementId: string };

/**
 * Two reversals of one entry: the lowest in the total order wins (ADR 0033).
 * The loser's reversal and its replacement are held back from the rows until
 * the user chooses, and listed here so nothing is dropped silently.
 */
export type HeldReversal = {
  originalId: string;
  winnerId: string;
  reversalId: string;
  replacementIds: string[];
};

export type FactState = {
  /** Sorted by id. */
  transactions: TransactionFact[];
  /** Sorted by transaction id, then position. */
  postings: PostingFact[];
  /** Sorted by transaction id, then tag id. */
  tags: TagFact[];
  /** Sorted by original id. */
  replacements: ReplacementFact[];
  /** Sorted by reversal id. */
  held: HeldReversal[];
};

const factTypes = new Set<string>(Object.values(factEventTypes));

function isFactType(type: string): type is FactEventType {
  return factTypes.has(type);
}

type Ordered = Pick<EventEnvelope, 'hlc' | 'author' | 'seq' | 'eventId'>;

// The event id is the last tie-break only so that two different events
// claiming one place in the order still fold the same way everywhere.
function byOrder(a: Ordered, b: Ordered): number {
  return (
    compareEvents(a, b) ||
    (a.eventId === b.eventId ? 0 : a.eventId < b.eventId ? -1 : 1)
  );
}

const byText = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);

// Spelled out so a new payload field is a type error here until the row
// shape says where it goes.
function rowOf(t: FactTransaction): TransactionFact {
  return {
    id: t.id,
    kind: t.kind,
    occurredOn: t.occurredOn,
    occurredTime: t.occurredTime,
    createdAt: t.createdAt,
    source: t.source,
    client: t.client,
    categoryId: t.categoryId,
    note: t.note,
    funding: t.funding,
    reversesId: t.reversesId,
    idempotencyKey: t.idempotencyKey,
    impliedRate: t.impliedRate,
    switchAccountId: t.switchAccountId,
    switchBudgetGroup: t.switchBudgetGroup,
  };
}

/** Events of one id: the earliest in the order stands in for the rest. */
function dedupe(events: readonly EventEnvelope[]): EventEnvelope[] {
  const byId = new Map<string, EventEnvelope>();
  for (const event of events) {
    const kept = byId.get(event.eventId);
    if (kept === undefined || byOrder(event, kept) < 0) {
      byId.set(event.eventId, event);
    }
  }
  return [...byId.values()].sort(byOrder);
}

type Parsed<T extends FactEventType> = (typeof factPayloadSchemas)[T];

function payloadOf<T extends FactEventType>(
  event: EventEnvelope,
  type: T,
): ReturnType<Parsed<T>['parse']> {
  const result = factPayloadSchemas[type].safeParse(event.payload);
  if (!result.success) {
    throw new FactError(
      'event.invalid',
      event.eventId,
      `Event ${event.eventId} (${type}) has a payload that does not fit its type.`,
    );
  }
  return result.data as ReturnType<Parsed<T>['parse']>;
}

/**
 * Folds the fact events among `events` (others are left to their own
 * reducers). Throws `FactError` for a fact event it cannot read: a newer
 * schema than this build supports, or a payload that does not fit.
 */
export function foldFacts(events: readonly EventEnvelope[]): FactState {
  const transactions = new Map<string, FactTransaction>();
  const tags = new Map<string, TagFact>();
  const replacements = new Map<
    string,
    { fact: ReplacementFact; reversalId: string }
  >();
  // Reversals per original entry, in the order they came.
  const reversals = new Map<string, string[]>();

  for (const event of dedupe(events)) {
    if (!isFactType(event.type)) continue;
    if (event.schema > factSchemaVersion) {
      throw new FactError(
        'event.schema_unsupported',
        event.eventId,
        `Event ${event.eventId} is schema ${event.schema.toString()}; this build reads up to ${factSchemaVersion.toString()}.`,
      );
    }
    switch (event.type) {
      case factEventTypes.recorded:
      case factEventTypes.reversed: {
        const payload = payloadOf(event, event.type);
        // A second event for one entry id loses to the first.
        if (transactions.has(payload.id)) break;
        transactions.set(payload.id, payload);
        if (payload.reversesId !== null) {
          const list = reversals.get(payload.reversesId) ?? [];
          list.push(payload.id);
          reversals.set(payload.reversesId, list);
        }
        break;
      }
      case factEventTypes.replaced: {
        const payload = payloadOf(event, event.type);
        // An entry is replaced at most once.
        if (!replacements.has(payload.originalId)) {
          replacements.set(payload.originalId, {
            fact: {
              originalId: payload.originalId,
              replacementId: payload.replacementId,
            },
            reversalId: payload.reversalId,
          });
        }
        break;
      }
      case factEventTypes.tagged: {
        const payload = payloadOf(event, event.type);
        for (const tagId of payload.tagIds) {
          tags.set(`${payload.transactionId}\0${tagId}`, {
            transactionId: payload.transactionId,
            tagId,
          });
        }
        break;
      }
    }
  }

  const held: HeldReversal[] = [];
  const heldIds = new Set<string>();
  for (const [originalId, ids] of reversals) {
    const [winnerId, ...losers] = ids;
    if (winnerId === undefined) continue;
    for (const reversalId of losers) {
      const replacementIds = [...replacements.values()]
        .filter((entry) => entry.reversalId === reversalId)
        .map((entry) => entry.fact.replacementId)
        .sort(byText);
      held.push({ originalId, winnerId, reversalId, replacementIds });
      heldIds.add(reversalId);
      for (const id of replacementIds) heldIds.add(id);
    }
  }

  const kept = [...transactions.values()]
    .filter((transaction) => !heldIds.has(transaction.id))
    .sort((a, b) => byText(a.id, b.id));
  const present = new Set(kept.map((transaction) => transaction.id));

  return {
    transactions: kept.map(rowOf),
    postings: kept.flatMap((transaction) =>
      transaction.postings.map((posting, position) => ({
        ...posting,
        transactionId: transaction.id,
        position,
      })),
    ),
    // Facts about an entry that has not arrived (or is held back) wait out
    // of the rows; they apply once the entry is in the set.
    tags: [...tags.values()]
      .filter((tag) => present.has(tag.transactionId))
      .sort(
        (a, b) =>
          byText(a.transactionId, b.transactionId) || byText(a.tagId, b.tagId),
      ),
    replacements: [...replacements.values()]
      .map((entry) => entry.fact)
      .filter(
        (fact) =>
          present.has(fact.originalId) && present.has(fact.replacementId),
      )
      .sort((a, b) => byText(a.originalId, b.originalId)),
    held: held.sort((a, b) => byText(a.reversalId, b.reversalId)),
  };
}
