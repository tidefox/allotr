import { SqliteDialect } from 'kysely';
import type { Database as SqlJsDatabase } from 'sql.js';

// Adapts a sql.js database to the better-sqlite3 subset that Kysely's
// SqliteDialect uses (prepare -> reader/all/run/iterate, close).
interface SqliteStatement {
  readonly reader: boolean;
  all(parameters: readonly unknown[]): unknown[];
  run(parameters: readonly unknown[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  iterate(parameters: readonly unknown[]): IterableIterator<unknown>;
}

interface SqliteDatabase {
  close(): void;
  prepare(sql: string): SqliteStatement;
}

type Bind = (number | string | Uint8Array | null)[];

function bindable(parameters: readonly unknown[]): Bind {
  return parameters.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'bigint') return Number(p);
    return p as number | string | Uint8Array;
  });
}

export function sqlJsAdapter(db: SqlJsDatabase): SqliteDatabase {
  return {
    close: () => {
      db.close();
    },
    prepare(sql) {
      const stmt = db.prepare(sql);
      const reader = stmt.getColumnNames().length > 0;
      // sql.js statements hold wasm memory until freed; Kysely uses each
      // prepared statement exactly once.
      const rows = (parameters: readonly unknown[]): unknown[] => {
        try {
          stmt.bind(bindable(parameters));
          const out: unknown[] = [];
          while (stmt.step()) out.push(stmt.getAsObject());
          return out;
        } finally {
          stmt.free();
        }
      };
      return {
        reader,
        all: rows,
        run(parameters) {
          try {
            stmt.run(bindable(parameters));
          } finally {
            stmt.free();
          }
          return { changes: db.getRowsModified(), lastInsertRowid: 0 };
        },
        iterate: (parameters) => rows(parameters)[Symbol.iterator](),
      };
    },
  };
}

export function sqlJsDialect(db: SqlJsDatabase): SqliteDialect {
  return new SqliteDialect({ database: sqlJsAdapter(db) });
}
