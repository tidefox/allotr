// The in-process Allotr server: sql.js database, migrations, the ledger
// cache, and the real Hono app answering `fetch(Request)` with no network.
import { payeeKey } from '@allotr/core';
import { seedLedger, withLedgerCache, type DB } from '@allotr/store';
import { Kysely, SqliteDialect } from 'kysely';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import sqlJsFactory from 'sql.js/dist/sql-wasm-browser.js';
import wasmBase64 from 'virtual:wasm';
import { migrations } from 'virtual:migrations';
import { createApp } from '../../../apps/server/src/http/app.ts';
import { sqlJsAdapter } from './sqljs-dialect.ts';
import { sha256Hex } from './sha256.ts';
import type { BlobStore } from './blob-store.ts';

export const API_ORIGIN = 'https://allotr.invalid';
export const LOCAL_USER = {
  id: 'local-user',
  name: 'Local user',
  email: 'local@allotr.invalid',
  role: 'admin' as const,
  twoFactorEnabled: true,
};

const now = () => performance.now();

export interface Timings {
  wasmMs?: number;
  migrationsMs?: number;
  migrationsApplied?: number;
  openFromBlobMs?: number;
  blobReadMs?: number;
  buildAppMs?: number;
  firstTodayMs?: number;
  warmTodayMs?: number;
  lastExportMs?: number;
  lastSaveMs?: number;
  lastSaveBytes?: number;
}

// --- sql.js module (loaded once per page) -----------------------------------

let sqlModule: Promise<{ SQL: SqlJsStatic; ms: number }> | undefined;

function decodeBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Always hands sql.js the wasm bytes (`wasmBinary`), never a URL: nothing is
 * fetched, and Emscripten's Node-vs-browser detection is never consulted.
 */
export function loadSql(): Promise<{ SQL: SqlJsStatic; ms: number }> {
  sqlModule ??= (async () => {
    const t0 = now();
    const wasmBinary = decodeBase64(wasmBase64);
    const SQL = await (sqlJsFactory as typeof initSqlJs)({
      wasmBinary: wasmBinary.buffer as ArrayBuffer,
    });
    return { SQL, ms: now() - t0 };
  })();
  return sqlModule;
}

// --- database setup ---------------------------------------------------------

/** Functions and PRAGMAs a sql.js connection loses whenever export() runs. */
function prepareConnection(sqlite: Database): void {
  sqlite.create_function('payee_key', (note: unknown) =>
    payeeKey(typeof note === 'string' ? note : null),
  );
  sqlite.run('PRAGMA foreign_keys = ON');
}

/** Applies only the migrations the database has not seen (same rules as the server). */
function migrate(sqlite: Database): { applied: number } {
  sqlite.run('BEGIN IMMEDIATE');
  try {
    sqlite.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL
    ) STRICT`);
    const applied = new Map<string, string>();
    for (const row of sqlite.exec('SELECT version, checksum FROM schema_migrations')[0]
      ?.values ?? [])
      applied.set(String(row[0]), String(row[1]));
    const known = new Set(migrations.map((m) => m.name.replace(/\.sql$/, '')));
    for (const version of applied.keys())
      if (!known.has(version))
        throw new Error(
          `The database has migration ${version}, which this build does not know (written by a newer version).`,
        );
    let count = 0;
    for (const m of migrations) {
      const version = m.name.replace(/\.sql$/, '');
      const checksum = sha256Hex(m.sql);
      const previous = applied.get(version);
      if (previous !== undefined) {
        if (previous !== checksum)
          throw new Error(`Migration ${version} changed after it was applied.`);
        continue;
      }
      sqlite.exec(m.sql);
      sqlite.run('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)', [
        version,
        checksum,
        new Date().toISOString(),
      ]);
      count++;
    }
    sqlite.run('COMMIT');
    return { applied: count };
  } catch (error) {
    try {
      sqlite.run('ROLLBACK');
    } catch {
      // nothing open
    }
    throw error;
  }
}

// --- the runtime ------------------------------------------------------------

export interface RuntimeOptions {
  store: BlobStore;
  /** Debounce for saving after a write (ms). */
  saveDelayMs?: number;
  log?: (message: string) => void;
}

export class Runtime {
  readonly timings: Timings = {};
  readonly sqlite: Database;
  readonly db: Kysely<DB>;
  readonly app: { fetch(request: Request): Response | Promise<Response> };
  /** Shared by every view of this runtime (set by the mount code). */
  shared: Record<string, unknown> = {};
  dbBytes = 0;
  lastError: string | null = null;
  /** Number of API requests currently running; a save waits for zero. */
  private inflight = 0;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> = Promise.resolve();
  private closed = false;
  private listeners = new Set<() => void>();

  private constructor(
    private readonly options: RuntimeOptions,
    sqlite: Database,
  ) {
    this.sqlite = sqlite;
    const adapter = sqlJsAdapter(sqlite);
    // Same wrapper the server installs in db/sqlite.ts createKysely.
    this.db = new Kysely<DB>({
      dialect: withLedgerCache(new SqliteDialect({ database: adapter }), {
        freeze: false,
      }),
    });
    const logger = {
      info: () => undefined,
      debug: () => undefined,
      warn: () => undefined,
      error: (...args: unknown[]) => options.log?.(`server error: ${args.map(describeLogArg).join(' ')}`),
      child: () => logger,
    };
    this.app = createApp({
      db: this.db,
      auth: authStub(),
      config: {
        baseUrl: API_ORIGIN,
        trustedProxies: [],
        databasePath: ':memory:',
      },
      limits: {},
      logger,
      now: () => new Date(),
      push: {},
    } as never);
  }

  /** Opens the vault's database from its stored blob, or creates a fresh one. */
  static async open(options: RuntimeOptions): Promise<Runtime> {
    const { SQL, ms: wasmMs } = await loadSql();
    const r0 = now();
    const blob = await options.store.load();
    const blobReadMs = now() - r0;
    const o0 = now();
    const sqlite = blob === null ? new SQL.Database() : new SQL.Database(blob);
    prepareConnection(sqlite);
    const openMs = now() - o0;
    const m0 = now();
    const { applied } = migrate(sqlite);
    const migrationsMs = now() - m0;
    const b0 = now();
    const runtime = new Runtime(options, sqlite);
    await ensureLocalUser(runtime.db);
    Object.assign(runtime.timings, {
      wasmMs,
      blobReadMs: blob === null ? undefined : blobReadMs,
      openFromBlobMs: blob === null ? undefined : openMs,
      migrationsMs,
      migrationsApplied: applied,
      buildAppMs: now() - b0,
    });
    runtime.dbBytes = blob?.length ?? 0;
    // A first run (or a migration) is worth keeping straight away.
    if (blob === null || applied > 0) runtime.markDirty();
    return runtime;
  }

  /** The API transport handed to the web app. Never replaces window.fetch. */
  readonly fetch: typeof fetch = async (input, init) => {
    if (this.closed) throw new TypeError('Allotr runtime is closed');
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      API_ORIGIN,
    );
    const method = (init?.method ?? 'GET').toUpperCase();
    this.inflight++;
    const t0 = now();
    try {
      return await this.app.fetch(new Request(url, init));
    } finally {
      if (method === 'GET' && url.pathname === '/v1/today') {
        const ms = now() - t0;
        if (this.timings.firstTodayMs === undefined) this.timings.firstTodayMs = ms;
        else this.timings.warmTodayMs = ms;
      }
      this.inflight--;
      if (method !== 'GET' && method !== 'HEAD') this.markDirty();
    }
  };

  /** Runs work that touches the database outside the API (a save waits for it), then saves. */
  async exclusive<T>(work: () => Promise<T>, changed: (result: T) => boolean = () => true): Promise<T> {
    if (this.closed) throw new TypeError('Allotr runtime is closed');
    this.inflight++;
    let result: T;
    try {
      result = await work();
    } finally {
      this.inflight--;
    }
    if (changed(result)) this.markDirty();
    return result;
  }

  onSaved(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  markDirty(): void {
    this.dirty = true;
    if (this.options.store === undefined || this.closed) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), this.options.saveDelayMs ?? 1500);
  }

  /** Serialise and store the database now (waits for running requests). */
  flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    this.saving = this.saving.then(() => this.save()).catch((error: unknown) => {
      this.lastError = String(error);
      this.options.log?.(`save failed: ${String(error)}`);
    });
    return this.saving;
  }

  private async save(): Promise<void> {
    if (!this.dirty) return;
    // export() closes and reopens the SQLite connection: a transaction that
    // is awaiting something would be rolled back. Wait until none is running.
    for (let i = 0; this.inflight > 0 && i < 200; i++)
      await new Promise((resolve) => setTimeout(resolve, 25));
    if (this.inflight > 0) {
      this.saveTimer = setTimeout(() => void this.flush(), 500);
      return;
    }
    this.dirty = false;
    const s0 = now();
    const bytes = this.exportBytes();
    const e1 = now();
    await this.options.store.save(bytes);
    this.timings.lastExportMs = e1 - s0;
    this.timings.lastSaveMs = now() - s0;
    this.timings.lastSaveBytes = bytes.length;
    this.dbBytes = bytes.length;
    for (const listener of this.listeners) listener();
  }

  /** export() with the connection state put back afterwards. */
  exportBytes(): Uint8Array {
    const bytes = this.sqlite.export();
    prepareConnection(this.sqlite);
    return bytes;
  }

  /** Timed GET against the in-process API. */
  async get(path: string): Promise<{ ms: number; status: number; bytes: number }> {
    const t0 = now();
    const response = await this.fetch(path, { headers: { accept: 'application/json', 'x-allotr-client': 'web' } });
    const text = await response.text();
    return { ms: now() - t0, status: response.status, bytes: text.length };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    clearTimeout(this.saveTimer);
    await this.flush();
    this.closed = true;
    await this.db.destroy().catch(() => undefined);
    try {
      this.sqlite.close();
    } catch {
      // already closed
    }
  }

  /** For throwaway databases: close without saving. */
  discard(): void {
    this.closed = true;
    clearTimeout(this.saveTimer);
    try {
      this.sqlite.close();
    } catch {
      // already closed
    }
  }

  /** Create a throwaway in-memory runtime (nothing is stored). */
  static async openThrowaway(log?: (m: string) => void): Promise<Runtime> {
    const { noBlobStore } = await import('./blob-store.ts');
    return Runtime.open({ store: noBlobStore, ...(log === undefined ? {} : { log }) });
  }
}

/**
 * The local user and their starter data, as sign-up does on the server: the
 * user and the ledger seed share a transaction. `seedLedger` uses ids derived
 * from the ledger id and skips rows that exist, so it can run again safely.
 * An existing user with no categories at all (created by an earlier build that
 * did not seed) is seeded too; one that has categories is left alone, since
 * starter rows the user deleted must not come back.
 */
async function ensureLocalUser(db: Kysely<DB>): Promise<void> {
  const at = new Date().toISOString();
  await db.transaction().execute(async (trx) => {
    let row = await trx
      .selectFrom('users')
      .select(['ledger_id', 'created_at', 'default_currency'])
      .where('id', '=', LOCAL_USER.id)
      .executeTakeFirst();
    if (row === undefined) {
      await trx
        .insertInto('users')
        .values({
          id: LOCAL_USER.id,
          name: LOCAL_USER.name,
          email: LOCAL_USER.email,
          role: 'admin',
          ledger_id: globalThis.crypto.randomUUID(),
          created_at: at,
          updated_at: at,
        })
        .execute();
      row = await trx
        .selectFrom('users')
        .select(['ledger_id', 'created_at', 'default_currency'])
        .where('id', '=', LOCAL_USER.id)
        .executeTakeFirstOrThrow();
    } else {
      const seeded = await trx
        .selectFrom('categories')
        .select('id')
        .where('user_id', '=', LOCAL_USER.id)
        .limit(1)
        .executeTakeFirst();
      if (seeded !== undefined) return;
      if (row.ledger_id === '') {
        const ledgerId = globalThis.crypto.randomUUID();
        await trx.updateTable('users').set({ ledger_id: ledgerId }).where('id', '=', LOCAL_USER.id).execute();
        row = { ...row, ledger_id: ledgerId };
      }
    }
    await seedLedger(trx, {
      userId: LOCAL_USER.id,
      ledgerId: row.ledger_id,
      createdAt: row.created_at,
      defaultCurrency: row.default_currency,
    });
  });
}

/** One implicit local user: every request is signed in as them. */
function authStub() {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  return {
    api: {
      getSession: () => Promise.resolve({ user: LOCAL_USER, session: { token: 'local' } }),
    },
    handler: (request: Request) => {
      const path = new URL(request.url).pathname.replace('/v1/auth', '');
      if (path === '/get-session')
        return Promise.resolve(json({ session: { token: 'local' }, user: LOCAL_USER }));
      if (path === '/list-sessions') return Promise.resolve(json([]));
      return Promise.resolve(json({ message: 'Not available in local mode.' }, 404));
    },
  };
}

export { sha256Hex };

function describeLogArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === 'object' && arg !== null) {
    const err = (arg as { err?: unknown }).err;
    if (err instanceof Error) return err.stack ?? err.message;
  }
  return String(arg);
}
