import { queryOptions } from '@tanstack/react-query';
import { call } from '@/lib/api';
import { endpoints } from '@/lib/endpoints';
import type { ReportParams } from './summary-model.ts';

// The summary and trends tabs' reads. They sit under ['today'] so a new
// entry refreshes them.

function query(params: ReportParams) {
  return {
    period: params.period,
    ...(params.cycle === undefined ? {} : { cycle: params.cycle }),
    ...(params.month === undefined ? {} : { month: params.month }),
  };
}

/** Spending by category for a period; `series` adds the periods before it. */
export function reportCategoriesQuery(params: ReportParams, series: number) {
  return queryOptions({
    queryKey: ['today', 'report-categories', params, series],
    queryFn: () =>
      call(endpoints.categorySummary, { query: { ...query(params), series } }),
  });
}

export const TOP_PAYEES = 8;

export function reportPayeesQuery(params: ReportParams) {
  return queryOptions({
    queryKey: ['today', 'report-payees', params],
    queryFn: () =>
      call(endpoints.payeeReport, {
        query: { ...query(params), limit: TOP_PAYEES },
      }),
  });
}
