// Seeds 5k and 50k through the Diagnostics modal and saves the report.
//   node harness/seed-bench.mjs <chromium|webkit> [--throttle=4]
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { engines, newHarnessPage, shotDir, startPlugin } from './lib.mjs';

const engine = process.argv[2] ?? 'chromium';
const throttle = Number((process.argv.find((a) => a.startsWith('--throttle=')) ?? '--throttle=1').split('=')[1]);
const browser = await engines[engine].launch();
const { context, page } = await newHarnessPage(browser, { viewport: { width: 1000, height: 800 } });
page.setDefaultTimeout(600000);
if (throttle > 1 && engine === 'chromium') {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
}
await startPlugin(page);
await page.evaluate(() => window.harness.clickRibbon());
await page.getByText('left today').first().waitFor();
await page.evaluate(() => window.harness.runCommand('Allotr: Diagnostics'));
for (const [label, rows] of [['Seed 5k', 5000], ['Seed 50k', 50000]]) {
  await page.getByRole('button', { name: label }).click();
  await page.waitForFunction((n) => new RegExp(`${n} rows`).test(document.querySelector('.allotr-diagnostics-output')?.textContent ?? ''), rows, { timeout: 900000 });
}
const report = await page.locator('.allotr-diagnostics-output').textContent();
const out = resolve(shotDir, '..', `seed-bench-${engine}${throttle > 1 ? `-cpu${throttle}x` : ''}.md`);
writeFileSync(out, report);
console.log(report.split('\n').filter((l) => /rows|cold|warm|heap/.test(l)).join('\n'));
await browser.close();
