import { addDays, localDate, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cycleEndOn, cycleOn, cyclesOf } from './cycles.ts';
import { dailyFiguresOn } from './daily.ts';
import { cycleDays, paceDiff } from './series.ts';
import { paycheck, spend, viewFrom } from './testing.ts';

// The pace difference is the closed form of today's row in the cycle days:
// even pace less pace spending, so the three figures on screen agree.

const opened = localDate('2026-04-01');

function diffOn(entries: readonly [number, number][], offset: number) {
  const ledger = [
    paycheck('2026-04-01', 300_000),
    ...entries.map(([n, amount]) => spend(addDays(opened, n), amount)),
  ];
  const v = viewFrom('2026-04-01', ledger);
  const today = addDays(opened, offset);
  const cycle = cycleOn(cyclesOf(v, today), today);
  const f = dailyFiguresOn(v, today);
  const diff = paceDiff({
    cycle,
    cycleEnd: cycleEndOn(cycle, today),
    today,
    paceSpent: f.paceSpent,
    available: f.available,
  });
  const row = cycleDays(v, cycle, today).days.find((d) => d.date === today);
  return { diff, row, paceSpent: f.paceSpent };
}

describe('paceDiff', () => {
  it('is positive when spending is under the even pace', () => {
    // 3 000.00 over 30 days is 100.00 a day: the pace by day 10 is 1 000.00.
    // Spending exactly that is on pace.
    expect(diffOn([[0, 100_000]], 9).diff).toEqual(money(0, 'USD'));
    expect(diffOn([[0, 50_000]], 9).diff.amountMinor).toBe(50_000);
  });

  it('is negative when spending runs ahead of the pace', () => {
    expect(diffOn([[0, 200_000]], 9).diff.amountMinor).toBe(-100_000);
  });

  it('is a day of pace before anything is spent', () => {
    // 300 000 over 30 days; on day 1 the pace is 10 000.
    expect(diffOn([], 0).diff).toEqual(money(10_000, 'USD'));
  });

  it('rounds the pace down, as the cycle days do', () => {
    // 100 over 30 days is 3.33 a day: by day 1 the pace is 3 (minor units).
    const v = viewFrom('2026-04-01', [paycheck('2026-04-01', 100)]);
    const today = opened;
    const cycle = cycleOn(cyclesOf(v, today), today);
    const f = dailyFiguresOn(v, today);
    const diff = paceDiff({
      cycle,
      cycleEnd: cycleEndOn(cycle, today),
      today,
      paceSpent: f.paceSpent,
      available: f.available,
    });
    expect(diff.amountMinor).toBe(3);
  });

  it('equals the pace less the spending of today in the cycle days (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 29 }),
            fc.integer({ min: 1, max: 40_000 }),
          ),
          { maxLength: 12 },
        ),
        fc.integer({ min: 0, max: 29 }),
        (entries, offset) => {
          const todayEntries = entries.filter(([n]) => n <= offset);
          const { diff, row, paceSpent } = diffOn(todayEntries, offset);
          expect(row?.cumulativeSpent).toEqual(paceSpent);
          expect(diff.amountMinor).toBe(
            (row?.pace.amountMinor ?? 0) - paceSpent.amountMinor,
          );
        },
      ),
    );
  });
});
