import { deterministicId } from '@allotr/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Sign-up and invites seed the new ledger with deterministic ids (ADR 0034).

let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers();
});

afterAll(async () => {
  await h.close();
});

describe('a user created through sign-up', () => {
  it.each(['alice', 'bob'] as const)(
    'has a ledger id and the seed for it (%s)',
    async (who) => {
      const userId = await userIdOf(h[who]);
      const user = await h.db
        .selectFrom('users')
        .select('ledger_id')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      const categories = await h.db
        .selectFrom('categories')
        .select(['id', 'name', 'parent_id'])
        .where('user_id', '=', userId)
        .execute();
      expect(categories).toHaveLength(17);
      expect(categories.find((c) => c.name === 'Food')?.id).toBe(
        deterministicId(user.ledger_id, 'starter-category:/Food'),
      );
      const pools = await h.db
        .selectFrom('pools')
        .select('id')
        .where('user_id', '=', userId)
        .execute();
      expect(pools.map((p) => p.id).sort()).toEqual(
        [
          deterministicId(user.ledger_id, 'pool:budget'),
          deterministicId(user.ledger_id, 'pool:savings'),
        ].sort(),
      );
      const buffer = await h.db
        .selectFrom('budgets')
        .select('id')
        .where('user_id', '=', userId)
        .where('kind', '=', 'buffer')
        .execute();
      expect(buffer.map((b) => b.id)).toEqual([
        deterministicId(user.ledger_id, 'budget:buffer'),
      ]);
    },
  );

  it('does not show the ledger id to the client', async () => {
    const session = await h.alice.get('/v1/session');
    expect(JSON.stringify(session.body)).not.toContain('ledger');
  });

  it('gives each user their own ledger id', async () => {
    const rows = await h.db.selectFrom('users').select('ledger_id').execute();
    expect(new Set(rows.map((r) => r.ledger_id)).size).toBe(rows.length);
  });
});
