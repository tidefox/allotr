import type { CategoryIcon, CategoryView } from '@allotr/shared';
import { moveItem } from '@/features/budget/order';
import type { CategoryNode } from '@/features/settings/categories-model';

// The settings category tree as rows, and the position changes a reorder
// or a move makes. Pure: the server stays the judge of what is allowed.

export interface CategoryRowModel {
  readonly category: CategoryView;
  /** `parent` rows fold; the rest show a connector. */
  readonly role: 'parent' | 'child' | 'last-child';
  /** Whether a parent row has subcategories to fold. */
  readonly foldable: boolean;
  /** Reorders stay inside a group: the top level of a kind, or one parent. */
  readonly group: string;
}

export function groupOf(category: CategoryView): string {
  return category.parentId ?? `kind:${category.kind}`;
}

/** The rows on screen: each parent, then its subcategories unless folded. */
export function categoryRows(
  nodes: readonly CategoryNode[],
  folded: ReadonlySet<string>,
): CategoryRowModel[] {
  return nodes.flatMap(({ category, children }) => [
    {
      category,
      role: 'parent' as const,
      foldable: children.length > 0,
      group: groupOf(category),
    },
    ...(folded.has(category.id)
      ? []
      : children.map((child, index) => ({
          category: child,
          role:
            index === children.length - 1
              ? ('last-child' as const)
              : ('child' as const),
          foldable: false,
          group: groupOf(child),
        }))),
  ]);
}

/** The ids of a row's siblings in order, itself included. */
export function siblingIds(
  nodes: readonly CategoryNode[],
  category: CategoryView,
): string[] {
  if (category.parentId === null) return nodes.map((node) => node.category.id);
  const parent = nodes.find((node) => node.category.id === category.parentId);
  return (parent?.children ?? []).map((child) => child.id);
}

/**
 * The positions to write so that `order` holds: 1, 2, 3 … for the siblings
 * whose stored position differs. Equal stored positions are told apart by
 * name on the server, so renumbering fixes those too.
 */
export function positionChanges(
  siblings: readonly CategoryView[],
  order: readonly string[],
): { id: string; position: number }[] {
  const byId = new Map(siblings.map((c) => [c.id, c]));
  return order.flatMap((id, index) =>
    byId.get(id)?.position === index + 1 ? [] : [{ id, position: index + 1 }],
  );
}

/** The list with stored positions replaced, for the order shown mid-save. */
export function withPositions(
  categories: readonly CategoryView[],
  positions: ReadonlyMap<string, number>,
): CategoryView[] {
  return categories.map((c) => {
    const position = positions.get(c.id);
    return position === undefined ? c : { ...c, position };
  });
}

/** One step up or down among siblings; `null` at the end of the line. */
export function stepOrder(
  order: readonly string[],
  id: string,
  step: -1 | 1,
): string[] | null {
  const from = order.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= order.length) return null;
  return moveItem(order, from, to);
}

/**
 * Where a category can move under: the top-level categories of its kind
 * (itself excluded). A category with subcategories cannot nest, as there
 * are only two levels.
 */
export function moveParents(
  category: CategoryView,
  categories: readonly CategoryView[],
): CategoryView[] {
  if (
    categories.some(
      (c) => c.parentId === category.id && c.mergedIntoId === null,
    )
  )
    return [];
  return categories
    .filter(
      (c) =>
        c.mergedIntoId === null &&
        c.parentId === null &&
        c.id !== category.id &&
        c.id !== category.parentId &&
        c.kind === category.kind,
    )
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** "shopping-basket" as "Shopping basket". */
export function iconLabel(name: CategoryIcon): string {
  const words = name.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The position that puts a category last under its new parent. */
export function lastPosition(
  categories: readonly CategoryView[],
  parentId: string | null,
  kind: CategoryView['kind'],
): number {
  const siblings = categories.filter(
    (c) =>
      c.mergedIntoId === null &&
      c.parentId === parentId &&
      (parentId !== null || c.kind === kind),
  );
  return Math.min(
    10_000,
    siblings.reduce((max, c) => Math.max(max, c.position), 0) + 1,
  );
}
