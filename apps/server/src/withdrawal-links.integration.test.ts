import { bundleSchema } from '@allotr/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Withdrawal links through the API against real SQLite and migrations
// (ADR 0038): the worked example from the ADR, every refusal code, removal,
// edits, undo and restore, the ledger cache, and an export that imports back.
// All figures are made up.

type Money = { amountMinor: number; currency: string };
type Link = {
  id: string;
  withdrawalId: string;
  expenseId: string;
  amount: Money;
  valid: boolean;
  reason: string | null;
};
type Entry = {
  id: string;
  reversedById: string | null;
  restoredById: string | null;
  withdrawalLinks: Link[];
};
type Today = {
  available: Money;
  startOfDay: Money;
  spentToday: Money;
  cycleSpent: Money;
};
type Candidates = {
  transactionId: string;
  role: string;
  candidates: { transaction: Entry & { occurredOn: string }; room: Money }[];
};
type Problem = { code: string; status: number };

const started = new Date('2026-04-01T12:00:00Z');
let clock = started;
let h: TwoUsers;
let everyday: string;
let savings: string;
let groceries: string;

const usd = (amountMinor: number): Money => ({ amountMinor, currency: 'USD' });
const day = '2026-04-10';

async function created<T>(
  client: TestClient,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await client.post(path, body);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as T;
}

async function get<T>(client: TestClient, path: string): Promise<T> {
  const response = await client.get(path);
  expect(response.status).toBe(200);
  return response.body as T;
}

const account = (
  client: TestClient,
  name: string,
  openingBalance: Money,
  budgetGroup: 'on' | 'off',
) =>
  created<{ id: string }>(client, '/v1/accounts', {
    name,
    currency: openingBalance.currency,
    openingBalance,
    budgetGroup,
  }).then((a) => a.id);

const withdraw = (
  amount: Money,
  to = everyday,
  from = savings,
  occurredOn = day,
) =>
  created<Entry>(h.alice, '/v1/transactions', {
    kind: 'transfer',
    fromAccountId: from,
    toAccountId: to,
    sent: amount,
    occurredOn,
  }).then((t) => t.id);

const spend = (amount: Money, extra: object = {}, from = everyday) =>
  created<Entry>(h.alice, '/v1/transactions', {
    kind: 'expense',
    accountId: from,
    amount,
    categoryId: groceries,
    occurredOn: day,
    ...extra,
  }).then((t) => t.id);

const link = (withdrawalId: string, expenseId: string, amount: Money) =>
  h.alice.post('/v1/withdrawal-links', { withdrawalId, expenseId, amount });

const linked = async (withdrawalId: string, expenseId: string, m: Money) => {
  const response = await link(withdrawalId, expenseId, m);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as Link;
};

const today = () => get<Today>(h.alice, '/v1/today');
const entry = (id: string) => get<Entry>(h.alice, `/v1/transactions/${id}`);
const balances = async () =>
  (
    await get<{ accounts: { id: string; balance: Money }[] }>(
      h.alice,
      '/v1/accounts',
    )
  ).accounts
    .map((a) => [a.id, a.balance.amountMinor] as const)
    .sort();

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  everyday = await account(h.alice, 'Everyday', usd(500000), 'on');
  savings = await account(h.alice, 'Rainy day', usd(2000000), 'off');
  const categories = await get<{
    categories: { id: string; name: string }[];
  }>(h.alice, '/v1/categories');
  groceries =
    categories.categories.find((c) => c.name === 'Groceries')?.id ?? '';
  clock = new Date(`${day}T12:00:00Z`);
});

afterAll(async () => {
  await h.close();
});

describe('a link between a withdrawal and the purchase it paid for', () => {
  it('counts only the part paid from the budget, and removal restores it', async () => {
    const w = await withdraw(usd(30000));
    const e = await spend(usd(34000));
    const before = await today();
    // The ADR's example: $300 moved and $340 spent on one day count as $340.
    expect(before.spentToday).toEqual(usd(34000));
    const balancesBefore = await balances();
    // Fill the cache with the unlinked figures first.
    expect(await today()).toEqual(before);

    const made = await linked(w, e, usd(30000));
    expect(made).toMatchObject({
      withdrawalId: w,
      expenseId: e,
      amount: usd(30000),
      valid: true,
      reason: null,
    });

    const after = await today();
    expect(after.spentToday).toEqual(
      usd(before.spentToday.amountMinor - 30000),
    );
    expect(after.startOfDay.amountMinor).toBe(
      before.startOfDay.amountMinor - 30000,
    );
    // The budget as a whole: the $300 neither raised the start nor was spent.
    expect(after.available.amountMinor).toBe(before.available.amountMinor);
    expect(await balances()).toEqual(balancesBefore);
    expect((await entry(w)).withdrawalLinks).toEqual([made]);
    expect((await entry(e)).withdrawalLinks).toEqual([made]);

    const removed = await h.alice.delete(`/v1/withdrawal-links/${made.id}`);
    expect(removed.status).toBe(204);
    expect(await today()).toEqual(before);
    expect((await entry(w)).withdrawalLinks).toEqual([]);
    expect((await entry(e)).withdrawalLinks).toEqual([]);
    const again = await h.alice.delete(`/v1/withdrawal-links/${made.id}`);
    expect(again.status).toBe(404);
    expect((again.body as Problem).code).toBe('withdrawal_link_not_found');
  });

  it('keeps the removed row as history', async () => {
    const rows = await h.db
      .selectFrom('withdrawal_links')
      .select(['id', 'removed_at'])
      .execute();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.removed_at !== null)).toBe(true);
  });

  it('is only for the signed-in user and their own entries', async () => {
    const w = await withdraw(usd(1000));
    const e = await spend(usd(1500));
    const other = await h.bob.post('/v1/withdrawal-links', {
      withdrawalId: w,
      expenseId: e,
      amount: usd(1000),
    });
    expect(other.status).toBe(404);
    expect((other.body as Problem).code).toBe('withdrawal_missing');
    const anonymous = await fetch(`${h.server.url}/v1/withdrawal-links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(anonymous.status).toBe(401);
    const made = await linked(w, e, usd(1000));
    expect((await h.bob.delete(`/v1/withdrawal-links/${made.id}`)).status).toBe(
      404,
    );
    expect((await entry(w)).withdrawalLinks).toHaveLength(1);
  });
});

describe('refusals', () => {
  it('names why, with a status for each kind of refusal', async () => {
    const w = await withdraw(usd(20000));
    const e = await spend(usd(26000));
    const ok = await linked(w, e, usd(15000));

    const refuse = async (
      withdrawalId: string,
      expenseId: string,
      amount: Money,
      status: number,
      code: string,
    ) => {
      const response = await link(withdrawalId, expenseId, amount);
      expect(response.status, code).toBe(status);
      expect((response.body as Problem).code).toBe(code);
    };

    // 20,000 moved, 15,000 linked: 5,000 left on the withdrawal.
    await refuse(w, e, usd(5001), 409, 'withdrawal_exceeded');
    const w2 = await withdraw(usd(50000));
    // 26,000 paid, 15,000 linked: 11,000 left on the expense.
    await refuse(w2, e, usd(11001), 409, 'expense_exceeded');
    await refuse(w2, e, usd(0), 422, 'amount_not_positive');
    await refuse(
      w2,
      e,
      { amountMinor: 100, currency: 'EUR' },
      422,
      'currency_mismatch',
    );
    await refuse('no-such-entry', e, usd(100), 404, 'withdrawal_missing');
    await refuse(w2, 'no-such-entry', usd(100), 404, 'expense_missing');
    await refuse(e, e, usd(100), 422, 'withdrawal_not_transfer');
    await refuse(w2, w2, usd(100), 422, 'expense_not_expense');

    // A transfer that stays on budget or stays in savings is no withdrawal.
    const other = await account(h.alice, 'Bills pot', usd(100000), 'on');
    const onToOn = await withdraw(usd(1000), other, everyday);
    await refuse(onToOn, e, usd(100), 422, 'withdrawal_not_from_savings');

    // Spending from savings is not paid from the budget.
    const fromSavings = await spend(usd(2000), {}, savings);
    await refuse(w2, fromSavings, usd(100), 422, 'expense_not_on_budget');

    const outside = await spend(usd(2000), { funding: 'outside' });
    await refuse(w2, outside, usd(100), 422, 'expense_outside_funded');

    const rent = await spend(usd(3000));
    const bill = await created<{ id: string }>(h.alice, '/v1/bills', {
      name: 'Water',
      amount: usd(3000),
      dueDay: 10,
      accountId: everyday,
      categoryId: groceries,
    });
    await created(h.alice, `/v1/bills/${bill.id}/payments`, {
      dueOn: day,
      paidOn: day,
      transactionId: rent,
    });
    await refuse(w2, rent, usd(100), 422, 'expense_bill_payment');

    const gone = await spend(usd(4000));
    await created(h.alice, `/v1/transactions/${gone}/reverse`, {});
    await refuse(w2, gone, usd(100), 422, 'expense_undone');
    const goneW = await withdraw(usd(4000));
    await created(h.alice, `/v1/transactions/${goneW}/reverse`, {});
    await refuse(goneW, e, usd(100), 422, 'withdrawal_undone');

    // A refusal writes nothing.
    expect((await entry(e)).withdrawalLinks).toEqual([ok]);
    await h.alice.delete(`/v1/withdrawal-links/${ok.id}`);
  });

  it('rejects a malformed body', async () => {
    const response = await h.alice.post('/v1/withdrawal-links', {
      withdrawalId: 'x',
    });
    expect(response.status).toBe(400);
  });
});

describe('candidates', () => {
  it('lists the entries that can still take a link, nearest first, with room', async () => {
    const near = await withdraw(usd(30000), everyday, savings, '2026-04-09');
    const far = await withdraw(usd(80000), everyday, savings, '2026-03-28');
    const sameDay = await withdraw(usd(10000));
    const tooFar = await withdraw(usd(5000), everyday, savings, '2026-03-20');
    const e = await spend(usd(34000));

    const forExpense = await get<Candidates>(
      h.alice,
      `/v1/transactions/${e}/withdrawal-links/candidates`,
    );
    expect(forExpense.role).toBe('expense');
    // Earlier tests left other withdrawals about; look at this test's own.
    const mine = new Set([near, far, sameDay, tooFar]);
    const own = (list: Candidates) =>
      list.candidates.filter((c) => mine.has(c.transaction.id));
    expect(own(forExpense).map((c) => c.transaction.id)).toEqual([
      sameDay,
      near,
      far,
    ]);
    expect(own(forExpense).map((c) => c.room)).toEqual([
      usd(10000),
      usd(30000),
      usd(34000),
    ]);

    // Room shrinks as links use it up, and a full entry drops out.
    await linked(sameDay, e, usd(10000));
    const after = own(
      await get<Candidates>(
        h.alice,
        `/v1/transactions/${e}/withdrawal-links/candidates`,
      ),
    );
    expect(after.map((c) => c.transaction.id)).toEqual([near, far]);
    expect(after[0]?.room).toEqual(usd(24000));

    const forWithdrawal = await get<Candidates>(
      h.alice,
      `/v1/transactions/${near}/withdrawal-links/candidates`,
    );
    expect(forWithdrawal.role).toBe('withdrawal');
    const room = forWithdrawal.candidates.find((c) => c.transaction.id === e);
    expect(room?.room).toEqual(usd(24000));
  });

  it('has none for other entries, and 404 for an unknown one', async () => {
    const income = await created<Entry>(h.alice, '/v1/transactions', {
      kind: 'income',
      accountId: everyday,
      amount: usd(100),
      categoryId: (
        await get<{ categories: { id: string; name: string }[] }>(
          h.alice,
          '/v1/categories',
        )
      ).categories.find((c) => c.name === 'Paycheck')?.id,
    });
    const none = await get<Candidates>(
      h.alice,
      `/v1/transactions/${income.id}/withdrawal-links/candidates`,
    );
    expect(none).toMatchObject({ role: 'none', candidates: [] });
    const missing = await h.alice.get(
      '/v1/transactions/nope/withdrawal-links/candidates',
    );
    expect(missing.status).toBe(404);
  });
});

describe('edits, undo and restore', () => {
  const edit = (id: string, amount: Money) =>
    created<{
      reversal: Entry;
      replacement: Entry;
      notices: { code: string; reason: string; link: Link }[];
    }>(h.alice, `/v1/transactions/${id}/edit`, {
      kind: 'expense',
      accountId: everyday,
      amount,
      categoryId: groceries,
      occurredOn: day,
    });

  it('carries a link to the replacement while it still fits', async () => {
    const w = await withdraw(usd(7000));
    const e = await spend(usd(9000));
    const made = await linked(w, e, usd(7000));
    const before = await today();

    const edited = await edit(e, usd(9500));
    expect(edited.notices).toEqual([]);
    const [carried] = edited.replacement.withdrawalLinks;
    expect(carried).toMatchObject({
      withdrawalId: w,
      expenseId: edited.replacement.id,
      amount: usd(7000),
      valid: true,
    });
    expect(carried?.id).not.toBe(made.id);
    expect((await entry(w)).withdrawalLinks.map((l) => l.expenseId)).toEqual([
      edited.replacement.id,
    ]);
    // Only the 500 more the expense now took shows in what was spent.
    expect((await today()).spentToday.amountMinor).toBe(
      before.spentToday.amountMinor + 500,
    );
  });

  it('drops a link the replacement no longer fits, and says so', async () => {
    const w = await withdraw(usd(7000));
    const e = await spend(usd(9000));
    const made = await linked(w, e, usd(7000));

    const edited = await edit(e, usd(5000));
    expect(edited.replacement.withdrawalLinks).toEqual([]);
    expect(edited.notices).toHaveLength(1);
    expect(edited.notices[0]).toMatchObject({
      code: 'withdrawal_link_dropped',
      reason: 'expense_exceeded',
      link: { id: made.id, withdrawalId: w, expenseId: e },
    });
    expect((await entry(w)).withdrawalLinks).toEqual([]);
  });

  it('takes the effect out on undo and brings it back on restore', async () => {
    const w = await withdraw(usd(6000));
    const e = await spend(usd(8000));
    const unlinked = await today();
    await linked(w, e, usd(6000));
    const linkedFigures = await today();
    expect(linkedFigures.spentToday.amountMinor).toBe(
      unlinked.spentToday.amountMinor - 6000,
    );

    await created(h.alice, `/v1/transactions/${e}/reverse`, {});
    // The expense and the link are out; the withdrawal stands alone again.
    const undone = await today();
    expect(undone.spentToday.amountMinor).toBe(
      unlinked.spentToday.amountMinor - 8000,
    );
    expect((await entry(w)).withdrawalLinks).toMatchObject([
      { valid: false, reason: 'expense_undone' },
    ]);

    const restored = await created<Entry>(
      h.alice,
      `/v1/transactions/${e}/restore`,
      {},
    );
    expect(restored.withdrawalLinks).toMatchObject([
      { withdrawalId: w, expenseId: restored.id, valid: true },
    ]);
    expect(await today()).toEqual(linkedFigures);
  });

  it('keeps a link whose other entry is undone, for a later restore', async () => {
    const w = await withdraw(usd(2000));
    const e = await spend(usd(2500));
    await linked(w, e, usd(2000));
    await created(h.alice, `/v1/transactions/${w}/reverse`, {});
    const edited = await edit(e, usd(2600));
    expect(edited.notices).toEqual([]);
    expect(edited.replacement.withdrawalLinks).toMatchObject([
      { valid: false, reason: 'withdrawal_undone' },
    ]);
    const back = await created<Entry>(
      h.alice,
      `/v1/transactions/${w}/restore`,
      {},
    );
    expect(back.withdrawalLinks).toMatchObject([
      { expenseId: edited.replacement.id, valid: true },
    ]);
  });

  it('carries a link when a revert replaces the entry', async () => {
    const w = await withdraw(usd(1000));
    const e = await spend(usd(1200));
    await linked(w, e, usd(1000));
    const edited = await edit(e, usd(1300));
    const reverted = await created<{
      replacement: Entry;
      notices: unknown[];
    }>(h.alice, `/v1/transactions/${e}/revert`, {});
    expect(reverted.notices).toEqual([]);
    expect(reverted.replacement.withdrawalLinks).toMatchObject([
      { withdrawalId: w, valid: true },
    ]);
    expect((await entry(edited.replacement.id)).withdrawalLinks).toEqual([]);
  });
});

describe('currencies with other minor units', () => {
  it('links yen (no minor unit) and dinar (three)', async () => {
    for (const [code, opening, moved, paid] of [
      ['JPY', 500000, 3000, 3500],
      ['KWD', 5000000, 300500, 340250],
    ] as const) {
      const m = (amountMinor: number): Money => ({
        amountMinor,
        currency: code,
      });
      const wallet = await account(h.alice, `${code} wallet`, m(opening), 'on');
      const box = await account(h.alice, `${code} box`, m(opening), 'off');
      const w = await withdraw(m(moved), wallet, box);
      const e = await spend(m(paid), {}, wallet);
      const candidates = await get<Candidates>(
        h.alice,
        `/v1/transactions/${e}/withdrawal-links/candidates`,
      );
      expect(
        candidates.candidates.find((c) => c.transaction.id === w)?.room,
      ).toEqual(m(moved));
      const over = await link(w, e, m(moved + 1));
      expect((over.body as Problem).code).toBe('withdrawal_exceeded');
      await linked(w, e, m(moved));
      expect((await entry(e)).withdrawalLinks[0]?.amount).toEqual(m(moved));
    }
  });
});

describe('export and import', () => {
  it('writes the links that count, and an import brings them back', async () => {
    const w = await withdraw(usd(12000));
    const e = await spend(usd(15000));
    await linked(w, e, usd(12000));
    // A dormant link (its expense undone) is not exported: it counts for
    // nothing and an import would refuse it.
    const w2 = await withdraw(usd(1011));
    const e2 = await spend(usd(1111));
    await linked(w2, e2, usd(1011));
    await created(h.alice, `/v1/transactions/${e2}/reverse`, {});

    const exported = await h.alice.get('/v1/export?format=json');
    expect(exported.status).toBe(200);
    const bundle = bundleSchema.parse(exported.body);
    const refs = new Map(
      bundle.transactions.flatMap((t) =>
        t.ref === undefined ? [] : [[t.ref, t.kind] as const],
      ),
    );
    expect(bundle.withdrawalLinks.length).toBeGreaterThan(0);
    for (const item of bundle.withdrawalLinks) {
      expect(refs.get(item.withdrawal)).toBe('transfer');
      expect(refs.get(item.expense)).toBe('expense');
    }
    expect(
      bundle.withdrawalLinks.some((l) => l.amount.amountMinor === 12000),
    ).toBe(true);
    expect(
      bundle.withdrawalLinks.some((l) => l.amount.amountMinor === 1011),
    ).toBe(false);

    const imported = await h.bob.post('/v1/import', exported.body);
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    expect(imported.body).toMatchObject({
      withdrawalLinks: bundle.withdrawalLinks.length,
    });
    const figures = async (client: TestClient) => {
      const t = await get<Today>(client, '/v1/today');
      return {
        available: t.available,
        startOfDay: t.startOfDay,
        spentToday: t.spentToday,
        cycleSpent: t.cycleSpent,
      };
    };
    expect(await figures(h.bob)).toEqual(await figures(h.alice));
  });

  it('refuses a link that does not fit, pointing at it', async () => {
    const exported = await h.alice.get('/v1/export?format=json');
    const bundle = bundleSchema.parse(exported.body);
    const first = bundle.withdrawalLinks[0];
    expect(first).toBeDefined();
    const third = await startWithTwoUsers({ now: () => clock });
    try {
      await third.db
        .updateTable('users')
        .set({ created_at: started.toISOString() })
        .execute();
      const tooBig = {
        ...bundle,
        withdrawalLinks: [
          {
            ...first,
            amount: {
              ...first?.amount,
              amountMinor: (first?.amount.amountMinor ?? 0) + 1_000_000,
            },
          },
        ],
      };
      const response = await third.alice.post('/v1/import', tooBig);
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'withdrawal_exceeded',
        errors: [{ path: '/withdrawalLinks/0' }],
      });

      const wrongKind = {
        ...bundle,
        withdrawalLinks: [{ ...first, expense: first?.withdrawal }],
      };
      const unresolved = await third.alice.post('/v1/import', wrongKind);
      expect(unresolved.status).toBe(400);
      expect(unresolved.body).toMatchObject({ code: 'invalid_reference' });
    } finally {
      await third.close();
    }
  });
});
