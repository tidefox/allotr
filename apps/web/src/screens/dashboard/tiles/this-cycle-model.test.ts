import { localDate, money, type CycleDayView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { cycleTicks, cycleView, daysOver } from './this-cycle-model.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');

function day(
  n: number,
  spent: number | null,
  cumulative: number | null,
  pace: number,
  allowance: number | null = 1000,
): CycleDayView {
  return {
    date: localDate(`2026-03-${String(n).padStart(2, '0')}`),
    spent: spent === null ? null : usd(spent),
    cumulativeSpent: cumulative === null ? null : usd(cumulative),
    pace: usd(pace),
    availableEnd: null,
    allowance: allowance === null ? null : usd(allowance),
  };
}

const days = [
  day(1, 1500, 1500, 1000),
  day(2, 500, 2000, 2000),
  day(3, 200, 2200, 3000),
  day(4, null, null, 4000, null),
];

describe('daysOver', () => {
  it('counts days that passed their allowance', () => {
    expect(daysOver(days)).toBe(1);
  });

  it('ignores days after today', () => {
    expect(daysOver([day(4, null, null, 4000, null)])).toBe(0);
  });
});

describe('cycleView', () => {
  it('reads today from the last day with figures', () => {
    const view = cycleView(days);
    expect(view.todayIndex).toBe(2);
    expect(view.day).toBe(3);
    expect(view.length).toBe(4);
    expect(view.spent).toEqual(usd(2200));
    expect(view.pace).toEqual(usd(3000));
    expect(view.status).toBe('under');
  });

  it('is ahead when spending passes the even pace', () => {
    expect(cycleView([day(1, 1500, 1500, 1000)]).status).toBe('ahead');
  });

  it('plots only days with figures and spans the pace over the cycle', () => {
    const view = cycleView(days);
    expect(view.spentPoints).toEqual([
      { x: 0, y: 1500 },
      { x: 1, y: 2000 },
      { x: 2, y: 2200 },
    ]);
    expect(view.reference).toEqual({
      from: { x: 0, y: 1000 },
      to: { x: 3, y: 4000 },
    });
  });

  it('copes with an empty cycle', () => {
    const view = cycleView([]);
    expect(view.reference).toBeNull();
    expect(view.todayIndex).toBe(-1);
    expect(view.spent).toBeNull();
  });
});

describe('cycleTicks', () => {
  const at = (length: number, today: number) =>
    cycleTicks(length, today).map((t) => (t.today ? 'today' : t.index));

  it('marks weeks, today and the last day', () => {
    expect(at(28, 14)).toEqual([0, 7, 'today', 21, 27]);
  });
  it('drops a weekly tick too close to today or the end', () => {
    expect(at(30, 16)).toEqual([0, 7, 'today', 21, 29]);
    expect(at(26, 10)).toEqual([0, 'today', 14, 21, 25]);
  });
  it('lets today replace a first or last day next to it', () => {
    expect(at(28, 1)).toEqual(['today', 7, 14, 21, 27]);
    expect(at(28, 26)).toEqual([0, 7, 14, 21, 'today']);
    expect(at(28, 0)).toEqual(['today', 7, 14, 21, 27]);
  });
  it('has no today tick before the series has figures', () => {
    expect(at(10, -1)).toEqual([0, 9]);
    expect(at(15, -1)).toEqual([0, 7, 14]);
    expect(at(0, -1)).toEqual([]);
  });
});
