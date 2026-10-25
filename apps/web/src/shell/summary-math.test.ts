import { localDate, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  barFraction,
  cycleDays,
  isoWeek,
  yesterdayChange,
} from './summary-math.ts';

describe('barFraction', () => {
  it('is the share of the whole', () => {
    expect(barFraction(2500, 10000)).toBe(0.25);
  });
  it('is empty when nothing is left or there is no allowance', () => {
    expect(barFraction(0, 10000)).toBe(0);
    expect(barFraction(-300, 10000)).toBe(0);
    expect(barFraction(500, 0)).toBe(0);
  });
  it('never passes full', () => {
    expect(barFraction(12000, 10000)).toBe(1);
  });
});

describe('isoWeek', () => {
  it('numbers weeks from the one holding the first Thursday', () => {
    expect(isoWeek(localDate('2026-10-09'))).toBe(41);
    expect(isoWeek(localDate('2026-01-01'))).toBe(1);
  });
  it('puts early January in the last week of the year before', () => {
    expect(isoWeek(localDate('2027-01-01'))).toBe(53);
    expect(isoWeek(localDate('2021-01-03'))).toBe(53);
  });
  it('puts late December in week 1 of the next year', () => {
    expect(isoWeek(localDate('2024-12-30'))).toBe(1);
  });
});

describe('cycleDays', () => {
  it('counts today from 1 and the cycle up to the day before payday', () => {
    expect(
      cycleDays(
        localDate('2026-09-25'),
        localDate('2026-10-09'),
        localDate('2026-10-23'),
      ),
    ).toEqual({ day: 15, length: 28 });
  });
  it('stays within the cycle when payday is overdue', () => {
    expect(
      cycleDays(
        localDate('2026-09-25'),
        localDate('2026-10-30'),
        localDate('2026-10-23'),
      ),
    ).toEqual({ day: 28, length: 28 });
  });
});

describe('yesterdayChange', () => {
  it('drops the sign and keeps the direction', () => {
    expect(yesterdayChange(money(2000, 'USD'))).toEqual({
      up: true,
      amount: money(2000, 'USD'),
    });
    expect(yesterdayChange(money(-350, 'USD'))).toEqual({
      up: false,
      amount: money(350, 'USD'),
    });
  });

  it('says nothing without a comparison or a change', () => {
    expect(yesterdayChange(null)).toBeNull();
    expect(yesterdayChange(money(0, 'USD'))).toBeNull();
  });
});
