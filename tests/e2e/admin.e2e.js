// Payments + admin flows against `next start` + mock Supabase.
const {chromium}=require('playwright');const assert=require('assert');
const BASE=process.env.BASE||'http://localhost:3100', SB=process.env.SB||'http://127.0.0.1:54321', OUT=process.env.OUT||'.';
const api=async(path,token,body)=>{const r=await fetch(SB+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return r.json();};
async function emailLogin(page,email){await page.fill('#'+(page.url().includes('chamilka')?'a-email':'email'),email);await page.fill('#'+(page.url().includes('chamilka')?'a-pass':'password'),'password123');await page.getByRole('button',{name:/^Sign in$/}).click();}
(async()=>{const browser=await chromium.launch();const errors=[];
const ctx=await browser.newContext({viewport:{width:1440,height:1000}});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
// 1. Customer buys a pack from /payments.
await page.goto(BASE+'/payments');await emailLogin(page,'buyer@example.com');
await page.getByRole('heading',{name:'Your logo credits'}).waitFor();
await page.getByRole('button',{name:/Pay via WhatsApp/}).click();
await page.getByRole('button',{name:'Get payment reference'}).click();
const ref=await page.locator('.lv-reference code').textContent();assert.match(ref,/^LOG-[0-9A-F]{12}$/);
const wa=await page.getByRole('link',{name:'Continue on WhatsApp'}).getAttribute('href');assert.ok(wa.startsWith('https://wa.me/94770663154?text=')&&decodeURIComponent(wa).includes(ref));
await page.screenshot({path:OUT+'/payment-modal.png'});
await page.getByRole('button',{name:'Close payment dialog'}).click();
await page.locator('.lv-upload input').setInputFiles({name:'receipt.png',mimeType:'image/png',buffer:Buffer.from('89504e47','hex')});
await page.getByText('Receipt submitted').waitFor();
await page.getByText('Verifying').waitFor();
// 2. A non-admin is denied the dashboard (UI) and the RPCs (database).
await page.goto(BASE+'/chamilka');await page.getByRole('heading',{name:'Access denied'}).waitFor();
const buyerToken=(await api('/auth/v1/token?grant_type=password',null,{email:'buyer@example.com',password:'x'})).access_token;
const denied=await api('/rest/v1/rpc/logo_admin_users',buyerToken,{p_search:null,p_limit:5});assert.match(denied.message,/forbidden/);
const selfApprove=await api('/rest/v1/rpc/review_logo_payment',buyerToken,{p_payment:'00000000-0000-0000-0000-000000000000',p_approve:true,p_reason:null});assert.match(selfApprove.message,/forbidden/);
await ctx.clearCookies();await page.evaluate(()=>localStorage.clear());
// 3. Admin reviews.
await page.goto(BASE+'/chamilka');await emailLogin(page,'charshan59@gmail.com');
await page.getByRole('heading',{name:'Overview'}).waitFor();
await page.screenshot({path:OUT+'/admin-overview.png',fullPage:true});
await page.getByRole('button',{name:/^Payments/}).click();
await page.getByText(ref).waitFor();
const order=page.locator('.lv-admin-order',{hasText:ref});
assert.equal(await order.getByRole('button',{name:'Approve'}).isDisabled(),true,'approve disabled until verified');
await order.getByLabel('I verified this bank transaction').check();
page.once('dialog',d=>d.accept());
await order.getByRole('button',{name:'Approve'}).click();
await page.getByText(ref+' approved').waitFor();
await page.screenshot({path:OUT+'/admin-payments.png',fullPage:true});
const adminToken=(await api('/auth/v1/token?grant_type=password',null,{email:'charshan59@gmail.com',password:'x'})).access_token;
const list=await api('/rest/v1/rpc/logo_admin_payments',adminToken,{p_status:'approved',p_search:ref,p_limit:5});
assert.equal(list[0].credits_granted,5);
const pid=list[0].id;const again=await api('/rest/v1/rpc/review_logo_payment',adminToken,{p_payment:pid,p_approve:true,p_reason:null});assert.equal(again,false,'second approval is refused');
// 4. Users & credit adjustment.
await page.getByRole('button',{name:'Users & credits'}).click();
const row=page.locator('tr',{hasText:'buyer@example.com'});await row.waitFor();
assert.equal((await row.locator('td').nth(3).textContent()).trim(),'5');
await row.getByRole('button',{name:'Adjust credits'}).click();
await page.fill('#adj-delta','2');await page.fill('#adj-reason','Goodwill for testing');
await page.getByRole('button',{name:'Save change'}).click();
await page.getByText('balance 7').waitFor();
// 5. Settings + audit.
await page.getByRole('button',{name:'Settings'}).click();
await page.getByLabel(/Announcement banner/).fill('Maintenance tonight 10pm');
await page.getByRole('button',{name:'Save settings'}).click();await page.getByText('Settings saved').waitFor();
await page.getByRole('button',{name:'Audit log'}).click();
await page.getByRole('cell',{name:'credits adjusted'}).waitFor();await page.getByRole('cell',{name:'settings updated'}).waitFor();await page.getByRole('cell',{name:'approved credits'}).waitFor();
await page.screenshot({path:OUT+'/admin-audit.png',fullPage:true});
await page.getByRole('button',{name:'Generations'}).click();await page.getByRole('heading',{name:'Generations'}).waitFor();
await page.screenshot({path:OUT+'/admin-generations.png',fullPage:true});
// 6. Announcement reaches the studio; buyer sees credits.
const bp=await (await browser.newContext()).newPage();await bp.goto(BASE+'/studio');await bp.getByText('Maintenance tonight 10pm').waitFor();
// 7. Mobile hamburger.
const m=await browser.newContext({viewport:{width:390,height:844},isMobile:true});const mp=await m.newPage();
await mp.goto(BASE+'/chamilka');await emailLogin(mp,'charshan59@gmail.com');await mp.getByRole('heading',{name:'Overview'}).waitFor();
const burger=mp.getByRole('button',{name:'Open admin menu'});await burger.click();
await mp.waitForTimeout(350);await mp.screenshot({path:OUT+'/admin-mobile-menu.png'});
await mp.getByRole('navigation',{name:'Admin sections'}).getByRole('button',{name:'Payments'}).click();
await mp.getByRole('heading',{name:'Payments'}).waitFor();assert.equal(await mp.getByRole('button',{name:'Open admin menu'}).getAttribute('aria-expanded'),'false');
assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'no horizontal scroll');
assert.deepEqual(errors,[]);console.log('admin e2e: PASS');await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
