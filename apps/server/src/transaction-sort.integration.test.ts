import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// `sort` on /v1/transactions: each order is total, so paging with the
// cursor walks the same sequence as one big page, with nothing repeated or
// skipped, including entries tied on amount or date. Amounts are made up.

type Entry = { id: string; occurredOn: string; note: string | null };
type List = { transactions: Entry[]; nextCursor: string | null };

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

let h: TwoUsers;

async function list(client: TestClient, query: string): Promise<List> {
  const response = await client.get(`/v1/transactions?${query}`);
  expect(response.status).toBe(200);
  return response.body as List;
}

// Every page of a sorted list, as a flat sequence.
async function walk(sort: string, limit: number, extra = ''): Promise<Entry[]> {
  const seen: Entry[] = [];
  let cursor: string | null = null;
  do {
    const page: List = await list(
      h.alice,
      `sort=${sort}&limit=${String(limit)}${extra}${cursor === null ? '' : `&cursor=${cursor}`}`,
    );
    seen.push(...page.transactions);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return seen;
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => new Date('2026-04-10T12:00:00Z') });
  const account = await h.alice.post('/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: usd(500000),
    openedOn: '2026-04-01',
  });
  const everyday = (account.body as { id: string }).id;
  const categories = (await h.alice.get('/v1/categories')).body as {
    categories: { id: string; name: string }[];
  };
  const groceries =
    categories.categories.find((c) => c.name === 'Groceries')?.id ?? '';
  // Two share an amount, two share a day.
  const spend = [
    ['A', 1000, '2026-04-02'],
    ['B', 5000, '2026-04-03'],
    ['C', 1000, '2026-04-03'],
    ['D', 250, '2026-04-04'],
    ['E', 9000, '2026-04-04'],
    ['F', 5000, '2026-04-05'],
  ] as const;
  for (const [note, amount, occurredOn] of spend) {
    const response = await h.alice.post('/v1/transactions', {
      kind: 'expense',
      accountId: everyday,
      amount: usd(amount),
      categoryId: groceries,
      occurredOn,
      note,
    });
    expect(response.status).toBe(201);
  }
});

afterAll(async () => {
  await h.close();
});

describe('sort', () => {
  it('lists newest first by default', async () => {
    const all = await list(h.alice, 'limit=50');
    const sorted = await list(h.alice, 'sort=date-desc&limit=50');
    expect(all.transactions.map((t) => t.id)).toEqual(
      sorted.transactions.map((t) => t.id),
    );
    expect(all.transactions[0]?.note).toBe('F');
    expect(all.transactions.at(-1)?.occurredOn).toBe('2026-04-01');
  });

  it('reverses the whole order with date-asc', async () => {
    const desc = await walk('date-desc', 50);
    const asc = await walk('date-asc', 50);
    expect(asc.map((t) => t.id)).toEqual(desc.map((t) => t.id).reverse());
  });

  it('orders by size with the newest first among equals', async () => {
    const entries = (await walk('amount-desc', 50)).filter(
      (t) => t.note !== null,
    );
    expect(entries.map((t) => t.note)).toEqual(['E', 'F', 'B', 'C', 'A', 'D']);
    const ascending = (await walk('amount-asc', 50)).filter(
      (t) => t.note !== null,
    );
    expect(ascending.map((t) => t.note)).toEqual([
      'D',
      'C',
      'A',
      'F',
      'B',
      'E',
    ]);
  });

  it.each(['date-desc', 'date-asc', 'amount-desc', 'amount-asc'])(
    'pages %s without repeating or skipping an entry',
    async (sort) => {
      const whole = await walk(sort, 50);
      for (const limit of [1, 2, 3]) {
        const paged = await walk(sort, limit);
        expect(paged.map((t) => t.id)).toEqual(whole.map((t) => t.id));
      }
      expect(new Set(whole.map((t) => t.id)).size).toBe(whole.length);
    },
  );

  it('pages a filtered, sorted list', async () => {
    const some = await walk('amount-asc', 2, '&from=2026-04-03&to=2026-04-04');
    expect(some.map((t) => t.note)).toEqual(['D', 'C', 'B', 'E']);
  });

  it('keeps the totals the same in every order', async () => {
    const first = (await h.alice.get('/v1/transactions?sort=amount-desc'))
      .body as { totals: unknown };
    const second = (await h.alice.get('/v1/transactions?sort=date-asc'))
      .body as { totals: unknown };
    expect(first.totals).toEqual(second.totals);
  });

  it('refuses an unknown order and a cursor from another order', async () => {
    expect((await h.alice.get('/v1/transactions?sort=sideways')).status).toBe(
      400,
    );
    const page = await list(h.alice, 'sort=date-desc&limit=1');
    const stale = await h.alice.get(
      `/v1/transactions?sort=amount-desc&cursor=${page.nextCursor ?? ''}`,
    );
    expect(stale.status).toBe(400);
    expect((stale.body as { code?: string }).code).toBe('invalid_cursor');
  });
});
