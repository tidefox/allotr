import type { Kysely } from 'kysely';
import fc from 'fast-check';
import { bundleSchema, currencyCode, money } from '@allotr/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAccount,
  createBudget,
  createPool,
  createTransaction,
  editTransaction,
  importBundle,
  loadView,
  moveAccount,
  moveTransaction,
  reverseTransaction,
  todayFigures,
  updateAccount,
  updateLedgerSettings,
  type DB,
} from '@allotr/store';
import { migrate } from './db/migrate.ts';
import { createKysely, openSqlite } from './db/sqlite.ts';
import { insertUser, repoMigrations } from './testing/database.ts';

// The ledger cache never changes an answer (packages/store/src/ledger-cache.ts).
// Random sequences of writes through the store's own functions are mixed with
// reads at random dates; after every step the cached instance must answer
// exactly like an instance with the cache off, over the same database. A
// write that the store refuses is part of the sequence too. All names and
// amounts are made up. fast-check prints the seed of any failure.

const now = new Date('2026-03-20T12:00:00Z');
const eur = (amountMinor: number) => money(amountMinor, 'EUR');

const bundle = (txs: readonly unknown[]) => ({
  format: 'allotr.bundle',
  version: 1,
  settings: { timeZone: 'UTC', defaultCurrency: 'EUR', paydayDay: 25 },
  categories: [
    { name: 'Coffee', parent: 'Food' },
    { name: 'Side gigs', kind: 'income' },
  ],
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
  transactions: txs,
});

type Op =
  | {
      kind: 'add';
      type: 'expense' | 'income' | 'transfer';
      a: number;
      b: number;
      minor: number;
      day: number;
    }
  | { kind: 'reverse'; pick: number }
  | { kind: 'edit'; pick: number; minor: number; day: number }
  | { kind: 'move'; pick: number }
  | { kind: 'settings'; savings: boolean; payday: number }
  | { kind: 'pool'; savings: boolean }
  | { kind: 'poolMove'; account: number; pool: number }
  | { kind: 'account'; account: number; off: boolean }
  | { kind: 'open'; off: boolean }
  | { kind: 'budget'; minor: number }
  | { kind: 'import' };

const day = fc.integer({ min: 1, max: 28 });
const minor = fc.integer({ min: 1, max: 90_000 });
const index = fc.nat(50);

const opArbitrary: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant('add' as const),
      type: fc.constantFrom(
        'expense' as const,
        'income' as const,
        'transfer' as const,
      ),
      a: index,
      b: index,
      minor,
      day,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('reverse' as const),
      pick: index,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('edit' as const),
      pick: index,
      minor,
      day,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('move' as const), pick: index }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('settings' as const),
      savings: fc.boolean(),
      payday: day,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('pool' as const),
      savings: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('poolMove' as const),
      account: index,
      pool: index,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('account' as const),
      account: index,
      off: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('open' as const),
      off: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('budget' as const), minor }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'import' as const }) },
);

const seedEntry = fc.record({
  kind: fc.constantFrom('expense' as const, 'income' as const),
  minor,
  day,
});

const readNow = fc
  .integer({ min: 0, max: 60 })
  .map((offset) => new Date(Date.UTC(2026, 2, 1 + offset, 9)));

let sqlite: ReturnType<typeof openSqlite>;
let cached: Kysely<DB>;
let plain: Kysely<DB>;
let runs = 0;

beforeAll(() => {
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
});

afterAll(() => {
  sqlite.close();
});

const date = (d: number) => `2026-03-${String(d).padStart(2, '0')}`;

async function ids(
  table: 'transactions' | 'accounts' | 'pools' | 'categories',
  userId: string,
  kind?: string,
) {
  let query = plain
    .selectFrom(table)
    .select('id')
    .where('user_id', '=', userId);
  if (table === 'accounts')
    query = query.where('system_role', 'is', null).where('archived', '=', 0);
  if (table === 'categories' && kind !== undefined)
    query = query.where('kind', '=', kind);
  return (await query.orderBy('id').execute()).map((row) => row.id);
}

const pick = <T>(list: readonly T[], at: number): T | undefined =>
  list.length === 0 ? undefined : list[at % list.length];

async function apply(op: Op, userId: string, counter: number): Promise<void> {
  const accounts = await ids('accounts', userId);
  const spend = await ids('categories', userId, 'expense');
  const earn = await ids('categories', userId, 'income');
  const account = pick(accounts, 'a' in op ? op.a : 0);
  switch (op.kind) {
    case 'add': {
      const other = pick(accounts, op.b);
      if (account === undefined || other === undefined) return;
      const category = pick(op.type === 'income' ? earn : spend, op.b);
      const body =
        op.type === 'transfer'
          ? {
              kind: 'transfer' as const,
              fromAccountId: account,
              toAccountId: other,
              sent: eur(op.minor),
              occurredOn: date(op.day),
            }
          : {
              kind: op.type,
              accountId: account,
              amount: eur(op.minor),
              categoryId: category ?? '',
              occurredOn: date(op.day),
            };
      await createTransaction(cached, userId, body as never, undefined, now);
      return;
    }
    case 'reverse': {
      const id = pick(await ids('transactions', userId), op.pick);
      if (id !== undefined)
        await reverseTransaction(cached, userId, id, undefined, now);
      return;
    }
    case 'edit': {
      const id = pick(await ids('transactions', userId), op.pick);
      const category = pick(spend, op.pick);
      if (id === undefined || account === undefined) return;
      await editTransaction(
        cached,
        userId,
        id,
        {
          kind: 'expense',
          accountId: account,
          amount: eur(op.minor),
          categoryId: category ?? '',
          occurredOn: date(op.day),
        } as never,
        now,
      );
      return;
    }
    case 'move': {
      const id = pick(await ids('transactions', userId), op.pick);
      if (id !== undefined)
        await moveTransaction(cached, userId, id, { afterId: null }, now);
      return;
    }
    case 'settings':
      await updateLedgerSettings(
        cached,
        userId,
        { countSavingsInDaily: op.savings, paydayDay: op.payday },
        now,
      );
      return;
    case 'pool':
      await createPool(
        cached,
        userId,
        {
          name: `Pool ${String(counter)}`,
          kind: op.savings ? 'savings' : 'spending',
        },
        now,
      );
      return;
    case 'poolMove': {
      const pool = pick(await ids('pools', userId), op.pool);
      if (account !== undefined && pool !== undefined) {
        await moveAccount(cached, userId, account, { poolId: pool }, now);
      }
      return;
    }
    case 'account':
      if (account !== undefined) {
        await updateAccount(
          cached,
          userId,
          account,
          { budgetGroup: op.off ? 'off' : 'on' },
          now,
        );
      }
      return;
    case 'open':
      await createAccount(
        cached,
        userId,
        {
          name: `Jar ${String(counter)}`,
          kind: 'asset',
          currency: currencyCode('EUR'),
          budgetGroup: op.off ? 'off' : 'on',
          openingBalance: eur(1_000),
        },
        now,
      );
      return;
    case 'budget': {
      const category = pick(spend, op.minor);
      if (category !== undefined) {
        await createBudget(
          cached,
          userId,
          {
            name: `Budget ${String(counter)}`,
            target: { kind: 'category', categoryId: category },
            amount: eur(op.minor),
          },
          now,
        );
      }
      return;
    }
    case 'import':
      await importBundle(cached, userId, bundleSchema.parse(bundle([])), now);
  }
}

async function expectSame(userId: string, at: Date): Promise<void> {
  const first = await loadView(cached, userId);
  // Nothing was written in between, so the second read is the cached one.
  expect(await loadView(cached, userId)).toBe(first);
  expect(first).toEqual(await loadView(plain, userId));
  expect(await todayFigures(cached, userId, at)).toEqual(
    await todayFigures(plain, userId, at),
  );
}

describe('ledger cache', () => {
  it('answers like a database read for any mix of writes and reads', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(seedEntry, { maxLength: 6 }),
        fc.array(fc.tuple(opArbitrary, readNow), { maxLength: 10 }),
        async (seed, steps) => {
          runs += 1;
          const userId = `u${String(runs)}`;
          await insertUser(cached, userId);
          const txs = seed.map((s) =>
            s.kind === 'expense'
              ? {
                  kind: 'expense',
                  account: 'Wallet',
                  amount: eur(s.minor),
                  category: 'Food/Coffee',
                  occurredOn: date(s.day),
                }
              : {
                  kind: 'income',
                  account: 'Wallet',
                  amount: eur(s.minor),
                  category: 'Side gigs',
                  occurredOn: date(s.day),
                },
          );
          await importBundle(
            cached,
            userId,
            bundleSchema.parse(bundle(txs)),
            now,
          );
          await expectSame(userId, now);
          for (const [index, [op, at]] of steps.entries()) {
            // A refused write (a missing entry, an archived account) is a
            // valid step: it must leave the answers unchanged too.
            await apply(op, userId, index).catch(() => undefined);
            await expectSame(userId, at);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
