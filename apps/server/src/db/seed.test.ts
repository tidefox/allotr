import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chartOf, deterministicId } from '@allotr/core';
import { isUuid, currencyCode } from '@allotr/shared';
import { ensureSystemAccounts, seedLedger } from '@allotr/store';
import type { DB } from '@allotr/store';
import type { Kysely } from 'kysely';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../testing/database.ts';

// seedLedger (packages/store/src/seed.ts) against real SQLite and migrations.
// All data is made up.

const createdAt = '2026-01-01T00:00:00.000Z';
const ledgerA = '11111111-2222-4333-8444-555555555555';
const ledgerB = '66666666-7777-4888-9999-aaaaaaaaaaaa';

async function freshLedger(ledgerId: string, userId = 'u1') {
  const db = createTestDatabase();
  await db
    .insertInto('users')
    .values({
      id: userId,
      name: 'Test',
      email: `${userId}@example.test`,
      ledger_id: ledgerId,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .execute();
  await seedLedger(db, {
    userId,
    ledgerId,
    createdAt,
    defaultCurrency: 'USD',
  });
  return db;
}

async function seededRows(db: Kysely<DB>) {
  return {
    categories: await db
      .selectFrom('categories')
      .selectAll()
      .orderBy('id')
      .execute(),
    pools: await db.selectFrom('pools').selectAll().orderBy('id').execute(),
    budgets: await db.selectFrom('budgets').selectAll().orderBy('id').execute(),
    budgetAmounts: await db
      .selectFrom('budget_amounts')
      .selectAll()
      .orderBy('id')
      .execute(),
  };
}

function ids(rows: Awaited<ReturnType<typeof seededRows>>): string[] {
  return Object.values(rows).flatMap((table) => table.map((row) => row.id));
}

describe('seedLedger', () => {
  it('gives the same ledger the same rows, ids included, in two databases', async () => {
    const first = await freshLedger(ledgerA);
    const second = await freshLedger(ledgerA);
    const rows = await seededRows(first);
    expect(rows).toEqual(await seededRows(second));
    expect(ids(rows).every(isUuid)).toBe(true);
    expect(new Set(ids(rows)).size).toBe(ids(rows).length);
    await first.destroy();
    await second.destroy();
  });

  it('gives different ledgers disjoint ids', async () => {
    const first = await freshLedger(ledgerA);
    const second = await freshLedger(ledgerB);
    const a = new Set(ids(await seededRows(first)));
    expect(ids(await seededRows(second)).filter((id) => a.has(id))).toEqual([]);
    await first.destroy();
    await second.destroy();
  });

  it('uses the documented keys', async () => {
    const db = await freshLedger(ledgerA);
    const rows = await seededRows(db);
    const group = rows.categories.find((c) => c.name === 'Housing');
    const child = rows.categories.find((c) => c.name === 'Rent');
    expect(group?.id).toBe(
      deterministicId(ledgerA, 'starter-category:/Housing'),
    );
    expect(child?.id).toBe(
      deterministicId(ledgerA, 'starter-category:Housing/Rent'),
    );
    expect(child?.parent_id).toBe(group?.id);
    expect(rows.pools.map((p) => p.id).sort()).toEqual(
      [
        deterministicId(ledgerA, 'pool:budget'),
        deterministicId(ledgerA, 'pool:savings'),
      ].sort(),
    );
    expect(rows.budgets.map((b) => b.id)).toEqual([
      deterministicId(ledgerA, 'budget:buffer'),
    ]);
    expect(rows.budgetAmounts.map((a) => a.id)).toEqual([
      deterministicId(ledgerA, 'budget-amount:budget:buffer:2026-01-01'),
    ]);
    await db.destroy();
  });

  it('adds nothing when it runs a second time', async () => {
    const db = await freshLedger(ledgerA);
    const before = await seededRows(db);
    await seedLedger(db, {
      userId: 'u1',
      ledgerId: ledgerA,
      createdAt,
      defaultCurrency: 'USD',
    });
    expect(await seededRows(db)).toEqual(before);
    await db.destroy();
  });

  it('seeds what the SQL triggers did, apart from the ids', async () => {
    const golden = JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          '../../../../testdata/golden/seed/new-user.json',
        ),
        'utf8',
      ),
    ) as {
      categories: Record<string, unknown>[];
      pools: Record<string, unknown>[];
      budgets: Record<string, unknown>[];
      budgetAmounts: Record<string, unknown>[];
    };
    const db = await freshLedger(ledgerA);
    const categories = await db
      .selectFrom('categories as c')
      .leftJoin('categories as p', 'p.id', 'c.parent_id')
      .select([
        'c.name',
        'p.name as parent',
        'c.kind',
        'c.is_paycheck',
        'c.income_class',
        'c.position',
        'c.colour',
        'c.icon',
        'c.created_at',
        'c.updated_at',
      ])
      .orderBy('c.kind')
      .orderBy('p.name')
      .orderBy('c.position')
      .orderBy('c.name')
      .execute();
    expect(categories).toEqual(golden.categories);
    expect(
      await db
        .selectFrom('pools')
        .select([
          'name',
          'kind',
          'counts_toward_daily',
          'default_for',
          'position',
          'created_at',
          'updated_at',
        ])
        .orderBy('position')
        .execute(),
    ).toEqual(golden.pools);
    const strip = (row: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(row).filter(
          ([key]) => !['id', 'user_id', 'budget_id'].includes(key),
        ),
      );
    const rows = await seededRows(db);
    expect(rows.budgets.map(strip)).toEqual(golden.budgets);
    expect(rows.budgetAmounts.map(strip)).toEqual(golden.budgetAmounts);
    await db.destroy();
  });
});

describe('system accounts', () => {
  async function systemAccountIds(ledgerId: string) {
    const db = await freshLedger(ledgerId);
    const chart = await ensureSystemAccounts(
      db,
      'u1',
      chartOf([]),
      [currencyCode('USD'), currencyCode('EUR')],
      new Date(createdAt),
    );
    const rows = await db
      .selectFrom('accounts')
      .select(['id', 'system_role', 'currency'])
      .orderBy('id')
      .execute();
    expect(chart.size).toBe(rows.length);
    await db.destroy();
    return rows;
  }

  it('have deterministic ids, stable across databases', async () => {
    const first = await systemAccountIds(ledgerA);
    expect(first).toEqual(await systemAccountIds(ledgerA));
    expect(first.length).toBeGreaterThan(0);
    for (const row of first) {
      expect(row.id).toBe(
        deterministicId(
          ledgerA,
          `system-account:${row.system_role ?? ''}:${row.currency}`,
        ),
      );
    }
    const other = await systemAccountIds(ledgerB);
    expect(
      other.map((row) => row.id).filter((id) => first.some((f) => f.id === id)),
    ).toEqual([]);
  });
});
