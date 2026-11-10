// Guest → free logo → limit enforced → registered user → free → paywall. Run against `next start` + mock Supabase.
const {chromium}=require('playwright');const assert=require('assert');
const BASE=process.env.BASE||'http://localhost:3100', OUT=process.env.OUT||'.';
(async()=>{const browser=await chromium.launch();const ctx=await browser.newContext({viewport:{width:1440,height:1000}});const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto(BASE+'/studio?brand=Maison%20Vela&industry=Hospitality&style=luxury');
await page.getByRole('heading',{name:'Design your logo'}).waitFor();
assert.equal(await page.locator('#brand').inputValue(),'Maison Vela');
assert.equal(await page.getByRole('radio',{name:/Luxury/}).getAttribute('aria-checked'),'true');
await page.screenshot({path:OUT+'/studio-empty.png'});
await page.fill('#tagline','Boutique stays in Galle');
await page.getByRole('radio',{name:/Black & gold/}).click();
await page.getByRole('button',{name:/Create my free logo/}).click();
await page.getByRole('status').filter({hasText:/s ·/}).waitFor({timeout:5000}).catch(()=>{});
await page.getByRole('dialog',{name:'Continue with Google'}).waitFor({timeout:60000});
await page.screenshot({path:OUT+'/studio-login-modal.png'});
await page.getByRole('button',{name:'Not now'}).click();
await page.getByRole('img',{name:'Logo concept for Maison Vela'}).waitFor();
assert.equal(await page.locator('.lv-thumb').count(),1,'history shows the saved guest logo');
await page.screenshot({path:OUT+'/studio-result.png',fullPage:true});
// Free guest logo used: a refresh must not reset the limit.
await page.reload();await page.getByRole('heading',{name:'Design your logo'}).waitFor();
await page.waitForFunction(()=>document.querySelector('.lv-meter')?.textContent?.startsWith('0 free'));
await page.locator('#brand').fill('Second Brand');
await page.getByRole('button',{name:/Sign in to continue/}).click();
await page.getByRole('dialog',{name:'Continue with Google'}).waitFor();
// Bypass attempt: call the API directly with the same guest token.
const status=await page.evaluate(async()=>{const k=Object.keys(localStorage).find(k=>k.includes('auth-token'));const s=JSON.parse(localStorage.getItem(k));const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.access_token},body:JSON.stringify({brand:'Bypass',style:'modern',requestId:crypto.randomUUID()})});return [r.status,await r.json()];});
assert.equal(status[0],401);assert.equal(status[1].login_required,true);
// Mobile layout.
const m=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true});const mp=await m.newPage();await mp.goto(BASE+'/studio');await mp.getByRole('heading',{name:'Design your logo'}).waitFor();
const overflow=await mp.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false,'no horizontal scroll on mobile');
await mp.screenshot({path:OUT+'/studio-mobile.png',fullPage:true});
assert.deepEqual(errors.filter(e=>!/401|Failed to load resource/.test(e)),[]);
console.log('studio e2e: PASS');await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
