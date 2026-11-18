import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 // Synthetic Telegram viewport only. This does not establish real-device verification.
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
});
test('navigation renders every personal screen without overflow or browser errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 for(const route of ['home','explore','workspace','missions','notifications','profile','wallets']){
  await page.locator(`[data-nav="${route}"]:visible`).first().click();
  await expect(page).toHaveURL(new RegExp('#'+route+'$'));
  await expect(page.locator('#app')).not.toBeEmpty();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 expect(errors).toEqual([]);
});
test('campaign modal opens and closes and catalog navigation stays available',async({page})=>{
 // A real public D1 campaign record represented as a test-only API fixture.
 await page.route('**/api/projects',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
  mode:'live',projects:[{id:'campaign-layer3-cube-research',sourceId:'layer3-cube-research',name:'Layer3 — CUBE & Activations (riset)',symbol:'◈',category:'NFT',chain:'Base',desc:'Riset dari dokumentasi resmi, bukan janji airdrop.',status:'speculative',website:'https://docs.layer3.xyz/',tasks:['Periksa ketentuan resmi'],custom:false}]
 })}));
 await page.goto('/#explore',{waitUntil:'domcontentloaded'});
 await page.locator('[data-open]').first().click();
 await expect(page.locator('#detail')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('#detail')).not.toBeVisible();
 await page.getByRole('link',{name:/Buka katalog airdrop/}).click();
 await expect(page).toHaveURL(/aggregator.html/);
 await expect(page.locator('body')).toContainText(/airdrop/i);
});
test('Decision Lab and admin deny unauthorized personal access',async({page,request})=>{
 await page.goto('/decision-lab.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('body')).toContainText(/login|masuk|telegram/i);
 expect((await request.get('/admin.html')).status()).toBe(403);
 expect((await request.get('/api/autopsy/export')).status()).toBe(401);
 expect((await request.get('/api/aggregator/portfolio')).status()).toBeGreaterThanOrEqual(400);
});

test('catalog backend failure is visible and never replaced with fictional campaigns',async({page})=>{
 await page.route('**/api/projects',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"SERVICE_UNAVAILABLE"}'}));
 await page.route('**/api/v1/airdrops',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"SERVICE_UNAVAILABLE"}'}));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('alert')).toContainText('Katalog editorial belum tersedia');
 await expect(page.locator('.amu-campaign-grid')).toContainText('Katalog publik tidak tersedia');
 await expect(page.getByRole('heading',{name:'Direktori kampanye & riset'})).toBeVisible();
 await expect(page.locator('[data-open]')).toHaveCount(0);
});

test('profile form persists a real local update across reload',async({page})=>{
 await page.goto('/#profile',{waitUntil:'domcontentloaded'});
 await page.locator('#profile-form input[name="name"]').fill('Peneliti Uji');
 await page.locator('#profile-form').getByRole('button',{name:'Simpan perubahan'}).click();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#profile-form input[name="name"]')).toHaveValue('Peneliti Uji');
 await expect(page.getByRole('heading',{name:'Peneliti Uji',exact:true})).toBeVisible();
});

test('catalog filters expand by keyboard and keep the campaign list reachable', async ({page}) => {
 await page.goto('/aggregator.html');
 const panel = page.locator('details.catalog-filters');
 const toggle = panel.locator('summary');
 await expect(panel.locator('form')).toBeHidden();
 await toggle.focus();
 await page.keyboard.press('Enter');
 await expect(panel.getByRole('button', {name:'Terapkan filter'})).toBeVisible();
 await toggle.focus();
 await page.keyboard.press('Enter');
 await expect(panel.locator('form')).toBeHidden();
 await expect(page.locator('#campaign-list')).toBeAttached();
});
