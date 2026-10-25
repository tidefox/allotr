/** Clamps a fraction to 0..1; NaN and infinities that are not usable become 0. */
export function clampFraction(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** A fraction as a CSS percentage with two decimals, for exact bar widths. */
export function percent(value: number): string {
  return `${String(Math.round(clampFraction(value) * 10000) / 100)}%`;
}

/** From this share of a budget used, its bar warns (docs/ui.md §4). */
export const NEAR_LIMIT = 0.9;

/**
 * True when a bar is full enough to warn: at least 90 % used. Over budget
 * is the server's call (`over`) and is drawn `negative`, not by this.
 */
export function isNearLimit(fraction: number): boolean {
  return clampFraction(fraction) >= NEAR_LIMIT;
}
