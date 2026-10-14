import { join } from 'node:path';
import type { Kysely } from 'kysely';
import { migrate } from '../db/migrate.ts';
import { seedLedger, type DB } from '@allotr/store';
import { createKysely, openSqlite } from '../db/sqlite.ts';

export const repoMigrations = join(
  import.meta.dirname,
  '../../../../migrations',
);

// A migrated in-memory database for tests.
export function createTestDatabase(): Kysely<DB> {
  const sqlite = openSqlite(':memory:');
  migrate({
    sqlite,
    databasePath: ':memory:',
    migrationsDir: repoMigrations,
    backupDir: '/nonexistent',
    now: () => new Date(0),
  });
  return createKysely(sqlite);
}

export async function insertUser(
  db: Kysely<DB>,
  id: string,
  role: 'admin' | 'user' = 'user',
): Promise<void> {
  const createdAt = '2026-01-01T00:00:00.000Z';
  const ledgerId = globalThis.crypto.randomUUID();
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('users')
      .values({
        id,
        name: `Test ${id}`,
        email: `${id}@example.test`,
        role,
        ledger_id: ledgerId,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .execute();
    // The seed runs in the same transaction, as sign-up does.
    await seedLedger(trx, {
      userId: id,
      ledgerId,
      createdAt,
      defaultCurrency: 'USD',
    });
  });
}
