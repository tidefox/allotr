import { useState, type CSSProperties, type PointerEvent } from 'react';
import { type SeriesColor } from '@/components/bars.tsx';
import { cn } from '@/lib/utils';
import {
  bandPath,
  domainOf,
  lineGeometry,
  toPercent,
  type BandPoint,
  type Domain,
} from './chart-model.ts';
import type { Point } from './math.ts';

// Line and area chart (docs/ui.md §4). Only paths and lines live in the
// stretched SVG; the marker and all text are HTML positioned by percentage
// so nothing distorts. Fills are opaque colour mixes, and series colours
// never colour text.

/** A mark's colour: a series, or `negative` for a debt's line. */
export type ChartColor = SeriesColor | 'negative';

export const seriesStroke: Record<ChartColor, string> = {
  'series-1': 'stroke-series-1',
  'series-2': 'stroke-series-2',
  'series-3': 'stroke-series-3',
  'series-4': 'stroke-series-4',
  'series-5': 'stroke-series-5',
  'series-6': 'stroke-series-6',
  'series-7': 'stroke-series-7',
  'series-8': 'stroke-series-8',
  negative: 'stroke-negative',
};

const markerBg: Record<ChartColor, string> = {
  'series-1': 'bg-series-1',
  'series-2': 'bg-series-2',
  'series-3': 'bg-series-3',
  'series-4': 'bg-series-4',
  'series-5': 'bg-series-5',
  'series-6': 'bg-series-6',
  'series-7': 'bg-series-7',
  'series-8': 'bg-series-8',
  negative: 'bg-negative',
};

/** An opaque mix of the series colour into `canvas`, at 16 % by default. */
export function areaFill(color: ChartColor, percent = 16): string {
  return `color-mix(in srgb, var(--${color}) ${String(percent)}%, var(--canvas))`;
}

export type ChartSeries = Readonly<{
  id: string;
  label: string;
  color: ChartColor;
  /** x and y in the caller's units (y in minor units). */
  points: readonly Point[];
  /** Fill under the line. */
  area?: boolean;
  /** Pre-formatted value shown at the end marker. */
  endLabel?: string;
  /** False leaves out the end marker (a plain history line). */
  marker?: boolean;
  /** A dotted line, for a projection rather than a record. */
  dashed?: boolean;
  /** A faint range drawn behind the line, such as a forecast's 80 % range. */
  band?: readonly BandPoint[];
  /**
   * Text for the hover tooltip, one per point in `points` order. Hover snaps
   * to the nearest real point and reads this label, never a value read off
   * the smoothed curve between points. No labels, no hover for the series.
   */
  hoverLabels?: readonly string[];
}>;

export type ChartTick = Readonly<{ value: number; label: string }>;

export type ChartTable = Readonly<{
  caption: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}>;

export type ChartProps = Readonly<{
  /** The summary read by assistive tech. */
  label: string;
  series: readonly ChartSeries[];
  yTicks: readonly ChartTick[];
  xTicks: readonly ChartTick[];
  xDomain?: Domain;
  yDomain?: Domain;
  /**
   * A dashed reference line (for example the even pace); with an
   * `endLabel` it gets an end marker and that label, like a series.
   */
  reference?: Readonly<{ from: Point; to: Point; endLabel?: string }>;
  /** A dotted vertical line at an x value, with an optional top label. */
  today?: Readonly<{ x: number; label?: string }>;
  /**
   * The plot's design height in px at 600–999 px frames (`--h`); it scales
   * by 0.75 on phones, 1.75 from 1000 and 2 from 1400 px.
   */
  height?: number;
  /** Grow to fill a flex column, with `height` as the least. */
  grow?: boolean;
  /** The data as text, for people who cannot see the plot. */
  table: ChartTable;
  className?: string;
}>;

export function Chart({
  label,
  series,
  yTicks,
  xTicks,
  xDomain,
  yDomain,
  reference,
  today,
  height,
  grow = false,
  table,
  className,
}: ChartProps) {
  const points = series.flatMap((s) => s.points);
  const x =
    xDomain ??
    domainOf(
      points.map((p) => p.x),
      [
        ...xTicks.map((t) => t.value),
        ...(reference ? [reference.from.x, reference.to.x] : []),
      ],
    );
  const y =
    yDomain ??
    domainOf(
      points.map((p) => p.y),
      [
        ...yTicks.map((t) => t.value),
        ...(reference ? [reference.from.y, reference.to.y] : []),
      ],
    );
  const geometry = series.map((s) => ({
    s,
    g: lineGeometry(s.points, x, y),
  }));
  // An end whose label would sit on another line carrying on to its right.
  const continued = (end: { x: number }) =>
    geometry.some(({ g }) => g.end !== undefined && g.end.x > end.x);
  const referenceEnd =
    reference?.endLabel === undefined
      ? null
      : {
          x: toPercent(reference.to.x, x, 'x'),
          y: toPercent(reference.to.y, y, 'y'),
          label: reference.endLabel,
        };
  const [hover, setHover] = useState<{ series: string; index: number } | null>(
    null,
  );
  const hovered = hoverTarget(series, hover, x, y);
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const at = x[0] + ((event.clientX - box.left) / box.width) * (x[1] - x[0]);
    setHover(nearestPoint(series, at));
  };
  const plotHeight =
    height === undefined
      ? 'h-32 wide:h-56 @min-[1400px]/frame:h-64'
      : grow
        ? 'min-h-[calc(var(--h)*0.75)] medium:min-h-(--h) wide:min-h-[calc(var(--h)*1.75)] @min-[1400px]/frame:min-h-[calc(var(--h)*2)]'
        : 'h-[calc(var(--h)*0.75)] medium:h-(--h) wide:h-[calc(var(--h)*1.75)] @min-[1400px]/frame:h-[calc(var(--h)*2)]';

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[auto_1fr] gap-x-1.5 px-3 py-2 font-num text-[0.6563rem] text-text-muted compact:text-[0.625rem]',
        grow && 'min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]',
        className,
      )}
      style={
        height === undefined
          ? undefined
          : ({ '--h': `${String(height / 16)}rem` } as CSSProperties)
      }
    >
      <div aria-hidden="true" className="relative w-[5ch]">
        {yTicks.map((t) => (
          <span
            key={t.value}
            className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
            style={{ top: `${String(toPercent(t.value, y, 'y'))}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div
        role="img"
        aria-label={label}
        className={cn(
          'relative min-w-0 border-b border-l border-outline',
          plotHeight,
        )}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => {
          setHover(null);
        }}
      >
        {yTicks.map((t) => (
          <div
            key={t.value}
            aria-hidden="true"
            className="absolute inset-x-0 h-px bg-outline-variant"
            style={{ top: `${String(toPercent(t.value, y, 'y'))}%` }}
          />
        ))}
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          {reference ? (
            <line
              x1={toPercent(reference.from.x, x, 'x')}
              y1={toPercent(reference.from.y, y, 'y')}
              x2={toPercent(reference.to.x, x, 'x')}
              y2={toPercent(reference.to.y, y, 'y')}
              className="stroke-text-muted"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
              strokeWidth={1.2}
            />
          ) : null}
          {today ? (
            <line
              x1={toPercent(today.x, x, 'x')}
              x2={toPercent(today.x, x, 'x')}
              y1={0}
              y2={100}
              className="stroke-outline"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
              strokeWidth={1}
            />
          ) : null}
          {geometry.map(({ s }) =>
            s.band === undefined ? null : (
              <path
                key={`${s.id}-band`}
                d={bandPath(s.band, x, y)}
                fill={areaFill(s.color, 10)}
              />
            ),
          )}
          {geometry.map(({ s, g }) => (
            <g key={s.id}>
              {s.area === true && g.area !== '' ? (
                <path d={g.area} fill={areaFill(s.color)} />
              ) : null}
              <path
                d={g.line}
                fill="none"
                className={seriesStroke[s.color]}
                strokeWidth={2}
                {...(s.dashed === true ? { strokeDasharray: '2 4' } : {})}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>
        {today?.label === undefined ? null : (
          <span
            aria-hidden="true"
            className="absolute top-0 -translate-x-1/2 bg-canvas px-1 font-num text-tiny text-text"
            style={{ left: `${String(toPercent(today.x, x, 'x'))}%` }}
          >
            {today.label}
          </span>
        )}
        {referenceEnd === null ? null : (
          <EndMark
            x={referenceEnd.x}
            y={referenceEnd.y}
            markClass="bg-text-muted"
            label={referenceEnd.label}
          />
        )}
        {hovered === null ? null : (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-outline"
              style={{ left: `${String(hovered.x)}%` }}
            />
            <EndMark
              x={hovered.x}
              y={hovered.y}
              markClass={markerBg[hovered.color]}
              label={hovered.label}
              raised
            />
          </>
        )}
        {geometry.map(({ s, g }) =>
          g.end && s.marker !== false ? (
            <EndMark
              key={s.id}
              x={g.end.x}
              y={g.end.y}
              markClass={markerBg[s.color]}
              label={s.endLabel}
              above={continued(g.end)}
            />
          ) : null,
        )}
      </div>
      <span aria-hidden="true" />
      <div aria-hidden="true" className="relative h-[1.125rem]">
        {xTicks.map((t) => {
          const left = toPercent(t.value, x, 'x');
          return (
            <span
              key={t.value}
              className={cn(
                'absolute top-[3px] whitespace-nowrap',
                // Labels at the ends stay inside the plot instead of being
                // cut off by the tile.
                left >= 99.5
                  ? '-translate-x-full'
                  : left > 0.5 && '-translate-x-1/2',
              )}
              style={{ left: `${String(left)}%` }}
            >
              {t.label}
            </span>
          );
        })}
      </div>
      {/* A table ignores its own size, so the wrapper hides it. */}
      <div className="sr-only">
        <table>
          <caption>{table.caption}</caption>
          <thead>
            <tr>
              {table.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The 7 px end marker and its value: to the right of a point in the left
 * 70 % of the plot, above and to the left of one further right. `above`
 * lifts it off a line that carries on to the right: to the left when there
 * is room, else to the right.
 */
function EndMark({
  x,
  y,
  markClass,
  label,
  raised = false,
  above = false,
}: {
  x: number;
  y: number;
  markClass: string;
  label: string | undefined;
  /** The hover tooltip: above the end labels, with an outline. */
  raised?: boolean;
  above?: boolean;
}) {
  const at = { left: `${String(x)}%`, top: `${String(y)}%` };
  return (
    <div aria-hidden="true" className={cn(raised && 'z-10')}>
      <span
        className={cn('absolute -mt-[3.5px] -ml-[3.5px] size-[7px]', markClass)}
        style={at}
      />
      {label === undefined ? null : (
        <span
          className={cn(
            'absolute bg-canvas px-[3px] font-num text-tiny leading-[1.45] whitespace-nowrap text-text',
            raised && 'border border-outline',
            x >= 70 || (above && x >= 15)
              ? '-translate-x-full -translate-y-[160%]'
              : above
                ? 'translate-x-1.5 -translate-y-[160%]'
                : 'translate-x-1.5 -translate-y-1/2',
          )}
          style={at}
        >
          {label}
        </span>
      )}
    </div>
  );
}

type HoverTarget = Readonly<{
  x: number;
  y: number;
  color: ChartColor;
  label: string;
}>;

/** The real point nearest `at` on x among series that have hover labels. */
function nearestPoint(
  series: readonly ChartSeries[],
  at: number,
): { series: string; index: number } | null {
  let best: { series: string; index: number } | null = null;
  let gap = Infinity;
  for (const s of series) {
    if (s.hoverLabels === undefined) continue;
    s.points.forEach((p, index) => {
      // Strictly nearer, so the first series wins a tie.
      if (Math.abs(p.x - at) < gap) {
        gap = Math.abs(p.x - at);
        best = { series: s.id, index };
      }
    });
  }
  return best;
}

function hoverTarget(
  series: readonly ChartSeries[],
  hover: { series: string; index: number } | null,
  x: Domain,
  y: Domain,
): HoverTarget | null {
  if (hover === null) return null;
  const s = series.find((candidate) => candidate.id === hover.series);
  const point = s?.points[hover.index];
  const label = s?.hoverLabels?.[hover.index];
  if (s === undefined || point === undefined || label === undefined) {
    return null;
  }
  return {
    x: toPercent(point.x, x, 'x'),
    y: toPercent(point.y, y, 'y'),
    color: s.color,
    label,
  };
}

export type LegendItem = Readonly<{
  label: string;
  /**
   * A solid 2 px line, a dashed one, the 1 px pace tick, a filled range's
   * swatch, or just text.
   */
  mark: 'line' | 'dash' | 'tick' | 'band' | 'none';
  /** The mark's background class, for example `bg-series-1`. */
  color?: string;
}>;

/** The line under a chart naming its marks (`legend2`). */
export function ChartLegend({
  items,
  className,
}: {
  items: readonly LegendItem[];
  className?: string;
}) {
  return (
    <p
      className={cn(
        'mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-tiny leading-[1.45] text-text-muted',
        className,
      )}
    >
      {items.map((item, index) => (
        // Two marks can share a name, so the place is part of the key: with
        // a bare label React keeps a stale twin when the names change.
        <span
          key={`${String(index)}-${item.label}`}
          className="inline-flex items-center"
        >
          {item.mark === 'none' ? null : (
            <span
              aria-hidden="true"
              className={cn(
                'mr-[5px] inline-block',
                item.mark === 'tick'
                  ? 'h-2.5 w-px'
                  : item.mark === 'band'
                    ? 'h-2 w-2.5'
                    : 'h-0.5 w-2.5',
                item.mark === 'dash'
                  ? 'bg-[repeating-linear-gradient(90deg,currentColor_0_3px,var(--canvas)_3px_5px)]'
                  : item.color,
              )}
            />
          )}
          {item.label}
        </span>
      ))}
    </p>
  );
}
