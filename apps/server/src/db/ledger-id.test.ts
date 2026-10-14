import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isUuid } from '@allotr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoMigrations } from '../testing/database.ts';
import { migrate } from './migrate.ts';
import { openSqlite } from './sqlite.ts';
import type Database from 'better-sqlite3';

// Integration test for migrations/0024_ledger_id.sql against real SQLite.

const at = '2026-01-01T00:00:00.000Z';

let dir: string;
let sqlite: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'allotr-ledger-id-'));
  sqlite = openSqlite(join(dir, 'allotr.db'));
});

afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

function run(migrationsDir: string): readonly string[] {
  return migrate({
    sqlite,
    databasePath: join(dir, 'allotr.db'),
    migrationsDir,
    backupDir: join(dir, 'backups'),
    now: () => new Date(at),
  }).applied;
}

function before0024(): string {
  const target = join(dir, 'migrations-0023');
  mkdirSync(target);
  for (const name of readdirSync(repoMigrations)) {
    if (name.endsWith('.sql') && name < '0024') {
      copyFileSync(join(repoMigrations, name), join(target, name));
    }
  }
  return target;
}

function names(sql: string): string[] {
  return sqlite.prepare(sql).pluck().all() as string[];
}

describe('migration 0024_ledger_id', () => {
  it('gives existing users unique v4 ledger ids and keeps their rows', () => {
    run(before0024());
    for (const id of ['u1', 'u2', 'u3']) {
      sqlite
        .prepare(
          `INSERT INTO users (id, name, email, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, id, `${id}@example.test`, at, at);
    }
    sqlite
      .prepare(
        `INSERT INTO accounts
           (id, user_id, name, kind, system_role, currency, created_at, updated_at)
         VALUES ('sys1', 'u1', 'Expenses:USD', 'expense', 'expenses', 'USD', ?, ?)`,
      )
      .run(at, at);
    const idsBefore = {
      categories: names('SELECT id FROM categories ORDER BY id'),
      pools: names('SELECT id FROM pools ORDER BY id'),
      budgets: names('SELECT id FROM budgets ORDER BY id'),
      amounts: names('SELECT id FROM budget_amounts ORDER BY id'),
    };
    expect(idsBefore.categories).toHaveLength(17 * 3);
    expect(idsBefore.pools).toHaveLength(6);

    expect(run(repoMigrations)).toEqual([
      '0024_ledger_id',
      '0025_withdrawal_links',
    ]);

    const ledgerIds = names('SELECT ledger_id FROM users ORDER BY id');
    expect(ledgerIds).toHaveLength(3);
    expect(new Set(ledgerIds).size).toBe(3);
    for (const id of ledgerIds) {
      expect(isUuid(id)).toBe(true);
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
    expect({
      categories: names('SELECT id FROM categories ORDER BY id'),
      pools: names('SELECT id FROM pools ORDER BY id'),
      budgets: names('SELECT id FROM budgets ORDER BY id'),
      amounts: names('SELECT id FROM budget_amounts ORDER BY id'),
    }).toEqual(idsBefore);
    expect(names('SELECT id FROM accounts')).toEqual(['sys1']);
  });

  it('drops the seed triggers, so a plain user insert seeds nothing', () => {
    run(repoMigrations);
    expect(
      names(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'users_seed_%'",
      ),
    ).toEqual([]);
    sqlite
      .prepare(
        `INSERT INTO users (id, name, email, ledger_id, created_at, updated_at)
         VALUES ('u1', 'u1', 'u1@example.test', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', ?, ?)`,
      )
      .run(at, at);
    expect(names('SELECT id FROM categories')).toEqual([]);
    expect(names('SELECT id FROM pools')).toEqual([]);
    expect(names('SELECT id FROM budgets')).toEqual([]);
  });

  it('refuses a duplicate ledger id', () => {
    run(repoMigrations);
    const insert = sqlite.prepare(
      `INSERT INTO users (id, name, email, ledger_id, created_at, updated_at)
       VALUES (?, ?, ?, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', ?, ?)`,
    );
    insert.run('u1', 'u1', 'u1@example.test', at, at);
    expect(() => insert.run('u2', 'u2', 'u2@example.test', at, at)).toThrow(
      /UNIQUE/,
    );
  });
});
