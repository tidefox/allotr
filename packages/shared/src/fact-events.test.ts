import { describe, expect, it } from 'vitest';
import {
  factEventTypes,
  factPayloadSchemas,
  taggedPayloadSchema,
} from './fact-events.ts';

const posting = {
  id: 'p1',
  accountId: 'a1',
  amountMinor: -500,
  currency: 'USD',
  categoryId: null,
};
const entry = {
  id: 't1',
  kind: 'expense',
  occurredOn: '2026-03-10',
  occurredTime: null,
  createdAt: '2026-03-10T08:00:00.000Z',
  source: 'api',
  client: null,
  categoryId: 'c1',
  note: null,
  funding: 'own',
  reversesId: null,
  idempotencyKey: null,
  impliedRate: null,
  switchAccountId: null,
  switchBudgetGroup: null,
  postings: [posting, { ...posting, id: 'p2', amountMinor: 500 }],
};

const recorded = factPayloadSchemas[factEventTypes.recorded];
const reversed = factPayloadSchemas[factEventTypes.reversed];

describe('fact payload schemas', () => {
  it('accepts a full entry with its postings', () => {
    expect(recorded.parse(entry)).toEqual(entry);
  });

  it.each([
    ['a float amount', { postings: [{ ...posting, amountMinor: 1.5 }] }],
    ['a zero amount', { postings: [{ ...posting, amountMinor: 0 }] }],
    [
      'a posting with no currency',
      { postings: [{ ...posting, currency: undefined }] },
    ],
    ['an unknown currency', { postings: [{ ...posting, currency: 'ZZZ' }] }],
    ['a bad date', { occurredOn: '2026-02-31' }],
    ['a bad rate', { impliedRate: '1,5' }],
    ['an unknown kind', { kind: 'gift' }],
    ['a reversal on the recorded type', { kind: 'reversal', reversesId: 't0' }],
  ])('rejects %s', (_name, change) => {
    expect(recorded.safeParse({ ...entry, ...change }).success).toBe(false);
  });

  it('wants a reversal to say what it undoes', () => {
    expect(reversed.safeParse(entry).success).toBe(false);
    expect(
      reversed.safeParse({ ...entry, kind: 'reversal', reversesId: 't0' })
        .success,
    ).toBe(true);
  });

  it('wants at least one tag', () => {
    expect(
      taggedPayloadSchema.safeParse({ transactionId: 't1', tagIds: [] })
        .success,
    ).toBe(false);
  });
});
