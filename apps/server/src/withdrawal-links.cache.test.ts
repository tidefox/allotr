import { bundleSchema, localDate, money } from '@allotr/shared';
import type { Kysely } from 'kysely';
import type Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createWithdrawalLink,
  editTransaction,
  importBundle,
  loadView,
  removeWithdrawalLink,
  reverseTransaction,
  restoreTransaction,
  todayFigures,
  writeGeneration,
  type DB,
} from '@allotr/store';
import { migrate } from './db/migrate.ts';
import { createKysely, openSqlite } from './db/sqlite.ts';
import { insertUser, repoMigrations } from './testing/database.ts';

// A withdrawal link written through the store shows in the cached ledger at
// once, like any other write (packages/store/src/ledger-cache.ts): create,
// remove, an edit that carries it, undo and restore each change what the
// next read sees, and the cached instance answers like one with the cache
// off. Made-up names and amounts.

const now = new Date('2026-03-20T12:00:00Z');
const eur = (amountMinor: number) => money(amountMinor, 'EUR');

let sqlite: Database.Database;
let cached: Kysely<DB>;
let plain: Kysely<DB>;
let withdrawalId = '';
let expenseId = '';

beforeAll(async () => {
  sqlite = openSqlite(':memory:');
  migrate({
    sqlite,
    databasePath: ':memory:',
    migrationsDir: repoMigrations,
    backupDir: '/nonexistent',
    now: () => new Date(0),
  });
  cached = createKysely(sqlite, { maxUsers: 2 });
  plain = createKysely(sqlite, { maxUsers: 0 });
  await insertUser(cached, 'u1');
  await importBundle(
    cached,
    'u1',
    bundleSchema.parse({
      format: 'allotr.bundle',
      version: 1,
      settings: { timeZone: 'UTC', defaultCurrency: 'EUR', paydayDay: 25 },
      categories: [{ name: 'Food', kind: 'expense' }],
      accounts: [
        {
          name: 'Wallet',
          currency: 'EUR',
          openingBalance: eur(50_000),
          openedOn: '2026-03-01',
        },
        {
          name: 'Savings',
          currency: 'EUR',
          budgetGroup: 'off',
          openingBalance: eur(100_000),
          openedOn: '2026-03-01',
        },
      ],
      transactions: [
        {
          ref: 'w',
          kind: 'transfer',
          from: 'Savings',
          to: 'Wallet',
          sent: eur(30_000),
          occurredOn: '2026-03-20',
        },
        {
          ref: 'e',
          kind: 'expense',
          account: 'Wallet',
          amount: eur(34_000),
          category: 'Food',
          occurredOn: '2026-03-20',
        },
      ],
    }),
    now,
  );
  const ids = await cached
    .selectFrom('transactions')
    .select(['id', 'kind'])
    .where('user_id', '=', 'u1')
    .where('kind', 'in', ['transfer', 'expense'])
    .execute();
  withdrawalId = ids.find((t) => t.kind === 'transfer')?.id ?? '';
  expenseId = ids.find((t) => t.kind === 'expense')?.id ?? '';
});

afterAll(() => {
  sqlite.close();
});

const spent = async (db: Kysely<DB>) =>
  (await todayFigures(db, 'u1', now)).spentToday.amountMinor;
const linkCount = async (db: Kysely<DB>) =>
  (await loadView(db, 'u1')).view.withdrawalLinks?.length;

// Reads through both instances, cached first and twice so the second hits.
async function reads() {
  const first = [await spent(cached), await linkCount(cached)];
  expect([await spent(cached), await linkCount(cached)]).toEqual(first);
  expect([await spent(plain), await linkCount(plain)]).toEqual(first);
  return first;
}

describe('withdrawal links and the ledger cache', () => {
  it('bumps the write generation and shows a link at once, then its removal', async () => {
    expect(await reads()).toEqual([34_000, 0]);

    const before = writeGeneration(cached);
    const made = await createWithdrawalLink(
      cached,
      'u1',
      { withdrawalId, expenseId, amount: eur(30_000) },
      now,
    );
    expect(writeGeneration(cached)).toBeGreaterThan(before ?? 0);
    expect(await reads()).toEqual([4_000, 1]);

    await removeWithdrawalLink(cached, 'u1', made.id, now);
    expect(await reads()).toEqual([34_000, 0]);
  });

  it('follows an edit that carries the link, an undo and a restore', async () => {
    await createWithdrawalLink(
      cached,
      'u1',
      { withdrawalId, expenseId, amount: eur(30_000) },
      now,
    );
    expect(await reads()).toEqual([4_000, 1]);

    const edited = await editTransaction(
      cached,
      'u1',
      expenseId,
      {
        kind: 'expense',
        accountId: (
          await cached
            .selectFrom('accounts')
            .select('id')
            .where('user_id', '=', 'u1')
            .where('name', '=', 'Wallet')
            .executeTakeFirstOrThrow()
        ).id,
        amount: eur(35_000),
        categoryId: (
          await cached
            .selectFrom('categories')
            .select('id')
            .where('user_id', '=', 'u1')
            .where('name', '=', 'Food')
            .executeTakeFirstOrThrow()
        ).id,
        occurredOn: localDate('2026-03-20'),
      },
      now,
    );
    expect(edited.notices).toEqual([]);
    expect(await reads()).toEqual([5_000, 1]);

    await reverseTransaction(
      cached,
      'u1',
      edited.replacement.id,
      undefined,
      now,
    );
    expect((await reads())[0]).toBe(0);
    await restoreTransaction(cached, 'u1', edited.replacement.id, now);
    expect((await reads())[0]).toBe(5_000);
  });
});
