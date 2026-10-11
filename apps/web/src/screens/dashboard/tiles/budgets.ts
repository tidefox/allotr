import {
  daysBetween,
  money,
  type BudgetStatusView,
  type BudgetView,
  type CategoryIcon,
  type CategoryView,
  type Money,
} from '@allotr/shared';
import { budgetTree, type TreeRole } from '@/screens/budget/budgets-model';
import type { SeriesNumber } from '@/lib/category-style';

export type BudgetRow = Readonly<{
  id: string;
  name: string;
  /** Tree position: a parent folds the children of its `group`. */
  role: TreeRole;
  group: string;
  /** The budget's `spent`, or the server's total on a parent header. */
  spent: Money;
  /**
   * What is left; when spending went past it, the server's `overflow`
   * with a minus sign (a sign flip only).
   */
  left: Money;
  /** How full the bar is, 0..1. */
  fraction: number;
  over: boolean;
  /** Set-aside budgets hold money; they get no pace tick. */
  setAside: boolean;
  icon: CategoryIcon | null;
  /** The series number, 1..8. */
  colour: SeriesNumber;
  /** The budget itself; null on a parent header with no budget of its own. */
  budget: BudgetView | null;
  /** The category the row stands for, when it has one. */
  categoryId: string | null;
}>;

/**
 * The category tree as rows: parent rows carry the server's `parents`
 * totals, subcategories sit under them. Nothing is summed here.
 */
export function budgetRows(
  status: Pick<BudgetStatusView, 'budgets' | 'parents'>,
  categories: readonly CategoryView[],
): readonly BudgetRow[] {
  return budgetTree(status.budgets, categories, status.parents).flatMap(
    (e): BudgetRow[] => {
      const figures = e.budget ?? e.total;
      if (figures === null) return [];
      const overflow =
        e.budget !== null && e.budget.overflow.amountMinor > 0
          ? money(-e.budget.overflow.amountMinor, e.budget.overflow.currency)
          : null;
      return [
        {
          id: e.key,
          name: e.name,
          role: e.role,
          group: e.group,
          spent: figures.spent,
          left: overflow ?? figures.left,
          fraction: e.fraction,
          over: e.over,
          setAside: e.budget?.mode === 'set-aside',
          icon: e.icon,
          colour: e.colour,
          budget: e.budget,
          categoryId: e.categoryId,
        },
      ];
    },
  );
}

/**
 * The even-pace tick: the share of the budget period gone by the end of
 * today, and the day numbers for the legend. Day counting only.
 */
export function periodPace(
  status: Pick<BudgetStatusView, 'today' | 'period'>,
): { fraction: number; day: number; length: number } | null {
  const length = daysBetween(status.period.from, status.period.to);
  if (length <= 0) return null;
  const day = Math.min(
    length,
    Math.max(0, daysBetween(status.period.from, status.today) + 1),
  );
  return { fraction: day / length, day, length };
}
