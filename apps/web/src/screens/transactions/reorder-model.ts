import { moveItem } from '@/features/budget/order';
import { reorder } from '@/lib/reorder';
import type { Group } from './search-params.ts';

// Moving an entry within its day (docs/domain.md "Order within a day"). The
// list shows a day newest first, and the API takes the entry that should come
// right before the moved one in time, so that is the row listed below it.
// Pure: the server owns the order and refuses a move that would break the
// time order of timed entries.

export interface Move {
  readonly id: string;
  /** The entry the moved one follows in time, or null for the day's start. */
  readonly afterId: string | null;
  /** The new place in the listed day, from 1, and the day's size. */
  readonly position: number;
  readonly count: number;
}

interface Day {
  readonly key: string;
  readonly rows: readonly { readonly id: string }[];
}

function moveTo(
  ids: readonly string[],
  id: string,
  next: readonly string[],
): Move | null {
  const at = next.indexOf(id);
  if (at < 0 || ids.indexOf(id) === at) return null;
  return {
    id,
    afterId: next[at + 1] ?? null,
    position: at + 1,
    count: ids.length,
  };
}

/** Dropping `keys` before or after `target`; null when nothing changes. */
export function dropMove(
  ids: readonly string[],
  keys: ReadonlySet<string>,
  target: string,
  position: 'before' | 'after',
): Move | null {
  const id = ids.find((candidate) => keys.has(candidate));
  if (id === undefined) return null;
  return moveTo(ids, id, reorder(ids, new Set([id]), target, position));
}

/** One step up (`-1`) or down (`1`) in the listed day; null at an edge. */
export function stepMove(
  ids: readonly string[],
  id: string,
  delta: -1 | 1,
): Move | null {
  const from = ids.indexOf(id);
  if (from < 0) return null;
  return moveTo(ids, id, moveItem(ids, from, from + delta));
}

/**
 * The days whose rows can be moved: only when the list is grouped by day,
 * and not the last day while more pages wait (its rows below are unknown, so
 * "the row listed below" would be wrong).
 */
export function reorderableDays(
  sections: readonly Day[],
  group: Group,
  hasMore: boolean,
): ReadonlySet<string> {
  if (group !== 'day') return new Set();
  return new Set(
    sections
      .filter(
        (section, index) =>
          section.rows.length > 1 &&
          !(hasMore && index === sections.length - 1),
      )
      .map((section) => section.key),
  );
}

/** Both steps for an entry in a movable day; null when it is not in one. */
export function stepsFor(
  sections: readonly Day[],
  movable: ReadonlySet<string>,
  id: string | undefined,
): { up: Move | null; down: Move | null } | null {
  if (id === undefined) return null;
  const day = sections.find(
    (section) =>
      movable.has(section.key) && section.rows.some((r) => r.id === id),
  );
  if (day === undefined) return null;
  const ids = day.rows.map((row) => row.id);
  return { up: stepMove(ids, id, -1), down: stepMove(ids, id, 1) };
}
