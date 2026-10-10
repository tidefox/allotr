import { money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { spentShare } from '@/features/budget/share';
import { segmentShare } from '@/screens/dashboard/tiles/cycle-allocation';
import { fractionsOf } from '@/screens/reports/cycles-model';
import { fractionOf } from '@/screens/reports/summary-model';
import { barFraction } from '@/shell/summary-math';

// Every helper that sizes a bar must stay inside 0..1 (spentShare: 0..100)
// and draw nothing for a whole that is zero or negative, whatever the input.

const number = fc.double({ noNaN: true });
const minor = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });
const nonPositive = fc.double({ noNaN: true, max: 0 });

describe('part-over-whole helpers', () => {
  const helpers: readonly (readonly [
    string,
    (part: number, whole: number) => number,
  ])[] = [
    ['barFraction', barFraction],
    ['fractionOf', fractionOf],
    [
      'segmentShare',
      (part, whole) =>
        segmentShare(
          money(Math.trunc(part), 'USD'),
          money(Math.trunc(whole), 'USD'),
        ),
    ],
  ];
  for (const [name, helper] of helpers) {
    it(`${name} stays within 0..1`, () => {
      fc.assert(
        fc.property(minor, minor, (part, whole) => {
          const fraction = helper(part, whole);
          expect(fraction).toBeGreaterThanOrEqual(0);
          expect(fraction).toBeLessThanOrEqual(1);
        }),
      );
    });
    it(`${name} is 0 for a whole of zero or less`, () => {
      fc.assert(
        fc.property(minor, fc.integer({ min: -1_000_000, max: 0 }), (p, w) => {
          expect(helper(p, w)).toBe(0);
        }),
      );
    });
  }

  it('barFraction and fractionOf stay within 0..1 for any double', () => {
    for (const helper of [barFraction, fractionOf]) {
      fc.assert(
        fc.property(number, number, (part, whole) => {
          const fraction = helper(part, whole);
          expect(fraction).toBeGreaterThanOrEqual(0);
          expect(fraction).toBeLessThanOrEqual(1);
        }),
      );
    }
  });
});

describe('fractionsOf', () => {
  it('stays within 0..1', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ noNaN: true, noDefaultInfinity: true })),
        (values) => {
          for (const fraction of fractionsOf(values)) {
            expect(fraction).toBeGreaterThanOrEqual(0);
            expect(fraction).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });
  it('is all 0 when no value is above zero', () => {
    fc.assert(
      fc.property(fc.array(nonPositive), (values) => {
        expect(fractionsOf(values).every((f) => f === 0)).toBe(true);
      }),
    );
  });
});

describe('spentShare', () => {
  it('stays within 0..100', () => {
    fc.assert(
      fc.property(minor, minor, (spent, left) => {
        const share = spentShare(money(spent, 'USD'), money(left, 'USD'));
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(100);
      }),
    );
  });
  it('is 0 when nothing was spent', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 0 }), minor, (s, left) => {
        expect(spentShare(money(s, 'USD'), money(left, 'USD'))).toBe(0);
      }),
    );
  });
});

describe('infinite input', () => {
  it('never produces NaN', () => {
    for (const helper of [barFraction, fractionOf]) {
      expect(helper(Infinity, Infinity)).toBe(1);
      expect(helper(1, Infinity)).toBe(0);
      expect(helper(Infinity, 1)).toBe(1);
    }
  });
});
