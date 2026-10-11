import type { CSSProperties } from 'react';
import { type SeriesColor } from '@/components/bars.tsx';
import { cn } from '@/lib/utils';

const bg: Record<SeriesColor | 'negative' | 'positive' | 'primary', string> = {
  negative: 'bg-negative',
  positive: 'bg-positive',
  primary: 'bg-primary',
  'series-1': 'bg-series-1',
  'series-2': 'bg-series-2',
  'series-3': 'bg-series-3',
  'series-4': 'bg-series-4',
  'series-5': 'bg-series-5',
  'series-6': 'bg-series-6',
  'series-7': 'bg-series-7',
  'series-8': 'bg-series-8',
};

export type ColumnColor = keyof typeof bg;

export type ColumnDatum = Readonly<{
  id: string;
  /** Height as a fraction of the tallest column the server sent, 0..1. */
  fraction: number;
  /** Pre-formatted value above the column. */
  valueLabel: string;
  /** Pre-formatted label below the column. */
  xLabel: string;
  /** `negative` marks a column that passed its limit. Default `primary`. */
  color?: ColumnColor;
}>;

/** The tallest column leaves this much of the plot free for its value. */
const HEADROOM = 0.9;

/**
 * Bar columns (`cols`): value labels on the columns, a 1 px baseline and
 * muted x labels. The plot is `height` design px tall and grows to fill a
 * flex column when the tile has room.
 */
export function Columns({
  data,
  label,
  height = 110,
  className,
}: {
  data: readonly ColumnDatum[];
  /** The summary read by assistive tech. */
  label: string;
  /** The plot's design height in px. */
  height?: number;
  className?: string;
}) {
  const track = {
    gridTemplateColumns: `repeat(${String(Math.max(1, data.length))}, minmax(0, 1fr))`,
  };
  return (
    <div
      role="img"
      aria-label={`${label}: ${data.map((d) => `${d.xLabel} ${d.valueLabel}`).join(', ')}`}
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
      style={{ '--h': `${String(height / 16)}rem` } as CSSProperties}
    >
      <div
        aria-hidden="true"
        style={track}
        className="grid min-h-(--h) flex-1 grid-flow-col items-end gap-x-2 border-b border-outline pt-4 font-num text-[0.6563rem]"
      >
        {data.map((d) => (
          <div
            key={d.id}
            className={cn('relative min-h-px', bg[d.color ?? 'primary'])}
            style={{
              height: `${String(Math.min(1, Math.max(0, d.fraction)) * HEADROOM * 100)}%`,
            }}
          >
            <span className="absolute inset-x-0 bottom-full truncate text-center whitespace-nowrap text-text">
              {d.valueLabel}
            </span>
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        style={track}
        className="mt-[3px] grid gap-x-2 text-center font-num text-[0.6563rem] text-text-muted"
      >
        {data.map((d) => (
          <span key={d.id} className="truncate">
            {d.xLabel}
          </span>
        ))}
      </div>
    </div>
  );
}
