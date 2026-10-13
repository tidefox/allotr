import { type LedgerView } from '@allotr/core';
import { currencyCode, localDate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { RequestProblem } from './domain-errors.ts';
import { resolveReportPeriod } from './report-period.ts';

// The ledger here has no paychecks, so there is one open cycle, opened on
// the user's first day (closed cycles are covered by the report tests
// through the API). All dates are made up.

const view = (): LedgerView => ({
  chart: new Map(),
  ledger: [],
  paycheckCategories: new Set(),
  settings: {
    defaultCurrency: currencyCode('USD'),
    startedOn: localDate('2026-02-01'),
    paydayRule: 'fixed',
    paydayDay: 10,
    paydayOverride: null,
  },
  bills: [],
  rates: [],
});

const today = localDate('2026-03-20');

describe('resolveReportPeriod', () => {
  it('takes a month as given, to its last day', () => {
    expect(
      resolveReportPeriod(view(), today, {
        period: 'month',
        month: '2026-02',
      }),
    ).toMatchObject({
      kind: 'month',
      month: '2026-02',
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('defaults to the month that holds today', () => {
    expect(
      resolveReportPeriod(view(), today, { period: 'month' }),
    ).toMatchObject({ month: '2026-03', from: '2026-03-01', to: '2026-03-31' });
  });

  it('defaults to the open cycle, which runs to today', () => {
    const period = resolveReportPeriod(view(), today, { period: 'cycle' });
    expect(period).toMatchObject({
      kind: 'cycle',
      from: '2026-02-01',
      to: '2026-03-20',
    });
    expect(period.kind === 'cycle' && period.cycles).toHaveLength(1);
  });

  it('finds a cycle by the day it opened', () => {
    expect(
      resolveReportPeriod(view(), today, {
        period: 'cycle',
        cycle: localDate('2026-02-01'),
      }),
    ).toMatchObject({ from: '2026-02-01', to: '2026-03-20' });
  });

  it('refuses a cycle that never opened', () => {
    try {
      resolveReportPeriod(view(), today, {
        period: 'cycle',
        cycle: localDate('2026-01-05'),
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RequestProblem);
      expect((error as RequestProblem).code).toBe('cycle_not_found');
    }
  });

  it('always covers a whole month, first to last day', () => {
    for (let year = 2020; year <= 2035; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const text = `${String(year)}-${String(month).padStart(2, '0')}`;
        const period = resolveReportPeriod(view(), today, {
          period: 'month',
          month: text,
        });
        expect(period.from).toBe(`${text}-01`);
        expect(period.to.slice(0, 7)).toBe(text);
        expect(period.to.slice(8)).toMatch(/^(28|29|30|31)$/);
      }
    }
  });
});
