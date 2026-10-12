import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';
import type { TestClient } from './testing/http-client.ts';

// Expenses paid with outside money through the API against real SQLite and
// migrations: created, edited, undone and restored with their funding, left
// out of spending and pace, and kept out of balances. All figures are made up.

type Money = { amountMinor: number; currency: string };
type Cycle = {
  spending: Money;
  outsideSpending: Money;
  income: Money;
  otherInflows: Money;
  outsideByCategory: { categoryId: string | null; amount: Money }[];
};
type Entry = { id: string; funding: string; reversedById: string | null };

const started = new Date('2026-04-01T12:00:00Z');
let clock = started;
let h: TwoUsers;
let account: string;
let gifts: string;
let shopping: string;
let paycheck: string;

const usd = (amountMinor: number): Money => ({ amountMinor, currency: 'USD' });

async function categoryId(client: TestClient, name: string): Promise<string> {
  const list = await client.get('/v1/categories');
  const found = (
    list.body as { categories: { id: string; name: string }[] }
  ).categories.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no category ${name}`);
  return found.id;
}

async function post(path: string, body: unknown): Promise<Entry> {
  const response = await h.bob.post(path, body);
  expect(response.status).toBe(201);
  return response.body as Entry;
}

const spend = (amountMinor: number, extra: object = {}) =>
  post('/v1/transactions', {
    kind: 'expense',
    accountId: account,
    amount: usd(amountMinor),
    categoryId: shopping,
    occurredOn: '2026-04-05',
    ...extra,
  });

async function get<T = Record<string, Money>>(path: string): Promise<T> {
  const response = await h.bob.get(path);
  expect(response.status).toBe(200);
  return response.body as T;
}

const balance = () => get<{ balance: Money }>(`/v1/accounts/${account}`);
const cycle = () => get<Cycle>('/v1/cycles/2026-04-01');

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  const created = await h.bob.post('/v1/accounts', {
    name: 'Wallet',
    currency: 'USD',
    openingBalance: usd(0),
  });
  account = (created.body as { id: string }).id;
  gifts = await categoryId(h.bob, 'Gifts');
  shopping = await categoryId(h.bob, 'Shopping');
  paycheck = await categoryId(h.bob, 'Paycheck');
  await post('/v1/transactions', {
    kind: 'income',
    accountId: account,
    amount: usd(300000),
    categoryId: paycheck,
    occurredOn: '2026-04-01',
  });
  await post('/v1/transactions', {
    kind: 'income',
    accountId: account,
    amount: usd(400000),
    categoryId: gifts,
    occurredOn: '2026-04-04',
  });
  clock = new Date('2026-04-10T12:00:00Z');
});

afterAll(async () => {
  await h.close();
});

describe('expense funding', () => {
  it('defaults to own and is allowed on expenses only', async () => {
    expect((await spend(1200)).funding).toBe('own');
    // The field belongs to expenses; elsewhere it is not read.
    const income = await post('/v1/transactions', {
      kind: 'income',
      accountId: account,
      amount: usd(100),
      categoryId: paycheck,
      funding: 'outside',
    });
    expect(income.funding).toBe('own');
    const bad = await h.bob.post('/v1/transactions', {
      kind: 'expense',
      accountId: account,
      amount: usd(100),
      categoryId: shopping,
      funding: 'gift',
    });
    expect(bad.status).toBe(400);
  });

  it('is left out of spending but not out of the balance', async () => {
    const before = await cycle();
    const beforeBalance = (await balance()).balance;
    const purchase = await spend(398300, { funding: 'outside' });
    expect(purchase.funding).toBe('outside');

    const after = await cycle();
    expect(after.spending).toEqual(before.spending);
    expect(after.outsideSpending).toEqual(usd(398300));
    expect(after.outsideByCategory).toEqual([
      { categoryId: shopping, amount: usd(398300) },
    ]);
    expect(after.income).toEqual(before.income);
    expect(after.otherInflows).toEqual(before.otherInflows);
    expect((await balance()).balance).toEqual({
      amountMinor: beforeBalance.amountMinor - 398300,
      currency: 'USD',
    });
    const today = await get<{ paceSpent: Money; cycleSpent: Money }>(
      '/v1/today',
    );
    expect(today.paceSpent).toEqual(before.spending);
    expect(today.cycleSpent.amountMinor).toBe(
      before.spending.amountMinor + 398300,
    );
  });

  it('is reported apart in the category summary', async () => {
    const summary = await get<{
      outsideSpendingTotal: Money;
      spendingTotal: Money;
    }>('/v1/reports/categories?period=cycle');
    expect(summary.outsideSpendingTotal).toEqual(usd(398300));
    expect(summary.spendingTotal).toEqual(usd(1200));
  });

  it('keeps its funding through an edit that does not say, and changes it when told', async () => {
    const purchase = await spend(5000, { funding: 'outside' });
    const kept = await h.bob.post(`/v1/transactions/${purchase.id}/edit`, {
      kind: 'expense',
      accountId: account,
      amount: usd(5500),
      categoryId: shopping,
      occurredOn: '2026-04-05',
      note: 'fixed the note',
    });
    expect(kept.status).toBe(201);
    const replacement = (kept.body as { replacement: Entry }).replacement;
    expect(replacement.funding).toBe('outside');

    const changed = await h.bob.post(
      `/v1/transactions/${replacement.id}/edit`,
      {
        kind: 'expense',
        accountId: account,
        amount: usd(5500),
        categoryId: shopping,
        occurredOn: '2026-04-05',
        funding: 'own',
      },
    );
    expect((changed.body as { replacement: Entry }).replacement.funding).toBe(
      'own',
    );
  });

  it('follows an undo, a restore and a revert', async () => {
    const before = await cycle();
    const purchase = await spend(7000, { funding: 'outside' });
    const withIt = await cycle();
    expect(withIt.outsideSpending.amountMinor).toBe(
      before.outsideSpending.amountMinor + 7000,
    );

    const undone = await h.bob.post(
      `/v1/transactions/${purchase.id}/reverse`,
      {},
    );
    expect(undone.status).toBe(201);
    expect((await cycle()).outsideSpending).toEqual(before.outsideSpending);
    expect((await cycle()).spending).toEqual(before.spending);

    const restored = await h.bob.post(
      `/v1/transactions/${purchase.id}/restore`,
      {},
    );
    expect(restored.status).toBe(201);
    expect((restored.body as Entry).funding).toBe('outside');
    expect((await cycle()).outsideSpending).toEqual(withIt.outsideSpending);
  });

  it('consumes budgets only when the setting is on', async () => {
    const response = await h.bob.patch('/v1/settings/ledger', {
      outsideConsumesBudgets: true,
    });
    expect(response.status).toBe(200);
    expect(
      (response.body as { outsideConsumesBudgets: boolean })
        .outsideConsumesBudgets,
    ).toBe(true);
    await h.bob.patch('/v1/settings/ledger', { outsideConsumesBudgets: false });
  });
});

describe('expense funding in an import', () => {
  it('round-trips through the export bundle, and old files read as own', async () => {
    const exported = await h.bob.get('/v1/export?format=json');
    expect(exported.status).toBe(200);
    const bundle = exported.body as {
      transactions: { kind: string; funding?: string }[];
    };
    expect(
      bundle.transactions.some(
        (t) => t.kind === 'expense' && t.funding === 'outside',
      ),
    ).toBe(true);
    expect(
      bundle.transactions.filter(
        (t) => t.kind === 'expense' && t.funding === 'own',
      ),
    ).toEqual([]);
  });

  it('imports the flag, and reads a file without it as own', async () => {
    const bundle = {
      format: 'allotr.bundle',
      version: 1,
      accounts: [
        {
          name: 'Main',
          currency: 'USD',
          openingBalance: usd(500000),
          openedOn: '2026-04-01',
        },
      ],
      transactions: [
        {
          kind: 'expense',
          account: 'Main',
          amount: usd(30000),
          category: 'Shopping',
          occurredOn: '2026-04-05',
          funding: 'outside',
        },
        {
          kind: 'expense',
          account: 'Main',
          amount: usd(1500),
          category: 'Shopping',
          occurredOn: '2026-04-06',
        },
      ],
    };
    const imported = await h.alice.post('/v1/import', bundle);
    expect(imported.status).toBe(201);
    const cycles = (await h.alice.get('/v1/cycles')).body as {
      cycles: { spending: Money; outsideSpending: Money }[];
    };
    expect(cycles.cycles[0]?.spending).toEqual(usd(1500));
    expect(cycles.cycles[0]?.outsideSpending).toEqual(usd(30000));

    const refused = await h.alice.post('/v1/import', {
      ...bundle,
      transactions: [
        { ...bundle.transactions[0], kind: 'income', category: 'Paycheck' },
      ],
    });
    expect(refused.status).toBe(400);
  });
});
