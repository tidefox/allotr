// Timings of a first start (empty IndexedDB): wasm, migrations, app build.
import { engines, newHarnessPage, startPlugin } from './lib.mjs';
for (const name of ['chromium', 'webkit']) {
  const browser = await engines[name].launch();
  const { page } = await newHarnessPage(browser, { viewport: { width: 1000, height: 700 } });
  await startPlugin(page);
  await page.evaluate(() => window.harness.clickRibbon());
  await page.getByText('left today').first().waitFor();
  const t = await page.evaluate(() => window.plugin.runtime.timings);
  console.log(name, JSON.stringify(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 10) / 10]))));
  await browser.close();
}
