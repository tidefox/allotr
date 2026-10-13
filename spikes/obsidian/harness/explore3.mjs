import { engines, newHarnessPage, startPlugin } from './lib.mjs';
const browser = await engines[process.argv[2] ?? 'chromium'].launch();
const { page } = await newHarnessPage(browser, { viewport: { width: 1000, height: 800 } });
page.setDefaultTimeout(6000);
await startPlugin(page);
await page.evaluate(() => window.harness.clickRibbon());
await page.getByText('left today').first().waitFor();
await page.getByRole('button', { name: /^new$/i }).click();
await page.getByRole('menu').waitFor();
await page.waitForTimeout(500);
console.log(JSON.stringify(await page.evaluate(()=>{
  const sr=document.querySelector('.allotr-host').shadowRoot;
  const menu=sr.querySelector('[role=menu]');
  const a=sr.activeElement;
  return {active: a&&a.outerHTML.slice(0,120), menuTab: menu.getAttribute('tabindex'), menuHtml: menu.outerHTML.slice(0,300), items: menu.querySelectorAll('[role=menuitem]').length,
    item0: menu.querySelector('[role=menuitem]')?.outerHTML.slice(0,200)};
})));
console.log(JSON.stringify(await page.evaluate(()=>{
  const sr=document.querySelector('.allotr-host').shadowRoot;
  const out={};
  const inp=sr.querySelector('input'); inp.focus(); out.inputFocus=sr.activeElement&&sr.activeElement.tagName;
  const menu=sr.querySelector('[role=menu]'); menu.focus(); out.menuFocus=sr.activeElement&&sr.activeElement.tagName;
  let el=menu; const chain=[]; while(el&&el!==sr){ const cs=getComputedStyle(el); chain.push(el.tagName+'.'+(el.className||'').toString().slice(0,25)+' vis='+cs.visibility+' disp='+cs.display+' inert='+el.inert+' po='+cs.pointerEvents); el=el.parentNode;}
  out.chain=chain;
  return out;})));
console.log('after manual focus:', await page.evaluate(()=>{const sr=document.querySelector('.allotr-host').shadowRoot; return sr.activeElement?.getAttribute('role')}));
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
console.log('menus after esc with focus inside', await page.locator('[role=menu]').count());
await browser.close();
