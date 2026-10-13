// Synthetic ledger for timing only: made-up payees and amounts, written
// through the real store code path (recordTransaction), into a throwaway DB.
import { money } from '@allotr/shared';
import { insertAccount, recordTransaction, type DB } from '@allotr/store';
import type { Kysely } from 'kysely';
import { LOCAL_USER } from './runtime.ts';

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const payees = [
  'Corner Cafe', 'Fresh Mart', 'City Transit', 'Green Grocer', 'Book Nook',
  'Pixel Cinema', 'Daily Bakery', 'Fuel Stop', 'Home Hardware', 'Noodle House',
  'Pet Supplies', 'Pharmacy One', 'Streaming Co', 'Gym Club', 'Taxi Ride',
];

function isoDay(offsetFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetFromToday);
  return d.toISOString().slice(0, 10);
}

export async function seedSynthetic(
  db: Kysely<DB>,
  count: number,
  onProgress?: (done: number) => void,
): Promise<{ ms: number }> {
  const t0 = performance.now();
  const userId = LOCAL_USER.id;
  const now = new Date();
  const rand = prng(42);
  const rows = await db
    .selectFrom('categories')
    .select(['id', 'kind', 'is_paycheck'])
    .where('user_id', '=', userId)
    .execute();
  const expense = rows.filter((r) => r.kind === 'expense').map((r) => r.id);
  const salary = rows.find((r) => r.kind === 'income' && r.is_paycheck === 1)?.id as string;
  const usd = 'USD' as never;
  const chunk = 500;
  let done = 0;
  let checking = '';
  await db.transaction().execute(async (trx) => {
    checking = await insertAccount(
      trx,
      userId,
      {
        name: 'Synthetic checking',
        kind: 'asset',
        currency: usd,
        budgetGroup: 'on' as never,
        openingBalance: money(500_000, usd),
        openedOn: isoDay(300) as never,
      } as never,
      now,
      'import',
    );
    for (let m = 0; m < 10; m++)
      await recordTransaction(
        trx,
        userId,
        {
          kind: 'income',
          accountId: checking,
          amount: money(300_000, usd),
          categoryId: salary,
          occurredOn: isoDay(m * 30 + 3) as never,
          note: 'Made-up payroll',
        } as never,
        'import',
        now,
      );
  });
  while (done < count) {
    const n = Math.min(chunk, count - done);
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < n; i++)
        await recordTransaction(
          trx,
          userId,
          {
            kind: 'expense',
            accountId: checking,
            amount: money(100 + Math.floor(rand() * 4000), usd),
            categoryId: expense[Math.floor(rand() * expense.length)] as string,
            occurredOn: isoDay(Math.floor(rand() * 286)) as never,
            note: payees[Math.floor(rand() * payees.length)] as string,
          } as never,
          'import',
          now,
        );
    });
    done += n;
    onProgress?.(done);
    // Let the UI paint between chunks.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { ms: performance.now() - t0 };
}
