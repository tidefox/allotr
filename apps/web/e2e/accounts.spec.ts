import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Accounts screen with made-up data: stats, the pool tree, sub-tabs,
// selection in the URL, and the rename and move actions.
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

function actionsOf(page: Page, name: string) {
  return page.getByRole('button', {
    name: t('accountsScreen.list.actionsOf', { name }),
  });
}

function rowOf(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

test('the tree groups accounts by pool and credit, with stats', async ({
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
  const today = await page.request.get('/v1/today');
  const currency = ((await today.json()) as { available: { currency: string } })
    .available.currency;
  const usd = (amountMinor: number) => ({ amountMinor, currency });

  await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency,
    openingBalance: usd(250_000),
  });
  await post(page, origin, '/v1/accounts', {
    name: 'Nest egg',
    currency,
    budgetGroup: 'off',
    openingBalance: usd(900_000),
  });
  await post(page, origin, '/v1/accounts', {
    name: 'Visa',
    kind: 'liability',
    currency,
    openingBalance: usd(-45_000),
    // 2,000.00 limit with 450.00 owed leaves 1,550.00 free.
    creditLimit: usd(200_000),
    dueDay: 15,
  });
  await post(page, origin, '/v1/pools', { name: 'Trip', kind: 'spending' });

  await page.goto('/accounts');
  await expect(rowOf(page, 'Everyday')).toBeVisible();
  await expect(rowOf(page, 'Nest egg')).toBeVisible();
  await expect(rowOf(page, 'Visa')).toBeVisible();
  // Credit is its own group, not part of a pool.
  await expect(
    page.getByRole('button', {
      name: t('accountsScreen.list.fold', {
        name: t('accountsScreen.list.credit'),
      }),
    }),
  ).toBeVisible();
  await expect(
    page.getByText(t('accountsScreen.stats.netWorth')),
  ).toBeVisible();
  // Each new account is flagged due for a reconcile by the server.
  await expect(
    page.getByText(t('accountsScreen.stats.reconcileLooks', { count: 3 })),
  ).toBeVisible();
  // Credit owed is the server's total, signed as the debt it is.
  await expect(
    page.getByText('−$450.00', { exact: true }).first(),
  ).toBeVisible();
  // The credit stat names the server's limit total and draws a left-of bar.
  await expect(
    page.getByText(
      t('accountsScreen.stats.creditSubLimit', {
        count: 1,
        limit: '$2,000.00',
      }),
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('progressbar', {
      name: t('accountsScreen.stats.creditBar', {
        free: '$1,550.00',
        limit: '$2,000.00',
      }),
    }),
  ).toBeVisible();
  await expectAccessible(page);

  const small = await page
    .locator('main a, main button, main [role=button]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
  expect(small).toEqual([]);
});

test('a sub-tab narrows the tree', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts/credit');
  await expect(rowOf(page, 'Visa')).toBeVisible();
  await expect(rowOf(page, 'Everyday')).toHaveCount(0);

  await page.goto('/accounts/off-budget');
  await expect(rowOf(page, 'Nest egg')).toBeVisible();
  await expect(rowOf(page, 'Visa')).toHaveCount(0);
});

test('choosing an account puts it in the address', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  await rowOf(page, 'Everyday').click();
  await expect(page).toHaveURL(/\/accounts\?account=/);
});

test('rename changes the name in the tree', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  await actionsOf(page, 'Everyday').click();
  await page
    .getByRole('menuitem', { name: t('accountsScreen.menu.rename') })
    .click();
  const field = page.getByRole('textbox', {
    name: t('accountsScreen.rename.name'),
  });
  await field.fill('Daily spending');
  await page
    .getByRole('button', { name: t('accountsScreen.rename.save') })
    .click();
  await expect(rowOf(page, 'Daily spending')).toBeVisible();
  await expect(rowOf(page, 'Everyday')).toHaveCount(0);
});

test('an empty name is refused', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  await actionsOf(page, 'Daily spending').click();
  await page
    .getByRole('menuitem', { name: t('accountsScreen.menu.rename') })
    .click();
  await page
    .getByRole('textbox', { name: t('accountsScreen.rename.name') })
    .fill('  ');
  await page
    .getByRole('button', { name: t('accountsScreen.rename.save') })
    .click();
  await expect(
    page.getByText(t('accountsScreen.rename.nameRequired')),
  ).toBeVisible();
});

test('moving an account to another pool regroups it, by keyboard', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  const trigger = actionsOf(page, 'Daily spending');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitem', { name: t('accountsScreen.menu.move') })
    .focus();
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: /Pool/ }).click();
  await page.getByRole('menuitemradio', { name: 'Trip' }).click();
  await page
    .getByRole('button', { name: t('accountsScreen.move.save') })
    .click();
  await expect(
    page.getByRole('button', {
      name: t('accountsScreen.list.fold', { name: 'Trip' }),
    }),
  ).toBeVisible();
});

test('+ account opens a sheet, adds an account and refuses a taken name', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  const add = page.getByRole('button', {
    name: t('accountsScreen.add.name'),
    exact: true,
  });
  await expect(add).toBeVisible();
  await add.click();

  const sheet = page.getByRole('dialog', {
    name: t('accountsScreen.add.title'),
  });
  await expect(sheet).toBeVisible();
  const name = sheet.getByRole('textbox', { name: t('accounts.create.name') });
  await expect(name).toBeFocused();
  await expectAccessible(page);

  // An empty name is refused before anything is sent.
  await sheet.getByRole('button', { name: t('accounts.create.save') }).click();
  await expect(
    sheet.getByText(t('accounts.create.errors.nameRequired')),
  ).toBeVisible();

  // A name another open account has is refused by the server.
  await name.fill('Nest egg');
  await sheet.getByRole('button', { name: t('accounts.create.save') }).click();
  await expect(
    sheet.getByText(t('accounts.create.errors.nameTaken')),
  ).toBeVisible();

  await name.fill('Holiday jar');
  await sheet.getByRole('button', { name: t('accounts.create.save') }).click();
  await expect(sheet).toBeHidden();
  await expect(rowOf(page, 'Holiday jar')).toBeVisible();
  await expect(page).toHaveURL(/account=/);
});

test('a credit account shows its limit, what is free and when it is due', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts/credit');
  // The group header says what the limit total is.
  await expect(
    page.getByText(t('accountsScreen.list.owedLimit', { limit: '$2,000.00' })),
  ).toBeVisible();
  await rowOf(page, 'Visa').click();
  await expect(
    page.getByText(
      t('accountDetail.credit.free', {
        free: '$1,550.00',
        limit: '$2,000.00',
      }),
    ),
  ).toBeVisible();
  await expect(
    page.getByText(t('accountDetail.fields.limit'), { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(t('accountDetail.fields.due'), { exact: true }),
  ).toBeVisible();
  await expectAccessible(page);
});

test('editing an account sets its icon and colour, and a card its limit and due day', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  await actionsOf(page, 'Visa').click();
  await page
    .getByRole('menuitem', { name: t('accountsScreen.menu.rename') })
    .click();
  const sheet = page.getByRole('dialog');
  // The input is hidden inside its swatch; people press the swatch.
  const swatch = (name: string) =>
    sheet.getByRole('radio', { name }).locator('xpath=ancestor::label');
  await swatch(
    t('settingsCategories.style.colourOption', { number: 4 }),
  ).click();
  await swatch('Piggy bank').click();
  await expect(sheet.getByRole('radio', { name: 'Piggy bank' })).toBeChecked();
  await sheet
    .getByRole('textbox', {
      name: t('accountsScreen.edit.limit', { currency: 'USD' }),
    })
    .fill('3000');
  await sheet
    .getByRole('textbox', { name: t('accountsScreen.edit.dueDay') })
    .fill('40');
  await sheet
    .getByRole('button', { name: t('accountsScreen.rename.save') })
    .click();
  await expect(
    sheet.getByText(t('accountsScreen.edit.errors.dayInvalid')),
  ).toBeVisible();
  await sheet
    .getByRole('textbox', { name: t('accountsScreen.edit.dueDay') })
    .fill('31');
  await expectAccessible(page);
  await sheet
    .getByRole('button', { name: t('accountsScreen.rename.save') })
    .click();
  await expect(sheet).toBeHidden();

  // The stored colour paints the row's icon; the server holds the rest.
  await expect(rowOf(page, 'Visa').locator('svg.text-series-4')).toHaveCount(1);
  await expect
    .poll(async () => {
      const list = (await (await page.request.get('/v1/accounts')).json()) as {
        accounts: {
          name: string;
          colour: string | null;
          icon: string | null;
          creditLimit: { amountMinor: number } | null;
          dueDay: number | null;
        }[];
      };
      const visa = list.accounts.find((a) => a.name === 'Visa');
      return [
        visa?.colour,
        visa?.icon,
        visa?.creditLimit?.amountMinor,
        visa?.dueDay,
      ];
    })
    .toEqual(['series-4', 'piggy-bank', 300_000, 31]);
});

// Last: it adds to the limit total the credit tests above assert on.
test('+ account can add a credit account with a limit and a due day', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  await page
    .getByRole('button', { name: t('accountsScreen.add.name'), exact: true })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('accountsScreen.add.title'),
  });
  // The limit and due day appear only for a credit account.
  await expect(
    sheet.getByRole('textbox', { name: t('accounts.create.dueDay') }),
  ).toHaveCount(0);
  await sheet
    .getByRole('button', { name: new RegExp(t('accounts.create.kind')) })
    .click();
  await page
    .getByRole('menuitemradio', { name: t('accounts.create.kinds.liability') })
    .click();

  await sheet
    .getByRole('textbox', { name: t('accounts.create.name') })
    .fill('Travel card');
  await sheet
    .getByRole('textbox', {
      name: t('accounts.create.limit', { currency: 'USD' }),
    })
    .fill('3000');
  await sheet
    .getByRole('textbox', {
      name: t('accounts.create.minPayment', { currency: 'USD' }),
    })
    .fill('45');
  await sheet
    .getByRole('textbox', { name: t('accounts.create.subtype') })
    .fill('travel rewards');
  await sheet
    .getByRole('textbox', { name: t('accounts.create.dueDay') })
    .fill('40');
  await sheet.getByRole('button', { name: t('accounts.create.save') }).click();
  await expect(
    sheet.getByText(t('accounts.create.errors.dayInvalid')),
  ).toBeVisible();
  await expectAccessible(page);

  await sheet
    .getByRole('textbox', { name: t('accounts.create.dueDay') })
    .fill('12');
  await sheet.getByRole('button', { name: t('accounts.create.save') }).click();
  await expect(sheet).toBeHidden();
  await expect(rowOf(page, 'Travel card')).toBeVisible();
  await page.goto('/accounts/credit');
  await rowOf(page, 'Travel card').click();
  await expect(
    page.getByText(t('accountDetail.fields.due'), { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(t('accountDetail.fields.minPayment'), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('$45.00')).toBeVisible();
  await expect(page.getByText(/travel rewards/)).toBeVisible();
});
