import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { allocationSegments, segmentShare } from './cycle-allocation.ts';

const m = (n: number) => money(n, 'USD');
const labels = {
  paidBills: 'a',
  savings: 'b',
  spent: 'c',
  other: 'f',
  reserved: 'd',
  free: 'e',
};

describe('segmentShare', () => {
  it('is the part over the start', () => {
    expect(segmentShare(m(250), m(1000))).toBe(0.25);
  });
  it('is empty for negative parts and a non-positive start', () => {
    expect(segmentShare(m(-5), m(1000))).toBe(0);
    expect(segmentShare(m(5), m(0))).toBe(0);
    expect(segmentShare(m(5), m(-10))).toBe(0);
  });
});

describe('allocationSegments', () => {
  it('keeps the order with the money left last', () => {
    const segments = allocationSegments(
      {
        start: m(1000),
        paycheck: m(700),
        carried: m(300),
        paidBills: m(100),
        savings: m(-50),
        spent: m(300),
        reserved: m(200),
        free: m(450),
        other: m(-20),
        shareBp: {
          paidBills: 1000,
          savings: 0,
          spent: 3000,
          reserved: 2000,
          free: 4500,
          other: 0,
        },
      },
      labels,
    );
    expect(segments.map((s) => s.id)).toEqual([
      'paidBills',
      'savings',
      'spent',
      'other',
      'reserved',
      'free',
    ]);
    expect(segments[1]?.fraction).toBe(0);
    expect(segments[3]?.fraction).toBe(0);
    expect(segments[3]?.color).toBe('series-3');
    expect(segments[5]?.positive).toBe(true);
    expect(segments[5]?.fraction).toBe(0.45);
    // The printed share is the server's, never derived from the amounts.
    expect(segments.map((s) => s.shareBp)).toEqual([
      1000, 0, 3000, 0, 2000, 4500,
    ]);
  });

  it('leaves out an `other` part of zero', () => {
    const segments = allocationSegments(
      {
        start: m(1000),
        paycheck: m(700),
        carried: m(300),
        paidBills: m(100),
        savings: m(0),
        spent: m(300),
        reserved: m(200),
        free: m(400),
        other: m(0),
        shareBp: {
          paidBills: 1000,
          savings: 0,
          spent: 3000,
          reserved: 2000,
          free: 4000,
          other: 0,
        },
      },
      labels,
    );
    expect(segments.map((s) => s.id)).toEqual([
      'paidBills',
      'savings',
      'spent',
      'reserved',
      'free',
    ]);
  });
});
