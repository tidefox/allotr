import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { basisPointShares } from './shares.ts';

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

describe('basisPointShares', () => {
  it('adds up to the whole when every part is non-negative', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1e12 }), {
          minLength: 1,
          maxLength: 8,
        }),
        (parts) => {
          const whole = sum(parts);
          const shares = basisPointShares(parts, whole);
          if (whole === 0) {
            expect(shares.every((s) => s === 0)).toBe(true);
            return;
          }
          expect(sum(shares)).toBe(10_000);
          parts.forEach((p, i) => {
            if (p === 0) expect(shares[i]).toBe(0);
          });
        },
      ),
    );
  });

  it('keeps larger parts at least as large and every share within 0..10000', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1e9, max: 1e9 }), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.integer({ min: -10, max: 2e9 }),
        (parts, whole) => {
          const shares = basisPointShares(parts, whole);
          shares.forEach((s, i) => {
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThanOrEqual(10_000);
            if ((parts[i] ?? 0) <= 0 || whole <= 0) expect(s).toBe(0);
          });
        },
      ),
    );
  });

  it('splits a share among parts that add up to it', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1e9 }), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.integer({ min: 0, max: 10_000 }),
        (parts, units) => {
          const shares = basisPointShares(parts, sum(parts), units);
          expect(sum(shares)).toBe(units);
        },
      ),
    );
  });

  it('gives known values', () => {
    expect(basisPointShares([1, 1, 1], 3)).toEqual([3334, 3333, 3333]);
    expect(basisPointShares([50, -10, 0, 50], 100)).toEqual([5000, 0, 0, 5000]);
    expect(basisPointShares([5], 0)).toEqual([0]);
  });
});
