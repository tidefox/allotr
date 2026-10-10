import { DEFAULT_PALETTE_THEME_ID, PALETTE_THEMES } from '@allotr/shared';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Settings, App and the theme editor, with made-up themes. The tests share
// one server per project and run in order.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
}

async function signIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
}

async function noSmallTargets(scope: Locator) {
  const small = await scope
    .locator('a, button, [role=button], input')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
  expect(small).toEqual([]);
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const canvas = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--canvas'),
  );

const shipped = PALETTE_THEMES.find(
  (theme) => theme.id === DEFAULT_PALETTE_THEME_ID.dark,
);

test('the App tab shows palette, palettes, interface and the planned notes', async ({
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

  await page.goto('/settings/app');
  for (const key of ['palette', 'themes', 'interface'] as const) {
    await expect(
      page.getByRole('region', {
        name: t(`settingsApp.${key}.title`),
        exact: true,
      }),
    ).toBeVisible();
  }
  const planned = page.getByRole('region', {
    name: t('settingsApp.planned.title'),
  });
  await expect(planned.getByText(t('settingsApp.planned.note'))).toHaveCount(4);
  await expect(page.getByText(t('settingsApp.themes.none'))).toBeVisible();
  await noSidewaysScroll(page);
  await noSmallTargets(page.locator('main'));
  await expectAccessible(page);
});

test('a custom palette is created, used and picked again from the menu', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  await page.goto('/settings/app');

  // The mode is set outright, so the new light palette shows on any device.
  await page
    .getByRole('radio', { name: t('settingsApp.palette.modes.light') })
    .click();
  await page
    .getByRole('link', { name: t('settingsApp.themes.create') })
    .click();
  await expect(page).toHaveURL(/\/settings\/themes\/new$/);
  await expect(
    page.getByRole('region', { name: t('themeEditor.neutrals.title') }),
  ).toBeVisible();
  await noSidewaysScroll(page);
  await noSmallTargets(page.locator('main'));
  await expectAccessible(page);

  await page.getByLabel(t('themes.name'), { exact: true }).fill('Tidepool');
  await page
    .getByLabel(t('themeEditor.hexLabel', { name: 'base' }))
    .fill('#fdf6e3');
  await expect(page.getByTestId('contrast-summary')).toContainText(
    t('themes.allPass'),
  );
  await page
    .getByRole('button', { name: t('themeEditor.saveAndUse'), exact: true })
    .click();

  await expect(page).toHaveURL(/\/settings\/app$/);
  await expect(page.getByText('Tidepool').first()).toBeVisible();
  await expect.poll(() => canvas(page)).toBe('#fdf6e3');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // It is still the palette after a reload, painted before the app starts.
  await page.reload();
  await expect.poll(() => canvas(page)).toBe('#fdf6e3');

  await page
    .getByRole('button', { name: new RegExp(t('settingsApp.palette.light')) })
    .click();
  await expect(
    page.getByRole('menuitemradio', {
      name: `Tidepool · ${t('settingsApp.palette.custom')}`,
    }),
  ).toBeChecked();
  await page.keyboard.press('Escape');
  await expectAccessible(page);
});

test('the editor saves from the keyboard and a palette is deleted from the keyboard', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  await page.goto('/settings/themes/new');
  const name = page.getByLabel(t('themes.name'), { exact: true });
  await name.fill('Quiet');
  await name.press('Enter');
  await expect(page).toHaveURL(/\/settings\/app$/);
  const edit = page.getByRole('link', {
    name: t('settingsApp.themes.editLabel', { name: 'Quiet' }),
  });
  await expect(edit).toBeVisible();

  // The name is refused when empty, with the reason shown.
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings\/themes\/[^/]+$/);
  const rename = page.getByLabel(t('themes.name'), { exact: true });
  await rename.fill('');
  await rename.press('Enter');
  await expect(page.getByRole('alert')).toContainText(t('themes.nameRequired'));
  await rename.fill('Quieter');
  await rename.press('Enter');
  await expect(page).toHaveURL(/\/settings\/app$/);
  await expect(page.getByText('Quieter', { exact: true })).toBeVisible();

  const remove = page.getByRole('button', {
    name: t('settingsApp.themes.deleteLabel', { name: 'Quieter' }),
  });
  await remove.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await noSmallTargets(sheet);
  await expectAccessible(page);
  await sheet
    .getByRole('button', { name: t('settingsApp.themes.confirmDelete') })
    .click();
  await expect(page.getByText('Quieter', { exact: true })).toHaveCount(0);
});

test('a theme file is imported into the editor, and a bad file says why', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  if (shipped === undefined) throw new Error('no default dark theme');
  const file = {
    format: 'allotr-theme',
    version: 2,
    scheme: shipped.scheme,
    palette: shipped.palette,
  };
  await signIn(page, origin);
  await page.goto('/settings/app');
  const input = page.locator('input[type=file]');

  await input.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": "world"}'),
  });
  await expect(page.getByTestId('import-problems')).toContainText(
    t('settings.appearance.importFailed', { file: 'broken.json' }),
  );

  await input.setInputFiles({
    name: 'dusk.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...file, name: 'Imported Dusk' })),
  });
  await expect(page).toHaveURL(/\/settings\/themes\/new$/);
  await expect(page.getByLabel(t('themes.name'), { exact: true })).toHaveValue(
    'Imported Dusk',
  );
  await page
    .getByRole('button', { name: t('themeEditor.save'), exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/app$/);
  await expect(page.getByText('Imported Dusk', { exact: true })).toBeVisible();
  await noSmallTargets(page.locator('main'));
  await expectAccessible(page);
});

test('density and key hints are kept on this device', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  await page.goto('/settings/app');
  await page
    .getByRole('radio', {
      name: t('settingsApp.interface.densities.comfortable'),
    })
    .click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-density',
    'comfortable',
  );
  const hints = page.getByRole('radiogroup', {
    name: t('settingsApp.interface.hints'),
  });
  await hints
    .getByRole('radio', { name: t('settingsApp.interface.off') })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-hints', 'off');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-density',
    'comfortable',
  );
  await expect(page.locator('html')).toHaveAttribute('data-hints', 'off');
  await noSmallTargets(page.locator('main'));
  await expectAccessible(page);
});
