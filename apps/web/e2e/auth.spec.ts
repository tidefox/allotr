import type { Money } from '@allotr/shared';
import { expect, test, type Page } from '@playwright/test';
import { formatMoney } from '../src/lib/format-money.ts';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';
import { totpFromUri } from './totp.ts';

// The signed-out screens and first-run setup, one instance per size. The
// first test creates the administrator through the UI and walks setup; the
// rest sign in, accept an invite and, last, turn on two-factor (after which
// the API sign-in the other tests use would need a code).
test.describe.configure({ mode: 'serial' });

const invited = {
  name: 'Alex Example',
  email: 'alex@example.test',
  password: 'another horse battery staple',
};

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return response;
}

async function apiSignIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
}

async function signOut(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-out', {});
}

async function smallTargets(page: Page) {
  return page
    .locator('main a, main button, main [role=button], main input')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
}

function step(page: Page, n: number, title: string) {
  return page.getByRole('heading', {
    level: 2,
    name: t('setup.step', { n, total: 5, title }),
  });
}

function stepBody(page: Page, n: number, title: string) {
  return page.getByRole('group', {
    name: t('setup.step', { n, total: 5, title }),
  });
}

async function fillSignIn(page: Page, email: string, password: string) {
  await page.getByLabel(t('signIn.email')).fill(email);
  await page.getByLabel(t('signIn.password')).fill(password);
  await page.getByRole('button', { name: t('signIn.submit') }).click();
}

test('a fresh instance onboards through the keyboard and walks setup', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole('heading', { level: 1, name: t('onboarding.title') }),
  ).toBeVisible();
  await expectAccessible(page);
  expect(await smallTargets(page)).toEqual([]);

  // Keyboard path: the first field has focus; Tab walks the form; Enter
  // submits. A short password is refused before anything is sent.
  const name = page.getByLabel(t('onboarding.name'));
  await expect(name).toBeFocused();
  await page.keyboard.type(account.name);
  await page.keyboard.press('Tab');
  await page.keyboard.type(account.email);
  await page.keyboard.press('Tab');
  await page.keyboard.type('short');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByLabel(t('onboarding.password'))).toBeFocused();

  await page.getByLabel(t('onboarding.password')).fill(account.password);
  await page.keyboard.press('Enter');

  // The first account lands on Dashboard, which sends a new user to setup.
  await expect(page).toHaveURL(/\/setup$/);
  await expect(step(page, 1, t('setup.region.title'))).toBeVisible();
  await expectAccessible(page);
  expect(await smallTargets(page)).toEqual([]);

  await page.getByRole('button', { name: t('setup.continue') }).click();
  await expect(stepBody(page, 2, t('setup.payday.title'))).toBeFocused();
  await expectAccessible(page);
  await page.getByRole('button', { name: t('setup.skip') }).click();

  await expect(stepBody(page, 3, t('setup.spending.title'))).toBeFocused();
  await page.getByLabel(t('accounts.create.name')).fill('Everyday');
  await page.getByLabel(/^Opening balance in/).fill('420');
  await page.getByRole('button', { name: t('accounts.create.save') }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Everyday' }),
  ).toBeVisible();
  await expectAccessible(page);
  expect(await smallTargets(page)).toEqual([]);

  // Back keeps what was saved.
  await page.getByRole('button', { name: t('setup.back') }).click();
  await expect(stepBody(page, 2, t('setup.payday.title'))).toBeFocused();
  await page.getByRole('button', { name: t('setup.continue') }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Everyday' }),
  ).toBeVisible();
  await page.getByRole('button', { name: t('setup.continue') }).click();

  await expect(stepBody(page, 4, t('setup.savings.title'))).toBeFocused();
  await page.getByRole('button', { name: t('setup.skip') }).click();

  await expect(stepBody(page, 5, t('setup.bills.title'))).toBeFocused();
  await page.getByLabel(t('settings.bills.name')).fill('Rent');
  await page.getByLabel(/^Amount in/).fill('650');
  await page
    .getByRole('button', { name: t('settings.bills.addSubmit') })
    .click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Rent' }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: t('setup.finish') }).click();

  // The first daily number is the server's, only formatted here.
  const first = page.getByTestId('first-number');
  await expect(first).toBeVisible();
  const today = (await (await page.request.get('/v1/today')).json()) as {
    leftToday: Money;
  };
  await expect(first).toHaveText(
    formatMoney(today.leftToday, 'symbol', 'en-US'),
  );
  await expectAccessible(page);
  await page.getByRole('button', { name: t('setup.reveal.go') }).click();
  await expect(page).toHaveURL(/\/$/);

  // Setup never comes back.
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/$/);
});

test('sign-in refuses a wrong password and returns to where the visitor was heading', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await page.goto('/budget/pools');
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fbudget%2Fpools$/);
  await expect(
    page.getByRole('heading', { level: 1, name: t('signIn.title') }),
  ).toBeVisible();
  await expectAccessible(page);
  expect(await smallTargets(page)).toEqual([]);

  await fillSignIn(page, account.email, 'not the password at all');
  await expect(page.getByRole('alert')).toBeVisible();
  await expectAccessible(page);

  // Keyboard: the email field has focus, Enter in the password submits.
  await page.getByLabel(t('signIn.email')).fill(account.email);
  await page.getByLabel(t('signIn.password')).fill(account.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/budget\/pools$/);

  await signOut(page, origin);
  await page.goto('/sign-in?deleted=true');
  await expect(page.getByText(t('signIn.deleted'))).toBeVisible();
  await expectAccessible(page);
});

test('an invite link signs up a new user, and a bad link says so', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  const invite = await post(page, origin, '/v1/invites', { expiresInDays: 1 });
  const { url } = (await invite.json()) as { url: string };
  const token = new URL(url).pathname.split('/').pop() ?? '';
  // Signing out of a two-factor account needs no code.
  await signOut(page, origin);

  await page.goto('/invite/not-a-real-token');
  await expect(
    page.getByRole('heading', { level: 1, name: t('invite.invalidTitle') }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('link', { name: t('invite.signIn') }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto(`/invite/${token}`);
  await expect(
    page.getByRole('heading', { level: 1, name: t('invite.title') }),
  ).toBeVisible();
  await expectAccessible(page);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByLabel(t('onboarding.name')).fill(invited.name);
  await page.getByLabel(t('onboarding.email')).fill(invited.email);
  await page.getByLabel(t('onboarding.password')).fill(invited.password);
  await page.getByRole('button', { name: t('onboarding.submit') }).click();

  // A new user starts with their own setup.
  await expect(page).toHaveURL(/\/setup$/);
  await expect(step(page, 1, t('setup.region.title'))).toBeVisible();
  await page
    .getByRole('button', { name: t('setup.skipRest'), exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);

  // The link was single use.
  await signOut(page, origin);
  await page.goto(`/invite/${token}`);
  await expect(
    page.getByRole('heading', { level: 1, name: t('invite.invalidTitle') }),
  ).toBeVisible();
});

test('two-factor sign-in takes a code, then a backup code', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  const enable = await post(page, origin, '/v1/auth/two-factor/enable', {
    password: account.password,
  });
  const { totpURI, backupCodes } = (await enable.json()) as {
    totpURI: string;
    backupCodes: string[];
  };
  await post(page, origin, '/v1/auth/two-factor/verify-totp', {
    code: totpFromUri(totpURI),
  });
  await signOut(page, origin);

  await page.goto('/sign-in');
  await fillSignIn(page, account.email, account.password);
  await expect(
    page.getByRole('heading', { level: 1, name: t('signIn.codeTitle') }),
  ).toBeVisible();
  const code = page.getByLabel(t('signIn.code'));
  await expect(code).toBeFocused();
  await expect(code).toHaveAccessibleDescription(t('signIn.codeHint'));
  await expectAccessible(page);
  expect(await smallTargets(page)).toEqual([]);

  await code.fill('000000');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(
    t('errors.codes.invalid_code'),
  );
  await expectAccessible(page);

  // Back to the password step.
  await page.getByRole('button', { name: t('signIn.otherAccount') }).click();
  await expect(page.getByLabel(t('signIn.email'))).toBeVisible();

  await fillSignIn(page, account.email, account.password);
  const [backup] = backupCodes;
  if (backup === undefined) throw new Error('no backup codes');
  await page.getByLabel(t('signIn.code')).fill(backup);
  await page.getByRole('button', { name: t('signIn.verify') }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
});
