import { topPayees } from '@allotr/core';
import {
  localDateIn,
  type LocalDate,
  type PayeeReportView,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { resolveReportPeriod } from './report-period.ts';
import { loadView } from './today.ts';

// Top payees for a payday cycle or a calendar month, computed from the
// ledger on each read. The period is resolved as in the category report.

type Query = Readonly<{
  period: 'cycle' | 'month';
  cycle?: LocalDate | undefined;
  month?: string | undefined;
  limit: number;
}>;

export async function payeeReport(
  db: Kysely<DB>,
  userId: string,
  query: Query,
  now: Date,
): Promise<PayeeReportView> {
  const loaded = await db.transaction().execute((trx) => loadView(trx, userId));
  const today = localDateIn(now, loaded.timeZone);
  const { from, to } = resolveReportPeriod(loaded.view, today, query);
  return {
    period: query.period,
    from,
    to,
    currencies: topPayees(loaded.view, { from, to }, query.limit).map((g) => ({
      currency: g.currency,
      total: g.total,
      payees: g.payees.map((p) => ({
        payee: p.payee,
        count: p.count,
        total: p.total,
      })),
      more: g.more,
      unnamed: g.unnamed,
    })),
  };
}
