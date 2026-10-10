import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// What /v1/transactions says about an entry beyond its postings: the bill
// it paid (list and detail) and, on the detail, how its budget stood after
// it in whatever period it falls in. The clock is mutable so an entry can
// fall in an earlier period. All names and amounts are made up.

type Money = { amountMinor: number; currency: string };
type Line = {
  budgetId: string | null;
  budgetName: string | null;
  amount: Money;
  own: Money;
  covers: { source: string; name: string; amount: Money }[];
  uncovered: Money;
  leftAfter: Money | null;
};
type Detail = {
  id: string;
  billId: string | null;
  billName: string | null;
  budget: { period: { from: string; to: string }; lines: Line[] } | null;
};
type Status = {
  budgets: { id: string; name: string; left: Money; planned: Money }[];
};

let current = new Date('2026-03-15T12:00:00Z');
// A millisecond per call keeps entries made on one day in recorded order.
let tick = 0;
const clock = () => new Date(current.getTime() + (tick += 1));
let h: TwoUsers;
let everyday = '';
let food = '';
let rent = '';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

async function detail(id: string): Promise<Detail> {
  const response = await h.alice.get(`/v1/transactions/${id}`);
  expect(response.status).toBe(200);
  return response.body as Detail;
}

async function spend(amountMinor: number, note: string): Promise<string> {
  const response = await h.alice.post('/v1/transactions', {
    kind: 'expense',
    accountId: everyday,
    amount: usd(amountMinor),
    categoryId: food,
    occurredOn: '2026-03-15',
    note,
  });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

async function foodStatus(client: TestClient = h.alice) {
  const status = (await client.get('/v1/budgets')).body as Status;
  const line = status.budgets.find((b) => b.name === 'Food');
  if (line === undefined) throw new Error('no Food budget');
  return line;
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: clock });
  await h.db
    .updateTable('users')
    .set({ created_at: current.toISOString() })
    .execute();
  const account = await h.alice.post('/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: usd(150_000),
  });
  everyday = (account.body as { id: string }).id;
  const categories = (
    (await h.alice.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  food = categories.find((c) => c.name === 'Food')?.id ?? '';
  rent = categories.find((c) => c.name === 'Bills and subscriptions')?.id ?? '';
  expect(
    (await h.alice.patch('/v1/settings/ledger', { budgetPeriod: 'month' }))
      .status,
  ).toBe(200);
  expect(
    (
      await h.alice.post('/v1/budgets', {
        name: 'Food',
        target: { kind: 'category', categoryId: food },
        amount: usd(10_000),
      })
    ).status,
  ).toBe(201);
});

afterAll(async () => {
  await h.close();
});

describe('the bill an entry paid', () => {
  it('names the bill on the list and the detail, until the payment is undone', async () => {
    const bill = await h.alice.post('/v1/bills', {
      name: 'Water',
      amount: usd(4_000),
      accountId: everyday,
      categoryId: rent,
      dueDay: 20,
    });
    expect(bill.status).toBe(201);
    const billId = (bill.body as { id: string }).id;
    const paid = await h.alice.post(`/v1/bills/${billId}/payments`, {
      dueOn: '2026-03-20',
      paid: usd(4_000),
    });
    expect(paid.status).toBe(201);
    const transactionId = (
      paid.body as { payments: { transactionId: string }[] }
    ).payments[0]?.transactionId;
    expect(transactionId).toBeTruthy();

    expect(await detail(transactionId ?? '')).toMatchObject({
      billId,
      billName: 'Water',
    });
    const listed = (await h.alice.get('/v1/transactions')).body as {
      transactions: Detail[];
    };
    expect(
      listed.transactions.find((t) => t.id === transactionId),
    ).toMatchObject({ billId, billName: 'Water' });
    const others = listed.transactions.filter((t) => t.id !== transactionId);
    expect(others.every((t) => t.billId === null && t.billName === null)).toBe(
      true,
    );

    expect(
      (await h.alice.delete(`/v1/bills/${billId}/payments/2026-03-20`)).status,
    ).toBe(200);
    expect(await detail(transactionId ?? '')).toMatchObject({
      billId: null,
      billName: null,
    });
  });
});

describe('the budget an entry was counted in', () => {
  let first = '';
  let second = '';

  it('says what the budget had left after each entry', async () => {
    first = await spend(3_000, 'Market');
    second = await spend(9_000, 'Feast');
    const planned = (await foodStatus()).planned.amountMinor;
    const one = await detail(first);
    expect(one.budget?.lines).toHaveLength(1);
    expect(one.budget?.lines[0]).toMatchObject({
      budgetName: 'Food',
      amount: usd(3_000),
      own: usd(3_000),
      covers: [],
      uncovered: usd(0),
      leftAfter: usd(planned - 3_000),
    });
    // The second went past what Food had left, so free money covered the
    // rest, and Food's current figure is what it was left with.
    const two = await detail(second);
    const line = two.budget?.lines[0];
    expect(line?.own.amountMinor).toBe(planned - 3_000);
    expect(line?.covers).toEqual([
      {
        source: 'free',
        name: 'Free money',
        amount: usd(9_000 - (planned - 3_000)),
      },
    ]);
    expect(line?.leftAfter).toEqual((await foodStatus()).left);
    expect(line?.leftAfter).toEqual(usd(0));
  });

  it('leaves it out for income, transfers and undone entries', async () => {
    const income = await h.alice.post('/v1/transactions', {
      kind: 'income',
      accountId: everyday,
      amount: usd(5_000),
      categoryId:
        (
          (await h.alice.get('/v1/categories')).body as {
            categories: { id: string; kind: string }[];
          }
        ).categories.find((c) => c.kind === 'income')?.id ?? '',
    });
    expect(income.status).toBe(201);
    expect(
      (await detail((income.body as { id: string }).id)).budget,
    ).toBeNull();
    const undone = await spend(500, 'Oops');
    expect((await detail(undone)).budget).not.toBeNull();
    await h.alice.post(`/v1/transactions/${undone}/reverse`, {});
    expect((await detail(undone)).budget).toBeNull();
  });

  it('still answers once the entry is in an earlier period', async () => {
    const before = await detail(second);
    current = new Date('2026-04-20T12:00:00Z');
    const later = await detail(second);
    expect(later.budget?.period).toEqual({
      from: '2026-03-01',
      to: '2026-04-01',
    });
    expect(later.budget?.lines).toEqual(before.budget?.lines);
    // The covers list only holds the current period, which has none.
    const covers = (await h.alice.get('/v1/budgets/covers')).body as {
      covers: unknown[];
    };
    expect(covers.covers).toEqual([]);
  });

  it('shows another user nothing', async () => {
    expect((await h.bob.get(`/v1/transactions/${first}`)).status).toBe(404);
  });
});
