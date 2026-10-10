import {
  compareGroupKeys,
  totalsFromSums,
  type EntryGrouping,
  type EntryGroupTotals,
  type EntryTotals,
} from '@allotr/core';
import { currencyCode, type CurrencyCode } from '@allotr/shared';
import { sql, type SelectQueryBuilder } from 'kysely';
import type { DB } from '../db/schema.ts';
import type { Db } from './store.ts';

// Totals of the entries a transaction filter matches, added up by the
// database so a page never loads the whole filtered set. The rules are
// core's `entryTotals` and `entryGroupTotals` (spent and income are the
// expense and income legs; a split counts each line in its own category,
// an entry with no such leg in its own category), and the tests hold the
// two to the same figures.

/** The IDs of the entries a filter matches. */
export type MatchingIds = SelectQueryBuilder<
  DB,
  'transactions' | 'transaction_ranks',
  { id: string }
>;

type ByCurrency = Map<CurrencyCode, { spent: number; income: number }>;
const emptyCurrencies = (): ByCurrency => new Map();
type Sums = Map<string | null, ByCurrency>;

/** The spent and income legs, summed per currency (and per group key). */
async function legSums(
  db: Db,
  userId: string,
  ids: MatchingIds,
  grouping: EntryGrouping | 'none',
): Promise<Sums> {
  const key =
    grouping === 'day'
      ? sql<string | null>`transactions.occurred_on`
      : grouping === 'category'
        ? sql<string | null>`postings.category_id`
        : sql<string | null>`null`;
  const rows = await db
    .selectFrom('postings')
    .innerJoin('accounts', 'accounts.id', 'postings.account_id')
    .innerJoin('transactions', 'transactions.id', 'postings.transaction_id')
    .select([
      key.as('key'),
      'accounts.system_role as role',
      'postings.currency',
      sql<number>`sum(postings.amount_minor)`.as('total'),
    ])
    .where('postings.user_id', '=', userId)
    .where('accounts.user_id', '=', userId)
    .where('accounts.system_role', 'in', ['expenses', 'income'])
    .where('postings.transaction_id', 'in', ids)
    .groupBy([key, 'accounts.system_role', 'postings.currency'])
    .execute();
  const sums: Sums = new Map();
  for (const row of rows) {
    const byCurrency: ByCurrency = sums.get(row.key) ?? emptyCurrencies();
    const currency = currencyCode(row.currency);
    const current = byCurrency.get(currency) ?? { spent: 0, income: 0 };
    // An expense leg is positive when money went out; an income leg is
    // negative when money came in.
    if (row.role === 'expenses') current.spent += row.total;
    else current.income -= row.total;
    byCurrency.set(currency, current);
    sums.set(row.key, byCurrency);
  }
  return sums;
}

const sumsOf = (byCurrency: ByCurrency) =>
  [...byCurrency].map(([currency, { spent, income }]) => ({
    currency,
    spent,
    income,
  }));

/** Count, spent, income and net of the matching entries. */
export async function aggregateTotals(
  db: Db,
  userId: string,
  ids: MatchingIds,
): Promise<EntryTotals> {
  const [counted, sums] = await Promise.all([
    db
      .selectFrom(ids.as('matching'))
      .select(sql<number>`count(*)`.as('n'))
      .executeTakeFirstOrThrow(),
    legSums(db, userId, ids, 'none'),
  ]);
  return totalsFromSums(counted.n, sumsOf(sums.get(null) ?? emptyCurrencies()));
}

/** The same figures per day or category, ordered as core orders them. */
export async function aggregateGroups(
  db: Db,
  userId: string,
  ids: MatchingIds,
  grouping: EntryGrouping,
): Promise<EntryGroupTotals[]> {
  const day = grouping === 'day';
  const [withLegs, withoutLegs, sums] = await Promise.all([
    // Entries with an expense or income leg count once in each category
    // those legs are in; by day this is every entry, below.
    day
      ? Promise.resolve([])
      : db
          .selectFrom('postings')
          .innerJoin('accounts', 'accounts.id', 'postings.account_id')
          .select([
            'postings.category_id as key',
            sql<number>`count(distinct postings.transaction_id)`.as('n'),
          ])
          .where('postings.user_id', '=', userId)
          .where('accounts.user_id', '=', userId)
          .where('accounts.system_role', 'in', ['expenses', 'income'])
          .where('postings.transaction_id', 'in', ids)
          .groupBy('postings.category_id')
          .execute(),
    db
      .selectFrom('transactions')
      .select([
        (day
          ? sql<string | null>`transactions.occurred_on`
          : sql<string | null>`transactions.category_id`
        ).as('key'),
        sql<number>`count(*)`.as('n'),
      ])
      .where('transactions.id', 'in', ids)
      .$if(!day, (qb) =>
        qb.where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom('postings')
                .innerJoin('accounts', 'accounts.id', 'postings.account_id')
                .select('postings.id')
                .whereRef('postings.transaction_id', '=', 'transactions.id')
                .where('postings.user_id', '=', userId)
                .where('accounts.user_id', '=', userId)
                .where('accounts.system_role', 'in', ['expenses', 'income']),
            ),
          ),
        ),
      )
      .groupBy(
        day ? sql`transactions.occurred_on` : sql`transactions.category_id`,
      )
      .execute(),
    legSums(db, userId, ids, grouping),
  ]);
  const counts = new Map<string | null, number>();
  for (const row of [...withLegs, ...withoutLegs]) {
    counts.set(row.key, (counts.get(row.key) ?? 0) + row.n);
  }
  return [...counts]
    .sort(([a], [b]) => compareGroupKeys(grouping, a, b))
    .map(([key, count]) => ({
      key,
      ...totalsFromSums(count, sumsOf(sums.get(key) ?? emptyCurrencies())),
    }));
}
