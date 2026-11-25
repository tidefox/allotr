import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// The entry bounds of /v1/transactions (ADR 0039): a paycheck cuts its day,
// so a cycle's list starts at its paycheck, not at the start of its day.
// Amounts are made up.

type List = { transactions: { id: string; occurredOn: string }[] };

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

let h: TwoUsers;
let breakfast: string;
let pay: string;
let dinner: string;

async function ids(query: string): Promise<string[]> {
  const response = await h.alice.get(`/v1/transactions?sort=date-asc${query}`);
  expect(response.status).toBe(200);
  return (response.body as List).transactions.map((t) => t.id);
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => new Date('2026-04-10T12:00:00Z') });
  const account = await h.alice.post('/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: usd(100000),
    openedOn: '2026-04-01',
  });
  const accountId = (account.body as { id: string }).id;
  const categories = (await h.alice.get('/v1/categories')).body as {
    categories: { id: string; name: string }[];
  };
  const idOf = (name: string) =>
    categories.categories.find((c) => c.name === name)?.id ?? '';
  const post = async (body: Record<string, unknown>) => {
    const response = await h.alice.post('/v1/transactions', body);
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  };
  const spend = (amountMinor: number) =>
    post({
      kind: 'expense',
      accountId,
      amount: usd(amountMinor),
      categoryId: idOf('Groceries'),
      occurredOn: '2026-04-10',
    });
  breakfast = await spend(1200);
  pay = await post({
    kind: 'income',
    accountId,
    amount: usd(200000),
    categoryId: idOf('Paycheck'),
    occurredOn: '2026-04-10',
  });
  dinner = await spend(2500);
});

afterAll(async () => {
  await h.close();
});

describe('entry bounds', () => {
  it('starts a cycle at its paycheck, not at the start of its day', async () => {
    expect(await ids('&from=2026-04-10')).toEqual([breakfast, pay, dinner]);
    expect(await ids(`&from=2026-04-10&fromEntry=${pay}`)).toEqual([
      pay,
      dinner,
    ]);
  });

  it('ends the cycle before the paycheck that closes it', async () => {
    expect(await ids(`&from=2026-04-10&beforeEntry=${pay}`)).toEqual([
      breakfast,
    ]);
  });

  it('refuses an entry that does not exist', async () => {
    const response = await h.alice.get(
      '/v1/transactions?fromEntry=00000000-0000-4000-8000-000000000000',
    );
    expect(response.status).toBe(404);
  });
});
