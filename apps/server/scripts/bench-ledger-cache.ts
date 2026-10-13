// Times a warm /v1/today (the store's `todayFigures`) with the ledger cache
// off and on, over a synthetic ledger of made-up entries.
//
//   node scripts/bench-ledger-cache.ts [entries ...]   (default: 5000 50000)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { addDays, bundleSchema, localDate } from '@allotr/shared';
import { importBundle, todayFigures } from '@allotr/store';
import { migrate } from '../src/db/migrate.ts';
import { createKysely, openSqlite } from '../src/db/sqlite.ts';
import { insertUser, repoMigrations } from '../src/testing/database.ts';

// As in the production image, where cached values are not frozen.
process.env.NODE_ENV ??= 'production';

const counts = process.argv.slice(2).map(Number);
const now = new Date('2027-06-15T12:00:00Z');
const start = localDate('2025-06-01');
const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });

function synthetic(entries: number) {
  let seed = 12345;
  const next = (max: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed % max;
  };
  const transactions = Array.from({ length: entries }, (_, i) => {
    const occurredOn = addDays(start, Math.floor((i * 700) / entries));
    return i % 15 === 0
      ? {
          kind: 'income',
          account: 'Wallet',
          amount: eur(200_000 + next(50_000)),
          category: 'Salary',
          occurredOn,
        }
      : {
          kind: 'expense',
          account: i % 3 === 0 ? 'Card' : 'Wallet',
          amount: eur(100 + next(9_000)),
          category: ['Food/Coffee', 'Food/Groceries', 'Fun'][next(3)],
          occurredOn,
        };
  });
  return bundleSchema.parse({
    format: 'allotr.bundle',
    version: 1,
    settings: { timeZone: 'UTC', defaultCurrency: 'EUR', paydayDay: 25 },
    categories: [
      { name: 'Salary', kind: 'income', isPaycheck: true },
      { name: 'Coffee', parent: 'Food' },
      { name: 'Groceries', parent: 'Food' },
      { name: 'Fun' },
    ],
    accounts: [
      { name: 'Wallet', currency: 'EUR', openedOn: start },
      { name: 'Card', currency: 'EUR', openedOn: start },
    ],
    transactions,
  });
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

for (const entries of counts.length > 0 ? counts : [5_000, 50_000]) {
  const dir = mkdtempSync(join(tmpdir(), 'allotr-bench-'));
  const path = join(dir, 'bench.db');
  const sqlite = openSqlite(path);
  migrate({
    sqlite,
    databasePath: path,
    migrationsDir: repoMigrations,
    backupDir: join(dir, 'backups'),
    now: () => new Date(0),
  });
  const cached = createKysely(sqlite);
  const plain = createKysely(sqlite, { maxUsers: 0 });
  await insertUser(cached, 'bench');
  await importBundle(cached, 'bench', synthetic(entries), now);

  const time = async (db: typeof cached, runs: number) => {
    await todayFigures(db, 'bench', now); // warm-up (and fills the cache)
    const samples: number[] = [];
    for (let i = 0; i < runs; i++) {
      const began = performance.now();
      await todayFigures(db, 'bench', now);
      samples.push(performance.now() - began);
    }
    return median(samples) ?? 0;
  };
  const off = await time(plain, 7);
  const on = await time(cached, 7);
  console.log(
    `${String(entries)} entries: cache off ${String(Math.round(off))} ms, on ${String(Math.round(on))} ms (median of 7 warm calls)`,
  );
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
}
