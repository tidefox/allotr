import {
  createdWithdrawalLinkSchema,
  createWithdrawalLinkBodySchema,
  idParamSchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { createWithdrawalLink, removeWithdrawalLink } from '@allotr/store';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Withdrawal links (ADR 0038): part of a savings withdrawal tied to the
// expense it paid for. A link is a setting on the two entries; their
// postings never change. Links show on both entries as `withdrawalLinks`,
// and `GET /v1/transactions/{id}/withdrawal-links/candidates` lists what a
// picker can offer.

const tags = ['Withdrawal links'];
const signedIn = { 401: unauthenticated, 403: forbidden };

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/withdrawal-links',
  tags,
  summary: 'Link a savings withdrawal to the expense it paid for',
  description:
    'For the budget (the daily number, spending, pace, budgets and cover), the linked amount is read as if the expense had been paid straight from the savings account, and the withdrawal had not moved it. Balances, history and exports keep the real postings. A refusal carries one of the problem codes `withdrawal_missing`, `expense_missing` (404), `withdrawal_exceeded`, `expense_exceeded` (409: the links on one side would add up to more than it moved or paid), or `withdrawal_undone`, `withdrawal_not_transfer`, `withdrawal_not_from_savings`, `expense_undone`, `expense_not_expense`, `expense_outside_funded`, `expense_bill_payment`, `expense_not_on_budget`, `amount_not_positive`, `currency_mismatch` (422).',
  request: {
    body: {
      content: {
        'application/json': { schema: createWithdrawalLinkBodySchema },
      },
    },
  },
  responses: {
    201: json(createdWithdrawalLinkSchema, 'The new link.'),
    400: problemResponse('The request is invalid.'),
    ...signedIn,
    404: problemResponse('There is no such withdrawal or expense.'),
    409: problemResponse(
      'The links on the withdrawal or on the expense would add up to more than it moved or paid.',
    ),
    422: problemResponse(
      'The entries cannot be linked; the problem code says why.',
    ),
  },
});

const removeRouteDef = createRoute({
  method: 'delete',
  path: '/v1/withdrawal-links/{id}',
  tags,
  summary: 'Remove a withdrawal link',
  description:
    'The figures go back to reading the two entries as recorded. The link is kept as removed, not deleted.',
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Removed.' },
    ...signedIn,
    404: problemResponse('There is no such link, or it was removed already.'),
  },
});

export function registerWithdrawalLinkRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/withdrawal-links', requireUser(deps));
  app.use('/v1/withdrawal-links/*', requireUser(deps));

  app.openapi(createRouteDef, async (c) =>
    c.json(
      await createWithdrawalLink(
        db,
        c.get('user').id,
        c.req.valid('json'),
        now(),
      ),
      201,
    ),
  );

  app.openapi(removeRouteDef, async (c) => {
    await removeWithdrawalLink(
      db,
      c.get('user').id,
      c.req.valid('param').id,
      now(),
    );
    return c.body(null, 204);
  });
}
