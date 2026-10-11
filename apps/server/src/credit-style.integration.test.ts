import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// How pools and accounts look (colour and icon), and a credit account's
// limit and due day, through the API against real SQLite and migrations.
// The clock is fixed to 31 January 2026. All figures are made up.

type Money = { amountMinor: number; currency: string };
type Account = {
  id: string;
  kind: string;
  balance: Money;
  colour: string | null;
  icon: string | null;
  creditLimit: Money | null;
  creditAvailable: Money | null;
  dueDay: number | null;
  nextDueOn: string | null;
};
type Pool = { id: string; colour: string | null; icon: string | null };
type Figure = { amount: Money; missingRates: string[] };

let now = new Date('2026-01-31T12:00:00Z');
let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => now });
  await h.db
    .updateTable('users')
    .set({ created_at: now.toISOString() })
    .execute();
});

afterAll(async () => {
  await h.close();
});

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

async function card(
  client: TestClient,
  body: Record<string, unknown>,
): Promise<Account> {
  const response = await client.post('/v1/accounts', {
    kind: 'liability',
    currency: 'USD',
    ...body,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as Account;
}

async function account(client: TestClient, id: string): Promise<Account> {
  return (await client.get(`/v1/accounts/${id}`)).body as Account;
}

async function totals(client: TestClient) {
  const { creditOwed, creditLimit, creditAvailable } = (
    (await client.get('/v1/accounts')).body as {
      totals: {
        creditOwed: Figure;
        creditLimit: Figure;
        creditAvailable: Figure;
      };
    }
  ).totals;
  return { creditOwed, creditLimit, creditAvailable };
}

function code(body: unknown): unknown {
  return (body as { code?: string }).code;
}

describe('pool colour and icon', () => {
  it('are empty until set, and take a series role and an icon key', async () => {
    const created = await h.alice.post('/v1/pools', {
      name: 'Holiday',
      kind: 'savings',
      colour: 'series-5',
      icon: 'plane',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ colour: 'series-5', icon: 'plane' });
    const pools = (await h.alice.get('/v1/pools')).body as { pools: Pool[] };
    expect(pools.pools.map((p) => [p.colour, p.icon])).toEqual([
      [null, null],
      [null, null],
      ['series-5', 'plane'],
    ]);
  });

  it('change, clear with null and stay when omitted', async () => {
    const [, , holiday] = (
      (await h.alice.get('/v1/pools')).body as { pools: Pool[] }
    ).pools;
    const path = `/v1/pools/${holiday?.id ?? ''}`;
    expect(
      (await h.alice.patch(path, { colour: 'series-2' })).body,
    ).toMatchObject({ colour: 'series-2', icon: 'plane' });
    expect((await h.alice.patch(path, { name: 'Trips' })).body).toMatchObject({
      colour: 'series-2',
      icon: 'plane',
    });
    expect(
      (await h.alice.patch(path, { colour: null, icon: null })).body,
    ).toMatchObject({ colour: null, icon: null });
  });

  it('refuse a hex colour, an unknown role and an unknown icon', async () => {
    const [budget] = (
      (await h.alice.get('/v1/pools')).body as { pools: Pool[] }
    ).pools;
    const path = `/v1/pools/${budget?.id ?? ''}`;
    for (const body of [
      { colour: '#ff0000' },
      { colour: 'series-9' },
      { icon: 'rocket' },
    ]) {
      expect((await h.alice.patch(path, body)).status).toBe(400);
    }
  });
});

describe('account colour and icon', () => {
  it('are set at creation, changed, cleared and validated', async () => {
    const created = await card(h.alice, {
      name: 'Daily card',
      kind: 'asset',
      colour: 'series-3',
      icon: 'credit-card',
    });
    expect(created).toMatchObject({ colour: 'series-3', icon: 'credit-card' });
    const path = `/v1/accounts/${created.id}`;
    expect((await h.alice.patch(path, { icon: 'wallet' })).body).toMatchObject({
      colour: 'series-3',
      icon: 'wallet',
    });
    expect(
      (await h.alice.patch(path, { colour: null, icon: null })).body,
    ).toMatchObject({ colour: null, icon: null });
    expect((await h.alice.patch(path, { colour: 'red' })).status).toBe(400);
    expect((await h.alice.patch(path, { icon: 'Wallet' })).status).toBe(400);
  });
});

describe('credit limit and due day', () => {
  let visa: Account;

  it('give what is available: the limit plus the balance', async () => {
    visa = await card(h.alice, {
      name: 'Travel card',
      creditLimit: usd(200_000),
      dueDay: 15,
      openingBalance: usd(-40_000),
    });
    // Owing 400.00 on a 2 000.00 limit leaves 1 600.00.
    expect(visa).toMatchObject({
      balance: usd(-40_000),
      creditLimit: usd(200_000),
      creditAvailable: usd(160_000),
      dueDay: 15,
    });
  });

  it('count spending on the card against what is available', async () => {
    const categories = (await h.alice.get('/v1/categories')).body as {
      categories: { id: string; name: string; kind: string }[];
    };
    const other = categories.categories.find(
      (c) => c.name === 'Other' && c.kind === 'expense',
    );
    const spent = await h.alice.post('/v1/transactions', {
      kind: 'expense',
      accountId: visa.id,
      amount: usd(25_000),
      categoryId: other?.id,
    });
    expect(spent.status, JSON.stringify(spent.body)).toBe(201);
    expect(await account(h.alice, visa.id)).toMatchObject({
      balance: usd(-65_000),
      creditAvailable: usd(135_000),
    });
  });

  it('go negative past the limit and above it when in credit', async () => {
    const path = `/v1/accounts/${visa.id}`;
    const lowered = await h.alice.patch(path, { creditLimit: usd(50_000) });
    expect(lowered.status).toBe(200);
    expect(lowered.body).toMatchObject({ creditAvailable: usd(-15_000) });

    const credit = await card(h.alice, {
      name: 'Refunded card',
      creditLimit: usd(100_000),
      openingBalance: usd(12_000),
    });
    expect(credit.creditAvailable).toEqual(usd(112_000));
  });

  it('are null without a limit, and a limit can be cleared', async () => {
    const plain = await card(h.alice, { name: 'No limit card' });
    expect(plain).toMatchObject({
      creditLimit: null,
      creditAvailable: null,
      dueDay: null,
      nextDueOn: null,
    });
    const cleared = await h.alice.patch(`/v1/accounts/${visa.id}`, {
      creditLimit: null,
      dueDay: null,
    });
    expect(cleared.body).toMatchObject({
      creditLimit: null,
      creditAvailable: null,
      dueDay: null,
      nextDueOn: null,
    });
    await h.alice.patch(`/v1/accounts/${visa.id}`, {
      creditLimit: usd(200_000),
      dueDay: 15,
    });
  });

  it("work out the next due date from the user's today, clamping short months", async () => {
    // 31 January: the 15th has passed, so the next one is in February.
    expect((await account(h.alice, visa.id)).nextDueOn).toBe('2026-02-15');
    const late = await card(h.alice, { name: 'Month-end card', dueDay: 30 });
    expect(late.nextDueOn).toBe('2026-02-28');
    const last = await card(h.alice, { name: 'Last day card', dueDay: 31 });
    expect(last.nextDueOn).toBe('2026-01-31');

    now = new Date('2026-02-28T12:00:00Z');
    expect((await account(h.alice, late.id)).nextDueOn).toBe('2026-02-28');
    now = new Date('2026-03-01T12:00:00Z');
    expect((await account(h.alice, late.id)).nextDueOn).toBe('2026-03-30');
    now = new Date('2026-01-31T12:00:00Z');
  });

  it('create no bill', async () => {
    const bills = (await h.alice.get('/v1/bills')).body as {
      bills: unknown[];
    };
    expect(bills.bills).toEqual([]);
  });

  it('are for credit accounts only, in range and in the account currency', async () => {
    const asset = await card(h.alice, { name: 'Plain account', kind: 'asset' });
    const refused = await h.alice.post('/v1/accounts', {
      name: 'Plain limit',
      currency: 'USD',
      creditLimit: usd(100),
    });
    expect(refused.status).toBe(400);
    const dueOnAsset = await h.alice.patch(`/v1/accounts/${asset.id}`, {
      dueDay: 5,
    });
    expect(dueOnAsset.status).toBe(400);
    expect(code(dueOnAsset.body)).toBe('credit_only');
    const limitOnAsset = await h.alice.patch(`/v1/accounts/${asset.id}`, {
      creditLimit: usd(100),
    });
    expect(code(limitOnAsset.body)).toBe('credit_only');
    // Clearing on a non-credit account is harmless.
    expect(
      (await h.alice.patch(`/v1/accounts/${asset.id}`, { dueDay: null }))
        .status,
    ).toBe(200);

    const path = `/v1/accounts/${visa.id}`;
    for (const body of [
      { dueDay: 0 },
      { dueDay: 32 },
      { dueDay: 1.5 },
      { creditLimit: usd(0) },
      { creditLimit: usd(-100) },
    ]) {
      expect((await h.alice.patch(path, body)).status).toBe(400);
    }
    const euro = await h.alice.patch(path, {
      creditLimit: { amountMinor: 1000, currency: 'EUR' },
    });
    expect(euro.status).toBe(400);
    expect(code(euro.body)).toBe('currency_mismatch');
  });

  it("are not shared with another user's accounts", async () => {
    const stolen = await h.bob.patch(`/v1/accounts/${visa.id}`, {
      dueDay: 3,
    });
    expect(stolen.status).toBe(404);
  });
});

describe('credit totals', () => {
  it('cover the open cards with a limit, in the default currency', async () => {
    // Bob has no cards yet.
    expect(await totals(h.bob)).toEqual({
      creditOwed: { amount: usd(0), missingRates: [] },
      creditLimit: { amount: usd(0), missingRates: [] },
      creditAvailable: { amount: usd(0), missingRates: [] },
    });
    await card(h.bob, {
      name: 'Card A',
      creditLimit: usd(200_000),
      openingBalance: usd(-50_000),
    });
    await card(h.bob, {
      name: 'Card B',
      creditLimit: usd(100_000),
      openingBalance: usd(-120_000),
    });
    // A card without a limit is owed but in neither limit nor available.
    await card(h.bob, { name: 'Card C', openingBalance: usd(-10_000) });
    await card(h.bob, {
      name: 'Euro card',
      currency: 'EUR',
      creditLimit: { amountMinor: 50_000, currency: 'EUR' },
    });
    expect(await totals(h.bob)).toEqual({
      // The euro card owes nothing, so only its limit lacks a rate.
      creditOwed: { amount: usd(-180_000), missingRates: [] },
      creditLimit: { amount: usd(300_000), missingRates: ['EUR'] },
      // 150 000 free on A, -20 000 on B.
      creditAvailable: { amount: usd(130_000), missingRates: ['EUR'] },
    });
  });

  it('leave out archived cards', async () => {
    const spare = await card(h.bob, {
      name: 'Spare card',
      creditLimit: usd(400_000),
    });
    expect((await totals(h.bob)).creditLimit.amount).toEqual(usd(700_000));
    const archived = await h.bob.post(`/v1/accounts/${spare.id}/archive`);
    expect(archived.status).toBe(200);
    expect((await totals(h.bob)).creditLimit.amount).toEqual(usd(300_000));
  });
});

describe('export and import', () => {
  it('carry the styles, limits and due days', async () => {
    const budget = (
      (await h.alice.get('/v1/pools')).body as {
        pools: (Pool & { defaultFor: string | null })[];
      }
    ).pools.find((p) => p.defaultFor === 'on');
    await h.alice.patch(`/v1/pools/${budget?.id ?? ''}`, {
      colour: 'series-4',
      icon: 'wallet',
    });
    const exported = await h.alice.get('/v1/export?format=json');
    expect(exported.status).toBe(200);
    const fresh = await startWithTwoUsers({ now: () => now });
    try {
      const imported = await fresh.alice.post('/v1/import', exported.body);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      const accounts = (await fresh.alice.get('/v1/accounts')).body as {
        accounts: (Account & { name: string })[];
      };
      const travel = accounts.accounts.find((a) => a.name === 'Travel card');
      expect(travel).toMatchObject({
        creditLimit: usd(200_000),
        dueDay: 15,
      });
      const pools = (await fresh.alice.get('/v1/pools')).body as {
        pools: Pool[];
      };
      expect(pools.pools.map((p) => [p.colour, p.icon])).toContainEqual([
        'series-4',
        'wallet',
      ]);
    } finally {
      await fresh.close();
    }
  });
});
