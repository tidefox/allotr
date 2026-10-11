import type { CalendarDayView, LocalDate } from '@allotr/shared';
import { formatMoney } from '@/lib/format-money';
import type { CurrencyDisplay } from '@/lib/format-money';
import { cn } from '@/lib/utils';
import { leadingBlanks, type MonthRange } from '@/features/calendar/model';

// A month grid (docs/ui.md §4). Spent amounts, heat and marks are the
// server's; the grid only places them. Every day has a text label and the
// whole month has a table view. The heat fills the cell (at most 55 %
// `negative` into `canvas`) and the text sits straight on it, except on warmer days.

/** Share of `negative` mixed into `canvas` for a heat level 0..4: 0–55 %. */
export function heatPercent(heat: number | null): number {
  if (heat === null) return 0;
  const level = Math.min(4, Math.max(0, Math.round(heat)));
  return (level * 55) / 4;
}

/** An opaque heat fill (a colour mix, never transparency). */
export function heatBackground(heat: number | null): string {
  return `color-mix(in srgb, var(--negative) ${String(heatPercent(heat))}%, var(--canvas))`;
}

/** The marks for a day: b bill, i IOU, $ payday. */
export function dayMarks(day: CalendarDayView): string[] {
  return [
    ...(day.bills.length > 0 ? ['b'] : []),
    ...(day.ious.length > 0 ? ['i'] : []),
    ...(day.payday ? ['$'] : []),
  ];
}

export type CalendarGridProps = Readonly<{
  month: MonthRange;
  /** The server's days for the month, in date order. */
  days: readonly CalendarDayView[];
  today: LocalDate;
  picked?: LocalDate | undefined;
  onPick?: (date: LocalDate) => void;
  /** Layer toggles. */
  showHeat?: boolean;
  showDue?: boolean;
  /** Monday-first short names, e.g. ["Mon", …, "Sun"]. */
  weekdays: readonly string[];
  /** The grid, or the same month as a table. */
  view?: 'grid' | 'table';
  /** Table headers: date, spent, due. */
  headers: Readonly<{ date: string; spent: string; due: string }>;
  /** Label for a day: its date, long form. */
  dateLabel: (date: LocalDate) => string;
  /** Label for the marks, e.g. { b: "bill", i: "IOU", $: "payday" }. */
  markNames: Readonly<Record<string, string>>;
  mode?: CurrencyDisplay;
  locale?: string;
  className?: string;
}>;

function dayLabel(
  day: CalendarDayView,
  props: Pick<CalendarGridProps, 'dateLabel' | 'markNames' | 'mode' | 'locale'>,
): string {
  const parts = [props.dateLabel(day.date)];
  if (day.spent !== null) {
    parts.push(formatMoney(day.spent, props.mode, props.locale));
  }
  for (const mark of dayMarks(day)) parts.push(props.markNames[mark] ?? mark);
  return parts.join(', ');
}

export function CalendarGrid(props: CalendarGridProps) {
  const {
    month,
    days,
    today,
    picked,
    onPick,
    showHeat = true,
    showDue = true,
    weekdays,
    view = 'grid',
    headers,
    markNames,
    mode = 'symbol',
    locale,
    className,
  } = props;
  const blanks = leadingBlanks(month.from);
  // Pad the last week so the seam colour never shows as a block.
  const trailing = (7 - ((blanks + days.length) % 7)) % 7;
  return (
    <div className={cn('min-w-0', className)}>
      {view === 'grid' ? (
        <div
          role="group"
          aria-label={month.month}
          className="grid grid-cols-7 border-t border-l"
        >
          {weekdays.map((name) => (
            <div
              key={name}
              className="border-r border-b bg-chrome px-1.5 py-0.5 text-tiny text-text-muted"
            >
              {name}
            </div>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <div
              key={`blank-${String(i)}`}
              aria-hidden="true"
              className="border-r border-b bg-canvas"
            />
          ))}
          {days.map((day) => {
            const marks = showDue ? dayMarks(day) : [];
            const isToday = day.date === today;
            const isPicked = day.date === picked;
            // Warmer days would miss AA for text straight on the fill,
            // so their text sits on a canvas chip.
            const hot = showHeat && heatPercent(day.heat) >= 20;
            const chip = hot ? 'bg-canvas px-0.5' : '';
            return (
              <button
                key={day.date}
                type="button"
                aria-label={dayLabel(day, props)}
                aria-pressed={isPicked}
                onClick={() => {
                  onPick?.(day.date);
                }}
                className={cn(
                  'flex aspect-[1.25] max-h-[6.25rem] min-w-0 flex-col justify-between border-r border-b px-[5px] py-[3px] text-left text-tiny compact:aspect-[0.9]',
                  isToday && 'outline-2 -outline-offset-2 outline-primary',
                  isPicked && 'shadow-[inset_0_0_0_2px_var(--text)]',
                )}
                style={{
                  backgroundColor: showHeat
                    ? heatBackground(day.heat)
                    : 'var(--canvas)',
                }}
              >
                <span className={cn('num self-start text-text', chip)}>
                  {Number(day.date.slice(8))}
                </span>
                <span
                  aria-hidden="true"
                  className="flex gap-[3px] text-[0.625rem] leading-none"
                >
                  {marks.map((mark) => (
                    <span
                      key={mark}
                      className={cn(
                        'px-0.5 py-px text-canvas',
                        mark === '$'
                          ? 'bg-positive'
                          : mark === 'i'
                            ? 'bg-series-2'
                            : 'bg-warning',
                      )}
                    >
                      {mark}
                    </span>
                  ))}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'num min-h-[1em] max-w-full self-start truncate text-text compact:text-[0.625rem]',
                    chip,
                  )}
                >
                  {showHeat && day.spent !== null && day.spent.amountMinor > 0
                    ? formatMoney(day.spent, mode, locale)
                    : ''}
                </span>
              </button>
            );
          })}
          {Array.from({ length: trailing }, (_, i) => (
            <div
              key={`trail-${String(i)}`}
              aria-hidden="true"
              className="border-r border-b bg-canvas"
            />
          ))}
        </div>
      ) : (
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{month.month}</caption>
          <thead>
            <tr className="bg-chrome text-tiny text-text-muted">
              <th scope="col" className="px-3 py-1 font-normal">
                {headers.date}
              </th>
              <th scope="col" className="px-3 py-1 text-right font-normal">
                {headers.spent}
              </th>
              <th scope="col" className="px-3 py-1 font-normal">
                {headers.due}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date} className="border-t border-outline-variant">
                <th scope="row" className="num px-3 py-1 font-normal text-text">
                  {props.dateLabel(day.date)}
                </th>
                <td className="num px-3 py-1 text-right text-text">
                  {day.spent === null
                    ? ''
                    : formatMoney(day.spent, mode, locale)}
                </td>
                <td className="px-3 py-1 text-text-muted">
                  {dayMarks(day)
                    .map((mark) => markNames[mark] ?? mark)
                    .join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
