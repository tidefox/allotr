import {
  ledgerSettingsSchema,
  todaySchema,
  updateLedgerSettingsBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  readLedgerSettings,
  updateLedgerSettings,
  todayFigures,
} from '@allotr/store';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Today's figures and the settings they depend on (FR-C2, FR-C4, FR-C5,
// FR-X2).

const signedIn = { 401: unauthenticated, 403: forbidden };

const todayRoute = createRoute({
  method: 'get',
  path: '/v1/today',
  tags: ['Today'],
  summary: "Today's figures",
  description:
    "Derived from the ledger by entry date for the user's calendar day, so a back-dated entry changes them at once. Amounts are in the default currency; currencies without a rate are left out and listed in `missingRates`. `allocation` splits the open cycle's on-budget start into bills paid, money moved to savings (transfers into off-budget accounts and accounts moved into a savings pool), spending, money set aside, free money and `other` (what none of those explain, such as money lent; often zero, may be negative); the six parts add up to `start` exactly. `allocation.shareBp` gives each part's share of `start` in basis points (10 000 is all of it; 0 for a part that is not positive), rounded by largest remainder so the shares add up to 10 000 when no part is negative. `reserved` is the money set aside for bills and for what is owed to people; `reservedBills` and `reservedIous` are its two parts and add up to it.",
  responses: {
    200: json(todaySchema, "Today's figures."),
    ...signedIn,
  },
});

const getSettingsRoute = createRoute({
  method: 'get',
  path: '/v1/settings/ledger',
  tags: ['Settings'],
  summary: 'Ledger settings',
  responses: {
    200: json(ledgerSettingsSchema, 'Current ledger settings.'),
    ...signedIn,
  },
});

const patchSettingsRoute = createRoute({
  method: 'patch',
  path: '/v1/settings/ledger',
  tags: ['Settings'],
  summary: 'Change ledger settings',
  description:
    'Switching the default currency changes how figures are reported, never the entries. `paydayRule` is `fixed` (the default: `paydayDay` of the month), `last-working-day` (the last Monday to Friday of the month) or `manual` (set `paydayOverride` each cycle; `paydayDay` stands in until then). `paydayOverride: null` clears the override.',
  request: {
    body: {
      content: {
        'application/json': { schema: updateLedgerSettingsBodySchema },
      },
    },
  },
  responses: {
    200: json(ledgerSettingsSchema, 'Settings after the change.'),
    400: problemResponse(
      'The request is invalid, or the locale (`invalid_locale`) or time zone (`invalid_time_zone`) is unknown.',
    ),
    ...signedIn,
  },
});

export function registerTodayRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/today', requireUser(deps));
  app.use('/v1/settings/*', requireUser(deps));

  app.openapi(todayRoute, async (c) =>
    c.json(await todayFigures(db, c.get('user').id, now()), 200),
  );

  app.openapi(getSettingsRoute, async (c) =>
    c.json(await readLedgerSettings(db, c.get('user').id), 200),
  );

  app.openapi(patchSettingsRoute, async (c) =>
    c.json(
      await updateLedgerSettings(
        db,
        c.get('user').id,
        c.req.valid('json'),
        now(),
      ),
      200,
    ),
  );
}
