import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeAxe} from './axe-report.js';

/** Optional runtime checks; no claim of full WCAG compliance. */
export async function runtimeAudit(target,{browser='chromium'}={}){
  let playwright,axe;
  try { playwright=await import('playwright'); } catch {throw new Error('Runtime audit requires playwright: npm install -D playwright axe-core && npx playwright install chromium');}
  try { axe=await import('axe-core'); } catch {throw new Error('Runtime audit requires axe-core: npm install -D axe-core');}
  if(!['chromium','firefox','webkit'].includes(browser))throw new Error('Invalid browser');
  const isURL=/^https?:\/\//i.test(target);
  if(!isURL && !fs.existsSync(target))throw new Error(`Runtime target not found: ${target}`);
  const url=isURL?target:pathToFileURL(path.resolve(target)).href;
  const instance=await playwright[browser].launch({headless:true});
  try{
    const page=await instance.newPage({viewport:{width:1280,height:800}});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    await page.addScriptTag({content:axe.default.source});
    const result=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
    return normalizeAxe(result,{url,browser});
  } finally {await instance.close();}
}
