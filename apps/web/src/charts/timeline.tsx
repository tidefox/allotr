import { cn } from '@/lib/utils';
import { timelineLanes } from './math.ts';

// The cycle-day axis (docs/ui.md §4). Positions are fractions of the axis;
// nothing here derives money. Marks carry the colour; labels use `text` or
// muted only.

export type TimelineEvent = Readonly<{
  id: string;
  /** Zero-based cycle day. */
  day: number;
  kind: 'bill' | 'payday';
  /** Short text, e.g. "Rent". Hidden on phone. */
  label: string;
  /** Short text after the label, e.g. "$950". Hidden on phone. */
  detail?: string;
  /** Bills only: a paid bill is muted. */
  paid?: boolean;
}>;

export type TimelineProps = Readonly<{
  /** Cycle length in days. */
  days: number;
  /** Zero-based day of the cycle that is today (passed in, never read). */
  today: number;
  events: readonly TimelineEvent[];
  /** Date label for a cycle day, e.g. "Oct 9". */
  dayLabel: (day: number) => string;
  /** Summary for assistive technology. */
  label: string;
  className?: string;
}>;

/** Axis ticks: the first day, the last, and about every `step` between. */
export function tickDays(days: number, step = 7): number[] {
  if (days <= 0) return [];
  const last = days - 1;
  const ticks: number[] = [];
  for (let day = 0; day < last; day += step) ticks.push(day);
  ticks.push(last);
  // Drop a penultimate tick that would sit on top of the last label.
  const prev = ticks[ticks.length - 2];
  if (prev !== undefined && last - prev < step / 2) ticks.splice(-2, 1);
  return ticks;
}

function pos(day: number, days: number): number {
  const span = Math.max(1, days - 1);
  return Math.min(1, Math.max(0, day / span)) * 100;
}

/** Labels on the first and last day grow inwards so they stay in the tile. */
export function anchorOf(day: number, days: number): 'start' | 'mid' | 'end' {
  if (day <= 0) return 'start';
  if (day >= days - 1) return 'end';
  return 'mid';
}

// The column's edge (start, end) or centre (mid) sits on the day.
const COLUMN = {
  start: 'items-start',
  mid: '-translate-x-1/2 items-center',
  end: '-translate-x-full items-end',
} as const;

// The locked design's four lanes (`up`, `dn`, `up2`, `dn2`) around the axis
// at 42 px in a 96 px band: labels above sit over their mark, labels below
// under it.
const LANE = {
  up: ['bottom-14', 'bottom-[4.5rem]'],
  down: ['top-12', 'top-[3.875rem]'],
} as const;

export function Timeline({
  days,
  today,
  events,
  dayLabel,
  label,
  className,
}: TimelineProps) {
  const lanes = timelineLanes(
    events.map((e) => ({ id: e.id, day: e.day })),
    days,
  );
  const byId = new Map(events.map((e) => [e.id, e]));
  const summary = `${label}: ${events
    .map(
      (e) =>
        `${e.label}${e.detail === undefined ? '' : ` ${e.detail}`}${e.paid === true ? ' (paid)' : ''} ${dayLabel(e.day)}`,
    )
    .join(', ')}`;
  return (
    <div
      role="img"
      aria-label={summary}
      className={cn('relative mx-1 mt-1.5 mb-0.5 h-24', className)}
    >
      {/* Axis and elapsed fill */}
      <div className="absolute inset-x-0 top-[2.625rem] h-px bg-outline" />
      <div
        className="absolute top-[2.5625rem] left-0 h-[3px] bg-primary"
        style={{ width: `${String(pos(today, days))}%` }}
      />
      {/* Ticks, and their dates along the bottom */}
      {tickDays(days).map((day) => (
        <div key={day}>
          <div
            className="absolute top-[2.4375rem] h-[7px] w-px bg-outline"
            style={{ left: `${String(pos(day, days))}%` }}
          />
          <div
            className={cn(
              'num absolute bottom-0 flex text-[0.625rem] whitespace-nowrap text-text-muted',
              COLUMN[anchorOf(day, days)],
            )}
            style={{ left: `${String(pos(day, days))}%` }}
          >
            {dayLabel(day)}
          </div>
        </div>
      ))}
      {/* Events */}
      {lanes.map((lane) => {
        const event = byId.get(lane.id);
        if (event === undefined) return null;
        const muted = event.kind === 'bill' && event.paid === true;
        const up = lane.side === 'up';
        const anchor = anchorOf(event.day, days);
        return (
          <div
            key={lane.id}
            className={cn(
              'absolute flex flex-col text-[0.625rem] leading-[1.2] whitespace-nowrap text-text-muted',
              COLUMN[anchor],
              LANE[lane.side][lane.level],
            )}
            style={{ left: `${String(pos(event.day, days))}%` }}
          >
            <span
              aria-hidden="true"
              className={cn(
                'block size-[7px]',
                up ? 'order-2 mt-0.5' : 'mb-0.5',
                event.kind === 'payday'
                  ? 'bg-positive'
                  : muted
                    ? 'bg-outline'
                    : 'bg-warning',
              )}
            />
            <span className="num compact:hidden">
              {event.label}
              {event.detail === undefined ? null : ` ${event.detail}`}
            </span>
          </div>
        );
      })}
      {/* Today */}
      <div
        className="absolute top-8 h-[1.375rem] w-0.5 bg-text"
        style={{ left: `${String(pos(today, days))}%` }}
      />
    </div>
  );
}
