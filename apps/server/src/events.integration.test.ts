import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { foldFacts } from '@allotr/core';
import { readEvents, SERVER_AUTHOR } from '@allotr/store';
import type { TestClient } from './testing/http-client.ts';
import { loadFixtures } from './testing/replay.ts';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// The event log against real SQLite and migrations (ADR 0032, ADR 0033):
// after a mix of writes, folding the user's events gives exactly the rows of
// the four fact tables, column for column. All names and amounts are made up.

let h: TwoUsers;
let aliceId: string;
let card: string;
let groceries: string;
let tagA: string;
let tagB: string;

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

function spend(amountMinor: number, extra: Record<string, unknown> = {}) {
  return {
    kind: 'expense',
    accountId: card,
    amount: usd(amountMinor),
    categoryId: groceries,
    occurredOn: '2026-03-10',
    ...extra,
  };
}

async function created(client: TestClient, path: string, body?: unknown) {
  const response = await client.post(path, body);
  expect(response.status, JSON.stringify(response.body)).toBeLessThan(300);
  return response.body as { id: string };
}

async function edit(id: string, body: Record<string, unknown>) {
  const response = await h.alice.post(`/v1/transactions/${id}/edit`, body);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as { replacement: { id: string } };
}

// The rows of the four tables for one user, in the reducer's shape.
async function rowsOf(userId: string) {
  const owned = { user_id: userId };
  const [transactions, postings, tags, replacements] = await Promise.all([
    h.db
      .selectFrom('transactions')
      .selectAll()
      .where('user_id', '=', owned.user_id)
      .execute(),
    h.db
      .selectFrom('postings')
      .selectAll()
      .where('user_id', '=', owned.user_id)
      .execute(),
    h.db
      .selectFrom('transaction_tags')
      .selectAll()
      .where('user_id', '=', owned.user_id)
      .execute(),
    h.db
      .selectFrom('transaction_replacements')
      .selectAll()
      .where('user_id', '=', owned.user_id)
      .execute(),
  ]);
  const text = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);
  return {
    transactions: transactions
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        occurredOn: row.occurred_on,
        occurredTime: row.occurred_time,
        createdAt: row.created_at,
        source: row.source,
        client: row.client,
        categoryId: row.category_id,
        note: row.note,
        funding: row.funding,
        reversesId: row.reverses_id,
        idempotencyKey: row.idempotency_key,
        impliedRate: row.fx_rate_implied,
        switchAccountId: row.switch_account_id,
        switchBudgetGroup: row.switch_budget_group,
      }))
      .sort((a, b) => text(a.id, b.id)),
    postings: postings
      .map((row) => ({
        id: row.id,
        accountId: row.account_id,
        amountMinor: row.amount_minor,
        currency: row.currency,
        categoryId: row.category_id,
        transactionId: row.transaction_id,
        position: row.position,
      }))
      .sort(
        (a, b) =>
          text(a.transactionId, b.transactionId) || a.position - b.position,
      ),
    tags: tags
      .map((row) => ({ transactionId: row.transaction_id, tagId: row.tag_id }))
      .sort(
        (a, b) =>
          text(a.transactionId, b.transactionId) || text(a.tagId, b.tagId),
      ),
    replacements: replacements
      .map((row) => ({
        originalId: row.original_id,
        replacementId: row.replacement_id,
      }))
      .sort((a, b) => text(a.originalId, b.originalId)),
  };
}

async function expectReplayToMatch(userId = aliceId) {
  const events = await readEvents(h.db, userId);
  const { held, ...folded } = foldFacts(events);
  expect(held).toEqual([]);
  expect(folded).toEqual(await rowsOf(userId));
}

beforeAll(async () => {
  h = await startWithTwoUsers();
  aliceId = await userIdOf(h.alice);
  card = (
    await created(h.alice, '/v1/accounts', {
      name: 'Card',
      currency: 'USD',
      openingBalance: usd(200_000),
    })
  ).id;
  const categories = (await h.alice.get('/v1/categories')).body as {
    categories: { id: string; name: string }[];
  };
  groceries =
    categories.categories.find((c) => c.name === 'Groceries')?.id ?? '';
  const times = await h.alice.patch('/v1/settings/ledger', {
    entryTimes: 'optional',
  });
  expect(times.status).toBe(200);
  tagA = (await created(h.alice, '/v1/tags', { name: 'weekly' })).id;
  tagB = (await created(h.alice, '/v1/tags', { name: 'treat' })).id;
});

afterAll(async () => {
  await h.close();
});

describe('events beside the fact tables', () => {
  afterAll(async () => {
    // The mix above exercised every column, so the equality checks mean it.
    const both = [
      ...foldFacts(await readEvents(h.db, aliceId)).transactions,
      ...foldFacts(await readEvents(h.db, await userIdOf(h.bob))).transactions,
    ];
    const used = (key: keyof (typeof both)[number], value?: unknown) =>
      both.some((t) =>
        value === undefined ? t[key] !== null : t[key] === value,
      );
    expect(used('occurredTime')).toBe(true);
    expect(used('categoryId')).toBe(true);
    expect(used('note')).toBe(true);
    expect(used('funding', 'outside')).toBe(true);
    expect(used('reversesId')).toBe(true);
    expect(used('impliedRate')).toBe(true);
    expect(used('switchAccountId')).toBe(true);
    expect(used('source', 'import')).toBe(true);
    expect(used('source', 'api')).toBe(true);
    expect(used('client', 'chat')).toBe(true);
  });

  it('logs the opening balance with its postings', async () => {
    const events = await readEvents(h.db, aliceId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'transaction.recorded',
      author: SERVER_AUTHOR,
      seq: 1,
      schema: 1,
      enc: null,
    });
    await expectReplayToMatch();
  });

  it('replays create, edit, reverse, restore, revert and tags to the same rows', async () => {
    const first = await created(
      h.alice,
      '/v1/transactions',
      spend(4250, {
        note: 'shop',
        tagIds: [tagA, tagB],
        occurredTime: '09:30',
      }),
    );
    await created(
      h.alice,
      '/v1/transactions',
      spend(900, { funding: 'outside' }),
    );
    const edited = await edit(first.id, spend(5000, { note: 'bigger shop' }));
    await edit(
      edited.replacement.id,
      spend(6000, { note: 'third', tagIds: [tagA] }),
    );
    await created(h.alice, `/v1/transactions/${first.id}/revert`);
    const undone = await created(
      h.alice,
      '/v1/transactions',
      spend(700, { tagIds: [tagB] }),
    );
    await created(h.alice, `/v1/transactions/${undone.id}/reverse`);
    await created(h.alice, `/v1/transactions/${undone.id}/restore`);
    // Splitting a logged expense with people is a reversal plus a replacement.
    const dinner = await created(
      h.alice,
      '/v1/transactions',
      spend(9000, { note: 'Dinner' }),
    );
    const split = await h.alice.post(
      `/v1/ious/from/${dinner.id}`,
      { people: [{ person: 'Sam Example', amount: usd(3000) }] },
      { 'idempotency-key': 'split-dinner' },
    );
    expect(split.status, JSON.stringify(split.body)).toBe(201);
    const chat = await h.alice.post('/v1/transactions', spend(310), {
      'x-allotr-client': 'chat',
    });
    expect(chat.status).toBe(201);
    const moved = await h.alice.patch(`/v1/accounts/${card}`, {
      budgetGroup: 'off',
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    await expectReplayToMatch();
  });

  it('replays a reconciliation adjustment', async () => {
    await created(h.alice, `/v1/accounts/${card}/reconcile`, {
      balance: usd(123_456),
      on: '2026-03-12',
    });
    await expectReplayToMatch();
  });

  it('replays a bundle import into a new ledger', async () => {
    const fixture = loadFixtures().find(
      (f) => f.name === 'multi-currency-month',
    );
    expect(fixture).toBeDefined();
    const imported = await h.bob.post('/v1/import', fixture?.bundle);
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    await expectReplayToMatch(await userIdOf(h.bob));
  });

  it('numbers events without gaps and keeps the clock moving forward', async () => {
    const events = await readEvents(h.db, aliceId);
    expect(events.map((e) => e.seq).sort((a, b) => a - b)).toEqual(
      events.map((_, index) => index + 1),
    );
    const bySeq = [...events].sort((a, b) => a.seq - b.seq);
    for (const [index, event] of bySeq.entries()) {
      const before = bySeq[index - 1];
      if (before !== undefined) expect(event.hlc > before.hlc).toBe(true);
    }
  });

  it('leaves another user with their own log', async () => {
    const bobId = await userIdOf(h.bob);
    const bob = await readEvents(h.db, bobId);
    const alice = await readEvents(h.db, aliceId);
    expect(bob.length).toBeGreaterThan(0);
    expect(new Set(bob.map((e) => e.ledgerId)).size).toBe(1);
    expect(bob[0]?.ledgerId).not.toBe(alice[0]?.ledgerId);
    expect(bob.map((e) => e.seq)).toEqual(bob.map((_, index) => index + 1));
  });

  it('refuses to change or delete an event', async () => {
    await expect(
      h.db.updateTable('events').set({ type: 'x' }).execute(),
    ).rejects.toThrow(/append-only/);
    await expect(h.db.deleteFrom('events').execute()).rejects.toThrow(
      /append-only/,
    );
  });
});
