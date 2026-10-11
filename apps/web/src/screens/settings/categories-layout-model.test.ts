import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { CategoryView } from '@allotr/shared';
import { categoryTree } from '@/features/settings/categories-model';
import {
  categoryRows,
  iconLabel,
  lastPosition,
  moveParents,
  positionChanges,
  siblingIds,
  stepOrder,
  withPositions,
} from './categories-layout-model.ts';

function cat(
  id: string,
  over: Partial<CategoryView> & { position: number },
): CategoryView {
  return {
    id,
    name: id,
    kind: 'expense',
    parentId: null,
    isPaycheck: false,
    incomeClass: 'earned',
    colour: null,
    icon: null,
    mergedIntoId: null,
    ...over,
  };
}

const food = cat('food', { position: 1 });
const coffee = cat('coffee', { position: 1, parentId: 'food' });
const lunch = cat('lunch', { position: 2, parentId: 'food' });
const home = cat('home', { position: 2 });
const all = [
  food,
  coffee,
  lunch,
  home,
  cat('pay', { position: 1, kind: 'income' }),
  cat('old', { position: 3, mergedIntoId: 'food' }),
];
const nodes = categoryTree(all).expense;

describe('categoryRows', () => {
  it('lists parents with their connectors', () => {
    const rows = categoryRows(nodes, new Set());
    expect(rows.map((r) => [r.category.id, r.role])).toEqual([
      ['food', 'parent'],
      ['coffee', 'child'],
      ['lunch', 'last-child'],
      ['home', 'parent'],
    ]);
    expect(rows.map((r) => r.foldable)).toEqual([true, false, false, false]);
  });

  it('hides the children of a folded parent', () => {
    const rows = categoryRows(nodes, new Set(['food']));
    expect(rows.map((r) => r.category.id)).toEqual(['food', 'home']);
  });

  it('keeps reorders inside one group', () => {
    const rows = categoryRows(nodes, new Set());
    expect(rows.map((r) => r.group)).toEqual([
      'kind:expense',
      'food',
      'food',
      'kind:expense',
    ]);
  });
});

describe('siblings and steps', () => {
  it('finds the siblings of a parent and of a child', () => {
    expect(siblingIds(nodes, food)).toEqual(['food', 'home']);
    expect(siblingIds(nodes, lunch)).toEqual(['coffee', 'lunch']);
  });

  it('steps one place and stops at the ends', () => {
    expect(stepOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(stepOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(stepOrder(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(stepOrder(['a', 'b', 'c'], 'c', 1)).toBeNull();
  });
});

describe('positionChanges', () => {
  it('writes only the positions that differ', () => {
    const siblings = [
      cat('a', { position: 1 }),
      cat('b', { position: 2 }),
      cat('c', { position: 3 }),
    ];
    expect(positionChanges(siblings, ['a', 'c', 'b'])).toEqual([
      { id: 'c', position: 2 },
      { id: 'b', position: 3 },
    ]);
    expect(positionChanges(siblings, ['a', 'b', 'c'])).toEqual([]);
  });

  it('renumbers equal positions', () => {
    const siblings = [cat('a', { position: 0 }), cat('b', { position: 0 })];
    expect(positionChanges(siblings, ['b', 'a'])).toEqual([
      { id: 'b', position: 1 },
      { id: 'a', position: 2 },
    ]);
  });

  it('applied, always yields the requested order', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.nat(),
        (ids, seed) => {
          const siblings = ids.map((id, i) =>
            cat(id, { position: ((i * 7 + seed) % 5) + 1 }),
          );
          const order = [...ids].reverse();
          const changed = withPositions(
            siblings,
            new Map(
              positionChanges(siblings, order).map((c) => [c.id, c.position]),
            ),
          );
          expect(
            changed.sort((a, b) => a.position - b.position).map((c) => c.id),
          ).toEqual(order);
        },
      ),
    );
  });
});

describe('moveParents', () => {
  it('offers other top levels of the kind, not the current parent', () => {
    expect(moveParents(coffee, all).map((c) => c.id)).toEqual(['home']);
    expect(moveParents(home, all).map((c) => c.id)).toEqual(['food']);
  });

  it('offers nothing to a parent with subcategories', () => {
    expect(moveParents(food, all)).toEqual([]);
  });
});

describe('lastPosition', () => {
  it('goes after the last sibling of the new parent', () => {
    expect(lastPosition(all, 'food', 'expense')).toBe(3);
    expect(lastPosition(all, null, 'income')).toBe(2);
    expect(lastPosition(all, 'home', 'expense')).toBe(1);
  });
});

describe('iconLabel', () => {
  it('reads a stored key as words', () => {
    expect(iconLabel('shopping-basket')).toBe('Shopping basket');
    expect(iconLabel('house')).toBe('House');
  });
});
