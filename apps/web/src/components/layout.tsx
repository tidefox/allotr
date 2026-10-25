import type { ComponentType, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { IconProps } from '@/generated/icons';
import { OverlayScrollbar } from './overlay-scrollbar.tsx';
import { FrameWidthContext, useFrameWidth } from './use-frame-width.ts';

// Tiles run edge to edge (docs/ui.md §4). Seams come from each tile's own
// right and bottom 1 px border; the top and left edges are the shell's (the
// title strip's bottom border and the navigation's right one), so a grid adds
// none of its own and the edge is one line, not two. An empty cell shows
// `canvas`.

/** The app frame: the container the responsive variants query. */
export function Frame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <FrameWidthContext value={width}>
      <div ref={ref} className={cn('frame bg-canvas text-text', className)}>
        <div className="scale">{children}</div>
      </div>
    </FrameWidthContext>
  );
}

/**
 * A grid of tiles: 1 column below 720, 2 from 720, 3 from 1100, 4 from 1500.
 * A pinned `2` is one column below 720 and two from there.
 */
export function Grid({
  columns = 'auto',
  className,
  children,
}: {
  /** `auto` follows the frame; a number pins it (the 0029 setting, later). */
  columns?: 'auto' | 1 | 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid grid-flow-dense auto-rows-auto bg-canvas',
        columns === 'auto' &&
          'grid-cols-1 cols2:grid-cols-2 cols3:grid-cols-3 cols4:grid-cols-4',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 cols2:grid-cols-2',
        columns === 3 && 'grid-cols-3',
        columns === 4 && 'grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A vertical stack of tiles; the last child grows. */
export function Stack({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col bg-canvas [&>:last-child]:flex-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A list and its detail side by side from 1000 px; the list alone below.
 * `even` (the locked design's `split even`) shares the width 1.6 : 1 and
 * keeps both, one above the other, below 1000 px.
 *
 * `fill` makes the pair fill the height its parent gives it from 1000 px
 * (the parent needs a definite height, as the app's content region has),
 * so the tiles inside scroll their own bodies (`Tile` `scroll`) and the
 * page does not. Below 1000 px nothing changes: the list flows with the page.
 */
export function Split({
  list,
  detail,
  even = false,
  fill = false,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  even?: boolean;
  fill?: boolean;
  className?: string;
}) {
  const pane = fill && 'wide:flex wide:min-h-0 wide:flex-col';
  return (
    <div
      className={cn(
        'grid grid-cols-1 bg-canvas',
        even
          ? 'wide:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]'
          : 'wide:grid-cols-[minmax(0,1fr)_25rem]',
        fill && 'wide:h-full wide:min-h-0 wide:grid-rows-[minmax(0,1fr)]',
        className,
      )}
    >
      <div className={cn('min-w-0', pane)}>{list}</div>
      <div className={cn('min-w-0', !even && 'narrow:hidden', pane)}>
        {detail}
      </div>
    </div>
  );
}

export type TileSpan = 1 | 2 | 3 | 'full';

/** The grid placement classes for a tile's span and rows. */
export function tileSpanClass(span: TileSpan = 1, rows: 1 | 2 = 1): string {
  return cn(
    span === 2 && 'cols2:col-span-2',
    span === 3 && 'col-span-full cols4:col-span-3',
    span === 'full' && 'col-span-full',
    rows === 2 && 'cols2:row-span-2',
  );
}

export type TileProps = {
  title: string;
  subtitle?: string | undefined;
  icon?: ComponentType<IconProps> | undefined;
  /** Controls on the right of the title bar. */
  actions?: ReactNode;
  /** A focused or primary tile gets a 3 px `primary` edge on its title bar. */
  primary?: boolean;
  /**
   * Columns the tile spans in a Grid. `3` is the full width up to three
   * columns and three of the four from 1500 px (`w3`).
   */
  span?: TileSpan;
  /** Rows the tile spans from two columns (`h2`). */
  rows?: 1 | 2;
  className?: string;
  bodyClassName?: string;
  /** Only the title bar shows; the body is not rendered. */
  folded?: boolean;
  /**
   * From 1000 px the body scrolls inside the tile, in an `OverlayScrollbar`
   * with this accessible name, and the title bar stays put. The tile then
   * needs a height from its parent (`Split` `fill`). Below 1000 px the body
   * flows and the page scrolls.
   */
  scroll?: string;
  children?: ReactNode;
};

/** A tile (`pane`): a title bar on `chrome`, then its content on `canvas`. */
export function Tile({
  title,
  subtitle,
  icon,
  actions,
  primary = false,
  span = 1,
  rows = 1,
  className,
  bodyClassName,
  folded = false,
  scroll,
  children,
}: TileProps) {
  const id = useId();
  const width = useFrameWidth();
  const scrolls = scroll !== undefined && width >= 1000;
  const body = (
    <div className={cn('flex-1 px-3 pt-2 pb-2.5', bodyClassName)}>
      {children}
    </div>
  );
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 flex-col border-r border-b bg-canvas',
        scrolls && 'min-h-0',
        tileSpanClass(span, rows),
        className,
      )}
    >
      <TitleBar
        id={id}
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={actions}
        primary={primary}
      />
      {folded ? null : scrolls ? (
        <OverlayScrollbar label={scroll} className="flex-1">
          {/* min-h-full lets a body that `grow`s fill a short pane. */}
          <div className="flex min-h-full flex-col">{body}</div>
        </OverlayScrollbar>
      ) : (
        body
      )}
    </section>
  );
}

/**
 * The tile title bar (`ttl`): icon, title and a muted subtitle on one
 * truncated line, actions on the right. A primary tile gets a 3 px
 * `primary` edge and a `primary` title.
 */
export function TitleBar({
  id,
  title,
  subtitle,
  icon: Icon,
  actions,
  primary = false,
}: Pick<TileProps, 'title' | 'subtitle' | 'icon' | 'actions' | 'primary'> & {
  id?: string;
}) {
  return (
    <header
      className={cn(
        'flex h-bar min-w-0 shrink-0 items-center justify-between gap-2 overflow-hidden border-b bg-chrome pr-1.5 pl-3 text-title',
        primary && 'border-l-[3px] border-l-primary pl-[calc(0.75rem-3px)]',
      )}
    >
      <div className="min-w-0 truncate whitespace-nowrap">
        {Icon === undefined ? null : (
          <Icon
            className={cn(
              'mr-[7px] inline size-[1.15em] align-[-0.22em]',
              primary ? 'text-primary' : 'text-text-muted',
            )}
          />
        )}
        <h2
          id={id}
          className={cn('inline font-semibold', primary && 'text-primary')}
        >
          {title}
        </h2>
        {subtitle === undefined ? null : (
          <span className="text-text-muted"> {subtitle}</span>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      )}
    </header>
  );
}

/** A section label inside a detail pane (`sect`): small, muted, upper case. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-3 mb-1 text-tiny tracking-[0.04em] text-text-muted uppercase">
      {children}
    </h3>
  );
}
