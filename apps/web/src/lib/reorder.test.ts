import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { reorder } from './reorder.ts';

describe('reorder', () => {
  const list = ['free', 'buffer', 'a', 'b', 'c'];

  it('moves a row before or after a target', () => {
    expect(reorder(list, new Set(['c']), 'free', 'before')).toEqual([
      'c',
      'free',
      'buffer',
      'a',
      'b',
    ]);
    expect(reorder(list, new Set(['free']), 'a', 'after')).toEqual([
      'buffer',
      'a',
      'free',
      'b',
      'c',
    ]);
  });

  it('ignores a drop onto itself or an unknown target', () => {
    expect(reorder(list, new Set(['a']), 'a', 'after')).toEqual(list);
    expect(reorder(list, new Set(['a']), 'zzz', 'after')).toEqual(list);
  });

  it('keeps every row exactly once', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1 }), {
          minLength: 2,
          maxLength: 12,
        }),
        fc.nat(),
        fc.nat(),
        fc.boolean(),
        (ids, a, b, before) => {
          const moved = ids[a % ids.length] as string;
          const target = ids[b % ids.length] as string;
          const next = reorder(
            ids,
            new Set([moved]),
            target,
            before ? 'before' : 'after',
          );
          expect([...next].sort()).toEqual([...ids].sort());
        },
      ),
    );
  });
});
