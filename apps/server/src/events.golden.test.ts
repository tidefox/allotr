import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { foldFacts } from '@allotr/core';
import { eventEnvelopeSchema, factPayloadSchemas } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Golden event files per schema version (ADR 0035). Old events stay valid
// forever, so this file must keep folding to the same rows.

const golden = z
  .object({
    events: z.array(eventEnvelopeSchema),
    expected: z.record(z.string(), z.unknown()),
  })
  .parse(
    JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          '../../../testdata/golden/events/facts-schema-1.json',
        ),
        'utf8',
      ),
    ),
  );

describe('fact events, schema 1', () => {
  it('has a payload that fits its type, for each of the four types', () => {
    const types = new Set(golden.events.map((e) => e.type));
    expect([...types].sort()).toEqual(Object.keys(factPayloadSchemas).sort());
    for (const event of golden.events) {
      const schema =
        factPayloadSchemas[event.type as keyof typeof factPayloadSchemas];
      expect(schema.safeParse(event.payload).success, event.eventId).toBe(true);
    }
  });

  it('folds to the recorded rows', () => {
    expect(foldFacts(golden.events)).toEqual(golden.expected);
  });
});
