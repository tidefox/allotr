import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Settings, money and policies tabs. One instance per size: the first test
// creates the account, later ones sign in through the API.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

async function signIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
}

async function tooSmall(page: Page) {
  return page
    .locator('main a, main button, main [role=button]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
}

const region = (page: Page, name: string) => page.getByRole('region', { name });

async function ledger(page: Page) {
  const response = await page.request.get('/v1/settings/ledger');
  return (await response.json()) as Record<string, unknown> & {
    defaultCurrency: string;
  };
}

test('the money tab shows every group and passes the checks', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/onboarding', account);
  const skip = await page.request.put('/v1/settings/setup', {
    data: setupSkipped,
    headers: { origin },
  });
  expect(skip.ok()).toBe(true);

  await page.goto('/settings/money');
  await expect(region(page, t('settingsMoney.title'))).toBeVisible();
  await expect(region(page, t('settingsMoney.rates.title'))).toBeVisible();
  await expect(
    region(page, t('settingsMoney.title')).getByText(
      t('settingsShell.planned'),
    ),
  ).toBeVisible();
  await expectAccessible(page);
  expect(await tooSmall(page)).toEqual([]);
});

test('a menu row saves by keyboard', async ({ page, baseURL }) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  await page.goto('/settings/money');
  const row = page.getByRole('button', {
    name: new RegExp(t('settingsMoney.plan.period')),
  });
  await row.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitemradio', { name: t('settingsMoney.plan.periods.month') })
    .click();
  await expect(row).toContainText(t('settingsMoney.plan.periods.month'));
  await expect
    .poll(async () => (await ledger(page)).budgetPeriod)
    .toBe('month');
  await expectAccessible(page);
});

test('this cycle’s payday is set and cleared in a sheet', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  await page.goto('/settings/money');
  const open = () =>
    page
      .getByRole('button', {
        name: new RegExp(t('settingsMoney.payday.override')),
      })
      .click();
  await open();
  const sheet = page.getByRole('dialog', {
    name: t('settingsMoney.payday.overrideTitle'),
  });
  const field = sheet.getByLabel(t('settingsMoney.payday.overrideLabel'));
  await field.fill('soon');
  await sheet
    .getByRole('button', { name: t('settingsMoney.common.save') })
    .click();
  await expect(
    sheet.getByText(t('settingsMoney.payday.overrideInvalid')),
  ).toBeVisible();
  await expectAccessible(page);
  await field.fill('2099-01-15');
  await sheet
    .getByRole('button', { name: t('settingsMoney.common.save') })
    .click();
  await expect(sheet).toBeHidden();
  await expect
    .poll(async () => (await ledger(page)).paydayOverride)
    .toBe('2099-01-15');

  await open();
  await sheet
    .getByRole('button', { name: t('settingsMoney.payday.overrideClear') })
    .click();
  await expect(sheet).toBeHidden();
  await expect.poll(async () => (await ledger(page)).paydayOverride).toBeNull();
});

test('a rate is added in a sheet and deleted', async ({ page, baseURL }) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  const quote = (await ledger(page)).defaultCurrency;
  const base = quote === 'EUR' ? 'GBP' : 'EUR';
  await page.goto('/settings/money');
  const rates = region(page, t('settingsMoney.rates.title'));
  await expect(rates.getByText(t('settingsMoney.rates.none'))).toBeVisible();
  await rates
    .getByRole('button', { name: t('settingsMoney.rates.add') })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('settingsMoney.rates.addTitle'),
  });
  await sheet.getByRole('button', { name: /From currency/ }).click();
  await page
    .getByRole('menuitemradio', { name: new RegExp(`^${base}`) })
    .click();
  await sheet.getByLabel(/for 1 /).fill('0');
  await sheet
    .getByRole('button', { name: t('settingsMoney.rates.save') })
    .click();
  await expect(
    sheet.getByText(t('settingsMoney.rates.errors.rate')),
  ).toBeVisible();
  await sheet.getByLabel(/for 1 /).fill('1.25');
  await sheet
    .getByRole('button', { name: t('settingsMoney.rates.save') })
    .click();
  await expect(sheet).toBeHidden();
  const item = rates.getByRole('listitem');
  await expect(item).toContainText(`1 ${base} = 1.25 ${quote}`);
  await expectAccessible(page);
  expect(await tooSmall(page)).toEqual([]);

  await item.getByRole('button', { name: /Delete rate/ }).click();
  await expect(rates.getByText(t('settingsMoney.rates.none'))).toBeVisible();
});

test('the policies tab edits a number and manages tags', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  await page.goto('/settings/policies');
  const plan = region(page, t('settingsPolicies.title'));
  await plan
    .getByRole('button', {
      name: new RegExp(t('settingsPolicies.payday.months')),
    })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('settingsPolicies.payday.monthsTitle'),
  });
  const field = sheet.getByLabel(t('settingsPolicies.payday.monthsLabel'));
  await field.fill('99');
  await sheet
    .getByRole('button', { name: t('settingsMoney.common.save') })
    .click();
  await expect(
    sheet.getByText(t('settingsPolicies.payday.monthsInvalid')),
  ).toBeVisible();
  await field.fill('9');
  await sheet
    .getByRole('button', { name: t('settingsMoney.common.save') })
    .click();
  await expect(sheet).toBeHidden();
  await expect(plan).toContainText(
    t('settingsPolicies.payday.monthsValue', { count: 9 }),
  );

  const tags = region(page, t('settingsPolicies.tags.title'));
  await tags
    .getByRole('button', { name: t('settingsPolicies.tags.add') })
    .click();
  const add = page.getByRole('dialog', {
    name: t('settingsPolicies.tags.addTitle'),
  });
  await add.getByLabel(t('settingsPolicies.tags.name')).fill('Holiday');
  await add
    .getByRole('button', { name: t('settingsPolicies.tags.submitAdd') })
    .click();
  await expect(tags.getByText('Holiday')).toBeVisible();
  await tags
    .getByRole('button', {
      name: t('settingsPolicies.tags.renameLabel', { name: 'Holiday' }),
    })
    .click();
  const rename = page.getByRole('dialog', {
    name: t('settingsPolicies.tags.renameTitle', { name: 'Holiday' }),
  });
  await rename.getByLabel(t('settingsPolicies.tags.name')).fill('Trip');
  await rename
    .getByRole('button', { name: t('settingsMoney.common.save') })
    .click();
  await expect(tags.getByText('Trip')).toBeVisible();
  await expectAccessible(page);
  expect(await tooSmall(page)).toEqual([]);
});

test('a policies menu row saves by keyboard', async ({ page, baseURL }) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  await page.goto('/settings/policies');
  const row = page.getByRole('button', {
    name: new RegExp(t('settingsPolicies.reports.cards')),
  });
  await row.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitemradio', {
      name: t('settingsPolicies.reports.cardsOptions.all'),
    })
    .click();
  await expect.poll(async () => (await ledger(page)).categoryCards).toBe('all');
});
