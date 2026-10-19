import {
  factEventTypes,
  uuidv5,
  type EventEnvelope,
  type FactTransaction,
} from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FactError, foldFacts } from './facts.ts';
import { formatHlc } from './hlc.ts';

// The reducer is a pure function of the set of events (ADR 0032, ADR 0033).
// All ids and amounts are made up.

const ledgerId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function transaction(
  id: string,
  extra: Partial<FactTransaction> = {},
): FactTransaction {
  return {
    id,
    kind: 'expense',
    occurredOn: '2026-03-10' as FactTransaction['occurredOn'],
    occurredTime: null,
    createdAt: '2026-03-10T08:00:00.000Z',
    source: 'api',
    client: null,
    categoryId: 'cat-1',
    note: null,
    funding: 'own',
    reversesId: null,
    idempotencyKey: null,
    impliedRate: null,
    switchAccountId: null,
    switchBudgetGroup: null,
    postings: [
      {
        id: `${id}-p0`,
        accountId: 'acc-1',
        amountMinor: -500,
        currency: 'USD' as FactTransaction['postings'][number]['currency'],
        categoryId: null,
      },
      {
        id: `${id}-p1`,
        accountId: 'acc-2',
        amountMinor: 500,
        currency: 'USD' as FactTransaction['postings'][number]['currency'],
        categoryId: 'cat-1',
      },
    ],
    ...extra,
  };
}

let counter = 0;
function event(
  type: string,
  payload: unknown,
  at: { ms?: number; author?: string; seq?: number; schema?: number } = {},
): EventEnvelope {
  counter += 1;
  const author = at.author ?? 'phone';
  return {
    ledgerId,
    eventId: uuidv5(ledgerId, `test:${counter.toString()}`),
    author,
    seq: at.seq ?? counter,
    hlc: formatHlc({ ms: at.ms ?? counter, counter: 0, node: author }),
    schema: at.schema ?? 1,
    enc: null,
    type,
    payload: payload as EventEnvelope['payload'],
  };
}

const recorded = (
  t: FactTransaction,
  at?: Parameters<typeof event>[2],
): EventEnvelope => event(factEventTypes.recorded, t, at);
const reversal = (
  id: string,
  of: string,
  at?: Parameters<typeof event>[2],
): EventEnvelope =>
  event(
    factEventTypes.reversed,
    transaction(id, { kind: 'reversal', reversesId: of, categoryId: null }),
    at,
  );

describe('foldFacts', () => {
  it('folds an entry, its tags, a reversal and a replacement into rows', () => {
    const events = [
      recorded(transaction('t1')),
      event(factEventTypes.tagged, { transactionId: 't1', tagIds: ['b', 'a'] }),
      reversal('t2', 't1'),
      recorded(transaction('t3', { note: 'fixed' })),
      event(factEventTypes.replaced, {
        originalId: 't1',
        replacementId: 't3',
        reversalId: 't2',
      }),
    ];
    const state = foldFacts(events);
    expect(state.transactions.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(state.transactions[1]).toMatchObject({
      kind: 'reversal',
      reversesId: 't1',
    });
    expect(state.postings.map((p) => [p.transactionId, p.position])).toEqual([
      ['t1', 0],
      ['t1', 1],
      ['t2', 0],
      ['t2', 1],
      ['t3', 0],
      ['t3', 1],
    ]);
    expect(state.tags).toEqual([
      { transactionId: 't1', tagId: 'a' },
      { transactionId: 't1', tagId: 'b' },
    ]);
    expect(state.replacements).toEqual([
      { originalId: 't1', replacementId: 't3' },
    ]);
    expect(state.held).toEqual([]);
  });

  it('takes postings from the event and never recomputes them', () => {
    const lopsided = transaction('t1', {
      postings: [
        {
          id: 'p',
          accountId: 'acc-1',
          amountMinor: -123,
          currency: 'JPY' as FactTransaction['postings'][number]['currency'],
          categoryId: null,
        },
      ],
    });
    expect(foldFacts([recorded(lopsided)]).postings).toEqual([
      { ...lopsided.postings[0], transactionId: 't1', position: 0 },
    ]);
  });

  it('keeps an entry with no postings, such as a budget switch', () => {
    const state = foldFacts([
      recorded(
        transaction('t1', {
          kind: 'budget_switch',
          categoryId: null,
          switchAccountId: 'acc-1',
          switchBudgetGroup: 'off',
          postings: [],
        }),
      ),
    ]);
    expect(state.transactions).toHaveLength(1);
    expect(state.postings).toEqual([]);
  });

  it('leaves events of other types to their own reducers', () => {
    const state = foldFacts([event('pool.moved', { anything: true })]);
    expect(state.transactions).toEqual([]);
  });

  it('lets the earlier event win when two claim one entry id', () => {
    const early = recorded(transaction('t1', { note: 'early' }), { ms: 1 });
    const late = recorded(transaction('t1', { note: 'late' }), { ms: 2 });
    expect(foldFacts([late, early]).transactions[0]?.note).toBe('early');
  });

  it('waits to apply tags of an entry that has not arrived', () => {
    const tags = event(factEventTypes.tagged, {
      transactionId: 't1',
      tagIds: ['a'],
    });
    expect(foldFacts([tags]).tags).toEqual([]);
    expect(foldFacts([tags, recorded(transaction('t1'))]).tags).toHaveLength(1);
  });

  it('refuses events it cannot read', () => {
    const code = (events: EventEnvelope[]) => {
      try {
        foldFacts(events);
      } catch (error) {
        return error instanceof FactError ? error.code : 'other';
      }
      return 'none';
    };
    expect(code([recorded(transaction('t1'), { schema: 2 })])).toBe(
      'event.schema_unsupported',
    );
    expect(code([event(factEventTypes.recorded, { id: 't1' })])).toBe(
      'event.invalid',
    );
    // A reversal must come as a reversal event, and not the other way round.
    expect(
      code([
        event(
          factEventTypes.recorded,
          transaction('t1', {
            kind: 'reversal',
            reversesId: 't0',
            categoryId: null,
          }),
        ),
      ]),
    ).toBe('event.invalid');
    expect(code([event(factEventTypes.reversed, transaction('t1'))])).toBe(
      'event.invalid',
    );
  });

  describe('two reversals of one entry', () => {
    const original = recorded(transaction('t1'), { ms: 1 });
    const win = reversal('r1', 't1', { ms: 5, author: 'a' });
    const lose = reversal('r2', 't1', { ms: 9, author: 'b' });
    const loserCopy = recorded(transaction('c2', { note: 'copy' }), {
      ms: 10,
      author: 'b',
    });
    const loserLink = event(
      factEventTypes.replaced,
      { originalId: 't1', replacementId: 'c2', reversalId: 'r2' },
      { ms: 11, author: 'b' },
    );
    const loserTag = event(
      factEventTypes.tagged,
      { transactionId: 'c2', tagIds: ['x'] },
      { ms: 12, author: 'b' },
    );

    it('keeps the lowest and holds the other back with its replacement', () => {
      const state = foldFacts([
        loserTag,
        loserLink,
        loserCopy,
        lose,
        win,
        original,
      ]);
      expect(state.transactions.map((t) => t.id)).toEqual(['r1', 't1']);
      expect(state.tags).toEqual([]);
      expect(state.replacements).toEqual([]);
      expect(state.held).toEqual([
        {
          originalId: 't1',
          winnerId: 'r1',
          reversalId: 'r2',
          replacementIds: ['c2'],
        },
      ]);
    });
  });
});

// A random set of fact events over a few entry ids and tags, with clocks that
// often tie so the author and seq tie-breaks are used.
const authorArb = fc.constantFrom('a', 'b', 'c');
const idArb = fc.constantFrom('t0', 't1', 't2', 't3', 't4');
const eventsArb = fc
  .array(
    fc.oneof(
      fc.record({
        kind: fc.constant('recorded' as const),
        id: idArb,
        note: fc.string({ maxLength: 4 }),
      }),
      fc.record({
        kind: fc.constant('reversed' as const),
        id: idArb,
        of: idArb,
      }),
      fc.record({
        kind: fc.constant('replaced' as const),
        original: idArb,
        replacement: idArb,
        reversal: idArb,
      }),
      fc.record({
        kind: fc.constant('tagged' as const),
        id: idArb,
        tags: fc.uniqueArray(fc.constantFrom('x', 'y', 'z'), { minLength: 1 }),
      }),
    ),
    { maxLength: 14 },
  )
  .chain((specs) =>
    fc
      .array(
        fc.record({ ms: fc.integer({ min: 0, max: 3 }), author: authorArb }),
        { minLength: specs.length, maxLength: specs.length },
      )
      .map((clocks) => {
        const seqs = new Map<string, number>();
        return specs.map((spec, index): EventEnvelope => {
          const { ms, author } = clocks[index] ?? { ms: 0, author: 'a' };
          const seq = (seqs.get(author) ?? 0) + 1;
          seqs.set(author, seq);
          const base = {
            ledgerId,
            eventId: uuidv5(ledgerId, `prop:${index.toString()}`),
            author,
            seq,
            hlc: formatHlc({ ms, counter: 0, node: author }),
            schema: 1,
            enc: null,
          };
          switch (spec.kind) {
            case 'recorded':
              return {
                ...base,
                type: factEventTypes.recorded,
                payload: transaction(spec.id, { note: spec.note }),
              };
            case 'reversed':
              return {
                ...base,
                type: factEventTypes.reversed,
                payload: transaction(`r-${index.toString()}`, {
                  kind: 'reversal',
                  reversesId: spec.of,
                  categoryId: null,
                }),
              };
            case 'replaced':
              return {
                ...base,
                type: factEventTypes.replaced,
                payload: {
                  originalId: spec.original,
                  replacementId: spec.replacement,
                  reversalId: spec.reversal,
                },
              };
            case 'tagged':
              return {
                ...base,
                type: factEventTypes.tagged,
                payload: { transactionId: spec.id, tagIds: spec.tags },
              };
          }
        });
      }),
  );

describe('foldFacts properties', () => {
  it('gives the same rows however the events are delivered', () => {
    fc.assert(
      fc.property(
        eventsArb,
        fc.array(fc.nat(), { minLength: 14, maxLength: 14 }),
        (events, keys) => {
          const shuffled = events
            .map((e, i) => ({ e, key: keys[i] ?? 0 }))
            .sort((a, b) => a.key - b.key)
            .map(({ e }) => e);
          expect(foldFacts(shuffled)).toEqual(foldFacts(events));
          expect(foldFacts([...events].reverse())).toEqual(foldFacts(events));
        },
      ),
    );
  });

  it('ignores events delivered more than once', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        expect(
          foldFacts([...events, ...events, ...[...events].reverse()]),
        ).toEqual(foldFacts(events));
      }),
    );
  });

  it('gives the same rows when the set is split and merged in any grouping', () => {
    fc.assert(
      fc.property(eventsArb, fc.nat(), (events, cut) => {
        const at = events.length === 0 ? 0 : cut % events.length;
        const left = events.slice(0, at);
        const right = events.slice(at);
        // Each device may hold a part, and a conflict copy repeats some.
        expect(foldFacts([...right, ...left, ...left])).toEqual(
          foldFacts(events),
        );
      }),
    );
  });

  it('keeps every posting and tag attached to an entry that is in the rows', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const state = foldFacts(events);
        const ids = new Set(state.transactions.map((t) => t.id));
        expect(state.postings.every((p) => ids.has(p.transactionId))).toBe(
          true,
        );
        expect(state.tags.every((t) => ids.has(t.transactionId))).toBe(true);
        expect(
          state.replacements.every(
            (r) => ids.has(r.originalId) && ids.has(r.replacementId),
          ),
        ).toBe(true);
        // At most one live reversal per entry.
        const reversed = state.transactions
          .map((t) => t.reversesId)
          .filter((id) => id !== null);
        expect(new Set(reversed).size).toBe(reversed.length);
      }),
    );
  });

  it('orders by clock, then author, then seq', () => {
    // Two reversals of one entry that tie on the clock: the lower author wins.
    const original = recorded(transaction('t1'), { ms: 1 });
    const fromB = reversal('rb', 't1', { ms: 5, author: 'b', seq: 1 });
    const fromA = reversal('ra', 't1', { ms: 5, author: 'a', seq: 7 });
    expect(foldFacts([original, fromB, fromA]).held[0]?.reversalId).toBe('rb');
    // And on the same author, the lower seq.
    const first = reversal('r1', 't1', { ms: 5, author: 'a', seq: 2 });
    const second = reversal('r2', 't1', { ms: 5, author: 'a', seq: 3 });
    expect(foldFacts([original, second, first]).held[0]?.reversalId).toBe('r2');
  });
});
