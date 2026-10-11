import {
  localDate,
  money,
  type BudgetStatusView,
  type BudgetView,
  type CategoryView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { budgetRows, periodPace } from './budgets.ts';

const m = (n: number) => money(n, 'USD');
const budget = (id: string, categoryId: string, over?: Partial<BudgetView>) =>
  ({
    id,
    name: id,
    target: { kind: 'category', categoryId },
    spent: m(300),
    left: m(700),
    overflow: m(0),
    ...over,
  }) as BudgetView;
const category = (id: string, parentId: string | null): CategoryView =>
  ({
    id,
    name: id,
    kind: 'expense',
    parentId,
    position: 1,
    colour: 'series-3',
    icon: 'beer',
    mergedIntoId: null,
  }) as CategoryView;
const categories = [
  category('c1', null),
  category('c2', 'c1'),
  category('c3', 'c1'),
];
const status = (
  b: BudgetView[],
  parents: BudgetStatusView['parents'] = [],
) => ({ budgets: b, parents });

describe('budgetRows', () => {
  it('sizes the bar from spent against what it had', () => {
    const [row] = budgetRows(status([budget('b1', 'c1')]), categories);
    expect(row?.fraction).toBeCloseTo(0.3);
    expect(row?.over).toBe(false);
    expect(row?.icon).toBe('beer');
    expect(row?.colour).toBe(3);
    expect(row?.role).toBe('flat');
    expect(row?.spent).toEqual(m(300));
    expect(row?.left).toEqual(m(700));
  });
  it('marks overflow and falls back for the buffer', () => {
    const [row] = budgetRows(
      status([
        budget('buf', 'x', {
          target: { kind: 'buffer' },
          overflow: m(50),
          spent: m(100),
          left: m(0),
        }),
      ]),
      categories,
    );
    expect(row?.over).toBe(true);
    expect(row?.fraction).toBe(1);
    // Past what it had: the server's overflow with a minus sign.
    expect(row?.left).toEqual(m(-50));
    expect(row?.icon).toBeNull();
  });
  it('puts a parent row with the server total over its children', () => {
    const rows = budgetRows(
      status(
        [
          budget('b2', 'c2', { spent: m(100), left: m(100) }),
          budget('b3', 'c3', { spent: m(50), left: m(250) }),
        ],
        [
          {
            categoryId: 'c1',
            budgetIds: ['b2', 'b3'],
            planned: m(500),
            spent: m(150),
            left: m(350),
          },
        ],
      ),
      categories,
    );
    expect(rows.map((r) => [r.id, r.role])).toEqual([
      ['c1', 'parent'],
      ['b2', 'child'],
      ['b3', 'last-child'],
    ]);
    expect(rows[0]?.spent).toEqual(m(150));
    expect(rows[0]?.left).toEqual(m(350));
    expect(rows[0]?.fraction).toBeCloseTo(0.3);
  });
});

describe('periodPace', () => {
  it('counts today as a day gone', () => {
    expect(
      periodPace({
        today: localDate('2026-03-15'),
        period: { from: localDate('2026-03-01'), to: localDate('2026-03-29') },
      }),
    ).toEqual({ fraction: 15 / 28, day: 15, length: 28 });
  });
  it('has no pace for an empty period', () => {
    expect(
      periodPace({
        today: localDate('2026-03-01'),
        period: { from: localDate('2026-03-01'), to: localDate('2026-03-01') },
      }),
    ).toBeNull();
  });
});
