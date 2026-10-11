// Shares in basis points (hundredths of a percent), computed here so the web
// app never divides money (docs/ui.md §8). Pure integer arithmetic.

/** 100% in basis points. */
export const FULL_SHARE_BP = 10_000;

/**
 * Each part's share of `whole`, in basis points of `units` (10 000 is the
 * whole). Parts that are not positive get 0, and so does everything when
 * `whole` is not positive. Shares round down; when the positive parts add up
 * to `whole` exactly, the leftover basis points go to the largest remainders
 * (largest-remainder method, ties to the earlier part), so the shares add up
 * to `units`. Each share is capped at `units`.
 */
export function basisPointShares(
  parts: readonly number[],
  whole: number,
  units: number = FULL_SHARE_BP,
): number[] {
  if (!(whole > 0) || !(units > 0)) return parts.map(() => 0);
  const w = BigInt(whole);
  const u = BigInt(units);
  const exact = parts.map((p) => (p > 0 ? BigInt(p) * u : 0n));
  const floors = exact.map((x) => x / w);
  const sum = parts.reduce((s, p) => s + (p > 0 ? BigInt(p) : 0n), 0n);
  if (sum === w) {
    let leftover = u - floors.reduce((s, f) => s + f, 0n);
    const order = exact
      .map((x, index) => ({ index, rest: x % w }))
      .filter(({ index }) => (parts[index] ?? 0) > 0)
      .sort((a, b) =>
        a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1,
      );
    for (const { index } of order) {
      if (leftover <= 0n) break;
      floors[index] = (floors[index] ?? 0n) + 1n;
      leftover -= 1n;
    }
  }
  return floors.map((f) => Number(f > u ? u : f));
}
