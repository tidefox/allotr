import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// An account's subtype (free text) and a credit account's minimum payment,
// through the API against real SQLite and migrations. Both are display only.
// All figures are made up.

type Money = { amountMinor: number; currency: string };
type Account = {
  id: string;
  name: string;
  kind: string;
  balance: Money;
  minPayment: Money | null;
  subtype: string | null;
};

const now = new Date('2026-01-31T12:00:00Z');
let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => now });
});

afterAll(async () => {
  await h.close();
});

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const code = (body: unknown) => (body as { code?: string }).code;

async function open(
  client: TestClient,
  body: Record<string, unknown>,
): Promise<Account> {
  const response = await client.post('/v1/accounts', {
    currency: 'USD',
    ...body,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as Account;
}

describe('subtype and minimum payment', () => {
  it('default to none and are read back as stored', async () => {
    const plain = await open(h.alice, { name: 'Wallet' });
    expect(plain).toMatchObject({ minPayment: null, subtype: null });

    const card = await open(h.alice, {
      name: 'Travel card',
      kind: 'liability',
      subtype: '  credit card ',
      minPayment: usd(2_500),
    });
    expect(card).toMatchObject({
      subtype: 'credit card',
      minPayment: usd(2_500),
    });
    const read = await h.alice.get(`/v1/accounts/${card.id}`);
    expect(read.body).toMatchObject({
      subtype: 'credit card',
      minPayment: usd(2_500),
    });
  });

  it('change and clear, and leave the balance and every figure alone', async () => {
    const card = await open(h.alice, {
      name: 'Shop card',
      kind: 'liability',
      openingBalance: usd(-40_000),
    });
    const path = `/v1/accounts/${card.id}`;
    const set = await h.alice.patch(path, {
      minPayment: usd(1_500),
      subtype: 'store card',
    });
    expect(set.body).toMatchObject({
      minPayment: usd(1_500),
      subtype: 'store card',
      balance: usd(-40_000),
    });
    const cleared = await h.alice.patch(path, {
      minPayment: null,
      subtype: null,
    });
    expect(cleared.body).toMatchObject({ minPayment: null, subtype: null });
    // A change of one leaves the other alone.
    await h.alice.patch(path, { subtype: 'charge card', minPayment: usd(900) });
    const only = await h.alice.patch(path, { minPayment: usd(1_000) });
    expect(only.body).toMatchObject({
      subtype: 'charge card',
      minPayment: usd(1_000),
    });
  });

  it('take a subtype on any account but a minimum payment on a card only', async () => {
    const asset = await open(h.alice, { name: 'Everyday' });
    const path = `/v1/accounts/${asset.id}`;
    const labelled = await h.alice.patch(path, { subtype: 'debit card' });
    expect(labelled.body).toMatchObject({ subtype: 'debit card' });

    const refused = await h.alice.patch(path, { minPayment: usd(100) });
    expect(refused.status).toBe(400);
    expect(code(refused.body)).toBe('credit_only');
    const onCreate = await h.alice.post('/v1/accounts', {
      name: 'Plain minimum',
      currency: 'USD',
      minPayment: usd(100),
    });
    expect(onCreate.status).toBe(400);
    // Clearing on a non-credit account is harmless.
    expect((await h.alice.patch(path, { minPayment: null })).status).toBe(200);
  });

  it('are checked: above zero, in the account currency, and a sane subtype', async () => {
    const card = await open(h.alice, {
      name: 'Checked card',
      kind: 'liability',
    });
    const path = `/v1/accounts/${card.id}`;
    for (const body of [
      { minPayment: usd(0) },
      { minPayment: usd(-100) },
      { subtype: '' },
      { subtype: '   ' },
      { subtype: 'x'.repeat(101) },
    ]) {
      expect(
        (await h.alice.patch(path, body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    const euro = await h.alice.patch(path, {
      minPayment: { amountMinor: 1000, currency: 'EUR' },
    });
    expect(euro.status).toBe(400);
    expect(code(euro.body)).toBe('currency_mismatch');
  });

  it("are not shared with another user's accounts", async () => {
    const card = await open(h.alice, {
      name: 'Private card',
      kind: 'liability',
    });
    const stolen = await h.bob.patch(`/v1/accounts/${card.id}`, {
      subtype: 'mine now',
    });
    expect(stolen.status).toBe(404);
  });
});

describe('export and import', () => {
  it('carry the subtype and the minimum payment', async () => {
    const exported = await h.alice.get('/v1/export?format=json');
    expect(exported.status).toBe(200);
    const fresh = await startWithTwoUsers({ now: () => now });
    try {
      const imported = await fresh.alice.post('/v1/import', exported.body);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      const { accounts } = (await fresh.alice.get('/v1/accounts')).body as {
        accounts: Account[];
      };
      const byName = (name: string) => accounts.find((a) => a.name === name);
      expect(byName('Travel card')).toMatchObject({
        subtype: 'credit card',
        minPayment: usd(2_500),
      });
      expect(byName('Everyday')).toMatchObject({
        subtype: 'debit card',
        minPayment: null,
      });
    } finally {
      await fresh.close();
    }
  });

  it('refuse a minimum payment on an account that is not a card', async () => {
    const other = await startWithTwoUsers({ now: () => now });
    try {
      const refused = await other.alice.post('/v1/import', {
        format: 'allotr.bundle',
        version: 1,
        accounts: [{ name: 'Plain', currency: 'USD', minPayment: usd(100) }],
      });
      expect(refused.status).toBe(400);
    } finally {
      await other.close();
    }
  });
});
