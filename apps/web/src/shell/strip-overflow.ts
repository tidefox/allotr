// Which edges of a horizontally scrolling strip have more behind them. The
// title strip's sub-tabs scroll sideways on a phone; an opaque `‹` / `›`
// cell at an edge says there is more (docs/ui.md §3). Pure, so it is tested
// without a browser.

export interface StripEdges {
  /** Tabs are hidden before the first one shown. */
  start: boolean;
  /** Tabs are hidden after the last one shown. */
  end: boolean;
}

/** Sub-pixel scroll positions would flicker a mark, so allow one pixel. */
const SLACK = 1;

export function stripEdges(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): StripEdges {
  return {
    start: scrollLeft > SLACK,
    end: scrollLeft + clientWidth < scrollWidth - SLACK,
  };
}

/**
 * The `scrollLeft` that shows a tab fully, moving as little as possible:
 * unchanged when it is already in view. A tab wider than the strip lines up
 * with its start. `left` and `width` are the tab's, relative to the strip's
 * scrolled content.
 */
export function scrollToShow(
  scrollLeft: number,
  clientWidth: number,
  left: number,
  width: number,
): number {
  if (left < scrollLeft) return left;
  if (left + width > scrollLeft + clientWidth)
    return Math.min(left, left + width - clientWidth);
  return scrollLeft;
}
