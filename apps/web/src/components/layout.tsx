import type { ComponentType, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { IconProps } from '@/generated/icons';
import { FrameWidthContext } from './use-frame-width.ts';

// Tiles run edge to edge (docs/ui.md §4). Seams come from each tile's own
// right and bottom 1 px border and the grid's top and left one, so adjacent
// tiles share a single line and an empty cell shows `canvas`.

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
        'grid grid-flow-dense auto-rows-auto border-t border-l bg-canvas',
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
        'flex flex-col border-t border-l bg-canvas [&>:last-child]:flex-1',
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
 */
export function Split({
  list,
  detail,
  even = false,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  even?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 border-t border-l bg-canvas',
        even
          ? 'wide:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]'
          : 'wide:grid-cols-[minmax(0,1fr)_25rem]',
        className,
      )}
    >
      <div className="min-w-0">{list}</div>
      <div className={cn('min-w-0', !even && 'narrow:hidden')}>{detail}</div>
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
  children,
}: TileProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 flex-col border-r border-b bg-canvas',
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
      {folded ? null : (
        <div className={cn('flex-1 px-3 pt-2 pb-2.5', bodyClassName)}>
          {children}
        </div>
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
