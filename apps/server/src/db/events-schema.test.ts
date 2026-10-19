import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoMigrations } from '../testing/database.ts';
import { migrate } from './migrate.ts';
import { openSqlite } from './sqlite.ts';
import type Database from 'better-sqlite3';

// migrations/0026_events.sql against real SQLite: it applies to a database
// that already holds data, and the table enforces the envelope's keys.

const at = '2026-01-01T00:00:00.000Z';
const ledger = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

let dir: string;
let sqlite: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'allotr-events-'));
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

function before0026(): string {
  const target = join(dir, 'migrations-0025');
  mkdirSync(target);
  for (const name of readdirSync(repoMigrations)) {
    if (name.endsWith('.sql') && name < '0026') {
      copyFileSync(join(repoMigrations, name), join(target, name));
    }
  }
  return target;
}

function insertEvent(values: {
  id: string;
  seq: number;
  author?: string;
  payload?: string;
  user?: string;
  ledgerId?: string;
}) {
  sqlite
    .prepare(
      `INSERT INTO events
         (event_id, user_id, ledger_id, author, seq, hlc, schema, enc, type, payload)
       VALUES (?, ?, ?, ?, ?, '000000000001-0000-server', 1, NULL, 'transaction.recorded', ?)`,
    )
    .run(
      values.id,
      values.user ?? 'u1',
      values.ledgerId ?? ledger,
      values.author ?? 'server',
      values.seq,
      values.payload ?? '{}',
    );
}

describe('migration 0026_events', () => {
  it('applies after existing data and leaves it alone', () => {
    run(before0026());
    sqlite
      .prepare(
        `INSERT INTO users (id, name, email, ledger_id, created_at, updated_at)
         VALUES ('u1', 'u1', 'u1@example.test', ?, ?, ?)`,
      )
      .run(ledger, at, at);
    expect(run(repoMigrations)).toContain('0026_events');
    expect(sqlite.prepare('SELECT count(*) FROM users').pluck().get()).toBe(1);
    expect(sqlite.prepare('SELECT count(*) FROM events').pluck().get()).toBe(0);
  });

  describe('the table', () => {
    beforeEach(() => {
      run(repoMigrations);
      sqlite
        .prepare(
          `INSERT INTO users (id, name, email, ledger_id, created_at, updated_at)
           VALUES ('u1', 'u1', 'u1@example.test', ?, ?, ?)`,
        )
        .run(ledger, at, at);
    });

    it('keeps one event id and one seq per author and ledger', () => {
      insertEvent({ id: 'e1', seq: 1 });
      expect(() => {
        insertEvent({ id: 'e1', seq: 2 });
      }).toThrow(/UNIQUE/);
      expect(() => {
        insertEvent({ id: 'e2', seq: 1 });
      }).toThrow(/UNIQUE/);
      insertEvent({ id: 'e3', seq: 1, author: 'phone' });
      insertEvent({
        id: 'e4',
        seq: 1,
        ledgerId: '2ed6657d-e927-568b-95e1-2665a8aea6a2',
      });
    });

    it('rejects a seq below one, a payload that is not JSON and an enc value', () => {
      expect(() => {
        insertEvent({ id: 'e1', seq: 0 });
      }).toThrow(/CHECK/);
      expect(() => {
        insertEvent({ id: 'e1', seq: 1, payload: '{' });
      }).toThrow(/CHECK/);
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO events
               (event_id, user_id, ledger_id, author, seq, hlc, schema, enc, type, payload)
             VALUES ('e9', 'u1', ?, 'server', 9, 'h', 1, 'x', 't', '{}')`,
          )
          .run(ledger),
      ).toThrow(/CHECK/);
    });

    it('is append-only while the user exists, and goes with the user', () => {
      insertEvent({ id: 'e1', seq: 1 });
      expect(() =>
        sqlite.prepare(`UPDATE events SET type = 'x'`).run(),
      ).toThrow(/append-only/);
      expect(() => sqlite.prepare('DELETE FROM events').run()).toThrow(
        /append-only/,
      );
      sqlite.prepare(`DELETE FROM users WHERE id = 'u1'`).run();
      expect(sqlite.prepare('SELECT count(*) FROM events').pluck().get()).toBe(
        0,
      );
    });
  });
});
