import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { sparkPoints } from './spark-points.ts';

describe('sparkPoints', () => {
  it('numbers the days and keeps the minor units', () => {
    expect(
      sparkPoints([
        { balance: money(100, 'USD') },
        { balance: money(-5, 'USD') },
      ]),
    ).toEqual([
      { x: 0, y: 100 },
      { x: 1, y: -5 },
    ]);
  });
});
