import { describe, expect, it } from 'vitest';
import { eventEnvelopeSchema } from './event.ts';

const valid = {
  ledgerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  eventId: '2ed6657d-e927-568b-95e1-2665a8aea6a2',
  author: 'phone-1',
  seq: 1,
  hlc: '0000000f4240-0000-phone-1',
  schema: 1,
  enc: null,
  type: 'transaction.recorded',
  payload: { note: 'tea', cents: 350 },
};

describe('eventEnvelopeSchema', () => {
  it('accepts a well-formed envelope', () => {
    expect(eventEnvelopeSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['a ledger id that is not a UUID', { ledgerId: 'ledger' }],
    ['an event id that is not a UUID', { eventId: '1234' }],
    ['an author with spaces', { author: 'my phone' }],
    ['an empty author', { author: '' }],
    ['a zero seq', { seq: 0 }],
    ['a fractional seq', { seq: 1.5 }],
    ['an unpadded clock', { hlc: 'f4240-0-phone-1' }],
    ['an upper-case clock', { hlc: '0000000F4240-0000-phone-1' }],
    ['a zero schema', { schema: 0 }],
    ['an enc that is set', { enc: 'aes' }],
    ['an empty type', { type: '' }],
    ['a type in upper case', { type: 'Transaction' }],
  ])('rejects %s', (_name, change) => {
    expect(eventEnvelopeSchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
  });

  it('rejects a missing field', () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.payload;
    expect(eventEnvelopeSchema.safeParse(rest).success).toBe(false);
  });
});
