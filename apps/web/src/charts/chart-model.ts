import {
  areaPath,
  extent,
  fmt,
  linePath,
  linearScale,
  type Point,
} from './math.ts';

// Geometry for Chart, Sparkline and Columns: values from the server become
// percentages of the plot. Only positions are computed here, never money.

export type Domain = readonly [number, number];

/** The smallest domain over the values, widened to include `include`. */
export function domainOf(
  values: readonly number[],
  include: readonly number[] = [],
): Domain {
  return extent([...values, ...include]) ?? [0, 1];
}

/** A value as a percentage of the plot width/height (y grows upward). */
export function toPercent(
  value: number,
  domain: Domain,
  axis: 'x' | 'y',
): number {
  const scale = linearScale(domain, axis === 'x' ? [0, 100] : [100, 0]);
  return scale(value);
}

/** The point in the 0–100 plot space; y is flipped so larger is higher. */
export function toPlot(point: Point, x: Domain, y: Domain): Point {
  return { x: toPercent(point.x, x, 'x'), y: toPercent(point.y, y, 'y') };
}

export type LineGeometry = Readonly<{
  line: string;
  area: string;
  /** The last point by x, in plot space, for the end marker. */
  end: Point | undefined;
}>;

export function lineGeometry(
  points: readonly Point[],
  x: Domain,
  y: Domain,
): LineGeometry {
  const plot = points.map((p) => toPlot(p, x, y));
  const sorted = [...plot].sort((a, b) => a.x - b.x);
  return {
    line: linePath(plot),
    area: areaPath(plot, 100),
    end: sorted[sorted.length - 1],
  };
}

/** A range around a line at one x, in the caller's units. */
export type BandPoint = Readonly<{ x: number; low: number; high: number }>;

/**
 * A filled range: along the highs, back along the lows. Highs past the top
 * of the plot are held at its edge, so a wide range never rescales the axis.
 */
export function bandPath(band: readonly BandPoint[], x: Domain, y: Domain) {
  if (band.length < 2) return '';
  const at = (bx: number, by: number) => {
    const p = toPlot({ x: bx, y: by }, x, y);
    return `${fmt(p.x)} ${fmt(Math.max(0, p.y))}`;
  };
  const upper = band.map((b) => at(b.x, b.high));
  const lower = band.toReversed().map((b) => at(b.x, b.low));
  return `M${[...upper, ...lower].join('L')}Z`;
}
