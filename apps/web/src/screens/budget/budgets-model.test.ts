import { describe, expect, it } from 'vitest';
import type { BudgetView, CategoryView } from '@allotr/shared';
import {
  budgetTree,
  freeCategories,
  subCandidates,
  tierOf,
  visibleEntries,
} from './budgets-model.ts';

const money = (amountMinor: number) =>
  ({ amountMinor, currency: 'USD' }) as BudgetView['left'];

function category(
  id: string,
  parentId: string | null,
  position: number,
): CategoryView {
  return {
    id,
    name: id,
    kind: 'expense',
    parentId,
    isPaycheck: false,
    incomeClass: 'earned',
    position,
    colour: null,
    icon: null,
    mergedIntoId: null,
  };
}

function budget(id: string, categoryId: string, left = 100): BudgetView {
  return {
    id,
    name: id,
    target: { kind: 'category', categoryId },
    mode: 'daily',
    leftover: 'free',
    startedOn: '2026-10-01',
    amount: money(200),
    planned: money(200),
    carriedIn: money(0),
    spent: money(200 - left),
    left: money(left),
    overflow: money(0),
    coveredOut: money(0),
    restored: money(0),
    held: money(0),
  } as BudgetView;
}

const categories = [
  category('food', null, 1),
  category('groceries', 'food', 1),
  category('dining', 'food', 2),
  category('fun', null, 2),
];

const setAside = (id: string, categoryId: string): BudgetView => ({
  ...budget(id, categoryId),
  mode: 'set-aside',
});
const buffer = (id: string): BudgetView => ({
  ...budget(id, ''),
  mode: 'set-aside',
  target: { kind: 'buffer' },
});

describe('tierOf', () => {
  it('ranks daily, then set-aside, then the Buffer', () => {
    expect([
      tierOf([budget('a', 'fun')]),
      tierOf([setAside('b', 'fun')]),
      tierOf([buffer('c')]),
      // A group with any daily budget in it stays daily.
      tierOf([setAside('d', 'fun'), budget('e', 'dining')]),
    ]).toEqual([0, 1, 2, 0]);
  });
});

describe('budgetTree order', () => {
  it('lists daily budgets first, set-aside next and the Buffer last', () => {
    const all = [
      category('food', null, 1),
      category('holiday', null, 2),
      category('fun', null, 3),
      category('car', null, 4),
    ];
    // Created (and positioned) with a set-aside budget between daily ones.
    const tree = budgetTree(
      [
        buffer('buf'),
        budget('b-food', 'food'),
        setAside('b-holiday', 'holiday'),
        budget('b-fun', 'fun'),
        setAside('b-car', 'car'),
      ],
      all,
    );
    // Each tier keeps the user's category order.
    expect(tree.map((e) => e.key)).toEqual([
      'food',
      'fun',
      'holiday',
      'car',
      'buf',
    ]);
  });

  it('keeps a parent with its children as one block', () => {
    const tree = budgetTree(
      [
        setAside('b-fun', 'fun'),
        budget('b1', 'groceries'),
        budget('b2', 'dining'),
      ],
      categories,
    );
    expect(tree.map((e) => e.key)).toEqual(['food', 'b1', 'b2', 'fun']);
  });
});

describe('budgetTree', () => {
  it('nests subcategory budgets under a header with no figures', () => {
    const tree = budgetTree(
      [budget('b1', 'groceries'), budget('b2', 'dining'), budget('b3', 'fun')],
      categories,
    );
    expect(tree.map((e) => [e.key, e.role])).toEqual([
      ['food', 'parent'],
      ['b1', 'child'],
      ['b2', 'last-child'],
      ['fun', 'flat'],
    ]);
    expect(tree[0]?.budget).toBeNull();
    expect(tree[0]?.total).toBeNull();
  });

  it('gives a header with no budget the server totals and a bar', () => {
    const tree = budgetTree(
      [budget('b1', 'groceries'), budget('b2', 'dining')],
      categories,
      [
        {
          categoryId: 'food',
          budgetIds: ['b1', 'b2'],
          planned: money(400),
          spent: money(300),
          left: money(100),
        },
      ],
    );
    expect(tree[0]?.total?.spent).toEqual(money(300));
    expect(tree[0]?.fraction).toBeCloseTo(0.75);
    expect(tree[1]?.total).toBeNull();
  });

  it('gives a parent its own budget and fills the bar from spent and left', () => {
    const tree = budgetTree(
      [budget('p', 'food', 50), budget('b1', 'groceries')],
      categories,
    );
    expect(tree[0]?.budget?.id).toBe('p');
    expect(tree[0]?.fraction).toBeCloseTo(0.75);
  });

  it('lists tag and Buffer budgets last', () => {
    const buffer = {
      ...budget('buf', 'x'),
      target: { kind: 'buffer' },
    } as BudgetView;
    const tree = budgetTree([buffer, budget('b3', 'fun')], categories);
    expect(tree.map((e) => e.key)).toEqual(['fun', 'buf']);
  });
});

describe('visibleEntries', () => {
  it('hides the children of a folded parent', () => {
    const tree = budgetTree([budget('b1', 'groceries')], categories);
    expect(visibleEntries(tree, new Set(['food'])).map((e) => e.key)).toEqual([
      'food',
    ]);
  });
});

describe('candidates', () => {
  it('offers subcategories and categories without a budget', () => {
    const budgets = [budget('p', 'food'), budget('b1', 'groceries')];
    expect(
      subCandidates(budgets[0] as BudgetView, budgets, categories),
    ).toEqual([categories[2]]);
    expect(freeCategories(budgets, categories).map((c) => c.id)).toEqual([
      'dining',
      'fun',
    ]);
  });
});
