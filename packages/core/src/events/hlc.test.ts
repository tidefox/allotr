import { eventEnvelopeSchema, uuidv5 } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  compareEvents,
  DEFAULT_MAX_DRIFT_MS,
  formatHlc,
  HlcError,
  hlcStart,
  MAX_HLC_COUNTER,
  MAX_HLC_MS,
  parseHlc,
  receive,
  tick,
  type Hlc,
} from './hlc.ts';
import { deterministicId } from './ids.ts';

const code = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error instanceof HlcError ? error.code : 'other';
  }
  return 'none';
};

const nodeArb = fc.stringMatching(/^[0-9A-Za-z_-]{1,12}$/);
const msArb = fc.integer({ min: 0, max: 4_000_000_000_000 });
const hlcArb = fc.record({
  ms: msArb,
  counter: fc.integer({ min: 0, max: MAX_HLC_COUNTER }),
  node: nodeArb,
});
const before = (a: string, b: string) => a < b;

describe('encoding', () => {
  it('is fixed-width and round-trips', () => {
    expect(formatHlc({ ms: 1_000_000, counter: 2, node: 'a' })).toBe(
      '0000000f4240-0002-a',
    );
    fc.assert(
      fc.property(hlcArb, (hlc) => {
        expect(parseHlc(formatHlc(hlc))).toEqual(hlc);
      }),
    );
  });

  it('sorts with < in clock order', () => {
    fc.assert(
      fc.property(hlcArb, hlcArb, (a, b) => {
        const byFields =
          a.ms - b.ms ||
          a.counter - b.counter ||
          (a.node === b.node ? 0 : a.node < b.node ? -1 : 1);
        const x = formatHlc(a);
        const y = formatHlc(b);
        expect(x < y).toBe(byFields < 0);
        expect(x === y).toBe(byFields === 0);
      }),
    );
  });

  it('refuses values it cannot encode', () => {
    expect(code(() => formatHlc({ ms: -1, counter: 0, node: 'a' }))).toBe(
      'hlc.invalid',
    );
    expect(
      code(() => formatHlc({ ms: MAX_HLC_MS + 1, counter: 0, node: 'a' })),
    ).toBe('hlc.time_overflow');
    expect(code(() => formatHlc({ ms: 1, counter: 65536, node: 'a' }))).toBe(
      'hlc.invalid',
    );
    expect(code(() => formatHlc({ ms: 1, counter: 0, node: 'a b' }))).toBe(
      'hlc.invalid',
    );
    expect(code(() => parseHlc('nonsense'))).toBe('hlc.invalid');
    expect(code(() => hlcStart('', 1))).toBe('hlc.invalid');
  });

  it('satisfies the envelope schema', () => {
    const hlc = formatHlc({
      ms: 1_700_000_000_000,
      counter: 3,
      node: 'tablet',
    });
    const ledgerId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const envelope = {
      ledgerId,
      eventId: deterministicId(ledgerId, 'seed:accounts:1'),
      author: 'tablet',
      seq: 1,
      hlc,
      schema: 1,
      enc: null,
      type: 'ledger.seeded',
      payload: null,
    };
    expect(eventEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });
});

describe('tick and receive', () => {
  it('tick follows the clock, then the counter', () => {
    const start = hlcStart('a', 100);
    expect(tick(start, 100)).toEqual({ ms: 100, counter: 1, node: 'a' });
    expect(tick(start, 150)).toEqual({ ms: 150, counter: 0, node: 'a' });
    expect(tick(start, 50)).toEqual({ ms: 100, counter: 1, node: 'a' });
  });

  it('receive moves past both clocks and keeps the local node', () => {
    const local: Hlc = { ms: 100, counter: 4, node: 'a' };
    const remote: Hlc = { ms: 100, counter: 9, node: 'b' };
    expect(receive(local, remote, 90)).toEqual({
      ms: 100,
      counter: 10,
      node: 'a',
    });
    expect(receive(local, { ...remote, ms: 80 }, 90)).toEqual({
      ms: 100,
      counter: 5,
      node: 'a',
    });
    expect(receive(local, { ...remote, ms: 120 }, 90)).toEqual({
      ms: 120,
      counter: 10,
      node: 'a',
    });
    expect(receive(local, remote, 200)).toEqual({
      ms: 200,
      counter: 0,
      node: 'a',
    });
  });

  it('refuses a counter overflow', () => {
    const full: Hlc = { ms: 5, counter: MAX_HLC_COUNTER, node: 'a' };
    expect(code(() => tick(full, 5))).toBe('hlc.counter_overflow');
    expect(tick(full, 6).counter).toBe(0);
  });

  it('refuses a remote too far ahead of now, and only then', () => {
    fc.assert(
      fc.property(
        hlcArb,
        hlcArb,
        msArb,
        fc.integer({ min: 0, max: 100_000 }),
        (local, remote, now, maxDriftMs) => {
          const outcome = code(() =>
            receive(local, remote, now, { maxDriftMs }),
          );
          if (remote.ms - now > maxDriftMs) {
            expect(outcome).toBe('hlc.drift');
          } else if (outcome !== 'hlc.counter_overflow') {
            expect(outcome).toBe('none');
          }
        },
      ),
    );
  });

  it('allows an hour of drift by default', () => {
    const local = hlcStart('a', 1000);
    const at = (ahead: number): Hlc => ({
      ms: 1000 + ahead,
      counter: 0,
      node: 'b',
    });
    expect(code(() => receive(local, at(DEFAULT_MAX_DRIFT_MS), 1000))).toBe(
      'none',
    );
    expect(code(() => receive(local, at(DEFAULT_MAX_DRIFT_MS + 1), 1000))).toBe(
      'hlc.drift',
    );
  });

  // Several nodes with their own clocks, which jump forwards and backwards,
  // write events and deliver each other's events in any order.
  type Step =
    | { kind: 'tick'; node: number; skew: number }
    | { kind: 'receive'; node: number; from: number; skew: number };

  const stepArb = (nodes: number): fc.Arbitrary<Step> =>
    fc.oneof(
      fc.record({
        kind: fc.constant('tick' as const),
        node: fc.nat(nodes - 1),
        skew: fc.integer({ min: -50, max: 50 }),
      }),
      fc.record({
        kind: fc.constant('receive' as const),
        node: fc.nat(nodes - 1),
        from: fc.nat(),
        skew: fc.integer({ min: -50, max: 50 }),
      }),
    );

  it('is monotonic under any interleaving, with clocks going backwards', () => {
    fc.assert(
      fc.property(fc.array(stepArb(4), { maxLength: 200 }), (steps) => {
        const clocks = [0, 1, 2, 3].map((n) => hlcStart(`n${String(n)}`, 1000));
        const sent: string[][] = [[], [], [], []];
        let time = 1000;
        for (const step of steps) {
          time = Math.max(0, time + step.skew);
          const node = step.node;
          const local = clocks[node];
          if (local === undefined) continue;
          let after: Hlc;
          if (step.kind === 'tick') {
            after = tick(local, time);
            sent[node]?.push(formatHlc(after));
          } else {
            const from = sent[step.from % 4];
            const text = from?.[step.from % Math.max(from.length, 1)];
            if (text === undefined) continue;
            const remote = parseHlc(text);
            after = receive(local, remote, time, { maxDriftMs: Infinity });
            expect(before(text, formatHlc(after))).toBe(true);
          }
          expect(before(formatHlc(local), formatHlc(after))).toBe(true);
          clocks[node] = after;
        }
        for (const log of sent) {
          expect([...log].sort()).toEqual(log);
          expect(new Set(log).size).toBe(log.length);
        }
      }),
    );
  });
});

describe('compareEvents', () => {
  const eventArb = fc.record({
    hlc: fc
      .constantFrom('a', 'b')
      .map((n) => formatHlc({ ms: 1, counter: 0, node: n })),
    author: fc.constantFrom('a', 'b', 'c'),
    seq: fc.integer({ min: 1, max: 3 }),
  });

  it('orders by hlc, then author, then seq', () => {
    const hlc = formatHlc({ ms: 1, counter: 0, node: 'a' });
    expect(
      compareEvents({ hlc, author: 'a', seq: 2 }, { hlc, author: 'b', seq: 1 }),
    ).toBe(-1);
    expect(
      compareEvents({ hlc, author: 'a', seq: 2 }, { hlc, author: 'a', seq: 1 }),
    ).toBe(1);
    expect(
      compareEvents({ hlc, author: 'a', seq: 1 }, { hlc, author: 'a', seq: 1 }),
    ).toBe(0);
  });

  it('is a total order', () => {
    fc.assert(
      fc.property(eventArb, eventArb, eventArb, (a, b, c) => {
        expect(compareEvents(a, a)).toBe(0);
        expect(compareEvents(a, b)).toBe(-compareEvents(b, a) || 0);
        if (compareEvents(a, b) <= 0 && compareEvents(b, c) <= 0) {
          expect(compareEvents(a, c)).toBeLessThanOrEqual(0);
        }
        if (compareEvents(a, b) === 0) expect(b).toEqual(a);
      }),
    );
  });
});

describe('deterministicId', () => {
  it('is uuidv5 of the ledger and key', () => {
    const ledger = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    expect(deterministicId(ledger, 'recurring:rent:2026-10')).toBe(
      uuidv5(ledger, 'recurring:rent:2026-10'),
    );
    expect(deterministicId(ledger, 'a')).not.toBe(deterministicId(ledger, 'b'));
  });
});
