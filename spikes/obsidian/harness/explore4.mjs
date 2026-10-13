import { engines, newHarnessPage, startPlugin } from './lib.mjs';
const browser = await engines[process.argv[2] ?? 'chromium'].launch();
const { page } = await newHarnessPage(browser, { viewport: { width: 1000, height: 800 } });
page.setDefaultTimeout(6000);
await startPlugin(page);
await page.evaluate(() => window.harness.clickRibbon());
await page.getByText('left today').first().waitFor();
await page.evaluate(()=>{
  window.__ev=[]; const sr=document.querySelector('.allotr-host').shadowRoot;
  for (const t of ['focusin','focusout']) document.addEventListener(t,(e)=>window.__ev.push(t+' target='+(e.composedPath()[0].tagName+'.'+(e.composedPath()[0].getAttribute?.('role')||''))+' related='+(e.relatedTarget&&e.relatedTarget.tagName)),true);
});
await page.getByRole('button', { name: /^new$/i }).click();
await page.getByRole('menu').waitFor();
await page.waitForTimeout(400);
console.log((await page.evaluate(()=>window.__ev)).join('\n'));
console.log(await page.evaluate(()=>{const h=document.querySelector('.allotr-host'); const o=[]; for(let e=h;e;e=e.parentElement) o.push(e.tagName+' inert='+e.inert+' aria='+e.getAttribute('aria-hidden')+' attrs='+[...e.attributes].map(a=>a.name).join(',')); return o.join('\n')}));
console.log(await page.evaluate(()=>{const sr=document.querySelector('.allotr-host').shadowRoot; sr.querySelector('[role=menu]').focus(); return window.__ev.slice(-4).join(' ; ')+' ACTIVE='+(sr.activeElement&&sr.activeElement.tagName)}));
await browser.close();
