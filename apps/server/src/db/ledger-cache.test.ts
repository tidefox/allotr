import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cachedLoad,
  isReadQuery,
  writeGeneration,
  type DB,
} from '@allotr/store';
import { createKysely, openSqlite } from './sqlite.ts';

// The ledger cache's invalidation rule (packages/store/src/ledger-cache.ts):
// every statement that is not plainly a read bumps the write generation, and
// what was loaded under an older generation is never served. Uses a scratch
// table, made-up values and a real SQLite driver.

type Scratch = { t: { id: number; n: number } };
type Handle = Kysely<DB & Scratch>;

let dir: string;
let path: string;
let db: Handle;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'allotr-cache-'));
  path = join(dir, 'cache.db');
  db = createKysely(openSqlite(path));
  await sql`CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)`.execute(
    db,
  );
});

afterEach(async () => {
  await db.destroy();
  rmSync(dir, { recursive: true, force: true });
});

function generation(handle: Handle = db): number {
  const value = writeGeneration(handle);
  if (value === null) throw new Error('no cache on this instance');
  return value;
}

async function bumps(run: () => Promise<unknown>): Promise<boolean> {
  const before = generation();
  await run();
  return generation() > before;
}

/** Loads the row count through the cache; `loads` counts real loads. */
function counter() {
  const loads = { n: 0 };
  const load = (handle: Handle = db) =>
    cachedLoad(handle, 'u1', 'chart', null, async () => {
      loads.n += 1;
      const { rows } = await sql<{
        n: number;
      }>`SELECT count(*) AS n FROM t`.execute(handle);
      return { count: rows[0]?.n ?? 0 };
    });
  return { loads, load };
}

describe('write generation', () => {
  it('bumps on insert, update and delete', async () => {
    expect(
      await bumps(() => db.insertInto('t').values({ id: 1, n: 1 }).execute()),
    ).toBe(true);
    expect(await bumps(() => db.updateTable('t').set({ n: 2 }).execute())).toBe(
      true,
    );
    expect(await bumps(() => db.deleteFrom('t').execute())).toBe(true);
  });

  it('bumps on an upsert, a returning write and a write in a CTE', async () => {
    const insert = db.insertInto('t').values({ id: 1, n: 1 });
    expect(
      await bumps(() =>
        insert
          .onConflict((oc) => oc.column('id').doUpdateSet({ n: 5 }))
          .execute(),
      ),
    ).toBe(true);
    expect(
      await bumps(() =>
        db.updateTable('t').set({ n: 6 }).returning('id').execute(),
      ),
    ).toBe(true);
    // SQLite refuses a write in a CTE, but other dialects allow it, so it
    // counts as a write whatever the engine does with it.
    const cte = db
      .with('gone', (qb) => qb.deleteFrom('t').returning('id'))
      .selectFrom('gone')
      .selectAll()
      .compile();
    expect(isReadQuery(cte)).toBe(false);
  });

  it('bumps on raw SQL that is not plainly a read, and on schema changes', async () => {
    expect(await bumps(() => sql`UPDATE t SET n = 3`.execute(db))).toBe(true);
    expect(await bumps(() => sql`  delete from t`.execute(db))).toBe(true);
    expect(await bumps(() => sql`PRAGMA user_version = 4`.execute(db))).toBe(
      true,
    );
    expect(
      await bumps(() => sql`SELECT 1 WHERE 'delete' = ''`.execute(db)),
    ).toBe(true);
    expect(
      await bumps(() => sql`CREATE TABLE u (id INTEGER)`.execute(db)),
    ).toBe(true);
    expect(await bumps(() => db.schema.dropTable('u').execute())).toBe(true);
  });

  it('does not bump on reads', async () => {
    await db.insertInto('t').values({ id: 1, n: 1 }).execute();
    expect(await bumps(() => db.selectFrom('t').selectAll().execute())).toBe(
      false,
    );
    expect(await bumps(() => sql`SELECT 1`.execute(db))).toBe(false);
    expect(
      await bumps(() => sql`WITH x AS (SELECT 1) SELECT * FROM x`.execute(db)),
    ).toBe(false);
    expect(
      await bumps(() =>
        db
          .with('x', (qb) => qb.selectFrom('t').selectAll())
          .selectFrom('x')
          .selectAll()
          .execute(),
      ),
    ).toBe(false);
    // The cache's own version probe is a read too.
    const { load } = counter();
    expect(await bumps(() => load())).toBe(false);
  });

  it('classifies compiled queries', () => {
    const read = db.selectFrom('t').selectAll().compile();
    const write = db.deleteFrom('t').compile();
    expect(isReadQuery(read)).toBe(true);
    expect(isReadQuery(write)).toBe(false);
  });
});

describe('transactions', () => {
  it('bumps for a rolled-back write and never caches what it saw', async () => {
    const { loads, load } = counter();
    expect(await load()).toEqual({ count: 0 });
    const before = generation();
    await expect(
      db.transaction().execute(async (trx) => {
        await trx.insertInto('t').values({ id: 1, n: 1 }).execute();
        // Sees its own uncommitted row, and must not keep it.
        expect(await load(trx)).toEqual({ count: 1 });
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(generation()).toBeGreaterThan(before);
    expect(await load()).toEqual({ count: 0 });
    expect(await load()).toEqual({ count: 0 });
    expect(loads.n).toBe(3);
  });

  it('serves the cache again after a commit reloads it', async () => {
    const { loads, load } = counter();
    await db.transaction().execute(async (trx) => {
      await trx.insertInto('t').values({ id: 1, n: 1 }).execute();
    });
    expect(await load()).toEqual({ count: 1 });
    expect(await load()).toEqual({ count: 1 });
    expect(loads.n).toBe(1);
  });

  it('caches reads in a transaction that has not written', async () => {
    const { loads, load } = counter();
    await db.transaction().execute(async (trx) => {
      await load(trx);
    });
    const before = generation();
    await load();
    expect(loads.n).toBe(1);
    expect(generation()).toBe(before);
  });

  it('does not cache a load that a write overlapped', async () => {
    const { loads } = counter();
    const value = await cachedLoad(
      db as Kysely<DB>,
      'u1',
      'chart',
      null,
      async () => {
        loads.n += 1;
        const { rows } = await sql<{
          n: number;
        }>`SELECT count(*) AS n FROM t`.execute(db);
        await db.insertInto('t').values({ id: 9, n: 9 }).execute();
        return { count: rows[0]?.n ?? 0 };
      },
    );
    expect(value).toEqual({ count: 0 });
    const again = await cachedLoad(
      db as Kysely<DB>,
      'u1',
      'chart',
      null,
      () => {
        loads.n += 1;
        return Promise.resolve({ count: 1 });
      },
    );
    expect(again).toEqual({ count: 1 });
    expect(loads.n).toBe(2);
  });
});

describe('writes outside the instance', () => {
  it('are noticed through the database file', async () => {
    const { loads, load } = counter();
    expect(await load()).toEqual({ count: 0 });
    const other: Handle = createKysely(openSqlite(path));
    await other.insertInto('t').values({ id: 1, n: 1 }).execute();
    await other.destroy();
    expect(await load()).toEqual({ count: 1 });
    expect(loads.n).toBe(2);
  });
});

describe('cached values', () => {
  it('are frozen, maps and sets included', async () => {
    const value = await cachedLoad(db as Kysely<DB>, 'u1', 'view', null, () =>
      Promise.resolve({
        list: [{ id: 'a' }],
        map: new Map([['k', { n: 1 }]]),
        set: new Set(['x']),
      }),
    );
    expect(() => {
      (value.list as unknown[]).push({});
    }).toThrow(TypeError);
    expect(() => {
      (value.list[0] as { id: string }).id = 'b';
    }).toThrow(TypeError);
    expect(() => value.map.set('j', { n: 2 })).toThrow(TypeError);
    expect(() => value.set.add('y')).toThrow(TypeError);
    expect(() => value.map.delete('k')).toThrow(TypeError);
    expect(value.map.get('k')).toEqual({ n: 1 });
  });

  it('are kept for a bounded number of users, least recently used out', async () => {
    const small = createKysely(openSqlite(':memory:'), { maxUsers: 2 });
    let loads = 0;
    const load = (user: string) =>
      cachedLoad(small, user, 'chart', null, () => {
        loads += 1;
        return Promise.resolve({ user });
      });
    await load('a');
    await load('b');
    await load('a');
    await load('c');
    expect(loads).toBe(3);
    await load('a');
    expect(loads).toBe(3);
    await load('b');
    expect(loads).toBe(4);
    await small.destroy();
  });

  it('are not kept when the cache is switched off', async () => {
    const off = createKysely(openSqlite(':memory:'), { maxUsers: 0 });
    let loads = 0;
    const load = () =>
      cachedLoad(off, 'a', 'chart', null, () => {
        loads += 1;
        return Promise.resolve({});
      });
    await load();
    await load();
    expect(loads).toBe(2);
    await off.destroy();
  });
});
