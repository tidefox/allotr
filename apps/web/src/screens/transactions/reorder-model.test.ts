import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  dropMove,
  reorderableDays,
  stepMove,
  stepsFor,
  type Move,
} from './reorder-model.ts';

// A day is listed newest first: the entry listed below a row came before it.
const ids = ['d', 'c', 'b', 'a'];

describe('stepMove', () => {
  it('moves up to follow the entry above in time', () => {
    expect(stepMove(ids, 'b', -1)).toEqual({
      id: 'b',
      afterId: 'c',
      position: 2,
      count: 4,
    });
  });

  it('moves down to follow the entry below it in time, or the day start', () => {
    expect(stepMove(ids, 'c', 1)).toMatchObject({ afterId: 'a', position: 3 });
    expect(stepMove(ids, 'b', 1)).toMatchObject({ afterId: null, position: 4 });
    expect(stepMove(ids, 'd', 1)).toMatchObject({ afterId: 'b', position: 2 });
  });

  it('refuses a step past an edge or for an unknown entry', () => {
    expect(stepMove(ids, 'd', -1)).toBeNull();
    expect(stepMove(ids, 'a', 1)).toBeNull();
    expect(stepMove(ids, 'zzz', 1)).toBeNull();
  });
});

describe('dropMove', () => {
  it('drops an entry before or after another row', () => {
    expect(dropMove(ids, new Set(['a']), 'd', 'before')).toMatchObject({
      id: 'a',
      afterId: 'd',
      position: 1,
    });
    expect(dropMove(ids, new Set(['d']), 'a', 'after')).toMatchObject({
      id: 'd',
      afterId: null,
      position: 4,
    });
  });

  it('changes nothing when dropped where it already is', () => {
    expect(dropMove(ids, new Set(['c']), 'c', 'after')).toBeNull();
    expect(dropMove(ids, new Set(['c']), 'd', 'after')).toBeNull();
    expect(dropMove(ids, new Set(['c']), 'b', 'before')).toBeNull();
  });

  it('names a place that, applied, gives the order the drop showed', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.nat(50), { minLength: 2, maxLength: 8 }),
        fc.nat(),
        fc.nat(),
        fc.boolean(),
        (numbers, a, b, before) => {
          const list = numbers.map(String);
          const id = list[a % list.length] ?? '';
          const target = list[b % list.length] ?? '';
          const move: Move | null = dropMove(
            list,
            new Set([id]),
            target,
            before ? 'before' : 'after',
          );
          if (move === null) return true;
          // Apply the API's rule: the entry follows `afterId` in time, which
          // is the row listed below it.
          const rest = list.filter((x) => x !== id);
          const at =
            move.afterId === null ? rest.length : rest.indexOf(move.afterId);
          rest.splice(at, 0, id);
          return rest.indexOf(id) + 1 === move.position && at >= 0;
        },
      ),
    );
  });
});

describe('reorderableDays', () => {
  const days = [
    { key: '2026-03-11', rows: [{ id: 'a' }, { id: 'b' }] },
    { key: '2026-03-10', rows: [{ id: 'c' }] },
    { key: '2026-03-09', rows: [{ id: 'd' }, { id: 'e' }] },
  ];

  it('allows days with two or more rows, only when grouped by day', () => {
    expect([...reorderableDays(days, 'day', false)]).toEqual([
      '2026-03-11',
      '2026-03-09',
    ]);
    expect(reorderableDays(days, 'category', false).size).toBe(0);
    expect(reorderableDays(days, 'none', false).size).toBe(0);
  });

  it('leaves out the last day while more pages wait', () => {
    expect([...reorderableDays(days, 'day', true)]).toEqual(['2026-03-11']);
  });

  it('gives both steps for an entry in a movable day', () => {
    const movable = reorderableDays(days, 'day', false);
    const steps = stepsFor(days, movable, 'a');
    expect(steps?.up).toBeNull();
    expect(steps?.down).toMatchObject({ id: 'a', afterId: null });
    expect(stepsFor(days, movable, 'c')).toBeNull();
    expect(stepsFor(days, movable, undefined)).toBeNull();
  });
});
