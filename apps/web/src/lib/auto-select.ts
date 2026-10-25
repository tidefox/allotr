import { useEffect, useRef, type RefObject } from 'react';
import { useFrameWidth } from '@/components/use-frame-width';

// List + detail screens select the first row on wide frames (docs/ui.md §5),
// so the detail pane is never an empty placeholder, and keep the open row in
// view in the list.

/** The frame width from which a selection shows beside the list, not in a sheet. */
export const WIDE_FROM = 1000;

/**
 * The id to select now, or undefined. Only a wide frame with nothing
 * selected and a first row selects, and only once per `context` (the
 * screen's list: its filter, period, sort), so a selection cleared on
 * purpose is not put back in a loop. A new context may select again.
 */
export function autoSelection(state: {
  wide: boolean;
  selected: string | undefined;
  first: string | undefined;
  context: string;
  /** The context an automatic or existing selection was last made for. */
  done: string | null;
}): string | undefined {
  if (!state.wide || state.selected !== undefined) return undefined;
  if (state.first === undefined || state.done === state.context) {
    return undefined;
  }
  return state.first;
}

/**
 * Select `first` on a wide frame while nothing is selected. `select` gets
 * the id and should replace the history entry, so Back does not stop on the
 * unselected address.
 */
export function useAutoSelectFirst({
  selected,
  first,
  context,
  select,
}: {
  selected: string | undefined;
  first: string | undefined;
  context: string;
  select: (id: string) => void;
}): void {
  const wide = useFrameWidth() >= WIDE_FROM;
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!wide) return;
    // A selection that is already there (a link, the user's pick) counts as
    // this context's, so clearing it later stays cleared.
    if (selected !== undefined) {
      done.current = context;
      return;
    }
    const target = autoSelection({
      wide,
      selected,
      first,
      context,
      done: done.current,
    });
    if (target === undefined) return;
    done.current = context;
    select(target);
  }, [wide, selected, first, context, select]);
}

const REVEAL_FRAMES = 6;

/** Whether `row` lies inside the visible part of `list`'s nearest scroller. */
function inView(row: Element, scroller: Element): boolean {
  const box = row.getBoundingClientRect();
  const frame = scroller.getBoundingClientRect();
  return box.top >= frame.top && box.bottom <= frame.bottom;
}

/**
 * Scroll the open row (marked `data-selected`, see `Row`) into view in its
 * list when the selection changes, once per selection and only on a wide
 * frame, where the list scrolls on its own. A row that is not rendered yet
 * (a later page) is revealed when it appears. Rows far from the view have
 * only an estimated height until they render, so the scroll is repeated for
 * a few frames until the row stays in view.
 */
export function useRevealSelected(
  list: RefObject<HTMLElement | null>,
  selectedId: string | undefined,
): void {
  const wide = useFrameWidth() >= WIDE_FROM;
  const revealed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!wide || selectedId === undefined) {
      revealed.current = undefined;
      return;
    }
    if (revealed.current === selectedId) return;
    const root = list.current;
    if (root === null) return;
    if (root.querySelector('[data-selected]') === null) return;
    revealed.current = selectedId;
    const frame = root.closest('.scroll');
    let frames = 0;
    const settle = () => {
      const current = root.querySelector('[data-selected]');
      if (current === null || frame === null) return;
      if (!inView(current, frame)) current.scrollIntoView({ block: 'nearest' });
      frames += 1;
      if (frames < REVEAL_FRAMES) requestAnimationFrame(settle);
    };
    settle();
  });
}
