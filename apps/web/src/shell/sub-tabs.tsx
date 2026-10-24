import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { scrollToShow, stripEdges, type StripEdges } from './strip-overflow.ts';

export type SubTabItem = Readonly<{
  key: string;
  label: string;
  to: string;
  active: boolean;
}>;

/** The width an edge mark covers; a tab in view must clear it. */
const MARK = 24;

const mark =
  'pointer-events-none absolute inset-y-0 flex w-6 items-center justify-center bg-chrome text-text-muted';

/**
 * The title strip's sub-tabs (docs/ui.md §3). They scroll sideways when they
 * do not fit, as on a phone, and the open tab is scrolled into view. While
 * tabs are hidden past an edge an opaque `‹` or `›` cell says so; it is
 * decorative (a screen reader reads the whole list), and no alpha fade is
 * used.
 */
export function SubTabs({ items }: { items: readonly SubTabItem[] }) {
  const nav = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState<StripEdges>({ start: false, end: false });
  const active = items.find((item) => item.active)?.to;

  // Edge marks follow the scroll position and the strip's size.
  useEffect(() => {
    const el = nav.current;
    if (el === null) return;
    const measure = () => {
      const next = stripEdges(el.scrollLeft, el.clientWidth, el.scrollWidth);
      setEdges((prev) =>
        prev.start === next.start && prev.end === next.end ? prev : next,
      );
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, []);

  // The open tab stays in view, clear of the marks, when the route changes
  // (a tap, `[` / `]`, or a link from another screen).
  useEffect(() => {
    const el = nav.current;
    const tab = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el === null || tab === null || tab === undefined) return;
    el.scrollLeft = scrollToShow(
      el.scrollLeft,
      el.clientWidth,
      tab.offsetLeft - MARK,
      tab.offsetWidth + 2 * MARK,
    );
  }, [active]);

  return (
    <div className="relative flex min-w-0 flex-1 items-stretch">
      <nav
        ref={nav}
        aria-label={t('shell.tabs.label')}
        className="scroll flex min-w-0 flex-1 scroll-px-6 items-stretch"
      >
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'press flex min-w-hit shrink-0 items-center border-r px-3 whitespace-nowrap',
              item.active
                ? 'bg-primary font-semibold text-on-primary hover:bg-primary'
                : 'text-text-muted hover:text-text',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {edges.start ? (
        <span aria-hidden="true" className={cn(mark, 'left-0 border-r')}>
          ‹
        </span>
      ) : null}
      {edges.end ? (
        <span aria-hidden="true" className={cn(mark, 'right-0 border-l')}>
          ›
        </span>
      ) : null}
    </div>
  );
}
