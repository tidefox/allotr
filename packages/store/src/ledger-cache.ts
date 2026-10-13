import {
  sql,
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryResult,
  type RootOperationNode,
  type TransactionSettings,
} from 'kysely';
import type { Db } from './store.ts';

// A user's loaded ledger is the same until something writes, so the store
// keeps it between requests instead of rebuilding it from the database on
// every one of them. The cache is correct by construction rather than by
// every write function remembering to invalidate it:
//
// - It lives in the Kysely dialect (`withLedgerCache`), so it belongs to one
//   Kysely instance and sees every statement that instance runs, from the
//   API, imports, the scheduler or raw SQL. A Kysely plugin would see the
//   same query nodes but never a transaction's begin, commit or rollback,
//   which decide what may be cached, so the wrapper sits at the driver.
// - One write generation counts every statement that is not plainly a read.
//   Anything cached under an older generation is dropped. It is global to the
//   instance, not per user: writes are rare next to reads and a per-user
//   generation would have to parse user ids out of statements.
// - A transaction that has written is not cached from or served from: its
//   reads see rows that may still roll back. Only reads in a transaction
//   that has not written (or outside one) fill the cache, and those see
//   committed state, because the one SQLite connection serialises writers.
//   The generation is bumped again at commit and rollback.
// - A load that overlaps a write (generation changed while it ran) is
//   returned to its caller but never cached.
// - Writes made through another connection to the same file (a second
//   process, a test that opens the file again) change SQLite's
//   `data_version`, which every lookup compares; a change drops the cache.
//
// Nothing cached depends on "now": projections take it separately. Cached
// values are typed read-only, and with `freeze` they are also deeply frozen
// so a caller that mutates one fails loudly instead of corrupting the next
// request (development and tests). Frozen arrays are on a slow path in V8
// (flatMap over a frozen 5k-entry ledger made the figures three times
// slower), so production leaves `freeze` off. Without the wrapper, nothing
// is cached.

export type LedgerCacheOptions = Readonly<{
  /** How many users' ledgers to keep, least recently used out first. */
  maxUsers?: number;
  /** Deep-freeze cached values to catch callers that mutate them. */
  freeze?: boolean;
}>;

export const defaultCacheUsers = 4;

type Slot = 'chart' | 'ledger' | 'view';

type Entry = Partial<Record<Slot, { key: unknown; value: unknown }>>;

type Stamp = Readonly<{ generation: number; dataVersion: number }>;

type CacheState = {
  generation: number;
  inTransaction: boolean;
  transactionWrote: boolean;
  readonly maxUsers: number;
  readonly freeze: boolean;
  readonly users: Map<string, Entry>;
  /** What the cached entries were loaded under. */
  stamp: Stamp | null;
};

const states = new WeakMap<DialectAdapter, CacheState>();

const writeWord =
  /\b(insert|update|delete|replace|create|drop|alter|pragma|attach|detach|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release)\b/i;

const dataVersionSql = 'pragma data_version';

function isDataVersion(query: CompiledQuery): boolean {
  return query.sql.trim().toLowerCase() === dataVersionSql;
}

function isReadNode(node: RootOperationNode, text: string): boolean {
  if (node.kind === 'RawNode') {
    // Raw SQL is a read only when it starts with select (or a CTE that
    // leads to one) and names no write keyword anywhere, even in a string.
    return /^\s*(select|with)\b/i.test(text) && !writeWord.test(text);
  }
  if (node.kind !== 'SelectQueryNode') return false;
  const withNode = (node as { with?: { expressions: readonly unknown[] } })
    .with;
  return (withNode?.expressions ?? []).every((cte) => {
    const body = (cte as { expression?: { kind?: string } }).expression;
    return body?.kind === 'SelectQueryNode';
  });
}

/**
 * Whether a statement is plainly a read. Everything else, including raw SQL
 * that is not obviously a select, counts as a write.
 */
export function isReadQuery(query: CompiledQuery): boolean {
  return isDataVersion(query) || isReadNode(query.query, query.sql);
}

function noteWrite(state: CacheState): void {
  state.generation += 1;
  if (state.inTransaction) state.transactionWrote = true;
}

function wrapConnection(
  connection: DatabaseConnection,
  state: CacheState,
): DatabaseConnection {
  return {
    async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
      if (isReadQuery(query)) return connection.executeQuery<R>(query);
      // Bumped before and after: a statement that throws may still have
      // changed rows, and a reader that stamped in between must not cache.
      noteWrite(state);
      try {
        return await connection.executeQuery<R>(query);
      } finally {
        noteWrite(state);
      }
    },
    async *streamQuery<R>(
      query: CompiledQuery,
      chunkSize: number,
    ): AsyncIterableIterator<QueryResult<R>> {
      const read = isReadQuery(query);
      if (!read) noteWrite(state);
      try {
        yield* connection.streamQuery<R>(query, chunkSize);
      } finally {
        if (!read) noteWrite(state);
      }
    },
  };
}

function wrapDriver(driver: Driver, state: CacheState): Driver {
  // Kysely hands a connection back to begin, commit and rollback; those
  // must get the real one, whose own control statements are not writes.
  const raw = new WeakMap<DatabaseConnection, DatabaseConnection>();
  return {
    init: () => driver.init(),
    destroy: () => driver.destroy(),
    async acquireConnection() {
      const connection = await driver.acquireConnection();
      const wrapped = wrapConnection(connection, state);
      raw.set(wrapped, connection);
      return wrapped;
    },
    async beginTransaction(
      connection: DatabaseConnection,
      settings: TransactionSettings,
    ) {
      await driver.beginTransaction(
        raw.get(connection) ?? connection,
        settings,
      );
      state.inTransaction = true;
      state.transactionWrote = false;
    },
    async commitTransaction(connection: DatabaseConnection) {
      try {
        await driver.commitTransaction(raw.get(connection) ?? connection);
      } finally {
        endTransaction(state);
      }
    },
    async rollbackTransaction(connection: DatabaseConnection) {
      try {
        await driver.rollbackTransaction(raw.get(connection) ?? connection);
      } finally {
        endTransaction(state);
      }
    },
    releaseConnection: (connection: DatabaseConnection) =>
      driver.releaseConnection(raw.get(connection) ?? connection),
  };
}

function endTransaction(state: CacheState): void {
  if (state.transactionWrote) state.generation += 1;
  state.inTransaction = false;
  state.transactionWrote = false;
}

/** The dialect with a per-user ledger cache that every write invalidates. */
export function withLedgerCache(
  dialect: Dialect,
  options: LedgerCacheOptions = {},
): Dialect {
  const state: CacheState = {
    generation: 0,
    inTransaction: false,
    transactionWrote: false,
    maxUsers: Math.max(0, options.maxUsers ?? defaultCacheUsers),
    freeze: options.freeze ?? false,
    users: new Map(),
    stamp: null,
  };
  return {
    createDriver: () => wrapDriver(dialect.createDriver(), state),
    createQueryCompiler: () => dialect.createQueryCompiler(),
    createAdapter: () => {
      const adapter = dialect.createAdapter();
      states.set(adapter, state);
      return adapter;
    },
    createIntrospector: (db: Kysely<unknown>) => dialect.createIntrospector(db),
  };
}

function stateOf(db: Db): CacheState | undefined {
  return states.get(db.getExecutor().adapter);
}

/** How many writes this instance has seen; for tests. */
export function writeGeneration(db: Db): number | null {
  return stateOf(db)?.generation ?? null;
}

/** Drops everything cached for this instance. */
export function clearLedgerCache(db: Db): void {
  const state = stateOf(db);
  if (state === undefined) return;
  state.users.clear();
  state.stamp = null;
}

async function stampOf(db: Db, state: CacheState): Promise<Stamp> {
  const { rows } = await sql<{
    data_version: number;
  }>`PRAGMA data_version`.execute(db);
  return {
    generation: state.generation,
    dataVersion: rows[0]?.data_version ?? 0,
  };
}

function same(a: Stamp | null, b: Stamp): boolean {
  return (
    a !== null &&
    a.generation === b.generation &&
    a.dataVersion === b.dataVersion
  );
}

/** Freezes arrays and plain objects, and makes maps and sets read-only. */
export function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.isFrozen(value) ||
    seen.has(value)
  ) {
    return value;
  }
  seen.add(value);
  if (value instanceof Map || value instanceof Set) {
    const refuse = () => {
      throw new TypeError('A cached ledger value is read-only.');
    };
    const frozen = value as unknown as Record<string, unknown>;
    for (const method of ['set', 'add', 'delete', 'clear']) {
      if (method in value) {
        Object.defineProperty(frozen, method, { value: refuse });
      }
    }
    const parts: unknown[] = [...value.values()];
    for (const part of parts) deepFreeze(part, seen);
    return Object.freeze(value);
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    return value;
  }
  for (const part of Object.values(value)) deepFreeze(part, seen);
  return Object.freeze(value);
}

/**
 * Returns the slot's cached value for this user, or loads, freezes and
 * caches it. `key` tells apart values built from different inputs: a hit
 * needs the same key (by identity).
 */
export async function cachedLoad<T>(
  db: Db,
  userId: string,
  slot: Slot,
  key: unknown,
  load: () => Promise<T>,
): Promise<T> {
  const state = stateOf(db);
  if (state === undefined || state.maxUsers === 0) return load();
  const before = await stampOf(db, state);
  // Reads after a write in an open transaction see rows that may roll back.
  // Checked after the stamp: a caller outside a transaction waits for the
  // open one to end before the stamp is read.
  if (state.inTransaction && state.transactionWrote) return load();
  if (!same(state.stamp, before)) {
    state.users.clear();
    state.stamp = before;
  }
  const entry = state.users.get(userId);
  const hit = entry?.[slot];
  if (hit !== undefined && hit.key === key) {
    // Most recently used goes last.
    state.users.delete(userId);
    state.users.set(userId, entry ?? {});
    return hit.value as T;
  }
  const value = await load();
  if (state.inTransaction && state.transactionWrote) return value;
  const after = await stampOf(db, state);
  if (!same(before, after) || !same(state.stamp, after)) return value;
  const frozen = state.freeze ? deepFreeze(value) : value;
  const kept = state.users.get(userId) ?? {};
  kept[slot] = { key, value: frozen };
  state.users.delete(userId);
  state.users.set(userId, kept);
  while (state.users.size > state.maxUsers) {
    const oldest = state.users.keys().next();
    if (oldest.done === true) break;
    state.users.delete(oldest.value);
  }
  return frozen;
}
