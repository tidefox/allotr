import type {
  BudgetStatusView,
  CategoryIcon,
  CategoryView,
  Money,
} from '@allotr/shared';
import { budgetTree } from '@/screens/budget/budgets-model';
import type { SeriesNumber } from '@/lib/category-style';

export type BudgetRow = Readonly<{
  id: string;
  name: string;
  /** The budget's `left`, or the server's total on a parent header. */
  left: Money;
  /** How full the bar is, 0..1. */
  fraction: number;
  over: boolean;
  icon: CategoryIcon | null;
  /** The series number, 1..8. */
  colour: SeriesNumber;
  /** 1 for a subcategory under a parent row, else 0. */
  depth: 0 | 1;
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
      const left = e.budget?.left ?? e.total?.left;
      if (left === undefined) return [];
      return [
        {
          id: e.key,
          name: e.name,
          left,
          fraction: e.fraction,
          over: e.over,
          icon: e.icon,
          colour: e.colour,
          depth: e.role === 'child' || e.role === 'last-child' ? 1 : 0,
        },
      ];
    },
  );
}
