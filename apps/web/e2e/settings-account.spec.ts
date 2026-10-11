import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';
import { totpFromUri } from './totp.ts';

// Settings · account and data. One instance per size: the first test creates
// the account, later ones sign in through the API. The last tests leave the
// instance requiring two-factor, then delete the account.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

async function apiSignIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
}

/** Lets a sheet's entrance finish, so a click does not chase a moving button. */
async function entered(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

async function smallTargets(page: Page) {
  return page
    .locator('main a, main button, main [role=button]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
}

test('two-factor is turned on with a code from the secret, then off', async ({
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

  await page.goto('/settings/account');
  const tile = page.getByRole('region', {
    name: t('settingsAccount.twoFactor.title'),
  });
  await expect(tile).toBeVisible();
  await expect(page.getByText(account.email)).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
  await expectAccessible(page);

  // By keyboard: focus the button, open the sheet, type the password.
  const turnOn = tile.getByRole('button', {
    name: t('settingsAccount.twoFactor.turnOn'),
  });
  await turnOn.focus();
  await page.keyboard.press('Enter');
  const password = page.getByLabel(t('settings.security.password'));
  await expect(password).toBeFocused();
  await expectAccessible(page);
  await page.keyboard.type(account.password);
  await page.keyboard.press('Enter');

  const secret = page.getByTestId('totp-secret');
  await expect(secret).toBeVisible();
  await expect(
    page.getByTestId('backup-codes').getByRole('listitem'),
  ).not.toHaveCount(0);
  const key = (await secret.innerText()).replaceAll(' ', '');
  await expectAccessible(page);
  await page
    .getByLabel(t('settings.security.code'))
    .fill(totpFromUri(`otpauth://totp/x?secret=${key}`));
  await page
    .getByRole('button', { name: t('settings.security.turnOnSubmit') })
    .click();
  await expect(tile.getByText(t('settings.security.turnedOn'))).toBeVisible();

  // Turning it off needs the password again.
  await tile
    .getByRole('button', { name: t('settingsAccount.twoFactor.turnOff') })
    .click();
  await page.getByLabel(t('settings.security.password')).fill(account.password);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: t('settings.security.turnOffSubmit') })
    .click();
  await expect(tile.getByText(t('settings.security.turnedOff'))).toBeVisible();
});

test('another session is listed and signed out after a confirmation', async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  const other = await browser.newContext({ baseURL: origin });
  const otherPage = await other.newPage();
  await apiSignIn(otherPage, origin);
  await other.close();

  await page.goto('/settings/account');
  const sessions = page.getByRole('region', {
    name: t('settingsAccount.sessions.title'),
  });
  await expect(
    sessions.getByText(t('settings.security.thisDevice')),
  ).toBeVisible();
  await expectAccessible(page);

  await sessions
    .getByRole('button', { name: t('settingsAccount.sessions.signOutAll') })
    .click();
  const dialog = page.getByRole('dialog', {
    name: t('settingsAccount.sessions.confirmAllTitle'),
  });
  await expect(dialog).toBeVisible();
  await entered(page);
  // Cancelling keeps the session.
  await dialog
    .getByRole('button', { name: t('settingsAccount.cancel') })
    .click();
  await expect(dialog).toBeHidden();
  await sessions
    .getByRole('button', { name: t('settingsAccount.sessions.signOutAll') })
    .click();
  await dialog
    .getByRole('button', { name: t('settingsAccount.sessions.confirmAction') })
    .click();
  await expect(
    sessions.getByText(t('settings.security.revokedOthers')),
  ).toBeVisible();
  await expect(
    sessions.getByRole('button', {
      name: t('settingsAccount.sessions.signOutAll'),
    }),
  ).toBeHidden();
});

test('an administrator changes registration and creates an invite link', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  await page.goto('/settings/account');
  const instance = page.getByRole('region', {
    name: t('settingsAccount.instance.title'),
  });
  await instance
    .getByRole('button', { name: t('settingsAccount.instance.registration') })
    .click();
  await page
    .getByRole('menuitemradio', { name: t('settings.instance.modes.open') })
    .click();
  await expect(
    instance.getByRole('button', {
      name: new RegExp(t('settings.instance.modes.open')),
    }),
  ).toBeVisible();
  const saved = await page.request.get('/v1/admin/settings');
  expect(
    ((await saved.json()) as { registrationMode: string }).registrationMode,
  ).toBe('open');
  await expectAccessible(page);

  const invites = page.getByRole('region', {
    name: t('settingsAccount.invites.title'),
  });
  await invites
    .getByRole('button', { name: t('settingsAccount.invites.create') })
    .click();
  const dialog = page.getByRole('dialog', {
    name: t('settingsAccount.invites.createTitle'),
  });
  await entered(page);
  await dialog
    .getByRole('button', { name: t('settingsAccount.invites.submit') })
    .click();
  await expect(
    dialog.getByLabel(t('settingsAccount.invites.linkField')),
  ).toHaveValue(/\/invite\//);
  await expectAccessible(page);
});

test('the data tab downloads an export and imports it into an empty ledger', async ({
  page,
  baseURL,
}, testInfo) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  await page.goto('/settings/data');
  const exports = page.getByRole('region', {
    name: t('settingsData.title'),
  });
  await expect(exports).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
  await expectAccessible(page);

  const download = page.waitForEvent('download');
  await exports
    .getByRole('link', { name: t('settings.export.json.label') })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  const saved = testInfo.outputPath('backup.json');
  await file.saveAs(saved);
  expect(readFileSync(saved, 'utf8').length).toBeGreaterThan(2);

  await page.locator('input[type=file]').setInputFiles(saved);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectAccessible(page);
  await dialog
    .getByRole('button', { name: t('settingsData.import.submit') })
    .click();
  await expect(
    dialog.getByRole('heading', { name: t('settingsData.import.doneTitle') }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: t('settingsData.import.done') })
    .click();
  await expect(dialog).toBeHidden();

  // The ledger is no longer empty, so a second import is refused.
  const today = await page.request.get('/v1/today');
  const { available } = (await today.json()) as {
    available: { currency: string };
  };
  await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency: available.currency,
    openingBalance: { amountMinor: 1000, currency: available.currency },
  });
  await page.reload();
  await page.locator('input[type=file]').setInputFiles(saved);
  await page
    .getByRole('button', { name: t('settingsData.import.submit') })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('a user held to enrolment reaches the account tab but no ledger data', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  const patch = await page.request.patch('/v1/admin/settings', {
    data: { requireTwoFactor: true },
    headers: { origin },
  });
  expect(patch.ok()).toBe(true);

  const ledgerCalls: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      /^\/v1\/(transactions|categories|tags|export|import|rates|settings\/ledger)/.test(
        path,
      )
    )
      ledgerCalls.push(path);
  });

  await page.goto('/settings/account');
  await expect(
    page.getByText(t('settingsAccount.twoFactor.required')),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto('/settings/data');
  await expect(page.getByText(t('settingsData.held'))).toBeVisible();
  await expect(
    page.getByRole('region', { name: t('settings.deleteAccount.title') }),
  ).toBeVisible();
  await expectAccessible(page);
  expect(ledgerCalls).toEqual([]);
});

test('deleting the account asks for the password and signs out', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  await page.goto('/settings/data');
  await page
    .getByRole('button', { name: t('settingsData.deleteAccount.action') })
    .click();
  const dialog = page.getByRole('dialog', {
    name: t('settings.deleteAccount.dialogTitle'),
  });
  await expect(dialog).toBeVisible();
  await expectAccessible(page);

  await dialog
    .getByLabel(t('settings.security.password'))
    .fill('not the password');
  await dialog
    .getByRole('button', { name: t('settings.deleteAccount.confirm') })
    .click();
  await expect(dialog.getByRole('alert')).toBeVisible();

  await dialog
    .getByLabel(t('settings.security.password'))
    .fill(account.password);
  await dialog
    .getByRole('button', { name: t('settings.deleteAccount.confirm') })
    .click();
  await expect(page).toHaveURL(/\/(sign-in|onboarding)/);
});
