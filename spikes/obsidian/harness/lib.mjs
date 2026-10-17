import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium, webkit } from 'playwright';

export const ORIGIN = 'https://harness.test';
const here = import.meta.dirname;
export const buildDir = resolve(here, '../../../docs/drafts/obsidian/build/allotr');
export const shotDir = resolve(here, '../../../docs/drafts/obsidian/build/screenshots');
export const engines = { chromium, webkit };

/** A page on a fake https origin; every request is answered from disk. */
export async function newHarnessPage(browser, { viewport, query = '', context: contextOptions = {}, requests = [] } = {}) {
  const context = await browser.newContext({ viewport: viewport ?? { width: 1280, height: 800 }, ...contextOptions });
  await context.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/' || url.pathname === '/index.html')
      return route.fulfill({ contentType: 'text/html', body: readFileSync(join(here, 'harness.html')) });
    if (url.pathname === '/fake-obsidian.js')
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(here, 'fake-obsidian.js')) });
    if (url.pathname === '/main.js')
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(buildDir, 'main.js')) });
    return route.fulfill({ status: 404, body: 'not found' });
  });
  const page = await context.newPage();
  page.on('request', (r) => requests.push(r.url()));
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.logs = logs;
  page.setDefaultTimeout(20000);
  await page.goto(`${ORIGIN}/${query}`);
  return { context, page };
}

export async function startPlugin(page) {
  await page.evaluate(async () => {
    const code = await (await fetch('/main.js')).text();
    window.plugin = await window.harness.loadPlugin(code);
  });
}

/** Pierces the shadow root of the Allotr host. */
export const inShadow = (page) => page.locator('.allotr-host');
export async function shadowText(page) {
  return page.evaluate(() => document.querySelector('.allotr-host')?.shadowRoot?.textContent ?? '');
}
