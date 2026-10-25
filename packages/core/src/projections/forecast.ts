import { isoWeekday, type LocalDate } from '@allotr/shared';

// Spending forecast (docs/domain.md "Spending forecast"): the short-horizon
// cash-flow model treasury and FP&A desks use for daily outflows. Recent
// days are winsorized so a one-off purchase does not set the rate, a
// day-of-week profile is taken out once there is enough history, the level
// is exponentially smoothed so recent days weigh most, and the spread of the
// one-day-ahead errors gives an 80% range around the cumulative path.
// Statistics run in floating point; every figure leaves as whole minor units.

/** Days of spending before today the forecast learns from. */
export const FORECAST_HISTORY = 42;
/** Days after which a day's weight in the smoothed level halves. */
export const FORECAST_HALF_LIFE = 7;
/** History needed before a day-of-week profile is used: four weeks. */
const WEEKDAY_MIN_DAYS = 28;
/** Pulls each weekday factor toward 1 by this many pseudo-observations. */
const WEEKDAY_SHRINK = 2;
/** Winsorizing percentiles: the tails beyond are clamped. */
const TAIL = 0.05;
/** Two-sided 80% normal quantile. */
const Z80 = 1.2816;

const ALPHA = 1 - 2 ** (-1 / FORECAST_HALF_LIFE);

export type SpendingDay = Readonly<{ date: LocalDate; spent: number }>;

/** Cumulative spending from the anchor through each future day. */
export type ForecastPoint = Readonly<{
  /** Expected path, rounded down. */
  mid: number;
  /** Lower 80% bound, rounded down, never below zero or an earlier bound. */
  low: number;
  /** Upper 80% bound, rounded up. */
  high: number;
}>;

// Nearest-rank percentile of an ascending list.
function percentile(sorted: readonly number[], p: number): number {
  const rank = Math.min(
    sorted.length,
    Math.max(1, Math.ceil(p * sorted.length)),
  );
  return sorted[rank - 1] ?? 0;
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/** Day-of-week factors (index = ISO weekday − 1), averaging 1. */
function weekdayFactors(days: readonly SpendingDay[]): number[] {
  const flat = Array.from({ length: 7 }, () => 1);
  const overall = mean(days.map((d) => d.spent));
  if (days.length < WEEKDAY_MIN_DAYS || overall <= 0) return flat;
  const factors = flat.map((_, i) => {
    const same = days.filter((d) => isoWeekday(d.date) === i + 1);
    const raw = Math.max(0, mean(same.map((d) => d.spent)) / overall);
    const weight = same.length / (same.length + WEEKDAY_SHRINK);
    return 1 + weight * (raw - 1);
  });
  const scale = mean(factors);
  return factors.map((f) => f / scale);
}

/**
 * Cumulative spending forecast for each of `future` (consecutive days after
 * the last of `history`), as offsets from the anchor (spending so far).
 * `history` is the user's own daily pace spending, oldest first; an empty
 * history forecasts nothing new.
 */
export function spendingForecast(
  history: readonly SpendingDay[],
  future: readonly LocalDate[],
): ForecastPoint[] {
  if (history.length === 0) {
    return future.map(() => ({ mid: 0, low: 0, high: 0 }));
  }
  const sorted = history.map((d) => d.spent).sort((a, b) => a - b);
  const floor = percentile(sorted, TAIL);
  const cap = percentile(sorted, 1 - TAIL);
  const days = history.map((d) => ({
    date: d.date,
    spent: Math.min(cap, Math.max(floor, d.spent)),
  }));
  const factors = weekdayFactors(days);
  const factor = (date: LocalDate) => factors[isoWeekday(date) - 1] ?? 1;

  // Simple exponential smoothing of the weekday-adjusted series, started
  // from the mean of its first week.
  let level = mean(days.slice(0, 7).map((d) => d.spent / factor(d.date)));
  let squared = 0;
  for (const d of days) {
    const error = d.spent - level * factor(d.date);
    squared += error * error;
    level += ALPHA * (d.spent / factor(d.date) - level);
  }
  const sigma2 = squared / days.length;
  // Error variance of a sum of h days around a level that is itself an
  // estimate: h·σ² for the days, h²·σ²·α/(2−α) for the level.
  const levelShare = ALPHA / (2 - ALPHA);

  let mid = 0;
  let low = 0;
  return future.map((date, i) => {
    const h = i + 1;
    mid += Math.max(0, level * factor(date));
    const spread = Z80 * Math.sqrt(sigma2 * (h + h * h * levelShare));
    low = Math.max(low, mid - spread);
    return {
      mid: Math.floor(mid),
      low: Math.floor(low),
      high: Math.ceil(mid + spread),
    };
  });
}
