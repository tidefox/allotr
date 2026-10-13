// Replaces apps/server/src/auth/auth.ts so Better Auth stays out of the
// bundle. Only the constants and countUsers are needed by the routes.
import type { Kysely } from 'kysely';
import type { DB } from '@allotr/store';

export const AUTH_BASE_PATH = '/v1/auth';
export const CLIENT_IP_HEADER = 'x-allotr-client-ip';

export async function countUsers(db: Kysely<DB>): Promise<number> {
  const row = await db
    .selectFrom('users')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return row.count;
}

export interface Auth {
  api: { getSession(args: { headers: Headers }): Promise<unknown> };
  handler(request: Request): Promise<Response>;
}
