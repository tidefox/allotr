import type { Money } from '@allotr/shared';
import { useState } from 'react';
import { ShareBar, fillBg, type FillColor } from '@/components/bars';
import { clampFraction } from '@/components/bars-math';
import { shareText } from '@/lib/share-text';
import { formatMoney, type CurrencyDisplay } from '@/lib/format-money';
import { cn } from '@/lib/utils';

// The cycle allocation (docs/ui.md §4, §8 item 1). Every amount and share
// comes from the server; this component only lays them out. It never sums
// segments.

export type AllocationSegment = Readonly<{
  id: string;
  /** "Bills paid", "To savings", "Spent", "other", "Bills set aside", "Free to spend". */
  label: string;
  amount: Money;
  /** The segment's size against the cycle start, 0..1, for the bar only. */
  fraction: number;
  /** The segment's share of the cycle start in basis points, from the server. */
  shareBp: number;
  color: FillColor;
  /** Free money prints its figure in `positive`. */
  positive?: boolean;
}>;

export type AllocationProps = Readonly<{
  /** In display order. The last two are the on-budget money still left. */
  segments: readonly AllocationSegment[];
  /** "On-budget left X of Y", both from the server. */
  left: Readonly<{ amount: Money; of: Money }>;
  /** Summary prefix for assistive technology. */
  label: string;
  /** Text before the figures, e.g. "on-budget left". */
  leftLabel: string;
  /** Joins the two figures, e.g. "of". */
  ofLabel: string;
  mode?: CurrencyDisplay;
  locale?: string;
  className?: string;
}>;

export function Allocation({
  segments,
  left,
  label,
  leftLabel,
  ofLabel,
  mode = 'symbol',
  locale,
  className,
}: AllocationProps) {
  // The segment under the pointer, in the bar or in the list below it.
  const [active, setActive] = useState<string | null>(null);
  const lead = segments.slice(0, -2);
  // One grid template for the bracket row, so it lines up with the bar's
  // segments; the widths are the server's fractions as `fr`.
  const template = segments
    .map((s) => `minmax(1px, ${String(clampFraction(s.fraction))}fr)`)
    .join(' ');
  return (
    <div className={cn('grid', className)}>
      <ShareBar
        segments={segments}
        label={label}
        className="h-[1.375rem]"
        activeId={active}
        onActive={setActive}
      />
      <div
        aria-hidden="true"
        className="mt-0.5 grid h-[7px] gap-px"
        style={{ gridTemplateColumns: template }}
      >
        {segments.length > 2 ? (
          <div
            className="border-x border-b border-text"
            style={{ gridColumn: `${String(lead.length + 1)} / -1` }}
          />
        ) : null}
      </div>
      <p className="num mt-px h-[1.0625rem] text-right text-tiny leading-[1.45] font-semibold whitespace-nowrap text-text">
        {leftLabel} {formatMoney(left.amount, mode, locale)} {ofLabel}{' '}
        {formatMoney(left.of, mode, locale)}
      </p>
      <ul className="mt-1.5 -mr-[calc(0.75rem+1px)] -mb-[calc(0.625rem+1px)] -ml-3 grid grid-cols-[repeat(auto-fit,minmax(8.125rem,1fr))] border-t compact:grid-cols-3">
        {segments.map((s) => (
          <li
            key={s.id}
            className={cn(
              'flex min-w-0 flex-col border-r border-b px-3 py-2 compact:px-2.5 compact:py-1.5',
              s.id === active && 'bg-card-raised',
            )}
            onPointerEnter={() => {
              setActive(s.id);
            }}
            onPointerLeave={() => {
              setActive(null);
            }}
          >
            <span className="flex items-center gap-1.5 truncate text-tiny leading-[1.45] text-text-muted compact:text-[0.625rem]">
              <span
                aria-hidden="true"
                className={cn('size-[9px] shrink-0', fillBg[s.color])}
              />
              <span className="truncate">{s.label}</span>
            </span>
            <span
              className={cn(
                'num truncate text-[1.0625rem] leading-[1.45] font-semibold compact:text-[0.875rem]',
                s.positive === true && 'text-positive',
              )}
            >
              {formatMoney(s.amount, mode, locale)}
            </span>
            <span className="num text-tiny leading-[1.45] text-text-muted">
              {shareText(s.shareBp)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
