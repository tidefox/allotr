import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { payeeKey } from '@allotr/core';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import {
  withLedgerCache,
  type DB,
  type LedgerCacheOptions,
} from '@allotr/store';

// ADR 0004: WAL, foreign keys on, STRICT tables (declared in migrations).
export function openSqlite(path: string): Database.Database {
  if (path !== ':memory:')
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

export function createKysely(
  sqlite: Database.Database,
  options: LedgerCacheOptions = {},
): Kysely<DB> {
  // The payee report's key, so the transaction list can filter by it
  // exactly; SQLite's own lower() and like fold A–Z only.
  sqlite.function('payee_key', { deterministic: true }, (note: unknown) =>
    payeeKey(typeof note === 'string' ? note : null),
  );
  // Every statement this instance runs passes the ledger cache, which drops
  // what a write could change (packages/store/src/ledger-cache.ts). The
  // cache starts empty here, after migrations have run.
  // Cached values are frozen outside production, so a caller that mutates
  // one fails in development and tests (it costs speed in production).
  return new Kysely<DB>({
    dialect: withLedgerCache(new SqliteDialect({ database: sqlite }), {
      freeze: process.env.NODE_ENV !== 'production',
      ...options,
    }),
  });
}
